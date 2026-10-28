export * as VariantPlugin from "./variant"

import { Effect } from "effect"
import type { ModelV2 } from "../model"
import type { DeepMutable } from "../schema"
import { define } from "./internal"

export const Plugin = define({
  id: "variant",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform((catalog) => {
      for (const record of catalog.provider.list()) {
        for (const model of record.models.values()) {
          catalog.model.update(model.providerID, model.id, (draft) => {
            const generated = generate(draft)
            if (generated.length === 0) return

            const explicit = new Map(draft.variants.map((variant) => [variant.id, variant]))
            const generatedIDs = new Set(generated.map((variant) => variant.id))
            draft.variants = [
              ...generated.map((variant) => explicit.get(variant.id) ?? variant),
              ...draft.variants.filter((variant) => !generatedIDs.has(variant.id)),
            ]
          })
        }
      }
    })
  }),
})

// Reads only the API identity, so it accepts the plugin context model without depending on its open-ended bodies.
// Each body overlays the provider request, so a variant only names a reasoning level the model's API accepts.
export function generate(
  model: Pick<typeof ModelV2.Info.Encoded, "id" | "api">,
): DeepMutable<(typeof ModelV2.Info.Encoded)["variants"]> {
  if (model.api.type !== "aisdk") return []
  if (model.api.package === "@ai-sdk/anthropic")
    return anthropicEfforts(model.api.id.toLowerCase()).map((id) => ({ id, headers: {}, body: { output_config: { effort: id } } }))
  if (model.api.package === "@ai-sdk/openai")
    return openaiEfforts(model.api.id.toLowerCase()).map((id) => ({ id, headers: {}, body: { reasoning: { effort: id } } }))
  if (model.api.package !== "@ai-sdk/openai-compatible") return []
  const ids = `${model.id} ${model.api.id}`.toLowerCase()
  if (!["glm-5.2", "glm-5-2", "glm-5p2"].some((name) => ids.includes(name))) return []
  return ["high", "max"].map((id) => ({
    id,
    headers: {},
    body: { reasoning_effort: id },
  }))
}

/** The effort levels a Claude model accepts (`output_config.effort`); none before Opus 4.5. */
function anthropicEfforts(id: string) {
  // Family-first (claude-opus-4-7) or version-first (claude-4-7-opus); two-digit minors keep dates out.
  const version = /claude-(?:[a-z]+-)?(\d+)(?:[.-](\d{1,2}))?(?:[.@-]|$)/.exec(id)
  if (!version) return []
  const major = Number(version[1])
  const minor = Number(version[2] ?? 0)
  if (major > 4 || (major === 4 && minor >= 7)) return ["low", "medium", "high", "xhigh", "max"]
  if (major === 4 && minor === 6 && (id.includes("opus") || id.includes("sonnet"))) return ["low", "medium", "high", "max"]
  if (major === 4 && minor === 5 && id.includes("opus")) return ["low", "medium", "high"]
  return []
}

/** The reasoning efforts an OpenAI reasoning model accepts on the Responses API; none for chat models. */
function openaiEfforts(id: string) {
  if (/(?:^|\/)o\d(?:[.-]|$)/.test(id)) return id.includes("o1-mini") ? [] : ["low", "medium", "high"]
  if (!/(?:^|\/)gpt-5(?:[.-]|$)/.test(id)) return []
  const version = Number(/(?:^|\/)gpt-5[.-](\d+)(?:[.-]|$)/.exec(id)?.[1]) || undefined
  if (id.includes("-chat")) return ["medium"]
  if (id.includes("-pro")) return version === undefined ? ["high"] : ["medium", "high", "xhigh"]
  if (id.includes("codex")) {
    if (version !== undefined && version >= 3) return ["none", "low", "medium", "high", "xhigh"]
    if (id.includes("codex-max") || (version !== undefined && version >= 2)) return ["low", "medium", "high", "xhigh"]
    return ["low", "medium", "high"]
  }
  if (version === undefined) return ["minimal", "low", "medium", "high"]
  if (version === 1) return ["none", "low", "medium", "high"]
  return ["none", "low", "medium", "high", "xhigh"]
}
