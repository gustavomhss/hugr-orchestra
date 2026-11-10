export * as ReviewRuffReport from "./ruff-report"

import { Option, Schema } from "effect"
import { ReviewNativeFiles } from "../native-files"
import type { Parsed, Raw } from "../sarif"

// Ruff 0.17.3 JSON is a flat array. Locations are one-indexed Unicode scalar columns. `TextRange` end is exclusive.
// `invalid-syntax` and any code outside the curated pair fail the whole report. Not a catalog map.

export const RULES = ["F821", "F823"] as const
const KNOWN = new Set<string>(RULES)

const Location = Schema.Struct({ row: Schema.Number, column: Schema.Number })
const Row = Schema.Struct({
  code: Schema.Unknown,
  message: Schema.Unknown,
  filename: Schema.Unknown,
  location: Schema.Unknown,
  end_location: Schema.Unknown,
})

export function parseReport(text: string, options: { root: string }): Parsed {
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(json)) return fail("malformed-json")
  if (!Array.isArray(json.value)) return fail("not-ruff-json")
  const read = json.value.map((row) => rowOf(row, options.root))
  const failed = read.find((row) => row.status === "acquisition-error")
  if (failed?.status === "acquisition-error") return failed
  return { status: "ok", results: read.flatMap((row) => row.status === "ok" ? [row.raw] : []), excluded: [] }
}

function rowOf(row: unknown, root: string): { status: "ok"; raw: Raw } | { status: "acquisition-error"; reason: string } {
  const decoded = Schema.decodeUnknownOption(Row)(row)
  if (Option.isNone(decoded)) return fail("not-ruff-json")
  if (decoded.value.code === "invalid-syntax") return fail("syntax-error")
  if (typeof decoded.value.code !== "string" || !KNOWN.has(decoded.value.code)) return fail("unknown-rule")
  if (typeof decoded.value.message !== "string" || decoded.value.message.length === 0) return fail("message-invalid")
  if (typeof decoded.value.filename !== "string" || !decoded.value.filename) return fail("file-missing")
  const start = point(decoded.value.location)
  const end = point(decoded.value.end_location)
  if (!start || !end) return fail("range-invalid")
  const inclusive = inclusiveEnd(start, end)
  if (!inclusive) return fail("range-invalid")
  const relative = ReviewNativeFiles.containedPath(root, decoded.value.filename)
  if (!relative) return fail("path-outside")
  return {
    status: "ok",
    raw: {
      pack: "ruff",
      rule: decoded.value.code,
      path: relative,
      line: start.row,
      ...(inclusive.row > start.row ? { endLine: inclusive.row } : {}),
      message: decoded.value.message,
      suppressions: [],
    },
  }
}

function point(value: unknown) {
  const decoded = Schema.decodeUnknownOption(Location)(value)
  if (Option.isNone(decoded)) return undefined
  const row = decoded.value.row
  const column = decoded.value.column
  if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column) || row < 1 || column < 1) return undefined
  return { row, column }
}

// Exclusive end at column 1 is the first scalar of the next line, so the inclusive end is the previous line.
function inclusiveEnd(start: { row: number; column: number }, end: { row: number; column: number }) {
  if (end.row === start.row && end.column === start.column) return undefined
  const row = end.column === 1 ? end.row - 1 : end.row
  if (!Number.isSafeInteger(row) || row < start.row) return undefined
  if (row === start.row && end.column !== 1 && end.column <= start.column) return undefined
  return { row }
}

function fail(reason: string): { status: "acquisition-error"; reason: string } {
  return { status: "acquisition-error", reason }
}
