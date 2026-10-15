import { describe, expect, test } from "bun:test"
import { disconnectPlan, providerIdentity } from "./provider-credentials"

describe("provider identity", () => {
  test("splits a credential suffix from the provider", () => {
    expect(providerIdentity("openai")).toEqual({ baseID: "openai", credentialID: undefined })
    expect(providerIdentity("openai#work")).toEqual({ baseID: "openai", credentialID: "work" })
  })
})

describe("V2 disconnect plan", () => {
  const integrations = [
    {
      id: "openai",
      connections: [
        { type: "credential" as const, id: "cred_default", label: "default" },
        { type: "credential" as const, id: "work", label: "work" },
        { type: "credential" as const, id: "oauth", label: "me@example.com" },
        { type: "env" as const, name: "OPENAI_API_KEY" },
      ],
    },
    { id: "copilot", connections: [{ type: "credential" as const, id: "cred_oauth", label: "GitHub" }] },
    { id: "deepseek", connections: [{ type: "env" as const, name: "DEEPSEEK_API_KEY" }] },
    { id: "mistral", connections: [{ type: "credential" as const, id: "team", label: "team" }] },
    { id: "local", connections: [] },
  ]
  const catalog = [
    { id: "openai" },
    { id: "openai#work", integrationID: "openai" },
    { id: "github-copilot", integrationID: "copilot" },
    { id: "deepseek" },
    { id: "mistral" },
    { id: "mistral#team", integrationID: "mistral" },
    { id: "local" },
  ]

  test("the base row removes default and labelled credentials without a row, not keys with their own row", () => {
    expect(disconnectPlan({ providerID: "openai", catalog, integrations })).toEqual({
      type: "remove",
      ids: ["cred_default", "oauth"],
      labels: ["default", "me@example.com"],
    })
  })

  test("a credential row removes only its own credential", () => {
    expect(disconnectPlan({ providerID: "openai#work", catalog, integrations })).toEqual({
      type: "remove",
      ids: ["work"],
      labels: ["work"],
    })
  })

  test("a provider resolves its integration through the catalog", () => {
    expect(disconnectPlan({ providerID: "github-copilot", catalog, integrations })).toEqual({
      type: "remove",
      ids: ["cred_oauth"],
      labels: ["GitHub"],
    })
  })

  test("reports environment connections, labelled-only keys and providers with nothing stored", () => {
    expect(disconnectPlan({ providerID: "deepseek", catalog, integrations })).toEqual({
      type: "env",
      names: ["DEEPSEEK_API_KEY"],
    })
    expect(disconnectPlan({ providerID: "mistral", catalog, integrations })).toEqual({
      type: "labelled",
      labels: ["team"],
    })
    expect(disconnectPlan({ providerID: "local", catalog, integrations })).toEqual({ type: "none" })
    expect(disconnectPlan({ providerID: "missing", catalog: [], integrations })).toEqual({ type: "none" })
  })
})
