import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import astGrep from "../../src/backend-toolkit/packs/ast-grep"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewRoute } from "../../src/review/route"
import { ReviewRouting } from "../../src/review/routing"

// Catalog and route ids from the frozen phase-3 contract (build-plan.md:627-666, packet
// de3254b1a1), hardcoded, not read back from the lists under test. The authored-tree
// loader, runtime discovery and catalog check live in the maestro tree test. This file
// does not close analyzer acquisition, the PR-slice route suite, or A9 source gaps.
// Phase-3 membership remains required when later phases extend classes and languages.

const catalog: ReviewCatalog.Catalog = ReviewCatalog.current
const settings = { acceptedUnavailable: [] }

const LENSES = [
  ["correctness-resources", "lucy-lens-correctness-resources", ["resources.lifetime"]],
  ["correctness-performance", "lucy-lens-correctness-performance", ["performance.cost"]],
  ["contracts", "lucy-lens-contracts", ["contracts.api", "contracts.semver", "contracts.data", "contracts.third-party", "contracts.ipc"]],
  ["change", "lucy-lens-change", ["change.structure", "change.history", "change.merge", "change.provenance", "change.health"]],
  ["experience", "lucy-lens-experience", ["experience.interaction", "experience.a11y", "experience.visual", "experience.content"]],
  ["privacy", "lucy-audit-compliance-privacy", ["privacy.processing"]],
] as const

const CLASSES = [
  ["resources.lifetime", "lucy-review-prove-regress"],
  ["performance.cost", "lucy-review-prove-regress"],
  ["contracts.api", "lucy-review-prove-quote"],
  ["contracts.semver", "lucy-review-prove-quote"],
  ["contracts.data", "lucy-review-prove-quote"],
  ["contracts.third-party", "lucy-review-prove-quote"],
  ["contracts.ipc", "lucy-review-prove-quote"],
  ["security.supply-chain", "lucy-review-prove-quote"],
  ["security.ci", "lucy-review-prove-quote"],
  ["security.infra", "lucy-review-prove-quote"],
  ["change.structure", "lucy-review-prove-quote"],
  ["change.history", "lucy-review-prove-quote"],
  ["change.merge", "lucy-review-prove-quote"],
  ["change.provenance", "lucy-review-prove-quote"],
  ["change.health", "lucy-review-prove-quote"],
  ["experience.interaction", "lucy-review-prove-quote"],
  ["experience.a11y", "lucy-review-prove-quote"],
  ["experience.visual", "lucy-review-prove-quote"],
  ["experience.content", "lucy-review-prove-quote"],
  ["privacy.processing", "lucy-review-prove-quote"],
] as const

const OFFER = ["quote", "probe:test", "probe:script"]

const OVERLAYS = [
  ["api-wire", ["contracts"]],
  ["data-migration", ["contracts"]],
  // Lead freeze 51c1cbd504: performance routes both lenses, in catalog declared order.
  ["performance", ["correctness-performance", "correctness-resources"]],
  ["ci-infra", ["change", "security"]],
  ["dependency", ["contracts", "security"]],
  ["ui", ["experience"]],
  ["personal-data", ["privacy"]],
] as const

const BINDINGS = [
  ["api-wire", "service.proto"],
  ["api-wire", "api/service.proto"],
  ["api-wire", "openapi.yaml"],
  ["api-wire", "spec/openapi.json"],
  ["data-migration", "db/migrations/001.sql"],
  ["data-migration", "packages/app/migrations/002.sql"],
  ["performance", "pkg/benchmarks/hot.ts"],
  ["performance", "services/api/benchmarks/hot.ts"],
  ["ci-infra", ".github/workflows/ci.yml"],
  ["ci-infra", ".github/workflows/release/deploy.yml"],
  ["ci-infra", "infra/main.tf"],
  ["dependency", "package.json"],
  ["dependency", "packages/app/package.json"],
  ["dependency", "bun.lock"],
  ["dependency", "apps/web/pnpm-lock.yaml"],
  ["ui", "packages/app-shell/src/button.tsx"],
  ["ui", "packages/app-shell/src/theme/button.css"],
  ["personal-data", "src/privacy/policy.md"],
  ["personal-data", "privacy/notice.md"],
] as const

const SUGGESTIONS = [
  ["api-wire", "Content-Type: application/json"],
  ["data-migration", "ALTER TABLE users ADD COLUMN name text"],
  ["performance", "for await (const item of items) {"],
  ["ci-infra", "permissions: contents: read"],
  ["dependency", "dependencies: {"],
  ["ui", 'aria-label="close"'],
  ["personal-data", "email"],
  ["personal-data", "https://example.com/collect"],
] as const

