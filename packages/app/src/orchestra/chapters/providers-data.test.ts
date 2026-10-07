import { describe, expect, test } from "bun:test"
import {
  authorizationURL,
  baseID,
  connectableIntegration,
  customProvider,
  errorMessage,
  fromV1,
  fromV2,
  matches,
  noteKey,
  pickerEntries,
  popularEntries,
  routeModel,
  visiblePrompts,
} from "./providers-data"

const model = (providerID: string, id: string, status = "active") => ({
  id,
  providerID,
  name: id.toUpperCase(),
  status,
  limit: { context: 200_000 },
})

describe("fromV2", () => {
  const input = {
    providers: [
      { id: "opencode", name: "OpenCode Zen" },
      { id: "anthropic", name: "Anthropic" },
      { id: "anthropic#work", name: "Anthropic (work)", integrationID: "anthropic" },
      { id: "openai", name: "OpenAI" },
      { id: "google", name: "Google" },
    ],
    integrations: [
      {
        id: "anthropic",
        name: "Anthropic",
        methods: [{ type: "key" as const }, { type: "env" as const }],
        connections: [
          { type: "credential" as const, id: "default-key", label: "default" },
          { type: "credential" as const, id: "work", label: "work" },
        ],
      },
      {
        id: "openai",
        name: "OpenAI",
        methods: [{ type: "key" as const }, { type: "oauth" as const, label: "ChatGPT Pro/Plus (browser)" }],
        connections: [{ type: "credential" as const, id: "oauth-1", label: "me@example.com" }],
      },
      {
        id: "google",
        name: "Google",
        methods: [{ type: "env" as const }],
        connections: [{ type: "env" as const, name: "GEMINI_API_KEY" }],
      },
      { id: "openrouter", name: "OpenRouter", methods: [{ type: "key" as const }], connections: [] },
    ],
    models: [model("opencode", "free"), model("opencode", "old", "deprecated"), model("anthropic#work", "sonnet")],
  }
  const result = fromV2(input)
  const card = (id: string) => result.cards.find((item) => item.id === id)

  test("a config provider with no integration cannot be disconnected", () => {
    expect(card("opencode")).toMatchObject({ method: "config", connected: true, disconnect: { type: "none" } })
    expect(card("opencode")?.models.map((item) => item.id)).toEqual(["free"])
  })

  test("base provider removes only credentials that are not listed as their own key", () => {
    expect(card("anthropic")).toMatchObject({
      method: "apiKey",
      disconnect: { type: "credentials", ids: ["default-key"] },
    })
    expect(card("anthropic#work")).toMatchObject({
      base: "anthropic",
      method: "apiKey",
      disconnect: { type: "credentials", ids: ["work"] },
    })
    expect(card("anthropic#work")?.models.map((item) => item.id)).toEqual(["sonnet"])
  })

  test("a credential on an OAuth-capable integration is not claimed to be an API key", () => {
    expect(card("openai")).toMatchObject({
      method: "credential",
      disconnect: { type: "credentials", ids: ["oauth-1"] },
    })
  })

  test("environment connections are listed but cannot be removed from the app", () => {
    expect(card("google")).toMatchObject({ method: "environment", disconnect: { type: "none" } })
  })

  test("integrations form the catalog with their connect methods", () => {
    expect(result.catalog.find((item) => item.id === "openai")?.methods).toEqual([
      { type: "key" },
      { type: "oauth", label: "ChatGPT Pro/Plus (browser)" },
    ])
    expect(result.catalog.find((item) => item.id === "google")?.methods).toEqual([])
  })
})

describe("fromV1", () => {
  const provider = (id: string, source?: string) => ({
    id,
    name: id,
    source,
    models: { m: { id: "m", name: "M", limit: { context: 1000 } } },
  })
  const result = fromV1({
    all: [provider("anthropic", "api"), provider("local", "config"), provider("env", "env"), provider("zen", "custom")],
    connected: [
      provider("anthropic", "api"),
      provider("local", "config"),
      provider("env", "env"),
      provider("zen", "custom"),
    ],
    config: {
      provider: {
        local: { npm: "@ai-sdk/openai-compatible", models: { m: {} } },
        gone: { name: "Gone endpoint", npm: "@ai-sdk/openai-compatible", models: { "gone-model": { name: "Gone" } } },
      },
      disabled_providers: ["gone", "never-configured"],
    },
  })
  const card = (id: string) => result.cards.find((item) => item.id === id)

  test("maps sources to methods and disconnect paths", () => {
    expect(card("anthropic")).toMatchObject({ method: "apiKey", disconnect: { type: "auth", custom: false } })
    expect(card("local")).toMatchObject({ method: "custom", custom: true, disconnect: { type: "auth", custom: true } })
    expect(card("env")).toMatchObject({ method: "environment", disconnect: { type: "none" } })
    expect(card("zen")).toMatchObject({ method: "custom", custom: false })
  })

  test("a disabled configured provider stays listed as disconnected and can be enabled", () => {
    expect(card("gone")).toMatchObject({
      name: "Gone endpoint",
      connected: false,
      disconnect: { type: "enable" },
      models: [{ id: "gone-model", name: "Gone" }],
    })
    expect(card("never-configured")).toBeUndefined()
  })
})

