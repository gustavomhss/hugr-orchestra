export * as ReviewActionlintReport from "./actionlint-report"

import { Option, Schema } from "effect"
import { ReviewNativeFiles } from "../native-files"
import type { Parsed, Raw } from "../sarif"

export const RULES = ["action", "credentials", "deprecated-commands", "env-var", "events", "expression", "glob", "id", "if-cond", "job-needs", "matrix", "permissions", "runner-label", "shell-name", "workflow-call"] as const
const KNOWN = new Set<string>(RULES)
const Row = Schema.Struct({ message: Schema.Unknown, filepath: Schema.Unknown, line: Schema.Unknown, column: Schema.Unknown, kind: Schema.Unknown, snippet: Schema.optional(Schema.Unknown), end_column: Schema.optional(Schema.Unknown) })

export function parseReport(text: string, options: { root: string; paths: readonly { file: string; path: string }[] }): Parsed {
  const map = pathMap(options)
  if (map.status !== "ok") return map
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(json)) return fail("malformed-json")
  if (!Array.isArray(json.value)) return fail("not-actionlint-json")
  const results: Raw[] = []
  for (const value of json.value) {
    const decoded = Schema.decodeUnknownOption(Row)(value)
    if (Option.isNone(decoded)) return fail("not-actionlint-json")
    const row = decoded.value
    if (row.kind === "syntax-check") return fail("syntax-error")
    if (typeof row.kind !== "string" || !KNOWN.has(row.kind)) return fail("unknown-rule")
    if (typeof row.message !== "string" || !row.message) return fail("message-invalid")
    if (typeof row.filepath !== "string" || !row.filepath) return fail("file-missing")
    if (typeof row.line !== "number" || !Number.isSafeInteger(row.line) || row.line < 1) return fail("line-invalid")
    if (typeof row.column !== "number" || !Number.isSafeInteger(row.column) || row.column < 1) return fail("column-invalid")
    if (row.snippet !== undefined && typeof row.snippet !== "string") return fail("snippet-invalid")
    const projected = ReviewNativeFiles.containedPath(options.root, row.filepath)
    const path = projected ? map.paths.get(identity(options.root, projected)) : undefined
    if (!path) return fail(projected ? "path-unmapped" : "path-outside")
    results.push({ pack: "actionlint", rule: row.kind, path, line: row.line, message: row.message, suppressions: [], ...(typeof row.snippet === "string" ? { snippet: row.snippet } : {}) })
  }
  return { status: "ok", results, excluded: [] }
}

function pathMap(options: { root: string; paths: readonly { file: string; path: string }[] }) {
  if (!options.root || options.root.includes("\0") || !ReviewNativeFiles.containedPath(options.root, options.root + "/.actionlint-root-check")) return fail("path-map-invalid")
  if (!options.paths.length) return fail("path-map-empty")
  const paths = new Map<string, string>()
  const originals = new Set<string>()
  const projectedKeys = new Set<string>()
  for (const entry of options.paths) {
    if (typeof entry.file !== "string" || typeof entry.path !== "string" || !safeRelative(options.root, entry.file) || !safeRelative(options.root, entry.path)) return fail("path-map-invalid")
    const key = identity(options.root, entry.file)
    const original = identity(options.root, entry.path)
    if (projectedKeys.has(key) || originals.has(original)) return fail("path-map-duplicate")
    paths.set(key, entry.path)
    projectedKeys.add(key)
    originals.add(original)
  }
  return { status: "ok" as const, paths }
}

function identity(root: string, value: string) {
  const normalized = ReviewNativeFiles.flavor(root).sep === "\\" ? value.toLowerCase() : value
  return normalized
}

function safeRelative(root: string, value: string) {
  const path = ReviewNativeFiles.flavor(root)
  if (!value || value.includes("\0") || path.isAbsolute(value) || !ReviewNativeFiles.containedPath(root, path.resolve(root, value))) return false
  return ReviewNativeFiles.containedPath(root, path.resolve(root, value)) === value
}

function fail(reason: string): { status: "acquisition-error"; reason: string } { return { status: "acquisition-error", reason } }
