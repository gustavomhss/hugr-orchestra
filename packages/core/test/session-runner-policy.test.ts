import { describe, expect } from "bun:test"
import { LLMClient, LLMEvent, Model, type LLMClientShape, type LLMRequest } from "@orchestra/llm"
import { route } from "@orchestra/llm/protocols/openai-chat"
import { Database } from "@orchestra/core/database/database"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionV2 } from "@orchestra/core/session"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionRunner } from "@orchestra/core/session/runner"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { SystemContextRegistry } from "@orchestra/core/system-context/registry"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { eq } from "drizzle-orm"
import { Harness, fragmentFixture, insertSession, otherSessionID, recoveryModel, sessionID } from "./session-runner-harness"

const requests: LLMRequest[] = []
let response: LLMEvent[] = []
let responses: LLMEvent[][] | undefined
let streamGate: Deferred.Deferred<void> | undefined
let streamStarted: Deferred.Deferred<void> | undefined
const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: ((request: LLMRequest) => {
      requests.push(request)
      const events = Stream.fromIterable(responses === undefined ? response : (responses.shift() ?? []))
      if (!streamGate) return events
      return Stream.unwrap(
        (streamStarted ? Deferred.succeed(streamStarted, undefined) : Effect.void).pipe(
          Effect.andThen(Deferred.await(streamGate)),
          Effect.as(events),
        ),
      )
    }) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)
const model = Model.make({ id: "fake-model", provider: "fake", route })
let currentModel = model
let modelResolveHook = Effect.void
const models = SessionRunnerModel.layerWith(() => modelResolveHook.pipe(Effect.as(currentModel)))
const authorizations: Tool.Context[] = []
const echo = Layer.effectDiscard(
  ToolRegistry.Service.use((registry) =>
    registry.register({
      echo: Tool.make({
        description: "Echo text",
        input: Schema.Struct({ text: Schema.String }),
        output: Schema.Struct({ text: Schema.String }),
        toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
        execute: ({ text }, context) => Effect.sync(() => {
          authorizations.push(context)
          return { text }
        }),
      }),
    }),
  ),
)
const systemContextKey = SystemContext.Key.make("test/context")
const systemContext = Layer.effectDiscard(
  SystemContextRegistry.Service.use((registry) =>
    registry.register({
      key: systemContextKey,
      load: Effect.succeed(SystemContext.make({
        key: systemContextKey,
        codec: Schema.toCodecJson(Schema.String),
        load: Effect.succeed("Initial context"),
        baseline: String,
        update: (_previous, current) => current,
        removed: () => "System context source removed: test/context",
      })),
    }),
  ),
).pipe(Layer.provideMerge(Harness.systemContextLayer))
const skillGuidance = Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) })
const it = Harness.make({ client, models, echo, systemContext, skillGuidance })
const setup = Effect.gen(function* () {
  response = []
  responses = undefined
  streamGate = undefined
  streamStarted = undefined
  modelResolveHook = Effect.void
  currentModel = model
  yield* Harness.setup
})
const setupOverflowRecovery = Effect.gen(function* () {
  yield* setup
  const session = yield* SessionV2.Service
  response = fragmentFixture("text", "text-earlier", ["Earlier answer"]).completeEvents
  yield* session.prompt({
    sessionID,
    prompt: Prompt.make({ text: "Earlier question ".repeat(700) }),
    resume: false,
  })
  yield* session.resume(sessionID)
  currentModel = recoveryModel
  requests.length = 0
  return session
})

