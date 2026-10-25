export * as GovernanceDispatchV2 from "./dispatch"

import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { ToolFailure } from "@orchestra/llm"
import { Cause, Effect, Schema } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { SessionSchema } from "@orchestra/core/session"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { GovernanceEvidenceV2 } from "./evidence"
import { GovernanceRecordsV2 } from "./records"

// V2 port of V1's authorized dispatch (`apps/orchestra/src/maestro/{dispatch,authorization,grounded-skills}.ts`). An
// authorization reserves exactly one child Session, write-once, with the permission snapshot it runs under; the
// reservation and its refusals are the V1 records and wording, so a dispatch reserved by V1 replays here unchanged.

/** A permission rule as the reservation records it (V1 field names). */
export type Rule = { readonly permission: string; readonly pattern: string; readonly action: "allow" | "deny" | "ask" }

export type Services = GovernanceEvidenceV2.Services & {
  readonly events: EventV2.Interface
  /** Reads a seat id recorded before the backend seat's rename as `backend`. */
  readonly canonical: (id: string) => string
}

export const CHILD_PREFIX = "ses_maestro_dispatch_"

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

export function rejected(reason: string) {
  const next = nextSteps[reason]
  return new ToolFailure({
    message: next ? `MaestroDispatchRejected: ${reason}. ${next}` : `MaestroDispatchRejected: ${reason}`,
  })
}

export function taskIntentHash(input: { subagentType: string; prompt: string; model?: string }) {
  return sha256(`${input.subagentType}\0${input.prompt}\0${input.model ?? ""}`)
}

/** Why an authorized Task in this Session does not dispatch the approved seat and intent, worded for the model to retry. */
export function mismatch(
  authorization: { sessionID: string; routedMemberID: string; taskIntentHash: string } | undefined,
  task: { sessionID: string; memberID: string; subagentType: string; prompt: string; model?: string },
) {
  if (authorization?.sessionID !== task.sessionID) return undefined
  if (authorization.routedMemberID !== task.memberID)
    return `Authorized Task denied: routed-seat-mismatch. This authorization dispatches only ${authorization.routedMemberID}; retry with exactly the approved seat, prompt and model.`
  if (authorization.taskIntentHash !== taskIntentHash(task))
    return "Authorized Task denied: task-intent-mismatch. subagent_type, prompt and model must match the approved intent byte for byte; retry with exactly what was presented and approved."
  return undefined
}

/** The one child an authorization reserves, derived from the authorization alone. */
export function childSessionID(authorizationID: string) {
  return SessionSchema.ID.make(`${CHILD_PREFIX}${sha256(authorizationID)}`)
}

export function reservationID(authorizationID: string) {
  return EventV2.ID.make(`evt_maestro_dispatch_${sha256(authorizationID)}`)
}

/**
 * Reserve the authorization's one dispatch, or replay the reservation already recorded with the same binding. A
 * replay that is about to run work (`requireCurrent`) also requires the recorded context to still describe the tree.
 */
export const reserve = Effect.fn("GovernanceDispatchV2.reserve")(function* (
  services: Services,
  input: { sessionID: string; authorizationID: string; permission: ReadonlyArray<Rule>; requireCurrent?: boolean },
) {
  const authorization = yield* GovernanceRecordsV2.readAuthorization(
    services.db,
    input.authorizationID,
    services.canonical,
  )
  if (!authorization) return yield* rejected("authorization-not-found")
  if (authorization.sessionID !== input.sessionID) return yield* rejected("session-mismatch")
  const id = reservationID(input.authorizationID)
  const wanted = {
    sessionID: authorization.sessionID,
    authorizationID: input.authorizationID,
    childSessionID: childSessionID(input.authorizationID),
    projectID: authorization.projectID,
    routedMemberID: authorization.routedMemberID,
    taskIntentHash: authorization.taskIntentHash,
    permission: input.permission.map((rule) => ({ ...rule })),
  }
  const existing = yield* GovernanceRecordsV2.row(services.db, id)
  const replay = existing ? yield* replayed(services, existing, wanted) : undefined
  // Replaying a child result does not execute work against the original repository snapshot.
  if (replay && !input.requireCurrent) return replay
  const validation = yield* GovernanceRecordsV2.readValidation(services.db, authorization.validationRecordID)
  const context = validation?.contextRecordID
    ? yield* GovernanceRecordsV2.readContext(services.db, validation.contextRecordID)
    : undefined
  if (
    !validation ||
    !context ||
    validation.sessionID !== authorization.sessionID ||
    context.sessionID !== authorization.sessionID ||
    context.projectID !== authorization.projectID ||
    context.planRevisionID !== validation.planRevisionID ||
    validation.contextHash !== context.contextHash
  )
    return yield* rejected("authorization-evidence-mismatch")
  if (context.changedPaths.length > 0 || !(yield* GovernanceEvidenceV2.contextIsCurrent(services, context)))
    return yield* rejected("context-not-current")
  if (replay) return replay
  return yield* services.events.publish(MaestroEvent.Dispatch.ReservedV2, wanted, { id }).pipe(
    Effect.map((event) => ({ id: event.id, ...event.data })),
    // A concurrent dispatch of the same authorization won the insert: the stored reservation decides.
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        if (!duplicate(cause)) return yield* Effect.failCause(cause)
        const stored = yield* GovernanceRecordsV2.row(services.db, id)
        if (!stored) return yield* Effect.failCause(cause)
        return yield* replayed(services, stored, wanted)
      }),
    ),
  )
})

/** The skill content a GROUNDED context bound to the authorization carries, as prompt text for the child. */
export const groundedSkills = Effect.fn("GovernanceDispatchV2.groundedSkills")(function* (
  services: Services,
  authorizationID: string,
) {
  const authorization = yield* GovernanceRecordsV2.readAuthorization(services.db, authorizationID, services.canonical)
  const validation = authorization
    ? yield* GovernanceRecordsV2.readValidation(services.db, authorization.validationRecordID)
    : undefined
  const context = validation?.contextRecordID
    ? yield* GovernanceRecordsV2.readContext(services.db, validation.contextRecordID)
    : undefined
  return context?.mode === "GROUNDED"
    ? context.skills.map((skill) => `<skill_content name="${skill.name}">\n${skill.content}\n</skill_content>`)
    : []
})

const replayed = Effect.fnUntraced(function* (
  services: Services,
  existing: { readonly id: string; readonly type: string; readonly data: unknown },
  wanted: Omit<Schema.Schema.Type<typeof MaestroEvent.Dispatch.ReservedV2.data>, "id">,
) {
  if (existing.type !== EventV2.versionedType(MaestroEvent.Dispatch.ReservedV2.type, 2))
    return yield* rejected("reservation-missing-permission-snapshot")
  const data = Schema.decodeUnknownSync(MaestroEvent.Dispatch.ReservedV2.data)(existing.data)
  const recorded = { id: existing.id, ...data, routedMemberID: services.canonical(data.routedMemberID) }
  if (!isDeepStrictEqual(recorded, { id: existing.id, ...wanted })) return yield* rejected("reservation-binding-mismatch")
  return recorded
})

function duplicate(cause: Cause.Cause<unknown>) {
  const message = String(Cause.squash(cause))
  return message.includes("already exists") || message.includes("UNIQUE constraint failed")
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}
