import { describe, expect, test } from "bun:test"
import {
  authorizationURL,
  baseID,
  connectableIntegration,
  errorMessage,
  fromV2,
  matches,
  noteKey,
  popularEntries,
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
})

test("only web links are accepted as OAuth authorization targets", () => {
  expect(authorizationURL("https://auth.example.com/start?x=1")?.href).toBe("https://auth.example.com/start?x=1")
  expect(authorizationURL("http://127.0.0.1:1455/auth")?.href).toBe("http://127.0.0.1:1455/auth")
  expect(authorizationURL("javascript:alert(1)")).toBeUndefined()
  expect(authorizationURL("data:text/html,hi")).toBeUndefined()
  expect(authorizationURL("not a url")).toBeUndefined()
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
  expect(errorMessage({ name: "ProviderAuthError", data: { message: "denied" } }, "Request failed")).toBe("denied")
  expect(errorMessage({ data: { message: "" } }, "Request failed")).toBe("Request failed")
})
