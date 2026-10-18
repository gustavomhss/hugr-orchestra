export * as LLMPrepared from "./prepared"

import { asSchema, jsonSchema, type Tool } from "ai"
import type { LLM } from "../llm"

declare const prepared: unique symbol
export type Plan = { readonly [prepared]: true }

/** Immutable definitions, with captured validation/execution closures rather than mutable schema builders. */
export async function tools(input: Record<string, Tool>) {
  return Object.fromEntries(await Promise.all(Object.entries(input).map(async ([name, tool]) => {
    const copied = definition(tool)
    const schema = asSchema(copied.inputSchema)
    return [name, { ...copied, inputSchema: jsonSchema(structuredClone(await schema.jsonSchema), { validate: schema.validate }) }]
  })))
}

export function snapshot(input: LLM.StreamInput): LLM.StreamInput {
  return { ...input, ...structuredClone({ model: input.model, user: input.user, agent: input.agent, permission: input.permission,
    system: input.system, messages: input.messages, responseSchema: input.responseSchema, preflightParams: input.preflightParams }),
    tools: Object.fromEntries(Object.entries(input.tools).map(([name, tool]) => [name, definition(tool)])) }
}

export const token = () => Object.freeze({}) as Plan

function definition(tool: Tool): Tool {
  const schema = asSchema(tool.inputSchema)
  const value = schema.jsonSchema
  return { ...tool, ...Object.fromEntries(Object.entries(tool).filter(([key]) => key !== "inputSchema").map(([key, value]) =>
    [key, typeof value === "function" ? value : structuredClone(value)])),
    inputSchema: value instanceof Promise ? tool.inputSchema : jsonSchema(structuredClone(value), { validate: schema.validate }) }
}
