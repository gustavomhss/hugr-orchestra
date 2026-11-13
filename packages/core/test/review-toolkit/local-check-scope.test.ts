import { expect } from "bun:test"
import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { Effect, Layer } from "effect"
import { ReviewLocalCheckScope } from "../../src/review-toolkit/local-check-scope"
import { ReviewScanProjection } from "../../src/review-toolkit/scan-projection"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)
const POLICY = { version: 1, shfmt: { indent: 2, language: "bash" }, cargoMachete: { enabled: true } } as const
const fixture = () => Effect.acquireRelease(Effect.promise(tmpdir), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()))
const snapshot = (root: string): ReviewScratch.Snapshot => ({ root, origin: root, scratch: root, kind: "worktree", revision: "a".repeat(40), digest: "b".repeat(64), files: 0, dependencyRoots: [] })
const configured: ReviewLocalCheckScope.Configured = { value: POLICY, sha256: "c".repeat(64), projectionDigest: "d".repeat(64) }
// Host projection records are the selection authority; read() below is also exercised against real copied bytes.
const projection: ReviewScanProjection.Projection = { root: "/host-private", source: { digest: "b".repeat(64), revision: "a".repeat(40), kind: "commit" }, digest: "e".repeat(64), excluded: ["node_modules"], files: ["Cargo.toml", "src/lib.rs", "a.sh", "nested/b.bash", "readme.md"].map((file) => ({ path: file, bytes: 1, sha256: "f".repeat(64) })) }

it.live("base policy reads exact verified projection bytes and refuses missing, malformed, unknown and oversized config", () => Effect.gen(function* () {
  expect(ReviewLocalCheckScope.POLICY_PATH).toBe(".orchestra/lucy-local-checks.json")
  const temp = yield* fixture()
  yield* Effect.promise(() => mkdir(path.join(temp.path, ".orchestra")))
  for (const [text, reason] of [[undefined, "policy-missing"], ["broken", "policy-invalid"], [JSON.stringify({ ...POLICY, cargoMachete: { enabled: "yes" } }), "policy-invalid"], [JSON.stringify({ ...POLICY, cargoMachete: { enabled: true, flags: ["--fix"] } }), "policy-invalid"], [JSON.stringify({ ...POLICY, shfmt: { indent: 2, language: "node" } }), "policy-invalid"], [JSON.stringify({ ...POLICY, version: 2 }), "policy-invalid"], [JSON.stringify({ ...POLICY, shfmt: { ...POLICY.shfmt, flags: ["-w"] } }), "policy-invalid"], [JSON.stringify({ ...POLICY, command: "sh -c bad" }), "policy-invalid"], [JSON.stringify({ ...POLICY, shfmt: { indent: 3, language: "bash" } }), "policy-invalid"], [" ".repeat(65537), "policy-too-large"]] as const) {
    if (text !== undefined) yield* Effect.promise(() => writeFile(path.join(temp.path, ReviewLocalCheckScope.POLICY_PATH), text))
    const projected = yield* ReviewScanProjection.create({ snapshot: snapshot(temp.path) })
    if (!projected.ok) throw new Error(projected.reason)
    expect(yield* ReviewLocalCheckScope.read(projected.projection)).toEqual({ ok: false, reason })
  }
  yield* Effect.promise(() => writeFile(path.join(temp.path, ReviewLocalCheckScope.POLICY_PATH), JSON.stringify(POLICY).padEnd(65536, " ")))
  const base = yield* ReviewScanProjection.create({ snapshot: snapshot(temp.path) })
  if (!base.ok) throw new Error(base.reason)
  const read = yield* ReviewLocalCheckScope.read(base.projection)
  if (!read.ok) throw new Error(read.reason)
  expect(read.configured.value).toEqual(POLICY)
  expect(read.configured.sha256).toBe(new Bun.CryptoHasher("sha256").update(JSON.stringify(POLICY).padEnd(65536, " ")).digest("hex"))
  expect(read.configured.projectionDigest).toBe(base.projection.digest)
  yield* Effect.promise(() => writeFile(path.join(base.projection.root, ReviewLocalCheckScope.POLICY_PATH), JSON.stringify({ version: 1 })))
  expect(yield* ReviewLocalCheckScope.read(base.projection)).toEqual({ ok: false, reason: "policy-bytes-changed" })
  for (const value of [{ version: 1 }, { version: 1, cargoMachete: { enabled: false } }, ...["bash", "posix", "mksh", "bats"].map((language, index) => ({ version: 1, shfmt: { indent: [0, 2, 4, 8][index], language } }))]) {
    yield* Effect.promise(() => writeFile(path.join(temp.path, ReviewLocalCheckScope.POLICY_PATH), JSON.stringify(value)))
    const projected = yield* ReviewScanProjection.create({ snapshot: snapshot(temp.path) })
    if (!projected.ok) throw new Error(projected.reason)
    expect(yield* ReviewLocalCheckScope.read(projected.projection)).toMatchObject({ ok: true, configured: { value } })
  }
  const empty = path.join(temp.path, "empty-base")
  const stages = path.join(temp.path, "stages")
  yield* Effect.promise(async () => { await mkdir(empty); await mkdir(stages) })
  const absent = yield* ReviewScanProjection.create({ snapshot: snapshot(empty) }).pipe(Effect.provideService(ReviewScanProjection.Parent, stages))
  if (!absent.ok) throw new Error(absent.reason)
  yield* Effect.promise(async () => { await mkdir(path.join(path.dirname(absent.projection.root), ".orchestra"), { recursive: true }); await writeFile(path.join(path.dirname(absent.projection.root), ReviewLocalCheckScope.POLICY_PATH), JSON.stringify(POLICY)) })
  expect(yield* ReviewLocalCheckScope.read(absent.projection)).toEqual({ ok: false, reason: "policy-missing" })
  yield* Effect.promise(async () => { await mkdir(path.join(absent.projection.root, ".orchestra")); await writeFile(path.join(absent.projection.root, ReviewLocalCheckScope.POLICY_PATH), JSON.stringify(POLICY)) })
  expect(yield* ReviewLocalCheckScope.read(absent.projection)).toEqual({ ok: false, reason: "policy-missing" })
}))

