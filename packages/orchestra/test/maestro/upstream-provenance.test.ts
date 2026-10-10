import { afterEach, describe, expect } from "bun:test"
import { isDeepStrictEqual } from "node:util"
import { Database } from "@orchestra/core/database/database"
import { AgentV2 } from "@orchestra/core/agent"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventTable } from "@orchestra/core/event/sql"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { MessageTable, PartTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { SessionV1 } from "@orchestra/core/v1/session"
import { ProjectID } from "@orchestra/schema/project-id"
import { SessionMessage } from "@orchestra/schema/session-message"
import { SessionEvent } from "@orchestra/schema/session-event"
import { UpstreamAttribution } from "@orchestra/schema/upstream-attribution"
import { eq } from "drizzle-orm"
import { Cause, DateTime, Effect, Exit, Schema } from "effect"
import { omit } from "remeda"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { SeatWork } from "@/maestro/backend-work"
import { LogicalTask } from "@/maestro/logical-task"
import { Seats } from "@/maestro/seats"
import { UpstreamProvenance } from "@/maestro/upstream-provenance"
import { UpstreamResult } from "@/maestro/upstream-result"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(TestAppNodeBuilder.build(
  LayerNode.group([filesystem, CrossSpawnSpawner.node, Agent.node, BackgroundJob.node, Session.node, SessionProjector.node, EventV2Bridge.node, Database.node]),
  [[RuntimeFlags.node, RuntimeFlags.layer({})]],
))

const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const upstreamMemberID = Schema.decodeUnknownSync(UpstreamAttribution.V1.fields.memberID)("archie")
const card: UpstreamResult.Card = {
  outcome: "done", artifacts: [{ kind: "plan", path: "proposal.md" }], blockers: [], risks: [], nextActions: [],
}
const fenced = (value: unknown) => "```upstream-result\n" + JSON.stringify(value) + "\n```"

// These fixtures write the agreed private host port on real Task records. Relay owns the production writer,
// captured-return identity, durable delivery ordering, and preservation against stale Task completion writes.

function assistant(sessionID: SessionID, agent: string, parentID: MessageID): SessionV1.Assistant {
  return {
    id: MessageID.ascending(), role: "assistant", sessionID, parentID, agent, mode: agent,
    modelID: ref.modelID, providerID: ref.providerID, path: { cwd: "/tmp", root: "/tmp" }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: Date.now(), completed: Date.now() }, finish: "stop",
  }
}

const seed = Effect.fn("UpstreamProvenanceTest.seed")(function* (options?: {
  background?: boolean
  bind?: boolean
  binding?: Partial<LogicalTask.Binding>
  childParentID?: SessionID
  childAgent?: string
}) {
  const sessions = yield* Session.Service
  const parent = yield* sessions.create({ agent: "maestro", title: "proposal authority" })
  const child = yield* sessions.create({ parentID: options?.childParentID ?? parent.id, agent: options?.childAgent ?? "archie", title: "proposal execution" })
  const bindingInput = {
    executionSessionID: child.id, authoritySessionID: parent.id, projectID: parent.projectID,
    memberID: "archie", source: "host" as const, ...options?.binding,
  }
  const binding = options?.bind === false ? undefined : yield* LogicalTask.ensure(bindingInput)
  const user = yield* sessions.updateMessage({
    id: MessageID.ascending(), role: "user", sessionID: parent.id, agent: "maestro", model: ref, time: { created: Date.now() },
  })
  const parentMessage = yield* sessions.updateMessage({ ...assistant(parent.id, "maestro", user.id), finish: "tool-calls" })
  const prompt = yield* sessions.updateMessage({
    id: MessageID.ascending(), role: "user", sessionID: child.id, agent: "archie", model: ref, time: { created: Date.now() },
  })
  const authorInfo = yield* sessions.updateMessage(assistant(child.id, "archie", prompt.id))
  const text = yield* sessions.updatePart({
    id: PartID.ascending(), type: "text", sessionID: child.id, messageID: authorInfo.id, text: fenced(card),
  })
  const author = { info: authorInfo, parts: [text] }
  const metadata = {
    parentSessionId: parent.id, sessionId: child.id, model: ref,
    ...(options?.background ? { background: true, jobId: child.id } : {}),
  }
  const state: SessionV1.ToolStateCompleted = {
    status: "completed", input: { description: "author plan proposal", prompt: "bounded proposal brief", subagent_type: "archie", ...(options?.background ? { background: true } : {}) },
    output: `<task id="${binding?.taskId ?? "tsk_unbound"}" state="${options?.background ? "running" : "completed"}">\n<task_result>\n${text.text}\n</task_result>\n</task>`,
    title: "author plan proposal", time: { start: parentMessage.time.created, end: Date.now() }, metadata,
  }
  const task = yield* sessions.updatePart({
    id: PartID.ascending(), type: "tool", sessionID: parent.id, messageID: parentMessage.id,
    tool: "task", callID: `call-${parentMessage.id}`, state,
  })
  // Use the actual host producer to persist workResult; no model or substituted registry/storage service.
  const work = SeatWork.track({
    enabled: true, seat: Seats.all.archie, sessionID: child.id, taskId: binding?.taskId, writeRoots: [],
    publish: (workResult) => sessions.updatePart({ ...task, state: { ...state, metadata: { ...metadata, workResult } } }).pipe(Effect.asVoid),
  })
  yield* work.record(author)
  if (options?.background) yield* work.hostEnded("running", "Background task started")
  const stored = yield* sessions.getPart({ sessionID: parent.id, messageID: parentMessage.id, partID: task.id })
  if (!stored || stored.type !== "tool" || stored.state.status !== "completed") throw new Error("expected stored completed Task part")
  return {
    parent, child, parentMessage, author, text, task: { ...stored, state: stored.state }, work, binding,
    input: {
      projectID: parent.projectID, parentSessionID: parent.id, parentMessageID: SessionMessage.ID.make(parentMessage.id),
      parentCallID: task.callID, authorSessionID: child.id, authorMessageID: SessionMessage.ID.make(authorInfo.id),
      logicalTaskID: binding?.taskId ?? "tsk_unbound",
    },
  }
})

