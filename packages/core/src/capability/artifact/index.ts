export * as CapabilityArtifacts from "./index"

import { randomUUID } from "node:crypto"
import { isAbsolute, join } from "node:path"
import { and, desc, eq, lt, sql } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, Option, Schema } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { Capability } from "@orchestra/schema/capability"
import { SessionID } from "@orchestra/schema/session-id"
import { Database } from "../../database/database"
import { FSUtil } from "../../fs-util"
import { Global } from "../../global"
import { Location } from "../../location"
import { SessionStore } from "../../session/store"
import type { Tool } from "../../tool/tool"
import { CapabilityInvocation } from "../invocation"
import { CapabilityPolicy } from "../policy"
import { CapabilityArtifactPinTable, CapabilityArtifactReferenceTable, CapabilityArtifactTable } from "../sql"
import { ArtifactBlobs } from "./blob"
import { Failure, failure } from "./error"
import { matchesMime, validMime } from "./mime"

export { Failure }

// Fixture adapters may omit storageID. Persistent DB providers must supply it: object identity cannot survive reopening.
const identities = new WeakMap<Database.Interface["db"], string>()

export type Input = {
  readonly data: Uint8Array
  readonly mime: string
  readonly kind: string
  readonly verification: Capability.Verification
  readonly metadata: Schema.Json
}

/** Additional native actions supplied only by trusted canonical producers, never model data. */
export type Requirements = readonly { action: string; resources: readonly string[] }[]

export type Options = {
  readonly boundedBytes?: number
  /** Logical committed raw + UTF-8 JSON bytes per placement, not a physical disk/orphan-burst cap. */
  readonly quota?: number
  /** Trusted host fixture override; never accepted through a model-facing input. */
  readonly root?: string
  /** Unreferenced revisions, orphan blobs and staging files survive this many milliseconds. */
  readonly scratchTTL?: number
}

export type Record = typeof CapabilityArtifactTable.$inferSelect
type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

