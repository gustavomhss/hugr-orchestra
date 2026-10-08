import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { Effect, Exit, Fiber } from "effect"
import { BackendToolkit } from "../src/backend-toolkit"
import { BackendToolkitManifest } from "../src/backend-toolkit/manifest"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { PinnedArtifact } from "../src/pinned-artifact"
import { ToolkitInstall } from "../src/toolkit/install"
import { ToolkitRuntime } from "../src/toolkit/runtime"
import { it } from "./lib/effect"

const windows = process.platform === "win32"
const NAME = windows ? "interpreter.cmd" : "interpreter"
const SCRIPT = windows ? "@echo runtime fixture %*\r\n" : "#!/bin/sh\necho \"runtime fixture $*\"\n"
const sri = (bytes: string | Uint8Array) => `sha256-${createHash("sha256").update(bytes).digest("base64")}` as const

const host = () => {
  const detected = BackendToolkitTarget.detect()
  if (!("target" in detected)) throw new Error(`BLOCKED: test host has no toolkit target: ${detected.unsupported}`)
  return detected.target
}

const fixture = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "capability runtime spaces-")))),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  )
  const zip = new Uint8Array(yield* Effect.promise(() => readFile(path.join(import.meta.dir, "fixture", "pinned-artifact", "tool.zip"))))
  const release = Promise.withResolvers<void>()
  const control = { held: false, status: 200, active: 0, maximum: 0, starts: 0, notify: [] as (() => void)[] }
  const hits: Record<string, number> = {}
  const server = yield* Effect.acquireRelease(
    Effect.sync(() => Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async (request) => {
        const name = new URL(request.url).pathname
        hits[name] = (hits[name] ?? 0) + 1
        control.starts++
        control.active++
        control.maximum = Math.max(control.maximum, control.active)
        control.notify.splice(0).forEach((notify) => notify())
        if (control.held) await release.promise
        control.active--
        return new Response(name === "/tool.zip" ? zip : name === "/fake.jar" ? "tiny jar" : SCRIPT, { status: control.status })
      },
    })),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const pin = {
    artifact: {
      url: `http://127.0.0.1:${server.port}/${NAME}`,
      integrity: sri(SCRIPT),
      format: "raw" as const,
      entries: [{ from: NAME, to: path.posix.join("bin", NAME), executable: true }],
    },
    executable: path.posix.join("bin", NAME),
  }
  const runtime = (id = "future-capability-runtime", selected = pin) => ({
    id,
    version: "1.0.0-fixture",
    license: "MIT",
    upstream: "fixture/runtime",
    targets: { "darwin-arm64": selected, "darwin-x64": selected, "linux-arm64": selected, "linux-x64": selected, "win32-x64": selected },
  })
  const directory = (spec: ToolkitRuntime.Runtime = runtime()) => path.join(root, "runtimes", spec.id, `${spec.version}-${host()}`)
  const ensure = (spec: ToolkitRuntime.Runtime = runtime(), target = host()) => ToolkitRuntime.ensure({ root, runtime: spec, target })
  const started = (count: number) => Effect.promise(async () => {
    while (control.starts < count) await new Promise<void>((resolve) => control.notify.push(resolve))
  }).pipe(Effect.timeout(5_000))
  return { root, zip, pin, runtime, directory, ensure, hits, control, release, started, server }
})

const failure = (effect: Effect.Effect<unknown, PinnedArtifact.Failed>) => effect.pipe(Effect.flip)

const execute = (file: string, args: ReadonlyArray<string>) => Effect.gen(function* () {
  const child = yield* Effect.acquireRelease(
    Effect.sync(() => Bun.spawn(windows ? ["cmd", "/c", file, ...args] : [file, ...args], { stdout: "pipe", stderr: "pipe" })),
    (child) => Effect.promise(async () => {
      if (child.exitCode === null) child.kill()
      await child.exited
    }),
  )
  return yield* Effect.promise(async () => ({ exitCode: await child.exited, stdout: await new Response(child.stdout).text() }))
})

