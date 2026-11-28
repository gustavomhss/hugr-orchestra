import { expect, test } from "bun:test"
import { Deferred, Effect, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { reply, run, stage, text, type Controls } from "./fixture/lucy-engagement"
import { decoded, nativeCode, reader, refused, request } from "./fixture/lucy-engagement-artifacts"

/** Genuine provider events; every query still crosses native scope, permissions, Git and SQLite. */
function queries(first: number, count: number) {
  const name = "code_query"
  const input = { op: "symbols", name: "sharedValue" }
  return Stream.fromIterable([
    LLMEvent.stepStart({ index: 0 }),
    ...Array.from({ length: count }, (_, index) => {
      const id = `evidence_bound_${String(first + index).padStart(3, "0")}`
      return [LLMEvent.toolInputStart({ id, name }), LLMEvent.toolInputDelta({ id, name, text: JSON.stringify(input) }),
        LLMEvent.toolInputEnd({ id, name }), LLMEvent.toolCall({ id, name, input })]
    }).flat(),
    LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }), LLMEvent.finish({ reason: "tool-calls" }),
  ])
}

test("128 actual completed CODE queries fit; the 129th cannot publish a partial completed evidence receipt", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const firstLensDone = yield* Deferred.make<void>()
    const lenses: string[] = []
    const turns = new Map<string, number>()
    let lead: string | undefined
    let observed = false
    let observe: (() => Effect.Effect<void>) | undefined
    const stream: NonNullable<Controls["stream"]> = (log, modelRequest) => {
      const current = stage(log.text)
      if (current === "entry") {
        if (lead === undefined) {
          lead = log.sessionID
          return queries(1, 45)
        }
        expect(log.sessionID).toBe(lead)
        return text(reply(log, modelRequest, { quote: true }))
      }
      if (current !== "lens") return text(reply(log, modelRequest, { quote: true }))
      if (!turns.has(log.sessionID) && lenses.length < 2) lenses.push(log.sessionID)
      const slot = lenses.indexOf(log.sessionID)
      if (slot < 0) return text(reply(log, modelRequest, { quote: true }))
      const turn = turns.get(log.sessionID) ?? 0
      turns.set(log.sessionID, turn + 1)
      if (turn === 0) return slot === 0 ? queries(46, 42) : queries(88, 41)
      if (slot === 0) return Stream.unwrap(Deferred.succeed(firstLensDone, undefined).pipe(
        Effect.as(text(reply(log, modelRequest, { quote: true }))),
      ))
      if (turn === 1) return Stream.unwrap(Effect.gen(function* () {
        yield* Deferred.await(firstLensDone)
        if (!observe) return yield* Effect.die("real CODE boundary observation was not installed")
        // Both real lens continuations now acknowledge 45 + 42 + 41 completed calls.
        yield* observe()
        return queries(129, 1)
      }))
      return text(reply(log, modelRequest, { quote: true }))
    }
    yield* root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      observe = () => Effect.gen(function* () {
        if (!lead || lenses.length !== 2) return yield* Effect.die("three actual owned Sessions were not reached")
        const calls = (yield* Effect.forEach([lead, ...lenses], (id) => nativeCode(host, id))).flat()
        expect(calls).toHaveLength(128)
        expect(calls.every((call) => call.name === "code_query" && call.status === "completed" && call.providerExecuted !== true)).toBe(true)
        expect(new Set(calls.map((call) => call.id)).size).toBe(128)
        expect(calls.every((call) => call.body.includes("sharedValue"))).toBe(true)
        expect(calls.every((call) => !call.body.includes("ENGAGEMENT-OUTSIDE"))).toBe(true)
        observed = true
      })
      const input = request("real-operation-bound")
      expect(input.timeBoxMinutes).toBe(5)
      const output = yield* host.invoke(input)
      expect(observed, "the first 128 actual native settlements must precede the boundary request").toBe(true)
      refused(output, "engagement-evidence-bound-exceeded")
      const boundary = (yield* nativeCode(host, lenses[1])).filter((call) => call.id === "evidence_bound_129")
      expect(boundary).toHaveLength(1)
      expect(boundary[0].status).not.toBe("completed")
      expect((yield* host.execution.active).size).toBe(0)
      const count = root.requests.length
      const stopped = yield* host.invoke(input)
      const report = decoded(stopped)
      expect(report.status).toBe("failed")
      expect(report.budget.deadlineAt - report.budget.startedAt).toBe(300_000)
      expect(report.report).toBeUndefined()
      expect(report.notExamined).toContainEqual({ item: "engagement:evidence-publication", reason: "failure" })
      const unavailable = yield* host.call(reader, { op: "manifest", reportID: report.reportID })
      refused(unavailable, "engagement-evidence-unavailable")
      expect(unavailable.text).toContain("terminal-status")
      expect((yield* host.invoke(input)).text).toBe(stopped.text)
      expect(root.requests.length).toBe(count)
    }), { stream })
  })))
}, 600_000)