export const make = (options: Options = {}) => Effect.gen(function* () {
  const database = yield* Database.Service
  const location = yield* Location.Service
  const sessions = yield* SessionStore.Service
  const fs = yield* FSUtil.Service
  const global = yield* Global.Service
  const policy = yield* CapabilityPolicy.make
  const boundedBytes = options.boundedBytes ?? 16 * 1024 * 1024
  const quota = options.quota ?? 256 * 1024 * 1024
  const scratchTTL = options.scratchTTL ?? 24 * 60 * 60 * 1000
  const storageID = database.storageID ?? databaseIdentity(database.db)
  const root = options.root ?? join(global.data, "capability-artifacts", ArtifactBlobs.hash(storageID))
  if (![boundedBytes, quota, scratchTTL].every((n) => Number.isSafeInteger(n) && n > 0) || !isAbsolute(root))
    return yield* failure("invalid_input", "Artifact store options are invalid")
  const blobs = ArtifactBlobs.make({ root, boundedBytes, storageID, fs })
  const placement = {
    projectID: location.project.id,
    location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
  }

  // Repeat persisted identity validation under the storage transaction, without opening an approval queue there.
  const binding = Effect.fn("CapabilityArtifacts.binding")(function* (context: Tool.Context) {
    const issued = yield* CapabilityInvocation.require(context, placement)
    const session = yield* sessions.get(context.sessionID)
    const stored = yield* sessions.message(context.assistantMessageID)
    if (!session || session.projectID !== issued.owner.projectID ||
      session.location.directory !== issued.owner.location.directory ||
      session.location.workspaceID !== issued.owner.location.workspaceID ||
      !stored || stored.sessionID !== context.sessionID || stored.message.type !== "assistant" ||
      stored.message.agent !== context.agent || !stored.message.content.some((part) =>
        part.type === "tool" && part.id === context.toolCallID && part.name === issued.rootToolName &&
        (part.state.status === "pending" || part.state.status === "running")))
      return yield* new Capability.Failure({
        code: "invocation_binding_mismatch", message: "Capability invocation binding does not match",
      })
    return issued
  })

  const authorize = Effect.fn("CapabilityArtifacts.authorize")(function* (
    context: Tool.Context, action: string, resources: readonly string[],
  ) {
    yield* binding(context)
    return yield* policy.authorize(context, { action, resources })
  })

  const resolve = Effect.fn("CapabilityArtifacts.resolve")(function* (
    tx: Transaction, context: Tool.Context, ref: Capability.ArtifactRef,
  ) {
    const issued = yield* binding(context)
    const record = yield* tx.select().from(CapabilityArtifactTable).where(key(ref)).get()
    const reference = yield* tx.select().from(CapabilityArtifactReferenceTable).where(referenceKey(ref, context.sessionID)).get()
    if (!record || !reference) return yield* failure("artifact_not_found", "Artifact reference is unavailable")
    if (!samePlacement(record.owner, issued.owner)) return yield* denied()
    const pinned = yield* tx.select().from(CapabilityArtifactPinTable).where(pinKey(ref, context.sessionID)).get()
    return { record, reference, issued, pinned: reference.pinned || !!pinned }
  })

  const store = Effect.fn("CapabilityArtifacts.store")(function* (
    tx: Transaction, context: Tool.Context, ref: Capability.ArtifactRef, input: Input,
  ) {
    const issued = yield* binding(context)
    const rows = yield* tx.select().from(CapabilityArtifactTable)
    const used = rows.filter((row) => samePlacement(row.owner, issued.owner))
      .reduce((n, row) => n + row.bytes + jsonBytes(row.metadata), 0)
    if (used + input.data.byteLength + jsonBytes(input.metadata) > quota) return yield* quotaFailure()
    // Policy holds actor state before the SQLite writer; GC cannot remove publication before insertion.
    const hash = yield* blobs.publish(input.data, input.mime)
    const record: Record = {
      ...ref, owner: issued.owner, producer: issued.invocation, mime: input.mime, kind: input.kind,
      verification: input.verification, metadata: input.metadata, hash, bytes: input.data.byteLength, time_created: Date.now(),
    }
    // Drizzle treats JS null as SQL NULL even in a JSON column. Keep JSON null as the non-null JSON text "null".
    yield* tx.insert(CapabilityArtifactTable).values({ ...record, metadata: sql`${JSON.stringify(input.metadata)}` }).run()
    yield* tx.insert(CapabilityArtifactReferenceTable).values({
      artifact_id: ref.id, revision: ref.revision, session_id: context.sessionID,
    }).run()
    return ref
  })

  const publish = Effect.fn("CapabilityArtifacts.publish")(function* (context: Tool.Context, input: Input, requirements: Requirements = []) {
    const required = requirements.map((input) => ({ action: input.action, resources: [...input.resources] }))
    yield* binding(context)
    const value = yield* snapshot(input, boundedBytes)
    const ref = Capability.ArtifactRef.make({ id: Capability.ArtifactID.create(), revision: 0 })
    const permit = yield* authorize(context, "artifact.write", [resource(ref)])
    const native = yield* Effect.forEach(required, (input) => policy.authorize(context, input))
    return yield* policy.commitMany([permit, ...native], (tx) => store(tx, context, ref, value))
      .pipe(storageErrors)
  })

  const update = Effect.fn("CapabilityArtifacts.update")(function* (
    context: Tool.Context, expectedRef: Capability.ArtifactRef, input: Input, requirements: Requirements = [],
  ) {
    const required = requirements.map((input) => ({ action: input.action, resources: [...input.resources] }))
    const ref = yield* requireRef(expectedRef)
    yield* binding(context)
    const value = yield* snapshot(input, boundedBytes)
    const permit = yield* authorize(context, "artifact.write", [resource(ref)])
    const native = yield* Effect.forEach(required, (input) => policy.authorize(context, input))
    return yield* policy.commitMany([permit, ...native], (tx) => Effect.gen(function* () {
      yield* resolve(tx, context, ref)
      const latest = yield* tx.select().from(CapabilityArtifactTable).where(eq(CapabilityArtifactTable.id, ref.id))
        .orderBy(desc(CapabilityArtifactTable.revision)).get()
      if (!latest || latest.revision !== ref.revision || !Number.isSafeInteger(ref.revision + 1))
        return yield* failure("revision_conflict", "Artifact revision no longer matches")
      return yield* store(tx, context, Capability.ArtifactRef.make({ id: ref.id, revision: ref.revision + 1 }), value)
    })).pipe(storageErrors)
  })

  /** Host-only byte access. Model adapters should expose describe, never paths or this result. */
  const read = Effect.fn("CapabilityArtifacts.read")(function* (context: Tool.Context, supplied: Capability.ArtifactRef) {
    const ref = yield* requireRef(supplied)
    const permit = yield* authorize(context, "artifact.read", [resource(ref)])
    return yield* policy.commit(permit, (tx) => Effect.gen(function* () {
      const found = yield* resolve(tx, context, ref)
      return { metadata: found.record, data: yield* blobs.read(
        found.record.hash, found.record.bytes, found.record.mime,
      ) }
    })).pipe(storageErrors)
  })

  const describe = Effect.fn("CapabilityArtifacts.describe")(function* (context: Tool.Context, supplied: Capability.ArtifactRef) {
    const ref = yield* requireRef(supplied)
    const permit = yield* authorize(context, "artifact.read", [resource(ref)])
    return yield* policy.commit(permit, (tx) => Effect.gen(function* () {
      const found = yield* resolve(tx, context, ref)
      yield* blobs.read(found.record.hash, found.record.bytes, found.record.mime)
      // User metadata and producer/owner placement are host-only; arbitrary metadata may contain secrets.
      return {
        id: found.record.id, revision: found.record.revision, mime: found.record.mime, kind: found.record.kind,
        hash: found.record.hash, bytes: found.record.bytes, verification: found.record.verification,
        timeCreated: found.record.time_created, pinned: found.pinned,
      }
    })).pipe(storageErrors)
  })

  const share = Effect.fn("CapabilityArtifacts.share")(function* (
    context: Tool.Context, supplied: Capability.ArtifactRef, targetSessionID: SessionID,
  ) {
    const ref = yield* requireRef(supplied)
    const target = Schema.decodeUnknownOption(SessionID)(targetSessionID)
    if (Option.isNone(target)) return yield* failure("invalid_input", "Artifact target Session is invalid")
    const permit = yield* authorize(context, "artifact.share", [resource(ref), `session:${target.value}`])
    yield* policy.commit(permit, (tx) => Effect.gen(function* () {
      const found = yield* resolve(tx, context, ref)
      const session = yield* sessions.get(target.value)
      if (!session || session.projectID !== found.issued.owner.projectID ||
        session.location.directory !== found.issued.owner.location.directory ||
        session.location.workspaceID !== found.issued.owner.location.workspaceID) return yield* denied()
      yield* tx.insert(CapabilityArtifactReferenceTable).values({
        artifact_id: ref.id, revision: ref.revision, session_id: target.value,
      }).onConflictDoNothing().run()
    })).pipe(storageErrors)
  })

  const pin = Effect.fn("CapabilityArtifacts.pin")(function* (
    context: Tool.Context, supplied: Capability.ArtifactRef, pinned: boolean,
  ) {
    const ref = yield* requireRef(supplied)
    if (typeof pinned !== "boolean") return yield* failure("invalid_input", "Artifact pin is invalid")
    const permit = yield* authorize(context, "artifact.write", [resource(ref)])
    yield* policy.commit(permit, (tx) => Effect.gen(function* () {
      const found = yield* resolve(tx, context, ref)
      if (pinned) yield* tx.insert(CapabilityArtifactPinTable).values({
        artifact_id: ref.id, revision: ref.revision, session_id: context.sessionID, owner: found.issued.owner,
      }).onConflictDoNothing().run()
      if (!pinned) yield* tx.delete(CapabilityArtifactPinTable).where(pinKey(ref, context.sessionID)).run()
      yield* tx.update(CapabilityArtifactReferenceTable).set({ pinned }).where(referenceKey(ref, context.sessionID)).run()
    })).pipe(storageErrors)
  })

  const deleteReference = Effect.fn("CapabilityArtifacts.deleteReference")(function* (
    context: Tool.Context, supplied: Capability.ArtifactRef,
  ) {
    const ref = yield* requireRef(supplied)
    const permit = yield* authorize(context, "artifact.write", [resource(ref)])
    yield* policy.commit(permit, (tx) => Effect.gen(function* () {
      const found = yield* resolve(tx, context, ref)
      if (found.pinned) return yield* failure("reference_pinned", "Artifact reference must be unpinned before deletion")
      yield* tx.delete(CapabilityArtifactReferenceTable).where(referenceKey(ref, context.sessionID)).run()
    })).pipe(storageErrors)
  })

  /** Host-only GC. A linked revision keeps the entire immutable revision chain, including its CAS head. */
  const cleanup = Effect.fn("CapabilityArtifacts.cleanup")(function* () {
    yield* database.db.transaction((tx) => Effect.gen(function* () {
      const cutoff = Date.now() - scratchTTL
      const refs = yield* tx.select().from(CapabilityArtifactReferenceTable)
      const pins = yield* tx.select().from(CapabilityArtifactPinTable)
      const linked = new Set([...refs, ...pins].map((ref) => ref.artifact_id))
      const records = yield* tx.select().from(CapabilityArtifactTable)
      yield* Effect.forEach(records.filter((row) => !linked.has(row.id) && row.time_created < cutoff),
        (row) => tx.delete(CapabilityArtifactTable).where(and(key(row), lt(CapabilityArtifactTable.time_created, cutoff))).run())
      const retained = new Set((yield* tx.select({ hash: CapabilityArtifactTable.hash }).from(CapabilityArtifactTable))
        .map((row) => row.hash))
      yield* blobs.cleanup(retained, cutoff)
    }), { behavior: "immediate" }).pipe(storageErrors,
      Effect.catchTag("PlatformError", () => Effect.fail(failure("artifact_io_failed", "Artifact cleanup failed"))))
  })

  return { publish, update, read, describe, share, pin, deleteReference, cleanup }
})

