import { expect, test } from "bun:test"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewLocalCheckCards } from "../../src/review/catalog/local-checks"
import { ReviewRoute } from "../../src/review/route"
import shfmtPin from "../../src/backend-toolkit/packs/shfmt"
import cargoMachetePin from "../../src/backend-toolkit/packs/cargo-machete"

const cards = [ReviewLocalCheckCards.shfmt.pack, ReviewLocalCheckCards.cargoMachete.pack]
const ids = cards.map((pack) => pack.id)
const route = (tier: string, changed: readonly string[], catalog = ReviewCatalog.current) => ReviewRoute.route(
  { stage: "code", tier, settings: { acceptedUnavailable: [] } },
  { files: ["src/lib.rs"] },
  { files: [...changed, "src/lib.rs"], changes: changed.map((path) => ({ path, added: [], removed: 0 })) },
  catalog,
)

test("default catalog registers the frozen pinned cards without normalized local rules", () => {
  expect(ReviewCatalog.current.packs.filter((pack) => ids.includes(pack.id))).toEqual(cards)
  expect(cards).toEqual([
    {
      id: "shfmt", tool: "shfmt", version: shfmtPin.version,
      pin: { source: "backend-toolkit/packs/shfmt", integrity: { "linux-x64": shfmtPin.targets["linux-x64"].artifact.integrity } },
      licence: "pinned", backend: "pinned", languages: "any",
      detection: { manifests: [], extensions: [".sh", ".bash", ".bats", ".ksh"], absent: [], paths: [] },
      lane: "no-build", tiers: ["standard", "deep"], output: { format: "check" }, cost: "low",
      network: { kind: "none" }, scratchWrites: false, template: "shfmt-local-check", lenses: ["correctness-logic"], status: "probation",
    },
    {
      id: "cargo-machete", tool: "cargo-machete", version: cargoMachetePin.version,
      pin: { source: "backend-toolkit/packs/cargo-machete", integrity: { "linux-x64": cargoMachetePin.targets["linux-x64"].artifact.integrity } },
      licence: "pinned", backend: "pinned", languages: ["rust"],
      detection: { manifests: [], extensions: [".rs"], absent: [], paths: ["Cargo.toml", "**/Cargo.toml", "Cargo.lock", "**/Cargo.lock"] },
      lane: "no-build", tiers: ["standard", "deep"], output: { format: "check" }, cost: "medium",
      network: { kind: "none" }, scratchWrites: false, template: "cargo-machete-local-check", lenses: ["correctness-logic"], status: "probation",
    },
  ])
  expect(ReviewCatalog.current.rules.some((rule) => ids.includes(rule.pack))).toBe(false)
})

test("actual default routing selects all declared shell and Cargo paths at Standard and Deep", () => {
  const paths = ["check.sh", "check.bash", "check.bats", "check.ksh", "Cargo.toml", "Cargo.lock", "src/changed.rs", "apps/demo/Cargo.toml", "apps/demo/Cargo.lock"]
  for (const tier of ["standard", "deep"]) for (const path of paths) {
    const routed = route(tier, [path]).packs
    if (path.endsWith(".sh") || path.endsWith(".bash") || path.endsWith(".bats") || path.endsWith(".ksh")) {
      expect(routed).toContainEqual({ id: "shfmt", source: "catalog", lane: "no-build", status: "routed" })
      expect(routed.some((pack) => pack.id === "cargo-machete")).toBe(false)
    } else {
      expect(routed).toContainEqual({ id: "cargo-machete", source: "catalog", lane: "no-build", status: "routed" })
      expect(routed.some((pack) => pack.id === "shfmt")).toBe(false)
    }
  }
  expect(route("quick", paths).packs.some((pack) => ids.includes(pack.id))).toBe(false)
  const droppedCatalog: ReviewCatalog.Catalog = {
    ...ReviewCatalog.current,
    packs: ReviewCatalog.current.packs.map((pack) => pack.id === "shfmt" ? { ...pack, status: "dropped" } : pack),
  }
  const dropped = route("standard", ["check.sh"], droppedCatalog).packs
  expect(dropped.some((pack) => pack.id === "shfmt")).toBe(false)
})
