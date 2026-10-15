import { Schema } from "effect"
import type { LLMRequest } from "../../schema"
import { JsonObject } from "../shared"
import { OpenAIOptions } from "./openai-options"

export const OpenAIText = Schema.Struct({
  verbosity: Schema.optional(OpenAIOptions.OpenAITextVerbosity),
  format: Schema.optional(
    Schema.Struct({
      type: Schema.Literal("json_schema"),
      name: Schema.Literal("response"),
      strict: Schema.Literal(true),
      schema: JsonObject,
    }),
  ),
})

export const openAIText = (request: LLMRequest): Schema.Schema.Type<typeof OpenAIText> | undefined => {
  const verbosity = OpenAIOptions.textVerbosity(request)
  const format =
    request.responseFormat?.type === "json"
      ? {
          type: "json_schema" as const,
          name: "response" as const,
          strict: true as const,
          schema: request.responseFormat.schema,
        }
      : undefined
  return verbosity || format ? { verbosity, format } : undefined
}

export * as ResponseFormat from "./response-format"
