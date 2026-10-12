export * as ResearchLedger from "./ledger"

import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Database } from "../database/database"
import { EventV2 } from "../event"
import { EventTable } from "../event/sql"
import { ResearchBinding } from "./binding"
import type { Tool } from "../tool/tool"

export const Entry = Schema.Union([ResearchEvent.SourceAdmitted, ResearchEvent.RecordCommitted, ResearchEvent.DocumentPublished])
export type Entry = typeof Entry.Type
const types = [ResearchEvent.SourceAdmitted, ResearchEvent.RecordCommitted, ResearchEvent.DocumentPublished]
  .map((definition) => EventV2.versionedType(definition.type, 1))

/** Canonical JSON ignores object insertion order and absent optional fields, preserving array order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value !== null && typeof value === "object") return `{${Object.entries(value)
    .filter((entry) => entry[1] !== undefined).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
    .map((entry) => `${JSON.stringify(entry[0])}:${canonical(entry[1])}`).join(",")}}`
  return JSON.stringify(value)
}

export function digest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

export function operation(context: Tool.Context, action: string) {
  return digest(canonical([context.sessionID, context.assistantMessageID, context.toolCallID, action]))
}

export function eventID(binding: Research.Binding, key: string) {
  return EventV2.ID.make(`evt_research_${digest(canonical([binding.executionSessionID, key]))}`)
}

export function cap(value: unknown, limit = Research.Limits.eventBytes) {
  if (Buffer.byteLength(typeof value === "string" ? value : canonical(value), "utf8") > limit)
    throw new Research.Error({ code: "over_cap", message: "Research UTF-8 byte limit exceeded" })
}

export const bounded = (value: unknown, limit = Research.Limits.eventBytes) => Effect.try({
  try: () => cap(value, limit), catch: () => new Research.Error({ code: "over_cap", message: "Research UTF-8 byte limit exceeded" }),
})

export const entries = Effect.fn("ResearchLedger.entries")(function* (binding: Research.Binding, explicitID?: string, executionOnly = false) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(and(
    inArray(EventTable.type, types),
    sql`json_extract(${EventTable.data}, '$.binding.projectID') = ${binding.projectID}`,
    executionOnly ? eq(EventTable.aggregate_id, binding.executionSessionID) : undefined,
    explicitID === undefined ? eq(EventTable.aggregate_id, binding.executionSessionID) : sql`(
      json_extract(${EventTable.data}, '$.record.id') = ${explicitID} OR
      json_extract(${EventTable.data}, '$.receipt.ref.id') = ${explicitID} OR
      json_extract(${EventTable.data}, '$.receipt.ref.artifact.id') = ${explicitID} OR
      json_extract(${EventTable.data}, '$.receipt.artifact.id') = ${explicitID})`,
  )).orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
  return yield* Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(Entry)({
    id: row.id, type: row.type.slice(0, -2), data: row.data,
    durable: { aggregateID: row.aggregate_id, seq: row.seq, version: 1 },
  }).pipe(
    Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: "Invalid retained research event" })),
    Effect.flatMap((entry) => entry.data.sessionID !== row.aggregate_id || entry.data.binding.executionSessionID !== row.aggregate_id ||
      (entry.type !== "research.record.committed" && !isDeepStrictEqual(entry.data.receipt.binding, entry.data.binding))
      ? Effect.fail(new Research.Error({ code: "source_unavailable", message: "Research event scope does not match admission" }))
      : Effect.succeed(entry)),
  ))
})

export const retained = Effect.fn("ResearchLedger.retained")(function* (binding: Research.Binding) {
  const actual = yield* ResearchBinding.resolve(binding.executionSessionID, binding.projectID)
  if (!isDeepStrictEqual(actual, binding))
    return yield* new Research.Error({ code: "binding_mismatch", message: "Research placement changed" })
  return actual
})

export function replay(entries: readonly Entry[], operation: string, inputHash: string) {
  const found = entries.filter((entry) => entry.data.operation === operation)
  if (found.length > 1 || found.some((entry) => entry.data.inputHash !== inputHash))
    throw new Research.Error({ code: "conflict", message: "Research operation was reused with different input" })
  return found[0]
}
