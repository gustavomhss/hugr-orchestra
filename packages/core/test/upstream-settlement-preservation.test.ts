import { describe, expect } from "bun:test"
import { DateTime, Effect, Exit, Layer, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "../src/database/database"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { ModelV2 } from "../src/model"
import { ProviderV2 } from "../src/provider"
import { SessionEvent } from "../src/session/event"
import { SessionMessage } from "../src/session/message"
import { SessionMessageUpdater } from "../src/session/message-updater"
import { SessionSchema } from "../src/session/schema"
import { SessionProjector } from "../src/session/projector"
import { PartTable, SessionTable } from "../src/session/sql"
import { SessionV1 } from "../src/v1/session"
import { Project } from "../src/project"
import { ProjectTable } from "../src/project/sql"
import { AbsolutePath } from "../src/schema"
import { testEffect } from "./lib/effect"

// Prepared source cases, not executed. These exercise the actual receipt helpers and production updater.
const it = testEffect(Layer.empty)
const sessionID = SessionSchema.ID.make("ses_authority")
const messageID = SessionMessage.ID.make("msg_authority")
const input = { subagent_type: "walt", task_id: "ses_child", prompt: "Return the proposal" }
const owner = { sessionID, messageID, callID: "task-call", tool: "task", input }
const workResult = {
  schema: "upstream-work-result-v1",
  taskId: "tsk_proposal",
  card: { parsed: true, messageID: "msg_returned" },
  author: { memberId: "walt", executionSessionID: "ses_child", messageID: "msg_returned" },
  outcome: "done",
  terminal: { reason: "ended" },
}
const receipt = {
  parentMessageID: messageID,
  parentCallID: "task-call",
  workResult,
  deliveryMessageID: "msg_notice",
  deliveryPartID: "prt_notice",
}
const metadata = { parentSessionId: sessionID, sessionId: "ses_child", background: true, workResult, upstreamSettlement: receipt }
const timestamp = DateTime.makeUnsafe(1)

function fixture(taskInput: Record<string, unknown> = input) {
  const state: SessionMessageUpdater.MemoryState = { messages: [SessionMessage.Assistant.make({
    id: messageID,
    type: "assistant",
    agent: "maestro",
    model: { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") },
    content: [SessionMessage.AssistantTool.make({
      type: "tool", id: "task-call", name: "task", time: { created: timestamp },
      state: SessionMessage.ToolStateRunning.make({ status: "running", input: taskInput,
        structured: { metadata: { parentSessionId: sessionID, sessionId: "ses_child", background: true } }, content: [] }),
    })],
    time: { created: timestamp },
  })] }
  return { state, adapter: SessionMessageUpdater.memory(state) }
}

function tool(state: SessionMessageUpdater.MemoryState) {
  const message = state.messages[0]
  if (message?.type !== "assistant") throw new Error("Missing owned assistant")
  const call = message.content[0]
  if (call?.type !== "tool" || !("structured" in call.state)) throw new Error("Missing owned Task")
  return { ...call, state: call.state }
}

const progress = (value: Record<string, unknown>) => SessionEvent.Tool.Progress.make({
  id: EventV2.ID.make("evt_progress"), type: SessionEvent.Tool.Progress.type,
  data: { sessionID, assistantMessageID: messageID, callID: "task-call", timestamp, structured: value, content: [] },
})

const dbIt = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionProjector.node])))
dbIt.effect("legacy durable projector preserves receipt, original input and terminal state against late metadata", () => Effect.gen(function* () {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] }).run()
  yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: Project.ID.global, slug: "upstream",
    directory: "/project", title: "upstream", version: "test" }).run()
  yield* events.publish(SessionV1.Event.MessageUpdated, { sessionID, info: SessionV1.Assistant.make({
    id: SessionV1.MessageID.make(messageID), sessionID, role: "assistant", agent: "maestro", mode: "maestro",
    parentID: SessionV1.MessageID.make("msg_user"), modelID: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider"),
    path: { cwd: "/project", root: "/project" }, time: { created: 1 }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }) })
  const part = SessionV1.ToolPart.make({ id: SessionV1.PartID.make("prt_original"),
    sessionID, messageID: SessionV1.MessageID.make(messageID), type: "tool", tool: "task", callID: "task-call",
    metadata: { retainedProviderDetail: "latest" },
    state: { status: "completed", input, output: "Background task started", title: "upstream",
      metadata, time: { start: 1, end: 1 } },
  })
  yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 1, part: { ...part,
    state: { status: "completed", input, output: "Background task started", title: "upstream",
      metadata: { parentSessionId: sessionID, sessionId: "ses_child", background: true }, time: { start: 1, end: 1 } } } }, { persist: true })
  yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 1, part }, { persist: true })
  const read = () => Effect.gen(function* () {
    const row = yield* database.db.select().from(PartTable).where(eq(PartTable.id, part.id)).get()
    if (!row) throw new Error("Missing durable original Task part")
    const current = Schema.decodeUnknownSync(SessionV1.Part)({ ...row.data, id: row.id,
      messageID: row.message_id, sessionID: row.session_id })
    if (current.type !== "tool") throw new Error("Missing durable Task")
    return current
  })
  for (const state of [SessionV1.ToolStatePending.make({ status: "pending", input: {}, raw: "late" }),
    SessionV1.ToolStateRunning.make({ status: "running", input: { ...input, prompt: "late mutated prompt" }, time: { start: 9 } })]) {
    yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 9, part: { ...part, state, metadata: undefined } }, { persist: true })
    expect(yield* read()).toEqual(part)
  }
  yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 1,
    part: { ...part, state: { status: "running", input: { ...input, prompt: "late mutated prompt" },
      metadata: { workResult: { terminal: { reason: "running" } } }, time: { start: 1 } } },
  }, { persist: true })
  const current = yield* read()
  if (current.type !== "tool" || !("metadata" in current.state)) throw new Error("Missing durable Task metadata")
  expect(current.state.status).toBe("completed")
  expect(current.state.input).toEqual(input)
  expect(current.state.metadata).toMatchObject({ upstreamSettlement: receipt, workResult, sessionId: "ses_child" })
  yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 2, part: { ...part,
    metadata: { newProviderDetail: "concurrent" }, state: { status: "error", input,
      error: "Tool execution aborted", metadata: { interrupted: true, retainedFailureDetail: "latest" },
      time: { start: 1, end: 2 } } } }, { persist: true })
  const failed = yield* read()
  expect(failed.state.status).toBe("error")
  if (failed.state.status !== "error") throw new Error("Failure was not projected")
  expect(failed.state.error).toBe("Tool execution aborted")
  expect(failed.state.metadata).toMatchObject({ upstreamSettlement: receipt, interrupted: true })
  for (const state of [SessionV1.ToolStatePending.make({ status: "pending", input: {}, raw: "stale" }),
    SessionV1.ToolStateRunning.make({ status: "running", input: {}, time: { start: 99 } }),
    SessionV1.ToolStateCompleted.make({ ...part.state, status: "completed", input: {}, output: "False finished",
      title: "stale", metadata: { interrupted: false, unrelated: "new detail" }, time: { start: 99, end: 99 } }),
    SessionV1.ToolStateError.make({ status: "error", input: {}, error: "Stale different failure", time: { start: 99, end: 99 } })]) {
    yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 99,
      part: { ...part, metadata: { otherProviderDetail: "new" }, state } }, { persist: true })
    const retained = yield* read()
    expect(retained.state.status).toBe("error")
    if (retained.state.status !== "error") throw new Error("Stored failure was downgraded")
    expect(retained.state.error).toBe(failed.state.error)
    expect(retained.state.time).toEqual(failed.state.time)
    expect(retained.state.input).toEqual(input)
    expect(retained.state.metadata).toMatchObject({ upstreamSettlement: receipt, workResult,
      interrupted: true, retainedFailureDetail: "latest" })
    expect(retained.metadata).toMatchObject({ retainedProviderDetail: "latest", newProviderDetail: "concurrent", otherProviderDetail: "new" })
  }
  const unchanged = yield* read()
  yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 99, part: unchanged }, { persist: true })
  expect(yield* read()).toEqual(unchanged)
  const conflict = yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 1,
    part: { ...part, callID: "another-dispatch" } }, { persist: true }).pipe(Effect.exit)
  expect(Exit.isFailure(conflict)).toBe(true)
  // The private port acquired this completed snapshot before unrelated progress and interruption were projected.
  const stale = SessionV1.ToolPart.make({ ...part, id: SessionV1.PartID.make("prt_first_install"), callID: "first-install-call",
    metadata: { providerDetail: "stale snapshot" }, state: { status: "completed", input, output: "Background task started",
      title: "stale title", metadata: { parentSessionId: sessionID, sessionId: "ses_child", background: true,
      progressDetail: "stale snapshot" }, time: { start: 1, end: 1 } } })
  if (stale.state.status !== "completed") throw new Error("First-install snapshot must be completed")
  yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 1, part: stale }, { persist: true })
  const latest = SessionV1.ToolPart.make({ ...stale, metadata: { providerDetail: "concurrent latest", unrelated: true },
    state: { status: "error", input, error: "Actual concurrent interruption", time: { start: 1, end: 3 },
      metadata: { parentSessionId: sessionID, sessionId: "ses_child", background: true, interrupted: true,
        progressDetail: "concurrent latest", otherDetail: "retain" } } })
  if (latest.state.status !== "error") throw new Error("First-install current state must be error")
  yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 3, part: latest }, { persist: true })
  const firstReceipt = { ...receipt, parentCallID: stale.callID }
  for (const part of [{ ...stale, state: { ...stale.state,
    metadata: { ...metadata, upstreamSettlement: { ...firstReceipt, parentCallID: "wrong-call" } } } },
    { ...stale, state: { ...stale.state, input: { ...input, task_id: "ses_wrong" }, metadata: { ...metadata, upstreamSettlement: firstReceipt } } }]) {
    const rejected = yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 4, part }, { persist: true }).pipe(Effect.exit)
    expect(Exit.isFailure(rejected)).toBe(true)
  }
  yield* events.publish(SessionV1.Event.PartUpdated, { sessionID, time: 4, part: { ...stale,
    state: { ...stale.state, metadata: { ...metadata, progressDetail: "stale snapshot", upstreamSettlement: firstReceipt } } } }, { persist: true })
  const installedRow = yield* database.db.select().from(PartTable).where(eq(PartTable.id, stale.id)).get()
  if (!installedRow) throw new Error("Missing first installed Task")
  const installed = Schema.decodeUnknownSync(SessionV1.Part)({ ...installedRow.data, id: installedRow.id,
    messageID: installedRow.message_id, sessionID: installedRow.session_id })
  expect(installed).toEqual({ ...latest, state: { ...latest.state,
    metadata: { ...latest.state.metadata, upstreamSettlement: firstReceipt, workResult } } })
}))
const success = (value: Record<string, unknown>) => SessionEvent.Tool.Success.make({
  id: EventV2.ID.make("evt_success"), type: SessionEvent.Tool.Success.type,
  data: { sessionID, assistantMessageID: messageID, callID: "task-call", timestamp, structured: value,
    content: [{ type: "text", text: "Background task started" }], provider: { executed: false } },
})
const failure = (message = "Tool execution aborted") => SessionEvent.Tool.Failed.make({
  id: EventV2.ID.make("evt_failure"), type: SessionEvent.Tool.Failed.type,
  data: { sessionID, assistantMessageID: messageID, callID: "task-call", timestamp,
    error: { type: "unknown", message }, provider: { executed: false } },
})
const called = () => SessionEvent.Tool.Called.make({
  id: EventV2.ID.make("evt_called"), type: SessionEvent.Tool.Called.type,
  data: { sessionID, assistantMessageID: messageID, callID: "task-call", timestamp,
    tool: "task", input: { ...input, prompt: "stale tool-call" }, provider: { executed: false } },
})

