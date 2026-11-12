import { expect, test } from "bun:test"
import { Effect } from "effect"
import { GenerationOptions } from "@orchestra/llm"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { EligibilityFixture } from "./fixture/model-eligibility"

const model = (provider = "anthropic") => ModelV2.Info.make({
  ...ModelV2.Info.empty(ProviderV2.ID.make(provider), ModelV2.ID.make("fixture")),
  variants: [
    { id: ModelV2.VariantID.make("high"), headers: {}, body: { output_config: { effort: "high" } } },
    { id: ModelV2.VariantID.make("other"), headers: {}, body: {} },
  ],
})
const base = model()
const variant = (options: { generation?: GenerationOptions; providerOptions?: Record<string, Record<string, unknown>> }) =>
  ModelV2.Info.make({ ...base, variants: [{ ...base.variants[0], ...options }] })

const cases = [
  { name: "SDK default without Ref", input: {}, status: "ready" },
  { name: "exact Anthropic high effort", input: { ref: EligibilityFixture.ref("anthropic", "high"), model: base }, status: "ready" },
  ...["google", "openai", "anthropic#credential"].map((provider) => ({ name: `foreign provider ${provider}`,
    input: { ref: EligibilityFixture.ref(provider), model: model(provider) }, status: "unsupported", reason: "host-model-unsupported" })),
  { name: "unsupported existing effort", input: { ref: EligibilityFixture.ref("anthropic", "other"), model: base },
    status: "unsupported", reason: "host-options-unsupported" },
  { name: "base canonical generation", input: { ref: EligibilityFixture.ref("anthropic"),
    model: ModelV2.Info.make({ ...base, api: { ...base.api, settings: { generation: { temperature: 0 } } } }) },
    status: "unsupported", reason: "host-options-unsupported" },
  { name: "selected canonical generation", input: { ref: EligibilityFixture.ref("anthropic", "high"),
    model: variant({ generation: GenerationOptions.make({ temperature: 0 }) }) }, status: "unsupported", reason: "host-options-unsupported" },
  { name: "selected canonical provider options", input: { ref: EligibilityFixture.ref("anthropic", "high"),
    model: variant({ providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens: 12000 } } } }) },
    status: "unsupported", reason: "host-options-unsupported" },
  { name: "empty canonical options", input: { ref: EligibilityFixture.ref("anthropic", "high"),
    model: variant({ generation: GenerationOptions.make(), providerOptions: {} }) }, status: "ready" },
] as const

for (const item of cases) {
  test(`API E6 actual Claude descriptor: ${item.name}`, async () => {
    EligibilityFixture.state.signedIn = true
    EligibilityFixture.state.accountFails = false
    EligibilityFixture.state.options.length = 0
    const result = await Effect.runPromise(EligibilityFixture.claude.pipe(Effect.flatMap((host) => {
      if (typeof Reflect.get(host, "describeModel") !== "function")
        return Effect.die("API RED E6: real Claude host does not implement describeModel")
      return host.describeModel(item.input)
    })))
    expect(result).toMatchObject({ status: item.status })
    if ("reason" in item) expect(result).toMatchObject({ reason: item.reason })
    expect(EligibilityFixture.state.options).toEqual([])
  })
}

for (const broken of ["signed-out", "account-error"]) {
  test(`API E6 actual Claude descriptor: ${broken} account is unavailable without SDK work`, async () => {
    EligibilityFixture.state.signedIn = broken !== "signed-out"
    EligibilityFixture.state.accountFails = broken === "account-error"
    EligibilityFixture.state.options.length = 0
    const result = await Effect.runPromise(EligibilityFixture.claude.pipe(Effect.flatMap((host) => {
      if (typeof Reflect.get(host, "describeModel") !== "function")
        return Effect.die("API RED E6: real Claude host does not implement describeModel")
      return host.describeModel({})
    })))
    expect(result).toMatchObject({ status: "unavailable", reason: "host-unavailable" })
    expect(EligibilityFixture.state.options).toEqual([])
  })
}
