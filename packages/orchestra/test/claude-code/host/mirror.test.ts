import { expect, test } from "bun:test"
import { Effect } from "effect"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ClaudeHostMirror } from "@/claude-code/host/mirror"
import { MessageID, SessionID } from "@/session/schema"
import type { Session } from "@/session/session"
import type { SessionStatus } from "@/session/status"
import type { Todo } from "@/session/todo"
import type { Snapshot } from "@/snapshot"
import type { Agent } from "@/agent/agent"

// SDK frames shaped as SDK 0.3.289 types them (sdk.d.ts, sdk-tools.d.ts), mapped onto the parts each widget reads
// (meta-harness 13-ui-inventory.md §5).

const sessionID = SessionID.descending()
const childID = SessionID.descending()
const user = { id: MessageID.ascending(), sessionID, role: "user", time: { created: 1 }, agent: "maestro",
  model: { providerID: "anthropic", modelID: "claude-opus-5-5" } } as SessionV1.User
const agent = { name: "maestro", id: "maestro", mode: "primary", permission: [], options: {}, engine: "claude-code" } as unknown as Agent.Info
const archie = { name: "archie", id: "archie", mode: "subagent", permission: [], options: {} } as unknown as Agent.Info

function setup() {
  const messages = new Map<string, SessionV1.Info>()
  const parts = new Map<string, SessionV1.Part>()
  const todos: unknown[] = []
  const statuses: unknown[] = []
  const state: Record<string, unknown>[] = []
  const sessions = {
    updateMessage: (info: SessionV1.Info) => Effect.sync(() => { messages.set(info.id, info); return info }),
    updatePart: (part: SessionV1.Part) => Effect.sync(() => { parts.set(part.id, part); return part }),
    updatePartDelta: () => Effect.void,
    getPart: (input: { partID: string }) => Effect.sync(() => parts.get(input.partID)),
  } as unknown as Session.Interface
  const snapshot = {
    track: () => Effect.succeed("tree"),
    patch: (hash: string) => Effect.succeed({ hash, files: [] }),
  } as unknown as Snapshot.Interface
  const todo = { update: (input: unknown) => Effect.sync(() => { todos.push(input) }) } as unknown as Todo.Interface
  const status = { set: (_: SessionID, value: unknown) => Effect.sync(() => { statuses.push(value) }) } as unknown as SessionStatus.Interface
  const childUser = { ...user, id: MessageID.ascending(), sessionID: childID, agent: "archie" } as SessionV1.User
  const mirror = ClaudeHostMirror.create({ sessionID, user, agent, path: { cwd: "/repo", root: "/repo" }, sessions, snapshot, todo, status,
    state: (patch) => Effect.sync(() => { state.push(patch) }),
    child: (call) => Effect.sync(() => call.metadata?.sessionId === childID ? { sessionID: childID, user: childUser, agent: archie } : undefined),
  })
  const feed = (list: unknown[]) => Effect.runPromise(Effect.forEach(list as SDKMessage[], (message) => mirror.on(message), { discard: true }))
  const tools = (session = sessionID) => [...parts.values()].filter((part): part is SessionV1.ToolPart => part.type === "tool" && part.sessionID === session)
  return { mirror, feed, messages, parts, todos, statuses, state, sessions, tools, childUser }
}

const base = { parent_tool_use_id: null, session_id: "s" }
const assistant = (id: string, content: unknown[], parent: string | null = null) =>
  ({ ...base, type: "assistant", message: { id, model: "claude-opus-5-5", content, stop_reason: null, usage: {} }, parent_tool_use_id: parent, uuid: `u-${id}` })
const result = (id: string, content: unknown, structured: unknown, error = false, parent: string | null = null) =>
  ({ ...base, type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: error }] },
    parent_tool_use_id: parent, tool_use_result: structured })
const stream = (event: unknown) => ({ ...base, type: "stream_event", event, uuid: "e" })

