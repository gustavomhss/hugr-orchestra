import { expect, test } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import type { ModelUsage, SDKAssistantMessage, SDKMessage, SDKPartialAssistantMessage, SDKResultSuccess, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import type { AgentOutput, TaskCreateOutput, TaskGetOutput, TaskListOutput, TaskUpdateOutput } from "@anthropic-ai/claude-agent-sdk/sdk-tools"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelsDev } from "@orchestra/core/models-dev"
import { ClaudeHostMirror } from "@/claude-code/host/mirror"
import { ClaudeHostJoin } from "@/claude-code/host/join"
import { ClaudeHostDelegation } from "@/claude-code/host/delegation"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { Todo } from "@/session/todo"
import { Snapshot } from "@/snapshot"
import { Provider } from "@/provider/provider"
import { TestInstance } from "../../fixture/fixture"
import { awaitWithTimeout, testEffect } from "../../lib/effect"
import { makeHttp } from "../../session/prompt.fixture"

const it = testEffect(makeHttp())
const base = { parent_tool_use_id: null, session_id: "sdk-mirror", uuid: crypto.randomUUID() }
const requested = "claude-haiku-4-5-20251001"
const usage: SDKAssistantMessage["message"]["usage"] = { input_tokens: 10, output_tokens: 20,
  cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null, server_tool_use: null, service_tier: null }
const assistant = (id: string, content: SDKAssistantMessage["message"]["content"], parent: string | null = null,
  model = requested): SDKAssistantMessage => ({ ...base, type: "assistant", parent_tool_use_id: parent, uuid: crypto.randomUUID(),
  message: { id, model, content, role: "assistant", type: "message", container: null, context_management: null,
    stop_reason: "end_turn", stop_sequence: null, usage } })
const result = (id: string, content: string, structured: unknown, error = false, parent: string | null = null): SDKUserMessage =>
  ({ ...base, type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content, is_error: error }] },
    parent_tool_use_id: parent, tool_use_result: structured })
const stream = (message: SDKAssistantMessage): SDKPartialAssistantMessage => ({ ...base, type: "stream_event",
  event: { type: "message_start", message: { ...message.message, content: [], stop_reason: null } } })
const finish = (modelUsage: Record<string, ModelUsage> = {}, cost = 0): SDKResultSuccess => ({ ...base,
  type: "result", subtype: "success", is_error: false, result: "", total_cost_usd: cost, num_turns: 1,
  duration_ms: 1, duration_api_ms: 1, stop_reason: "end_turn", permission_denials: [], modelUsage,
  usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
    server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 }, service_tier: "standard" } })

const setup = (beforeSave: (part: SessionV1.Part) => Effect.Effect<void> = () => Effect.void) => Effect.gen(function* () {
  const instance = yield* TestInstance
  const service = yield* Session.Service
  const sessions = { ...service, updatePart: <T extends SessionV1.Part>(part: T) => beforeSave(part).pipe(Effect.andThen(service.updatePart(part))) }
  const snapshot = yield* Snapshot.Service
  const todo = yield* Todo.Service
  const status = yield* SessionStatus.Service
  const provider = yield* Provider.Service
  const catalog = yield* ModelsDev.Service
  const agents = yield* Agent.Service
  const agent = yield* agents.get("maestro")
  const archie = yield* agents.get("archie")
  const lucy = yield* agents.get("lucy")
  const chat = yield* sessions.create({ title: "Mirror" })
  const child = yield* sessions.create({ parentID: chat.id, title: "Child", agent: "archie" })
  const verifier = yield* sessions.create({ parentID: child.id, title: "Verifier", agent: "lucy" })
  const makeUser = (sessionID: SessionID, seat: string): SessionV1.User => ({ id: MessageID.ascending(), sessionID,
    role: "user", agent: seat, time: { created: Date.now() },
    model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make(requested) } })
  const user = yield* sessions.updateMessage(makeUser(chat.id, "maestro"))
  const childUser = yield* sessions.updateMessage(makeUser(child.id, "archie"))
  const verifierUser = yield* sessions.updateMessage(makeUser(verifier.id, "lucy"))
  const known = { calls: new Map<string, ClaudeHostMirror.Mirror>(), tasks: new Map<string, string>() }
  const join = ClaudeHostJoin.make()
  const make = (user: SessionV1.User) => ClaudeHostMirror.create({ sessionID: chat.id, user, agent,
    path: { cwd: instance.directory, root: instance.directory }, sessions, snapshot, todo, status, provider, catalog, known,
    notification: join.notification,
    state: (patch) => Effect.gen(function* () {
      const latest = yield* sessions.get(chat.id).pipe(Effect.orDie)
      yield* sessions.setMetadata({ sessionID: chat.id, metadata: { ...latest.metadata,
        claudeCode: { ...(latest.metadata?.claudeCode ?? {}), ...patch } } })
    }),
    child: (call) => Effect.gen(function* () {
      const saved = yield* sessions.getPart({ sessionID: call.sessionID, messageID: call.messageID, partID: call.id })
      if (saved?.type !== "tool") return
      if (saved.metadata?.sessionId === child.id) return { sessionID: child.id, user: childUser, agent: archie }
      if (saved.metadata?.sessionId === verifier.id) return { sessionID: verifier.id, user: verifierUser, agent: lucy }
      if (typeof saved.metadata?.sessionId !== "string") return
      const session = yield* sessions.get(SessionID.make(saved.metadata.sessionId)).pipe(Effect.orDie)
      const user = (yield* sessions.messages({ sessionID: session.id }).pipe(Effect.orDie)).find((item) => item.info.role === "user")?.info
      if (user?.role !== "user" || !session.agent) return
      return { sessionID: session.id, user, agent: yield* agents.get(session.agent) }
    }),
  })
  const mirror = make(user)
  const feed = (frames: SDKMessage[], view = mirror) => Effect.forEach(frames, (message) => {
    if (message.type === "system" && message.subtype === "task_started")
      join.taskStarted({ toolUseID: message.tool_use_id, taskID: message.task_id })
    return view.on(message)
  }, { discard: true })
  const read = (sessionID = chat.id) => sessions.messages({ sessionID }).pipe(Effect.orDie)
  const tools = (sessionID = chat.id) => read(sessionID).pipe(Effect.map((messages) => messages.flatMap((item) => item.parts)
    .filter((part): part is SessionV1.ToolPart => part.type === "tool")))
  const steer = () => sessions.updateMessage(makeUser(chat.id, "maestro"))
  return { mirror, make, feed, tools, read, sessions, todo, status, provider, user, steer, join,
    sessionID: chat.id, childID: child.id, verifierID: verifier.id }
})

