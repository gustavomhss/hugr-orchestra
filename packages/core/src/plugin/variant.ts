export * as VariantPlugin from "./variant"

import { Effect } from "effect"
import type { ModelV2 } from "../model"
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
export function generate(
  model: Pick<typeof ModelV2.Info.Encoded, "id" | "api">,
): (typeof ModelV2.Info.Encoded)["variants"] {
  if (model.api.type !== "aisdk" || model.api.package !== "@ai-sdk/openai-compatible") return []
  const ids = `${model.id} ${model.api.id}`.toLowerCase()
  if (!["glm-5.2", "glm-5-2", "glm-5p2"].some((name) => ids.includes(name))) return []
  return ["high", "max"].map((id) => ({
    id,
    headers: {},
    body: { reasoning_effort: id },
  }))
}
