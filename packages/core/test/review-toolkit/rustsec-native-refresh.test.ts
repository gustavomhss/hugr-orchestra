import { expect } from "bun:test"
import path from "node:path"
import { readdir, stat } from "node:fs/promises"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import pinned from "../../src/backend-toolkit/packs/cargo-audit"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewRustsecDb } from "../../src/review-toolkit/rustsec-db"
import { ReviewRustsecRefresh } from "../../src/review-toolkit/rustsec-refresh"
import { FileDigests } from "../fixture/file-digests"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))

// An explicit host-refresh proof. This process may fetch; the separate review conformance cannot.
it.live.skipIf(process.platform !== "linux" || process.arch !== "x64")("host refresh fetches the primary RustSec DB with the pinned tool and publishes its real commit", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const temp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  const install = path.join(temp.path, "toolkit")
  const root = path.join(temp.path, "rustsec")
  const calls: Array<{ argv: readonly string[]; cwd: string; stdout: string }> = []
  const hosted = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(
    Effect.provideService(BackendToolkit.Root, install),
    Effect.provideService(BackendToolkit.Manifest, { [pinned.id]: pinned }),
    Effect.provideService(BackendToolkit.Target, { target: "linux-x64" }),
    Effect.provideService(ReviewRustsecDb.Root, root),
  )
  const ready = yield* hosted(BackendToolkit.ensure<string>(pinned.id))
  expect(pinned.version).toBe("0.23.0")
  expect(ready.executable).toBeTruthy()
  const before = yield* Effect.promise(() => FileDigests.capture(install))
  const result = yield* hosted(ReviewRustsecRefresh.refresh((input) => Effect.gen(function* () {
    const outcome = yield* ResearchProcess.run({
      command: input.argv[0], args: input.argv.slice(1), cwd: input.cwd, env: input.env,
      timeoutMs: 240_000, maxBytes: 512 * 1024,
    })
    const stdout = outcome.stdout.data.toString("utf8")
    calls.push({ argv: input.argv, cwd: input.cwd, stdout })
    return { exitCode: outcome.exitCode, stdout, ...(outcome.failure === undefined ? {} : { failure: outcome.failure }) }
  })))
  if (!result.ok) throw new Error(`native RustSec host refresh failed: ${result.reason}`)
  expect(calls).toHaveLength(2)
  expect(calls[0].argv[0]).toBe(ready.executable)
  expect(calls[0].argv.slice(1)).toEqual(["audit", "update-db", "--db", result.state.dir, "--url", "https://github.com/RustSec/advisory-db.git"])
  expect(calls[1].argv).toEqual(["git", "-C", result.state.dir, "log", "-1", "--format=%H%n%cI"])
  expect(calls[1].stdout.trim().split("\n")).toEqual([result.state.revision, result.state.committedAt])
  expect(result.state.revision).toMatch(/^[a-f0-9]{40}$/)
  expect(Number.isFinite(Date.parse(result.state.committedAt))).toBe(true)
  expect(Number.isFinite(Date.parse(result.state.refreshedAt))).toBe(true)
  expect(yield* hosted(ReviewRustsecDb.current())).toEqual({ ok: true, state: result.state })
  expect((yield* Effect.promise(() => readdir(path.join(result.state.dir, "crates")))).length).toBeGreaterThan(0)
  expect((yield* Effect.promise(() => stat(path.join(result.state.dir, ".git")))).isDirectory()).toBe(true)
  expect(yield* Effect.promise(() => readdir(calls[0].cwd).then(() => false, () => true))).toBe(true)
  expect(yield* Effect.promise(() => FileDigests.capture(install))).toEqual(before)
}), 300_000)

it.live("unqualified host refresh does not spawn and leaves the toolkit root empty", () => Effect.gen(function* () {
  const temp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  const install = path.join(temp.path, "toolkit")
  const root = path.join(temp.path, "rustsec")
  const calls: Array<readonly string[]> = []
  const result = yield* ReviewRustsecRefresh.refresh((input) => Effect.sync(() => {
    calls.push(input.argv)
    return { exitCode: 0, stdout: "" }
  })).pipe(
    Effect.provideService(BackendToolkit.Root, install),
    Effect.provideService(BackendToolkit.Manifest, { [pinned.id]: pinned }),
    Effect.provideService(BackendToolkit.Target, { unsupported: "test-host" }),
    Effect.provideService(ReviewRustsecDb.Root, root),
  )
  expect(calls).toHaveLength(0)
  expect(result).toEqual({ ok: false, reason: "native-runtime-unqualified" })
  expect(yield* Effect.promise(() => stat(install).then(() => true, () => false))).toBe(false)
  expect(yield* Effect.promise(() => stat(root).then(() => true, () => false))).toBe(false)
  const rows = yield* Effect.promise(() => FileDigests.capture(install).then((value) => value, () => [] as const))
  expect(rows).toEqual([])
}))
