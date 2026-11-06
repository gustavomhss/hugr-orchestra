import { expect, test } from "bun:test"
import { Schema } from "effect"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewRoute } from "../../src/review/route"
import { ReviewPackOxlint } from "../../src/review-toolkit/packs/oxlint"

const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]
const RULES = [
  { pack: "oxlint", rule: "eslint(no-debugger)", class: "logic.invariant", lens: "correctness-logic", severity: { "*": "P2" }, status: "probation", triage: "no-debugger: confirm the debugger statement is reachable in the reviewed runtime and causes observable harm; the native diagnostic is a candidate, not a confirmed interruption." },
  { pack: "oxlint", rule: "typescript(no-explicit-any)", class: "logic.contract", lens: "correctness-logic", severity: { "*": "P3" }, status: "probation", triage: "no-explicit-any: trace the unchecked value to a concrete caller or validation boundary; a broad static type alone is not a runtime defect or proof that validation is missing." },
] as const

test("O0 existing js-ts language and shipped node cover all curated source extensions", () => {
  expect(ReviewCatalog.current.languages.find((entry) => entry.id === "js-ts")).toMatchObject({ node: "team-stack-js-ts", detection: { extensions: EXTENSIONS, absent: [] } })
  expect(ReviewCatalog.current.languages.find((entry) => entry.id === "python")).toMatchObject({ node: "team-stack-python", detection: { extensions: [".py", ".pyi"] } })
})

test("O1 oxlint catalog reuses qualified pin and declares no-build offline probation", () => {
  expect(ReviewPackOxlint.manifest.version).toBe("1.91.0")
  const pack = ReviewCatalog.current.packs.find((entry) => entry.id === "oxlint")
  expect(pack).toEqual({
    id: "oxlint", tool: "oxlint", version: ReviewPackOxlint.manifest.version,
    pin: { source: "backend-toolkit/packs/oxlint", integrity: Object.fromEntries(Object.entries(ReviewPackOxlint.manifest.targets).map(([target, entry]) => [target, entry.artifact.integrity])) },
    licence: "pinned", backend: "pinned", languages: ["js-ts"], detection: { manifests: [], extensions: EXTENSIONS, absent: [] },
    lane: "no-build", tiers: ["standard", "deep"], output: { format: "sarif" }, cost: "low", network: { kind: "none" },
    scratchWrites: false, template: "oxlint-host-sarif", lenses: ["correctness-logic"], status: "probation",
  })
  expect(ReviewPackOxlint.templateId).toBe("oxlint-host-sarif")
  expect(Schema.decodeUnknownSync(ReviewCatalog.Catalog)(ReviewCatalog.current).packs.some((entry) => entry.id === "oxlint")).toBe(true)
})

test("O2 complete exact native inventory has host-authored class severity and triage", () => {
  const rules = ReviewCatalog.current.rules.filter((entry) => entry.pack === "oxlint")
  expect(rules).toEqual(RULES)
  expect(rules.map((entry) => entry.rule)).toEqual([...ReviewPackOxlint.RULES])
  for (const rule of rules) {
    expect(rule.triage.length).toBeLessThanOrEqual(240)
    expect(ReviewCatalog.current.classes.some((entry) => entry.id === rule.class)).toBe(true)
  }
  expect(ReviewCatalog.current.options.some((entry) => entry.id === "tool:oxlint")).toBe(false)
})

test("O3 Standard and Deep route eligible changes; Quick and manifest-only contexts do not", () => {
  const routed = (tier: string, file: string) => ReviewRoute.route(
    { stage: "code", tier, settings: { acceptedUnavailable: [] } },
    { files: ["package.json"] },
    { files: [file], changes: [{ path: file, added: [{ line: 1, text: "const value = 1" }], removed: 0 }] },
    ReviewCatalog.current,
  )
  for (const tier of ["standard", "deep"]) {
    for (const extension of EXTENSIONS) expect(routed(tier, `src/file${extension}`).packs).toContainEqual({ id: "oxlint", source: "catalog", lane: "no-build", status: "routed" })
    for (const file of ["README.md", "db/query.sql", "package.json"]) expect(routed(tier, file).packs.some((entry) => entry.id === "oxlint")).toBe(false)
  }
  expect(routed("quick", "src/file.ts").packs.some((entry) => entry.id === "oxlint")).toBe(false)
})
