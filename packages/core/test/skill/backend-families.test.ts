import { describe, expect, test } from "bun:test"
import path from "path"
import semver from "semver"
import { BackendToolkitManifest } from "@orchestra/core/backend-toolkit/manifest"

// Family layout of the shared stack tree `team-stack` (docs/specs/seat-framework/skill-tree.md), the per-node word cap
// S-1b, the frozen family tuples and the engine recipe pins (F6.11) in `backend-codegen`. Tree shape, names and links
// are covered by the seat skill tree validator; this file checks which versions a node may name.

const STACK = path.resolve(import.meta.dir, "../../../../modules/specialists/team/skills/team-stack")
const CODEGEN = path.resolve(import.meta.dir, "../../../../modules/specialists/backend/skills/backend-codegen")
// F6.4: the families that may own a language node under `team-stack`.
const LANGUAGE_FAMILIES = ["python", "go", "rust", "js-ts", "jvm", "dotnet", "ruby", "php", "elixir"]
// Lead ruling M3-6 (S-1b), counted in whitespace words like S-1, frontmatter excluded. It has no exceptions.
const MAX_NODE_WORDS = 700
// Lead ruling F6-D3 with M3-6: the frozen Go tuple.
const GO_PINS = { chi: "v5.3.2", pgx: "v5.8.0", sqlc: "1.31.1" }
// Lead rulings F6-D3b and F6-D3c: every node of these families, with the pins it must state. The language node states
// the whole tuple; Express 4 and Fastify 4 are delta sections inside their framework node, not frozen majors.
const TUPLES = {
  python: {
    python: ["3.12.11", "0.118.0", "0.48.0", "2.11.7", "2.0.43", "0.28.1"],
    "python/fastapi": ["0.118.0", "0.48.0"],
    "python/pydantic": ["2.11.7"],
    "python/sqlalchemy": ["2.0.43"],
    "python/django": ["6.1.2", "3.18.3", "3.12.11", "3.18.1", "2.4.0", "0.30.0"],
    "python/kubeflow": ["2.17.0"],
  },
  "js-ts": {
    "js-ts": ["22.18.0", "5.1.0", "2.2.0", "5.6.1", "4.1.8", "8.16.3", "1.3.14"],
    "js-ts/express": ["5.1.0", "2.2.0", "4.21.2"],
    "js-ts/fastify": ["5.6.1", "4.29.1"],
  },
  ruby: {
    ruby: ["4.0.7", "8.1.4", "0.6.13532", "0.20.0", "4.2.0", "2.1.0", "0.13.1"],
    "ruby/rails": ["4.0.7", "8.1.4", "0.6.13532", "0.20.0", "4.2.0", "2.1.0", "0.13.1"],
  },
  php: {
    php: ["8.5.11", "13.35.0", "3.12.3", "2.3.0"],
    "php/laravel": ["8.5.11", "13.35.0", "3.12.3", "2.3.0"],
  },
} as Record<string, Record<string, string[]>>
// Ruling M6-1: the toolkit packs are the pin source. Every pack that serves an entry skill has one recipe node under
// `backend-codegen/<group>/<id>`. gitleaks is a host-side scanner with none.
const PACKS = Object.values<BackendToolkitManifest.Pack>(BackendToolkitManifest.ENGINES).filter((pack) => pack.fit.skills.length > 0)
// A recipe may also run the engine that drives it: protoc-gen-es is a buf plugin.
const ENGINE_DRIVERS: Record<string, string[]> = { "protoc-gen-es": ["buf"] }

describe("team-stack families", () => {
  test("keys every node by an allowed language family", async () => {
    const nodes = await listNodes(STACK)
    expect(nodes).toContain("go")
    expect(nodes.filter((node) => !LANGUAGE_FAMILIES.includes(node.split("/")[0]))).toEqual([])
  })

  test("keeps every node within the 700-word cap", async () => {
    const nodes = await listNodes(STACK)
    expect(nodes.length).toBeGreaterThan(0)
    const counts = await Promise.all(
      nodes.map(async (node) => ({
        node,
        words: (await readNode(STACK, node)).replace(/^---\n[\s\S]*?\n---\n/, "").split(/\s+/).filter(Boolean).length,
      })),
    )
    expect(counts.filter((item) => item.words > MAX_NODE_WORDS)).toEqual([])
  })

  test("states the frozen Go tuple and no other version of its components", async () => {
    const go = await readNode(STACK, "go")
    expect([GO_PINS.chi, GO_PINS.pgx, GO_PINS.sqlc].filter((pin) => !go.includes(pin))).toEqual([])
    expect(await readNode(STACK, "go/chi")).toContain(`\`${GO_PINS.chi}\``)
    expect(await readNode(STACK, "go/pgx")).toContain(`\`${GO_PINS.pgx}\``)
    expect(await readNode(STACK, "go/sqlc")).toContain(`\`${GO_PINS.sqlc}\``)

    // chi and pgx are both `/v5` modules, so any `v5.x.y` in the Go family must be one of the two pins; a sqlc
    // version anywhere in it must be the sqlc pin.
    const nodes = (await listNodes(STACK)).filter((node) => node.split("/")[0] === "go")
    const texts = await Promise.all(nodes.map(async (node) => ({ node, text: await readNode(STACK, node) })))
    expect(
      texts.flatMap((item) =>
        [...item.text.matchAll(/\bv5\.\d+\.\d+\b/g)]
          .map((match) => match[0])
          .filter((version) => version !== GO_PINS.chi && version !== GO_PINS.pgx)
          .map((version) => ({ node: item.node, version })),
      ),
    ).toEqual([])
    expect(
      texts.flatMap((item) =>
        [...item.text.matchAll(/sqlc`?\s+`?v?(\d+\.\d+\.\d+)/g)]
          .map((match) => match[1])
          .filter((version) => version !== GO_PINS.sqlc)
          .map((version) => ({ node: item.node, version })),
      ),
    ).toEqual([])
  })
})

