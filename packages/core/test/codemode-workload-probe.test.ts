import { expect, test } from "bun:test"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Deferred, Effect, Exit, Fiber, Option, Schema, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { AppProcess } from "../src/process"
import { expectSpawn } from "./fixture/omni-expect"

// Temporary calibration only. A passing probe validates measurement/containment, never product deadline enforcement.
const index = path.resolve(import.meta.dir, "../../codemode/src/index.ts")
const fixture = path.join(import.meta.dir, "fixture/codemode-deadline.mjs")
const Envelope = Schema.Struct({ type: Schema.String, payload: Schema.Unknown })
const maxBytes = 64 * 1024
const layer = AppNodeBuilder.build(AppProcess.node)

for (const N of [512, 2048, 4096]) {
  test(`PROBE ONLY E10 repeated full-input lookaheads N=${N}`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(Effect.gen(function* () {
      const processes = yield* AppProcess.Service
      const child = yield* processes.spawn(ChildProcess.make(process.execPath, [fixture, pathToFileURL(index).href, `probe-${N}`], {
        stdin: "ignore", stdout: "pipe", stderr: "pipe", killSignal: "SIGKILL", forceKillAfter: 100,
      }))
      const admitted = yield* Deferred.make<void>()
      const messages = new Array<typeof Envelope.Type>()
      const state = { pending: "", bytes: 0, containmentKill: false }
      const decoder = new TextDecoder()
      const output = yield* Effect.forkChild(child.stdout.pipe(Stream.runForEach((chunk) => Effect.gen(function* () {
        state.bytes += chunk.length
        if (state.bytes > maxBytes) return yield* Effect.die("PROBE SETUP: stdout exceeds 64KiB")
        const lines = (state.pending + decoder.decode(chunk, { stream: true })).split("\n")
        state.pending = lines.pop() ?? ""
        yield* Effect.forEach(lines.filter(Boolean), (line) => Effect.gen(function* () {
          const message = Schema.decodeUnknownSync(Envelope)(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(line))
          messages.push(message)
          if (message.type === "CPU_PHASE_ADMITTED") yield* Deferred.succeed(admitted, undefined)
        }))
      }))))
      const errorOutput = yield* Effect.forkChild(AppProcess.collectStream(child.stderr, maxBytes))
      const exited = yield* Effect.forkChild(Effect.exit(child.exitCode))
      const started = yield* Effect.raceFirst(
        Fiber.join(exited).pipe(Effect.as(false)), Deferred.await(admitted).pipe(Effect.as(true)),
      ).pipe(Effect.timeout("30 seconds"))
      const exit = started
        ? yield* Effect.raceFirst(Fiber.join(exited), Effect.sleep(6500).pipe(
            Effect.andThen(Effect.sync(() => { state.containmentKill = true })),
            Effect.andThen(child.kill({ killSignal: "SIGKILL" })), Effect.andThen(Fiber.join(exited)),
          ))
        : yield* Fiber.join(exited)
      yield* Fiber.join(output)
      const errors = yield* Fiber.join(errorOutput)
      const input = Schema.decodeUnknownOption(Schema.Struct({ N: Schema.Number, patternBytes: Schema.Number, subjectBytes: Schema.Number }))(
        messages.find((message) => message.type === "PROBE_INPUT")?.payload,
      )
      const mark = Schema.decodeUnknownOption(Schema.Struct({ elapsedToMark: Schema.Number }))(
        messages.find((message) => message.type === "CPU_PHASE_ADMITTED")?.payload,
      )
      const resultPayload = messages.find((message) => message.type === "RESULT")?.payload
      const observation = Schema.decodeUnknownOption(Schema.Struct({
        result: Schema.Struct({ ok: Schema.Boolean, error: Schema.optionalKey(Schema.Struct({ kind: Schema.String, message: Schema.String })) }),
        facts: Schema.Struct({
          elapsedAfterMarkMs: Schema.Number, maxGapMs: Schema.Number, heartbeats: Schema.Number,
          afterCalls: Schema.Number, slowCompleted: Schema.Number, slowInterrupted: Schema.Number,
        }),
      }))(resultPayload)
      const fixtureErrors = messages.filter((message) => message.type === "FIXTURE_ERROR")
      const failure = Schema.decodeUnknownOption(Schema.Struct({ name: Schema.String, message: Schema.String }))(fixtureErrors.at(0)?.payload)
      const ready = messages.some((message) => message.type === "FIXTURE_READY")
      const warmup = messages.some((message) => message.type === "WARMUP_READY")
      const witness = `E10_WORKLOAD_PROBE ${JSON.stringify({
        N, productVerdict: "not-a-product-gate", artifact: path.basename(index),
        patternBytes: Option.isSome(input) ? input.value.patternBytes : null,
        subjectBytes: Option.isSome(input) ? input.value.subjectBytes : null,
        ready, warmup, elapsedToMark: Option.isSome(mark) ? mark.value.elapsedToMark : null,
        eligibleTiming: Option.isSome(mark) && mark.value.elapsedToMark >= 0 && mark.value.elapsedToMark < 750,
        containmentKill: state.containmentKill, exitCode: Exit.isSuccess(exit) ? exit.value : null,
        resultPresent: resultPayload !== undefined,
        result: Option.isSome(observation) ? {
          status: observation.value.result.ok ? "success" : "failure",
          kind: observation.value.result.error?.kind.slice(0, 32) ?? null,
          messageTail: observation.value.result.error?.message.slice(-160) ?? null,
          elapsedAfterMarkMs: observation.value.facts.elapsedAfterMarkMs, maxGapMs: observation.value.facts.maxGapMs,
          heartbeats: observation.value.facts.heartbeats, afterCalls: observation.value.facts.afterCalls,
          slowCompleted: observation.value.facts.slowCompleted, slowInterrupted: observation.value.facts.slowInterrupted,
        } : null,
        heartbeatMessages: messages.filter((message) => message.type === "HEARTBEAT").length,
        fixtureErrors: { count: fixtureErrors.length, first: Option.isSome(failure)
          ? { name: failure.value.name.slice(0, 40), message: failure.value.message.slice(0, 100) } : null },
      })}\n`
      if (Buffer.byteLength(witness) > 2048) return yield* Effect.die("PROBE SETUP: witness exceeds 2KiB")
      yield* Effect.promise(() => Bun.stderr.write(witness))
      expect(errors.truncated).toBe(false)
      expect(ready).toBe(true)
      expect(warmup).toBe(true)
      expect(fixtureErrors).toHaveLength(0)
      expect(Option.isSome(input)).toBe(true)
      if (Option.isNone(input)) return yield* Effect.die("PROBE SETUP: no input-size witness")
      expect(input.value.N).toBe(N)
      expect(input.value.subjectBytes).toBe(8 * 1024 * 1024)
      expect(input.value.patternBytes).toBeLessThanOrEqual(40 * 1024)
      expect(resultPayload !== undefined || state.containmentKill).toBe(true)
      if (resultPayload !== undefined) expect(Option.isSome(observation)).toBe(true)
      // No assertion here calls a timeout, fast return, or external kill a product success.
    }).pipe(Effect.scoped, Effect.provide(layer)))
  }, 120_000)
}
