// The omni Effect spawner's output fidelity (integration plan WP1, tests 4, 5 and 8): large and stalled reads lose
// no byte, and exit ordering keeps the full output. Shared fixtures: omni-spawner-fixture.ts.
import { describe, expect } from "bun:test"
import { randomBytes } from "node:crypto"
import { Effect, Fiber, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { bytes, catFile, fx, LONG, mode, repository, sha, Spawner } from "./omni-spawner-fixture"

// The omni binaries exist only in runs that turn omni on (test-ci provides them with the flag), so a flag-off run
// skips this file; the positive control (D-L1) makes sure flag-on runs do spawn through omni.
describe.skipIf(mode === "off")("omni spawner", () => {
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
})
