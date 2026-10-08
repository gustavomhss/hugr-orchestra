import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { Context, Effect, Exit, Fiber } from "effect"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { PinnedArtifact } from "../src/pinned-artifact"
import { ToolkitInstall } from "../src/toolkit/install"
import { ToolkitRuntime } from "../src/toolkit/runtime"
import { it } from "./lib/effect"

const SCRIPT = "#!/bin/sh\necho metadata fixture\n"
const sri = (bytes: string | Uint8Array) => `sha256-${createHash("sha256").update(bytes).digest("base64")}` as const
const FixtureContext = Context.Reference<string>("@test/capability-runtime/captured-context", { defaultValue: () => "default-context" })

const fixture = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "runtime metadata spaces-")))),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  )
  const detected = BackendToolkitTarget.detect()
  if (!("target" in detected)) throw new Error(`BLOCKED: test host has no toolkit target: ${detected.unsupported}`)
  const target = detected.target
  const release = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  const control: { held: boolean; inject?: () => Promise<void> } = { held: false }
  const bodies: Record<string, string | Uint8Array> = { "/interpreter": SCRIPT }
  const hits: string[] = []
  const server = yield* Effect.acquireRelease(
    Effect.sync(() => Bun.serve({
      hostname: "127.0.0.1", port: 0,
      fetch: async (request) => {
        const name = new URL(request.url).pathname
        hits.push(name)
        started.resolve()
        if (control.held) await release.promise
        if (control.inject) await control.inject()
        return new Response(bodies[name] ?? "missing", { status: name in bodies ? 200 : 404 })
      },
    })),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const pin = {
    executable: "bin/interpreter",
    artifact: {
      url: `http://127.0.0.1:${server.port}/interpreter`, integrity: sri(SCRIPT), format: "raw" as const,
      entries: [{ from: "interpreter", to: "bin/interpreter", executable: true }],
    },
  }
  const runtime = (id: string, selected: { readonly executable: string; readonly artifact: PinnedArtifact.Artifact } = pin): ToolkitRuntime.Runtime => ({
    id, version: "1.0.0-fixture", license: "MIT", upstream: "fixture/runtime", targets: { [target]: selected },
  })
  const directory = (spec: ToolkitRuntime.Runtime) => path.join(root, "runtimes", spec.id, `${spec.version}-${target}`)
  const ensure = (spec: ToolkitRuntime.Runtime) => ToolkitRuntime.ensure({ root, runtime: spec, target })
  return { root, target, release, started, control, bodies, hits, server, pin, runtime, directory, ensure }
})

it.live("metadata paths are reserved for executables and archive destinations including ancestor prefixes", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const control = yield* f.ensure(f.runtime("control"))
    expect(yield* Effect.promise(() => readFile(control.executable, "utf8"))).toBe(SCRIPT)
    const variants = [".runtime-pin", ".complete"].flatMap((name) =>
      [name, `./${name}`, `${name}/interpreter`, `bin/${name}`, `bin\\${name}`, `bin/${name.toUpperCase()}/child`, `${name}.`],
    ).flatMap((candidate, index) => [
      f.runtime(`executable-${index}`, { ...f.pin, executable: candidate }),
      f.runtime(`destination-${index}`, { ...f.pin, artifact: { ...f.pin.artifact, entries: [{ from: "interpreter", to: candidate, executable: true }] } }),
      f.runtime(`both-${index}`, { executable: candidate, artifact: { ...f.pin.artifact, entries: [{ from: "interpreter", to: candidate, executable: true }] } }),
    ])
    yield* Effect.forEach(variants, (spec) => f.ensure(spec).pipe(
      Effect.flip,
      Effect.tap((error) => Effect.sync(() => expect(error).toMatchObject({ _tag: "PinnedArtifactFailed", cause: "layout" }))),
    ))
    expect(f.hits).toEqual(["/interpreter"])
    expect(yield* Effect.promise(() => readdir(path.join(f.root, "runtimes")))).toEqual(["control"])
  }),
)

it.live("populated staging metadata is rejected before receipt or complete-marker writes", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const sentinel = path.join(f.root, "sentinel")
    yield* Effect.promise(() => writeFile(sentinel, "sentinel unchanged"))
    const variants = [".runtime-pin", ".complete"].flatMap((name) =>
      (process.platform === "win32" ? ["file"] : ["file", "symlink"]).map((kind) => ({ name, kind })),
    )
    yield* Effect.forEach(variants, (variant, index) => Effect.gen(function* () {
      const spec = f.runtime(`populated-${index}`)
      const parent = path.dirname(f.directory(spec))
      f.control.inject = async () => {
        const staging = (await readdir(parent)).filter((name) => name.startsWith(".staging-"))
        expect(staging).toHaveLength(1)
        const metadata = path.join(parent, staging[0], variant.name)
        if (variant.kind === "symlink") return symlink(sentinel, metadata)
        await writeFile(metadata, "archive-owned metadata")
      }
      expect(yield* f.ensure(spec).pipe(Effect.flip)).toMatchObject({ cause: "layout" })
      expect(yield* PinnedArtifact.installed(f.directory(spec))).toBe(false)
      expect(yield* Effect.promise(() => readdir(parent))).toEqual([])
      expect(yield* Effect.promise(() => readFile(sentinel, "utf8"))).toBe("sentinel unchanged")
    }))
    expect(f.hits).toEqual(variants.map(() => "/interpreter"))
  }),
)

