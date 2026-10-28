import { beforeEach, expect, test } from "bun:test"
import type { HookInput, McpSdkServerConfigWithInstance, Options, SDKMessage, SDKUserMessage, query } from "@anthropic-ai/claude-agent-sdk"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { ToolDefinition } from "@orchestra/llm"
import { AgentV2 } from "@orchestra/core/agent"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema } from "@orchestra/core/session"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import { Effect, Layer, Stream } from "effect"
import { ClaudeHostOptions } from "../src/host/options"
import { ClaudeCodeSDK } from "../src/sdk"
import { ClaudeCodeHost } from "../src/v2/host"

// Claude Code subagents as Orchestra's seats, and the todo lists Claude Code keeps, driven like v2-host.test.ts:
// scripted SDK frames, no Claude Code process.

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
  seatOnly: [],
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

test("a subagent's frames are recorded in the child Session of its task call, which ends with the call's result, and its checklist is the child's todos", async () => {
  const log: unknown[] = []
  const agentFrame = (uuid: string, parent: string | null, content: unknown[]) =>
    frame({ type: "assistant", uuid, session_id: "claude-1", parent_tool_use_id: parent, message: { content } })
  const resultFrame = (parent: string | null, id: string, content: string) =>
    frame({ type: "user", session_id: "claude-1", parent_tool_use_id: parent,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] } })
  script = [
    agentFrame("a1", null, [{ type: "tool_use", id: "t1", name: "Agent", input: { description: "Fix it", prompt: "go fix", subagent_type: "orchestra:backend" } }]),
    agentFrame("s1", "t1", [{ type: "text", text: "Looking" }, { type: "tool_use", id: "s-read", name: "Read", input: { file_path: "/project/a.ts" } }]),
    resultFrame("t1", "s-read", "a"),
    agentFrame("s2", "t1", [{ type: "text", text: "Fixed" }, { type: "tool_use", id: "s-todo", name: "TodoWrite", input: { todos: [{ content: "Fix", status: "completed", activeForm: "Fixing" }] } }]),
    resultFrame("t1", "s-todo", "Todos have been modified successfully."),
    resultFrame(null, "t1", "Fixed"),
    // After its result, nothing more reaches the child.
    agentFrame("s3", "t1", [{ type: "text", text: "late" }]),
    agentFrame("a2", null, [{ type: "text", text: "Done" }]),
    done,
  ]
  const turn = turnOf({
    seats: [seat("backend")],
    child: (input) =>
      Effect.sync(() => {
        log.push({ child: input })
        return {
          id: SessionSchema.ID.make("ses_child"),
          publish: (event) => Effect.sync(() => void log.push({ mirrored: event })),
          finish: Effect.sync(() => void log.push("finish")),
          todos: (list) => Effect.sync(() => void log.push({ childTodos: list })),
          execute: () => Effect.die("unused"),
        }
      }),
    todos: (list) => Effect.sync(() => void log.push({ parentTodos: list })),
  })
  await Effect.runPromise(
    ClaudeCodeHost.make.pipe(
      Effect.flatMap((host) => Stream.runForEach(host.stream(turn), (event) => Effect.sync(() => void log.push({ parent: event })))),
      Effect.provide(sdk),
      Effect.provideService(ClaudeCodeSDK.Environment, {}),
    ),
  )

  const at = (match: (entry: unknown) => boolean) => log.findIndex(match)
  const parentCall = at((entry) => (entry as { parent?: { type: string } }).parent?.type === "tool-call")
  const opened = at((entry) => typeof entry === "object" && entry !== null && "child" in entry)
  // The task row exists before its child is linked to it.
  expect(parentCall).toBeGreaterThanOrEqual(0)
  expect(opened).toBeGreaterThan(parentCall)
  expect(log[opened]).toEqual({ child: { callID: "t1", agent: "backend", title: "Fix it", prompt: "go fix" } })
  const mirrored = log.flatMap((entry) => (typeof entry === "object" && entry !== null && "mirrored" in entry ? [entry.mirrored as { type: string }] : []))
  expect(mirrored.map((event) => event.type)).toEqual([
    "step-start", "text-start", "text-delta", "text-end", "tool-call", "tool-result", "text-start", "text-delta", "text-end", "tool-call", "tool-result", "step-finish",
  ])
  expect(mirrored.find((event) => event.type === "tool-call")).toMatchObject({ name: "read", providerExecuted: true })
  expect(log.filter((entry) => entry === "finish")).toHaveLength(1)
  // The subagent's checklist is the child's todo list, never the parent's.
  expect(log.filter((entry) => typeof entry === "object" && entry !== null && ("childTodos" in entry || "parentTodos" in entry))).toEqual([
    { childTodos: [{ content: "Fix", status: "completed", priority: "medium" }] },
  ])
  // The parent keeps its own record: the task call and its result, never the subagent's text.
  const parentText = log.flatMap((entry) => {
    const event = (entry as { parent?: { type: string; text?: string } }).parent
    return event?.type === "text-delta" ? [event.text] : []
  })
  expect(parentText).toEqual(["Done"])
})

