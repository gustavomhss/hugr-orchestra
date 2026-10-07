import { expect } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { ContextCompactTool } from "@/tool/context-compact"
import * as Tool from "@/tool/tool"
import { SessionContinuity } from "@/continuity/service"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { model } from "./memory-fixture"
import { it } from "../lib/effect"
import { FIRST, begin, entered, environment, held, prepare, seed, terminal } from "./service-fixture"

it.instance("compact waits for running maintenance, then finds the context under the hard limit", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const hit = yield* entered(first)
    const continuity = yield* SessionContinuity.Service
    const waiting = yield* continuity.compact({ sessionID, canRecall: true }).pipe(Effect.forkChild)
    yield* Effect.yieldNow
    expect(waiting.pollUnsafe()).toBeUndefined()
    yield* Deferred.succeed(first.release, undefined)
    expect(yield* Fiber.join(waiting)).toBe("fits")
    yield* terminal(hit.jobID, "completed", "applied")
    expect((yield* prepare(sessionID)).system[0]).toContain(FIRST)
  }).pipe(Effect.provide(environment([first])))
}), 30_000)

it.instance("a forced compaction runs a pass below the trigger", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  yield* Effect.gen(function* () {
    // At trigger 0.5 the seed's 50,000 tokens on a 200,000-token window start nothing on their own.
    const sessionID = yield* seed()
    const continuity = yield* SessionContinuity.Service
    const forced = yield* continuity.compact({ sessionID, canRecall: true, force: true }).pipe(Effect.forkChild)
    const hit = yield* entered(first)
    yield* Deferred.succeed(first.release, undefined)
    expect(yield* Fiber.join(forced)).toBe("applied")
    yield* terminal(hit.jobID, "completed", "applied")
    expect((yield* prepare(sessionID)).system[0]).toContain(FIRST)
  }).pipe(Effect.provide(environment([first], { config: { continuity: { trigger: 0.5 } } })))
}), 30_000)

it.instance("past the hard limit with no usable pass, every old result the archive can restore is masked", () => Effect.gen(function* () {
  // A 20,000-token window: the hard limit is 18,000. No producer reply exists, so every pass fails.
  const small = { ...model, limit: { context: 20_000, output: 2_000 } }
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const history = yield* sessions.messages({ sessionID })
    // A large result inside the last five steps: ordinary masking never reaches it.
    const recent = history[9]
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: recent.info.id, type: "tool", tool: "read", callID: "call_large",
      state: { status: "completed", input: { filePath: "build.log" }, output: "build log line\n".repeat(8_000), title: "build.log",
        metadata: {}, time: { start: 1, end: 2 } } })
    expect(yield* continuity.compact({ sessionID, canRecall: true })).toBe("masked")
    const prepared = yield* prepare(sessionID)
    const part = prepared.messages.find((message) => message.info.id === recent.info.id)!.parts.find((item) => item.type === "tool")!
    if (part.type !== "tool" || part.state.status !== "completed") throw new Error("Expected the completed read")
    expect(part.state.output).toStartWith("[masked tool result: read filePath=build.log")
    // Without recall a stub could not be restored, so nothing is masked and the request may overflow.
    expect(yield* continuity.compact({ sessionID, canRecall: false })).toBe("over")
  }).pipe(Effect.provide(environment([], { getModel: () => Effect.succeed(small) })))
}), 30_000)

it.instance("the agent's context_compact tool runs a forced pass on its own session", () => Effect.gen(function* () {
  const first = yield* held(FIRST)
  yield* Effect.gen(function* () {
    // At trigger 0.5 the seed starts nothing on its own: only the tool runs the pass.
    const sessionID = yield* seed()
    const tool = yield* Tool.init(yield* ContextCompactTool)
    const call = yield* tool.execute({}, { sessionID, messageID: MessageID.ascending(), agent: "build", abort: AbortSignal.any([]),
      messages: [], metadata: () => Effect.void, ask: () => Effect.void }).pipe(Effect.forkChild)
    const hit = yield* entered(first)
    yield* Deferred.succeed(first.release, undefined)
    const result = yield* Fiber.join(call)
    expect(result.metadata).toEqual({ outcome: "applied", truncated: false })
    expect(result.output).toStartWith("Working memory updated")
    yield* terminal(hit.jobID, "completed", "applied")
    expect((yield* prepare(sessionID)).system[0]).toContain(FIRST)
  }).pipe(Effect.provide(environment([first], { config: { continuity: { trigger: 0.5 } } })))
}), 30_000)

it.instance("below the trigger, a long turn is pruned by steps every PRUNE_STEP of growth, with no model call", () => Effect.gen(function* () {
  yield* Effect.gen(function* () {
    // At trigger 0.5 the seed's 50,000 tokens on a 200,000-token window start no pass.
    const sessionID = yield* seed()
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const user = yield* begin(sessionID, "Fix the build")
    // One autonomous turn: eight tool-call steps, the first reading a large log.
    const steps: SessionV1.Assistant[] = []
    for (let index = 0; index < 8; index++) {
      const step: SessionV1.Assistant = {
        id: MessageID.ascending(), sessionID, parentID: user.id, role: "assistant", agent: "build", mode: "build",
        path: { cwd: "/test", root: "/test" }, modelID: user.model.modelID, providerID: user.model.providerID, cost: 0,
        tokens: { input: 52_000 + index * 1_500, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        finish: "tool-calls", time: { created: Date.now(), completed: Date.now() },
      }
      yield* sessions.updateMessage(step)
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: step.id, type: "tool", tool: "read", callID: `call_${index}`,
        state: { status: "completed", input: { filePath: `step-${index}.log` }, output: `step ${index} log line\n`.repeat(index ? 10 : 8_000),
          title: "read", metadata: {}, time: { start: 1, end: 2 } } })
      steps.push(step)
      yield* continuity.start({ sessionID, message: step, canRecall: true })
      const output = (yield* prepare(sessionID)).messages.find((message) => message.info.id === steps[0].id)!.parts[0]
      if (output.type !== "tool" || output.state.status !== "completed") throw new Error("Expected the completed read")
      // Step 6 is the first past 60,000 tokens (the seed's 50,000 plus PRUNE_STEP), and the read has left the last five steps.
      expect(output.state.output.startsWith("[masked tool result: read filePath=step-0.log")).toBe(index >= 6)
    }
    expect((yield* prepare(sessionID)).system).toEqual([])
  }).pipe(Effect.provide(environment([], { config: { continuity: { trigger: 0.5 } } })))
}), 30_000)
