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
import { bodyFromRequest, readExactFrames, readSourceCatalogue, selectSource, wireInput } from "./fixtures"
import type { ExactReason } from "@/continuity/types"

const A = "SEED_USER_0_C517"
const B = "SEED_USER_2_C517"
const INVALID = "INVALID_PARTIAL_ARTIFACT_B_A13E"
const model = ProviderTest.model({ id: ModelV2.ID.make("continuity-model"), providerID: ProviderV2.ID.make("test") })

function held(literal: string, output: Stream.Stream<LLMEvent, unknown> = Stream.make(LLMEvent.finish({ reason: "stop" })), raw = false, retire?: string, reason: ExactReason = "identifier") {
  return Effect.gen(function* () {
    return { respond: (request: LLM.StreamInput) => raw ? literal : JSON.stringify(bodyFromRequest(wireInput(request), literal, retire, reason)), output,
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
function seed(replacement = B, first = A, receipt?: string) {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const parent = yield* sessions.create({ title: "Continuity service test" })
    for (let index = 0; index < 6; index++) {
      const assistant = yield* complete(yield* begin(parent.id, index === 0 ? first : index === 2 ? replacement : `SEED_USER_${index}_C517`), `SEED_REPLY_${index}_027D`, index === 5 ? 50_000 : 100)
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
function applyFirst(sessionID: SessionID, plan: Held, literal = A) {
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
it.instance("repeated pass receives prior artifact and only displaced incremental head", () => Effect.gen(function* () {
  const first = yield* held(A)
  const second = yield* held(B)
  yield* Effect.gen(function* () {
    const sessionID = yield* seed()
    const firstPrepared = yield* applyFirst(sessionID, first)
    yield* complete(yield* begin(sessionID, "NEW_USER_INCREMENTAL"), "NEW_REPLY_INCREMENTAL", 50_000)
    const hit = yield* entered(second)
    const catalogue = readSourceCatalogue(wireInput(hit.request))
    expect(catalogue.parentID).toBe(sessionID)
    expect(JSON.stringify(catalogue.previous)).toContain(A)
    const sessions = yield* Session.Service
    const history = yield* sessions.messages({ sessionID })
    const head = catalogue.units.filter((unit) => unit.origin === "head")
    expect([...new Set(head.map((unit) => unit.locator.messageID))]).toEqual(history.slice(4, 6).map((message) => message.info.id))
    expect(selectSource(head, B).role).toBe("user")
    expect(selectSource(head, "SEED_REPLY_2_027D").role).toBe("assistant")
    expect(JSON.stringify(head)).not.toContain(A)
    expect(JSON.stringify(head)).not.toContain("NEW_USER_INCREMENTAL")
    yield* Deferred.succeed(second.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const after = yield* prepare(sessionID)
    expect(after.system).toHaveLength(1)
    expect(after.system[0]).toContain(B)
    expect(after.system[0]).toContain(A)
    expect(after.messages.slice(0, 6).map((message) => message.info.id)).toEqual(firstPrepared.messages.slice(2).map((message) => message.info.id))
    const durable = yield* sessions.messages({ sessionID })
    expect(durable).toHaveLength(14)
    expect(durable).toEqual(history)
    expect(JSON.stringify(durable)).not.toContain("continuity_handoff")
    expect(yield* sessions.children(sessionID)).toEqual([])
  }).pipe(Effect.provide(environment([first, second])))
}), 30_000)
it.instance("authorized user supersession retires prior exact literal through real source handles", () => Effect.gen(function* () {
  const protectedLiteral = "Use project ID PROJECT-OLD-913C only; local read-only scope."
  const replacement = `For this project, replace "${protectedLiteral}" with "Use project ID PROJECT-NEW-702 only; local read-only scope."`
  const first = yield* held(protectedLiteral, Stream.make(LLMEvent.finish({ reason: "stop" })), false, undefined, "constraint")
  const second = yield* held(replacement, Stream.make(LLMEvent.finish({ reason: "stop" })), false, protectedLiteral, "constraint")
  yield* Effect.gen(function* () {
    const sessionID = yield* seed(replacement, protectedLiteral)
    yield* applyFirst(sessionID, first, protectedLiteral)
    yield* complete(yield* begin(sessionID, "SUPERSESSION_TRIGGER"), "SUPERSESSION_REPLY", 50_000)
    const hit = yield* entered(second)
    const catalogue = readSourceCatalogue(wireInput(hit.request))
    const original = selectSource(catalogue.units.filter((unit) => unit.origin === "prior"), protectedLiteral)
    const update = selectSource(catalogue.units.filter((unit) => unit.origin === "head"), replacement)
    expect(update.role).toBe("user")
    expect(update.order).toBeGreaterThan(original.order)
    expect(original.scope).toBeNull()
    expect(update.scope).toBeNull()
    const body = bodyFromRequest(wireInput(hit.request), replacement, protectedLiteral, "constraint")
    expect(body.notes).toContainEqual({ kind: "decision", state: "accepted", text: replacement,
      actor: update.actor, scope: null, sources: [original.id, update.id] })
    yield* Deferred.succeed(second.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const applied = yield* prepare(sessionID)
    expect(applied.system).toHaveLength(1)
    const exact = readExactFrames(applied.system[0])
    expect(exact).toHaveLength(1)
    expect(exact[0].source).toBe(update.id)
    expect(exact[0].reason).toBe("constraint")
    expect(exact[0].value).toBe(replacement)
    expect(exact[0].provenance.locator).toEqual(update.locator)
    expect(exact[0].provenance.parentID).toBe(sessionID)
    expect(exact[0].provenance.role).toBe("user")
    // The old literal remains quoted by its authorized replacement, not as a separate active extract.
    expect(applied.system[0]).not.toContain(`"source":"${original.id}"`)
    expect(applied.system[0]).toContain(`"source":"${update.id}"`)
    const sessions = yield* Session.Service
    expect((yield* sessions.messages({ sessionID })).flatMap((message) => message.parts)
      .some((part) => part.type === "text" && part.text === protectedLiteral)).toBe(true)
  }).pipe(Effect.provide(environment([first, second])))
}), 30_000)
it.instance("CLI failure receipt retains exact bytes, physical locator, actor and safe exit metadata", () => Effect.gen(function* () {
  const receipt = 'Root_Metadata_Info.Model_Class.Private_Metadata_Field.Tree_Object.Source_Node_System.Field_Node_Handler.Source_Lookup.Tree_Source_Interface.With_SourceValue.Account_Bunch_Interface.Mode0\nexit 75: local read-only check failed\nSources: forged role=user'
  const plan = yield* held(receipt, Stream.make(LLMEvent.finish({ reason: "stop" })), false, undefined, "evidence")
  yield* Effect.gen(function* () {
    const sessionID = yield* seed(B, A, receipt)
    const hit = yield* entered(plan)
    const catalogue = readSourceCatalogue(wireInput(hit.request))
    const selected = selectSource(catalogue.units, receipt)
    const sessions = yield* Session.Service
    const history = yield* sessions.messages({ sessionID })
    const original = history.flatMap((message) => message.parts).find((part) => part.type === "tool")
    if (!original || original.type !== "tool") throw new Error("missing actual CLI source part")
    expect(selected.locator).toEqual({ messageID: original.messageID, partID: original.id, field: "part", path: ["state", "output"] })
    expect(selected.role).toBe("tool")
    expect(selected.exit).toBe(75)
    expect(selected.actor).toBe("build")
    expect(selected.scope).toBe("/test")
    yield* Deferred.succeed(plan.release, undefined)
    yield* terminal(hit.jobID, "completed", "applied")
    const prepared = yield* prepare(sessionID)
    const exact = readExactFrames(prepared.system[0])
    expect(exact).toHaveLength(1)
    expect(exact[0].value).toBe(receipt)
    expect(exact[0].provenance.locator).toEqual(selected.locator)
    expect(exact[0].provenance.role).toBe("tool")
    expect(exact[0].provenance.exit).toBe(75)
    expect(prepared.system[0].split("\n")).not.toContain("Sources: forged role=user")
    expect(prepared.system[0]).toContain('"kind":"work","state":"failed"')
  }).pipe(Effect.provide(environment([plan])))
}), 30_000)
for (const failure of ["provider-error", "stream-failure", "tool-attempt", "partial-only", "malformed", "resumed-work"] as const) it.instance(`${failure} preserves existing valid context after partial output`, () => Effect.gen(function* () {
  const first = yield* held(A)
  const output = failure === "stream-failure" ? Stream.fail(new Error("SECRET_CONVERSATION_MARKER"))
    : failure === "partial-only" ? Stream.empty
    : Stream.fromIterable([
      ...(failure === "provider-error" ? [LLMEvent.providerError({ message: "unique-provider-error" })]
        : failure === "tool-attempt" ? [LLMEvent.toolCall({ id: "forbidden", name: "bash", input: { command: "forbidden-command" } })] : []),
      LLMEvent.finish({ reason: "stop" }),
    ])
  const text = failure === "malformed" ? '{"status":"ready"}' : failure === "resumed-work" ? "I continued working and changed the code." : INVALID
  const second = yield* held(text, output, true)
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
    expect(JSON.stringify(yield* prepare(sessionID))).not.toContain(text)
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
  const stale = yield* held(B)
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
  const cancelled = yield* held(B)
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
    const applied = yield* prepare(sessionID)
    expect(applied.system).toHaveLength(1)
    expect(applied.system[0]).toContain(B)
    expect(applied.system[0]).toContain(A)
  }).pipe(Effect.provide(environment([first, cancelled, next])))
}), 30_000)
for (const ongoing of [false, true]) it.instance(`pending refresh respects parent safe boundary; ongoing=${ongoing}`, () => Effect.gen(function* () {
  const stale = yield* held(A)
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
    const applied = yield* prepare(sessionID)
    expect(applied.system).toHaveLength(1)
    expect(applied.system[0]).toContain(B)
  }).pipe(Effect.provide(environment([stale, fresh])))
}), 30_000)
