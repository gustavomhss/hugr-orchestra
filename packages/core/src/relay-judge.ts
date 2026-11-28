export * as RelayJudge from "./relay-judge"

import { LLM, LLMClient, ReasoningEfforts } from "@orchestra/llm"
import { JudgeConfig } from "@orchestra/relay/judge/config"
import { SessionID } from "@orchestra/schema/session-id"
import { Context, Effect, Layer, Redacted } from "effect"
import { Siwc } from "./auth/siwc"
import { Catalog } from "./catalog"
import { Config } from "./config"
import type { ConfigRelay } from "./config/relay"
import { ConfigTrust } from "./config/trust"
import { makeLocationNode } from "./effect/app-node"
import { LayerNodePlatform } from "./effect/app-node-platform"
import { Global } from "./global"
import { Integration } from "./integration"
import { Location } from "./location"
import { ModelV2 } from "./model"
import { ProviderV2 } from "./provider"
import { SessionRunnerModel } from "./session/runner/model"

const openai = Integration.ID.make("openai")

type Binding = {
  readonly credentialID: string
  readonly model: string
  readonly variant: string
}

type Selected = { readonly config: JudgeConfig.Config; readonly binding?: Binding }

export class Service extends Context.Service<
  Service,
  {
    readonly config: JudgeConfig.Config
    readonly service: JudgeConfig.Interface
  }
>()("@orchestra/RelayJudge") {}

export function settings(entries: readonly Config.Entry[], globalConfig: string, projectID: string): Selected {
  const merge = (documents: readonly Config.Entry[]) =>
    documents
      .flatMap((entry) => (entry.type === "document" && entry.info.relay?.judge ? [entry.info.relay.judge] : []))
      .reduce<Partial<ConfigRelay.Judge>>((result, current) => ({ ...result, ...current }), {})
  const owner = merge(entries.filter((entry) => ConfigTrust.isUser(globalConfig, entry)))
  const bound = owner.backend === "orchestra" && owner.projectID === projectID
  const configured = bound ? owner : merge(entries)
  const backend = configured.backend ?? JudgeConfig.defaults.backend
  const binding =
    bound &&
    owner.credentialID &&
    owner.model &&
    owner.variant &&
    ReasoningEfforts.some((effort) => effort !== "max" && effort === owner.variant)
      ? { credentialID: owner.credentialID, model: owner.model, variant: owner.variant }
      : undefined
  return {
    config: {
      backend,
      model: binding ? `openai/${binding.model}@${binding.variant}` : configured.model ?? JudgeConfig.defaults.model,
      baseURL: backend === "orchestra" ? undefined : configured.baseURL,
      apiKey: backend !== "orchestra" && configured.apiKey !== undefined ? Redacted.make(configured.apiKey) : undefined,
      votes: configured.votes ?? JudgeConfig.defaults.votes,
      maxContext: configured.maxContext ?? JudgeConfig.defaults.maxContext,
      maxTokens: configured.maxTokens ?? JudgeConfig.defaults.maxTokens,
    },
    binding,
  }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const catalog = yield* Catalog.Service
    const integrations = yield* Integration.Service
    const llm = yield* LLMClient.Service
    const chosen = settings(yield* config.entries(), global.config, location.project.id)
    const selection = chosen.binding
    const native = selection && Effect.fn("RelayJudge.vote")(function* (input: Parameters<JudgeConfig.NativeCall>[0]) {
      const current = settings(yield* config.entries(), global.config, location.project.id)
      // Recheck global opt-in on every sample, including samples in a multi-vote ballot.
      if (
        !current.binding ||
        current.binding.credentialID !== selection.credentialID ||
        current.binding.model !== selection.model ||
        current.binding.variant !== selection.variant ||
        current.config.votes !== chosen.config.votes ||
        current.config.maxContext !== chosen.config.maxContext
      )
        return yield* Effect.fail("the user-configured Orchestra judge binding changed")

      const connection = yield* integrations.connection.active(openai)
      if (connection?.type !== "credential" || connection.id !== selection.credentialID)
        return yield* Effect.fail("the configured ChatGPT plan OAuth connection is not active")
      const credential = yield* integrations.connection.resolve(connection).pipe(
        Effect.mapError(() => "the configured ChatGPT plan OAuth connection could not be resolved"),
      )
      if (credential?.type !== "oauth" || credential.methodID !== Siwc.methodID || !Siwc.permits(credential, selection.model))
        return yield* Effect.fail("the ChatGPT plan OAuth connection is expired or lacks the configured model")

      const catalogModel = (yield* catalog.model.available()).find(
        (model) =>
          model.providerID === ProviderV2.ID.openai && model.id === selection.model && model.api.id === selection.model,
      )
      const variant = catalogModel?.variants.find((item) => item.id === selection.variant)
      if (!catalogModel || !variant || catalogModel.api.type !== "aisdk" || catalogModel.api.package !== "@ai-sdk/openai")
        return yield* Effect.fail("the configured OpenAI judge model or variant is unavailable")
      // The catalog confirms identity and availability. Project request overlays may never select where
      // the OAuth credential goes or modify the owner's judge request.
      const isolated = ModelV2.Info.make({
        ...catalogModel,
        api: { type: "aisdk", id: catalogModel.api.id, package: catalogModel.api.package },
        request: { headers: {}, body: {} },
      })
      const model = yield* SessionRunnerModel.fromCatalogModel(isolated, credential, {
        id: variant.id,
        headers: {},
        body: {},
        providerOptions: { openai: { reasoningEffort: selection.variant } },
      }).pipe(Effect.mapError(() => "the configured OpenAI judge route is unsupported"))
      const response = yield* llm
        .generate(
          LLM.request({
            model,
            http: { headers: SessionRunnerModel.sessionHeaders(model, SessionID.descending()) },
            system: input.system,
            prompt: input.prompt,
            tools: [{ name: input.tool.name, description: input.tool.description, inputSchema: input.tool.input_schema }],
            toolChoice: input.tool.name,
          }),
        )
        .pipe(Effect.mapError(() => "the OpenAI judge request failed"))
      const calls = response.toolCalls
      const call = calls[0]
      if (response.finishReason !== "tool-calls" || calls.length !== 1 || call?.name !== input.tool.name)
        return yield* Effect.fail("the OpenAI judge did not complete one verdict")
      return call.input
    })
    const service = yield* JudgeConfig.Service.pipe(Effect.provide(JudgeConfig.layer(chosen.config, native)))
    return Service.of({ config: chosen.config, service })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Config.node, Global.node, Location.node, Catalog.node, Integration.node, LayerNodePlatform.llmClient],
})
