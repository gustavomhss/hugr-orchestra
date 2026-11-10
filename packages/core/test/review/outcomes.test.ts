import { expect, test } from "bun:test"
import { Schema } from "effect"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewLedger } from "../../src/review/ledger"
import { ReviewOutcomes } from "../../src/review/outcomes"
import { ReviewItem } from "../../src/review-toolkit/item"

const pack = {
  id: "alpha",
  tool: "alpha",
  version: "1",
  licence: "pinned",
  backend: "pinned",
  languages: "any",
  detection: { manifests: [], extensions: [], absent: [] },
  lane: "no-build",
  tiers: ["quick"],
  output: { format: "sarif" },
  cost: "low",
  network: { kind: "none" },
  scratchWrites: false,
  template: "alpha",
  lenses: ["security"],
  status: "probation",
} satisfies ReviewCatalog.Catalog["packs"][number]

const wildcard = {
  pack: "alpha",
  rule: "*",
  class: "security.secret",
  lens: "security",
  severity: { "*": "P1" },
  triage: "A live credential.",
  status: "probation",
} satisfies ReviewCatalog.Catalog["rules"][number]

const exact = { ...wildcard, pack: "beta", rule: "native-rule" }
const catalog: ReviewCatalog.Catalog = {
  ...ReviewCatalog.current,
  packs: [pack, { ...pack, id: "beta", tool: "beta" }],
  rules: [wildcard, exact],
}

function item(over: Partial<ReviewItem.ToolItem> = {}): ReviewItem.ToolItem {
  return Schema.decodeUnknownSync(ReviewItem.ToolItem)({
    fingerprint: "fp-1",
    class: "security.secret",
    lens: "security",
    pack: "alpha",
    rule: "native-rule",
    ruleStatus: "probation",
    severity: "P1",
    path: "src/a.ts",
    line: 2,
    endLine: 4,
    snippetDigest: "digest",
    sources: [{ pack: "audit", rule: "other-rule" }],
    triage: "note",
    onChangedLine: true,
    ...over,
  })
}

function decision(over: Partial<ReviewOutcomes.Decision> = {}): ReviewOutcomes.Decision {
  return { source: "fp-1", class: "security.secret", path: "src/a.ts", line: 3, endLine: 3, state: "confirmed", ...over }
}

test("unread input is absent, a delivered item with no decision is not-pursued, and secondary sources add no read", () => {
  const delivered = item()
  const unread = item({ fingerprint: "fp-unread", path: "src/b.ts" })
  const reads = ReviewOutcomes.reads({ delivered: [delivered], decisions: [], catalog })
  expect(reads).toEqual([{
    pack: "alpha",
    rule: "native-rule",
    generation: ReviewLedger.generation(pack, { ...wildcard, rule: "native-rule" }),
    fingerprint: "fp-1",
    outcome: "not-pursued",
  }])
  expect(reads.some((read) => read.fingerprint === unread.fingerprint || read.rule === "other-rule")).toBe(false)
})

test("a foreign class, path, range, or unknown source does not credit the delivered item", () => {
  const delivered = [item()]
  for (const claimed of [
    decision({ class: "other.class" }),
    decision({ path: "src/other.ts" }),
    decision({ line: 8, endLine: 9 }),
    decision({ source: "fp-unknown" }),
    decision({ line: 0 }),
    decision({ line: 5, endLine: 1 }),
    decision({ line: 1, endLine: 1 }),
    decision({ line: 5, endLine: 6 }),
  ]) {
    expect(ReviewOutcomes.reads({ delivered, decisions: [claimed, decision({ source: "unrelated", line: 0 })], catalog })[0]?.outcome).toBe("not-pursued")
  }
  expect(ReviewOutcomes.reads({ delivered, decisions: [decision({ line: 0 }), decision()], catalog })[0]?.outcome).toBe("confirmed")
  expect(ReviewOutcomes.reads({ delivered, decisions: [decision({ line: 4, endLine: 6 })], catalog })[0]?.outcome).toBe("confirmed")
  expect(ReviewOutcomes.reads({ delivered, decisions: [decision({ line: 2, endLine: undefined })], catalog })[0]?.outcome).toBe("confirmed")
})

test("confirmed without a refutation confirms; conflict or a question beside refutation is not-pursued", () => {
  const delivered = [item()]
  expect(ReviewOutcomes.reads({ delivered, decisions: [decision(), decision({ state: "question" })], catalog })[0]?.outcome).toBe("confirmed")
  expect(ReviewOutcomes.reads({ delivered, decisions: [decision({ state: "refuted" })], catalog })[0]?.outcome).toBe("refuted")
  expect(ReviewOutcomes.reads({
    delivered,
    decisions: [decision(), decision({ state: "refuted" })],
    catalog,
  })[0]?.outcome).toBe("not-pursued")
  expect(ReviewOutcomes.reads({
    delivered,
    decisions: [decision({ state: "refuted" }), decision({ state: "question" })],
    catalog,
  })[0]?.outcome).toBe("not-pursued")
})

