export * as TaskWorkObservation from "./task-work-observation"

import { isDeepStrictEqual } from "node:util"
import { eq } from "drizzle-orm"
import { DateTime, Effect, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import type { EventV2 } from "@orchestra/core/event"
import { fromRow } from "@orchestra/core/session/info"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { MessageTable, PartTable, SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { SessionV1 } from "@orchestra/core/v1/session"
import type { BackendResult } from "@/maestro/backend-result"
import { LogicalTask } from "@/maestro/logical-task"
import { SessionAuthority } from "@/maestro/session-authority"
import { UpstreamSettlement } from "@/maestro/upstream-settlement"
import type { SessionID } from "@/session/schema"
import type { Tool } from "./tool"
import type { TaskBackground } from "./task-background"

const record = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))
const terminal = Schema.decodeUnknownSync(Schema.Struct({
  reason: Schema.Literals(["ended", "blocked", "failed", "interrupted", "running"]),
  hostDetail: Schema.optional(Schema.String),
}))

/** Existing Task metadata events, bound to the original invocation; never writes a settlement receipt. */
export function make(input: {
  database: Database.Interface
  events: EventV2.Interface
  ctx: Tool.Context
  childSessionID: SessionID
  taskID: string
  metadata: TaskBackground.Metadata
}) {
  const read = Effect.fn("TaskWorkObservation.read")(function* () {
    const parent = yield* input.database.db.select().from(SessionTable).where(eq(SessionTable.id, input.ctx.sessionID)).get()
    const child = yield* input.database.db.select().from(SessionTable).where(eq(SessionTable.id, input.childSessionID)).get()
    const logical = yield* LogicalTask.read(input.childSessionID)
    if (!parent || !child || child.parent_id !== parent.id || child.project_id !== parent.project_id ||
      child.directory !== parent.directory || !logical || logical.taskId !== input.taskID ||
      logical.executionSessionID !== child.id ||
      logical.projectID !== parent.project_id || logical.memberID !== child.agent)
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation lineage mismatch" })
    const authority = yield* SessionAuthority.make((id) =>
      input.database.db.select().from(SessionTable).where(eq(SessionTable.id, id)).get().pipe(
        Effect.map((row) => row ? fromRow(row) : undefined),
      ),
    )(parent.id, parent.project_id).pipe(
      Effect.mapError(() => new UpstreamSettlement.Hold({ message: "HOLD: Task host observation lineage mismatch" })),
    )
    if (logical.authoritySessionID !== authority.rootID)
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation lineage mismatch" })
    const modern = yield* input.database.db.select().from(SessionMessageTable)
      .where(eq(SessionMessageTable.id, SessionMessage.ID.make(input.ctx.messageID))).get()
    const legacy = yield* input.database.db.select().from(MessageTable)
      .where(eq(MessageTable.id, SessionV1.MessageID.make(input.ctx.messageID))).get()
    const parts = yield* input.database.db.select().from(PartTable)
      .where(eq(PartTable.message_id, SessionV1.MessageID.make(input.ctx.messageID))).all()
    const next = modern ? yield* Effect.gen(function* () {
      const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...modern.data, id: modern.id, type: modern.type })
      const calls = message.type === "assistant" ? message.content.filter((part) => part.type === "tool" && part.id === input.ctx.callID) : []
      const call = calls[0]
      if (modern.session_id !== parent.id || message.type !== "assistant" || message.agent !== "maestro" ||
        calls.length !== 1 || call?.type !== "tool" || call.name !== "task" || call.provider?.executed || !("structured" in call.state))
        return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation native owner mismatch" })
      return { kind: "modern" as const, call: { ...call, state: call.state },
        metadata: record(call.state.structured.metadata ?? {}), input: call.state.input }
    }) : undefined
    const selected = parts.map((row) => ({ row, part: Schema.decodeUnknownSync(SessionV1.Part)({ ...row.data,
      id: row.id, sessionID: row.session_id, messageID: row.message_id }) })).filter((item) => item.part.type === "tool" && item.part.callID === input.ctx.callID)
    const old = legacy || selected.length ? yield* Effect.gen(function* () {
      const item = selected[0]
      if (!legacy || legacy.session_id !== parent.id || legacy.data.role !== "assistant" || legacy.data.agent !== "maestro" ||
        selected.length !== 1 || !item || item.part.type !== "tool" || item.part.tool !== "task" || item.part.metadata?.providerExecuted ||
        item.row.session_id !== parent.id || !("metadata" in item.part.state))
        return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation retained owner mismatch" })
      return { kind: "legacy" as const, part: { ...item.part, state: item.part.state },
        metadata: record(item.part.state.metadata ?? {}), input: item.part.state.input }
    }) : undefined
    const views = [next, old].filter((view) => view !== undefined)
    if (!views.length) return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation original Task missing" })
    if (views.some((view) => !isDeepStrictEqual(view.input, views[0].input)))
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation views conflict" })
    views.forEach((view) => {
      const selection = Schema.decodeUnknownSync(Schema.Struct({ subagent_type: Schema.String, task_id: Schema.optional(Schema.String) }))(view.input)
      if (selection.subagent_type !== child.agent || selection.task_id !== undefined &&
        selection.task_id !== child.id && selection.task_id !== logical.taskId ||
        view.metadata.parentSessionId !== parent.id || view.metadata.sessionId !== child.id)
        throw new UpstreamSettlement.Hold({ message: "HOLD: Task host observation original anchors mismatch" })
    })
    return { views, location: fromRow(parent).location }
  })

  const verifyIdentity = (value: BackendResult.WorkResult, metadata: Record<string, unknown>) => {
    if (value.taskId !== input.taskID || value.author && (value.author.executionSessionID !== input.childSessionID ||
      value.author.messageID !== value.card.messageID))
      throw new UpstreamSettlement.Hold({ message: "HOLD: Task host observation captured identity mismatch" })
    if (metadata.workResult === undefined) return
    const previous = record(metadata.workResult)
    const author = previous.author === undefined ? undefined : record(previous.author)
    const card = record(previous.card ?? {})
    if (value.terminal.reason === "running" && value.card.messageID === undefined) return
    if (previous.taskId !== input.taskID || author && (author.executionSessionID !== input.childSessionID ||
      author.messageID !== value.card.messageID) || card.messageID !== undefined && card.messageID !== value.card.messageID)
      throw new UpstreamSettlement.Hold({ message: "HOLD: Task host observation retained identity mismatch" })
  }

  const verifyAuthor = Effect.fn("TaskWorkObservation.verifyAuthor")(function* (value: BackendResult.WorkResult) {
    if (!value.card.messageID) return
    const modern = yield* input.database.db.select().from(SessionMessageTable)
      .where(eq(SessionMessageTable.id, SessionMessage.ID.make(value.card.messageID))).get()
    const legacy = yield* input.database.db.select().from(MessageTable)
      .where(eq(MessageTable.id, SessionV1.MessageID.make(value.card.messageID))).get()
    const child = yield* input.database.db.select().from(SessionTable).where(eq(SessionTable.id, input.childSessionID)).get()
    if (!child || !modern && !legacy || legacy && (legacy.session_id !== child.id ||
      legacy.data.role !== "assistant" || legacy.data.agent !== child.agent))
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation returned author mismatch" })
    if (modern) {
      const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...modern.data, id: modern.id, type: modern.type })
      if (modern.session_id !== child.id || message.type !== "assistant" || message.agent !== child.agent)
        return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation native returned author mismatch" })
    }
    if (value.author && value.author.memberId !== child.agent)
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation returned member mismatch" })
  })

  const publish = Effect.fn("TaskWorkObservation.publish")(function* (value: BackendResult.WorkResult) {
    if (!input.ctx.callID)
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation original invocation missing" })
    if (value.terminal.reason !== "failed" && value.terminal.reason !== "interrupted")
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation requires unfavorable exit" })
    const current = yield* read()
    current.views.forEach((view) => verifyIdentity(value, view.metadata))
    yield* verifyAuthor(value)
    const failures = current.views.flatMap((view) => {
      if (view.metadata.workResult === undefined) return []
      const previous = record(view.metadata.workResult)
      return ["failed", "interrupted"].includes(String(record(previous.terminal).reason)) ? [previous] : []
    })
    if (failures.some((failure) => !isDeepStrictEqual(failure, failures[0])))
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation terminal views conflict" })
    const canonical = failures[0]
    if (canonical) {
      const { terminal: ignored, ...fields } = canonical
      const { terminal: incoming, ...offered } = value
      if (!isDeepStrictEqual(fields, offered))
        return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation captured fields conflict" })
    }
    const observed = canonical ? terminal(canonical.terminal) : undefined
    if (observed && observed.reason !== value.terminal.reason)
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation original terminal conflict" })
    const result = observed ? {
      ...value, terminal: { ...observed,
        ...(observed.hostDetail === undefined && value.terminal.hostDetail !== undefined
          ? { hostDetail: value.terminal.hostDetail } : {}) },
    } : value
    if (current.views.some((view) => view.metadata.upstreamSettlement !== undefined && !isDeepStrictEqual(view.metadata.workResult, result)))
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation already settled" })
    // Retain native inspection/streaming callback; completed Task metadata needs the existing event boundary below.
    yield* input.ctx.metadata({ metadata: { ...input.metadata, workResult: result } })
    const latest = yield* read()
    latest.views.forEach((view) => verifyIdentity(value, view.metadata))
    yield* verifyAuthor(value)
    latest.views.forEach((view) => {
      if (view.metadata.workResult === undefined) return
      const previous = record(view.metadata.workResult)
      const observed = terminal(previous.terminal)
      if (observed.reason !== "failed" && observed.reason !== "interrupted") return
      const { terminal: ignored, ...fields } = previous
      const { terminal: offered, ...next } = result
      if (!isDeepStrictEqual(fields, next) || observed.reason !== result.terminal.reason ||
        observed.hostDetail !== undefined && observed.hostDetail !== result.terminal.hostDetail)
        throw new UpstreamSettlement.Hold({ message: "HOLD: Task host observation current terminal conflict" })
    })
    if (latest.views.some((view) => view.metadata.upstreamSettlement !== undefined && !isDeepStrictEqual(view.metadata.workResult, result)))
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation already settled" })
    // EventV2 owns each commit/notification. A later HOLD must not roll back an already announced event.
    yield* Effect.forEach(latest.views, (view) => {
      const metadata = { ...view.metadata, workResult: result }
      if (view.kind === "modern") return input.events.publish(SessionEvent.Tool.Progress, {
        sessionID: input.ctx.sessionID, assistantMessageID: SessionMessage.ID.make(input.ctx.messageID),
        callID: input.ctx.callID ?? "", timestamp: DateTime.makeUnsafe(Date.now()),
        structured: { ...view.call.state.structured, metadata }, content: view.call.state.content,
      }, { location: latest.location }).pipe(Effect.asVoid)
      return input.events.publish(SessionV1.Event.PartUpdated, {
        sessionID: input.ctx.sessionID, time: Date.now(),
        part: { ...view.part, state: { ...view.part.state, metadata } },
      }, { persist: true, location: latest.location }).pipe(Effect.asVoid)
    }, { concurrency: 1 })
    const stored = yield* read()
    if (stored.views.some((view) => !isDeepStrictEqual(view.metadata.workResult, result)))
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation readback mismatch" })
  })

  const capture = Effect.fn("TaskWorkObservation.capture")(function* (value: BackendResult.WorkResult) {
    const current = yield* read()
    current.views.forEach((view) => verifyIdentity(value, view.metadata))
    yield* verifyAuthor(value)
    const failures = current.views.flatMap((view) => {
      if (view.metadata.workResult === undefined) return []
      const previous = record(view.metadata.workResult)
      const observed = terminal(previous.terminal)
      if (observed.reason !== "failed" && observed.reason !== "interrupted") return []
      const { terminal: ignored, ...fields } = previous
      const { terminal: capturedTerminal, ...capturedFields } = value
      if (!isDeepStrictEqual(fields, capturedFields))
        throw new UpstreamSettlement.Hold({ message: "HOLD: Task host observation canonical result conflict" })
      return [observed]
    })
    if (failures.some((failure) => !isDeepStrictEqual(failure, failures[0])))
      return yield* new UpstreamSettlement.Hold({ message: "HOLD: Task host observation canonical terminal conflict" })
    return structuredClone(failures.length ? { ...value, terminal: failures[0] } : value)
  })

  return { publish, capture }
}