it.live("shared runtime installs lazily at the backend-compatible path with spaces and executes its verified file", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const spec: ToolkitRuntime.Runtime = f.runtime()
    expect(f.hits).toEqual({})
    expect(yield* PinnedArtifact.installed(f.directory(spec))).toBe(false)
    const ready = yield* f.ensure(spec)
    expect(ready).toEqual({ directory: f.directory(spec), executable: path.join(f.directory(spec), "bin", NAME) })
    expect(yield* Effect.promise(() => readFile(ready.executable, "utf8"))).toBe(SCRIPT)
    expect(yield* PinnedArtifact.installed(ready.directory)).toBe(true)
    const run = yield* execute(ready.executable, ["hello", "two words"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout.trim()).toBe(windows ? 'runtime fixture hello "two words"' : "runtime fixture hello two words")
    expect(yield* f.ensure(spec)).toEqual(ready)
    expect(f.hits).toEqual({ [`/${NAME}`]: 1 })
  }), 30_000,
)

it.live("existing tiny archive fixture passes through authentic PinnedArtifact extraction", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const spec = f.runtime()
    const archive = {
      artifact: {
        url: `http://127.0.0.1:${f.server.port}/tool.zip`,
        integrity: sri(f.zip),
        format: "zip" as const,
        entries: [{ from: "bin/tool", to: "bin/tool", executable: true }],
      },
      executable: "bin/tool",
    }
    const ready = yield* f.ensure({ ...spec, targets: { [host()]: archive } })
    expect(yield* Effect.promise(() => readFile(ready.executable, "utf8"))).toBe("#!/bin/sh\necho zipped\n")
    expect(f.hits).toEqual({ "/tool.zip": 1 })
  }), 120_000,
)

it.live("same-install concurrent users coalesce; different runtime downloads remain bounded", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    f.control.held = true
    const users = yield* Effect.forkChild(Effect.all(Array.from({ length: 12 }, (_, index) => index === 0
      ? ToolkitRuntime.ensure({ root: path.relative(process.cwd(), f.root), runtime: f.runtime(), target: host() })
      : f.ensure()), { concurrency: "unbounded" }))
    yield* f.started(1)
    f.release.resolve()
    const ready = yield* Fiber.join(users)
    expect(new Set(ready.map((item) => path.resolve(item.executable))).size).toBe(1)
    expect(f.hits).toEqual({ [`/${NAME}`]: 1 })
    expect(ToolkitInstall.attempt(f.directory())).toBeUndefined()

    const g = yield* fixture
    g.control.held = true
    const distinct = yield* Effect.forkChild(Effect.all(Array.from({ length: 8 }, (_, index) => g.ensure(g.runtime(`runtime-${index}`))), { concurrency: "unbounded" }))
    yield* g.started(4)
    expect(g.control.active).toBe(4)
    g.release.resolve()
    expect(yield* Fiber.join(distinct)).toHaveLength(8)
    expect(g.control.maximum).toBe(4)
    expect(g.hits).toEqual({ [`/${NAME}`]: 8 })
  }),
)

it.live("missing target and escaping runtime/executable paths fail typed before any download", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    expect(yield* failure(f.ensure({ ...f.runtime(), targets: {} }))).toMatchObject({ _tag: "PinnedArtifactFailed", cause: `unsupported-target:${host()}` })
    yield* Effect.forEach([
      { ...f.runtime(), id: "../outside" },
      { ...f.runtime(), version: "../outside" },
      f.runtime("escape", { ...f.pin, executable: "../outside" }),
      f.runtime("absolute", { ...f.pin, executable: path.join(f.root, "outside") }),
    ], (spec) => failure(f.ensure(spec)).pipe(Effect.tap((error) =>
      Effect.sync(() => expect(error).toMatchObject({ _tag: "PinnedArtifactFailed", cause: "layout" }))),
    ))
    expect(f.hits).toEqual({})
  }),
)

it.live("wrong installed executable is refused before the installer writes a complete marker", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const spec = f.runtime("wrong-executable", { ...f.pin, executable: "bin/missing" })
    expect(yield* failure(f.ensure(spec))).toMatchObject({ cause: "layout" })
    expect(yield* PinnedArtifact.installed(f.directory(spec))).toBe(false)
    expect(yield* Effect.promise(() => readdir(path.dirname(f.directory(spec))))).toEqual([])
    expect(f.hits).toEqual({ [`/${NAME}`]: 1 })
  }),
)

