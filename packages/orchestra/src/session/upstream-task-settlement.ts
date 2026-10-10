export * as UpstreamTaskSettlement from "./upstream-task-settlement"

import { isDeepStrictEqual } from "node:util"
import { and, eq, sql } from "drizzle-orm"
import { DateTime, Effect, Option, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import type { EventV2 } from "@orchestra/core/event"
import { KeyedMutex } from "@orchestra/core/effect/keyed-mutex"
import { fromRow } from "@orchestra/core/session/info"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionMessageUpdater } from "@orchestra/core/session/message-updater"
import { MessageTable, PartTable, SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { SessionV1 } from "@orchestra/core/v1/session"
import { UpstreamResult } from "@/maestro/upstream-result"
import { MessageV2 } from "./message-v2"
import { MessageID, SessionID } from "./schema"

export class TaskSettlementHeld extends Schema.TaggedErrorClass<TaskSettlementHeld>()("TaskSettlementHeld", {
  reason: Schema.String,
}) {}

export type TaskSettlementInput = SessionMessageUpdater.UpstreamSettlement & {
  readonly sessionID: SessionID
  readonly childSessionID: SessionID
  readonly logicalTaskID: string
  readonly authorMessageID: MessageID
}

const record = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))
const refuse = (reason: string) => Effect.fail(new TaskSettlementHeld({ reason }))

/** Private host capability. Validate retained evidence before either projection receives a receipt. */
export function make(deps: { database: Database.Interface; events: EventV2.Interface }) {
  const lock = KeyedMutex.makeUnsafe<string>()
  return (input: TaskSettlementInput) => lock.withLock(
    `${input.sessionID}\0${input.parentMessageID}\0${input.parentCallID}`,
  )(Effect.gen(function* () {
    const { LogicalTask } = yield* Effect.promise(() => import("@/maestro/logical-task"))
    const parent = yield* deps.database.db.select().from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()
    const child = yield* deps.database.db.select().from(SessionTable).where(eq(SessionTable.id, input.childSessionID)).get()
    const logical = yield* LogicalTask.read(input.childSessionID)
    if (!parent || !child || child.parent_id !== parent.id || child.project_id !== parent.project_id ||
      child.directory !== parent.directory || child.agent !== "archie" || !logical || logical.taskId !== input.logicalTaskID ||
      logical.executionSessionID !== child.id || logical.authoritySessionID !== parent.id ||
      logical.memberID !== "archie" || logical.projectID !== parent.project_id)
      return yield* refuse("UPSTREAM_SETTLEMENT_LINEAGE_MISMATCH")
    const receipt = yield* Schema.decodeUnknownEffect(SessionMessageUpdater.UpstreamSettlement)({
      parentMessageID: input.parentMessageID, parentCallID: input.parentCallID, workResult: input.workResult,
      deliveryMessageID: input.deliveryMessageID, ...(input.deliveryPartID ? { deliveryPartID: input.deliveryPartID } : {}),
    }, { onExcessProperty: "error" })
    const result = record(input.workResult)
    const identity = Schema.decodeUnknownOption(Schema.Struct({ schema: Schema.Literal(UpstreamResult.SCHEMA),
      taskId: Schema.String, card: Schema.Struct({ messageID: Schema.String }),
      author: Schema.Struct({ memberId: Schema.Literal("archie"), executionSessionID: Schema.String, messageID: Schema.String }),
    }))(result)
    if (Option.isNone(identity) || identity.value.taskId !== logical.taskId || identity.value.author.executionSessionID !== child.id ||
      identity.value.author.messageID !== input.authorMessageID || identity.value.card.messageID !== input.authorMessageID)
      return yield* refuse("UPSTREAM_SETTLEMENT_RESULT_MISMATCH")
    const tasks = yield* readTasks(deps.database, input, receipt)
    const proposal = yield* readProposal(deps.database, input)
    // Host failure may lower a stored proposal, but only if the original Task already carries that host observation.
    const observed = tasks.flatMap((view) => view.metadata.workResult === undefined ? [] : [record(view.metadata.workResult)])
    const terminal = record(result.terminal)
    const lowered = ["failed", "interrupted"].includes(String(terminal.reason)) &&
      observed.some((value) => isDeepStrictEqual(value, result))
    const expected = { ...proposal.result, taskId: logical.taskId,
      ...(lowered ? { terminal: result.terminal } : {}),
      ...Object.fromEntries(["writeRoots", "shellWrites", "shellSandbox"].flatMap((key) =>
        result[key] === undefined ? [] : observed.some((value) => isDeepStrictEqual(value[key], result[key])) ? [[key, result[key]]] : [])),
    }
    if (!isDeepStrictEqual(expected, result)) return yield* refuse("UPSTREAM_SETTLEMENT_PROPOSAL_MISMATCH")
    const state = terminal.reason === "failed" || terminal.reason === "interrupted" ? "error" : "completed"
    yield* readDelivery(deps.database, input, proposal.text, state, tasks[0].input)
    // Re-acquire every retained Task view before publishing. The projector merges the private receipt against current state.
    const current = yield* readTasks(deps.database, input, receipt)
    if (current.every((view) => view.existing)) return false
    const metadata = { parentSessionId: parent.id, sessionId: child.id, workResult: result, upstreamSettlement: receipt }
    yield* Effect.forEach(current.filter((view) => !view.existing), (view) => {
      if (view.kind === "modern") return deps.events.publish(SessionEvent.Tool.Progress, {
        sessionID: input.sessionID, assistantMessageID: SessionMessage.ID.make(input.parentMessageID),
        callID: input.parentCallID, timestamp: DateTime.makeUnsafe(Date.now()),
        structured: { metadata }, content: view.call.state.content,
      }, { location: fromRow(parent).location }).pipe(Effect.asVoid)
      return deps.events.publish(SessionV1.Event.PartUpdated, {
        sessionID: input.sessionID, time: Date.now(),
        part: { ...view.part, state: { ...view.part.state, metadata: { ...view.metadata, ...metadata } } },
      }, { persist: true, location: fromRow(parent).location }).pipe(Effect.asVoid)
    }, { concurrency: 1 })
    const stored = yield* readTasks(deps.database, input, receipt)
    if (!stored.every((view) => view.existing)) return yield* refuse("UPSTREAM_SETTLEMENT_READBACK_MISMATCH")
    return true
  }).pipe(Effect.provideService(Database.Service, deps.database),
    Effect.mapError((error) => error instanceof TaskSettlementHeld ? error : new TaskSettlementHeld({ reason: "UPSTREAM_SETTLEMENT_ACQUISITION" })),
    Effect.catchDefect(() => refuse("UPSTREAM_SETTLEMENT_ACQUISITION"))))
}

