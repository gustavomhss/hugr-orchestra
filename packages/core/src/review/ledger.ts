export * as ReviewLedger from "./ledger"

import { createHash } from "node:crypto"
import type { ReviewCatalog } from "./catalog"

/**
 * Pure precision reducer. Durable host admission is a separate obligation: this
 * module does not read receipts, infer an old generation, or invent provenance.
 *
 * ```ts
 * export type Read = {
 *   readonly pack: string; readonly rule: string; readonly generation: string
 *   readonly fingerprint: string
 *   readonly outcome: "confirmed" | "refuted" | "not-pursued"
 * }
 * export type Batch = {
 *   readonly id: string; readonly project: string; readonly order: number
 *   readonly reads: ReadonlyArray<Read>
 * }
 * export type Query = {
 *   readonly project: string; readonly pack: string; readonly rule: string
 *   readonly generation: string; readonly repository: boolean
 *   readonly cost: "low" | "medium" | "high"
 *   readonly thresholds: ReviewCatalog.Catalog["route"]["ledger"]
 * }
 * export function generation(pack: ReviewCatalog.Catalog["packs"][number],
 *   rule: ReviewCatalog.Catalog["rules"][number]): string
 * export function status(batches: ReadonlyArray<Batch>, query: Query):
 *   "probation" | "active" | "demoted" | "dropped"
 * ```
 *
 * `status` returns only that label. `precision-invalid` is empty identity,
 * empty generation, a missing outcome, a non-positive or unsafe order, or a
 * bad threshold. `precision-conflict` is a batch id whose contents differ, two
 * outcomes for one source item, or distinct ids sharing an order.
 *
 * Generation is the SHA-256 hex of canonical JSON for pack
 * id/tool/version/pin/backend, template/output/network/scratchWrites, and the
 * rule except `status`. Object keys are sorted recursively; arrays keep order.
 * A derived status, overlay, threshold, or other catalog field is not an input.
 */

export type Read = {
  readonly pack: string
  readonly rule: string
  readonly generation: string
  readonly fingerprint: string
  readonly outcome: "confirmed" | "refuted" | "not-pursued"
}

export type Batch = {
  readonly id: string
  readonly project: string
  readonly order: number
  readonly reads: ReadonlyArray<Read>
}

export type Query = {
  readonly project: string
  readonly pack: string
  readonly rule: string
  readonly generation: string
  readonly repository: boolean
  readonly cost: "low" | "medium" | "high"
  readonly thresholds: ReviewCatalog.Catalog["route"]["ledger"]
}

type Sample = {
  readonly project: string
  readonly fingerprint: string
  readonly confirmed: boolean
}

const OUTCOMES = new Set<Read["outcome"]>(["confirmed", "refuted", "not-pursued"])
const COSTS = new Set<Query["cost"]>(["low", "medium", "high"])

export function generation(
  pack: ReviewCatalog.Catalog["packs"][number],
  rule: ReviewCatalog.Catalog["rules"][number],
): string {
  return createHash("sha256").update(canonical({
    pack: {
      backend: pack.backend,
      id: pack.id,
      network: pack.network,
      output: pack.output,
      ...(pack.pin === undefined ? {} : { pin: pack.pin }),
      scratchWrites: pack.scratchWrites,
      template: pack.template,
      tool: pack.tool,
      version: pack.version,
    },
    rule: {
      class: rule.class,
      ...(rule.cwe === undefined ? {} : { cwe: rule.cwe }),
      lens: rule.lens,
      pack: rule.pack,
      rule: rule.rule,
      severity: rule.severity,
      triage: rule.triage,
    },
  }), "utf8").digest("hex")
}

export function status(batches: ReadonlyArray<Batch>, query: Query): "probation" | "active" | "demoted" | "dropped" {
  const admitted = admit(batches, query)
  // A repository pack is active, but garbage admission still fails.
  if (query.repository) return "active"
  return derive(admitted, query)
}

function admit(batches: ReadonlyArray<Batch>, query: Query) {
  if (!Array.isArray(batches)) fail("precision-invalid", "batches")
  requireText(query?.project, "project")
  requireText(query?.pack, "pack")
  requireText(query?.rule, "rule")
  requireText(query?.generation, "generation")
  if (query.repository !== true && query.repository !== false) fail("precision-invalid", "repository")
  if (!COSTS.has(query.cost)) fail("precision-invalid", "cost")
  requireThresholds(query.thresholds)
  const admitted = new Map<string, Batch>()
  for (const batch of batches.map(normalize)) {
    const prior = admitted.get(batch.id)
    if (prior === undefined) {
      admitted.set(batch.id, batch)
      continue
    }
    if (canonical(prior) !== canonical(batch)) fail("precision-conflict", "batch")
  }
  const unique = [...admitted.values()]
  const orders = new Set<number>()
  for (const batch of unique) {
    if (orders.has(batch.order)) fail("precision-conflict", "order")
    orders.add(batch.order)
  }
  return unique.toSorted((left, right) => left.order - right.order)
}

function derive(batches: readonly Batch[], query: Query) {
  const matching = batches.flatMap((batch) => batch.reads.flatMap((read) => {
    if (read.pack !== query.pack || read.rule !== query.rule || read.generation !== query.generation) return []
    return [{ project: batch.project, fingerprint: read.fingerprint, confirmed: read.outcome === "confirmed" }]
  }))
  const local = matching.filter((sample) => sample.project === query.project)
  // The first local read starts a new window. It does not inherit other projects' counts.
  return fold(local.length > 0 ? local : matching, query, local.length === 0)
}

