import { join } from "node:path"
import { Schema } from "effect"

// Remote OpenAI-compatible endpoint. The qualification runs real inference
// against a hosted model, so this module owns the credential and upstream
// identity evidence instead of a container-local weight digest.
export const host = "https://openrouter.ai"
export const model = "nvidia/nemotron-3-ultra-550b-a55b:free"
// The capture proxy appends the incoming "/v1/..." path verbatim, so this base
// must stay the API root without its own version segment.
export const baseURL = `${host}/api`

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
  // silently downgrade the proof to a local, credential-free or scripted provider.
  if (!key) throw new Error("PROVIDER_OPENROUTER_API_KEY_REQUIRED")
  if (!/^sk-or-v1-[0-9a-f]{64}$/.test(key)) throw new Error("PROVIDER_OPENROUTER_API_KEY_MALFORMED")
  return key
}

export async function ownedOpenRouter(evidence: string) {
  const key = apiKey()
  const response = await fetch(`${baseURL}/v1/models`, {
    headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000),
  }).catch((error: unknown) => {
    throw new Error(`PROVIDER_OPENROUTER_CATALOG_UNREACHABLE: ${error instanceof Error ? error.message : String(error)}`)
  })
  if (!response.ok) throw new Error(`PROVIDER_OPENROUTER_CATALOG_UNREACHABLE: ${response.status}`)
  const catalog = Schema.decodeUnknownSync(Catalog)(await response.json())
  const entry = catalog.data.find((item) => item.id === model)
  if (!entry) throw new Error("PROVIDER_OPENROUTER_MODEL_ABSENT")
  await Bun.write(join(evidence, "openrouter-model.json"), JSON.stringify({
    host, endpoint: baseURL, model, context: entry.context_length, pricing: entry.pricing, authenticated: true,
  }, null, 2) + "\n")
  return { model, endpoint: () => baseURL, stop: async () => {} }
}

export type OwnedOpenRouter = Awaited<ReturnType<typeof ownedOpenRouter>>