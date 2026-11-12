import { expect, test } from "bun:test"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Deferred, Effect, Exit, Fiber, Schema, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { AppProcess } from "../src/process"
import { expectSpawn } from "./fixture/omni-expect"

const Envelope = Schema.Struct({ type: Schema.String, payload: Schema.Unknown })
const maxBytes = 64 * 1024
const layer = AppNodeBuilder.build(AppProcess.node)

for (const mode of ["CPU-native"] as const) {
  test(`PROBE ONLY E10 actual native CPU termination ${mode}`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(Effect.gen(function* () {
      const processes = yield* AppProcess.Service
      const child = yield* processes.spawn(ChildProcess.make(process.execPath, [
        path.join(import.meta.dir, "fixture/codemode-worker-probe.mjs"),
        pathToFileURL(path.resolve(import.meta.dir, "../../codemode/src/worker.ts")).href,
        mode,
      ], { stdin: "ignore", stdout: "pipe", stderr: "pipe", killSignal: "SIGKILL", forceKillAfter: 100 }))
      const ready = yield* Deferred.make<void>()
      const messages = new Array<typeof Envelope.Type>()
      const state = { bytes: 0, pending: "", containmentKill: false }
      const decoder = new TextDecoder()
      const output = yield* Effect.forkChild(child.stdout.pipe(Stream.runForEach((chunk) => Effect.gen(function* () {
        state.bytes += chunk.length
        if (state.bytes > maxBytes) return yield* Effect.die("PROBE SETUP: stdout exceeds 64KiB")
        const lines = (state.pending + decoder.decode(chunk, { stream: true })).split("\n")
        state.pending = lines.pop() ?? ""
        yield* Effect.forEach(lines.filter(Boolean), (line) => Effect.gen(function* () {
          const message = Schema.decodeUnknownSync(Envelope)(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(line))
          messages.push(message)
          if (messages.length > 64) return yield* Effect.die("PROBE SETUP: trace exceeds 64 records")
          if (message.type === "HOST_READY") yield* Deferred.succeed(ready, undefined)
        }))
      }))))
      const errorOutput = yield* Effect.forkChild(AppProcess.collectStream(child.stderr, maxBytes))
      const exited = yield* Effect.forkChild(Effect.exit(child.exitCode))
      const started = yield* Effect.raceFirst(Fiber.join(exited).pipe(Effect.as(false)), Deferred.await(ready).pipe(Effect.as(true)))
        .pipe(Effect.timeout("30 seconds"))
      const exit = started ? yield* Effect.raceFirst(Fiber.join(exited), Effect.sleep(6500).pipe(
        Effect.andThen(Effect.sync(() => { state.containmentKill = true })),
        Effect.andThen(child.kill({ killSignal: "SIGKILL" })),
        Effect.andThen(Fiber.join(exited)),
      )) : yield* Fiber.join(exited)
      yield* Fiber.join(output)
      const errors = yield* Fiber.join(errorOutput)
      const witness = `E10_WORKER_PROBE ${JSON.stringify({
        purpose: "diagnostic-not-product-gate", mode, hostReady: started, containmentKill: state.containmentKill,
        exitCode: Exit.isSuccess(exit) ? exit.value : null,
        resultPresent: messages.some((message) => message.type === "RESULT"),
        stderrTruncated: errors.truncated, stderrBytes: errors.buffer.length,
        messages,
      })}\n`
      if (Buffer.byteLength(witness) > 16 * 1024) return yield* Effect.die("PROBE SETUP: bounded witness exceeds 16KiB")
      yield* Effect.promise(() => Bun.stderr.write(witness))
      expect(started).toBe(true)
      expect(errors.truncated).toBe(false)
      expect(messages.filter((message) => message.type === "FIXTURE_ERROR")).toHaveLength(0)
      expect(messages.some((message) => message.type === "RESULT") || state.containmentKill).toBe(true)
      if (state.containmentKill && !messages.some((message) => message.type === "RESULT")) expect(messages.filter((message) => message.type === "SNAPSHOT")).toHaveLength(1)
      // Containment or an ordinary result only validates this diagnostic protocol, never product behavior.
    }).pipe(Effect.scoped, Effect.provide(layer)))
  }, 120_000)
}