it.instance("Bash errors retain exit, timeout, interruption and persisted output evidence", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.feed([
    assistant("bash", [
      { type: "tool_use", id: "ok", name: "Bash", input: { command: "ls" } },
      { type: "tool_use", id: "bad", name: "Bash", input: { command: "false" } },
      { type: "tool_use", id: "timeout", name: "Bash", input: { command: "sleep 20" } },
    ]),
    result("ok", "a.txt", { stdout: "a.txt", stderr: "", interrupted: false, persistedOutputPath: "/tmp/out.txt" }),
    result("bad", "Exit code 2\nboom", { stdout: "", stderr: "boom", interrupted: false }, true),
    result("timeout", "Exit code 137\ninterrupted", { interrupted: true, timedOutAfterMs: 1000, persistedOutputPath: "/tmp/error.txt" }, true),
  ])
  const [ok, bad, timeout] = yield* ctx.tools()
  expect(ok.tool).toBe("bash")
  if (ok.state.status !== "completed" || bad.state.status !== "error" || timeout.state.status !== "error")
    throw new Error("Expected successful and failed Bash calls")
  expect(ok.state.metadata).toMatchObject({ output: "a.txt", exit: 0, truncated: true, outputPath: "/tmp/out.txt", aborted: false })
  expect(bad.state.metadata).toMatchObject({ output: "Exit code 2\nboom", exit: 2, timeout: false, aborted: false })
  expect(timeout.state.metadata).toMatchObject({ exit: 137, timeout: true, aborted: true, truncated: true, outputPath: "/tmp/error.txt" })
}))

it.instance("Edit and Write persist the diff and paths read by their cards", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.feed([
    assistant("edit", [
      { type: "tool_use", id: "e", name: "Edit", input: { file_path: "/repo/a.ts", old_string: "one", new_string: "two" } },
      { type: "tool_use", id: "w", name: "Write", input: { file_path: "/repo/b.ts", content: "new" } },
    ]),
    result("e", "ok", { filePath: "/repo/a.ts", oldString: "one", newString: "two", originalFile: "one one", replaceAll: false,
      structuredPatch: [{ lines: ["-one one", "+two one"] }] }),
    result("w", "ok", { filePath: "/repo/b.ts", content: "new", originalFile: null, gitDiff: { additions: 1, deletions: 0, patch: "+new" } }),
  ])
  const [edit, write] = yield* ctx.tools()
  expect(edit.tool).toBe("edit")
  expect(edit.state.input).toMatchObject({ filePath: "/repo/a.ts", oldString: "one", newString: "two" })
  if (edit.state.status !== "completed" || write.state.status !== "completed") throw new Error("Expected completed edits")
  expect(edit.state.metadata?.filediff).toEqual({ file: "/repo/a.ts", before: "one one", after: "two one", additions: 1, deletions: 1 })
  expect(write.tool).toBe("write")
  expect(write.state.metadata).toMatchObject({ filepath: "/repo/b.ts", exists: false, diff: "+new" })
}))

it.instance("native Read, Glob, Grep and Bash retain their existing card names", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.feed([
    assistant("search", [
      { type: "tool_use", id: "read-card", name: "Read", input: { file_path: "/repo/sample.txt" } },
      { type: "tool_use", id: "glob-card", name: "Glob", input: { pattern: "*.txt" } },
      { type: "tool_use", id: "grep-card", name: "Grep", input: { pattern: "sample" } },
      { type: "tool_use", id: "bash-card", name: "Bash", input: { command: "grep sample sample.txt" } },
    ]),
    result("read-card", "sample", { type: "text", file: { filePath: "/repo/sample.txt", content: "sample" } }),
    result("glob-card", "sample.txt", { numFiles: 1, truncated: false }),
    result("grep-card", "sample", { numMatches: 1 }),
    result("bash-card", "sample", { stdout: "sample", stderr: "", interrupted: false }),
  ])
  const cards = yield* ctx.tools()
  expect(cards.map((part) => part.tool)).toEqual(["read", "glob", "grep", "bash"])
  expect(cards[0].state.input.filePath).toBe("/repo/sample.txt")
  const completed = cards.map((part) => part.state).filter((state) => state.status === "completed")
  expect(completed).toHaveLength(4)
  expect(completed[1].metadata).toMatchObject({ count: 1, truncated: false })
  expect(completed[2].metadata).toMatchObject({ matches: 1 })
  expect(completed[3].metadata).toMatchObject({ exit: 0 })
}))

it.instance("TodoWrite updates real todos; AskUserQuestion persists the owner's answers", () => Effect.gen(function* () {
  const ctx = yield* setup()
  const todos = [{ content: "Plan", status: "completed", activeForm: "Planning" }, { content: "Build", status: "in_progress" }]
  const questions = [{ question: "Which database?", header: "DB", multiSelect: true,
    options: [{ label: "Postgres", description: "SQL" }, { label: "SQLite", description: "File" }] }]
  yield* ctx.feed([
    assistant("docks", [{ type: "tool_use", id: "t", name: "TodoWrite", input: { todos } },
      { type: "tool_use", id: "q", name: "AskUserQuestion", input: { questions } }]),
    result("t", "ok", { oldTodos: [], newTodos: todos }),
    result("q", "answered", { questions, answers: { "Which database?": "Postgres, SQLite" } }),
  ])
  expect(yield* ctx.todo.get(ctx.sessionID)).toEqual([
    { content: "Plan", status: "completed", priority: "medium" }, { content: "Build", status: "in_progress", priority: "medium" },
  ])
  const [todo, question] = yield* ctx.tools()
  expect(todo.tool).toBe("todowrite")
  expect(question.tool).toBe("question")
  expect(question.state.input).toMatchObject({ questions: [{ question: "Which database?", multiple: true }] })
  if (question.state.status !== "completed") throw new Error("Expected answered question")
  expect(question.state.metadata?.answers).toEqual([["Postgres", "SQLite"]])
}))