it.live("incomplete directories and stub complete markers never report a ready runtime", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const incomplete = f.runtime("incomplete")
    yield* Effect.promise(async () => {
      await mkdir(f.directory(incomplete), { recursive: true })
      await writeFile(path.join(f.directory(incomplete), "partial"), "unfinished")
    })
    expect(yield* failure(f.ensure(incomplete))).toMatchObject({ cause: "filesystem" })
    expect(yield* PinnedArtifact.installed(f.directory(incomplete))).toBe(false)
    const stub = f.runtime("stub")
    yield* Effect.promise(async () => {
      await mkdir(f.directory(stub), { recursive: true })
      await writeFile(path.join(f.directory(stub), ".complete"), "")
    })
    expect(yield* PinnedArtifact.installed(f.directory(stub))).toBe(true)
    expect(yield* failure(f.ensure(stub))).toMatchObject({ cause: "layout" })
    expect(f.hits).toEqual({ [`/${NAME}`]: 1 })
  }),
)

it.live("cached executable must be a nonempty readable file with POSIX execute permission", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const ready = yield* f.ensure()
    yield* Effect.promise(() => rm(ready.executable))
    yield* Effect.promise(() => mkdir(ready.executable))
    expect(yield* failure(f.ensure())).toMatchObject({ cause: "layout" })
    yield* Effect.promise(async () => {
      await rm(ready.executable, { recursive: true })
      await writeFile(ready.executable, "", { mode: 0o755 })
    })
    expect(yield* failure(f.ensure())).toMatchObject({ cause: "layout" })
    yield* Effect.promise(() => writeFile(ready.executable, SCRIPT))
    if (!windows) {
      yield* Effect.promise(() => chmod(ready.executable, 0o644))
      expect(yield* failure(f.ensure())).toMatchObject({ cause: "layout" })
      yield* Effect.promise(() => chmod(ready.executable, 0o755))
    }
    expect(yield* f.ensure()).toEqual(ready)
    expect(f.hits).toEqual({ [`/${NAME}`]: 1 })
  }),
)

it.live("changed download integrity leaves no install; changed cached pin cannot reuse its receipt", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const changed = { ...f.pin, artifact: { ...f.pin.artifact, integrity: sri("changed bytes") } }
    const bad = f.runtime("bad-integrity", changed)
    expect(yield* failure(f.ensure(bad))).toMatchObject({ cause: "integrity-mismatch" })
    expect(yield* Effect.promise(() => readdir(path.dirname(f.directory(bad))))).toEqual([])
    const ready = yield* f.ensure()
    expect(yield* f.ensure(f.runtime("future-capability-runtime", {
      executable: f.pin.executable,
      artifact: {
        entries: f.pin.artifact.entries.map((entry) => ({ executable: entry.executable, to: entry.to, from: entry.from })),
        format: f.pin.artifact.format,
        integrity: f.pin.artifact.integrity,
        url: f.pin.artifact.url,
      },
    }))).toEqual(ready)
    expect(yield* failure(f.ensure(f.runtime("future-capability-runtime", changed)))).toMatchObject({ cause: "integrity-mismatch" })
    expect(yield* f.ensure()).toEqual(ready)
    expect(f.hits).toEqual({ [`/${NAME}`]: 2 })
  }),
)

