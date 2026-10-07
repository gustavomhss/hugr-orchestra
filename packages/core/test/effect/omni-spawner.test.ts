// The omni Effect spawner (integration plan WP1, tests 1-9 with test 5 replaced per R2-1). Every test builds the omni
// spawner explicitly (strict unless it says otherwise), so it exercises omni whatever the run's flag is. Processes are
// identified by the nonce tree (test/fixture/process-tree.ts), never by a bare pid; timings only prove a bound.
import { describe, expect } from "bun:test"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { spawnSync } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import { readdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Cause, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Omni } from "@opencode-ai/core/omni"
import { OmniAdoption } from "@opencode-ai/core/omni-adoption"
import { omniSpawner } from "@opencode-ai/core/flag/flag"
import { AppProcess } from "@opencode-ai/core/process"
import { gone, sweep, tree } from "../fixture/process-tree"
import { testEffect } from "../lib/effect"

const platform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)
const spawner = (mode: "on" | "strict") =>
  Layer.effect(ChildProcessSpawner.ChildProcessSpawner, CrossSpawnSpawner.makeWith(mode)).pipe(Layer.provide(platform))
const strict = spawner("strict")
const fx = testEffect(Layer.mergeAll(strict, AppProcess.layerWith("strict").pipe(Layer.provide(strict))))
const on = testEffect(spawner("on"))

const LONG = 120_000
const BOUND = 20_000

const Spawner = ChildProcessSpawner.ChildProcessSpawner

/** A root that starts the nonce tree with `stdio`, waits until every tree process wrote its record, then exits 0. */
function exiting(fixture: ReturnType<typeof tree>, stdio: "inherit" | "ignore") {
  const code = `
const cp = process.getBuiltinModule("node:child_process")
const fs = process.getBuiltinModule("node:fs")
const [file, args, dir, size] = JSON.parse(process.argv.at(-1))
cp.spawn(file, args, { stdio: ["ignore", "${stdio}", "${stdio}"], windowsHide: true })
const tick = () => fs.readdirSync(dir).filter((name) => name.endsWith(".json")).length >= size ? process.exit(0) : setTimeout(tick, 20)
tick()`
  return ChildProcess.make(process.execPath, [
    "-e",
    code,
    JSON.stringify([fixture.command, fixture.args, fixture.args.at(-1), fixture.size]),
  ])
}

/** Reads stdout lines until the tree's ready line. */
const ready = (handle: ChildProcessSpawner.ChildProcessHandle, line: string) =>
  handle.stdout.pipe(
    Stream.decodeText,
    Stream.splitLines,
    Stream.filter((text) => text.includes(line)),
    Stream.take(1),
    Stream.runDrain,
  )

const bytes = (stream: Stream.Stream<Uint8Array, unknown>) =>
  Stream.runCollect(stream).pipe(Effect.map((chunks) => Buffer.concat([...chunks])))

