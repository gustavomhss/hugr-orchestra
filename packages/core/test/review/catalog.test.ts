import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"
import gitleaks from "../../src/backend-toolkit/packs/gitleaks"
import { ReviewCatalog } from "../../src/review/catalog"

const catalog = ReviewCatalog.current
const fixture = path.join(import.meta.dir, "fixture/tree")
const lucy = path.resolve(import.meta.dir, "../../../lucy-specialist/skills")
const team = path.resolve(import.meta.dir, "../../../../modules/specialists/team/skills")

const CLASSES = [
  "concurrency.atomicity", "concurrency.order", "concurrency.toctou", "concurrency.double-execution",
  "concurrency.use-after-dispose", "concurrency.reentrancy", "concurrency.stale-read", "concurrency.aba",
  "logic.invariant", "logic.contract", "logic.error-path", "edges.category", "edges.falsehood",
  "reliability.error-handling", "reliability.retry", "reliability.timeout", "reliability.rollback",
  "tests.missing", "tests.weak-oracle", "security.boundary", "security.secret",
  "plan.coverage", "plan.requirement", "docs.contradiction",
] as const

describe("review catalog", () => {
  test("phase 1 entries decode and name exactly the phase 1 ids", () => {
    expect(() => Schema.decodeUnknownSync(ReviewCatalog.Catalog)(catalog)).not.toThrow()
    expect(catalog.route.profiles.map((profile) => profile.id)).toEqual(["plan", "code", "rereview"])
    expect(catalog.route.tiers.map((tier) => [tier.id, tier.built, tier.runs])).toEqual([
      ["quick", true, "quick"], ["standard", true, "standard"], ["deep", false, "standard"],
    ])
    expect(catalog.overlays.map((overlay) => overlay.id)).toEqual(["docs", "concurrency"])
    expect(catalog.lenses.map((lens) => [lens.id, lens.node])).toEqual([
      ["correctness-logic", "lucy-lens-correctness-logic"],
      ["correctness-edges", "lucy-lens-correctness-edges"],
      ["correctness-concurrency", "lucy-lens-correctness-concurrency"],
      ["correctness-reliability", "lucy-lens-correctness-reliability"],
      ["tests", "lucy-lens-tests"],
      ["security", "lucy-lens-security"],
    ])
    expect(catalog.classes.map((entry) => entry.id).toSorted()).toEqual(CLASSES.toSorted())
    expect(new Set(catalog.classes.map((entry) => entry.node))).toEqual(new Set(["lucy-review-prove-quote", "lucy-review-prove-regress"]))
    expect(catalog.lenses.flatMap((lens) => lens.classes).toSorted()).toEqual(CLASSES.toSorted())
    expect(catalog.options.map((option) => option.id)).toEqual([
      "quote", "tool:gitleaks", "tool:repo", "probe:regress", "probe:test", "probe:typecheck", "probe:script",
    ])
    expect(catalog.languages.map((language) => [language.id, language.node])).toEqual([
      ["js-ts", "team-stack-js-ts"], ["python", "team-stack-python"], ["go", "team-stack-go"],
      ["ruby", "team-stack-ruby"], ["php", "team-stack-php"],
    ])
  })

  test("every pack and rule starts in probation except repo packs, which are active", () => {
    expect(catalog.packs.map((pack) => [pack.id, pack.backend, pack.status])).toEqual([
      ["gitleaks", "pinned", "probation"],
      ["repo", "repo", "active"],
    ])
    expect(catalog.rules.every((rule) => rule.status === "probation")).toBe(true)
  })

  test("lucy's gitleaks entry carries the backend toolkit's pin", () => {
    const entry = catalog.packs.find((pack) => pack.id === "gitleaks")
    expect(entry?.version).toBe(gitleaks.version)
    expect(entry?.pin?.integrity).toEqual(
      Object.fromEntries(Object.entries(gitleaks.targets).map(([target, value]) => [target, value.artifact.integrity])),
    )
  })

  test("route carries the §8.3 budgets, §8.4 rungs and caps and §8.6 thresholds", () => {
    const tier = (id: string) => catalog.route.tiers.find((entry) => entry.id === id)
    expect(tier("quick")?.budget).toMatchObject({ lenses: { max: 2 }, lensChildren: false, loadsPerSession: 2, itemsPerLens: 5, candidatesPerLens: 5, verifiers: 0, toolCallsPerSession: 15 })
    expect(tier("standard")?.budget).toMatchObject({ lenses: { min: 3, max: 6 }, loadsPerSession: 3, itemsPerLens: 15, candidatesPerLens: 8, verifiers: 4, candidatesPerVerifier: 4, toolCallsPerSession: 30 })
    expect(tier("deep")?.budget).toMatchObject({ lenses: { max: 8 }, samples: 2, loadsPerSession: 4, itemsPerLens: 30, candidatesPerLens: 12, verifiers: 10, toolCallsPerSession: 50 })
    expect(tier("quick")?.rungs).toEqual({ quote: ["P0", "P1", "P2", "P3"], tool: [], probe: [], changedTests: false })
    expect(tier("standard")?.rungs).toMatchObject({ tool: ["P0", "P1", "P2"], probe: ["P0", "P1"], changedTests: true })
    expect(tier("deep")?.rungs).toMatchObject({ tool: ["P0", "P1", "P2", "P3"], probe: ["P0", "P1", "P2"] })
    expect(catalog.route.tiers.map((entry) => entry.probeAttempts)).toEqual([0, 2, 3])
    expect(tier("quick")?.report).toEqual(["P0", "P1"])
    expect(catalog.route.ledger).toMatchObject({ activate: { read: 20, confirmed: 0.5 }, demote: { window: 20, confirmedBelow: 0.2 } })
    expect(catalog.route.triggers.find((trigger) => trigger.id === "changed-lines")?.signal).toEqual({ kind: "changed-lines", over: 400 })
  })

  test("a class with more than three options for one language does not decode", () => {
    const options = [{ option: "quote", proves: "x" }, { option: "probe:test", proves: "x" }, { option: "probe:script", proves: "x" }, { option: "probe:regress", proves: "x" }]
    const broken = { ...catalog, classes: catalog.classes.map((entry) => (entry.id === "logic.invariant" ? { ...entry, options: { "*": options } } : entry)) }
    expect(() => ReviewCatalog.check(broken, {})).toThrow()
  })

  test("the content patterns match the concurrency signals they name", () => {
    const patterns = Object.fromEntries(
      (catalog.overlays.find((overlay) => overlay.id === "concurrency")?.content ?? []).map((entry) => [entry.id, new RegExp(entry.pattern)]),
    )
    expect(Object.keys(patterns)).toEqual(["lock", "spawn", "promise-all", "goroutine", "deferred"])
    expect(patterns.lock.test("const mu = new Mutex()")).toBe(true)
    expect(patterns.spawn.test("const child = spawn(cmd)")).toBe(true)
    expect(patterns["promise-all"].test("await Promise.all(jobs)")).toBe(true)
    expect(patterns.goroutine.test("\tgo func() {")).toBe(true)
    expect(patterns.goroutine.test("let go = true")).toBe(false)
    expect(patterns.deferred.test("const done = yield* Deferred.make<void>()")).toBe(true)
  })

  test("the digest is stable, ignores key order and changes when a value is tuned", () => {
    const digest = ReviewCatalog.catalogDigest(catalog)
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(ReviewCatalog.catalogDigest({ ...catalog })).toBe(digest)
    const tuned = { ...catalog, route: { ...catalog.route, ledger: { ...catalog.route.ledger, activate: { read: 30, confirmed: 0.5 } } } }
    expect(ReviewCatalog.catalogDigest(tuned)).not.toBe(digest)
  })

  test("every language names a team-stack node that exists", async () => {
    await Promise.all(catalog.languages.map(async (language) => {
      expect(await Bun.file(path.join(team, language.node.replace(/^team-stack-/, "team-stack/"), "SKILL.md")).exists()).toBe(true)
    }))
  })
})

