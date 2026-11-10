export * as FabricIdentityPublication from "./identity-publication"

import { createHash, timingSafeEqual } from "node:crypto"
import { CredentialCipher, CredentialTable } from "@orchestra/core/credential"
import { CapabilityRequest } from "@orchestra/core/capability/operator/request"
import { Credential } from "@orchestra/schema/credential"
import { FabricConnection } from "@orchestra/schema/fabric-connection"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { Integration } from "@orchestra/schema/integration"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { and, count, eq, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { FabricIdentityAttemptAccess } from "./identity-attempt-access"
import { FabricIdentityAttemptTable } from "./identity-attempt/sql"
import { FabricIdentityEnvelope } from "./identity-envelope"
import { FabricIdentitySecretTable } from "./identity-secret/sql"
import { FabricConnectionTable } from "./connection/sql"
import type { FabricIdentityExchangeContract } from "./identity-exchange-contract"
import type { FabricIdentityMsalContract } from "./identity-msal-contract"
import type { FabricIdentityPublicationContract } from "./identity-publication-contract"

const storeLimit = 1024
const contextLimit = 64
const integrationID = Integration.ID.make("fabric-identity")
const methodID = Integration.MethodID.make("msal-node")
const uuid = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/),
)
const homeAccountID = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9._-]{1,512}(?![\s\S])/))
const cacheHash = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}(?![\s\S])/))
const Envelope = Schema.Struct({
  domain: Schema.Literal("orchestra:fabric-connection"),
  version: Schema.Literal(1),
  binding: Schema.String,
  attemptID: FabricIdentityAttempt.ID,
  tenantID: uuid,
  objectID: uuid,
  homeAccountID,
  cloud: Schema.Literal("public"),
  scopes: FabricIdentityAttempt.Scopes,
  cacheHash,
}).annotate({ parseOptions: { onExcessProperty: "error" } })
const Receipt = Schema.Struct({
  attempt: FabricIdentityAttempt.Ref,
  connection: FabricConnection.Ref,
  profileHash: Schema.String,
}).annotate({ parseOptions: { onExcessProperty: "error" } })
const decodeEnvelope = Schema.decodeUnknownOption(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Envelope)))
const decodeReceipt = Schema.decodeUnknownOption(Receipt)