it.live("complete marker must be a file; interpreter symlinks stay within the runtime where supported", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const ready = yield* f.ensure()
    const marker = path.join(ready.directory, ".complete")
    yield* Effect.promise(async () => {
      await rm(marker)
      await mkdir(marker)
    })
    expect(yield* failure(f.ensure())).toMatchObject({ cause: "layout" })
    yield* Effect.promise(async () => {
      await rm(marker, { recursive: true })
      await writeFile(marker, "")
    })
    expect(yield* f.ensure()).toEqual(ready)
    if (windows) return
    yield* Effect.promise(async () => {
      await rm(ready.executable)
      await writeFile(path.join(ready.directory, "bin", "real-interpreter"), SCRIPT, { mode: 0o755 })
      await symlink("real-interpreter", ready.executable)
    })
    expect(yield* f.ensure()).toEqual(ready)
    yield* Effect.promise(async () => {
      await rm(ready.executable)
      await writeFile(path.join(f.root, "outside-interpreter"), SCRIPT, { mode: 0o755 })
      await symlink(path.join(f.root, "outside-interpreter"), ready.executable)
    })
    expect(yield* failure(f.ensure())).toMatchObject({ cause: "layout" })
    expect(f.hits).toEqual({ [`/${NAME}`]: 1 })
  }),
)

it.live("concurrent pin drift cannot inherit another caller's successful install", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    f.control.held = true
    const valid = yield* Effect.forkChild(f.ensure())
    yield* f.started(1)
    const changed = f.runtime("future-capability-runtime", { ...f.pin, artifact: { ...f.pin.artifact, integrity: sri("wrong") } })
    const invalid = yield* Effect.forkChild(failure(f.ensure(changed)))
    yield* Effect.yieldNow
    f.release.resolve()
    yield* Fiber.join(valid)
    expect(yield* Fiber.join(invalid)).toMatchObject({ cause: "integrity-mismatch" })
    expect(f.hits).toEqual({ [`/${NAME}`]: 1 })
  }),
)

it.live("download failures share the backend retry window; actual external completion allows recovery", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    f.control.status = 503
    const errors = yield* Effect.all(Array.from({ length: 6 }, () => failure(f.ensure())), { concurrency: "unbounded" })
    expect(errors.every((error) => error.cause === "download:503")).toBe(true)
    f.control.status = 200
    expect(yield* failure(f.ensure())).toMatchObject({ cause: "download:503" })
    expect(f.hits).toEqual({ [`/${NAME}`]: 1 })
    expect(yield* Effect.promise(() => readdir(path.dirname(f.directory())))).toEqual([])
    yield* PinnedArtifact.install(f.directory(), [f.pin.artifact])
    expect(yield* f.ensure()).toEqual({ directory: f.directory(), executable: path.join(f.directory(), f.pin.executable) })
    expect(f.hits).toEqual({ [`/${NAME}`]: 2 })
    expect(ToolkitInstall.attempt(f.directory())).toBeUndefined()
  }),
)

it.live("interrupting one shared waiter preserves the remaining authorized user's install", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    f.control.held = true
    const first = yield* Effect.forkChild(f.ensure())
    yield* f.started(1)
    const second = yield* Effect.forkChild(f.ensure())
    yield* Effect.yieldNow
    yield* Fiber.interrupt(first)
    expect(Exit.hasInterrupts(yield* Fiber.await(first))).toBe(true)
    expect(ToolkitInstall.attempt(f.directory())?.running).toBeDefined()
    f.release.resolve()
    expect((yield* Fiber.join(second)).directory).toBe(f.directory())
    expect(f.hits).toEqual({ [`/${NAME}`]: 1 })
  }),
)

it.live("last interrupted waiter leaves one bounded install alive; later users join its atomic completion", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    f.control.held = true
    const first = yield* Effect.forkChild(f.ensure())
    yield* f.started(1)
    const parent = path.dirname(f.directory())
    expect((yield* Effect.promise(() => readdir(parent))).some((name) => name.startsWith(".staging-"))).toBe(true)
    yield* Fiber.interrupt(first)
    expect(Exit.hasInterrupts(yield* Fiber.await(first))).toBe(true)
    expect(yield* PinnedArtifact.installed(f.directory())).toBe(false)
    expect(ToolkitInstall.attempt(f.directory())?.running).toBeDefined()
    const later = yield* Effect.forkChild(f.ensure())
    yield* Effect.yieldNow
    f.release.resolve()
    expect((yield* Fiber.join(later)).directory).toBe(f.directory())
    expect(yield* Effect.promise(() => readdir(parent))).toEqual([path.basename(f.directory())])
    expect(ToolkitInstall.attempt(f.directory())).toBeUndefined()
    expect(f.hits).toEqual({ [`/${NAME}`]: 1 })
  }),
)

