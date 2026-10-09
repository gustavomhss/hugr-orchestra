import { afterEach, expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { AgentV2 } from "@orchestra/core/agent"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionV1 } from "@orchestra/core/v1/session"
import { PartTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { eq } from "drizzle-orm"
import { DateTime, Effect, Schema } from "effect"
import { BackgroundJob } from "@/background/job"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { BackendResult } from "@/maestro/backend-result"
import { LogicalTask } from "@/maestro/logical-task"
import { Seats } from "@/maestro/seats"
import { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { PromptIdentity } from "@/session/prompt-identity"
import { SessionPrompt } from "@/session/prompt"
import { UpstreamTaskSettlement } from "@/session/upstream-task-settlement"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(disposeAllInstances)
const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  filesystem, CrossSpawnSpawner.node, BackgroundJob.node, Session.node,
  SessionProjector.node, EventV2Bridge.node, Database.node,
]), [[RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })]]))
const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") }
const text = '```upstream-result\n{"outcome":"done","artifacts":[{"kind":"plan","path":"proposal.md"}],"blockers":[],"risks":[],"nextActions":[]}\n```'

function assistant(sessionID: SessionID, agent: string): SessionV1.Assistant {
  return { id: MessageID.ascending(), sessionID, role: "assistant", parentID: MessageID.ascending(), agent, mode: agent,
    modelID: model.modelID, providerID: model.providerID, path: { cwd: "/tmp", root: "/tmp" }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: Date.now(), completed: Date.now() }, finish: "stop" }
}

const seed = Effect.fn("PrivateSettlementTest.seed")(function* () {
  const sessions = yield* Session.Service
  const events = yield* EventV2Bridge.Service
  const database = yield* Database.Service
  const parent = yield* sessions.create({ agent: "maestro" })
  const child = yield* sessions.create({ parentID: parent.id, agent: "walt" })
  const logical = yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: parent.id,
    projectID: parent.projectID, memberID: "walt", source: "host" })
  const author = yield* sessions.updateMessage(assistant(child.id, "walt"))
  const proposal = yield* sessions.updatePart({ id: PartID.ascending(), messageID: author.id, sessionID: child.id, type: "text", text })
  const workResult = { ...BackendResult.assemble({ info: author, parts: [proposal] }, [], Seats.all.walt), taskId: logical.taskId }
  const owner = yield* sessions.updateMessage(assistant(parent.id, "maestro"))
  const metadata = { parentSessionId: parent.id, sessionId: child.id, background: true, workResult, retained: "current" }
  const state: SessionV1.ToolStateCompleted = { status: "completed", input: { subagent_type: "walt" }, title: "proposal",
    output: "started", time: { start: Date.now(), end: Date.now() }, metadata }
  const task = yield* sessions.updatePart({ id: PartID.ascending(), messageID: owner.id, sessionID: parent.id,
    type: "tool", tool: "task", callID: `call-${owner.id}`, state })
  const base = { sessionID: parent.id, assistantMessageID: SessionMessage.ID.make(owner.id), callID: task.callID }
  yield* events.publish(SessionEvent.Step.Started, { ...base, agent: AgentV2.ID.make("maestro"),
    model: { id: model.modelID, providerID: model.providerID }, timestamp: yield* DateTime.now })
  yield* events.publish(SessionEvent.Tool.Input.Started, { ...base, name: "task", timestamp: yield* DateTime.now })
  yield* events.publish(SessionEvent.Tool.Called, { ...base, tool: "task", input: state.input,
    provider: { executed: false }, timestamp: yield* DateTime.now })
  yield* events.publish(SessionEvent.Tool.Progress, { ...base, structured: { metadata }, content: [], timestamp: yield* DateTime.now })
  yield* events.publish(SessionEvent.Tool.Success, { ...base, structured: { metadata }, content: [],
    provider: { executed: false }, timestamp: yield* DateTime.now })
  const request = { sessionID: parent.id, messageID: MessageID.ascending(), agent: "maestro", model,
    parts: [{ type: "text" as const, text, synthetic: true,
      metadata: { source: { type: "task-return", task_id: child.id, state: "completed" }, workResult } }] }
  const admitted = yield* sessions.admitPrompt({ sessionID: parent.id, messageID: request.messageID, identityVersion: 1,
    identity: PromptIdentity.fromEncoded(Schema.encodeSync(SessionPrompt.PromptInput)(request)),
    info: { id: request.messageID, sessionID: parent.id, role: "user", agent: "maestro", model, time: { created: Date.now() } },
    parts: request.parts.map((part) => ({ ...part, id: PartID.ascending(), messageID: request.messageID, sessionID: parent.id })) })
  const modernDelivery = yield* database.db.select().from(SessionMessageTable)
    .where(eq(SessionMessageTable.id, SessionMessage.ID.make(request.messageID))).get().pipe(Effect.orDie)
  if (!modernDelivery) yield* events.publish(SessionEvent.Synthetic, { sessionID: parent.id,
    messageID: SessionMessage.ID.make(request.messageID), text, timestamp: yield* DateTime.now })
  const input: Session.TaskSettlementInput = { sessionID: parent.id, parentMessageID: owner.id, parentCallID: task.callID,
    childSessionID: child.id, logicalTaskID: logical.taskId, authorMessageID: author.id, workResult,
    deliveryMessageID: request.messageID, deliveryPartID: admitted.message.parts[0]?.id }
  const modern = () => database.db.select().from(SessionMessageTable)
    .where(eq(SessionMessageTable.id, SessionMessage.ID.make(owner.id))).get().pipe(Effect.orDie)
  const legacy = () => sessions.getPart({ sessionID: parent.id, messageID: owner.id, partID: task.id })
  const progress = () => database.db.select().from(EventTable)
    .where(eq(EventTable.aggregate_id, parent.id)).all().pipe(Effect.orDie,
      Effect.map((rows) => rows.filter((row) => row.type === EventV2.versionedType(SessionEvent.Tool.Progress.type, 1))))
  return { sessions, database, events, input, parent, child, task, owner, author, proposal, state, modern, legacy, progress }
})