const seat = (id: string, fields: Partial<AgentV2.Info> = {}) =>
  ({ ...AgentV2.Info.empty(AgentV2.ID.make(id)), mode: "subagent", system: `You are ${id}. Use the task delegation tool.`, ...fields }) as AgentV2.Info

test("Orchestra's seats are Claude Code subagents: the Maestro note names them, the research seat has one per tier", async () => {
  script = [done]
  await collect(turnOf({
    seats: [
      seat("backend", { description: "Backend work.", model: { id: "claude-opus-4", providerID: "anthropic" } as AgentV2.Info["model"] }),
      seat("jimmy", { description: "Research." }),
      seat("docs", { model: { id: "gpt-6", providerID: "openai" } as AgentV2.Info["model"] }),
      // No prompt, no subagent.
      seat("empty", { system: undefined }),
    ],
  }))

  const options = calls.at(-1)?.options
  expect(Object.keys(options?.agents ?? {}).toSorted()).toEqual([
    "orchestra:backend", "orchestra:docs", "orchestra:jimmy-deep", "orchestra:jimmy-focused", "orchestra:jimmy-quick",
  ])
  expect(options?.agents?.["orchestra:backend"]).toEqual({
    description: "Backend work.",
    prompt: "You are backend. Use the Agent delegation tool.",
    model: "claude-opus-4",
  })
  expect(options?.agents?.["orchestra:docs"]).toMatchObject({ description: "Orchestra's `docs` seat.", model: "inherit" })
  expect(options?.agents?.["orchestra:jimmy-quick"]).toMatchObject({
    description: "Research. Research tier quick: up to 24 turns.",
    maxTurns: 24,
    tools: ["Read", "Grep", "Glob", "WebSearch", "Skill"],
  })
  expect(options?.agents?.["orchestra:jimmy-deep"]).toMatchObject({ maxTurns: 96 })
  expect(options?.systemPrompt).toEqual({
    type: "preset",
    preset: "claude_code",
    append: ClaudeHostOptions.append("maestro", {
      "orchestra:backend": "backend",
      "orchestra:jimmy-quick": "jimmy",
      "orchestra:jimmy-focused": "jimmy",
      "orchestra:jimmy-deep": "jimmy",
      "orchestra:docs": "docs",
    }),
  })
})

test("a seat's skills are listed in its subagent prompt by file, for the subagent to read when the task matches", async () => {
  const skill = (name: string, description?: string) => ({
    name,
    description,
    location: AbsolutePath.make(`/skills/${name}/SKILL.md`),
    content: "",
    mtime: 0,
  })
  script = [done]
  await collect(turnOf({
    seats: [seat("backend"), seat("docs")],
    skills: { backend: [skill("backend-api", "Design an HTTP API."), skill("backend-check")], docs: [] },
  }))

  const agents = calls.at(-1)?.options?.agents
  expect(agents?.["orchestra:backend"]?.prompt).toBe(
    [
      "You are backend. Use the Agent delegation tool.",
      [
        "# Skills",
        "Each skill is a procedure for one kind of work. When the task matches one, read its file with the Read tool before you start, then follow it.",
        "- `backend-api`, /skills/backend-api/SKILL.md: Design an HTTP API.",
        "- `backend-check`, /skills/backend-check/SKILL.md",
      ].join("\n"),
    ].join("\n\n"),
  )
  expect(agents?.["orchestra:docs"]?.prompt).toBe("You are docs. Use the Agent delegation tool.")
})