const QUICK = {
  lensChildren: 0,
  samples: 1,
  verifiers: 0,
  itemsPerLens: 5,
  loadsPerSession: 2,
  candidatesPerChild: 5,
  candidatesPerVerifier: 0,
  toolCallsPerSession: 15,
  probeAttempts: 0,
}

describe("phase 3 acceptance", () => {
  test("phase 3 catalog ids match the frozen lens class overlay and rule contract", () => {
    for (const [id, node, classes] of LENSES) {
      const entry = catalog.lenses.find((lens) => lens.id === id)
      expect(entry?.node).toBe(node)
      expect(entry?.classes).toEqual(expect.arrayContaining([...classes]))
    }
    expect(catalog.lenses.find((lens) => lens.id === "security")?.classes.toSorted()).toEqual([
      "security.boundary",
      "security.ci",
      "security.infra",
      "security.secret",
      "security.supply-chain",
    ])
    expect(catalog.lenses.filter((lens) => lens.id === "security" || lens.id.startsWith("security-")).map((lens) => lens.id)).toEqual([
      "security-release", "security",
    ])
    for (const [id, node] of CLASSES) {
      const entry = catalog.classes.find((item) => item.id === id)
      expect(entry?.node).toBe(node)
      expect(entry?.options["*"]?.map((option) => option.option)).toEqual(OFFER)
    }
    expect(catalog.classes.find((entry) => entry.id === "security.boundary")?.options["*"]?.map((option) => option.option)).toEqual([
      "quote",
      "tool:ast-grep",
      "probe:test",
    ])
    expect(catalog.options.find((option) => option.id === "tool:ast-grep")).toEqual({ id: "tool:ast-grep", rung: "tool", cost: "low" })
    expect(catalog.classes.find((entry) => entry.id === "tests.missing")?.id).toBe("tests.missing")
    expect(catalog.classes.find((entry) => entry.id === "tests.weak-oracle")?.id).toBe("tests.weak-oracle")
    expect(catalog.lenses.find((lens) => lens.id === "tests")?.classes.toSorted()).toEqual(["tests.missing", "tests.weak-oracle"])
    expect(catalog.overlays.find((overlay) => overlay.id === "performance")?.lenses).toEqual([
      "correctness-performance",
      "correctness-resources",
    ])
    for (const [id, lenses] of OVERLAYS) {
      expect(catalog.overlays.find((overlay) => overlay.id === id)?.lenses.toSorted()).toEqual([...lenses].toSorted())
    }
    expect(catalog.overlays.map((overlay) => overlay.id)).toEqual(expect.arrayContaining(["docs", "concurrency", ...OVERLAYS.map(([id]) => id)]))
    const routed = new Set([
      ...catalog.route.profiles.flatMap((profile) => Object.values(profile.lenses).flat()),
      ...catalog.overlays.flatMap((overlay) => overlay.lenses),
    ])
    for (const [id] of LENSES) expect(routed.has(id)).toBe(true)
    expect(catalog.languages.map((language) => language.id)).toEqual(expect.arrayContaining(["js-ts", "python", "go", "ruby", "php", "sql"]))
    expect(catalog.route.tiers.map((tier) => [tier.id, tier.built, tier.runs])).toEqual([
      ["quick", true, "quick"],
      ["standard", true, "standard"],
      ["deep", false, "standard"],
    ])
    expect(catalog.options.map((option) => option.id)).toEqual(expect.arrayContaining(["probe:mutants", "probe:interleave", "probe:property"]))
    for (const id of ["probe:formal", "probe:fuzz"]) expect(catalog.options.map((option) => option.id)).not.toContain(id)
  })

  test("profile pr keeps risk code overlays and the quick standard deep budget contract", () => {
    const profile = catalog.route.profiles.find((entry) => entry.id === "pr")
    expect(profile).toMatchObject({ id: "pr", node: "lucy-review-pr", stage: "code", tier: "risk", overlays: true })
    expect(catalog.route.tiers.find((tier) => tier.id === "quick")?.budget).toEqual({
      lenses: { min: 1, max: 2 },
      lensChildren: false,
      samples: 1,
      loadsPerSession: 2,
      itemsPerLens: 5,
      candidatesPerLens: 5,
      verifiers: 0,
      candidatesPerVerifier: 0,
      toolCallsPerSession: 15,
    })
    expect(catalog.route.tiers.find((tier) => tier.id === "standard")?.budget).toEqual({
      lenses: { min: 3, max: 6 },
      lensChildren: true,
      samples: 1,
      loadsPerSession: 3,
      itemsPerLens: 15,
      candidatesPerLens: 8,
      verifiers: 4,
      candidatesPerVerifier: 4,
      toolCallsPerSession: 30,
    })
    expect(catalog.route.tiers.find((tier) => tier.id === "deep")).toMatchObject({ built: false, runs: "standard" })
    const quick = ReviewRoute.route(request("pr", "quick"), { files: [] }, head("src/plain.ts"), catalog)
    expect(quick.profile).toEqual({ id: "pr", source: "request" })
    expect(quick.tier).toEqual({ id: "quick", source: "request", signals: [] })
    expect(quick.budget).toEqual(QUICK)
    const deep = ReviewRoute.route(request("pr", "deep"), { files: [] }, head("src/plain.ts"), catalog)
    expect(deep.tier).toEqual({ id: "standard", source: "request", requested: "deep", signals: [] })
    expect(deep.budget).toMatchObject({
      samples: 1,
      verifiers: 4,
      itemsPerLens: 15,
      loadsPerSession: 3,
      candidatesPerChild: 8,
      candidatesPerVerifier: 4,
      toolCallsPerSession: 30,
      probeAttempts: 2,
    })
    expect(deep.budget.samples).not.toBe(2)
    expect(deep.budget.verifiers).not.toBe(10)
    const bound = head("service.proto", 'syntax = "proto3";')
    const plain = ReviewRoute.route(request("pr", "standard"), { files: bound.files }, bound, catalog)
    const told = ReviewRoute.route(
      { ...request("pr", "standard"), text: ["skip security", "do not apply api-wire", "docs only, no review needed"] },
      { files: bound.files },
      bound,
      catalog,
    )
    expect(JSON.stringify(told)).toBe(JSON.stringify(plain))
    expect(JSON.stringify(plain)).not.toContain("lucy-js-eval")
    expect(JSON.stringify(plain)).not.toContain("eval($$$ARGS)")
    expect(JSON.stringify(plain)).not.toContain(astGrep.targets["darwin-arm64"].artifact.integrity)
    expect(plain.catalog).toMatch(/^[0-9a-f]{64}$/)
    expect(Object.keys(plain).toSorted()).toEqual([
      "budget",
      "catalog",
      "deviations",
      "languages",
      "lenses",
      "overlays",
      "packs",
      "profile",
      "tier",
      "version",
    ])
    expect(Schema.decodeUnknownSync(ReviewRouting.Record)(plain)).toEqual(plain)
    expect(() => ReviewRoute.route({ stage: "plan", profile: "pr", settings }, { files: [] }, head("src/plain.ts"), catalog)).toThrow(
      'Review profile "pr" records under stage "code", not "plan".',
    )
  })

  test("seven overlays bind on path examples and content does not bind lenses", () => {
    for (const [id, file] of BINDINGS) {
      const record = ReviewRoute.route(request("code", "standard"), { files: [file] }, head(file, "const n = 1"), catalog)
      expect(record.overlays).toContainEqual({ id, source: "path", signal: file })
      const overlay = catalog.overlays.find((overlay) => overlay.id === id)
      if (!overlay) throw new Error(`missing catalog overlay: ${id}`)
      expect(routedOrCapped(record, id)).toEqual(overlay.lenses.toSorted())
    }
    for (const [id, text] of SUGGESTIONS) {
      const record = ReviewRoute.route(request("code", "quick"), { files: ["src/plain.ts"] }, head("src/plain.ts", text), catalog)
      const overlay = record.overlays.find((entry) => entry.id === id)
      expect(overlay?.source).toBe("content")
      expect(overlay?.signal?.startsWith("src/plain.ts:1 ")).toBe(true)
      expect(record.lenses.some((lens) => lens.because === `overlay:${id}`)).toBe(false)
    }
    const lookalike = ReviewRoute.route(
      request("code", "standard"),
      { files: ["src/plain.ts"] },
      {
        files: ["src/plain.ts"],
        changes: [
          {
            path: "src/plain.ts",
            added: [
              "Content-Typed",
              "ALTERED TABLE",
              "for awaiting",
              "permissionless",
              "dependenciesExtra",
              "variant-label",
              "emailed",
              "http://example.com/collect",
            ].map((text, index) => ({ line: index + 1, text })),
            removed: 0,
          },
        ],
      },
      catalog,
    )
    expect(lookalike.overlays.map((overlay) => overlay.id).filter((id) => OVERLAYS.some(([overlay]) => overlay === id))).toEqual([])
    const removed = ReviewRoute.route(
      request("code", "standard"),
      { files: ["src/plain.ts"] },
      { files: ["src/plain.ts"], changes: [{ path: "src/plain.ts", added: [], removed: 8 }] },
      catalog,
    )
    expect(removed.overlays.map((overlay) => overlay.id).filter((id) => OVERLAYS.some(([overlay]) => overlay === id))).toEqual([])
    const first = ReviewRoute.route(
      request("code", "standard"),
      { files: ["service.proto", "infra/main.tf"] },
      {
        files: ["service.proto", "infra/main.tf"],
        changes: [
          { path: "service.proto", added: [{ line: 1, text: "syntax" }], removed: 0 },
          { path: "infra/main.tf", added: [{ line: 1, text: "resource" }], removed: 0 },
        ],
      },
      catalog,
    )
    const shuffled = ReviewRoute.route(
      request("code", "standard"),
      { files: ["infra/main.tf", "service.proto"] },
      {
        files: ["infra/main.tf", "service.proto"],
        changes: [
          { path: "infra/main.tf", added: [{ line: 1, text: "resource" }], removed: 0 },
          { path: "service.proto", added: [{ line: 1, text: "syntax" }], removed: 0 },
        ],
      },
      catalog,
    )
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(first))
    const capped = ReviewRoute.route(request("code", "quick"), { files: ["service.proto"] }, head("service.proto", "syntax"), catalog)
    expect(capped.budget).toEqual(QUICK)
    expect(capped.lenses.length).toBeLessThanOrEqual(2)
    expect(capped.overlays).toContainEqual({ id: "api-wire", source: "path", signal: "service.proto" })
    expect(seen(capped).has("contracts")).toBe(true)
    expect(capped.deviations.some((deviation) => deviation.kind === "lens-cap")).toBe(true)
  })

  test("ast-grep eval rules stay on probation at P2 for security.boundary", () => {
    const pack = catalog.packs.find((entry) => entry.id === "ast-grep")
    expect(pack).toMatchObject({
      id: "ast-grep",
      version: "0.45.3",
      licence: "pinned",
      backend: "pinned",
      lane: "no-build",
      languages: ["js-ts"],
      output: { format: "json", parser: "ast-grep" },
      template: "ast-grep-scan-json",
      network: { kind: "none" },
      scratchWrites: false,
      status: "probation",
    })
    expect(pack?.version).toBe(astGrep.version)
    expect(pack?.tiers.toSorted()).toEqual(["deep", "standard"])
    expect(pack?.pin?.integrity).toEqual(
      Object.fromEntries(Object.entries(astGrep.targets).map(([target, entry]) => [target, entry.artifact.integrity])),
    )
    for (const rule of ["lucy-js-eval", "lucy-ts-eval"]) {
      const entry = catalog.rules.find((item) => item.pack === "ast-grep" && item.rule === rule)
      expect(entry).toMatchObject({
        pack: "ast-grep",
        rule,
        class: "security.boundary",
        lens: "security",
        severity: { "*": "P2" },
        status: "probation",
      })
      expect(entry?.triage).toContain("untrusted")
      expect(entry?.triage.toLowerCase()).toContain("structural")
    }
    const js = { files: ["package.json", "src/app.ts"] }
    const change = head("src/app.ts", "const n = 1")
    const standard = ReviewRoute.route(request("code", "standard"), js, { ...change, files: js.files }, catalog)
    expect(standard.packs).toContainEqual({ id: "ast-grep", source: "catalog", lane: "no-build", status: "routed" })
    const deep = ReviewRoute.route(request("code", "deep"), js, { ...change, files: js.files }, catalog)
    expect(deep.tier.id).toBe("standard")
    expect(deep.tier.requested).toBe("deep")
    expect(deep.packs).toContainEqual({ id: "ast-grep", source: "catalog", lane: "no-build", status: "routed" })
    const quick = ReviewRoute.route(request("code", "quick"), js, { ...change, files: js.files }, catalog)
    expect(quick.packs.map((entry) => entry.id)).not.toContain("ast-grep")
    const python = ReviewRoute.route(
      request("code", "standard"),
      { files: ["pyproject.toml", "src/app.py"] },
      { files: ["pyproject.toml", "src/app.py"], changes: [{ path: "src/app.py", added: [{ line: 1, text: "n = 1" }], removed: 0 }] },
      catalog,
    )
    expect(python.packs.map((entry) => entry.id)).not.toContain("ast-grep")
  })
})

function request(profile: "code" | "pr", tier: string): ReviewRoute.Request {
  return { stage: "code", profile, tier, settings }
}

function head(file: string, text = "const n = 1"): ReviewRoute.Head {
  return { files: [file], changes: [{ path: file, added: [{ line: 1, text }], removed: 0 }] }
}

function seen(record: ReviewRouting.Record) {
  return new Set([
    ...record.lenses.map((lens) => lens.id),
    ...record.deviations.filter((deviation) => deviation.kind === "lens-cap").map((deviation) => deviation.ref),
  ])
}

function routedOrCapped(record: ReviewRouting.Record, id: string) {
  const lenses = catalog.overlays.find((overlay) => overlay.id === id)?.lenses ?? []
  return lenses.filter((lens) => seen(record).has(lens)).toSorted()
}
