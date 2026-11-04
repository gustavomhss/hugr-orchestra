import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewItem } from "../../src/review-toolkit/item"
import { ReviewNoise } from "../../src/review-toolkit/noise"
import { ReviewSarif } from "../../src/review-toolkit/sarif"

const catalog = ReviewCatalog.current

function entry(input: {
  pack?: string
  rule?: string
  class?: string
  lens?: string
  path?: string
  line: number
  endLine?: number
  snippet?: string
  severity?: ReviewItem.Severity
  status?: ReviewItem.RuleStatus
  suppressions?: ReviewSarif.Suppression[]
}): ReviewSarif.Entry {
  const pack = input.pack ?? "opengrep"
  const rule = input.rule ?? "js.eval"
  const path = input.path ?? "src/app.ts"
  const digest = ReviewItem.snippetDigest(input.snippet ?? `snippet at ${input.line}`)
  return {
    item: {
      fingerprint: ReviewItem.fingerprint({ pack, rule, path, snippetDigest: digest }),
      class: input.class ?? "security.boundary",
      lens: input.lens ?? "security",
      pack,
      rule,
      ruleStatus: input.status ?? "probation",
      severity: input.severity ?? "P2",
      path,
      line: input.line,
      ...(input.endLine === undefined ? {} : { endLine: input.endLine }),
      snippetDigest: digest,
      sources: [{ pack, rule }],
      triage: "triage",
      onChangedLine: false,
    },
    suppressions: input.suppressions ?? [],
  }
}

const everything = { "src/app.ts": [{ start: 1, end: 1000 }], "src/other.ts": [{ start: 1, end: 1000 }] }

const run = (input: Partial<ReviewNoise.Input> & { head: ReviewSarif.Entry[] }) =>
  ReviewNoise.pipeline({ changed: everything, tier: "standard", catalog, ...input })

const all = (result: ReviewNoise.Result) => Object.values(result.items).flat()

