import { asSchema, type JSONSchema7, type ModelMessage, type Tool } from "ai"
import { Effect } from "effect"
import { SessionV1 } from "@orchestra/core/v1/session"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { estimate } from "@/continuity/masking"
import { HARD_LIMIT } from "@/continuity/trigger"

const overflow = () => new SessionV1.ContextOverflowError({ message: "Working-memory request exceeds model input capacity" })

// Estimates the assembled SDK input, not provider-specific wire encoding or exact
// tokenizer usage. Convert schemas first; tool functions/builders are not input.
export const check = Effect.fn("LLMContextBudget.check")(function* (input: {
  model: Pick<Provider.Model, "limit">
  messages: readonly ModelMessage[]
  tools: Record<string, Tool>
  params: { options: Record<string, unknown>; maxOutputTokens?: number }
  outputReserve?: number
}, responseSchema?: JSONSchema7, workflowSystem?: readonly string[], hard = false) {
  const serialized = yield* Effect.tryPromise({
    try: async () => {
      const tools = await Promise.all(Object.entries(input.tools).map(async ([name, tool]) => ({
        name, description: tool.description, inputSchema: await asSchema(tool.inputSchema).jsonSchema,
      })))
      // Workflow adapters consume system out of band. Other adapters already
      // carry it in messages or OAuth instructions and must not charge it twice.
      return estimate({ messages: input.messages, tools, options: input.params.options, responseSchema, workflowSystem })
    },
    catch: overflow,
  })
  const reserve = Math.max(input.outputReserve ?? Math.min(input.model.limit.output, ProviderTransform.OUTPUT_TOKEN_MAX), input.params.maxOutputTokens ?? 0)
  const limit = Math.min(input.model.limit.input ?? Infinity, input.model.limit.context - reserve,
    hard ? Math.floor(HARD_LIMIT * input.model.limit.context) : Infinity)
  if (!(serialized <= limit)) return yield* Effect.fail(overflow())
})

export * as LLMContextBudget from "./context-budget"
