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
import { awaitWithTimeout, it } from "../lib/effect"

const A = "VALID_ARTIFACT_A_913C"
const B = "VALID_ARTIFACT_B_E702"
const INVALID = "INVALID_PARTIAL_ARTIFACT_B_A13E"
const model = ProviderTest.model({ id: ModelV2.ID.make("continuity-model"), providerID: ProviderV2.ID.make("test") })

function held(text: string, output: Stream.Stream<LLMEvent, unknown> = Stream.make(LLMEvent.finish({ reason: "stop" }))) {
  return Effect.gen(function* () {
    return { text, output,
      entered: yield* Deferred.make<{ request: LLM.StreamInput; jobID: string }>(),
      release: yield* Deferred.make<void>(), interrupted: yield* Deferred.make<void>(),
    }
  })
}
type Held = Effect.Success<ReturnType<typeof held>>
function environment(plans: Held[]) {
  const llm = LayerNode.make({ service: LLM.Service, deps: [Session.node, BackgroundJob.node],
    layer: Layer.effect(LLM.Service, Effect.gen(function* () {
      const sessions = yield* Session.Service
      const jobs = yield* BackgroundJob.Service
      const enteredJobs = new Set<string>()
      let index = 0
      return LLM.Service.of({ stream: (request) => Stream.unwrap(Effect.sync(() => {
        const plan = plans[index++]
        if (!plan) return Stream.fail(new Error("unexpected maintenance request"))
        return Stream.concat(Stream.make(LLMEvent.textStart({ id: "summary" }), LLMEvent.textDelta({ id: "summary", text: plan.text })),
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
function begin(sessionID: SessionID, marker: string) {
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
function complete(user: SessionV1.User, marker: string, tokens = 100) {
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
    yield* continuity.start({ sessionID: user.sessionID, message: assistant })
    return assistant
  })
}
function seed() {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const parent = yield* sessions.create({ title: "Continuity service test" })
    for (let index = 0; index < 6; index++) {
      yield* complete(yield* begin(parent.id, `SEED_USER_${index}_C517`), `SEED_REPLY_${index}_027D`, index === 5 ? 50_000 : 100)
    }
    expect(yield* sessions.messages({ sessionID: parent.id })).toHaveLength(12)
    expect((yield* prepare(parent.id)).system).toEqual([])
    return parent.id
  })
}
const entered = (plan: Held) => awaitWithTimeout(Deferred.await(plan.entered), "maintenance stream did not enter", "5 seconds")
function terminal(jobID: string, status: BackgroundJob.Status, output?: string) {
  return Effect.gen(function* () {
    const jobs = yield* BackgroundJob.Service
    const result = yield* jobs.wait({ id: jobID, timeout: 5_000 })
    expect(result.timedOut).toBe(false)
    expect(result.info?.id).toBe(jobID)
    expect(result.info?.status).toBe(status)
    if (output !== undefined) expect(result.info?.output).toBe(output)
  })
}
function prepare(sessionID: SessionID) {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    return yield* continuity.prepare({ sessionID, messages: yield* sessions.messages({ sessionID }) })
  })
}
function applyFirst(sessionID: SessionID, plan: Held) {
  return Effect.gen(function* () {
    const hit = yield* entered(plan)
    yield* Deferred.succeed(plan.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const prepared = yield* prepare(sessionID)
    expect(prepared.system).toEqual([`Continuity context:\n${A}`])
    expect(prepared.messages).toHaveLength(8)
    return prepared
  })
}
it.instance("repeated pass receives prior artifact and only displaced incremental head", () => Effect.gen(function* () {
  const first = yield* held(A)
  const second = yield* held(B)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const firstPrepared = yield* applyFirst(sessionID, first)
    yield* complete(yield* begin(sessionID, "NEW_USER_INCREMENTAL"), "NEW_REPLY_INCREMENTAL", 50_000)
    const hit = yield* entered(second)
    const payload = JSON.parse(String(hit.request.messages[0].content))
    expect(payload.previous).toBe(A)
    expect(payload.history).toHaveLength(2)
    expect(payload.history.map((message: { parts: { text: string }[] }) => message.parts[0].text)).toEqual(["SEED_USER_2_C517", "SEED_REPLY_2_027D"])
    yield* Deferred.succeed(second.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const after = yield* prepare(sessionID)
    expect(after.system).toEqual([`Continuity context:\n${B}`])
    expect(after.messages.slice(0, 6).map((message) => message.info.id)).toEqual(firstPrepared.messages.slice(2).map((message) => message.info.id))
    const sessions = yield* Session.Service
    const durable = yield* sessions.messages({ sessionID })
    expect(durable).toHaveLength(14)
    expect(JSON.stringify(durable)).not.toContain(A)
    expect(JSON.stringify(durable)).not.toContain(B)
    expect(yield* sessions.children(sessionID)).toEqual([])
  }).pipe(Effect.provide(environment([first, second])))
}), 30_000)
for (const failure of ["provider-error", "stream-failure", "tool-attempt"] as const) it.instance(`${failure} preserves existing valid context after partial output`, () => Effect.gen(function* () {
  const first = yield* held(A)
  const output = failure === "stream-failure" ? Stream.fail(new Error("SECRET_CONVERSATION_MARKER")) : Stream.fromIterable([
    failure === "provider-error" ? LLMEvent.providerError({ message: "unique-provider-error" }) : LLMEvent.toolCall({ id: "forbidden", name: "bash", input: { command: "forbidden-command" } }),
    LLMEvent.finish({ reason: "stop" }),
  ])
  const second = yield* held(INVALID, output)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, first)
    yield* complete(yield* begin(sessionID, `FAILURE_USER_${failure}`), `FAILURE_REPLY_${failure}`, 50_000)
    const hit = yield* entered(second)
    const before = yield* prepare(sessionID)
    yield* Deferred.succeed(second.release, undefined)
    yield* terminal(hit.jobID, failure === "stream-failure" ? "error" : "completed", failure === "stream-failure" ? undefined : "discarded")
    expect(yield* prepare(sessionID)).toEqual(before)
    expect(JSON.stringify(yield* prepare(sessionID))).not.toContain(INVALID)
    const jobs = yield* BackgroundJob.Service
    expect((yield* jobs.list()).filter((job) => job.status === "running")).toEqual([])
    if (failure === "stream-failure") {
      expect((yield* jobs.get(hit.jobID))?.error).toBe("Continuity maintenance failed")
      expect(JSON.stringify(yield* jobs.list())).not.toContain("SECRET_CONVERSATION_MARKER")
    }
  }).pipe(Effect.provide(environment([first, second])))
}), 30_000)

it.instance("historical invalidation discards stored context and in-flight artifact", () => Effect.gen(function* () {
  const first = yield* held(A)
  const stale = yield* held(INVALID)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, first)
    yield* complete(yield* begin(sessionID, "EDIT_PENDING_USER"), "EDIT_PENDING_REPLY", 50_000)
    const hit = yield* entered(stale)
    const continuity = yield* SessionContinuity.Service
    yield* continuity.invalidate(sessionID)
    const sessions = yield* Session.Service
    const history = yield* sessions.messages({ sessionID })
    const part = history[0].parts[0]
    if (part.type !== "text") throw new Error("expected fixture text")
    yield* sessions.updatePart({ ...part, text: "EDITED_HEAD_FACT" })
    expect((yield* prepare(sessionID)).system).toEqual([])
    yield* Deferred.succeed(stale.release, undefined)
    yield* terminal(hit.jobID, "completed", "discarded")
    expect((yield* prepare(sessionID)).system).toEqual([])
    expect(JSON.stringify(yield* prepare(sessionID))).toContain("EDITED_HEAD_FACT")
  }).pipe(Effect.provide(environment([first, stale])))
}), 30_000)
it.instance("cancellation preserves context and permits next safe start", () => Effect.gen(function* () {
  const first = yield* held(A)
  const cancelled = yield* held(INVALID)
  const next = yield* held(B)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    yield* applyFirst(sessionID, first)
    yield* complete(yield* begin(sessionID, "CANCEL_USER"), "CANCEL_REPLY", 50_000)
    const hit = yield* entered(cancelled)
    const before = yield* prepare(sessionID)
    const jobs = yield* BackgroundJob.Service
    yield* awaitWithTimeout(jobs.cancel(hit.jobID), "cancellation did not finish", "5 seconds")
    yield* awaitWithTimeout(Deferred.await(cancelled.interrupted), "stream was not interrupted", "5 seconds")
    yield* terminal(hit.jobID, "cancelled")
    expect(yield* prepare(sessionID)).toEqual(before)
    expect(yield* Deferred.isDone(cancelled.release)).toBe(false)
    yield* complete(yield* begin(sessionID, "AFTER_CANCEL_USER"), "AFTER_CANCEL_REPLY", 50_000)
    const nextHit = yield* entered(next)
    expect(nextHit.jobID).not.toBe(hit.jobID)
    yield* Deferred.succeed(next.release, undefined)
    yield* terminal(nextHit.jobID, "completed", "applied")
    expect((yield* prepare(sessionID)).system).toEqual([`Continuity context:\n${B}`])
  }).pipe(Effect.provide(environment([first, cancelled, next])))
}), 30_000)
for (const ongoing of [false, true]) it.instance(`pending refresh respects parent safe boundary; ongoing=${ongoing}`, () => Effect.gen(function* () {
  const stale = yield* held(INVALID)
  const fresh = yield* held(B)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const old = yield* entered(stale)
    yield* complete(yield* begin(sessionID, "PENDING_USER"), "PENDING_REPLY", 100)
    const user = ongoing ? yield* begin(sessionID, "ONGOING_USER") : undefined
    expect(yield* Deferred.isDone(fresh.entered)).toBe(false)
    yield* Deferred.succeed(stale.release, undefined)
    yield* terminal(old.jobID, "completed", "discarded")
    if (user) {
      expect(yield* Deferred.isDone(fresh.entered)).toBe(false)
      const jobs = yield* BackgroundJob.Service
      expect((yield* jobs.list()).filter((job) => job.status === "running")).toEqual([])
      yield* complete(user, "ONGOING_COMPLETED_REPLY", 100)
    }
    const hit = yield* entered(fresh)
    expect((yield* prepare(sessionID)).system).toEqual([])
    yield* Deferred.succeed(fresh.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    expect((yield* prepare(sessionID)).system).toEqual([`Continuity context:\n${B}`])
  }).pipe(Effect.provide(environment([stale, fresh])))
}), 30_000)
