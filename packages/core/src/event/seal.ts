export * as EventSeal from "./seal"

import { createHash } from "node:crypto"
import { and, asc, desc, eq, gte, lte, sql, type SQLWrapper } from "drizzle-orm"
import { Cause, Effect, Option, Schema } from "effect"
import type { Database } from "../database/database"
import { EventSequenceTable, EventTable } from "./sql"
import { SNAPSHOT_COMPACTION_MARKER } from "./compaction"

export const GENESIS = "0".repeat(64)
type Row = Pick<typeof EventTable.$inferSelect, "id" | "aggregate_id" | "seq" | "type" | "data">
type Seal = Pick<typeof EventTable.$inferSelect, "seal_version" | "seal_prev" | "seal_hash">
const MAX_ROWS = 2048
const MAX_BYTES = 8 * 1024 * 1024
// Corrupt metadata must not turn a bounded payload read into an unbounded allocation.
// Validate storage type/raw bytes before bounded extraction; TEXT substr hides NUL suffixes.
export const columns = {
  seal_version: sql<
    number | null
  >`CASE WHEN ${EventTable.seal_version} IS NULL THEN NULL WHEN typeof(${EventTable.seal_version}) = 'integer' AND ${EventTable.seal_version} = 1 THEN 1 ELSE 0 END`,
  seal_prev: hashColumn(EventTable.seal_prev),
  seal_hash: hashColumn(EventTable.seal_hash),
}
const Hash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Sequence = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER))
export const SealWindowInput = Schema.Struct({
  aggregateID: Schema.NonEmptyString,
  fromSeq: Sequence,
  toSeq: Sequence,
  expectedPreviousHash: Schema.optional(Hash),
  expectedTipHash: Schema.optional(Hash),
})
export type SealWindowInput = typeof SealWindowInput.Type
const Reason = Schema.Literals([
  "UNSEALED_HISTORY",
  "COMPACTED_HISTORY",
  "MISSING_EVENT",
  "HEAD_SEQUENCE_MISMATCH",
  "MALFORMED_SEAL",
  "LINK_MISMATCH",
  "HASH_MISMATCH",
  "EXPECTED_ANCHOR_MISMATCH",
  "EXPECTED_TIP_MISMATCH",
  "PREFIX_OUTSIDE_WINDOW",
  "TAIL_OUTSIDE_WINDOW",
])
export const SealWindowResult = Schema.Struct({
  status: Schema.Literals(["VERIFIED_WINDOW", "UNKNOWN", "BROKEN"]),
  algorithm: Schema.Literal("sha256-native-event-v1"),
  aggregateID: Schema.String,
  fromSeq: Sequence,
  toSeq: Sequence,
  rows: Sequence,
  headSeq: Schema.NullOr(Sequence),
  previousHash: Schema.NullOr(Hash),
  tipHash: Schema.NullOr(Hash),
  anchor: Schema.Literals(["genesis", "caller", "stored-predecessor", "historical-unknown"]),
  rangeComplete: Schema.Boolean,
  historyComplete: Schema.Boolean,
  reasons: Schema.Array(Reason),
})
export type SealWindowResult = typeof SealWindowResult.Type
export class SealWindowError extends Schema.TaggedErrorClass<SealWindowError>()("EventV2.SealWindowError", {
  code: Schema.Literals(["INVALID_WINDOW", "OVERFLOW", "ACQUISITION_FAILED"]),
  message: Schema.String,
}) {}

export function sealRow(row: Row, predecessor?: Seal) {
  const previous = predecessor && isSealed(predecessor) ? predecessor.seal_hash : GENESIS
  return { seal_version: 1, seal_prev: previous, seal_hash: hashRow(row, previous) }
}

export function isSealed(seal: Seal): seal is Seal & { seal_version: 1; seal_prev: string; seal_hash: string } {
  return seal.seal_version === 1 && isHash(seal.seal_prev) && isHash(seal.seal_hash)
}

export function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

export function hashRow(row: Row, previous: string) {
  return createHash("sha256")
    .update(`opencode:event-seal:v1\n${previous}\n${canonicalRow(row)}`)
    .digest("hex")
}

