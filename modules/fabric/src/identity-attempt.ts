export * as FabricIdentityAttempts from "./identity-attempt"

import { CapabilityRequest } from "@orchestra/core/capability/operator/request"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { and, count, eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { FabricIdentityAttemptAccess } from "./identity-attempt-access"
import { FabricIdentityAttemptTable } from "./identity-attempt/sql"
import { FabricIdentitySecretTable } from "./identity-secret/sql"
import type { FabricIdentityAttemptsContract } from "./identity-attempt-contract"

/** Durable admission/inspection/cancellation; preparing alone never accepts a callback or publishes a connection. */
export const make: FabricIdentityAttemptsContract.Factory = (options) =>
  Effect.gen(function* () {
    const access = yield* FabricIdentityAttemptAccess.make(options)
    const requests = yield* CapabilityRequest.make({ operators: access.operators })
    const begin: FabricIdentityAttemptsContract.Interface["begin"] = (supplied) => {
      const input = Schema.decodeUnknownOption(FabricIdentityAttempt.Begin)(supplied)
      return FabricIdentityAttemptAccess.storageErrors(
        Effect.gen(function* () {
          if (Option.isNone(input) || !Number.isSafeInteger(input.value.context.generation))
            return yield* FabricIdentityAttemptAccess.failure("invalid-input")
          const value = input.value
          const admitted = yield* access.admit(value.context, "fabric.identity.begin", {
            kind: "fabric.context",
            id: value.context.id,
          })
          const receipt = yield* requests.commit(
            admitted.target,
            { context: value.context, scopes: value.scopes, profileHash: access.profileHash },
            (tx) =>
              Effect.gen(function* () {
                const used = yield* tx.select({ count: count() }).from(FabricIdentityAttemptTable).get()
                if (!used || used.count >= access.maximum) return yield* FabricIdentityAttemptAccess.failure("limit")
                const at = yield* access.instant()
                const ref = { id: FabricIdentityAttempt.ID.create(), revision: 1 }
                yield* tx
                  .insert(FabricIdentityAttemptTable)
                  .values({
                    id: ref.id,
                    revision: 1,
                    state: "preparing",
                    storage_id: access.storageID,
                    principal: admitted.binding.principal,
                    context_id: value.context.id,
                    context_generation: value.context.generation,
                    directory: admitted.info.location.directory,
                    project_id: admitted.info.location.project.id,
                    project_directory: admitted.info.location.project.directory,
                    profile_hash: access.profileHash,
                    scopes: JSON.stringify(value.scopes),
                    time_created: at,
                    expires_at: at + FabricIdentityAttemptAccess.duration,
                  })
                  .run()
                return ref
              }),
            (tx) => access.guard(tx, admitted),
          )
          const decoded = Schema.decodeUnknownOption(FabricIdentityAttempt.Ref)(receipt.data)
          if (Option.isNone(decoded)) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          const row = yield* access.selected(access.database.db, admitted, decoded.value)
          const at = yield* access.instant()
          if (at < row.time_created) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          if (at >= row.expires_at) return yield* FabricIdentityAttemptAccess.failure("expired")
          yield* access.guard(access.database.db, admitted)
          return Object.freeze(decoded.value)
        }),
      )
    }

    const inspect: FabricIdentityAttemptsContract.Interface["inspect"] = (supplied) => {
      const input = Schema.decodeUnknownOption(FabricIdentityAttempt.Selection)(supplied)
      return FabricIdentityAttemptAccess.storageErrors(
        Effect.gen(function* () {
          if (
            Option.isNone(input) ||
            !Number.isSafeInteger(input.value.context.generation) ||
            !Number.isSafeInteger(input.value.attempt.revision)
          )
            return yield* FabricIdentityAttemptAccess.failure("invalid-input")
          const value = input.value
          const admitted = yield* access.admit(value.context, "fabric.identity.inspect", {
            kind: "fabric.identity-attempt",
            id: value.attempt.id,
          })
          const result = yield* access.database.db.transaction(
            (tx) =>
              Effect.gen(function* () {
                const row = yield* access.selected(tx, admitted, value.attempt)
                const at = yield* access.instant()
                if (at < row.time_created) return yield* FabricIdentityAttemptAccess.failure("unavailable")
                yield* access.guard(tx, admitted)
                return {
                  attempt: value.attempt,
                  state:
                    row.state === "cancelled" || row.state === "denied"
                      ? row.state
                      : at >= row.expires_at
                        ? ("expired" as const)
                        : row.state,
                  expiresAt: row.expires_at,
                }
              }),
            { behavior: "immediate" },
          )
          yield* access.guard(access.database.db, admitted)
          return result
        }),
      )
    }

    const cancel: FabricIdentityAttemptsContract.Interface["cancel"] = (supplied) => {
      const input = Schema.decodeUnknownOption(FabricIdentityAttempt.Selection)(supplied)
      return FabricIdentityAttemptAccess.storageErrors(
        Effect.gen(function* () {
          if (
            Option.isNone(input) ||
            !Number.isSafeInteger(input.value.context.generation) ||
            !Number.isSafeInteger(input.value.attempt.revision)
          )
            return yield* FabricIdentityAttemptAccess.failure("invalid-input")
          const value = input.value
          const admitted = yield* access.admit(value.context, "fabric.identity.cancel", {
            kind: "fabric.identity-attempt",
            id: value.attempt.id,
          })
          const receipt = yield* requests.commit(
            admitted.target,
            { context: value.context, attempt: value.attempt, profileHash: access.profileHash },
            (tx) =>
              Effect.gen(function* () {
                const row = yield* access.selected(tx, admitted, value.attempt)
                if (row.state !== "preparing" && row.state !== "pending")
                  return yield* FabricIdentityAttemptAccess.failure("conflict")
                const at = yield* access.instant()
                if (at < row.time_created) return yield* FabricIdentityAttemptAccess.failure("unavailable")
                if (at >= row.expires_at) return yield* FabricIdentityAttemptAccess.failure("expired")
                const updated = yield* tx
                  .update(FabricIdentityAttemptTable)
                  .set({ state: "cancelled", revision: row.revision + 1 })
                  .where(
                    and(
                      eq(FabricIdentityAttemptTable.id, row.id),
                      eq(FabricIdentityAttemptTable.revision, value.attempt.revision),
                      eq(FabricIdentityAttemptTable.state, row.state),
                    ),
                  )
                  .returning({ id: FabricIdentityAttemptTable.id, revision: FabricIdentityAttemptTable.revision })
                  .get()
                if (!updated) return yield* FabricIdentityAttemptAccess.failure("conflict")
                yield* tx.delete(FabricIdentitySecretTable).where(eq(FabricIdentitySecretTable.id, row.id)).run()
                yield* access.guard(tx, admitted)
                return updated
              }),
            (tx) => access.selected(tx, admitted, value.attempt, false).pipe(Effect.asVoid),
          )
          const decoded = Schema.decodeUnknownOption(FabricIdentityAttempt.Ref)(receipt.data)
          if (Option.isNone(decoded)) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          const row = yield* access.selected(access.database.db, admitted, decoded.value)
          if (row.state !== "cancelled") return yield* FabricIdentityAttemptAccess.failure("unavailable")
          yield* access.guard(access.database.db, admitted)
          return Object.freeze(decoded.value)
        }),
      )
    }

    return Object.freeze({ begin, inspect, cancel }) satisfies FabricIdentityAttemptsContract.Interface
  })
