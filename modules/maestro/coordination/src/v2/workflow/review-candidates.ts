export * as ReviewCandidatesV2 from "./review-candidates"

import { ReviewCatalog } from "@orchestra/core/review/catalog"
import type { ReviewOutcomes } from "@orchestra/core/review/outcomes"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { ReviewItem } from "@orchestra/core/review-toolkit/item"
import type { ReviewResultV2 } from "../governance/review-result"

const QUOTE_NODE = "lucy-review-prove-quote"
const SEVERITY = { P0: 0, P1: 1, P2: 2, P3: 3 } as const
type Tier = ReviewCatalog.Catalog["route"]["tiers"][number]

export type Merged = Omit<ReviewResultV2.Candidate, "source"> & {
  readonly id: string
  readonly fingerprint: string
  readonly lenses: ReadonlyArray<string>
  readonly sources: ReadonlyArray<string>
  readonly agreement: number
  readonly observation: boolean
}

// Fingerprint dedup across lens children and Deep samples. Agreement is unique (lens, sample) pairs plus overlapping
// analyzer items, never duplicate emissions of one lens sample. It only orders the queue.
export function decisionState(state: string | undefined) {
  if (state === "confirmed") return "confirmed" as const
  if (state === "dropped") return "refuted" as const
  return "question" as const
}

export function admitSources(candidates: ReadonlyArray<ReviewResultV2.Candidate>, items: ReadonlyArray<ReviewItem.ToolItem>) {
  const sources: Array<string | undefined> = []
  const invalid: string[] = []
  for (const candidate of candidates) {
    if (!candidate.source) {
      sources.push(undefined)
      continue
    }
    const end = candidate.endLine ?? candidate.line
    const overlaps = items.some((entry) => entry.fingerprint === candidate.source && entry.class === candidate.class && entry.path === candidate.path && entry.line <= end && (entry.endLine ?? entry.line) >= candidate.line)
    if (!overlaps) {
      invalid.push(candidate.source)
      sources.push(undefined)
      continue
    }
    sources.push(candidate.source)
  }
  return { sources, invalid }
}

export function outcomeDecisions(
  settled: ReadonlyArray<{ readonly candidate: Merged; readonly result?: { readonly state: string } }>,
  overflow: ReadonlyArray<Merged>,
): ReviewOutcomes.Decision[] {
  const decided = [
    ...settled.map((item) => ({
      candidate: item.candidate,
      state: decisionState(item.result?.state),
    })),
    ...overflow.map((candidate) => ({ candidate, state: "question" as const })),
  ]
  return decided.flatMap((item) => item.candidate.sources.map((source) => ({
    source,
    class: item.candidate.class,
    path: item.candidate.path,
    line: item.candidate.line,
    ...(item.candidate.endLine ? { endLine: item.candidate.endLine } : {}),
    state: item.state,
  })))
}

export function omitSource(candidate: ReviewResultV2.Candidate) {
  const { source: claimed, ...without } = candidate
  void claimed
  return without
}

export function claimKey(fingerprint: string, candidate: { readonly line: number; readonly endLine?: number }) {
  return JSON.stringify([fingerprint, candidate.line, candidate.endLine ?? candidate.line])
}

export function merge(
  returns: ReadonlyArray<{
    readonly lens: string
    /** Zero when a caller predates sampling. */
    readonly sample?: number
    readonly candidates: ReadonlyArray<ReviewResultV2.Candidate>
    readonly observations: ReviewResultV2.LensReturn["observations"]
    readonly sources: ReadonlyArray<string | undefined>
  }>,
  items: ReadonlyArray<ReviewItem.ToolItem>,
  catalog: ReviewCatalog.Catalog,
): Merged[] {
  const raised = returns.flatMap((value) => [
    ...value.candidates.map((candidate, index) => {
      const source = value.sources[index]
      return {
        candidate,
        lens: value.lens,
        sample: value.sample ?? 0,
        observation: false,
        sources: source ? [source] : [],
      }
    }),
    ...value.observations.map((item) => ({
      candidate: {
        class: item.class,
        node:
          catalog.lenses.find((lens) => lens.classes.includes(item.class))?.node ??
          catalog.classes.find((entry) => entry.id === item.class)?.node ??
          QUOTE_NODE,
        path: item.path,
        line: item.line,
        severity: "P3" as const,
        trigger: item.text,
        quote: item.text,
      },
      lens: value.lens,
      sample: value.sample ?? 0,
      observation: true,
      sources: [] as string[],
    })),
  ])
  const keyed = raised.map((item) => ({
    ...item,
    fingerprint: ReviewItem.fingerprint({
      pack: "lucy",
      rule: item.candidate.class,
      path: item.candidate.path,
      snippetDigest: ReviewItem.snippetDigest(item.candidate.quote),
    }),
  }))
  // Fingerprint is line-independent. Grouping by it alone would settle a source at a line the verifier never saw.
  const places = unique(keyed.map((item) => claimKey(item.fingerprint, item.candidate)))
  const ranked = places
    .map((place) => {
      const group = keyed.filter((item) => claimKey(item.fingerprint, item.candidate) === place)
      const fingerprint = group[0].fingerprint
      const best = group.toSorted((left, right) => SEVERITY[left.candidate.severity] - SEVERITY[right.candidate.severity] || Number(left.observation) - Number(right.observation))[0]
      const end = "endLine" in best.candidate ? best.candidate.endLine ?? best.candidate.line : best.candidate.line
      const tools = items.filter(
        (item) => item.class === best.candidate.class && item.path === best.candidate.path && item.line <= end && (item.endLine ?? item.line) >= best.candidate.line,
      ).length
      const lenses = unique(group.map((item) => item.lens))
      const rest = "source" in best.candidate && best.candidate.source ? omitSource(best.candidate) : best.candidate
      return {
        ...rest,
        fingerprint,
        lenses,
        sources: unique(group.flatMap((item) => item.sources)),
        agreement: unique(group.map((item) => JSON.stringify([item.lens, item.sample]))).length + tools,
        observation: group.every((item) => item.observation),
      }
    })
    .toSorted(
      (left, right) =>
        Number(left.observation) - Number(right.observation) ||
        SEVERITY[left.severity] - SEVERITY[right.severity] ||
        right.agreement - left.agreement ||
        (left.path < right.path ? -1 : left.path > right.path ? 1 : 0) ||
        left.line - right.line,
    )
  return ranked.map((candidate, index) => ({ ...candidate, id: `C${index + 1}` }))
}

// At most three options for the candidate's class and language, each on a rung its tier allows for its severity.
export function options(catalog: ReviewCatalog.Catalog, tier: Tier, record: ReviewRouting.Record, candidate: Merged) {
  const entry = catalog.classes.find((item) => item.id === candidate.class)
  if (!entry) return []
  const language = record.languages.map((item) => item.id).find((id) => entry.options[id])
  return (entry.options[language ?? "*"] ?? entry.options["*"] ?? [])
    .filter((option) => {
      const rung = catalog.options.find((item) => item.id === option.option)?.rung
      return rung !== undefined && tier.rungs[rung].includes(candidate.severity)
    })
    .slice(0, 3)
    .map((option) => ({ id: option.option, proves: option.proves }))
}

function unique<T>(items: ReadonlyArray<T>) {
  return Array.from(new Set(items))
}