it.live("interrupted callers cannot release permits while their HTTP downloads remain active", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    f.control.held = true
    const specs = Array.from({ length: 4 }, (_, index) => f.runtime(`interrupted-${index}`))
    const users = yield* Effect.forEach(specs, (spec) => Effect.forkChild(f.ensure(spec)))
    yield* f.started(4)
    yield* Fiber.interruptAll(users)
    expect(f.control.active).toBe(4)
    const extra = yield* Effect.forkChild(f.ensure(f.runtime("queued-runtime")))
    yield* Effect.yieldNow
    expect(f.control.starts).toBe(4)
    f.release.resolve()
    yield* Fiber.join(extra)
    yield* Effect.forEach(specs, (spec) => f.ensure(spec), { concurrency: "unbounded" })
    expect(f.control.maximum).toBe(4)
    expect(f.hits).toEqual({ [`/${NAME}`]: 5 })
    yield* Effect.forEach(specs, (spec) => Effect.sync(() => expect(ToolkitInstall.attempt(f.directory(spec))).toBeUndefined()))
  }),
)

it.live("shared registry settles synchronous failures and defects without a stuck running entry", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    expect(yield* ToolkitInstall.once(f.directory(), Effect.fail(new PinnedArtifact.Failed({ cause: "layout" })))).toBe("layout")
    expect(ToolkitInstall.attempt(f.directory())).toMatchObject({ failed: "layout" })
    const spec = f.runtime("defect")
    const broken = yield* ToolkitInstall.once(f.directory(spec), Effect.die("fixture defect")).pipe(Effect.exit)
    expect(Exit.hasDies(broken)).toBe(true)
    expect(ToolkitInstall.attempt(f.directory(spec))).toBeUndefined()
    expect((yield* f.ensure(spec)).directory).toBe(f.directory(spec))
  }),
)

it.live("valid legacy runtime caches remain usable; hosted backend launcher shares the common primitive", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const runtime: BackendToolkitManifest.Runtime = { ...f.runtime("node"), id: "node" }
    yield* PinnedArtifact.install(f.directory(runtime), [f.pin.artifact])
    expect((yield* Effect.promise(() => readdir(f.directory(runtime)))).sort()).toEqual([".complete", "bin"])
    const engine: BackendToolkitManifest.HostedEngine = {
      id: "openapi-generator", version: "1.0.0-fixture", license: "MIT", upstream: "fixture/engine", runtime: "node",
      install: { kind: "jar", artifact: { url: `http://127.0.0.1:${f.server.port}/fake.jar`, integrity: sri("tiny jar"), format: "raw", entries: [{ from: "fake.jar", to: "fake.jar" }] } },
      launch: ["-jar", "{install}/fake.jar"],
    }
    const backend = BackendToolkit.ensure(engine.id).pipe(
      Effect.provideService(BackendToolkit.Root, f.root),
      Effect.provideService(BackendToolkit.Target, { target: host() }),
      Effect.provideService(BackendToolkit.Manifest, { ...BackendToolkitManifest.ENGINES, [engine.id]: engine }),
      Effect.provideService(BackendToolkit.Runtimes, { ...BackendToolkitManifest.RUNTIMES, node: runtime }),
    )
    const results = yield* Effect.all([backend, f.ensure(runtime)], { concurrency: "unbounded" })
    const directory = path.join(f.root, "engines", engine.id, `${engine.version}-${host()}`)
    expect(results[0]).toEqual({ executable: path.join(directory, windows ? `${engine.id}.cmd` : engine.id) })
    expect(results[1]).toEqual({ directory: f.directory(runtime), executable: path.join(f.directory(runtime), f.pin.executable) })
    // A .cmd is not a private Windows interpreter; real Windows hosted launchers require vendor qualification.
    if (!windows) {
      const run = yield* execute(path.join(f.root, "bin", engine.id), ["two words"])
      expect(run.exitCode).toBe(0)
      expect(run.stdout.trim()).toBe(`runtime fixture -jar ${directory}/fake.jar two words`)
    }
    expect(f.hits).toEqual({ [`/${NAME}`]: 1, "/fake.jar": 1 })
  }), 30_000,
)

