export * as ReviewOutcomes from "./outcomes"

import { Schema } from "effect"
import { ReviewItem } from "../review-toolkit/item"
import type { ReviewCatalog } from "./catalog"
import { ReviewLedger } from "./ledger"

// Host outcome admission. Delivered primary items are the only reads; a model card is not an input.

export type Decision = {
  readonly source: string
  readonly class: string
  readonly path: string
  readonly line: number
  readonly endLine?: number
  readonly state: "confirmed" | "refuted" | "question"
}

export function reads(input: {
  readonly delivered: ReadonlyArray<ReviewItem.ToolItem>
  readonly decisions: ReadonlyArray<Decision>
  readonly catalog: ReviewCatalog.Catalog
}): ReadonlyArray<ReviewLedger.Read> {
  const delivered = dedupe(input.delivered.map((item) => Schema.decodeUnknownSync(ReviewItem.ToolItem)(item)))
  return delivered
    .map((occurrences) => ({
      pack: occurrences[0].pack,
      rule: occurrences[0].rule,
      generation: boundGeneration(occurrences[0], input.catalog),
      fingerprint: occurrences[0].fingerprint,
      outcome: outcome(occurrences, input.decisions),
    }))
    .sort((left, right) => compare(identity(left), identity(right)))
}

function boundGeneration(item: ReviewItem.ToolItem, catalog: ReviewCatalog.Catalog) {
  const pack = catalog.packs.find((entry) => entry.id === item.pack)
  const mapping =
    catalog.rules.find((entry) => entry.pack === item.pack && entry.rule === item.rule) ??
    catalog.rules.find((entry) => entry.pack === item.pack && entry.rule === "*")
  if (!pack || !mapping) throw new Error("outcome-source-unknown")
  return ReviewLedger.generation(pack, { ...mapping, rule: item.rule })
}

function dedupe(items: readonly ReviewItem.ToolItem[]) {
  const seen = new Map<string, ReviewItem.ToolItem[]>()
  for (const item of items) {
    const key = JSON.stringify([item.pack, item.rule, item.fingerprint])
    const prior = seen.get(key)
    if (!prior) {
      seen.set(key, [item])
      continue
    }
    if (primary(prior[0]) !== primary(item)) throw new Error("outcome-source-conflict")
    // A native fingerprint survives line movement and may occur more than once
    // in one file. Keep the delivered ranges without counting another read.
    prior.push(item)
  }
  return [...seen.values()]
}

function outcome(items: ReadonlyArray<ReviewItem.ToolItem>, decisions: ReadonlyArray<Decision>): ReviewLedger.Read["outcome"] {
  const states = decisions.flatMap((decision) => (items.some((item) => matches(item, decision)) ? [decision.state] : []))
  if (states.includes("confirmed") && states.includes("refuted")) return "not-pursued"
  if (states.includes("confirmed")) return "confirmed"
  if (states.includes("refuted") && !states.includes("question")) return "refuted"
  return "not-pursued"
}

function matches(item: ReviewItem.ToolItem, decision: Decision) {
  if (decision.source !== item.fingerprint || decision.class !== item.class || decision.path !== item.path) return false
  const hosted = span(item.line, item.endLine)
  const claimed = span(decision.line, decision.endLine)
  if (!hosted || !claimed) return false
  return claimed.line <= hosted.end && hosted.line <= claimed.end
}

function span(line: number, endLine?: number) {
  if (!Number.isSafeInteger(line) || line < 1) return undefined
  const end = endLine ?? line
  if (!Number.isSafeInteger(end) || end < line) return undefined
  return { line, end }
}

function primary(item: ReviewItem.ToolItem) {
  return JSON.stringify([
    item.class,
    item.lens,
    item.path,
    item.severity,
    item.ruleStatus,
    item.snippetDigest,
    item.triage,
  ])
}

function identity(read: ReviewLedger.Read) {
  return JSON.stringify([read.pack, read.rule, read.generation, read.fingerprint])
}

function compare(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