describe("SessionRunnerLLM policy", () => {
  it.effect("policy runner reports malformed projected storage as typed error before provider call", () =>
    Effect.gen(function* () {
      yield* setup
      const database = yield* Database.Service
      const session = yield* SessionV2.Service
      const runner = yield* SessionRunner.Service
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Malformed policy" }), resume: false })
      yield* database.db.update(SessionTable).set({ subagent_models: "null" }).where(eq(SessionTable.id, sessionID)).run()
      requests.length = 0
      expect(yield* runner.run({ sessionID, force: true }).pipe(Effect.flip)).toBeInstanceOf(SessionSubagentModels.StorageError)
      expect(requests).toHaveLength(0)
    }),
  )

  it.effect("policy runner leaves root own chat unrestricted even with outgoing deny-all", () =>
    Effect.gen(function* () {
      yield* setup
      const session = yield* SessionV2.Service
      const policies = yield* SessionSubagentModels.Service
      yield* policies.set(sessionID, { mode: "allowlist", models: [] })
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Root own chat" }), resume: false })
      requests.length = 0
      response = fragmentFixture("text", "root-policy", ["Allowed root"]).completeEvents
      yield* session.resume(sessionID)
      expect(requests).toHaveLength(1)
      expect(yield* session.context(sessionID)).toMatchObject([{ type: "user" }, { type: "assistant", finish: "stop" }])
    }),
  )

  it.effect("policy runner rejects unknown identity, passes captured catalog ref to tools and preserves historical wire model", () =>
    Effect.gen(function* () {
      yield* setup
      yield* insertSession(otherSessionID)
      const database = yield* Database.Service
      const session = yield* SessionV2.Service
      const policies = yield* SessionSubagentModels.Service
      const captured = ModelV2.Ref.make({ providerID: ProviderV2.ID.make("fake#credential"), id: ModelV2.ID.make("catalog/model"), variant: ModelV2.VariantID.make("high") })
      yield* database.db.update(SessionTable).set({ parent_id: otherSessionID }).where(eq(SessionTable.id, sessionID)).run()
      yield* policies.set(otherSessionID, { mode: "allowlist", models: [captured] })
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Delegate with captured identity" }), resume: false })
      requests.length = 0
      currentModel = Model.make({ id: "catalog/model", provider: "fake#credential", route })
      expect(yield* session.resume(sessionID).pipe(Effect.flip)).toMatchObject({ _tag: "SessionSubagentModels.ModelDeniedError", reason: "unknown-identity" })
      expect(requests).toHaveLength(0)
      currentModel = SessionRunnerModel.withReference(Model.make({ id: "api-deployment", provider: "fake#credential", route }), captured)
      responses = [[
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.toolCall({ id: "call-catalog-policy", name: "echo", input: { text: "captured" } }),
        LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
        LLMEvent.finish({ reason: "tool-calls" }),
      ], fragmentFixture("text", "catalog-policy-done", ["Done"]).completeEvents]
      authorizations.length = 0
      yield* session.resume(sessionID)
      expect(requests).toHaveLength(2)
      expect(authorizations).toHaveLength(1)
      expect(authorizations[0]?.model).toEqual(captured)
      expect((yield* session.context(sessionID)).filter((message) => message.type === "assistant").map((message) => String(message.model.id))).toEqual(["api-deployment", "api-deployment"])
    }),
  )

  it.effect("policy runner rechecks immediately after model resolution before any provider call", () =>
    Effect.gen(function* () {
      yield* setup
      yield* insertSession(otherSessionID)
      const database = yield* Database.Service
      const policies = yield* SessionSubagentModels.Service
      const session = yield* SessionV2.Service
      const captured = ModelV2.Ref.make({ providerID: ProviderV2.ID.make("fake"), id: ModelV2.ID.make("catalog") })
      currentModel = SessionRunnerModel.withReference(Model.make({ id: "deployment", provider: "fake", route }), captured)
      yield* database.db.update(SessionTable).set({ parent_id: otherSessionID }).where(eq(SessionTable.id, sessionID)).run()
      yield* policies.set(otherSessionID, { mode: "allowlist", models: [captured] })
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Recheck current policy" }), resume: false })
      modelResolveHook = policies.set(otherSessionID, { mode: "allowlist", models: [] }).pipe(Effect.asVoid, Effect.orDie)
      requests.length = 0
      expect(yield* session.resume(sessionID).pipe(Effect.flip)).toMatchObject({ _tag: "SessionSubagentModels.ModelDeniedError", model: captured })
      expect(requests).toHaveLength(0)
    }),
  )

  it.effect("policy runner lets active turn finish, blocks continuation and explicit resume at next boundary", () =>
    Effect.gen(function* () {
      yield* setup
      yield* insertSession(otherSessionID)
      const database = yield* Database.Service
      const policies = yield* SessionSubagentModels.Service
      const session = yield* SessionV2.Service
      const captured = ModelV2.Ref.make({ providerID: ProviderV2.ID.make("fake"), id: ModelV2.ID.make("catalog") })
      currentModel = SessionRunnerModel.withReference(Model.make({ id: "deployment", provider: "fake", route }), captured)
      yield* database.db.update(SessionTable).set({ parent_id: otherSessionID }).where(eq(SessionTable.id, sessionID)).run()
      yield* policies.set(otherSessionID, { mode: "allowlist", models: [captured] })
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "First boundary" }), resume: false })
      response = fragmentFixture("text", "policy-active", ["Turn finished"]).completeEvents
      requests.length = 0
      streamGate = yield* Deferred.make<void>()
      streamStarted = yield* Deferred.make<void>()
      const run = yield* session.resume(sessionID).pipe(Effect.forkChild)
      yield* Deferred.await(streamStarted)
      yield* policies.set(otherSessionID, { mode: "allowlist", models: [] })
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Next boundary" }), resume: false })
      yield* Deferred.succeed(streamGate, undefined)
      expect(yield* Fiber.join(run).pipe(Effect.flip)).toBeInstanceOf(SessionSubagentModels.ModelDeniedError)
      streamGate = undefined
      streamStarted = undefined
      expect(requests).toHaveLength(1)
      expect((yield* session.context(sessionID)).filter((message) => message.type === "assistant")).toMatchObject([{ finish: "stop", content: [{ text: "Turn finished" }] }])
      expect(yield* session.resume(sessionID).pipe(Effect.flip)).toBeInstanceOf(SessionSubagentModels.ModelDeniedError)
      expect(requests).toHaveLength(1)
      yield* policies.set(otherSessionID, { mode: "inherit" })
      yield* session.resume(sessionID)
      expect(requests).toHaveLength(2)
    }),
  )

  it.effect("policy runner blocks overflow compaction when restrictions change during active provider turn", () =>
    Effect.gen(function* () {
      const session = yield* setupOverflowRecovery
      yield* insertSession(otherSessionID)
      const database = yield* Database.Service
      const policies = yield* SessionSubagentModels.Service
      const captured = ModelV2.Ref.make({ providerID: ProviderV2.ID.make("fake"), id: ModelV2.ID.make("recovery-catalog") })
      currentModel = SessionRunnerModel.withReference(Model.make({ ...recoveryModel }), captured)
      yield* database.db.update(SessionTable).set({ parent_id: otherSessionID }).where(eq(SessionTable.id, sessionID)).run()
      yield* policies.set(otherSessionID, { mode: "allowlist", models: [captured] })
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Overflow while restricted" }), resume: false })
      response = [LLMEvent.stepStart({ index: 0 }), LLMEvent.providerError({ message: "prompt too long", classification: "context-overflow" })]
      requests.length = 0
      streamGate = yield* Deferred.make<void>()
      streamStarted = yield* Deferred.make<void>()
      const run = yield* session.resume(sessionID).pipe(Effect.forkChild)
      yield* Deferred.await(streamStarted)
      yield* policies.set(otherSessionID, { mode: "allowlist", models: [] })
      yield* Deferred.succeed(streamGate, undefined)
      expect(yield* Fiber.join(run).pipe(Effect.flip)).toBeInstanceOf(SessionSubagentModels.ModelDeniedError)
      streamGate = undefined
      streamStarted = undefined
      expect(requests).toHaveLength(1)
      expect((yield* session.context(sessionID)).filter((message) => message.type === "compaction")).toEqual([])
    }),
  )
})
