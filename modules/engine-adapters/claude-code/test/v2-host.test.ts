import { expect, test } from "bun:test"
import type { HookInput, McpSdkServerConfigWithInstance, Options, SDKMessage, SDKUserMessage, query } from "@anthropic-ai/claude-agent-sdk"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { ToolDefinition } from "@orchestra/llm"
import { AgentV2 } from "@orchestra/core/agent"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionSchema } from "@orchestra/core/session"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import { Effect, Layer, Stream } from "effect"
import { ClaudeCodeSDK } from "../src/sdk"
import { ClaudeCodeHost } from "../src/v2/host"

// The V2 Claude Code host, driven through the SDK seam with scripted frames: no Claude Code process, no Claude API.
// One SDK query is one provider turn; the next turn resumes the same Claude Code session with only the new message.

const calls: { prompt: unknown; options: Options | undefined }[] = []
// Frames, or frames built from the client uuid the host stamped on its prompt (Claude Code echoes it on its replies).
let script: SDKMessage[] | ((sent: string | undefined) => SDKMessage[]) = []
// Runs before the frames, as Claude Code would mid-turn: approvals and Orchestra tool calls.
let during: (options: Options) => Promise<void> = async () => {}

const sdk = Layer.succeed(
  ClaudeCodeSDK.Service,
  ClaudeCodeSDK.Service.of({
    query: ((input: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => {
      const frames = script
      return (async function* () {
        const first = await input.prompt[Symbol.asyncIterator]().next()
        calls.push({ prompt: first.done ? undefined : first.value.message.content, options: input.options })
        await during(input.options)
        yield* typeof frames === "function" ? frames(first.done ? undefined : first.value.uuid) : frames
      })()
    }) as unknown as typeof query,
  }),
)

const frame = (value: Record<string, unknown>) => value as unknown as SDKMessage
const usage = { input_tokens: 5, output_tokens: 4, cache_read_input_tokens: 10, cache_creation_input_tokens: 1 }
const user = (id: string, text: string) => ({ id, type: "user", text, files: [], agents: [], time: { created: 0 } })

const turnOf = (input: Partial<ExecutionHost.Turn> = {}): ExecutionHost.Turn => ({
  session: { id: SessionSchema.ID.make("ses_host"), location: { directory: "/project" } } as unknown as SessionSchema.Info,
  agent: AgentV2.Info.empty(AgentV2.ID.make("maestro")),
  model: undefined,
  system: [],
  history: [user("msg_1", "Go")] as unknown as ExecutionHost.Turn["history"],
  tools: [],
  execute: () => Effect.die("unused"),
  authorize: () => Effect.die("unused"),
  state: { get: Effect.succeed(undefined), update: () => Effect.void },
  ...input,
})
const collect = (turn: ExecutionHost.Turn) =>
  Effect.runPromise(
    ClaudeCodeHost.make.pipe(
      Effect.flatMap((host) => Stream.runCollect(host.stream(turn))),
      Effect.provide(sdk),
      Effect.provideService(ClaudeCodeSDK.Environment, {}),
    ),
  ).then((events) => Array.from(events))
const done = frame({ type: "result", subtype: "success", is_error: false, session_id: "claude-1", result: "", usage })

test("one SDK query is one turn: tool calls surface provider-executed and the next turn resumes with only new input", async () => {
  const stored: { value: unknown } = { value: undefined }
  const turn = (history: ReadonlyArray<unknown>): ExecutionHost.Turn => ({
    session: { id: SessionSchema.ID.make("ses_host"), location: { directory: "/project" } } as unknown as SessionSchema.Info,
    agent: AgentV2.Info.empty(AgentV2.ID.make("maestro")),
    model: undefined,
    system: ["Maestro instructions", "Context"],
    history: history as ExecutionHost.Turn["history"],
    tools: [],
    execute: () => Effect.die("unused"),
    authorize: () => Effect.die("unused"),
    state: {
      get: Effect.sync(() => stored.value),
      update: (fn) => Effect.sync(() => void (stored.value = fn(stored.value))),
    },
  })
  const run = (history: ReadonlyArray<unknown>) =>
    Effect.runPromise(
      ClaudeCodeHost.make.pipe(
        Effect.flatMap((host) => Stream.runCollect(host.stream(turn(history)))),
        Effect.provide(sdk),
        Effect.provideService(ClaudeCodeSDK.Environment, {}),
      ),
    ).then((events) => Array.from(events))

  during = async () => {}
  script = [
    frame({ type: "system", subtype: "init", session_id: "claude-1" }),
    frame({ type: "assistant", uuid: "a1", session_id: "claude-1", parent_tool_use_id: null,
      message: { content: [{ type: "text", text: "Listing" }, { type: "tool_use", id: "tu1", name: "Bash", input: { command: "ls" } }] } }),
    // A subagent's frame stays inside its Agent call.
    frame({ type: "assistant", uuid: "s1", session_id: "claude-1", parent_tool_use_id: "tu0",
      message: { content: [{ type: "text", text: "subagent" }] } }),
    frame({ type: "user", session_id: "claude-1", parent_tool_use_id: null,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu1", content: "a.txt" }] } }),
    frame({ type: "assistant", uuid: "a2", session_id: "claude-1", parent_tool_use_id: null,
      message: { content: [{ type: "text", text: "Done" }] } }),
    frame({ type: "result", subtype: "success", is_error: false, session_id: "claude-1", result: "Done", usage }),
  ]
  const first = await run([user("msg_1", "First")])

  expect(calls[0]?.prompt).toBe("First")
  expect(calls[0]?.options).toMatchObject({
    cwd: "/project",
    sessionId: ClaudeCodeHost.claudeSessionID("ses_host"),
    systemPrompt: { type: "preset", preset: "claude_code", append: "Maestro instructions\n\nContext" },
  })
  expect(calls[0]?.options?.resume).toBeUndefined()
  expect(first.map((event) => event.type)).toEqual([
    "step-start", "text-start", "text-delta", "text-end", "tool-call", "tool-result",
    "text-start", "text-delta", "text-end", "step-finish",
  ])
  expect(first[4]).toMatchObject({ id: "tu1", name: "Bash", input: { command: "ls" }, providerExecuted: true })
  expect(first[5]).toMatchObject({ id: "tu1", result: { type: "text", value: "a.txt" }, providerExecuted: true })
  expect(first.at(-1)).toMatchObject({ reason: "stop", usage: { inputTokens: 16, outputTokens: 4 } })
  expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1"] })

  script = [
    frame({ type: "assistant", uuid: "b1", session_id: "claude-1", parent_tool_use_id: null, error: "authentication_failed",
      message: { content: [] } }),
  ]
  const second = await run([user("msg_1", "First"), user("msg_2", "Second")])

  expect(calls[1]?.prompt).toBe("Second")
  expect(calls[1]?.options).toMatchObject({ resume: "claude-1" })
  expect(calls[1]?.options?.sessionId).toBeUndefined()
  expect(second).toMatchObject([{ type: "step-start" }, { type: "provider-error", message: ClaudeCodeSDK.SIGNED_OUT }])
  // A failed turn delivers nothing, so the message is sent again next time.
  expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1"] })
})

test("Orchestra tools are served over the in-process MCP server and settle through the runner, never as host events", async () => {
  const executed: unknown[] = []
  let listed: string[] = []
  let reply: unknown
  during = async (options) => {
    // Claude Code asks permission for the MCP tool first; that is where the host learns the tool_use id.
    expect(await options.canUseTool?.("mcp__orchestra__echo", { text: "hi" }, { signal: new AbortController().signal, toolUseID: "tu-echo", requestId: "r1" }))
      .toEqual({ behavior: "allow", updatedInput: { text: "hi" } })
    const server = options.mcpServers?.orchestra as McpSdkServerConfigWithInstance
    const [client, transport] = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transport)
    const mcp = new Client({ name: "test", version: "0" })
    await mcp.connect(client)
    listed = (await mcp.listTools()).tools.map((tool) => tool.name)
    reply = await mcp.callTool({ name: "echo", arguments: { text: "hi" } })
    await mcp.close()
  }
  script = [
    frame({ type: "assistant", uuid: "a1", session_id: "claude-1", parent_tool_use_id: null,
      message: { content: [{ type: "tool_use", id: "tu-echo", name: "mcp__orchestra__echo", input: { text: "hi" } }] } }),
    frame({ type: "user", session_id: "claude-1", parent_tool_use_id: null,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu-echo", content: "hi" }] } }),
    done,
  ]
  const tool = (name: string) => new ToolDefinition({ name, description: name, inputSchema: { type: "object", properties: { text: { type: "string" } } } })
  const events = await collect(turnOf({
    tools: [tool("echo"), tool("bash")],
    execute: (call) => Effect.sync(() => executed.push(call)).pipe(Effect.as({ result: { type: "text" as const, value: "echoed hi" } })),
  }))

  expect(listed).toEqual(["echo"])
  expect(executed).toEqual([{ id: "tu-echo", name: "echo", input: { text: "hi" } }])
  expect(reply).toMatchObject({ content: [{ type: "text", text: "echoed hi" }] })
  expect(events.map((event) => event.type)).toEqual(["step-start", "step-finish"])
})

test("Claude Code's approvals become V2 permission checks: allowed runs, a deny refuses with the reason", async () => {
  const asked: unknown[] = []
  const decisions: unknown[] = []
  during = async (options) => {
    const signal = new AbortController().signal
    decisions.push(await options.canUseTool?.("Edit", { file_path: "/project/src/a.ts" }, { signal, toolUseID: "tu-1", requestId: "r1" }))
    decisions.push(await options.canUseTool?.("Bash", { command: "rm -rf /" }, { signal, toolUseID: "tu-2", requestId: "r2" }))
  }
  script = [done]
  await collect(turnOf({
    authorize: (input) =>
      Effect.sync(() => asked.push(input)).pipe(
        Effect.andThen(input.action === "bash" ? Effect.fail(new PermissionV2.BlockedError({ rules: [] })) : Effect.void),
      ),
  }))

  expect(asked).toEqual([
    { callID: "tu-1", tool: "Edit", action: "edit", resources: ["src/a.ts"] },
    { callID: "tu-2", tool: "Bash", action: "bash", resources: ["rm -rf /"] },
  ])
  expect(decisions).toEqual([
    { behavior: "allow", updatedInput: { file_path: "/project/src/a.ts" } },
    { behavior: "deny", message: "Orchestra's permission rules deny this call." },
  ])
})

test("delegation goes through Orchestra's governed task: served over MCP, Claude Code's own subagent tool refused", async () => {
  let listed: string[] = []
  const decisions: unknown[] = []
  during = async (options) => {
    const signal = new AbortController().signal
    decisions.push(await options.canUseTool?.("Agent", { prompt: "go" }, { signal, toolUseID: "tu-1", requestId: "r1" }))
    decisions.push(await options.canUseTool?.("Task", { prompt: "go" }, { signal, toolUseID: "tu-2", requestId: "r2" }))
    const server = options.mcpServers?.orchestra as McpSdkServerConfigWithInstance
    const [client, transport] = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transport)
    const mcp = new Client({ name: "test", version: "0" })
    await mcp.connect(client)
    listed = (await mcp.listTools()).tools.map((tool) => tool.name)
    await mcp.close()
  }
  script = [done]
  await collect(turnOf({
    tools: [new ToolDefinition({ name: "task", description: "task", inputSchema: { type: "object", properties: {} } })],
    authorize: () => Effect.die("a subagent call must not reach the permission check"),
  }))

  expect(listed).toEqual(["task"])
  const denied = { behavior: "deny", message: "Delegate through `mcp__orchestra__task`: Orchestra governs every delegation in this session." }
  expect(decisions).toEqual([denied, denied])
})

// Claude Code skips canUseTool when a settings allow rule matches, so the PreToolUse hook is the call's only sure check.
const pre = (options: Options, tool: string, input: Record<string, unknown>, id: string) =>
  options.hooks?.PreToolUse?.[0]?.hooks[0]?.(
    { hook_event_name: "PreToolUse", tool_name: tool, tool_input: input, tool_use_id: id, session_id: "claude-1", transcript_path: "", cwd: "/project" } as HookInput,
    id,
    { signal: new AbortController().signal },
  )
const allowed = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }
const refused = (reason: string) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } })

