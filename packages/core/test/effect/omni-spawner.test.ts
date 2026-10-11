// The omni Effect spawner (integration plan WP1, tests 1-9 with test 5 replaced per R2-1). Every test builds the omni
// spawner explicitly (strict unless it says otherwise), so it exercises omni whatever the run's flag is. Processes are
// identified by the nonce tree (test/fixture/process-tree.ts), never by a bare pid; timings only prove a bound.
// This file: process trees (stop, adoption, abort, timeout); omni-spawner-output and -routing hold the rest.
import { describe, expect } from "bun:test"
import { Effect, Exit, Fiber } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { BackgroundJob } from "@orchestra/core/background-job"
import { Omni } from "@orchestra/core/omni"
import { OmniAdoption } from "@orchestra/core/omni-adoption"
import { OmniBackground } from "@orchestra/core/omni-background"
import { AppProcess } from "@orchestra/core/process"
import { gone, sweep, tree } from "../fixture/process-tree"
import { BOUND, bytes, exiting, fx, LONG, mode, ready, records, Spawner, swept, until } from "./omni-spawner-fixture"

// The omni binaries exist only in runs that turn omni on (test-ci provides them with the flag), so a flag-off run
// skips this file; the positive control (D-L1) makes sure flag-on runs do spawn through omni.
describe.skipIf(mode === "off")("omni spawner", () => {
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
    "11. a background grandchild is adopted by the real registry, its later output reaches the ring, stopSession ends it",
    () =>
      Effect.gen(function* () {
        const svc = yield* Spawner
        const registry = OmniBackground.make(yield* BackgroundJob.make, { pollMs: 50 })
        const nonce = `omni-background-${crypto.randomUUID()}`
        // `sleep 600 &` in any shell: the root starts a grandchild on its own stdout that ticks forever, then exits.
        const ticker = `setInterval(() => process.getBuiltinModule("node:fs").writeSync(1, "tick " + process.argv.at(-1) + "\\n"), 100)`
        const root = `
const cp = process.getBuiltinModule("node:child_process")
cp.spawn(process.execPath, ["-e", ${JSON.stringify(ticker)}, process.argv.at(-1)], { stdio: ["ignore", "inherit", "inherit"], windowsHide: true, detached: process.platform === "win32" })
setTimeout(() => process.exit(0), 300)`
        yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* svc.spawn(ChildProcess.make(process.execPath, ["-e", root, nonce]))
            yield* Effect.all([bytes(handle.all), handle.exitCode], { concurrency: "unbounded" })
          }),
        ).pipe(
          Effect.provideService(OmniAdoption.Service, { sessionID: "ses_wp1", policy: "tool" }),
          Effect.provideService(OmniAdoption.Registry, registry),
        )
        const listed = yield* registry.list("ses_wp1")
        expect(listed.length).toBe(1)
        expect(listed[0]?.processes.length).toBeGreaterThan(0)
        const first = listed[0]?.written ?? 0
        // The host streams ended at the grace; ticks since then go to the ring the registry took over.
        let later = first
        const deadline = Date.now() + BOUND
        while (later <= first && Date.now() < deadline) {
          yield* Effect.sleep("200 millis")
          later = (yield* registry.list("ses_wp1"))[0]?.written ?? 0
        }
        expect(later).toBeGreaterThan(first)
        expect((yield* registry.list("ses_wp1"))[0]?.output).toContain(`tick ${nonce}`)
        yield* registry.stopSession("ses_wp1")
        expect(yield* Effect.promise(() => swept(nonce))).toEqual([])
        expect(yield* registry.list("ses_wp1")).toEqual([])
      }),
    LONG,
  )
})
