import { expect } from "bun:test"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import os from "os"
import path from "path"
import { existsSync, statSync, writeSync } from "fs"
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, readdir, realpath, rm, stat, symlink, writeFile } from "fs/promises"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { FSUtil } from "../../src/fs-util"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ProbeSnapshot } from "../../src/research-toolkit/probe/snapshot"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import { Writer } from "../../src/review-toolkit/snapshot-mutation"
import { testEffect } from "../lib/effect"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
// --only-failures prints nothing until a test fails. This file was still running when the
// 8-minute step died, with no test name (run 43333229249). writeSync is not that buffer.
const rawLive = it.live
it.live = Object.assign(
  (name: string, body: Parameters<typeof rawLive>[1], opts?: Parameters<typeof rawLive>[2]) =>
    rawLive(name, () => {
      writeSync(2, `shard test ${name}\n`)
      return typeof body === "function" ? body() : body
    }, opts),
  { only: rawLive.only, skip: rawLive.skip, skipIf: rawLive.skipIf },
)

const BASE = "base-value"
const HEAD = "head-value"
const DIRTY = "dirty-value"
const LATER = "later-value"
const PATH_CAP = 32 * 1024 * 1024
const ENTRY_CAP = 100_000

const lib = (value: string) => ({
  cjs: `module.exports = { value: ${JSON.stringify(value)} }\n`,
  mjs: `export const value = ${JSON.stringify(value)}\n`,
})

const requireValue = (root: string, from: string, id: string) => {
  const loaded = createRequire(path.join(root, from))(id) as { value?: string }
  if (typeof loaded.value !== "string") throw new Error(`no value from ${from} ${id}`)
  return loaded.value
}

const importValue = async (root: string, file: string) => {
  const loaded = await import(pathToFileURL(path.join(root, file)).href) as { value?: string }
  if (typeof loaded.value !== "string") throw new Error(`no value from ${file}`)
  return loaded.value
}

async function seal(root: string) {
  const lines: string[] = []
  const walk = async (prefix: string) => {
    const entries = await readdir(path.join(root, prefix), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === ".git") continue
      const relative = path.join(prefix, entry.name)
      const abs = path.join(root, relative)
      const info = await lstat(abs)
      if (info.isSymbolicLink()) {
        lines.push(`l ${relative} ${(info.mode & 0o777).toString(8)} ${await readlink(abs)}`)
        continue
      }
      if (info.isDirectory()) {
        lines.push(`d ${relative} ${(info.mode & 0o777).toString(8)}`)
        await walk(relative)
        continue
      }
      lines.push(`f ${relative} ${(info.mode & 0o777).toString(8)} ${info.ino} ${(await readFile(abs)).toString("base64")}`)
    }
  }
  await walk("")
  return lines.sort()
}

async function gitRepo(root: string) {
  await mkdir(root, { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "shadow@example.com")
  await git(root, "config", "user.name", "Shadow")
  await writeFile(path.join(root, ".gitignore"), "node_modules\n.venv\ntarget\n")
  await writeFile(path.join(root, "package.json"), "{\"name\":\"app\"}\n")
}

async function writeMany(dir: string, count: number) {
  await mkdir(dir, { recursive: true })
  for (let start = 0; start < count; start += 64) {
    await Promise.all(Array.from({ length: Math.min(64, count - start) }, (_, offset) =>
      writeFile(path.join(dir, `f${start + offset}`), "")))
  }
}

function crossDeviceHost(from: string) {
  try {
    const dev = statSync(from).dev
    for (const candidate of ["/dev/shm", process.cwd(), os.tmpdir()]) {
      try {
        if (statSync(candidate).dev !== dev) return candidate
      } catch { /* not a second volume */ }
    }
  } catch {
    return undefined
  }
  return undefined
}

async function otherDevice(from: string) {
  const dev = (await stat(from)).dev
  for (const candidate of ["/dev/shm", process.cwd(), os.tmpdir()]) {
    const info = await stat(candidate).catch(() => undefined)
    if (info && info.dev !== dev) return candidate
  }
  return undefined
}

// EXDEV needs two volumes. Linux fails closed if it skips; Mac and Windows may skip. Shared-inode checks still run.
const hardlinkHost = crossDeviceHost(os.tmpdir())
const hardlinkRuns = Boolean(hardlinkHost) || process.platform === "linux"
const hardlink = hardlinkRuns ? it.live : it.live.skip
const hardlinkTitle = hardlinkRuns
  ? "cross-device hardlink failure is a named refusal and does not copy dependency bytes"
  : "cross-device hardlink failure unsupported: snapshot-dependency-hardlink-unavailable no second volume; physical EXDEV UNEXERCISED"

const owned = () => Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
)

