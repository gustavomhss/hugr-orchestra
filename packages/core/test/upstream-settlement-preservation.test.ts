import { describe, expect } from "bun:test"
import path from "node:path"
import { DateTime, Effect, Exit, Layer, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "../src/database/database"
import { AgentV2 } from "../src/agent"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { EventTable } from "../src/event/sql"
import { ModelV2 } from "../src/model"
import { ProviderV2 } from "../src/provider"
import { SessionEvent } from "../src/session/event"
import { SessionMessage } from "../src/session/message"
import { SessionMessageUpdater } from "../src/session/message-updater"
import { SessionSchema } from "../src/session/schema"
import { SessionProjector } from "../src/session/projector"
import { MessageTable, PartTable, SessionMessageTable, SessionTable } from "../src/session/sql"
import { Location } from "../src/location"
import { WorkspaceV2 } from "../src/workspace"
import { WorkspaceTable } from "../src/control-plane/workspace.sql"
import { SessionV1 } from "../src/v1/session"
import { Project } from "../src/project"
import { ProjectTable } from "../src/project/sql"
import { AbsolutePath } from "../src/schema"
import { testEffect } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"

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

const observationFixture = Effect.fn("HostObservationTest.fixture")(function* (view: string, legacyOriginal = false) {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  const parentID = SessionSchema.ID.make(`ses_observation_parent_${view}`)
  const childID = SessionSchema.ID.make(`ses_observation_child_${view}`)
  const parentMessageID = SessionMessage.ID.make(`msg_observation_parent_${view}`)
  const authorMessageID = SessionMessage.ID.make(`msg_observation_author_${view}`)
  const projectID = Project.ID.make(`observation-project-${view}`)
  yield* database.db.insert(ProjectTable).values({ id: projectID, worktree: AbsolutePath.make("/project"), sandboxes: [] }).run()
  yield* database.db.insert(SessionTable).values([
    { id: parentID, project_id: projectID, slug: "parent", directory: "/project", title: "parent", version: "test" },
    { id: childID, parent_id: parentID, project_id: projectID, slug: "child", directory: "/project", agent: "walt", title: "child", version: "test" },
  ]).run()
  const selectedInput = { subagent_type: "walt", task_id: childID, prompt: input.prompt }
  const result = { ...workResult, taskId: `tsk_observation_${view}`, card: { parsed: true, messageID: authorMessageID },
    author: { memberId: "walt", executionSessionID: childID, messageID: authorMessageID },
    terminal: { reason: "failed", hostDetail: "Actual host failure after returned assistant" } }
  const retainedMetadata = { parentSessionId: parentID, sessionId: childID, background: true, concurrent: "keep",
    workResult: { schema: result.schema, taskId: result.taskId, card: { parsed: false }, terminal: { reason: "running" } } }
  const base = { sessionID: parentID, assistantMessageID: parentMessageID, callID: "original-task", timestamp }
  const model = { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }
  yield* events.publish(SessionEvent.Step.Started, { ...base, agent: AgentV2.ID.make("maestro"), model })
  yield* events.publish(SessionEvent.Tool.Input.Started, { ...base, name: "task" })
  yield* events.publish(SessionEvent.Tool.Called, { ...base, tool: "task", input: selectedInput, provider: { executed: false } })
  yield* events.publish(SessionEvent.Tool.Success, { ...base,
    structured: { title: "Original Task", output: "Background task started", retained: "current", metadata: retainedMetadata },
    content: [{ type: "text", text: "Original Task output" }], result: { original: true }, provider: { executed: false } })
  const original = legacyOriginal ? yield* Effect.gen(function* () {
    yield* events.publish(SessionV1.Event.MessageUpdated, { sessionID: parentID,
      info: SessionV1.Assistant.make({ id: SessionV1.MessageID.make(parentMessageID), sessionID: parentID,
        role: "assistant", agent: "maestro", mode: "maestro", parentID: SessionV1.MessageID.make("msg_user"),
        modelID: model.id, providerID: model.providerID, path: { cwd: "/project", root: "/project" },
        time: { created: 1 }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }) })
    const part = SessionV1.ToolPart.make({ id: SessionV1.PartID.make(`prt_observation_original_${view}`),
      messageID: SessionV1.MessageID.make(parentMessageID), sessionID: parentID, type: "tool", tool: "task", callID: base.callID,
      state: { status: "completed", input: selectedInput, title: "Original Task", output: "Background task started",
        metadata: retainedMetadata, time: { start: 1, end: 1 } } })
    yield* events.publish(SessionV1.Event.PartUpdated, { sessionID: parentID, time: 1, part })
    return part
  }) : undefined
  if (view !== "legacy") {
    const author = { sessionID: childID, assistantMessageID: authorMessageID, timestamp }
    yield* events.publish(SessionEvent.Step.Started, { ...author, agent: AgentV2.ID.make("walt"), model })
    yield* events.publish(SessionEvent.Text.Started, { ...author, textID: "returned-text" })
    yield* events.publish(SessionEvent.Text.Ended, { ...author, textID: "returned-text", text: "Returned proposal" })
    yield* events.publish(SessionEvent.Step.Ended, { ...author, finish: "stop", cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } })
  }
  if (view !== "native") yield* events.publish(SessionV1.Event.MessageUpdated, { sessionID: childID,
    info: SessionV1.Assistant.make({ id: SessionV1.MessageID.make(authorMessageID), sessionID: childID,
      role: "assistant", agent: "walt", mode: "walt", parentID: SessionV1.MessageID.make("msg_user"),
      modelID: model.id, providerID: model.providerID, path: { cwd: "/project", root: "/project" },
      time: { created: 1, completed: 2 }, finish: "stop", cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }) })
  const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })
  const offer = (metadata: Record<string, unknown>, patch: Partial<SessionEvent.Tool.Progress["data"]> = {}, placement = location) =>
    events.publish(SessionEvent.Tool.Progress, { ...base, structured: { metadata }, content: [], ...patch }, { location: placement })
  const read = () => Effect.gen(function* () {
    const row = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, parentMessageID)).get()
    if (!row) throw new Error("Missing native original Task owner")
    const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...row.data, id: row.id, type: row.type })
    return tool({ messages: [message] })
  })
  return { database, events, parentID, childID, parentMessageID, authorMessageID, projectID, result, retainedMetadata, selectedInput, original, offer, read }
})