test("native Bash keeps its exit, truncation and abort facts for the shell and evidence cards", async () => {
  const { feed, tools } = setup()
  await feed([
    assistant("msg_1", [{ type: "tool_use", id: "toolu_ok", name: "Bash", input: { command: "ls" } },
      { type: "tool_use", id: "toolu_bad", name: "Bash", input: { command: "false" } }]),
    result("toolu_ok", "a.txt", { stdout: "a.txt", stderr: "", interrupted: false, persistedOutputPath: "/tmp/out.txt" }),
    result("toolu_bad", "Exit code 2\nboom", { stdout: "", stderr: "boom", interrupted: false }, true),
  ])
  const [ok, bad] = tools()
  expect(ok.tool).toBe("bash")
  if (ok.state.status !== "completed") throw new Error("expected completed")
  expect(ok.state.metadata).toMatchObject({ output: "a.txt", exit: 0, truncated: true, outputPath: "/tmp/out.txt", aborted: false })
  expect(bad.state.status).toBe("error")
})

test("Edit renders as Orchestra's edit card with its diff; Write as the write card", async () => {
  const { feed, tools } = setup()
  await feed([
    assistant("msg_1", [{ type: "tool_use", id: "toolu_e", name: "Edit", input: { file_path: "/repo/a.ts", old_string: "one", new_string: "two" } },
      { type: "tool_use", id: "toolu_w", name: "Write", input: { file_path: "/repo/b.ts", content: "new" } }]),
    result("toolu_e", "ok", { filePath: "/repo/a.ts", oldString: "one", newString: "two", originalFile: "one one", replaceAll: false,
      userModified: false, structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["-one one", "+two one"] }] }),
    result("toolu_w", "ok", { type: "create", filePath: "/repo/b.ts", content: "new", originalFile: null, structuredPatch: [],
      gitDiff: { filename: "b.ts", status: "added", additions: 1, deletions: 0, changes: 1, patch: "+new" } }),
  ])
  const [edit, write] = tools()
  expect(edit.tool).toBe("edit")
  expect(edit.metadata).toMatchObject({ claudeCodeTool: "Edit", providerExecuted: true })
  expect(edit.state.input).toMatchObject({ filePath: "/repo/a.ts", oldString: "one", newString: "two", file_path: "/repo/a.ts" })
  if (edit.state.status !== "completed" || write.state.status !== "completed") throw new Error("expected completed")
  expect(edit.state.metadata?.filediff).toEqual({ file: "/repo/a.ts", before: "one one", after: "two one", additions: 1, deletions: 1 })
  expect(write.tool).toBe("write")
  expect(write.state.metadata).toMatchObject({ filepath: "/repo/b.ts", exists: false, diff: "+new" })
})

test("TodoWrite fills the todo dock and the todowrite card", async () => {
  const { feed, tools, todos } = setup()
  const list = [{ content: "Plan", status: "completed", activeForm: "Planning" }, { content: "Build", status: "in_progress", activeForm: "Building" }]
  await feed([
    assistant("msg_1", [{ type: "tool_use", id: "toolu_t", name: "TodoWrite", input: { todos: list } }]),
    result("toolu_t", "ok", { oldTodos: [], newTodos: list }),
  ])
  const expected = [{ content: "Plan", status: "completed", priority: "medium", activeForm: "Planning" },
    { content: "Build", status: "in_progress", priority: "medium", activeForm: "Building" }]
  const [card] = tools()
  expect(card.tool).toBe("todowrite")
  if (card.state.status !== "completed") throw new Error("expected completed")
  expect(card.state.metadata?.todos).toEqual(expected)
  expect(todos).toEqual([{ sessionID, todos: expected }])
})