/** Direct and third-party CJS/ESM, nested lookup, ordinary package, and a relative .bin. */
const workspace = Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await gitRepo(root)
  const base = lib(BASE)
  await mkdir(path.join(root, "packages", "lib"), { recursive: true })
  await mkdir(path.join(root, "packages", "app"), { recursive: true })
  await writeFile(path.join(root, "packages", "lib", "package.json"), JSON.stringify({
    name: "@ws/lib", main: "./index.cjs",
    exports: { ".": { require: "./index.cjs", import: "./index.mjs", default: "./index.cjs" } },
  }))
  await writeFile(path.join(root, "packages", "lib", "index.cjs"), base.cjs)
  await writeFile(path.join(root, "packages", "lib", "index.mjs"), base.mjs)
  await writeFile(path.join(root, "packages", "app", "package.json"), "{\"name\":\"@ws/app\"}\n")
  await writeFile(path.join(root, "packages", "app", "index.cjs"), "module.exports = require(\"@ws/lib\")\n")
  await writeFile(path.join(root, "packages", "app", "index.mjs"), "export { value } from \"@ws/lib\"\n")
  await symlink(path.join("..", "..", "node_modules", "@ws", "lib"), path.join(root, "packages", "app", "via"))
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  const head = lib(HEAD)
  await writeFile(path.join(root, "packages", "lib", "index.cjs"), head.cjs)
  await writeFile(path.join(root, "packages", "lib", "index.mjs"), head.mjs)
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "head")
  const dirty = lib(DIRTY)
  await writeFile(path.join(root, "packages", "lib", "index.cjs"), dirty.cjs)
  await writeFile(path.join(root, "packages", "lib", "index.mjs"), dirty.mjs)
  await mkdir(path.join(root, "node_modules", "@ws"), { recursive: true })
  await mkdir(path.join(root, "node_modules", "third", "node_modules", "inner"), { recursive: true })
  await mkdir(path.join(root, "node_modules", "third", "node_modules", "walker"), { recursive: true })
  await mkdir(path.join(root, "node_modules", "third", "node_modules", "@ws"), { recursive: true })
  await mkdir(path.join(root, "node_modules", "third", "bin"), { recursive: true })
  await mkdir(path.join(root, "node_modules", "ordinary"), { recursive: true })
  await mkdir(path.join(root, "packages", "app", "node_modules", "@ws"), { recursive: true })
  await symlink(path.join("..", "..", "packages", "lib"), path.join(root, "node_modules", "@ws", "lib"))
  await symlink(path.join("..", "..", "..", "lib"), path.join(root, "packages", "app", "node_modules", "@ws", "lib"))
  await symlink(path.join("..", "..", "..", "..", "packages", "lib"), path.join(root, "node_modules", "third", "node_modules", "@ws", "lib"))
  await writeFile(path.join(root, "node_modules", "third", "package.json"), "{\"name\":\"third\"}\n")
  await writeFile(path.join(root, "node_modules", "third", "index.cjs"), "module.exports = require(\"@ws/lib\")\n")
  await writeFile(path.join(root, "node_modules", "third", "index.mjs"), "export { value } from \"@ws/lib\"\n")
  await writeFile(path.join(root, "node_modules", "third", "rel.cjs"), "module.exports = require(\"../../packages/lib/index.cjs\")\n")
  await writeFile(path.join(root, "node_modules", "third", "node_modules", "inner", "index.cjs"), "module.exports = require(\"@ws/lib\")\n")
  await writeFile(path.join(root, "node_modules", "third", "node_modules", "walker", "index.cjs"), "module.exports = require(\"@ws/lib\")\n")
  await writeFile(path.join(root, "node_modules", "ordinary", "index.cjs"), "module.exports = { value: \"ordinary\" }\n")
  await writeFile(path.join(root, "node_modules", "third", "bin", "tool.js"), "#!/usr/bin/env node\nprocess.stdout.write(\"bin-ok\\n\")\n")
  if (process.platform !== "win32") await chmod(path.join(root, "node_modules", "third", "bin", "tool.js"), 0o755)
  await mkdir(path.join(root, "node_modules", ".bin"), { recursive: true })
  await symlink(path.join("..", "third", "bin", "tool.js"), path.join(root, "node_modules", ".bin", "tool"))
  return { dir, root }
}), (fixture) => Effect.promise(() => fixture.dir[Symbol.asyncDispose]()))

