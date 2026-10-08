import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { access, mkdtemp, realpath, rm } from "fs/promises"
import { tmpdir } from "os"
import { Effect } from "effect"
import { BackendToolkit } from "../src/backend-toolkit"
import { BackendToolkitManifest } from "../src/backend-toolkit/manifest"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { it } from "./lib/effect"

const windows = process.platform === "win32"
const file = (id: string) => (windows ? `${id}.cmd` : id)
// Each fixture engine prints its id, the environment its manifest entry declares, and its arguments.
const script = (id: string) =>
  windows ? `@echo ${id} fixture %FIXTURE_GREETING% %*\r\n` : `#!/bin/sh\necho "${id} fixture $FIXTURE_GREETING $*"\n`

const fixture = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "backend-toolkit-")))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const hits: Record<string, number> = {}
  const ids = Object.values(BackendToolkitManifest.ENGINES).map((engine) => engine.id)
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        fetch: async (request) => {
          const pathname = new URL(request.url).pathname
          hits[pathname] = (hits[pathname] ?? 0) + 1
          // Slow enough that concurrent needs overlap one download.
          await Bun.sleep(150)
          const id = ids.find((item) => pathname === `/${file(item)}`)
          return id ? new Response(script(id)) : new Response("missing", { status: 404 })
        },
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  )
  /** Every engine served by the fixture as a raw script; `missing` engines point at a 404. */
  const manifest = (missing: ReadonlyArray<BackendToolkitManifest.EngineId> = []) => {
    const engine = (id: BackendToolkitManifest.EngineId): BackendToolkitManifest.Engine => {
      const name = file(id)
      const pin = {
        artifact: {
          url: `http://127.0.0.1:${server.port}/${missing.includes(id) ? "missing/" : ""}${name}`,
          integrity: `sha256-${createHash("sha256").update(script(id)).digest("base64")}` as const,
          format: "raw" as const,
          entries: [{ from: name, to: name, executable: true }],
        },
        executable: name,
      }
      return {
        ...BackendToolkitManifest.ENGINES[id],
        dependencies: [],
        env: { FIXTURE_GREETING: "hello" },
        targets: { "darwin-arm64": pin, "darwin-x64": pin, "linux-arm64": pin, "linux-x64": pin, "win32-x64": pin },
      }
    }
    return {
      ...BackendToolkitManifest.ENGINES,
      "ast-grep": engine("ast-grep"),
      sqlc: engine("sqlc"),
      buf: engine("buf"),
      gitleaks: engine("gitleaks"),
      kiota: engine("kiota"),
    }
  }
  const total = () => Object.values(hits).reduce((sum, count) => sum + count, 0)
  return { root, hits, manifest, total }
})

const within =
  (root: string, manifest: Record<BackendToolkitManifest.EngineId, BackendToolkitManifest.Engine>, target = BackendToolkitTarget.detect()) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(BackendToolkit.Manifest, manifest),
      Effect.provideService(BackendToolkit.Target, target),
    )

const host = () => {
  const detected = BackendToolkitTarget.detect()
  if (!("target" in detected)) throw new Error(`BLOCKED: test host has no toolkit target: ${detected.unsupported}`)
  return detected.target
}

const exists = (file: string) =>
  Effect.promise(() =>
    access(file).then(
      () => true,
      () => false,
    ),
  )

it.live("an absent engine becomes ready on ensure and its shim runs it with the engine environment", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const scoped = within(f.root, f.manifest())
    const target = host()
    const version = BackendToolkitManifest.ENGINES.sqlc.version
    expect(yield* BackendToolkit.status("sqlc").pipe(scoped)).toEqual([{ engine: "sqlc", version, target, status: "absent" }])
    const directory = path.join(f.root, "engines", "sqlc", `${version}-${target}`)
    expect(yield* BackendToolkit.ensure("sqlc").pipe(scoped)).toEqual({ executable: path.join(directory, file("sqlc")) })
    expect(yield* BackendToolkit.status("sqlc").pipe(scoped)).toEqual([
      { engine: "sqlc", version, target, status: "ready", directory, executable: path.join(directory, file("sqlc")) },
    ])
    expect(yield* exists(path.join(directory, ".complete"))).toBe(true)
    const shim = path.join(f.root, "bin", file("sqlc"))
    const run = Bun.spawnSync(windows ? ["cmd", "/c", shim, "generate"] : [shim, "generate"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout.toString().trim()).toBe("sqlc fixture hello generate")
    expect(f.hits).toEqual({ ["/" + file("sqlc")]: 1 })
  }), 30_000,
)