it.instance("original Task A anchors cannot be repaired by Task B caller claims", () => Effect.gen(function* () {
  const f = yield* seed()
  const other = yield* f.sessions.create({ parentID: f.parent.id, agent: "walt" })
  const logical = yield* LogicalTask.ensure({ executionSessionID: other.id, authoritySessionID: f.parent.id,
    projectID: f.parent.projectID, memberID: "walt", source: "host" })
  const before = yield* f.modern()
  expect((yield* Effect.flip(f.sessions.settleUpstreamTask({ ...f.input, childSessionID: other.id, logicalTaskID: logical.taskId,
    workResult: { ...f.input.workResult, taskId: logical.taskId, author: { memberId: "walt", executionSessionID: other.id,
      messageID: f.author.id } } }))).reason).toBe("UPSTREAM_SETTLEMENT_TASK_ANCHOR_MISMATCH")
  expect(yield* f.modern()).toEqual(before)
}))

it.instance("stored proposal bytes reject unrelated caller-assembled capture", () => Effect.gen(function* () {
  const f = yield* seed()
  expect((yield* Effect.flip(f.sessions.settleUpstreamTask({ ...f.input,
    workResult: { ...f.input.workResult, artifacts: [{ kind: "plan", path: "unrelated.md" }] } }))).reason)
    .toBe("UPSTREAM_SETTLEMENT_PROPOSAL_MISMATCH")
}))

it.instance("unrelated owned synthetic delivery cannot settle selected proposal", () => Effect.gen(function* () {
  const f = yield* seed()
  const deliveryMessageID = SessionMessage.ID.make(MessageID.ascending())
  yield* f.events.publish(SessionEvent.Synthetic, { sessionID: f.parent.id, messageID: deliveryMessageID,
    text: "unrelated Task", timestamp: yield* DateTime.now })
  expect((yield* Effect.flip(f.sessions.settleUpstreamTask({ ...f.input, deliveryMessageID, deliveryPartID: undefined }))).reason)
    .toBe("UPSTREAM_SETTLEMENT_DELIVERY_MISMATCH")
}))

