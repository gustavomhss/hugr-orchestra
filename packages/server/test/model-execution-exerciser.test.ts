import { expect } from "bun:test"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { AppProcess } from "@orchestra/core/process"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { tmpdir } from "@orchestra/core/test/fixture/tmpdir"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import path from "node:path"

const it = testEffect(AppNodeBuilder.build(AppProcess.node))

it.live(
  "model.execution has a real exerciser scenario in coverage, auth and effect modes",
  () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const temporary = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )
      const processes = yield* AppProcess.Service
      for (const mode of ["coverage", "auth", "effect"]) {
        // The existing CLI sets its global environment before importing Core; isolate that lifetime in a real child.
        const result = yield* processes.run(
          ChildProcess.make(
            process.execPath,
            [
              "run",
              "script/httpapi-exercise.ts",
              "--mode",
              mode,
              "--include",
              "v2.model.execution",
              "--fail-on-missing",
              "--fail-on-skip",
            ],
            {
              cwd: path.resolve(import.meta.dir, ".."),
              env: {
                ...process.env,
                ORCHESTRA_HTTPAPI_EXERCISE_GLOBAL: temporary.path,
                ORCHESTRA_CONFIG_DIR: path.join(temporary.path, "config", "orchestra"),
                ORCHESTRA_CREDENTIAL_KEY_FILE: path.join(temporary.path, "credential.key"),
                ORCHESTRA_INHERIT_CREDENTIALS: "0",
              },
              extendEnv: false,
            },
          ),
          { timeout: "35 seconds", maxOutputBytes: 1_048_576, maxErrorBytes: 1_048_576 },
        )
        expect({
          mode,
          exitCode: result.exitCode,
          stdout: result.stdout.toString(),
          stderr: result.stderr.toString(),
        }).toMatchObject({ exitCode: 0 })
        expect(result.stdout.toString()).toContain("v2.model.execution")
      }
    }),
  120_000,
)
