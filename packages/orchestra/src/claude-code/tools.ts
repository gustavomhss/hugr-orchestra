// Orchestra's tools, handed to Claude Code as in-process SDK tools. Claude Code calls them by name; the handler runs
// Orchestra's own implementation on the mirrored session and writes the result on the mirrored part.
import { Cause, Effect, Exit } from "effect"
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk"
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { Agent } from "@/agent/agent"
import type { Tool } from "@/tool/tool"
import { ToolJsonSchema } from "@/tool/json-schema"
import { PartID } from "@/session/schema"

export const SERVER = "orchestra"
const PREFIX = `mcp__${SERVER}__`

/** The Orchestra tools a seat on Claude Code runs in-process. */
export const IDS = ["read", "edit", "write", "context_recall", "context_compact"]

/** Orchestra tools Claude Code runs natively, by Claude Code name; Orchestra's gate (permissions.ts) decides each call. */
export const NATIVE: Record<string, string> = { bash: "Bash", grep: "Grep", glob: "Glob", webfetch: "WebFetch", websearch: "WebSearch" }

/**
 * The Orchestra tools an agent runs in-process. Maestro keeps its whole Orchestra toolset, delegation included, with
 * the texts and permissions it has on Orchestra's loop; only the tools Claude Code runs natively stay native.
 */
export function served(agent: Agent.Info, defs: readonly Tool.Def[]) {
  if (!conductor(agent)) return defs.filter((def) => IDS.includes(def.id))
  return defs.filter(servable)
}

/** Maestro's Claude Code built-ins: the native counterparts of the Orchestra tools it has. Seats keep the preset set. */
export function builtins(agent: Agent.Info, defs: readonly Tool.Def[]) {
  return conductor(agent) ? defs.flatMap((def) => NATIVE[def.id] ?? []) : undefined
}

/** The Orchestra tool a Claude Code tool name calls, when it is an in-process one. */
export function orchestra(name: string) {
  return name.startsWith(PREFIX) ? name.slice(PREFIX.length) : undefined
}

export function conductor(agent: Agent.Info) {
  return agent.id === "maestro" && agent.native === true
}

function servable(def: Tool.Def) {
  return def.id !== "invalid" && !Object.hasOwn(NATIVE, def.id)
}

/** A rejected or failed call, as the model reads it. */
export function failure(cause: Cause.Cause<unknown>) {
  const error = Cause.squash(cause) as { feedback?: string; message?: string; _tag?: string; name?: string }
  if (typeof error?.feedback === "string") return `The owner rejected this call with feedback: ${error.feedback}`
  const tag = error?._tag ?? error?.name ?? ""
  // A rule denial is policy, not the owner: like Orchestra's own loop, show the rule and let the model carry on.
  if (/Denied/.test(tag)) return error?.message ?? "A permission rule denies this call."
  if (/Rejected/.test(tag)) return "The owner rejected this call. Stop and wait for the owner's next message."
  return error?.message ?? String(error)
}

export function server(input: {
  defs: Tool.Def[]
  run: <A>(effect: Effect.Effect<A, unknown>) => Promise<A>
  /** Waits for the mirrored part of the next call of this Orchestra tool. */
  claim: (tool: string) => Effect.Effect<SessionV1.ToolPart>
  context: (part: SessionV1.ToolPart) => Tool.Context
  messages?: () => Effect.Effect<SessionV1.WithParts[]>
  complete: (part: SessionV1.ToolPart) => Effect.Effect<void>
}) {
  const defs = input.defs.filter(servable)
  const handler = (name: string, args: Record<string, unknown>) => input.run(Effect.gen(function* () {
    const def = defs.find((item) => item.id === name)
    if (!def) return { content: [{ type: "text" as const, text: `Orchestra tool ${name} is not available.` }], isError: true }
    const part = yield* input.claim(name)
    const start = part.state.status === "running" ? part.state.time.start : Date.now()
    const context = input.context(part)
    if (input.messages) context.messages = yield* input.messages()
    const exit = yield* def.execute(args as never, context).pipe(Effect.exit)
    if (Exit.isFailure(exit)) {
      const text = failure(exit.cause)
      yield* input.complete({ ...part, state: { status: "error", input: args, error: text, time: { start, end: Date.now() } } })
      return { content: [{ type: "text" as const, text }], isError: true }
    }
    const result = exit.value
    yield* input.complete({ ...part, state: { status: "completed", input: args, output: result.output, title: result.title,
      metadata: result.metadata, time: { start, end: Date.now() }, attachments: result.attachments?.map((attachment) => ({
        ...attachment, id: PartID.ascending(), sessionID: part.sessionID, messageID: part.messageID,
      })) } })
    const images = (result.attachments ?? []).flatMap((file) => {
      const match = /^data:([^;,]+);base64,(.*)$/s.exec(file.url)
      return match && file.mime.startsWith("image/") ? [{ type: "image" as const, data: match[2], mimeType: match[1] }] : []
    })
    return { content: [{ type: "text" as const, text: result.output }, ...images] }
  }))
  // SDK tool() accepts a Zod raw object only. Recall is a closed union, so expose the actual host JSON schemas through
  // the MCP protocol instead of weakening that union into optional fields. Tool.execute remains the validator.
  const server = createSdkMcpServer({ name: SERVER, tools: [] })
  server.instance.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: defs.map((def) => ({
    name: def.id, description: def.description, inputSchema: { type: "object" as const, ...ToolJsonSchema.fromTool(def) },
    _meta: { "anthropic/alwaysLoad": true },
  })) }))
  server.instance.server.setRequestHandler(CallToolRequestSchema, (request) => handler(request.params.name, request.params.arguments ?? {}))
  return server
}

export * as ClaudeCodeTools from "./tools"