const refusal = Effect.fn("UpstreamProvenanceTest.refusal")(function* (
  input: Parameters<typeof UpstreamProvenance.observe>[0],
  code: UpstreamProvenance.Denied["code"],
) {
  const exit = yield* Effect.exit(UpstreamProvenance.observe(input))
  if (Exit.isSuccess(exit)) throw new Error(`expected ${code}, observed success`)
  const error = Cause.squash(exit.cause)
  expect(error).toBeInstanceOf(UpstreamProvenance.Denied)
  if (!(error instanceof UpstreamProvenance.Denied)) throw error
  expect(error.code).toBe(code)
  expect(error.message.length).toBeGreaterThan(0)
  return error
})

const notice = Effect.fn("UpstreamProvenanceTest.notice")(function* (
  fixture: Effect.Success<ReturnType<typeof seed>>,
) {
  const sessions = yield* Session.Service
  const delivered = yield* fixture.work.notice("completed", fixture.text.text)
  if (!delivered) throw new Error("expected actual SeatWork result")
  const message = yield* sessions.updateMessage({
    id: MessageID.ascending(), role: "user", sessionID: fixture.parent.id, agent: "maestro", model: ref, time: { created: Date.now() },
  })
  const part = yield* sessions.updatePart({
    id: PartID.ascending(), messageID: message.id, sessionID: fixture.parent.id, type: "text", synthetic: true,
    metadata: { source: { type: "task-return", task_id: fixture.child.id, state: "completed" }, workResult: delivered },
    text: `<task id="${fixture.input.logicalTaskID}" state="completed">\n<summary>Background task completed: ${fixture.task.state.input.description}</summary>\n<task_result>\n${fixture.text.text}\n</task_result>\n</task>`,
  })
  return { part, workResult: delivered }
})

const settled = Effect.fn("UpstreamProvenanceTest.settled")(function* () {
  const fixture = yield* seed({ background: true })
  const delivery = yield* notice(fixture)
  const upstreamSettlement = {
    parentMessageID: fixture.input.parentMessageID, parentCallID: fixture.task.callID,
    workResult: delivery.workResult, deliveryMessageID: SessionMessage.ID.make(delivery.part.messageID),
    deliveryPartID: delivery.part.id,
  }
  const sessions = yield* Session.Service
  yield* sessions.settleUpstreamTask({ ...upstreamSettlement, sessionID: fixture.parent.id,
    childSessionID: fixture.child.id, logicalTaskID: fixture.input.logicalTaskID, authorMessageID: fixture.author.info.id,
  })
  const stored = yield* sessions.getPart({ sessionID: fixture.parent.id, messageID: fixture.parentMessage.id, partID: fixture.task.id })
  if (!stored || stored.type !== "tool" || stored.tool !== "task" || stored.callID !== fixture.task.callID ||
    stored.state.status !== "completed" || !isDeepStrictEqual(stored.state.metadata.upstreamSettlement, upstreamSettlement) ||
    !isDeepStrictEqual(stored.state.metadata.workResult, delivery.workResult)) throw new Error("expected privately settled Task readback")
  return { ...fixture, delivery: delivery.part, upstreamSettlement }
})

// Adversarial retained evidence only: generic writers preserve admitted receipts and captured workResult.
const corruptTaskMetadata = Effect.fn("UpstreamProvenanceTest.corruptTaskMetadata")(function* (
  fixture: Effect.Success<ReturnType<typeof settled>>,
  change: (metadata: Record<string, unknown>) => Record<string, unknown>,
) {
  const database = yield* Database.Service
  const row = yield* database.db.select().from(PartTable).where(eq(PartTable.id, fixture.task.id)).get().pipe(Effect.orDie)
  if (!row || row.id !== fixture.task.id || row.session_id !== fixture.parent.id || row.message_id !== fixture.parentMessage.id)
    throw new Error("expected fixture-owned retained Task row")
  const part = Schema.decodeUnknownSync(SessionV1.Part)({ ...row.data, id: row.id, messageID: row.message_id, sessionID: row.session_id })
  if (part.type !== "tool" || part.tool !== "task" || part.callID !== fixture.task.callID ||
    part.state.status !== "completed" || !isDeepStrictEqual(part.state.metadata.upstreamSettlement, fixture.upstreamSettlement))
    throw new Error("expected fixture-owned privately settled completed Task")
  const data = omit({ ...part, state: { ...part.state, metadata: change(part.state.metadata) } }, ["id", "messageID", "sessionID"])
  yield* database.db.update(PartTable).set({ data }).where(eq(PartTable.id, fixture.task.id)).run().pipe(Effect.orDie)
})

const modernAssistant = Effect.fn("UpstreamProvenanceTest.modernAssistant")(function* (
  sessionID: SessionID, reference: string, agent: string, text: string,
  task?: { callID: string; metadata: Record<string, unknown>; input?: Record<string, unknown>; progress?: boolean; providerExecuted?: boolean; providerOnly?: boolean },
) {
  const events = yield* EventV2Bridge.Service
  const id = SessionMessage.ID.make(reference)
  yield* events.publish(SessionEvent.Step.Started, { sessionID, assistantMessageID: id, agent: AgentV2.ID.make(agent),
    model: { id: ref.modelID, providerID: ref.providerID }, timestamp: yield* DateTime.now,
  })
  if (task) {
    const base = { sessionID, assistantMessageID: id, callID: task.callID }
    yield* events.publish(SessionEvent.Tool.Input.Started, { ...base, name: "task", timestamp: yield* DateTime.now })
    yield* events.publish(SessionEvent.Tool.Called, { ...base, tool: "task", input: task.input ?? { subagent_type: "archie" }, provider: { executed: task.providerExecuted === true }, timestamp: yield* DateTime.now })
    if (task.progress) yield* events.publish(SessionEvent.Tool.Progress, { ...base, structured: { metadata: task.metadata }, content: [], timestamp: yield* DateTime.now })
    yield* events.publish(SessionEvent.Tool.Success, { ...base, structured: task.providerOnly ? {} : { title: "proposal", output: text, metadata: task.metadata },
      content: [], provider: { executed: task.providerExecuted === true, ...(task.providerOnly ? { metadata: { forged: task.metadata } } : {}) }, timestamp: yield* DateTime.now,
    })
  }
  if (text) {
    yield* events.publish(SessionEvent.Text.Started, { sessionID, assistantMessageID: id, textID: `text-${id}`, timestamp: yield* DateTime.now })
    yield* events.publish(SessionEvent.Text.Ended, { sessionID, assistantMessageID: id, textID: `text-${id}`, text, timestamp: yield* DateTime.now })
  }
  yield* events.publish(SessionEvent.Step.Ended, { sessionID, assistantMessageID: id, finish: task ? "tool-calls" : "stop", cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, timestamp: yield* DateTime.now,
  })
})

