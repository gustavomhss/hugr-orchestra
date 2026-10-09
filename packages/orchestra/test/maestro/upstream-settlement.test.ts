import { afterEach, expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { AgentV2 } from "@orchestra/core/agent"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionMessageUpdater } from "@orchestra/core/session/message-updater"
import { MessageTable, SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { SessionV1 } from "@orchestra/core/v1/session"
import { SessionEvent } from "@orchestra/schema/session-event"
import { SessionMessage } from "@orchestra/schema/session-message"
import { eq } from "drizzle-orm"
import { DateTime, Effect, Exit, Schema } from "effect"
import { omit } from "remeda"
import { EventV2Bridge } from "@/event-v2-bridge"
import { BackgroundJob } from "@/background/job"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { SeatWork } from "@/maestro/backend-work"
import { LogicalTask } from "@/maestro/logical-task"
import { Seats } from "@/maestro/seats"
import { UpstreamSettlement } from "@/maestro/upstream-settlement"
import { MessageV2 } from "@/session/message-v2"
import { PromptIdentity } from "@/session/prompt-identity"
import { SessionPrompt } from "@/session/prompt"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import type { TaskPromptOps } from "@/tool/task"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(disposeAllInstances)
const it = testEffect(TestAppNodeBuilder.build(
  LayerNode.group([filesystem, CrossSpawnSpawner.node, BackgroundJob.node, Session.node, SessionProjector.node, EventV2.node, EventV2Bridge.node, Database.node]),
  [[RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })]],
))
const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const text = '```upstream-result\n{"outcome":"done","artifacts":[{"kind":"plan","path":"proposal.md"}],"blockers":[],"risks":[],"nextActions":[]}\n```'

function assistant(sessionID: SessionID, agent: string): SessionV1.Assistant {
  return { id: MessageID.ascending(), sessionID, role: "assistant", parentID: MessageID.ascending(), agent, mode: agent,
    modelID: model.modelID, providerID: model.providerID, path: { cwd: "/tmp", root: "/tmp" }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: Date.now(), completed: Date.now() }, finish: "stop" }
}