export function canonicalRow(row: Row) {
  // Normalize exactly as SQLite JSON storage does (toJSON, omitted undefined, finite scalars).
  return canonical(
    JSON.parse(
      JSON.stringify({ id: row.id, aggregate_id: row.aggregate_id, seq: row.seq, type: row.type, data: row.data }),
    ),
  )
}

export const verifyWindow = Effect.fn("EventSeal.verifyWindow")(function* (
  db: Database.Interface["db"],
  supplied: SealWindowInput,
) {
  const decoded = Schema.decodeUnknownOption(SealWindowInput)(supplied)
  if (Option.isNone(decoded))
    return yield* new SealWindowError({
      code: "INVALID_WINDOW",
      message: "Expected aggregate and safe ordered sequence interval with optional SHA-256 anchors",
    })
  const input = Object.freeze({ ...decoded.value })
  if (input.fromSeq > input.toSeq)
    return yield* new SealWindowError({ code: "INVALID_WINDOW", message: "Seal window sequence interval is reversed" })
  if (input.toSeq - input.fromSeq + 1 > MAX_ROWS)
    return yield* new SealWindowError({ code: "OVERFLOW", message: "Seal window exceeds 2048 rows" })
  return yield* db
    .transaction((tx) =>
      Effect.gen(function* () {
        const head = yield* tx
          .select({
            seq: sql<number>`CASE WHEN typeof(${EventSequenceTable.seq}) = 'integer' AND ${EventSequenceTable.seq} BETWEEN 0 AND ${Number.MAX_SAFE_INTEGER} THEN ${EventSequenceTable.seq} ELSE -1 END`,
          })
          .from(EventSequenceTable)
          .where(eq(EventSequenceTable.aggregate_id, input.aggregateID))
          .get()
        const tail = yield* tx
          .select({
            seq: sql<number>`CASE WHEN typeof(${EventTable.seq}) = 'integer' AND ${EventTable.seq} BETWEEN 0 AND ${Number.MAX_SAFE_INTEGER} THEN ${EventTable.seq} ELSE -1 END`,
          })
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, input.aggregateID))
          .orderBy(desc(EventTable.seq))
          .limit(1)
          .get()
        const scope = and(
          eq(EventTable.aggregate_id, input.aggregateID),
          gte(EventTable.seq, input.fromSeq),
          lte(EventTable.seq, input.toSeq),
        )
        // Preflight raw bytes before materializing JSON. Canonical bytes are checked again below.
        const size = yield* windowSize(tx, input)
        if ((size?.rows ?? 0) > MAX_ROWS || (size?.bytes ?? 0) > MAX_BYTES)
          return yield* new SealWindowError({ code: "OVERFLOW", message: "Seal window exceeds 2048 rows or 8 MiB" })
        const predecessor =
          input.fromSeq === 0
            ? undefined
            : yield* tx
                .select({
                  seq: EventTable.seq,
                  ...columns,
                })
                .from(EventTable)
                .where(and(eq(EventTable.aggregate_id, input.aggregateID), eq(EventTable.seq, input.fromSeq - 1)))
                .get()
        const compacted = Boolean(
          yield* tx.get(sql`SELECT 1 FROM data_migration WHERE name = ${SNAPSHOT_COMPACTION_MARKER}`),
        )
        const rows = yield* tx
          .select({
            id: EventTable.id,
            aggregate_id: EventTable.aggregate_id,
            seq: EventTable.seq,
            type: EventTable.type,
            data: EventTable.data,
            ...columns,
          })
          .from(EventTable)
          .where(scope)
          .orderBy(asc(EventTable.seq))
          .limit(MAX_ROWS + 1)
          .all()
        return yield* Effect.try({
          try: () => {
            if (rows.reduce((total, row) => total + Buffer.byteLength(canonicalRow(row), "utf8"), 0) > MAX_BYTES)
              throw new SealWindowError({ code: "OVERFLOW", message: "Canonical seal window exceeds 8 MiB" })
            return verifyRows(input, rows, predecessor, head?.seq ?? null, compacted, tail?.seq ?? null)
          },
          catch: (error) =>
            error instanceof SealWindowError
              ? error
              : new SealWindowError({
                  code: "ACQUISITION_FAILED",
                  message: "Could not canonicalize stored event rows",
                }),
        })
      }),
    )
    .pipe(
      Effect.mapError(acquisitionError),
      // SQLite statement preparation can defect before returning its typed SqlError.
      Effect.catchCauseIf(
        (cause) => !Cause.hasInterrupts(cause),
        (cause) => Effect.fail(acquisitionError(Option.getOrUndefined(Cause.findErrorOption(cause)))),
      ),
    )
})