const readTasks = Effect.fn("UpstreamTaskSettlement.readTasks")(function* (database: Database.Interface,
  input: TaskSettlementInput, receipt: SessionMessageUpdater.UpstreamSettlement) {
  const modern = yield* database.db.select().from(SessionMessageTable)
    .where(eq(SessionMessageTable.id, SessionMessage.ID.make(input.parentMessageID))).get()
  const legacy = yield* database.db.select().from(MessageTable).where(eq(MessageTable.id, MessageID.make(input.parentMessageID))).get()
  const parts = yield* database.db.select().from(PartTable).where(and(eq(PartTable.session_id, input.sessionID),
    eq(PartTable.message_id, MessageID.make(input.parentMessageID)),
    sql`json_extract(${PartTable.data}, '$.callID') = ${input.parentCallID}`)).limit(2).all()
  const modernView = modern ? yield* Effect.gen(function* () {
    const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...modern.data, id: modern.id, type: modern.type })
    if (modern.session_id !== input.sessionID || message.type !== "assistant" || message.agent !== "maestro")
      return yield* refuse("UPSTREAM_SETTLEMENT_TASK_MISMATCH")
    const calls = message.content.filter((part) => part.type === "tool" && part.id === input.parentCallID)
    const call = calls[0]
    if (calls.length !== 1 || call?.type !== "tool" || call.name !== "task" || call.provider?.executed || !("structured" in call.state))
      return yield* refuse("UPSTREAM_SETTLEMENT_TASK_MISMATCH")
    const metadata = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(call.state.structured.metadata)
    if (Option.isNone(metadata)) return yield* refuse("UPSTREAM_SETTLEMENT_TASK_ANCHOR_MISMATCH")
    return { kind: "modern" as const, call: { ...call, state: call.state }, input: call.state.input,
      metadata: metadata.value }
  }) : undefined
  const legacyView = legacy || parts.length ? yield* Effect.gen(function* () {
    if (!legacy || legacy.session_id !== input.sessionID || legacy.data.role !== "assistant" ||
      legacy.data.agent !== "maestro" || parts.length !== 1)
      return yield* refuse("UPSTREAM_SETTLEMENT_TASK_AMBIGUOUS")
    const row = parts[0]
    const part = Schema.decodeUnknownSync(SessionV1.Part)({ ...row.data, id: row.id, messageID: row.message_id, sessionID: row.session_id })
    if (part.type !== "tool" || part.tool !== "task" || part.metadata?.providerExecuted || !("metadata" in part.state))
      return yield* refuse("UPSTREAM_SETTLEMENT_TASK_MISMATCH")
    return { kind: "legacy" as const, part: { ...part, state: part.state }, input: part.state.input, metadata: part.state.metadata ?? {} }
  }) : undefined
  const views = [modernView, legacyView].filter((view) => view !== undefined)
  if (!views.length) return yield* refuse("UPSTREAM_SETTLEMENT_TASK_MISSING")
  if (views.some((view) => !isDeepStrictEqual(view.input, views[0].input)))
    return yield* refuse("UPSTREAM_SETTLEMENT_TASK_VIEW_CONFLICT")
  return yield* Effect.forEach(views, (view) => Effect.gen(function* () {
    const selection = Schema.decodeUnknownOption(Schema.Struct({ subagent_type: Schema.Literal("archie"), task_id: Schema.optional(Schema.String) }))(view.input)
    if (Option.isNone(selection) || selection.value.task_id !== undefined && selection.value.task_id !== input.childSessionID ||
      view.metadata.parentSessionId !== input.sessionID || view.metadata.sessionId !== input.childSessionID)
      return yield* refuse("UPSTREAM_SETTLEMENT_TASK_ANCHOR_MISMATCH")
    const state = view.kind === "modern" ? view.call.state : view.part.state
    const incomingTerminal = record(input.workResult.terminal)
    if (state.status === "error" && !["failed", "interrupted"].includes(String(incomingTerminal.reason)))
      return yield* refuse("UPSTREAM_SETTLEMENT_TERMINAL_CONFLICT")
    if (view.metadata.workResult !== undefined) {
      const result = record(view.metadata.workResult)
      if (result.taskId !== input.logicalTaskID || result.author !== undefined &&
        record(result.author).executionSessionID !== input.childSessionID)
        return yield* refuse("UPSTREAM_SETTLEMENT_TASK_ANCHOR_MISMATCH")
      if (result.author !== undefined && record(result.author).messageID !== input.authorMessageID ||
        result.card !== undefined && record(result.card).messageID !== undefined && record(result.card).messageID !== input.authorMessageID)
        return yield* refuse("UPSTREAM_SETTLEMENT_TASK_ANCHOR_MISMATCH")
      const terminal = record(result.terminal)
      if (["failed", "interrupted"].includes(String(terminal.reason)) && !isDeepStrictEqual(result, input.workResult))
        return yield* refuse("UPSTREAM_SETTLEMENT_TERMINAL_CONFLICT")
    }
    const owner = { sessionID: input.sessionID, messageID: input.parentMessageID, callID: input.parentCallID, tool: "task", input: view.input }
    const existing = SessionMessageUpdater.upstreamSettlement(view.metadata, owner)
    if (view.metadata.upstreamSettlement !== undefined && (!existing || !isDeepStrictEqual(existing, receipt)))
      return yield* refuse("UPSTREAM_SETTLEMENT_CONFLICT")
    return { ...view, existing }
  }))
})

