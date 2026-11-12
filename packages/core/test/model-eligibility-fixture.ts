export * as EligibilityFixture from "./model-eligibility-fixture"

import { AgentV2 } from "@orchestra/core/agent"
import { Catalog } from "@orchestra/core/catalog"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { Integration } from "@orchestra/core/integration"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { LLMEvent, type Model } from "@orchestra/llm"
import { Effect, Layer, Stream } from "effect"
import { ClaudeCodeSDK } from "../../../modules/engine-adapters/claude-code/src/sdk"
import { ClaudeCodeHost } from "../../../modules/engine-adapters/claude-code/src/v2/host"
import { ScriptedSDK } from "../../../modules/engine-adapters/claude-code/test/fixture/scripted-sdk"

const options: ScriptedSDK.Options[] = []
export const state = { options, signedIn: true, accountFails: false, registered: true,
  customReady: false, useCustomHost: false, customCalls: 0, tools: 0, materializations: 0, nativeResolves: 0, nativeModel: undefined as Model | undefined }
export const ref = (providerID: string, variant?: string) => ModelV2.Ref.make({
  providerID: ProviderV2.ID.make(providerID), id: ModelV2.ID.make("fixture"),
  ...(variant === undefined ? {} : { variant: ModelV2.VariantID.make(variant) }),
})

const sdk = Layer.succeed(ClaudeCodeSDK.Service, ClaudeCodeSDK.Service.of({
  // Only the SDK boundary is scripted. Eligibility and host streaming are the real implementations.
  query: (input) => ScriptedSDK.query(input, state.options),
}))
export const account = Layer.succeed(ClaudeCodeAccount.Service, ClaudeCodeAccount.Service.of({
  account: Effect.suspend(() => state.accountFails ? Effect.die(new Error("Fictitious account read failure"))
    : Effect.succeed({ signedIn: state.signedIn })),
  startLogin: Effect.never,
  sendCode: () => Effect.succeed(false),
}))
export const claude = ClaudeCodeHost.make.pipe(Effect.provide(sdk), Effect.provide(account),
  Effect.provideService(ClaudeCodeSDK.Environment, {}))
export const custom = {
  id: "claude-code", stateKey: "eligibilityFixture",
  describeModel: () => Effect.sync(() => state.customReady ? { status: "ready" as const }
    : { status: "unsupported" as const, reason: "host-model-unsupported" as const }),
  stream: () => Stream.suspend(() => {
    state.customCalls++
    return Stream.make(LLMEvent.stepStart({ index: 0 }), LLMEvent.stepFinish({ index: 0, reason: "stop" }))
  }),
}
export const hosts = Layer.effect(ExecutionHost.Service, claude.pipe(Effect.map((host) => ExecutionHost.Service.of({
  get: (engine) => !state.registered ? undefined : engine === host.id ? state.useCustomHost ? custom : host : undefined,
}))))

export const seed = Effect.gen(function* () {
  state.options.length = 0
  state.signedIn = true
  state.accountFails = false
  state.registered = true
  state.customReady = false
  state.useCustomHost = false
  state.customCalls = 0
  state.tools = 0
  state.materializations = 0
  state.nativeResolves = 0
  state.nativeModel = undefined
  const agents = yield* AgentV2.Service
  yield* agents.transform((draft) => {
    draft.update(AgentV2.defaultID, (agent) => { agent.engine = "orchestra"; agent.mode = "primary" })
    draft.update(AgentV2.ID.make("host-seat"), (agent) => { agent.engine = "claude-code"; agent.mode = "primary" })
    draft.update(AgentV2.ID.make("inherit-seat"), (agent) => { agent.engine = undefined; agent.mode = "all" })
    draft.update(AgentV2.ID.make("custom-seat"), (agent) => { agent.engine = "claude-code"; agent.mode = "primary" })
  })
  const integrations = yield* Integration.Service
  yield* integrations.transform((draft) => {
    for (const provider of ["openai", "google", "anthropic"])
      draft.update(Integration.ID.make(provider), () => {})
  })
  const catalog = yield* Catalog.Service
  yield* catalog.transform((draft) => {
    for (const provider of ["openai", "google", "anthropic"]) {
      const providerID = ProviderV2.ID.make(provider)
      draft.provider.update(providerID, (item) => {
        item.api = { type: "aisdk", package: `@ai-sdk/${provider}`, url: "http://127.0.0.1:1/v1",
          settings: provider === "anthropic" ? {} : { apiKey: "FICTITIOUS_KEY" } }
      })
      draft.model.update(providerID, ModelV2.ID.make("fixture"), (model) => {
        model.name = provider
        model.enabled = true
        model.variants = [
          { id: ModelV2.VariantID.make("high"), headers: {}, body: {} },
          { id: ModelV2.VariantID.make("other"), headers: {}, body: {} },
        ]
      })
    }
    draft.model.default.set(ProviderV2.ID.openai, ModelV2.ID.make("fixture"))
  })
})
