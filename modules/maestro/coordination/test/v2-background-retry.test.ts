import { expect } from "bun:test"
import { LLMClient, Model } from "@orchestra/llm"
import { route } from "@orchestra/llm/protocols/openai-chat"
import { AgentV2 } from "@orchestra/core/agent"
import { Catalog } from "@orchestra/core/catalog"
import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { EventV2 } from "@orchestra/core/event"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionInputTable } from "@orchestra/core/session/sql"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { TaskTool } from "@orchestra/core/tool/task"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Context, DateTime, Deferred, Effect, Layer, Schedule, Stream } from "effect"
import { eq } from "drizzle-orm"
import { Harness, fragmentFixture } from "../../../../packages/core/test/session-runner-harness"
import { settleTool } from "../../../../packages/core/test/lib/tool"
import { GovernanceBackgroundV2 } from "../src/v2/governance/background"

class State extends Context.Service<State, {
  sessions: Deferred.Deferred<SessionV2.Interface>
  background: Deferred.Deferred<{ has: (childID: string) => boolean }>
  turns: string[]
}>()("test/BackgroundRetry") {}
const stateLayer = Layer.effect(State, Effect.gen(function* () {
  return { sessions: yield* Deferred.make<SessionV2.Interface>(),
    background: yield* Deferred.make<{ has: (childID: string) => boolean }>(), turns: [] }
}))
const stateNode = makeLocationNode({ service: State, layer: stateLayer, deps: [] })
// Keep the real Task/runner scheduling seam; this adapter exposes the otherwise private watch retirement state.
const governance = makeLocationNode({ service: TaskGovernance.Service, deps: [stateNode, EventV2.node],
  layer: Layer.effect(TaskGovernance.Service, Effect.gen(function* () {
    const state = yield* State
    const events = yield* EventV2.Service
    const background = yield* GovernanceBackgroundV2.make(events)
    yield* Deferred.succeed(state.background, background)
    return TaskGovernance.Service.of({ ...TaskGovernance.allowAll,
      admit: (input) => Effect.gen(function* () {
        const sessions = yield* Deferred.await(state.sessions)
        yield* background.register(GovernanceBackgroundV2.watch({ parentID: input.parent.id,
          childID: TaskTool.taskChildID(input.context), description: "retry", context: input.context }), sessions)
        return { background: true }
      }),
      beforeTurn: (session) => Effect.gen(function* () {
        state.turns.push(session.id)
        const sessions = yield* Deferred.await(state.sessions)
        yield* background.start(sessions, session.id)
      }),
    })
  })),
})
const fixture = Harness.make({
  client: Layer.succeed(LLMClient.Service, LLMClient.Service.of({
    prepare: () => Effect.die("unused"), generate: () => Effect.die("unused"),
    stream: () => Stream.fromIterable(fragmentFixture("text", "answer", ["child result"]).completeEvents),
  })),
  models: SessionRunnerModel.layerWith(() => Effect.succeed(Model.make({ id: "cheap", provider: "fake", route }))),
  echo: Layer.effectDiscard(ToolRegistry.Service.use((registry) => registry.register({}))),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
  nodes: [TaskTool.node, Catalog.node, stateNode], replacements: [[TaskGovernance.node, governance]],
})

fixture.live("completed Task exact retry reconciles and retires without a second child provider turn", () =>
  Effect.gen(function* () {
    yield* Harness.setup
    const sessions = yield* SessionV2.Service
    const state = yield* State
    yield* Deferred.succeed(state.sessions, sessions)
    const agents = yield* AgentV2.Service
    const worker = AgentV2.ID.make("retry-worker")
    const caller = AgentV2.ID.make("retry-caller")
    yield* agents.transform((draft) => {
      draft.update(worker, (agent) => { agent.mode = "subagent" })
      draft.update(caller, (agent) => { agent.permissions = [{ action: "task", resource: "*", effect: "allow" }] })
    })
    const catalog = yield* Catalog.Service
    const providerID = ProviderV2.ID.make("fake")
    const model = ModelV2.Ref.make({ providerID, id: ModelV2.ID.make("cheap") })
    yield* catalog.transform((draft) => {
      draft.model.update(providerID, model.id, (item) => {
        item.enabled = true
        item.status = "active"
        item.api = { type: "aisdk", package: "@ai-sdk/openai", id: model.id }
        item.limit = { context: 100_000, output: 1_000 }
      })
      draft.model.default.set(providerID, model.id)
    })
    const parent = yield* sessions.create({ location: { directory: AbsolutePath.make("/project") }, agent: caller, model })
    const events = yield* EventV2.Service
    const timestamp = yield* DateTime.now
    const assistantMessageID = SessionMessage.ID.create()
    const callID = "call_background_retry"
    const input = { description: "retry", prompt: "child work", subagent_type: worker }
    yield* events.publish(SessionEvent.Step.Started, { sessionID: parent.id, assistantMessageID, timestamp,
      agent: caller, model })
    yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID: parent.id, assistantMessageID, timestamp,
      callID, name: "task" })
    yield* events.publish(SessionEvent.Tool.Input.Ended, { sessionID: parent.id, assistantMessageID, timestamp,
      callID, text: JSON.stringify(input) })
    yield* events.publish(SessionEvent.Tool.Called, { sessionID: parent.id, assistantMessageID, timestamp,
      callID, tool: "task", input, provider: { executed: false } })
    const call = { sessionID: parent.id, agent: caller, assistantMessageID, model,
      call: { type: "tool-call" as const, id: callID, name: "task", input } }
    const childID = TaskTool.taskChildID({ ...call, toolCallID: callID })
    const background = yield* Deferred.await(state.background)
    const settled = Effect.sync(() => background.has(childID)).pipe(
      Effect.repeat({ until: (pending) => !pending, schedule: Schedule.spaced("5 millis") }), Effect.timeout("5 seconds"))
    const registry = yield* ToolRegistry.Service
    expect((yield* settleTool(registry, call)).result.type).not.toBe("error")
    yield* sessions.wait(childID)
    yield* settled
    const database = yield* Database.Service
    const returns = database.db.select().from(SessionInputTable).where(eq(SessionInputTable.session_id, parent.id))
      .all().pipe(Effect.orDie)
    const original = yield* returns
    expect(original).toHaveLength(1)
    expect(original[0].prompt).toMatchObject({ text: expect.stringContaining("child result") })
    expect((yield* settleTool(registry, call)).result.type).not.toBe("error")
    yield* sessions.wait(childID)
    yield* settled
    expect(yield* returns).toHaveLength(1)
    expect((yield* returns)[0].id).toBe(original[0].id)
    expect(state.turns.filter((id) => id === childID)).toHaveLength(1)
  }),
)