it.live("direct and transitive CJS/ESM resolution selects the reviewed snapshot, not the dirty live tree", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* workspace
    const before = yield* Effect.promise(() => seal(fixture.root))
    yield* Effect.scoped(Effect.gen(function* () {
      const attempted = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD~1" }).pipe(Effect.result)
      if (attempted._tag === "Failure") {
        expect(process.platform).toBe("win32")
        expect(attempted.failure.reason).toMatch(/^snapshot-dependency-(layout-unsupported|hardlink-failed|path-outside):/)
        return
      }
      const base = attempted.success
      const head = yield* ReviewScratch.create({ worktree: fixture.root, revision: "HEAD" })
      const live = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const copies = [base, head, live]
      for (const copy of copies) {
        expect((yield* Effect.promise(() => lstat(path.join(copy.root, "node_modules")))).isSymbolicLink()).toBe(false)
        expect((yield* Effect.promise(() => readlink(path.join(copy.root, "node_modules", "@ws", "lib")))).replaceAll("\\", "/")).toBe("../../packages/lib")
        expect(yield* Effect.promise(() => realpath(path.join(copy.root, "node_modules", "@ws", "lib")))).toBe(path.join(copy.root, "packages", "lib"))
      }
      const rel = (copy: ReviewScratch.Snapshot) => createRequire(path.join(copy.root, "package.json"))(
        path.join(copy.root, "node_modules", "third", "rel.cjs"),
      ).value as string
      expect(requireValue(base.root, "packages/app/index.cjs", "@ws/lib")).toBe(BASE)
      expect(requireValue(base.root, "node_modules/third/index.cjs", "@ws/lib")).toBe(BASE)
      expect(requireValue(base.root, "node_modules/third/node_modules/inner/index.cjs", "@ws/lib")).toBe(BASE)
      expect(requireValue(base.root, "node_modules/third/node_modules/walker/index.cjs", "@ws/lib")).toBe(BASE)
      expect(rel(base)).toBe(BASE)
      expect(yield* Effect.promise(() => importValue(base.root, "packages/app/index.mjs"))).toBe(BASE)
      expect(yield* Effect.promise(() => importValue(base.root, "node_modules/third/index.mjs"))).toBe(BASE)
      expect(requireValue(head.root, "packages/app/index.cjs", "@ws/lib")).toBe(HEAD)
      expect(requireValue(head.root, "node_modules/third/node_modules/inner/index.cjs", "@ws/lib")).toBe(HEAD)
      expect(rel(head)).toBe(HEAD)
      expect(yield* Effect.promise(() => importValue(head.root, "node_modules/third/index.mjs"))).toBe(HEAD)
      expect(requireValue(live.root, "packages/app/index.cjs", "@ws/lib")).toBe(DIRTY)
      expect(requireValue(live.root, "node_modules/third/index.cjs", "@ws/lib")).toBe(DIRTY)
      expect(yield* Effect.promise(() => importValue(live.root, "packages/app/index.mjs"))).toBe(DIRTY)
      expect(requireValue(base.root, "package.json", path.join(base.root, "node_modules", "ordinary", "index.cjs"))).toBe("ordinary")
      const ordinary = path.join(fixture.root, "node_modules", "ordinary", "index.cjs")
      const shadow = path.join(base.root, "node_modules", "ordinary", "index.cjs")
      const sourceStat = yield* Effect.promise(() => stat(ordinary))
      const shadowStat = yield* Effect.promise(() => stat(shadow))
      expect(shadowStat.ino).toBe(sourceStat.ino)
      expect(shadowStat.dev).toBe(sourceStat.dev)
      expect(shadowStat.nlink).toBeGreaterThanOrEqual(2)
      expect(base.dependencyRoots.some((root) => FSUtil.contains(root, shadow))).toBe(true)
      expect(base.files).toBeLessThan(20)
      const bin = path.join(base.root, "node_modules", ".bin", "tool")
      expect((yield* Effect.promise(() => readlink(bin))).replaceAll("\\", "/")).toBe("../third/bin/tool.js")
      expect(yield* Effect.promise(() => realpath(bin))).toBe(path.join(base.root, "node_modules", "third", "bin", "tool.js"))
      if (process.platform !== "win32") expect((yield* Effect.promise(() => lstat(path.join(base.root, "node_modules", "third", "bin", "tool.js")))).mode & 0o777).toBe(0o755)
      const ran = yield* ResearchProcess.run({
        command: process.execPath, args: [bin], cwd: base.root, env: ResearchProcess.environment(), timeoutMs: 30_000, maxBytes: 1024 * 1024,
      })
      expect(ran.stdout.data.toString("utf8")).toContain("bin-ok")
      yield* Effect.promise(() => writeFile(path.join(fixture.root, "packages", "lib", "index.cjs"), lib(LATER).cjs))
      yield* Effect.promise(() => writeFile(path.join(fixture.root, "packages", "lib", "index.mjs"), lib(LATER).mjs))
      expect(requireValue(base.root, "node_modules/third/index.cjs", "@ws/lib")).toBe(BASE)
      expect(requireValue(head.root, "packages/app/index.cjs", "@ws/lib")).toBe(HEAD)
      expect(rel(live)).toBe(DIRTY)
      expect(yield* Effect.promise(() => readFile(path.join(base.root, "packages", "lib", "index.cjs"), "utf8"))).toBe(lib(BASE).cjs)
      const refused = yield* ReviewScratch.resolve(base, "packages/app/via/index.cjs").pipe(Effect.flip)
      expect(refused.reason).toBe("scratch-path-outside: packages/app/via/index.cjs")
      const missing = yield* ReviewScratch.resolve(base, "node_modules/@ws/lib/missing.js").pipe(Effect.flip)
      expect(missing.reason).toBe("scratch-path-outside: node_modules/@ws/lib/missing.js")
    }))
    yield* Effect.promise(() => writeFile(path.join(fixture.root, "packages", "lib", "index.cjs"), lib(DIRTY).cjs))
    yield* Effect.promise(() => writeFile(path.join(fixture.root, "packages", "lib", "index.mjs"), lib(DIRTY).mjs))
    expect(yield* Effect.promise(() => seal(fixture.root))).toEqual(before)
  }), 180_000,
)

it.live("a workspace present only in the live tree is a named missing refusal, never a live fallback", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* owned()
    const root = path.join(dir.path, "repo")
    yield* Effect.promise(async () => {
      await gitRepo(root)
      await writeFile(path.join(root, "README.md"), "reviewed\n")
      await git(root, "add", ".")
      await git(root, "commit", "-q", "-m", "base")
      await mkdir(path.join(root, "packages", "only-live"), { recursive: true })
      await writeFile(path.join(root, "packages", "only-live", "index.cjs"), "module.exports = { value: \"live-only\" }\n")
      await mkdir(path.join(root, "node_modules", "@ws"), { recursive: true })
      await symlink(path.join("..", "..", "packages", "only-live"), path.join(root, "node_modules", "@ws", "only-live"))
    })
    const before = yield* Effect.promise(() => seal(root))
    const missing = yield* ReviewScratch.create({ worktree: root, revision: "HEAD" }).pipe(Effect.scoped, Effect.flip)
    expect(missing.reason).toBe("snapshot-dependency-workspace-missing: packages/only-live")
    yield* Effect.scoped(Effect.gen(function* () {
      const live = yield* ReviewScratch.create({ worktree: root, tree: true })
      expect(requireValue(live.root, "package.json", "@ws/only-live")).toBe("live-only")
      expect(yield* Effect.promise(() => realpath(path.join(live.root, "node_modules", "@ws", "only-live")))).toBe(path.join(live.root, "packages", "only-live"))
    }))
    expect(yield* Effect.promise(() => seal(root))).toEqual(before)
  }), 120_000,
)