describe("team-stack family tuples and engine recipes", () => {
  test("states each frozen family tuple and no other version inside the family", async () => {
    const nodes = await listNodes(STACK)
    const results = await Promise.all(
      Object.entries(TUPLES).map(async ([family, pins]) => {
        const owned = nodes.filter((node) => node.split("/")[0] === family)
        const allowed = new Set(Object.values(pins).flat())
        const texts = await Promise.all(owned.map(async (node) => ({ node, text: await readNode(STACK, node) })))
        return {
          family,
          // Every family node declares its pins here, so a new node cannot slip past the version check.
          undeclared: owned.filter((node) => !(node in pins)),
          absent: Object.keys(pins).filter((node) => !owned.includes(node)),
          unstated: texts.flatMap((item) =>
            (pins[item.node] ?? [])
              .filter((pin) => !item.text.includes(`\`${pin}\``))
              .map((pin) => ({ node: item.node, pin })),
          ),
          foreign: texts.flatMap((item) =>
            [...item.text.matchAll(/\b\d+\.\d+\.\d+\b/g)]
              .map((match) => match[0])
              .filter((version) => !allowed.has(version))
              .map((version) => ({ node: item.node, version })),
          ),
        }
      }),
    )
    expect(results).toEqual(
      Object.keys(TUPLES).map((family) => ({ family, undeclared: [], absent: [], unstated: [], foreign: [] })),
    )
  })

  test("pins each engine recipe and runs it only through the toolkit path", async () => {
    const recipes = await listRecipes()
    expect([...recipes.keys()].toSorted()).toEqual(PACKS.map((pack) => pack.id).toSorted())

    const results = await engineRecipeChecks(PACKS, (id) => readNode(CODEGEN, recipes.get(id)!))
    expect(results).toEqual(
      PACKS.map((pack) => ({ id: pack.id, pin: true, invokes: true, outcomes: true, otherVersions: [], otherEngines: [] })),
    )
  })
})

