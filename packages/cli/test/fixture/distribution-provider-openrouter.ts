import { join } from "node:path"
import { Schema } from "effect"

// Remote OpenAI-compatible endpoint. The qualification runs real inference
// against a hosted model instead of a container-local weight file, so this
// module owns credentials and upstream identity evidence instead of a digest.
export const model = "nvidia/nemotron-3.5-lightning:free"
export const baseURL = "https://openrouter.ai/api/v1"

const Catalog = Schema.Struct({
  data: Schema.Array(Schema.Struct({
    id: Schema.String,
    context_length: Schema.NullOr(Schema.Int),
    pricing: Schema.Struct({ prompt: Schema.String, completion: Schema.String }),
  })),
})

export function apiKey() {
  const key = process.env.OPENROUTER_API_KEY?.trim()
  // Fail closed: an absent or malformed credential must fail the lane, never
  // silently downgrade the proof to a local or credential-free provider.
  if (!key || !/^sk-or-v1-[0-9a-f]{64}$/.test(key)) throw new Error("PROVIDER_OPENROUTER_API_KEY_REQUIRED")
  return key
}

// Fail closed on unauthenticated upstream: a 401/403 here means the lane can
// never produce real inference, so stop before building or installing.
export async function ownedOpenRouter(evidence: string) {
  const key = apiKey()
  const response = await fetch(`${baseURL}/models`, { headers: { authorization: `Bearer ${key}` } })
  if (!response.ok) throw new Error(`PROVIDER_OPENROUTER_CATALOG_UNREACHABLE: ${response.status}`)
  const catalog = Schema.decodeUnknownSync(Catalog)(await response.json())
  const entry = catalog.data.find((item) => item.id === model)
  if (!entry) throw new Error("PROVIDER_OPENROUTER_MODEL_ABSENT")
  await Bun.write(join(evidence, "openrouter-model.json"), JSON.stringify({
    endpoint: baseURL, model, context: entry.context_length, pricing: entry.pricing, authenticated: true,
  }, null, 2) + "\n")
  return {
    model,
    endpoint: () => `${baseURL}`,
    stop: async () => {},
    cleaned: () => true,
  }
}

export type OwnedOpenRouter = Awaited<ReturnType<typeof ownedOpenRouter>>