test("AskUserQuestion renders as the question card with the owner's answers", async () => {
  const { feed, tools } = setup()
  const questions = [{ question: "Which database?", header: "DB", multiSelect: true,
    options: [{ label: "Postgres", description: "SQL" }, { label: "SQLite", description: "File" }] }]
  await feed([
    assistant("msg_1", [{ type: "tool_use", id: "toolu_q", name: "AskUserQuestion", input: { questions } }]),
    result("toolu_q", "answered", { questions, answers: { "Which database?": "Postgres, SQLite" } }),
  ])
  const [card] = tools()
  expect(card.tool).toBe("question")
  expect(card.state.input).toMatchObject({ questions: [{ question: "Which database?", header: "DB", multiple: true,
    options: [{ label: "Postgres", description: "SQL" }, { label: "SQLite", description: "File" }] }] })
  if (card.state.status !== "completed") throw new Error("expected completed")
  expect(card.state.metadata?.answers).toEqual([["Postgres", "SQLite"]])
})

test("a retry shows the retry row until the next step; compaction writes a divider; rate limits and cost reach the session", async () => {
  const { feed, statuses, messages, parts, state } = setup()
  await feed([
    { ...base, type: "system", subtype: "init", session_id: "claude-1", model: "claude-opus-5-5", claude_code_version: "2.1.289", apiKeySource: "none" },
    { ...base, type: "system", subtype: "api_retry", attempt: 1, max_retries: 10, retry_delay_ms: 2000, error_status: 529, error: "overloaded", uuid: "r" },
    stream({ type: "message_start", message: { id: "msg_1", usage: {} } }),
    { ...base, type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 180000 }, uuid: "c" },
    { ...base, type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", rateLimitType: "five_hour", utilization: 0.9 }, uuid: "l" },
    { ...base, type: "result", subtype: "success", is_error: false, result: "", total_cost_usd: 0.42, num_turns: 1, duration_ms: 1, duration_api_ms: 1,
      stop_reason: "end_turn", usage: {}, permission_denials: [], uuid: "z",
      modelUsage: { "claude-opus-5-5": { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
        webSearchRequests: 0, costUSD: 0.42, contextWindow: 1000000, maxOutputTokens: 64000 } } },
  ])
  expect(statuses).toEqual([expect.objectContaining({ type: "retry", attempt: 1, message: "overloaded (529)" }), { type: "busy" }])
  const divider = [...messages.values()].find((info) => info.role === "user")
  expect(divider?.sessionID).toBe(sessionID)
  expect([...parts.values()].find((part) => part.type === "compaction")).toMatchObject({ messageID: divider?.id, auto: true })
  expect(state).toContainEqual({ sessionId: "claude-1", model: "claude-opus-5-5", version: "2.1.289", apiKeySource: "none" })
  expect(state).toContainEqual({ rateLimit: { status: "allowed_warning", rateLimitType: "five_hour", utilization: 0.9 } })
  expect(state).toContainEqual(expect.objectContaining({ cost: 0.42, contextWindow: 1000000, maxOutputTokens: 64000 }))
})

