import { expect } from "bun:test"
import path from "path"
import { createServer } from "net"
import { access, link, lstat, mkdir, readFile, readdir, symlink, writeFile } from "fs/promises"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { ReviewScanProjection } from "../../src/review-toolkit/scan-projection"
import { FileDigests } from "../fixture/file-digests"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const fixture = () => Effect.acquireRelease(Effect.promise(tmpdir), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()))
const metadata = (root: string): ReviewScratch.Snapshot => ({ root, origin: root, scratch: root, kind: "worktree", revision: "a".repeat(40), digest: "b".repeat(64), files: 0, dependencyRoots: [] })

it.live("real reviewed snapshot projects source while excluding its linked dependency shadow", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const temp = yield* fixture()
  const root = path.join(temp.path, "repo")
  yield* Effect.promise(async () => {
    await mkdir(path.join(root, "src"), { recursive: true })
    await mkdir(path.join(root, "node_modules", "dep"), { recursive: true })
    await mkdir(path.join(root, ".venv"))
    await writeFile(path.join(root, ".venv/data.txt"), "dependency data\n")
    await writeFile(path.join(root, ".gitignore"), "node_modules\n.venv\n")
    await writeFile(path.join(root, "package.json"), "{}\n")
    await writeFile(path.join(root, "src/a.sh"), "echo source\n")
    await writeFile(path.join(root, "node_modules/dep/index.js"), "dependency\n")
    await symlink("index.js", path.join(root, "node_modules/dep/alias.js"), "file")
  })
  for (const args of [["init", "-q"], ["config", "user.email", "projection@example.com"], ["config", "user.name", "Projection"], ["add", "."], ["commit", "-qm", "base"]]) yield* ResearchProcess.git(root, args)
  const before = yield* Effect.promise(() => FileDigests.capture(root))
  const projected = yield* Effect.scoped(Effect.gen(function* () {
    const snapshot = yield* ReviewScratch.create({ worktree: root, tree: true })
    expect(snapshot.dependencyRoots).toHaveLength(2)
    const image = yield* Effect.promise(() => FileDigests.capture(snapshot.root))
    const result = yield* ReviewScanProjection.create({ snapshot }).pipe(Effect.provideService(ReviewScanProjection.Parent, temp.path))
    if (!result.ok) throw new Error(result.reason)
    expect(result.projection.source).toEqual({ digest: snapshot.digest, revision: snapshot.revision, kind: snapshot.kind })
    expect(result.projection.excluded).toEqual([".venv", "node_modules"])
    expect(result.projection.files.map((file) => file.path)).toEqual([".gitignore", "package.json", "src/a.sh"])
    for (const file of result.projection.files) {
      const actual = yield* Effect.promise(() => readFile(path.join(result.projection.root, file.path)))
      expect(actual.equals(yield* Effect.promise(() => readFile(path.join(snapshot.root, file.path))))).toBe(true)
      expect(new Bun.CryptoHasher("sha256").update(actual).digest("hex")).toBe(file.sha256)
      expect(actual.length).toBe(file.bytes)
      expect((yield* Effect.promise(() => lstat(path.join(result.projection.root, file.path)))).nlink).toBe(1)
    }
    yield* Effect.promise(() => writeFile(path.join(result.projection.root, "src/a.sh"), "changed copy\n"))
    expect(yield* Effect.promise(() => FileDigests.capture(snapshot.root))).toEqual(image)
    return result.projection.root
  }))
  expect(yield* Effect.promise(() => access(projected).then(() => true, () => false))).toBe(false)
  expect(yield* Effect.promise(() => FileDigests.capture(root))).toEqual(before)
}), 120_000)

it.live("projection refuses source links, cycles, broken links and multiply-linked files without publishing a copy", () => Effect.gen(function* () {
  for (const kind of ["outside", "cycle", "broken", "hardlink", "directory", "in-tree"]) {
    const temp = yield* fixture()
    const root = path.join(temp.path, "source")
    const parent = path.join(temp.path, "outputs")
    yield* Effect.promise(async () => {
      await mkdir(root)
      await mkdir(parent)
      await writeFile(path.join(temp.path, "external"), "outside\n")
      if (kind === "directory") return symlink(temp.path, path.join(root, "entry"), process.platform === "win32" ? "junction" : "dir")
      if (kind === "hardlink") return link(path.join(temp.path, "external"), path.join(root, "entry"))
      if (kind === "in-tree") await writeFile(path.join(root, "real"), "inside")
      await symlink(kind === "in-tree" ? "real" : kind === "outside" ? path.join(temp.path, "external") : kind === "cycle" ? "entry" : "absent", path.join(root, "entry"), "file")
    })
    const result = yield* Effect.scoped(ReviewScanProjection.create({ snapshot: metadata(root) }).pipe(Effect.provideService(ReviewScanProjection.Parent, parent)))
    expect(result).toEqual({ ok: false, reason: kind === "hardlink" ? "projection-source-hardlink" : "projection-source-link" })
    expect(yield* Effect.promise(() => readdir(parent))).toEqual([])
    expect(yield* Effect.promise(() => readFile(path.join(temp.path, "external"), "utf8"))).toBe("outside\n")
  }
  // A POSIX socket is a real non-file entry. Windows exercises its available file/link entry classes above.
  if (process.platform !== "win32") {
    const temp = yield* fixture()
    const root = path.join(temp.path, "source")
    yield* Effect.promise(() => mkdir(root))
    yield* Effect.acquireRelease(Effect.promise(() => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
      const server = createServer()
      server.once("error", reject).listen(path.join(root, "socket"), () => resolve(server))
    })), (server) => Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))))
    expect(yield* ReviewScanProjection.create({ snapshot: metadata(root) })).toEqual({ ok: false, reason: "projection-source-special" })
  }
}))