it.live("shfmt selects only requested existing shell files under frozen base formatting flags", () => Effect.sync(() => {
  const result = ReviewLocalCheckScope.select({ tool: "shfmt", scope: "diff", files: ["nested/b.bash", "a.sh", "a.sh", "deleted.sh", "readme.md"], projection, configured })
  expect(result).toEqual({ ok: true, files: ["a.sh", "nested/b.bash"], flags: ["-d", "-i", "2", "-ln", "bash", "--"], coverage: "changed-files", policySha256: configured.sha256, projectionDigest: projection.digest })
  expect(ReviewLocalCheckScope.select({ tool: "shfmt", scope: "files", files: ["a.sh"], projection, configured })).toMatchObject({ ok: true, files: ["a.sh"], coverage: "explicit-files" })
  expect(ReviewLocalCheckScope.select({ tool: "shfmt", scope: "files", files: ["deleted.sh"], projection, configured })).toEqual({ ok: false, reason: "scope-file-unavailable" })
  expect(ReviewLocalCheckScope.select({ tool: "shfmt", scope: "diff", files: ["deleted.sh", "readme.md"], projection, configured })).toEqual({ ok: false, reason: "scope-no-input" })
  for (const indent of [0, 2, 4, 8] as const) for (const language of ["bash", "posix", "mksh", "bats"] as const) {
    const extra = { ...projection, files: [...projection.files, ...["c.bats", "d.ksh"].map((file) => ({ path: file, bytes: 1, sha256: "f".repeat(64) }))] }
    expect(ReviewLocalCheckScope.select({ tool: "shfmt", scope: "diff", files: ["c.bats", "d.ksh"], projection: extra, configured: { ...configured, value: { version: 1, shfmt: { indent, language } } } })).toMatchObject({ ok: true, files: ["c.bats", "d.ksh"], flags: ["-d", "-i", String(indent), "-ln", language, "--"] })
  }
}))