test("popular rows follow the featured order and skip listed providers", () => {
  const catalog = ["google", "anthropic", "zeta", "opencode"].map((id) => ({ id, name: id, methods: [] }))
  const cards = fromV2({
    providers: [{ id: "anthropic#k", name: "A (k)" }],
    integrations: [],
    models: [],
  }).cards
  expect(popularEntries(catalog, cards, ["opencode", "anthropic", "google"]).map((item) => item.id)).toEqual([
    "opencode",
    "google",
  ])
  expect(pickerEntries(catalog, ["opencode", "anthropic"]).map((item) => item.id)).toEqual([
    "opencode",
    "anthropic",
    "google",
    "zeta",
  ])
})

test("helpers", () => {
  expect(baseID("openai#cred")).toBe("openai")
  expect(noteKey("github-copilot-enterprise")).toBe("dialog.provider.copilot.note")
  expect(noteKey("constructor")).toBeUndefined()
  // OpenCode Zen and Go are ordinary providers: no note of their own, as for any provider without one.
  expect(noteKey("opencode")).toBeUndefined()
  expect(noteKey("opencode-go")).toBeUndefined()
  expect(matches(["OpenAI", "Connected"], "  conn ")).toBe(true)
  expect(matches(["OpenAI"], "x")).toBe(false)
  const card = fromV2({
    providers: [{ id: "p", name: "P" }],
    integrations: [],
    models: [model("p", "a"), model("p", "b")],
  }).cards[0]
  expect(routeModel(card, "b")).toBe("b")
  expect(routeModel(card, "missing")).toBe("a")
})

test("only web links are accepted as OAuth authorization targets", () => {
  expect(authorizationURL("https://auth.example.com/start?x=1")?.href).toBe("https://auth.example.com/start?x=1")
  expect(authorizationURL("http://127.0.0.1:1455/auth")?.href).toBe("http://127.0.0.1:1455/auth")
  expect(authorizationURL("javascript:alert(1)")).toBeUndefined()
  expect(authorizationURL("data:text/html,hi")).toBeUndefined()
  expect(authorizationURL("not a url")).toBeUndefined()
})

test("custom provider validation and config", () => {
  const existing = new Set(["taken"])
  expect(customProvider({ name: " !! ", endpoint: "http://x", model: "m", existing })).toEqual({ error: "name" })
  expect(customProvider({ name: "Taken", endpoint: "http://x", model: "m", existing })).toEqual({ error: "name" })
  expect(customProvider({ name: "Local", endpoint: "ftp://x", model: "m", existing })).toEqual({ error: "endpoint" })
  expect(customProvider({ name: "Local", endpoint: "http://", model: "m", existing })).toEqual({ error: "endpoint" })
  expect(customProvider({ name: "Local", endpoint: "http://x/v1", model: " ", existing })).toEqual({ error: "model" })
  expect(
    customProvider({ name: "My Local LLM", endpoint: " http://localhost:8080/v1 ", model: "qwen", existing }),
  ).toEqual({
    id: "my-local-llm",
    config: {
      npm: "@ai-sdk/openai-compatible",
      name: "My Local LLM",
      options: { baseURL: "http://localhost:8080/v1" },
      models: { qwen: { name: "qwen" } },
    },
  })
})

test("OAuth prompts follow their conditions and default selects to the first option", () => {
  const prompts = [
    { type: "select" as const, key: "kind", options: [{ value: "cloud" }, { value: "self" }] },
    { type: "text" as const, key: "host", when: { key: "kind", op: "eq" as const, value: "self" } },
    { type: "text" as const, key: "region", when: { key: "kind", op: "neq" as const, value: "self" } },
    { type: "text" as const, key: "orphan", when: { key: "missing", op: "eq" as const, value: "x" } },
  ]
  expect(visiblePrompts(prompts, {})).toEqual({
    shown: [prompts[0], prompts[2]],
    values: { kind: "cloud", region: "" },
  })
  expect(visiblePrompts(prompts, { kind: "self", host: "h" })).toEqual({
    shown: [prompts[0], prompts[1]],
    values: { kind: "self", host: "h" },
  })
})

test("the connect dialog reads only an integration whose sign-in methods are well formed", () => {
  const integration = {
    id: "acme",
    methods: [
      { type: "key", label: "API key" },
      {
        type: "oauth",
        id: "browser",
        label: "Sign in",
        prompts: [{ type: "select", key: "kind", message: "Kind", options: [{ label: "Cloud", value: "cloud" }] }],
      },
      { type: "env", names: ["ACME_API_KEY"] },
    ],
  }
  expect(connectableIntegration(integration)).toBe(integration)
  expect(connectableIntegration({ methods: [] })).toEqual({ methods: [] })
  // Each of these used to reach `.flatMap` or the prompt `.reduce` during render.
  for (const methods of [
    {},
    undefined,
    [{ type: "oauth", label: "Sign in" }],
    [{ type: "oauth", id: "x", label: "Sign in", prompts: {} }],
  ])
    expect(() => connectableIntegration({ methods })).toThrow("The server returned a malformed integration.")
  expect(() => connectableIntegration(undefined)).toThrow("The server returned a malformed integration.")
})

test("error messages prefer the server's message", () => {
  expect(errorMessage({ message: "write refused" }, "Request failed")).toBe("write refused")
  expect(errorMessage(new Error("boom"), "Request failed")).toBe("boom")
  expect(errorMessage("plain", "Request failed")).toBe("plain")
  expect(errorMessage({ data: 1 }, "Request failed")).toBe("Request failed")
})
