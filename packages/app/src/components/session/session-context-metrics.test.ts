import { describe, expect, test } from "bun:test"
import type { Message } from "@orchestra/sdk/v2/client"
import { getSessionContext, getSessionCost } from "./session-context-metrics"

const assistant = (
  id: string,
  tokens: { input: number; output: number; reasoning: number; read: number; write: number },
  cost: number,
  providerID = "openai",
  modelID = "gpt-4.1",
) => {
  return {
    id,
    role: "assistant",
    providerID,
    modelID,
    cost,
    tokens: {
      input: tokens.input,
      output: tokens.output,
      reasoning: tokens.reasoning,
      cache: {
        read: tokens.read,
        write: tokens.write,
      },
    },
    time: { created: 1 },
  } as unknown as Message
}

const user = (id: string) => {
  return {
    id,
    role: "user",
    cost: 0,
    time: { created: 1 },
  } as unknown as Message
}

describe("getSessionContext", () => {
  test("native host reports supply cost and context when the UI catalog is absent or stale", () => {
    const messages = [assistant("a1", { input: 10000, output: 50, reasoning: 25, read: 0, write: 0 }, 0,
      "anthropic", "claude-haiku-5-5")]
    const metadata = { claudeCode: { uuids: { a1: "native-a1" }, cost: 0.12, modelUsage: {
      alias: { canonicalModel: "claude-haiku-5-5", costUSD: 0.12, contextWindow: 200000 },
    } } }
    expect(getSessionContext(messages, [], {}, metadata)?.limit).toBe(200000)
    expect(getSessionCost(0, messages, [], {}, metadata)).toBe(0.12)
    expect(getSessionContext(messages, [{ id: "anthropic", models: {
      "claude-haiku-5-5": { limit: { context: 1000000 } },
    } }], {}, metadata)?.limit).toBe(200000)
    expect(getSessionContext(messages, [], {}, { claudeCode: { uuids: { a1: "native-a1" }, cost: 0.12, modelUsage: {
      unrelated: { contextWindow: 200000 },
    } } })?.limit).toBeUndefined()
    expect(getSessionCost(0, messages, [], {}, { claudeCode: { cost: NaN, modelUsage: {
      "claude-haiku-5-5": { contextWindow: -1 },
    } } })).toBeUndefined()
  })

  test("computes token totals and usage from latest assistant with tokens", () => {
    const messages = [
      user("u1"),
      assistant("a1", { input: 600, output: 200, reasoning: 100, read: 50, write: 50 }, 0.5),
      assistant("a2", { input: 300, output: 100, reasoning: 50, read: 25, write: 25 }, 1.25),
    ]
    const providers = [
      {
        id: "openai",
        name: "OpenAI",
        models: {
          "gpt-4.1": {
            name: "GPT-4.1",
            limit: { context: 1000 },
          },
        },
      },
    ]

    const ctx = getSessionContext(messages, providers)

    expect(ctx?.message.id).toBe("a2")
    expect(ctx?.total).toBe(500)
    expect(ctx?.input).toBe(300)
    expect(ctx?.usage).toBe(50)
    expect(ctx?.providerLabel).toBe("OpenAI")
    expect(ctx?.modelLabel).toBe("GPT-4.1")
  })

  test("preserves fallback labels and null usage when model metadata is missing", () => {
    const messages = [assistant("a1", { input: 40, output: 10, reasoning: 0, read: 0, write: 0 }, 0.1, "p-1", "m-1")]
    const providers = [{ id: "p-1", models: {} }]

    const ctx = getSessionContext(messages, providers)

    expect(ctx?.providerLabel).toBe("p-1")
    expect(ctx?.modelLabel).toBe("m-1")
    expect(ctx?.limit).toBeUndefined()
    expect(ctx?.usage).toBeNull()
  })

  test("recomputes when message array is mutated in place", () => {
    const messages = [assistant("a1", { input: 10, output: 10, reasoning: 10, read: 10, write: 10 }, 0.25)]
    const providers = [{ id: "openai", models: {} }]

    const one = getSessionContext(messages, providers)
    messages.push(assistant("a2", { input: 100, output: 20, reasoning: 0, read: 0, write: 0 }, 0.75))
    const two = getSessionContext(messages, providers)

    expect(one?.message.id).toBe("a1")
    expect(two?.message.id).toBe("a2")
  })

  test("returns undefined when inputs are undefined", () => {
    const ctx = getSessionContext(undefined, undefined)

    expect(ctx).toBeUndefined()
  })
})


