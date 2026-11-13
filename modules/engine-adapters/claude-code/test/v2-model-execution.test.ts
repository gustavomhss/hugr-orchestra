import { expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { GenerationOptions, LLM } from "@orchestra/llm"
import { LLMClient } from "@orchestra/llm/route"
import { AgentV2 } from "@orchestra/core/agent"
import { Catalog } from "@orchestra/core/catalog"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Integration } from "@orchestra/core/integration"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { EligibilityFixture } from "./fixture/model-eligibility"
import { Harness } from "@orchestra/core/test/session-runner-harness"
import { testEffect } from "@orchestra/core/test/lib/effect"

// Original missing-API evidence is retained in the audit ledger; this integration now uses the public Core entry.
const future = await import("@orchestra/core/model-execution")
const it = testEffect(Layer.unwrap(Effect.suspend(() => {
  if (!future) return Effect.die("API RED E6: ModelExecution module is not implemented")
  return Effect.succeed(AppNodeBuilder.build(LayerNode.group([
    future.ModelExecution.node, AgentV2.node, Catalog.node, Integration.node, Database.node,
    SessionStore.node, SessionSubagentModels.node,
  ]), [[Database.node, EligibilityFixture.database], [Location.node, Location.boundNode({ directory: AbsolutePath.make("/project") })], [ExecutionHost.node, EligibilityFixture.hosts]]))
})))
const setup = Effect.gen(function* () { yield* Harness.setup; yield* EligibilityFixture.seed })
const describe = Effect.fn(function* (input: {
  context: { type: "session"; sessionID: SessionV2.ID; agentID?: string } | { type: "draft"; agentID?: string; parentID?: SessionV2.ID }
  model?: ModelV2.Ref
}) {
  if (!future) return yield* Effect.die("API RED E6: ModelExecution module is not implemented")
  const service = yield* future.ModelExecution.Service
  return yield* service.describe(input)
})
const draft = (agentID = "maestro") => ({ type: "draft" as const, agentID })

it.effect("API E6: native inventory keeps globally available unsupported models and exact invalid selections", () => Effect.gen(function* () {
  yield* setup
  const catalog = yield* Catalog.Service
  expect((yield* catalog.model.available()).map((model) => model.providerID)).toContain(ProviderV2.ID.make("google"))
  const result = yield* describe({ context: draft(), model: EligibilityFixture.ref("google") })
  expect(result.selection).toMatchObject({ ref: EligibilityFixture.ref("google"), engine: "orchestra", status: "unsupported", reason: "unsupported-api" })
  expect(result.models.find((row) => row.model.providerID === "openai")).toMatchObject({ engine: "orchestra", status: "ready" })
  expect(result.models.find((row) => row.model.providerID === "google")).toMatchObject({ status: "unsupported" })
  expect((yield* catalog.model.available()).map((model) => model.providerID)).toContain(ProviderV2.ID.make("google"))
  expect((yield* describe({ context: draft() })).selection).toBeUndefined()
}))

it.effect("API E6: a secondary Claude seat sees host-only Anthropic without enabling it globally", () => Effect.gen(function* () {
  yield* setup
  const catalog = yield* Catalog.Service
  expect((yield* catalog.model.available()).some((model) => model.providerID === "anthropic")).toBe(false)
  const result = yield* describe({ context: draft("host-seat"), model: EligibilityFixture.ref("anthropic", "high") })
  expect(result.selection).toMatchObject({ engine: "claude-code", status: "ready" })
  expect(result.models.find((row) => row.model.providerID === "anthropic")).toMatchObject({ status: "ready" })
  expect((yield* describe({ context: draft(), model: EligibilityFixture.ref("anthropic") })).selection)
    .toMatchObject({ engine: "orchestra", status: "unavailable", reason: "connection-unavailable" })
  expect(EligibilityFixture.state.options).toEqual([])
}))