const seed = Effect.fn("SettlementTest.seed")(function* (modern = false, running = false) {
  const sessions = yield* Session.Service
  const events = yield* EventV2Bridge.Service
  const database = yield* Database.Service
  const parent = yield* sessions.create({ agent: "maestro", title: "settlement authority" })
  const child = yield* sessions.create({ parentID: parent.id, agent: "walt", title: "returned assistant" })
  const logical = yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: parent.id,
    projectID: parent.projectID, memberID: "walt", source: "host" })
  const owner = assistant(parent.id, "maestro")
  const author = yield* sessions.updateMessage(assistant(child.id, "walt"))
  const part = yield* sessions.updatePart({ id: PartID.ascending(), messageID: author.id, sessionID: child.id, type: "text", text })
  const metadata = { parentSessionId: parent.id, sessionId: child.id, background: true }
  const callID = `call-${owner.id}`
  const state: SessionV1.ToolStateCompleted = { status: "completed", input: { subagent_type: "walt" }, title: "proposal",
    output: "started", time: { start: Date.now(), end: Date.now() }, metadata }
  if (!modern) yield* sessions.updateMessage(owner)
  const task = !modern ? yield* sessions.updatePart({ id: PartID.ascending(), messageID: owner.id,
    sessionID: parent.id, type: "tool", tool: "task", callID, state }) : undefined
  if (modern) {
    const base = { sessionID: parent.id, assistantMessageID: SessionMessage.ID.make(owner.id), callID }
    yield* events.publish(SessionEvent.Step.Started, { ...base, agent: AgentV2.ID.make("maestro"), model: { id: model.modelID, providerID: model.providerID }, timestamp: yield* DateTime.now })
    yield* events.publish(SessionEvent.Tool.Input.Started, { ...base, name: "task", timestamp: yield* DateTime.now })
    yield* events.publish(SessionEvent.Tool.Called, { ...base, tool: "task", input: state.input, provider: { executed: false }, timestamp: yield* DateTime.now })
    yield* events.publish(SessionEvent.Tool.Progress, { ...base, structured: { metadata }, content: [], timestamp: yield* DateTime.now })
    if (!running) yield* events.publish(SessionEvent.Tool.Success, { ...base, structured: { metadata }, content: [], provider: { executed: false }, timestamp: yield* DateTime.now })
  }
  const work = SeatWork.track({ enabled: true, seat: Seats.all.walt, sessionID: child.id, taskId: logical.taskId,
    publish: () => Effect.void })
  const result = yield* work.record({ info: author, parts: [part] })
  if (!result) throw new Error("expected captured work result")
  const capture: UpstreamSettlement.Capture = { assistantMessageID: author.id, workResult: result, text, state: "completed" }
  const request = { sessionID: parent.id, messageID: MessageID.ascending(), agent: "maestro", model,
    parts: [{ type: "text" as const, synthetic: true, text,
      metadata: { source: { type: "task-return", task_id: child.id, state: "completed" } } }] }
  const counters = { wake: 0, admit: 0 }
  const ops: TaskPromptOps = {
    cancel: () => Effect.void,
    resumeNotice: (sessionID) => Effect.sync(() => {
      expect(sessionID).toBe(parent.id)
      counters.wake++
    }),
    resolvePromptParts: (value) => Effect.succeed([{ type: "text", text: value }]),
    prompt: (input) => Effect.gen(function* () {
      if (modern) throw new Error("V2 notice must not enter V1 prompt transport")
      if (!input.messageID) throw new Error("expected exact notice identity")
      const messageID = MessageID.make(input.messageID)
      counters.admit++
      const identity = PromptIdentity.fromEncoded(Schema.encodeSync(SessionPrompt.PromptInput)(input))
      const previous = yield* sessions.reconcilePrompt({ sessionID: input.sessionID, messageID, identity })
      const user: SessionV1.User = { id: messageID, sessionID: input.sessionID, role: "user", agent: "maestro", model, time: { created: Date.now() } }
      const admitted = previous ?? (yield* sessions.admitPrompt({ sessionID: input.sessionID, messageID,
        identityVersion: 1, identity, info: user, parts: input.parts.flatMap((item) => item.type === "text" ?
          [{ ...item, id: PartID.ascending(), messageID, sessionID: input.sessionID }] : []) })).message
      if (!input.noReply) counters.wake++
      return admitted
    }).pipe(Effect.orDie),
  }
  const deliver = (selected = capture, transport = ops) => UpstreamSettlement.make({ sessionID: parent.id, messageID: owner.id,
    callID, childSessionID: child.id, taskID: logical.taskId, ops: transport,
    request: { ...request, parts: request.parts.map((part) => ({ ...part,
      metadata: { ...part.metadata, workResult: selected.workResult,
        source: { ...part.metadata.source, state: selected.state } } })) }, capture: selected })
  const read = () => Effect.gen(function* () {
    if (modern) {
      const row = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, SessionMessage.ID.make(owner.id))).get().pipe(Effect.orDie)
      if (!row) throw new Error("parent projection missing")
      const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...row.data, id: row.id, type: row.type })
      if (message.type !== "assistant") throw new Error("expected assistant")
      const tool = message.content.find((item) => item.type === "tool" && item.id === callID)
      if (tool?.type !== "tool" || !("structured" in tool.state)) throw new Error("expected Task")
      return tool.state.structured.metadata
    }
    if (!task) throw new Error("expected legacy part")
    const stored = yield* sessions.getPart({ sessionID: parent.id, messageID: owner.id, partID: task.id })
    if (stored?.type !== "tool" || stored.state.status === "pending") throw new Error("expected settled Task")
    return stored.state.metadata
  })
  return { sessions, events, database, parent, child, owner, author, work, capture, request, counters, ops, deliver, read, task, state, callID }
})

