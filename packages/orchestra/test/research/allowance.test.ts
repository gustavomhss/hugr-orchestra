import { describe, expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Option, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { eq } from "drizzle-orm"
import path from "node:path"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { SessionProjector } from "@orchestra/core/session/projector"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionMessage } from "@orchestra/core/session/message"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { SessionContinuity } from "@/continuity/service"
import { InstanceRef } from "@/effect/instance-ref"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { LogicalTask } from "@/maestro/logical-task"
import { Provider } from "@/provider/provider"
import { ResearchExecution } from "@/research/allowance"
import { LLM } from "@/session/llm"
import { LLMNativeRuntime } from "@/session/llm/native-runtime"
import { SessionCompaction } from "@/session/compaction"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"

const server = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })
const root = LayerNode.group([LLM.node, ResearchExecution.node, Session.node, SessionProjector.node,
  SessionCompaction.node, SessionContinuity.node, BackgroundJob.node, Database.node, ResearchAllowance.node,
  Agent.node, Provider.node, EventV2Bridge.node, server])
const it = testEffect(TestAppNodeBuilder.build(root, [[RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })]]))

const setup = Effect.fn("ResearchExecutionTest.setup")(function* () {
  const remote = yield* TestLLMServer
  const instance = yield* TestInstance
  const config = testProviderConfig(remote.url)
  yield* Effect.promise(() => Bun.write(path.join(instance.directory, "orchestra.json"), JSON.stringify({
    ...config, provider: { openai: { ...config.provider.test, id: "openai" } },
    enabled_providers: ["openai"], model: "openai/test-model", small_model: "openai/test-model",
    plugin: [], mcp: {}, compaction: { auto: false }, continuity: { trigger: 0.5 },
  })))
  const sessions = yield* Session.Service
  const provider = yield* Provider.Service
  const agents = yield* Agent.Service
  const authority = yield* sessions.create({ title: "authority", agent: "maestro" })
  const execution = yield* sessions.create({ title: "discovery", agent: "jimmy", parentID: authority.id })
  yield* LogicalTask.ensure({ executionSessionID: execution.id, authoritySessionID: authority.id,
    projectID: execution.projectID, memberID: "jimmy", source: "host" })
  const model = yield* provider.getModel(ProviderV2.ID.make("openai"), ModelV2.ID.make("test-model"))
  const agent = yield* agents.get("jimmy")
  const user = yield* sessions.updateMessage({ role: "user", id: MessageID.ascending(), sessionID: execution.id,
    agent: "jimmy", model: { providerID: model.providerID, modelID: model.id }, time: { created: Date.now() } })
  if (user.role !== "user") return yield* Effect.die("Expected native user message")
  yield* sessions.updatePart({ id: PartID.ascending(), messageID: user.id, sessionID: execution.id,
    type: "text", text: "Investigate fixture" })
  const input: LLM.StreamInput = { user, sessionID: execution.id, agent, model,
    system: [], messages: [{ role: "user", content: "Investigate fixture" }], tools: {}, retries: 0 }
  return { remote, authority, execution, input }
})
const charges = Effect.fn("ResearchExecutionTest.charges")(function* (sessionID: string) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all().pipe(Effect.orDie)
  return rows.filter((row) => row.type === EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1))
    .map((row) => Schema.decodeUnknownSync(ResearchEvent.AllowanceCharged.data)(row.data))
})
const failure = (exit: Exit.Exit<unknown, unknown>) => {
  expect(Exit.isFailure(exit)).toBe(true)
  return Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined
}

