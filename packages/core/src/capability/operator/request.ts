export * as CapabilityRequest from "./request"

import { Capability } from "@orchestra/schema/capability"
import { count, eq, sql } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Cause, Effect, Result, Schema } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { Database } from "../../database/database"
import { CapabilityRequestTable } from "../sql"
import type { CapabilityOperatorContract } from "./contract"
import type { CapabilityRequestContract } from "./request-contract"
import { capture, hash, invalid, quota, resultBudget, snapshot, stored } from "./request-data"

export function make(options: { operators: CapabilityOperatorContract.Interface; maxReceipts?: number }) {
  const operators = Object.freeze({ ...options.operators })
  const maxReceipts = options.maxReceipts ?? 10_000
  return Effect.gen(function* () {
    if (!Number.isSafeInteger(maxReceipts) || maxReceipts <= 0) return yield* quota()
    const database = yield* Database.Service

    const commit: CapabilityRequestContract.Interface["commit"] = <E, R>(
      target: CapabilityOperatorContract.Target, payload: Schema.Json,
      write: (tx: CapabilityRequestContract.Transaction) => Effect.Effect<Schema.Json, E, R>,
    ) => {
      // Capture at call time, before authority lookup or any caller-controlled scheduling boundary.
      const input = capture(target, payload)
      return Effect.gen(function* () {
        if (Result.isFailure(input)) return yield* input.failure
        const binding = yield* operators.require(input.success.target)
        if (!binding.idempotencyKey) return yield* new Capability.Failure({
          code: "unsupported_operation", message: "Capability request requires an idempotency key",
        })
        if (!database.inTransaction) return yield* Effect.die("Capability request requires SQL transaction identity")
        if (yield* database.inTransaction) return yield* mismatch()
        const idempotencyHash = hash(JSON.stringify([binding.principal, binding.idempotencyKey]))
        return yield* storageErrors(database.db.transaction((tx) => Effect.gen(function* () {
          const current = yield* operators.require(input.success.target)
          if (current !== binding) return yield* mismatch()
          yield* operators.validate(binding, input.success.target)
          // Read JSON as raw text: Drizzle's JSON decoder would parse malformed rows before our bounded boundary.
          const previous = yield* tx.select({
            id: CapabilityRequestTable.id, principal: CapabilityRequestTable.principal,
            action: CapabilityRequestTable.action, targetHash: CapabilityRequestTable.target_hash,
            payloadHash: CapabilityRequestTable.payload_hash, result: sql<string>`${CapabilityRequestTable.result}`,
          }).from(CapabilityRequestTable).where(eq(CapabilityRequestTable.idempotency_hash, idempotencyHash)).get()
          if (previous) {
            if (previous.principal !== binding.principal || previous.action !== input.success.target.action ||
              previous.targetHash !== input.success.targetHash || previous.payloadHash !== input.success.payloadHash)
              return yield* conflict()
            const data = stored(previous.result)
            yield* operators.validate(binding, input.success.target)
            return Object.freeze({ requestID: previous.id, reused: true, data })
          }
          const used = yield* tx.select({ count: count() }).from(CapabilityRequestTable)
            .where(eq(CapabilityRequestTable.principal, binding.principal)).get()
          if (!used || used.count >= maxReceipts) return yield* quota()
          // Host callback must contain only SQL domain mutation. It owns current stored-owner/domain-policy checks.
          const result = yield* write(tx)
          const data = yield* Effect.try({
            try: () => snapshot(result, resultBudget),
            catch: (error) => error instanceof Capability.Failure ? error : invalid(),
          })
          yield* operators.validate(binding, input.success.target)
          yield* tx.insert(CapabilityRequestTable).values({
            id: binding.requestID, idempotency_hash: idempotencyHash, principal: binding.principal,
            origin: binding.origin, scope_hash: binding.scopeHash, action: input.success.target.action,
            target_hash: input.success.targetHash, payload_hash: input.success.payloadHash,
            // JSON null is non-null text, never SQL NULL.
            result: sql`${data.json}`, time_created: Date.now(),
          }).run()
          yield* operators.validate(binding, input.success.target)
          return Object.freeze({ requestID: binding.requestID, reused: false, data: data.data })
        }), { behavior: "immediate" }))
      })
    }
    return Object.freeze({ commit }) satisfies CapabilityRequestContract.Interface
  })
}

function storageErrors<A, E, R>(effect: Effect.Effect<A, E | SqlError | EffectDrizzleQueryError, R>) {
  // The frozen API exposes domain E. SQL-only Causes translate; mixed Causes remain whole at runtime,
  // including SQL Fail reasons alongside domain failures, defects, or interruption.
  return Effect.catchCauseIf(effect,
    (cause: Cause.Cause<E | SqlError | EffectDrizzleQueryError>) => cause.reasons.length > 0 &&
      cause.reasons.every((reason) => reason._tag === "Fail" &&
        (reason.error instanceof SqlError || reason.error instanceof EffectDrizzleQueryError)),
    () => Effect.fail(new Capability.Failure({ code: "outcome_unknown", message: "Capability request storage failed" })),
  ) as Effect.Effect<A, E | Capability.Failure, R>
}

function mismatch() {
  return new Capability.Failure({ code: "invocation_binding_mismatch", message: "Capability request binding does not match" })
}

function conflict() {
  return new Capability.Failure({ code: "outcome_unknown", message: "Capability request idempotency conflict" })
}