it.instance("native tasks update real todos across mirrors and restart, without accepting failed updates", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.feed([
    assistant("create", [{ type: "tool_use", id: "create", name: "TaskCreate",
      input: { subject: "Inspect", description: "Read the file", activeForm: "Inspecting" } }]),
    result("create", "Task #1 created", { task: { id: "1", subject: "Inspect" } } satisfies TaskCreateOutput),
  ])
  expect(yield* ctx.todo.get(ctx.sessionID)).toEqual([{ content: "Inspect", status: "pending", priority: "medium" }])
  const next = ctx.make(yield* ctx.steer())
  yield* ctx.feed([
    assistant("update", [{ type: "tool_use", id: "update", name: "TaskUpdate", input: { taskId: "1", status: "in_progress" } }]),
    result("update", "updated", { success: true, taskId: "1", updatedFields: ["status"], statusChange: { from: "pending", to: "in_progress" } } satisfies TaskUpdateOutput),
    assistant("failed", [{ type: "tool_use", id: "failed", name: "TaskUpdate", input: { taskId: "1", status: "completed" } }]),
    result("failed", "not updated", { success: false, taskId: "1", updatedFields: [], error: "failed" } satisfies TaskUpdateOutput),
  ], next)
  expect(yield* ctx.todo.get(ctx.sessionID)).toEqual([{ content: "Inspect", status: "in_progress", priority: "medium" }])
  // A fresh mirror with no shared call/task maps stands in for a new process reading the durable metadata.
  const agents = yield* Agent.Service
  const restored = ClaudeHostMirror.create({ sessionID: ctx.sessionID, user: yield* ctx.steer(),
    agent: (yield* agents.get("maestro"))!,
    path: { cwd: "/repo", root: "/repo" }, sessions: ctx.sessions,
    snapshot: yield* Snapshot.Service, todo: ctx.todo, status: ctx.status })
  yield* ctx.feed([
    assistant("done", [{ type: "tool_use", id: "done", name: "TaskUpdate", input: { taskId: "1", status: "completed", subject: "Inspected" } }]),
    result("done", "updated", { success: true, taskId: "1", updatedFields: ["status", "subject"] } satisfies TaskUpdateOutput),
  ], restored)
  expect(yield* ctx.todo.get(ctx.sessionID)).toEqual([{ content: "Inspected", status: "completed", priority: "medium" }])
  expect(yield* ctx.todo.get(ctx.childID)).toEqual([])
  const cards = yield* ctx.tools()
  expect(cards.map((part) => part.tool)).toEqual(["todowrite", "todowrite", "todowrite", "todowrite"])
  const last = cards.at(-1)
  if (last?.state.status !== "completed") throw new Error("TaskUpdate card did not complete")
  expect(last.state.input.todos).toMatchObject([{ content: "Inspected", status: "completed" }])
  expect(last.state.metadata.todos).toMatchObject([{ content: "Inspected", status: "completed" }])
  yield* ctx.feed([
    assistant("list", [{ type: "tool_use", id: "list", name: "TaskList", input: {} }]),
    result("list", "tasks", { tasks: [{ id: "2", subject: "Build", status: "pending", blockedBy: [] }] } satisfies TaskListOutput),
    assistant("get", [{ type: "tool_use", id: "get", name: "TaskGet", input: { taskId: "2" } }]),
    result("get", "task", { task: { id: "2", subject: "Build now", status: "in_progress", description: "", blocks: [], blockedBy: [] } } satisfies TaskGetOutput),
    assistant("delete", [{ type: "tool_use", id: "delete", name: "TaskUpdate", input: { taskId: "2", status: "deleted" } }]),
    result("delete", "deleted", { success: true, taskId: "2", updatedFields: ["status"] } satisfies TaskUpdateOutput),
  ], restored)
  expect(yield* ctx.todo.get(ctx.sessionID)).toEqual([])
}))

it.instance("parent and child native tasks with the same ID remain independent", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.feed([assistant("dispatch", [{ type: "tool_use", id: "child", name: "Agent", input: {} }])])
  const [call] = yield* ctx.tools()
  yield* ctx.sessions.updatePart({ ...call, metadata: { ...call.metadata, sessionId: ctx.childID } })
  yield* ctx.feed([
    // A parent can continue only after Claude Code's real launch receipt closes its Agent call.
    result("child", "launched", { status: "async_launched", agentId: "task-child", description: "child",
      prompt: "Child tasks", outputFile: "/tmp/child" } satisfies AgentOutput),
    assistant("parent-task", [{ type: "tool_use", id: "parent-create", name: "TaskCreate", input: { subject: "Parent", description: "" } }]),
    result("parent-create", "created", { task: { id: "1", subject: "Parent" } } satisfies TaskCreateOutput),
    assistant("child-task", [{ type: "tool_use", id: "child-create", name: "TaskCreate", input: { subject: "Child", description: "" } }], "child"),
    result("child-create", "created", { task: { id: "1", subject: "Child" } } satisfies TaskCreateOutput, false, "child"),
    assistant("child-done", [{ type: "tool_use", id: "child-update", name: "TaskUpdate", input: { taskId: "1", status: "completed" } }], "child"),
    result("child-update", "updated", { success: true, taskId: "1", updatedFields: ["status"] } satisfies TaskUpdateOutput, false, "child"),
  ])
  expect(yield* ctx.todo.get(ctx.sessionID)).toEqual([{ content: "Parent", status: "pending", priority: "medium" }])
  expect(yield* ctx.todo.get(ctx.childID)).toEqual([{ content: "Child", status: "completed", priority: "medium" }])
}))