;["native", "legacy", "dual"].forEach((view) => {
  dbIt.live(`completed native Task records receipt-free host failure against stored ${view} returned author`, () => Effect.gen(function* () {
    const f = yield* observationFixture(view)
    const before = yield* f.read()
    expect(before.state.status).toBe("completed")
    const offered = { ...f.retainedMetadata, concurrent: "stale caller value", workResult: f.result }
    for (const metadata of [
      { ...offered, parentSessionId: "ses_forged" },
      { ...offered, sessionId: "ses_forged" },
      { ...offered, workResult: { ...f.result, taskId: "tsk_forged" } },
      { ...offered, workResult: { ...f.result, card: { messageID: "msg_missing" },
        author: { ...f.result.author, messageID: "msg_missing" } } },
      { ...offered, workResult: { ...f.result, card: { messageID: f.parentMessageID },
        author: { ...f.result.author, messageID: f.parentMessageID } } },
      { ...offered, workResult: { ...f.result, author: { ...f.result.author, memberId: "maestro" } } },
      { ...offered, workResult: { ...f.result, card: null } },
      { ...offered, workResult: { ...f.result, author: "caller-authored" } },
      { ...offered, workResult: { ...f.result, terminal: null } },
      { ...offered, workResult: { ...f.result, terminal: { reason: "ended" } } },
      { ...offered, upstreamSettlement: { forged: true } },
    ]) {
      yield* f.offer(metadata)
      expect(yield* f.read()).toEqual(before)
    }
    for (const hostDetail of ["", 0, false, null, {}, []]) {
      yield* f.offer({ ...offered, workResult: { ...f.result, terminal: { reason: "failed", hostDetail } } })
      expect(yield* f.read()).toEqual(before)
    }
    yield* f.offer(offered, { callID: "forged-call" })
    expect(yield* f.read()).toEqual(before)
    yield* f.offer(offered, {}, Location.Ref.make({ directory: AbsolutePath.make("/other-project") }))
    expect(yield* f.read()).toEqual(before)
    yield* f.database.db.update(SessionTable).set({ parent_id: null }).where(eq(SessionTable.id, f.childID)).run()
    yield* f.offer(offered)
    expect(yield* f.read()).toEqual(before)
    yield* f.database.db.update(SessionTable).set({ parent_id: f.parentID }).where(eq(SessionTable.id, f.childID)).run()
    const foreignProjectID = Project.ID.make(`foreign-observation-${view}`)
    yield* f.database.db.insert(ProjectTable).values({ id: foreignProjectID, worktree: AbsolutePath.make("/other-project"), sandboxes: [] }).run()
    for (const patch of [{ project_id: foreignProjectID }, { directory: "/other-project" }, { agent: "maestro" }]) {
      yield* f.database.db.update(SessionTable).set(patch).where(eq(SessionTable.id, f.childID)).run()
      yield* f.offer(offered)
      expect(yield* f.read()).toEqual(before)
      yield* f.database.db.update(SessionTable).set({ project_id: f.projectID, directory: "/project", agent: "walt" })
        .where(eq(SessionTable.id, f.childID)).run()
    }
    const reasonOnly = { ...f.result, terminal: { reason: "failed" } }
    yield* f.offer({ ...offered, workResult: reasonOnly })
    expect((yield* f.read()).state.structured.metadata).toMatchObject({ workResult: reasonOnly })
    yield* f.offer(offered)
    const observed = yield* f.read()
    expect(observed).toEqual({ ...before, state: { ...before.state,
      structured: { ...before.state.structured, metadata: { ...f.retainedMetadata, workResult: f.result } } } })
    expect(observed.state.status).toBe("completed")
    expect(observed.state.input).toEqual(f.selectedInput)
    expect(observed.state.structured.metadata).not.toHaveProperty("upstreamSettlement")
    yield* f.offer(offered)
    expect(yield* f.read()).toEqual(observed)
    yield* f.offer({ ...offered, workResult: { ...f.result, terminal: { reason: "failed", hostDetail: "Forged later failure detail" } } })
    expect(yield* f.read()).toEqual(observed)
    yield* f.offer({ ...offered, workResult: { ...f.result, terminal: { reason: "interrupted", hostDetail: f.result.terminal.hostDetail } } })
    expect(yield* f.read()).toEqual(observed)
    yield* f.offer({ ...offered, upstreamSettlement: { parentMessageID: f.parentMessageID, parentCallID: "original-task",
      workResult: { ...f.result, terminal: { reason: "ended" } }, deliveryMessageID: "msg_forged" } })
    expect(yield* f.read()).toEqual(observed)
  }))
})

