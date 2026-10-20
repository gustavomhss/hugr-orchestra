import type { LanguageModelV3 } from "@ai-sdk/provider"
import type { Model } from "@orchestra/schema/model"

type ModelV2Info = typeof Model.Info.Encoded
import type { Hooks } from "./registration.js"

export type AISDKHooks = Hooks<{
  sdk: {
    readonly model: ModelV2Info
    readonly package: string
    readonly options: Record<string, any>
    sdk?: any
  }
  language: {
    readonly model: ModelV2Info
    readonly sdk: any
    readonly options: Record<string, any>
    language?: LanguageModelV3
  }
}>
