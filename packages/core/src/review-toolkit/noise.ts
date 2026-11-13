export * as ReviewNoise from "./noise"

import type { ReviewCatalog } from "../review/catalog"
import { ReviewItem } from "./item"
import type { ReviewSarif } from "./sarif"

// Design §8.6: the host-run pipeline between analyzer output and any model. Pure: the analyze slice runs the packs,
// writes the retained artifact and the debt artifact, and sets the retained `uri`.

/** The lens and class of an item raised for a suppression the change adds (§8.6 step 5). */
export const CHANGE_LENS = "change"
export const SUPPRESSION_CLASS = "change.suppression"
const SUPPRESSION_PACK = "suppression"
const SUPPRESSION_TRIAGE =
  "The change adds a suppression; it holds only when the suppressed finding is a false positive and the justification says why."

/** Inclusive 1-based line range in a changed file. */
export type Range = { start: number; end: number }

/** A suppression the change adds outside any tool's own report, such as an added `guardrail-ignore` or baseline entry. */
export type AddedSuppression = { path: string; line: number; endLine?: number; rule: string; snippet: string }

export type Input = {
  head: readonly ReviewSarif.Entry[]
  base?: readonly ReviewSarif.Entry[]
  changed: Readonly<Record<string, ReadonlyArray<Range>>>
  /** Host-only caller ranges. Location honours a valid overlap only when the requested tier is built Deep that runs deep. */
  blastRadius?: Readonly<Record<string, ReadonlyArray<Range>>>
  addedSuppressions?: readonly AddedSuppression[]
  tier: string
  catalog: ReviewCatalog.Catalog
}

export type Result = {
  items: Record<string, ReviewItem.ToolItem[]>
  retained: { total: number; unread: Record<string, number>; items: ReviewItem.ToolItem[] }
  debt: ReviewItem.ToolItem[]
}

type Flow = { item: ReviewItem.ToolItem; suppressed: boolean }

export function pipeline(input: Input): Result {
  const cap = itemsPerLens(input.catalog, input.tier)
  // Dropped rules do not run; an entry that still carries one is kept out before any step sees it.
  const head = normalize(input.head, input.changed)
  const split = newOnly(head, input.base && normalize(input.base, input.changed))
  // Changed lines always stay. A host blast radius also keeps an inclusive overlap on that exact path, and only when
  // the requested tier is built Deep that runs deep. Caller matches do not become changed lines. A missing map stays narrow.
  const requested = input.catalog.route.tiers.find((entry) => entry.id === input.tier)
  const admitCallers = requested !== undefined && requested.id === "deep" && requested.built && requested.runs === "deep"
  const located = split.fresh.filter(
    (flow) =>
      flow.item.onChangedLine ||
      (admitCallers &&
        (input.blastRadius?.[flow.item.path] ?? []).some(
          (range) =>
            Number.isSafeInteger(range.start) &&
            Number.isSafeInteger(range.end) &&
            range.start >= 1 &&
            range.end >= range.start &&
            range.start <= (flow.item.endLine ?? flow.item.line) &&
            range.end >= flow.item.line,
        )),
  )
  const kept = suppress(dedup(located), input.addedSuppressions ?? [])
  return { ...capPerLens(kept.toSorted(compare), cap), debt: split.debt }
}

// Step 1. The fingerprint (pack, rule, path, snippet digest) already survives line shifts; this sets `onChangedLine`
// from the change and makes every item list itself as a source.
function normalize(entries: readonly ReviewSarif.Entry[], changed: Input["changed"]): Flow[] {
  return entries
    .filter((entry) => entry.item.ruleStatus !== "dropped")
    .map((entry) => ({
      item: {
        ...entry.item,
        sources: entry.item.sources.length > 0 ? entry.item.sources : [{ pack: entry.item.pack, rule: entry.item.rule }],
        onChangedLine: (changed[entry.item.path] ?? []).some(
          (range) => range.start <= (entry.item.endLine ?? entry.item.line) && range.end >= entry.item.line,
        ),
      },
      suppressed: honoured(entry.suppressions),
    }))
}

// Step 2. A head item whose fingerprint the base also has is pre-existing and goes to debt, one base match per head
// item so a duplicated finding still counts as new. A match the change newly suppressed stays, for step 5 to raise.
// Pre-existing items the repository suppresses are honoured, so they are not debt either.
function newOnly(head: Flow[], base: Flow[] | undefined) {
  if (!base) return { fresh: head, debt: [] }
  const pending = base.reduce((map, flow) => {
    map.set(flow.item.fingerprint, [...(map.get(flow.item.fingerprint) ?? []), flow])
    return map
  }, new Map<string, Flow[]>())
  const marked = head.map((flow) => {
    const matches = pending.get(flow.item.fingerprint) ?? []
    const match = matches.find((candidate) => !(flow.suppressed && !candidate.suppressed))
    if (!match) return { flow, existing: false }
    pending.set(flow.item.fingerprint, matches.filter((candidate) => candidate !== match))
    return { flow, existing: true }
  })
  return {
    fresh: marked.filter((entry) => !entry.existing).map((entry) => entry.flow),
    debt: marked.filter((entry) => entry.existing && !entry.flow.suppressed).map((entry) => entry.flow.item),
  }
}