/** Limit actual SQLite rows before aggregation: INTEGER affinity can contain arbitrarily many REAL seq values. */
export function windowSize(db: Pick<Database.Interface["db"], "select">, input: SealWindowInput) {
  const page = db
    .select({
      bytes:
        sql<number>`length(cast(${EventTable.data} as blob)) + length(cast(${EventTable.id} as blob)) + length(cast(${EventTable.type} as blob)) + length(cast(${EventTable.aggregate_id} as blob))`.as(
          "payload_bytes",
        ),
    })
    .from(EventTable)
    .where(
      and(
        eq(EventTable.aggregate_id, input.aggregateID),
        gte(EventTable.seq, input.fromSeq),
        lte(EventTable.seq, input.toSeq),
      ),
    )
    .orderBy(asc(EventTable.seq))
    .limit(MAX_ROWS + 1)
    .as("seal_window_preflight")
  return db
    .select({ rows: sql<number>`count(*)`, bytes: sql<number>`coalesce(sum(${page.bytes}), 0)` })
    .from(page)
    .get()
}

function hashColumn(column: SQLWrapper) {
  return sql<
    string | null
  >`CASE WHEN ${column} IS NULL THEN NULL WHEN typeof(${column}) = 'text' AND length(cast(${column} as blob)) = 64 AND instr(${column}, char(0)) = 0 THEN cast(substr(cast(${column} as blob), 1, 65) as text) ELSE '' END`
}

function acquisitionError(error: unknown) {
  return error instanceof SealWindowError
    ? error
    : new SealWindowError({ code: "ACQUISITION_FAILED", message: "Could not acquire consistent seal window" })
}

function unsealed(row: Seal) {
  return row.seal_version === null && row.seal_prev === null && row.seal_hash === null
}

