import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"
import astGrep from "../../src/backend-toolkit/packs/ast-grep"
import gitleaks from "../../src/backend-toolkit/packs/gitleaks"
import { ReviewCatalog } from "../../src/review/catalog"

const catalog = ReviewCatalog.current
const fixture = path.join(import.meta.dir, "fixture/tree")
const lucy = path.resolve(import.meta.dir, "../../../lucy-specialist/skills")
const team = path.resolve(import.meta.dir, "../../../../modules/specialists/team/skills")

const PHASE1_CLASSES = [
  "concurrency.atomicity", "concurrency.order", "concurrency.toctou", "concurrency.double-execution",
  "concurrency.use-after-dispose", "concurrency.reentrancy", "concurrency.stale-read", "concurrency.aba",
  "logic.invariant", "logic.contract", "logic.error-path", "edges.category", "edges.falsehood",
  "reliability.error-handling", "reliability.retry", "reliability.timeout", "reliability.rollback",
  "tests.missing", "tests.weak-oracle", "security.boundary", "security.secret",
  "plan.coverage", "plan.requirement", "docs.contradiction",
] as const

const PHASE3_CLASSES = [
  "resources.lifetime", "performance.cost",
  "contracts.api", "contracts.semver", "contracts.data", "contracts.third-party", "contracts.ipc",
  "security.supply-chain", "security.ci", "security.infra",
  "change.structure", "change.history", "change.merge", "change.provenance", "change.health",
  "experience.interaction", "experience.a11y", "experience.visual", "experience.content",
  "privacy.processing",
] as const

const CLASSES = [...PHASE1_CLASSES, ...PHASE3_CLASSES] as const
const REGRESS = ["resources.lifetime", "performance.cost"] as const

