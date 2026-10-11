// What the omni Effect spawner runs and passes on (integration plan WP1, tests 7, 7b, 9 and 10): strict refusal,
// delegation in mode 1, the child environment and shell: true. Shared fixtures: omni-spawner-fixture.ts.
import { describe, expect } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Omni } from "@orchestra/core/omni"
import { AppProcess } from "@orchestra/core/process"
import { fx, LONG, mode, on, Spawner } from "./omni-spawner-fixture"

// The omni binaries exist only in runs that turn omni on (test-ci provides them with the flag), so a flag-off run
// skips this file; the positive control (D-L1) makes sure flag-on runs do spawn through omni.
describe.skipIf(mode === "off")("omni spawner", () => {
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
  ;(mode === "strict" ? on.live.skip : on.live)(
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