dbIt.live("duplicate native same-call tools veto observation, then restored unique Task accepts it", () => Effect.gen(function* () {
  const f = yield* observationFixture("duplicate-native")
  const before = yield* f.read()
  expect(before.state.status).toBe("completed")
  const row = yield* f.database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, f.parentMessageID)).get()
  if (!row) throw new Error("Missing native original Task owner")
  const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...row.data, id: row.id, type: row.type })
  if (message.type !== "assistant") throw new Error("Expected native original assistant")
  const duplicated = { ...message, content: [...message.content, before] }
  const encoded = Schema.encodeSync(SessionMessage.Assistant)(duplicated)
  const { id: _, type: __, ...data } = encoded
  yield* f.database.db.update(SessionMessageTable).set({ data }).where(eq(SessionMessageTable.id, row.id)).run()
  yield* f.offer({ ...f.retainedMetadata, workResult: f.result })
  const stored = yield* f.database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, row.id)).get()
  if (!stored) throw new Error("Duplicated native owner disappeared")
  expect(Schema.decodeUnknownSync(SessionMessage.Message)({ ...stored.data, id: stored.id, type: stored.type })).toEqual(duplicated)
  yield* f.database.db.update(SessionMessageTable).set({ data: row.data }).where(eq(SessionMessageTable.id, row.id)).run()
  yield* f.offer({ ...f.retainedMetadata, workResult: f.result })
  const accepted = yield* f.read()
  expect(accepted).toEqual({ ...before, state: { ...before.state,
    structured: { ...before.state.structured, metadata: { ...f.retainedMetadata, workResult: f.result } } } })
  expect(accepted).not.toEqual(before)
}))