it.live("an unreadable dependency candidate is layout-unsupported, a missing root is not", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* owned()
    const root = path.join(dir.path, "repo")
    const app = path.join(root, "packages", "app")
    const candidate = path.join(app, "node_modules")
    const scratch = path.join(dir.path, "scratch")
    const missingRoot = path.join(dir.path, "missing-root")
    const missingScratch = path.join(dir.path, "missing-scratch")
    yield* Effect.promise(async () => {
      await gitRepo(root)
      await mkdir(path.join(app, "node_modules", "dep"), { recursive: true })
      await writeFile(path.join(root, "packages", "app", "package.json"), "{\"name\":\"app\"}\n")
      await writeFile(path.join(app, "node_modules", "dep", "index.js"), "owned-dep\n")
      await writeFile(path.join(root, "README.md"), "reviewed\n")
      await git(root, "add", ".")
      await git(root, "commit", "-q", "-m", "base")
      await gitRepo(missingRoot)
      await writeFile(path.join(missingRoot, "README.md"), "reviewed\n")
      await git(missingRoot, "add", ".")
      await git(missingRoot, "commit", "-q", "-m", "base")
      await mkdir(scratch)
      await mkdir(missingScratch)
    })
    const before = yield* Effect.promise(() => seal(root))
    const mode = (yield* Effect.promise(() => lstat(app))).mode & 0o777
    yield* Effect.promise(() => chmod(app, 0o000))
    yield* Effect.gen(function* () {
      const probe = yield* Effect.promise(() => lstat(candidate).then(() => "readable", (error: { code?: string }) => error.code ?? "unknown"))
      if (probe !== "EACCES") {
        if (process.platform !== "win32") return yield* Effect.die(new Error(`snapshot-dependency-unreadable-unsupported: ${probe}`))
      } else {
        const error = yield* ProbeSnapshot.create({
          worktree: root, snapshot: { kind: "commit", revision: "HEAD" }, scratch, maxBytes: 1024 * 1024,
        }).pipe(Effect.flip)
        expect(error.reason).toBe("snapshot-dependency-layout-unsupported: packages/app/node_modules EACCES")
      }
    }).pipe(Effect.ensuring(Effect.promise(() => chmod(app, mode))))
    expect(yield* Effect.promise(() => seal(root))).toEqual(before)
    const copy = yield* ProbeSnapshot.create({
      worktree: missingRoot, snapshot: { kind: "commit", revision: "HEAD" }, scratch: missingScratch, maxBytes: 1024 * 1024,
    })
    expect(copy.dependencyRoots).toEqual([])
  }), 120_000,
)

/** One attack symlink only. Ordinary package and relative .bin stay inside the closure. */
function refuseOneOutside(name: string, attack: string, plant: (paths: { root: string; sibling: string; external: string }) => Promise<void>) {
  it.live(name, () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const dir = yield* owned()
      const root = path.join(dir.path, "repo")
      const sibling = path.join(dir.path, "sibling-worktree")
      const external = path.join(dir.path, "external")
      const good = path.join(dir.path, "good")
      const scratch = path.join(dir.path, "scratch")
      yield* Effect.promise(async () => {
        await gitRepo(root)
        await mkdir(path.join(root, "packages", "lib"), { recursive: true })
        await writeFile(path.join(root, "packages", "lib", "index.cjs"), "module.exports = { value: \"reviewed\" }\n")
        await writeFile(path.join(root, "README.md"), "reviewed\n")
        await git(root, "add", ".")
        await git(root, "commit", "-q", "-m", "base")
        await mkdir(path.join(sibling, "packages", "ws"), { recursive: true })
        await mkdir(path.join(sibling, "packages", "other"), { recursive: true })
        await writeFile(path.join(sibling, "packages", "ws", "index.cjs"), "module.exports = { value: \"sibling-ws\" }\n")
        await writeFile(path.join(sibling, "packages", "other", "index.cjs"), "module.exports = { value: \"sibling-other\" }\n")
        if (process.platform !== "win32") {
          await chmod(path.join(sibling, "packages", "ws", "index.cjs"), 0o640)
          await chmod(path.join(sibling, "packages", "other", "index.cjs"), 0o604)
        }
        await mkdir(external, { recursive: true })
        await mkdir(path.join(root, "node_modules", "ordinary", "bin"), { recursive: true })
        await mkdir(path.join(root, "node_modules", ".bin"), { recursive: true })
        await writeFile(path.join(root, "node_modules", "ordinary", "index.cjs"), "module.exports = { value: \"ordinary\" }\n")
        await writeFile(path.join(root, "node_modules", "ordinary", "bin", "tool.js"), "#!/usr/bin/env node\nprocess.stdout.write(\"bin-ok\\n\")\n")
        await symlink(path.join("..", "ordinary", "bin", "tool.js"), path.join(root, "node_modules", ".bin", "tool"))
        await plant({ root, sibling, external })
        await gitRepo(good)
        await writeFile(path.join(good, "README.md"), "clean\n")
        await git(good, "add", ".")
        await git(good, "commit", "-q", "-m", "base")
        await mkdir(scratch)
      })
      const beforeRepo = yield* Effect.promise(() => seal(root))
      const beforeSibling = yield* Effect.promise(() => seal(sibling))
      const beforeExternal = yield* Effect.promise(() => seal(external))
      const error = yield* ProbeSnapshot.create({
        worktree: root, snapshot: { kind: "worktree" }, scratch, maxBytes: 1024 * 1024,
      }).pipe(Effect.flip)
      expect(error.reason).toBe(`snapshot-dependency-path-outside: ${attack}`)
      expect(yield* Effect.promise(() => lstat(path.join(scratch, "snapshot", "node_modules")).then(() => true, () => false))).toBe(false)
      const seen: string[] = []
      const scoped = yield* Effect.scoped(Effect.gen(function* () {
        const copy = yield* ReviewScratch.create({ worktree: good, revision: "HEAD" })
        seen.push(copy.scratch)
        return yield* ReviewScratch.create({ worktree: root, revision: "HEAD" })
      })).pipe(Effect.flip)
      expect(scoped.reason).toBe(`snapshot-dependency-path-outside: ${attack}`)
      expect(seen.map((item) => existsSync(item))).toEqual([false])
      expect(yield* Effect.promise(() => seal(root))).toEqual(beforeRepo)
      expect(yield* Effect.promise(() => seal(sibling))).toEqual(beforeSibling)
      expect(yield* Effect.promise(() => seal(external))).toEqual(beforeExternal)
      yield* Effect.promise(() => rm(scratch, { recursive: true, force: true }))
      expect(existsSync(scratch)).toBe(false)
    }), 120_000,
  )
}