describe("engine recipe version guard teeth", () => {
  const check = (version: string, text: string) => engineRecipeChecks([{ id: "fixture", version }], async () => text)
  const plain = "3.0.4"
  const owned = `${plain}+orchestra.cassandra1`

  test("plain and prerelease pins stay exact; qualified owned pins also allow only their upstream core", async () => {
    expect(await check(plain, `Pin \`${plain}\`.`)).toMatchObject([{ pin: true, otherVersions: [] }])
    expect(await check(plain, `Pin \`${plain}\`; foreign 3.0.3.`)).toMatchObject([{ pin: true, otherVersions: ["3.0.3"] }])
    expect(await check(plain, `Pin \`${plain}\`; foreign \`${owned}\`.`)).toMatchObject([{ pin: true, otherVersions: [owned] }])
    expect(await check(`${plain}-rc.1`, `Pin \`${plain}-rc.1\`; core \`${plain}\`.`)).toMatchObject([{ pin: true, otherVersions: [plain] }])
    expect(await check(owned, `Pin \`${owned}\`; upstream \`${plain}\`, project v${plain}.`)).toMatchObject([{ pin: true, otherVersions: [] }])
    expect(await check(`${plain}-rc.1+host.1`, `Pin \`${plain}-rc.1+host.1\`; core \`${plain}\`.`)).toMatchObject([{ pin: true, otherVersions: [] }])
  })

  test("wrong same-core qualifiers and foreign/malformed tokens fail even with the exact owned pin present", async () => {
    for (const foreign of ["3.0.4+orchestra.cassandra2", "3.0.4-rc.1+orchestra.cassandra1", "3.0.5", "1.15.3",
      "03.0.4", "3.0.4+", "3.0.4+orchestra..cassandra1", "3.0.4+orchestra.cassandra1_extra", "3.0.4-01", "3.0.4+host+extra"]) {
      expect(await check(owned, `Pin \`${owned}\`; foreign \`${foreign}\`.`), foreign).toMatchObject([{ pin: true, otherVersions: [foreign] }])
    }
  })

  test("the full inline owned pin remains mandatory, including when its upstream core is present", async () => {
    expect(await check(owned, `Only upstream \`${plain}\`.`)).toMatchObject([{ pin: false, otherVersions: [] }])
    expect(await check(owned, `Unquoted ${owned}`)).toMatchObject([{ pin: false, otherVersions: [] }])
  })

  test("empty manifests, absent/unreadable text, empty candidates and malformed manifest pins fail by name", async () => {
    await expect(engineRecipeChecks([], async () => "unused")).rejects.toThrow("engine-recipes:empty-manifest")
    await expect(check(owned, "")).rejects.toThrow("engine-recipe:fixture:empty-text")
    await expect(check(owned, "No version tokens")).rejects.toThrow("engine-recipe:fixture:empty-version-candidates")
    await expect(check("3.0.4+", `Pin \`${owned}\`.`)).rejects.toThrow("engine-recipe:fixture:malformed-manifest-version")
    await expect(engineRecipeChecks([{ id: "missing", version: owned }], () => readNode(CODEGEN, "missing-recipe"))).rejects.toThrow("engine-recipe:missing:unreadable-text")
    await expect(engineRecipeChecks([{ id: "broken", version: owned }], async () => { throw new Error("reader failed") })).rejects.toThrow("engine-recipe:broken:unreadable-text")
  })

  test("a no-op recipe edit preserves the real gate result", async () => {
    const recipes = await listRecipes()
    const read = (id: string) => readNode(CODEGEN, recipes.get(id)!)
    expect(await engineRecipeChecks(PACKS, async (id) => `${await read(id)}\n`)).toEqual(await engineRecipeChecks(PACKS, read))
  })
})

// Repair: the former bare-core scan misread build metadata. Extract whole ASCII version candidates, including malformed
// qualifiers, then delegate validity to SemVer. Exact token comparison deliberately retains build identity; SemVer
// precedence/equality discards it. Only a manifest pin with build metadata admits its normalized upstream core too.
async function engineRecipeChecks(packs: ReadonlyArray<Pick<BackendToolkitManifest.Pack, "id" | "version">>, read: (id: string) => Promise<string>) {
  if (packs.length === 0) throw new Error("engine-recipes:empty-manifest")
  return Promise.all(packs.map(async (pack) => {
    const pin = semver.parse(pack.version)
    if (!pin) throw new Error(`engine-recipe:${pack.id}:malformed-manifest-version`)
    const text = await read(pack.id).catch((cause) => { throw new Error(`engine-recipe:${pack.id}:unreadable-text`, { cause }) })
    if (!text.trim()) throw new Error(`engine-recipe:${pack.id}:empty-text`)
    const versions = [...text.matchAll(/\bv?(\d+\.\d+\.\d+(?:[-+][\w.+-]*)?)/g)].map((match) => match[1])
    if (versions.length === 0) throw new Error(`engine-recipe:${pack.id}:empty-version-candidates`)
    return {
      id: pack.id,
      pin: text.includes(`\`${pack.version}\``),
      invokes: text.includes(`"$BACKEND_TOOLKIT_BIN/${pack.id}"`),
      // F5.31 outcomes the recipe must turn into a tool blocker.
      outcomes: text.includes("toolkit-not-ready:") && text.includes("unsupported-target:"),
      otherVersions: versions.filter((version) => !semver.parse(version) ||
        (version !== pack.version && !(pin.build.length > 0 && version === `${pin.major}.${pin.minor}.${pin.patch}`))),
      otherEngines: [...text.matchAll(/\$\{?BACKEND_TOOLKIT_BIN\}?"?\/([a-z0-9-]+)/g)]
        .map((match) => match[1])
        .filter((engine) => engine !== pack.id && !(ENGINE_DRIVERS[pack.id] ?? []).includes(engine)),
    }
  }))
}

// Non-root node paths under `root`, with `/` separators.
async function listNodes(root: string) {
  return [...new Bun.Glob("**/SKILL.md").scanSync(root)]
    .map((file) => path.dirname(file).split(path.sep).join("/"))
    .filter((node) => node !== ".")
    .toSorted()
}

function readNode(root: string, node: string) {
  return Bun.file(path.join(root, node, "SKILL.md")).text()
}

// Recipe node paths under `backend-codegen`, keyed by pack id (`<group>/<id>`).
async function listRecipes() {
  return new Map((await listNodes(CODEGEN)).filter((node) => node.split("/").length === 2).map((node) => [node.split("/")[1], node]))
}
