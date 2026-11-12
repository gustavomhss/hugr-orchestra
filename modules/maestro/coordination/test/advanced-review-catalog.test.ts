import path from "node:path"
import { expect, test } from "bun:test"
import { Schema } from "effect"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewRoute } from "@orchestra/core/review/route"
import { ReviewCandidatesV2 } from "../src/v2/workflow/review-candidates"
import { candidate } from "./fixture/lucy-fanout-data"

const deep: ReviewCatalog.Catalog = {
  ...ReviewCatalog.current,
  route: { ...ReviewCatalog.current.route, tiers: ReviewCatalog.current.route.tiers.map((tier) =>
    tier.id === "deep" ? { ...tier, built: true, runs: "deep" } : tier) },
}
const unbuilt: ReviewCatalog.Catalog = {
  ...deep, route: { ...deep.route, tiers: deep.route.tiers.map((tier) => tier.id === "deep" ? { ...tier, built: false, runs: "standard" } : tier) },
}
const item: ReviewCandidatesV2.Merged = {
  ...candidate("changed invariant", 1, "P1"), id: "C1", fingerprint: "advanced", lenses: ["correctness-logic"], sources: [], agreement: 1, observation: false,
}
const cases = [
  { class: "logic.invariant", path: "src/a.ts", manifest: "package.json", id: "probe:property", node: "lucy-review-prove-property" },
  { class: "concurrency.atomicity", path: "src/a.ts", manifest: "package.json", id: "probe:interleave", node: "lucy-review-prove-interleave" },
  { class: "tests.weak-oracle", path: "src/lib.rs", manifest: "Cargo.toml", id: "probe:mutants", node: "lucy-review-prove-mutants" },
]

function offers(catalog: ReviewCatalog.Catalog, requested: string, row: typeof cases[number]) {
  const files = [row.manifest, row.path]
  const record = ReviewRoute.route({ stage: "code", tier: requested, settings: { acceptedUnavailable: [] } },
    { files }, { files, changes: [{ path: row.path, added: [{ line: 1, text: "changed" }], removed: 1 }] }, catalog)
  const tier = catalog.route.tiers.find((entry) => entry.id === record.tier.id)
  if (!tier) throw new Error("missing routed tier")
  return ReviewCandidatesV2.options(catalog, tier, record, { ...item, class: row.class, path: row.path }).map((option) => option.id)
}

test("each advanced option has a routed class and is offered only by a built Deep run", () => {
  for (const row of cases) {
    expect(ReviewCatalog.current.options.some((option) => option.id === row.id)).toBe(true)
    expect(deep.classes.find((entry) => entry.id === row.class)?.node).toBe(row.node)
    expect(offers(deep, "deep", row)).toContain(row.id)
    for (const tier of ["quick", "standard"]) expect(offers(deep, tier, row)).not.toContain(row.id)
    expect(offers(unbuilt, "deep", row)).not.toContain(row.id)
  }
  expect(() => Schema.decodeUnknownSync(ReviewCatalog.Catalog)(ReviewCatalog.current)).not.toThrow()
})

test("a Go race stays Go-only and every class has at most three options", () => {
  const go = { class: "concurrency.atomicity", path: "pkg/a.go", manifest: "go.mod", id: "probe:race", node: "lucy-review-prove-interleave" }
  expect(offers(deep, "deep", go)).toContain("probe:race")
  expect(offers(deep, "deep", cases[1])).not.toContain("probe:race")
  for (const entry of ReviewCatalog.current.classes)
    for (const options of Object.values(entry.options)) expect(options.length).toBeLessThanOrEqual(3)
})

test("advanced class tuples preserve their named alternatives and language scope", () => {
  const ids = (id: string, language: string) => deep.classes.find((entry) => entry.id === id)?.options[language]?.map((option) => option.option)
  expect(ids("logic.invariant", "js-ts")).toEqual(["quote", "probe:property", "probe:test"])
  expect(ids("concurrency.atomicity", "js-ts")).toEqual(["quote", "probe:test", "probe:interleave"])
  expect(ids("concurrency.atomicity", "go")).toEqual(["quote", "probe:test", "probe:race"])
  expect(ids("tests.weak-oracle", "rust")).toEqual(["quote", "probe:regress", "probe:mutants"])
  for (const row of cases) {
    const entry = deep.classes.find((item) => item.id === row.class)
    for (const [language, options] of Object.entries(entry?.options ?? {}))
      if (language !== (row.id === "probe:mutants" ? "rust" : "js-ts")) expect(options.some((item) => item.option === row.id)).toBe(false)
  }
})

test("each advanced proof leaf ships offered-only guidance without shell commands", async () => {
  for (const row of cases) {
    const leaf = row.id.slice("probe:".length)
    const text = await Bun.file(path.resolve(import.meta.dir, `../../../../packages/lucy-specialist/skills/lucy-review/prove/${leaf}/SKILL.md`)).text()
    expect(text).toContain(row.id)
    expect(text).toContain("offered")
    expect(text).toContain("not-run")
    expect(text).not.toMatch(/\bbun test\b|\bcargo mutants\b|\bnpm (?:install|exec)\b|--in-diff|--mutate/)
  }
})
