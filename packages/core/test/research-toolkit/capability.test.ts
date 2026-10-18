import { expect, test } from "bun:test"
import path from "path"
import { mkdtemp, realpath, rm } from "fs/promises"
import { tmpdir } from "os"
import { Effect } from "effect"
import { ResearchToolkit } from "../../src/research-toolkit/index"
import { ResearchToolkitManifest } from "../../src/research-toolkit/manifest"
import { it } from "../lib/effect"

const temporary = (prefix: string) =>
  Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), prefix)))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )

const ids = ["scip-typescript", "scip-python", "typescript"] as const

// JE-AC-X5 and JE-AC-L5 precondition (J6.10): an engine the manifest does not ship is reported unsupported and its
// `ensure` fails with the named blocker `code_query` quotes. No verb answers with an empty or ready-looking success.
// Mutation control: make `ResearchToolkit.ensure` succeed when the manifest has no pack.
it.live("with an empty manifest every engine is unsupported, and ensure names the blocker for each", () =>
  Effect.gen(function* () {
    const root = yield* temporary("research-capability-")
    const empty = <A, E, R>(self: Effect.Effect<A, E, R>) =>
      self.pipe(Effect.provideService(ResearchToolkit.Root, root), Effect.provideService(ResearchToolkit.Manifest, {}))
    expect((yield* ResearchToolkit.status().pipe(empty)).map((state) => [state.engine, state.status])).toEqual(ids.map((id) => [id, "unsupported"]))
    expect((yield* ResearchToolkit.prefetch().pipe(empty)).map((state) => [state.engine, state.status])).toEqual(ids.map((id) => [id, "unsupported"]))
    for (const id of ids) {
      const failure = yield* ResearchToolkit.ensure(id).pipe(empty, Effect.flip)
      expect([id, failure.reason]).toEqual([id, `toolkit-not-ready:unsupported:${id}:pack-not-shipped`])
    }
  }), 30_000)

// J6.7 and J6.9: a shard that cannot be built because its engine is missing is recorded `skipped` with the reason, so
// `orchestra toolkit status` and the index basis say why coverage is missing instead of showing nothing.
// Mutation control: stop recording the skip when the engine is not ready (the `"reason" in ready` branch of `warm`).
it.live("a shard whose engine is missing is reported skipped with the toolkit blocker, not absent", () =>
  Effect.gen(function* () {
    const root = yield* temporary("research-capability-")
    const worktree = yield* temporary("research-capability-worktree-")
    const plan: ReadonlyArray<ResearchToolkit.Shard> = [
      { id: "ts-shard", language: "ts", project: "packages/app", rank: 3, engine: "scip-typescript", state: "absent" },
      { id: "ready-shard", language: "ts", project: "packages/core", rank: 2, engine: "scip-typescript", state: "ready" },
    ]
    const built: string[] = []
    const scoped = <A, E, R>(self: Effect.Effect<A, E, R>) =>
      self.pipe(
        Effect.provideService(ResearchToolkit.Root, root),
        Effect.provideService(ResearchToolkit.Manifest, {}),
        Effect.provideService(ResearchToolkit.Index, {
          plan: () => Effect.succeed(plan),
          build: (shard) => Effect.sync(() => { built.push(shard.id) }),
        }),
      )
    yield* ResearchToolkit.warm(worktree).pipe(scoped)
    expect(built).toEqual([])
    expect(yield* ResearchToolkit.shards(worktree).pipe(scoped)).toEqual([
      { id: "ts-shard", language: "ts", project: "packages/app", status: "skipped", reason: "toolkit-not-ready:unsupported:scip-typescript:pack-not-shipped" },
      { id: "ready-shard", language: "ts", project: "packages/core", status: "ready" },
    ])
  }), 30_000)

// J6.4 and the owner's rule on dependencies: every shipped pack is pinned exactly and carries a permissive license.
// Mutation control: change a pack's license to a copyleft one.
test("every shipped research pack is pinned to an exact version with an allowed license and a scriptless lock", () => {
  const packs = Object.values(ResearchToolkitManifest.ENGINES)
  expect(packs.map((pack) => pack.id).toSorted()).toEqual(["scip-typescript", "typescript"])
  for (const pack of packs) {
    expect([pack.id, pack.version]).toEqual([pack.id, expect.stringMatching(/^\d+\.\d+\.\d+$/)])
    expect([pack.id, /^(MIT|Apache-2\.0|BSD-[23]-Clause)$/.test(pack.license)]).toEqual([pack.id, true])
    expect([pack.id, pack.upstream.length > 0]).toEqual([pack.id, true])
    if (!("install" in pack) || pack.install.kind !== "npm") throw new Error(`${pack.id} is not an npm pack`)
    const lock = JSON.parse(pack.install.lock) as { packages: Record<string, { hasInstallScript?: boolean }> }
    expect([pack.id, Object.values(lock.packages).filter((entry) => entry.hasInstallScript)]).toEqual([pack.id, []])
  }
})
