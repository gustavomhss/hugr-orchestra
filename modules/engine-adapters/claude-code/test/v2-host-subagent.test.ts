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

// Claude Code subagents as Orchestra's seats, driven like v2-host.test.ts: scripted SDK frames, no Claude Code process.

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
  child: () => Effect.succeed({ id: SessionSchema.ID.make("ses_child"), publish: () => Effect.void, finish: Effect.void, todos: () => Effect.void }),
} satisfies Pick<ExecutionHost.Turn, "question" | "memory" | "steers" | "consumed" | "notify" | "todos" | "child">

const turnOf = (input: Partial<ExecutionHost.Turn> = {}): ExecutionHost.Turn => ({
  session: { id: SessionSchema.ID.make("ses_host"), location: { directory: "/project" } } as unknown as SessionSchema.Info,
  agent: AgentV2.Info.empty(AgentV2.ID.make("maestro")),
  model: undefined,
  system: [],
  context: [],
  seats: [],
  skills: {},
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

test("Orchestra's tools are refused inside a subagent and kept off its tool list", async () => {
  const decisions: unknown[] = []
  during = async (options) => {
    const inside = (tool: string, id: string) =>
      options.hooks?.PreToolUse?.[0]?.hooks[0]?.(
        { hook_event_name: "PreToolUse", tool_name: tool, tool_input: { prompt: "go" }, tool_use_id: id, agent_id: "a1",
          agent_type: "orchestra:backend", session_id: "claude-1", transcript_path: "", cwd: "/project" } as HookInput,
        id,
        { signal: new AbortController().signal },
      )
    decisions.push(await inside("mcp__orchestra__task", "tu-1"))
    decisions.push(await options.canUseTool?.("mcp__orchestra__task", { prompt: "go" }, { signal: new AbortController().signal, toolUseID: "tu-2", requestId: "r2", agentID: "a1" }))
    decisions.push(await pre(options, "mcp__orchestra__task", { prompt: "go" }, "tu-3"))
  }
  script = [done]
  await collect(turnOf({
    seats: [seat("backend")],
    tools: [new ToolDefinition({ name: "task", description: "task", inputSchema: { type: "object", properties: {} } })],
    authorize: () => Effect.succeed({}),
  }))

  expect(decisions).toEqual([
    refused("Orchestra's tools serve the main agent only, not a subagent."),
    { behavior: "deny", message: "Orchestra's tools serve the main agent only, not a subagent." },
    allowed,
  ])
  expect(calls.at(-1)?.options?.agents?.["orchestra:backend"]?.disallowedTools).toEqual(["mcp__orchestra__task"])
})

