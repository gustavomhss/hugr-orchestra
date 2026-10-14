import { Actions } from "@orchestra/schema/actions"
import { and, eq, inArray, isNull, lte } from "drizzle-orm"
import { Clock, Effect, Exit, Schema, Semaphore } from "effect"
import type { Database } from "../../database/database"
import { ActionsError } from "../error"
import { ActionsOperationTable } from "./sql"
import { definitive } from "./outcome"

export type DB = Database.Interface["db"]
export type Row = typeof ActionsOperationTable.$inferSelect
export const LEASE = 24 * 60 * 60 * 1000
export const RETENTION = 30 * LEASE
export const UNKNOWN_LIMIT = 10_000
export const LEDGER_LIMIT = 100_000
export const DEADLINE = "30 seconds"
export const RECEIPT_EXPIRED = "Actions operation receipt retention elapsed"
export const LEASE_EXPIRED = "Actions operation lease expired"

export function error(kind: Actions.ErrorKind, message: string, operationID?: Actions.OperationID) {
  return new ActionsError({ kind, message, operationID })
}

export function safe<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.mapError((cause) =>
      cause instanceof ActionsError ? cause : error("maintenance_required", "Actions operation storage is unavailable"),
    ),
    Effect.catchDefect(() => Effect.fail(error("maintenance_required", "Actions operation storage is unavailable"))),
  )
}

export function receipt(row: Row): Actions.Operation {
  return {
    id: row.id,
    bindingID: row.binding_id,
    clientID: row.client_id,
    kind: row.kind,
    state: row.state,
    target: row.target,
    createdAt: row.time_created,
    expiresAt: row.time_expires,
    updatedAt: row.time_updated,
    ...(row.result == null ? {} : { result: row.result }),
    ...(row.reason === null ? {} : { reason: row.reason }),
  }
}

export function intent(row: Row): Actions.OperationIntent {
  return {
    clientID: row.client_id,
    binding: { id: row.binding_id, revision: row.binding_revision },
    kind: row.kind,
    target: row.target,
    ...(row.expected === null ? {} : { expected: row.expected }),
  }
}

export const equivalent = Schema.toEquivalence(Actions.OperationIntent)

export function matches(row: Row, binding: Actions.Binding) {
  return row.binding_revision === binding.revision && row.actor === binding.account &&
    row.provider_kind === binding.provider.kind && row.provider_hostname === binding.provider.hostname &&
    row.provider_api_origin === binding.provider.apiOrigin && row.provider_project_id === binding.projectID
}

export function access(row: Row | undefined, location: string, binding: Actions.Binding, id: Actions.OperationID) {
  if (!row || row.location_key !== location || row.binding_id !== binding.id)
    return error("operation_missing", "Actions operation does not exist in this binding and Location", id)
  if (row.actor !== binding.account) return error("not_authenticated", "Actions operation belongs to another account", id)
  if (row.binding_revision !== binding.revision) return error("binding_stale", "Actions operation binding revision changed", id)
  if (!matches(row, binding)) return error("host_mismatch", "Actions operation provider identity changed", id)
}

export function unavailable(row: Row, now: number) {
  if (row.state === "expired" && row.reason === RECEIPT_EXPIRED)
    return error("operation_missing", RECEIPT_EXPIRED, row.id)
  if (row.state === "expired" || (row.state === "prepared" && row.time_expires <= now))
    return error("operation_expired", "Actions operation lease expired", row.id)
  if (["accepted", "confirmed", "rejected"].includes(row.state) && row.time_updated <= now - RETENTION)
    return error("operation_missing", "Actions operation receipt retention elapsed", row.id)
}

export const find = (db: Pick<DB, "select">, id: Actions.OperationID) =>
  safe(db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, id)).get())

export const sweep = (db: Pick<DB, "update">, now: number) =>
  Effect.gen(function* () {
    yield* db.update(ActionsOperationTable).set({ state: "expired", time_updated: now, result: null, reason: LEASE_EXPIRED }).where(
      and(eq(ActionsOperationTable.state, "prepared"), lte(ActionsOperationTable.time_expires, now)),
    ).run()
    // Keep the admission key and intent forever. Deleting a receipt would allow
    // a delayed prepare with the same logical intent to issue another command.
    yield* db.update(ActionsOperationTable).set({ state: "expired", result: null, reason: RECEIPT_EXPIRED }).where(and(
      inArray(ActionsOperationTable.state, ["accepted", "confirmed", "rejected"]),
      lte(ActionsOperationTable.time_updated, now - RETENTION),
    )).run()
  })

// Database identity outlives Location services. Rebuilding a Location must never
// recover another live request's sending row as though the process restarted.
const recovery = new WeakMap<DB, { readonly lock: Semaphore.Semaphore; done: boolean }>()

export const recover = (db: DB) => Effect.suspend(() => {
  const shared = recovery.get(db) ?? { lock: Semaphore.makeUnsafe(1), done: false }
  recovery.set(db, shared)
  return shared.lock.withPermit(Effect.gen(function* () {
    if (shared.done) return
    yield* safe(db.update(ActionsOperationTable).set({
      state: "outcome_unknown",
      time_updated: yield* Clock.currentTimeMillis,
      reason: "Provider outcome was not established before database restart",
    }).where(eq(ActionsOperationTable.state, "sending")).run())
    shared.done = true
  })).pipe(Effect.uninterruptible)
})

export const finalize = (db: DB, id: Actions.OperationID, exit: Exit.Exit<Actions.OperationAcknowledgement, ActionsError>) => Effect.gen(function* () {
  const rejected = Exit.isFailure(exit) ? definitive(exit.cause) : undefined
  const row = yield* safe(db.update(ActionsOperationTable).set({
    state: Exit.isSuccess(exit) ? "accepted" : rejected ? "rejected" : "outcome_unknown",
    result: Exit.isSuccess(exit) ? exit.value : null,
    time_updated: yield* Clock.currentTimeMillis,
    reason: Exit.isSuccess(exit) ? null : rejected?.disposition === "definitely_unsent"
      ? "Provider command was definitely not sent"
      : rejected ? "Provider command was definitively rejected" : "Provider outcome was not established",
  }).where(and(eq(ActionsOperationTable.id, id), eq(ActionsOperationTable.state, "sending"))).returning().get())
  if (!row) return yield* Effect.fail(error("maintenance_required", "Actions operation receipt could not be finalized", id))
})

export function identity(row: Row) {
  return and(
    eq(ActionsOperationTable.id, row.id), eq(ActionsOperationTable.location_key, row.location_key),
    eq(ActionsOperationTable.project_id, row.project_id), eq(ActionsOperationTable.directory, row.directory),
    row.workspace_id === null ? isNull(ActionsOperationTable.workspace_id) : eq(ActionsOperationTable.workspace_id, row.workspace_id),
    eq(ActionsOperationTable.binding_id, row.binding_id), eq(ActionsOperationTable.binding_revision, row.binding_revision),
    eq(ActionsOperationTable.provider_kind, row.provider_kind), eq(ActionsOperationTable.provider_hostname, row.provider_hostname),
    eq(ActionsOperationTable.provider_api_origin, row.provider_api_origin), eq(ActionsOperationTable.provider_project_id, row.provider_project_id),
    eq(ActionsOperationTable.actor, row.actor), eq(ActionsOperationTable.client_id, row.client_id),
    eq(ActionsOperationTable.kind, row.kind), eq(ActionsOperationTable.target, row.target),
    row.expected === null ? isNull(ActionsOperationTable.expected) : eq(ActionsOperationTable.expected, row.expected),
  )
}
