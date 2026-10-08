export * as SiwcInference from "./siwc-inference"

import { Credential } from "@orchestra/schema/credential"
import { Option, Schema } from "effect"
import { Siwc } from "./siwc"

const Models = Schema.Struct({ models: Schema.Array(Schema.Struct({
  slug: Schema.NonEmptyString, display_name: Schema.NonEmptyString, visibility: Schema.String,
})) })

export async function models(value: Credential.OAuth, send: (request: Request) => Promise<Response> = fetch) {
  Siwc.requirePlanUsage(value)
  const response = await send(new Request(`${Siwc.resource}/models`, { headers: { Authorization: `Bearer ${value.access}` } }))
  if (!response.ok) throw new Error(`ChatGPT model catalog failed: ${response.status}`)
  const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(Models))(await response.text())
  if (Option.isNone(decoded)) throw new Error("Invalid ChatGPT model catalog")
  return decoded.value.models.filter((model) => model.visibility === "list")
}

/** Pin the SDK to one registration; resolve fresh credentials for every request. */
export function transport(
  selected: Siwc.Registration,
  resolve: () => Promise<Credential.OAuth>,
  send: (request: Request) => Promise<Response> = fetch,
) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(input.toString(), init)
    if (request.url !== `${Siwc.resource}/responses` || request.method !== "POST")
      throw new Error("Unsupported ChatGPT plan endpoint")
    const value = await resolve()
    const current = Siwc.registration(value.metadata)
    if (current.clientId !== selected.clientId || current.subject !== selected.subject || current.hostId !== selected.hostId)
      throw new Error("ChatGPT account changed; reload the model before inference")
    Siwc.requirePlanUsage(value)
    const body = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)))(await request.text())
    if (Option.isNone(body) || typeof body.value.model !== "string") throw new Error("Invalid ChatGPT inference request")
    if (!(await models(value, send)).some((model) => model.slug === body.value.model))
      throw new Error("Model is unavailable for the selected ChatGPT registration")
    request.headers.set("Authorization", `Bearer ${value.access}`)
    return send(new Request(request, { body: JSON.stringify({ ...body.value, store: false, stream: true }) }))
  }
}