/** First connection for one exchanging attempt. Cache bytes stay in Credential, never in the ledger or connection DTO. */
export const make: FabricIdentityPublicationContract.Factory = (options) =>
  Effect.gen(function* () {
    const access = yield* FabricIdentityAttemptAccess.make(options)
    const cipher = yield* CredentialCipher.Service
    const requests = yield* CapabilityRequest.make({ operators: access.operators })
    const exchange = options.exchange
    const profile = options.profile

    const publish: FabricIdentityPublicationContract.Interface["publish"] = (supplied) => {
      const captured = capture(supplied)
      return storageErrors(
        Effect.gen(function* () {
          if (!captured || (yield* access.inTransaction)) return yield* refused("invalid-input")
          if (typeof captured.completion !== "object" || captured.completion === null)
            return yield* refused("invalid-input")
          const admitted = yield* access.admit(captured.context, "fabric.identity.publish", {
            kind: "fabric.identity-attempt",
            id: captured.attempt.id,
          })
          const payload = {
            context: captured.context,
            attempt: captured.attempt,
            profileHash: access.profileHash,
          }
          // Same-key retry must return the stored refs before the one-use completion can be spent again.
          const existing = yield* requests.reconcile(admitted.target, payload, (tx) => access.guard(tx, admitted))
          if (existing) return yield* reopen(access, cipher, admitted, captured.attempt.id, existing.data)
          const snapshot = yield* current(access, admitted, captured.attempt)
          const candidate = yield* exchange.consume({
            context: captured.context,
            attempt: captured.attempt,
            completion: captured.completion,
          })
          const scopes = Schema.decodeUnknownOption(
            Schema.UnknownFromJsonString.pipe(Schema.decodeTo(FabricIdentityAttempt.Scopes)),
          )(snapshot.row.scopes)
          const account = Option.isNone(scopes) ? undefined : accept(candidate, profile.clientID, scopes.value)
          if (!account) return yield* refused("denied")
          const at = yield* access.instant()
          if (at < snapshot.row.time_created) return yield* refused("unavailable")
          if (at >= snapshot.row.expires_at) return yield* refused("expired")
          const credentialID = Credential.ID.create()
          const connectionID = FabricConnection.ID.create()
          const cache = Credential.Cache.make({
            type: "cache",
            methodID,
            format: account.cache.format,
            version: account.cache.version,
            serialized: account.cache.serialized,
          })
          const prepared = yield* seal(cipher, {
            row: {
              id: connectionID,
              generation: 1,
              storage_id: snapshot.row.storage_id,
              principal: snapshot.row.principal,
              context_id: snapshot.row.context_id,
              context_generation: snapshot.row.context_generation,
              directory: snapshot.row.directory,
              project_id: snapshot.row.project_id,
              project_directory: snapshot.row.project_directory,
              profile_hash: snapshot.row.profile_hash,
              credential_id: credentialID,
              time_created: at,
            },
            attemptID: snapshot.row.id,
            tenantID: account.tenantID,
            objectID: account.objectID,
            homeAccountID: account.homeAccountID,
            scopes: account.scopes,
            cache: JSON.stringify(cache),
          })
          const latest = yield* current(access, admitted, captured.attempt, snapshot)
          if (latest.secret !== snapshot.secret || latest.binding !== snapshot.binding)
            return yield* refused("conflict")
          const receipt = yield* requests.commit(
            admitted.target,
            payload,
            (tx) =>
              Effect.gen(function* () {
                const row = yield* access.selected(tx, admitted, captured.attempt)
                if (
                  row.state !== "exchanging" ||
                  row.revision !== 3 ||
                  FabricIdentityEnvelope.binding(row) !== snapshot.binding
                )
                  return yield* refused("conflict")
                const now = yield* access.instant()
                if (now < row.time_created) return yield* refused("unavailable")
                if (now >= row.expires_at) return yield* refused("expired")
                const secret = yield* tx
                  .select()
                  .from(FabricIdentitySecretTable)
                  .where(eq(FabricIdentitySecretTable.id, row.id))
                  .get()
                if (
                  !secret ||
                  secret.revision !== 2 ||
                  secret.sealed !== snapshot.sealed ||
                  secret.bytes !== Buffer.byteLength(secret.sealed)
                )
                  return yield* refused("conflict")
                const used = yield* tx
                  .select({ count: count() })
                  .from(FabricConnectionTable)
                  .where(eq(FabricConnectionTable.storage_id, row.storage_id))
                  .get()
                const local = yield* tx
                  .select({ count: count() })
                  .from(FabricConnectionTable)
                  .where(
                    and(
                      eq(FabricConnectionTable.storage_id, row.storage_id),
                      eq(FabricConnectionTable.context_id, row.context_id),
                    ),
                  )
                  .get()
                if (!used || !local || used.count >= storeLimit || local.count >= contextLimit)
                  return yield* refused("limit")
                // The column mapper would seal this again. The fragment keeps the bytes prepared outside SQL.
                yield* tx
                  .insert(CredentialTable)
                  .values({
                    id: credentialID,
                    integration_id: integrationID,
                    label: "fabric-identity",
                    value: sql`${prepared.cacheSealed}` as never,
                    time_created: at,
                    time_updated: at,
                  })
                  .run()
                yield* tx
                  .insert(FabricConnectionTable)
                  .values({ ...prepared.row, sealed: prepared.sealed, bytes: Buffer.byteLength(prepared.sealed) })
                  .run()
                const updated = yield* tx
                  .update(FabricIdentityAttemptTable)
                  .set({ state: "completed", revision: 4 })
                  .where(
                    and(
                      eq(FabricIdentityAttemptTable.id, row.id),
                      eq(FabricIdentityAttemptTable.revision, 3),
                      eq(FabricIdentityAttemptTable.state, "exchanging"),
                    ),
                  )
                  .returning({ id: FabricIdentityAttemptTable.id, revision: FabricIdentityAttemptTable.revision })
                  .get()
                if (!updated) return yield* refused("conflict")
                const removed = yield* tx
                  .delete(FabricIdentitySecretTable)
                  .where(
                    and(
                      eq(FabricIdentitySecretTable.id, row.id),
                      eq(FabricIdentitySecretTable.revision, 2),
                      eq(FabricIdentitySecretTable.sealed, snapshot.sealed),
                    ),
                  )
                  .returning({ id: FabricIdentitySecretTable.id })
                  .get()
                if (!removed) return yield* refused("conflict")
                yield* access.guard(tx, admitted)
                return {
                  attempt: { id: updated.id, revision: updated.revision },
                  connection: { id: connectionID, generation: 1 as const },
                  profileHash: access.profileHash,
                }
              }),
            (tx) => access.guard(tx, admitted),
          )
          return yield* reopen(access, cipher, admitted, captured.attempt.id, receipt.data)
        }),
      )
    }

    const get: FabricIdentityPublicationContract.Interface["get"] = (supplied) => {
      const decoded = Schema.decodeUnknownOption(FabricConnection.Selection)(supplied)
      return storageErrors(
        Effect.gen(function* () {
          if (
            Option.isNone(decoded) ||
            !Number.isSafeInteger(decoded.value.context.generation) ||
            !Number.isSafeInteger(decoded.value.connection.generation) ||
            (yield* access.inTransaction)
          )
            return yield* refused("invalid-input")
          const value = decoded.value
          const admitted = yield* access.admit(value.context, "fabric.identity.inspect", {
            kind: "fabric.connection",
            id: value.connection.id,
          })
          const row = yield* access.database.db
            .select()
            .from(FabricConnectionTable)
            .where(eq(FabricConnectionTable.id, value.connection.id))
            .get()
          if (
            !row ||
            row.storage_id !== access.storageID ||
            row.principal !== admitted.binding.principal ||
            row.context_id !== admitted.info.context.id ||
            row.context_generation !== admitted.info.context.generation ||
            row.profile_hash !== access.profileHash
          )
            return yield* refused("denied")
          if (row.generation !== value.connection.generation) return yield* refused("conflict")
          yield* access.guard(access.database.db, admitted)
          return yield* open(access, cipher, admitted, row)
        }),
      )
    }

    return Object.freeze({ publish, get }) satisfies FabricIdentityPublicationContract.Interface
  })