it.live("projection refuses unsafe dependency metadata and root aliases", () => Effect.gen(function* () {
  const temp = yield* fixture()
  const root = path.join(temp.path, "source")
  yield* Effect.promise(() => mkdir(root))
  for (const roots of [undefined, [temp.path], [root], [path.join(root, "src")]]) {
    const snapshot = { ...metadata(root), dependencyRoots: roots } as ReviewScratch.Snapshot
    expect(yield* Effect.scoped(ReviewScanProjection.create({ snapshot }))).toEqual({ ok: false, reason: "projection-dependency-roots-invalid" })
  }
  const outside = path.join(temp.path, "node_modules")
  const aliasRoot = path.join(root, ".venv")
  yield* Effect.promise(async () => { await mkdir(outside); await symlink(outside, aliasRoot, process.platform === "win32" ? "junction" : "dir") })
  for (const entry of [outside, aliasRoot]) expect(yield* Effect.scoped(ReviewScanProjection.create({ snapshot: { ...metadata(root), dependencyRoots: [entry] } }))).toEqual({ ok: false, reason: "projection-dependency-roots-invalid" })
  const clean = path.join(temp.path, "clean")
  yield* Effect.promise(() => mkdir(clean))
  expect(yield* Effect.scoped(ReviewScanProjection.create({ snapshot: metadata(clean) }).pipe(Effect.provideService(ReviewScanProjection.Parent, clean)))).toEqual({ ok: false, reason: "projection-parent-invalid" })
  const inside = path.join(clean, "nested")
  yield* Effect.promise(() => mkdir(inside))
  expect(yield* Effect.scoped(ReviewScanProjection.create({ snapshot: metadata(clean) }).pipe(Effect.provideService(ReviewScanProjection.Parent, inside)))).toEqual({ ok: false, reason: "projection-parent-invalid" })
  expect(yield* Effect.promise(() => readdir(inside))).toEqual([])
  expect(yield* Effect.promise(() => readdir(clean))).toEqual(["nested"])
  const alias = path.join(temp.path, "alias")
  yield* Effect.promise(() => symlink(root, alias, process.platform === "win32" ? "junction" : "dir"))
  expect(yield* Effect.scoped(ReviewScanProjection.create({ snapshot: metadata(alias) }))).toEqual({ ok: false, reason: "projection-root-invalid" })
}))

