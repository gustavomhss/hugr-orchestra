export * as ReviewSandboxRemovalFixture from "./review-sandbox-removal"

import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { accessSync, constants, existsSync, renameSync } from "node:fs"
import { mkdir, realpath, writeFile } from "node:fs/promises"
import path from "node:path"
import { Effect, Exit, Tracer } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ToolSafety } from "../../src/tool-safety"
import { ToolSafetySandbox } from "../../src/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "../../src/tool-safety-sandbox-runtime"
import { tmpdir } from "./tmpdir"

/** Every HTTP response is the original pinned archive. No runtime or process result is replaced. */
export const fixture = Effect.gen(function* () {
  const temporary = yield* Effect.acquireRelease(Effect.promise(tmpdir), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  const original = ToolSafetySandboxRuntime.source({ platform: "linux", arch: "x64", download: false, ripgrep: undefined })
  if (!original) throw new Error("P1 setup: pinned Linux source unavailable")
  expect(original.artifacts).toHaveLength(5)
  expect(original.dependencies).toEqual(["bwrap", "socat", "rg"])
  const hits: string[] = []
  const errors: string[] = []
  const transport: { hold?: { reached: () => void; release: Promise<void> } } = {}
  const archiveBytes = new Map<string, Promise<Uint8Array<ArrayBuffer>>>()
  const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch: async (request) => {
      const pathname = new URL(request.url).pathname
      const index = Number(pathname.slice(1))
      const artifact = original.artifacts[index]
      if (request.method !== "GET" || !/^\/\d+$/.test(pathname) || !artifact) return new Response("not found", { status: 404 })
      hits.push(artifact.url)
      if (transport.hold) {
        transport.hold.reached()
        await transport.hold.release
      }
      const pending = archiveBytes.get(artifact.url) ?? (async () => {
        const response = await fetch(artifact.url, { redirect: "follow", signal: AbortSignal.timeout(120_000) })
        if (!response.ok) throw new Error(`P1 mirror upstream HTTP ${response.status}: ${artifact.url}`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        const [algorithm, digest] = artifact.integrity.split("-")
        if (algorithm !== "sha256" && algorithm !== "sha512") throw new Error("P1 mirror pin algorithm")
        expect(createHash(algorithm).update(bytes).digest("base64")).toBe(digest)
        return bytes
      })()
      archiveBytes.set(artifact.url, pending)
      return pending.then((bytes) => new Response(bytes), (error: unknown) => {
        errors.push(String(error))
        return new Response("pinned archive unavailable", { status: 502 })
      })
    },
  })), (server) => Effect.promise(() => server.stop(true)))
  if (typeof server.port !== "number") throw new Error("P1 setup: mirror port unavailable")
  const source: ToolSafetySandboxRuntime.Source = {
    ...original, directory: path.join(temporary.path, "runtime"),
    artifacts: original.artifacts.map((artifact, index) => ({ ...artifact, url: `http://127.0.0.1:${server.port}/${index}` })),
  }
  // This finalizer is registered after the server: acquisition is joined before HTTP/fixture cleanup.
  yield* Effect.addFinalizer(() => ToolSafetySandboxRuntime.settled().pipe(Effect.provideService(ToolSafetySandboxRuntime.Source, source)))
  const root = path.join(temporary.path, "projection")
  const home = path.join(temporary.path, "home")
  yield* Effect.promise(async () => {
    await mkdir(root); await mkdir(home)
    await writeFile(path.join(root, "inside.txt"), "P1-CAPTURED-READ\n")
    await writeFile(path.join(root, "probe.mjs"), "import fs from 'node:fs'; process.stdout.write(fs.readFileSync('inside.txt'));\n")
  })
  const executable = yield* Effect.promise(() => realpath(process.execPath))
  const input = { executable, args: ["--no-env-file", "--config=/dev/null", path.join(root, "probe.mjs")], root }
  const inSource = <A, E, R>(work: Effect.Effect<A, E, R>) => work.pipe(Effect.provideService(ToolSafetySandboxRuntime.Source, source))
  return { source, root, home, input, hits, errors, transport, inSource, port: server.port, temporary: temporary.path }
})

export type Fixture = Effect.Success<typeof fixture>

export const prepared = (f: Fixture) => f.inSource(Effect.gen(function* () {
  const ready = yield* ToolSafetySandboxRuntime.ready()
  yield* ToolSafetySandboxRuntime.settled()
  expect(f.errors).toEqual([])
  expect(ready.reason).toBeUndefined()
  if (ready.reason !== undefined) throw new Error(`P1 native prerequisite: ${ready.reason}`)
  expect(ready.directory).toBe(f.source.directory)
  expect(yield* ToolSafetySandboxRuntime.seccomp(ready.directory)).toBe(true)
  expect(f.hits.length).toBeGreaterThanOrEqual(f.source.artifacts.length)
  expect(new Set(f.hits).size).toBe(f.source.artifacts.length)
  expect(existsSync(ToolSafetySandboxRuntime.cli(ready.directory))).toBe(true)
}))