it.live("backend and common callers share one failed runtime attempt with the original runtime- error prefix", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    f.control.status = 503
    const runtime: BackendToolkitManifest.Runtime = { ...f.runtime("node"), id: "node" }
    const engine: BackendToolkitManifest.HostedEngine = {
      id: "openapi-generator", version: "1.0.0-fixture", license: "MIT", upstream: "fixture/engine", runtime: "node",
      install: { kind: "jar", artifact: { ...f.pin.artifact, url: `http://127.0.0.1:${f.server.port}/fake.jar` } },
      launch: [],
    }
    const backend = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(
      Effect.provideService(BackendToolkit.Root, f.root),
      Effect.provideService(BackendToolkit.Target, { target: host() }),
      Effect.provideService(BackendToolkit.Manifest, { ...BackendToolkitManifest.ENGINES, [engine.id]: engine }),
      Effect.provideService(BackendToolkit.Runtimes, { ...BackendToolkitManifest.RUNTIMES, node: runtime }),
    )
    const errors = yield* Effect.all([backend(BackendToolkit.ensure(engine.id)).pipe(Effect.flip), failure(f.ensure(runtime))], { concurrency: "unbounded" })
    expect(errors[0]).toMatchObject({ reason: "toolkit-not-ready:failed:openapi-generator:runtime-download:503" })
    expect(errors[1]).toMatchObject({ cause: "download:503" })
    expect(yield* backend(BackendToolkit.status(engine.id))).toMatchObject([{ status: "failed", cause: "runtime-download:503" }])
    expect(f.hits).toEqual({ [`/${NAME}`]: 1 })
  }),
)

it.live("cold hosted backend and capability users download one shared runtime and preserve native engine acquisition", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    f.control.held = true
    const runtime: BackendToolkitManifest.Runtime = { ...f.runtime("node"), id: "node" }
    const engine: BackendToolkitManifest.HostedEngine = {
      id: "openapi-generator", version: "1.0.0-fixture", license: "MIT", upstream: "fixture/engine", runtime: "node",
      install: { kind: "jar", artifact: { url: `http://127.0.0.1:${f.server.port}/fake.jar`, integrity: sri("tiny jar"), format: "raw", entries: [{ from: "fake.jar", to: "fake.jar" }] } },
      launch: ["-jar", "{install}/fake.jar"],
    }
    const native: BackendToolkitManifest.NativeEngine = { ...runtime, id: "buf" }
    const backend = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(
      Effect.provideService(BackendToolkit.Root, f.root),
      Effect.provideService(BackendToolkit.Target, { target: host() }),
      Effect.provideService(BackendToolkit.Manifest, { ...BackendToolkitManifest.ENGINES, [engine.id]: engine, buf: native }),
      Effect.provideService(BackendToolkit.Runtimes, { ...BackendToolkitManifest.RUNTIMES, node: runtime }),
    )
    const capability = yield* Effect.forkChild(f.ensure(runtime))
    yield* f.started(1)
    const hosted = yield* Effect.forkChild(backend(BackendToolkit.ensure(engine.id)))
    yield* Effect.yieldNow
    f.release.resolve()
    const ready = yield* Fiber.join(capability)
    yield* Fiber.join(hosted)
    expect(ready.directory).toBe(f.directory(runtime))
    expect(f.hits).toEqual({ [`/${NAME}`]: 1, "/fake.jar": 1 })
    const engines = yield* Effect.all(Array.from({ length: 3 }, () => backend(BackendToolkit.ensure("buf"))), { concurrency: "unbounded" })
    expect(engines).toEqual(Array.from({ length: 3 }, () => ({ executable: path.join(f.root, "engines", "buf", `${native.version}-${host()}`, f.pin.executable) })))
    expect(yield* backend(BackendToolkit.status("buf"))).toMatchObject([{ status: "ready" }])
    expect(f.hits).toEqual({ [`/${NAME}`]: 2, "/fake.jar": 1 })
  }),
)
