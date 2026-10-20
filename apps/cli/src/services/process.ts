import { Effect, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

export interface SpawnResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export const run = Effect.fn("cli.process.run")(function* <Options extends ChildProcess.CommandOptions>(
  command: readonly [string, ...string[]],
  options?: Options,
) {
  const spawner = yield* ChildProcessSpawner
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(ChildProcess.make(command[0], command.slice(1), options))
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      )
      return { exitCode, stdout, stderr } satisfies SpawnResult
    }),
  )
})

export * as Spawn from "./process"