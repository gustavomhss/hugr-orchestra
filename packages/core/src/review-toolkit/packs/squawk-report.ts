export * as ReviewSquawkReport from "./squawk-report"

import { posix, win32 } from "node:path"
import { Option, Schema } from "effect"
import type { Parsed, Raw } from "../sarif"

// Squawk 2.67.0 JSON is a flat array. Positions are zero-based; column_end 0 is an exclusive end, so the inclusive
// end is the previous line. syntax-error is not a display id. One invalid row fails the report. Not a catalog map.

export const RULES = [
  "require-concurrent-index-creation", "require-concurrent-index-deletion", "constraint-missing-not-valid",
  "adding-field-with-default", "adding-foreign-key-constraint", "changing-column-type",
  "adding-not-nullable-field", "adding-serial-primary-key-field", "renaming-column", "renaming-table",
  "disallowed-unique-constraint", "ban-drop-database", "prefer-bigint-over-int", "prefer-bigint-over-smallint",
  "prefer-identity", "prefer-repack", "prefer-robust-stmts", "prefer-text-field", "prefer-timestamp-tz",
  "ban-char-field", "ban-drop-column", "ban-drop-table", "ban-drop-not-null", "transaction-nesting",
  "adding-required-field", "ban-concurrent-index-creation-in-transaction", "unused-ignore",
  "ban-create-domain-with-constraint", "ban-alter-domain-with-add-constraint", "ban-truncate-cascade",
  "require-timeout-settings", "ban-uncommitted-transaction", "require-enum-value-ordering",
  "require-table-schema", "identifier-too-long", "require-concurrent-partition-detach",
  "require-concurrent-reindex", "require-lock-timeout", "require-statement-timeout",
  "ban-duplicate-column-assignments", "ban-drop-view", "ban-drop-function", "ban-drop-type",
  "ban-drop-default", "ban-drop-trigger",
] as const

const KNOWN = new Set<string>(RULES)

export function parseReport(text: string, options: { root: string }): Parsed {
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(json)) return fail("malformed-json")
  if (!Array.isArray(json.value)) return fail("not-squawk-json")
  const read = json.value.map((row) => rowOf(row, options.root))
  const failed = read.find((row) => row.status === "acquisition-error")
  if (failed?.status === "acquisition-error") return failed
  return { status: "ok", results: read.flatMap((row) => row.status === "ok" ? [row.raw] : []), excluded: [] }
}

function rowOf(row: unknown, root: string): { status: "ok"; raw: Raw } | { status: "acquisition-error"; reason: string } {
  if (!record(row)) return fail("not-squawk-json")
  if (row.rule_name === "syntax-error") return fail("syntax-error")
  if (typeof row.rule_name !== "string" || row.rule_name.length === 0) return fail("empty-rule")
  if (!KNOWN.has(row.rule_name)) return fail("unknown-rule")
  if (row.level !== "Warning") return fail("level-invalid")
  if (typeof row.message !== "string") return fail("message-invalid")
  if (row.help !== undefined && row.help !== null && typeof row.help !== "string") return fail("help-invalid")
  if (typeof row.file !== "string" || !row.file) return fail("file-missing")
  const line = whole(row.line)
  const column = whole(row.column)
  const lineEnd = whole(row.line_end)
  const columnEnd = whole(row.column_end)
  if (line === undefined || column === undefined || lineEnd === undefined || columnEnd === undefined) return fail("range-invalid")
  const inclusive = columnEnd === 0 ? lineEnd - 1 : lineEnd
  if (inclusive < line || (inclusive === line && columnEnd !== 0 && columnEnd < column)) return fail("range-invalid")
  const relative = containedPath(row.file, root)
  if (!relative) return fail("path-outside")
  const start = line + 1
  const end = inclusive + 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return fail("range-invalid")
  return { status: "ok", raw: { pack: "squawk", rule: row.rule_name, path: relative, line: start, endLine: end, message: row.message, suppressions: [] } }
}

function fail(reason: string): { status: "acquisition-error"; reason: string } {
  return { status: "acquisition-error", reason }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function whole(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

export function flavor(root: string) {
  return /^[A-Za-z]:[\\/]/.test(root) || root.startsWith("\\\\") || root.startsWith("//") ? win32 : posix
}

// Flavor from the root spelling, then that flavor's separators. A posix backslash is a filename character.
export function containedPath(file: string, root: string | undefined) {
  if (!root || !file || file.includes("\0") || root.includes("\0")) return undefined
  if (/^[A-Za-z]:(?![\\/])/.test(file) || /^[A-Za-z]:(?![\\/])/.test(root)) return undefined
  const path = flavor(root)
  if (parts(file, path).includes("..") || parts(root, path).includes("..")) return undefined
  if (!path.isAbsolute(root)) return undefined
  const resolvedRoot = path.resolve(root)
  const resolvedFile = path.isAbsolute(file) ? path.resolve(file) : path.resolve(root, file)
  const relative = path.relative(resolvedRoot, resolvedFile)
  if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) return undefined
  return path === win32 ? relative.replaceAll("\\", "/") : relative
}

function parts(value: string, path: typeof posix) {
  return value.split(path === win32 ? /[\\/]/ : /\//)
}
