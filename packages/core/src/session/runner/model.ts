export * as SessionRunnerModel from "./model"

import { makeLocationNode } from "../../effect/app-node"
import { GenerationOptions, type Model } from "@orchestra/llm"
import * as AnthropicMessages from "@orchestra/llm/protocols/anthropic-messages"
import * as OpenAICompatibleChat from "@orchestra/llm/protocols/openai-compatible-chat"
import * as OpenAIResponses from "@orchestra/llm/protocols/openai-responses"
import { Auth, type AnyRoute } from "@orchestra/llm/route"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { produce } from "immer"
import { Catalog } from "../../catalog"
import { Credential } from "../../credential"
import { Integration } from "../../integration"
import { ModelV2 } from "../../model"
import { ProviderV2 } from "../../provider"
import { SessionSchema } from "../schema"
import { SessionSubagentModels } from "../subagent-models"

const references = new WeakMap<Model, ModelV2.Ref>()
const prices = new WeakMap<Model, ReadonlyArray<ModelV2.Cost>>()

export const reference = (model: Model): ModelV2.Ref | undefined => references.get(model)

/** The catalog price list of a model this module resolved; empty for an embedded resolver's own models. */
export const pricing = (model: Model): ReadonlyArray<ModelV2.Cost> => prices.get(model) ?? []

/**
 * USD for one settled step under a price list (rates per million tokens). The tier whose context size the prompt
 * exceeds, the largest such, replaces the base rate; reasoning tokens bill at the output rate, as the earlier runtime billed them.
 */
export const cost = (
  list: ReadonlyArray<ModelV2.Cost>,
  tokens: { readonly input: number; readonly output: number; readonly reasoning: number; readonly cache: { readonly read: number; readonly write: number } },
) => {
  const prompt = tokens.input + tokens.cache.read + tokens.cache.write
  const tier = list
    .filter((item) => item.tier !== undefined && prompt > item.tier.size)
    .toSorted((a, b) => (b.tier?.size ?? 0) - (a.tier?.size ?? 0))[0]
  const rate = tier ?? list.find((item) => item.tier === undefined)
  if (!rate) return 0
  const total =
    (tokens.input * rate.input +
      (tokens.output + tokens.reasoning) * rate.output +
      tokens.cache.read * rate.cache.read +
      tokens.cache.write * rate.cache.write) /
    1_000_000
  return Number.isFinite(total) ? Math.max(0, total) : 0
}

/** Captures catalog identity before transport/deployment lowering, including for embedded resolvers. */
export const withReference = (model: Model, ref: ModelV2.Ref): Model => {
  references.set(
    model,
    ModelV2.Ref.make({
      id: ref.id,
      providerID: ref.providerID,
      ...(ref.variant === undefined ? {} : { variant: ref.variant }),
    }),
  )
  return model
}

export class ModelNotSelectedError extends Schema.TaggedErrorClass<ModelNotSelectedError>()(
  "SessionRunnerModel.ModelNotSelectedError",
  {
    sessionID: SessionSchema.ID,
  },
) {
  override get message() {
    return `No model is available for session ${this.sessionID}`
  }
}

export class ModelUnavailableError extends Schema.TaggedErrorClass<ModelUnavailableError>()(
  "SessionRunnerModel.ModelUnavailableError",
  {
    providerID: ProviderV2.ID,
    modelID: ModelV2.ID,
    cause: Schema.String.pipe(Schema.optional),
  },
) {
  override get message() {
    return `Model unavailable: ${this.providerID}/${this.modelID}`
  }
}

export class VariantUnavailableError extends Schema.TaggedErrorClass<VariantUnavailableError>()(
  "SessionRunnerModel.VariantUnavailableError",
  {
    providerID: ProviderV2.ID,
    modelID: ModelV2.ID,
    variant: ModelV2.VariantID,
  },
) {
  override get message() {
    return `Variant unavailable for ${this.providerID}/${this.modelID}: ${this.variant}`
  }
}

export class UnsupportedApiError extends Schema.TaggedErrorClass<UnsupportedApiError>()(
  "SessionRunnerModel.UnsupportedApiError",
  {
    providerID: ProviderV2.ID,
    modelID: ModelV2.ID,
    api: Schema.String,
  },
) {
  override get message() {
    return `Unsupported API for ${this.providerID}/${this.modelID}: ${this.api}`
  }
}

