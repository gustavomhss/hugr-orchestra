import path from "node:path"
import { expect, test } from "bun:test"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewRoute } from "@orchestra/core/review/route"

const catalog: ReviewCatalog.Catalog = { ...ReviewCatalog.current,
  route: { ...ReviewCatalog.current.route, tiers: ReviewCatalog.current.route.tiers.map((tier) => tier.id === "deep" ? { ...tier, built: true, runs: "deep" } : tier) },
}
const route = (profile: string, tier: string) => ReviewRoute.route({ stage: "code", profile, tier, settings: { acceptedUnavailable: [] } },
  { files: ["package.json", "src/a.ts"] }, { files: ["package.json", "src/a.ts"], changes: [] }, catalog)

test("release keeps existing Quick and Standard lenses and adds a specialized Deep lens", () => {
  const profile = catalog.route.profiles.find((entry) => entry.id === "release")
  expect(profile?.lenses.quick).toEqual(["correctness-logic", "tests"])
  expect(profile?.lenses.standard).toEqual(["correctness-logic", "correctness-edges", "correctness-reliability", "tests", "security"])
  expect(profile?.lenses.deep).toEqual(["security-release", "correctness-logic", "correctness-edges", "correctness-reliability", "tests", "security", "correctness-concurrency"])
  expect(catalog.lenses.find((entry) => entry.id === "security-release")).toMatchObject({ node: "lucy-lens-security-release", classes: ["security.supply-chain"] })
  expect(JSON.stringify(route("release", "deep").lenses)).toContain("security-release")
  for (const tier of ["quick", "standard"]) expect(JSON.stringify(route("release", tier).lenses)).not.toContain("security-release")
  expect(JSON.stringify(route("code", "deep").lenses)).not.toContain("security-release")
})

test("release evidence options and shipped guidance remain bounded to their actual claims", async () => {
  for (const id of ["provenance", "signing", "updater", "sbom", "notes"])
    expect(catalog.options.find((entry) => entry.id === `tool:release-${id}`)).toMatchObject({ rung: "tool", cost: "low" })
  const root = path.resolve(import.meta.dir, "../../../../packages/lucy-specialist/skills")
  for (const node of ["lucy-review/release", "lucy-lens/security/release"]) {
    const text = await Bun.file(path.join(root, node, "SKILL.md")).text()
    expect(text).toContain("owner-permission")
    expect(text).toContain("not-run")
    expect(text).not.toMatch(/\bcargo mutants\b|\bnpm install\b|\bbun test\b/)
  }
})
