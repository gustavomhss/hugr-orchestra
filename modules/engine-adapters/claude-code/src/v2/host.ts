export * as ClaudeCodeHost from "./host"

import { createSdkMcpServer, type CanUseTool, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import type { Host } from "@orchestra/core/host"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { LLMEvent, type ToolContent, type ToolDefinition, type ToolResultValue } from "@orchestra/llm"
import { Effect, Layer, Stream } from "effect"
import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import { ClaudeHostOptions } from "../host/options"
import { ClaudeCodeSDK } from "../sdk"
import { ClaudeCodeTranscript } from "../transcript"

export const ID = "claude-code"
/** V1's `session.metadata` key (`host/session.ts`), so V1-era Claude-hosted sessions resume on V2. */
export const STATE_KEY = "claudeCode"
/** The in-process MCP server that serves the Location's Orchestra tools to Claude Code. */
export const MCP_SERVER = "orchestra"
const MCP_PREFIX = `mcp__${MCP_SERVER}__`

/** Orchestra tools Claude Code has as built-ins, or that belong to Orchestra's own loop: never served (as V1). */
const UNSERVED = new Set([
  "bash", "read", "write", "edit", "apply_patch", "grep", "glob", "webfetch", "websearch", "task", "todowrite",
  "question", "skill", "lsp", "invalid", "context_compact", "execute",
])

/** How a Claude Code built-in maps to a V2 permission: its action and the input field that names the resource. */
const PERMISSIONS: Readonly<Record<string, { action: string; field: string; path?: boolean }>> = {
  Bash: { action: "bash", field: "command" },
  Read: { action: "read", field: "file_path", path: true },
  Write: { action: "edit", field: "file_path", path: true },
  Edit: { action: "edit", field: "file_path", path: true },
  MultiEdit: { action: "edit", field: "file_path", path: true },
  NotebookEdit: { action: "edit", field: "notebook_path", path: true },
  Glob: { action: "glob", field: "pattern" },
  Grep: { action: "grep", field: "pattern" },
  WebFetch: { action: "webfetch", field: "url" },
  WebSearch: { action: "websearch", field: "query" },
}

/**
 * One Claude Code SDK turn (prompt sent → `result` frame) is one provider turn of the V2 runner. Claude Code keeps its
 * own prompt, tools, login, loop and context window; its tool calls surface as provider-executed events and every API
 * message of the turn collapses into the turn's single assistant message. The next turn resumes the same Claude Code
 * session, sending only the owner's messages it has not delivered yet.
 */
export const make = Effect.gen(function* () {
  const sdk = yield* ClaudeCodeSDK.Service
  const env = yield* ClaudeCodeSDK.Environment
  return {
    id: ID,
    stateKey: STATE_KEY,
    stream: (turn) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const stored = yield* turn.state.get
          const state = ClaudeCodeTranscript.record(stored) ? stored : {}
          const delivered = Array.isArray(state.delivered) ? state.delivered.filter((id) => typeof id === "string") : []
          const pending = turn.history.flatMap((message) =>
            message.type === "user" && !delivered.includes(message.id) ? [message] : [],
          )
          const prompt = pending.map((message) => message.text).join("\n\n").trim()
          if (!prompt) return Stream.make(LLMEvent.stepStart({ index: 0 }), LLMEvent.stepFinish({ index: 0, reason: "stop" }))
          const abort = new AbortController()
          const served = turn.tools.filter((tool) => !UNSERVED.has(tool.name))
          // Claude Code's tool_use id for an Orchestra tool, learned in canUseTool; the MCP request does not carry it.
          const callIDs = new Map<string, string[]>()
          const canUseTool: CanUseTool = (tool, input, options) => {
            if (tool.startsWith(MCP_PREFIX)) {
              const name = tool.slice(MCP_PREFIX.length)
              callIDs.set(name, [...(callIDs.get(name) ?? []), options.toolUseID])
              // The registry settles the Orchestra tool's own permissions when the runner executes it.
              return Promise.resolve({ behavior: "allow" as const, updatedInput: input })
            }
            return Effect.runPromise(
              turn.authorize({ callID: options.toolUseID, tool, ...permission(tool, input, turn.session.location.directory) }).pipe(
                Effect.as({ behavior: "allow" as const, updatedInput: input }),
                Effect.catch((error) => Effect.succeed({ behavior: "deny" as const, message: denial(error) })),
              ),
              { signal: options.signal },
            )
          }
          const lifetime = ClaudeCodeSDK.processLifetime({
            cwd: turn.session.location.directory,
            ...(turn.model?.providerID === "anthropic" ? { model: turn.model.id } : {}),
            ...(typeof state.sessionId === "string" ? { resume: state.sessionId } : { sessionId: claudeSessionID(turn.session.id) }),
            // Claude mode appends to Claude Code's own prompt and never replaces it (AGENTS: claude_code preset).
            systemPrompt: { type: "preset", preset: "claude_code", append: turn.system.join("\n\n") },
            settingSources: ["project"],
            permissionMode: "default",
            canUseTool,
            ...(served.length
              ? { mcpServers: { [MCP_SERVER]: server(served, (name) => callIDs.get(name)?.shift() ?? `orchestra_${randomUUID()}`, turn.execute) } }
              : {}),
            env: ClaudeHostOptions.environment(env),
            abortController: abort,
          })
          const query = yield* Effect.acquireRelease(
            // Streaming input, which in-process MCP servers need; the turn ends at the `result` frame and the finalizer
            // closes the input with the query.
            Effect.sync(() => sdk.query({ prompt: input(prompt, abort.signal), options: lifetime.options })),
            () =>
              Effect.sync(() => abort.abort()).pipe(
                Effect.andThen(Effect.promise(() => lifetime.join().catch(() => undefined))),
              ),
          )
          const names = new Map<string, string>()
          const frames = Stream.fromAsyncIterable(query, (error) => error).pipe(
            Stream.takeUntil((message) => message.type === "result"),
            Stream.mapEffect((message) =>
              Effect.gen(function* () {
                if (message.type === "system" && message.subtype === "init")
                  yield* turn.state.update((value) => ({ ...(ClaudeCodeTranscript.record(value) ? value : {}), sessionId: message.session_id }))
                if (message.type === "result" && message.subtype === "success" && !message.is_error)
                  yield* turn.state.update((value) => ({
                    ...(ClaudeCodeTranscript.record(value) ? value : {}),
                    sessionId: message.session_id,
                    delivered: [...delivered, ...pending.map((item) => item.id)],
                  }))
                return events(message, names)
              }),
            ),
            Stream.flatMap((items) => Stream.fromIterable(items)),
            // A Claude Code process failure is the turn's provider error, never a retry (ClaudeCodeSDK).
            Stream.catch((error) =>
              Stream.make(LLMEvent.providerError({ message: error instanceof Error ? error.message : String(error) })),
            ),
          )
          return Stream.concat(Stream.make(LLMEvent.stepStart({ index: 0 })), frames)
        }),
      ),
  } satisfies ExecutionHost.Interface
})