it.instance("retry, compaction and rate limits reach real status, parts and metadata", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.feed([{ ...base, type: "system", subtype: "api_retry", attempt: 1, max_retries: 10,
    retry_delay_ms: 2000, error_status: 529, error: "overloaded" }])
  expect(yield* ctx.status.get(ctx.sessionID)).toMatchObject({ type: "retry", attempt: 1, message: "overloaded (529)" })
  yield* ctx.feed([
    stream(assistant("retry", [])),
    { ...base, type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 180000 } },
    { ...base, type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", rateLimitType: "five_hour", utilization: 0.9 } },
  ])
  expect(yield* ctx.status.get(ctx.sessionID)).toEqual({ type: "busy" })
  expect((yield* ctx.read()).flatMap((item) => item.parts).find((part) => part.type === "compaction")).toMatchObject({ auto: true })
  expect((yield* ctx.sessions.get(ctx.sessionID)).metadata?.claudeCode).toMatchObject({ rateLimit: { status: "allowed_warning", utilization: 0.9 } })
}))

it.instance("a new API step cannot consume a steer; only its SDK UUID receipt can", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.mirror.sent(ctx.user, "initial")
  yield* ctx.feed([{ ...assistant("one", [{ type: "text", text: "Working", citations: null }]), user_message_uuid: "initial" }])
  const steer = yield* ctx.steer()
  yield* ctx.mirror.sent(steer, "steer")
  yield* ctx.feed([assistant("already-generated", [{ type: "text", text: "Still working", citations: null }])])
  expect(ctx.mirror.pending()?.id).toBe(steer.id)
  expect(ctx.mirror.current()?.parentID).toBe(ctx.user.id)
  yield* ctx.feed([{ ...stream(assistant("adjusted", [])), user_message_uuids: ["initial", "steer"], user_message_uuid: "steer" },
    assistant("adjusted", [{ type: "text", text: "Adjusted", citations: null }])])
  yield* ctx.mirror.finish(0)
  expect(ctx.mirror.pending()).toBeUndefined()
  expect(ctx.mirror.consumed().map((user) => user.id)).toEqual([ctx.user.id, steer.id])
  const replies = (yield* ctx.read()).flatMap((item) => item.info.role === "assistant" ? [item.info] : [])
  expect(replies.map((info) => info.parentID)).toEqual([ctx.user.id, ctx.user.id, steer.id])
  expect(replies.every((info) => info.time.completed !== undefined)).toBe(true)
}))

it.instance("batched and delayed receipts reconcile every sent UUID without guessing", () => Effect.gen(function* () {
  const ctx = yield* setup()
  const first = yield* ctx.steer()
  const second = yield* ctx.steer()
  yield* ctx.mirror.sent(first, "first")
  yield* ctx.mirror.sent(second, "second")
  yield* ctx.feed([stream(assistant("batch", []))])
  expect(ctx.mirror.pendingInputs().map((send) => send.user.id)).toEqual([first.id, second.id])
  yield* ctx.feed([{ ...assistant("batch", [{ type: "text", text: "Batched", citations: null }]),
    user_message_uuid: "second", user_message_uuids: ["unknown", "first", "second"] }])
  expect(ctx.mirror.current()?.parentID).toBe(second.id)
  expect(ctx.mirror.pendingInputs()).toEqual([])
  yield* ctx.feed([assistant("after-batch", [{ type: "text", text: "Still answering the batch", citations: null }])])
  expect(ctx.mirror.current()?.parentID).toBe(second.id)
  const third = yield* ctx.steer()
  yield* ctx.mirror.sent(third, "third")
  yield* ctx.feed([{ ...finish(), user_message_uuid: "third" }])
  expect(ctx.mirror.consumed().map((user) => user.id)).toEqual([first.id, second.id, third.id])
  expect(ctx.mirror.current()?.parentID).toBe(second.id)
}))

it.instance("actual fallback model, thinking tokens and context limits reach the fields the UI reads", () => Effect.gen(function* () {
  const ctx = yield* setup()
  const fallback = "claude-sonnet-4-5-20250929"
  const model = { canonicalModel: fallback, inputTokens: 10, outputTokens: 20, thinkingTokens: 7, cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0.42, contextWindow: 500000, maxOutputTokens: 32000 }
  const first = assistant("fallback", [{ type: "text", text: "Fallback", citations: null }], null, fallback)
  first.message.usage = Object.assign({}, usage, { output_tokens_details: { thinking_tokens: 7 } })
  yield* ctx.feed([stream(first), first, finish({ "sdk-fallback-alias": model }, 0.42)])
  yield* ctx.mirror.finish(0)
  const reply = (yield* ctx.read()).find((item) => item.info.role === "assistant")
  expect(ctx.user.model.modelID).toBe(ModelV2.ID.make(requested))
  expect(reply?.info).toMatchObject({ modelID: fallback, tokens: { input: 10, output: 13, reasoning: 7 }, cost: 0.42 })
  expect(reply?.parts.find((part) => part.type === "step-finish")).toMatchObject({ tokens: { output: 13, reasoning: 7 } })
  expect((yield* ctx.provider.list())[ctx.user.model.providerID].models[fallback].limit).toMatchObject({ context: 500000, output: 32000 })
  const next = ctx.make(yield* ctx.steer())
  const second = assistant("next", [{ type: "text", text: "Next", citations: null }], null, fallback)
  second.message.usage = Object.assign({}, usage, { output_tokens_details: { thinking_tokens: 3 } })
  yield* ctx.feed([second,
    finish({ "sdk-fallback-alias": { ...model, thinkingTokens: 10, outputTokens: 40 } }, 0.5)], next)
  yield* next.finish(0.42)
  expect((yield* ctx.read()).findLast((item) => item.info.role === "assistant")?.info).toMatchObject({ tokens: { output: 17, reasoning: 3 }, cost: 0.5 - 0.42 })
  expect((yield* ctx.sessions.get(ctx.sessionID)).metadata?.claudeCode).toMatchObject({ cost: 0.5, modelUsage: {
    "sdk-fallback-alias": { thinkingTokens: 10, outputTokens: 40, canonicalModel: fallback },
  } })
}))

