import { expect } from "bun:test"
import path from "path"
import { cp, lstat, mkdir, readdir, readFile, readlink, symlink, writeFile } from "fs/promises"
import { Effect, Exit } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewProbe, ReviewScratch } from "../../src/review-toolkit"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
// A skip is not isolation conformance. Linux and macOS run the jailed demand; Windows is the explicit not-run case below.
const live = jail ? it.live : it.live.skip
const unjailed = jail ? it.live.skip : it.live
const fixtureDir = path.join(import.meta.dir, "../fixture/lucy-dependency-probe")
const DIRTY = 3

const repo = (liveOnly: boolean) => Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(root, { recursive: true })
  await cp(path.join(fixtureDir, "src"), path.join(root, "src"), { recursive: true })
  await cp(path.join(fixtureDir, "package.json"), path.join(root, "package.json"))
  await cp(path.join(fixtureDir, "bunfig.toml"), path.join(root, "bunfig.toml"))
  await writeFile(path.join(root, ".gitignore"), "node_modules/\n")
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "probe@example.com")
  await git(root, "config", "user.name", "Probe")
  await git(root, "config", "core.autocrlf", "false")
  await writeValue(root, 1)
  await git(root, "add", "package.json", "bunfig.toml", ".gitignore", "src", "packages")
  await git(root, "commit", "-q", "-m", "base")
  await writeValue(root, 2)
  await git(root, "add", "packages")
  await git(root, "commit", "-q", "-m", "head")
  await writeValue(root, DIRTY)
  await linkDependencies(root, liveOnly)
  return { dir, root }
}), (fixture) => Effect.promise(() => fixture.dir[Symbol.asyncDispose]()))

/** Bytes, modes and link targets. Symlinks are not followed, so a live graft cannot hide a retargeted link. */
async function image(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true })
  const nested = await Promise.all(entries.filter((entry) => entry.name !== ".git").map(async (entry) => {
    const relative = path.join(prefix, entry.name)
    const full = path.join(root, relative)
    const stat = await lstat(full)
    if (entry.isSymbolicLink()) return [`${relative} -> ${await readlink(full)} mode ${stat.mode.toString(8)}`]
    if (entry.isDirectory()) return [`${relative}/ mode ${stat.mode.toString(8)}`, ...await image(root, relative)]
    return [`${relative}: mode ${stat.mode.toString(8)} ${(await readFile(full)).toString("base64")}`]
  }))
  return nested.flat().sort()
}

const context = (snapshot: ReviewScratch.Snapshot, other: ReviewScratch.Snapshot, offered: ReviewProbe.Context["offered"]): ReviewProbe.Context => ({
  reviewID: "review_dependency",
  head: snapshot,
  base: other,
  offered,
  cap: 2,
  hunks: [],
  ledger: ReviewProbe.ledger(),
  timeoutSeconds: 60,
})

const expectReviewed = (text: string, reviewed: number) => {
  expect(text, text).toContain("ORDINARY=ORDINARY_EXTERNAL")
  expect(text, text).toContain("NESTED_PACKAGE=NESTED_EXTERNAL")
  for (const label of ["DIRECT", "TRANSITIVE", "NESTED"] as const) {
    expect(text, text).toContain(`${label}=${reviewed}`)
    expect(text, text).not.toContain(`${label}=${DIRTY}`)
    expect(text, text).not.toContain(`${label}=${reviewed === 2 ? 1 : 2}`)
  }
}

