import { expect } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { Cause, Effect, Exit, Layer, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { GenerationOptions, LLMClient } from "@orchestra/llm"
import { OpenAIResponses } from "@orchestra/llm/protocols"
import { Auth, RequestExecutor } from "@orchestra/llm/route"
import { Catalog } from "@orchestra/core/catalog"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { Integration } from "@orchestra/core/integration"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionExecution } from "@orchestra/core/session/execution"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { EligibilityFixture } from "./model-eligibility-fixture"
import { Harness } from "./session-runner-harness"

const it = Harness.make({
  client: LLMClient.layer.pipe(Layer.provide(RequestExecutor.fetchLayer)),
  models: SessionRunnerModel.layerWith(() => Effect.sync(() => {
    EligibilityFixture.state.nativeResolves++
    return EligibilityFixture.state.nativeModel
  }).pipe(
    Effect.flatMap((model) => model ? Effect.succeed(model) : Effect.die("A hosted turn must not construct a native model")),
  )),
  hosts: EligibilityFixture.hosts,
  nodes: [Catalog.node, Integration.node],
  echo: Layer.effectDiscard(ToolRegistry.Service.use((registry) => registry.register({ probe: Tool.make({
    get description() { EligibilityFixture.state.materializations++; return "Eligibility materialization probe" },
    input: Schema.Struct({}), output: Schema.Struct({}), toModelOutput: () => [],
    execute: () => Effect.sync(() => { EligibilityFixture.state.tools++; return {} }),
  }) }))),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.succeed(SkillGuidance.Service, SkillGuidance.Service.of({ load: () => Effect.succeed(SystemContext.empty) })),
})

const setup = Effect.gen(function* () {
  yield* Harness.setup
  yield* EligibilityFixture.seed
  const session = yield* SessionV2.Service
  yield* session.switchAgent({ sessionID: Harness.sessionID, agent: "host-seat" })
  return session
})
const admitOnly = Effect.fn(function* () {
  const session = yield* SessionV2.Service
  const admitted = yield* session.prompt({ sessionID: Harness.sessionID, prompt: Prompt.make({ text: "Eligibility fixture" }), resume: false })
  const database = yield* Database.Service
  const row = yield* database.db.select().from(SessionInputTable).where(eq(SessionInputTable.id, admitted.id)).get().pipe(Effect.orDie)
  expect(row).toMatchObject({ id: admitted.id, session_id: Harness.sessionID, promoted_seq: null })
  expect(EligibilityFixture.state.options.length).toBe(0)
  expect(EligibilityFixture.state.materializations).toBe(0)
  expect(EligibilityFixture.state.customCalls).toBe(0)
  return admitted
})
const expectFailedBeforeExecution = (mode: "resume" | "wake" = "resume") => Effect.gen(function* () {
  const session = yield* SessionV2.Service
  const execution = yield* SessionExecution.Service
  const exit = yield* (mode === "resume" ? session.resume(Harness.sessionID)
    : execution.wake(Harness.sessionID).pipe(Effect.andThen(session.wait(Harness.sessionID)))).pipe(Effect.exit)
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, Harness.sessionID))
    .orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
  expect(rows.filter((row) => row.type === EventV2.versionedType(SessionEvent.Step.Failed.type, SessionEvent.Step.Failed.durable!.version))).toHaveLength(1)
  expect(rows.filter((row) => row.type === EventV2.versionedType(SessionEvent.Step.Ended.type, SessionEvent.Step.Ended.durable!.version))).toHaveLength(0)
  expect(EligibilityFixture.state.options.length).toBe(0)
  expect(EligibilityFixture.state.customCalls).toBe(0)
  expect(EligibilityFixture.state.materializations).toBe(0)
  expect(EligibilityFixture.state.tools).toBe(0)
  expect(EligibilityFixture.state.nativeResolves).toBe(0)
  return exit
})

for (const provider of ["google", "anthropic#credential"]) {
  it.live(`BEHAVIOR E6: admitted foreign ${provider} host selection fails durably before SDK/tools`, () => Effect.gen(function* () {
    const session = yield* setup
    yield* session.switchModel({ sessionID: Harness.sessionID, model: EligibilityFixture.ref(provider) })
    yield* admitOnly()
    yield* expectFailedBeforeExecution()
  }))
}

it.live("BEHAVIOR E6: signed-out host cannot execute an admitted SDK-default prompt after advisory wake", () => Effect.gen(function* () {
  yield* setup
  EligibilityFixture.state.signedIn = false
  yield* admitOnly()
  yield* expectFailedBeforeExecution("wake")
}))

it.live("BEHAVIOR E6: canonical variant generation is refused instead of ignored by Claude", () => Effect.gen(function* () {
  const session = yield* setup
  const catalog = yield* Catalog.Service
  yield* catalog.transform((draft) => draft.model.update(ProviderV2.ID.anthropic, ModelV2.ID.make("fixture"), (model) => {
    Object.assign(model, { variants: [{ id: ModelV2.VariantID.make("high"), headers: {}, body: {}, generation: GenerationOptions.make({ temperature: 0 }) }] })
  }))
  yield* session.switchModel({ sessionID: Harness.sessionID, model: EligibilityFixture.ref("anthropic", "high") })
  yield* admitOnly()
  yield* expectFailedBeforeExecution()
}))