export type Error =
  | SessionSubagentModels.Error
  | ModelNotSelectedError
  | ModelUnavailableError
  | VariantUnavailableError
  | UnsupportedApiError
  | Integration.AuthorizationError
  | Credential.InheritedError

export interface Interface {
  readonly resolve: (session: SessionSchema.Info) => Effect.Effect<Model, Error>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionRunnerModel") {}

/** Test or embedding seam for supplying a model resolver directly. */
export const layerWith = (resolve: Interface["resolve"]) => Layer.succeed(Service, Service.of({ resolve }))

const apiKey = (model: ModelV2.Info, credential?: Credential.Value) => {
  if (credential?.type === "key") return Auth.value(credential.key)
  if (credential?.type === "oauth") return Auth.value(credential.access)
  const value = model.request.body.apiKey ?? model.api.settings?.apiKey
  if (typeof value === "string") return Auth.value(value)
}

const withDefaults = (model: ModelV2.Info, route: AnyRoute, generation: GenerationOptions) => {
  const body = model.request.body
  const httpBody = Object.hasOwn(body, "apiKey")
    ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== "apiKey"))
    : body
  return route.with({
    provider: model.providerID,
    endpoint: model.api.url === undefined ? undefined : { baseURL: model.api.url },
    headers: model.request.headers,
    http: { body: httpBody },
    limits: {
      context: model.limit.context,
      ...(model.limit.input === undefined ? {} : { input: model.limit.input }),
      output: model.limit.output,
    },
    generation,
  })
}

const withVariant = (
  model: ModelV2.Info,
  variantID: ModelV2.VariantID | undefined,
): Effect.Effect<ModelV2.Info, VariantUnavailableError> => {
  const id = variantID === "default" || variantID === undefined ? model.request.variant : variantID
  const variant = model.variants.find((item) => item.id === id)
  if (!variant && variantID !== undefined && variantID !== "default")
    return Effect.fail(
      new VariantUnavailableError({
        providerID: model.providerID,
        modelID: model.id,
        variant: variantID,
      }),
    )
  return Effect.succeed(
    variant
      ? produce(model, (draft) => {
          Object.assign(draft.request.headers, variant.headers)
          Object.assign(draft.request.body, variant.body)
        })
      : model,
  )
}

const apiName = (model: ModelV2.Info) =>
  model.api.type === "aisdk" ? `${model.api.type}:${model.api.package}` : model.api.type

export const fromCatalogModel = (
  model: ModelV2.Info,
  credential?: Credential.Value,
): Effect.Effect<Model, UnsupportedApiError | ModelUnavailableError> => {
  // Native V2 api.settings.generation uses canonical LLM options, not http.body.
  // Strict decoding rejects misspellings/coercion; absence keeps empty defaults.
  const generation = Schema.decodeUnknownOption(GenerationOptions, { onExcessProperty: "error" })(
    model.api.settings?.generation === undefined ? {} : model.api.settings.generation,
  )
  if (Option.isNone(generation))
    return Effect.fail(
      new ModelUnavailableError({
        providerID: model.providerID,
        modelID: model.id,
        cause: "Invalid api.settings.generation: expected canonical GenerationOptions",
      }),
    )
  const resolved =
    credential?.type !== "key" || credential.metadata === undefined
      ? model
      : produce(model, (draft) => {
          Object.assign(draft.request.body, credential.metadata)
        })
  const key = apiKey(resolved, credential)
  if (resolved.api.type === "aisdk" && resolved.api.package === "@ai-sdk/openai") {
    return Effect.succeed(
      withDefaults(resolved, OpenAIResponses.route, generation.value)
        .with({ auth: key === undefined ? Auth.none : Auth.bearer(key) })
        .model({ id: resolved.api.id }),
    ).pipe(Effect.map((value) => withPrices(withReference(value, model), model)))
  }
  if (resolved.api.type === "aisdk" && resolved.api.package === "@ai-sdk/anthropic") {
    return Effect.succeed(
      withDefaults(resolved, AnthropicMessages.route, generation.value)
        .with({ auth: key === undefined ? Auth.none : Auth.header("x-api-key", key) })
        .model({ id: resolved.api.id }),
    ).pipe(Effect.map((value) => withPrices(withReference(value, model), model)))
  }
  if (openAICompatible(resolved)) {
    return Effect.succeed(
      withDefaults(resolved, OpenAICompatibleChat.route, generation.value)
        .with({ auth: key === undefined ? Auth.none : Auth.bearer(key) })
        .model({ id: resolved.api.id }),
    ).pipe(Effect.map((value) => withPrices(withReference(value, model), model)))
  }
  return Effect.fail(
    new UnsupportedApiError({
      providerID: resolved.providerID,
      modelID: resolved.id,
      api: apiName(resolved),
    }),
  )
}