dbIt.live("host observation refuses provider-executed and non-Task calls despite real lineage", () => Effect.gen(function* () {
  const f = yield* observationFixture("untrusted")
  const before = yield* f.read()
  const row = yield* f.database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, f.parentMessageID)).get()
  if (!row) throw new Error("Missing native original Task owner")
  const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...row.data, id: row.id, type: row.type })
  if (message.type !== "assistant") throw new Error("Expected native assistant")
  for (const call of [{ ...before, provider: { executed: true } }, { ...before, name: "unrelated" },
    { ...before, state: { ...before.state, input: { ...before.state.input, task_id: "ses_wrong_child" } } }]) {
    const encoded = Schema.encodeSync(SessionMessage.Assistant)({ ...message, content: [call] })
    const { id: _, type: __, ...data } = encoded
    yield* f.database.db.update(SessionMessageTable).set({ data }).where(eq(SessionMessageTable.id, f.parentMessageID)).run()
    yield* f.offer({ ...f.retainedMetadata, workResult: f.result })
    expect(yield* f.read()).toEqual(call)
  }
}))

dbIt.live("available legacy original Task conflicts veto native observation before trust", () => Effect.gen(function* () {
  const f = yield* observationFixture("original-dual", true)
  if (!f.original || f.original.state.status !== "completed") throw new Error("Missing completed legacy original Task")
  const original = f.original
  const state = f.original.state
  const before = yield* f.read()
  const offered = { ...f.retainedMetadata, workResult: f.result }
  const write = (part: Schema.Schema.Type<typeof SessionV1.ToolPart>) => {
    const encoded = Schema.encodeSync(SessionV1.ToolPart)(part)
    const { id: _, messageID: __, sessionID: ___, ...data } = encoded
    return f.database.db.update(PartTable).set({ data }).where(eq(PartTable.id, original.id)).run()
  }
  for (const part of [
    { ...original, state: { ...state, input: { ...state.input, task_id: "ses_other_child" } } },
    { ...original, state: { ...state, input: { ...state.input, subagent_type: "maestro" } } },
    { ...original, state: { ...state, metadata: { ...state.metadata, parentSessionId: f.childID } } },
    { ...original, state: { ...state, metadata: { ...state.metadata, sessionId: f.parentID } } },
    { ...original, metadata: { providerExecuted: true } },
    { ...original, tool: "read" },
    { ...original, callID: "other-call" },
    { ...original, state: { ...state, metadata: { ...state.metadata, workResult: { ...f.result,
      terminal: { reason: "interrupted", hostDetail: "Earlier retained interruption" } } } } },
    { ...original, state: { ...state, metadata: { ...state.metadata, interrupted: true } } },
    { ...original, state: { ...state, metadata: { ...state.metadata, upstreamSettlement: { conflicting: true } } } },
    { ...original, state: SessionV1.ToolStateError.make({ status: "error", input: state.input,
      error: "Actual retained Task error", metadata: state.metadata, time: { start: 1, end: 2 } }) },
  ]) {
    yield* write(part)
    yield* f.offer(offered)
    expect(yield* f.read()).toEqual(before)
  }
  const malformed: Pick<SessionV1.ToolPart, "type" | "callID"> = { type: "tool", callID: original.callID }
  yield* f.database.db.update(PartTable).set({ data: malformed }).where(eq(PartTable.id, original.id)).run()
  yield* f.offer(offered)
  expect(yield* f.read()).toEqual(before)
  yield* write(original)
  const owner = yield* f.database.db.select().from(MessageTable).where(eq(MessageTable.id, original.messageID)).get()
  if (!owner) throw new Error("Missing legacy original owner")
  const info = Schema.decodeUnknownSync(SessionV1.Info)({ ...owner.data, id: owner.id, sessionID: owner.session_id })
  if (info.role !== "assistant") throw new Error("Expected legacy original assistant")
  const malformedOwner: Pick<SessionV1.Assistant, "role" | "agent" | "time"> = { role: "assistant", agent: "maestro", time: { created: info.time.created } }
  yield* f.database.db.update(MessageTable).set({ data: malformedOwner }).where(eq(MessageTable.id, owner.id)).run()
  yield* f.offer(offered)
  expect(yield* f.read()).toEqual(before)
  const encoded = Schema.encodeSync(SessionV1.Assistant)({ ...info, agent: "walt" })
  const { id: _, sessionID: __, ...data } = encoded
  yield* f.database.db.update(MessageTable).set({ data }).where(eq(MessageTable.id, owner.id)).run()
  yield* f.offer(offered)
  expect(yield* f.read()).toEqual(before)
  yield* f.database.db.update(MessageTable).set({ data: owner.data, session_id: f.childID }).where(eq(MessageTable.id, owner.id)).run()
  yield* f.offer(offered)
  expect(yield* f.read()).toEqual(before)
  yield* f.database.db.update(MessageTable).set({ session_id: owner.session_id }).where(eq(MessageTable.id, owner.id)).run()
  const duplicate = { ...original, id: SessionV1.PartID.make("prt_observation_duplicate") }
  yield* f.events.publish(SessionV1.Event.PartUpdated, { sessionID: f.parentID, time: 1, part: duplicate })
  yield* f.offer(offered)
  expect(yield* f.read()).toEqual(before)
  yield* f.events.publish(SessionV1.Event.PartRemoved, { sessionID: f.parentID, messageID: original.messageID, partID: duplicate.id })
  yield* f.events.publish(SessionV1.Event.PartRemoved, { sessionID: f.parentID, messageID: original.messageID, partID: original.id })
  yield* f.offer(offered)
  expect(yield* f.read()).toEqual(before)
  yield* f.events.publish(SessionV1.Event.PartUpdated, { sessionID: f.parentID, time: 1, part: original })
  yield* f.offer(offered)
  const accepted = yield* f.read()
  expect(accepted).toEqual({ ...before, state: { ...before.state,
    structured: { ...before.state.structured, metadata: { ...f.retainedMetadata, workResult: f.result } } } })
  const retained = yield* f.database.db.select().from(PartTable).where(eq(PartTable.id, original.id)).get()
  if (!retained) throw new Error("Compatible legacy original disappeared")
  expect(retained.data).toMatchObject({ type: "tool", callID: original.callID, state: { metadata: f.retainedMetadata } })
}))