it.instance("returned assistant stays bound after same-child resume with identical bytes", () => Effect.gen(function* () {
  const f = yield* seed()
  const later = yield* f.sessions.updateMessage(assistant(f.child.id, "walt"))
  yield* f.sessions.updatePart({ id: PartID.ascending(), messageID: later.id, sessionID: f.child.id, type: "text", text })
  expect(yield* f.work.notice("completed", text)).toEqual(f.capture.workResult)
  yield* f.deliver()()
  expect(yield* f.read()).toMatchObject({ upstreamSettlement: { workResult: { author: { messageID: f.author.id } }, deliveryMessageID: f.request.messageID } })
  const notice = yield* MessageV2.get({ sessionID: f.parent.id, messageID: f.request.messageID })
  expect(yield* f.read()).toMatchObject({ upstreamSettlement: { deliveryPartID: notice.parts[0]?.id } })
}))

it.instance("completed-but-undelivered and forged notice cannot patch Task", () => Effect.gen(function* () {
  const f = yield* seed()
  const jobs = yield* BackgroundJob.Service
  yield* jobs.start({ id: f.child.id, type: "task", title: "completed without delivery", run: Effect.succeed(text) })
  const completed = yield* jobs.wait({ id: f.child.id })
  expect(completed.info?.status).toBe("completed")
  const forged = yield* f.sessions.updateMessage({ id: MessageID.ascending(), sessionID: f.parent.id, role: "user", agent: "maestro", model, time: { created: Date.now() } })
  yield* f.sessions.updatePart({ id: PartID.ascending(), messageID: forged.id, sessionID: f.parent.id, ...f.request.parts[0] })
  const fail: TaskPromptOps = { ...f.ops, prompt: () => Effect.die(new Error("admission failed")) }
  expect(Exit.isFailure(yield* Effect.exit(f.deliver(f.capture, fail)()))).toBe(true)
  expect(yield* f.read()).not.toHaveProperty("upstreamSettlement")
  expect(f.counters.wake).toBe(0)
}))

it.instance("two resumed dispatches retain separate assistant and delivery identities on same child", () => Effect.gen(function* () {
  const f = yield* seed()
  const later = yield* f.sessions.updateMessage(assistant(f.child.id, "walt"))
  const part = yield* f.sessions.updatePart({ id: PartID.ascending(), messageID: later.id, sessionID: f.child.id, type: "text", text })
  const result = yield* f.work.record({ info: later, parts: [part] })
  if (!result || !f.task) throw new Error("expected second captured result")
  const callID = `${f.callID}-resume`
  const second = yield* f.sessions.updatePart({ ...f.task, id: PartID.ascending(), callID })
  const request = { ...f.request, messageID: MessageID.ascending(),
    parts: f.request.parts.map((part) => ({ ...part, metadata: { ...part.metadata, workResult: result } })) }
  const deliver = UpstreamSettlement.make({ sessionID: f.parent.id, messageID: f.owner.id, callID,
    childSessionID: f.child.id, taskID: result.taskId ?? "", ops: f.ops, request,
    capture: { assistantMessageID: later.id, workResult: result, text, state: "completed" } })
  yield* deliver()
  yield* f.deliver()()
  expect(yield* f.read()).toMatchObject({ upstreamSettlement: { workResult: { author: { messageID: f.author.id } }, deliveryMessageID: f.request.messageID } })
  const stored = yield* f.sessions.getPart({ sessionID: f.parent.id, messageID: f.owner.id, partID: second.id })
  if (stored?.type !== "tool" || stored.state.status === "pending") throw new Error("expected second Task")
  expect(stored.state.metadata).toMatchObject({ upstreamSettlement: { parentCallID: callID,
    workResult: { author: { messageID: later.id } }, deliveryMessageID: request.messageID } })
}))