for (const variant of ["missing", "other"]) {
  it.live(`BEHAVIOR E6: ${variant} host variant cannot silently become SDK default effort`, () => Effect.gen(function* () {
    const session = yield* setup
    yield* session.switchModel({ sessionID: Harness.sessionID, model: EligibilityFixture.ref("anthropic", variant) })
    yield* admitOnly()
    yield* expectFailedBeforeExecution()
  }))
}

it.live("BEHAVIOR E6: configured default variant is normalized before the real Claude SDK call", () => Effect.gen(function* () {
  const session = yield* setup
  const catalog = yield* Catalog.Service
  yield* catalog.transform((draft) => draft.model.update(ProviderV2.ID.anthropic, ModelV2.ID.make("fixture"), (model) => {
    model.request.variant = "high"
  }))
  yield* session.switchModel({ sessionID: Harness.sessionID, model: EligibilityFixture.ref("anthropic", "default") })
  yield* admitOnly()
  yield* session.resume(Harness.sessionID)
  expect(EligibilityFixture.state.options).toHaveLength(1)
  expect(EligibilityFixture.state.options[0].model).toBe("fixture")
  expect(EligibilityFixture.state.options[0].effort).toBe("high")
}))

for (const stale of [false, true]) {
  it.live(`BEHAVIOR E6: ${stale ? "stale ready" : "unsupported"} registered custom host cannot execute`, () => Effect.gen(function* () {
    const session = yield* setup
    yield* session.switchAgent({ sessionID: Harness.sessionID, agent: "custom-seat" })
    EligibilityFixture.state.useCustomHost = true
    if (stale) {
      EligibilityFixture.state.customReady = true
      expect(yield* EligibilityFixture.custom.describeModel()).toEqual({ status: "ready" })
      EligibilityFixture.state.customReady = false
    }
    yield* admitOnly()
    yield* expectFailedBeforeExecution()
  }))
}

it.live("BEHAVIOR E6: missing execution host is a typed failure with durable Step.Failed", () => Effect.gen(function* () {
  yield* setup
  EligibilityFixture.state.registered = false
  yield* admitOnly()
  const exit = yield* expectFailedBeforeExecution()
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(false)
}))

it.live("BEHAVIOR E6: agent.model is not promoted into Session.model while deciding inherited engine", () => Effect.gen(function* () {
  const session = yield* setup
  const parentID = SessionV2.ID.make("ses_eligibility_parent")
  yield* Harness.insertSession(parentID)
  yield* session.switchAgent({ sessionID: parentID, agent: "host-seat" })
  yield* session.switchAgent({ sessionID: Harness.sessionID, agent: "inherit-seat" })
  const agents = yield* AgentV2.Service
  yield* agents.transform((draft) => draft.update(AgentV2.ID.make("inherit-seat"), (agent) => { agent.model = EligibilityFixture.ref("google") }))
  const database = yield* Database.Service
  yield* database.db.update(SessionTable).set({ parent_id: parentID }).where(eq(SessionTable.id, Harness.sessionID)).run()
  yield* admitOnly()
  yield* expectFailedBeforeExecution()
}))

it.live("CONTROL E6: existing exact Anthropic model and effort remain executable", () => Effect.gen(function* () {
  const session = yield* setup
  yield* session.switchModel({ sessionID: Harness.sessionID, model: EligibilityFixture.ref("anthropic", "high") })
  yield* admitOnly()
  yield* session.resume(Harness.sessionID)
  expect(EligibilityFixture.state.options).toHaveLength(1)
  expect(EligibilityFixture.state.options[0]).toMatchObject({ model: "fixture", effort: "high" })
  expect(EligibilityFixture.state.materializations).toBeGreaterThan(0)
}))

it.live("CONTROL E6: no Model.Ref preserves the real host SDK-default call", () => Effect.gen(function* () {
  const session = yield* setup
  yield* admitOnly()
  yield* session.resume(Harness.sessionID)
  expect(EligibilityFixture.state.options).toHaveLength(1)
  expect(EligibilityFixture.state.options[0].model).toBeUndefined()
  expect(EligibilityFixture.state.options[0].effort).toBeUndefined()
}))

it.live("CONTROL E6: custom native resolver remains authoritative outside an unavailable catalog", () => Effect.gen(function* () {
  const session = yield* setup
  yield* session.switchAgent({ sessionID: Harness.sessionID, agent: "maestro" })
  const catalog = yield* Catalog.Service
  yield* catalog.transform((draft) => {
    for (const provider of [ProviderV2.ID.openai, ProviderV2.ID.make("google")])
      draft.provider.update(provider, (info) => { info.disabled = true })
  })
  expect(yield* catalog.model.available()).toEqual([])
  const requests: string[] = []
  const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ port: 0, fetch(request) {
    requests.push(request.url)
    return new Response('data: {"type":"response.completed","response":{"id":"custom-native"}}\n\n',
      { headers: { "Content-Type": "text/event-stream" } })
  } })), (server) => Effect.promise(() => server.stop(true)))
  EligibilityFixture.state.nativeModel = OpenAIResponses.route.with({ provider: "outside-catalog", auth: Auth.none,
    endpoint: { baseURL: server.url.origin } }).model({ id: "outside-catalog" })
  yield* admitOnly()
  yield* session.resume(Harness.sessionID)
  expect(requests).toHaveLength(1)
  expect(EligibilityFixture.state.nativeResolves).toBeGreaterThan(0)
  expect(EligibilityFixture.state.options).toEqual([])
}))