it.instance("nested children share the call map and cannot consume a root steer", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.feed([assistant("root", [{ type: "tool_use", id: "agent", name: "Agent", input: { subagent_type: "orchestra:archie" } }])])
  const [call] = yield* ctx.tools()
  yield* ctx.sessions.updatePart({ ...call, metadata: { ...call.metadata, sessionId: ctx.childID, claudeCodeDispatch: { seat: "archie" } } })
  const steer = yield* ctx.steer()
  yield* ctx.mirror.sent(steer, "root-steer")
  yield* ctx.feed([
    { ...assistant("child", [{ type: "tool_use", id: "nested", name: "Agent", input: { subagent_type: "general-purpose" } }], "agent"),
      user_message_uuid: "root-steer" },
  ])
  const [nested] = yield* ctx.tools(ctx.childID)
  expect(ctx.mirror.author("agent")).toBeUndefined()
  yield* ctx.sessions.updatePart({ ...nested, metadata: { ...nested.metadata, sessionId: ctx.verifierID } })
  yield* ctx.feed([
    assistant("verifier", [{ type: "text", text: "Verified", citations: null }], "nested"),
    result("nested", "nested done", { status: "completed" }, false, "agent"),
    result("agent", "child done", { status: "completed", agentId: "a1", totalTokens: 900 }),
  ])
  expect(ctx.mirror.pending()?.id).toBe(steer.id)
  expect((yield* ctx.tools(ctx.childID)).map((part) => part.callID)).toEqual(["nested"])
  expect((yield* ctx.read(ctx.verifierID)).flatMap((item) => item.parts).some((part) => part.type === "text" && part.text === "Verified")).toBe(true)
  expect((yield* ctx.read()).flatMap((item) => item.parts).some((part) => part.type === "text" && part.text === "Verified")).toBe(false)
  const [card] = yield* ctx.tools()
  expect(card.tool).toBe("Agent")
  expect(card.metadata).toMatchObject({ providerExecuted: true, sessionId: ctx.childID, claudeCodeDispatch: { seat: "archie" } })
}))

it.instance("background child completions route through an earlier mirror after its turn ends", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.feed([assistant("dispatch", [{ type: "tool_use", id: "bg", name: "Agent", input: { run_in_background: true } }])])
  const [call] = yield* ctx.tools()
  yield* ctx.sessions.updatePart({ ...call, metadata: { ...call.metadata, sessionId: ctx.childID } })
  yield* ctx.feed([
    { ...base, type: "system", subtype: "task_started", task_id: "task-bg", tool_use_id: "bg", description: "background",
      is_backgrounded: true, task_type: "local_agent" },
    result("bg", "launched", { status: "async_launched", agentId: "task-bg" }),
  ])
  yield* ctx.mirror.finish(0)
  const later = ctx.make(yield* ctx.steer())
  yield* ctx.feed([
    assistant("bg-call", [{ type: "tool_use", id: "late", name: "mcp__orchestra__read", input: { filePath: "a.ts" } }], "bg"),
    result("late", "file", {}, false, "bg"),
    assistant("bg-reply", [{ type: "text", text: "BG-RESULT", citations: null }], "bg"),
    { ...base, type: "system", subtype: "task_notification", task_id: "task-bg", tool_use_id: "bg", status: "completed",
      output_file: "/tmp/o", summary: "BG-RESULT" },
  ], later)
  expect((yield* ctx.tools(ctx.childID)).map((part) => [part.callID, part.state.status])).toEqual([["late", "completed"]])
  const reply = (yield* ctx.read(ctx.childID)).flatMap((item) => item.info.role === "assistant" ? [item.info] : []).at(-1)
  expect(reply?.time.completed).toBeDefined()
  expect((yield* ctx.tools())[0].metadata).toMatchObject({ claudeCodeTask: { taskID: "task-bg", status: "completed", summary: "BG-RESULT" } })
}))

it.instance("joined notifications preserve sibling bytes and finish only the correct child once across turns", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.feed([assistant("dispatch", ["a", "b"].map((id) => ({ type: "tool_use", id, name: "Agent", input: { run_in_background: true } })))])
  const calls = yield* ctx.tools()
  for (const [index, call] of calls.entries()) {
    yield* ctx.sessions.updatePart({ ...call, metadata: { ...call.metadata, sessionId: index === 0 ? ctx.childID : ctx.verifierID } })
    yield* ctx.feed([{ ...base, type: "system", subtype: "task_started", task_id: `task-${call.callID}`, tool_use_id: call.callID,
      description: "background", task_type: "local_agent" }, result(call.callID, "launched", { status: "async_launched" })])
  }
  yield* ctx.mirror.finish(0)
  const later = ctx.make(yield* ctx.steer())
  yield* ctx.feed([assistant("a-final", [{ type: "text", text: "A\r\n exact", citations: null }], "a"),
    assistant("b-final", [{ type: "text", text: "B\r\n exact", citations: null }], "b")], later)
  const beforeA = yield* ctx.read(ctx.childID)
  const beforeB = yield* ctx.read(ctx.verifierID)
  const beforeCards = yield* ctx.tools()
  const notice = { ...base, type: "system", subtype: "task_notification", task_id: "task-a", status: "completed",
    output_file: "/tmp/o", summary: "A completed" } as const
  yield* ctx.feed([{ ...notice, tool_use_id: "b" }], later)
  expect(yield* ctx.read(ctx.childID)).toEqual(beforeA)
  expect(yield* ctx.read(ctx.verifierID)).toEqual(beforeB)
  expect(yield* ctx.tools()).toEqual(beforeCards)
  yield* ctx.feed([notice], later)
  const accepted = yield* ctx.read(ctx.childID)
  const acceptedCards = yield* ctx.tools()
  expect(accepted.flatMap((item) => item.parts).filter((part) => part.type === "step-finish")).toHaveLength(1)
  expect(acceptedCards[0].metadata?.claudeCodeTask).toMatchObject({ taskID: "task-a", summary: "A completed", status: "completed" })
  expect(yield* ctx.read(ctx.verifierID)).toEqual(beforeB)
  yield* ctx.feed([{ ...notice, tool_use_id: "a", summary: "duplicate" }], later)
  expect(yield* ctx.read(ctx.childID)).toEqual(accepted)
  expect(yield* ctx.tools()).toEqual(acceptedCards)
  ctx.join.hold("b", "HOLD: conflicting identity")
  yield* ctx.feed([{ ...notice, task_id: "task-b", tool_use_id: "b" }], later)
  expect(yield* ctx.read(ctx.verifierID)).toEqual(beforeB)
  expect(yield* ctx.tools()).toEqual(acceptedCards)
}))