function verifyRows(
  input: SealWindowInput,
  rows: readonly (Row & Seal)[],
  predecessor: (Seal & { seq: number }) | undefined,
  headSeq: number | null,
  compacted: boolean,
  tailSeq: number | null,
): SealWindowResult {
  const reasons = new Set<typeof Reason.Type>()
  const broken = new Set<typeof Reason.Type>()
  const fail = (reason: typeof Reason.Type) => {
    reasons.add(reason)
    broken.add(reason)
  }
  const missing = () => {
    reasons.add("MISSING_EVENT")
    if (compacted) reasons.add("COMPACTED_HISTORY")
  }
  if (headSeq !== null && (!Number.isSafeInteger(headSeq) || headSeq < 0)) fail("MISSING_EVENT")
  if (tailSeq !== null && (tailSeq < 0 || headSeq === null || (headSeq >= 0 && tailSeq > headSeq)))
    fail("HEAD_SEQUENCE_MISMATCH")
  const rangeComplete =
    rows.length === input.toSeq - input.fromSeq + 1 && rows.every((row, index) => row.seq === input.fromSeq + index)
  const recordedRows = headSeq === null ? 0 : Math.max(0, Math.min(headSeq, input.toSeq) - input.fromSeq + 1)
  if (!rangeComplete) missing()
  if (rows.length !== recordedRows || rows.some((row, index) => row.seq !== input.fromSeq + index)) {
    missing()
    if (!compacted) broken.add("MISSING_EVENT")
  }
  if (input.fromSeq > 0) reasons.add("PREFIX_OUTSIDE_WINDOW")
  if (input.toSeq < Math.max(headSeq ?? -1, tailSeq ?? -1)) reasons.add("TAIL_OUTSIDE_WINDOW")
  if (rows.some((row) => !Number.isSafeInteger(row.seq) || row.seq < 0)) fail("MISSING_EVENT")
  rows.forEach((row, index) => {
    if (unsealed(row)) {
      reasons.add("UNSEALED_HISTORY")
      return
    }
    if (!isSealed(row)) {
      fail("MALFORMED_SEAL")
      return
    }
    if (hashRow(row, row.seal_prev) !== row.seal_hash) fail("HASH_MISMATCH")
    const previous = index ? rows[index - 1] : predecessor
    if (row.seq === 0) {
      if (row.seal_prev !== GENESIS) fail("LINK_MISMATCH")
      return
    }
    if (!previous || previous.seq !== row.seq - 1) {
      missing()
      if (!compacted) broken.add("MISSING_EVENT")
      return
    }
    if (unsealed(previous)) {
      reasons.add("UNSEALED_HISTORY")
      if (row.seal_prev !== GENESIS) fail("LINK_MISMATCH")
      return
    }
    if (!isSealed(previous)) {
      fail("MALFORMED_SEAL")
      return
    }
    if (row.seal_prev !== previous.seal_hash) fail("LINK_MISMATCH")
  })
  const first = rows[0]
  const last = rows.at(-1)
  const previousHash = first && isHash(first.seal_prev) ? first.seal_prev : null
  const tipHash = last && isHash(last.seal_hash) ? last.seal_hash : null
  if (previousHash !== null && input.expectedPreviousHash !== undefined && previousHash !== input.expectedPreviousHash)
    fail("EXPECTED_ANCHOR_MISMATCH")
  if (tipHash !== null && input.expectedTipHash !== undefined && tipHash !== input.expectedTipHash)
    fail("EXPECTED_TIP_MISMATCH")
  const status = broken.size
    ? "BROKEN"
    : !rangeComplete || !rows.length || reasons.has("UNSEALED_HISTORY") || reasons.has("COMPACTED_HISTORY")
      ? "UNKNOWN"
      : "VERIFIED_WINDOW"
  return {
    status,
    algorithm: "sha256-native-event-v1",
    aggregateID: input.aggregateID,
    fromSeq: input.fromSeq,
    toSeq: input.toSeq,
    rows: rows.length,
    headSeq: headSeq !== null && Number.isSafeInteger(headSeq) && headSeq >= 0 ? headSeq : null,
    previousHash,
    tipHash,
    anchor:
      previousHash === null
        ? "historical-unknown"
        : input.expectedPreviousHash !== undefined
          ? "caller"
          : input.fromSeq === 0
            ? "genesis"
            : predecessor && isSealed(predecessor)
              ? "stored-predecessor"
              : "historical-unknown",
    rangeComplete,
    historyComplete: status === "VERIFIED_WINDOW" && input.fromSeq === 0 && input.toSeq === headSeq,
    reasons: [...reasons].sort(),
  }
}

function canonical(value: unknown): string {
  // An explicit stack avoids introducing a recursion limit below native JSON storage's limit.
  const pending: Array<{ value: unknown } | { text: string }> = [{ value }]
  const output: string[] = []
  while (pending.length) {
    const task = pending.pop()
    if (!task) break
    if ("text" in task) {
      output.push(task.text)
      continue
    }
    if (Array.isArray(task.value)) {
      output.push("[")
      pending.push({ text: "]" })
      task.value
        .flatMap((value, index) => (index ? [{ text: "," }, { value }] : [{ value }]))
        .reverse()
        .forEach((token) => pending.push(token))
      continue
    }
    if (task.value !== null && typeof task.value === "object") {
      output.push("{")
      pending.push({ text: "}" })
      Object.entries(task.value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .flatMap(([key, value], index) => [
          ...(index ? [{ text: "," }] : []),
          { text: `${JSON.stringify(key)}:` },
          { value },
        ])
        .reverse()
        .forEach((token) => pending.push(token))
      continue
    }
    output.push(JSON.stringify(task.value) ?? "null")
  }
  return output.join("")
}
