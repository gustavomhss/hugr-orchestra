import { Agent } from "@orchestra/schema/agent"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import type { AgentListOutput, ModelListOutput, ProviderListOutput } from "../compat/vendored-client-promise"
import { normalizeAgentList, normalizeProviderList } from "@/context/global-sync/utils"

export function mixedEngineCatalog() {
  const provider = (id: string, options: Record<string, unknown> = {}) =>
    Provider.Info.make({
      ...Provider.Info.empty(Provider.ID.make(id)),
      api: { type: "aisdk", package: "@ai-sdk/anthropic", settings: options },
    })
  const model = (providerID: string, id: string, options: Record<string, unknown> = {}) =>
    Model.Info.make({
      ...Model.Info.empty(Provider.ID.make(providerID), Model.ID.make(id)),
      api: { type: "aisdk", id: Model.ID.make(id), package: "@ai-sdk/anthropic", settings: options },
      cost: [
        {
          input: providerID === "opencode" ? 0 : 1,
          output: providerID === "opencode" ? 0 : 2,
          cache: { read: 0, write: 0 },
        },
      ],
      capabilities: { tools: true, input: ["text"], output: ["text"] },
    })
  // Authoritative V2 schema shapes, including the colleague's API-settings marker. The vendored
  // types predate api.settings; the actual normalizer must adapt these wire objects.
  return normalizeProviderList(
    [
      provider("anthropic", { executionHost: "claude-code", tenant: "host" }),
      provider("anthropic#api-key", { tenant: "key" }),
      provider("openai"),
      provider("opencode"),
      provider("custom"),
    ] as unknown as ProviderListOutput["data"],
    [
      model("anthropic", "claude-host"),
      model("anthropic#api-key", "claude-api"),
      model("openai", "gpt-api"),
      model("opencode", "zen-free"),
      model("custom", "api-model"),
      model("custom", "host-only-model", { executionHost: "claude-code" }),
    ] as unknown as ModelListOutput["data"],
    { providerID: Provider.ID.anthropic, id: Model.ID.make("claude-host") } as unknown as Parameters<
      typeof normalizeProviderList
    >[2],
  )
}

export function mixedEngineAgents(maestro: "orchestra" | "claude-code") {
  return normalizeAgentList([
    { ...Agent.Info.empty(Agent.ID.make("maestro")), engine: maestro },
    { ...Agent.Info.empty(Agent.ID.make("secondary")), engine: "claude-code" },
  ] as unknown as AgentListOutput["data"])
}