/** Replaces the empty ExecutionHost registry with one holding the Claude Code host. */
export const node = makeLocationNode({
  service: ExecutionHost.Service,
  layer: Layer.effect(ExecutionHost.Service, make.pipe(Effect.map((host) => ExecutionHost.of([host])))),
  deps: [ClaudeCodeSDK.node],
})

export const contribution: Host.Contribution = { id: "engine-claude-code", replacements: [[ExecutionHost.node, node]] }

/** Maps one main-thread SDK frame to runner events; subagent frames stay inside their Agent call. */
function events(message: SDKMessage, names: Map<string, string>): LLMEvent[] {
  if (ClaudeCodeSDK.signedOut(message)) return [LLMEvent.providerError({ message: ClaudeCodeSDK.SIGNED_OUT })]
  if (message.type === "assistant" && message.parent_tool_use_id === null)
    return message.message.content.flatMap((block, index): LLMEvent[] => {
      const id = `${message.uuid}:${index}`
      if (block.type === "text")
        return [LLMEvent.textStart({ id }), LLMEvent.textDelta({ id, text: block.text }), LLMEvent.textEnd({ id })]
      if (block.type === "thinking")
        return [LLMEvent.reasoningStart({ id }), LLMEvent.reasoningDelta({ id, text: block.thinking }), LLMEvent.reasoningEnd({ id })]
      // Orchestra tools are recorded by the runner through `turn.execute`, never by the host.
      if (block.type !== "tool_use" || block.name.startsWith(MCP_PREFIX)) return []
      names.set(block.id, block.name)
      return [LLMEvent.toolCall({ id: block.id, name: block.name, input: block.input, providerExecuted: true })]
    })
  if (message.type === "user" && message.parent_tool_use_id === null && Array.isArray(message.message.content))
    return message.message.content.flatMap((block): LLMEvent[] => {
      if (block.type !== "tool_result") return []
      const name = names.get(block.tool_use_id)
      if (!name) return []
      const text = typeof block.content === "string"
        ? block.content
        : (block.content ?? []).flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n")
      return [LLMEvent.toolResult({
        id: block.tool_use_id,
        name,
        result: block.is_error ? { type: "error", value: text } : { type: "text", value: text },
        providerExecuted: true,
      })]
    })
  if (message.type !== "result") return []
  if (message.subtype !== "success" || message.is_error) {
    const detail = message.subtype === "success" ? message.result : [message.subtype, ...message.errors].join(": ")
    return [LLMEvent.providerError({ message: ClaudeCodeSDK.billingRejection(detail) ?? detail })]
  }
  return [LLMEvent.stepFinish({
    index: 0,
    reason: "stop",
    usage: {
      nonCachedInputTokens: message.usage.input_tokens,
      cacheReadInputTokens: message.usage.cache_read_input_tokens,
      cacheWriteInputTokens: message.usage.cache_creation_input_tokens,
      inputTokens: message.usage.input_tokens + message.usage.cache_read_input_tokens + message.usage.cache_creation_input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  })]
}

/** The `orchestra` MCP server: lists the served tools and settles each call through the runner. */
function server(tools: ReadonlyArray<ToolDefinition>, callID: (name: string) => string, execute: ExecutionHost.Turn["execute"]) {
  const mcp = createSdkMcpServer({ name: MCP_SERVER, tools: [] })
  mcp.instance.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: { ...tool.inputSchema, type: "object" as const } })),
  }))
  mcp.instance.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((item) => item.name === request.params.name)
    if (!tool) return { content: [{ type: "text" as const, text: `Orchestra tool ${request.params.name} is not available.` }], isError: true }
    const settlement = await Effect.runPromise(
      execute({ id: callID(tool.name), name: tool.name, input: request.params.arguments ?? {} }),
    )
    return {
      content: [{ type: "text" as const, text: modelText(settlement.result) }],
      ...(settlement.result.type === "error" ? { isError: true } : {}),
    }
  })
  return mcp
}