it.live("concurrent ensures share one download and a ready engine is not fetched again", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const scoped = within(f.root, f.manifest())
    const results = yield* Effect.all(Array.from({ length: 5 }, () => BackendToolkit.ensure("buf").pipe(scoped)), {
      concurrency: "unbounded",
    })
    expect(new Set(results.map((result) => result.executable)).size).toBe(1)
    yield* BackendToolkit.ensure("buf").pipe(scoped)
    expect(f.hits).toEqual({ ["/" + file("buf")]: 1 })
  }), 30_000,
)

it.live("a failed fetch is remembered as failed and not fetched again inside the retry window", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const scoped = within(f.root, f.manifest(["gitleaks"]))
    const reason = BackendToolkit.ensure("gitleaks").pipe(scoped, Effect.flip, Effect.map((error) => error.reason))
    expect(yield* reason).toBe("toolkit-not-ready:failed:gitleaks:download:404")
    const [state] = yield* BackendToolkit.status("gitleaks").pipe(scoped)
    expect(state).toMatchObject({ engine: "gitleaks", status: "failed", cause: "download:404" })
    expect(yield* reason).toBe("toolkit-not-ready:failed:gitleaks:download:404")
    expect(f.hits).toEqual({ ["/missing/" + file("gitleaks")]: 1 })
  }), 30_000,
)

it.live("prepare fetches nothing for a command that names no engine", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const prepared = yield* BackendToolkit.prepare("echo hi && sqlc generate").pipe(within(f.root, f.manifest()))
    expect(prepared).toEqual({ env: { BACKEND_TOOLKIT_BIN: path.join(f.root, "bin") } })
    expect(f.total()).toBe(0)
  }), 30_000,
)

it.live("prepare fetches exactly the engines the command invokes through BACKEND_TOOLKIT_BIN", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const scoped = within(f.root, f.manifest())
    expect(yield* BackendToolkit.prepare("$BACKEND_TOOLKIT_BIN/sqlc generate").pipe(scoped)).toEqual({
      env: { BACKEND_TOOLKIT_BIN: path.join(f.root, "bin") },
    })
    expect(f.hits).toEqual({ ["/" + file("sqlc")]: 1 })
    const states = yield* BackendToolkit.status().pipe(scoped)
    expect(states.filter((state) => state.status === "ready").map((state) => state.engine)).toEqual(["sqlc"])
    // A longer name after the separator is not an engine; braces, quotes, backslashes and `$env:` are.
    yield* BackendToolkit.prepare("$BACKEND_TOOLKIT_BIN/bufx lint").pipe(scoped)
    expect(f.total()).toBe(1)
    yield* BackendToolkit.prepare('"${BACKEND_TOOLKIT_BIN}"\\kiota generate; & $env:BACKEND_TOOLKIT_BIN\\buf.cmd lint').pipe(scoped)
    expect(f.hits).toEqual({ ["/" + file("sqlc")]: 1, ["/" + file("kiota")]: 1, ["/" + file("buf")]: 1 })
  }), 30_000,
)

it.live("a musl host is blocked as an unsupported target without fetching", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const scoped = within(f.root, f.manifest(), BackendToolkitTarget.detect({ platform: "linux", arch: "x64", musl: true, rosetta: false }))
    expect(yield* BackendToolkit.prepare("$BACKEND_TOOLKIT_BIN/sqlc generate").pipe(scoped)).toEqual({
      env: { BACKEND_TOOLKIT_BIN: path.join(f.root, "bin") },
      blocked: "unsupported-target:libc-musl",
    })
    const states = yield* BackendToolkit.status().pipe(scoped)
    expect(states).toHaveLength(Object.keys(BackendToolkitManifest.ENGINES).length)
    expect(states.every((state) => state.status === "unsupported" && state.reason === "libc-musl")).toBe(true)
    expect(f.total()).toBe(0)
  }), 30_000,
)

it.live("owned dependencies are provisioned recursively without fetching unrelated engines", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const manifest = f.manifest()
    const scoped = within(f.root, {
      ...manifest,
      buf: { ...manifest.buf, dependencies: ["sqlc"] },
      sqlc: { ...manifest.sqlc, dependencies: ["kiota"] },
    })
    const prepared = yield* BackendToolkit.prepare('"$BACKEND_TOOLKIT_BIN/buf" generate', { PATH: "caller-path" }).pipe(scoped)
    expect(prepared).toEqual({ env: { BACKEND_TOOLKIT_BIN: path.join(f.root, "bin"), PATH: `${path.join(f.root, "bin")}${path.delimiter}caller-path` } })
    expect(f.hits).toEqual({ ["/" + file("kiota")]: 1, ["/" + file("sqlc")]: 1, ["/" + file("buf")]: 1 })
    expect(BackendToolkit.dependencyOrder({ ...manifest, buf: { ...manifest.buf, dependencies: ["sqlc", "kiota"] }, sqlc: { ...manifest.sqlc, dependencies: ["kiota"] } }, "buf")).toEqual(["kiota", "sqlc"])
  }), 30_000,
)