test("the PreToolUse gate settles every call through Orchestra, failing closed, before any settings allow rule applies", async () => {
  const asked: unknown[] = []
  const decisions: unknown[] = []
  const executed: unknown[] = []
  during = async (options) => {
    decisions.push(await pre(options, "Write", { file_path: "/project/a.ts" }, "tu-1"))
    decisions.push(await pre(options, "Bash", { command: "rm -rf /" }, "tu-2"))
    decisions.push(await pre(options, "Grep", { pattern: "boom" }, "tu-3"))
    decisions.push(await pre(options, "Agent", { prompt: "go" }, "tu-4"))
    decisions.push(await pre(options, "AskUserQuestion", { questions: [] }, "tu-5"))
    decisions.push(await pre(options, "mcp__orchestra__task", { prompt: "go" }, "tu-6"))
    // canUseTool after the hook already learned the call (both can run): the call id is not queued twice.
    await options.canUseTool?.("mcp__orchestra__task", { prompt: "go" }, { signal: new AbortController().signal, toolUseID: "tu-6", requestId: "r6" })
    const server = options.mcpServers?.orchestra as McpSdkServerConfigWithInstance
    const [client, transport] = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transport)
    const mcp = new Client({ name: "test", version: "0" })
    await mcp.connect(client)
    await mcp.callTool({ name: "task", arguments: { prompt: "go" } })
    await mcp.callTool({ name: "task", arguments: { prompt: "again" } })
    await mcp.close()
  }
  script = [done]
  await collect(turnOf({
    tools: [new ToolDefinition({ name: "task", description: "task", inputSchema: { type: "object", properties: {} } })],
    execute: (call) => Effect.sync(() => executed.push(call.id)).pipe(Effect.as({ result: { type: "text" as const, value: "ok" } })),
    authorize: (input) =>
      Effect.sync(() => asked.push(input)).pipe(
        Effect.andThen(
          input.action === "bash" ? Effect.fail(new PermissionV2.BlockedError({ rules: [] }))
            : input.action === "grep" ? Effect.die("permission store unavailable") : Effect.void,
        ),
      ),
  }))

  expect(asked).toEqual([
    { callID: "tu-1", tool: "Write", action: "edit", resources: ["a.ts"] },
    { callID: "tu-2", tool: "Bash", action: "bash", resources: ["rm -rf /"] },
    { callID: "tu-3", tool: "Grep", action: "grep", resources: ["boom"] },
  ])
  expect(decisions).toEqual([
    allowed,
    refused("Orchestra's permission rules deny this call."),
    refused("Orchestra could not check this call, so it is refused."),
    refused("Delegate through `mcp__orchestra__task`: Orchestra governs every delegation in this session."),
    refused("Orchestra cannot show this question here: ask the owner in your reply and end your turn."),
    allowed,
  ])
  expect(executed[0]).toBe("tu-6")
  expect(executed[1]).not.toBe("tu-6")
})