live("probe:test CJS and ESM entrypoints read the reviewed workspace value, not the dirty live graft", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo(false)
    const before = yield* Effect.promise(() => image(fixture.root))
    const template = yield* Effect.promise(() => image(fixtureDir))
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD" })
      const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
      expect(head.digest).not.toBe(base.digest)
      expect(yield* Effect.promise(() => Bun.file(path.join(head.root, "packages", "workspace", "index.mjs")).text())).toBe("export const value = 2\n")
      expect(yield* Effect.promise(() => Bun.file(path.join(base.root, "packages", "workspace", "index.cjs")).text())).toBe("module.exports = { value: 1 }\n")
      const offered = { cjs: ["probe:test"], esm: ["probe:test"] }
      const headContext = context(head, base, offered)
      const baseContext = context(base, head, offered)
      // Default Writer. This scope does not replace the cancellation slice's root writer.
      const cjsHead = yield* ReviewProbe.run({
        candidate: "cjs", option: "probe:test", target: { test: { file: "src/cjs.test.cjs", name: "reviewed" } },
      }, headContext)
      expect(cjsHead.result.status, cjsHead.artifact.text).toBe("pass")
      // Intended RED while node_modules is a live graft: the excerpt has DIRECT=3, not this reviewed value.
      expectReviewed(cjsHead.artifact.text, 2)
      expect(headContext.ledger.attempts.get("cjs")).toBe(1)
      const esmHead = yield* ReviewProbe.run({
        candidate: "esm", option: "probe:test", target: { test: { file: "src/esm.test.mjs", name: "reviewed" } },
      }, headContext)
      expect(esmHead.result.status, esmHead.artifact.text).toBe("pass")
      expectReviewed(esmHead.artifact.text, 2)
      const cjsBase = yield* ReviewProbe.run({
        candidate: "cjs", option: "probe:test", target: { test: { file: "src/cjs.test.cjs", name: "reviewed" } },
      }, baseContext)
      expect(cjsBase.result.status, cjsBase.artifact.text).toBe("pass")
      expectReviewed(cjsBase.artifact.text, 1)
      const esmBase = yield* ReviewProbe.run({
        candidate: "esm", option: "probe:test", target: { test: { file: "src/esm.test.mjs", name: "reviewed" } },
      }, baseContext)
      expect(esmBase.result.status, esmBase.artifact.text).toBe("pass")
      expectReviewed(esmBase.artifact.text, 1)
    }))
    expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
    expect(yield* Effect.promise(() => image(fixtureDir))).toEqual(template)
  }), 240_000,
)

live("anchored probe:script lookups read the reviewed workspace value, not the dirty live graft", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo(false)
    const before = yield* Effect.promise(() => image(fixture.root))
    const template = yield* Effect.promise(() => image(fixtureDir))
    const cjs = yield* Effect.promise(() => Bun.file(path.join(fixtureDir, "script-cjs.txt")).text())
    const esm = yield* Effect.promise(() => Bun.file(path.join(fixtureDir, "script-esm.txt")).text())
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD" })
      const base = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" })
      const offered = { "script-cjs": ["probe:script"], "script-esm": ["probe:script"] }
      const headContext = context(head, base, offered)
      const baseContext = context(base, head, offered)
      // Scripts stay outside the snapshot. Anchored createRequire / module URL only; bare imports are not claimed.
      const cjsHead = yield* ReviewProbe.run({
        candidate: "script-cjs", option: "probe:script", target: { script: { language: "ts", text: cjs } },
      }, headContext)
      expect(cjsHead.result.status, cjsHead.artifact.text).toBe("pass")
      expectReviewed(cjsHead.artifact.text, 2)
      const esmHead = yield* ReviewProbe.run({
        candidate: "script-esm", option: "probe:script", target: { script: { language: "ts", text: esm } },
      }, headContext)
      expect(esmHead.result.status, esmHead.artifact.text).toBe("pass")
      expectReviewed(esmHead.artifact.text, 2)
      const cjsBase = yield* ReviewProbe.run({
        candidate: "script-cjs", option: "probe:script", target: { script: { language: "ts", text: cjs } },
      }, baseContext)
      expect(cjsBase.result.status, cjsBase.artifact.text).toBe("pass")
      expectReviewed(cjsBase.artifact.text, 1)
      const esmBase = yield* ReviewProbe.run({
        candidate: "script-esm", option: "probe:script", target: { script: { language: "ts", text: esm } },
      }, baseContext)
      expect(esmBase.result.status, esmBase.artifact.text).toBe("pass")
      expectReviewed(esmBase.artifact.text, 1)
    }))
    expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
    expect(yield* Effect.promise(() => image(fixtureDir))).toEqual(template)
  }), 240_000,
)