dbIt.live("stored returned-author completion, agent and role conflicts veto either dual view", () => Effect.gen(function* () {
  const f = yield* observationFixture("stored-author")
  const before = yield* f.read()
  const offered = { ...f.retainedMetadata, workResult: f.result }
  const modern = yield* f.database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, f.authorMessageID)).get()
  const legacy = yield* f.database.db.select().from(MessageTable).where(eq(MessageTable.id, SessionV1.MessageID.make(f.authorMessageID))).get()
  if (!modern || !legacy) throw new Error("Expected both stored returned-author views")
  const author = Schema.decodeUnknownSync(SessionMessage.Message)({ ...modern.data, id: modern.id, type: modern.type })
  const old = Schema.decodeUnknownSync(SessionV1.Info)({ ...legacy.data, id: legacy.id, sessionID: legacy.session_id })
  if (author.type !== "assistant" || old.role !== "assistant") throw new Error("Expected stored returned assistants")
  for (const message of [
    { ...author, time: { created: author.time.created } },
    { ...author, agent: "maestro" },
    SessionMessage.User.make({ id: author.id, type: "user", text: "Not a returned assistant", time: { created: author.time.created } }),
  ]) {
    const encoded = Schema.encodeSync(SessionMessage.Message)(message)
    const { id: _, type, ...data } = encoded
    yield* f.database.db.update(SessionMessageTable).set({ type, data }).where(eq(SessionMessageTable.id, modern.id)).run()
    yield* f.offer(offered)
    expect(yield* f.read()).toEqual(before)
    yield* f.database.db.update(SessionMessageTable).set({ type: modern.type, data: modern.data }).where(eq(SessionMessageTable.id, modern.id)).run()
  }
  const user: Pick<SessionV1.User, "role" | "agent" | "model" | "time"> = { role: "user", agent: "walt",
    model: { providerID: old.providerID, modelID: old.modelID }, time: { created: legacy.data.time.created } }
  for (const data of [
    { ...legacy.data, time: { created: legacy.data.time.created } },
    { ...legacy.data, agent: "maestro" },
    user,
  ]) {
    yield* f.database.db.update(MessageTable).set({ data }).where(eq(MessageTable.id, legacy.id)).run()
    yield* f.offer(offered)
    expect(yield* f.read()).toEqual(before)
    yield* f.database.db.update(MessageTable).set({ data: legacy.data }).where(eq(MessageTable.id, legacy.id)).run()
  }
  yield* f.database.db.update(MessageTable).set({ session_id: f.parentID }).where(eq(MessageTable.id, legacy.id)).run()
  yield* f.offer(offered)
  expect(yield* f.read()).toEqual(before)
  yield* f.database.db.update(MessageTable).set({ session_id: legacy.session_id }).where(eq(MessageTable.id, legacy.id)).run()
  yield* f.offer(offered)
  expect((yield* f.read()).state.structured.metadata).toMatchObject({ workResult: f.result })
}))