it.effect("API E6: prospective agent/model inheritance uses stored parent and never changes the Session", () => Effect.gen(function* () {
  yield* setup
  const database = yield* Database.Service
  const parentID = SessionV2.ID.make("ses_eligibility_parent")
  yield* Harness.insertSession(parentID)
  yield* database.db.update(SessionTable).set({ agent: AgentV2.ID.make("host-seat") }).where(eq(SessionTable.id, parentID)).run()
  yield* database.db.update(SessionTable).set({ parent_id: parentID, agent: AgentV2.ID.make("inherit-seat") }).where(eq(SessionTable.id, Harness.sessionID)).run()
  const store = yield* SessionStore.Service
  const before = yield* store.get(Harness.sessionID)
  const context = { type: "session" as const, sessionID: Harness.sessionID }
  expect((yield* describe({ context, model: EligibilityFixture.ref("anthropic") })).selection)
    .toMatchObject({ engine: "claude-code", status: "ready" })
  expect((yield* describe({ context, model: EligibilityFixture.ref("google") })).selection)
    .toMatchObject({ engine: "orchestra", reason: "unsupported-api" })
  expect((yield* describe({ context: { ...context, agentID: "maestro" }, model: EligibilityFixture.ref("anthropic") })).selection)
    .toMatchObject({ engine: "orchestra", reason: "connection-unavailable" })
  expect(yield* store.get(Harness.sessionID)).toEqual(before)
}))

it.effect("API E6: own ceilings constrain drafts/children and do not constrain their owner Session", () => Effect.gen(function* () {
  yield* setup
  const policies = yield* SessionSubagentModels.Service
  yield* policies.set(Harness.sessionID, { mode: "allowlist", models: [EligibilityFixture.ref("openai")] })
  expect((yield* describe({ context: { type: "session", sessionID: Harness.sessionID, agentID: "host-seat" },
    model: EligibilityFixture.ref("anthropic") })).selection).toMatchObject({ status: "ready" })
  expect((yield* describe({ context: { type: "draft", parentID: Harness.sessionID, agentID: "host-seat" },
    model: EligibilityFixture.ref("anthropic") })).selection).toMatchObject({ status: "unavailable", reason: "model-denied" })
}))

it.effect("API E6: missing candidate stays only in selection and disabled candidate retains its real inventory row", () => Effect.gen(function* () {
  yield* setup
  const missing = ModelV2.Ref.make({ ...EligibilityFixture.ref("openai"), id: ModelV2.ID.make("missing") })
  const result = yield* describe({ context: draft(), model: missing })
  expect(result.selection).toMatchObject({ ref: missing, status: "unavailable", reason: "model-missing" })
  expect(result.models.some((row) => row.model.id === "missing")).toBe(false)
  const catalog = yield* Catalog.Service
  yield* catalog.transform((draft) => draft.model.update(ProviderV2.ID.openai, ModelV2.ID.make("fixture"), (model) => { model.enabled = false }))
  const disabled = yield* describe({ context: draft(), model: EligibilityFixture.ref("openai") })
  expect(disabled.selection).toMatchObject({ status: "unavailable", reason: "model-disabled" })
  expect(disabled.models.find((row) => row.model.providerID === "openai")).toMatchObject({ model: { enabled: false } })
}))

for (const condition of ["unregistered", "signed-out", "account-error", "provider-disabled"] as const) {
  it.effect(`API E6: host ${condition} cannot authorize an explicit model`, () => Effect.gen(function* () {
    yield* setup
    if (condition === "unregistered") EligibilityFixture.state.registered = false
    if (condition === "signed-out") EligibilityFixture.state.signedIn = false
    if (condition === "account-error") EligibilityFixture.state.accountFails = true
    if (condition === "provider-disabled") {
      const catalog = yield* Catalog.Service
      yield* catalog.transform((draft) => draft.provider.update(ProviderV2.ID.anthropic, (provider) => { provider.disabled = true }))
    }
    const result = yield* describe({ context: draft("host-seat"), model: EligibilityFixture.ref("anthropic") })
    expect(result.selection).toMatchObject({ engine: "claude-code", status: "unavailable" })
    if (condition !== "provider-disabled") expect(result.selection).toMatchObject({ reason: condition === "unregistered" ? "host-unregistered" : "host-unavailable" })
    expect(EligibilityFixture.state.options).toEqual([])
  }))
}

