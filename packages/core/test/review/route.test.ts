import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Schema } from "effect"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewRoute } from "../../src/review/route"
import { ReviewRouting } from "../../src/review/routing"

// Preserve the R3 regression matrix for catalogs whose Deep adapters are genuinely unavailable.
const catalog: ReviewCatalog.Catalog = {
  ...ReviewCatalog.current,
  route: { ...ReviewCatalog.current.route, tiers: ReviewCatalog.current.route.tiers.map((tier) =>
    tier.id === "deep" ? { ...tier, built: false, runs: "standard" } : tier) },
}
const fixture = (name: string) => path.join(import.meta.dir, "route-fixture", name)
const owner: { base: ReviewRoute.Tree; head: ReviewRoute.Head } = await Bun.file(fixture("owner-example.json")).json()
const docs: { base: ReviewRoute.Tree; head: ReviewRoute.Head } = await Bun.file(fixture("docs-only.json")).json()
const body = await Bun.file(fixture("pr-body.md")).text()

const code: ReviewRoute.Request = { stage: "code", settings: { acceptedUnavailable: [] } }
const digest = ReviewCatalog.catalogDigest(catalog).slice("sha256:".length)

const STANDARD = {
  lensChildren: 5,
  samples: 1,
  verifiers: 4,
  itemsPerLens: 15,
  loadsPerSession: 3,
  candidatesPerChild: 8,
  candidatesPerVerifier: 4,
  toolCallsPerSession: 30,
  probeAttempts: 2,
}

