import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import semver from "semver"
import { BackendToolkitManifest } from "@orchestra/core/backend-toolkit/manifest"

// Family layout of the backend specialist's shared references (specs/backend-specialist/contracts/f5-f6-toolkit-skills.md,
// F6.4), the per-reference word cap S-1b, the frozen family tuples, the engine recipe pins (F6.11) and the recipe index. Discovery, link
// resolution and depth-2 reachability are covered by backend-skills.test.ts; this file checks what that one cannot see:
// which family a reference belongs to and which versions it may name.

const REFERENCES = path.resolve(import.meta.dir, "../../../backend-specialist/skills/backend-implement/references")
// F6.4: `<familyId>` values, and the subset that may own a `languages/<familyId>.md` file.
const FAMILIES = ["python", "go", "rust", "js-ts", "effect", "next", "jvm", "dotnet", "ruby", "php", "elixir", "cross"]
const LANGUAGE_FAMILIES = ["python", "go", "rust", "js-ts", "jvm", "dotnet", "ruby", "php", "elixir"]
// F6.4: `effect` and `next` build on the JavaScript and TypeScript language card instead of owning one.
const SHARED_LANGUAGE = { effect: "js-ts", next: "js-ts" } as Record<string, string>
// Lead ruling M3-6 (S-1b), counted in whitespace words like S-1. It has no exceptions.
const MAX_REFERENCE_WORDS = 700
// Lead ruling F6-D3 with M3-6: the frozen Go tuple.
const GO_PINS = { chi: "v5.3.2", pgx: "v5.8.0", sqlc: "1.31.1" }
// Lead rulings F6-D3b and F6-D3c: every file of these families, with the pins it must state. The language card states
// the whole tuple; Express 4 and Fastify 4 are delta sections inside their framework file, not frozen majors.
const TUPLES = {
  python: {
    "languages/python.md": ["3.12.11", "0.118.0", "0.48.0", "2.11.7", "2.0.43", "0.28.1"],
    "frameworks/python/fastapi.md": ["0.118.0", "0.48.0"],
    "libraries/python/pydantic.md": ["2.11.7"],
    "libraries/python/sqlalchemy.md": ["2.0.43"],
    "frameworks/python/django.md": ["6.1.2", "3.18.3", "3.12.11", "3.18.1", "2.4.0", "0.30.0"],
    "frameworks/python/kubeflow.md": ["2.17.0"],
  },
  "js-ts": {
    "languages/js-ts.md": ["22.18.0", "5.1.0", "2.2.0", "5.6.1", "4.1.8", "8.16.3", "1.3.14"],
    "frameworks/js-ts/express.md": ["5.1.0", "2.2.0", "4.21.2"],
    "frameworks/js-ts/fastify.md": ["5.6.1", "4.29.1"],
  },
  ruby: {
    "languages/ruby.md": ["4.0.7", "8.1.4", "0.6.13532", "0.20.0", "4.2.0", "2.1.0", "0.13.1"],
    "frameworks/ruby/rails.md": ["4.0.7", "8.1.4", "0.6.13532", "0.20.0", "4.2.0", "2.1.0", "0.13.1"],
  },
  php: {
    "languages/php.md": ["8.5.11", "13.35.0", "3.12.3", "2.3.0"],
    "frameworks/php/laravel.md": ["8.5.11", "13.35.0", "3.12.3", "2.3.0"],
  },
} as Record<string, Record<string, string[]>>
// Ruling M6-1: the toolkit packs are the pin source. Every pack that serves an entry skill has one recipe, and the
// generated recipe index lists exactly those packs under their entry skills. gitleaks is a host-side scanner with none.
const PACKS = Object.values<BackendToolkitManifest.Pack>(BackendToolkitManifest.ENGINES).filter((pack) => pack.fit.skills.length > 0)
// A recipe may also run the engine that drives it: protoc-gen-es is a buf plugin.
const ENGINE_DRIVERS: Record<string, string[]> = { "protoc-gen-es": ["buf"] }