it.live("a live parent symlink in front of a historical package.json is path-outside before sharing", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* owned()
    const root = path.join(dir.path, "repo")
    const external = path.join(dir.path, "external-app")
    const leaked = path.join(external, "node_modules", "leaked", "index.js")
    const scratch = path.join(dir.path, "scratch")
    yield* Effect.promise(async () => {
      await gitRepo(root)
      await mkdir(path.join(root, "packages", "app"), { recursive: true })
      await writeFile(path.join(root, "packages", "app", "package.json"), "{\"name\":\"app\"}\n")
      await writeFile(path.join(root, "README.md"), "reviewed\n")
      await git(root, "add", ".")
      await git(root, "commit", "-q", "-m", "base")
      await mkdir(path.join(external, "node_modules", "leaked"), { recursive: true })
      await writeFile(leaked, "external-live\n")
      if (process.platform !== "win32") await chmod(leaked, 0o640)
      await rm(path.join(root, "packages", "app"), { recursive: true })
      await symlink(external, path.join(root, "packages", "app"))
      await mkdir(path.join(root, "node_modules", "ordinary"), { recursive: true })
      await writeFile(path.join(root, "node_modules", "ordinary", "index.cjs"), "module.exports = { value: \"ordinary\" }\n")
      await mkdir(scratch)
    })
    const before = yield* Effect.promise(() => seal(external))
    const error = yield* ProbeSnapshot.create({
      worktree: root, snapshot: { kind: "commit", revision: "HEAD" }, scratch, maxBytes: 1024 * 1024,
    }).pipe(Effect.flip)
    expect(error.reason).toBe("snapshot-dependency-path-outside: packages/app/node_modules")
    expect(yield* Effect.promise(() => lstat(path.join(scratch, "snapshot", "node_modules", "leaked", "index.js")).then(() => true, () => false))).toBe(false)
    expect(yield* Effect.promise(() => seal(external))).toEqual(before)
    const scoped = yield* Effect.scoped(ReviewScratch.create({ worktree: root, revision: "HEAD" })).pipe(Effect.flip)
    expect(scoped.reason).toBe("snapshot-dependency-path-outside: packages/app/node_modules")
    yield* Effect.promise(() => rm(scratch, { recursive: true, force: true }))
    expect(existsSync(scratch)).toBe(false)
  }), 120_000,
)

it.live("a committed node_modules symlink is path-outside and does not return a snapshot", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* owned()
    const root = path.join(dir.path, "repo")
    const external = path.join(dir.path, "external-modules")
    const leaked = path.join(external, "index.js")
    const scratch = path.join(dir.path, "scratch")
    yield* Effect.promise(async () => {
      await gitRepo(root)
      await writeFile(path.join(root, "README.md"), "reviewed\n")
      await git(root, "add", ".")
      await git(root, "commit", "-q", "-m", "base")
      await mkdir(external, { recursive: true })
      await writeFile(leaked, "external-root\n")
      if (process.platform !== "win32") await chmod(leaked, 0o604)
      await symlink(external, path.join(root, "node_modules"))
      await git(root, "add", "-f", "--", "node_modules")
      await git(root, "commit", "-q", "-m", "symlink root")
      await mkdir(scratch)
    })
    const before = yield* Effect.promise(() => seal(external))
    const linkBefore = yield* Effect.promise(() => readlink(path.join(root, "node_modules")))
    const error = yield* ProbeSnapshot.create({
      worktree: root, snapshot: { kind: "commit", revision: "HEAD" }, scratch, maxBytes: 1024 * 1024,
    }).pipe(Effect.flip)
    expect(error.reason).toBe("snapshot-dependency-path-outside: node_modules")
    expect(yield* Effect.promise(() => readlink(path.join(root, "node_modules")))).toBe(linkBefore)
    expect(yield* Effect.promise(() => seal(external))).toEqual(before)
    const scoped = yield* Effect.scoped(ReviewScratch.create({ worktree: root, revision: "HEAD" })).pipe(Effect.flip)
    expect(scoped.reason).toBe("snapshot-dependency-path-outside: node_modules")
    yield* Effect.promise(() => rm(scratch, { recursive: true, force: true }))
    expect(existsSync(scratch)).toBe(false)
  }), 120_000,
)

refuseOneOutside("absolute sibling worktree node_modules/ws is refused before publish", "node_modules/ws", async ({ root, sibling }) => {
  await symlink(path.join(sibling, "packages", "ws"), path.join(root, "node_modules", "ws"))
})

refuseOneOutside("external third backlink node_modules/third is refused before publish", "node_modules/third", async ({ root, sibling, external }) => {
  await mkdir(path.join(external, "third", "node_modules"), { recursive: true })
  await writeFile(path.join(external, "third", "index.cjs"), "module.exports = require(\"other\")\n")
  await symlink(path.join(sibling, "packages", "other"), path.join(external, "third", "node_modules", "other"))
  await symlink(path.join(external, "third"), path.join(root, "node_modules", "third"))
})

refuseOneOutside("external reentry node_modules/reentry is refused before publish", "node_modules/reentry", async ({ root, external }) => {
  await symlink(path.join(root, "packages", "lib"), path.join(external, "gate"))
  await symlink(path.join(external, "gate"), path.join(root, "node_modules", "reentry"))
})

