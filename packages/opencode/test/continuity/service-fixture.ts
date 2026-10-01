import { expect } from "bun:test"
import { Deferred, Effect, Layer, Stream } from "effect"
import { LLMEvent } from "@opencode-ai/llm"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Database } from "@opencode-ai/core/database/database"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { BackgroundJob } from "@/background/job"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionContinuity } from "@/continuity/service"
import { ProviderTest } from "../fake/provider"
import { awaitWithTimeout } from "../lib/effect"
import { bodyFromRequest, readExactFrames, wireInput } from "./fixtures"
import type { ExactReason } from "@/continuity/types"

export const A = "SEED_USER_0_C517"
export const B = "SEED_USER_2_C517"
const model = ProviderTest.model({ id: ModelV2.ID.make("continuity-model"), providerID: ProviderV2.ID.make("test") })

export function held(literal: string, output: Stream.Stream<LLMEvent, unknown> = Stream.make(LLMEvent.finish({ reason: "stop" })), raw = false, retire?: string, reason: ExactReason = "identifier") {
  return Effect.gen(function* () {
    return { respond: (request: LLM.StreamInput) => raw ? literal : JSON.stringify(bodyFromRequest(wireInput(request), literal, retire, reason)), output,
      entered: yield* Deferred.make<{ request: LLM.StreamInput; jobID: string }>(),
      release: yield* Deferred.make<void>(), interrupted: yield* Deferred.make<void>(),
    }
  })
}
type Held = Effect.Success<ReturnType<typeof held>>
export function environment(plans: Held[]) {
  const llm = LayerNode.make({ service: LLM.Service, deps: [Session.node, BackgroundJob.node],
    layer: Layer.effect(LLM.Service, Effect.gen(function* () {
      const sessions = yield* Session.Service
      const jobs = yield* BackgroundJob.Service
      const enteredJobs = new Set<string>()
      let index = 0
      return LLM.Service.of({ stream: (request) => Stream.unwrap(Effect.sync(() => {
        const plan = plans[index++]
        if (!plan) return Stream.fail(new Error("unexpected maintenance request"))
        const text = plan.respond(request)
        return Stream.concat(Stream.make(LLMEvent.textStart({ id: "summary" }), LLMEvent.textDelta({ id: "summary", text })),
          Stream.unwrap(Effect.gen(function* () {
            const running = (yield* jobs.list()).filter((job) => job.status === "running" && !enteredJobs.has(job.id))
            expect(running).toHaveLength(1)
            const job = running[0]
            if (typeof job.metadata?.sessionId !== "string") throw new Error("missing parent session metadata")
            const history = yield* sessions.messages({ sessionID: SessionID.make(job.metadata.sessionId) })
            expect(job.id).toContain(`:${history.at(-1)?.info.id}:`)
            enteredJobs.add(job.id)
            yield* Deferred.succeed(plan.entered, { request, jobID: job.id })
            yield* Deferred.await(plan.release).pipe(Effect.onInterrupt(() => Deferred.succeed(plan.interrupted, undefined)))
            return plan.output
          })))
      })) })
    })),
  })
  return AppNodeBuilder.build(LayerNode.group([
    SessionContinuity.node, Session.node, BackgroundJob.node, SessionProjector.node,
    Database.node, EventV2Bridge.node, CrossSpawnSpawner.node,
  ]), [
    [LLM.node, llm],
    [Provider.node, Layer.mock(Provider.Service, { getModel: (providerID, modelID) => {
      expect(providerID).toBe(model.providerID)
      expect(modelID).toBe(model.id)
      return Effect.succeed(model)
    } })],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
    [Plugin.node, Layer.mock(Plugin.Service, { init: () => Effect.void, list: () => Effect.succeed([]), trigger: (_name, _input, output) => Effect.succeed(output) })],
  ])
}
export function begin(sessionID: SessionID, marker: string) {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    yield* continuity.advance(sessionID)
    const user: SessionV1.User = { id: MessageID.ascending(), sessionID, role: "user", time: { created: Date.now() }, agent: "build", model: { providerID: model.providerID, modelID: model.id } }
    yield* sessions.updateMessage(user)
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: user.id, type: "text", text: marker })
    return user
  })
}
export function complete(user: SessionV1.User, marker: string, tokens = 100, canRecall = false) {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const assistant: SessionV1.Assistant = {
      id: MessageID.ascending(), sessionID: user.sessionID, parentID: user.id, role: "assistant", agent: "build", mode: "build",
      path: { cwd: "/test", root: "/test" }, modelID: model.id, providerID: model.providerID, cost: 0,
      tokens: { input: tokens, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      finish: "stop", time: { created: Date.now(), completed: Date.now() },
    }
    yield* sessions.updateMessage(assistant)
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID: user.sessionID, messageID: assistant.id, type: "text", text: marker })
    yield* continuity.start({ sessionID: user.sessionID, message: assistant, canRecall })
    return assistant
  })
}
export function seed(replacement = B, first = A, receipt?: string, canRecall = false) {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const parent = yield* sessions.create({ title: "Continuity service test" })
    for (let index = 0; index < 6; index++) {
      const assistant = yield* complete(yield* begin(parent.id, index === 0 ? first : index === 2 ? replacement : `SEED_USER_${index}_C517`), `SEED_REPLY_${index}_027D`, index === 5 ? 50_000 : 100, canRecall)
      if (index === 0 && receipt !== undefined) yield* sessions.updatePart({
        id: PartID.ascending(), sessionID: parent.id, messageID: assistant.id, type: "tool", tool: "bash", callID: `cli_${assistant.id}`,
        state: { status: "completed", input: { command: "local-check --read-only" }, output: receipt,
          title: "Recorded local failure", metadata: { exit: 75, truncated: false }, time: { start: 1, end: 2 } },
      })
    }
    expect(yield* sessions.messages({ sessionID: parent.id })).toHaveLength(12)
    expect((yield* prepare(parent.id)).system).toEqual([])
    return parent.id
  })
}
export const entered = (plan: Held) => awaitWithTimeout(Deferred.await(plan.entered), "maintenance stream did not enter", "5 seconds")
export function terminal(jobID: string, status: BackgroundJob.Status, output?: string) {
  return Effect.gen(function* () {
    const jobs = yield* BackgroundJob.Service
    const result = yield* jobs.wait({ id: jobID, timeout: 5_000 })
    expect(result.timedOut).toBe(false)
    expect(result.info?.id).toBe(jobID)
    expect(result.info?.status).toBe(status)
    if (output !== undefined) expect(result.info?.output).toBe(output)
  })
}
export function prepare(sessionID: SessionID, canRecall = false) {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    return yield* continuity.prepare({ sessionID, messages: yield* sessions.messages({ sessionID }), canRecall })
  })
}
export function applyFirst(sessionID: SessionID, plan: Held, literal = A) {
  return Effect.gen(function* () {
    const hit = yield* entered(plan)
    yield* Deferred.succeed(plan.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const prepared = yield* prepare(sessionID)
    expect(prepared.system).toHaveLength(1)
    expect(readExactFrames(prepared.system[0]).some((entry) => entry.value === literal)).toBe(true)
    expect(prepared.system[0]).toContain("continuity_handoff")
    expect(prepared.messages).toHaveLength(8)
    return prepared
  })
}