test("an Agent call asks Orchestra's task permission for the seat; a foreground seat is refused in the background", async () => {
  const asked: unknown[] = []
  const decisions: unknown[] = []
  let listed: string[] = []
  during = async (options) => {
    const signal = new AbortController().signal
    decisions.push(await options.canUseTool?.("Agent", { prompt: "go", subagent_type: "orchestra:jimmy-deep" }, { signal, toolUseID: "tu-1", requestId: "r1" }))
    decisions.push(await options.canUseTool?.("Task", { prompt: "go", subagent_type: "general-purpose" }, { signal, toolUseID: "tu-2", requestId: "r2" }))
    decisions.push(await options.canUseTool?.("Agent", { prompt: "go", subagent_type: "orchestra:backend", run_in_background: true }, { signal, toolUseID: "tu-3", requestId: "r3" }))
    decisions.push(await options.canUseTool?.("Agent", { prompt: "go", subagent_type: "orchestra:backend" }, { signal, toolUseID: "tu-4", requestId: "r4" }))
    // Governed dispatch (approved workflows) stays Orchestra's own task tool over MCP.
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
    seats: [seat("backend"), seat("jimmy")],
    tools: [new ToolDefinition({ name: "task", description: "task", inputSchema: { type: "object", properties: {} } })],
    authorize: (input) => Effect.sync(() => asked.push(input)).pipe(Effect.as({})),
  }))

  expect(listed).toEqual(["task"])
  expect(asked).toEqual([
    { callID: "tu-1", tool: "Agent", action: "task", resources: ["jimmy"] },
    { callID: "tu-2", tool: "Task", action: "task", resources: ["general-purpose"] },
    { callID: "tu-4", tool: "Agent", action: "task", resources: ["backend"] },
  ])
  expect(decisions[2]).toEqual({ behavior: "deny", message: "Run `orchestra:backend` in the foreground: its result is needed in this turn." })
  expect(decisions[3]).toMatchObject({ behavior: "allow" })
})

test("a call made inside a seat's subagent is authorized under that seat", async () => {
  const asked: unknown[] = []
  during = async (options) => {
    await options.hooks?.PreToolUse?.[0]?.hooks[0]?.(
      { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, tool_use_id: "tu-1", agent_id: "a1",
        agent_type: "orchestra:backend", session_id: "claude-1", transcript_path: "", cwd: "/project" } as HookInput,
      "tu-1",
      { signal: new AbortController().signal },
    )
  }
  script = [done]
  await collect(turnOf({ seats: [seat("backend")], authorize: (input) => Effect.sync(() => asked.push(input)).pipe(Effect.as({})) }))

  expect(asked).toEqual([
    { callID: "tu-1", tool: "Bash", action: "bash", resources: ["ls"], safety: { tool: "bash", args: { command: "ls" } }, agent: "backend" },
  ])
})

const pre = (options: Options, tool: string, input: Record<string, unknown>, id: string) =>
  options.hooks?.PreToolUse?.[0]?.hooks[0]?.(
    { hook_event_name: "PreToolUse", tool_name: tool, tool_input: input, tool_use_id: id, session_id: "claude-1", transcript_path: "", cwd: "/project" } as HookInput,
    id,
    { signal: new AbortController().signal },
  )
const allowed = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }
const refused = (reason: string) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } })

const agentFrame = (uuid: string, parent: string | null, content: unknown[], model?: string) =>
  frame({ type: "assistant", uuid, session_id: "claude-1", parent_tool_use_id: parent, message: { content, ...(model ? { model } : {}) } })
const resultFrame = (parent: string | null, id: string, content: string) =>
  frame({ type: "user", session_id: "claude-1", parent_tool_use_id: parent, message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] } })
const delegate = (id: string, type: string, extra: Record<string, unknown> = {}) =>
  agentFrame(`a-${id}`, null, [{ type: "tool_use", id, name: "Agent", input: { description: "Fix it", prompt: "go fix", subagent_type: type, ...extra } }])