describe("review noise pipeline", () => {
  test("normalize: the fingerprint survives a line shift and onChangedLine comes from the change", () => {
    const before = entry({ line: 10, snippet: "eval(req.body)" })
    const after = entry({ line: 42, snippet: "    eval(req.body)" })
    expect(after.item.fingerprint).toBe(before.item.fingerprint)

    const result = run({
      head: [entry({ line: 5, snippet: "a" }), entry({ line: 20, endLine: 24, snippet: "b" })],
      changed: { "src/app.ts": [{ start: 22, end: 30 }, { start: 5, end: 5 }] },
    })
    const items = all(result)
    expect(items.map((item) => item.line)).toEqual([5, 20])
    expect(items.every((item) => item.onChangedLine)).toBe(true)
    items.forEach((item) => expect(Schema.decodeUnknownSync(ReviewItem.ToolItem)(item)).toEqual(item))
  })

  test("new only: items the base already has go to debt, one base match per head item", () => {
    const old = entry({ line: 10, snippet: "eval(req.body)" })
    const result = run({
      base: [old],
      head: [
        entry({ line: 30, snippet: "eval(req.body)" }),
        entry({ line: 31, snippet: "eval(req.body)" }),
        entry({ line: 50, snippet: "eval(req.query)" }),
      ],
    })
    expect(result.debt).toHaveLength(1)
    expect(result.debt[0].fingerprint).toBe(old.item.fingerprint)
    expect(all(result).map((item) => item.line).toSorted((a, b) => a - b)).toEqual([31, 50])
  })

  test("location: items off changed lines are dropped", () => {
    const result = run({
      head: [entry({ line: 3 }), entry({ line: 8, endLine: 12 }), entry({ line: 40 }), entry({ path: "src/other.ts", line: 3 })],
      changed: { "src/app.ts": [{ start: 10, end: 20 }, { start: 3, end: 3 }] },
    })
    expect(all(result).map((item) => [item.path, item.line])).toEqual([["src/app.ts", 3], ["src/app.ts", 8]])
    expect(result.retained.total).toBe(0)
  })

  test("dedup: same class and overlapping ranges become one item listing every source", () => {
    const result = run({
      head: [
        entry({ pack: "opengrep", rule: "js.eval", line: 10, endLine: 12, severity: "P2" }),
        entry({ pack: "semgrep", rule: "eval-use", line: 12, endLine: 15, severity: "P1" }),
        entry({ pack: "bearer", rule: "eval", line: 15, severity: "P2" }),
        entry({ pack: "semgrep", rule: "other", class: "security.secret", line: 11 }),
        entry({ pack: "semgrep", rule: "eval-use", line: 30 }),
      ],
    })
    const items = all(result)
    expect(items).toHaveLength(3)
    const merged = items.find((item) => item.sources.length > 1)
    expect(merged).toMatchObject({ pack: "semgrep", rule: "eval-use", severity: "P1", line: 10, endLine: 15 })
    expect(merged?.sources).toEqual([
      { pack: "opengrep", rule: "js.eval" },
      { pack: "semgrep", rule: "eval-use" },
      { pack: "bearer", rule: "eval" },
    ])
  })

  test("suppressions: the repo's are honoured and the ones the change adds are items for the change lens", () => {
    const suppressed = [{ kind: "inSource" as const }]
    const kept = entry({ line: 10, snippet: "kept", suppressions: suppressed })
    const newlySuppressed = entry({ line: 20, snippet: "newly", suppressions: suppressed })
    const result = run({
      base: [kept, entry({ line: 20, snippet: "newly" })],
      head: [
        kept,
        newlySuppressed,
        entry({ line: 30, snippet: "new and suppressed", suppressions: [{ kind: "external", status: "accepted" }] }),
        entry({ line: 40, snippet: "under review", suppressions: [{ kind: "inSource", status: "underReview" }] }),
      ],
      addedSuppressions: [{ path: "src/other.ts", line: 7, rule: "baseline", snippet: "baseline entry for src/other.ts:7" }],
    })
    expect(result.debt).toEqual([])
    expect(result.items.security.map((item) => item.line)).toEqual([40])
    const change = result.items[ReviewNoise.CHANGE_LENS]
    expect(change.map((item) => [item.path, item.line])).toEqual([["src/app.ts", 20], ["src/app.ts", 30], ["src/other.ts", 7]])
    expect(change.every((item) => item.class === ReviewNoise.SUPPRESSION_CLASS)).toBe(true)
    expect(change[0].fingerprint).not.toBe(newlySuppressed.item.fingerprint)
    expect(change[0].sources).toEqual([{ pack: "opengrep", rule: "js.eval" }])
    expect(change[2]).toMatchObject({ pack: "suppression", rule: "baseline", onChangedLine: true })
    change.forEach((item) => expect(Schema.decodeUnknownSync(ReviewItem.ToolItem)(item)).toEqual(item))
  })

  test("rank: severity, then rule status, then agreement, then on a changed line", () => {
    const result = run({
      head: [
        entry({ line: 100, severity: "P2", status: "probation" }),
        entry({ line: 200, severity: "P2", status: "active" }),
        entry({ line: 300, severity: "P0", status: "probation" }),
        entry({ pack: "a", rule: "r", line: 400, severity: "P2", status: "probation" }),
        entry({ pack: "b", rule: "r", line: 400, severity: "P2", status: "probation" }),
      ],
    })
    expect(result.items.security.map((item) => [item.line, item.sources.length])).toEqual([
      [300, 1],
      [200, 1],
      [400, 2],
      [100, 1],
    ])
  })

  test("cap per lens: the tier's cap, the rest retained and counted per lens", () => {
    const head = [
      ...Array.from({ length: 7 }, (_, index) => entry({ line: 10 * (index + 1), severity: index < 2 ? "P0" : "P3" })),
      entry({ lens: "tests", class: "tests.missing", line: 500 }),
    ]
    const quick = run({ head, tier: "quick" })
    expect(quick.items.security).toHaveLength(5)
    expect(quick.items.security.slice(0, 2).map((item) => item.severity)).toEqual(["P0", "P0"])
    expect(quick.items.tests).toHaveLength(1)
    expect(quick.retained.total).toBe(2)
    expect(quick.retained.unread).toEqual({ security: 2 })
    expect(quick.retained.items.map((item) => item.line)).toEqual([60, 70])

    // Deep is unbuilt and runs Standard, so it takes Standard's cap.
    const deep = run({ head: Array.from({ length: 20 }, (_, index) => entry({ line: index + 1 })), tier: "deep" })
    expect(deep.items.security).toHaveLength(15)
    expect(deep.retained.unread).toEqual({ security: 5 })
    expect(() => run({ head, tier: "nope" })).toThrow("Unknown review tier: nope")
  })

  test("demoted rules are never returned and dropped rules are never present", () => {
    const result = run({
      base: [entry({ line: 1, snippet: "old dropped", status: "dropped" })],
      head: [
        entry({ line: 1, snippet: "old dropped", status: "dropped" }),
        entry({ line: 10, status: "demoted", severity: "P0" }),
        entry({ line: 20, status: "dropped", severity: "P0" }),
        entry({ line: 30, status: "demoted", suppressions: [{ kind: "inSource" }] }),
        entry({ line: 40 }),
      ],
    })
    expect(all(result).map((item) => item.line)).toEqual([40])
    expect(result.retained.items.map((item) => [item.lens, item.line])).toEqual([["security", 10], ["change", 30]])
    expect(result.retained.unread).toEqual({ security: 1, change: 1 })
    const present = [...all(result), ...result.retained.items, ...result.debt]
    expect(present.some((item) => item.ruleStatus === "dropped")).toBe(false)
  })

  test("end to end: the steps apply in order", () => {
    const old = entry({ pack: "opengrep", rule: "js.eval", line: 5, snippet: "eval(old)", severity: "P0" })
    const result = run({
      tier: "quick",
      base: [old],
      changed: { "src/app.ts": [{ start: 10, end: 80 }] },
      head: [
        // Pre-existing, shifted from line 5 to 60: debt, even though it is on a changed line.
        entry({ pack: "opengrep", rule: "js.eval", line: 60, snippet: "eval(old)", severity: "P0" }),
        // Off the changed lines: dropped, even at P0.
        entry({ pack: "bearer", rule: "eval", line: 7, endLine: 9, severity: "P0" }),
        // Two packs on one range: one item, ranked first by agreement among the P1s.
        entry({ pack: "opengrep", rule: "js.eval", line: 10, endLine: 11, severity: "P1" }),
        entry({ pack: "semgrep", rule: "eval-use", line: 11, severity: "P1" }),
        // A merged pair whose members are both suppressed by the change: raised once for the change lens.
        entry({ pack: "opengrep", rule: "js.eval", line: 20, suppressions: [{ kind: "inSource" }] }),
        entry({ pack: "semgrep", rule: "eval-use", line: 20, suppressions: [{ kind: "inSource" }] }),
        ...Array.from({ length: 6 }, (_, index) => entry({ line: 30 + index, severity: "P1" })),
      ],
    })
    expect(result.debt.map((item) => item.line)).toEqual([60])
    expect(result.items.security.map((item) => [item.line, item.sources.length])).toEqual([
      [10, 2],
      [30, 1],
      [31, 1],
      [32, 1],
      [33, 1],
    ])
    expect(result.items.change.map((item) => [item.line, item.sources.length])).toEqual([[20, 2]])
    expect(result.retained).toEqual({
      total: 2,
      unread: { security: 2 },
      items: result.retained.items,
    })
    expect(result.retained.items.map((item) => item.line)).toEqual([34, 35])
  })
})