dbIt.live("first interrupted observation requires matching actual parent and child workspace", () => Effect.gen(function* () {
  const f = yield* observationFixture("first-interrupted")
  const before = yield* f.read()
  const parentWorkspace = WorkspaceV2.ID.make("wrk_observation_parent")
  const childWorkspace = WorkspaceV2.ID.make("wrk_observation_child")
  yield* f.database.db.insert(WorkspaceTable).values([
    { id: parentWorkspace, type: "worktree", project_id: f.projectID, directory: "/project" },
    { id: childWorkspace, type: "worktree", project_id: f.projectID, directory: "/project" },
  ]).run()
  yield* f.database.db.update(SessionTable).set({ workspace_id: parentWorkspace }).where(eq(SessionTable.id, f.parentID)).run()
  yield* f.database.db.update(SessionTable).set({ workspace_id: childWorkspace }).where(eq(SessionTable.id, f.childID)).run()
  const location = Location.Ref.make({ directory: AbsolutePath.make("/project"), workspaceID: parentWorkspace })
  const interrupted = { ...f.result, terminal: { reason: "interrupted", hostDetail: "Host cancelled after returned assistant" } }
  const offered = { ...f.retainedMetadata, workResult: interrupted }
  yield* f.offer(offered, {}, location)
  expect(yield* f.read()).toEqual(before)
  yield* f.database.db.update(SessionTable).set({ workspace_id: parentWorkspace }).where(eq(SessionTable.id, f.childID)).run()
  yield* f.offer(offered, {}, location)
  expect(yield* f.read()).toEqual({ ...before, state: { ...before.state,
    structured: { ...before.state.structured, metadata: { ...f.retainedMetadata, workResult: interrupted } } } })
}))

dbIt.live("live observation without Location refuses caller replay metadata for durable and local-only publish", () => Effect.gen(function* () {
  const f = yield* observationFixture("missing-location")
  const before = yield* f.read()
  const origins: boolean[] = []
  yield* f.events.project(SessionEvent.Tool.Progress, (_event, origin) => Effect.sync(() => { origins.push(origin.replay) }))
  for (const persist of [true, false]) {
    yield* f.events.publish(SessionEvent.Tool.Progress, { sessionID: f.parentID, assistantMessageID: f.parentMessageID,
      callID: "original-task", timestamp, structured: { replay: true, metadata: { ...f.retainedMetadata, replay: true, workResult: f.result } }, content: [] },
    { metadata: { replay: true }, persist })
    expect(yield* f.read()).toEqual(before)
  }
  expect(origins).toEqual([false, false])
}))