describe("review catalog", () => {
  test("entries decode and name exactly the phase 1 and phase 3 ids", () => {
    expect(() => Schema.decodeUnknownSync(ReviewCatalog.Catalog)(catalog)).not.toThrow()
    expect(catalog.route.profiles.map((profile) => profile.id)).toEqual(["plan", "code", "rereview", "pr"])
    expect(catalog.route.tiers.map((tier) => [tier.id, tier.built, tier.runs])).toEqual([
      ["quick", true, "quick"], ["standard", true, "standard"], ["deep", false, "standard"],
    ])
    expect(catalog.overlays.map((overlay) => overlay.id)).toEqual([
      "docs", "concurrency", "api-wire", "data-migration", "performance", "ci-infra", "dependency", "ui", "personal-data", "github-actions",
    ])
    expect(catalog.lenses.map((lens) => [lens.id, lens.node])).toEqual([
      ["correctness-logic", "lucy-lens-correctness-logic"],
      ["correctness-edges", "lucy-lens-correctness-edges"],
      ["correctness-concurrency", "lucy-lens-correctness-concurrency"],
      ["correctness-reliability", "lucy-lens-correctness-reliability"],
      ["tests", "lucy-lens-tests"],
      ["security", "lucy-lens-security"],
      ["correctness-resources", "lucy-lens-correctness-resources"],
      ["correctness-performance", "lucy-lens-correctness-performance"],
      ["contracts", "lucy-lens-contracts"],
      ["change", "lucy-lens-change"],
      ["experience", "lucy-lens-experience"],
      ["privacy", "lucy-audit-compliance-privacy"],
    ])
    expect(catalog.classes.map((entry) => entry.id).toSorted()).toEqual(CLASSES.toSorted())
    expect(new Set(catalog.classes.map((entry) => entry.node))).toEqual(new Set(["lucy-review-prove-quote", "lucy-review-prove-regress"]))
    expect(catalog.lenses.flatMap((lens) => lens.classes).toSorted()).toEqual(CLASSES.toSorted())
    expect(catalog.options.map((option) => option.id)).toEqual([
      "quote", "tool:gitleaks", "tool:repo", "tool:ast-grep", "probe:regress", "probe:test", "probe:typecheck", "probe:script",
    ])
    expect(catalog.languages.map((language) => [language.id, language.node])).toEqual([
      ["js-ts", "team-stack-js-ts"], ["python", "team-stack-python"], ["go", "team-stack-go"],
      ["ruby", "team-stack-ruby"], ["php", "team-stack-php"],
      ["sql", "team-stack-sql"],
    ])
  })

  test("every pack and rule starts in probation except repo packs, which are active", () => {
    expect(catalog.packs.map((pack) => [pack.id, pack.backend, pack.status])).toEqual([
      ["gitleaks", "pinned", "probation"],
      ["repo", "repo", "active"],
      ["ast-grep", "pinned", "probation"],
      ["squawk", "pinned", "probation"],
      ["ruff", "pinned", "probation"],
      ["actionlint", "pinned", "probation"],
      ["oxlint", "pinned", "probation"],
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

  test("lucy's ast-grep entry reuses the backend pin and keeps its own authority", () => {
    const entry = catalog.packs.find((pack) => pack.id === "ast-grep")
    expect(entry?.version).toBe("0.45.3")
    expect(entry?.version).toBe(astGrep.version)
    expect(entry?.pin).toEqual({
      source: "backend-toolkit/packs/ast-grep",
      integrity: Object.fromEntries(Object.entries(astGrep.targets).map(([target, value]) => [target, value.artifact.integrity])),
    })
    expect(entry?.tool).toBe("ast-grep")
    expect(entry?.template).toBe("ast-grep-scan-json")
    expect(entry?.output).toEqual({ format: "json", parser: "ast-grep" })
    expect(entry?.lane).toBe("no-build")
    expect(entry?.tiers).toEqual(["standard", "deep"])
    expect(entry?.network).toEqual({ kind: "none" })
    expect(entry?.scratchWrites).toBe(false)
    expect(entry?.status).toBe("probation")
    expect(entry?.licence).toBe("pinned")
    expect(entry?.languages).toEqual(["js-ts"])
    expect(entry?.lenses).toEqual(["security"])
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

  test("phase 3 classes, proofs and options are the frozen mappings", () => {
    const lens = (id: string) => catalog.lenses.find((entry) => entry.id === id)
    const klass = (id: string) => catalog.classes.find((entry) => entry.id === id)
    expect(lens("correctness-resources")?.classes).toEqual(["resources.lifetime"])
    expect(lens("correctness-performance")?.classes).toEqual(["performance.cost"])
    expect(lens("contracts")?.classes).toEqual(["contracts.api", "contracts.semver", "contracts.data", "contracts.third-party", "contracts.ipc"])
    expect(lens("security")?.classes).toEqual(["security.boundary", "security.secret", "security.supply-chain", "security.ci", "security.infra"])
    expect(lens("change")?.classes).toEqual(["change.structure", "change.history", "change.merge", "change.provenance", "change.health"])
    expect(lens("experience")?.classes).toEqual(["experience.interaction", "experience.a11y", "experience.visual", "experience.content"])
    expect(lens("privacy")?.classes).toEqual(["privacy.processing"])
    expect(lens("tests")?.classes).toEqual(["tests.missing", "tests.weak-oracle"])
    for (const id of PHASE3_CLASSES) {
      const entry = klass(id)
      const node = REGRESS.some((entry) => entry === id) ? "lucy-review-prove-regress" : "lucy-review-prove-quote"
      expect(entry?.node).toBe(node)
      expect(entry?.options["*"]?.map((option) => option.option)).toEqual(["quote", "probe:test", "probe:script"])
      expect(new Set(entry?.options["*"]?.map((option) => option.proves)).size).toBe(3)
    }
    expect(new Set(PHASE3_CLASSES.map((id) => klass(id)?.options["*"]?.[0]?.proves)).size).toBe(PHASE3_CLASSES.length)
    const boundary = klass("security.boundary")
    expect(boundary?.node).toBe("lucy-review-prove-quote")
    expect(boundary?.options["*"]?.map((option) => option.option)).toEqual(["quote", "tool:ast-grep", "probe:test"])
    expect(catalog.options.find((option) => option.id === "tool:ast-grep")).toEqual({ id: "tool:ast-grep", rung: "tool", cost: "low" })
    expect(klass("tests.missing")?.node).toBe("lucy-review-prove-regress")
    expect(klass("tests.weak-oracle")?.node).toBe("lucy-review-prove-regress")
  })

  test("phase 3 ast-grep rules stay on security.boundary, P2, probation, and require a quoted trigger", () => {
    expect(catalog.rules.filter((rule) => rule.pack === "ast-grep").map((rule) => [rule.rule, rule.class, rule.lens, rule.severity["*"], rule.status])).toEqual([
      ["lucy-js-eval", "security.boundary", "security", "P2", "probation"],
      ["lucy-ts-eval", "security.boundary", "security", "P2", "probation"],
    ])
    for (const rule of catalog.rules.filter((entry) => entry.pack === "ast-grep")) {
      expect(rule.triage).toContain("eval($$$ARGS)")
      expect(rule.triage).toContain("quoted untrusted-input trigger")
      expect(rule.triage.length).toBeLessThanOrEqual(240)
    }
  })

  test("phase 3 overlays keep the frozen paths, lenses and suggestion patterns", () => {
    const overlay = (id: string) => catalog.overlays.find((entry) => entry.id === id)
    expect(overlay("docs")?.lenses).toEqual(["correctness-logic"])
    expect(overlay("docs")?.content).toEqual([])
    expect(overlay("concurrency")?.paths).toEqual([])
    expect(overlay("concurrency")?.lenses).toEqual(["correctness-concurrency"])
    expect(overlay("concurrency")?.content.map((entry) => entry.id)).toEqual(["lock", "spawn", "promise-all", "goroutine", "deferred"])
    expect(overlay("api-wire")).toMatchObject({ paths: ["**/*.proto", "**/openapi.{yaml,yml,json}"], lenses: ["contracts"], content: [{ id: "content-type", pattern: "\\bContent-Type\\b" }] })
    expect(overlay("data-migration")).toMatchObject({ paths: ["**/migrations/**"], lenses: ["contracts"], content: [{ id: "alter-table", pattern: "\\bALTER\\s+TABLE\\b" }] })
    expect(overlay("performance")).toMatchObject({
      paths: ["**/benchmarks/**"],
      lenses: ["correctness-performance", "correctness-resources"],
      content: [
        { id: "for-await", pattern: "\\bfor\\s+await\\b" },
        { id: "lifetime", pattern: "\\b(?:dispose|cleanup|finalizer)\\b" },
      ],
    })
    expect(overlay("ci-infra")).toMatchObject({ paths: [".github/workflows/**", "**/*.tf"], lenses: ["security", "change"], content: [{ id: "permissions", pattern: "\\bpermissions:" }] })
    expect(overlay("dependency")).toMatchObject({
      paths: ["**/{package.json,bun.lock,package-lock.json,pnpm-lock.yaml,yarn.lock}"],
      lenses: ["contracts", "security"],
      content: [{ id: "dependencies", pattern: "\\bdependencies:" }],
    })
    expect(overlay("ui")).toMatchObject({ paths: ["packages/app-shell/src/**", "**/*.{tsx,jsx,css}"], lenses: ["experience"], content: [{ id: "aria-label", pattern: "\\baria-label\\b" }] })
    expect(overlay("personal-data")).toMatchObject({
      paths: ["**/privacy/**"],
      lenses: ["privacy"],
      content: [
        { id: "email", pattern: "\\bemail\\b" },
        { id: "https-host", pattern: "\\bhttps://[A-Za-z0-9.-]+" },
      ],
    })
    const lifetime = new RegExp(overlay("performance")?.content.find((entry) => entry.id === "lifetime")?.pattern ?? "$^")
    expect(lifetime.test("pool.dispose()")).toBe(true)
    expect(lifetime.test("const predisposed = true")).toBe(false)
    const email = new RegExp(overlay("personal-data")?.content.find((entry) => entry.id === "email")?.pattern ?? "$^")
    expect(email.test("const email = input.email")).toBe(true)
    expect(email.test("const userEmail = input.userEmail")).toBe(false)
  })

  test("profile pr matches code lens rows and does not replace the governed profiles", () => {
    const code = catalog.route.profiles.find((profile) => profile.id === "code")
    const pr = catalog.route.profiles.find((profile) => profile.id === "pr")
    expect(pr).toMatchObject({ id: "pr", node: "lucy-review-pr", stage: "code", tier: "risk", overlays: true, variants: code?.variants })
    expect(pr?.lenses).toEqual(code?.lenses)
    expect(catalog.route.profiles.find((profile) => profile.id === "plan")?.overlays).toBe(false)
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
    // Repair: `[a-z.-]+` was blind to digits, so `experience.a11y` never entered the set.
    // Backticks delimit the cite; capture every character until the closer, and never across a newline.
    const cited = new Set(Object.values(tree).flatMap((text) => Array.from(text.matchAll(/`class:([^`\n]+)`/g), (match) => match[1])))
    if (cited.size === 0) throw new Error("class citation extraction returned empty; the backtick reader broke")
    expect(cited.has("experience.a11y")).toBe(true)
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
    const contracts = Object.fromEntries(Object.entries(tree).filter(([file]) => file !== "lucy-lens/contracts/SKILL.md"))
    expect(() => ReviewCatalog.check(catalog, contracts)).toThrow("missing-node: lucy-lens-contracts (lens:contracts)")
    const privacy = Object.fromEntries(Object.entries(tree).filter(([file]) => file !== "lucy-audit/compliance/privacy/SKILL.md"))
    expect(() => ReviewCatalog.check(catalog, privacy)).toThrow("missing-node: lucy-audit-compliance-privacy (lens:privacy)")
    const pr = Object.fromEntries(Object.entries(tree).filter(([file]) => file !== "lucy-review/pr/SKILL.md"))
    expect(() => ReviewCatalog.check(catalog, pr)).toThrow("missing-node: lucy-review-pr (profile:pr)")
  })

  test("a class whose proof node is not in the tree fails", async () => {
    const tree = await read(fixture)
    const pruned = Object.fromEntries(Object.entries(tree).filter(([file]) => file !== "lucy-review/prove/regress/SKILL.md"))
    expect(() => ReviewCatalog.check(catalog, pruned)).toThrow("missing-node: lucy-review-prove-regress (class:tests.missing)")
    const broken = { ...catalog, classes: catalog.classes.map((entry) => (entry.id === "edges.category" ? { ...entry, node: "lucy-review-prove-table" } : entry)) }
    expect(() => ReviewCatalog.check(broken, tree)).toThrow("missing-node: lucy-review-prove-table (class:edges.category)")
  })

  test.each([
    ["lucy-lens/unused/SKILL.md", "lucy-lens-unused"],
    ["lucy-lens/correctness/unused/SKILL.md", "lucy-lens-correctness-unused"],
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
    const overlays = catalog.overlays.map((overlay) => ({ ...overlay, lenses: overlay.lenses.filter((lens) => lens !== "security") }))
    const broken = { ...catalog, overlays, route: { ...catalog.route, profiles } }
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
