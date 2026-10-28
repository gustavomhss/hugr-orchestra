import { beforeEach, expect, test } from "bun:test"
import type { HookInput, McpSdkServerConfigWithInstance, Options, SDKMessage, SDKUserMessage, query } from "@anthropic-ai/claude-agent-sdk"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { ToolDefinition } from "@orchestra/llm"
import { AgentV2 } from "@orchestra/core/agent"
import { PermissionV2 } from "@orchestra/core/permission"
import { SessionSchema } from "@orchestra/core/session"
import { ToolSafety } from "@orchestra/core/tool-safety"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import { Effect, Layer, Stream } from "effect"
import { QuestionV2 } from "@orchestra/core/question"
import { ClaudeHostOptions } from "../src/host/options"
import { ClaudeCodeSDK } from "../src/sdk"
import { ClaudeCodeHost, permission } from "../src/v2/host"

// The V2 Claude Code host, driven through the SDK seam with scripted frames: no Claude Code process, no Claude API.
// One SDK query is one provider turn; the next turn resumes the same Claude Code session with only the new message.

const calls: { prompt: unknown; options: Options | undefined }[] = []
// Frames, or frames built from the client uuid the host stamped on its prompt (Claude Code echoes it on its replies).
let script: SDKMessage[] | ((sent: string | undefined) => SDKMessage[]) = []
// Runs before the frames, as Claude Code would mid-turn: approvals and Orchestra tool calls.
let during: (options: Options) => Promise<void> = async () => {}
// A test that sets `during` would otherwise run its approvals and MCP calls inside every later test's turn.
beforeEach(() => {
  during = async () => {}
})

// Replaces the scripted frames when a test needs to read the whole streaming input or outlive the turn.
let pump: ((input: AsyncIterable<SDKUserMessage>, options: Options) => AsyncGenerator<SDKMessage>) | undefined