function capture(supplied: unknown) {
  if (!supplied || typeof supplied !== "object" || Object.keys(supplied).length !== 3) return
  const record = supplied as {
    context?: unknown
    attempt?: unknown
    completion?: FabricIdentityExchangeContract.Completion
  }
  if (!("context" in record) || !("attempt" in record) || !("completion" in record)) return
  const decoded = Schema.decodeUnknownOption(FabricIdentityAttempt.Selection)({
    context: record.context,
    attempt: record.attempt,
  })
  if (
    Option.isNone(decoded) ||
    !Number.isSafeInteger(decoded.value.context.generation) ||
    !Number.isSafeInteger(decoded.value.attempt.revision)
  )
    return
  return {
    context: { ...decoded.value.context },
    attempt: { ...decoded.value.attempt },
    completion: record.completion,
  }
}

function current(
  access: Effect.Success<ReturnType<typeof FabricIdentityAttemptAccess.make>>,
  admitted: FabricIdentityAttemptAccess.Admission,
  attempt: FabricIdentityAttempt.Ref,
  expected?: Readonly<{ binding: string; secret: string }>,
) {
  return Effect.gen(function* () {
    if (yield* access.inTransaction) return yield* refused("unavailable")
    const row = yield* access.selected(access.database.db, admitted, attempt)
    if (row.state !== "exchanging" || row.revision !== 3) return yield* refused("conflict")
    const at = yield* access.instant()
    if (at < row.time_created) return yield* refused("unavailable")
    if (at >= row.expires_at) return yield* refused("expired")
    const secret = yield* access.database.db
      .select()
      .from(FabricIdentitySecretTable)
      .where(eq(FabricIdentitySecretTable.id, row.id))
      .get()
    if (
      !secret ||
      secret.revision !== 2 ||
      !CredentialCipher.isSealed(secret.sealed) ||
      secret.bytes !== Buffer.byteLength(secret.sealed) ||
      Buffer.byteLength(secret.sealed) > 32768
    )
      return yield* refused("unavailable")
    const snapshot = {
      row,
      binding: FabricIdentityEnvelope.binding(row),
      secret: createHash("sha256").update(secret.sealed).digest("hex"),
      sealed: secret.sealed,
    }
    if (expected && (expected.binding !== snapshot.binding || expected.secret !== snapshot.secret))
      return yield* refused("conflict")
    yield* access.guard(access.database.db, admitted)
    return snapshot
  })
}

