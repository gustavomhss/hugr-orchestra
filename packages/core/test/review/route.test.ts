import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Schema } from "effect"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewRoute } from "../../src/review/route"
import { ReviewRouting } from "../../src/review/routing"

const catalog = ReviewCatalog.current
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
      overlays: [{ id: "concurrency", source: "content", signal: "src/jobs/drain.ts:41 deferred" }],
      languages: [{ id: "js-ts", source: "path", signal: "package.json" }],
      lenses: [
        { id: "correctness-logic", source: "catalog", node: "lucy-lens-correctness-logic", because: "profile" },
        { id: "correctness-edges", source: "catalog", node: "lucy-lens-correctness-edges", because: "tier:standard" },
        { id: "correctness-reliability", source: "catalog", node: "lucy-lens-correctness-reliability", because: "tier:standard" },
        { id: "tests", source: "catalog", node: "lucy-lens-tests", because: "profile" },
        { id: "security", source: "catalog", node: "lucy-lens-security", because: "tier:standard" },
      ],
      packs: [
        { id: "gitleaks", source: "catalog", lane: "no-build", status: "routed" },
        { id: "repo", source: "catalog", lane: "repo", status: "routed" },
      ],
      budget: STANDARD,
      deviations: [],
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
    fails({ ...code, profile: "audit" }, "unsupported-profile")
    fails({ ...code, profile: "plan" }, "profile-stage")
    fails({ ...code, tier: "ultra" }, "unsupported-tier")
    fails({ ...code, settings: { acceptedUnavailable: [], tier: "ultra" } }, "unsupported-tier")
    fails({ ...code, profile: "rereview" }, "first-round-tier")
  })
})
