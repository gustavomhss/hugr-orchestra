import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ReviewCatalog } from "../../src/review/catalog"

describe("local check catalog output", () => {
  test("Pack decodes check-only output and keeps SARIF and JSON output variants", () => {
    const pack = ReviewCatalog.current.packs[0]
    expect(() => Schema.decodeUnknownSync(ReviewCatalog.Pack)({ ...pack, output: { format: "check" } })).not.toThrow()
    expect(() => Schema.decodeUnknownSync(ReviewCatalog.Pack)({ ...pack, output: { format: "sarif" } })).not.toThrow()
    expect(() => Schema.decodeUnknownSync(ReviewCatalog.Pack)({ ...pack, output: { format: "json", parser: "repo-gate" } })).not.toThrow()
  })

  test("catalog digest changes when a pack output value changes", () => {
    const catalog = structuredClone(ReviewCatalog.current)
    const digest = ReviewCatalog.catalogDigest(catalog)
    const changed = { ...catalog, packs: catalog.packs.map((pack, index) => index === 0 ? { ...pack, output: { format: "check" as const } } : pack) }
    expect(ReviewCatalog.catalogDigest(Schema.decodeUnknownSync(ReviewCatalog.Catalog)(changed))).not.toBe(digest)
  })
})