test("a subagent's frames mirror into its seat session; the Agent card keeps its raw name and the hooks' metadata", async () => {
  const { feed, tools, parts, sessions, messages } = setup()
  await feed([assistant("msg_1", [{ type: "tool_use", id: "toolu_agent", name: "Agent",
    input: { description: "Design", prompt: "Write proposal.md", subagent_type: "orchestra:archie" } }])])
  // The delegation hooks record the dispatch on the call (contract V2 §2) before any child frame.
  const [call] = tools()
  await Effect.runPromise(sessions.updatePart({ ...call, metadata: { ...call.metadata, sessionId: childID, claudeCodeDispatch: { seat: "archie" } } }))
  await feed([
    { ...base, type: "system", subtype: "task_started", task_id: "agent-1", tool_use_id: "toolu_agent", description: "Design",
      subagent_type: "orchestra:archie", uuid: "t1" },
    assistant("msg_c1", [{ type: "tool_use", id: "toolu_read", name: "Read", input: { file_path: "/repo/x.ts" } }], "toolu_agent"),
    result("toolu_read", "file", { type: "text", file: {} }, false, "toolu_agent"),
    { ...base, type: "system", subtype: "task_progress", task_id: "agent-1", tool_use_id: "toolu_agent", description: "Design",
      usage: { total_tokens: 900, tool_uses: 1, duration_ms: 50 }, last_tool_name: "Read", summary: "Reading the module", uuid: "t2" },
    assistant("msg_c2", [{ type: "text", text: "Proposal written." }], "toolu_agent"),
    result("toolu_agent", "Proposal written.", { status: "completed", agentId: "agent-1", content: [], totalToolUseCount: 1,
      totalDurationMs: 50, totalTokens: 900, usage: {}, prompt: "Write proposal.md" }),
  ])
  const card = tools().find((part) => part.callID === "toolu_agent")!
  expect(card.tool).toBe("Agent")
  expect(card.state.status).toBe("completed")
  expect(card.metadata).toMatchObject({ providerExecuted: true, claudeCodeTool: "Agent", sessionId: childID, claudeCodeDispatch: { seat: "archie" },
    claudeCodeTask: { taskID: "agent-1", status: "running", summary: "Reading the module", lastTool: "Read" } })
  if (card.state.status !== "completed") throw new Error("expected completed")
  expect(card.state.metadata?.claudeCodeAgent).toMatchObject({ agentId: "agent-1", status: "completed", totalTokens: 900 })
  const child = tools(childID)
  expect(child.map((part) => [part.tool, part.state.status])).toEqual([["read", "completed"]])
  const childReplies = [...messages.values()].filter((info): info is SessionV1.Assistant => info.role === "assistant" && info.sessionID === childID)
  expect(childReplies.map((info) => info.agent)).toEqual(["archie", "archie"])
  expect(childReplies.every((info) => info.time.completed !== undefined)).toBe(true)
  expect([...parts.values()].some((part) => part.type === "text" && part.sessionID === childID && part.text === "Proposal written.")).toBe(true)
  // Nothing from the subagent landed on Maestro's session.
  expect(tools().map((part) => part.callID)).toEqual(["toolu_agent"])
})

test("a background subagent reports after its turn ended: the earlier turn's card and child session still get it", async () => {
  const first = setup()
  const known = { calls: new Map<string, ClaudeHostMirror.Mirror>(), tasks: new Map<string, string>() }
  const make = (turnUser: SessionV1.User) => ClaudeHostMirror.create({ sessionID, user: turnUser, agent, path: { cwd: "/repo", root: "/repo" },
    sessions: first.sessions, snapshot: { track: () => Effect.succeed("tree"), patch: (hash: string) => Effect.succeed({ hash, files: [] }) } as unknown as Snapshot.Interface,
    todo: { update: () => Effect.void } as unknown as Todo.Interface, status: { set: () => Effect.void } as unknown as SessionStatus.Interface, known,
    child: (call) => Effect.sync(() => call.metadata?.sessionId === childID ? { sessionID: childID, user: first.childUser, agent: archie } : undefined) })
  const dispatching = make(user)
  const feed = (mirror: ClaudeHostMirror.Mirror, list: unknown[]) =>
    Effect.runPromise(Effect.forEach(list as SDKMessage[], (message) => mirror.on(message), { discard: true }))
  await feed(dispatching, [assistant("msg_1", [{ type: "tool_use", id: "toolu_bg", name: "Agent",
    input: { description: "bg", prompt: "go", subagent_type: "orchestra:jimmy", run_in_background: true } }])])
  const [call] = first.tools()
  await Effect.runPromise(first.sessions.updatePart({ ...call, metadata: { ...call.metadata, sessionId: childID } }))
  await feed(dispatching, [
    { ...base, type: "system", subtype: "task_started", task_id: "agent-bg", tool_use_id: "toolu_bg", description: "bg", is_backgrounded: true, uuid: "t" },
    result("toolu_bg", "Async agent launched", { status: "async_launched", agentId: "agent-bg", description: "bg", prompt: "go", outputFile: "/tmp/o" }),
  ])
  await Effect.runPromise(dispatching.finish(0))
  // Claude Code's own next turn: the child's frames and the notification reach the dispatching turn's mirror.
  const later = make(user)
  await feed(later, [
    assistant("msg_c", [{ type: "text", text: "BG-RESULT" }], "toolu_bg"),
    { ...base, type: "system", subtype: "task_updated", task_id: "agent-bg", patch: { status: "completed" }, uuid: "u1" },
    { ...base, type: "system", subtype: "task_notification", task_id: "agent-bg", tool_use_id: "toolu_bg", status: "completed",
      output_file: "/tmp/o", summary: "BG-RESULT", uuid: "u2" },
  ])
  const card = first.tools().find((part) => part.callID === "toolu_bg")!
  expect(card.metadata).toMatchObject({ sessionId: childID, claudeCodeTask: { taskID: "agent-bg", status: "completed", summary: "BG-RESULT", background: true } })
  const reply = [...first.messages.values()].find((info): info is SessionV1.Assistant => info.role === "assistant" && info.sessionID === childID)
  expect(reply?.time.completed).toBeDefined()
  expect([...first.parts.values()].some((part) => part.type === "text" && part.sessionID === childID && part.text === "BG-RESULT")).toBe(true)
})

