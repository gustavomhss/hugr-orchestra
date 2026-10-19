import { tool, jsonSchema, type Tool } from "ai"
import type { JSONSchema7 } from "@ai-sdk/provider"

const DESCRIPTION = `Use this tool to return your final response in the requested structured format.

IMPORTANT:
- You MUST call this tool exactly once at the end of your response
- The input must be valid JSON matching the required schema
- Complete all necessary research and tool calls BEFORE calling this tool
- This tool provides your final answer - no further actions are taken after calling it`

export function createStructuredOutputTool(input: {
  schema: Record<string, unknown>
  onSuccess: (output: unknown) => void
}): Tool {
  // The AI SDK validates args against inputSchema before executing the tool.
  const { $schema: _, ...toolSchema } = input.schema
  return tool({
    description: DESCRIPTION,
    inputSchema: jsonSchema(toolSchema as JSONSchema7),
    async execute(args) {
      input.onSuccess(args)
      return {
        output: "Structured output captured successfully.",
        title: "Structured Output",
        metadata: { valid: true },
      }
    },
    toModelOutput({ output }) {
      return { type: "text", value: output.output }
    },
  })
}