describe("review catalog id check", () => {
  test("the fixture tree passes", async () => {
    const tree = await read(fixture)
    expect(() => ReviewCatalog.check(catalog, tree)).not.toThrow()
  })

  test("lucy's real tree passes and cites every class", async () => {
    const tree = await read(lucy)
    expect(() => ReviewCatalog.check(catalog, tree)).not.toThrow()
    const cited = new Set(Object.values(tree).flatMap((text) => Array.from(text.matchAll(/`class:([a-z.-]+)`/g), (match) => match[1])))
    expect([...cited].toSorted()).toEqual(CLASSES.toSorted())
  })

  test.each(["pack:nope", "rule:gitleaks/nope", "class:logic.nope", "lens:nope", "overlay:nope", "probe:nope"])(
    "a leaf citing unknown %s fails",
    async (id) => {
      const tree = await read(fixture)
      const file = "lucy-lens/security/secrets/SKILL.md"
      expect(() => ReviewCatalog.check(catalog, { ...tree, [file]: `${tree[file]}\nSee \`${id}\`.\n` })).toThrow(
        `unknown-cited-id: ${id} (${file})`,
      )
    },
  )

  test("a lens whose node is not in the tree fails", async () => {
    const tree = await read(fixture)
    const broken = { ...catalog, lenses: catalog.lenses.map((lens) => (lens.id === "tests" ? { ...lens, node: "lucy-lens-testing" } : lens)) }
    expect(() => ReviewCatalog.check(broken, tree)).toThrow("missing-node: lucy-lens-testing (lens:tests)")
    const pruned = Object.fromEntries(Object.entries(tree).filter(([file]) => file !== "lucy-lens/correctness/edges/SKILL.md"))
    expect(() => ReviewCatalog.check(catalog, pruned)).toThrow("missing-node: lucy-lens-correctness-edges (lens:correctness-edges)")
  })

  test("a class whose proof node is not in the tree fails", async () => {
    const tree = await read(fixture)
    const pruned = Object.fromEntries(Object.entries(tree).filter(([file]) => file !== "lucy-review/prove/regress/SKILL.md"))
    expect(() => ReviewCatalog.check(catalog, pruned)).toThrow("missing-node: lucy-review-prove-regress (class:tests.missing)")
    const broken = { ...catalog, classes: catalog.classes.map((entry) => (entry.id === "edges.category" ? { ...entry, node: "lucy-review-prove-table" } : entry)) }
    expect(() => ReviewCatalog.check(broken, tree)).toThrow("missing-node: lucy-review-prove-table (class:edges.category)")
  })

  test.each([
    ["lucy-lens/contracts/SKILL.md", "lucy-lens-contracts"],
    ["lucy-lens/correctness/resources/SKILL.md", "lucy-lens-correctness-resources"],
    ["lucy-review/prove/mutants/SKILL.md", "lucy-review-prove-mutants"],
  ])("a node no route reaches fails: %s", async (file, name) => {
    const tree = await read(fixture)
    expect(() => ReviewCatalog.check(catalog, { ...tree, [file]: `---\nname: ${name}\n---\n` })).toThrow(`unreached-node: ${name} (${file})`)
  })

  test("a lens no profile or overlay routes leaves its subtree and proof nodes unreached", async () => {
    const tree = await read(fixture)
    const profiles = catalog.route.profiles.map((profile) => ({
      ...profile,
      lenses: Object.fromEntries(Object.entries(profile.lenses).map(([tier, lenses]) => [tier, lenses.filter((lens: string) => lens !== "security")])),
    }))
    const broken = { ...catalog, route: { ...catalog.route, profiles } }
    expect(() => ReviewCatalog.check(broken, tree)).toThrow("unreached-node: lucy-lens-security (lucy-lens/security/SKILL.md)")
    expect(() => ReviewCatalog.check(broken, tree)).toThrow("unreached-node: lucy-lens-security-secrets (lucy-lens/security/secrets/SKILL.md)")
    // A routed node is reached through its own lens, never through an unrouted sibling's classes.
    const unrouted = { ...catalog, overlays: catalog.overlays.map((overlay) => ({ ...overlay, lenses: [] })) }
    const quick = {
      ...unrouted,
      route: { ...unrouted.route, profiles: unrouted.route.profiles.map((profile) => ({ ...profile, lenses: { quick: ["correctness-logic"] } })) },
    }
    expect(() => ReviewCatalog.check(quick, tree)).toThrow("unreached-node: lucy-review-prove-regress (lucy-review/prove/regress/SKILL.md)")
  })

  test("an overlay or a route naming an unknown lens fails", async () => {
    const tree = await read(fixture)
    const overlay = { ...catalog, overlays: catalog.overlays.map((entry) => (entry.id === "docs" ? { ...entry, lenses: ["docs"] } : entry)) }
    expect(() => ReviewCatalog.check(overlay, tree)).toThrow("unknown-lens: docs (overlay:docs)")
    const profiles = catalog.route.profiles.map((profile) =>
      profile.id === "code" ? { ...profile, lenses: { ...profile.lenses, standard: [...profile.lenses.standard, "contracts-data"] } } : profile,
    )
    expect(() => ReviewCatalog.check({ ...catalog, route: { ...catalog.route, profiles } }, tree)).toThrow("unknown-lens: contracts-data (profile:code)")
  })

  test("catalog entries naming unknown or duplicate ids fail", async () => {
    const tree = await read(fixture)
    const rules = [...catalog.rules, { ...catalog.rules[0], class: "secrets.leak" }]
    expect(() => ReviewCatalog.check({ ...catalog, rules }, tree)).toThrow("unknown-class: secrets.leak (rule:gitleaks/*)")
    expect(() => ReviewCatalog.check({ ...catalog, rules }, tree)).toThrow("duplicate-id: gitleaks/* (rule)")
    const lenses = catalog.lenses.map((lens) => (lens.id === "tests" ? { ...lens, classes: ["tests.missing"] } : lens))
    expect(() => ReviewCatalog.check({ ...catalog, lenses }, tree)).toThrow("unraised-class: tests.weak-oracle (class:tests.weak-oracle)")
  })
})

async function read(root: string) {
  const entries = await fs.readdir(root, { recursive: true, withFileTypes: true })
  return Object.fromEntries(
    await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const file = path.join(entry.parentPath, entry.name)
          return [path.relative(root, file).split(path.sep).join("/"), await Bun.file(file).text()] as const
        }),
    ),
  )
}