it.instance("caller failure cannot lower stored successful proposal without original host observation", () => Effect.gen(function* () {
  const f = yield* seed()
  expect((yield* Effect.flip(f.sessions.settleUpstreamTask({ ...f.input, workResult: { ...f.input.workResult,
    terminal: { reason: "failed", hostDetail: "caller claim" } } }))).reason).toBe("UPSTREAM_SETTLEMENT_PROPOSAL_MISMATCH")
}))

it.instance("retained legacy delivery requires exact selected synthetic part even with modern mirror", () => Effect.gen(function* () {
  const f = yield* seed()
  expect((yield* Effect.flip(f.sessions.settleUpstreamTask({ ...f.input, deliveryPartID: undefined }))).reason)
    .toBe("UPSTREAM_SETTLEMENT_DELIVERY_MISMATCH")
}))

it.instance("compatible dual stores settle both views; exact retry publishes nothing", () => Effect.gen(function* () {
  const f = yield* seed()
  expect(yield* f.sessions.settleUpstreamTask(f.input)).toBe(true)
  const before = yield* f.progress()
  expect(yield* f.sessions.settleUpstreamTask(f.input)).toBe(false)
  expect(yield* f.progress()).toEqual(before)
  const part = yield* f.legacy()
  if (part?.type !== "tool" || part.state.status === "pending") throw new Error("expected retained Task")
  expect(part.state.metadata).toMatchObject({ retained: "current", upstreamSettlement: { deliveryPartID: f.input.deliveryPartID } })
}))

it.instance("late retained legacy conflict holds before modern publication", () => Effect.gen(function* () {
  const f = yield* seed()
  const before = yield* f.modern()
  const progress = yield* f.progress()
  yield* f.database.db.update(PartTable).set({ data: { type: "tool", tool: "task", callID: f.task.callID,
    state: { ...f.state, metadata: { ...f.state.metadata, upstreamSettlement: { ...f.input, parentCallID: "other" } } } } })
    .where(eq(PartTable.id, f.task.id)).run().pipe(Effect.orDie)
  expect((yield* Effect.flip(f.sessions.settleUpstreamTask(f.input))).reason).toBe("UPSTREAM_SETTLEMENT_CONFLICT")
  expect(yield* f.modern()).toEqual(before)
  expect(yield* f.progress()).toEqual(progress)
}))

it.instance("current failure dominates stale completion and preserves concurrent metadata", () => Effect.gen(function* () {
  const f = yield* seed()
  const metadata = { ...f.state.metadata, concurrent: "keep", workResult: { ...f.input.workResult,
    terminal: { reason: "failed", hostDetail: "current host failure" } } }
  yield* f.sessions.updatePart({ ...f.task, state: { ...f.state, metadata } })
  expect((yield* Effect.flip(f.sessions.settleUpstreamTask(f.input))).reason).toBe("UPSTREAM_SETTLEMENT_TERMINAL_CONFLICT")
  const part = yield* f.legacy()
  if (part?.type !== "tool" || part.state.status === "pending") throw new Error("expected retained Task")
  expect(part.state.metadata).toEqual(metadata)
}))

it.instance("typed projection preserves fields changed between preflight and receipt publication", () => Effect.gen(function* () {
  const f = yield* seed()
  const changed = { value: false }
  const events: EventV2.Interface = { ...f.events, publish: (definition, data, options) => Effect.gen(function* () {
    if (!changed.value && definition.type === SessionEvent.Tool.Progress.type) {
      changed.value = true
      yield* f.database.db.update(PartTable).set({ data: { type: "tool", tool: "task", callID: f.task.callID,
        state: { ...f.state, metadata: { ...f.state.metadata, concurrent: "keep" } } } })
        .where(eq(PartTable.id, f.task.id)).run().pipe(Effect.orDie)
    }
    return yield* f.events.publish(definition, data, options)
  }) }
  const settle = UpstreamTaskSettlement.make({ database: f.database, events })
  expect(yield* settle(f.input)).toBe(true)
  const part = yield* f.legacy()
  if (part?.type !== "tool" || part.state.status === "pending") throw new Error("expected retained Task")
  expect(part.state.metadata).toMatchObject({ concurrent: "keep", retained: "current",
    upstreamSettlement: { deliveryMessageID: f.input.deliveryMessageID } })
}))
