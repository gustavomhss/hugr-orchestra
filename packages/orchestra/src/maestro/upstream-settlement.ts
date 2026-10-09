export * as UpstreamSettlement from "./upstream-settlement"

import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessageUpdater } from "@orchestra/core/session/message-updater"
import { MessageTable, SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionSchema } from "@orchestra/core/session/schema"
import { fromRow } from "@orchestra/core/session/info"
import { SessionMessage } from "@orchestra/schema/session-message"
import { SessionV1 } from "@orchestra/core/v1/session"
import { eq } from "drizzle-orm"
import { DateTime, Effect, Option, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import type { TaskPromptOps } from "@/tool/task"
import type { SessionPrompt } from "@/session/prompt"
import type { BackendResult } from "./backend-result"
import { UpstreamResult } from "./upstream-result"
import { KeyedMutex } from "@orchestra/core/effect/keyed-mutex"

export type Capture = {
  readonly assistantMessageID: MessageID
  readonly workResult?: BackendResult.WorkResult
  readonly text: string
  readonly state: "completed" | "error"
}

export class Hold extends Schema.TaggedErrorClass<Hold>()("UpstreamSettlementHold", {
  message: Schema.String,
}) {}

const record = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))

/** Private host entrypoint. A returned job or a caller-authored notice never reaches this patch boundary. */
export function make(binding: {
  readonly sessionID: SessionID
  readonly messageID: MessageID
  readonly callID: string
  readonly childSessionID: SessionID
  readonly taskID: string
  readonly ops: TaskPromptOps
  readonly request: SessionPrompt.PromptInput & { messageID: MessageID }
  readonly capture: Capture
}) {
  const input = { ...binding, request: structuredClone(binding.request), capture: structuredClone(binding.capture) }
  // Retain one request identity across faults before/after admission. Once wake starts, never retry provider work.
  const progress = { wakeStarted: false }
  const admission: { data?: typeof SessionEvent.Synthetic.data.Type } = {}
  const eventID = EventV2.ID.create()
  const lock = KeyedMutex.makeUnsafe<string>()
  const deliver = Effect.fn("UpstreamSettlement.deliver")(function* () {
    const database = yield* Database.Service
    const sessions = yield* Session.Service
    const events = yield* EventV2Bridge.Service
    if (input.request.sessionID !== input.sessionID || input.request.parts.length !== 1)
      return yield* new Hold({ message: "HOLD: settlement request owner mismatch" })
    const text = input.request.parts[0]
    if (text?.type !== "text" || text.synthetic !== true)
      return yield* new Hold({ message: "HOLD: settlement requires synthetic text" })
    const source = Option.getOrUndefined(record(text.metadata?.source))
    const state = input.capture.workResult?.terminal.reason === "failed" || input.capture.workResult?.terminal.reason === "interrupted"
      ? "error" : input.capture.state
    if (source?.type !== "task-return" || source.task_id !== input.childSessionID || source.state !== state)
      return yield* new Hold({ message: "HOLD: settlement Task source mismatch" })
    const result = input.capture.workResult?.schema === UpstreamResult.SCHEMA ? input.capture.workResult : undefined
    if (result && (result.author?.memberId !== "walt" || result.author.messageID !== input.capture.assistantMessageID ||
      result.author.executionSessionID !== input.childSessionID || result.card.messageID !== input.capture.assistantMessageID ||
      result.taskId !== input.taskID))
      return yield* new Hold({ message: "HOLD: captured assistant binding mismatch" })

    const modern = yield* database.db.select().from(SessionMessageTable)
      .where(eq(SessionMessageTable.id, SessionMessage.ID.make(input.messageID))).get().pipe(Effect.orDie)
    const legacy = yield* database.db.select().from(MessageTable)
      .where(eq(MessageTable.id, SessionV1.MessageID.make(input.messageID))).get().pipe(Effect.orDie)
    if ((modern && modern.session_id !== input.sessionID) || (legacy && legacy.session_id !== input.sessionID))
      return yield* new Hold({ message: "HOLD: settlement parent projection owner mismatch" })
    const parentLocation = modern ? yield* Effect.gen(function* () {
      const store = yield* Effect.serviceOption(SessionStore.Service)
      if (Option.isSome(store)) {
        const parent = yield* store.value.get(SessionSchema.ID.make(input.sessionID))
        if (!parent) return yield* new Hold({ message: "HOLD: native parent Session missing" })
        return parent.location
      }
      // Legacy-host contexts may omit the global Store binding. Use its exact canonical row decoder, no new layer.
      const row = yield* database.db.select().from(SessionTable)
        .where(eq(SessionTable.id, SessionSchema.ID.make(input.sessionID))).get().pipe(Effect.orDie)
      if (!row) return yield* new Hold({ message: "HOLD: native parent Session missing" })
      return fromRow(row).location
    }) : undefined
    const receipt = modern ? yield* Effect.gen(function* () {
      if (modern.type !== "assistant") return yield* new Hold({ message: "HOLD: original parent not assistant" })
      if (!input.ops.resumeNotice) return yield* new Hold({ message: "HOLD: native notice resume adapter missing" })
      const existing = yield* database.db.select().from(SessionMessageTable)
        .where(eq(SessionMessageTable.id, SessionMessage.ID.make(input.request.messageID))).get().pipe(Effect.orDie)
      const retained = yield* database.db.select().from(MessageTable)
        .where(eq(MessageTable.id, SessionV1.MessageID.make(input.request.messageID))).get().pipe(Effect.orDie)
      if (retained) return yield* new Hold({ message: "HOLD: native notice identity already belongs to a legacy message" })
      if (!existing) {
        // Native host delivery, not a V1 prompt or a fabricated projection. Keep event ID/data stable across faults.
        const data = admission.data ?? { sessionID: SessionSchema.ID.make(input.sessionID), messageID: SessionMessage.ID.make(input.request.messageID),
          timestamp: yield* DateTime.now, text: text.text }
        admission.data = data
        yield* events.publish(SessionEvent.Synthetic, data, { id: eventID, location: parentLocation })
      }
      const delivered = yield* database.db.select().from(SessionMessageTable)
        .where(eq(SessionMessageTable.id, SessionMessage.ID.make(input.request.messageID))).get().pipe(Effect.orDie)
      if (!delivered || delivered.session_id !== input.sessionID)
        return yield* new Hold({ message: "HOLD: synthetic delivery not projected" })
      const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...delivered.data, id: delivered.id, type: delivered.type })
      if (message.type !== "synthetic" || message.sessionID !== input.sessionID || message.text !== text.text)
        return yield* new Hold({ message: "HOLD: synthetic delivery readback mismatch" })
      return { deliveryMessageID: message.id }
    }) : yield* Effect.gen(function* () {
      if (!legacy) return yield* new Hold({ message: "HOLD: original parent missing" })
      if (legacy.data.role !== "assistant") return yield* new Hold({ message: "HOLD: original parent not assistant" })
      // V1 admission-only stays outside execution; exact retry reconciles the same request and message ID.
      yield* input.ops.prompt({ ...input.request, noReply: true })
      const message = yield* MessageV2.get({ sessionID: input.sessionID, messageID: input.request.messageID })
      const part = message.parts[0]
      if (message.info.role !== "user" || message.info.sessionID !== input.sessionID ||
        message.parts.length !== 1 || part?.type !== "text" || !part.synthetic ||
        part.sessionID !== input.sessionID || part.messageID !== message.info.id || part.text !== text.text ||
        !isDeepStrictEqual(part.metadata?.source, text.metadata?.source))
        return yield* new Hold({ message: "HOLD: multipart delivery readback mismatch" })
      return { deliveryMessageID: message.info.id, deliveryPartID: part.id }
    })

    if (result) {
      const settlement = { parentMessageID: input.messageID, parentCallID: input.callID, workResult: result, ...receipt }
      if (modern) {
        const parent = Schema.decodeUnknownSync(SessionMessage.Message)({ ...modern.data, id: modern.id, type: modern.type })
        if (parent.type !== "assistant" || parent.agent !== "maestro")
          return yield* new Hold({ message: "HOLD: original parent not native Maestro assistant" })
        const matches = parent.content.filter((item) => item.type === "tool" && item.id === input.callID)
        const tool = matches[0]
        if (matches.length !== 1 || tool?.type !== "tool" || tool.name !== "task" || tool.provider?.executed ||
          !("structured" in tool.state)) return yield* new Hold({ message: "HOLD: original Task missing" })
        const previous = Option.getOrUndefined(record(tool.state.structured.metadata)) ?? {}
        const metadata = { ...previous, parentSessionId: input.sessionID, sessionId: input.childSessionID,
          workResult: result, upstreamSettlement: settlement }
        const owner = { sessionID: input.sessionID, messageID: input.messageID, callID: input.callID, tool: tool.name, input: tool.state.input }
        const before = SessionMessageUpdater.upstreamSettlement(previous, owner)
        if (before && !isDeepStrictEqual(before, settlement))
          return yield* new Hold({ message: "HOLD: original Task settlement conflicts" })
        if (previous.parentSessionId !== input.sessionID || previous.sessionId !== input.childSessionID ||
          !SessionMessageUpdater.upstreamSettlement(metadata, owner))
          return yield* new Hold({ message: "HOLD: original Task binding mismatch" })
        // A retained V1 view must be validated and settled with the native view by the private all-view port.
        if (legacy) yield* sessions.settleUpstreamTask({ ...settlement, workResult: { ...result }, sessionID: input.sessionID,
          childSessionID: input.childSessionID, logicalTaskID: input.taskID, authorMessageID: input.capture.assistantMessageID })
        if (!legacy && !before) yield* events.publish(SessionEvent.Tool.Progress, { sessionID: SessionSchema.ID.make(input.sessionID), assistantMessageID: SessionMessage.ID.make(input.messageID),
          callID: input.callID, timestamp: yield* DateTime.now, structured: { ...tool.state.structured, metadata }, content: tool.state.content },
          { location: parentLocation })
        const row = yield* database.db.select().from(SessionMessageTable)
          .where(eq(SessionMessageTable.id, SessionMessage.ID.make(input.messageID))).get().pipe(Effect.orDie)
        if (!row || row.session_id !== input.sessionID) return yield* new Hold({ message: "HOLD: native Task settlement not projected" })
        const stored = Schema.decodeUnknownSync(SessionMessage.Message)({ ...row.data, id: row.id, type: row.type })
        const calls = stored.type === "assistant" && stored.agent === "maestro"
          ? stored.content.filter((item) => item.type === "tool" && item.id === input.callID) : []
        const call = calls[0]
        if (calls.length !== 1 || call?.type !== "tool" || call.name !== "task" || call.provider?.executed ||
          !("structured" in call.state) || !isDeepStrictEqual(SessionMessageUpdater.upstreamSettlement(
            Option.getOrUndefined(record(call.state.structured.metadata)) ?? {}, { ...owner, input: call.state.input }), settlement))
          return yield* new Hold({ message: "HOLD: native Task settlement readback mismatch" })
      }
      if (!modern) {
        yield* sessions.settleUpstreamTask({ ...settlement, workResult: { ...result }, sessionID: input.sessionID,
          childSessionID: input.childSessionID, logicalTaskID: input.taskID, authorMessageID: input.capture.assistantMessageID })
        // The generic updatePart boundary strips new receipts. Only the private validated setter may install one.
        const parent = yield* MessageV2.get({ sessionID: input.sessionID, messageID: input.messageID })
        const matches = parent.parts.filter((part) => part.type === "tool" && part.callID === input.callID)
        const part = matches[0]
        if (parent.info.role !== "assistant" || matches.length !== 1 || part?.type !== "tool" || part.tool !== "task" ||
          part.sessionID !== input.sessionID || part.messageID !== input.messageID || part.metadata?.providerExecuted ||
          part.state.status === "pending") return yield* new Hold({ message: "HOLD: original Task part missing" })
        const stored = SessionMessageUpdater.upstreamSettlement(part.state.metadata ?? {}, { sessionID: input.sessionID,
          messageID: input.messageID, callID: input.callID, tool: part.tool, input: part.state.input })
        if (!stored || !isDeepStrictEqual(stored, settlement))
          return yield* new Hold({ message: "HOLD: private Task settlement readback mismatch" })
      }
    }
    if (progress.wakeStarted) return
    progress.wakeStarted = true
    if (modern) {
      if (!input.ops.resumeNotice) return yield* new Hold({ message: "HOLD: native notice resume adapter missing" })
      yield* input.ops.resumeNotice(input.sessionID)
      return
    }
    yield* input.ops.prompt({ ...input.request, noReply: false })
  })
  return () => lock.withLock(input.request.messageID)(deliver())
}
