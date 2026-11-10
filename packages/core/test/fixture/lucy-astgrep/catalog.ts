import { ReviewCatalog } from "../../../src/review/catalog"
import { ReviewPackAstGrep } from "../../../src/review-toolkit/packs/ast-grep"

// The freeze's pack and rules, injected by tests. Catalog entries themselves belong to the catalog owner.
const triage = "direct eval is a candidate only with a quoted untrusted-input trigger; a structural hit alone neither proves exploitability nor confirms a probation finding"

export const pack = {
  id: ReviewPackAstGrep.manifest.id,
  tool: "ast-grep",
  version: ReviewPackAstGrep.manifest.version,
  pin: {
    source: "backend-toolkit/packs/ast-grep",
    integrity: Object.fromEntries(Object.entries(ReviewPackAstGrep.manifest.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
  },
  licence: "pinned" as const,
  backend: "pinned" as const,
  languages: ["js-ts"],
  detection: { manifests: [], extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"], absent: [] },
  lane: "no-build" as const,
  tiers: ["standard", "deep"],
  output: { format: "json" as const, parser: ReviewPackAstGrep.parserId },
  cost: "low" as const,
  network: { kind: "none" as const },
  scratchWrites: false,
  template: ReviewPackAstGrep.templateId,
  lenses: ["security"],
  status: "probation" as const,
}

export const rules = ReviewPackAstGrep.rules.map((rule) => ({
  pack: pack.id,
  rule: rule.id,
  class: "security.boundary",
  lens: "security",
  severity: { "*": "P2" as const },
  triage,
  status: "probation" as const,
}))

export function withAstGrep(base: ReviewCatalog.Catalog = ReviewCatalog.current): ReviewCatalog.Catalog {
  return {
    ...base,
    packs: [...base.packs.filter((entry) => entry.id !== pack.id), pack],
    rules: [...base.rules.filter((entry) => entry.pack !== pack.id), ...rules],
  }
}