function accept(
  candidate: FabricIdentityMsalContract.Candidate,
  clientID: string,
  scopes: FabricIdentityAttempt.Scopes,
) {
  const decoded = Schema.decodeUnknownOption(Credential.Cache)({
    type: "cache",
    methodID,
    format: candidate.cache?.format,
    version: candidate.cache?.version,
    serialized: candidate.cache?.serialized,
  })
  if (
    Option.isNone(decoded) ||
    candidate.account?.environment !== "login.microsoftonline.com" ||
    candidate.proof?.clientID !== clientID ||
    candidate.account.tenantID !== candidate.proof.tenantID ||
    candidate.account.objectID !== candidate.proof.objectID ||
    Option.isNone(Schema.decodeUnknownOption(uuid)(candidate.account.tenantID)) ||
    Option.isNone(Schema.decodeUnknownOption(uuid)(candidate.account.objectID)) ||
    Option.isNone(Schema.decodeUnknownOption(homeAccountID)(candidate.account.homeAccountID)) ||
    decoded.value.format !== "msal-node" ||
    decoded.value.version !== 1
  )
    return
  return {
    tenantID: candidate.account.tenantID,
    objectID: candidate.account.objectID,
    homeAccountID: candidate.account.homeAccountID,
    scopes,
    cache: decoded.value,
  }
}

function seal(
  cipher: CredentialCipher.Interface,
  input: Readonly<{
    row: Omit<typeof FabricConnectionTable.$inferInsert, "sealed" | "bytes">
    attemptID: FabricIdentityAttempt.ID
    tenantID: string
    objectID: string
    homeAccountID: string
    scopes: FabricIdentityAttempt.Scopes
    cache: string
  }>,
) {
  return Effect.try({
    try: () => {
      if (Buffer.byteLength(input.cache) > 1048576 + 1024) throw refused("unavailable")
      const cacheSealed = cipher.seal(input.cache)
      if (!CredentialCipher.isSealed(cacheSealed)) throw refused("unavailable")
      const hash = createHash("sha256").update(cacheSealed).digest("hex")
      const plain = JSON.stringify({
        domain: "orchestra:fabric-connection",
        version: 1,
        binding: connectionBinding({ ...input, cacheHash: hash }),
        attemptID: input.attemptID,
        tenantID: input.tenantID,
        objectID: input.objectID,
        homeAccountID: input.homeAccountID,
        cloud: "public",
        scopes: input.scopes,
        cacheHash: hash,
      })
      if (Buffer.byteLength(plain) > 16384) throw refused("limit")
      const sealed = cipher.seal(plain)
      if (!CredentialCipher.isSealed(sealed) || Buffer.byteLength(sealed) > 32768) throw refused("unavailable")
      return { row: input.row, cacheSealed, sealed }
    },
    catch: (error) => (error instanceof FabricConnection.Failure ? error : refused("unavailable")),
  })
}

function reopen(
  access: Effect.Success<ReturnType<typeof FabricIdentityAttemptAccess.make>>,
  cipher: CredentialCipher.Interface,
  admitted: FabricIdentityAttemptAccess.Admission,
  attemptID: FabricIdentityAttempt.ID,
  data: unknown,
) {
  return Effect.gen(function* () {
    const decoded = decodeReceipt(data)
    if (Option.isNone(decoded) || decoded.value.profileHash !== access.profileHash) return yield* refused("unavailable")
    const row = yield* access.database.db
      .select()
      .from(FabricConnectionTable)
      .where(eq(FabricConnectionTable.id, decoded.value.connection.id))
      .get()
    if (!row || row.generation !== decoded.value.connection.generation) return yield* refused("unavailable")
    const info = yield* open(access, cipher, admitted, row)
    const attempt = yield* access.database.db
      .select()
      .from(FabricIdentityAttemptTable)
      .where(eq(FabricIdentityAttemptTable.id, attemptID))
      .get()
    if (!attempt || attempt.state !== "completed" || attempt.revision !== decoded.value.attempt.revision)
      return yield* refused("unavailable")
    const envelope = yield* readEnvelope(cipher, row)
    if (Option.isNone(envelope) || envelope.value.attemptID !== attemptID) return yield* refused("unavailable")
    yield* access.guard(access.database.db, admitted)
    return Object.freeze({ attempt: decoded.value.attempt, connection: decoded.value.connection })
  })
}