describe("review route", () => {
  test("the owner's §8.3 example routes as the design shows, with Deep run as Standard (R3)", () => {
    const record = ReviewRoute.route(code, owner.base, owner.head, catalog)
    expect(record).toEqual({
      version: "route-v1",
      catalog: digest,
      profile: { id: "code", source: "request" },
      tier: {
        id: "standard",
        source: "risk",
        requested: "deep",
        signals: ["overlay: concurrency", "path: db/migrations/0042.sql", "changedLines: 512"],
      },
      overlays: [
        { id: "concurrency", source: "content", signal: "src/jobs/drain.ts:41 deferred" },
        { id: "data-migration", source: "path", signal: "db/migrations/0042.sql" },
        { id: "performance", source: "content", signal: "src/jobs/drain.ts:60 for-await" },
      ],
      languages: [
        { id: "js-ts", source: "path", signal: "package.json" },
        { id: "sql", source: "path", signal: "db/migrations/0042.sql" },
      ],
      lenses: [
        { id: "correctness-logic", source: "catalog", node: "lucy-lens-correctness-logic", because: "profile" },
        { id: "correctness-edges", source: "catalog", node: "lucy-lens-correctness-edges", because: "tier:standard" },
        { id: "correctness-reliability", source: "catalog", node: "lucy-lens-correctness-reliability", because: "tier:standard" },
        { id: "tests", source: "catalog", node: "lucy-lens-tests", because: "profile" },
        { id: "security", source: "catalog", node: "lucy-lens-security", because: "tier:standard" },
        { id: "contracts", source: "path", node: "lucy-lens-contracts", because: "overlay:data-migration" },
      ],
      packs: [
        { id: "gitleaks", source: "catalog", lane: "no-build", status: "routed" },
        { id: "repo", source: "catalog", lane: "repo", status: "routed" },
        { id: "ast-grep", source: "catalog", lane: "no-build", status: "routed" },
        { id: "squawk", source: "path", lane: "no-build", status: "routed" },
        { id: "oxlint", source: "catalog", lane: "no-build", status: "routed" },
        { id: "tsc", source: "catalog", lane: "build", status: "routed" },
        { id: "oxlint-type-aware", source: "catalog", lane: "build", status: "routed" },
        { id: "jscpd", source: "catalog", lane: "no-build", status: "routed" },
      ],
      budget: { ...STANDARD, lensChildren: 6 },
      deviations: [deviation("change", "pack:jscpd")],
    })
    expect(Schema.decodeUnknownSync(ReviewRouting.Record)(record)).toEqual(record)
  })

  test("identical inputs give byte-identical records and digests, whatever the input order", () => {
    const first = ReviewRoute.route(code, owner.base, owner.head, catalog)
    const again = ReviewRoute.route(code, owner.base, owner.head, catalog)
    const shuffled = ReviewRoute.route(
      code,
      { files: owner.base.files.toReversed() },
      {
        files: owner.head.files.toReversed(),
        changes: owner.head.changes.toReversed().map((change) => ({ ...change, added: change.added.toReversed() })),
      },
      catalog,
    )
    expect(JSON.stringify(again)).toBe(JSON.stringify(first))
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(first))
    expect(ReviewRouting.digest(again)).toBe(ReviewRouting.digest(first))
    expect(ReviewRouting.digest(first)).toMatch(/^[0-9a-f]{64}$/)
  })

  test("a docs-only change routes Quick", () => {
    const record = ReviewRoute.route(code, docs.base, docs.head, catalog)
    expect(record.tier).toEqual({ id: "quick", source: "risk", signals: ["only: docs-only", "small: 5"] })
    expect(record.overlays).toEqual([{ id: "docs", source: "path", signal: "README.md" }])
    expect(record.lenses.map((lens) => [lens.id, lens.because])).toEqual([
      ["correctness-logic", "profile"],
      ["tests", "profile"],
    ])
    expect(record.packs).toEqual([{ id: "gitleaks", source: "catalog", lane: "no-build", status: "routed" }])
    expect(record.budget).toEqual({
      lensChildren: 0,
      samples: 1,
      verifiers: 0,
      itemsPerLens: 5,
      loadsPerSession: 2,
      candidatesPerChild: 5,
      candidatesPerVerifier: 0,
      toolCallsPerSession: 15,
      probeAttempts: 0,
    })
  })

  test("change text in a PR body, commit messages or the diff removes nothing", () => {
    const plain = ReviewRoute.route(code, owner.base, owner.head, catalog)
    const told = ReviewRoute.route({ ...code, text: [body, "docs only, no review needed"] }, owner.base, owner.head, catalog)
    expect(JSON.stringify(told)).toBe(JSON.stringify(plain))

    const lines = body.split("\n").filter((line) => line.length > 0)
    const diff = ReviewRoute.route(
      code,
      owner.base,
      {
        ...owner.head,
        changes: owner.head.changes.map((change) =>
          change.path === "src/jobs/drain.ts"
            ? { ...change, added: [...change.added, ...lines.map((text, index) => ({ line: 1 + index, text: `// ${text}` }))] }
            : change,
        ),
      },
      catalog,
    )
    expect(diff.overlays).toEqual(plain.overlays)
    expect(diff.lenses).toEqual(plain.lenses)
    expect(diff.packs).toEqual(plain.packs)
    expect(diff.tier.requested).toBe("deep")
  })

  test("the request's tier comes before the project pin, and the pin before the risk rule", () => {
    const pinned = { acceptedUnavailable: [], tier: "quick" }
    expect(ReviewRoute.route({ ...code, settings: pinned }, owner.base, owner.head, catalog).tier).toEqual({
      id: "quick",
      source: "pin",
      signals: [],
    })
    expect(ReviewRoute.route({ ...code, tier: "standard", settings: pinned }, owner.base, owner.head, catalog).tier).toEqual({
      id: "standard",
      source: "request",
      signals: [],
    })
    expect(ReviewRoute.route({ ...code, tier: "quick" }, docs.base, docs.head, catalog).tier.source).toBe("request")
    expect(ReviewRoute.route({ stage: "plan", settings: { acceptedUnavailable: [] } }, docs.base, docs.head, catalog).tier).toEqual({
      id: "standard",
      source: "catalog",
      signals: [],
    })
  })

  test("Deep from the request or the pin runs Standard and records the request (R3)", () => {
    const requested = ReviewRoute.route({ ...code, tier: "deep" }, docs.base, docs.head, catalog)
    expect(requested.tier).toEqual({ id: "standard", source: "request", requested: "deep", signals: [] })
    expect(requested.budget).toEqual(STANDARD)
    const pinned = ReviewRoute.route({ ...code, settings: { acceptedUnavailable: [], tier: "deep" } }, docs.base, docs.head, catalog)
    expect(pinned.tier).toEqual({ id: "standard", source: "pin", requested: "deep", signals: [] })
  })

  test("an unsupported profile or tier is a named error, never a fallback", () => {
    const fails = (request: ReviewRoute.Request, expected: ReviewRoute.RouteError["code"]) => {
      const error = (() => {
        try {
          ReviewRoute.route(request, docs.base, docs.head, catalog)
        } catch (caught) {
          return caught
        }
      })()
      expect(error).toBeInstanceOf(ReviewRoute.RouteError)
      expect((error as ReviewRoute.RouteError).code).toBe(expected)
    }
    fails({ ...code, profile: "nope" }, "unsupported-profile")
    fails({ ...code, profile: "plan" }, "profile-stage")
    fails({ ...code, tier: "ultra" }, "unsupported-tier")
    fails({ ...code, settings: { acceptedUnavailable: [], tier: "ultra" } }, "unsupported-tier")
    fails({ ...code, profile: "rereview" }, "first-round-tier")
    fails({ stage: "plan", profile: "pr", settings: { acceptedUnavailable: [] } }, "profile-stage")
  })

  test("a governed code request still selects code, not pr", () => {
    expect(ReviewRoute.route(code, docs.base, docs.head, catalog).profile).toEqual({ id: "code", source: "request" })
    const plan = ReviewRoute.route({ stage: "plan", settings: { acceptedUnavailable: [] } }, owner.base, owner.head, catalog)
    expect(plan.profile).toEqual({ id: "plan", source: "request" })
    expect(plan.overlays).toEqual([])
  })

  test("an explicit engagement profile does not replace the governed code request", () => {
    expect(ReviewRoute.route(code, docs.base, docs.head, catalog).profile).toEqual({ id: "code", source: "request" })
    const audit = ReviewRoute.route({ ...code, profile: "audit" }, docs.base, docs.head, catalog)
    expect(audit.profile).toEqual({ id: "audit", source: "request" })
    expect(audit.overlays).toEqual([])
    const release = ReviewRoute.route({ ...code, profile: "release" }, docs.base, docs.head, catalog)
    expect(release.profile).toEqual({ id: "release", source: "request" })
    expect(release.tier).toEqual({ id: "standard", source: "catalog", requested: "deep", signals: [] })
  })

  test("standard routes syft when a named lockfile changes and quick does not", () => {
    const lockBase = { files: ["bun.lock"] }
    const lockHead = {
      files: ["bun.lock"],
      changes: [{ path: "bun.lock", added: [{ line: 1, text: "{}" }], removed: 0 }],
    }
    const settings = { acceptedUnavailable: [] }
    expect(ReviewRoute.route({ stage: "code", tier: "standard", settings }, lockBase, lockHead, catalog).packs).toContainEqual({ id: "syft", source: "catalog", lane: "no-build", status: "routed" })
    expect(ReviewRoute.route({ stage: "code", tier: "quick", settings }, lockBase, lockHead, catalog).packs.some((pack) => pack.id === "syft")).toBe(false)
    const nested = ReviewRoute.route({ stage: "code", tier: "standard", settings }, { files: ["apps/desktop/yarn.lock"] }, {
      files: ["apps/desktop/yarn.lock"],
      changes: [{ path: "apps/desktop/yarn.lock", added: [{ line: 1, text: "#" }], removed: 0 }],
    }, catalog)
    expect(nested.packs).toContainEqual({ id: "syft", source: "catalog", lane: "no-build", status: "routed" })
  })

  test("an explicit pr request uses pr and the same lenses as code", () => {
    const governed = ReviewRoute.route(code, owner.base, owner.head, catalog)
    const pr = ReviewRoute.route({ ...code, profile: "pr" }, owner.base, owner.head, catalog)
    expect(pr.profile).toEqual({ id: "pr", source: "request" })
    expect(pr.lenses).toEqual(governed.lenses)
    expect(pr.overlays).toEqual(governed.overlays)
    expect(pr.tier).toEqual(governed.tier)
    expect(pr.budget).toEqual(governed.budget)
  })
})