it.instance("fault after durable admission reconciles exact ID and wakes once", () => Effect.gen(function* () {
  const f = yield* seed()
  const fault = { once: true }
  const ops: TaskPromptOps = { ...f.ops, prompt: (input) => f.ops.prompt(input).pipe(Effect.flatMap((message) => {
    if (input.noReply && fault.once) { fault.once = false; return Effect.die(new Error("after admission")) }
    return Effect.succeed(message)
  })) }
  const deliver = f.deliver(f.capture, ops)
  expect(Exit.isFailure(yield* Effect.exit(deliver()))).toBe(true)
  expect(yield* f.read()).not.toHaveProperty("upstreamSettlement")
  yield* deliver()
  yield* deliver()
  const rows = yield* f.database.db.select().from(MessageTable).where(eq(MessageTable.id, f.request.messageID)).all().pipe(Effect.orDie)
  expect(rows).toHaveLength(1)
  expect(f.counters.wake).toBe(1)
}))

it.instance("interrupted admission leaves receipt absent", () => Effect.gen(function* () {
  const f = yield* seed()
  const ops: TaskPromptOps = { ...f.ops, prompt: () => Effect.interrupt }
  expect(Exit.isFailure(yield* Effect.exit(f.deliver(f.capture, ops)()))).toBe(true)
  expect(yield* f.read()).not.toHaveProperty("upstreamSettlement")
}))

it.instance("V2 terminal Task accepts exact progress receipt referencing durable synthetic projection", () => Effect.gen(function* () {
  const f = yield* seed(true)
  const deliver = f.deliver()
  yield* deliver()
  yield* deliver()
  expect(yield* f.read()).toMatchObject({ upstreamSettlement: { deliveryMessageID: f.request.messageID, parentMessageID: f.owner.id } })
  const row = yield* f.database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, SessionMessage.ID.make(f.request.messageID))).get().pipe(Effect.orDie)
  expect(row?.type).toBe("synthetic")
  expect(yield* f.read()).not.toHaveProperty("upstreamSettlement.deliveryPartID")
  const events = yield* f.database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, f.parent.id)).all().pipe(Effect.orDie)
  expect(events.filter((event) => event.type === EventV2.versionedType(SessionEvent.Synthetic.type, 1) &&
    event.data.messageID === f.request.messageID)).toHaveLength(1)
  const legacy = yield* f.database.db.select().from(MessageTable).where(eq(MessageTable.id, f.request.messageID)).get().pipe(Effect.orDie)
  expect(legacy).toBeUndefined()
  expect(f.counters.admit).toBe(0)
  expect(f.counters.wake).toBe(1)
}))

it.instance("V2 conflicting synthetic identity is held without append or resume", () => Effect.gen(function* () {
  const f = yield* seed(true)
  yield* f.events.publish(SessionEvent.Synthetic, { sessionID: f.parent.id, messageID: SessionMessage.ID.make(f.request.messageID),
    timestamp: yield* DateTime.now, text: "other dispatch" })
  expect(Exit.isFailure(yield* Effect.exit(f.deliver()()))).toBe(true)
  expect(yield* f.read()).not.toHaveProperty("upstreamSettlement")
  expect(f.counters.admit).toBe(0)
  expect(f.counters.wake).toBe(0)
}))

it.instance("V2 fault after native Synthetic commit reconciles existing projection without second append", () => Effect.gen(function* () {
  const f = yield* seed(true)
  const fault = { once: true }
  const events = EventV2Bridge.Service.of({ ...f.events, publish: (definition, data, options) =>
    f.events.publish(definition, data, options).pipe(Effect.flatMap((event) => {
      if (definition.type === SessionEvent.Synthetic.type && fault.once) {
        fault.once = false
        return Effect.die(new Error("after native Synthetic commit"))
      }
      return Effect.succeed(event)
    })) })
  const deliver = f.deliver()
  expect(Exit.isFailure(yield* Effect.exit(deliver().pipe(Effect.provideService(EventV2Bridge.Service, events))))).toBe(true)
  expect(yield* f.read()).not.toHaveProperty("upstreamSettlement")
  yield* deliver().pipe(Effect.provideService(EventV2Bridge.Service, events))
  const rows = yield* f.database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, f.parent.id)).all().pipe(Effect.orDie)
  expect(rows.filter((event) => event.type === EventV2.versionedType(SessionEvent.Synthetic.type, 1) &&
    event.data.messageID === f.request.messageID)).toHaveLength(1)
  expect(f.counters.admit).toBe(0)
  expect(f.counters.wake).toBe(1)
}))

