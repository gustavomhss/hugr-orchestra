export * as PromptAdmission from "./prompt-admission"

import { eq, inArray, or, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { isDeepStrictEqual } from "node:util"
import { SessionID } from "@orchestra/schema/session-id"
import type { Database } from "../database/database"
import { MessageTable, PartTable, SessionTable } from "../session/sql"
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
  // Read occupancy first: a concurrent atomic admission must be visible to the later receipt lookup.
  const occupied = yield* db
    .select({ id: MessageTable.id })
    .from(MessageTable)
    .where(eq(MessageTable.id, input.messageID))
    .get()
    .pipe(Effect.orDie)
  const receipt = yield* find(db, input.messageID)
  if (receipt) {
    if (receipt.sessionID !== input.sessionID || receipt.identity !== input.identity)
      return yield* Effect.fail(new Conflict({ ...input, reason: "identity-mismatch" }))
    // Schema contracts are readonly; the legacy runtime facade explicitly owns mutable decoded copies.
    return receipt.snapshot as SessionV1.WithParts
  }
  if (occupied) return yield* Effect.fail(new Conflict({ ...input, reason: "historical-message-without-receipt" }))
})

// EventV2 supplies the immediate transaction. Never start another transaction or publish here.
export const project = Effect.fn("PromptAdmission.project")(function* (db: DB, payload: Payload) {
  // A race loser must not validate or apply its stale transition against the winner's newer Session state.
  const existing = yield* reconcile(db, payload).pipe(Effect.orDie)
  if (existing) return yield* Effect.die(new AlreadyAdmitted(payload))
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
  if (payload.parts.length) {
    const occupied = yield* db
      .select({ id: PartTable.id })
      .from(PartTable)
      .where(
        inArray(
          PartTable.id,
          payload.parts.map((part) => part.id),
        ),
      )
      .get()
      .pipe(Effect.orDie)
    if (occupied) return yield* Effect.die(new Conflict({ ...payload, reason: "occupied-part-id" }))
  }
  const snapshot = Schema.decodeUnknownSync(SessionV1.WithParts)({
    info: payload.info,
    parts: payload.parts,
  }) as SessionV1.WithParts
  const session = yield* db
    .select()
    .from(SessionTable)
    .where(eq(SessionTable.id, payload.sessionID))
    .get()
    .pipe(Effect.orDie)
  if (!session) return yield* Effect.die(new Conflict({ ...payload, reason: "session-missing" }))
  if (payload.transition) yield* projectTransition(db, payload, session)
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

const projectTransition = Effect.fn("PromptAdmission.projectTransition")(function* (
  db: DB,
  payload: Payload,
  session: typeof SessionTable.$inferSelect,
) {
  const transition = payload.transition
  if (!transition) return
  if (transition.permission !== undefined && transition.expectedPermission === undefined)
    return yield* Effect.die(new Conflict({ ...payload, reason: "permission-expectation-missing" }))
  const encoded = Schema.encodeSync(SessionV1.Event.PromptAdmitted.data)(payload).transition
  if (!isDeepStrictEqual(session.revert, encoded?.expectedRevert))
    return yield* Effect.die(new Conflict({ ...payload, reason: "revert-changed" }))
  if (
    transition.permission !== undefined &&
    transition.expectedPermission !== undefined &&
    !isDeepStrictEqual(session.permission, encoded?.expectedPermission)
  )
    return yield* Effect.die(new Conflict({ ...payload, reason: "permission-changed" }))
  if (
    transition.removeMessageIDs.includes(payload.messageID) ||
    transition.removePartIDs.some((id) => payload.parts.some((part) => part.id === id))
  )
    return yield* Effect.die(new Conflict({ ...payload, reason: "transition-removes-admission" }))
  const messages = transition.removeMessageIDs.length
    ? yield* db
        .select()
        .from(MessageTable)
        .where(inArray(MessageTable.id, [...transition.removeMessageIDs]))
        .all()
        .pipe(Effect.orDie)
    : []
  if (messages.some((message) => message.session_id !== payload.sessionID))
    return yield* Effect.die(new Conflict({ ...payload, reason: "foreign-message-removal" }))
  const parts =
    transition.removeMessageIDs.length || transition.removePartIDs.length
      ? yield* db
          .select({ part: PartTable, messageSession: MessageTable.session_id })
          .from(PartTable)
          .leftJoin(MessageTable, eq(PartTable.message_id, MessageTable.id))
          .where(
            or(
              inArray(PartTable.message_id, [...transition.removeMessageIDs]),
              inArray(PartTable.id, [...transition.removePartIDs]),
            ),
          )
          .all()
          .pipe(Effect.orDie)
      : []
  if (parts.some((row) => row.part.session_id !== payload.sessionID || row.messageSession !== payload.sessionID))
    return yield* Effect.die(new Conflict({ ...payload, reason: "foreign-part-removal" }))

  // Match ordinary removals' accounting without publishing nested events. Each deleted part contributes once.
  const usage = parts.flatMap((row) => {
    const decoded = Schema.decodeUnknownOption(SessionV1.StepFinishPart)({
      ...row.part.data,
      id: row.part.id,
      sessionID: row.part.session_id,
      messageID: row.part.message_id,
    })
    return Option.isSome(decoded) ? [decoded.value] : []
  })
  if (transition.removePartIDs.length)
    yield* db
      .delete(PartTable)
      .where(inArray(PartTable.id, [...transition.removePartIDs]))
      .run()
      .pipe(Effect.orDie)
  if (transition.removeMessageIDs.length)
    yield* db
      .delete(MessageTable)
      .where(inArray(MessageTable.id, [...transition.removeMessageIDs]))
      .run()
      .pipe(Effect.orDie)
  yield* db
    .update(SessionTable)
    .set({
      agent: payload.info.agent,
      model: {
        id: payload.info.model.modelID,
        providerID: payload.info.model.providerID,
        variant: payload.info.model.variant ?? "default",
      },
      ...(transition.permission === undefined ? {} : { permission: [...transition.permission] }),
      revert: null,
      time_updated: transition.timeUpdated,
      cost: sql`${SessionTable.cost} - ${usage.reduce((sum, part) => sum + part.cost, 0)}`,
      tokens_input: sql`${SessionTable.tokens_input} - ${usage.reduce((sum, part) => sum + part.tokens.input, 0)}`,
      tokens_output: sql`${SessionTable.tokens_output} - ${usage.reduce((sum, part) => sum + part.tokens.output, 0)}`,
      tokens_reasoning: sql`${SessionTable.tokens_reasoning} - ${usage.reduce((sum, part) => sum + part.tokens.reasoning, 0)}`,
      tokens_cache_read: sql`${SessionTable.tokens_cache_read} - ${usage.reduce((sum, part) => sum + part.tokens.cache.read, 0)}`,
      tokens_cache_write: sql`${SessionTable.tokens_cache_write} - ${usage.reduce((sum, part) => sum + part.tokens.cache.write, 0)}`,
    })
    .where(eq(SessionTable.id, payload.sessionID))
    .run()
    .pipe(Effect.orDie)
})
