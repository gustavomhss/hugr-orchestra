export * as ReviewChecksV2 from "./review-checks"

import type { ReviewAnalyze } from "@orchestra/core/review-toolkit/analyze"
import type { ReviewProbe } from "@orchestra/core/review-toolkit/probe"
import type { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { ReviewSettings } from "@orchestra/core/review/settings"
import { Schema } from "effect"
import { ReviewResultV2 } from "../governance/review-result"

// Host check evidence (docs/specs/lucy/host-check-freeze.md). Facts come from the host inputs below, never from a model card.

export const Facts = Schema.Struct({
  checks: ReviewResultV2.Card.fields.checks,
  required: Schema.Array(Schema.NonEmptyString),
  repository: Schema.Array(Schema.NonEmptyString),
  blockers: ReviewResultV2.Card.fields.blockers,
})
export type Facts = typeof Facts.Type

type Check = Facts["checks"][number]
type Blocker = Facts["blockers"][number]

export function collect(input: {
  readonly routing: ReviewRouting.Record
  readonly checks: ReadonlyArray<ReviewAnalyze.Check>
  readonly catalog: ReviewCatalog.Catalog
  readonly settings: ReviewSettings.Input | undefined
  readonly entryBlockers?: Facts["blockers"]
  readonly probes?: ReadonlyArray<ReviewProbe.Observed>
}): Facts {
  const accepted = new Set(ReviewSettings.read(input.settings ?? {}).acceptedUnavailable)
  const accepts = (id: string, lane?: string) => accepted.has(id) || (lane !== undefined && accepted.has(lane))
  const projected = input.checks.map((check) => projectAnalyzer(check, accepts))
  const probeRows = (input.probes ?? []).map((probe) => projectProbe(probe, accepts))
  const requiredPacks = input.routing.packs.filter((pack) => pack.status === "routed" || pack.source === "path")
  const produced = new Set(projected.flatMap((check) => (check.pack ? [check.pack] : [])))
  const missing = requiredPacks.flatMap((pack) => (produced.has(pack.id) ? [] : [missingCheck(pack, accepts)]))
  const analyzerRows = [...projected, ...missing]
  const checks = sort(dedupe([...analyzerRows, ...probeRows]))
  const requiredIds = new Set(requiredPacks.map((pack) => pack.id))
  const required = listed([
    ...analyzerRows.flatMap((check) => (requiredIds.has(check.pack ?? "") ? [identity(check)] : [])),
    ...probeRows.map((check) => identity(check)),
  ])
  const blockers = derived(checks, new Set(required), input.entryBlockers ?? [])
  const repositoryPacks = new Set<string>(input.catalog.packs.flatMap((pack) => (pack.backend === "repo" ? [pack.id] : [])))
  const repository = listed(analyzerRows.flatMap((check) => (repositoryPacks.has(check.pack ?? "") ? [identity(check)] : [])))
  return { checks, required, repository, blockers }
}

export function validate(card: ReviewResultV2.Card, facts: Facts): void {
  const admitted = requireFacts(facts)
  if (!sameChecks(card.checks, admitted.checks)) throw new Error("checks-mismatch")
  if (admitted.blockers.length > 0 && card.outcome !== "blocked") throw new Error("checks-blocked")
  if (admitted.blockers.some((blocker) => count(card.blockers, blocker) !== 1)) throw new Error("checks-blocked")
  if (card.verdict === "APPROVE" && requiredCommandFailed(admitted)) throw new Error("checks-blocked")
}

/** Pre-publication receipt gate. A blocked card has no verdict, so validate does not call this. */
export function authorize(verdict: string, facts: Facts): void {
  const admitted = requireFacts(facts)
  if (admitted.blockers.length > 0) throw new Error("checks-blocked")
  if (verdict === "APPROVE" && requiredCommandFailed(admitted)) throw new Error("checks-blocked")
}

const decodeFacts = Schema.decodeUnknownSync(Facts)

function requireFacts(facts: unknown): Facts {
  try {
    return decodeFacts(facts, { onExcessProperty: "error" })
  } catch {
    throw new Error("checks-mismatch")
  }
}

function projectAnalyzer(check: ReviewAnalyze.Check, accepts: (id: string, lane?: string) => boolean): Check {
  const status = check.status === "not-run" ? "check-unavailable" : check.status
  return projected(check, status, status === "check-unavailable" && accepts(check.id, check.lane))
}

function projectProbe(probe: ReviewProbe.Observed, accepts: (id: string, lane?: string) => boolean): Check {
  const id = `probe:${probe.candidate}:${probe.option}:${probe.result.uri}`
  const status = probe.result.status === "not-run" ? "check-unavailable" : probe.result.status
  return projected(
    {
      id,
      pack: "review-probe",
      lane: probe.option,
      version: "review-v2",
      reason: probe.result.reason,
      workspaceExecuted: probe.result.status !== "not-run",
    },
    status,
    status === "check-unavailable" && accepts(id, probe.option),
  )
}

function missingCheck(pack: ReviewRouting.Pack, accepts: (id: string, lane?: string) => boolean): Check {
  return projected(
    {
      id: pack.id,
      pack: pack.id,
      lane: pack.lane,
      version: "unknown",
      reason: "required pack produced no host check",
      workspaceExecuted: false,
    },
    "check-unavailable",
    accepts(pack.id, pack.lane),
  )
}

function projected(
  check: {
    readonly id: string
    readonly pack?: string
    readonly lane?: string
    readonly version?: string
    readonly reason?: string
    readonly workspaceExecuted: boolean
  },
  status: Check["status"],
  accepted: boolean,
): Check {
  return {
    id: check.id,
    ...(check.lane ? { lane: check.lane } : {}),
    ...(check.pack ? { pack: check.pack } : {}),
    ...(check.version ? { version: check.version } : {}),
    status,
    ...(check.reason ? { reason: check.reason } : {}),
    workspaceExecuted: check.workspaceExecuted,
    // Acquisition errors stay unaccepted. Only projected unavailability carries the host boolean.
    ...(status === "check-unavailable" ? { accepted } : {}),
  }
}

function derived(checks: readonly Check[], required: ReadonlySet<string>, entry: readonly Blocker[]): Blocker[] {
  return checks.reduce<Blocker[]>((blockers, check) => {
    if (!required.has(identity(check))) return blockers
    if (check.status === "acquisition-error") return add(blockers, blocker("acquisition-error", check))
    if (check.status === "check-unavailable" && check.accepted !== true) return add(blockers, blocker("check-unavailable", check))
    return blockers
  }, canonical(entry))
}

function canonical(blockers: readonly Blocker[]) {
  return blockers.reduce<Blocker[]>((kept, blocker) => add(kept, blocker), [])
}

function blocker(kind: string, check: Check): Blocker {
  return { kind, reason: check.reason ?? kind, ref: identity(check) }
}

function add(blockers: readonly Blocker[], next: Blocker): Blocker[] {
  if (blockers.some((item) => sameBlocker(item, next))) return [...blockers]
  return [...blockers, next]
}

function dedupe(checks: readonly Check[]): Check[] {
  const seen = new Map<string, Check>()
  for (const check of checks) {
    const key = identity(check)
    const prior = seen.get(key)
    if (!prior) {
      seen.set(key, check)
      continue
    }
    if (shape(prior) !== shape(check)) throw new Error("checks-mismatch")
  }
  return [...seen.values()]
}

function sort(checks: readonly Check[]) {
  return [...checks].sort((left, right) => compare(identity(left), identity(right)))
}

function sameChecks(card: readonly Check[], facts: readonly Check[]) {
  const left = card.map(identity)
  if (new Set(left).size !== left.length || left.length !== facts.length) return false
  const factsById = new Map(facts.map((check) => [identity(check), check]))
  return card.every((check) => shape(factsById.get(identity(check)) ?? check) === shape(check) && factsById.has(identity(check)))
}

// facts.repository is analyzer and synthetic host checks whose execution-catalog pack has backend:"repo".
// Probe rows are a separate host source: a catalog pack id of review-probe does not make them command exits.
// It is not ReviewCatalog.current and not a model pack label. A native scanner fail stays fail.
// Acquisition errors and unaccepted unavailability still block every required pack. Finding severity is not decided here.
function requiredCommandFailed(facts: Facts) {
  const required = new Set(facts.required)
  const repository = new Set(facts.repository)
  return facts.checks.some(
    (check) => required.has(identity(check)) && repository.has(identity(check)) && check.status === "fail",
  )
}

function count(blockers: readonly Blocker[], blocker: Blocker) {
  return blockers.filter((item) => sameBlocker(item, blocker)).length
}

function sameBlocker(left: Blocker, right: Blocker) {
  return left.kind === right.kind && left.reason === right.reason && left.code === right.code && left.ref === right.ref
}

function identity(check: Check) {
  return JSON.stringify([check.pack ?? "", check.lane ?? "", check.id])
}

function shape(check: Check) {
  return JSON.stringify([
    check.id,
    check.lane ?? null,
    check.pack ?? null,
    check.version ?? null,
    check.status,
    check.reason ?? null,
    check.workspaceExecuted ?? null,
    check.accepted ?? null,
  ])
}

function listed(identities: readonly string[]) {
  return [...new Set(identities)].sort(compare)
}

function compare(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