it.instance("native Synthetic and Task progress use actual parent Location instead of ambient placement", () => Effect.gen(function* () {
  const f = yield* seed(true)
  const directory = "/tmp/upstream-settlement-parent-location"
  yield* f.database.db.update(SessionTable).set({ directory }).where(eq(SessionTable.id, f.parent.id)).run().pipe(Effect.orDie)
  yield* f.database.db.update(SessionTable).set({ directory }).where(eq(SessionTable.id, f.child.id)).run().pipe(Effect.orDie)
  const locations: EventV2.PublishOptions["location"][] = []
  const events = yield* EventV2.Service
  const unsubscribe = yield* events.listen((event) => Effect.sync(() => {
    if (event.durable?.aggregateID === f.parent.id &&
      (event.type === SessionEvent.Synthetic.type || event.type === SessionEvent.Tool.Progress.type))
      locations.push(event.location)
  }))
  yield* f.deliver()().pipe(Effect.ensuring(unsubscribe))
  expect(locations).toHaveLength(2)
  locations.forEach((location) => expect(location).toMatchObject({ directory }))
  expect(yield* f.read()).toMatchObject({ upstreamSettlement: { deliveryMessageID: f.request.messageID } })
}))

it.instance("V2 native resume failure cannot repeat execution on delivery retry", () => Effect.gen(function* () {
  const f = yield* seed(true)
  const ops: TaskPromptOps = { ...f.ops, resumeNotice: (sessionID) => {
    if (!f.ops.resumeNotice) throw new Error("expected private resume adapter")
    return f.ops.resumeNotice(sessionID).pipe(Effect.andThen(Effect.die(new Error("native resume failed after starting"))))
  } }
  const deliver = f.deliver(f.capture, ops)
  expect(Exit.isFailure(yield* Effect.exit(deliver()))).toBe(true)
  yield* deliver()
  expect(f.counters.wake).toBe(1)
  expect(f.counters.admit).toBe(0)
}))

it.instance("settle before completion survives native V2 success and late generic progress", () => Effect.gen(function* () {
  const f = yield* seed(true, true)
  yield* f.deliver()()
  const settled = yield* f.read()
  const base = { sessionID: f.parent.id, assistantMessageID: SessionMessage.ID.make(f.owner.id), callID: f.callID }
  yield* f.events.publish(SessionEvent.Tool.Success, { ...base, structured: { metadata: { background: true } },
    content: [], provider: { executed: false }, timestamp: yield* DateTime.now })
  expect(yield* f.read()).toEqual(settled)
  yield* f.events.publish(SessionEvent.Tool.Progress, { ...base, structured: { metadata: { background: true } },
    content: [], timestamp: yield* DateTime.now })
  expect(yield* f.read()).toEqual(settled)
}))

it.instance("legacy completion preservation uses shared native receipt helper", () => Effect.gen(function* () {
  const f = yield* seed()
  yield* f.deliver()()
  const previous = yield* f.read()
  if (!previous || typeof previous !== "object" || !f.task) throw new Error("expected legacy settlement metadata")
  const decoded = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(previous)
  const metadata = SessionMessageUpdater.taskMetadata(decoded, { background: true }, { sessionID: f.parent.id,
    messageID: f.owner.id, callID: f.callID, tool: "task", input: f.state.input })
  yield* f.sessions.updatePart({ ...f.task, state: { ...f.state, metadata } })
  expect(yield* f.read()).toMatchObject({ upstreamSettlement: { deliveryMessageID: f.request.messageID },
    workResult: f.capture.workResult })
}))

