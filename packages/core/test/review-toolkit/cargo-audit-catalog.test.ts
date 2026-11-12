import { expect, test } from "bun:test"
import { Schema } from "effect"
import pinned from "../../src/backend-toolkit/packs/cargo-audit"
import { BackendToolkitManifest } from "../../src/backend-toolkit/manifest"
import { ReviewToolkitManifest } from "../../src/review-toolkit/manifest"
import { ReviewCatalog } from "../../src/review/catalog"
import { cargoAudit } from "../../src/review/catalog/cargo-audit"

test("cargo-audit release digests and archive members match the captured upstream assets", () => {
  const expected = {
    "darwin-arm64": { integrity: "sha256-hBASBOW4ATyajXJRdmrr3vPn+ho+8EDN5E1ltIuMQFY=", member: "cargo-audit-aarch64-apple-darwin-v0.23.0/cargo-audit" },
    "darwin-x64": { integrity: "sha256-hF7AJFLdIzwpK+iHcArJmjimlymUIwge4NjqGgyWFGQ=", member: "cargo-audit-x86_64-apple-darwin-v0.23.0/cargo-audit" },
    "linux-arm64": { integrity: "sha256-AO/zFYQpuWKavodI6XHyn5nuU9TP9UolByy7FRZ73ag=", member: "cargo-audit-aarch64-unknown-linux-gnu-v0.23.0/cargo-audit" },
    "linux-x64": { integrity: "sha256-t3mTUyslP8v1UJltdxZGXsPXNNTnTn+Hv7ZaGa3Q+1k=", member: "cargo-audit-x86_64-unknown-linux-gnu-v0.23.0/cargo-audit" },
    "win32-x64": { integrity: "sha256-qv62EgZzAClgGnLmaaEiMfhnRCfmJI0C9ss4LLNtVrQ=", member: "cargo-audit-x86_64-pc-windows-msvc-v0.23.0/cargo-audit.exe" },
  } as const
  expect(pinned.version).toBe("0.23.0")
  expect(pinned.license).toBe("Apache-2.0 OR MIT")
  expect(Object.keys(pinned.targets).sort()).toEqual(Object.keys(expected).sort())
  for (const [target, value] of Object.entries(pinned.targets)) {
    const found = expected[target as keyof typeof expected]
    expect(value.artifact.integrity).toBe(found.integrity)
    expect(value.artifact.entries[0].from).toBe(found.member)
    expect(pinned.floor[target as keyof typeof pinned.floor]).toEqual({})
  }
  expect(pinned.notices.map((entry) => entry.integrity)).toEqual([
    "sha256-KWYmZrRN/4SXe0bgVkLN75ELw6k6F7X9huYyuvpZzyE=",
    "sha256-pg7qgXUUUxZo1+AHZXMUSf4U0FnTJJ4LyTs23kX3WfI=",
  ])
})

const catalog: ReviewCatalog.Catalog = ReviewCatalog.current

test("public cargo-audit catalog is offline no-build probation with native error and warning priority", () => {
  expect(() => Schema.decodeUnknownSync(ReviewCatalog.Pack)(cargoAudit.pack)).not.toThrow()
  expect(catalog.packs.find((pack) => pack.id === "cargo-audit")).toEqual(cargoAudit.pack)
  expect(catalog.rules.filter((rule) => rule.pack === "cargo-audit")).toEqual([...cargoAudit.rules])
  expect(cargoAudit.pack).toMatchObject({ lane: "no-build", tiers: ["standard", "deep"], network: { kind: "offline-db", database: "rustsec" }, scratchWrites: false })
  expect(cargoAudit.rules).toMatchObject([{ rule: "cargo-audit/advisory", class: "security.supply-chain", severity: { error: "P2", warning: "P3" }, status: "probation" }])
})

test("the review pin is explicitly provisionable without joining the backend default engine set", () => {
  expect(Object.keys(ReviewToolkitManifest.ENGINES)).toContain("cargo-audit")
  expect(Object.keys(BackendToolkitManifest.ENGINES)).not.toContain("cargo-audit")
})