test("an assistant-level error fails the turn unless a later frame supersedes it", async () => {
  const stored: { value: unknown } = { value: undefined }
  const state = { get: Effect.sync(() => stored.value), update: (fn: (value: unknown) => unknown) => Effect.sync(() => void (stored.value = fn(stored.value))) }
  script = [
    frame({ type: "assistant", uuid: "e1", session_id: "claude-1", parent_tool_use_id: null, error: "billing_error",
      message: { content: [{ type: "text", text: "billing_error: plan limits reached" }] } }),
    done,
  ]
  const failed = await collect(turnOf({ state }))

  expect(failed).toMatchObject([{ type: "step-start" }, { type: "provider-error", message: "Anthropic returned: billing_error: plan limits reached" }])
  expect(failed.some((event) => event.type === "step-finish" || event.type === "text-delta")).toBe(false)
  // The owner's message was never answered, so it is sent again next turn.
  expect(stored.value).toBeUndefined()

  script = [
    frame({ type: "assistant", uuid: "e2", session_id: "claude-1", parent_tool_use_id: null, error: "rate_limit",
      message: { content: [] } }),
    frame({ type: "assistant", uuid: "a2", session_id: "claude-1", parent_tool_use_id: null, supersedes: ["e2"],
      message: { content: [{ type: "text", text: "Recovered" }] } }),
    done,
  ]
  const recovered = await collect(turnOf({ state }))

  expect(recovered.map((event) => event.type)).toEqual(["step-start", "text-start", "text-delta", "text-end", "step-finish"])
  expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1"] })
})

test("a prompt Claude Code consumed is delivered even when the turn is interrupted before its result", async () => {
  const stored: { value: unknown } = { value: undefined }
  script = (sent) => [
    frame({ type: "assistant", uuid: "a1", session_id: "claude-1", parent_tool_use_id: null, user_message_uuid: sent,
      user_message_uuids: [sent], message: { content: [{ type: "text", text: "Starting" }] } }),
  ]
  await collect(turnOf({
    state: { get: Effect.sync(() => stored.value), update: (fn) => Effect.sync(() => void (stored.value = fn(stored.value))) },
  }))

  expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1"] })
})
