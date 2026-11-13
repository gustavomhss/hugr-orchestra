import { describe, expect, test } from "bun:test"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewRoute } from "../../src/review/route"

const base = { files: ["src/a.ts"] }
const head = { files: base.files, changes: [{ path: "src/a.ts", added: [{ line: 1, text: "export const a = true" }], removed: 1 }] }
const settings = { acceptedUnavailable: [] }

describe("duplication review routing", () => {
  test("Standard source changes route the scanner and its candidate lens", () => {
    const routed = ReviewRoute.route({ stage: "code", tier: "standard", settings }, base, head, ReviewCatalog.current)
    expect(routed.packs).toContainEqual({ id: "jscpd", source: "catalog", lane: "no-build", status: "routed" })
    expect(routed.lenses).toContainEqual({ id: "change", source: "path", node: "lucy-lens-change", because: "pack:jscpd" })
    expect(routed.budget.lensChildren).toBe(6)
    const rule = ReviewCatalog.current.rules.find((entry) => entry.pack === "jscpd")
    expect(rule).toMatchObject({ class: "change.duplication", lens: "change", severity: { "*": "P3" }, status: "probation" })
    expect(ReviewCatalog.current.lenses.find((lens) => lens.id === "change")?.classes).toContain("change.duplication")
  })

  test("Quick excludes duplication and production Deep routes the scanner", () => {
    const quick = ReviewRoute.route({ stage: "code", tier: "quick", settings }, base, head, ReviewCatalog.current)
    expect(quick.packs.some((pack) => pack.id === "jscpd")).toBe(false)
    const deep = ReviewRoute.route({ stage: "code", tier: "deep", settings }, base, head, ReviewCatalog.current)
    expect(deep.tier).toMatchObject({ id: "deep" })
    expect(deep.tier.requested).toBeUndefined()
    expect(deep.packs).toContainEqual({ id: "jscpd", source: "catalog", lane: "no-build", status: "routed" })
  })

  test("a dropped pack never creates its candidate lens", () => {
    const catalog = { ...ReviewCatalog.current, packs: ReviewCatalog.current.packs.map((pack) => pack.id === "jscpd" ? { ...pack, status: "dropped" as const } : pack) }
    const routed = ReviewRoute.route({ stage: "code", tier: "standard", settings }, base, head, catalog)
    expect(routed.packs.some((pack) => pack.id === "jscpd")).toBe(false)
    expect(routed.lenses.some((lens) => lens.because === "pack:jscpd")).toBe(false)
  })

  test("other pack lens declarations do not expand the host route", () => {
    const file = ".github/workflows/ci.yml"
    const routed = ReviewRoute.route({ stage: "code", tier: "standard", settings }, { files: [file] }, {
      files: [file], changes: [{ path: file, added: [{ line: 1, text: "name: ci" }], removed: 0 }],
    }, ReviewCatalog.current)
    expect(routed.packs.some((pack) => pack.id === "zizmor")).toBe(true)
    expect(routed.lenses.some((lens) => lens.because === "pack:zizmor")).toBe(false)
    expect(routed.deviations.some((deviation) => deviation.detail.includes("pack:zizmor"))).toBe(false)
  })

})
