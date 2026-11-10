export * as FabricIdentityPreparation from "./identity-preparation"

import { CredentialCipher } from "@orchestra/core/credential"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { Effect, Option, Schema } from "effect"
import { and, eq } from "drizzle-orm"
import { FabricIdentityAttemptAccess } from "./identity-attempt-access"
import { FabricIdentityMaterial } from "./identity-material"
import { FabricIdentityEnvelope } from "./identity-envelope"
import { FabricIdentityAttemptTable } from "./identity-attempt/sql"
import { FabricIdentitySecretTable } from "./identity-secret/sql"
import type { FabricIdentityPreparationContract } from "./identity-preparation-contract"

type Row = typeof FabricIdentityAttemptTable.$inferSelect

/** Private manual host seam; no callback receiver, authorization-code exchange or token/cache consumer is activated. */
export const make: FabricIdentityPreparationContract.Factory = (options) =>
  Effect.gen(function* () {
    const access = yield* FabricIdentityAttemptAccess.make(options)
    const cipher = yield* CredentialCipher.Service
    const profile = options.profile

    function live(row: Row) {
      return Effect.gen(function* () {
        if (row.state !== "preparing" && row.state !== "pending")
          return yield* FabricIdentityAttemptAccess.failure("conflict")
        const at = yield* access.instant()
        if (at < row.time_created) return yield* FabricIdentityAttemptAccess.failure("unavailable")
        if (at >= row.expires_at) return yield* FabricIdentityAttemptAccess.failure("expired")
      })
    }

    function current(admitted: FabricIdentityAttemptAccess.Admission, ref: FabricIdentityAttempt.Ref, exact = true) {
      return Effect.gen(function* () {
        const row = yield* access.selected(access.database.db, admitted, ref, exact)
        yield* live(row)
        return row
      })
    }

    function open(admitted: FabricIdentityAttemptAccess.Admission, row: Row) {
      return Effect.gen(function* () {
        const ref = { id: row.id, revision: row.revision }
        yield* current(admitted, ref)
        const secret = yield* access.database.db
          .select()
          .from(FabricIdentitySecretTable)
          .where(eq(FabricIdentitySecretTable.id, row.id))
          .get()
        if (
          !secret ||
          secret.revision !== row.revision ||
          !CredentialCipher.isSealed(secret.sealed) ||
          Buffer.byteLength(secret.sealed) > 32768 ||
          secret.bytes !== Buffer.byteLength(secret.sealed)
        )
          return yield* FabricIdentityAttemptAccess.failure("unavailable")
        // All cipher calls stay outside SQL, after current guard, including read-after-publish and exact retry.
        if (yield* access.inTransaction) return yield* FabricIdentityAttemptAccess.failure("unavailable")
        yield* current(admitted, ref)
        const plain = yield* Effect.try({
          try: () => cipher.open(secret.sealed),
          catch: () => FabricIdentityAttemptAccess.failure("unavailable"),
        })
        if (plain === undefined || Buffer.byteLength(plain) > 16384)
          return yield* FabricIdentityAttemptAccess.failure("unavailable")
        const decoded = FabricIdentityEnvelope.decode(plain, { onExcessProperty: "error" })
        if (
          Option.isNone(decoded) ||
          decoded.value.binding !== FabricIdentityEnvelope.binding(row) ||
          decoded.value.expiresAt !== row.expires_at ||
          !FabricIdentityMaterial.valid(decoded.value)
        )
          return yield* FabricIdentityAttemptAccess.failure("unavailable")
        yield* current(admitted, ref)
        const scopes = Schema.decodeUnknownOption(
          Schema.UnknownFromJsonString.pipe(Schema.decodeTo(FabricIdentityAttempt.Scopes)),
        )(row.scopes)
        if (Option.isNone(scopes)) return yield* FabricIdentityAttemptAccess.failure("unavailable")
        const authorizationURL = yield* FabricIdentityMaterial.authorizationURL(profile, scopes.value, decoded.value)
        yield* current(admitted, ref)
        const latest = yield* access.database.db
          .select()
          .from(FabricIdentitySecretTable)
          .where(eq(FabricIdentitySecretTable.id, row.id))
          .get()
        if (
          !latest ||
          latest.sealed !== secret.sealed ||
          latest.revision !== secret.revision ||
          latest.bytes !== secret.bytes
        )
          return yield* FabricIdentityAttemptAccess.failure("conflict")
        yield* current(admitted, ref)
        return { attempt: ref, authorizationURL }
      })
    }

    const prepare: FabricIdentityPreparationContract.Interface["prepare"] = (supplied) => {
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
          const admitted = yield* access.admit(value.context, "fabric.identity.prepare", {
            kind: "fabric.identity-attempt",
            id: value.attempt.id,
          })
          const row = yield* access.database.db.transaction(
            (tx) =>
              Effect.gen(function* () {
                const row = yield* access.selected(tx, admitted, value.attempt, false)
                yield* live(row)
                if (
                  value.attempt.revision !== row.revision &&
                  !(value.attempt.revision === 1 && row.state === "pending" && row.revision === 2)
                )
                  return yield* FabricIdentityAttemptAccess.failure("conflict")
                return row
              }),
            { behavior: "immediate" },
          )
          if (row.state === "pending") return yield* open(admitted, row)
          if (yield* access.inTransaction) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          const observed = yield* current(admitted, { id: row.id, revision: row.revision }, false)
          if (observed.state === "pending") return yield* open(admitted, observed)
          const material = yield* FabricIdentityMaterial.create()
          const checked = Schema.decodeUnknownOption(FabricIdentityMaterial.Material)(material, {
            onExcessProperty: "error",
          })
          if (Option.isNone(checked) || !FabricIdentityMaterial.valid(checked.value))
            return yield* FabricIdentityAttemptAccess.failure("unavailable")
          const pending = { ...row, revision: 2, state: "pending" as const }
          const plain = JSON.stringify({
            domain: "orchestra:fabric-identity-preparation",
            version: 1,
            binding: FabricIdentityEnvelope.binding(pending),
            expiresAt: row.expires_at,
            ...checked.value,
          })
          if (Buffer.byteLength(plain) > 16384) return yield* FabricIdentityAttemptAccess.failure("limit")
          const fresh = yield* current(admitted, { id: row.id, revision: row.revision }, false)
          if (fresh.state === "pending") return yield* open(admitted, fresh)
          const sealed = yield* Effect.try({
            try: () => cipher.seal(plain),
            catch: () => FabricIdentityAttemptAccess.failure("unavailable"),
          })
          if (!CredentialCipher.isSealed(sealed) || Buffer.byteLength(sealed) > 32768)
            return yield* FabricIdentityAttemptAccess.failure("unavailable")
          // A synchronous seal can be followed by cancellation/revocation; prove live authority again outside the writer.
          yield* access.guard(access.database.db, admitted)
          const published = yield* access.database.db.transaction(
            (tx) =>
              Effect.gen(function* () {
                const latest = yield* access.selected(tx, admitted, value.attempt, false)
                yield* live(latest)
                if (latest.state === "pending") return latest
                if (latest.state !== "preparing" || latest.revision !== row.revision)
                  return yield* FabricIdentityAttemptAccess.failure("conflict")
                const existing = yield* tx
                  .select()
                  .from(FabricIdentitySecretTable)
                  .where(eq(FabricIdentitySecretTable.id, row.id))
                  .get()
                if (existing) return yield* FabricIdentityAttemptAccess.failure("unavailable")
                const updated = yield* tx
                  .update(FabricIdentityAttemptTable)
                  .set({ state: "pending", revision: 2 })
                  .where(
                    and(
                      eq(FabricIdentityAttemptTable.id, row.id),
                      eq(FabricIdentityAttemptTable.revision, row.revision),
                      eq(FabricIdentityAttemptTable.state, "preparing"),
                    ),
                  )
                  .returning()
                  .get()
                if (!updated) return yield* FabricIdentityAttemptAccess.failure("conflict")
                yield* tx
                  .insert(FabricIdentitySecretTable)
                  .values({ id: row.id, revision: 2, sealed, bytes: Buffer.byteLength(sealed) })
                  .run()
                yield* access.guard(tx, admitted)
                return updated
              }),
            { behavior: "immediate" },
          )
          return yield* open(admitted, published)
        }),
      )
    }
    return Object.freeze({ prepare }) satisfies FabricIdentityPreparationContract.Interface
  })