describe("native research dispatch attribution", () => {
  it.instance("real binding admits once, scoped native tool retries keep allowance, root resource context grants no capability", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const execution = yield* ResearchExecution.Service
    const native = yield* ResearchAllowance.Service
    const effect = Effect.gen(function* () {
      const current = yield* ResearchExecution.Current
      expect(current?.allowance.binding).toMatchObject({ taskId: (yield* LogicalTask.read(fixture.execution.id))?.taskId,
        executionSessionID: fixture.execution.id, authoritySessionID: fixture.authority.id, memberID: "jimmy" })
      if (!current) return yield* Effect.die("Missing host frame")
      const capability = yield* Effect.exit(CapabilityInvocation.require({ sessionID: fixture.execution.id,
        assistantMessageID: SessionMessage.ID.create(), toolCallID: "call", agent: AgentV2.ID.make("jimmy") },
      { projectID: current.allowance.binding.projectID, location: { directory: current.allowance.binding.directory } }))
      expect(failure(capability)).toMatchObject({ code: "invocation_binding_missing" })
      yield* execution.tool(fixture.execution.id, "message:tool-call", "read", Effect.void)
      yield* execution.tool(fixture.execution.id, "message:tool-call", "read", Effect.void)
      yield* execution.captureBytes(fixture.execution.id, "message:tool-call:received", 3, Effect.void)
      yield* execution.captureBytes(fixture.execution.id, "message:tool-call:received", 3, Effect.void)
      yield* native.reconcileBytes(current.allowance, "bytes:message:tool-call:received", 2)
      expect(yield* charges(fixture.execution.id)).toHaveLength(2)
    })
    yield* execution.enter(fixture.execution.id, "dispatch", effect)
    yield* execution.enter(fixture.execution.id, "dispatch", effect)
    const rows = yield* charges(fixture.execution.id)
    expect(rows.map((row) => row.dispatchCallID)).toEqual(["dispatch", "dispatch"])
    yield* execution.enter(fixture.execution.id, "new-authorized-resume", execution.tool(fixture.execution.id, "message:tool-call", "read", Effect.void))
    expect(yield* charges(fixture.execution.id)).toHaveLength(3)
  }))

  it.instance("unattributed discovery and forged frames stop; other native agents keep ordinary calls", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const execution = yield* ResearchExecution.Service
    const llm = yield* LLM.Service
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    expect(failure(yield* Effect.exit(llm.stream(fixture.input).pipe(Stream.runDrain)))).toMatchObject({ code: "binding_missing" })
    expect(yield* fixture.remote.calls).toBe(0)
    const issued = yield* execution.enter(fixture.execution.id, "dispatch", ResearchExecution.Current)
    if (!issued) return yield* Effect.die("Missing host frame")
    expect(failure(yield* Effect.exit(execution.provider(fixture.input, Effect.void).pipe(
      Effect.provideService(ResearchExecution.Current, { allowance: issued.allowance }),
    )))).toMatchObject({ code: "binding_mismatch" })
    const ordinary = yield* sessions.create({ title: "ordinary", agent: "maestro" })
    const agent = yield* agents.get("maestro")
    expect(agent).toBeDefined()
    yield* llm.stream({ ...fixture.input, sessionID: ordinary.id, agent }).pipe(Stream.runDrain)
    expect(yield* fixture.remote.calls).toBe(1)
    expect(yield* charges(fixture.execution.id)).toEqual([])
  }))

  it.instance("different native placement and wrong task ownership cannot bind a fresh budget", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const execution = yield* ResearchExecution.Service
    yield* execution.enter(fixture.execution.id, "dispatch", Effect.void)
    const instance = yield* InstanceRef
    if (!instance) return yield* Effect.die("Missing native instance")
    expect(failure(yield* Effect.exit(execution.enter(fixture.execution.id, "dispatch", Effect.void).pipe(
      Effect.provideService(InstanceRef, { ...instance, worktree: path.join(instance.directory, "different-root") }),
    )))).toMatchObject({ code: "binding_mismatch" })
    const sessions = yield* Session.Service
    const wrong = yield* sessions.create({ title: "wrong native task owner", agent: "jimmy", parentID: fixture.authority.id })
    yield* LogicalTask.ensure({ executionSessionID: wrong.id, authoritySessionID: fixture.authority.id,
      projectID: wrong.projectID, memberID: "backend", source: "host" })
    expect(failure(yield* Effect.exit(execution.enter(wrong.id, "dispatch", Effect.void)))).toMatchObject({ code: "binding_mismatch" })
    expect(yield* charges(wrong.id)).toEqual([])
  }))

  it.instance("deferred maintenance keeps its captured dispatch after another authorized resume", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const execution = yield* ResearchExecution.Service
    const llm = yield* LLM.Service
    const gate = yield* Deferred.make<void>()
    const worker = yield* execution.enter(fixture.execution.id, "first-dispatch",
      Deferred.await(gate).pipe(Effect.andThen(execution.withAttribution(fixture.execution.id,
        llm.stream({ ...fixture.input, sessionID: "ses_native_maintenance_alias", parentSessionID: fixture.execution.id,
          purpose: "context-maintenance", agent: { name: "continuity", mode: "subagent", options: {}, permission: [],
            prompt: "Maintain working memory from the supplied native transcript only." } }).pipe(Stream.runDrain),
      )), Effect.forkScoped),
    )
    yield* execution.enter(fixture.execution.id, "next-authorized-resume", llm.stream(fixture.input).pipe(Stream.runDrain))
    yield* Deferred.succeed(gate, undefined)
    yield* Fiber.join(worker)
    expect(yield* fixture.remote.calls).toBe(2)
    expect((yield* charges(fixture.execution.id)).map((entry) => ({ dispatch: entry.dispatchCallID, maintenance: entry.operation.startsWith("provider:maintenance:") })))
      .toEqual([{ dispatch: "next-authorized-resume", maintenance: false }, { dispatch: "first-dispatch", maintenance: true }])
  }))

  for (const nativeRuntime of [false, true]) {
    const lane = testEffect(TestAppNodeBuilder.build(root, [[RuntimeFlags.node, RuntimeFlags.layer({
      experimentalEventSystem: true, experimentalNativeLlm: nativeRuntime,
    })]]))
    lane.instance(`real provider + compaction + continuity share hard ceiling; native runtime=${nativeRuntime}`, () => Effect.gen(function* () {
      const fixture = yield* setup()
      const execution = yield* ResearchExecution.Service
      const sessions = yield* Session.Service
      const llm = yield* LLM.Service
      const compaction = yield* SessionCompaction.Service
      const continuity = yield* SessionContinuity.Service
      const jobs = yield* BackgroundJob.Service
      const provider = yield* Provider.Service
      expect(LLMNativeRuntime.status({ model: fixture.input.model, provider: yield* provider.getProvider(fixture.input.model.providerID), auth: undefined }).type).toBe("supported")
      // Native retained history is independent of the model projection; maintenance aliases cannot replace it.
      const completed = yield* Effect.forEach(Array.from({ length: 6 }, (_, index) => index), (index) => Effect.gen(function* () {
        const user = yield* sessions.updateMessage({ ...fixture.input.user, id: MessageID.ascending() })
        yield* sessions.updatePart({ id: PartID.ascending(), messageID: user.id, sessionID: fixture.execution.id, type: "text", text: `Retained evidence ${index}` })
        const assistant = { id: MessageID.ascending(), sessionID: fixture.execution.id, parentID: user.id,
          role: "assistant" as const, agent: "jimmy", mode: "subagent", path: { cwd: fixture.execution.directory, root: fixture.execution.directory },
          providerID: fixture.input.model.providerID, modelID: fixture.input.model.id, cost: 0,
          tokens: { input: 50_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          finish: "stop", time: { created: Date.now(), completed: Date.now() } }
        yield* sessions.updateMessage(assistant)
        yield* sessions.updatePart({ id: PartID.ascending(), messageID: assistant.id, sessionID: fixture.execution.id, type: "text", text: `Evidence retained ${index}` })
        return assistant
      }))
      const retained = yield* sessions.messages({ sessionID: fixture.execution.id })
      yield* execution.enter(fixture.execution.id, "dispatch", Effect.gen(function* () {
        yield* Effect.forEach(Array.from({ length: 22 }), () => llm.stream(fixture.input).pipe(Stream.runDrain))
        expect(yield* fixture.remote.calls).toBe(22)
        yield* fixture.remote.text("Qualified compaction retains evidence")
        expect(yield* compaction.process({ sessionID: fixture.execution.id, parentID: fixture.input.user.id, messages: retained, auto: false })).toBe("continue")
        expect(yield* fixture.remote.calls).toBe(23)
        // First working-memory call is paid. Its failed decoder asks for one retry, which must stop before HTTP.
        yield* fixture.remote.text("invalid memory response")
        yield* continuity.start({ sessionID: fixture.execution.id, message: completed[5], canRecall: false })
        const job = (yield* jobs.list()).find((job) => job.type === "context-continuity")
        expect(job).toBeDefined()
        if (!job) return yield* Effect.die("Expected actual native continuity job")
        const terminal = yield* jobs.wait({ id: job.id, timeout: 30_000 })
        // Continuity settles a refused producer call as a failed pass, not a failed job; the refusal stops before HTTP.
        expect(terminal?.info?.status).toBe("completed")
        expect(yield* fixture.remote.calls).toBe(24)
        expect(failure(yield* Effect.exit(llm.stream({ ...fixture.input, small: true,
          agent: { name: "title", mode: "subagent", options: {}, permission: [] } }).pipe(Stream.runDrain)))).toMatchObject({ code: "budget_exhausted" })
        const stopped = yield* compaction.process({ sessionID: fixture.execution.id, parentID: fixture.input.user.id,
          messages: yield* sessions.messages({ sessionID: fixture.execution.id }), auto: false })
        expect(stopped).toBe("stop")
        expect(yield* fixture.remote.calls).toBe(24)
      }))
      const ledger = yield* charges(fixture.execution.id)
      expect(ledger).toHaveLength(24)
      expect(ledger.filter((entry) => entry.operation.startsWith("provider:maintenance:"))).toHaveLength(2)
      expect(ledger.every((entry) => entry.dispatchCallID === "dispatch")).toBe(true)
      const after = yield* sessions.messages({ sessionID: fixture.execution.id })
      expect(retained.every((message) => after.some((stored) => stored.info.id === message.info.id && JSON.stringify(stored.parts) === JSON.stringify(message.parts)))).toBe(true)
      const last = after.findLast((message) => message.info.role === "assistant")
      expect(last?.info.role === "assistant" && last.info.error !== undefined).toBe(true)
      // Exact dispatch retry has no new allowance; real new authorized call receives its own allowance.
      expect(failure(yield* Effect.exit(execution.enter(fixture.execution.id, "dispatch", llm.stream(fixture.input).pipe(Stream.runDrain))))).toMatchObject({ code: "budget_exhausted" })
      yield* execution.enter(fixture.execution.id, "new-authorized-resume", llm.stream(fixture.input).pipe(Stream.runDrain))
      expect(yield* fixture.remote.calls).toBe(25)
    }), 120_000)
  }

  it.instance("the bound tier's deadline interrupts the dispatch, denies further admission and settles budget_exhausted", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const execution = yield* ResearchExecution.Service
    const interrupted = yield* Deferred.make<void>()
    const captured = yield* Deferred.make<ResearchExecution.Frame>()
    const dispatch = yield* execution.enter(fixture.execution.id, "deadline-dispatch", Effect.gen(function* () {
      const frame = yield* ResearchExecution.Current
      if (frame) yield* Deferred.succeed(captured, frame)
      yield* execution.tool(fixture.execution.id, "before-deadline", "read", Effect.void)
      yield* Deferred.await(interrupted)
      return "returned after interruption"
    }), { tier: "focused", onDeadline: () => Deferred.succeed(interrupted, undefined).pipe(Effect.asVoid) }).pipe(Effect.exit, Effect.forkChild)
    const frame = yield* Deferred.await(captured)
    yield* TestClock.adjust("1199 seconds")
    expect(yield* Deferred.isDone(interrupted)).toBe(false)
    yield* TestClock.adjust("1 second")
    expect(failure(yield* Fiber.join(dispatch))).toMatchObject({ code: "budget_exhausted",
      message: expect.stringContaining("deadline exhausted (1200 seconds); retained work remains available") })
    expect(yield* Deferred.isDone(interrupted)).toBe(true)
    expect(failure(yield* Effect.exit(execution.tool(fixture.execution.id, "after-deadline", "read", Effect.void).pipe(
      Effect.provideService(ResearchExecution.Current, frame))))).toMatchObject({ code: "budget_exhausted" })
    expect(failure(yield* Effect.exit(execution.provider(fixture.input, Effect.void).pipe(
      Effect.provideService(ResearchExecution.Current, frame))))).toMatchObject({ code: "budget_exhausted" })
    // Retained work stays readable: the ledger keeps the pre-deadline charge and nothing after it.
    expect((yield* charges(fixture.execution.id)).map((entry) => entry.operation)).toEqual(["tool:before-deadline:read"])
  }).pipe(Effect.provide(TestClock.layer())), 30_000)

  it.instance("a dispatch that settles before its deadline clears the timer", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const execution = yield* ResearchExecution.Service
    const fired = yield* Deferred.make<void>()
    const frame = yield* execution.enter(fixture.execution.id, "settled-dispatch", ResearchExecution.Current,
      { onDeadline: () => Deferred.succeed(fired, undefined).pipe(Effect.asVoid) })
    if (!frame) return yield* Effect.die("Missing host frame")
    yield* TestClock.adjust("601 seconds")
    expect(yield* Deferred.isDone(fired)).toBe(false)
    yield* execution.tool(fixture.execution.id, "after-settlement", "read", Effect.void).pipe(Effect.provideService(ResearchExecution.Current, frame))
    expect(yield* charges(fixture.execution.id)).toHaveLength(1)
  }).pipe(Effect.provide(TestClock.layer())), 30_000)
})