/** End receives the actual Effect.fn return Exit; creation of wrap precedes evaluating its body. */
export function removal(f: Fixture, suffix: string) {
  const facts = { resolves: [] as string[], reached: 0, removed: 0, seccomp: false }
  const parked = `${f.source.directory}-${suffix}`
  const tracer = Tracer.make({ span: (options) => {
    if (options.name === "ToolSafetySandbox.wrap") {
      facts.reached++
      if (facts.reached === 1) {
        expect(facts.resolves.at(-1), "real successful readiness must precede the wrap boundary").toBe(f.source.directory)
        accessSync(path.join(f.source.directory, "node_modules", "@anthropic-ai", "sandbox-runtime", "vendor", "seccomp", process.arch, "apply-seccomp"), constants.X_OK)
        facts.seccomp = true
        expect(existsSync(parked)).toBe(false)
        renameSync(f.source.directory, parked)
        facts.removed++
        expect(existsSync(f.source.directory)).toBe(false)
        expect(existsSync(path.join(parked, ".complete"))).toBe(true)
      }
    }
    return new class extends Tracer.NativeSpan {
      override end(time: bigint, exit: Exit.Exit<unknown, unknown>) {
        super.end(time, exit)
        if (options.name !== "ToolSafetySandboxRuntime.resolve" || !Exit.isSuccess(exit)) return
        const value = exit.value
        if (typeof value === "object" && value !== null && "directory" in value && typeof value.directory === "string")
          facts.resolves.push(value.directory)
      }
    }(options)
  } })
  return { facts, parked, tracer }
}

export function boundary(control: ReturnType<typeof removal>) {
  expect(control.facts.reached).toBe(1)
  expect(control.facts.removed).toBe(1)
  expect(control.facts.seccomp).toBe(true)
  expect(control.facts.resolves.length).toBeGreaterThan(0)
  expect(existsSync(path.join(control.parked, ".complete"))).toBe(true)
}

/** Direct wrap controls retain its real default acquisition and each selection branch. */
export function wrapped(f: Fixture, options?: { readonly prepareParents?: boolean; readonly acquire?: boolean }, endpoint = false) {
  return f.inSource(Effect.gen(function* () {
    const ready = yield* ToolSafetySandboxRuntime.resolve(false)
    if (ready.reason !== undefined) throw new Error(`P1 control readiness: ${ready.reason}`)
    expect(ready.directory).toBe(f.source.directory)
    expect(yield* ToolSafetySandboxRuntime.seccomp(ready.directory)).toBe(true)
    return yield* selected(f, options, endpoint)
  }))
}

/** Same real selection/execution, for the separately owned acquisition-in-flight control. */
export function selected(f: Fixture, options?: { readonly prepareParents?: boolean; readonly acquire?: boolean }, endpoint = false) {
  return f.inSource(Effect.scoped(Effect.gen(function* () {
    return yield* ToolSafetySandbox.wrap(ChildProcess.make(f.input.executable, f.input.args, {
      cwd: f.root, shell: false, extendEnv: false,
      env: { PATH: "/usr/bin:/bin", HOME: f.home, TMPDIR: f.home, LANG: "C.UTF-8" },
    }), options).pipe(
      Effect.provideService(ToolSafety.NativeContext, { directory: f.root }),
      Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: [], sandbox: {
        enabled: true, scratch: true, readRoots: [f.root, f.input.executable, f.home], unconfinedFallback: false,
        ...(endpoint ? { allowedLoopbackEndpoints: [{ directory: f.root, host: "127.0.0.1" as const, port: f.port }] } : {}),
      } }),
      Effect.flatMap((command) => {
        if (command._tag !== "StandardCommand") throw new Error("P1 control expected native standard command")
        expect(command.command).toBe(process.execPath)
        expect(command.args.slice(0, 3)).toEqual(["--no-env-file", "--config=/dev/null", ToolSafetySandboxRuntime.cli(f.source.directory)])
        return ResearchProcess.run({ command: command.command, args: command.args, cwd: f.root,
          env: Object.fromEntries(Object.entries(command.options.env ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined)),
          timeoutMs: 30_000, maxBytes: 4096, maxRssBytes: 512 * 1024 * 1024 })
      }),
    )
  })))
}

export function denied(result: Exit.Exit<unknown, unknown>, reason: string) {
  expect(Exit.isFailure(result)).toBe(true)
  if (!Exit.isFailure(result)) throw new Error("P1 expected an ordinary typed sandbox refusal")
  expect(result.cause.reasons).toHaveLength(1)
  for (const failure of result.cause.reasons) {
    expect(failure._tag).toBe("Fail")
    if (failure._tag !== "Fail") throw new Error("P1 defects and interruption are not sandbox refusals")
    expect(failure.error).toBeInstanceOf(ToolSafety.Denied)
    if (!(failure.error instanceof ToolSafety.Denied)) throw new Error("P1 expected ToolSafety.Denied")
    expect(failure.error.reason).toBe(reason)
  }
}

export function success(outcome: ResearchProcess.Outcome) {
  expect(outcome.exitCode, outcome.stderr.data.toString("utf8")).toBe(0)
  expect(outcome.failure).toBeUndefined()
  expect(outcome.timedOut).toBe(false)
  expect(outcome.overflow).toBe(false)
  expect(outcome.memoryExceeded).toBe(false)
  expect(outcome.stdout.truncated).toBe(false)
  expect(outcome.stderr.truncated).toBe(false)
  expect(outcome.stdout.data.toString("utf8")).toBe("P1-CAPTURED-READ\n")
}