it.live("escapes, cycles, link depth and sibling prefixes are named refusals and do not graft the live tree", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* owned()
    const cases = [
      { name: "parent", link: ["..", "..", "..", "secret"], reason: "snapshot-dependency-path-outside" },
      { name: "up-sibling", link: ["..", "..", "..", "outside-sibling", "secret.txt"], reason: "snapshot-dependency-path-outside" },
      { name: "cycle", cycle: true, reason: "snapshot-dependency-cycle" },
      { name: "depth", depth: 41, reason: "snapshot-dependency-link-depth" },
    ] as const
    yield* Effect.forEach(cases, (item) => Effect.gen(function* () {
      const root = path.join(dir.path, item.name)
      const scratch = path.join(dir.path, `${item.name}-scratch`)
      yield* Effect.promise(async () => {
        await gitRepo(root)
        await writeFile(path.join(root, "README.md"), "reviewed\n")
        await git(root, "add", ".")
        await git(root, "commit", "-q", "-m", "base")
        await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true })
        await writeFile(path.join(root, "node_modules", "pkg", "index.cjs"), "module.exports = 1\n")
        await mkdir(path.join(dir.path, "outside-sibling"), { recursive: true })
        await writeFile(path.join(dir.path, "outside-sibling", "secret.txt"), "nope\n")
        if ("cycle" in item) {
          await symlink("b", path.join(root, "node_modules", "a"))
          await symlink("a", path.join(root, "node_modules", "b"))
        } else if ("depth" in item) {
          await linkChain(root, item.depth)
        } else {
          await symlink(path.join(...item.link), path.join(root, "node_modules", "pkg", "escape"))
        }
        await mkdir(scratch)
      })
      const before = yield* Effect.promise(() => seal(root))
      const error = yield* ProbeSnapshot.create({
        worktree: root, snapshot: { kind: "worktree" }, scratch, maxBytes: 1024 * 1024,
      }).pipe(Effect.flip)
      expect(error.reason.startsWith(`${item.reason}:`)).toBe(true)
      const grafted = yield* Effect.promise(() => lstat(path.join(scratch, "snapshot", "node_modules")).catch(() => undefined))
      expect(grafted?.isSymbolicLink() ?? false).toBe(false)
      expect(yield* Effect.promise(() => seal(root))).toEqual(before)
    }))
    const boundary = path.join(dir.path, "depth40")
    const scratch = path.join(dir.path, "depth40-scratch")
    yield* Effect.promise(async () => {
      await gitRepo(boundary)
      await writeFile(path.join(boundary, "README.md"), "reviewed\n")
      await git(boundary, "add", ".")
      await git(boundary, "commit", "-q", "-m", "base")
      await mkdir(path.join(boundary, "node_modules", "pkg"), { recursive: true })
      await linkChain(boundary, 40)
      await mkdir(scratch)
    })
    const copy = yield* ProbeSnapshot.create({
      worktree: boundary, snapshot: { kind: "worktree" }, scratch, maxBytes: 1024 * 1024,
    })
    expect(copy.dependencyRoots.some((root) => FSUtil.contains(root, path.join(copy.root, "node_modules", "pkg", "index.cjs")))).toBe(true)
  }), 180_000,
)

// About 100,000 files and a 10-minute budget. That cannot finish inside the 8-minute Windows
// step; the file was still running when the step died (run 43333229249). Linux still runs it.
const caps = process.platform === "win32" ? it.live.skip : it.live
caps("entry, path-byte and shared caps are inclusive, and an alias does not reset or double-count the budget", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* owned()
    const exact = yield* Effect.promise(() => cappedRepo(path.join(dir.path, "entries"), ENTRY_CAP - 1))
    const scratch = path.join(dir.path, "entries-scratch")
    yield* Effect.promise(() => mkdir(scratch))
    const before = yield* Effect.promise(() => readFile(path.join(exact, "node_modules", "f0")))
    const made = yield* ProbeSnapshot.create({
      worktree: exact, snapshot: { kind: "worktree" }, scratch, maxBytes: 1024 * 1024,
    })
    expect(made.dependencyRoots.length).toBe(1)
    yield* Effect.promise(() => writeFile(path.join(exact, "node_modules", "overflow"), ""))
    const overScratch = path.join(dir.path, "entries-over")
    yield* Effect.promise(() => mkdir(overScratch))
    const overrun = yield* ProbeSnapshot.create({
      worktree: exact, snapshot: { kind: "worktree" }, scratch: overScratch, maxBytes: 1024 * 1024,
    }).pipe(Effect.flip)
    expect(overrun.reason.startsWith("snapshot-dependency-cap:")).toBe(true)
    expect(overrun.reason).toContain("entries=100001")
    expect(yield* Effect.promise(() => readFile(path.join(exact, "node_modules", "f0")))).toEqual(before)

    const shared = path.join(dir.path, "shared")
    yield* Effect.promise(async () => {
      await cappedRepo(shared, 49999)
      await writeMany(path.join(shared, ".venv"), 49999)
    })
    const sharedScratch = path.join(dir.path, "shared-scratch")
    yield* Effect.promise(() => mkdir(sharedScratch))
    const sharedCopy = yield* ProbeSnapshot.create({
      worktree: shared, snapshot: { kind: "worktree" }, scratch: sharedScratch, maxBytes: 1024 * 1024,
    })
    expect(sharedCopy.dependencyRoots.length).toBe(2)
    yield* Effect.promise(() => writeFile(path.join(shared, ".venv", "overflow"), ""))
    const sharedOverScratch = path.join(dir.path, "shared-over")
    yield* Effect.promise(() => mkdir(sharedOverScratch))
    const sharedOver = yield* ProbeSnapshot.create({
      worktree: shared, snapshot: { kind: "worktree" }, scratch: sharedOverScratch, maxBytes: 1024 * 1024,
    }).pipe(Effect.flip)
    expect(sharedOver.reason.startsWith("snapshot-dependency-cap:")).toBe(true)

    const alias = path.join(dir.path, "alias")
    yield* Effect.promise(async () => {
      await cappedRepo(alias, 0)
      await writeMany(path.join(alias, "node_modules", "pkg"), 50_000)
      await symlink("pkg", path.join(alias, "node_modules", "alias"))
    })
    const aliasScratch = path.join(dir.path, "alias-scratch")
    yield* Effect.promise(() => mkdir(aliasScratch))
    const aliased = yield* ProbeSnapshot.create({
      worktree: alias, snapshot: { kind: "worktree" }, scratch: aliasScratch, maxBytes: 1024 * 1024,
    })
    expect(aliased.dependencyRoots.length).toBe(1)

    const paths = yield* Effect.promise(() => pathCapRepo(path.join(dir.path, "paths")))
    const pathScratch = path.join(dir.path, "paths-scratch")
    yield* Effect.promise(() => mkdir(pathScratch))
    const pathed = yield* ProbeSnapshot.create({
      worktree: paths, snapshot: { kind: "worktree" }, scratch: pathScratch, maxBytes: 1024 * 1024,
    })
    expect(pathed.files).toBeGreaterThan(0)
    yield* Effect.promise(() => writeFile(path.join(paths, "node_modules", "overflow-byte"), ""))
    const pathOverScratch = path.join(dir.path, "paths-over")
    yield* Effect.promise(() => mkdir(pathOverScratch))
    const pathOver = yield* ProbeSnapshot.create({
      worktree: paths, snapshot: { kind: "worktree" }, scratch: pathOverScratch, maxBytes: 1024 * 1024,
    }).pipe(Effect.flip)
    expect(pathOver.reason.startsWith("snapshot-dependency-cap:")).toBe(true)
    expect(pathOver.reason).toContain("pathBytes=")
  }), 600_000,
)

