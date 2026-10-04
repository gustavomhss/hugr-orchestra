import { asSchema, type JSONSchema7, type ModelMessage, type Tool } from "ai"
import { Effect } from "effect"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import type { Provider } from "@/provider/provider"
import { Token } from "@/util/token"

const overflow = () => new SessionV1.ContextOverflowError({ message: "Working-memory request exceeds model input capacity" })

// Estimates the assembled SDK input, not provider-specific wire encoding or exact
// tokenizer usage. Convert schemas first; tool functions/builders are not input.
export const check = Effect.fn("LLMContextBudget.check")(function* (input: {
  model: Pick<Provider.Model, "limit">
  messages: readonly ModelMessage[]
  tools: Record<string, Tool>
  params: { options: Record<string, unknown> }
}, responseSchema?: JSONSchema7, workflowSystem?: readonly string[]) {
  const serialized = yield* Effect.tryPromise({
    try: async () => {
      const tools = await Promise.all(Object.entries(input.tools).map(async ([name, tool]) => ({
        name, description: tool.description, inputSchema: await asSchema(tool.inputSchema).jsonSchema,
      })))
      // Workflow adapters consume system out of band. Other adapters already
      // carry it in messages or OAuth instructions and must not charge it twice.
      return JSON.stringify({ messages: input.messages, tools, options: input.params.options, responseSchema, workflowSystem })
    },
    catch: overflow,
  })
  const limit = Math.min(input.model.limit.input ?? Infinity, input.model.limit.context - input.model.limit.output)
  if (!(Token.estimate(serialized) <= limit)) return yield* Effect.fail(overflow())
})

export * as LLMContextBudget from "./context-budget"