const posix = process.platform === "win32" ? it.live.skip : it.live

posix("tiny pinned archive cannot supply a symlink receipt or an interpreter aliasing that receipt", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const work = path.join(f.root, "archive")
    yield* Effect.promise(async () => {
      await mkdir(path.join(work, "payload", "bin"), { recursive: true })
      await writeFile(path.join(work, "payload", "bin", "interpreter"), SCRIPT, { mode: 0o755 })
      await symlink("bin/interpreter", path.join(work, "payload", ".runtime-pin"))
    })
    const archive = yield* Effect.promise(async () => {
      const child = Bun.spawn(["tar", "-czf", path.join(work, "runtime.tgz"), "-C", work, "payload"], { stdout: "ignore", stderr: "pipe" })
      const stderr = await new Response(child.stderr).text()
      if (await child.exited !== 0) throw new Error(`BLOCKED: tar unavailable: ${stderr}`)
      return new Uint8Array(await readFile(path.join(work, "runtime.tgz")))
    })
    f.bodies["/runtime.tgz"] = archive
    const artifact: PinnedArtifact.Artifact = {
      url: `http://127.0.0.1:${f.server.port}/runtime.tgz`, integrity: sri(archive), format: "tar.gz",
      entries: [{ from: "payload/bin", to: "bin" }],
    }
    const control = yield* f.ensure(f.runtime("archive-control", { executable: "bin/interpreter", artifact }))
    expect(yield* Effect.promise(() => readFile(control.executable, "utf8"))).toBe(SCRIPT)
    const collision = f.runtime("symlink-receipt", {
      executable: "bin/interpreter", artifact: { ...artifact, entries: [...artifact.entries, { from: "payload/.runtime-pin", to: ".runtime-pin" }] },
    })
    expect(yield* f.ensure(collision).pipe(Effect.flip)).toMatchObject({ cause: "layout" })
    expect(f.hits).toEqual(["/runtime.tgz"])
    yield* Effect.promise(async () => {
      await rm(path.join(work, "payload", "bin", "interpreter"))
      await symlink("../.runtime-pin", path.join(work, "payload", "bin", "interpreter"))
      const child = Bun.spawn(["tar", "-czf", path.join(work, "alias.tgz"), "-C", work, "payload"], { stdout: "ignore", stderr: "pipe" })
      const stderr = await new Response(child.stderr).text()
      if (await child.exited !== 0) throw new Error(`BLOCKED: tar unavailable: ${stderr}`)
      f.bodies["/alias.tgz"] = new Uint8Array(await readFile(path.join(work, "alias.tgz")))
    })
    const alias = f.runtime("interpreter-alias", {
      executable: "bin/interpreter", artifact: { ...artifact, url: `http://127.0.0.1:${f.server.port}/alias.tgz`, integrity: sri(f.bodies["/alias.tgz"]) },
    })
    expect(yield* f.ensure(alias).pipe(Effect.flip)).toMatchObject({ cause: "layout" })
    expect(yield* PinnedArtifact.installed(f.directory(alias))).toBe(false)
    expect(yield* Effect.promise(() => readdir(path.dirname(f.directory(alias))))).toEqual([])
    expect(f.hits).toEqual(["/runtime.tgz", "/alias.tgz"])
  }), 30_000,
)

it.live("detached once preserves the initiating caller's Context references after that caller stops waiting", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    f.control.held = true
    const directory = f.directory(f.runtime("context"))
    const work = PinnedArtifact.install(directory, [f.pin.artifact], (staging) => Effect.gen(function* () {
      const value = yield* FixtureContext
      yield* Effect.promise(() => writeFile(path.join(staging, "context.txt"), value))
    }))
    const caller = yield* Effect.forkChild(ToolkitInstall.once(directory, work).pipe(Effect.provideService(FixtureContext, "initiator-context")))
    yield* Effect.promise(() => f.started.promise).pipe(Effect.timeout(5_000))
    yield* Fiber.interrupt(caller)
    expect(Exit.hasInterrupts(yield* Fiber.await(caller))).toBe(true)
    const joiner = yield* Effect.forkChild(ToolkitInstall.once(directory, work).pipe(Effect.provideService(FixtureContext, "joiner-context")))
    yield* Effect.yieldNow
    f.release.resolve()
    expect(yield* Fiber.join(joiner)).toBeUndefined()
    expect(yield* PinnedArtifact.installed(directory)).toBe(true)
    expect(yield* Effect.promise(() => readFile(path.join(directory, "context.txt"), "utf8"))).toBe("initiator-context")
    expect(f.hits).toEqual(["/interpreter"])
    expect(ToolkitInstall.attempt(directory)).toBeUndefined()
  }),
)
