export * as ActionsOperations from "./operations"

import { Actions } from "@orchestra/schema/actions"
import { and, count, eq, gt } from "drizzle-orm"
import { Cause, Clock, Deferred, Effect, Fiber, Option, Schema } from "effect"
import { realpath } from "node:fs/promises"
import path from "node:path"
import { Database } from "../database/database"
import type { ActionsContract } from "./contract"
import { ActionsOperationTable } from "./operations/sql"
import { access, DEADLINE, equivalent, error, finalize, find, intent, LEASE, LEDGER_LIMIT, matches, receipt, recover, safe, sweep, unavailable, UNKNOWN_LIMIT } from "./operations/storage"
import { checkedAcknowledgement, checkedObservation, definitive } from "./operations/outcome"
import { update } from "./operations/readback"
import { ActionsError } from "./error"

export const make = Effect.fn("ActionsOperations.make")(function* (locationInput: {
  readonly directory: string
  readonly workspaceID?: string
  readonly projectID: string
}) {
  const input = { ...locationInput }
  const database = yield* Database.Service
  if (!path.isAbsolute(input.directory) || !input.projectID)
    return yield* Effect.fail(error("invalid_input", "Actions operations require a trusted absolute Location and project"))
  const directory = yield* Effect.tryPromise({
    try: () => realpath(input.directory),
    catch: () => error("invalid_input", "Actions operation Location is unavailable"),
  })
  const location = JSON.stringify([input.projectID, directory, input.workspaceID ?? null])
  yield* recover(database.db)
  const disposed = yield* Deferred.make<void>()
  const lifetime = { closed: false, requests: new Set<Fiber.Fiber<unknown, unknown>>() }
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    lifetime.closed = true
    const requests = Array.from(lifetime.requests)
    yield* Deferred.succeed(disposed, undefined)
    yield* Fiber.awaitAll(requests)
  }).pipe(Effect.uninterruptible))

  const validate = (binding: Actions.Binding) => {
    if (lifetime.closed) return error("binding_missing", "Actions operation Location was disposed")
    if (binding.directory !== directory || binding.workspaceID !== input.workspaceID)
      return error("host_mismatch", "Actions binding does not belong to this Location")
    if (!binding.account?.trim()) return error("not_authenticated", "Actions operations require a signed-in provider account")
  }

  const get: ActionsContract.Operations["get"] = Effect.fn("ActionsOperations.get")(function* (bindingInput, id) {
    const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
    const invalid = validate(binding)
    if (invalid) return yield* Effect.fail(invalid)
    const row = yield* find(database.db, id)
    const denied = access(row, location, binding, id)
    if (denied) return yield* Effect.fail(denied)
    if (!row) return yield* Effect.fail(error("operation_missing", "Actions operation does not exist", id))
    const expired = unavailable(row, yield* Clock.currentTimeMillis)
    if (expired) return yield* Effect.fail(expired)
    return receipt(row)
  })

  const prepare: ActionsContract.Operations["prepare"] = Effect.fn("ActionsOperations.prepare")(function* (bindingInput, raw) {
    const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
    const invalid = validate(binding)
    if (invalid) return yield* Effect.fail(invalid)
    // Strict decoding rejects extras before encoding elides optional undefined
    // keys. Decode the encoded DTO again to preserve branded identity types.
    const decoded = yield* Schema.decodeUnknownEffect(Schema.toType(Actions.OperationIntent), { onExcessProperty: "error" })(raw).pipe(
      Effect.map((value) => Schema.decodeUnknownSync(Actions.OperationIntent)(Schema.encodeSync(Actions.OperationIntent)(value))),
      Effect.mapError(() => error("invalid_input", "Actions operation intent is invalid")),
    )
    if (decoded.binding.id !== binding.id || decoded.binding.revision !== binding.revision)
      return yield* Effect.fail(error("binding_stale", "Actions operation intent binding changed"))
    // Maintenance commits independently so a refused expired retry still leaves
    // a compact, non-executable tombstone rather than rolling cleanup back.
    yield* safe(database.db.transaction((tx) => Clock.currentTimeMillis.pipe(
      Effect.flatMap((now) => sweep(tx, now)),
    ), { behavior: "immediate" }))
    return yield* safe(database.db.transaction((tx) => Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const existing = yield* tx.select().from(ActionsOperationTable).where(and(
        eq(ActionsOperationTable.location_key, location), eq(ActionsOperationTable.binding_id, binding.id),
        eq(ActionsOperationTable.client_id, decoded.clientID),
      )).get()
      if (existing) {
        if (!matches(existing, binding) || !equivalent(intent(existing), decoded))
          return yield* Effect.fail(error("intent_conflict", "Actions logical intent was already bound to another command", existing.id))
        const expired = unavailable(existing, now)
        if (expired) return yield* Effect.fail(expired)
        return receipt(existing)
      }
      const ledger = yield* tx.select({ total: count() }).from(ActionsOperationTable).get()
      if (!ledger || ledger.total >= LEDGER_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions admission ledger requires maintenance"))
      const unknown = yield* tx.select({ total: count() }).from(ActionsOperationTable)
        .where(eq(ActionsOperationTable.state, "outcome_unknown")).get()
      if (!unknown || unknown.total >= UNKNOWN_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions unknown outcome storage requires maintenance"))
      const inserted = yield* tx.insert(ActionsOperationTable).values({
        id: Actions.OperationID.create(),
        location_key: location,
        project_id: input.projectID,
        directory,
        workspace_id: input.workspaceID,
        binding_id: binding.id,
        binding_revision: binding.revision,
        provider_kind: binding.provider.kind,
        provider_hostname: binding.provider.hostname,
        provider_api_origin: binding.provider.apiOrigin,
        provider_project_id: binding.projectID,
        actor: binding.account ?? "",
        client_id: decoded.clientID,
        kind: decoded.kind,
        target: decoded.target,
        expected: decoded.expected,
        state: "prepared",
        time_created: now,
        time_expires: now + LEASE,
        time_updated: now,
      }).returning().get()
      if (!inserted) return yield* Effect.fail(error("maintenance_required", "Actions operation admission could not be stored"))
      return receipt(inserted)
    }), { behavior: "immediate" }))
  })

  const execute: ActionsContract.Operations["execute"] = Effect.fn("ActionsOperations.execute")((bindingInput, submission, perform) =>
    Effect.uninterruptibleMask((restore) => Effect.withFiber((fiber) => Effect.gen(function* () {
      const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
      const invalid = validate(binding)
      if (invalid) return yield* Effect.fail(invalid)
      const row = yield* find(database.db, submission.id)
      const denied = access(row, location, binding, submission.id)
      if (denied) return yield* Effect.fail(denied)
      if (!row) return yield* Effect.fail(error("operation_missing", "Actions operation does not exist", submission.id))
      const now = yield* Clock.currentTimeMillis
      const expired = unavailable(row, now)
      if (expired) return yield* Effect.fail(expired)
      if (row.state !== "prepared") return receipt(row)

      // Register before the durable claim so disposal cannot race the CAS/cleanup
      // handoff. This fiber remains the caller's request, never a shared worker.
      lifetime.requests.add(fiber)
      return yield* Effect.gen(function* () {
        if (lifetime.closed) return yield* Effect.fail(error("binding_missing", "Actions operation Location was disposed"))
        const claimed = yield* safe(database.db.transaction((tx) => Effect.gen(function* () {
          if (lifetime.closed) return yield* Effect.fail(error("binding_missing", "Actions operation Location was disposed"))
          // Sample time after acquiring SQLite's write reservation, not before
          // waiting for it. A lease may expire while the request waits to claim.
          const claimTime = yield* Clock.currentTimeMillis
          return yield* tx.update(ActionsOperationTable).set({ state: "sending", time_updated: claimTime })
            .where(and(
              eq(ActionsOperationTable.id, row.id), eq(ActionsOperationTable.location_key, location),
              eq(ActionsOperationTable.binding_id, binding.id), eq(ActionsOperationTable.binding_revision, binding.revision),
              eq(ActionsOperationTable.actor, row.actor), eq(ActionsOperationTable.state, "prepared"),
              gt(ActionsOperationTable.time_expires, claimTime),
            )).returning().get()
        }), { behavior: "immediate" }))
        if (!claimed) return yield* get(binding, row.id)
        yield* restore(Effect.suspend(() => lifetime.closed ? Effect.interrupt : perform(intent(claimed), submission.input)).pipe(
          Effect.flatMap(checkedAcknowledgement),
          Effect.scoped,
          Effect.timeout(DEADLINE),
          Effect.raceFirst(Deferred.await(disposed).pipe(Effect.andThen(Effect.interrupt))),
          Effect.catchCause((cause) => Cause.hasInterrupts(cause)
            ? Effect.interrupt
            : Effect.fail(definitive(cause) ?? error("outcome_unknown", "Actions provider outcome was not established", row.id))),
        )).pipe(Effect.onExit((exit) => finalize(database.db, row.id, exit)))
        return yield* get(binding, row.id)
      }).pipe(Effect.ensuring(Effect.sync(() => lifetime.requests.delete(fiber))))
    }))),
  )

  const reconcile: ActionsContract.Operations["reconcile"] = Effect.fn("ActionsOperations.reconcile")((bindingInput, id, observe) =>
    Effect.uninterruptibleMask((restore) => Effect.withFiber((fiber) => Effect.gen(function* () {
      const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
      const invalid = validate(binding)
      if (invalid) return yield* Effect.fail(invalid)
      const row = yield* find(database.db, id)
      const denied = access(row, location, binding, id)
      if (denied) return yield* Effect.fail(denied)
      if (!row) return yield* Effect.fail(error("operation_missing", "Actions operation does not exist", id))
      const expired = unavailable(row, yield* Clock.currentTimeMillis)
      if (expired) return yield* Effect.fail(expired)
      if (row.state !== "accepted" && row.state !== "outcome_unknown") return receipt(row)
      lifetime.requests.add(fiber)
      return yield* Effect.gen(function* () {
        const observation = yield* restore(Effect.suspend(() => lifetime.closed ? Effect.interrupt : observe(
          structuredClone(intent(row)), row.result == null ? undefined : structuredClone(row.result),
        )).pipe(
          Effect.flatMap(checkedObservation), Effect.scoped, Effect.timeout(DEADLINE),
          Effect.raceFirst(Deferred.await(disposed).pipe(Effect.andThen(Effect.interrupt))),
          Effect.catchCause((cause) => {
            if (Cause.hasInterrupts(cause)) return Effect.interrupt
            const failure = Cause.findErrorOption(cause)
            return Effect.fail(Option.isSome(failure) && failure.value instanceof ActionsError
              ? failure.value : error("transport_failed", "Actions operation observation failed", id))
          }),
        ))
        const observed = yield* update(database.db, row, observation)
        return observed ? receipt(observed) : yield* get(binding, id)
      }).pipe(Effect.ensuring(Effect.sync(() => lifetime.requests.delete(fiber))))
    }))),
  )

  return { prepare, execute, get, reconcile } satisfies ActionsContract.Operations
})