const readProposal = Effect.fn("UpstreamTaskSettlement.readProposal")(function* (database: Database.Interface, input: TaskSettlementInput) {
  const modern = yield* database.db.select().from(SessionMessageTable)
    .where(eq(SessionMessageTable.id, SessionMessage.ID.make(input.authorMessageID))).get()
  const legacy = yield* database.db.select().from(MessageTable).where(eq(MessageTable.id, SessionV1.MessageID.make(input.authorMessageID))).get()
  const old = legacy ? yield* Effect.gen(function* () {
    const { BackendResult } = yield* Effect.promise(() => import("@/maestro/backend-result"))
    const { Seats } = yield* Effect.promise(() => import("@/maestro/seats"))
    if (legacy.session_id !== input.childSessionID) return yield* refuse("UPSTREAM_SETTLEMENT_AUTHOR_MISMATCH")
    const message = yield* MessageV2.get({ sessionID: input.childSessionID, messageID: input.authorMessageID })
    if (message.info.role !== "assistant" || message.info.agent !== "archie" || message.info.time.completed === undefined ||
      message.parts.some((part) => part.sessionID !== input.childSessionID || part.messageID !== input.authorMessageID))
      return yield* refuse("UPSTREAM_SETTLEMENT_AUTHOR_MISMATCH")
    return { result: BackendResult.assemble(message, [], Seats.all.archie),
      text: message.parts.flatMap((part) => part.type === "text" && !part.synthetic && !part.ignored ? [part.text] : []).at(-1) ?? "" }
  }) : undefined
  const next = modern ? yield* Effect.gen(function* () {
    const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...modern.data, id: modern.id, type: modern.type })
    if (modern.session_id !== input.childSessionID || message.type !== "assistant" || message.agent !== "archie" || message.time.completed === undefined)
      return yield* refuse("UPSTREAM_SETTLEMENT_AUTHOR_MISMATCH")
    const texts = message.content.flatMap((part) => part.type === "text" ? [part.text] : [])
    const card = UpstreamResult.parse(texts.join("\n"))
    const tools = message.content.flatMap((part) => part.type === "tool" ? [part.state.status] : [])
    const terminal = message.error || tools.includes("error") ? "failed" : !message.finish ||
      ["tool-calls", "unknown"].includes(message.finish) || tools.some((status) => status !== "completed") ? "interrupted" :
      !card || card.outcome === "blocked" || card.blockers.length ? "blocked" : "ended"
    return { text: texts.at(-1) ?? "", result: { schema: UpstreamResult.SCHEMA,
      card: { parsed: card !== undefined, messageID: message.id }, ...(card ? { outcome: card.outcome } : {}),
      changes: [], checks: [], blockers: card?.blockers ?? [], risks: card?.risks ?? [], nextActions: card?.nextActions ?? [],
      terminal: { reason: terminal }, memory: { reads: [], writes: [] }, artifacts: card?.artifacts ?? [],
      author: { memberId: "archie", executionSessionID: input.childSessionID, messageID: message.id },
    } }
  }) : undefined
  if (!old && !next) return yield* refuse("UPSTREAM_SETTLEMENT_AUTHOR_MISSING")
  if (old && next && !isDeepStrictEqual(old, next)) return yield* refuse("UPSTREAM_SETTLEMENT_AUTHOR_VIEW_CONFLICT")
  const proposal = next ?? old
  if (!proposal) return yield* refuse("UPSTREAM_SETTLEMENT_AUTHOR_MISSING")
  return proposal
})

