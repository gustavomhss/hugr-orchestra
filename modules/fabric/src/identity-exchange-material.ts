export * as FabricIdentityExchangeMaterial from "./identity-exchange-material"

import { CredentialCipher } from "@orchestra/core/credential"
import { Effect, Option, Schema } from "effect"
import { eq } from "drizzle-orm"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { FabricIdentityAttemptAccess } from "./identity-attempt-access"
import { FabricIdentityEnvelope } from "./identity-envelope"
import { FabricIdentityMaterial } from "./identity-material"
import { FabricIdentitySecretTable } from "./identity-secret/sql"
import type { FabricIdentityExchangeMaterialContract } from "./identity-exchange-material-contract"

/** Backend-only protected expectations. Reads neither consume a code ticket nor authorize remote provider work. */
export const make: FabricIdentityExchangeMaterialContract.Factory = (options) =>
  Effect.gen(function* () {
    const access = yield* FabricIdentityAttemptAccess.make(options)
    const cipher = yield* CredentialCipher.Service
    const profile = options.profile

    function current(
      admitted: FabricIdentityAttemptAccess.Admission,
      ref: FabricIdentityAttempt.Ref,
      expected?: string,
    ) {
      return Effect.gen(function* () {
        if (yield* access.inTransaction) return yield* FabricIdentityAttemptAccess.failure("unavailable")
        const row = yield* access.selected(access.database.db, admitted, ref)
        if (row.state !== "exchanging" || row.revision !== 3)
          return yield* FabricIdentityAttemptAccess.failure("conflict")
        if (expected !== undefined && FabricIdentityEnvelope.binding(row) !== expected)
          return yield* FabricIdentityAttemptAccess.failure("conflict")
        const at = yield* access.instant()
        if (at < row.time_created) return yield* FabricIdentityAttemptAccess.failure("unavailable")
        if (at >= row.expires_at) return yield* FabricIdentityAttemptAccess.failure("expired")
        return row
      })
    }

    const read: FabricIdentityExchangeMaterialContract.Interface["read"] = (supplied) => {
      const input = Schema.decodeUnknownOption(FabricIdentityAttempt.Selection)(supplied)
      const value = Option.isSome(input)
        ? { context: { ...input.value.context }, attempt: { ...input.value.attempt } }
        : undefined
      return FabricIdentityAttemptAccess.storageErrors(
        Effect.gen(function* () {
          if (
            !value ||
            !Number.isSafeInteger(value.context.generation) ||
            !Number.isSafeInteger(value.attempt.revision)
          )
            return yield* FabricIdentityAttemptAccess.failure("invalid-input")
          const admitted = yield* access.admit(value.context, "fabric.identity.exchange", {
            kind: "fabric.identity-attempt",
            id: value.attempt.id,
          })
          const row = yield* current(admitted, value.attempt)
          const bound = FabricIdentityEnvelope.binding(row)
          const secret = yield* access.database.db
            .select()
            .from(FabricIdentitySecretTable)
            .where(eq(FabricIdentitySecretTable.id, row.id))
            .get()
          if (
            !secret ||
            secret.revision !== 2 ||
            !CredentialCipher.isSealed(secret.sealed) ||
            Buffer.byteLength(secret.sealed) > 32768 ||
            secret.bytes !== Buffer.byteLength(secret.sealed)
          )
            return yield* FabricIdentityAttemptAccess.failure("unavailable")
          yield* current(admitted, value.attempt, bound)
          const plain = yield* Effect.try({
            try: () => cipher.open(secret.sealed),
            catch: () => FabricIdentityAttemptAccess.failure("unavailable"),
          })
          if (plain === undefined || Buffer.byteLength(plain) > 16384)
            return yield* FabricIdentityAttemptAccess.failure("unavailable")
          const decoded = FabricIdentityEnvelope.decode(plain, { onExcessProperty: "error" })
          if (
            Option.isNone(decoded) ||
            decoded.value.binding !== FabricIdentityEnvelope.binding({ ...row, revision: 2 }) ||
            decoded.value.expiresAt !== row.expires_at ||
            !FabricIdentityMaterial.valid(decoded.value)
          )
            return yield* FabricIdentityAttemptAccess.failure("unavailable")
          yield* current(admitted, value.attempt, bound)
          const scopes = Schema.decodeUnknownOption(
            Schema.UnknownFromJsonString.pipe(Schema.decodeTo(FabricIdentityAttempt.Scopes)),
          )(row.scopes)
          if (Option.isNone(scopes)) return yield* FabricIdentityAttemptAccess.failure("unavailable")
          const latest = yield* access.database.db
            .select()
            .from(FabricIdentitySecretTable)
            .where(eq(FabricIdentitySecretTable.id, row.id))
            .get()
          if (
            !latest ||
            latest.revision !== secret.revision ||
            latest.bytes !== secret.bytes ||
            latest.sealed !== secret.sealed
          )
            return yield* FabricIdentityAttemptAccess.failure("conflict")
          yield* current(admitted, value.attempt, bound)
          return Object.freeze({
            verifier: decoded.value.verifier,
            nonce: decoded.value.nonce,
            correlationID: decoded.value.correlationID,
            scopes: Object.freeze(scopes.value),
            redirectUri: profile.redirectUri,
            createdAt: row.time_created,
            expiresAt: row.expires_at,
          })
        }),
      )
    }
    return Object.freeze({ read }) satisfies FabricIdentityExchangeMaterialContract.Interface
  })