const sdk = Layer.succeed(
  ClaudeCodeSDK.Service,
  ClaudeCodeSDK.Service.of({
    query: ((input: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => {
      if (pump) return pump(input.prompt, input.options)
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

// The ports a Turn carries beyond the call-through basics; a test overrides the one it exercises.
const ports = {
  question: () => Effect.die("unused"),
  memory: { recall: Effect.succeed(undefined), archive: () => Effect.void },
  steers: Stream.empty,
  consumed: () => Effect.void,
  notify: () => Effect.void,
  todos: () => Effect.void,
  child: () => Effect.succeed({ id: SessionSchema.ID.make("ses_child"), publish: () => Effect.void, finish: Effect.void, todos: () => Effect.void, execute: () => Effect.succeed({ result: { type: "text", value: "" } }) }),
} satisfies Pick<ExecutionHost.Turn, "question" | "memory" | "steers" | "consumed" | "notify" | "todos" | "child">

const turnOf = (input: Partial<ExecutionHost.Turn> = {}): ExecutionHost.Turn => ({
  session: { id: SessionSchema.ID.make("ses_host"), location: { directory: "/project" } } as unknown as SessionSchema.Info,
  agent: AgentV2.Info.empty(AgentV2.ID.make("maestro")),
  model: undefined,
  system: [],
  context: [],
  seats: [],
  skills: {},
  seatTools: {},
  history: [user("msg_1", "Go")] as unknown as ExecutionHost.Turn["history"],
  tools: [],
  execute: () => Effect.die("unused"),
  authorize: () => Effect.die("unused"),
  ...ports,
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
const seat = (id: string, fields: Partial<AgentV2.Info> = {}) =>
  ({ ...AgentV2.Info.empty(AgentV2.ID.make(id)), mode: "subagent", system: `You are ${id}. Use the task delegation tool.`, ...fields }) as AgentV2.Info

test("one SDK query is one turn: tool calls surface provider-executed and the next turn resumes with only new input", async () => {
  const stored: { value: unknown } = { value: undefined }
  const turn = (history: ReadonlyArray<unknown>): ExecutionHost.Turn => ({
    session: { id: SessionSchema.ID.make("ses_host"), location: { directory: "/project" } } as unknown as SessionSchema.Info,
    agent: AgentV2.Info.empty(AgentV2.ID.make("maestro")),
    model: undefined,
    system: ["Maestro instructions", "Context"],
    context: ["Context"],
    seats: [],
    skills: {},
    seatTools: {},
    history: history as ExecutionHost.Turn["history"],
    tools: [],
    execute: () => Effect.die("unused"),
    authorize: () => Effect.die("unused"),
    ...ports,
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
    // The short Maestro note, never the seat's full Orchestra prompt or the context.
    systemPrompt: { type: "preset", preset: "claude_code", append: ClaudeHostOptions.append("maestro", {}) },
  })
  expect(calls[0]?.options?.resume).toBeUndefined()
  expect(first.map((event) => event.type)).toEqual([
    "step-start", "text-start", "text-delta", "text-end", "tool-call", "tool-result",
    "text-start", "text-delta", "text-end", "step-finish",
  ])
  expect(first[4]).toMatchObject({ id: "tu1", name: "bash", input: { command: "ls" }, providerExecuted: true })
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

test("built-in calls are recorded under Orchestra's tool names, so the app shows its usual widgets", async () => {
  const todos = [{ content: "Plan", status: "completed", activeForm: "Planning" }]
  const call = (id: string, name: string, input: Record<string, unknown>) =>
    frame({ type: "assistant", uuid: `a-${id}`, session_id: "claude-1", parent_tool_use_id: null,
      message: { content: [{ type: "tool_use", id, name, input }] } })
  const result = (id: string, content: string, toolUseResult?: unknown) =>
    frame({ type: "user", session_id: "claude-1", parent_tool_use_id: null, tool_use_result: toolUseResult,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] } })
  const hunk = { oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, lines: [" keep", "-a", "+b"] }
  script = [
    call("t1", "Read", { file_path: "/project/a.ts", offset: 2, limit: 10 }),
    call("t2", "Edit", { file_path: "/project/a.ts", old_string: "a", new_string: "b" }),
    result("t2", "The file has been updated.", { filePath: "/project/a.ts", structuredPatch: [hunk] }),
    call("t3", "Grep", { pattern: "x", path: "src", glob: "*.ts" }),
    call("t4", "TodoWrite", { todos }),
    result("t4", "Todos have been modified successfully."),
    call("t5", "Agent", { description: "Fix it", prompt: "go", subagent_type: "orchestra:backend" }),
    call("t6", "Skill", { skill: "release" }),
    done,
  ]
  const written: unknown[] = []
  const events = await collect(turnOf({ seats: [seat("backend")], todos: (list) => Effect.sync(() => void written.push(list)) }))

  expect(events.filter((event) => event.type === "tool-call")).toMatchObject([
    { name: "read", input: { filePath: "/project/a.ts", offset: 2, limit: 10 } },
    { name: "edit", input: { filePath: "/project/a.ts", oldString: "a", newString: "b" } },
    { name: "grep", input: { pattern: "x", path: "src", include: "*.ts" } },
    { name: "todowrite", input: { todos } },
    { name: "task", input: { description: "Fix it", prompt: "go", subagent_type: "backend" } },
    { name: "skill", input: { name: "release" } },
  ])
  // The edit carries the patch and counts Orchestra's edit tool records, under the project-relative path.
  expect(events.filter((event) => event.type === "tool-result")).toMatchObject([
    {
      name: "edit",
      output: {
        structured: {
          files: [{
            file: "a.ts",
            patch: ["Index: a.ts", "=".repeat(67), "--- a.ts", "+++ a.ts", "@@ -1,2 +1,2 @@", " keep", "-a", "+b", ""].join("\n"),
            status: "modified",
            additions: 1,
            deletions: 1,
          }],
        },
      },
    },
    {
      name: "todowrite",
      result: { type: "text", value: JSON.stringify({ todos }) },
      output: { structured: { todos: [{ content: "Plan", status: "completed", priority: "medium" }] } },
    },
  ])
  // The checklist becomes the Session's todo list, which the todo panel shows.
  expect(written).toEqual([[{ content: "Plan", status: "completed", priority: "medium" }]])
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

test("a cancelled Claude call interrupts the running Orchestra tool", async () => {
  let started!: () => void
  const running = new Promise<void>((resolve) => (started = resolve))
  let stop!: () => void
  const interrupted = new Promise<void>((resolve) => (stop = resolve))
  const abort = new AbortController()
  during = async (options) => {
    const server = options.mcpServers?.orchestra as McpSdkServerConfigWithInstance
    const [client, transport] = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transport)
    const mcp = new Client({ name: "test", version: "0" })
    await mcp.connect(client)
    const call = mcp.callTool({ name: "slow", arguments: {} }, undefined, { signal: abort.signal }).catch(() => undefined)
    await running
    abort.abort()
    await call
    await interrupted
    await mcp.close()
  }
  script = [done]
  const tool = new ToolDefinition({ name: "slow", description: "slow", inputSchema: { type: "object", properties: {} } })
  await collect(turnOf({
    tools: [tool],
    execute: () => Effect.sync(started).pipe(Effect.andThen(Effect.never), Effect.onInterrupt(() => Effect.sync(stop))),
  }))
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
        Effect.andThen(input.action === "bash" ? Effect.fail(new PermissionV2.BlockedError({ rules: [] })) : Effect.succeed({})),
      ),
  }))

  expect(asked).toEqual([
    { callID: "tu-1", tool: "Edit", action: "edit", resources: ["src/a.ts"], safety: { tool: "edit", args: { filePath: "/project/src/a.ts" } } },
    { callID: "tu-2", tool: "Bash", action: "bash", resources: ["rm -rf /"], safety: { tool: "bash", args: { command: "rm -rf /" } } },
  ])
  expect(decisions).toEqual([
    { behavior: "allow", updatedInput: { file_path: "/project/src/a.ts" } },
    { behavior: "deny", message: "Orchestra's permission rules deny this call." },
  ])
})

test("the context reaches Claude Code beside the prompt, once per change, and again after a compaction", async () => {
  const stored: { value: unknown } = { value: undefined }
  const state = {
    get: Effect.sync(() => stored.value),
    update: (fn: (value: unknown) => unknown) => Effect.sync(() => void (stored.value = fn(stored.value))),
  }
  const submitted: unknown[] = []
  const signal = new AbortController().signal
  const submit = (options: Options) =>
    options.hooks?.UserPromptSubmit?.[0]?.hooks[0]?.(
      { hook_event_name: "UserPromptSubmit", prompt: "Go", session_id: "claude-1", transcript_path: "", cwd: "/project" } as HookInput,
      undefined,
      { signal },
    )
  during = async (options) => {
    submitted.push(await submit(options))
    submitted.push(await submit(options))
  }
  script = [done]
  await collect(turnOf({ context: ["Baseline"], state }))
  await collect(turnOf({
    context: ["Baseline"],
    state,
    history: [user("msg_1", "Go"), user("msg_2", "Next")] as unknown as ExecutionHost.Turn["history"],
  }))

  const context = { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "Baseline" } }
  expect(submitted).toEqual([context, {}, {}, {}])

  const recalled: unknown[] = []
  during = async (options) => {
    recalled.push(await options.hooks?.SessionStart?.[0]?.hooks[0]?.(
      { hook_event_name: "SessionStart", source: "compact", session_id: "claude-1", transcript_path: "", cwd: "/project" } as HookInput,
      undefined,
      { signal },
    ))
  }
  await collect(turnOf({
    context: ["Baseline"],
    state,
    memory: { recall: Effect.succeed("Todos"), archive: () => Effect.void },
    history: [user("msg_3", "Again")] as unknown as ExecutionHost.Turn["history"],
  }))
  expect(recalled).toEqual([{ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "Baseline\n\nTodos" } }])
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
    decisions.push(await pre(options, "Agent", { prompt: "go", subagent_type: "orchestra:backend", run_in_background: true }, "tu-4"))
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
    seats: [seat("backend")],
    tools: [new ToolDefinition({ name: "task", description: "task", inputSchema: { type: "object", properties: {} } })],
    execute: (call) => Effect.sync(() => executed.push(call.id)).pipe(Effect.as({ result: { type: "text" as const, value: "ok" } })),
    authorize: (input) =>
      Effect.sync(() => asked.push(input)).pipe(
        Effect.andThen(
          input.action === "bash" ? Effect.fail(new PermissionV2.BlockedError({ rules: [] }))
            : input.action === "grep" ? Effect.die("permission store unavailable") : Effect.succeed({}),
        ),
      ),
  }))

  expect(asked).toEqual([
    { callID: "tu-1", tool: "Write", action: "edit", resources: ["a.ts"], safety: { tool: "write", args: { filePath: "/project/a.ts" } } },
    { callID: "tu-2", tool: "Bash", action: "bash", resources: ["rm -rf /"], safety: { tool: "bash", args: { command: "rm -rf /" } } },
    { callID: "tu-3", tool: "Grep", action: "grep", resources: ["boom"], safety: { tool: "grep", args: { pattern: "boom" } } },
  ])
  expect(decisions).toEqual([
    allowed,
    refused("Orchestra's permission rules deny this call."),
    refused("Orchestra could not check this call, so it is refused."),
    refused("Run `orchestra:backend` in the foreground: its result is needed in this turn."),
    // The question needs the owner, so the hook leaves it to canUseTool.
    {},
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

const session = { id: SessionSchema.ID.make("ses_host"), location: { directory: "/project" } } as unknown as SessionSchema.Info
const permissionCall = (options: Options, tool: string, input: Record<string, unknown>, id: string) =>
  options.canUseTool?.(tool, input, { signal: new AbortController().signal, toolUseID: id, requestId: id })

test("ToolSafety's rewrite and the dispatch's domains reach Claude Code, and a ToolSafety refusal names its reason", async () => {
  const asked: { callID: string; safety?: unknown }[] = []
  const decisions: unknown[] = []
  during = async (options) => {
    decisions.push(await permissionCall(options, "Bash", { command: "ls", description: "list" }, "tu-1"))
    decisions.push(await permissionCall(options, "WebSearch", { query: "asyncio" }, "tu-2"))
    decisions.push(await permissionCall(options, "Write", { file_path: "/elsewhere/x.ts" }, "tu-3"))
    // The hook then canUseTool for the same call: one decision, one authorization.
    decisions.push(await pre(options, "Bash", { command: "ls" }, "tu-4"))
    decisions.push(await permissionCall(options, "Bash", { command: "ls" }, "tu-4"))
  }
  script = [done]
  await collect(turnOf({
    authorize: (input) => {
      asked.push(input)
      if (input.callID === "tu-3") return Effect.fail(new ToolSafety.Denied({ reason: "write-outside-physical-roots" }))
      if (input.tool === "WebSearch") return Effect.succeed({ domains: ["docs.python.org"] })
      return Effect.succeed({ input: { command: "sandbox-exec ls" } })
    },
  }))

  expect(asked.map((item) => item.callID)).toEqual(["tu-1", "tu-2", "tu-3", "tu-4"])
  expect(asked[0]?.safety).toEqual({ tool: "bash", args: { command: "ls" } })
  expect(asked[2]?.safety).toEqual({ tool: "write", args: { filePath: "/elsewhere/x.ts" } })
  expect(decisions[0]).toEqual({ behavior: "allow", updatedInput: { command: "sandbox-exec ls", description: "list" } })
  expect(decisions[1]).toEqual({ behavior: "allow", updatedInput: { query: "asyncio", allowed_domains: ["docs.python.org"] } })
  expect(decisions[2]).toMatchObject({ behavior: "deny", message: expect.stringContaining("write-outside-physical-roots") })
  expect(decisions[3]).toEqual({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { command: "sandbox-exec ls" } } })
  expect(decisions[4]).toEqual({ behavior: "allow", updatedInput: { command: "sandbox-exec ls" } })
})

test("AskUserQuestion shows the owner's question and returns the answers; a dismissed question denies the tool", async () => {
  const shown: unknown[] = []
  const decisions: unknown[] = []
  let dismiss = false
  during = async (options) => {
    const input = {
      questions: [
        { question: "Which db?", header: "DB", options: [{ label: "pg", description: "Postgres" }], multiSelect: false },
        { question: "Which tags?", header: "Tags", options: [{ label: "a", description: "A" }, { label: "b", description: "B" }], multiSelect: true },
      ],
    }
    decisions.push(await permissionCall(options, "AskUserQuestion", input, "tu-q1"))
    dismiss = true
    decisions.push(await permissionCall(options, "AskUserQuestion", input, "tu-q2"))
  }
  script = [done]
  await collect(turnOf({
    question: (input) => {
      shown.push(input)
      return dismiss ? Effect.fail(new QuestionV2.RejectedError()) : Effect.succeed([["pg"], ["a", "b"]])
    },
  }))

  expect(shown[0]).toEqual({
    callID: "tu-q1",
    questions: [
      { question: "Which db?", header: "DB", options: [{ label: "pg", description: "Postgres" }], multiple: false },
      { question: "Which tags?", header: "Tags", options: [{ label: "a", description: "A" }, { label: "b", description: "B" }], multiple: true },
    ],
  })
  expect(decisions[0]).toMatchObject({ behavior: "allow", updatedInput: { answers: { "Which db?": "pg", "Which tags?": "a, b" } } })
  expect(decisions[1]).toEqual({ behavior: "deny", message: "The owner dismissed this question." })
})

test("after Claude Code compacts, Orchestra's working memory comes back and the summary is archived", async () => {
  const archived: unknown[] = []
  const results: unknown[] = []
  during = async (options) => {
    const signal = { signal: new AbortController().signal }
    const base = { session_id: "claude-1", transcript_path: "", cwd: "/project" }
    results.push(await options.hooks?.SessionStart?.[0]?.hooks[0]?.({ ...base, hook_event_name: "SessionStart", source: "compact" } as HookInput, undefined, signal))
    results.push(await options.hooks?.SessionStart?.[0]?.hooks[0]?.({ ...base, hook_event_name: "SessionStart", source: "startup" } as HookInput, undefined, signal))
    results.push(await options.hooks?.PostCompact?.[0]?.hooks[0]?.({ ...base, hook_event_name: "PostCompact", trigger: "auto", compact_summary: "We fixed the bug." } as HookInput, undefined, signal))
    expect(options.hooks?.SessionStart?.[0]?.matcher).toBe("compact")
  }
  script = [done]
  await collect(turnOf({
    memory: {
      recall: Effect.succeed("## Todos\n- [pending] ship it"),
      archive: (input) => Effect.sync(() => void archived.push(input)),
    },
  }))

  expect(results[0]).toEqual({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "## Todos\n- [pending] ship it" } })
  expect(results[1]).toEqual({})
  expect(archived).toEqual([{ summary: "We fixed the bug.", trigger: "auto", nativeSessionID: "claude-1" }])
})

test("a steer that arrives mid-turn reaches the running query through its streaming input, in the same single stream", async () => {
  const stored: { value: unknown } = { value: undefined }
  const sent: unknown[] = []
  const consumed: string[] = []
  pump = async function* (input) {
    const iterator = input[Symbol.asyncIterator]()
    const first = await iterator.next()
    // Blocks until the host pushes the steer into the same input.
    const second = await iterator.next()
    sent.push(first.value?.message.content, second.value?.message.content)
    yield frame({ type: "assistant", uuid: "a1", session_id: "claude-1", parent_tool_use_id: null,
      user_message_uuids: [first.value?.uuid, second.value?.uuid], message: { content: [{ type: "text", text: "Both" }] } })
    yield done
  }
  try {
    const events = await collect(turnOf({
      steers: Stream.make({ id: "msg_steer", text: "also this" }),
      consumed: (id) => Effect.sync(() => void consumed.push(id)),
      state: { get: Effect.sync(() => stored.value), update: (fn) => Effect.sync(() => void (stored.value = fn(stored.value))) },
    }))

    expect(sent).toEqual(["Go", "also this"])
    expect(events.filter((event) => event.type === "step-start")).toHaveLength(1)
    expect(events.filter((event) => event.type === "step-finish")).toHaveLength(1)
    expect(consumed).toEqual(["msg_steer"])
    expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1", "msg_steer"] })
  } finally {
    pump = undefined
  }
})

test("what a refusal fallback or a superseding reply replaced is retracted, never left in the transcript", async () => {
  script = [
    frame({ type: "assistant", uuid: "a1", session_id: "claude-1", parent_tool_use_id: null,
      message: { content: [{ type: "text", text: "I cannot" }, { type: "tool_use", id: "tu1", name: "Bash", input: { command: "ls" } }] } }),
    frame({ type: "system", subtype: "model_refusal_fallback", session_id: "claude-1", retracted_message_uuids: ["a1"] }),
    frame({ type: "assistant", uuid: "a2", session_id: "claude-1", parent_tool_use_id: null,
      message: { content: [{ type: "text", text: "Here you go" }] } }),
    frame({ type: "assistant", uuid: "a3", session_id: "claude-1", parent_tool_use_id: null, supersedes: ["a2"],
      message: { content: [{ type: "text", text: "Better" }] } }),
    done,
  ]
  const events = await collect(turnOf())

  expect(events.map((event) => event.type)).toEqual([
    "step-start", "text-start", "text-delta", "text-end", "tool-call",
    "retract",
    "text-start", "text-delta", "text-end",
    "retract",
    "text-start", "text-delta", "text-end",
    "step-finish",
  ])
  expect(events[5]).toMatchObject({ type: "retract", ids: ["a1:0", "tu1"] })
  expect(events[9]).toMatchObject({ type: "retract", ids: ["a2:0"] })
})

test("the cost Claude Code billed and the context window of the model that answered ride on the step's usage", async () => {
  script = [
    frame({ type: "assistant", uuid: "a1", session_id: "claude-1", parent_tool_use_id: null, message: { content: [{ type: "text", text: "Hi" }] } }),
    frame({ type: "result", subtype: "success", is_error: false, session_id: "claude-1", result: "", usage, total_cost_usd: 0.0123,
      modelUsage: {
        "claude-haiku-4": { inputTokens: 900, outputTokens: 90, contextWindow: 200_000 },
        "claude-opus-4": { inputTokens: 5, outputTokens: 4, contextWindow: 1_000_000 },
      } }),
  ]
  const named = await collect(turnOf({ model: { id: "claude-opus-4", providerID: "anthropic" } as ExecutionHost.Turn["model"] }))
  expect(named.at(-1)).toMatchObject({ type: "step-finish", usage: { cost: 0.0123, contextWindow: 1_000_000, outputTokens: 4 } })

  // Unnamed, the busiest model is the main one.
  const unnamed = await collect(turnOf())
  expect(unnamed.at(-1)).toMatchObject({ type: "step-finish", usage: { cost: 0.0123, contextWindow: 200_000 } })
})

test("a background task that reports after the turn is handed to the runner as an event of the host's own, then the process is let go", async () => {
  const notified: { id: string; text: string }[] = []
  const trace = { closed: false, endedAtResult: undefined as boolean | undefined }
  pump = async function* (input, options) {
    options.abortController?.signal.addEventListener("abort", () => void (trace.closed = true), { once: true })
    await input[Symbol.asyncIterator]().next()
    yield frame({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "t1", task_type: "bash", description: "sleep" }] })
    yield frame({ type: "assistant", uuid: "a1", session_id: "claude-1", parent_tool_use_id: null, message: { content: [{ type: "text", text: "Started" }] } })
    yield done
    // Resumed only when the host keeps reading past the result, and still up: the task has not reported.
    trace.endedAtResult = trace.closed
    yield frame({ type: "system", subtype: "task_notification", task_id: "t1", status: "completed", summary: "slept", output_file: "/tmp/t1.out" })
  }
  try {
    const events = await collect(turnOf({ notify: (input) => Effect.sync(() => void notified.push(input)) }))
    expect(events.at(-1)).toMatchObject({ type: "step-finish" })
    for (let waited = 0; !trace.closed && waited < 100; waited++) await new Promise((resolve) => setTimeout(resolve, 20))

    expect(trace.endedAtResult).toBe(false)
    expect(notified).toEqual([{
      id: "msg_ses_host_task_t1_completed",
      text: "Background task t1 completed: slept\nOutput: /tmp/t1.out",
    }])
    expect(trace.closed).toBe(true)
  } finally {
    pump = undefined
  }
})