const readDelivery = Effect.fn("UpstreamTaskSettlement.readDelivery")(function* (database: Database.Interface,
  input: TaskSettlementInput, text: string, state: "completed" | "error", taskInput: unknown) {
  const modern = yield* database.db.select().from(SessionMessageTable)
    .where(eq(SessionMessageTable.id, SessionMessage.ID.make(input.deliveryMessageID))).get()
  const legacy = yield* database.db.select().from(MessageTable).where(eq(MessageTable.id, MessageID.make(input.deliveryMessageID))).get()
  if (!modern && !legacy) return yield* refuse("UPSTREAM_SETTLEMENT_DELIVERY_MISSING")
  const description = Schema.decodeUnknownOption(Schema.Struct({ description: Schema.String }))(taskInput)
  const tag = state === "error" ? "task_error" : "task_result"
  const rendered = Option.isSome(description) ? [`<task id="${input.logicalTaskID}" state="${state}">`,
    `<summary>Background task ${state === "completed" ? "completed" : "failed"}: ${description.value.description}</summary>`,
    `<${tag}>`, text, `</${tag}>`, "</task>"].join("\n") : undefined
  const validText = (value: string) => value === text || rendered !== undefined && value === rendered
  const old = legacy ? yield* Effect.gen(function* () {
    if (!input.deliveryPartID || legacy.session_id !== input.sessionID || legacy.data.role !== "user")
      return yield* refuse("UPSTREAM_SETTLEMENT_DELIVERY_MISMATCH")
    const message = yield* MessageV2.get({ sessionID: input.sessionID, messageID: MessageID.make(input.deliveryMessageID) })
    const part = message.parts[0]
    if (message.parts.length !== 1 || part?.type !== "text" || part.id !== input.deliveryPartID || !part.synthetic || part.ignored ||
      part.sessionID !== input.sessionID || part.messageID !== input.deliveryMessageID || !validText(part.text) ||
      !isDeepStrictEqual(part.metadata?.source, { type: "task-return", task_id: input.childSessionID, state }) ||
      !isDeepStrictEqual(part.metadata?.workResult, input.workResult))
      return yield* refuse("UPSTREAM_SETTLEMENT_DELIVERY_MISMATCH")
    return part.text
  }) : undefined
  if (!legacy && input.deliveryPartID) return yield* refuse("UPSTREAM_SETTLEMENT_DELIVERY_MISMATCH")
  if (modern) {
    const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...modern.data, id: modern.id, type: modern.type })
    if (modern.session_id !== input.sessionID || message.type !== "synthetic" || message.sessionID !== input.sessionID ||
      !validText(message.text) || old !== undefined && message.text !== old)
      return yield* refuse("UPSTREAM_SETTLEMENT_DELIVERY_MISMATCH")
  }
})