function modelText(result: ToolResultValue) {
  if (result.type === "content") return result.value.flatMap((part: ToolContent) => (part.type === "text" ? [part.text] : [])).join("\n")
  return typeof result.value === "string" ? result.value : JSON.stringify(result.value)
}

async function* input(text: string, signal: AbortSignal): AsyncGenerator<SDKUserMessage> {
  yield { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null }
  await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }))
}

export function permission(tool: string, input: Record<string, unknown>, directory: string) {
  const rule = PERMISSIONS[tool]
  const value = rule ? input[rule.field] : undefined
  if (!rule || typeof value !== "string") return { action: tool.toLowerCase(), resources: ["*"] }
  if (!rule.path || !path.isAbsolute(value)) return { action: rule.action, resources: [value] }
  const relative = path.relative(directory, value)
  const outside = relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)
  return { action: rule.action, resources: [outside ? value : relative] }
}

function denial(error: { readonly _tag: string }) {
  if ("feedback" in error && typeof error.feedback === "string") return error.feedback
  if (error._tag === "PermissionV2.DeclinedError") return "The owner declined this call."
  return "Orchestra's permission rules deny this call."
}

/** Claude Code's session id for an Orchestra session: a name-based (v5) UUID, stable across restarts (as V1). */
export function claudeSessionID(sessionID: string) {
  const hash = createHash("sha1").update(NAMESPACE).update(sessionID).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString("hex")
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-")
}
const NAMESPACE = Buffer.from("8f0c5b3e6a2d4f1b9c7e0d2a4b6c8e1f", "hex")