describe("backend skill families", () => {
  test("keys family references by an allowed family id", async () => {
    const files = await listReferences()
    const family = files.filter((file) => /^(languages|frameworks|libraries)\//.test(file))
    expect(family).toContain("languages/go.md")

    // `languages/` holds only `<familyId>.md` files, and only for language-level families.
    expect(
      family
        .filter((file) => file.startsWith("languages/"))
        .filter((file) => !LANGUAGE_FAMILIES.some((id) => file === `languages/${id}.md`)),
    ).toEqual([])
    // `frameworks/` and `libraries/` hold `<familyId>/<id>.md` files, one level deep.
    expect(
      family
        .filter((file) => !file.startsWith("languages/"))
        .filter((file) => {
          const parts = file.split("/")
          return parts.length !== 3 || !FAMILIES.includes(parts[1])
        }),
    ).toEqual([])
  })

  test("links every framework and library file from its language card", async () => {
    const files = await listReferences()
    const languages = files.filter((file) => file.startsWith("languages/"))
    expect(languages.length).toBeGreaterThan(0)

    const missing = await Promise.all(
      languages.map(async (language) => {
        const id = path.basename(language, ".md")
        const owned = files.filter((file) => /^(frameworks|libraries)\//.test(file) && familyOf(file) === id)
        const linked = await linkedReferences(language)
        return owned.filter((file) => !linked.includes(file)).map((file) => ({ language, file }))
      }),
    )
    expect(missing.flat()).toEqual([])
    // Teeth: the Go card owns real files, so the check above compared non-empty sets.
    expect(await linkedReferences("languages/go.md")).toEqual(
      expect.arrayContaining(["frameworks/go/chi.md", "libraries/go/pgx.md", "libraries/go/sqlc.md"]),
    )
  })

  test("keeps family references free of links into another family", async () => {
    const files = await listReferences()
    const family = files.filter((file) => familyOf(file) !== undefined)
    const edges = (
      await Promise.all(family.map(async (from) => (await linkedReferences(from)).map((to) => ({ from, to }))))
    ).flat()
    expect(edges.length).toBeGreaterThan(0)

    const crossing = edges.filter((edge) => {
      const target = familyOf(edge.to)
      if (target === undefined) return false
      const source = familyOf(edge.from)!
      return target !== source && !(edge.to === `languages/${SHARED_LANGUAGE[source]}.md`)
    })
    expect(crossing).toEqual([])
  })

  test("keeps every reference within the 700-word cap", async () => {
    const files = await listReferences()
    expect(files.length).toBeGreaterThan(0)
    const counts = await Promise.all(
      files.map(async (file) => ({
        file,
        words: (await Bun.file(path.join(REFERENCES, file)).text()).split(/\s+/).filter(Boolean).length,
      })),
    )
    expect(counts.filter((item) => item.words > MAX_REFERENCE_WORDS)).toEqual([])
  })

  test("states the frozen Go tuple and no other version of its components", async () => {
    const read = (file: string) => Bun.file(path.join(REFERENCES, file)).text()
    const go = await read("languages/go.md")
    expect([GO_PINS.chi, GO_PINS.pgx, GO_PINS.sqlc].filter((pin) => !go.includes(pin))).toEqual([])
    expect(await read("frameworks/go/chi.md")).toContain(`\`${GO_PINS.chi}\``)
    expect(await read("libraries/go/pgx.md")).toContain(`\`${GO_PINS.pgx}\``)
    expect(await read("libraries/go/sqlc.md")).toContain(`\`${GO_PINS.sqlc}\``)

    // chi and pgx are both `/v5` modules, so any `v5.x.y` in the Go family must be one of the two pins; a sqlc
    // version anywhere in it must be the sqlc pin.
    const files = (await listReferences()).filter((file) => familyOf(file) === "go")
    const texts = await Promise.all(files.map(async (file) => ({ file, text: await read(file) })))
    expect(
      texts.flatMap((item) =>
        [...item.text.matchAll(/\bv5\.\d+\.\d+\b/g)]
          .map((match) => match[0])
          .filter((version) => version !== GO_PINS.chi && version !== GO_PINS.pgx)
          .map((version) => ({ file: item.file, version })),
      ),
    ).toEqual([])
    expect(
      texts.flatMap((item) =>
        [...item.text.matchAll(/sqlc`?\s+`?v?(\d+\.\d+\.\d+)/g)]
          .map((match) => match[1])
          .filter((version) => version !== GO_PINS.sqlc)
          .map((version) => ({ file: item.file, version })),
      ),
    ).toEqual([])
  })
})

describe("backend skill family tuples and engine recipes", () => {
  test("states each frozen family tuple and no other version inside the family", async () => {
    const files = await listReferences()
    const read = (file: string) => Bun.file(path.join(REFERENCES, file)).text()

    const results = await Promise.all(
      Object.entries(TUPLES).map(async ([family, pins]) => {
        const owned = files.filter((file) => familyOf(file) === family)
        const allowed = new Set(Object.values(pins).flat())
        const texts = await Promise.all(owned.map(async (file) => ({ file, text: await read(file) })))
        return {
          family,
          // Every family file declares its pins here, so a new file cannot slip past the version check.
          undeclared: owned.filter((file) => !(file in pins)),
          absent: Object.keys(pins).filter((file) => !owned.includes(file)),
          unstated: texts.flatMap((item) =>
            (pins[item.file] ?? [])
              .filter((pin) => !item.text.includes(`\`${pin}\``))
              .map((pin) => ({ file: item.file, pin })),
          ),
          foreign: texts.flatMap((item) =>
            [...item.text.matchAll(/\b\d+\.\d+\.\d+\b/g)]
              .map((match) => match[0])
              .filter((version) => !allowed.has(version))
              .map((version) => ({ file: item.file, version })),
          ),
        }
      }),
    )
    expect(results).toEqual(
      Object.keys(TUPLES).map((family) => ({ family, undeclared: [], absent: [], unstated: [], foreign: [] })),
    )
  })

  test("pins each engine recipe and runs it only through the toolkit path", async () => {
    const recipes = (await listReferences()).filter((file) => file.startsWith("recipes/external/"))
    expect(recipes).toEqual([...PACKS.map((pack) => `recipes/external/${pack.id}.md`), "recipes/external/index.md"].toSorted())

    const results = await engineRecipeChecks(PACKS, (id) => Bun.file(path.join(REFERENCES, `recipes/external/${id}.md`)).text())
    expect(results).toEqual(
      PACKS.map((pack) => ({ id: pack.id, pin: true, invokes: true, outcomes: true, otherVersions: [], otherEngines: [] })),
    )
  })

  test("indexes exactly the packs' recipes under their entry skills", async () => {
    const text = await Bun.file(path.join(REFERENCES, "recipes/external/index.md")).text()
    // `### <entry skill>` headings, each followed by the recipe links of that group.
    const groups = text
      .split(/^### /m)
      .slice(1)
      .map((section) => ({
        skill: section.split("\n")[0].trim(),
        recipes: [...section.matchAll(/\]\(([a-z0-9-]+)\.md\)/g)].map((match) => match[1]).toSorted(),
      }))
    const skills = [...new Set(PACKS.flatMap((pack) => pack.fit.skills))]
    expect(groups.toSorted((a, b) => a.skill.localeCompare(b.skill))).toEqual(
      skills.toSorted().map((skill) => ({
        skill,
        recipes: PACKS.filter((pack) => pack.fit.skills.includes(skill))
          .map((pack) => pack.id)
          .toSorted(),
      })),
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
    await expect(engineRecipeChecks([{ id: "missing", version: owned }], () => Bun.file(path.join(REFERENCES, "missing-recipe.md")).text())).rejects.toThrow("engine-recipe:missing:unreadable-text")
    await expect(engineRecipeChecks([{ id: "broken", version: owned }], async () => { throw new Error("reader failed") })).rejects.toThrow("engine-recipe:broken:unreadable-text")
  })

  test("a no-op recipe edit preserves the real gate result", async () => {
    const read = (id: string) => Bun.file(path.join(REFERENCES, `recipes/external/${id}.md`)).text()
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

// Reference paths relative to `references/`, with `/` separators.
async function listReferences() {
  const entries = await fs.readdir(REFERENCES, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => path.relative(REFERENCES, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .toSorted()
}

function familyOf(file: string) {
  const parts = file.split("/")
  if (parts[0] === "languages" && parts.length === 2) return path.basename(parts[1], ".md")
  if ((parts[0] === "frameworks" || parts[0] === "libraries") && parts.length === 3) return parts[1]
  return undefined
}

// Relative Markdown link targets of one reference, resolved to paths under `references/`. Code is stripped first and
// links are matched as in backend-skills.test.ts, which also proves each target exists.
async function linkedReferences(file: string) {
  const text = (await Bun.file(path.join(REFERENCES, file)).text())
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "")
    .replace(/`[^`\n]*`/g, "")
  return [...text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)]
    .map((match) => match[1].split("#")[0])
    .filter((target) => target !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(target))
    .map((target) => path.posix.normalize(path.posix.join(path.posix.dirname(file), target)))
}