describe("phase 3 overlays", () => {
  test.each([
    ["api-wire", "api.proto", "contracts", "path", "overlay:api-wire", "lucy-lens-contracts"],
    ["api-wire", "pkg/api/service.proto", "contracts", "path", "overlay:api-wire", "lucy-lens-contracts"],
    ["api-wire", "openapi.yaml", "contracts", "path", "overlay:api-wire", "lucy-lens-contracts"],
    ["api-wire", "services/openapi.json", "contracts", "path", "overlay:api-wire", "lucy-lens-contracts"],
    ["data-migration", "migrations/001.sql", "contracts", "path", "overlay:data-migration", "lucy-lens-contracts"],
    ["data-migration", "db/migrations/nested/001.sql", "contracts", "path", "overlay:data-migration", "lucy-lens-contracts"],
    ["performance", "benchmarks/hot.ts", "correctness-performance", "path", "overlay:performance", "lucy-lens-correctness-performance"],
    ["performance", "pkg/benchmarks/hot.ts", "correctness-resources", "capped", "overlay:performance", "lucy-lens-correctness-resources"],
    ["ci-infra", ".github/workflows/ci.yml", "change", "path", "overlay:ci-infra", "lucy-lens-change"],
    ["ci-infra", ".github/workflows/nested/ci.yml", "security", "catalog", "tier:standard", "lucy-lens-security"],
    ["ci-infra", "main.tf", "change", "path", "overlay:ci-infra", "lucy-lens-change"],
    ["ci-infra", "modules/vpc/main.tf", "security", "catalog", "tier:standard", "lucy-lens-security"],
    ["dependency", "package.json", "contracts", "path", "overlay:dependency", "lucy-lens-contracts"],
    ["dependency", "packages/core/package.json", "security", "catalog", "tier:standard", "lucy-lens-security"],
    ["dependency", "bun.lock", "contracts", "path", "overlay:dependency", "lucy-lens-contracts"],
    ["dependency", "apps/desktop/yarn.lock", "security", "catalog", "tier:standard", "lucy-lens-security"],
    ["ui", "packages/app-shell/src/app.tsx", "experience", "path", "overlay:ui", "lucy-lens-experience"],
    ["ui", "packages/app-shell/src/nested/view.css", "experience", "path", "overlay:ui", "lucy-lens-experience"],
    ["ui", "button.tsx", "experience", "path", "overlay:ui", "lucy-lens-experience"],
    ["ui", "src/button.css", "experience", "path", "overlay:ui", "lucy-lens-experience"],
    ["personal-data", "privacy/fields.ts", "privacy", "path", "overlay:personal-data", "lucy-audit-compliance-privacy"],
    ["personal-data", "docs/privacy/fields.ts", "privacy", "path", "overlay:personal-data", "lucy-audit-compliance-privacy"],
  ] as const)("%s binds %s and accounts for %s as %s", (id, file, lens, kind, because, node) => {
    const record = routed(file)
    expect(found(record, id)).toEqual({ id, source: "path", signal: file })
    if (kind === "capped") {
      expect(record.lenses.some((entry) => entry.id === lens)).toBe(false)
      expect(record.deviations).toContainEqual(deviation(lens, because))
      return
    }
    expect(record.lenses).toContainEqual({ id: lens, source: kind, node, because })
  })

  test("a performance path routes the first lens and caps the second", () => {
    const record = routed("benchmarks/hot.ts")
    expect(found(record, "performance")).toEqual({ id: "performance", source: "path", signal: "benchmarks/hot.ts" })
    expect(record.lenses).toContainEqual({
      id: "correctness-performance",
      source: "path",
      node: "lucy-lens-correctness-performance",
      because: "overlay:performance",
    })
    expect(record.lenses.some((entry) => entry.id === "correctness-resources")).toBe(false)
    expect(record.deviations).toContainEqual(deviation("correctness-resources", "overlay:performance"))
  })

  test.each([
    ["api-wire", "src/handler.ts", "Content-Type: application/json", "content-type", "contracts"],
    ["data-migration", "src/notes.ts", "ALTER TABLE job ADD COLUMN x INTEGER;", "alter-table", "contracts"],
    ["performance", "src/jobs/drain.ts", "for await (const batch of batches) {", "for-await", "correctness-performance"],
    ["performance", "src/pool.ts", "pool.dispose()", "lifetime", "correctness-resources"],
    ["ci-infra", "src/script.ts", "permissions: write-all", "permissions", "change"],
    ["dependency", "notes.md", "dependencies: { left: 1 }", "dependencies", "contracts"],
    ["ui", "src/button.ts", "aria-label=\"Save\"", "aria-label", "experience"],
    ["personal-data", "src/user.ts", "const email = input.email", "email", "privacy"],
    ["personal-data", "src/client.ts", "fetch(\"https://example.com/collect\")", "https-host", "privacy"],
  ] as const)("%s content on %s suggests and does not bind %s", (id, file, text, pattern, lens) => {
    const record = routed(file, [text])
    expect(found(record, id)).toEqual({ id, source: "content", signal: `${file}:1 ${pattern}` })
    expect(record.lenses.some((entry) => entry.id === lens && entry.because === `overlay:${id}`)).toBe(false)
  })

  test.each([
    ["api-wire", "src/handler.ts", "const ok = 1"],
    ["api-wire", "proto/readme.md", "not a proto"],
    ["api-wire", "my-openapi.yaml", "name: openapi"],
    ["data-migration", "db/migration/001.sql", "CREATE TABLE job (id INTEGER);"],
    ["performance", "benchmark/hot.ts", "const ok = 1"],
    ["performance", "src/pool.ts", "const predisposed = true"],
    ["performance", "src/jobs/drain.ts", "for awaiting the batch"],
    ["ci-infra", "pkg/.github/workflows/ci.yml", "name: ci"],
    ["ci-infra", "src/script.ts", "permission: read"],
    ["dependency", "src/app.ts", "devDependencies: { foo: 1 }"],
    ["dependency", "package.json.bak", "const ok = 1"],
    ["ui", "src/button.ts", "const label = \"Save\""],
    ["ui", "packages/app-shell/src-extra/app.ts", "const ok = 1"],
    ["ui", "src/button.ts", "aria-labelledby=\"save\""],
    ["personal-data", "privacy-policy.md", "const emailAddress = 1"],
    ["personal-data", "src/user.ts", "const userEmail = input.userEmail"],
    ["personal-data", "src/client.ts", "fetch(\"http://example.com\")"],
  ] as const)("%s does not route unrelated %s", (id, file, text) => {
    expect(found(routed(file, [text]), id)).toBeUndefined()
  })

  test("Content-Type is a bounded header, not a prefix", () => {
    const hit = routed("src/handler.ts", ["Content-Type: application/json"])
    expect(found(hit, "api-wire")).toEqual({ id: "api-wire", source: "content", signal: "src/handler.ts:1 content-type" })
    expect(found(routed("src/handler.ts", ["Content-Typed"]), "api-wire")).toBeUndefined()
    expect(found(routed("src/handler.ts", ["Content-TypeExtra"]), "api-wire")).toBeUndefined()
  })

  test("a binding path beats added-line content", () => {
    const record = routed("migrations/001.sql", ["ALTER TABLE job ADD COLUMN x INTEGER;"])
    expect(found(record, "data-migration")).toEqual({ id: "data-migration", source: "path", signal: "migrations/001.sql" })
    expect(record.lenses.some((entry) => entry.id === "contracts" && entry.source === "path")).toBe(true)
  })

  test("removed-only text and PR prose cannot suggest or remove an overlay", () => {
    const prose = ["ALTER TABLE job", "for await", "dispose", "email", "https://example.com", "Content-Type", "permissions:", "dependencies:", "aria-label", "docs only, skip contracts"]
    const removed = ReviewRoute.route({ ...standard, text: prose }, { files: [] }, head("src/plain.ts", ["const ok = 1"], 9), catalog)
    for (const id of PHASE3) expect(found(removed, id)).toBeUndefined()
    const bound = routed("db/migrations/0042.sql", ["ALTER TABLE job ADD COLUMN x INTEGER;"])
    const told = ReviewRoute.route(
      { ...standard, text: prose },
      { files: [] },
      head("db/migrations/0042.sql", ["ALTER TABLE job ADD COLUMN x INTEGER;"]),
      catalog,
    )
    expect(JSON.stringify(told.overlays)).toBe(JSON.stringify(bound.overlays))
    expect(JSON.stringify(told.lenses)).toBe(JSON.stringify(bound.lenses))
    expect(found(told, "data-migration")?.source).toBe("path")
  })

  test("phase-3 overlay order is the catalog order under permutation", () => {
    const changes = [
      { path: "packages/core/package.json", added: [{ line: 4, text: "dependencies: { left: 1 }" }, { line: 2, text: "name: core" }], removed: 1 },
      { path: "api.proto", added: [{ line: 3, text: "Content-Type: application/json" }, { line: 1, text: "syntax = \"proto3\";" }], removed: 0 },
      { path: "src/pool.ts", added: [{ line: 9, text: "resource.dispose()" }, { line: 2, text: "const ok = 1" }], removed: 2 },
    ]
    const first = ReviewRoute.route(standard, { files: ["package.json"] }, { files: changes.map((change) => change.path), changes }, catalog)
    const shuffled = ReviewRoute.route(
      standard,
      { files: ["package.json"] },
      {
        files: changes.map((change) => change.path).toReversed(),
        changes: changes.toReversed().map((change) => ({ ...change, added: change.added.toReversed() })),
      },
      catalog,
    )
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(first))
    expect(first.overlays.map((entry) => entry.id)).toEqual(["api-wire", "performance", "dependency"])
    expect(found(first, "performance")?.signal).toBe("src/pool.ts:9 lifetime")
  })

  test("the standard lens cap records explicit deviations and Deep still runs Standard", () => {
    const files = ["api.proto", "migrations/001.sql", "benchmarks/hot.ts", ".github/workflows/ci.yml", "package.json", "button.tsx", "privacy/fields.ts", "README.md"]
    const changes = files.map((file) => ({ path: file, added: [{ line: 1, text: "const ok = 1" }], removed: 0 }))
    const record = ReviewRoute.route(standard, { files: [] }, { files, changes }, catalog)
    expect(record.lenses.map((entry) => entry.id)).toEqual(["correctness-logic", "correctness-edges", "correctness-reliability", "tests", "security", "contracts"])
    expect(record.deviations).toEqual([
      deviation("correctness-performance", "overlay:performance"),
      deviation("correctness-resources", "overlay:performance"),
      deviation("change", "overlay:ci-infra"),
      deviation("experience", "overlay:ui"),
      deviation("privacy", "overlay:personal-data"),
    ])
    expect(record.budget).toEqual({ ...STANDARD, lensChildren: 6 })
    const deep = ReviewRoute.route({ ...code, tier: "deep" }, { files: [] }, head("benchmarks/hot.ts"), catalog)
    expect(deep.tier).toEqual({ id: "standard", source: "request", requested: "deep", signals: [] })
    expect(deep.budget.probeAttempts).toBe(2)
    expect(deep.budget.verifiers).toBe(4)
    expect(deep.budget.toolCallsPerSession).toBe(30)
    expect(deep.budget.itemsPerLens).toBe(15)
  })
})

const PHASE3 = ["api-wire", "data-migration", "performance", "ci-infra", "dependency", "ui", "personal-data"]
const standard: ReviewRoute.Request = { stage: "code", tier: "standard", settings: { acceptedUnavailable: [] } }

function head(file: string, added: readonly string[] = ["const ok = 1"], removed = 0): ReviewRoute.Head {
  return { files: [file], changes: [{ path: file, added: added.map((text, index) => ({ line: index + 1, text })), removed }] }
}

function routed(file: string, added?: readonly string[], removed = 0) {
  return ReviewRoute.route(standard, { files: [] }, head(file, added, removed), catalog)
}

function found(record: ReturnType<typeof ReviewRoute.route>, id: string) {
  return record.overlays.find((entry) => entry.id === id)
}

function deviation(id: string, because: string) {
  return { kind: "lens-cap" as const, stage: "route" as const, detail: `lens ${id} (${because}) is over the standard cap of 6 lenses`, ref: id }
}