describe("UpstreamProvenance.observe", () => {
  it.instance("observes exact V1 host receipt and referenced delivery with read-only retry despite initial running result", () => Effect.gen(function* () {
    const fixture = yield* settled()
    const sessions = yield* Session.Service
    const before = {
      parent: yield* sessions.messages({ sessionID: fixture.parent.id }),
      child: yield* sessions.messages({ sessionID: fixture.child.id }),
      binding: yield* LogicalTask.read(fixture.child.id),
    }
    expect(fixture.task.state.metadata.workResult.terminal.reason).toBe("running")
    expect(fixture.upstreamSettlement.workResult.author?.messageID).toBe(fixture.author.info.id)
    const first = yield* UpstreamProvenance.observe(fixture.input)
    expect(first).toEqual({ ...fixture.input, schema: "maestro-upstream-attribution-v1", memberID: upstreamMemberID, profile: "upstream" })
    expect(yield* UpstreamProvenance.observe(fixture.input)).toEqual(first)
    expect({
      parent: yield* sessions.messages({ sessionID: fixture.parent.id }),
      child: yield* sessions.messages({ sessionID: fixture.child.id }),
      binding: yield* LogicalTask.read(fixture.child.id),
    }).toEqual(before)
  }))

  it.instance("observes V2 projected synthetic delivery through Task-held receipt without synthetic metadata", () => Effect.gen(function* () {
    const fixture = yield* settled()
    const events = yield* EventV2Bridge.Service
    const database = yield* Database.Service
    const sessions = yield* Session.Service
    const deliveryID = SessionMessage.ID.create()
    yield* events.publish(SessionEvent.Synthetic, {
      sessionID: fixture.parent.id, messageID: deliveryID, text: fixture.delivery.text, timestamp: yield* DateTime.now,
    })
    const parentID = SessionMessage.ID.create()
    const callID = `call-${parentID}`
    // Retain ordinary host anchors before Success; only the private setter admits the later Progress receipt.
    yield* modernAssistant(fixture.parent.id, parentID, "maestro", "", { callID,
      metadata: fixture.task.state.metadata, input: fixture.task.state.input, progress: true,
    })
    const upstreamSettlement = { parentMessageID: parentID, parentCallID: callID,
      workResult: fixture.upstreamSettlement.workResult, deliveryMessageID: deliveryID }
    yield* sessions.settleUpstreamTask({ ...upstreamSettlement, sessionID: fixture.parent.id,
      childSessionID: fixture.child.id, logicalTaskID: fixture.input.logicalTaskID, authorMessageID: fixture.author.info.id,
    })
    const parent = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, parentID)).get().pipe(Effect.orDie)
    if (!parent || parent.session_id !== fixture.parent.id) throw new Error("expected projected parent Task")
    const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...parent.data, id: parent.id, type: parent.type })
    const calls = message.type === "assistant" ? message.content.filter((part) => part.type === "tool" && part.id === callID) : []
    const call = calls[0]
    if (calls.length !== 1 || call?.type !== "tool" || call.name !== "task" || call.state.status !== "completed" ||
      !isDeepStrictEqual(call.state.structured.metadata, { ...fixture.task.state.metadata,
        workResult: upstreamSettlement.workResult, upstreamSettlement })) throw new Error("expected privately settled projected Task readback")
    const row = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, deliveryID)).get().pipe(Effect.orDie)
    expect(row?.type).toBe("synthetic")
    expect(row?.data).not.toHaveProperty("metadata")
    const input = { ...fixture.input, parentMessageID: parentID, parentCallID: callID }
    expect(yield* UpstreamProvenance.observe(input)).toEqual({ ...input, schema: "maestro-upstream-attribution-v1", memberID: upstreamMemberID, profile: "upstream" })
  }))

  it.instance("reconciles matching same-ID V1 and V2 deliveries and running-only Task settlement", () => Effect.gen(function* () {
    const fixture = yield* settled()
    const events = yield* EventV2Bridge.Service
    const sessions = yield* Session.Service
    yield* events.publish(SessionEvent.Synthetic, {
      sessionID: fixture.parent.id, messageID: fixture.upstreamSettlement.deliveryMessageID,
      text: fixture.delivery.text, timestamp: yield* DateTime.now,
    })
    yield* corruptTaskMetadata(fixture, (metadata) => ({ ...metadata,
      background: false, workResult: fixture.task.state.metadata.workResult,
    }))
    const stored = yield* sessions.getPart({ sessionID: fixture.parent.id, messageID: fixture.parentMessage.id, partID: fixture.task.id })
    if (!stored || stored.type !== "tool" || stored.tool !== "task" || stored.state.status !== "completed" ||
      stored.state.metadata.background !== false || stored.state.metadata.workResult?.terminal?.reason !== "running" ||
      !isDeepStrictEqual(stored.state.metadata.upstreamSettlement, fixture.upstreamSettlement))
      throw new Error("expected running-only Task with admitted receipt")
    expect((yield* UpstreamProvenance.observe(fixture.input)).authorMessageID).toBe(SessionMessage.ID.make(fixture.author.info.id))
  }))

  it.instance("rejects malformed receipts, wrong anchors, captured authors, and mismatched canonical work results", () => Effect.gen(function* () {
    yield* Effect.forEach(["message", "call", "extra", "empty-call", "card-author", "author", "artifact", "task", "failed", "interrupted"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* settled()
      const receipt = fixture.upstreamSettlement
      const changed = {
        ...receipt,
        ...(variant === "message" ? { parentMessageID: fixture.input.authorMessageID } : {}),
        ...(variant === "call" ? { parentCallID: "other-call" } : {}),
        ...(variant === "extra" ? { schema: "invented-discriminator" } : {}),
        ...(variant === "empty-call" ? { parentCallID: "" } : {}),
        workResult: {
          ...receipt.workResult,
          ...(variant === "card-author" ? { card: { parsed: true, messageID: fixture.parentMessage.id } } : {}),
          ...(variant === "author" ? { author: { memberId: "archie", executionSessionID: fixture.child.id, messageID: fixture.parentMessage.id } } : {}),
          ...(variant === "artifact" ? { artifacts: [{ kind: "plan", path: "other.md" }] } : {}),
          ...(variant === "task" ? { taskId: "tsk_other" } : {}),
          ...(variant === "failed" || variant === "interrupted" ? { terminal: { reason: variant } } : {}),
        },
      }
      yield* corruptTaskMetadata(fixture, (metadata) => ({ ...metadata, upstreamSettlement: changed }))
      yield* refusal(fixture.input, variant === "task" ? "UPSTREAM_ATTRIBUTION_TASK_MISMATCH" : "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    }))
  }))

  it.instance("rejects missing, foreign, wrong-part, nonsynthetic, ignored, incomplete, erroneous, or wrong-child V1 delivery", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    const database = yield* Database.Service
    yield* Effect.forEach(["missing", "foreign", "foreign-part", "wrong-part", "no-part", "nonsynthetic", "ignored", "incomplete", "user-error", "part-error", "wrong-child", "delivery-error", "result"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* settled()
      if (variant === "foreign") yield* database.db.update(MessageTable).set({ session_id: fixture.child.id })
        .where(eq(MessageTable.id, fixture.delivery.messageID)).run().pipe(Effect.orDie)
      if (variant === "foreign-part") yield* database.db.update(PartTable).set({ session_id: fixture.child.id })
        .where(eq(PartTable.id, fixture.delivery.id)).run().pipe(Effect.orDie)
      if (variant === "user-error") yield* sessions.updateMessage({
        ...assistant(fixture.parent.id, "maestro", fixture.parentMessage.parentID), id: fixture.delivery.messageID,
        error: new SessionV1.APIError({ message: "Delivery failed", isRetryable: false }).toObject(),
      })
      if (variant === "part-error") yield* sessions.updatePart({
        id: PartID.ascending(), messageID: fixture.delivery.messageID, sessionID: fixture.parent.id, type: "tool", tool: "task", callID: "failed-delivery",
        state: { status: "error", input: {}, error: "Delivery failed", time: { start: Date.now(), end: Date.now() } },
      })
      if (["nonsynthetic", "ignored", "incomplete", "wrong-child", "delivery-error", "result"].includes(variant)) yield* sessions.updatePart({
        ...fixture.delivery,
        ...(variant === "nonsynthetic" ? { synthetic: false } : {}),
        ...(variant === "ignored" ? { ignored: true } : {}),
        ...(variant === "incomplete" ? { time: { start: Date.now() } } : {}),
        metadata: { ...fixture.delivery.metadata,
          ...(variant === "wrong-child" ? { source: { type: "task-return", task_id: fixture.parent.id, state: "completed" } } : {}),
          ...(variant === "delivery-error" ? { source: { type: "task-return", task_id: fixture.child.id, state: "error" } } : {}),
          ...(variant === "result" ? { workResult: { ...fixture.upstreamSettlement.workResult, risks: ["forged"] } } : {}),
        },
      })
      if (["missing", "wrong-part", "no-part"].includes(variant)) yield* corruptTaskMetadata(fixture, (metadata) => ({
        ...metadata, upstreamSettlement: {
          ...fixture.upstreamSettlement,
          ...(variant === "missing" ? { deliveryMessageID: "msg_missing_delivery" } : {}),
          ...(variant === "wrong-part" ? { deliveryPartID: fixture.text.id } : {}),
          ...(variant === "no-part" ? { deliveryPartID: undefined } : {}),
        },
      }))
      yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    }))
  }))

  it.instance("captured receipt remains tied to original author when later assistant returns identical bytes", () => Effect.gen(function* () {
    const fixture = yield* settled()
    const sessions = yield* Session.Service
    const next = yield* sessions.updateMessage(assistant(fixture.child.id, "archie", fixture.author.info.parentID))
    const text = yield* sessions.updatePart({ ...fixture.text, id: PartID.ascending(), messageID: next.id })
    // Deliberately replace retained outer evidence with a real later producer result. Generic writers freeze
    // captured workResult; this adversarial row proves the observer still selects the original receipt author.
    yield* fixture.work.record({ info: next, parts: [text] })
    const workResult = yield* fixture.work.notice("completed", text.text)
    if (!workResult) throw new Error("expected actual later SeatWork result")
    yield* corruptTaskMetadata(fixture, (metadata) => ({ ...metadata, workResult }))
    const stored = yield* sessions.getPart({ sessionID: fixture.parent.id, messageID: fixture.parentMessage.id, partID: fixture.task.id })
    if (!stored || stored.type !== "tool" || stored.state.status !== "completed") throw new Error("expected stored completed Task part")
    expect(stored.state.metadata.workResult.card.messageID).toBe(next.id)
    expect(stored.state.metadata.workResult.author.messageID).toBe(next.id)
    expect((yield* UpstreamProvenance.observe(fixture.input)).authorMessageID).toBe(SessionMessage.ID.make(fixture.author.info.id))
    yield* refusal({ ...fixture.input, authorMessageID: SessionMessage.ID.make(next.id) }, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    yield* sessions.updatePart({ ...stored, state: { ...stored.state, metadata: {
      ...stored.state.metadata, upstreamSettlement: fixture.upstreamSettlement,
    } } })
    const preserved = yield* sessions.getPart({ sessionID: fixture.parent.id, messageID: fixture.parentMessage.id, partID: fixture.task.id })
    if (!preserved || preserved.type !== "tool" || preserved.tool !== "task" || preserved.state.status !== "completed" ||
      !isDeepStrictEqual(preserved.state.metadata.upstreamSettlement, fixture.upstreamSettlement) ||
      !isDeepStrictEqual(preserved.state.metadata.workResult, fixture.upstreamSettlement.workResult))
      throw new Error("expected generic writer to preserve original captured settlement")
    expect((yield* UpstreamProvenance.observe(fixture.input)).authorMessageID).toBe(SessionMessage.ID.make(fixture.author.info.id))
    yield* refusal({ ...fixture.input, authorMessageID: SessionMessage.ID.make(next.id) }, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
  }))

  it.instance("parent Task failure and interruption override valid captured final receipt", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    yield* Effect.forEach(["parent", "task", "interrupted", "outer-failed"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* settled()
      if (variant === "parent") yield* sessions.updateMessage({ ...fixture.parentMessage,
        error: new SessionV1.AbortedError({ message: "Parent interrupted" }).toObject(),
      })
      if (variant === "outer-failed") yield* corruptTaskMetadata(fixture, (metadata) => ({ ...metadata,
        workResult: { ...fixture.upstreamSettlement.workResult, terminal: { reason: "failed" } },
      }))
      if (variant !== "outer-failed") yield* sessions.updatePart({ ...fixture.task, state: variant === "task" ? {
        status: "error", input: fixture.task.state.input, time: fixture.task.state.time, error: "Task failed",
        metadata: { ...fixture.task.state.metadata, upstreamSettlement: fixture.upstreamSettlement },
      } : { ...fixture.task.state, metadata: {
        ...fixture.task.state.metadata, upstreamSettlement: fixture.upstreamSettlement,
        ...(variant === "interrupted" ? { interrupted: true } : {}),
      } } })
      yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    }))
  }))

  it.instance("V2 delivery rejects foreign event owner, changed stored owner, ordinary user, and conflicting same-ID legacy projection", () => Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const database = yield* Database.Service
    yield* Effect.forEach(["foreign", "stored-owner", "ordinary", "conflict"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* settled()
      const id = variant === "conflict" ? fixture.upstreamSettlement.deliveryMessageID : SessionMessage.ID.create()
      if (variant === "ordinary") yield* events.publish(SessionEvent.Prompted, {
        sessionID: fixture.parent.id, messageID: id, prompt: { text: fixture.delivery.text }, delivery: "steer", timestamp: yield* DateTime.now,
      })
      if (variant !== "ordinary") yield* events.publish(SessionEvent.Synthetic, {
        sessionID: variant === "foreign" ? fixture.child.id : fixture.parent.id, messageID: id,
        text: variant === "conflict" ? "Different delivery" : fixture.delivery.text, timestamp: yield* DateTime.now,
      })
      if (variant === "stored-owner") {
        const row = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, id)).get().pipe(Effect.orDie)
        if (!row) throw new Error("expected projected synthetic")
        yield* database.db.update(SessionMessageTable).set({ session_id: fixture.child.id })
          .where(eq(SessionMessageTable.id, id)).run().pipe(Effect.orDie)
      }
      yield* corruptTaskMetadata(fixture, (metadata) => ({
        ...metadata, upstreamSettlement: {
          parentMessageID: fixture.input.parentMessageID, parentCallID: fixture.task.callID,
          workResult: fixture.upstreamSettlement.workResult, deliveryMessageID: id,
          ...(variant === "conflict" ? { deliveryPartID: fixture.delivery.id } : {}),
        },
      }))
      yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    }))
  }))

  it.instance("observes native synchronous proposal and exact retry without changing retained evidence", () => Effect.gen(function* () {
    const fixture = yield* seed()
    const sessions = yield* Session.Service
    const before = {
      parent: yield* sessions.messages({ sessionID: fixture.parent.id }),
      child: yield* sessions.messages({ sessionID: fixture.child.id }),
      binding: yield* LogicalTask.read(fixture.child.id),
    }
    const first = yield* UpstreamProvenance.observe(fixture.input)
    expect(first).toEqual({ ...fixture.input, schema: "maestro-upstream-attribution-v1", memberID: upstreamMemberID, profile: "upstream" })
    expect(yield* UpstreamProvenance.observe(fixture.input)).toEqual(first)
    expect({
      parent: yield* sessions.messages({ sessionID: fixture.parent.id }),
      child: yield* sessions.messages({ sessionID: fixture.child.id }),
      binding: yield* LogicalTask.read(fixture.child.id),
    }).toEqual(before)
  }))

  it.instance("native registry retains archie identity despite disabled or custom-mode configuration", () => Effect.gen(function* () {
    const agents = yield* Agent.Service
    expect(yield* agents.get("archie")).toMatchObject({ id: "archie", name: "Proposal Seat", native: true, mode: "subagent" })
    const fixture = yield* seed()
    expect((yield* UpstreamProvenance.observe(fixture.input)).memberID).toBe(upstreamMemberID)
  }), { config: { agent: { archie: { name: "Proposal Seat", disable: true, mode: "primary" } } } })

  it.instance("names missing references, stored messages, Sessions, and retained Task binding", () => Effect.gen(function* () {
    const fixture = yield* seed()
    yield* Effect.forEach([
      { ...fixture.input, parentCallID: "" },
      { ...fixture.input, parentSessionID: SessionID.make("ses_missing_parent") },
      { ...fixture.input, authorSessionID: SessionID.make("ses_missing_author") },
      { ...fixture.input, parentMessageID: SessionMessage.ID.make("msg_missing_parent") },
      { ...fixture.input, authorMessageID: SessionMessage.ID.make("msg_missing_author") },
    ], (input) => refusal(input, "UPSTREAM_ATTRIBUTION_MISSING"))
    const unbound = yield* seed({ bind: false })
    yield* refusal(unbound.input, "UPSTREAM_ATTRIBUTION_MISSING")
  }))

  it.instance("reconciles expected Project against parent, author, and retained logical Task", () => Effect.gen(function* () {
    const fixture = yield* seed()
    yield* refusal({ ...fixture.input, projectID: ProjectID.make("prj_other") }, "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH")
    const foreign = yield* provideTmpdirInstance(() => seed(), { git: true })
    expect(foreign.parent.projectID).not.toBe(fixture.parent.projectID)
    yield* refusal({
      ...fixture.input, authorSessionID: foreign.child.id, authorMessageID: foreign.input.authorMessageID,
    }, "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH")
    const wrongBinding = yield* seed({ binding: { projectID: foreign.parent.projectID } })
    yield* refusal(wrongBinding.input, "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH")
  }))

  it.instance("rejects forged host metadata for a child owned by another parent", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    const otherParent = yield* sessions.create({ agent: "maestro", title: "actual foreign authority" })
    // All caller/host metadata and retained binding claim the selected parent; actual Session ownership disagrees.
    const fixture = yield* seed({ childParentID: otherParent.id })
    expect(fixture.task.state.metadata).toMatchObject({ parentSessionId: fixture.parent.id, sessionId: fixture.child.id })
    expect(fixture.binding?.authoritySessionID).toBe(fixture.parent.id)
    yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
  }))

  it.instance("rejects parent role, agent, ambiguous dispatch, label routing, and forged placement", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    yield* Effect.forEach(["role", "agent", "duplicate", "label", "placement"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* seed()
      if (variant === "role") yield* sessions.updateMessage({
        id: fixture.parentMessage.id, sessionID: fixture.parent.id, role: "user", agent: "maestro", model: ref, time: fixture.parentMessage.time,
      })
      if (variant === "agent") yield* sessions.updateMessage({ ...fixture.parentMessage, agent: "general" })
      if (variant === "duplicate") yield* sessions.updatePart({ ...fixture.task, id: PartID.ascending() })
      if (variant === "label") yield* sessions.updatePart({ ...fixture.task, state: {
        ...fixture.task.state, input: { ...fixture.task.state.input, subagent_type: "Proposal Seat" },
      } })
      if (variant === "placement") {
        const other = yield* sessions.create({ parentID: fixture.parent.id, agent: "archie" })
        yield* sessions.updatePart({ ...fixture.task, state: {
          ...fixture.task.state, metadata: { ...fixture.task.state.metadata, sessionId: other.id },
        } })
      }
      yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    }))
  }))

  it.instance("rejects execution member, author role or agent, and foreign proposal-part ownership", () => Effect.gen(function* () {
    const wrongMember = yield* seed({ childAgent: "general" })
    yield* refusal(wrongMember.input, "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH")
    const sessions = yield* Session.Service
    yield* Effect.forEach(["role", "agent", "part"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* seed()
      if (variant === "role") yield* sessions.updateMessage({
        id: fixture.author.info.id, sessionID: fixture.child.id, role: "user", agent: "archie", model: ref, time: fixture.author.info.time,
      })
      if (variant === "agent") yield* sessions.updateMessage({ ...fixture.author.info, agent: "maestro" })
      if (variant === "part") {
        // Session.updatePart keeps a stored part's ownership columns immutable; change the actual retained row.
        const database = yield* Database.Service
        yield* database.db.update(PartTable).set({ session_id: fixture.parent.id }).where(eq(PartTable.id, fixture.text.id)).run().pipe(Effect.orDie)
      }
      yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH")
    }))
  }))

  it.instance("reconciles retained logical Task identity, member, authority, and host-selected Task", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    const fixture = yield* seed()
    yield* refusal({ ...fixture.input, logicalTaskID: fixture.child.id }, "UPSTREAM_ATTRIBUTION_TASK_MISMATCH")
    const other = yield* sessions.create({ agent: "maestro" })
    yield* Effect.forEach([
      { taskId: "ses_replacement" }, { memberID: "general" }, { authoritySessionID: other.id },
    ], (binding) => Effect.gen(function* () {
      const changed = yield* seed({ binding })
      yield* refusal(changed.input, "UPSTREAM_ATTRIBUTION_TASK_MISMATCH")
    }))
    yield* sessions.updatePart({ ...fixture.task, state: {
      ...fixture.task.state, metadata: { ...fixture.task.state.metadata, workResult: { ...fixture.task.state.metadata.workResult, taskId: "tsk_other" } },
    } })
    yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_TASK_MISMATCH")
  }))

  it.instance("rejects old native ID in retained Session, author, dispatch, binding, and host result", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    yield* Effect.forEach(["session", "author", "dispatch", "binding", "result"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* seed({
        ...(variant === "session" ? { childAgent: "walt" } : {}),
        ...(variant === "binding" ? { binding: { memberID: "walt" } } : {}),
      })
      if (variant === "author") yield* sessions.updateMessage({ ...fixture.author.info, agent: "walt", mode: "walt" })
      if (variant === "dispatch") yield* sessions.updatePart({ ...fixture.task, state: {
        ...fixture.task.state, input: { ...fixture.task.state.input, subagent_type: "walt" },
      } })
      if (variant === "result") yield* sessions.updatePart({ ...fixture.task, state: {
        ...fixture.task.state, metadata: { ...fixture.task.state.metadata, workResult: {
          ...fixture.task.state.metadata.workResult,
          author: { memberId: "walt", executionSessionID: fixture.child.id, messageID: fixture.author.info.id },
        } },
      } })
      yield* refusal(fixture.input,
        variant === "session" || variant === "author" ? "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH" :
        variant === "dispatch" ? "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH" :
        variant === "binding" ? "UPSTREAM_ATTRIBUTION_TASK_MISMATCH" : "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    }))
  }))

  it.instance("host failure and interruption override a completed worker proposal", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    yield* Effect.forEach(["parent-failed", "parent-interrupted", "task-error", "task-running", "task-interrupted", "host-failed", "host-interrupted", "host-missing"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* seed()
      if (variant === "parent-failed" || variant === "parent-interrupted") yield* sessions.updateMessage({
        ...fixture.parentMessage, error: variant === "parent-failed"
          ? new SessionV1.APIError({ message: "Parent failed", isRetryable: false }).toObject()
          : new SessionV1.AbortedError({ message: "Parent cancelled" }).toObject(),
      })
      if (variant === "task-error") yield* sessions.updatePart({ ...fixture.task, state: {
        status: "error", input: fixture.task.state.input, metadata: fixture.task.state.metadata,
        time: fixture.task.state.time, error: "Task cancelled",
      } })
      if (variant === "task-running") yield* sessions.updatePart({ ...fixture.task, state: {
        status: "running", input: fixture.task.state.input, metadata: fixture.task.state.metadata, time: { start: fixture.task.state.time.start },
      } })
      if (variant === "task-interrupted" || variant === "host-missing") yield* sessions.updatePart({ ...fixture.task, state: {
        ...fixture.task.state, metadata: { ...fixture.task.state.metadata,
          ...(variant === "task-interrupted" ? { interrupted: true } : { workResult: undefined }),
        },
      } })
      if (variant === "host-failed" || variant === "host-interrupted") yield* sessions.updatePart({ ...fixture.task, state: {
        ...fixture.task.state, metadata: { ...fixture.task.state.metadata, workResult: {
          ...fixture.task.state.metadata.workResult, terminal: { reason: variant === "host-failed" ? "failed" : "interrupted", hostDetail: "Host ended Task" },
        } },
      } })
      yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    }))
  }))

  it.instance("stored child failure, interruption, or failed tool defeats successful parent metadata", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    yield* Effect.forEach(["failed", "interrupted", "tool-error"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* seed()
      if (variant === "failed") yield* sessions.updateMessage({
        ...fixture.author.info, error: new SessionV1.APIError({ message: "Child failed", isRetryable: false }).toObject(),
      })
      if (variant === "interrupted") yield* sessions.updateMessage({ ...fixture.author.info, finish: undefined })
      if (variant === "tool-error") yield* sessions.updatePart({
        id: PartID.ascending(), sessionID: fixture.child.id, messageID: fixture.author.info.id, type: "tool", tool: "read", callID: "call-failed-read",
        state: { status: "error", input: {}, error: "Read failed", time: { start: Date.now(), end: Date.now() } },
      })
      yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    }))
  }))

  it.instance("stored invalid, blocked, or conflicting cards defeat successful parent metadata", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    yield* Effect.forEach(["invalid", "blocked", "blockers", "conflicting"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* seed()
      if (variant === "invalid") yield* sessions.updatePart({ ...fixture.text, text: "```upstream-result\n{broken}\n```" })
      if (variant === "blocked") yield* sessions.updatePart({ ...fixture.text, text: fenced({ ...card, outcome: "blocked" }) })
      if (variant === "blockers") yield* sessions.updatePart({ ...fixture.text, text: fenced({ ...card, blockers: [{ kind: "context", reason: "Owner decision missing" }] }) })
      if (variant === "conflicting") yield* sessions.updatePart({ ...fixture.text, id: PartID.ascending(), text: fenced({ ...card, outcome: "blocked" }) })
      yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    }))
  }))

  it.instance("rejects stale proposal selection and forged result authorship pointing to actual foreign records", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    const fixture = yield* seed()
    const nextInfo = yield* sessions.updateMessage(assistant(fixture.child.id, "archie", fixture.author.info.parentID))
    const nextPart = yield* sessions.updatePart({ ...fixture.text, id: PartID.ascending(), messageID: nextInfo.id })
    yield* fixture.work.record({ info: nextInfo, parts: [nextPart] })
    yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    expect((yield* UpstreamProvenance.observe({ ...fixture.input, authorMessageID: SessionMessage.ID.make(nextInfo.id) })).authorMessageID).toBe(SessionMessage.ID.make(nextInfo.id))
    const foreign = yield* seed()
    yield* refusal({ ...fixture.input, authorMessageID: foreign.input.authorMessageID }, "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH")
    yield* sessions.updatePart({ ...fixture.task, state: {
      ...fixture.task.state, metadata: { ...fixture.task.state.metadata, workResult: {
          ...fixture.task.state.metadata.workResult, author: { memberId: "archie", executionSessionID: foreign.child.id, messageID: foreign.author.info.id },
      } },
    } })
    yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
  }))

  it.instance("corrupt retained storage propagates a defect instead of becoming attribution refusal", () => Effect.gen(function* () {
    const fixture = yield* seed()
    const database = yield* Database.Service
    const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, fixture.child.id)).all().pipe(Effect.orDie)
    const row = rows.find((event) => event.data.executionSessionID === fixture.child.id && event.data.taskId === fixture.input.logicalTaskID)
    if (!row) throw new Error("expected retained logical Task event")
    yield* database.db.update(EventTable).set({ data: { ...row.data, source: "invalid-source" } }).where(eq(EventTable.id, row.id)).run().pipe(Effect.orDie)
    const exit = yield* Effect.exit(UpstreamProvenance.observe(fixture.input))
    if (Exit.isSuccess(exit)) throw new Error("expected corrupt binding defect")
    expect(Cause.hasDies(exit.cause)).toBe(true)
    expect(Cause.squash(exit.cause)).not.toBeInstanceOf(UpstreamProvenance.Denied)
  }))

  it.instance("background flag alone or running snapshot alone requires named HOLD", () => Effect.gen(function* () {
    yield* Effect.forEach(["background-flag", "running-snapshot"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* seed({ background: variant === "background-flag" })
      if (variant === "background-flag") yield* fixture.work.record(fixture.author)
      if (variant === "running-snapshot") yield* fixture.work.hostEnded("running", "Background task started")
      expect((yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")).message).toContain("HOLD:")
    }))
  }))

  it.instance("completed but undelivered real job plus caller-forged matching notice still requires HOLD", () => Effect.gen(function* () {
    const fixture = yield* seed({ background: true })
    const jobs = yield* BackgroundJob.Service
    const sessions = yield* Session.Service
    yield* jobs.start({ id: fixture.child.id, type: "task",
      metadata: { parentSessionId: fixture.parent.id, sessionId: fixture.child.id },
      run: Effect.succeed(fixture.text.text),
    })
    const settled = yield* jobs.wait({ id: fixture.child.id })
    expect(settled.info?.status).toBe("completed")
    expect(settled.info?.output).toBe(fixture.text.text)
    expect((yield* sessions.messages({ sessionID: fixture.parent.id })).flatMap((message) => message.parts)
      .some((part) => part.type === "text" && part.synthetic === true)).toBe(false)
    // Equal bytes cannot establish which assistant the job returned. The forged delivery selects another real row.
    const alternate = yield* sessions.updateMessage(assistant(fixture.child.id, "archie", fixture.author.info.parentID))
    yield* sessions.updatePart({ ...fixture.text, id: PartID.ascending(), messageID: alternate.id })
    yield* notice(fixture)
    expect((yield* refusal({ ...fixture.input, authorMessageID: SessionMessage.ID.make(alternate.id) },
      "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")).message).toContain("HOLD:")
  }))

  it.instance("observes current projected parent and author through real V2 Session events", () => Effect.gen(function* () {
    const fixture = yield* seed()
    const authorID = SessionMessage.ID.create()
    yield* modernAssistant(fixture.child.id, authorID, "archie", fixture.text.text)
    const parentID = SessionMessage.ID.create()
    const callID = `call-${parentID}`
    yield* modernAssistant(fixture.parent.id, parentID, "maestro", "", { callID, metadata: {
      ...fixture.task.state.metadata, workResult: { ...fixture.task.state.metadata.workResult,
        card: { parsed: true, messageID: authorID },
        author: { memberId: "archie", executionSessionID: fixture.child.id, messageID: authorID },
      },
    } })
    const input = { ...fixture.input, parentMessageID: parentID, parentCallID: callID, authorMessageID: authorID }
    expect(yield* UpstreamProvenance.observe(input)).toEqual({ ...input, schema: "maestro-upstream-attribution-v1", memberID: upstreamMemberID, profile: "upstream" })
    expect(yield* UpstreamProvenance.observe(input)).toEqual(yield* UpstreamProvenance.observe(input))
  }))

  it.instance("supports modern parent with retained legacy child and modern child with legacy parent", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    const fixture = yield* seed()
    const parentID = SessionMessage.ID.create()
    const callID = `call-${parentID}`
    yield* modernAssistant(fixture.parent.id, parentID, "maestro", "", { callID, metadata: fixture.task.state.metadata })
    expect((yield* UpstreamProvenance.observe({ ...fixture.input, parentMessageID: parentID, parentCallID: callID })).authorMessageID).toBe(SessionMessage.ID.make(fixture.author.info.id))
    const authorID = SessionMessage.ID.create()
    yield* modernAssistant(fixture.child.id, authorID, "archie", fixture.text.text)
    yield* sessions.updatePart({ ...fixture.task, state: { ...fixture.task.state, metadata: {
      ...fixture.task.state.metadata, workResult: { ...fixture.task.state.metadata.workResult,
        card: { parsed: true, messageID: authorID }, author: { memberId: "archie", executionSessionID: fixture.child.id, messageID: authorID },
      },
    } } })
    expect((yield* UpstreamProvenance.observe({ ...fixture.input, authorMessageID: authorID })).authorMessageID).toBe(authorID)
  }))

  it.instance("incompatible same-id V1 and V2 projections refuse instead of selecting favorable legacy view", () => Effect.gen(function* () {
    const fixture = yield* seed()
    yield* modernAssistant(fixture.child.id, fixture.input.authorMessageID, "general", fixture.text.text)
    yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH")
  }))

  it.instance("provider result metadata and provider-executed calls cannot forge modern host Task placement", () => Effect.gen(function* () {
    yield* Effect.forEach(["provider-only", "provider-executed"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* seed()
      const parentID = SessionMessage.ID.create()
      const callID = `call-${parentID}`
      yield* modernAssistant(fixture.parent.id, parentID, "maestro", "", {
        callID, metadata: fixture.task.state.metadata,
        providerOnly: variant === "provider-only", providerExecuted: variant === "provider-executed",
      })
      yield* refusal({ ...fixture.input, parentMessageID: parentID, parentCallID: callID }, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    }))
  }))

  it.instance("actual modern author role, failure, and unfinished tools override successful legacy Task metadata", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    const events = yield* EventV2Bridge.Service
    yield* Effect.forEach(["role", "failed", "tool-error", "incomplete"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* seed()
      const authorID = SessionMessage.ID.create()
      if (variant === "role") yield* events.publish(SessionEvent.ContextUpdated, {
        sessionID: fixture.child.id, messageID: authorID, text: fixture.text.text, timestamp: yield* DateTime.now,
      })
      if (variant === "failed") {
        yield* modernAssistant(fixture.child.id, authorID, "archie", fixture.text.text)
        yield* events.publish(SessionEvent.Step.Failed, { sessionID: fixture.child.id, assistantMessageID: authorID,
          error: { type: "unknown", message: "Actual V2 author failed" }, timestamp: yield* DateTime.now,
        })
      }
      if (variant === "tool-error" || variant === "incomplete") {
        const base = { sessionID: fixture.child.id, assistantMessageID: authorID }
        yield* events.publish(SessionEvent.Step.Started, { ...base, agent: AgentV2.ID.make("archie"), model: { id: ref.modelID, providerID: ref.providerID }, timestamp: yield* DateTime.now })
        yield* events.publish(SessionEvent.Text.Started, { ...base, textID: `text-${authorID}`, timestamp: yield* DateTime.now })
        yield* events.publish(SessionEvent.Text.Ended, { ...base, textID: `text-${authorID}`, text: fixture.text.text, timestamp: yield* DateTime.now })
        yield* events.publish(SessionEvent.Tool.Input.Started, { ...base, callID: "read-proposal", name: "read", timestamp: yield* DateTime.now })
        yield* events.publish(SessionEvent.Tool.Called, { ...base, callID: "read-proposal", tool: "read", input: {}, provider: { executed: false }, timestamp: yield* DateTime.now })
        if (variant === "tool-error") yield* events.publish(SessionEvent.Tool.Failed, { ...base, callID: "read-proposal",
          error: { type: "unknown", message: "Actual projected read failed" }, provider: { executed: false }, timestamp: yield* DateTime.now,
        })
        yield* events.publish(SessionEvent.Step.Ended, { ...base, finish: "stop", cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, timestamp: yield* DateTime.now,
        })
      }
      yield* sessions.updatePart({ ...fixture.task, state: { ...fixture.task.state, metadata: {
        ...fixture.task.state.metadata, workResult: { ...fixture.task.state.metadata.workResult,
          card: { parsed: true, messageID: authorID }, author: { memberId: "archie", executionSessionID: fixture.child.id, messageID: authorID },
        },
      } } })
      yield* refusal({ ...fixture.input, authorMessageID: authorID }, variant === "role" ? "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH" : "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    }))
  }))

  it.instance("actual V2 background Task stays HOLD with ended snapshot and matching synthetic claim", () => Effect.gen(function* () {
    const fixture = yield* seed({ background: true })
    const parentID = SessionMessage.ID.create()
    const callID = `call-${parentID}`
    yield* modernAssistant(fixture.parent.id, parentID, "maestro", "", { callID, metadata: {
      ...fixture.task.state.metadata, workResult: yield* fixture.work.notice("completed", fixture.text.text),
    } })
    yield* notice(fixture)
    expect((yield* refusal({ ...fixture.input, parentMessageID: parentID, parentCallID: callID },
      "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")).message).toContain("HOLD:")
  }))
})
