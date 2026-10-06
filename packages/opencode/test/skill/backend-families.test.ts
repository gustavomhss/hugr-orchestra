import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { BackendToolkitManifest } from "@opencode-ai/core/backend-toolkit/manifest"

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

    const results = await Promise.all(
      PACKS.map(async (pack) => {
        const text = await Bun.file(path.join(REFERENCES, `recipes/external/${pack.id}.md`)).text()
        return {
          id: pack.id,
          pin: text.includes(`\`${pack.version}\``),
          invokes: text.includes(`"$BACKEND_TOOLKIT_BIN/${pack.id}"`),
          // F5.31 outcomes the recipe must turn into a `tool` blocker.
          outcomes: text.includes("toolkit-not-ready:") && text.includes("unsupported-target:"),
          otherVersions: [...text.matchAll(/\b\d+\.\d+\.\d+\b/g)].map((match) => match[0]).filter((v) => v !== pack.version),
          otherEngines: [...text.matchAll(/\$\{?BACKEND_TOOLKIT_BIN\}?"?\/([a-z0-9-]+)/g)]
            .map((match) => match[1])
            .filter((engine) => engine !== pack.id && !(ENGINE_DRIVERS[pack.id] ?? []).includes(engine)),
        }
      }),
    )
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