test("a query kept up for background work is closed before the session's next turn starts its own", async () => {
  const trace = { closed: false, closedWhenNextStarted: undefined as boolean | undefined }
  let starts = 0
  pump = async function* (input, options) {
    starts++
    if (starts === 2) trace.closedWhenNextStarted = trace.closed
    options.abortController?.signal.addEventListener("abort", () => void (trace.closed = true), { once: true })
    await input[Symbol.asyncIterator]().next()
    if (starts === 2) {
      yield done
      return
    }
    yield frame({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "t1", task_type: "bash", description: "sleep" }] })
    yield done
    await new Promise((resolve) => options.abortController?.signal.addEventListener("abort", resolve, { once: true }))
  }
  try {
    // One host serves both turns, as the layer's does: it is the host that remembers the query it kept up.
    await Effect.runPromise(
      ClaudeCodeHost.make.pipe(
        Effect.flatMap((host) =>
          Effect.gen(function* () {
            yield* Stream.runCollect(host.stream(turnOf({ session })))
            yield* Stream.runCollect(host.stream(turnOf({ session })))
          }),
        ),
        Effect.provide(sdk),
        Effect.provideService(ClaudeCodeSDK.Environment, {}),
      ),
    )

    expect(trace.closedWhenNextStarted).toBe(true)
  } finally {
    pump = undefined
  }
})