function storageErrors<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(Effect.catchIf(
    (error): error is Extract<E, SqlError | EffectDrizzleQueryError> =>
      error instanceof SqlError || error instanceof EffectDrizzleQueryError,
    () => Effect.fail(failure("artifact_storage_failed", "Artifact storage transaction failed")),
  ))
}

function denied() {
  return new Capability.Failure({ code: "target_denied", message: "Capability action is not authorized" })
}

function quotaFailure() {
  return new Capability.Failure({ code: "quota_exceeded", message: "Artifact byte budget exceeded" })
}

function resource(ref: Capability.ArtifactRef) {
  return `artifact:${ref.id}:${ref.revision}`
}

function key(ref: Capability.ArtifactRef) {
  return and(eq(CapabilityArtifactTable.id, ref.id), eq(CapabilityArtifactTable.revision, ref.revision))
}

function referenceKey(ref: Capability.ArtifactRef, sessionID: SessionID) {
  return and(eq(CapabilityArtifactReferenceTable.artifact_id, ref.id),
    eq(CapabilityArtifactReferenceTable.revision, ref.revision), eq(CapabilityArtifactReferenceTable.session_id, sessionID))
}

function pinKey(ref: Capability.ArtifactRef, sessionID: SessionID) {
  return and(eq(CapabilityArtifactPinTable.artifact_id, ref.id),
    eq(CapabilityArtifactPinTable.revision, ref.revision), eq(CapabilityArtifactPinTable.session_id, sessionID))
}

