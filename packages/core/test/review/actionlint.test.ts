import { expect, test } from "bun:test"
import { Schema } from "effect"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewRoute } from "../../src/review/route"
import { actionlint } from "../../src/review/catalog/actionlint"
import { ReviewActionlintReport } from "../../src/review-toolkit/packs/actionlint-report"
import { BackendToolkitManifest } from "../../src/backend-toolkit/manifest"

test("the real catalog binds every actionlint native kind to an existing class and lens", () => {
  const catalog = Schema.decodeUnknownSync(ReviewCatalog.Catalog)(ReviewCatalog.current)
  expect(catalog.packs.filter((pack) => pack.id === "actionlint")).toHaveLength(1)
  expect(catalog.rules.filter((rule) => rule.pack === "actionlint").map((rule) => rule.rule).sort()).toEqual([...ReviewActionlintReport.RULES].sort())
  for (const rule of catalog.rules.filter((entry) => entry.pack === "actionlint")) {
    expect(catalog.classes.some((entry) => entry.id === rule.class)).toBe(true)
    expect(catalog.lenses.find((entry) => entry.id === rule.lens)?.classes).toContain(rule.class)
    expect(rule.status).toBe("probation")
    expect(rule.triage).not.toBe("")
  }
  expect(actionlint.pack).toMatchObject({ lane: "no-build", network: { kind: "none" }, scratchWrites: false })
  expect(BackendToolkitManifest.ENGINES.actionlint.version).toBe("1.7.12")
})

test("workflow changes bind actionlint without selecting it for arbitrary YAML or Terraform", () => {
  const route = (file: string, catalog: ReviewCatalog.Catalog = ReviewCatalog.current) => ReviewRoute.route(
    { stage: "code", tier: "standard", settings: { acceptedUnavailable: [] } },
    { files: [] },
    { files: [file], changes: [{ path: file, added: [{ line: 1, text: "name: CI" }], removed: 0 }] },
    catalog,
  )
  for (const file of [".github/workflows/ci.yml", ".github/workflows/release.yaml"]) {
    const record = route(file)
    expect(record.packs).toContainEqual({ id: "actionlint", source: "path", lane: "no-build", status: "routed" })
    expect(record.overlays.some((entry) => entry.id === "github-actions")).toBe(true)
    // Exercise actual path detection separately from the binding overlay.
    const detected = route(file, { ...ReviewCatalog.current, overlays: ReviewCatalog.current.overlays.filter((entry) => entry.id !== "github-actions") })
    expect(detected.packs.some((entry) => entry.id === "actionlint")).toBe(true)
  }
  for (const file of ["config.yaml", "infra/main.tf", ".github/workflows/nested/ci.yml", "README.md"]) {
    expect(route(file).packs.some((entry) => entry.id === "actionlint")).toBe(false)
  }
})
