export * as ReviewItem from "./item"

import { createHash } from "node:crypto"
import { Schema } from "effect"

// K6 analyze half. Catalog ids (class, lens, pack, rule) are open sets: the catalog decides which exist, not this schema.
export const Id = Schema.NonEmptyString
export const RuleStatus = Schema.Literals(["probation", "active", "demoted", "dropped"])
export type RuleStatus = typeof RuleStatus.Type
export const Severity = Schema.Literals(["P0", "P1", "P2", "P3"])
export type Severity = typeof Severity.Type
export const Line = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))

export const Source = Schema.Struct({ pack: Id, rule: Id })
export type Source = typeof Source.Type

export const ToolItem = Schema.Struct({
  fingerprint: Schema.NonEmptyString,
  class: Id,
  lens: Id,
  pack: Id,
  rule: Id,
  ruleStatus: RuleStatus,
  severity: Severity,
  path: Schema.NonEmptyString,
  line: Line,
  endLine: Schema.optionalKey(Line),
  snippetDigest: Schema.NonEmptyString,
  sources: Schema.Array(Source),
  triage: Schema.String,
  onChangedLine: Schema.Boolean,
})
export type ToolItem = typeof ToolItem.Type

/**
 * Whitespace-insensitive form of a snippet: each line trimmed, inner whitespace runs collapsed, blank lines dropped.
 * Reindenting or reflowing blank lines keeps the digest; changing a token changes it.
 */
export function normalizeSnippet(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0)
    .join("\n")
}

export function snippetDigest(text: string) {
  return sha256(normalizeSnippet(text))
}

/** Stable across line shifts: built from pack, rule, path and the snippet digest, never from a line number. */
export function fingerprint(input: { pack: string; rule: string; path: string; snippetDigest: string }) {
  return sha256(JSON.stringify([input.pack, input.rule, input.path, input.snippetDigest]))
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}
