import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Schema } from "effect"
import { SeatSkillRoot } from "@/maestro/seat-skill-root"
import { backendSkills } from "@/maestro/roster"
import { tmpdir } from "../fixture/fixture"

const SOURCE = path.resolve(import.meta.dir, "../../../backend-specialist/skills")

describe("backend skill root", () => {
  test("running from source resolves the authored tree in place", async () => {
    expect(SeatSkillRoot.roots.backend).toBe(SOURCE)
    expect(backendSkills.root).toBe(SOURCE)
    expect(await fs.exists(path.join(SOURCE, "backend-implement", "SKILL.md"))).toBe(true)
  })

  test("extracts once, reuses a verified copy and replaces a corrupted one", async () => {
    await using tmp = await tmpdir()
    const files = await embed(tmp.path, { "a/SKILL.md": "alpha", "a/references/b.md": "beta" })
    const cache = path.join(tmp.path, "cache")

    const dir = await SeatSkillRoot.extract("backend", files, cache, "1.0.0")
    // The copy is keyed by version and content digest, and the root is canonical (no 8.3 short names or symlinked temp
    // prefixes), so permission checks match it.
    expect(path.basename(dir)).toMatch(/^1\.0\.0-[0-9a-f]{12}$/)
    expect(dir).toBe(await fs.realpath(path.join(cache, "backend-skills", path.basename(dir))))
    expect(await tree(dir)).toEqual({ "a/SKILL.md": "alpha", "a/references/b.md": "beta" })

    // A verified copy is left alone: the directory is not replaced.
    const first = await fs.stat(dir)
    expect(await SeatSkillRoot.extract("backend", files, cache, "1.0.0")).toBe(dir)
    expect((await fs.stat(dir)).ino).toBe(first.ino)

    await Bun.write(path.join(dir, "a", "references", "b.md"), "tampered")
    await SeatSkillRoot.extract("backend", files, cache, "1.0.0")
    expect(await tree(dir)).toEqual({ "a/SKILL.md": "alpha", "a/references/b.md": "beta" })

    // A partial copy (missing file) and a planted extra file are both redone.
    await fs.rm(path.join(dir, "a", "SKILL.md"))
    await Bun.write(path.join(dir, "a", "planted.md"), "x")
    await SeatSkillRoot.extract("backend", files, cache, "1.0.0")
    expect(await tree(dir)).toEqual({ "a/SKILL.md": "alpha", "a/references/b.md": "beta" })
    expect((await fs.readdir(path.dirname(dir))).toSorted()).toEqual([path.basename(dir)])
  })

  test("each installation version keeps its own copy", async () => {
    await using tmp = await tmpdir()
    const cache = path.join(tmp.path, "cache")
    const older = await SeatSkillRoot.extract("backend", await embed(path.join(tmp.path, "v1"), { "a/SKILL.md": "v1" }), cache, "1.0.0")
    const before = await fs.stat(older)
    const newer = await SeatSkillRoot.extract("backend", await embed(path.join(tmp.path, "v2"), { "a/SKILL.md": "v2" }), cache, "1.1.0")

    expect(newer).not.toBe(older)
    expect(await tree(older)).toEqual({ "a/SKILL.md": "v1" })
    expect(await tree(newer)).toEqual({ "a/SKILL.md": "v2" })
    // An older install still running keeps its copy: it was never replaced.
    expect((await fs.stat(older)).ino).toBe(before.ino)
  })

  test("a rollback re-selects the older copy unchanged", async () => {
    await using tmp = await tmpdir()
    const cache = path.join(tmp.path, "cache")
    const v1 = await embed(path.join(tmp.path, "v1"), { "a/SKILL.md": "v1" })
    const first = await SeatSkillRoot.extract("backend", v1, cache, "1.0.0")
    const before = await fs.stat(first)
    const second = await SeatSkillRoot.extract("backend", await embed(path.join(tmp.path, "v2"), { "a/SKILL.md": "v2" }), cache, "2.0.0")

    expect(await SeatSkillRoot.extract("backend", v1, cache, "1.0.0")).toBe(first)
    expect((await fs.stat(first)).ino).toBe(before.ino)
    expect(await tree(first)).toEqual({ "a/SKILL.md": "v1" })
    expect(await tree(second)).toEqual({ "a/SKILL.md": "v2" })
  })

  test("an install touches nothing outside its own copy", async () => {
    await using tmp = await tmpdir()
    const cache = path.join(tmp.path, "cache")
    const other = path.join(cache, "other", "sentinel")
    const sibling = path.join(cache, "backend-skills", "0.9.0-0123456789ab", "a", "SKILL.md")
    await Bun.write(other, "other")
    await Bun.write(sibling, "older install")

    await SeatSkillRoot.extract("backend", await embed(path.join(tmp.path, "v1"), { "a/SKILL.md": "v1" }), cache, "1.0.0")
    expect(await Bun.file(other).text()).toBe("other")
    expect(await Bun.file(sibling).text()).toBe("older install")
  })

  test("two builds with the same version string keep separate copies", async () => {
    await using tmp = await tmpdir()
    const cache = path.join(tmp.path, "cache")
    const first = await SeatSkillRoot.extract("backend", await embed(path.join(tmp.path, "a"), { "a/SKILL.md": "first" }), cache, "local")
    const before = await fs.stat(first)
    const second = await SeatSkillRoot.extract("backend", await embed(path.join(tmp.path, "b"), { "a/SKILL.md": "second" }), cache, "local")

    expect(second).not.toBe(first)
    expect(path.basename(second)).toMatch(/^local-[0-9a-f]{12}$/)
    expect((await fs.stat(first)).ino).toBe(before.ino)
    expect(await tree(first)).toEqual({ "a/SKILL.md": "first" })
    expect(await tree(second)).toEqual({ "a/SKILL.md": "second" })
  })

  test("a compiled build's extracted backend-implement loads through the real skill service for backend", async () => {
    // A fresh process is needed: the root is resolved once, when the module is first imported.
    const child = Bun.spawn(
      [
        process.execPath,
        "test",
        "--preload",
        "@opentui/solid/preload",
        "--preload",
        "./test/preload.ts",
        "--preload",
        "./test/maestro/fixtures/seat-embedded-skills.ts",
        "./test/maestro/backend-seat-runtime.test.ts",
        "--timeout",
        "90000",
      ],
      { cwd: path.resolve(import.meta.dir, "../.."), env: process.env, stdout: "pipe", stderr: "pipe" },
    )
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    if (exit !== 0) throw new Error(`embedded seat child failed (${exit}):\n${stdout}\n${stderr}`)

    const line = stdout.split("\n").find((value) => value.startsWith('{"backendEmbedded":'))
    if (!line) throw new Error(`embedded seat child printed no evidence:\n${stdout}`)
    const evidence = Schema.decodeUnknownSync(
      Schema.Struct({
        backendEmbedded: Schema.Struct({
          root: Schema.String,
          source: Schema.String,
          extracted: Schema.Array(Schema.String),
        }),
      }),
    )(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(line)).backendEmbedded
    expect(evidence.source).toBe(SOURCE)
    expect(evidence.root).not.toBe(SOURCE)
    expect(path.dirname(evidence.root).endsWith(path.join("opencode", "backend-skills"))).toBe(true)
    expect(path.basename(evidence.root)).toMatch(/^local-[0-9a-f]{12}$/)
    expect(evidence.extracted).toEqual(await relativeFiles(SOURCE))
    // Every seat-runtime case ran against the extracted root and none was skipped.
    expect(stderr).toMatch(/\b3 pass\b/)
    expect(stderr).toMatch(/\b0 fail\b/)
    expect(stderr).not.toMatch(/\b[1-9]\d* skip\b/)
  }, 120000)
})

// Writes `contents` as real files under `dir` and returns the map the generated module would export.
// The generated module maps seat id to tree-relative paths to file text (script/seat-skills.ts).
async function embed(_dir: string, contents: Record<string, string>) {
  return contents
}

async function tree(dir: string) {
  const files = await relativeFiles(dir)
  return Object.fromEntries(
    await Promise.all(files.map(async (file) => [file, await Bun.file(path.join(dir, file)).text()] as const)),
  )
}

async function relativeFiles(dir: string) {
  return (await fs.readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => !entry.isDirectory())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .toSorted()
}