async function linkChain(root: string, hops: number) {
  await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true })
  await writeFile(path.join(root, "node_modules", "pkg", "index.cjs"), "module.exports = 1\n")
  await symlink(path.join("pkg", "index.cjs"), path.join(root, "node_modules", "h0"))
  for (let hop = 1; hop < hops; hop++) await symlink(`h${hop - 1}`, path.join(root, "node_modules", `h${hop}`))
}

async function cappedRepo(root: string, files: number) {
  await gitRepo(root)
  await writeFile(path.join(root, "README.md"), "reviewed\n")
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  if (files > 0) await writeMany(path.join(root, "node_modules"), files)
  else await mkdir(path.join(root, "node_modules"), { recursive: true })
  return root
}

async function pathCapRepo(root: string) {
  await cappedRepo(root, 0)
  const entries = ["node_modules"]
  let sum = Buffer.byteLength("node_modules")
  let directories = 0
  let filesInDirectory = 0
  const component = 180
  while (PATH_CAP - sum > 14) {
    const room = PATH_CAP - sum
    if (filesInDirectory === 0 || filesInDirectory >= 20) {
      const dir = `node_modules/${String(directories).padEnd(component, "d")}`
      const file = `${dir}/${"0".padEnd(component, "f")}`
      const next = Buffer.byteLength(dir) + Buffer.byteLength(file)
      if (next > room) break
      if (room - next > 0 && room - next < 14) break
      entries.push(dir, file)
      sum += next
      directories += 1
      filesInDirectory = 1
      continue
    }
    const dir = `node_modules/${String(directories - 1).padEnd(component, "d")}`
    const file = `${dir}/${String(filesInDirectory).padEnd(component, "f")}`
    const next = Buffer.byteLength(file)
    if (next > room) break
    if (room - next > 0 && room - next < 14) break
    entries.push(file)
    sum += next
    filesInDirectory += 1
  }
  let pad = 0
  let room = PATH_CAP - sum
  while (room > 0) {
    let use = Math.min(268, room)
    const leftover = room - use
    if (leftover > 0 && leftover < 14) use = room - 14
    if (use < 14 || use > 268) throw new Error(`path cap remainder ${room} cannot be tiled`)
    entries.push(`node_modules/${String(pad).padEnd(use - 13, "p")}`)
    sum += use
    room -= use
    pad += 1
  }
  if (sum !== PATH_CAP) throw new Error(`path fixture sum ${sum} != ${PATH_CAP}`)
  if (entries.length > 100_000) throw new Error(`path fixture entries ${entries.length}`)
  for (const relative of entries) {
    if (Buffer.byteLength(relative) > 400) throw new Error(`path fixture relative ${Buffer.byteLength(relative)} exceeds bound`)
    for (const part of relative.split("/")) if (Buffer.byteLength(part) > 255) throw new Error(`path fixture component ${Buffer.byteLength(part)}`)
    if (relative === "node_modules") continue
    const parts = relative.split("/")
    const abs = path.join(root, ...parts)
    if (parts.length === 2 && parts[1].includes("d") && !parts[1].includes("p")) {
      await mkdir(abs, { recursive: true })
      continue
    }
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, "")
  }
  return root
}

it.live("editable loaders aimed at the repository are refused; a non-repository pth is hardlinked unchanged", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* owned()
    const root = path.join(dir.path, "repo")
    yield* Effect.promise(async () => {
      await gitRepo(root)
      await mkdir(path.join(root, "packages", "lib"), { recursive: true })
      await writeFile(path.join(root, "packages", "lib", "index.py"), "value = 'live'\n")
      await writeFile(path.join(root, "README.md"), "reviewed\n")
      await git(root, "add", ".")
      await git(root, "commit", "-q", "-m", "base")
      await mkdir(path.join(root, ".venv", "lib"), { recursive: true })
      await writeFile(path.join(root, ".venv", "lib", "pkg.egg-link"), `${path.join(root, "packages", "lib")}\n.`)
      await writeFile(path.join(root, ".venv", "lib", "safe.pth"), "/usr/lib/python\n")
    })
    const before = yield* Effect.promise(() => readFile(path.join(root, ".venv", "lib", "pkg.egg-link"), "utf8"))
    const error = yield* ReviewScratch.create({ worktree: root, revision: "HEAD" }).pipe(Effect.scoped, Effect.flip)
    expect(error.reason).toBe("snapshot-dependency-layout-unsupported: .venv/lib/pkg.egg-link")
    expect(yield* Effect.promise(() => readFile(path.join(root, ".venv", "lib", "pkg.egg-link"), "utf8"))).toBe(before)
    yield* Effect.promise(() => rm(path.join(root, ".venv", "lib", "pkg.egg-link")))
    yield* Effect.scoped(Effect.gen(function* () {
      const copy = yield* ReviewScratch.create({ worktree: root, revision: "HEAD" })
      const shadow = path.join(copy.root, ".venv", "lib", "safe.pth")
      const source = path.join(root, ".venv", "lib", "safe.pth")
      expect((yield* Effect.promise(() => stat(shadow))).ino).toBe((yield* Effect.promise(() => stat(source))).ino)
      expect(yield* Effect.promise(() => readFile(shadow, "utf8"))).toBe("/usr/lib/python\n")
    }))
  }), 120_000,
)

