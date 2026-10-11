import { expect, test } from "bun:test"
import { Effect } from "effect"
import type { ModelUsage, SDKAssistantMessage, SDKMessage, SDKPartialAssistantMessage, SDKResultSuccess, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelsDev } from "@orchestra/core/models-dev"
import { ClaudeHostMirror } from "@/claude-code/host/mirror"
import { Agent } from "@/agent/agent"
import { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { Todo } from "@/session/todo"
import { Snapshot } from "@/snapshot"
import { Provider } from "@/provider/provider"
import { TestInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"
import { makeHttp } from "../../session/prompt.fixture"

const it = testEffect(makeHttp())
const base = { parent_tool_use_id: null, session_id: "sdk-mirror", uuid: "frame" }
const requested = "claude-haiku-4-5-20251001"
const usage: SDKAssistantMessage["message"]["usage"] = { input_tokens: 10, output_tokens: 20,
  cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null, server_tool_use: null, service_tier: null }
const assistant = (id: string, content: SDKAssistantMessage["message"]["content"], parent: string | null = null,
  model = requested): SDKAssistantMessage => ({ ...base, type: "assistant", parent_tool_use_id: parent, uuid: `u-${id}`,
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

const setup = () => Effect.gen(function* () {
  const instance = yield* TestInstance
  const sessions = yield* Session.Service
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
  const make = (user: SessionV1.User) => ClaudeHostMirror.create({ sessionID: chat.id, user, agent,
    path: { cwd: instance.directory, root: instance.directory }, sessions, snapshot, todo, status, provider, catalog, known,
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
    }),
  })
  const mirror = make(user)
  const feed = (frames: SDKMessage[], view = mirror) => Effect.forEach(frames, (message) => view.on(message), { discard: true })
  const read = (sessionID = chat.id) => sessions.messages({ sessionID }).pipe(Effect.orDie)
  const tools = (sessionID = chat.id) => read(sessionID).pipe(Effect.map((messages) => messages.flatMap((item) => item.parts)
    .filter((part): part is SessionV1.ToolPart => part.type === "tool")))
  const steer = () => sessions.updateMessage(makeUser(chat.id, "maestro"))
  return { mirror, make, feed, tools, read, sessions, todo, status, provider, user, steer,
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
  const replies = (yield* ctx.read()).filter((item) => item.info.role === "assistant")
  expect(replies.map((item) => item.info.parentID)).toEqual([ctx.user.id, ctx.user.id, steer.id])
  expect(replies.every((item) => item.info.time.completed !== undefined)).toBe(true)
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
  const model = { inputTokens: 10, outputTokens: 20, thinkingTokens: 7, cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0.42, contextWindow: 500000, maxOutputTokens: 32000 }
  yield* ctx.feed([stream(assistant("fallback", [], null, fallback)),
    assistant("fallback", [{ type: "text", text: "Fallback", citations: null }], null, fallback), finish({ [fallback]: model }, 0.42)])
  yield* ctx.mirror.finish(0)
  const reply = (yield* ctx.read()).find((item) => item.info.role === "assistant")
  expect(reply?.info).toMatchObject({ modelID: fallback, tokens: { input: 10, output: 13, reasoning: 7 }, cost: 0.42 })
  expect(reply?.parts.find((part) => part.type === "step-finish")).toMatchObject({ tokens: { output: 13, reasoning: 7 } })
  expect((yield* ctx.provider.list())[ctx.user.model.providerID].models[fallback].limit).toMatchObject({ context: 500000, output: 32000 })
  const next = ctx.make(yield* ctx.steer())
  yield* ctx.feed([assistant("next", [{ type: "text", text: "Next", citations: null }], null, fallback),
    finish({ [fallback]: { ...model, thinkingTokens: 10, outputTokens: 40 } }, 0.5)], next)
  yield* next.finish(0.42)
  expect((yield* ctx.read()).findLast((item) => item.info.role === "assistant")?.info).toMatchObject({ tokens: { output: 17, reasoning: 3 } })
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
  expect((yield* ctx.read(ctx.childID)).findLast((item) => item.info.role === "assistant")?.info.time.completed).toBeDefined()
  expect((yield* ctx.tools())[0].metadata).toMatchObject({ claudeCodeTask: { taskID: "task-bg", status: "completed", summary: "BG-RESULT" } })
}))

test("tool names and inputs map to the cards Orchestra renders", () => {
  expect(["Bash", "Read", "Edit", "Write", "TodoWrite", "AskUserQuestion", "Skill", "Agent"].map(ClaudeHostMirror.toolName))
    .toEqual(["bash", "read", "edit", "write", "todowrite", "question", "skill", "Agent"])
  expect(ClaudeHostMirror.toolInput("Skill", { skill: "release" })).toEqual({ skill: "release", name: "release" })
})