function open(
  access: Effect.Success<ReturnType<typeof FabricIdentityAttemptAccess.make>>,
  cipher: CredentialCipher.Interface,
  admitted: FabricIdentityAttemptAccess.Admission,
  row: typeof FabricConnectionTable.$inferSelect,
) {
  return Effect.gen(function* () {
    if (
      row.directory !== admitted.info.location.directory ||
      row.project_id !== admitted.info.location.project.id ||
      row.project_directory !== admitted.info.location.project.directory ||
      row.bytes !== Buffer.byteLength(row.sealed) ||
      !CredentialCipher.isSealed(row.sealed)
    )
      return yield* refused("unavailable")
    const envelope = yield* readEnvelope(cipher, row)
    if (Option.isNone(envelope)) return yield* refused("unavailable")
    const stored = yield* access.database.db
      .select({ sealed: sql<string>`${CredentialTable.value}` })
      .from(CredentialTable)
      .where(eq(CredentialTable.id, row.credential_id))
      .get()
    if (!stored || typeof stored.sealed !== "string" || !CredentialCipher.isSealed(stored.sealed))
      return yield* refused("unavailable")
    const hash = createHash("sha256").update(stored.sealed).digest("hex")
    const expected = connectionBinding({
      row,
      attemptID: envelope.value.attemptID,
      tenantID: envelope.value.tenantID,
      objectID: envelope.value.objectID,
      homeAccountID: envelope.value.homeAccountID,
      scopes: envelope.value.scopes,
      cacheHash: hash,
    })
    if (!same(envelope.value.binding, expected) || !same(envelope.value.cacheHash, hash))
      return yield* refused("unavailable")
    const attempt = yield* access.database.db
      .select()
      .from(FabricIdentityAttemptTable)
      .where(eq(FabricIdentityAttemptTable.id, envelope.value.attemptID))
      .get()
    if (
      !attempt ||
      attempt.state !== "completed" ||
      attempt.revision !== 4 ||
      attempt.context_id !== row.context_id ||
      attempt.profile_hash !== row.profile_hash ||
      attempt.scopes !== JSON.stringify(envelope.value.scopes)
    )
      return yield* refused("unavailable")
    return Object.freeze({
      connection: { id: row.id, generation: row.generation },
      context: { id: row.context_id, generation: row.context_generation },
      state: "connected" as const,
      cloud: "public" as const,
      tenantID: envelope.value.tenantID,
      objectID: envelope.value.objectID,
      homeAccountID: envelope.value.homeAccountID,
      scopes: envelope.value.scopes,
    })
  })
}

function readEnvelope(cipher: CredentialCipher.Interface, row: typeof FabricConnectionTable.$inferSelect) {
  return Effect.try({
    try: () => {
      const plain = cipher.open(row.sealed)
      if (plain === undefined || Buffer.byteLength(plain) > 16384) return Option.none()
      return decodeEnvelope(plain)
    },
    catch: () => refused("unavailable"),
  })
}

function connectionBinding(
  input: Readonly<{
    row: Pick<
      typeof FabricConnectionTable.$inferSelect,
      | "storage_id"
      | "principal"
      | "context_id"
      | "context_generation"
      | "directory"
      | "project_id"
      | "project_directory"
      | "profile_hash"
      | "id"
      | "generation"
      | "credential_id"
      | "time_created"
    >
    attemptID: string
    tenantID: string
    objectID: string
    homeAccountID: string
    scopes: FabricIdentityAttempt.Scopes
    cacheHash: string
  }>,
) {
  return JSON.stringify([
    input.row.storage_id,
    input.row.principal,
    input.row.context_id,
    input.row.context_generation,
    input.row.directory,
    input.row.project_id,
    input.row.project_directory,
    input.row.profile_hash,
    input.row.id,
    input.row.generation,
    input.row.credential_id,
    input.attemptID,
    input.tenantID,
    input.objectID,
    input.homeAccountID,
    "public",
    JSON.stringify(input.scopes),
    input.cacheHash,
    input.row.time_created,
  ])
}

function same(left: string, right: string) {
  const first = Buffer.from(left)
  const second = Buffer.from(right)
  return first.length === second.length && timingSafeEqual(first, second)
}

function storageErrors<A, R>(
  effect: Effect.Effect<A, FabricIdentityPublicationContract.Error | SqlError | EffectDrizzleQueryError, R>,
) {
  return Effect.mapError(effect, (error) =>
    error instanceof SqlError || error instanceof EffectDrizzleQueryError ? refused("unavailable") : error,
  )
}

function refused(code: FabricConnection.Failure["code"]) {
  const message = {
    "invalid-input": "Fabric identity publication input is invalid",
    denied: "Fabric identity publication is denied",
    expired: "Fabric identity publication has expired",
    conflict: "Fabric identity publication conflicts with stored state",
    unavailable: "Fabric identity publication is unavailable",
    limit: "Fabric identity publication limit was reached",
  }[code]
  return new FabricConnection.Failure({ code, message })
}
