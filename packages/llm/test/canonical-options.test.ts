import { expect, test } from "bun:test"
import { Schema } from "effect"
import { LLM } from "@orchestra/schema/llm"
import { GenerationOptions, ProviderOptions } from "@orchestra/llm"

test("GenerationOptions and ProviderOptions share their browser-safe canonical Schema identities", () => {
  expect(Reflect.get(LLM, "GenerationOptions")).toBe(GenerationOptions)
  expect(Reflect.get(LLM, "ProviderOptions")).toBe(ProviderOptions)
  const options = GenerationOptions.make({ temperature: 0, stop: ["stop"] })
  expect(options).toBeInstanceOf(GenerationOptions)
  expect(GenerationOptions.make(options)).toBe(options)
  expect(GenerationOptions.make()).toBeInstanceOf(GenerationOptions)
  expect(Schema.decodeUnknownSync(GenerationOptions)({ temperature: 0 }).temperature).toBe(0)
  expect(Schema.decodeUnknownSync(ProviderOptions)({ anthropic: { custom: null, enabled: false, zero: 0 } }))
    .toEqual({ anthropic: { custom: null, enabled: false, zero: 0 } })
})
