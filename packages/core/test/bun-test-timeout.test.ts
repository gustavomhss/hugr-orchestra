import { expect } from "bun:test"
import { TOML } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { AppProcess } from "../src/process"
import { expectSpawn } from "./fixture/omni-expect"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))

it.live("shared preload allows normal exit and enforces an idle timeout after another file", () => Effect.gen(function* () {
  const processes = yield* AppProcess.Service
  const directory = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(path.join(tmpdir(), "bun-test-timeout-"))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const preload = path.resolve(import.meta.dir, "../../../script/test-guard.ts")
  yield* Effect.promise(() => Promise.all([
    Bun.write(path.join(directory, "bunfig.toml"), `[test]\npreload = [${JSON.stringify(preload)}]\n`),
    Bun.write(path.join(directory, "first.test.ts"), 'import { test } from "bun:test"\ntest("passing", () => {})\n'),
    Bun.write(path.join(directory, "second.test.ts"), [
      'import { test } from "bun:test"',
      'test("idle promise", async () => { await new Promise(() => {}) }, 3_000)',
      'test("continued", () => { console.log("continued after idle timeout") })',
    ].join("\n")),
  ]))
  expectSpawn(import.meta.path)
  // The parent deadline reaps a broken child; it must never be the mechanism that passes this check.
  const passing = yield* processes.run(ChildProcess.make(process.execPath, ["test", "./first.test.ts"], {
    cwd: directory,
  }), { timeout: "15 seconds" })
  expect(passing.exitCode).toBe(0)
  const hung = yield* processes.run(ChildProcess.make(process.execPath, ["test", "./first.test.ts", "./second.test.ts"], {
    cwd: directory,
  }), { timeout: "15 seconds" })
  expect(hung.exitCode).toBe(1)
  expect(hung.stderr.toString()).toContain("this test timed out after 3000ms")
  expect(hung.stderr.toString()).toContain("(fail) idle promise")
  expect(hung.stdout.toString()).toContain("continued after idle timeout")
}), 40_000)

it.live("every Bun test package loads the shared guard", () => Effect.gen(function* () {
  const processes = yield* AppProcess.Service
  const root = path.resolve(import.meta.dir, "../../..")
  expectSpawn(import.meta.path)
  const listing = yield* processes.run(ChildProcess.make("git", ["ls-files", "-z"], {
    cwd: root,
  }), { timeout: "15 seconds" })
  expect(listing.exitCode).toBe(0)
  // Discover test packages independently: deleting a bunfig must fail, rather than disappear from this check.
  const files = listing.stdout.toString().split("\0").filter(Boolean)
  const manifests = new Set(files.filter((file) => file.endsWith("/package.json")).map((file) => path.posix.dirname(file)))
  const configs = [...new Set(files
    .filter((file) => /^(packages|modules)\/.*\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file))
    .map((file) => {
      const parts = file.split("/")
      const owner = parts.map((_, index) => parts.slice(0, index).join("/")).findLast((directory) => manifests.has(directory))
      if (!owner) throw new Error(`BUN_TEST_PACKAGE_MISSING:${file}`)
      return `${owner}/bunfig.toml`
    }))]
  expect(configs).toContain("modules/capability-assets/bunfig.toml")
  expect(configs).toContain("modules/relay/bunfig.toml")
  expect(configs.length).toBeGreaterThan(10)
  yield* Effect.promise(() => Promise.all(configs.map(async (file) => {
    const config = TOML.parse(await Bun.file(path.join(root, file)).text()) as { test?: { preload?: string[] } }
    expect(config.test?.preload?.some((entry) => path.resolve(root, path.dirname(file), entry) ===
      path.join(root, "script/test-guard.ts"))).toBe(true)
  })))
}), 20_000)