function databaseIdentity(db: Database.Interface["db"]) {
  const current = identities.get(db)
  if (current) return current
  const id = randomUUID()
  identities.set(db, id)
  return id
}

function samePlacement(left: Capability.Owner, right: Capability.Owner) {
  return left.projectID === right.projectID && left.location.directory === right.location.directory &&
    left.location.workspaceID === right.location.workspaceID
}

function requireRef(input: Capability.ArtifactRef) {
  const ref = Schema.decodeUnknownOption(Capability.ArtifactRef)(input)
  return Option.isSome(ref) ? Effect.succeed(ref.value) : Effect.fail(failure("invalid_input", "Artifact reference is invalid"))
}

function jsonBytes(value: Schema.Json) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function snapshot(input: Input, boundedBytes: number) {
  return Effect.try({
    try: () => {
      if (!(input.data instanceof Uint8Array) || !validMime(input.mime) || typeof input.kind !== "string" || !input.kind.trim() ||
        new TextEncoder().encode(input.kind).byteLength > 256 ||
        Option.isNone(Schema.decodeUnknownOption(Capability.Verification)(input.verification)))
        throw failure("invalid_input", "Artifact input is invalid")
      if (input.data.byteLength > boundedBytes) throw quotaFailure()
      // A JSON round trip captures immutable caller data. Non-finite numbers and cycles are rejected, not normalized.
      const metadata = JSON.stringify(input.metadata, (_, value: unknown) => {
        if (typeof value === "number" && !Number.isFinite(value)) throw failure("invalid_input", "Artifact metadata is invalid")
        if (value === undefined || typeof value === "bigint" || typeof value === "function" || typeof value === "symbol")
          throw failure("invalid_input", "Artifact metadata is invalid")
        return value
      })
      if (new TextEncoder().encode(metadata).byteLength > Math.min(boundedBytes, 64 * 1024)) throw quotaFailure()
      const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(metadata)
      if (Option.isNone(decoded)) throw failure("invalid_input", "Artifact metadata is invalid")
      const json = Schema.decodeUnknownOption(Schema.Json)(decoded.value)
      if (Option.isNone(json)) throw failure("invalid_input", "Artifact metadata is invalid")
      // Buffer.slice() aliases caller memory; the Uint8Array constructor always copies it.
      const data = new Uint8Array(input.data)
      if (!matchesMime(data, input.mime)) throw failure("invalid_input", "Artifact bytes do not match MIME")
      return { data, mime: input.mime, kind: input.kind, verification: input.verification, metadata: json.value }
    },
    catch: (error) => error instanceof Failure || error instanceof Capability.Failure
      ? error : failure("invalid_input", "Artifact input is invalid"),
  })
}
