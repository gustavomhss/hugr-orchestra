import type { AppProcess } from "@orchestra/core/process"
import { Effect, Stream } from "effect"
import { ChildProcessSpawner } from "effect/unstable/process"

export function dockerProcess(run: AppProcess.Interface["run"]): AppProcess.Interface {
  return {
    ...ChildProcessSpawner.make(() => Effect.die("Unexpected process spawn in the Activity HTTP fixture")),
    omniEnabled: true,
    run,
    runStream: () => Stream.die("Unexpected process stream in the Activity HTTP fixture"),
  }
}

export function dockerResult(stdout = "", overrides: Partial<AppProcess.RunResult> = {}): AppProcess.RunResult {
  return {
    command: "docker container ls --all --no-trunc --size --format json",
    exitCode: 0,
    stdout: Buffer.from(stdout),
    stderr: Buffer.alloc(0),
    stdoutTruncated: false,
    stderrTruncated: false,
    ...overrides,
  }
}