test("same-model API assistants use ordinary context while mixed cost retains native charges exactly once", () => {
  const native = assistant("native", { input: 120000, output: 20, reasoning: 0, read: 0, write: 0 }, 0.12, "anthropic", "same-model")
  const api = assistant("api", { input: 20, output: 10, reasoning: 0, read: 0, write: 0 }, 0.3, "anthropic", "same-model")
  const providers = [{ id: "anthropic", models: { "same-model": { cost: { input: 1, output: 2 }, limit: { context: 1000000 } } } }]
  const metadata = { claudeCode: { uuids: { native: "sdk-native" }, cost: 0.12,
    context: { totalTokens: 5000, maxTokens: 200000, percentage: 2.5 }, modelUsage: { "same-model": { contextWindow: 200000 } } } }
  expect(getSessionContext([native, api], providers, {}, metadata)).toMatchObject({ total: 30, limit: 1000000, usage: 0 })
  expect(getSessionCost(0.42, [native, api], providers, {}, metadata)).toBeCloseTo(0.42)
  expect(getSessionCost(0.42, [api, native], providers, {}, metadata)).toBeCloseTo(0.42)
  expect(getSessionCost(0.3, [assistant("native", { input: 1, output: 1, reasoning: 0, read: 0, write: 0 }, 0, "anthropic", "same-model"), api], providers, {}, metadata)).toBeCloseTo(0.42)
  const page = [assistant("native", { input: 1, output: 1, reasoning: 0, read: 0, write: 0 }, 0.03, "anthropic", "same-model"), api]
  expect(getSessionCost(0.42, page, providers, {}, metadata)).toBeCloseTo(0.42)
  expect(getSessionCost(0.3, [api], providers, {}, metadata)).toBe(0.3)
  expect(getSessionContext([api], providers, {}, metadata)?.limit).toBe(1000000)
})

test("native context uses the validated current snapshot and falls back when any field is invalid or absent", () => {
  const messages = [assistant("native", { input: 120000, output: 20, reasoning: 0, read: 0, write: 0 }, 0.12, "anthropic", "model")]
  const host = { uuids: { native: "sdk-native" }, modelUsage: { model: { contextWindow: 200000 } } }
  const context = { totalTokens: 5000, maxTokens: 200000, percentage: 2.5 }
  expect(getSessionContext(messages, [], {}, { claudeCode: { ...host, context } }))
    .toMatchObject({ total: 5000, limit: 200000, usage: 2.5 })
  expect(getSessionContext(messages, [], {}, { claudeCode: { ...host, context } })?.input).toBeUndefined()
  for (const invalid of [undefined, { ...context, totalTokens: -1 }, { ...context, totalTokens: NaN }, { ...context, totalTokens: Infinity },
    { ...context, maxTokens: 0 }, { ...context, maxTokens: -1 }, { ...context, maxTokens: NaN }, { ...context, maxTokens: Infinity },
    { ...context, percentage: NaN }, { ...context, percentage: Infinity }, { ...context, percentage: -1 }]) {
    expect(getSessionContext(messages, [], {}, { claudeCode: { ...host, context: invalid } }))
      .toMatchObject({ total: 120020, limit: 200000, usage: 60 })
  }
  expect(getSessionContext(messages, [], {}, { claudeCode: { ...host, uuids: {}, context } })?.limit).toBeUndefined()
})


test("native SDK context snapshots preserve overflow and exact fractional percentages", () => {
  const messages = [assistant("native", { input: 120000, output: 20, reasoning: 0, read: 0, write: 0 }, 0.12, "anthropic", "model")]
  const host = { uuids: { native: "sdk-native" }, modelUsage: { model: { contextWindow: 200000 } } }
  for (const context of [
    { totalTokens: 210000, maxTokens: 200000, percentage: 105 },
    { totalTokens: 210001, maxTokens: 200000, percentage: 105.0005 },
    { totalTokens: 0, maxTokens: 200000, percentage: 0 },
  ]) {
    expect(getSessionContext(messages, [], {}, { claudeCode: { ...host, context } }))
      .toMatchObject({ total: context.totalTokens, limit: context.maxTokens, usage: context.percentage })
    expect(getSessionContext(messages, [], {}, { claudeCode: { ...host, context } })?.input).toBeUndefined()
  }
})