dbIt.live("trusted serialized replay reconstructs the same eligible host-observation projection as live publish", () => Effect.gen(function* () {
  const f = yield* observationFixture("replay-source")
  const workspaceID = WorkspaceV2.ID.make("wrk_observation_replay")
  yield* f.database.db.insert(WorkspaceTable).values({ id: workspaceID, type: "worktree", project_id: f.projectID, directory: "/project" }).run()
  yield* f.database.db.update(SessionTable).set({ workspace_id: workspaceID }).where(eq(SessionTable.id, f.parentID)).run()
  yield* f.database.db.update(SessionTable).set({ workspace_id: workspaceID }).where(eq(SessionTable.id, f.childID)).run()
  const before = yield* f.read()
  const expected = { ...before, state: { ...before.state,
    structured: { ...before.state.structured, metadata: { ...f.retainedMetadata, workResult: f.result } } } }
  yield* f.offer({ ...f.retainedMetadata, workResult: f.result }, {},
    Location.Ref.make({ directory: AbsolutePath.make("/project"), workspaceID }))
  const live = yield* f.read()
  expect(live).toEqual(expected)
  expect(live).not.toEqual(before)
  const project = yield* f.database.db.select().from(ProjectTable).where(eq(ProjectTable.id, f.projectID)).get()
  const parent = yield* f.database.db.select().from(SessionTable).where(eq(SessionTable.id, f.parentID)).get()
  const child = yield* f.database.db.select().from(SessionTable).where(eq(SessionTable.id, f.childID)).get()
  const workspace = yield* f.database.db.select().from(WorkspaceTable).where(eq(WorkspaceTable.id, workspaceID)).get()
  const history = yield* f.database.db.select().from(EventTable).all()
  if (!project || !parent || !child || !workspace) throw new Error("Missing live replay source facts")
  const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
  const replayLayer = AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionProjector.node]),
    [[Database.node, Database.layerFromPath(path.join(tmp.path, "replay.sqlite"))]])
  yield* Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    yield* database.db.insert(ProjectTable).values(project).run()
    yield* database.db.insert(WorkspaceTable).values(workspace).run()
    yield* database.db.insert(SessionTable).values([parent, child]).run()
    const origins: boolean[] = []
    yield* events.project(SessionEvent.Tool.Progress, (_event, origin) => Effect.sync(() => { origins.push(origin.replay) }))
    for (const aggregateID of [f.childID, f.parentID]) {
      yield* events.replayAll(history.filter((row) => row.aggregate_id === aggregateID).sort((a, b) => a.seq - b.seq)
        .map((row) => ({ id: row.id, type: row.type, seq: row.seq, aggregateID: row.aggregate_id, data: row.data })))
    }
    const row = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, f.parentMessageID)).get()
    if (!row) throw new Error("Missing reconstructed native original Task")
    const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...row.data, id: row.id, type: row.type })
    expect(tool({ messages: [message] })).toEqual(expected)
    expect(tool({ messages: [message] })).toEqual(live)
    expect(origins).toEqual([true])
  }).pipe(Effect.provide(Layer.fresh(replayLayer)))
}))

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
  it.effect("unbacked memory adapter cannot authorize receipt-free completed Task observation", () => Effect.gen(function* () {
    const current = fixture()
    const metadata = { parentSessionId: sessionID, sessionId: "ses_child", background: true,
      workResult: { schema: workResult.schema, taskId: workResult.taskId, card: { parsed: false }, terminal: { reason: "running" } } }
    yield* SessionMessageUpdater.update(current.adapter, success({ metadata }))
    const before = structuredClone(tool(current.state))
    yield* SessionMessageUpdater.update(current.adapter, progress({ metadata: { ...metadata,
      workResult: { ...workResult, terminal: { reason: "failed", hostDetail: "Caller-only failure claim" } } } }))
    expect(tool(current.state)).toEqual(before)
    expect(tool(current.state).state.structured.metadata).not.toHaveProperty("upstreamSettlement")
  }))

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