it.instance("actual mirrored rejection preserves earlier repeated text and removes accepted parent attribution", () => Effect.gen(function* () {
  const ctx = yield* setup()
  const agent = yield* ctx.sessions.get(ctx.sessionID)
  const delegation = ClaudeHostDelegation.make({ sessionID: ctx.sessionID, agent: "maestro", join: ctx.join,
    path: { cwd: agent.directory, root: agent.directory }, parts: { tool: ctx.mirror.tool, author: ctx.mirror.author, complete: ctx.mirror.complete } })
  const args = { subagent_type: "orchestra:patty", description: "child", prompt: "Review", run_in_background: true }
  yield* ctx.feed([assistant("dispatch", [{ type: "tool_use", id: "rejected", name: "Agent", input: args }])])
  yield* delegation.dispatch({ hook_event_name: "PreToolUse", session_id: "sdk-mirror", transcript_path: "/tmp/unused",
    cwd: agent.directory, tool_use_id: "rejected", tool_name: "Agent", tool_input: args }, { sessionID: ctx.sessionID, seat: "maestro" })
  const childID = ctx.join.child("rejected")
  if (!childID) throw new Error("Expected admitted patty child")
  yield* ctx.feed([{ ...base, type: "system", subtype: "task_started", tool_use_id: "rejected", task_id: "task-rejected",
    description: "child", task_type: "local_agent" }])
  const launched = { status: "async_launched", agentId: "task-rejected", description: "child", prompt: "Review",
    outputFile: "/tmp/rejected" } satisfies AgentOutput
  yield* delegation.settle({ hook_event_name: "PostToolUse", session_id: "sdk-mirror", transcript_path: "/tmp/unused",
    cwd: agent.directory, tool_use_id: "rejected", tool_name: "Agent", tool_input: args, tool_response: launched })
  yield* ctx.feed([result("rejected", "launched", launched)])
  const [accepted] = yield* ctx.tools()
  if (accepted.state.status !== "completed") throw new Error("Expected retained launch")
  expect(accepted.state.metadata.claudeCodeDispatch).toMatchObject({ agentID: "task-rejected", seat: "patty" })
  const benign = "Evidence café\r\n  exact\n"
  yield* ctx.feed([assistant("earlier", [{ type: "text", text: benign, citations: null }, { type: "text", text: benign, citations: null }], "rejected")])
  const earlierID = (yield* ctx.read(childID)).at(-1)!.info.id
  const rejected = "Rejected final sentinel"
  const ending = assistant("final", [{ type: "text", text: benign, citations: null }, { type: "text", text: rejected, citations: null }], "rejected")
  // Recorded forwarded child frames carry a null finish reason, unlike top-level SDK assistant messages.
  ending.message.stop_reason = null
  yield* ctx.feed([ending,
    result("rejected", rejected, { status: "completed", agentId: "task-rejected" })])
  const earlier = (yield* ctx.read(childID)).find((item) => item.info.id === earlierID)!
  const [completed] = yield* ctx.tools()
  if (completed.state.status !== "completed") throw new Error("Expected completed mirrored result")
  yield* delegation.settle({ hook_event_name: "PostToolUse", session_id: "sdk-mirror", transcript_path: "/tmp/unused", cwd: agent.directory,
    tool_use_id: "rejected", tool_name: "Agent", tool_input: args,
    tool_response: { status: "completed", agentId: "task-rejected", content: [{ type: "text", text: benign }, { type: "text", text: rejected }] } }, "refused")
  const history = yield* ctx.read(childID)
  expect(history.find((item) => item.info.id === earlier.info.id)).toEqual(earlier)
  expect(history.at(-1)?.parts.filter((part) => part.type === "text").map((part) => part.text)).toEqual([
    "HOLD: Agent output refused by ToolSafety inspection", "HOLD: Agent output refused by ToolSafety inspection",
  ])
  const [held] = yield* ctx.tools()
  if (held.state.status !== "completed") throw new Error("Expected persisted HOLD")
  expect(held.state.output).toBe("HOLD: Agent output refused by ToolSafety inspection")
  expect(held.state.metadata.output).toBe(held.state.output)
  expect(JSON.stringify(held)).not.toContain(rejected)
  expect(held.state.metadata.claudeCodeDispatch).toBeUndefined()
  expect(held.state.metadata.workResult).toBeUndefined()
  expect(held.state.metadata.delivery).toBeUndefined()
  expect(held.metadata).toMatchObject({ providerExecuted: true, claudeCodeTool: "Agent", sessionId: childID })
  expect(held.state.metadata.claudeCodeAgent).toMatchObject({ agentId: "task-rejected", status: "completed" })
  yield* ctx.feed([result("rejected", rejected, { status: "completed", agentId: "task-rejected" }),
    { ...base, type: "system", subtype: "task_progress", task_id: "task-rejected", tool_use_id: "rejected",
      description: "late progress", summary: "late progress", usage: { total_tokens: 1, tool_uses: 1, duration_ms: 1 } }])
  expect((yield* ctx.tools())[0]).toEqual(held)
  expect(yield* ctx.read(childID)).toEqual(history)
}))