it.live("projection enforces byte, entry, depth and UTF-8 path budgets and removes failed stages", () => Effect.gen(function* () {
  expect(ReviewScanProjection.DEFAULTS).toEqual({ maxBytes: 64 * 1024 * 1024, maxEntries: 10_000, maxDepth: 64, maxPathBytes: 1024 * 1024 })
  const temp = yield* fixture()
  const root = path.join(temp.path, "source")
  const parent = path.join(temp.path, "outputs")
  yield* Effect.promise(async () => { await mkdir(path.join(root, "nested"), { recursive: true }); await mkdir(parent); await writeFile(path.join(root, "nested/é.sh"), "12345") })
  const run = (limits: Partial<ReviewScanProjection.Limits>) => Effect.scoped(ReviewScanProjection.create({ snapshot: metadata(root), limits }).pipe(Effect.provideService(ReviewScanProjection.Parent, parent)))
  for (const limits of [{ maxBytes: 4 }, { maxEntries: 1 }, { maxDepth: 1 }, { maxPathBytes: 6 }]) {
    expect(yield* run(limits)).toEqual({ ok: false, reason: "projection-budget" })
    expect(yield* Effect.promise(() => readdir(parent))).toEqual([])
  }
  for (const limits of [{ maxEntries: Number.NaN }, { maxBytes: Infinity }, { maxBytes: -1 }, { maxEntries: 0 }, { maxDepth: 0 }, { maxPathBytes: 0 }, { maxEntries: 1.5 }, { maxBytes: ReviewScanProjection.DEFAULTS.maxBytes + 1 }, { maxEntries: ReviewScanProjection.DEFAULTS.maxEntries + 1 }, { maxDepth: ReviewScanProjection.DEFAULTS.maxDepth + 1 }, { maxPathBytes: ReviewScanProjection.DEFAULTS.maxPathBytes + 1 }]) {
    expect(yield* run(limits)).toEqual({ ok: false, reason: "projection-limits-invalid" })
    expect(yield* Effect.promise(() => readdir(parent))).toEqual([])
  }
  expect(yield* Effect.scoped(ReviewScanProjection.create({ snapshot: metadata(root), limits: ReviewScanProjection.DEFAULTS }))).toMatchObject({ ok: true })
  const utf = path.join(temp.path, "utf")
  yield* Effect.promise(async () => { await mkdir(utf); await writeFile(path.join(utf, "é"), "x") })
  expect(yield* Effect.scoped(ReviewScanProjection.create({ snapshot: metadata(utf), limits: { maxPathBytes: 1 } }))).toEqual({ ok: false, reason: "projection-budget" })
  expect(yield* Effect.scoped(ReviewScanProjection.create({ snapshot: metadata(utf), limits: { maxPathBytes: 2 } }))).toMatchObject({ ok: true })
  yield* Effect.promise(() => writeFile(path.join(utf, "a"), "x"))
  expect(yield* Effect.scoped(ReviewScanProjection.create({ snapshot: metadata(utf), limits: { maxPathBytes: 2 } }))).toEqual({ ok: false, reason: "projection-budget" })
  expect(yield* Effect.scoped(ReviewScanProjection.create({ snapshot: metadata(utf), limits: { maxPathBytes: 3 } }))).toMatchObject({ ok: true })
  const success = yield* Effect.scoped(ReviewScanProjection.create({ snapshot: metadata(root), limits: { maxBytes: 5, maxEntries: 2, maxDepth: 2 } }))
  expect(success).toMatchObject({ ok: true })
  expect(yield* Effect.promise(() => readFile(path.join(root, "nested/é.sh"), "utf8"))).toBe("12345")
}))

it.live("projection binds sorted actual file hashes and exclusion metadata to source provenance", () => Effect.gen(function* () {
  const temp = yield* fixture()
  const root = path.join(temp.path, "source")
  yield* Effect.promise(async () => { await mkdir(root); await writeFile(path.join(root, "z.sh"), "old"); await writeFile(path.join(root, "a.sh"), "a") })
  const input = metadata(root)
  const run = (snapshot = input) => ReviewScanProjection.create({ snapshot })
  const original = yield* run()
  if (!original.ok) throw new Error(original.reason)
  expect(original.projection.files).toEqual([{ path: "a.sh", bytes: 1, sha256: new Bun.CryptoHasher("sha256").update("a").digest("hex") }, { path: "z.sh", bytes: 3, sha256: new Bun.CryptoHasher("sha256").update("old").digest("hex") }])
  const repeated = yield* run()
  if (!repeated.ok) throw new Error(repeated.reason)
  expect(repeated.projection.root).not.toBe(original.projection.root)
  expect(repeated.projection.digest).toBe(original.projection.digest)
  yield* Effect.promise(() => mkdir(path.join(root, "target")))
  const excluded = yield* run({ ...input, dependencyRoots: [path.join(root, "target")] })
  if (!excluded.ok) throw new Error(excluded.reason)
  expect(excluded.projection.files).toEqual(original.projection.files)
  expect(excluded.projection.excluded).toEqual(["target"])
  expect(excluded.projection.digest).not.toBe(original.projection.digest)
  yield* Effect.promise(() => writeFile(path.join(root, "z.sh"), "new"))
  const changed = yield* run()
  if (!changed.ok) throw new Error(changed.reason)
  expect(changed.projection.digest).not.toBe(original.projection.digest)
  const provenance = yield* run({ ...input, digest: "c".repeat(64) })
  if (!provenance.ok) throw new Error(provenance.reason)
  expect(provenance.projection.digest).not.toBe(changed.projection.digest)
  for (const source of [{ ...input, revision: "d".repeat(40) }, { ...input, kind: "commit" as const }]) {
    const result = yield* run(source)
    if (!result.ok) throw new Error(result.reason)
    expect(result.projection.digest).not.toBe(changed.projection.digest)
  }
  const excludedRoot = path.join(root, ".venv")
  yield* Effect.promise(async () => { await mkdir(excludedRoot); await writeFile(path.join(excludedRoot, "large"), "over budget"); await symlink("missing", path.join(excludedRoot, "link"), "file") })
  expect(yield* ReviewScanProjection.create({ snapshot: { ...input, dependencyRoots: [excludedRoot] }, limits: { maxBytes: 4, maxEntries: 3 } })).toMatchObject({ ok: true })
}))
