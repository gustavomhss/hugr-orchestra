import { describe, expect, test } from "bun:test"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewItem } from "../../src/review-toolkit/item"
import { ReviewNoise } from "../../src/review-toolkit/noise"
import { ReviewSarif } from "../../src/review-toolkit/sarif"

const deep = {
  ...ReviewCatalog.current,
  route: {
    ...ReviewCatalog.current.route,
    tiers: ReviewCatalog.current.route.tiers.map((tier) => tier.id === "deep" ? { ...tier, built: true, runs: "deep" } : tier),
  },
}
const changed = { "src/changed.ts": [{ start: 5, end: 5 }] }
const blastRadius = { "src/caller.ts": [{ start: 40, end: 44 }] }
const head = [entry("src/changed.ts", 5), entry("src/caller.ts", 42), entry("src/unrelated.ts", 42)]
const items = (result: ReviewNoise.Result) => Object.values(result.items).flat()

function entry(path: string, line: number, options: { endLine?: number; severity?: ReviewItem.Severity } = {}): ReviewSarif.Entry {
  const digest = ReviewItem.snippetDigest(`${path}:${line}`)
  return {
    item: {
      fingerprint: ReviewItem.fingerprint({ pack: "fixture", rule: "fixture-rule", path, snippetDigest: digest }),
      class: "logic.invariant", lens: "correctness-logic", pack: "fixture", rule: "fixture-rule",
      ruleStatus: "probation", severity: options.severity ?? "P2", path, line, ...(options.endLine === undefined ? {} : { endLine: options.endLine }), snippetDigest: digest,
      sources: [{ pack: "fixture", rule: "fixture-rule" }], triage: "prove the invariant", onChangedLine: false,
    },
    suppressions: [],
  }
}

describe("Deep host-observed caller locations", () => {
  test("a built Deep tier admits only changed lines and explicit caller ranges", () => {
    const scoped = [...head, entry("src/caller.ts", 39), entry("src/caller.ts", 45), entry("src/caller.ts", 40), entry("src/caller.ts", 44)]
    const result = ReviewNoise.pipeline({ head: scoped, changed, blastRadius, tier: "deep", catalog: deep })
    expect(items(result).map((item) => [item.path, item.line, item.onChangedLine])).toEqual([
      ["src/changed.ts", 5, true], ["src/caller.ts", 40, false], ["src/caller.ts", 42, false], ["src/caller.ts", 44, false],
    ])
    expect(items(ReviewNoise.pipeline({ head: [entry("src/caller.ts", 38, { endLine: 42 })], changed, blastRadius, tier: "deep", catalog: deep })).map((item) => item.line)).toEqual([38])
    const multiple = { "src/caller.ts": [{ start: 1, end: 2 }, { start: 40, end: 44 }] }
    expect(items(ReviewNoise.pipeline({ head, changed, blastRadius: multiple, tier: "deep", catalog: deep })).map((item) => item.path))
      .toEqual(["src/changed.ts", "src/caller.ts"])
    expect(items(ReviewNoise.pipeline({ head, changed, tier: "deep", catalog: deep })).map((item) => item.path))
      .toEqual(["src/changed.ts"])
  })

  test("Quick, Standard and unbuilt Deep keep changed-line-only behavior", () => {
    for (const tier of ["quick", "standard"]) {
      expect(items(ReviewNoise.pipeline({ head, changed, blastRadius, tier, catalog: deep })).map((item) => item.path))
        .toEqual(["src/changed.ts"])
    }
    const unbuilt = { ...deep, route: { ...deep.route, tiers: deep.route.tiers.map((tier) => tier.id === "deep" ? { ...tier, built: false } : tier) } }
    expect(items(ReviewNoise.pipeline({ head, changed, blastRadius, tier: "deep", catalog: unbuilt })).map((item) => item.path)).toEqual(["src/changed.ts"])
    expect(ReviewCatalog.current.route.tiers.find((tier) => tier.id === "deep")?.built).toBe(false)
    const fallback = { ...deep, route: { ...deep.route, tiers: deep.route.tiers.map((tier) => tier.id === "deep" ? { ...tier, runs: "standard" } : tier) } }
    expect(items(ReviewNoise.pipeline({ head, changed, blastRadius, tier: "deep", catalog: fallback })).map((item) => item.path)).toEqual(["src/changed.ts"])
    expect(items(ReviewNoise.pipeline({ head, changed, blastRadius, tier: "deep", catalog: ReviewCatalog.current })).map((item) => item.path))
      .toEqual(["src/changed.ts"])
  })

  test("caller admission preserves new-only debt and suppression handling", () => {
    const old = entry("src/caller.ts", 42)
    const debt = ReviewNoise.pipeline({ head: [old], base: [old], changed, blastRadius, tier: "deep", catalog: deep })
    expect(items(debt)).toEqual([])
    expect(debt.debt).toEqual([old.item])
    const suppressed = ReviewNoise.pipeline({ head: [{ ...old, suppressions: [{ kind: "inSource", status: "accepted" }] }], base: [], changed, blastRadius, tier: "deep", catalog: deep })
    expect(items(suppressed).map((item) => [item.class, item.lens])).toEqual([["change.suppression", "change"]])
  })

  test("caller findings retain probation and severity, and changed lines win the final rank tie", () => {
    const capped = { ...deep, route: { ...deep.route, tiers: deep.route.tiers.map((tier) => tier.id === "deep" ? { ...tier, budget: { ...tier.budget, itemsPerLens: 1 } } : tier) } }
    const result = ReviewNoise.pipeline({ head: head.slice(0, 2), changed, blastRadius, tier: "deep", catalog: capped })
    expect(items(result).map((item) => item.path)).toEqual(["src/changed.ts"])
    expect(result.retained.items).toMatchObject([{ path: "src/caller.ts", onChangedLine: false, severity: "P2", ruleStatus: "probation" }])
    const severe = ReviewNoise.pipeline({ head: [head[0], entry("src/caller.ts", 42, { severity: "P0" })], changed, blastRadius, tier: "deep", catalog: capped })
    expect(items(severe).map((item) => [item.path, item.severity])).toEqual([["src/caller.ts", "P0"]])
    const inverted = { "src/caller.ts": [{ start: 50, end: 40 }] }
    expect(items(ReviewNoise.pipeline({ head: [head[0], entry("src/caller.ts", 38, { endLine: 60 })], changed, blastRadius: inverted, tier: "deep", catalog: deep })).map((item) => item.path)).toEqual(["src/changed.ts"])
    for (const range of [{ start: 0, end: 100 }, { start: -1, end: 100 }, { start: 50, end: 40 }, { start: 1, end: Infinity }, { start: 40.5, end: 44 }, { start: 1, end: Number.MAX_SAFE_INTEGER + 1 }]) {
      expect(items(ReviewNoise.pipeline({ head, changed, blastRadius: { "src/caller.ts": [range] }, tier: "deep", catalog: deep })).map((item) => item.path))
        .toEqual(["src/changed.ts"])
    }
  })
})
