export * as FabricIdentityAttempts from "./identity-attempt"

import { Database } from "@orchestra/core/database/database"
import { Location } from "@orchestra/core/location"
import { CapabilityRequest } from "@orchestra/core/capability/operator/request"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { and, count, eq } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, Option, Schema } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { createHash } from "node:crypto"
import path from "node:path"
import { FabricContexts } from "./context"
import { FabricContextTable } from "./context/sql"
import { FabricIdentityProfile } from "./identity-profile"
import { FabricIdentityAttemptTable } from "./identity-attempt/sql"
import type { FabricIdentityAttemptsContract } from "./identity-attempt-contract"

const duration = 10 * 60 * 1000
const decodeScopes = Schema.decodeUnknownOption(
  Schema.UnknownFromJsonString.pipe(Schema.decodeTo(FabricIdentityAttempt.Scopes)),
)
type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
type Admission = Readonly<{
  info: FabricContext.Info
  binding: CapabilityOperatorContract.Binding
  target: CapabilityOperatorContract.Target
}>

/** Durable admission only: preparing cannot receive a callback, decrypt PKCE or publish a connection. */
export const make: FabricIdentityAttemptsContract.Factory = (options) => {
  const operators = Object.freeze({ ...options.operators })
  const root = options.root
  const now = options.now ?? Date.now
  const maximum = options.maxAttempts ?? 1024
  const profile = options.profile
  return Effect.gen(function* () {
    if (!FabricIdentityProfile.isAdmitted(profile) || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 1024)
      return yield* failure("invalid-input")
    const database = yield* Database.Service
    if (!database.storageID || !database.inTransaction) return yield* failure("unavailable")
    const storageID = database.storageID
    const inTransaction = database.inTransaction
    if (yield* inTransaction) return yield* failure("unavailable")
    const contexts = yield* FabricContexts.make({ operators, root })
    const requests = yield* CapabilityRequest.make({ operators })
    const profileHash = createHash("sha256")
      .update(
        JSON.stringify([
          "orchestra:fabric-identity-profile:1",
          profile.deployment,
          profile.clientID,
          profile.origin,
          profile.redirectUri,
        ]),
      )
      .digest("hex")

    function instant() {
      return Effect.try({ try: now, catch: () => failure("unavailable") }).pipe(
        Effect.flatMap((value) =>
          Number.isSafeInteger(value) && value >= 0 && Number.isSafeInteger(value + duration)
            ? Effect.succeed(value)
            : Effect.fail(failure("unavailable")),
        ),
      )
    }

    function admit(context: FabricContext.Ref, action: string, resource: CapabilityOperatorContract.Resource) {
      return Effect.gen(function* () {
        // An ambient writer must not reach directory/project observation, including on an exact retry.
        if (yield* inTransaction) return yield* failure("unavailable")
        const actual = yield* Effect.serviceOption(Location.Service)
        if (Option.isNone(actual)) return yield* failure("denied")
        const info = yield* contexts.resolve(context)
        if (
          actual.value.directory !== info.location.directory ||
          actual.value.workspaceID !== info.location.workspaceID ||
          actual.value.project.id !== info.location.project.id ||
          actual.value.project.directory !== info.location.project.directory
        )
          return yield* failure("denied")
        const target = {
          action,
          resource,
          placement: {
            projectID: info.location.project.id,
            location: { directory: info.location.directory },
          },
        }
        const binding = yield* operators.require(target)
        return { info, target, binding }
      })
    }

    function guard(tx: Pick<Transaction, "select">, admitted: Admission) {
      return Effect.gen(function* () {
        yield* operators.validate(admitted.binding, admitted.target)
        const row = yield* tx
          .select()
          .from(FabricContextTable)
          .where(eq(FabricContextTable.id, admitted.info.context.id))
          .get()
        if (!row || row.storage_id !== storageID || row.principal !== admitted.binding.principal)
          return yield* failure("denied")
        if (row.generation !== admitted.info.context.generation || row.state === "deleted")
          return yield* failure("expired")
        if (
          row.state !== "active" ||
          row.directory !== admitted.info.location.directory ||
          row.project_id !== admitted.info.location.project.id ||
          row.project_directory !== admitted.info.location.project.directory ||
          row.root !== path.dirname(row.directory) ||
          row.directory !== path.join(row.root, row.id)
        )
          return yield* failure("unavailable")
        yield* operators.validate(admitted.binding, admitted.target)
      })
    }

    function selected(
      tx: Pick<Transaction, "select">,
      admitted: Admission,
      ref: FabricIdentityAttempt.Ref,
      exact = true,
    ) {
      return Effect.gen(function* () {
        yield* guard(tx, admitted)
        const row = yield* tx
          .select()
          .from(FabricIdentityAttemptTable)
          .where(eq(FabricIdentityAttemptTable.id, ref.id))
          .get()
        if (
          !row ||
          row.storage_id !== storageID ||
          row.principal !== admitted.binding.principal ||
          row.context_id !== admitted.info.context.id ||
          row.context_generation !== admitted.info.context.generation ||
          row.profile_hash !== profileHash
        )
          return yield* failure("denied")
        if (
          row.directory !== admitted.info.location.directory ||
          row.project_id !== admitted.info.location.project.id ||
          row.project_directory !== admitted.info.location.project.directory ||
          row.scopes.length > 256 ||
          Option.isNone(decodeScopes(row.scopes)) ||
          !Number.isSafeInteger(row.time_created) ||
          row.time_created < 0 ||
          !Number.isSafeInteger(row.expires_at) ||
          row.expires_at !== row.time_created + duration ||
          !((row.state === "preparing" && row.revision === 1) || (row.state === "cancelled" && row.revision === 2))
        )
          return yield* failure("unavailable")
        if (exact && row.revision !== ref.revision) return yield* failure("conflict")
        yield* operators.validate(admitted.binding, admitted.target)
        return row
      })
    }

    const begin: FabricIdentityAttemptsContract.Interface["begin"] = (supplied) => {
      const input = Schema.decodeUnknownOption(FabricIdentityAttempt.Begin)(supplied)
      return storageErrors(
        Effect.gen(function* () {
          if (Option.isNone(input) || !Number.isSafeInteger(input.value.context.generation))
            return yield* failure("invalid-input")
          const value = input.value
          const admitted = yield* admit(value.context, "fabric.identity.begin", {
            kind: "fabric.context",
            id: value.context.id,
          })
          const receipt = yield* requests.commit(
            admitted.target,
            { context: value.context, scopes: value.scopes, profileHash },
            (tx) =>
              Effect.gen(function* () {
                const used = yield* tx.select({ count: count() }).from(FabricIdentityAttemptTable).get()
                if (!used || used.count >= maximum) return yield* failure("limit")
                const at = yield* instant()
                const ref = { id: FabricIdentityAttempt.ID.create(), revision: 1 }
                yield* tx
                  .insert(FabricIdentityAttemptTable)
                  .values({
                    id: ref.id,
                    revision: 1,
                    state: "preparing",
                    storage_id: storageID,
                    principal: admitted.binding.principal,
                    context_id: value.context.id,
                    context_generation: value.context.generation,
                    directory: admitted.info.location.directory,
                    project_id: admitted.info.location.project.id,
                    project_directory: admitted.info.location.project.directory,
                    profile_hash: profileHash,
                    scopes: JSON.stringify(value.scopes),
                    time_created: at,
                    expires_at: at + duration,
                  })
                  .run()
                return ref
              }),
            (tx) => guard(tx, admitted),
          )
          const decoded = Schema.decodeUnknownOption(FabricIdentityAttempt.Ref)(receipt.data)
          if (Option.isNone(decoded)) return yield* failure("unavailable")
          const row = yield* selected(database.db, admitted, decoded.value)
          const at = yield* instant()
          if (at < row.time_created) return yield* failure("unavailable")
          if (at >= row.expires_at) return yield* failure("expired")
          yield* guard(database.db, admitted)
          return Object.freeze(decoded.value)
        }),
      )
    }

    const inspect: FabricIdentityAttemptsContract.Interface["inspect"] = (supplied) => {
      const input = Schema.decodeUnknownOption(FabricIdentityAttempt.Selection)(supplied)
      return storageErrors(
        Effect.gen(function* () {
          if (
            Option.isNone(input) ||
            !Number.isSafeInteger(input.value.context.generation) ||
            !Number.isSafeInteger(input.value.attempt.revision)
          )
            return yield* failure("invalid-input")
          const value = input.value
          const admitted = yield* admit(value.context, "fabric.identity.inspect", {
            kind: "fabric.identity-attempt",
            id: value.attempt.id,
          })
          const result = yield* database.db.transaction(
            (tx) =>
              Effect.gen(function* () {
                const row = yield* selected(tx, admitted, value.attempt)
                const at = yield* instant()
                if (at < row.time_created) return yield* failure("unavailable")
                yield* guard(tx, admitted)
                return {
                  attempt: value.attempt,
                  state:
                    row.state === "cancelled"
                      ? ("cancelled" as const)
                      : at >= row.expires_at
                        ? ("expired" as const)
                        : ("preparing" as const),
                  expiresAt: row.expires_at,
                }
              }),
            { behavior: "immediate" },
          )
          yield* guard(database.db, admitted)
          return result
        }),
      )
    }

    const cancel: FabricIdentityAttemptsContract.Interface["cancel"] = (supplied) => {
      const input = Schema.decodeUnknownOption(FabricIdentityAttempt.Selection)(supplied)
      return storageErrors(
        Effect.gen(function* () {
          if (
            Option.isNone(input) ||
            !Number.isSafeInteger(input.value.context.generation) ||
            !Number.isSafeInteger(input.value.attempt.revision)
          )
            return yield* failure("invalid-input")
          const value = input.value
          const admitted = yield* admit(value.context, "fabric.identity.cancel", {
            kind: "fabric.identity-attempt",
            id: value.attempt.id,
          })
          const receipt = yield* requests.commit(
            admitted.target,
            { context: value.context, attempt: value.attempt, profileHash },
            (tx) =>
              Effect.gen(function* () {
                const row = yield* selected(tx, admitted, value.attempt)
                if (row.state !== "preparing") return yield* failure("conflict")
                const at = yield* instant()
                if (at < row.time_created) return yield* failure("unavailable")
                if (at >= row.expires_at) return yield* failure("expired")
                const updated = yield* tx
                  .update(FabricIdentityAttemptTable)
                  .set({ state: "cancelled", revision: row.revision + 1 })
                  .where(
                    and(
                      eq(FabricIdentityAttemptTable.id, row.id),
                      eq(FabricIdentityAttemptTable.revision, value.attempt.revision),
                      eq(FabricIdentityAttemptTable.state, "preparing"),
                    ),
                  )
                  .returning({ id: FabricIdentityAttemptTable.id, revision: FabricIdentityAttemptTable.revision })
                  .get()
                if (!updated) return yield* failure("conflict")
                yield* guard(tx, admitted)
                return updated
              }),
            (tx) => selected(tx, admitted, value.attempt, false).pipe(Effect.asVoid),
          )
          const decoded = Schema.decodeUnknownOption(FabricIdentityAttempt.Ref)(receipt.data)
          if (Option.isNone(decoded)) return yield* failure("unavailable")
          const row = yield* selected(database.db, admitted, decoded.value)
          if (row.state !== "cancelled") return yield* failure("unavailable")
          yield* guard(database.db, admitted)
          return Object.freeze(decoded.value)
        }),
      )
    }

    return Object.freeze({ begin, inspect, cancel }) satisfies FabricIdentityAttemptsContract.Interface
  })
}

function storageErrors<A, R>(
  effect: Effect.Effect<A, FabricIdentityAttemptsContract.Error | SqlError | EffectDrizzleQueryError, R>,
) {
  return Effect.mapError(effect, (error) =>
    error instanceof SqlError || error instanceof EffectDrizzleQueryError ? failure("unavailable") : error,
  )
}

function failure(code: FabricIdentityAttempt.Failure["code"]) {
  return new FabricIdentityAttempt.Failure({
    code,
    message:
      code === "invalid-input"
        ? "Fabric identity attempt input is invalid"
        : code === "denied"
          ? "Fabric identity attempt access is denied"
          : code === "expired"
            ? "Fabric identity attempt has expired"
            : code === "conflict"
              ? "Fabric identity attempt revision conflicts"
              : code === "limit"
                ? "Fabric identity attempt limit is reached"
                : "Fabric identity attempt is unavailable",
  })
}