function fold(samples: readonly Sample[], query: Query, global: boolean): "probation" | "active" | "demoted" | "dropped" {
  const activateRead = query.thresholds.activate.read
  const activateShare = query.thresholds.activate.confirmed
  const demoteWindow = query.thresholds.demote.window
  const demoteBelow = query.thresholds.demote.confirmedBelow
  const dropWindow = query.cost === "high" ? query.thresholds.drop.highCostWindow : query.thresholds.drop.window
  let phase: "probation" | "active" | "demoted" | "dropped" = "probation"
  let confirmed = 0
  let demotedAt = -1
  const seen = new Set<string>()
  for (let index = 0; index < samples.length; index++) {
    if (samples[index].confirmed) confirmed += 1
    const count = index + 1
    if (phase === "probation" || phase === "active") {
      // The same step can meet both. Activation wins; a later trailing window can still demote.
      if (phase === "probation" && count >= activateRead && !strictlyBelow(confirmed, count, activateShare)) {
        phase = "active"
        continue
      }
      if (count >= demoteWindow && strictlyBelow(confirmedIn(samples, index - demoteWindow + 1, index), demoteWindow, demoteBelow)) {
        phase = "demoted"
        demotedAt = index
        remember(seen, samples, 0, index, global)
      }
      continue
    }
    if (phase === "dropped") break
    const after = index - demotedAt
    if (after < dropWindow || after % dropWindow !== 0) continue
    const start = index - dropWindow + 1
    if (hasNew(samples, start, index, seen, global)) {
      remember(seen, samples, start, index, global)
      continue
    }
    phase = "dropped"
  }
  return phase
}

function normalize(batch: Batch): Batch {
  if (batch === null || typeof batch !== "object") fail("precision-invalid", "batch")
  requireText(batch.id, "id")
  requireText(batch.project, "project")
  if (!Number.isSafeInteger(batch.order) || batch.order <= 0) fail("precision-invalid", "order")
  if (!Array.isArray(batch.reads)) fail("precision-invalid", "reads")
  return { id: batch.id, order: batch.order, project: batch.project, reads: dedupe(batch.reads) }
}

function dedupe(reads: ReadonlyArray<Read>) {
  for (const read of reads) validateRead(read)
  const sorted = reads.slice().sort((left, right) => {
    const a = sourceKey(left)
    const b = sourceKey(right)
    if (a < b) return -1
    if (a > b) return 1
    return 0
  })
  const kept = new Map<string, Read>()
  for (const read of sorted) {
    const key = sourceKey(read)
    const prior = kept.get(key)
    if (prior && prior.outcome !== read.outcome) fail("precision-conflict", "outcome")
    if (!prior) kept.set(key, read)
  }
  return [...kept.values()]
}

function validateRead(read: Read) {
  if (read === null || typeof read !== "object") fail("precision-invalid", "read")
  requireText(read.pack, "pack")
  requireText(read.rule, "rule")
  requireText(read.generation, "generation")
  requireText(read.fingerprint, "fingerprint")
  if (!OUTCOMES.has(read.outcome)) fail("precision-invalid", "outcome")
}

function sourceKey(read: Read) {
  return JSON.stringify([read.pack, read.rule, read.generation, read.fingerprint])
}

function requireThresholds(value: Query["thresholds"]) {
  if (value === null || typeof value !== "object") fail("precision-invalid", "thresholds")
  requireWindow(value.activate?.read, "activate.read")
  requireShare(value.activate?.confirmed, "activate.confirmed")
  requireWindow(value.demote?.window, "demote.window")
  requireShare(value.demote?.confirmedBelow, "demote.confirmedBelow")
  requireWindow(value.drop?.window, "drop.window")
  requireWindow(value.drop?.highCostWindow, "drop.highCostWindow")
}

function requireWindow(value: unknown, detail: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) fail("precision-invalid", detail)
}

function requireShare(value: unknown, detail: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) fail("precision-invalid", detail)
}

function requireText(value: unknown, detail: string) {
  if (typeof value !== "string" || value.length === 0) fail("precision-invalid", detail)
}

function confirmedIn(samples: readonly Sample[], start: number, end: number) {
  let confirmed = 0
  for (let index = start; index <= end; index++) if (samples[index].confirmed) confirmed += 1
  return confirmed
}

function remember(seen: Set<string>, samples: readonly Sample[], start: number, end: number, global: boolean) {
  for (let index = start; index <= end; index++) {
    const sample = samples[index]
    if (sample.confirmed) seen.add(identity(sample, global))
  }
}

function hasNew(samples: readonly Sample[], start: number, end: number, seen: ReadonlySet<string>, global: boolean) {
  for (let index = start; index <= end; index++) {
    const sample = samples[index]
    if (sample.confirmed && !seen.has(identity(sample, global))) return true
  }
  return false
}

function identity(sample: Sample, global: boolean) {
  return global ? JSON.stringify([sample.project, sample.fingerprint]) : sample.fingerprint
}

/** Direct ratio. 4/20 is the literal 0.2, so strict < does not demote. No tolerance. */
function strictlyBelow(confirmed: number, total: number, bound: number) {
  return confirmed / total < bound
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter((entry) => entry[1] !== undefined)
      .toSorted(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`
  const encoded = JSON.stringify(value)
  if (encoded === undefined) fail("precision-invalid", "canonical")
  return encoded
}

function fail(name: "precision-invalid" | "precision-conflict", detail: string): never {
  const error = new Error(detail)
  error.name = name
  throw error
}
