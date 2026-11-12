export * as ModelExecutionOptions from "./model-execution-options"

import { GenerationOptions, mergeGenerationOptions, mergeProviderOptions, ProviderOptions } from "@orchestra/llm"
import { HttpTransport } from "@orchestra/llm/route"
import { Effect, Option, Schema } from "effect"
import { produce } from "immer"
import { ModelV2 } from "./model"
import { ProviderV2 } from "./provider"

export class ModelUnavailableError extends Schema.TaggedErrorClass<ModelUnavailableError>()(
  "SessionRunnerModel.ModelUnavailableError",
  { providerID: ProviderV2.ID, modelID: ModelV2.ID, cause: Schema.String.pipe(Schema.optional) },
) {
  override get message() {
    return `Model unavailable: ${this.providerID}/${this.modelID}`
  }
}
export class VariantUnavailableError extends Schema.TaggedErrorClass<VariantUnavailableError>()(
  "SessionRunnerModel.VariantUnavailableError",
  { providerID: ProviderV2.ID, modelID: ModelV2.ID, variant: ModelV2.VariantID },
) {
  override get message() {
    return `Variant unavailable for ${this.providerID}/${this.modelID}: ${this.variant}`
  }
}
export class UnsupportedApiError extends Schema.TaggedErrorClass<UnsupportedApiError>()(
  "SessionRunnerModel.UnsupportedApiError",
  { providerID: ProviderV2.ID, modelID: ModelV2.ID, api: Schema.String },
) {
  override get message() {
    return `Unsupported API for ${this.providerID}/${this.modelID}: ${this.api}`
  }
}

export function selectVariant(
  model: ModelV2.Info,
  variantID: ModelV2.VariantID | undefined,
): Effect.Effect<{ readonly model: ModelV2.Info; readonly variant: ModelV2.Info["variants"][number] | undefined }, VariantUnavailableError> {
  const id = variantID === "default" || variantID === undefined ? model.request.variant : variantID
  const variant = model.variants.find((item) => item.id === id)
  if (!variant && id !== undefined)
    return Effect.fail(
      new VariantUnavailableError({
        providerID: model.providerID,
        modelID: model.id,
        variant: ModelV2.VariantID.make(id),
      }),
    )
  return Effect.succeed({
    variant,
    model: variant
      ? produce(model, (draft) => {
          Object.assign(draft.request.headers, variant.headers)
          Object.assign(draft.request.body, variant.body)
        })
      : model,
  })
}

export function options(
  model: ModelV2.Info,
  variant?: ModelV2.Info["variants"][number],
): Effect.Effect<{ readonly generation: GenerationOptions | undefined; readonly providerOptions: ProviderOptions }, ModelUnavailableError> {
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
  const selected = Schema.decodeUnknownOption(GenerationOptions, { onExcessProperty: "error" })(
    variant?.generation === undefined ? {} : variant.generation,
  )
  const providerOptions = Schema.decodeUnknownOption(ProviderOptions)(
    variant?.providerOptions === undefined ? {} : variant.providerOptions,
  )
  if (Option.isNone(selected) || Option.isNone(providerOptions))
    return Effect.fail(
      new ModelUnavailableError({
        providerID: model.providerID,
        modelID: model.id,
        cause: "Invalid canonical variant generation/providerOptions",
      }),
    )
  return Effect.succeed({
    generation: mergeGenerationOptions(generation.value, selected.value),
    providerOptions: mergeProviderOptions(providerOptions.value) ?? {},
  })
}

export function validateBody(model: ModelV2.Info): Effect.Effect<void, ModelUnavailableError> {
  const keys = HttpTransport.forbiddenBodyOverlayKeys(model.request.body)
  return keys.length === 0
    ? Effect.void
    : Effect.fail(
        new ModelUnavailableError({
          providerID: model.providerID,
          modelID: model.id,
          cause: `request.body cannot overlay protocol-owned field(s): ${keys.join(", ")}; use api.settings.generation, variant.generation or variant.providerOptions`,
        }),
      )
}

export const supported = (model: ModelV2.Info) =>
  openAICompatible(model) ||
  (model.api.type === "aisdk" && (model.api.package === "@ai-sdk/openai" || model.api.package === "@ai-sdk/anthropic"))

export const openAICompatible = (model: ModelV2.Info) =>
  model.api.url !== undefined &&
  (model.api.type === "native" ||
    model.api.package === "@ai-sdk/openai-compatible" ||
    model.api.package === "@openrouter/ai-sdk-provider")
