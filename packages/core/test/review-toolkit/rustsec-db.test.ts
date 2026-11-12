import { constants } from "node:fs"
import { mkdir, readFile, rename, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "bun:test"
import { Effect } from "effect"
import { tmpdir } from "../fixture/tmpdir"
import { ReviewRustsecDb } from "../../src/review-toolkit/rustsec-db"

const ABSENT = "not run: RustSec advisory database absent"
const REV = "ab".repeat(20)
const STALE = "2020-01-02T03:04:05Z"
const GEN = "gen-11111111-1111-4111-8111-111111111111"
const SECRET = "SECRET_RUSTSEC_POINTER"
const hosted = constants.O_NOFOLLOW ? test : test.skip

const unavailable = (token: string) => `rustsec database unavailable: ${token}`
const meta = (patch: { generation?: string; revision?: string; committedAt?: string; refreshedAt?: string } = {}) =>
  JSON.stringify({
    generation: patch.generation ?? GEN,
    revision: patch.revision ?? REV,
    committedAt: patch.committedAt ?? STALE,
    refreshedAt: patch.refreshedAt ?? STALE,
  })

const current = (root: string, before?: (file: string) => Effect.Effect<void>) =>
  Effect.runPromise(ReviewRustsecDb.current().pipe(
    Effect.provideService(ReviewRustsecDb.Root, root),
    Effect.provideService(ReviewRustsecDb.BeforeRead, before ?? (() => Effect.void)),
  ))

const layout = async (root: string, body = meta(), manifest = body) => {
  const db = path.join(root, GEN, "db")
  await mkdir(path.join(db, ".git"), { recursive: true })
  await mkdir(path.join(db, "crates"), { recursive: true })
  await writeFile(path.join(root, GEN, "manifest.json"), manifest)
  await writeFile(path.join(root, "current.json"), body)
  return db
}

hosted("a stale but well-formed generation is current and does not consult mtime", async () => {
  await using dir = await tmpdir()
  const db = await layout(dir.path)
  await writeFile(path.join(db, "crates", "marker"), "OLD_DB_BYTES")
  const result = await current(dir.path)
  expect(result).toEqual({
    ok: true,
    state: { dir: db, revision: REV, committedAt: STALE, refreshedAt: STALE },
  })
  expect(JSON.stringify(result)).not.toContain("unavailable")
  const pointer = JSON.parse(await readFile(path.join(dir.path, "current.json"), "utf8"))
  expect(pointer).toEqual(JSON.parse(await readFile(path.join(dir.path, GEN, "manifest.json"), "utf8")))
  expect(Object.keys(pointer)).toEqual(["generation", "revision", "committedAt", "refreshedAt"])
})

test("a missing current pointer is not-run on every host", async () => {
  await using dir = await tmpdir()
  expect(await current(dir.path)).toEqual({ ok: false, status: "not-run", reason: ABSENT })
  const nested = path.join(dir.path, "empty")
  await mkdir(nested)
  expect(await current(nested)).toEqual({ ok: false, status: "not-run", reason: ABSENT })
})

hosted("malformed, extra, unreadable, and marker-mismatched pointers are acquisition errors", async () => {
  await using dir = await tmpdir()
  const cases: Array<{ name: string; token: string; plant: (root: string) => Promise<unknown> }> = [
    { name: "malformed", token: "metadata-invalid", plant: (root) => writeFile(path.join(root, "current.json"), "{") },
    { name: "pointer-bom", token: "metadata-invalid", plant: (root) => layout(root, "\uFEFF" + meta()) },
    { name: "marker-bom", token: "metadata-invalid", plant: (root) => layout(root, meta(), "\uFEFF" + meta()) },
    { name: "invalid-utf8", token: "metadata-invalid", plant: (root) => writeFile(path.join(root, "current.json"), Buffer.from([0xff])) },
    { name: "size-cap", token: "metadata-invalid", plant: (root) => writeFile(path.join(root, "current.json"), "x".repeat(4097)) },
    { name: "extra", token: "metadata-invalid", plant: async (root) => {
      await layout(root, JSON.stringify({ ...JSON.parse(meta()), extra: true }))
    } },
    { name: "hash", token: "metadata-invalid", plant: (root) => layout(root, meta({ revision: "zz".repeat(20) })) },
    { name: "date", token: "metadata-invalid", plant: (root) => layout(root, meta({ committedAt: "yesterday" })) },
    { name: "marker", token: "marker-mismatch", plant: (root) => layout(root, meta(), meta({ revision: "cd".repeat(20) })) },
    { name: "directory", token: "unreadable", plant: (root) => mkdir(path.join(root, "current.json"), { recursive: true }) },
  ]
  for (const item of cases) {
    const root = path.join(dir.path, item.name)
    await mkdir(root)
    await item.plant(root)
    expect(await current(root)).toEqual({ ok: false, status: "acquisition-error", reason: unavailable(item.token) })
  }
})

hosted("symlink components and traversals refuse without returning the secret", async () => {
  await using dir = await tmpdir()
  const outside = path.join(dir.path, "outside")
  await mkdir(outside)
  await writeFile(path.join(outside, "secret"), SECRET)
  const linked = path.join(dir.path, "linked")
  await layout(linked)
  await rename(path.join(linked, "current.json"), path.join(linked, "current.json.real"))
  await symlink(path.join(outside, "secret"), path.join(linked, "current.json"), "file")
  const generation = path.join(dir.path, "generation")
  await layout(generation)
  await rename(path.join(generation, GEN), path.join(generation, `${GEN}.real`))
  await symlink(outside, path.join(generation, GEN), "dir")
  const rootLink = path.join(dir.path, "root-link")
  await symlink(linked, rootLink, "dir")
  const escaped = path.join(dir.path, "escaped")
  await mkdir(escaped)
  await writeFile(path.join(escaped, "current.json"), meta({ generation: "../outside" }))
  for (const root of [linked, generation, rootLink, escaped]) {
    const result = await current(root)
    const token = root === escaped ? "path-outside" : "symlink"
    expect(result).toEqual({ ok: false, status: "acquisition-error", reason: unavailable(token) })
    expect(JSON.stringify(result)).not.toContain(SECRET)
  }
})

hosted("BeforeRead leaf and parent swaps refuse without reading the secret", async () => {
  for (const swapParent of [false, true]) {
    await using dir = await tmpdir()
    const root = path.join(dir.path, "root")
    await mkdir(root)
    await layout(root)
    const outside = path.join(dir.path, "outside")
    await mkdir(outside)
    await writeFile(path.join(outside, "secret"), SECRET)
    await writeFile(path.join(outside, "current.json"), SECRET)
    let swapped = false
    const result = await current(root, (file) => Effect.promise(async () => {
        if (swapped || !file.endsWith(`${path.sep}current.json`)) return
        swapped = true
        if (swapParent) {
          await rename(root, `${root}.saved`)
          await symlink(outside, root, "dir")
          return
        }
        await rename(file, `${file}.saved`)
        await symlink(path.join(outside, "secret"), file, "file")
      }))
    expect(swapped).toBe(true)
    expect(result).toEqual({ ok: false, status: "acquisition-error", reason: unavailable("symlink") })
    expect(JSON.stringify(result)).not.toContain(SECRET)
  }
})

test("unavailable nofollow refuses a planted pointer without returning its bytes", async () => {
  await using dir = await tmpdir()
  if (constants.O_NOFOLLOW) {
    const db = await layout(dir.path)
    expect(await current(dir.path)).toEqual({
      ok: true,
      state: { dir: db, revision: REV, committedAt: STALE, refreshedAt: STALE },
    })
    return
  }
  await writeFile(path.join(dir.path, "current.json"), SECRET)
  const result = await current(dir.path)
  expect(result).toEqual({ ok: false, status: "acquisition-error", reason: unavailable("nofollow-unavailable") })
  expect(JSON.stringify(result)).not.toContain(SECRET)
})