live("a workspace present only in the live tree is refused by name before that live value is read", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo(true)
    const before = yield* Effect.promise(() => image(fixture.root))
    const template = yield* Effect.promise(() => image(fixtureDir))
    yield* Effect.scoped(Effect.gen(function* () {
      const created = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD" }).pipe(Effect.exit)
      if (Exit.isSuccess(created)) {
        const result = yield* ReviewProbe.run({
          candidate: "missing", option: "probe:test", target: { test: { file: "src/missing.test.cjs", name: "live only" } },
        }, context(created.value, created.value, { missing: ["probe:test"] }))
        const text = `${result.result.reason ?? ""}\n${result.artifact.text}`
        expect(text, text).toContain("snapshot-dependency-workspace-missing")
        expect(text, text).not.toContain("LIVE_ONLY")
      }
      if (Exit.isFailure(created)) {
        const text = JSON.stringify(created.cause)
        expect(text).toContain("snapshot-dependency-workspace-missing")
        expect(text).not.toContain("LIVE_ONLY")
      }
    }))
    expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
    expect(yield* Effect.promise(() => image(fixtureDir))).toEqual(template)
  }), 180_000,
)

live("a review snapshot exposes dependencyRoots and does not treat a missing field as optional metadata", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo(false)
    const before = yield* Effect.promise(() => image(fixture.root))
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD" })
      expect(head).toHaveProperty("dependencyRoots")
    }))
    expect(yield* Effect.promise(() => image(fixture.root))).toEqual(before)
  }), 120_000,
)

unjailed("without a jail the dependency probe is not-run, and that result is not isolation conformance", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (made) => Effect.promise(() => made[Symbol.asyncDispose]()))
    const root = path.join(dir.path, "repo")
    yield* Effect.promise(async () => {
      await mkdir(path.join(root, "src"), { recursive: true })
      await git(root, "init", "-q")
      await git(root, "config", "user.email", "probe@example.com")
      await git(root, "config", "user.name", "Probe")
      await writeFile(path.join(root, "package.json"), "{}\n")
      await writeFile(path.join(root, "bunfig.toml"), "[test]\n")
      await writeFile(path.join(root, "src", "a.test.ts"), "import { test } from \"bun:test\"\ntest(\"a\", () => {})\n")
      await git(root, "add", ".")
      await git(root, "commit", "-q", "-m", "base")
    })
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: root, revision: "HEAD" })
      const result = yield* ReviewProbe.run({
        candidate: "c1", option: "probe:test", target: { test: { file: "src/a.test.ts", name: "a" } },
      }, context(head, head, { c1: ["probe:test"] }))
      expect(result.result.status).toBe("not-run")
      expect(result.result.reason).toStartWith("sandbox-unavailable: ")
      expect(result.evidence).toBeUndefined()
    }))
  }), 120_000,
)

async function writeValue(root: string, value: number) {
  const dir = path.join(root, "packages", "workspace")
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, "package.json"), `${JSON.stringify({
    name: "@lucy/workspace",
    exports: { ".": { import: "./index.mjs", require: "./index.cjs" } },
  }, null, 2)}\n`)
  await writeFile(path.join(dir, "index.cjs"), `module.exports = { value: ${value} }\n`)
  await writeFile(path.join(dir, "index.mjs"), `export const value = ${value}\n`)
}

async function linkDependencies(root: string, liveOnly: boolean) {
  const modules = path.join(root, "node_modules")
  await linkInside(path.join(modules, "@lucy", "workspace"), path.join(root, "packages", "workspace"))
  await cp(path.join(fixtureDir, "external", "ordinary"), path.join(modules, "ordinary-external"), { recursive: true })
  await cp(path.join(fixtureDir, "external", "nested"), path.join(modules, "nested-external"), { recursive: true })
  await linkInside(
    path.join(modules, "nested-external", "node_modules", "@lucy", "workspace"),
    path.join(root, "packages", "workspace"),
  )
  if (!liveOnly) return
  const live = path.join(root, "packages", "only-live")
  await cp(path.join(fixtureDir, "external", "only-live"), live, { recursive: true })
  await linkInside(path.join(modules, "@lucy", "only-live"), live)
}

async function linkInside(from: string, target: string) {
  await mkdir(path.dirname(from), { recursive: true })
  await symlink(path.relative(path.dirname(from), target), from)
}
