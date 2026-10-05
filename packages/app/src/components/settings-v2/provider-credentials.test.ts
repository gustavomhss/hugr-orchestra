import { describe, expect, test } from "bun:test"
import { providerIdentity, storedCredentials } from "./provider-credentials"

describe("provider identity", () => {
  test("splits a credential suffix from the provider", () => {
    expect(providerIdentity("openai")).toEqual({ baseID: "openai", credentialID: undefined })
    expect(providerIdentity("openai#work")).toEqual({ baseID: "openai", credentialID: "work" })
  })
})

describe("V2 stored credentials", () => {
  const integrations = [
    {
      id: "openai",
      connections: [
        { type: "credential", id: "cred_default", label: "Default" },
        { type: "credential", id: "work", label: "Work" },
        { type: "env", name: "OPENAI_API_KEY" },
      ],
    },
    { id: "copilot", connections: [{ type: "credential", id: "cred_oauth", label: "GitHub" }] },
    { id: "deepseek", connections: [{ type: "env", name: "DEEPSEEK_API_KEY" }] },
  ]

  test("a default row removes its integration's stored credentials, not the ones listed as their own rows", () => {
    expect(
      storedCredentials({ providerID: "openai", providers: [{ id: "openai" }, { id: "openai#work" }], integrations }),
    ).toEqual(["cred_default"])
  })

  test("a credential row removes only its own credential", () => {
    expect(
      storedCredentials({
        providerID: "openai#work",
        providers: [{ id: "openai" }, { id: "openai#work" }],
        integrations,
      }),
    ).toEqual(["work"])
  })

  test("an OAuth provider resolves its integration through the provider list", () => {
    expect(
      storedCredentials({
        providerID: "github-copilot",
        providers: [{ id: "github-copilot", integrationID: "copilot" }],
        integrations,
      }),
    ).toEqual(["cred_oauth"])
  })

  test("environment-only and unknown providers have nothing to remove", () => {
    expect(storedCredentials({ providerID: "deepseek", providers: [{ id: "deepseek" }], integrations })).toEqual([])
    expect(storedCredentials({ providerID: "missing", providers: [], integrations })).toEqual([])
  })
})