const childOf = (log: unknown[]): ExecutionHost.Turn["child"] => (input) =>
  Effect.sync(() => {
    log.push({ child: input })
    return {
      id: SessionSchema.ID.make("ses_child"),
      publish: (event) => Effect.sync(() => void log.push({ mirrored: event.type })),
      finish: Effect.sync(() => void log.push("finish")),
      todos: () => Effect.void,
      execute: (call) => Effect.sync(() => void log.push({ executed: call })).pipe(Effect.as({ result: { type: "text" as const, value: "in child" } })),
    }
  })
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("an Orchestra tool called inside a seat's subagent runs in its child Session; any other subagent is refused", async () => {
  const log: unknown[] = []
  const decisions: unknown[] = []
  const results: unknown[] = []
  const served: string[] = []
  const seen: Options[] = []
  pump = async function* (input, options) {
    seen.push(options)
    await input[Symbol.asyncIterator]().next()
    yield delegate("t1", "orchestra:backend")
    yield frame({ type: "system", subtype: "task_started", task_id: "a1", tool_use_id: "t1", description: "Fix it" })
    // Lets the host take both frames before the subagent calls.
    await sleep(20)
    const inside = (agent: string, id: string) =>
      options.hooks?.PreToolUse?.[0]?.hooks[0]?.(
        { hook_event_name: "PreToolUse", tool_name: "mcp__orchestra__echo", tool_input: {}, tool_use_id: id, agent_id: agent,
          agent_type: "orchestra:backend", session_id: "claude-1", transcript_path: "", cwd: "/project" } as HookInput,
        id,
        { signal: new AbortController().signal },
      )
    decisions.push(await inside("a1", "tu-1"))
    decisions.push(await inside("a9", "tu-2"))
    // A tool only the seat holds is served for its subagent, and the main agent is refused it.
    decisions.push(await options.hooks?.PreToolUse?.[0]?.hooks[0]?.(
      { hook_event_name: "PreToolUse", tool_name: "mcp__orchestra__draft", tool_input: {}, tool_use_id: "tu-3",
        session_id: "claude-1", transcript_path: "", cwd: "/project" } as HookInput,
      "tu-3",
      { signal: new AbortController().signal },
    ))
    const server = options.mcpServers?.orchestra as McpSdkServerConfigWithInstance
    const [client, transport] = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transport)
    const mcp = new Client({ name: "test", version: "0" })
    await mcp.connect(client)
    served.push(...(await mcp.listTools()).tools.map((tool) => tool.name))
    results.push(await mcp.callTool({ name: "echo", arguments: {}, _meta: { "claudecode/toolUseId": "tu-1" } }))
    // An id the gate never allowed runs nowhere.
    results.push(await mcp.callTool({ name: "echo", arguments: {}, _meta: { "claudecode/toolUseId": "tu-2" } }))
    await mcp.close()
    yield resultFrame(null, "t1", "Fixed")
    yield done
  }
  try {
    await collect(turnOf({
      seats: [seat("backend")],
      tools: ["task", "echo"].map((name) => new ToolDefinition({ name, description: name, inputSchema: { type: "object", properties: {} } })),
      seatTools: { backend: ["echo", "draft"] },
      seatOnly: [new ToolDefinition({ name: "draft", description: "draft", inputSchema: { type: "object", properties: {} } })],
      child: childOf(log),
      execute: () => Effect.die("the main agent ran a subagent's call"),
      authorize: () => Effect.succeed({}),
    }))
  } finally {
    pump = undefined
  }

  expect(decisions).toEqual([
    allowed,
    refused("Orchestra's tools serve the main agent and Orchestra's seats only."),
    refused("This Orchestra tool belongs to a seat: delegate the work to that seat."),
  ])
  expect(served.sort()).toEqual(["draft", "echo", "task"])
  expect(log).toContainEqual({ executed: { id: "tu-1", name: "echo", input: {} } })
  expect(results[0]).toMatchObject({ content: [{ type: "text", text: "in child" }] })
  expect(results[1]).toMatchObject({ isError: true })
  // Only what the seat may call stays on its tool list.
  expect(seen[0]?.agents?.["orchestra:backend"]?.disallowedTools).toEqual(["mcp__orchestra__task"])
})

test("a built-in subagent type runs as the seat that does its work, on the model that answered in it", async () => {
  const log: unknown[] = []
  script = [
    delegate("t1", "general-purpose"),
    agentFrame("s1", "t1", [{ type: "text", text: "Working" }], "claude-haiku-4"),
    resultFrame(null, "t1", "Done"),
    done,
  ]
  await collect(turnOf({ seats: [seat("general")], child: childOf(log), authorize: () => Effect.succeed({}) }))

  expect(log[0]).toEqual({ child: { callID: "t1", agent: "general", title: "Fix it", prompt: "go fix", model: { id: "claude-haiku-4", providerID: "anthropic" } } })
})