const withPrices = (value: Model, model: ModelV2.Info) => {
  prices.set(value, model.cost)
  return value
}

export const resolve = (session: SessionSchema.Info, model: ModelV2.Info, credential?: Credential.Value) =>
  withVariant(model, session.model?.variant).pipe(
    Effect.flatMap((model) => fromCatalogModel(model, credential)),
    Effect.map((value) =>
      withReference(value, { id: model.id, providerID: model.providerID, variant: session.model?.variant }),
    ),
  )

export const supported = (model: ModelV2.Info) =>
  openAICompatible(model) ||
  (model.api.type === "aisdk" && (model.api.package === "@ai-sdk/openai" || model.api.package === "@ai-sdk/anthropic"))

// A native model with an endpoint and no package speaks the OpenAI-compatible chat API, the earlier runtime's default
// package. OpenRouter's own AI SDK package is a client for the same chat API.
const openAICompatible = (model: ModelV2.Info) =>
  model.api.url !== undefined &&
  (model.api.type === "native" ||
    model.api.package === "@ai-sdk/openai-compatible" ||
    model.api.package === "@openrouter/ai-sdk-provider")

/** Resolves models from the catalog belonging to the current Location runtime. */
export const locationLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const catalog = yield* Catalog.Service
    const integrations = yield* Integration.Service
    const policies = yield* SessionSubagentModels.Service
    return Service.of({
      resolve: Effect.fn("SessionRunnerModel.resolve")(function* (session) {
        // Location plugins populate and filter the catalog asynchronously during layer startup.
        const ceilings = yield* policies.forSession(session.id)
        if (session.model && !SessionSubagentModels.permits(ceilings, session.model))
          return yield* new SessionSubagentModels.ModelDeniedError({
            sessionID: session.id,
            model: session.model,
            reason: "not-allowed",
          })
        const candidates = (yield* catalog.model.available()).filter((model) =>
          SessionSubagentModels.permits(ceilings, model),
        )
        const defaultModel = session.model || candidates.length === 0 ? undefined : yield* catalog.model.default()
        const selected = session.model
          ? candidates.find((model) => model.providerID === session.model?.providerID && model.id === session.model.id)
          : (candidates.find(
              (model) =>
                model.providerID === defaultModel?.providerID && model.id === defaultModel.id && supported(model),
            ) ?? candidates.find(supported))
        if (!selected && session.model)
          return yield* new ModelUnavailableError({
            providerID: session.model.providerID,
            modelID: session.model.id,
          })
        if (!selected) return yield* new ModelNotSelectedError({ sessionID: session.id })
        return yield* resolve(session, selected, yield* credential(catalog, integrations, selected))
      }),
    })
  }),
)

/**
 * The credential a catalog model runs with: a virtual provider's own credential connection, else the provider's
 * active connection. Also used to run a model outside any Session (the Atlas screen's one-shot model calls).
 */
export const credential = Effect.fn("SessionRunnerModel.credential")(function* (
  catalog: Catalog.Interface,
  integrations: Integration.Interface,
  selected: ModelV2.Info,
) {
  const provider = yield* catalog.provider.get(selected.providerID)
  const virtual = Catalog.parseVirtualID(selected.providerID)
  const baseID = virtual?.base ?? selected.providerID
  const fallback = provider?.integrationID ?? Integration.ID.make(baseID)
  if (virtual) {
    const connection = (yield* integrations.get(Integration.ID.make(baseID)))?.connections.find(
      (item) => item.type === "credential" && item.id === virtual.credentialID,
    )
    if (!connection)
      return yield* new ModelUnavailableError({
        providerID: selected.providerID,
        modelID: selected.id,
        cause: `credential ${virtual.credentialID} not found`,
      })
    return yield* integrations.connection.resolve(connection)
  }
  const connection = yield* integrations.connection.active(fallback)
  return connection ? yield* integrations.connection.resolve(connection) : undefined
})

export const node = makeLocationNode({
  service: Service,
  layer: locationLayer,
  deps: [Catalog.node, Integration.node, SessionSubagentModels.node],
})
