import { expect, test } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { ReviewLocalCargoInput } from "../../src/review-toolkit/local-cargo-input"
import { ReviewScanProjection } from "../../src/review-toolkit/scan-projection"
import type { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { FileDigests } from "../fixture/file-digests"
import { tmpdir } from "../fixture/tmpdir"

const held = () => Effect.acquireRelease(Effect.promise(tmpdir), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()))
const write = (root: string, files: Record<string, string>) => Effect.promise(async () => {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), text)
  }
})
const snapshot = (root: string): ReviewScratch.Snapshot => ({ root, scratch: root, origin: root, kind: "worktree", revision: "a".repeat(40), digest: "b".repeat(64), files: 0, dependencyRoots: [] })
const projected = (root: string) => ReviewScanProjection.create({ snapshot: snapshot(root) }).pipe(Effect.map((result) => {
  if (!result.ok) throw new Error(result.reason)
  return result.projection
}))
const manifest = '[workspace]\nmembers=["crates/*", "shared"]\n'
const packageManifest = (name: string, extra = "") => `[package]\nname=${JSON.stringify(name)}\nversion="0.1.0"\nedition="2021"\n${extra}`

test("contained manifests, internal sibling paths and workspace globs pass preflight", () => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const temp = yield* held()
  const root = temp.path
  yield* write(root, {
    "Cargo.toml": manifest,
    "crates/a/Cargo.toml": packageManifest("a", '[dependencies]\nshared={path="../../shared"}\n'),
    "crates/a/src/lib.rs": "pub fn call(){shared::call()}\n",
    "shared/Cargo.toml": packageManifest("shared", '[lib]\npath="src/lib.rs"\n'),
    "shared/src/lib.rs": "pub fn call(){}\n",
  })
  const bytes = yield* Effect.promise(() => readFile(path.join(root, "Cargo.toml")))
  expect(Bun.TOML.parse(bytes.toString("utf8"))).toMatchObject({ workspace: { members: ["crates/*", "shared"] } })
  const projection = yield* projected(root)
  const meta = projection.files.find((file) => file.path === "Cargo.toml")
  expect(meta).toMatchObject({ bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") })
  const sourceBefore = yield* Effect.promise(() => FileDigests.capture(root))
  const before = yield* Effect.promise(() => FileDigests.capture(projection.root))
  expect(yield* ReviewLocalCargoInput.check(projection)).toBeUndefined()
  expect(yield* Effect.promise(() => FileDigests.capture(projection.root))).toEqual(before)
  expect(yield* Effect.promise(() => FileDigests.capture(root))).toEqual(sourceBefore)

  const exact = path.join(temp.path, "exact")
  const prefix = packageManifest("exact")
  yield* write(exact, { "Cargo.toml": prefix + "#" + "x".repeat(65_536 - Buffer.byteLength(prefix) - 1) })
  expect(yield* ReviewLocalCargoInput.check(yield* projected(exact))).toBeUndefined()
  const many = path.join(temp.path, "many")
  yield* write(many, Object.fromEntries(Array.from({ length: 512 }, (_, i) => [`m${i}/Cargo.toml`, packageManifest(`m${i}`)])))
  expect(yield* ReviewLocalCargoInput.check(yield* projected(many))).toBeUndefined()
  const full = path.join(temp.path, "full")
  yield* write(full, Object.fromEntries(Array.from({ length: 64 }, (_, i) => {
    const prefix = packageManifest(`m${i}`)
    return [`m${i}/Cargo.toml`, prefix + "#" + "x".repeat(65_536 - Buffer.byteLength(prefix) - 1)]
  })))
  expect(yield* ReviewLocalCargoInput.check(yield* projected(full))).toBeUndefined()
  const shadow = path.join(temp.path, "shadow")
  yield* write(shadow, { "Cargo.toml": packageManifest("shadow", '[lib]\npath="target/lib.rs"\n'), "target/lib.rs": "pub fn ok(){}\n" })
  const excluded = yield* ReviewScanProjection.create({ snapshot: { ...snapshot(shadow), dependencyRoots: [path.join(shadow, "target")] } })
  if (!excluded.ok) throw new Error(excluded.reason)
  expect(excluded.projection.excluded).toContain("target")
  expect(yield* ReviewLocalCargoInput.check(excluded.projection)).toEqual({ status: "not-run", reason: "cargo-path-missing" })

}))))