it.live("every shipped engine has a valid owned dependency graph", () =>
  Effect.sync(() => {
    const engines = Object.values(BackendToolkitManifest.ENGINES)
    expect(engines.length).toBeGreaterThan(0)
    for (const engine of engines) {
      const order = BackendToolkit.dependencyOrder(BackendToolkitManifest.ENGINES, engine.id)
      expect(order, `${engine.id}: ${JSON.stringify(order)}`).toBeArray()
    }
  }),
)

it.live("missing and cyclic owned dependencies fail by name before any download", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const manifest = f.manifest()
    for (const [dependencies, reason] of [
      [["missing-engine"], "toolkit-dependency-missing:missing-engine"],
      [["buf"], "toolkit-dependency-cycle:buf->buf"],
      [["sqlc"], "toolkit-dependency-cycle:buf->sqlc->buf"],
    ] as const) {
      const scoped = within(f.root, { ...manifest, buf: { ...manifest.buf, dependencies }, sqlc: { ...manifest.sqlc, dependencies: ["buf"] } })
      expect(yield* BackendToolkit.ensure("buf").pipe(scoped, Effect.flip, Effect.map((error) => error.reason))).toBe(reason)
      expect((yield* BackendToolkit.prepare('"$BACKEND_TOOLKIT_BIN/buf" generate').pipe(scoped)).blocked).toBe(reason)
      expect(yield* BackendToolkit.prefetch(["buf"]).pipe(scoped)).toMatchObject([{ engine: "buf", status: "failed", cause: reason }])
    }
    expect(f.total()).toBe(0)
  }), 30_000,
)

it.live("a cold acquisition returns fetching after the shell wait budget, then finishes for a later call", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const released = Promise.withResolvers<void>()
    yield* Effect.addFinalizer(() => Effect.sync(() => released.resolve()))
    const server = yield* Effect.acquireRelease(
      Effect.sync(() => Bun.serve({ port: 0, idleTimeout: 0, fetch: async () => { await released.promise; return new Response(script("sqlc")) } })),
      (server) => Effect.promise(() => server.stop(true)),
    )
    const manifest = f.manifest()
    const sqlc = manifest.sqlc
    if (!("targets" in sqlc)) throw new Error("fixture sqlc must be native")
    const target = host()
    const scoped = within(f.root, { ...manifest, sqlc: { ...sqlc, targets: { ...sqlc.targets, [target]: { ...sqlc.targets[target], artifact: { ...sqlc.targets[target].artifact, url: `http://127.0.0.1:${server.port}/${file("sqlc")}` } } } } })
    const prepared = yield* BackendToolkit.prepare('"$BACKEND_TOOLKIT_BIN/sqlc" generate').pipe(scoped)
    expect(prepared.blocked).toBe("toolkit-not-ready:fetching:sqlc")
    expect(yield* BackendToolkit.status("sqlc").pipe(scoped)).toMatchObject([{ status: "fetching", at: expect.any(Number), budgetMs: 30 * 60_000 }])
    released.resolve()
    yield* BackendToolkit.ensure("sqlc").pipe(scoped)
    expect(yield* BackendToolkit.status("sqlc").pipe(scoped)).toMatchObject([{ status: "ready" }])
  }), 90_000,
)

it.live("prefetch for another target installs it without writing a host shim", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const other = BackendToolkitTarget.TARGETS.find((target) => target !== host())!
    const states = yield* BackendToolkit.prefetch(["sqlc"], other).pipe(within(f.root, f.manifest()))
    expect(states).toMatchObject([{ engine: "sqlc", target: other, status: "ready" }])
    expect(yield* exists(path.join(f.root, "bin", file("sqlc")))).toBe(false)
  }), 30_000,
)

it.live("BACKEND_TOOLKIT_ROOT overrides the user-cache root", () =>
  Effect.gen(function* () {
    const previous = process.env.BACKEND_TOOLKIT_ROOT
    process.env.BACKEND_TOOLKIT_ROOT = path.join(tmpdir(), "toolkit-root-override")
    const root = BackendToolkit.Root.defaultValue()
    if (previous === undefined) delete process.env.BACKEND_TOOLKIT_ROOT
    if (previous !== undefined) process.env.BACKEND_TOOLKIT_ROOT = previous
    expect(root).toBe(path.join(tmpdir(), "toolkit-root-override"))
  }),
)
