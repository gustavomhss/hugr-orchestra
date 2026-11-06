export * as FabricRecords from "./record"

import { FabricRecord } from "@orchestra/schema/fabric-record"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { PositiveInt, optional } from "@orchestra/schema/schema"
import { CredentialCipher } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { and, asc, count, eq, gt, sql } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, Option, Schema } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import path from "node:path"
import type { FabricRecordsContract } from "./record-contract"
import { FabricContexts } from "./context"
import { FabricContextTable } from "./context/sql"
import { FabricRecordTable } from "./record/sql"

const defaults = {
  payloadBytes: 256 * 1024,
  contextBytes: 256 * 1024 * 1024,
  storeBytes: 1024 * 1024 * 1024,
  records: 100000,
}
const metadataBytes = 4096
const Selection = Schema.Struct({ context: FabricContext.Ref, record: FabricRecord.Ref })
const Write = Schema.Struct({
  context: FabricContext.Ref,
  id: FabricRecord.ID,
  kind: FabricRecord.Kind,
  expected: Schema.NullOr(PositiveInt),
  payload: Schema.String,
  metadata: optional(Schema.String),
})
const Envelope = Schema.Struct({
  domain: Schema.Literal("orchestra:fabric-record"),
  version: Schema.Literal(1),
  storageID: Schema.String,
  principal: Schema.String,
  contextID: FabricContext.ID,
  contextGeneration: PositiveInt,
  recordID: FabricRecord.ID,
  kind: FabricRecord.Kind,
  revision: PositiveInt,
  payload: Schema.String,
  metadata: optional(Schema.String),
})
const decodeEnvelope = Schema.decodeUnknownOption(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Envelope)))
type Row = typeof FabricRecordTable.$inferSelect
type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
type Admission = Readonly<{
  binding: CapabilityOperatorContract.Binding
  target: CapabilityOperatorContract.Target
  info: FabricContext.Info
}>

