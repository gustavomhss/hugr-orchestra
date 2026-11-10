import path from "node:path"
import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { AbsolutePath } from "@orchestra/core/schema"
import { SkillV2 } from "@orchestra/core/skill"
import { SkillDiscovery } from "@orchestra/core/skill/discovery"
import { SeatSkillContent } from "@orchestra/maestro/seat-skill-content"
import { Seats } from "@orchestra/maestro/seats"

// Authored-tree seam: SeatSkillContent.read (loader), SeatSkillContent.describe plus
// SkillV2.list (discovery), ReviewCatalog.check (checker). Ids are the frozen contract,
// not a walk of the catalog. Does not close analyzer acquisition, the PR-slice route
// suite, seat-grant scoping, or A9 source gaps (design.md:1114-1118 stay open).

const catalog = ReviewCatalog.current
const root = Seats.skillSource("lucy")
const DECLARED = ["lucy-review", "lucy-lens", "lucy-audit"] as const

const NODES = [
  "lucy-lens/correctness/resources",
  "lucy-lens/correctness/performance",
  "lucy-lens/tests/oracles",
  "lucy-lens/tests/smells",
  "lucy-lens/tests/flaky",
  "lucy-lens/tests/strategy",
  "lucy-lens/tests/adequacy",
  "lucy-lens/contracts",
  "lucy-lens/contracts/api",
  "lucy-lens/contracts/semver",
  "lucy-lens/contracts/data",
  "lucy-lens/contracts/third-party",
  "lucy-lens/contracts/ipc",
  "lucy-lens/security/boundaries",
  "lucy-lens/security/supply-chain",
  "lucy-lens/security/ci",
  "lucy-lens/security/infra",
  "lucy-lens/security/secrets",
  "lucy-lens/change",
  "lucy-lens/change/structure",
  "lucy-lens/change/history",
  "lucy-lens/change/merge",
  "lucy-lens/change/provenance",
  "lucy-lens/change/health",
  "lucy-lens/experience",
  "lucy-lens/experience/interaction",
  "lucy-lens/experience/a11y",
  "lucy-lens/experience/visual",
  "lucy-lens/experience/content",
  "lucy-audit",
  "lucy-audit/compliance",
  "lucy-audit/compliance/privacy",
  "lucy-review/pr",
] as const

const CLASSES = [
  "resources.lifetime",
  "performance.cost",
  "contracts.api",
  "contracts.semver",
  "contracts.data",
  "contracts.third-party",
  "contracts.ipc",
  "security.supply-chain",
  "security.ci",
  "security.infra",
  "change.structure",
  "change.history",
  "change.merge",
  "change.provenance",
  "change.health",
  "experience.interaction",
  "experience.a11y",
  "experience.visual",
  "experience.content",
  "privacy.processing",
] as const

const discovery = Layer.succeed(SkillDiscovery.Service, SkillDiscovery.Service.of({ pull: () => Effect.succeed([]) }))

describe("phase 3 authored tree", () => {
  test("loader discovery and catalog check close on the authored skill tree", async () => {
    const files = await SeatSkillContent.read("lucy", root, DECLARED)
    const loaded = nodesOf(files)
    const described = await SeatSkillContent.describe(root, DECLARED)
    expect(described.map((node) => node.name).toSorted()).toEqual(loaded.toSorted())
    for (const node of NODES) {
      expect(files[`${node}/SKILL.md`]?.length ?? 0).toBeGreaterThan(0)
      expect(loaded).toContain(node.split("/").join("-"))
    }
    const audit = loaded.filter((node) => node === "lucy-audit" || node.startsWith("lucy-audit-"))
    expect(audit.toSorted()).toEqual(["lucy-audit", "lucy-audit-compliance", "lucy-audit-compliance-privacy"])
    for (const id of CLASSES) expect(Object.values(files).some((text) => text.includes(`class:${id}`))).toBe(true)
    expect(() => ReviewCatalog.check(catalog, files)).not.toThrow()

    const listed = await listLucy()
    const byName = new Map(listed.map((skill) => [skill.name, skill]))
    for (const node of NODES) {
      const name = node.split("/").join("-")
      expect(byName.get(name)?.location).toBe(AbsolutePath.make(path.join(root, node, "SKILL.md")))
    }
  })

  test("owned copy missing a required phase 3 node fails missing-node", async () => {
    const files = await SeatSkillContent.read("lucy", root, DECLARED)
    expect(() => ReviewCatalog.check(catalog, files)).not.toThrow()
    const file = "lucy-lens/correctness/resources/SKILL.md"
    const copy = Object.fromEntries(Object.entries(files).filter(([name]) => name !== file))
    expect(() => ReviewCatalog.check(catalog, copy)).toThrow(
      "missing-node: lucy-lens-correctness-resources (lens:correctness-resources)",
    )
  })

  test("owned copy citing an unknown id fails unknown-cited-id", async () => {
    const files = await SeatSkillContent.read("lucy", root, DECLARED)
    expect(() => ReviewCatalog.check(catalog, files)).not.toThrow()
    const file = "lucy-lens/contracts/api/SKILL.md"
    expect(files[file]).toBeDefined()
    const copy = { ...files, [file]: `${files[file]}\nSee \`class:phase3.not-a-class\`.\n` }
    expect(() => ReviewCatalog.check(catalog, copy)).toThrow(`unknown-cited-id: class:phase3.not-a-class (${file})`)
  })

  test("owned copy with an unreached lens node fails unreached-node", async () => {
    const files = await SeatSkillContent.read("lucy", root, DECLARED)
    expect(() => ReviewCatalog.check(catalog, files)).not.toThrow()
    const copy = { ...files, "lucy-lens/billing/SKILL.md": "not a routed lens\n" }
    expect(() => ReviewCatalog.check(catalog, copy)).toThrow("unreached-node: lucy-lens-billing (lucy-lens/billing/SKILL.md)")
  })
})

function nodesOf(files: Readonly<Record<string, string>>) {
  return Object.keys(files)
    .filter((file) => file.endsWith("/SKILL.md"))
    .map((file) => file.slice(0, -"/SKILL.md".length).split("/").join("-"))
}

function listLucy() {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const skills = yield* SkillV2.Service
        yield* skills.transform((draft) =>
          draft.source(SkillV2.DirectorySource.make({ type: "directory", path: AbsolutePath.make(root) })),
        )
        return yield* skills.list()
      }),
    ).pipe(
      Effect.provide(
        AppNodeBuilder.build(LayerNode.group([SkillV2.node]), [[SkillDiscovery.node, discovery]]) as Layer.Layer<SkillV2.Service>,
      ),
    ),
  )
}
