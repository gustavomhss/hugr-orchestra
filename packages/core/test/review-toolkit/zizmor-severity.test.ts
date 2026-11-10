import { expect, test } from "bun:test"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewSarif } from "../../src/review-toolkit/sarif"

// The production resolver, not a lookup that already returns the expected priority.
const lookup = ReviewAnalyze.rules(ReviewCatalog.current)

const finding = (level: string | undefined, snippet: string) => ({
  ruleId: "zizmor/artipacked",
  ...(level === undefined ? {} : { level }),
  message: { text: "persisted credential" },
  locations: [{
    physicalLocation: {
      artifactLocation: { uri: "file:///repo/.github/workflows/ci.yml" },
      region: { startLine: 4, snippet: { text: snippet } },
    },
  }],
})

const report = (results: unknown[]) => JSON.stringify({
  version: "2.1.0",
  runs: [{ tool: { driver: { name: "zizmor" } }, results }],
})

function settle(results: unknown[]) {
  const parsed = ReviewSarif.parseSarif(report(results), { pack: "zizmor", root: "/repo" })
  if (parsed.status !== "ok") throw new Error(parsed.reason)
  return { parsed, page: ReviewSarif.toItems(parsed.results, lookup), bound: ReviewSarif.bind(parsed.results, lookup) }
}

test("artipacked keeps its class and takes priority from the finding level", () => {
  const settled = settle([
    finding("note", "persisted credential"),
    finding("warning", "persisted credential"),
    finding("error", "persisted credential"),
  ])
  expect(settled.parsed.results.map((raw) => raw.nativeSeverity)).toEqual(["note", "warning", "error"])
  expect(settled.page.unresolved).toEqual([])
  expect(settled.page.excluded).toEqual([])
  expect(settled.page.items.map((entry) => entry.item.severity)).toEqual(["P3", "P2", "P1"])
  expect(settled.page.items.every((entry) => entry.item.class === "security.secret" && entry.item.rule === "zizmor/artipacked")).toBe(true)
  expect("failed" in settled.bound).toBe(false)
})

test("a fixed star priority ignores a native level and does not invent one", () => {
  expect(lookup("oxlint", "eslint(no-debugger)")).toMatchObject({ severity: "P2", class: "logic.invariant" })
  expect(lookup("oxlint", "eslint(no-debugger)", "error")).toMatchObject({ severity: "P2" })
})

test("a missing or unknown zizmor level is a normalization failure, not P3 or an unknown rule", () => {
  for (const level of [undefined, "critical", "toString", "constructor"]) {
    const settled = settle([finding(level, level ?? "missing")])
    expect(settled.page.items).toEqual([])
    expect(settled.page.excluded).toEqual([])
    expect(settled.page.unresolved).toEqual(settled.parsed.results)
    expect(settled.page.unresolved[0]?.rule).toBe("zizmor/artipacked")
    expect(settled.page.unresolved[0]?.nativeSeverity).toBe(level)
    expect(settled.bound).toEqual({ failed: "severity-unmapped", unresolved: settled.parsed.results })
    expect(settled.page.items.some((entry) => entry.item.severity === "P3")).toBe(false)
  }
})