it.effect("API E6: configured variant inheritance exposes canonical host options instead of ignoring them", () => Effect.gen(function* () {
  yield* setup
  const catalog = yield* Catalog.Service
  yield* catalog.transform((draft) => draft.model.update(ProviderV2.ID.anthropic, ModelV2.ID.make("fixture"), (model) => {
    model.request.variant = "high"
    Object.assign(model.variants[0], { generation: GenerationOptions.make({ temperature: 0 }) })
  }))
  expect((yield* describe({ context: draft("host-seat"), model: EligibilityFixture.ref("anthropic") })).selection)
    .toMatchObject({ status: "unsupported", reason: "host-options-unsupported" })
  expect((yield* describe({ context: draft("host-seat"), model: EligibilityFixture.ref("anthropic", "missing") })).selection)
    .toMatchObject({ status: "unavailable", reason: "variant-unavailable" })
  expect(EligibilityFixture.state.options).toEqual([])
}))

it.effect("API E6: structural ready remains distinct from actual protocol lowering validity", () => Effect.gen(function* () {
  yield* setup
  const catalog = yield* Catalog.Service
  yield* catalog.transform((draft) => {
    draft.provider.update(ProviderV2.ID.anthropic, (provider) => { provider.api.settings = { apiKey: "FICTITIOUS_KEY" } })
    draft.model.update(ProviderV2.ID.anthropic, ModelV2.ID.make("fixture"), (model) => {
      model.variants[0].providerOptions = { anthropic: { thinking: { type: "enabled" } } }
    })
  })
  const selected = EligibilityFixture.ref("anthropic", "high")
  expect((yield* describe({ context: draft(), model: selected })).selection).toMatchObject({ status: "ready" })
  const model = yield* catalog.model.get(selected.providerID, selected.id)
  if (!model) throw new Error("Expected actual catalog model")
  const store = yield* SessionStore.Service
  const stored = yield* store.get(Harness.sessionID)
  if (!stored) throw new Error("Expected actual Session")
  const resolved = yield* SessionRunnerModel.resolve(SessionV2.Info.make({ ...stored, model: selected }), model)
  const failure = yield* LLMClient.prepare(LLM.request({ model: resolved, prompt: "Protocol boundary" })).pipe(
    Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }),
  )
  expect(failure?.message).toContain("budgetTokens")
  expect(EligibilityFixture.state.options).toEqual([])
}))

for (const invalid of ["generation", "body"]) {
  it.effect(`API E6: invalid structural ${invalid} options are unavailable before native preparation`, () => Effect.gen(function* () {
    yield* setup
    const catalog = yield* Catalog.Service
    yield* catalog.transform((draft) => {
      if (invalid === "generation") draft.provider.update(ProviderV2.ID.openai, (provider) => {
        provider.api.settings = { ...provider.api.settings, generation: { temperature: "bad" } }
      })
      if (invalid === "body") draft.model.update(ProviderV2.ID.openai, ModelV2.ID.make("fixture"), (model) => {
        model.request.body.temperature = 0
      })
    })
    expect((yield* describe({ context: draft(), model: EligibilityFixture.ref("openai") })).selection)
      .toMatchObject({ status: "unavailable", reason: "invalid-options" })
    expect(EligibilityFixture.state.options).toEqual([])
  }))
}

for (const reason of ["session-missing", "parent-missing", "location-mismatch", "parent-location-mismatch", "agent-missing", "agent-default-missing"] as const) {
  it.effect(`API E6: ${reason} rejects the whole context without fabricated model metadata`, () => Effect.gen(function* () {
    yield* setup
    const other = SessionV2.ID.make("ses_eligibility_other")
    if (reason === "location-mismatch" || reason === "parent-location-mismatch") yield* Harness.insertSession(other, "/other-location")
    if (reason === "agent-default-missing") {
      const agents = yield* AgentV2.Service
      yield* agents.transform((draft) => { for (const agent of draft.list()) draft.remove(agent.id) })
    }
    const context = reason === "session-missing" || reason === "location-mismatch"
      ? { type: "session" as const, sessionID: other }
      : reason === "parent-missing" || reason === "parent-location-mismatch" ? { type: "draft" as const, parentID: other }
      : reason === "agent-default-missing" ? { type: "draft" as const } : draft("missing-agent")
    const error = yield* describe({ context, model: EligibilityFixture.ref("openai") }).pipe(
      Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }),
    )
    expect(error).toMatchObject({ _tag: "ModelExecution.ContextError", reason:
      reason === "parent-location-mismatch" ? "location-mismatch" : reason === "agent-default-missing" ? "agent-missing" : reason })
    expect(EligibilityFixture.state.options).toEqual([])
  }))
}