/** Private server-side storage seam. No consumer or remote operation is activated by constructing it. */
export const make: FabricRecordsContract.Factory = (options) => {
  const operators = Object.freeze({ ...options.operators })
  const root = options.root
  const limits = { ...defaults, ...options.limits }
  return Effect.gen(function* () {
    if (
      Object.keys(limits).some((key) => !(key in defaults)) ||
      Object.entries(defaults).some(([key, maximum]) => {
        const value = limits[key as keyof typeof defaults]
        return !Number.isSafeInteger(value) || value < 1 || value > maximum
      })
    )
      return yield* failure("invalid-input")
    const database = yield* Database.Service
    const cipher = yield* CredentialCipher.Service
    const storageID = database.storageID
    if (!storageID || !database.inTransaction) return yield* failure("unavailable")
    const inTransaction = database.inTransaction
    if (yield* inTransaction) return yield* failure("unavailable")
    const contexts = yield* FabricContexts.make({ operators, root })

    function admit(context: FabricContext.Ref, resource: CapabilityOperatorContract.Resource, action: string) {
      return Effect.gen(function* () {
        // Context resolution does filesystem observation; never execute it under ambient SQL.
        if (yield* inTransaction) return yield* failure("unavailable")
        const info = yield* contexts.resolve(context)
        const target = {
          action,
          placement: { projectID: info.location.project.id, location: { directory: info.location.directory } },
          resource,
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
          row.project_directory !== admitted.info.location.project.directory
        )
          return yield* failure("unavailable")
        // Root was canonicalized by FabricContexts outside SQL, not taken from a request.
        if (
          row.root !== path.dirname(admitted.info.location.directory) ||
          row.directory !== path.join(row.root, row.id)
        )
          return yield* failure("unavailable")
        yield* operators.validate(admitted.binding, admitted.target)
      })
    }

    function owned(row: Row, admitted: Admission, kind: FabricRecord.Kind, revision: number | null) {
      if (
        row.storage_id !== storageID ||
        row.principal !== admitted.binding.principal ||
        row.context_id !== admitted.info.context.id ||
        row.context_generation !== admitted.info.context.generation
      )
        return failure("denied")
      if (row.deleted) return failure("expired")
      if (row.kind !== kind || row.revision !== revision) return failure("conflict")
      if (!Number.isSafeInteger(row.revision) || row.revision < 1) return failure("unavailable")
    }

    function open(row: Row, admitted: Admission) {
      return Effect.gen(function* () {
        // Bound the encrypted input before allocating/decoding it; JSON string escaping can expand payload sixfold.
        if (
          !row.sealed ||
          !CredentialCipher.isSealed(row.sealed) ||
          Buffer.byteLength(row.sealed) > 8 * (defaults.payloadBytes + metadataBytes) + 16384 ||
          row.bytes !== Buffer.byteLength(row.sealed)
        )
          return yield* failure("unavailable")
        yield* operators.validate(admitted.binding, admitted.target)
        const plain = yield* Effect.try({ try: () => cipher.open(row.sealed!), catch: () => failure("unavailable") })
        const decoded = decodeEnvelope(plain)
        if (Option.isNone(decoded)) return yield* failure("unavailable")
        const envelope = decoded.value
        if (
          envelope.storageID !== storageID ||
          envelope.principal !== admitted.binding.principal ||
          envelope.contextID !== admitted.info.context.id ||
          envelope.contextGeneration !== admitted.info.context.generation ||
          envelope.recordID !== row.id ||
          envelope.kind !== row.kind ||
          envelope.revision !== row.revision
        )
          return yield* failure("unavailable")
        if (Buffer.byteLength(envelope.payload) > limits.payloadBytes) return yield* failure("limit")
        if (envelope.metadata !== undefined && Buffer.byteLength(envelope.metadata) > metadataBytes)
          return yield* failure("unavailable")
        yield* operators.validate(admitted.binding, admitted.target)
        return {
          payload: envelope.payload,
          ...(envelope.metadata === undefined ? {} : { metadata: envelope.metadata }),
        }
      })
    }

    function selected(tx: Transaction, admitted: Admission, ref: FabricRecord.Ref) {
      return Effect.gen(function* () {
        yield* guard(tx, admitted)
        const row = yield* tx.select().from(FabricRecordTable).where(eq(FabricRecordTable.id, ref.id)).get()
        if (!row) return yield* failure("denied")
        const problem = owned(row, admitted, ref.kind, ref.revision)
        if (problem) return yield* problem
        return row
      })
    }

    const list: FabricRecordsContract.Interface["list"] = (supplied) =>
      storageErrors(
        Effect.gen(function* () {
          const input = Schema.decodeUnknownOption(FabricRecord.Query)(supplied)
          if (Option.isNone(input)) return yield* failure("invalid-input")
          const value = input.value
          const admitted = yield* admit(
            value.context,
            { kind: "fabric.context", id: value.context.id },
            "fabric.record.list",
          )
          const page = yield* database.db.transaction(
            (tx) =>
              Effect.gen(function* () {
                yield* guard(tx, admitted)
                const limit = value.limit ?? 16
                const rows = yield* tx
                  .select({
                    id: FabricRecordTable.id,
                    kind: FabricRecordTable.kind,
                    revision: FabricRecordTable.revision,
                  })
                  .from(FabricRecordTable)
                  .where(
                    and(
                      eq(FabricRecordTable.storage_id, storageID),
                      eq(FabricRecordTable.principal, admitted.binding.principal),
                      eq(FabricRecordTable.context_id, value.context.id),
                      eq(FabricRecordTable.context_generation, value.context.generation),
                      eq(FabricRecordTable.kind, value.kind),
                      eq(FabricRecordTable.deleted, false),
                      value.after === undefined ? undefined : gt(FabricRecordTable.id, value.after),
                    ),
                  )
                  .orderBy(asc(FabricRecordTable.id))
                  .limit(limit + 1)
                  .all()
                const items = rows.slice(0, limit)
                const decoded = Schema.decodeUnknownOption(FabricRecord.Page)({
                  items,
                  ...(rows.length > limit ? { after: items[items.length - 1]!.id } : {}),
                })
                if (Option.isNone(decoded) || items.some((item) => !Number.isSafeInteger(item.revision)))
                  return yield* failure("unavailable")
                yield* guard(tx, admitted)
                return decoded.value
              }),
            { behavior: "immediate" },
          )
          yield* guard(database.db, admitted)
          return page
        }),
      )

    const get: FabricRecordsContract.Interface["get"] = (supplied) =>
      storageErrors(
        Effect.gen(function* () {
          const input = Schema.decodeUnknownOption(Selection)(supplied, { onExcessProperty: "error" })
          if (Option.isNone(input) || !Number.isSafeInteger(input.value.record.revision))
            return yield* failure("invalid-input")
          const value = input.value
          const admitted = yield* admit(
            value.context,
            { kind: "fabric.record", id: value.record.id },
            "fabric.record.read",
          )
          const content = yield* database.db.transaction(
            (tx) =>
              Effect.gen(function* () {
                const row = yield* selected(tx, admitted, value.record)
                const payload = yield* open(row, admitted)
                yield* guard(tx, admitted)
                return payload
              }),
            { behavior: "immediate" },
          )
          yield* guard(database.db, admitted)
          return { record: value.record, ...content }
        }),
      )

    const put: FabricRecordsContract.Interface["put"] = (supplied) =>
      storageErrors(
        Effect.gen(function* () {
          const input = Schema.decodeUnknownOption(Write)(supplied, { onExcessProperty: "error" })
          if (Option.isNone(input) || (input.value.expected !== null && !Number.isSafeInteger(input.value.expected)))
            return yield* failure("invalid-input")
          if (Buffer.byteLength(input.value.payload) > limits.payloadBytes) return yield* failure("limit")
          if (input.value.metadata !== undefined && Buffer.byteLength(input.value.metadata) > metadataBytes)
            return yield* failure("limit")
          const value = input.value
          const admitted = yield* admit(value.context, { kind: "fabric.record", id: value.id }, "fabric.record.write")
          const result = yield* database.db.transaction(
            (tx) =>
              Effect.gen(function* () {
                yield* guard(tx, admitted)
                const row = yield* tx.select().from(FabricRecordTable).where(eq(FabricRecordTable.id, value.id)).get()
                if (!row && value.expected !== null) return yield* failure("conflict")
                if (row) {
                  const problem = owned(row, admitted, value.kind, value.expected)
                  if (problem) return yield* problem
                  yield* open(row, admitted)
                }
                const revision = (value.expected ?? 0) + 1
                if (!Number.isSafeInteger(revision)) return yield* failure("unavailable")
                const sealed = yield* Effect.try({
                  try: () =>
                    cipher.seal(
                      JSON.stringify({
                        domain: "orchestra:fabric-record",
                        version: 1,
                        storageID,
                        principal: admitted.binding.principal,
                        contextID: value.context.id,
                        contextGeneration: value.context.generation,
                        recordID: value.id,
                        kind: value.kind,
                        revision,
                        payload: value.payload,
                        ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
                      }),
                    ),
                  catch: () => failure("unavailable"),
                })
                if (!CredentialCipher.isSealed(sealed)) return yield* failure("unavailable")
                const bytes = Buffer.byteLength(sealed)
                const context = yield* tx
                  .select({
                    total: sql<number>`coalesce(sum(length(cast(${FabricRecordTable.sealed} as blob))),0)`,
                    records: count(),
                  })
                  .from(FabricRecordTable)
                  .where(eq(FabricRecordTable.context_id, value.context.id))
                  .get()
                const store = yield* tx
                  .select({ total: sql<number>`coalesce(sum(length(cast(${FabricRecordTable.sealed} as blob))),0)` })
                  .from(FabricRecordTable)
                  .get()
                if (
                  !context ||
                  !store ||
                  context.records + (row ? 0 : 1) > limits.records ||
                  context.total - (row?.bytes ?? 0) + bytes > limits.contextBytes ||
                  store.total - (row?.bytes ?? 0) + bytes > limits.storeBytes
                )
                  return yield* failure("limit")
                yield* guard(tx, admitted)
                const now = Date.now()
                if (row) {
                  const updated = yield* tx
                    .update(FabricRecordTable)
                    .set({ sealed, bytes, revision, time_updated: now })
                    .where(
                      and(
                        eq(FabricRecordTable.id, row.id),
                        eq(FabricRecordTable.revision, row.revision),
                        eq(FabricRecordTable.sealed, row.sealed!),
                        eq(FabricRecordTable.deleted, false),
                      ),
                    )
                    .returning()
                    .get()
                  if (!updated) return yield* failure("conflict")
                }
                if (!row)
                  yield* tx
                    .insert(FabricRecordTable)
                    .values({
                      id: value.id,
                      kind: value.kind,
                      revision,
                      sealed,
                      bytes,
                      storage_id: storageID,
                      principal: admitted.binding.principal,
                      context_id: value.context.id,
                      context_generation: value.context.generation,
                      deleted: false,
                      time_created: now,
                      time_updated: now,
                    })
                    .run()
                yield* guard(tx, admitted)
                return { id: value.id, kind: value.kind, revision }
              }),
            { behavior: "immediate" },
          )
          yield* guard(database.db, admitted)
          return result
        }),
      )

    const remove: FabricRecordsContract.Interface["remove"] = (supplied) =>
      storageErrors(
        Effect.gen(function* () {
          const input = Schema.decodeUnknownOption(Selection)(supplied, { onExcessProperty: "error" })
          if (Option.isNone(input) || !Number.isSafeInteger(input.value.record.revision))
            return yield* failure("invalid-input")
          const value = input.value
          const admitted = yield* admit(
            value.context,
            { kind: "fabric.record", id: value.record.id },
            "fabric.record.delete",
          )
          const result = yield* database.db.transaction(
            (tx) =>
              Effect.gen(function* () {
                const row = yield* selected(tx, admitted, value.record)
                yield* open(row, admitted)
                if (!Number.isSafeInteger(row.revision + 1)) return yield* failure("unavailable")
                yield* guard(tx, admitted)
                const updated = yield* tx
                  .update(FabricRecordTable)
                  .set({ sealed: null, bytes: 0, deleted: true, revision: row.revision + 1, time_updated: Date.now() })
                  .where(
                    and(
                      eq(FabricRecordTable.id, row.id),
                      eq(FabricRecordTable.revision, row.revision),
                      eq(FabricRecordTable.sealed, row.sealed!),
                      eq(FabricRecordTable.deleted, false),
                    ),
                  )
                  .returning()
                  .get()
                if (!updated) return yield* failure("conflict")
                yield* guard(tx, admitted)
                return { id: updated.id, kind: updated.kind, revision: updated.revision }
              }),
            { behavior: "immediate" },
          )
          yield* guard(database.db, admitted)
          return result
        }),
      )
    return Object.freeze({ list, get, put, remove }) satisfies FabricRecordsContract.Interface
  })
}

function storageErrors<A, R>(
  effect: Effect.Effect<A, FabricRecordsContract.Error | SqlError | EffectDrizzleQueryError, R>,
) {
  return Effect.mapError(effect, (error) =>
    error instanceof SqlError || error instanceof EffectDrizzleQueryError ? failure("unavailable") : error,
  )
}

function failure(code: FabricRecord.Failure["code"]) {
  return new FabricRecord.Failure({
    code,
    message:
      code === "invalid-input"
        ? "Fabric record input is invalid"
        : code === "denied"
          ? "Fabric record access is denied"
          : code === "expired"
            ? "Fabric record has expired"
            : code === "conflict"
              ? "Fabric record revision conflicts"
              : code === "limit"
                ? "Fabric record limit is reached"
                : "Fabric record is unavailable",
  })
}