test("a background subagent's child stays open past the turn and ends when its task reports", async () => {
  const log: unknown[] = []
  pump = async function* (input) {
    await input[Symbol.asyncIterator]().next()
    yield delegate("t1", "orchestra:docs", { run_in_background: true })
    yield frame({ type: "system", subtype: "task_started", task_id: "a1", tool_use_id: "t1", description: "Fix it", is_backgrounded: true })
    yield agentFrame("s1", "t1", [{ type: "text", text: "Working" }])
    yield resultFrame(null, "t1", "Async agent launched")
    yield frame({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "a1", task_type: "local_agent", description: "Fix it" }] })
    yield done
    log.push("turn over")
    yield agentFrame("s2", "t1", [{ type: "text", text: "Fixed" }])
    yield frame({ type: "system", subtype: "task_notification", task_id: "a1", tool_use_id: "t1", status: "completed", summary: "fixed", output_file: "/tmp/a1.out" })
  }
  try {
    await collect(turnOf({ seats: [seat("docs")], child: childOf(log), authorize: () => Effect.succeed({}), notify: () => Effect.void }))
    for (let waited = 0; !log.includes("finish") && waited < 100; waited++) await sleep(20)
  } finally {
    pump = undefined
  }

  // The placeholder result neither ends the child nor stops the mirror: the late frames land before it finishes.
  const finished = log.indexOf("finish")
  expect(finished).toBeGreaterThan(log.indexOf("turn over"))
  expect(log.slice(log.indexOf("turn over"), finished)).toEqual(["turn over", { mirrored: "text-start" }, { mirrored: "text-delta" }, { mirrored: "text-end" }, { mirrored: "step-finish" }])
})

test("Claude Code's task list fills the todo panel as Orchestra's todo tool does, across turns; its tool lookup is not recorded", async () => {
  const call = (id: string, name: string, input: Record<string, unknown>) =>
    frame({ type: "assistant", uuid: `a-${id}`, session_id: "claude-1", parent_tool_use_id: null,
      message: { content: [{ type: "tool_use", id, name, input }] } })
  const result = (id: string, content: string, toolUseResult?: unknown) =>
    frame({ type: "user", session_id: "claude-1", parent_tool_use_id: null, tool_use_result: toolUseResult,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] } })
  const stored: { value: unknown } = { value: undefined }
  const state = {
    get: Effect.sync(() => stored.value),
    update: (fn: (value: unknown) => unknown) => Effect.sync(() => void (stored.value = fn(stored.value))),
  }
  const written: unknown[] = []
  const todos = (list: unknown) => Effect.sync(() => void written.push(list))
  script = [
    call("s1", "ToolSearch", { query: "select:TaskCreate,TaskUpdate", max_results: 2 }),
    result("s1", "TaskCreate, TaskUpdate"),
    call("c1", "TaskCreate", { subject: "Plan", description: "Plan it" }),
    result("c1", "Task #1 created successfully: Plan", { task: { id: "1", subject: "Plan" } }),
    call("c2", "TaskCreate", { subject: "Build", description: "Build it" }),
    result("c2", "Task #2 created successfully: Build", { task: { id: "2", subject: "Build" } }),
    call("u1", "TaskUpdate", { taskId: "1", status: "completed" }),
    result("u1", "Updated task #1 status", { success: true, taskId: "1", updatedFields: ["status"] }),
    done,
  ]
  const first = await collect(turnOf({ state, todos }))

  expect(first.some((event) => (event.type === "tool-call" || event.type === "tool-result") && event.id === "s1")).toBe(false)
  expect(first.filter((event) => event.type === "tool-call")).toMatchObject([
    { name: "todowrite", input: { todos: [{ content: "Plan", status: "pending" }] } },
    { name: "todowrite", input: { todos: [{ content: "Plan", status: "pending" }, { content: "Build", status: "pending" }] } },
    { name: "todowrite", input: { todos: [{ content: "Plan", status: "completed" }, { content: "Build", status: "pending" }] } },
  ])
  expect(written.at(-1)).toEqual([
    { content: "Plan", status: "completed", priority: "medium" },
    { content: "Build", status: "pending", priority: "medium" },
  ])

  // The next turn starts from the list the last one left, so an update by id still lands.
  script = [
    call("u2", "TaskUpdate", { taskId: "2", status: "completed" }),
    result("u2", "Updated task #2 status", { success: true, taskId: "2", updatedFields: ["status"] }),
    call("u3", "TaskUpdate", { taskId: "1", status: "deleted" }),
    result("u3", "Updated task #1 deleted", { success: true, taskId: "1", updatedFields: ["deleted"] }),
    done,
  ]
  await collect(turnOf({ state, todos, history: [user("msg_1", "Go"), user("msg_2", "Next")] as unknown as ExecutionHost.Turn["history"] }))
  expect(written.at(-1)).toEqual([{ content: "Build", status: "completed", priority: "medium" }])
})