it.live("cargo requires base opt-in and a whole reviewed workspace, never widens files scope", () => Effect.sync(() => {
  expect(ReviewLocalCheckScope.select({ tool: "cargo-machete", scope: "files", files: ["Cargo.toml"], projection, configured })).toEqual({ ok: false, reason: "scope-workspace-required" })
  expect(ReviewLocalCheckScope.select({ tool: "cargo-machete", scope: "diff", files: ["src/lib.rs"], projection, configured })).toEqual({ ok: true, files: ["Cargo.toml", "a.sh", "nested/b.bash", "readme.md", "src/lib.rs"], flags: ["--no-ignore", "."], coverage: "workspace", policySha256: configured.sha256, projectionDigest: projection.digest })
  expect(ReviewLocalCheckScope.select({ tool: "cargo-machete", scope: "diff", files: ["readme.md"], projection, configured })).toEqual({ ok: false, reason: "scope-no-input" })
  expect(ReviewLocalCheckScope.select({ tool: "cargo-machete", scope: "diff", files: ["src/lib.rs"], projection: { ...projection, files: projection.files.filter((file) => file.path !== "Cargo.toml") }, configured })).toEqual({ ok: false, reason: "scope-no-manifest" })
  // A lockfile is a change trigger, never a substitute for the scanner's Cargo.toml manifest.
  expect(ReviewLocalCheckScope.select({ tool: "cargo-machete", scope: "diff", files: ["Cargo.lock"], projection: { ...projection, files: [{ path: "Cargo.lock", bytes: 1, sha256: "f".repeat(64) }] }, configured })).toEqual({ ok: false, reason: "scope-no-manifest" })
  const nested = { ...projection, files: projection.files.map((file) => file.path === "Cargo.toml" ? { ...file, path: "crates/app/Cargo.toml" } : file) }
  expect(ReviewLocalCheckScope.select({ tool: "cargo-machete", scope: "diff", files: ["Cargo.lock"], projection: nested, configured })).toMatchObject({ ok: true, coverage: "workspace", files: ["a.sh", "crates/app/Cargo.toml", "nested/b.bash", "readme.md", "src/lib.rs"] })
  for (const file of ["Cargo.toml", "Cargo.lock"]) expect(ReviewLocalCheckScope.select({ tool: "cargo-machete", scope: "diff", files: [file], projection, configured })).toMatchObject({ ok: true, coverage: "workspace" })
  expect(ReviewLocalCheckScope.select({ tool: "cargo-machete", scope: "diff", files: ["Cargo.toml"], projection, configured: { ...configured, value: { version: 1, cargoMachete: { enabled: false } } } })).toEqual({ ok: false, reason: "policy-disabled" })
  for (const tool of ["shfmt", "cargo-machete"] as const) expect(ReviewLocalCheckScope.select({ tool, scope: "diff", files: ["a.sh", "src/lib.rs"], projection, configured: { ...configured, value: { version: 1 } } })).toEqual({ ok: false, reason: "policy-disabled" })
}))

it.live("selection rejects traversal, absolute paths, dependency entries and invalid runtime scope", () => Effect.sync(() => {
  for (const file of ["", "a/./b.sh", "node_modules", "../a.sh", "/a.sh", "C:/a.sh", "src/../a.sh", "a\u0000.sh", "src\\a.sh", "node_modules/a.sh"]) {
    expect(ReviewLocalCheckScope.select({ tool: "shfmt", scope: "diff", files: [file], projection, configured })).toEqual({ ok: false, reason: "scope-path-invalid" })
  }
  expect(ReviewLocalCheckScope.select({ tool: "shfmt", scope: "diff", files: ["node_modules_backup/a.sh"], projection: { ...projection, files: [...projection.files, { path: "node_modules_backup/a.sh", bytes: 1, sha256: "f".repeat(64) }] }, configured })).toMatchObject({ ok: true, files: ["node_modules_backup/a.sh"] })
  expect(ReviewLocalCheckScope.select({ tool: "shfmt", scope: "unknown" as "diff", files: ["a.sh"], projection, configured })).toEqual({ ok: false, reason: "scope-invalid" })
  expect(ReviewLocalCheckScope.select({ tool: "unknown" as "shfmt", scope: "diff", files: ["a.sh"], projection, configured })).toEqual({ ok: false, reason: "scope-tool-unknown" })
}))