it.instance("V1 generic receipt injection is stripped; private setter stores durable receipt before wake", () => Effect.gen(function* () {
  const f = yield* seed()
  if (!f.task || !f.capture.workResult) throw new Error("expected legacy Task and captured result")
  yield* f.sessions.updatePart({ ...f.task, state: { ...f.state, metadata: { ...f.state.metadata,
    upstreamSettlement: { parentMessageID: f.owner.id, parentCallID: f.callID, workResult: f.capture.workResult,
      deliveryMessageID: f.request.messageID, deliveryPartID: PartID.ascending() } } } })
  expect(yield* f.read()).not.toHaveProperty("upstreamSettlement")
  const created: boolean[] = []
  const sessions = Session.Service.of({ ...f.sessions, settleUpstreamTask: (input) =>
    f.sessions.settleUpstreamTask(input).pipe(Effect.tap((value) => Effect.sync(() => { created.push(value) }))) })
  const ops: TaskPromptOps = { ...f.ops, prompt: (input) => Effect.gen(function* () {
    if (!input.noReply) expect(yield* f.read()).toMatchObject({ upstreamSettlement: {
      parentMessageID: f.owner.id, parentCallID: f.callID, deliveryMessageID: f.request.messageID,
      workResult: f.capture.workResult } })
    return yield* f.ops.prompt(input)
  }) }
  const deliver = f.deliver(f.capture, ops)
  yield* deliver().pipe(Effect.provideService(Session.Service, sessions))
  yield* deliver().pipe(Effect.provideService(Session.Service, sessions))
  expect(created).toEqual([true, false])
  expect(f.counters.wake).toBe(1)
  const events = yield* f.database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, f.parent.id)).all().pipe(Effect.orDie)
  expect(events.some((event) => event.type === EventV2.versionedType(SessionV1.Event.PartUpdated.type, 1) &&
    event.data.part && typeof event.data.part === "object" && "callID" in event.data.part &&
    event.data.part.callID === f.callID)).toBe(true)
}))

it.instance("failed returned result persists failure instead of successful attribution", () => Effect.gen(function* () {
  const f = yield* seed()
  if (!f.capture.workResult) throw new Error("expected work result")
  const failed: UpstreamSettlement.Capture = { ...f.capture, state: "error", workResult: { ...f.capture.workResult,
    terminal: { reason: "failed", hostDetail: "Task host failed" } } }
  yield* f.deliver(failed)()
  expect(yield* f.read()).toMatchObject({ upstreamSettlement: { workResult: { terminal: { reason: "failed" } } } })
}))

it.instance("wake failure cannot cause second execution on delivery retry", () => Effect.gen(function* () {
  const f = yield* seed()
  const ops: TaskPromptOps = { ...f.ops, prompt: (input) => f.ops.prompt(input).pipe(Effect.flatMap((message) =>
    input.noReply ? Effect.succeed(message) : Effect.die(new Error("wake failed after starting")))) }
  const deliver = f.deliver(f.capture, ops)
  expect(Exit.isFailure(yield* Effect.exit(deliver()))).toBe(true)
  yield* deliver()
  expect(f.counters.wake).toBe(1)
}))

it.instance("compatible native and retained parent views settle through private all-view port", () => Effect.gen(function* () {
  const f = yield* seed(true)
  yield* f.sessions.updateMessage(f.owner)
  const part = yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.parent.id,
    messageID: f.owner.id, type: "tool", tool: "task", callID: f.callID, state: f.state })
  yield* f.deliver()()
  expect(yield* f.read()).toMatchObject({ upstreamSettlement: { deliveryMessageID: f.request.messageID } })
  const stored = yield* f.sessions.getPart({ sessionID: f.parent.id, messageID: f.owner.id, partID: part.id })
  if (stored?.type !== "tool" || stored.state.status === "pending") throw new Error("retained Task missing")
  expect(stored.state.metadata).toMatchObject({ upstreamSettlement: { deliveryMessageID: f.request.messageID } })
  expect(f.counters.wake).toBe(1)
}))

