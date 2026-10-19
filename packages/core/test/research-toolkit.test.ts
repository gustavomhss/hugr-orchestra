import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { mkdtemp, readdir, realpath, rm } from "fs/promises"
import { tmpdir } from "os"
import { Effect } from "effect"
import { BackendToolkit } from "../src/backend-toolkit"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { ResearchToolkit } from "../src/research-toolkit/index"
import { it } from "./lib/effect"

const windows = process.platform === "win32"
const file = (id: string) => (windows ? `${id}.cmd` : id)
const script = (id: string) => (windows ? `@echo ${id} fixture %*\r\n` : `#!/bin/sh\necho "${id} fixture $*"\n`)

const temporary = (prefix: string) =>
  Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), prefix)))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )

/** A research root and a backend root, plus raw-script research packs served locally; `missing` packs point at a 404. */
const fixture = Effect.gen(function* () {
  const root = yield* temporary("research-toolkit-")
  const backend = yield* temporary("research-toolkit-backend-")
  const hits: Record<string, number> = {}
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        fetch: (request) => {
          const pathname = new URL(request.url).pathname
          hits[pathname] = (hits[pathname] ?? 0) + 1
          const id = ["scip-typescript", "scip-python"].find((item) => pathname === `/${file(item)}`)
          return id ? new Response(script(id)) : new Response("missing", { status: 404 })
        },
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const pack = (id: "scip-typescript" | "scip-python", missing = false): ResearchToolkit.ResearchPack => {
    const pin = {
      artifact: {
        url: `http://127.0.0.1:${server.port}/${missing ? "missing/" : ""}${file(id)}`,
        integrity: `sha256-${createHash("sha256").update(script(id)).digest("base64")}` as const,
        format: "raw" as const,
        entries: [{ from: file(id), to: file(id), executable: true }],
      },
      executable: file(id),
    }
    return {
      id,
      version: "0.0.1",
      license: "Apache-2.0",
      upstream: "fixture/engine",
      targets: { "darwin-arm64": pin, "darwin-x64": pin, "linux-arm64": pin, "linux-x64": pin, "win32-x64": pin },
      fit: { role: "indexer", languages: id === "scip-python" ? ["py"] : ["ts", "js"] },
    }
  }
  const within = <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(
      Effect.provideService(ResearchToolkit.Root, root),
      Effect.provideService(ResearchToolkit.Manifest, { "scip-typescript": pack("scip-typescript"), "scip-python": pack("scip-python", true) }),
      Effect.provideService(BackendToolkit.Root, backend),
    )
  return { root, backend, hits, within }
})

const host = () => {
  const detected = BackendToolkitTarget.detect()
  if (!("target" in detected)) throw new Error(`BLOCKED: test host has no toolkit target: ${detected.unsupported}`)
  return detected.target
}

it.live("an unshipped pack is unsupported in status and ensure fails named, never empty", () =>
  Effect.gen(function* () {
    const root = yield* temporary("research-toolkit-")
    const scoped = <A, E, R>(self: Effect.Effect<A, E, R>) => self.pipe(Effect.provideService(ResearchToolkit.Root, root), Effect.provideService(ResearchToolkit.Manifest, {}))
    expect(yield* ResearchToolkit.status().pipe(scoped)).toEqual(
      (["scip-typescript", "scip-python", "scip-go", "rust-analyzer", "typescript"] as const).map((engine) => ({ engine, version: "none", status: "unsupported", reason: "pack-not-shipped" })),
    )
    const reason = yield* ResearchToolkit.ensure("typescript").pipe(scoped, Effect.flip, Effect.map((error) => error.reason))
    expect(reason).toBe("toolkit-not-ready:unsupported:typescript:pack-not-shipped")
  }), 30_000,
)