test("malformed TOML, hash/size mismatch, nonfile and missing bytes have exact refusal reasons", () => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const temp = yield* held()
  for (const [name, text, mutation, reason] of [
    ["invalid", "[package\n", undefined, "cargo-manifest-invalid"],
    ["hash", packageManifest("hash"), "same-size", "cargo-manifest-changed"],
    ["size", packageManifest("size"), "different-size", "cargo-manifest-changed"],
    ["truncated", packageManifest("truncated"), "truncated", "cargo-manifest-changed"],
    ["nonfile", packageManifest("nonfile"), "directory", "cargo-manifest-changed"],
    ["missing", packageManifest("missing"), "missing", "cargo-manifest-changed"],
  ] as const) {
    const root = path.join(temp.path, name)
    yield* write(root, { "Cargo.toml": text })
    const projection = yield* projected(root)
    const target = path.join(projection.root, "Cargo.toml")
    if (mutation === "same-size") yield* Effect.promise(() => writeFile(target, text.replace("hash", "HASH")))
    if (mutation === "truncated") yield* Effect.promise(() => writeFile(target, text.slice(0, -5)))
    if (mutation === "different-size") yield* Effect.promise(() => writeFile(target, `${text}#changed\n`))
    if (mutation === "directory") yield* Effect.promise(async () => { await rm(target); await mkdir(target) })
    if (mutation === "missing") yield* Effect.promise(() => rm(target))
    expect(yield* ReviewLocalCargoInput.check(projection)).toEqual({ status: "acquisition-error", reason })
  }

  const metadata = path.join(temp.path, "metadata")
  yield* write(metadata, { "Cargo.toml": packageManifest("metadata") })
  const invalid = yield* projected(metadata)
  for (const bytes of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(yield* ReviewLocalCargoInput.check({ ...invalid, files: invalid.files.map((file) => ({ ...file, bytes })) })).toEqual({ status: "acquisition-error", reason: "cargo-manifest-changed" })
  const encoding = path.join(temp.path, "encoding")
  yield* write(encoding, { "Cargo.toml": packageManifest("encoding") })
  yield* Effect.promise(() => writeFile(path.join(encoding, "Cargo.toml"), Buffer.concat([Buffer.from(packageManifest("encoding") + "#"), Buffer.from([255])])))
  expect(yield* ReviewLocalCargoInput.check(yield* projected(encoding))).toEqual({ status: "acquisition-error", reason: "cargo-manifest-invalid" })
  if (process.platform === "linux") {
    const linked = path.join(temp.path, "linked")
    yield* write(linked, { "Cargo.toml": packageManifest("linked") })
    const projection = yield* projected(linked)
    yield* Effect.promise(async () => { await rm(path.join(projection.root, "Cargo.toml")); await symlink(path.join(linked, "Cargo.toml"), path.join(projection.root, "Cargo.toml")) })
    expect(yield* ReviewLocalCargoInput.check(projection)).toEqual({ status: "acquisition-error", reason: "cargo-manifest-changed" })
  }

}))))

test("manifest count, per-file and aggregate limits refuse before unbounded reads", () => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const temp = yield* held()
  for (const [name, files] of [
    ["count", Object.fromEntries(Array.from({ length: 513 }, (_, i) => [`m${i}/Cargo.toml`, packageManifest(`m${i}`)]))],
    ["single", { "Cargo.toml": `${packageManifest("large")}#${"x".repeat(65_537)}` }],
    ["aggregate", Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`m${i}/Cargo.toml`, `${packageManifest(`m${i}`)}#${"x".repeat(65_536 - Buffer.byteLength(packageManifest(`m${i}`)) - 2)}\n`]))],
  ] as const) {
    const root = path.join(temp.path, name)
    yield* write(root, files)
    expect(yield* ReviewLocalCargoInput.check(yield* projected(root))).toEqual({ status: "not-run", reason: "cargo-manifest-budget" })
  }
}))))

test("outside lexical manifest entries refuse before host reads and no manifests are explicit", () => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const temp = yield* held()
  const emptyRoot = path.join(temp.path, "empty")
  yield* Effect.promise(() => mkdir(emptyRoot, { recursive: true }))
  expect(yield* ReviewLocalCargoInput.check(yield* projected(emptyRoot))).toEqual({ status: "not-run", reason: "cargo-manifest-missing" })
  const root = path.join(temp.path, "inside")
  yield* write(root, { "Cargo.toml": packageManifest("inside") })
  const projection = yield* projected(root)
  const entry = projection.files.find((file) => file.path === "Cargo.toml")!
  const outside = { ...projection, files: [...projection.files, { ...entry, path: "../outside/Cargo.toml" }] }
  expect(yield* ReviewLocalCargoInput.check(outside)).toEqual({ status: "not-run", reason: "cargo-path-outside" })
  for (const workspace of [false, true]) {
    const source = path.join(temp.path, workspace ? "workspace" : "package")
    yield* write(source, { "Cargo.toml": packageManifest("inside", workspace ? "[workspace]\n" : "") })
    const projection = yield* projected(source)
    yield* write(path.dirname(projection.root), { "Cargo.toml": `[workspace]\nmembers=[${JSON.stringify(path.basename(projection.root))}]\n[workspace.metadata.cargo-machete]\nignored=["anyhow"]\n` })
    expect(yield* ReviewLocalCargoInput.check(projection)).toEqual({ status: "not-run", reason: "cargo-ancestor-outside" })
  }

  const space = yield* held()
  const source = path.join(temp.path, "deep-source")
  yield* write(source, { "Cargo.toml": packageManifest("deep") })
  const ancestors: string[] = [space.path]
  while (path.dirname(ancestors[ancestors.length - 1]) !== ancestors[ancestors.length - 1]) ancestors.push(path.dirname(ancestors[ancestors.length - 1]))
  const levels = 127 - ancestors.length
  expect(levels).toBeGreaterThan(0)
  const allowed = path.join(space.path, ...Array(levels).fill("d"))
  yield* Effect.promise(() => mkdir(allowed, { recursive: true }))
  const boundary = yield* projected(source).pipe(Effect.provideService(ReviewScanProjection.Parent, allowed))
  expect(yield* ReviewLocalCargoInput.check(boundary)).toBeUndefined()
  const denied = path.join(allowed, "d")
  yield* Effect.promise(() => mkdir(denied, { recursive: true }))
  const beyond = yield* projected(source).pipe(Effect.provideService(ReviewScanProjection.Parent, denied))
  expect(yield* ReviewLocalCargoInput.check(beyond)).toEqual({ status: "not-run", reason: "cargo-manifest-budget" })

}))))