it.instance("conflicting retained original child anchor prevents native Task receipt and wake", () => Effect.gen(function* () {
  const f = yield* seed(true)
  yield* f.sessions.updateMessage(f.owner)
  yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.parent.id, messageID: f.owner.id,
    type: "tool", tool: "task", callID: f.callID,
    state: { ...f.state, metadata: { ...f.state.metadata, sessionId: f.parent.id } } })
  expect(Exit.isFailure(yield* Effect.exit(f.deliver()()))).toBe(true)
  expect(yield* f.read()).not.toHaveProperty("upstreamSettlement")
  expect(f.counters.wake).toBe(0)
}))

it.instance("native Task projection missing receipt after progress cannot wake parent", () => Effect.gen(function* () {
  const f = yield* seed(true)
  const sessions = Session.Service.of({ ...f.sessions, settleUpstreamTask: (input) =>
    f.sessions.settleUpstreamTask(input).pipe(Effect.tap(() => Effect.gen(function* () {
      const row = yield* f.database.db.select().from(SessionMessageTable)
        .where(eq(SessionMessageTable.id, SessionMessage.ID.make(f.owner.id))).get().pipe(Effect.orDie)
      if (!row) throw new Error("native parent missing")
      const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...row.data, id: row.id, type: row.type })
      if (message.type !== "assistant") throw new Error("native parent not assistant")
      const encoded = Schema.encodeSync(SessionMessage.Assistant)({ ...message,
        content: message.content.filter((item) => item.type !== "tool" || item.id !== f.callID) })
      yield* f.database.db.update(SessionMessageTable).set({ data: omit(encoded, ["id", "type"]) })
        .where(eq(SessionMessageTable.id, row.id)).run().pipe(Effect.orDie)
    }))) })
  expect(Exit.isFailure(yield* Effect.exit(f.deliver()().pipe(Effect.provideService(Session.Service, sessions))))).toBe(true)
  expect(f.counters.wake).toBe(0)
}))

it.instance("native-only producer uses actual private settlement port after Synthetic readback and retries without republish", () => Effect.gen(function* () {
  const f = yield* seed(true)
  const created: boolean[] = []
  const sessions = Session.Service.of({ ...f.sessions, settleUpstreamTask: (input) => Effect.gen(function* () {
    const delivery = yield* f.database.db.select().from(SessionMessageTable)
      .where(eq(SessionMessageTable.id, SessionMessage.ID.make(input.deliveryMessageID))).get().pipe(Effect.orDie)
    expect(delivery).toMatchObject({ type: "synthetic", session_id: f.parent.id })
    expect(input).toMatchObject({ sessionID: f.parent.id, parentMessageID: f.owner.id,
      parentCallID: f.callID, childSessionID: f.child.id, authorMessageID: f.author.id,
      logicalTaskID: f.capture.workResult?.taskId, workResult: f.capture.workResult })
    expect(input.deliveryPartID).toBeUndefined()
    const value = yield* f.sessions.settleUpstreamTask(input)
    created.push(value)
    return value
  }) })
  const ops: TaskPromptOps = { ...f.ops, resumeNotice: (sessionID) => Effect.gen(function* () {
    expect(yield* f.read()).toMatchObject({ upstreamSettlement: { deliveryMessageID: f.request.messageID } })
    if (!f.ops.resumeNotice) throw new Error("native resume adapter missing")
    yield* f.ops.resumeNotice(sessionID)
  }) }
  const before = yield* f.database.db.select().from(EventTable)
    .where(eq(EventTable.aggregate_id, f.parent.id)).all().pipe(Effect.orDie)
  const deliver = f.deliver(f.capture, ops)
  yield* deliver().pipe(Effect.provideService(Session.Service, sessions))
  yield* deliver().pipe(Effect.provideService(Session.Service, sessions))
  expect(created).toEqual([true, false])
  expect(f.counters.admit).toBe(0)
  expect(f.counters.wake).toBe(1)
  const after = yield* f.database.db.select().from(EventTable)
    .where(eq(EventTable.aggregate_id, f.parent.id)).all().pipe(Effect.orDie)
  expect(after.filter((event) => !before.some((previous) => previous.id === event.id) &&
    event.type === EventV2.versionedType(SessionEvent.Tool.Progress.type, 1))).toHaveLength(1)
}))
