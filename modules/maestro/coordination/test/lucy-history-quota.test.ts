import { expect, test } from "bun:test"
import { Deferred, Effect, Schema, Stream } from "effect"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { reply, run, sourcePath, sourceText, stage, text, type Controls } from "./fixture/lucy-engagement"
import { decoded } from "./fixture/lucy-engagement-artifacts"
import { calls, failed, type Call } from "./fixture/lucy-engagement-artifact-limits"
import { completed, History, native, request, retained } from "./fixture/lucy-history"

const queries = (prefix: string, count: number): Call[] => Array.from({ length: count }, (_, i) => ({
  id: prefix + "_" + i, name: "code_query", input: { op: "symbols", name: "sharedValue" },
}))
const historyCalls: Call[] = [
  { id: "quota_history_show", name: "review_history", input: { op: "show", path: sourcePath } },
  { id: "quota_history_log", name: "review_history", input: { op: "log", path: sourcePath } },
]

for (const scenario of ["exact128", "concurrent129"] as const) {
  test(`H09 ${scenario}: history and CODE consume one original 128-operation budget across owned Sessions`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => Effect.gen(function* () {
      const firstLensDone = yield* Deferred.make<void>()
      const raceReady = yield* Deferred.make<void>()
      const lenses: string[] = []
      const turns = new Map<string, number>()
      let lead: string | undefined
      let waiting = 0
      let observed = false
      let observe: (() => Effect.Effect<void>) | undefined
      const stream: NonNullable<Controls["stream"]> = (log, modelRequest) => {
        const current = stage(log.text)
        if (current === "entry") {
          if (lead === undefined) {
            lead = log.sessionID
            // 43 CODE + 2 history = 45 real native calls; below Deep's existing 50-call Session cap.
            return calls([...queries("lead_code", 43), ...historyCalls])
          }
          expect(log.sessionID).toBe(lead)
          return text(reply(log, modelRequest))
        }
        if (current !== "lens") return text(reply(log, modelRequest))
        if (!turns.has(log.sessionID) && lenses.length < 2) lenses.push(log.sessionID)
        const slot = lenses.indexOf(log.sessionID)
        if (slot < 0) return text(reply(log, modelRequest))
        const turn = turns.get(log.sessionID) ?? 0
        turns.set(log.sessionID, turn + 1)
        if (turn === 0) return calls(queries("lens" + slot + "_code",
          scenario === "exact128" ? slot === 0 ? 42 : 41 : 40))
        if (turn > 1) return text(reply(log, modelRequest))
        if (scenario === "exact128") {
          if (slot === 0) return Stream.unwrap(Deferred.succeed(firstLensDone, undefined).pipe(
            Effect.as(text(reply(log, modelRequest)))))
          return Stream.unwrap(Effect.gen(function* () {
            yield* Deferred.await(firstLensDone)
            if (!observe) return yield* Effect.die("quota observation absent")
            yield* observe()
            return text(reply(log, modelRequest))
          }))
        }
        return Stream.unwrap(Effect.gen(function* () {
          waiting++
          if (waiting === 2) yield* Deferred.succeed(raceReady, undefined)
          yield* Deferred.await(raceReady)
          if (!observe) return yield* Effect.die("concurrent quota observation absent")
          yield* observe()
          // Both continuations were paused after 125 successful captures; four new requests contend for three slots.
          return calls(queries("race" + slot, 2))
        }))
      }
      yield* root.open((host) => Effect.gen(function* () {
        yield* host.prepareIndex()
        observe = () => Effect.gen(function* () {
          if (!lead || lenses.length !== 2) return yield* Effect.die("actual lead and two lens Sessions were not reached")
          const events = (yield* Effect.forEach([lead, ...lenses], (id) => native(host, id))).flat()
          const code = events.filter((event) => event.name === "code_query" && !event.toolCallID.startsWith("race"))
          expect(code).toHaveLength(scenario === "exact128" ? 126 : 123)
          expect(code.every((event) => event.state.status === "completed" && event.providerExecuted !== true)).toBe(true)
          expect(code.every((event) => event.text.includes("sharedValue") && !event.text.includes("ENGAGEMENT-OUTSIDE"))).toBe(true)
          const histories = yield* Effect.forEach(historyCalls, (call) => completed(host, lead!, call.id))
          expect(histories).toHaveLength(2)
          for (const event of histories) {
            const value = Schema.decodeUnknownSync(History)(JSON.parse(event.text), { onExcessProperty: "error" })
            expect(value.anchorCommit).toBe(root.head)
            expect(value.path).toBe(sourcePath)
            expect(value.sourceSha256).toMatch(/^[0-9a-f]{64}$/)
            expect(value.complete).toBe(true)
            if (event.toolCallID === "quota_history_show") expect(value.text).toBe(sourceText)
          }
          expect(new Set([...code, ...histories].map((event) => event.toolCallID)).size).toBe(code.length + 2)
          observed = true
        }).pipe(Effect.orDie)
        const input = request("shared-quota-" + scenario, "diligence")
        const output = yield* host.invoke(input)
        expect(observed, "positive native CODE and history must reach the shared boundary before checking refusal").toBe(true)
        if (!lead) return yield* Effect.die("lead absent after execution")
        const events = (yield* Effect.forEach([lead, ...lenses], (id) => native(host, id))).flat()
        const source = events.filter((event) => event.name === "code_query" || event.name === "review_history")
        if (scenario === "exact128") {
          const report = decoded(output)
          expect(report.status).toBe("completed")
          expect(source).toHaveLength(128)
          expect(source.every((event) => event.state.status === "completed")).toBe(true)
          const evidence = yield* retained(host, report)
          expect(evidence.proofs).toHaveLength(2)
          const codeOperations = evidence.value.operations.filter((operation) =>
            typeof operation === "object" && operation !== null && "kind" in operation && operation.kind === "code")
          expect(codeOperations).toHaveLength(126)
          expect(codeOperations.length + evidence.proofs.length).toBe(128)
        } else {
          expect(waiting).toBe(2)
          const racing = source.filter((event) => event.toolCallID.startsWith("race"))
          expect(racing).toHaveLength(4)
          expect(racing.some((event) => event.state.status !== "completed")).toBe(true)
          // Cancellation of a sibling may prevent an already admitted result being emitted; safety requires no overshoot.
          expect(source.filter((event) => event.state.status === "completed").length).toBeLessThanOrEqual(128)
          const report = yield* failed(host, root, input, output)
          expect(report.source?.commit).toBe(root.head)
        }
      }), { stream })
    })))
  }, 600_000)
}

