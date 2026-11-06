export * as FabricIdentityAttemptAccess from "./identity-attempt-access"

import { Database } from "@orchestra/core/database/database"
import { Location } from "@orchestra/core/location"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { createHash } from "node:crypto"
import path from "node:path"
import { FabricContexts } from "./context"
import { FabricContextTable } from "./context/sql"
import { FabricIdentityProfile } from "./identity-profile"
import { FabricIdentityAttemptTable } from "./identity-attempt/sql"
import type { FabricIdentityAttemptsContract } from "./identity-attempt-contract"

export const duration = 10 * 60 * 1000
export type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
export type Admission = Readonly<{
  info: FabricContext.Info
  binding: CapabilityOperatorContract.Binding
  target: CapabilityOperatorContract.Target
}>
const decodeScopes = Schema.decodeUnknownOption(
  Schema.UnknownFromJsonString.pipe(Schema.decodeTo(FabricIdentityAttempt.Scopes)),
)

/** Internal identity seam. Never reconstructs request authority or Location from persisted JSON. */
export function make(options: Parameters<FabricIdentityAttemptsContract.Factory>[0]) {
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
          !(
            (row.state === "preparing" && row.revision === 1) ||
            (row.state === "pending" && row.revision === 2) ||
            ((row.state === "exchanging" || row.state === "denied") && row.revision === 3) ||
            (row.state === "cancelled" && (row.revision === 2 || row.revision === 3))
          )
        )
          return yield* failure("unavailable")
        if (exact && row.revision !== ref.revision) return yield* failure("conflict")
        yield* operators.validate(admitted.binding, admitted.target)
        return row
      })
    }

    return { operators, database, storageID, inTransaction, maximum, profileHash, instant, admit, guard, selected }
  })
}

export function storageErrors<A, R>(
  effect: Effect.Effect<A, FabricIdentityAttemptsContract.Error | SqlError | EffectDrizzleQueryError, R>,
) {
  return Effect.mapError(effect, (error) =>
    error instanceof SqlError || error instanceof EffectDrizzleQueryError ? failure("unavailable") : error,
  )
}

export function failure(code: FabricIdentityAttempt.Failure["code"]) {
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
