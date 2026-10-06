import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"

// Family layout of the backend specialist's shared references (specs/backend-specialist/contracts/f5-f6-toolkit-skills.md,
// F6.4) and the per-reference word cap S-1b. Discovery, link resolution and depth-2 reachability are covered by
// backend-skills.test.ts; this file checks what that one cannot see: which family a reference belongs to.

const REFERENCES = path.resolve(import.meta.dir, "../../../backend-specialist/skills/backend-implement/references")
// F6.4: `<familyId>` values, and the subset that may own a `languages/<familyId>.md` file.
const FAMILIES = ["python", "go", "rust", "js-ts", "effect", "next", "jvm", "dotnet", "ruby", "php", "elixir", "cross"]
const LANGUAGE_FAMILIES = ["python", "go", "rust", "js-ts", "jvm", "dotnet", "ruby", "php", "elixir"]
// F6.4: `effect` and `next` build on the JavaScript and TypeScript language card instead of owning one.
const SHARED_LANGUAGE = { effect: "js-ts", next: "js-ts" } as Record<string, string>
// Lead ruling M3-6 (S-1b), counted in whitespace words like S-1.
const MAX_REFERENCE_WORDS = 700
// Declared exceptions to S-1b. Each entry must still exceed the cap, so a fixed file has to leave the ledger.
const OVERSIZED = {
  "continuity.md": "authored before S-1b (840 words); trimming it belongs to the continuity owner",
} as Record<string, string>
// Lead ruling F6-D3 with M3-6: the frozen Go tuple.
const GO_PINS = { chi: "v5.3.2", pgx: "v5.8.0", sqlc: "1.31.1" }

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
    expect(
      counts.filter((item) => item.words > MAX_REFERENCE_WORDS && !(item.file in OVERSIZED)),
    ).toEqual([])
    // A ledger entry for a file that is gone or back under the cap is stale.
    expect(
      Object.keys(OVERSIZED).filter(
        (file) => !counts.some((item) => item.file === file && item.words > MAX_REFERENCE_WORDS),
      ),
    ).toEqual([])
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