it.instance("hook completion queued behind a provider save retains HOLD and native metadata", () => Effect.gen(function* () {
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const ctx = yield* setup((part) => part.type === "tool" && part.callID === "held-race" &&
    part.state.status === "completed" && part.state.output === "native output"
    ? Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))) : Effect.void)
  yield* ctx.feed([assistant("race", [{ type: "tool_use", id: "held-race", name: "Agent", input: {} }])])
  const [call] = yield* ctx.tools()
  const provider = yield* ctx.mirror.on(result("held-race", "native output", { status: "completed", agentId: "task-race" })).pipe(Effect.forkChild)
  yield* awaitWithTimeout(Deferred.await(entered), "provider save was never reached")
  const hold = "HOLD: Agent output refused by ToolSafety inspection"
  const refusal = yield* ctx.mirror.complete({ ...call, state: { status: "completed", input: call.state.input,
    output: hold, title: "held", metadata: { hold, output: hold, claudeCodeDispatch: undefined, workResult: undefined, delivery: undefined },
    time: { start: 1, end: 2 } } }).pipe(Effect.forkChild({ startImmediately: true }))
  yield* Deferred.succeed(release, undefined)
  yield* Fiber.join(provider)
  yield* Fiber.join(refusal)
  const [held] = yield* ctx.tools()
  if (held.state.status !== "completed") throw new Error("Expected retained HOLD")
  expect(held.state.output).toBe(hold)
  expect(held.state.metadata).toMatchObject({ hold, output: hold, claudeCodeAgent: { agentId: "task-race", status: "completed" } })
  yield* ctx.mirror.on(result("held-race", "late output", { status: "completed", agentId: "late-id" }))
  expect((yield* ctx.tools())[0]).toEqual(held)
}))

it.instance("first child frame can publish owner placement while an external completion stays serialized", () => Effect.gen(function* () {
  const ctx = yield* setup()
  const agents = yield* Agent.Service
  const snapshot = yield* Snapshot.Service
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const known = { calls: new Map<string, ClaudeHostMirror.Mirror>(), tasks: new Map<string, string>() }
  const mirror = ClaudeHostMirror.create({ sessionID: ctx.sessionID, user: ctx.user, agent: yield* agents.get("maestro"),
    path: { cwd: "/repo", root: "/repo" }, sessions: ctx.sessions, snapshot, todo: ctx.todo, status: ctx.status, known,
    child: (call) => Effect.gen(function* () {
      const child = yield* ctx.sessions.create({ parentID: call.sessionID, agent: "maestro", title: "Generic child" })
      const owner = known.calls.get(call.callID)
      const current = owner?.tool(call.callID)
      if (!owner || current?.state.status !== "running") throw new Error("Expected owning running Agent call")
      const placement = { parentSessionId: call.sessionID, sessionId: child.id }
      // The production session child callback makes this same owner.complete call under mirror.on.
      yield* owner.complete({ ...current, metadata: { ...current.metadata, ...placement },
        state: { ...current.state, metadata: { ...current.state.metadata, ...placement } } })
      const user = yield* ctx.sessions.updateMessage({ ...ctx.user, id: MessageID.ascending(), sessionID: child.id })
      yield* Deferred.succeed(entered, undefined)
      yield* Deferred.await(release)
      return { sessionID: child.id, user, agent: yield* agents.get("maestro") }
    }).pipe(Effect.orDie) })
  yield* mirror.on(assistant("generic-dispatch", [{ type: "tool_use", id: "generic", name: "Agent",
    input: { subagent_type: "general-purpose", prompt: "Inspect", description: "Generic child" } }]))
  const first = yield* mirror.on(assistant("generic-first", [{ type: "text", text: "First child frame", citations: null }], "generic"))
    .pipe(Effect.forkChild)
  yield* awaitWithTimeout(Deferred.await(entered), "child placement callback never completed owner.complete")
  const [placed] = yield* ctx.tools()
  if (placed.state.status !== "running" || typeof placed.metadata?.sessionId !== "string") throw new Error("Expected child placement")
  const hold = "HOLD: external writer"
  const external = yield* mirror.complete({ ...placed, state: { status: "completed", input: placed.state.input,
    output: hold, title: "held", metadata: { hold }, time: { start: 1, end: 2 } } })
    .pipe(Effect.forkChild({ startImmediately: true }))
  expect((yield* ctx.tools())[0]).toEqual(placed)
  yield* Deferred.succeed(release, undefined)
  yield* Fiber.join(first)
  yield* Fiber.join(external)
  const [held] = yield* ctx.tools()
  expect(held.metadata).toMatchObject({ sessionId: placed.metadata.sessionId, parentSessionId: ctx.sessionID })
  expect(held.state.status === "completed" && held.state.output).toBe(hold)
  expect((yield* ctx.read(SessionID.make(placed.metadata.sessionId))).flatMap((message) => message.parts)
    .filter((part) => part.type === "text").map((part) => part.text)).toEqual(["First child frame"])
}))

test("tool names and inputs map to the cards Orchestra renders", () => {
  expect(["Bash", "Read", "Edit", "Write", "TodoWrite", "AskUserQuestion", "Skill", "Agent"].map(ClaudeHostMirror.toolName))
    .toEqual(["bash", "read", "edit", "write", "todowrite", "question", "skill", "Agent"])
  expect(ClaudeHostMirror.toolInput("Skill", { skill: "release" })).toEqual({ skill: "release", name: "release" })
})


it.instance("background Bash launches have no exit until a terminal result supplies evidence", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.feed([
    assistant("launch", [
      { type: "tool_use", id: "background", name: "Bash", input: { command: "sleep 30; exit 2", run_in_background: true } },
      { type: "tool_use", id: "timed", name: "Bash", input: { command: "sleep 30" } },
      { type: "tool_use", id: "echo-exit", name: "Bash", input: { command: "echo Exit code 2" } },
    ]),
    result("background", "Running in background", { stdout: "", stderr: "", interrupted: false, backgroundTaskId: "task-1" }),
    result("timed", "Auto-backgrounded", { stdout: "", stderr: "", interrupted: false, timedOutAfterMs: 1000 }),
    result("echo-exit", "Exit code 2", { stdout: "Exit code 2", stderr: "", interrupted: false }),
    assistant("terminal", [{ type: "tool_use", id: "done", name: "Bash", input: { command: "wait" } }]),
    result("done", "Exit code 2", { stdout: "", stderr: "", interrupted: false, backgroundTaskId: "task-1" }, true),
  ])
  const [background, timed, echo, done] = yield* ctx.tools()
  if (background.state.status !== "completed" || timed.state.status !== "completed" || done.state.status !== "error")
    throw new Error("Expected launch responses and terminal failure")
  expect(background.state.metadata).toMatchObject({ status: "launched", backgroundTaskId: "task-1", aborted: false })
  expect(background.state.metadata?.exit).toBeUndefined()
  expect(timed.state.metadata).toMatchObject({ status: "launched", timeout: true, timedOutAfterMs: 1000 })
  expect(timed.state.metadata?.exit).toBeUndefined()
  expect(done.state.metadata).toMatchObject({ status: "completed", exit: 2, backgroundTaskId: "task-1" })
  if (echo.state.status !== "completed") throw new Error("Expected completed echo")
  expect(echo.state.metadata?.exit).toBe(0)
}))