test("a file whose name starts with two dots inside the workspace is matched by its relative path", () => {
  expect(permission("Read", { file_path: "/project/..cache/x" }, "/project")).toEqual({ action: "read", resources: ["..cache/x"] })
  expect(permission("Read", { file_path: "/project/../outside/x" }, "/project")).toEqual({ action: "read", resources: ["/project/../outside/x"] })
  expect(permission("Read", { file_path: "/other/x" }, "/project")).toEqual({ action: "read", resources: ["/other/x"] })
})

test("a prompt Claude Code already took is not sent again after a stop or a broken turn; an unanswered failure resends it", async () => {
  const prompts: unknown[] = []
  let frames: SDKMessage[] = []
  // `hang`: the frames stop without ending, as a turn the owner then stops; otherwise they end, as a process that exits.
  let hang = false
  // Like the SDK: it writes the first message, then asks the input for the next one.
  const reading = Layer.succeed(
    ClaudeCodeSDK.Service,
    ClaudeCodeSDK.Service.of({
      query: ((input: { prompt: AsyncIterable<SDKUserMessage> }) => {
        const messages = input.prompt[Symbol.asyncIterator]()
        void messages.next().then((first) => {
          prompts.push(first.done ? undefined : first.value.message.content)
          return messages.next()
        })
        const queued = [...frames]
        const hangs = hang
        return {
          [Symbol.asyncIterator]() {
            return this
          },
          next: () =>
            new Promise((resolve) =>
              setTimeout(() => {
                const value = queued.shift()
                if (value) return resolve({ value, done: false })
                if (!hangs) resolve({ value: undefined, done: true })
              }, 5),
            ),
          return: () => Promise.resolve({ value: undefined, done: true }),
        }
      }) as unknown as typeof query,
    }),
  )
  const stored: { value: unknown } = { value: undefined }
  const run = (history: ReadonlyArray<unknown>) =>
    Effect.runPromise(
      ClaudeCodeHost.make.pipe(
        Effect.flatMap((host) =>
          Stream.runCollect(
            host.stream(
              turnOf({
                history: history as ExecutionHost.Turn["history"],
                state: {
                  get: Effect.sync(() => stored.value),
                  update: (fn) => Effect.sync(() => void (stored.value = fn(stored.value))),
                },
              }),
            ),
          ).pipe(Effect.timeoutOption("300 millis")),
        ),
        Effect.provide(reading),
        Effect.provideService(ClaudeCodeSDK.Environment, {}),
      ),
    )
  const init = frame({ type: "system", subtype: "init", session_id: "claude-1" })

  // Stopped while Claude Code works on the prompt, before it replied.
  hang = true
  frames = [init]
  await run([user("msg_1", "First")])
  expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1"] })

  // Claude Code replied, then its process ended before the result.
  hang = false
  frames = [init, frame({ type: "assistant", uuid: "a1", session_id: "claude-1", parent_tool_use_id: null,
    message: { content: [{ type: "text", text: "Working" }] } })]
  await run([user("msg_1", "First"), user("msg_2", "Second")])
  expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1", "msg_2"] })

  // Signed out: Claude Code answered nothing, so the prompt is sent again with the next one.
  frames = [init, frame({ type: "assistant", uuid: "b1", session_id: "claude-1", parent_tool_use_id: null,
    error: "authentication_failed", message: { content: [] } }),
    frame({ type: "result", subtype: "success", is_error: true, session_id: "claude-1", result: "Not signed in", usage })]
  await run([user("msg_1", "First"), user("msg_2", "Second"), user("msg_3", "Third")])
  expect(stored.value).toEqual({ sessionId: "claude-1", delivered: ["msg_1", "msg_2"] })
  expect(prompts).toEqual(["First", "Second", "Third"])
})