/** Polls the process table until no process carries the nonce (or the bound passes); returns what is left. */
async function swept(nonce: string) {
  const deadline = Date.now() + BOUND
  for (;;) {
    const left = await sweep(nonce)
    if (left.length === 0 || Date.now() > deadline) return left
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

const records = (fixture: ReturnType<typeof tree>) =>
  readdirSync(fixture.args.at(-1) ?? "").filter((name) => name.endsWith(".json")).length

async function until(check: () => boolean) {
  const deadline = Date.now() + BOUND
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not reached within the bound")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/** A git repository holding `blobs` (contents), and the exact `git cat-file --batch` output for their ids. */
async function repository(blobs: Buffer[]) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omni-cat-file-"))
  const git = (args: string[], input?: string) => {
    const out = spawnSync("git", args, { cwd: dir, input, encoding: "utf8", maxBuffer: 1 << 20 })
    if (out.status !== 0) throw new Error(`git ${args.join(" ")}: ${out.stderr}`)
    return out.stdout
  }
  git(["init", "-q"])
  const files = await Promise.all(
    blobs.map(async (blob, index) => {
      const file = path.join(dir, `blob-${index}`)
      await fs.writeFile(file, blob)
      return file
    }),
  )
  const ids = git(["hash-object", "-w", "--no-filters", "--stdin-paths"], files.join("\n") + "\n")
    .trim()
    .split("\n")
  const expected = Buffer.concat(
    blobs.flatMap((blob, index) => [Buffer.from(`${ids[index]} blob ${blob.length}\n`), blob, Buffer.from("\n")]),
  )
  return { dir, ids, expected, [Symbol.asyncDispose]: () => fs.rm(dir, { recursive: true, force: true }) }
}

const catFile = (repo: { dir: string; ids: string[] }) =>
  ChildProcess.make("git", ["cat-file", "--batch"], {
    cwd: repo.dir,
    stdin: Stream.make(Buffer.from(repo.ids.join("\n") + "\n")),
  })

const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex")

describe("omni spawner", () => {
  fx.live(
    "1. a grandchild holding stdout: exit returns bounded, then the tree is stopped, or adopted under policy tool",
    () =>
      Effect.gen(function* () {
        const svc = yield* Spawner
        const stopped = tree(1)
        const started = Date.now()
        const code = yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* svc.spawn(exiting(stopped, "inherit"))
            const [, exit] = yield* Effect.all([bytes(handle.all), handle.exitCode], { concurrency: "unbounded" })
            return exit
          }),
        )
        expect(Date.now() - started).toBeLessThan(BOUND)
        expect(code).toBe(ChildProcessSpawner.ExitCode(0))
        expect(yield* Effect.promise(() => gone(stopped.nonce))).toBe(0)
        expect(yield* Effect.promise(() => swept(stopped.nonce))).toEqual([])

        const adopted = tree(1)
        const registered: Omni.Child[] = []
        yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* svc.spawn(exiting(adopted, "inherit"))
            yield* Effect.all([bytes(handle.all), handle.exitCode], { concurrency: "unbounded" })
          }),
        ).pipe(
          Effect.provideService(OmniAdoption.Service, { sessionID: "ses_test", policy: "tool" }),
          Effect.provideService(OmniAdoption.Registry, {
            register: (child) => Effect.sync(() => void registered.push(child)),
          }),
        )
        expect(registered.length).toBe(1)
        expect((yield* Effect.promise(() => sweep(adopted.nonce))).length).toBe(adopted.size)
        yield* Effect.promise(() => registered[0]?.stop())
        expect(yield* Effect.promise(() => gone(adopted.nonce))).toBe(0)
        expect(yield* Effect.promise(() => swept(adopted.nonce))).toEqual([])
      }),
    LONG,
  )

  fx.live(
    "2. a child that ignores SIGTERM, forceKillAfter unset: kill and scope close are bounded",
    () =>
      Effect.gen(function* () {
        const svc = yield* Spawner
        const stubborn = (nonce: string) =>
          ChildProcess.make(process.execPath, [
            "-e",
            'process.on("SIGTERM", () => {}); console.log("ready"); setInterval(() => {}, 1 << 30)',
            nonce,
          ])
        const killed = `omni-stubborn-${crypto.randomUUID()}`
        const started = Date.now()
        yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* svc.spawn(stubborn(killed))
            yield* ready(handle, "ready")
            yield* handle.kill()
          }),
        )
        expect(Date.now() - started).toBeLessThan(BOUND)
        expect(yield* Effect.promise(() => swept(killed))).toEqual([])

        const closed = `omni-stubborn-${crypto.randomUUID()}`
        const scoped = Date.now()
        yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* svc.spawn(stubborn(closed))
            yield* ready(handle, "ready")
          }),
        )
        expect(Date.now() - scoped).toBeLessThan(BOUND)
        expect(yield* Effect.promise(() => swept(closed))).toEqual([])
      }),
    LONG,
  )

  fx.live(
    "3. after the root exits 0, its descendants are gone at scope close (generic policy)",
    () =>
      Effect.gen(function* () {
        const svc = yield* Spawner
        const fixture = tree(2)
        const code = yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* svc.spawn(exiting(fixture, "ignore"))
            const exit = yield* handle.exitCode
            expect((yield* Effect.promise(() => sweep(fixture.nonce))).length).toBe(fixture.size)
            return exit
          }),
        )
        expect(code).toBe(ChildProcessSpawner.ExitCode(0))
        expect(yield* Effect.promise(() => gone(fixture.nonce))).toBe(0)
        expect(yield* Effect.promise(() => swept(fixture.nonce))).toEqual([])
      }),
    LONG,
  )

  fx.live(
    "4. git cat-file --batch with 200 objects and one blob over 20 MiB is byte-identical",
    () =>
      Effect.gen(function* () {
        const svc = yield* Spawner
        const blobs = [
          ...Array.from({ length: 200 }, (_, index) => randomBytes(64 + index * 37)),
          randomBytes(21 * 1024 * 1024),
        ]
        const repo = yield* Effect.acquireRelease(
          Effect.promise(() => repository(blobs)),
          (repo) => Effect.promise(() => repo[Symbol.asyncDispose]()),
        )
        const handle = yield* svc.spawn(catFile(repo))
        const [out, code] = yield* Effect.all([bytes(handle.stdout), handle.exitCode], { concurrency: "unbounded" })
        expect(code).toBe(ChildProcessSpawner.ExitCode(0))
        expect(out.length).toBe(repo.expected.length)
        expect(out.equals(repo.expected)).toBe(true)
      }),
    LONG,
  )

  fx.live(
    "5. a 200 ms event-loop block during a 64 MiB cat-file loses 0 bytes",
    () =>
      Effect.gen(function* () {
        const svc = yield* Spawner
        const repo = yield* Effect.acquireRelease(
          Effect.promise(() => repository([randomBytes(64 * 1024 * 1024)])),
          (repo) => Effect.promise(() => repo[Symbol.asyncDispose]()),
        )
        const handle = yield* svc.spawn(catFile(repo))
        const blocks = { done: 0 }
        let seen = 0
        // Blocks the whole event loop (the pump included) right away and again past 32 MiB.
        const stalled = handle.stdout.pipe(
          Stream.tap((chunk) =>
            Effect.sync(() => {
              seen += chunk.length
              if (blocks.done === 0 || (blocks.done === 1 && seen > 32 * 1024 * 1024)) {
                blocks.done++
                const end = Date.now() + 200
                while (Date.now() < end) {}
              }
            }),
          ),
        )
        const [out, code] = yield* Effect.all([bytes(stalled), handle.exitCode], { concurrency: "unbounded" })
        expect(blocks.done).toBe(2)
        expect(code).toBe(ChildProcessSpawner.ExitCode(0))
        expect(out.length).toBe(repo.expected.length)
        expect(sha(out)).toBe(sha(repo.expected))
      }),
    LONG,
  )

  fx.live(
    "6. abort and timeout leave nothing alive",
    () =>
      Effect.gen(function* () {
        const app = yield* AppProcess.Service
        const svc = yield* Spawner

        const aborted = tree(2)
        const controller = new AbortController()
        const run = yield* Effect.forkChild(
          Effect.exit(app.run(ChildProcess.make(aborted.command, aborted.args), { signal: controller.signal })),
        )
        yield* Effect.promise(() => until(() => records(aborted) >= aborted.size))
        controller.abort()
        expect(Exit.isFailure(yield* Fiber.join(run))).toBe(true)
        expect(yield* Effect.promise(() => gone(aborted.nonce))).toBe(0)

        expect(yield* Effect.promise(() => swept(aborted.nonce))).toEqual([])

        const timed = tree(2)
        const exit = yield* Effect.exit(app.run(ChildProcess.make(timed.command, timed.args), { timeout: "3 seconds" }))
        expect(Exit.isFailure(exit)).toBe(true)
        expect(yield* Effect.promise(() => gone(timed.nonce))).toBe(0)
        expect(yield* Effect.promise(() => swept(timed.nonce))).toEqual([])

        const interrupted = tree(2)
        const result = yield* Effect.exit(
          Effect.scoped(
            Effect.gen(function* () {
              const handle = yield* svc.spawn(ChildProcess.make(interrupted.command, interrupted.args))
              yield* ready(handle, interrupted.ready)
              return yield* Effect.never
            }),
          ).pipe(Effect.timeout("2 seconds")),
        )
        expect(Exit.isFailure(result)).toBe(true)
        expect(yield* Effect.promise(() => gone(interrupted.nonce))).toBe(0)
        expect(yield* Effect.promise(() => swept(interrupted.nonce))).toEqual([])
      }),
    LONG,
  )

  fx.live(
    "7. strict refuses inherit with BadArgument and makes no omni spawn",
    () =>
      Effect.gen(function* () {
        const svc = yield* Spawner
        const before = Omni.snapshot()
        const exit = yield* Effect.exit(
          Effect.scoped(svc.spawn(ChildProcess.make(process.execPath, ["-e", "0"], { stdout: "inherit" }))),
        )
        const after = Omni.snapshot()
        expect(after.spawns - before.spawns).toBe(0)
        expect(after.delegations - before.delegations).toBe(0)
        if (Exit.isSuccess(exit)) throw new Error("strict spawned a child with stdout: inherit")
        const error = Cause.squash(exit.cause)
        expect(error).toMatchObject({ _tag: "PlatformError", reason: { _tag: "BadArgument" } })
      }),
    LONG,
  )

  // A delegation would fail a strict run's positive control (D-L1), so this one runs only outside strict runs.
  ;(omniSpawner(process.env.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER) === "strict" ? on.live.skip : on.live)(
    "7b. mode 1 delegates a piped command to legacy and counts the delegation",
    () =>
      Effect.gen(function* () {
        const svc = yield* Spawner
        const before = Omni.snapshot()
        const out = yield* svc.string(
          ChildProcess.make(process.execPath, ["-e", 'process.stdout.write("piped")']).pipe(
            ChildProcess.pipeTo(ChildProcess.make(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"])),
          ),
        )
        expect(out).toBe("piped")
        expect(Omni.snapshot().delegations - before.delegations).toBe(1)
      }),
    LONG,
  )

  fx.live(
    "8. exit ordering: exit wins the race, then the joined reader holds the full output",
    () =>
      Effect.gen(function* () {
        const svc = yield* Spawner
        const size = 24 * 1024 * 1024
        const handle = yield* svc.spawn(
          ChildProcess.make(process.execPath, [
            "-e",
            `process.stdout.write(Buffer.alloc(${size - 4}, 97)); process.stdout.write("END\\n")`,
          ]),
        )
        const chunks: Uint8Array[] = []
        const reader = yield* Effect.forkScoped(
          Stream.runForEach(handle.all, (chunk) => Effect.sync(() => void chunks.push(chunk))),
        )
        // The shell tool's pattern: exit races the reader, and only after exit is the reader joined.
        const exit = yield* Effect.raceAll([
          handle.exitCode.pipe(Effect.map((code) => ({ kind: "exit" as const, code }))),
          Fiber.join(reader).pipe(Effect.andThen(Effect.never)),
        ])
        yield* Fiber.join(reader)
        const out = Buffer.concat(chunks)
        expect(exit).toEqual({ kind: "exit", code: ChildProcessSpawner.ExitCode(0) })
        expect(out.length).toBe(size)
        expect(out.subarray(-4).toString()).toBe("END\n")
      }),
    LONG,
  )

  fx.live(
    "9. AGENT=1 set through process.env reaches the child, HUGR_OMNI_* does not",
    () =>
      Effect.gen(function* () {
        const svc = yield* Spawner
        const app = yield* AppProcess.Service
        const saved = { agent: process.env.AGENT, probe: process.env.HUGR_OMNI_WP1_PROBE }
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            if (saved.agent === undefined) delete process.env.AGENT
            else process.env.AGENT = saved.agent
            if (saved.probe === undefined) delete process.env.HUGR_OMNI_WP1_PROBE
            else process.env.HUGR_OMNI_WP1_PROBE = saved.probe
          }),
        )
        process.env.AGENT = "1"
        process.env.HUGR_OMNI_WP1_PROBE = "leak"
        const probe = (opts?: ChildProcess.CommandOptions) =>
          ChildProcess.make(
            process.execPath,
            [
              "-e",
              'process.stdout.write(JSON.stringify({ agent: process.env.AGENT, omni: Object.keys(process.env).filter((key) => key.toUpperCase().startsWith("HUGR_OMNI_")) }))',
            ],
            opts,
          )
        const before = Omni.snapshot()
        const streamed = JSON.parse(yield* svc.string(probe({ extendEnv: true, env: { EXTRA: "x" } })))
        const inherited = JSON.parse(yield* svc.string(probe()))
        const collected = JSON.parse((yield* app.run(probe())).stdout.toString())
        expect(Omni.snapshot().spawns - before.spawns).toBe(3)
        for (const seen of [streamed, inherited, collected]) expect(seen).toEqual({ agent: "1", omni: [] })
      }),
    LONG,
  )

  fx.live(
    "10. shell: true runs through omni with no delegation (cmd.exe on Windows gets Node's verbatim command line)",
    () =>
      Effect.gen(function* () {
        const svc = yield* Spawner
        const app = yield* AppProcess.Service
        const before = Omni.snapshot()
        const streamed = yield* svc.string(ChildProcess.make("echo", ["a&&echo", "b"], { shell: true }))
        const collected = yield* app.run(ChildProcess.make("echo", ["c&&echo", "d"], { shell: true }))
        const after = Omni.snapshot()
        expect(after.spawns - before.spawns).toBe(2)
        expect(after.delegations - before.delegations).toBe(0)
        expect(
          streamed
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean),
        ).toEqual(["a", "b"])
        expect(
          collected.stdout
            .toString()
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean),
        ).toEqual(["c", "d"])
      }),
    LONG,
  )
})
