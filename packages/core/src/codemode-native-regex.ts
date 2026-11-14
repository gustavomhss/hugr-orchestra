export * as CodeModeNativeRegex from "./codemode-native-regex"

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect, Layer, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { NativeRegex } from "@orchestra/codemode"
import { AppProcess } from "./process"
import { Flag } from "./flag/flag"
import { script } from "./codemode-native-regex-script"

export const make = Effect.map(AppProcess.Service, (processes): NativeRegex.Provider => ({
  run: (input, remainingMs) => Effect.suspend(() => {
    if (!Number.isFinite(remainingMs) || remainingMs <= 0)
      return Effect.fail(new Error("Native regex requires a finite positive remaining budget"))
    if (!process.versions.bun)
      return Effect.fail(new Error("Native regex unavailable: qualified Bun runtime required"))
    if (Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off")
      return Effect.fail(new Error("Native regex unavailable: Omni is off"))
    return Effect.gen(function* () {
      const request = yield* Effect.try({
        try: () => Schema.decodeUnknownSync(NativeRegex.Request, { onExcessProperty: "error" })(input),
        catch: (cause) => cause,
      })
      return yield* Effect.acquireUseRelease(
        Effect.tryPromise({ try: () => mkdtemp(path.join(tmpdir(), "orchestra-native-regex-")), catch: (cause) => cause }),
        (root) => Effect.gen(function* () {
          const config = path.join(root, "empty.toml")
          yield* Effect.tryPromise({ try: () => Bun.write(config, ""), catch: (cause) => cause })
          const result = yield* processes.run(ChildProcess.make(process.execPath, [
            "--no-env-file", `--config=${config}`, "-e", script,
          ], {
            cwd: root, shell: false, extendEnv: false,
            env: {
              ...Object.fromEntries(Object.entries(process.env).filter(([name, value]) =>
                value !== undefined && process.platform === "win32" && ["SYSTEMROOT", "WINDIR"].includes(name.toUpperCase()))),
              BUN_BE_BUN: "1",
            },
            stdin: "pipe", stdout: "pipe", stderr: "pipe",
          }), { stdin: JSON.stringify(request), maxErrorBytes: 16 * 1024 })
          yield* AppProcess.requireSuccess(result)
          if (result.stdoutTruncated || result.stderrTruncated)
            return yield* Effect.fail(new Error("Native regex helper output was truncated"))
          return yield* Effect.try({
            try: () => NativeRegex.decodeReply(request,
              Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.stdout.toString("utf8")),
            ),
            catch: (cause) => cause,
          })
        }),
        // Finalizer defects combine with the original cause; cleanup failure cannot replace a native/infrastructure failure.
        (root) => Effect.tryPromise({ try: () => rm(root, { recursive: true, force: true }), catch: (cause) => cause }).pipe(Effect.orDie),
      )
    }).pipe(Effect.scoped, Effect.timeout(remainingMs))
  }),
}))

export const layer = Layer.effect(NativeRegex.Executor, make)