test("wildcard generation binds the native rule id, and the same id in another pack is a different generation", () => {
  const alpha = item()
  const beta = item({ pack: "beta", fingerprint: "fp-beta" })
  const reads = ReviewOutcomes.reads({ delivered: [beta, alpha], decisions: [], catalog })
  const alphaGeneration = ReviewLedger.generation(pack, { ...wildcard, rule: "native-rule" })
  const betaGeneration = ReviewLedger.generation({ ...pack, id: "beta", tool: "beta" }, { ...exact, rule: "native-rule" })
  expect(alphaGeneration).not.toBe(ReviewLedger.generation(pack, wildcard))
  expect(reads.map((read) => read.generation)).toEqual([alphaGeneration, betaGeneration])
  expect(reads.map((read) => read.pack)).toEqual(["alpha", "beta"])
  expect(() => ReviewOutcomes.reads({ delivered: [item({ pack: "missing" })], decisions: [], catalog })).toThrow("outcome-source-unknown")
  expect(() => ReviewOutcomes.reads({ delivered: [item({ pack: "beta", rule: "no-such" })], decisions: [], catalog })).toThrow("outcome-source-unknown")
  const gamma = { ...pack, id: "gamma", tool: "gamma" }
  const gammaWild = { ...wildcard, pack: "gamma", triage: "wildcard triage" }
  const gammaExact = { ...wildcard, pack: "gamma", rule: "native-rule", triage: "exact triage" }
  const both = ReviewOutcomes.reads({
    delivered: [item({ pack: "gamma" })],
    decisions: [],
    catalog: { ...catalog, packs: [...catalog.packs, gamma], rules: [...catalog.rules, gammaWild, gammaExact] },
  })
  expect(both[0]?.generation).toBe(ReviewLedger.generation(gamma, gammaExact))
  expect(both[0]?.generation).not.toBe(ReviewLedger.generation(gamma, { ...gammaWild, rule: "native-rule" }))
})

test("equivalent deliveries dedupe, conflicting identity throws, and output order is the identity sort", () => {
  const delivered = item()
  const once = ReviewOutcomes.reads({ delivered: [delivered, { ...delivered }], decisions: [decision()], catalog })
  expect(once).toHaveLength(1)
  expect(once[0]?.outcome).toBe("confirmed")
  expect(ReviewOutcomes.reads({
    delivered: [delivered, item({ sources: [{ pack: "other-audit", rule: "x" }] })],
    decisions: [decision()],
    catalog,
  })).toHaveLength(1)
  expect(ReviewOutcomes.reads({
    delivered: [item({ fingerprint: "shared" }), item({ pack: "beta", fingerprint: "shared" })],
    decisions: [],
    catalog,
  })).toHaveLength(2)
  expect(ReviewOutcomes.reads({
    delivered: [item({ fingerprint: "shared", rule: "other-native" }), item({ fingerprint: "shared" })],
    decisions: [],
    catalog,
  })).toHaveLength(2)
  expect(() => ReviewOutcomes.reads({
    delivered: [delivered, item({ class: "other.class" })],
    decisions: [],
    catalog,
  })).toThrow("outcome-source-conflict")
  const reversed = ReviewOutcomes.reads({
    delivered: [item({ fingerprint: "fp-z", path: "src/z.ts" }), delivered],
    decisions: [decision(), decision({ source: "fp-z", path: "src/z.ts", state: "refuted" })].reverse(),
    catalog,
  })
  const forward = ReviewOutcomes.reads({
    delivered: [delivered, item({ fingerprint: "fp-z", path: "src/z.ts" })],
    decisions: [decision({ source: "fp-z", path: "src/z.ts", state: "refuted" }), decision()],
    catalog,
  })
  expect(reversed).toEqual(forward)
  expect(forward.map((read) => [read.fingerprint, read.outcome])).toEqual([
    ["fp-1", "confirmed"],
    ["fp-z", "refuted"],
  ])
  expect(ReviewOutcomes.reads({ delivered: [delivered], decisions: [decision({ state: "question" })], catalog })[0]?.outcome).toBe("not-pursued")
})

test("line-independent native identity retains every delivered occurrence without another read", () => {
  const first = item({ line: 10, endLine: 10 })
  const second = item({ line: 30, endLine: 30, onChangedLine: false })
  const atFirst = decision({ line: 10, endLine: 10 })
  const atSecond = decision({ line: 30, endLine: 30 })
  const delivered = [first, second, { ...second }]
  const reads = ReviewOutcomes.reads({ delivered, decisions: [atSecond], catalog })
  expect(reads).toHaveLength(1)
  expect(reads[0]?.outcome).toBe("confirmed")
  expect(ReviewOutcomes.reads({ delivered: delivered.toReversed(), decisions: [atSecond], catalog })).toEqual(reads)
  expect(ReviewOutcomes.reads({
    delivered, decisions: [atFirst, { ...atSecond, state: "refuted" }], catalog,
  })[0]?.outcome).toBe("not-pursued")
  expect(ReviewOutcomes.reads({
    delivered, decisions: [{ ...atSecond, line: 20, endLine: 20 }], catalog,
  })[0]?.outcome).toBe("not-pursued")
  expect(() => ReviewOutcomes.reads({
    delivered: [first, { ...second, snippetDigest: "different-source" }], decisions: [atSecond], catalog,
  })).toThrow("outcome-source-conflict")
})