it.live("research packs install on the backend lifecycle under the research root, never the backend's", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = host()
    const directory = path.join(f.root, "engines", "scip-typescript", `0.0.1-${target}`)
    const executable = path.join(directory, file("scip-typescript"))
    // The lifecycle's states carry the target, which the research State type leaves out.
    const absent: ReadonlyArray<unknown> = yield* ResearchToolkit.status("scip-typescript").pipe(f.within)
    expect(absent).toEqual([
      { engine: "scip-typescript", version: "0.0.1", target, status: "absent" },
    ])
    expect(yield* ResearchToolkit.ensure("scip-typescript").pipe(f.within)).toEqual({ executable })
    const ready: ReadonlyArray<unknown> = yield* ResearchToolkit.status("scip-typescript").pipe(f.within)
    expect(ready).toEqual([
      { engine: "scip-typescript", version: "0.0.1", target, status: "ready", directory, executable },
    ])
    expect(yield* Effect.promise(() => readdir(path.join(f.root, "bin")))).toEqual([file("scip-typescript")])
    expect(yield* Effect.promise(() => readdir(f.backend))).toEqual([])
    // A failed fetch keeps the backend's cause and gains the research blocker form; the third id stays unshipped.
    const failed = yield* ResearchToolkit.ensure("scip-python").pipe(f.within, Effect.flip, Effect.map((error) => error.reason))
    expect(failed).toStartWith("toolkit-not-ready:failed:scip-python:")
    const states = yield* ResearchToolkit.prefetch().pipe(f.within)
    expect(states.map((state) => [state.engine, state.status])).toEqual([
      ["scip-typescript", "ready"],
      ["scip-python", "failed"],
      ["typescript", "unsupported"],
    ])
    expect(f.hits).toEqual({ ["/" + file("scip-typescript")]: 1, ["/missing/" + file("scip-python")]: 1 })
  }), 30_000,
)

const shard = (id: string, rank: number, engine: ResearchToolkit.ResearchEngineId = "scip-typescript", state: ResearchToolkit.Shard["state"] = "absent"): ResearchToolkit.Shard =>
  ({ id, language: engine === "scip-python" ? "py" : "ts", project: `packages/${id}`, rank, engine, state })

it.live("warm builds pending shards by rank, skips what cannot build with its reason, and goes on", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const worktree = yield* temporary("research-worktree-")
    const built: string[] = []
    const plan = [
      shard("low", 1),
      shard("done", 9, "scip-typescript", "ready"),
      shard("broken", 7),
      shard("slow", 5),
      shard("high", 8),
      shard("python", 6, "scip-python"),
      shard("oracle", 4, "typescript"),
    ]
    const index = {
      plan: () => Effect.succeed(plan),
      build: (item: ResearchToolkit.Shard, input: { readonly executable: string; readonly memoryBytes: number }) =>
        Effect.gen(function* () {
          built.push(item.id)
          expect(input.executable).toBe(path.join(f.root, "engines", "scip-typescript", `0.0.1-${host()}`, file("scip-typescript")))
          expect(input.memoryBytes).toBe(ResearchToolkit.Limits.indexerBytes)
          if (item.id === "broken") return yield* new ResearchToolkit.ShardFailed({ reason: "indexer-exit:1" })
          if (item.id === "slow") yield* Effect.never
        }),
    }
    const scoped = <A, E, R>(self: Effect.Effect<A, E, R>) =>
      self.pipe(f.within, Effect.provideService(ResearchToolkit.Index, index), Effect.provideService(ResearchToolkit.Caps, { ...ResearchToolkit.Limits, shardTimeoutMs: 300 }))
    yield* ResearchToolkit.warm(worktree).pipe(scoped)
    expect(built).toEqual(["high", "broken", "slow", "low"])
    const states = Object.fromEntries((yield* ResearchToolkit.shards(worktree).pipe(scoped)).map((item) => [item.id, item.status === "skipped" ? `skipped:${item.reason}` : item.status]))
    expect(states).toEqual({
      low: "absent",
      done: "ready",
      broken: "skipped:indexer-exit:1",
      slow: "skipped:timeout:300ms",
      high: "absent",
      python: expect.stringMatching(/^skipped:toolkit-not-ready:failed:scip-python:/),
      oracle: "skipped:toolkit-not-ready:unsupported:typescript:pack-not-shipped",
    })
  }), 30_000,
)

it.live("one indexer runs at a time on the host, across worktrees", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const first = yield* temporary("research-worktree-")
    const second = yield* temporary("research-worktree-")
    const counts = { running: 0, peak: 0, total: 0 }
    const index = {
      plan: (worktree: string) => Effect.succeed([shard(`${path.basename(worktree)}-a`, 2), shard(`${path.basename(worktree)}-b`, 1)]),
      build: () =>
        Effect.gen(function* () {
          counts.running++
          counts.total++
          counts.peak = Math.max(counts.peak, counts.running)
          yield* Effect.sleep("150 millis")
          counts.running--
        }),
    }
    const scoped = <A, E, R>(self: Effect.Effect<A, E, R>) => self.pipe(f.within, Effect.provideService(ResearchToolkit.Index, index))
    yield* Effect.all([ResearchToolkit.warm(first).pipe(scoped), ResearchToolkit.warm(second).pipe(scoped)], { concurrency: "unbounded" })
    expect(counts).toEqual({ running: 0, peak: 1, total: 4 })
  }), 30_000,
)