it.instance("staged Edit preserves the real file and withholds applied diffs; an applied edit keeps its complete diff", () => Effect.gen(function* () {
  const ctx = yield* setup()
  const instance = yield* TestInstance
  const file = `${instance.directory}/held.txt`
  yield* Effect.promise(() => Bun.write(file, "one one"))
  const edit = { filePath: file, oldString: "one", newString: "two", originalFile: "one one", replaceAll: false,
    userModified: false, structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ["-one one", "+two one"] }] }
  yield* ctx.feed([
    assistant("held", [{ type: "tool_use", id: "held", name: "Edit", input: { file_path: file, old_string: "one", new_string: "two" } }]),
    result("held", "Held for review", { ...edit, staged: true }),
  ])
  expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("one one")
  const [held] = yield* ctx.tools()
  if (held.state.status !== "completed") throw new Error("Expected staged result")
  expect(held.state.metadata).toMatchObject({ staged: true, filepath: file })
  expect(held.state.metadata?.filediff).toBeUndefined()
  expect(held.state.metadata?.diff).toBeUndefined()
  yield* ctx.mirror.finish(0)
  expect((yield* ctx.read()).flatMap((item) => item.parts).some((part) => part.type === "patch")).toBe(false)
  yield* ctx.feed([assistant("applied", [{ type: "tool_use", id: "applied", name: "Edit",
    input: { file_path: file, old_string: "one", new_string: "two" } }])])
  yield* Effect.promise(() => Bun.write(file, "two one"))
  yield* ctx.feed([result("applied", "Applied", { ...edit, staged: false })])
  yield* ctx.mirror.finish(0)
  const applied = (yield* ctx.tools()).at(-1)!
  if (applied.state.status !== "completed") throw new Error("Expected applied result")
  expect(applied.state.metadata?.filediff).toEqual({ file, before: "one one", after: "two one", additions: 1, deletions: 1 })
  expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("two one")
  const patch = (yield* ctx.read()).flatMap((item) => item.parts).find((part) => part.type === "patch")
  expect(patch?.files).toContain(file.replaceAll("\\", "/"))
}), { git: true })

it.instance("query thinking totals cannot manufacture parent reasoning, and child usage stays correlated", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.feed([assistant("parent", [{ type: "tool_use", id: "agent-thinking", name: "Agent", input: {} }])])
  const [call] = yield* ctx.tools()
  yield* ctx.sessions.updatePart({ ...call, metadata: { ...call.metadata, sessionId: ctx.childID } })
  const child = assistant("child-thinking", [{ type: "text", text: "Child", citations: null }], "agent-thinking")
  child.message.usage = Object.assign({}, usage, { output_tokens_details: { thinking_tokens: 5 } })
  yield* ctx.feed([
    child,
    result("agent-thinking", "Child done", { status: "completed", agentId: "sdk-child", resolvedModel: requested,
      usage: { ...usage, output_tokens_details: { thinking_tokens: 25 } } }),
    finish({ [requested]: { inputTokens: 30, outputTokens: 60, thinkingTokens: 40, cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0.2, contextWindow: 200000, maxOutputTokens: 32000 } }, 0.2),
  ])
  yield* ctx.mirror.finish(0)
  const parent = (yield* ctx.read()).find((item) => item.info.role === "assistant")!
  expect(parent.info).toMatchObject({ tokens: { output: 20, reasoning: 0 } })
  expect(parent.parts.find((part) => part.type === "step-finish")).toMatchObject({ tokens: { output: 20, reasoning: 0 } })
  expect((yield* ctx.read(ctx.childID)).find((item) => item.info.role === "assistant")?.info)
    .toMatchObject({ tokens: { output: 15, reasoning: 5 } })
  expect((yield* ctx.sessions.get(ctx.childID)).metadata?.claudeCode).toMatchObject({ agentOutput: {
    callID: "agent-thinking", agentId: "sdk-child", resolvedModel: requested, usage: { output_tokens_details: { thinking_tokens: 25 } },
  } })
  expect((yield* ctx.sessions.get(ctx.sessionID)).metadata?.claudeCode).toMatchObject({ modelUsage: {
    [requested]: { thinkingTokens: 40 },
  } })
}))


it.instance("missing or invalid per-message thinking remains unallocated even with aggregate thinking", () => Effect.gen(function* () {
  const ctx = yield* setup()
  yield* ctx.feed([undefined, -1, NaN, Infinity, 21].map((tokens, index) => {
    const frame = assistant(`invalid-thinking-${index}`, [{ type: "text", text: "Answer", citations: null }])
    frame.message.usage = Object.assign({}, usage, { output_tokens_details: { thinking_tokens: tokens } })
    return frame
  }))
  yield* ctx.feed([finish({ [requested]: { inputTokens: 50, outputTokens: 100, thinkingTokens: 25,
    cacheReadInputTokens: 0, cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0,
    contextWindow: 200000, maxOutputTokens: 32000 } })])
  yield* ctx.mirror.finish(0)
  const replies = (yield* ctx.read()).flatMap((item) => item.info.role === "assistant" ? [item.info] : [])
  expect(replies).toHaveLength(5)
  expect(replies.every((reply) => reply.tokens.output === 20 && reply.tokens.reasoning === 0)).toBe(true)
}))