// Step 4. Items on one path with the same class and overlapping (or chained) ranges become one: the best-ranked
// member's record over the union of ranges, listing every source. It stays suppressed only if every member was.
function dedup(flows: Flow[]): Flow[] {
  const sorted = flows.toSorted(
    (a, b) => order(a.item.path, b.item.path) || order(a.item.class, b.item.class) || a.item.line - b.item.line,
  )
  const groups = sorted.reduce((list, flow) => {
    const last = list.at(-1)
    const lastEnd = last && Math.max(...last.map((member) => member.item.endLine ?? member.item.line))
    if (last && lastEnd !== undefined && last[0].item.path === flow.item.path && last[0].item.class === flow.item.class && flow.item.line <= lastEnd) {
      last.push(flow)
      return list
    }
    list.push([flow])
    return list
  }, [] as Flow[][])
  return groups.map((group) => {
    if (group.length === 1) return group[0]
    const primary = group.map((member) => member.item).toSorted(compare)[0]
    const end = Math.max(...group.map((member) => member.item.endLine ?? member.item.line))
    const line = Math.min(...group.map((member) => member.item.line))
    // When `end` equals `line` every member sits on that one line, so the primary's own `endLine` is absent or `line`.
    return {
      item: {
        ...primary,
        line,
        ...(end > line ? { endLine: end } : {}),
        sources: group
          .flatMap((member) => member.item.sources)
          .filter((source, index, all) => all.findIndex((other) => other.pack === source.pack && other.rule === source.rule) === index),
        onChangedLine: group.some((member) => member.item.onChangedLine),
      },
      suppressed: group.every((member) => member.suppressed),
    }
  })
}

// Step 5. A suppressed item that survives new-only and location is one the change suppressed: it never surfaces as
// itself, only as an item for the change lens. Suppressions the change adds outside tool reports join them.
function suppress(flows: Flow[], added: readonly AddedSuppression[]) {
  return [
    ...flows.map((flow) => (flow.suppressed ? raise(flow.item) : flow.item)),
    ...added.map((entry): ReviewItem.ToolItem => {
      const digest = ReviewItem.snippetDigest(entry.snippet)
      return {
        fingerprint: ReviewItem.fingerprint({ pack: SUPPRESSION_PACK, rule: entry.rule, path: entry.path, snippetDigest: digest }),
        class: SUPPRESSION_CLASS,
        lens: CHANGE_LENS,
        pack: SUPPRESSION_PACK,
        rule: entry.rule,
        ruleStatus: "probation",
        severity: "P2",
        path: entry.path,
        line: entry.line,
        ...(entry.endLine !== undefined && entry.endLine > entry.line ? { endLine: entry.endLine } : {}),
        snippetDigest: digest,
        sources: [{ pack: SUPPRESSION_PACK, rule: entry.rule }],
        triage: SUPPRESSION_TRIAGE,
        onChangedLine: true,
      }
    }),
  ]
}

// The raised item keeps the suppressed finding's rule, severity and status, so a suppression of a demoted rule stays
// out of model reach like the rule itself.
function raise(item: ReviewItem.ToolItem): ReviewItem.ToolItem {
  return {
    ...item,
    fingerprint: ReviewItem.fingerprint({
      pack: SUPPRESSION_PACK,
      rule: `${item.pack}/${item.rule}`,
      path: item.path,
      snippetDigest: item.snippetDigest,
    }),
    class: SUPPRESSION_CLASS,
    lens: CHANGE_LENS,
    triage: SUPPRESSION_TRIAGE,
  }
}

// Step 7. Demoted rules are artifact only: they never take a slot. Everything past the cap stays retained, in rank order.
function capPerLens(ranked: ReviewItem.ToolItem[], cap: number) {
  const items = ranked
    .filter((item) => item.ruleStatus !== "demoted")
    .reduce((lenses, item) => {
      const list = lenses[item.lens] ?? []
      if (list.length < cap) lenses[item.lens] = [...list, item]
      return lenses
    }, {} as Record<string, ReviewItem.ToolItem[]>)
  const shown = new Set(Object.values(items).flat())
  const retained = ranked.filter((item) => !shown.has(item))
  return {
    items,
    retained: {
      total: retained.length,
      unread: retained.reduce((counts, item) => {
        counts[item.lens] = (counts[item.lens] ?? 0) + 1
        return counts
      }, {} as Record<string, number>),
      items: retained,
    },
  }
}

const SEVERITY = { P0: 0, P1: 1, P2: 2, P3: 3 }
const STATUS = { active: 0, probation: 1, demoted: 2, dropped: 3 }

// Step 6: severity, then rule status (active before probation), then agreement between independent packs, then on a
// changed line; path, line and fingerprint only make the order total.
function compare(a: ReviewItem.ToolItem, b: ReviewItem.ToolItem) {
  return (
    SEVERITY[a.severity] - SEVERITY[b.severity] ||
    STATUS[a.ruleStatus] - STATUS[b.ruleStatus] ||
    agreement(b) - agreement(a) ||
    Number(b.onChangedLine) - Number(a.onChangedLine) ||
    order(a.path, b.path) ||
    a.line - b.line ||
    order(a.fingerprint, b.fingerprint)
  )
}

function agreement(item: ReviewItem.ToolItem) {
  return new Set(item.sources.map((source) => source.pack)).size
}

function order(a: string, b: string) {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

// SARIF: a suppression without a status, or `accepted`, suppresses; `underReview` and `rejected` do not.
function honoured(suppressions: readonly ReviewSarif.Suppression[]) {
  return suppressions.some((suppression) => suppression.status === undefined || suppression.status === "accepted")
}

// The cap of the tier the route actually runs: an unbuilt tier runs another and takes its budget (R3).
function itemsPerLens(catalog: ReviewCatalog.Catalog, id: string) {
  const tier = catalog.route.tiers.find((entry) => entry.id === id)
  if (!tier) throw new Error(`Unknown review tier: ${id}`)
  return (catalog.route.tiers.find((entry) => entry.id === tier.runs) ?? tier).budget.itemsPerLens
}
