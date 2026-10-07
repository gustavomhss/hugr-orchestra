import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { eq } from "drizzle-orm"
import { Cause, Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { EventV2Bridge } from "@/event-v2-bridge"
import { readAuthorization } from "./authorization"
import { contextIsCurrent, readContext } from "./context-record"
import { readValidation } from "./validation-record"
import { canonicalMemberId } from "./roster"

export class DispatchRejectedError extends Schema.TaggedErrorClass<DispatchRejectedError>()("MaestroDispatchRejected", {
  reason: Schema.String,
}) {
  override get message() {
    const next = nextSteps[this.reason]
    return next ? `${this._tag}: ${this.reason}. ${next}` : `${this._tag}: ${this.reason}`
  }
}

// An authorization reserves exactly one dispatch, so a broken binding needs a new approval and authorization.
const nextSteps: Record<string, string> = {
  "authorization-not-found": "Pass the authorizationID returned by maestro_grant_authorization in this Session.",
  "session-mismatch": "Dispatch only with an authorization granted in this Session.",
  "authorization-evidence-mismatch":
    "The authorization no longer matches its validation or context; restart from a new validation with a new workCardID.",
  "context-not-current":
    "HEAD, the working tree or the Own source changed since the context was recorded; keep the tree untouched from context until the task returns, and restart from a new plan revision.",
  "reservation-missing-permission-snapshot":
    "An older runtime reserved this authorization; present again with a new methodVersion to get a new approval and authorization.",
  "reservation-binding-mismatch":
    "This authorization is already reserved with a different permission snapshot (an earlier dispatch named another seat, or permissions changed); present again with a new methodVersion to get a new approval and authorization.",
}

export type DispatchReservation = Schema.Schema.Type<typeof MaestroEvent.Dispatch.ReservedV2.data> & { id: string }

const readReservation = Effect.fn("MaestroDispatch.read")(function* (id: EventV2.ID) {
  const { db } = yield* Database.Service
  return yield* db
    .select({ id: EventTable.id, type: EventTable.type, data: EventTable.data })
    .from(EventTable)
    .where(eq(EventTable.id, id))
    .get()
    .pipe(Effect.orDie)
})

function reservation(
  existing: Pick<typeof EventTable.$inferSelect, "id" | "type" | "data">,
  id: EventV2.ID,
  wanted: Omit<DispatchReservation, "id">,
) {
  if (existing.type !== EventV2.versionedType(MaestroEvent.Dispatch.ReservedV2.type, 2)) {
    throw new DispatchRejectedError({ reason: "reservation-missing-permission-snapshot" })
  }
  const data = Schema.decodeUnknownSync(MaestroEvent.Dispatch.ReservedV2.data)(existing.data)
  // A reservation recorded before the backend seat's rename routes to its former id; it is read as `backend`.
  const recorded = { id: existing.id, ...data, routedMemberID: canonicalMemberId(data.routedMemberID) }
  if (isDeepStrictEqual(recorded, { id, ...wanted })) return recorded
  throw new DispatchRejectedError({ reason: "reservation-binding-mismatch" })
}

function isDuplicate(cause: Cause.Cause<unknown>) {
  const message = String(Cause.squash(cause))
  return message.includes("already exists") || message.includes("UNIQUE constraint failed")
}

export const reserveDispatch = Effect.fn("MaestroDispatch.reserve")(function* (input: {
  sessionID: string
  authorizationID: string
  permission: readonly { permission: string; pattern: string; action: "allow" | "deny" | "ask" }[]
  requireCurrent?: boolean
}) {
  const authorization = yield* readAuthorization(input.authorizationID)
  if (!authorization) return yield* new DispatchRejectedError({ reason: "authorization-not-found" })
  if (authorization.sessionID !== input.sessionID)
    return yield* new DispatchRejectedError({ reason: "session-mismatch" })
  const suffix = createHash("sha256").update(input.authorizationID, "utf8").digest("hex")
  const id = EventV2.ID.make(`evt_maestro_dispatch_${suffix}`)
  const wanted = {
    sessionID: authorization.sessionID,
    authorizationID: input.authorizationID,
    childSessionID: `ses_maestro_dispatch_${suffix}`,
    projectID: authorization.projectID,
    routedMemberID: authorization.routedMemberID,
    taskIntentHash: authorization.taskIntentHash,
    permission: [...input.permission],
  }
  const existing = yield* readReservation(id)
  const replay = existing
    ? yield* Effect.try({
        try: () => reservation(existing, id, wanted),
        catch: (error) => error,
      })
    : undefined
  // Replaying a child result does not execute work against the original repository snapshot.
  if (replay && !input.requireCurrent) return replay
  const validation = yield* readValidation(authorization.validationRecordID)
  const context = validation?.contextRecordID ? yield* readContext(validation.contextRecordID) : undefined
  if (
    !validation ||
    !context ||
    validation.sessionID !== authorization.sessionID ||
    context.sessionID !== authorization.sessionID ||
    context.projectID !== authorization.projectID ||
    context.planRevisionID !== validation.planRevisionID ||
    validation.contextHash !== context.contextHash
  ) {
    return yield* new DispatchRejectedError({ reason: "authorization-evidence-mismatch" })
  }
  if (context.changedPaths.length > 0 || !(yield* contextIsCurrent(context))) {
    return yield* new DispatchRejectedError({ reason: "context-not-current" })
  }
  if (replay) return replay
  const events = yield* EventV2Bridge.Service
  return yield* events.publish(MaestroEvent.Dispatch.ReservedV2, wanted, { id }).pipe(
    Effect.map((event) => ({ id: event.id, ...event.data })),
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        if (!isDuplicate(cause)) return yield* Effect.failCause(cause)
        const existing = yield* readReservation(id)
        if (!existing) return yield* Effect.failCause(cause)
        return yield* Effect.try({
          try: () => reservation(existing, id, wanted),
          catch: (error) => error,
        })
      }),
    ),
  )
})

export * as Dispatch from "./dispatch"