describe("private upstream settlement preservation", () => {
  it.effect("generic metadata cannot create a receipt or replace a matching stored receipt", () => Effect.sync(() => {
    expect(SessionMessageUpdater.taskMetadata({}, metadata, owner)).not.toHaveProperty("upstreamSettlement")
    const changed = { ...metadata, sessionId: "ses_another", workResult: { terminal: { reason: "running" } },
      upstreamSettlement: { ...receipt, deliveryMessageID: "msg_forged" }, unrelated: "new progress" }
    const preserved = SessionMessageUpdater.taskMetadata(metadata, changed, owner)
    expect(preserved.upstreamSettlement).toEqual(receipt)
    expect(preserved.workResult).toEqual(workResult)
    expect(preserved.sessionId).toBe("ses_child")
    expect(preserved.unrelated).toBe("new progress")
    expect(SessionMessageUpdater.taskMetadata({ ordinary: "old" }, { ordinary: "new", extra: true },
      { ...owner, tool: "unrelated" })).toEqual({ ordinary: "new", extra: true })
  }))

  it.effect("resumed child uses execution Session ID, distinct from retained logical Task name", () => Effect.sync(() => {
    expect(input.task_id).not.toBe(workResult.taskId)
    expect(SessionMessageUpdater.upstreamSettlement(metadata, owner)).toEqual(receipt)
    expect(SessionMessageUpdater.upstreamSettlement(metadata, { ...owner,
      input: { subagent_type: "walt", prompt: input.prompt } })).toEqual(receipt)
    expect(SessionMessageUpdater.upstreamSettlement(metadata, { ...owner,
      input: { ...input, task_id: workResult.taskId } })).toBeUndefined()
  }))

  it.effect("malformed, conflicting parent/call/child identity cannot carry a receipt", () => Effect.sync(() => {
    expect(SessionMessageUpdater.upstreamSettlement(metadata, owner)).toEqual(receipt)
    expect(SessionMessageUpdater.upstreamSettlement({ ...metadata, upstreamSettlement: { ...receipt, verified: true } }, owner)).toBeUndefined()
    expect(SessionMessageUpdater.upstreamSettlement(metadata, { ...owner, messageID: "msg_other" })).toBeUndefined()
    expect(SessionMessageUpdater.upstreamSettlement(metadata, { ...owner, callID: "other-call" })).toBeUndefined()
    expect(SessionMessageUpdater.upstreamSettlement({ ...metadata, sessionId: "ses_other" }, owner)).toBeUndefined()
    expect(SessionMessageUpdater.upstreamSettlement(metadata, { ...owner, input: { ...input, task_id: "ses_other" } })).toBeUndefined()
    expect(SessionMessageUpdater.upstreamSettlement({ ...metadata, upstreamSettlement: { ...receipt,
      workResult: { ...workResult, card: { parsed: true, messageID: "msg_later_identical_bytes" } } } }, owner)).toBeUndefined()
  }))

  it.effect("settle-before-initial-completion survives late stale success and same-tick generic progress", () => Effect.gen(function* () {
    const current = fixture()
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata }))
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata: { workResult: { terminal: { reason: "running" } } } }))
    yield* SessionMessageUpdater.update(current.adapter, success({ metadata: { background: true } }))
    const call = tool(current.state)
    expect(call.state.status).toBe("completed")
    expect(call.state.structured.metadata).toMatchObject({ upstreamSettlement: receipt, workResult, sessionId: "ses_child" })
  }))

  it.effect("terminal private progress updates receipt without changing status or original result content", () => Effect.gen(function* () {
    const current = fixture()
    yield* SessionMessageUpdater.update(current.adapter, success({ metadata: { parentSessionId: sessionID, sessionId: "ses_child", background: true } }))
    const before = structuredClone(tool(current.state).state.content)
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata }))
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata: { ...metadata,
      upstreamSettlement: { ...receipt, deliveryMessageID: "msg_later" } } }))
    const call = tool(current.state)
    expect(call.state.status).toBe("completed")
    expect(call.state.content).toEqual(before)
    expect(call.state.structured.metadata).toMatchObject({ upstreamSettlement: receipt, workResult })
  }))

  it.effect("initial success cannot grant a provider/caller-supplied receipt", () => Effect.gen(function* () {
    const current = fixture()
    yield* SessionMessageUpdater.update(current.adapter, success({ metadata }))
    expect(tool(current.state).state.structured.metadata).not.toHaveProperty("upstreamSettlement")
  }))

  it.effect("completed receipt survives metadata-free progress and late called without losing unrelated fields", () => Effect.gen(function* () {
    const current = fixture()
    yield* SessionMessageUpdater.update(current.adapter, progress({ retained: "latest", metadata: { ...metadata, oldDetail: "keep" } }))
    yield* SessionMessageUpdater.update(current.adapter, success({ outputDetail: "completed" }))
    const before = structuredClone(tool(current.state))
    yield* SessionMessageUpdater.update(current.adapter, called())
    expect(tool(current.state)).toEqual(before)
    yield* SessionMessageUpdater.update(current.adapter, progress({ newDetail: "concurrent" }))
    const call = tool(current.state)
    expect(call.state.status).toBe("completed")
    expect(call.state.input).toEqual(input)
    expect(call.state.content).toEqual(before.state.content)
    expect(call.state.structured).toMatchObject({ retained: "latest", outputDetail: "completed", newDetail: "concurrent",
      metadata: { upstreamSettlement: receipt, oldDetail: "keep" } })
    const unchanged = structuredClone(call)
    yield* SessionMessageUpdater.update(current.adapter, success({ metadata }))
    expect(tool(current.state)).toEqual(unchanged)
  }))

  it.effect("stored interruption and failure dominate late progress, success, called and failed", () => Effect.gen(function* () {
    const current = fixture()
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata: { ...metadata, interrupted: true, retainedDetail: "latest" } }))
    yield* SessionMessageUpdater.update(current.adapter, failure())
    const before = structuredClone(tool(current.state))
    for (const event of [called(), progress({ newDetail: "concurrent", metadata: { interrupted: false } }),
      success({ successDetail: "late", metadata: { unrelated: "new" } }), failure("Stale different failure")]) {
      yield* SessionMessageUpdater.update(current.adapter, event)
      const call = tool(current.state)
      expect(call.state.status).toBe("error")
      if (call.state.status !== "error" || before.state.status !== "error") throw new Error("Stored failure was downgraded")
      expect(call.state.error).toEqual(before.state.error)
      expect(call.state.content).toEqual(before.state.content)
      expect(call.state.input).toEqual(input)
      expect(call.time).toEqual(before.time)
      expect(call.state.structured.metadata).toMatchObject({ upstreamSettlement: receipt, workResult,
        interrupted: true, retainedDetail: "latest" })
    }
    expect(tool(current.state).state.structured).toMatchObject({ newDetail: "concurrent", successDetail: "late",
      metadata: { unrelated: "new" } })
  }))

  it.effect("authoritative failure after completed receipt remains failure", () => Effect.gen(function* () {
    const current = fixture()
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata }))
    yield* SessionMessageUpdater.update(current.adapter, success({}))
    yield* SessionMessageUpdater.update(current.adapter, failure("Actual Task failed"))
    yield* SessionMessageUpdater.update(current.adapter, success({}))
    const call = tool(current.state)
    expect(call.state.status).toBe("error")
    if (call.state.status !== "error") throw new Error("Authoritative Task failure was lost")
    expect(call.state.error.message).toBe("Actual Task failed")
    expect(call.state.structured.metadata).toMatchObject({ upstreamSettlement: receipt, workResult })
  }))

  it.effect("running interruption marker blocks completion without fabricating an error", () => Effect.gen(function* () {
    const current = fixture()
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata: { ...metadata, interrupted: true } }))
    const before = structuredClone(tool(current.state))
    yield* SessionMessageUpdater.update(current.adapter, success({ extraDetail: "late" }))
    const call = tool(current.state)
    expect(call.state.status).toBe("running")
    expect(call.state).not.toHaveProperty("error")
    expect(call.time).toEqual(before.time)
    expect(call.state.structured).toMatchObject({ extraDetail: "late", metadata: { upstreamSettlement: receipt, interrupted: true } })
    yield* SessionMessageUpdater.update(current.adapter, failure("Actual interruption failure"))
    expect(tool(current.state).state.status).toBe("error")
  }))

  it.effect("first private progress installs receipt on current error without overwriting interruption", () => Effect.gen(function* () {
    const current = fixture()
    yield* SessionMessageUpdater.update(current.adapter, progress({ latestField: "concurrent",
      metadata: { parentSessionId: sessionID, sessionId: "ses_child", interrupted: true, detail: "latest" } }))
    yield* SessionMessageUpdater.update(current.adapter, failure("Actual concurrent interruption"))
    const before = structuredClone(tool(current.state))
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata: { ...metadata, interrupted: false } }))
    const call = tool(current.state)
    expect(call.state.status).toBe("error")
    if (call.state.status !== "error" || before.state.status !== "error") throw new Error("First receipt replaced current failure")
    expect(call.state.error).toEqual(before.state.error)
    expect(call.time).toEqual(before.time)
    expect(call.state.content).toEqual(before.state.content)
    expect(call.state.structured).toMatchObject({ latestField: "concurrent",
      metadata: { upstreamSettlement: receipt, workResult, interrupted: true, detail: "latest" } })
  }))

  it.effect("new progress receipt cannot rebind stored child or grant provider ownership", () => Effect.gen(function* () {
    const current = fixture({ subagent_type: "walt", prompt: input.prompt })
    const wrongResult = { ...workResult, author: { ...workResult.author, executionSessionID: "ses_other" } }
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata: { ...metadata, sessionId: "ses_other",
      workResult: wrongResult, upstreamSettlement: { ...receipt, workResult: wrongResult } } }))
    expect(tool(current.state).state.structured.metadata).not.toHaveProperty("upstreamSettlement")
    const provider = fixture()
    const message = provider.state.messages[0]
    if (message?.type !== "assistant") throw new Error("Missing assistant")
    const call = message.content[0]
    if (call?.type !== "tool") throw new Error("Missing Task")
    provider.state.messages[0] = { ...message, content: [{ ...call, provider: { executed: true } }] }
    yield* SessionMessageUpdater.update(provider.adapter, progress({ metadata }))
    expect(tool(provider.state).state.structured.metadata).not.toHaveProperty("upstreamSettlement")
  }))
})