test("an Agent call without a delegation record keeps only its card", async () => {
  const { feed, tools } = setup()
  await feed([
    assistant("msg_1", [{ type: "tool_use", id: "toolu_agent", name: "Agent", input: { description: "x", prompt: "y", subagent_type: "orchestra:jimmy" } }]),
    assistant("msg_c1", [{ type: "text", text: "child text" }], "toolu_agent"),
  ])
  expect(tools().map((part) => part.callID)).toEqual(["toolu_agent"])
  expect(tools(childID)).toEqual([])
})

test("a steer Claude Code reads mid-turn: the next step answers the steering message", async () => {
  const { mirror, feed, messages } = setup()
  const steer = { ...user, id: MessageID.ascending(), time: { created: 2 } } as SessionV1.User
  await feed([stream({ type: "message_start", message: { id: "msg_1", usage: {} } }), assistant("msg_1", [{ type: "text", text: "Working." }])])
  await Effect.runPromise(mirror.steer(steer))
  expect(mirror.pending()).toBe(steer)
  await feed([stream({ type: "message_start", message: { id: "msg_2", usage: {} } }), assistant("msg_2", [{ type: "text", text: "Adjusted." }])])
  await Effect.runPromise(mirror.finish(0))
  expect(mirror.pending()).toBeUndefined()
  const replies = [...messages.values()].filter((info): info is SessionV1.Assistant => info.role === "assistant")
  expect(replies.map((info) => info.parentID)).toEqual([user.id, steer.id])
  expect(replies.every((info) => info.time.completed !== undefined)).toBe(true)
})

test("tool names and inputs map to the cards Orchestra renders", () => {
  expect(["Bash", "Read", "Edit", "Write", "TodoWrite", "AskUserQuestion", "Skill", "Agent", "mcp__orchestra__process"].map(ClaudeHostMirror.toolName))
    .toEqual(["bash", "read", "edit", "write", "todowrite", "question", "skill", "Agent", "mcp__orchestra__process"])
  expect(ClaudeHostMirror.toolInput("Skill", { skill: "release" })).toEqual({ skill: "release", name: "release" })
  expect(ClaudeHostMirror.toolMetadata("Grep", { numFiles: 3, numMatches: 7, filenames: [] }, "", false)).toEqual({ matches: 7 })
  expect(ClaudeHostMirror.toolMetadata("Glob", { numFiles: 2, filenames: [], truncated: false, durationMs: 1 }, "", false)).toEqual({ count: 2, truncated: false })
})
