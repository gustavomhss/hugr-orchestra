export * as UpstreamSettlement from "./upstream-settlement"

import { Database } from "@orchestra/core/database/database"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessageUpdater } from "@orchestra/core/session/message-updater"
import { MessageTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { SessionV1 } from "@orchestra/core/v1/session"
import { SessionMessage } from "@orchestra/schema/session-message"
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

    // Admit-only is deliberately outside the execution loop. Repeating this exact ID reconciles durable admission.
    yield* input.ops.prompt({ ...input.request, noReply: true })
    const modern = yield* database.db.select().from(SessionMessageTable)
      .where(eq(SessionMessageTable.id, input.messageID)).get().pipe(Effect.orDie)
    const legacy = yield* database.db.select().from(MessageTable)
      .where(eq(MessageTable.id, input.messageID)).get().pipe(Effect.orDie)
    if ((modern && modern.session_id !== input.sessionID) || (legacy && legacy.session_id !== input.sessionID))
      return yield* new Hold({ message: "HOLD: settlement parent projection owner mismatch" })

    const delivered = yield* database.db.select().from(SessionMessageTable)
      .where(eq(SessionMessageTable.id, input.request.messageID)).get().pipe(Effect.orDie)
    const receipt = modern ? yield* Effect.gen(function* () {
      if (!delivered || delivered.session_id !== input.sessionID)
        return yield* new Hold({ message: "HOLD: synthetic delivery not projected" })
      const message = Schema.decodeUnknownSync(SessionMessage.Message)({ ...delivered.data, id: delivered.id, type: delivered.type })
      if (message.type !== "synthetic" || message.sessionID !== input.sessionID || message.text !== text.text)
        return yield* new Hold({ message: "HOLD: synthetic delivery readback mismatch" })
      return { deliveryMessageID: message.id }
    }) : yield* Effect.gen(function* () {
      if (!legacy) return yield* new Hold({ message: "HOLD: original parent missing" })
      const message = yield* MessageV2.get({ sessionID: input.sessionID, messageID: input.request.messageID })
      const part = message.parts[0]
      if (message.info.role !== "user" || message.info.sessionID !== input.sessionID ||
        message.parts.length !== 1 || part?.type !== "text" || !part.synthetic ||
        part.sessionID !== input.sessionID || part.messageID !== message.info.id || part.text !== text.text ||
        !isDeepStrictEqual(part.metadata?.source, text.metadata?.source))
        return yield* new Hold({ message: "HOLD: multipart delivery readback mismatch" })
      return { deliveryMessageID: message.info.id, deliveryPartID: part.id }
    })

    const result = input.capture.workResult?.schema === UpstreamResult.SCHEMA ? input.capture.workResult : undefined
    if (result) {
      if (result.author?.memberId !== "walt" || result.author.messageID !== input.capture.assistantMessageID ||
        result.author.executionSessionID !== input.childSessionID || result.card.messageID !== input.capture.assistantMessageID ||
        result.taskId !== input.taskID)
        return yield* new Hold({ message: "HOLD: captured assistant binding mismatch" })
      const settlement = { parentMessageID: input.messageID, parentCallID: input.callID, workResult: result, ...receipt }
      if (modern) {
        const parent = Schema.decodeUnknownSync(SessionMessage.Message)({ ...modern.data, id: modern.id, type: modern.type })
        if (parent.type !== "assistant") return yield* new Hold({ message: "HOLD: original parent not assistant" })
        const matches = parent.content.filter((item) => item.type === "tool" && item.id === input.callID)
        const tool = matches[0]
        if (matches.length !== 1 || tool?.type !== "tool" || tool.name !== "task" || tool.provider?.executed ||
          !("structured" in tool.state)) return yield* new Hold({ message: "HOLD: original Task missing" })
        const previous = Option.getOrUndefined(record(tool.state.structured.metadata)) ?? {}
        const metadata = { ...previous, parentSessionId: input.sessionID, sessionId: input.childSessionID,
          workResult: result, upstreamSettlement: settlement }
        const owner = { sessionID: input.sessionID, messageID: input.messageID, callID: input.callID, tool: tool.name, input: tool.state.input }
        if (previous.parentSessionId !== input.sessionID || previous.sessionId !== input.childSessionID ||
          !SessionMessageUpdater.upstreamSettlement(metadata, owner))
          return yield* new Hold({ message: "HOLD: original Task binding mismatch" })
        yield* events.publish(SessionEvent.Tool.Progress, { sessionID: input.sessionID, assistantMessageID: input.messageID,
          callID: input.callID, timestamp: yield* DateTime.now, structured: { ...tool.state.structured, metadata }, content: tool.state.content })
      }
      if (!modern) {
        const parent = yield* MessageV2.get({ sessionID: input.sessionID, messageID: input.messageID })
        const matches = parent.parts.filter((part) => part.type === "tool" && part.callID === input.callID)
        const part = matches[0]
        if (parent.info.role !== "assistant" || matches.length !== 1 || part?.type !== "tool" || part.tool !== "task" ||
          part.sessionID !== input.sessionID || part.messageID !== input.messageID || part.metadata?.providerExecuted ||
          part.state.status === "pending") return yield* new Hold({ message: "HOLD: original Task part missing" })
        const metadata = { ...part.state.metadata, parentSessionId: input.sessionID, sessionId: input.childSessionID,
          workResult: result, upstreamSettlement: settlement }
        if (part.state.metadata?.parentSessionId !== input.sessionID || part.state.metadata?.sessionId !== input.childSessionID ||
          !SessionMessageUpdater.upstreamSettlement(metadata, { sessionID: input.sessionID, messageID: input.messageID,
            callID: input.callID, tool: part.tool, input: part.state.input }))
          return yield* new Hold({ message: "HOLD: original Task part binding mismatch" })
        yield* sessions.updatePart(Schema.decodeUnknownSync(SessionV1.ToolPart)({ ...part, state: { ...part.state, metadata } },
          { onExcessProperty: "error" }))
      }
    }
    if (progress.wakeStarted) return
    progress.wakeStarted = true
    yield* input.ops.prompt({ ...input.request, noReply: false })
  })
  return () => lock.withLock(input.request.messageID)(deliver())
}
