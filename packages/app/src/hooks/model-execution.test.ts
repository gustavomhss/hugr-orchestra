import { expect, test } from "bun:test"
import { modelSupportsExecution } from "./model-execution"
import { mixedEngineAgents, mixedEngineCatalog } from "@/testing/model-execution-fixture"

test("a secondary Claude seat never makes host-only catalog models selectable for ordinary Maestro", () => {
  const catalog = mixedEngineCatalog()
  const agents = mixedEngineAgents("orchestra")
  const maestro = agents.find((agent) => agent.id === "maestro")
  expect(agents.find((agent) => agent.id === "secondary")?.engine).toBe("claude-code")
  expect(catalog.connected).toContain("anthropic")
  expect(catalog.all.get("anthropic")?.options).toEqual({ executionHost: "claude-code", tenant: "host" })
  const choices = [...catalog.all.values()].flatMap((provider) =>
    Object.values(provider.models)
      .filter((model) => modelSupportsExecution(provider.id, provider, model, maestro?.engine))
      .map((model) => `${provider.id}/${model.id}`),
  )
  expect(choices).toEqual(["anthropic#api-key/claude-api", "openai/gpt-api", "opencode/zen-free", "custom/api-model"])
})

test("Claude Maestro may select marked Anthropic host models while every unmarked API choice is preserved", () => {
  const catalog = mixedEngineCatalog()
  const maestro = mixedEngineAgents("claude-code").find((agent) => agent.id === "maestro")
  const choices = [...catalog.all.values()].flatMap((provider) =>
    Object.values(provider.models)
      .filter((model) => modelSupportsExecution(provider.id, provider, model, maestro?.engine))
      .map((model) => `${provider.id}/${model.id}`),
  )
  expect(choices).toEqual([
    "anthropic/claude-host",
    "anthropic#api-key/claude-api",
    "openai/gpt-api",
    "opencode/zen-free",
    "custom/api-model",
  ])
})

test("unknown engines and host markers fail closed; an unmarked API catalog never needs Claude login", () => {
  expect(modelSupportsExecution("anthropic", { options: { executionHost: "claude-code" } }, {}, undefined)).toBe(false)
  expect(modelSupportsExecution("anthropic", {}, { options: { executionHost: "other-host" } }, "claude-code")).toBe(
    false,
  )
  expect(
    modelSupportsExecution("anthropic#credential", { options: { executionHost: "claude-code" } }, {}, "claude-code"),
  ).toBe(false)
  for (const engine of [undefined, "orchestra", "claude-code"]) {
    expect(modelSupportsExecution("anthropic", { options: { tenant: "api-key-connected" } }, {}, engine)).toBe(true)
  }
})
