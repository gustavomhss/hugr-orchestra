export * as PromptAdmission from "./prompt-admission"

import { eq, inArray } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { SessionID } from "@orchestra/schema/session-id"
import type { Database } from "../database/database"
import { MessageTable, PartTable } from "../session/sql"
import { SessionV1 } from "./session"
import { PromptAdmissionTable } from "./prompt-admission.sql"

type DB = Database.Interface["db"]
export type Payload = (typeof SessionV1.Event.PromptAdmitted.Type)["data"]

export class Conflict extends Schema.TaggedErrorClass<Conflict>()("PromptAdmission.Conflict", {
  sessionID: SessionID,
  messageID: SessionV1.MessageID,
  reason: Schema.String,
}) {}

// Only this defect denotes an exact concurrent winner. Other defects must escape unchanged.
export class AlreadyAdmitted extends Schema.TaggedErrorClass<AlreadyAdmitted>()("PromptAdmission.AlreadyAdmitted", {
  sessionID: SessionID,
  messageID: SessionV1.MessageID,
}) {}

const Receipt = Schema.Struct({
  sessionID: SessionID,
  messageID: SessionV1.MessageID,
  identityVersion: Schema.Literal(1),
  identity: Schema.String,
  snapshot: SessionV1.WithParts,
})

export const find = Effect.fn("PromptAdmission.find")(function* (db: Pick<DB, "select">, id: SessionV1.MessageID) {
  const row = yield* db
    .select()
    .from(PromptAdmissionTable)
    .where(eq(PromptAdmissionTable.id, id))
    .get()
    .pipe(Effect.orDie)
  if (!row) return
  return Schema.decodeUnknownSync(Receipt)({
    sessionID: row.session_id,
    messageID: row.id,
    identityVersion: row.identity_version,
    identity: row.identity,
    snapshot: row.snapshot,
  })
})

export const reconcile = Effect.fn("PromptAdmission.reconcile")(function* (
  db: Pick<DB, "select">,
  input: { readonly sessionID: SessionID; readonly messageID: SessionV1.MessageID; readonly identity: string },
): Effect.fn.Return<SessionV1.WithParts | undefined, Conflict> {
  const receipt = yield* find(db, input.messageID)
  if (receipt) {
    if (receipt.sessionID !== input.sessionID || receipt.identity !== input.identity)
      return yield* Effect.fail(new Conflict({ ...input, reason: "identity-mismatch" }))
    // Schema contracts are readonly; the legacy runtime facade explicitly owns mutable decoded copies.
    return receipt.snapshot as SessionV1.WithParts
  }
  const occupied = yield* db
    .select({ id: MessageTable.id })
    .from(MessageTable)
    .where(eq(MessageTable.id, input.messageID))
    .get()
    .pipe(Effect.orDie)
  if (occupied) return yield* Effect.fail(new Conflict({ ...input, reason: "historical-message-without-receipt" }))
})

// EventV2 supplies the immediate transaction. Never start another transaction or publish here.
export const project = Effect.fn("PromptAdmission.project")(function* (db: DB, payload: Payload) {
  if (payload.identityVersion !== 1)
    return yield* Effect.die(new Conflict({ ...payload, reason: "unsupported-identity-version" }))
  if (
    payload.info.role !== "user" ||
    payload.info.id !== payload.messageID ||
    payload.info.sessionID !== payload.sessionID ||
    payload.parts.some((part) => part.sessionID !== payload.sessionID || part.messageID !== payload.messageID)
  )
    return yield* Effect.die(new Conflict({ ...payload, reason: "ownership-mismatch" }))
  if (new Set(payload.parts.map((part) => part.id)).size !== payload.parts.length)
    return yield* Effect.die(new Conflict({ ...payload, reason: "duplicate-part-id" }))
  const existing = yield* reconcile(db, payload).pipe(Effect.orDie)
  if (existing) return yield* Effect.die(new AlreadyAdmitted(payload))
  if (payload.parts.length) {
    const occupied = yield* db
      .select({ id: PartTable.id })
      .from(PartTable)
      .where(inArray(PartTable.id, payload.parts.map((part) => part.id)))
      .get()
      .pipe(Effect.orDie)
    if (occupied) return yield* Effect.die(new Conflict({ ...payload, reason: "occupied-part-id" }))
  }
  const snapshot = Schema.decodeUnknownSync(SessionV1.WithParts)({
    info: payload.info,
    parts: payload.parts,
  }) as SessionV1.WithParts
  yield* db
    .insert(PromptAdmissionTable)
    .values({
      id: payload.messageID,
      session_id: payload.sessionID,
      identity_version: payload.identityVersion,
      identity: payload.identity,
      snapshot: Schema.encodeSync(SessionV1.WithParts)(snapshot),
    })
    .run()
    .pipe(Effect.orDie)
  const { id, sessionID, ...data } = snapshot.info
  yield* db
    .insert(MessageTable)
    .values({ id, session_id: sessionID, time_created: payload.info.time.created, data })
    .run()
    .pipe(Effect.orDie)
  yield* Effect.forEach(snapshot.parts, (part) => {
    const { id, sessionID, messageID, ...data } = part
    return db
      .insert(PartTable)
      .values({ id, session_id: sessionID, message_id: messageID, time_created: payload.info.time.created, data })
      .run()
      .pipe(Effect.orDie)
  })
})