it.live("a reviewed path occupying a dependency root is a conflict, not an overwrite", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* owned()
    const root = path.join(dir.path, "repo")
    const scratch = path.join(dir.path, "scratch")
    yield* Effect.promise(async () => {
      await gitRepo(root)
      await writeFile(path.join(root, "node_modules"), "reviewed-file\n")
      await git(root, "add", "-f", "--", "node_modules")
      await git(root, "commit", "-q", "-m", "file")
      await rm(path.join(root, "node_modules"))
      await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true })
      await writeFile(path.join(root, "node_modules", "pkg", "index.js"), "live\n")
      await mkdir(scratch)
    })
    const error = yield* ProbeSnapshot.create({
      worktree: root, snapshot: { kind: "commit", revision: "HEAD" }, scratch, maxBytes: 1024 * 1024,
    }).pipe(Effect.flip)
    expect(error.reason).toBe("snapshot-dependency-layout-unsupported: node_modules")
    expect(yield* Effect.promise(() => readFile(path.join(scratch, "snapshot", "node_modules"), "utf8"))).toBe("reviewed-file\n")
    expect(yield* Effect.promise(() => readFile(path.join(root, "node_modules", "pkg", "index.js"), "utf8"))).toBe("live\n")
    expect((yield* Effect.promise(() => lstat(path.join(scratch, "snapshot", "node_modules")))).isSymbolicLink()).toBe(false)
  }), 120_000,
)

hardlink(hardlinkTitle, () =>
  Effect.gen(function* () {
    const host = yield* Effect.promise(() => otherDevice(os.tmpdir()))
    const hostDev = host ? yield* Effect.promise(() => stat(host).then((info) => info.dev)) : undefined
    const tmpDev = yield* Effect.promise(() => stat(os.tmpdir()).then((info) => info.dev))
    if (!host || hostDev === tmpDev) {
      const reason = process.platform === "linux"
        ? "snapshot-dependency-hardlink-conformance-missing: no second device"
        : "snapshot-dependency-hardlink-unavailable: no second volume; physical EXDEV UNEXERCISED"
      return yield* Effect.die(new Error(reason))
    }
    expectSpawn(import.meta.path)
    const repoDir = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(path.join(host, "lucy-shadow-repo-")).then((made) => realpath(made))),
      (made) => Effect.promise(() => rm(made, { recursive: true, force: true })),
    )
    const root = path.join(repoDir, "repo")
    const scratch = yield* Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "lucy-shadow-scratch-")))
    yield* Effect.promise(async () => {
      await gitRepo(root)
      await writeFile(path.join(root, "README.md"), "reviewed\n")
      await git(root, "add", ".")
      await git(root, "commit", "-q", "-m", "base")
      await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true })
      await writeFile(path.join(root, "node_modules", "pkg", "index.js"), "hardlink-me\n")
    })
    expect(yield* Effect.promise(() => stat(root).then((info) => info.dev))).not.toBe(yield* Effect.promise(() => stat(scratch).then((info) => info.dev)))
    const before = yield* Effect.promise(() => readFile(path.join(root, "node_modules", "pkg", "index.js")))
    const error = yield* ProbeSnapshot.create({
      worktree: root, snapshot: { kind: "worktree" }, scratch, maxBytes: 1024 * 1024,
    }).pipe(Effect.flip)
    expect(error.reason.startsWith("snapshot-dependency-hardlink-failed:")).toBe(true)
    const dest = path.join(scratch, "snapshot", "node_modules", "pkg", "index.js")
    const destStat = yield* Effect.promise(() => lstat(dest).catch(() => undefined))
    if (destStat?.isFile()) {
      const sourceStat = yield* Effect.promise(() => stat(path.join(root, "node_modules", "pkg", "index.js")))
      expect(destStat.ino).toBe(sourceStat.ino)
    }
    expect(yield* Effect.promise(() => readFile(path.join(root, "node_modules", "pkg", "index.js")))).toEqual(before)
    expect((yield* Effect.promise(() => lstat(path.join(scratch, "snapshot", "node_modules")).catch(() => undefined)))?.isSymbolicLink() ?? false).toBe(false)
    yield* Effect.promise(() => rm(scratch, { recursive: true, force: true }))
  }), 120_000,
)

it.live("a refused graph leaves the caller's scratch without a live graft and a review scope removes it", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const dir = yield* owned()
    const good = path.join(dir.path, "good")
    const root = path.join(dir.path, "bad")
    const scratch = path.join(dir.path, "bad-scratch")
    yield* Effect.promise(async () => {
      await gitRepo(good)
      await writeFile(path.join(good, "README.md"), "reviewed\n")
      await git(good, "add", ".")
      await git(good, "commit", "-q", "-m", "base")
      await gitRepo(root)
      await writeFile(path.join(root, "README.md"), "reviewed\n")
      await git(root, "add", ".")
      await git(root, "commit", "-q", "-m", "base")
      await mkdir(path.join(root, "node_modules"), { recursive: true })
      await symlink("a", path.join(root, "node_modules", "b"))
      await symlink("b", path.join(root, "node_modules", "a"))
      await mkdir(scratch)
    })
    const before = yield* Effect.promise(() => seal(root))
    const seen: string[] = []
    const error = yield* Effect.scoped(Effect.gen(function* () {
      const copy = yield* ReviewScratch.create({ worktree: good, revision: "HEAD" })
      seen.push(copy.scratch)
      return yield* ReviewScratch.create({ worktree: root, revision: "HEAD" })
    })).pipe(Effect.flip)
    expect(error.reason.startsWith("snapshot-dependency-cycle:")).toBe(true)
    expect(seen.map((item) => existsSync(item))).toEqual([false])
    const refused = yield* ProbeSnapshot.create({
      worktree: root, snapshot: { kind: "worktree" }, scratch, maxBytes: 1024 * 1024,
    }).pipe(Effect.flip)
    expect(refused.reason.startsWith("snapshot-dependency-cycle:")).toBe(true)
    expect((yield* Effect.promise(() => lstat(path.join(scratch, "snapshot", "node_modules")).catch(() => undefined)))?.isSymbolicLink() ?? false).toBe(false)
    expect(yield* Effect.promise(() => seal(root))).toEqual(before)
  }), 120_000,
)
