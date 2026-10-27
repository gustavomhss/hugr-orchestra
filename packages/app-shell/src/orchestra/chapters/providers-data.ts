import { Integration } from "@orchestra/schema/integration"
import { Option, Schema } from "effect"

// Pure projection of server provider data into the mock's provider cards and popular rows.

export type ProviderModel = { id: string; name: string }
export type ProviderMethod = "apiKey" | "environment" | "config" | "credential"
export type ProviderDisconnect =
  | { type: "credentials"; ids: string[] }
  | { type: "none" }
export type ProviderCard = {
  id: string
  base: string
  name: string
  connected: boolean
  method: ProviderMethod
  disconnect: ProviderDisconnect
  models: ProviderModel[]
}
export type CatalogMethod = { type: "key" } | { type: "oauth"; label: string }
export type CatalogEntry = { id: string; name: string; methods: CatalogMethod[] }

type V2Method = { readonly type: "key" | "oauth" | "env" | "command"; readonly label?: string }
type V2Connection =
  | { readonly type: "credential"; readonly id: string; readonly label: string }
  | { readonly type: "env"; readonly name: string }
type V2Input = {
  providers: ReadonlyArray<{ readonly id: string; readonly integrationID?: string; readonly name: string }>
  integrations: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly methods: ReadonlyArray<V2Method>
    readonly connections: ReadonlyArray<V2Connection>
  }>
  models: ReadonlyArray<{
    readonly id: string
    readonly providerID: string
    readonly name: string
    readonly status: string
  }>
}

const NOTES = {
  anthropic: "dialog.provider.anthropic.note",
  openai: "dialog.provider.openai.note",
  google: "dialog.provider.google.note",
  openrouter: "dialog.provider.openrouter.note",
  vercel: "dialog.provider.vercel.note",
} as const

const SEPARATOR = "#"

export function noteKey(id: string) {
  if (id.startsWith("github-copilot")) return "dialog.provider.copilot.note" as const
  return Object.hasOwn(NOTES, id) ? NOTES[id as keyof typeof NOTES] : undefined
}

export function baseID(id: string) {
  const index = id.indexOf(SEPARATOR)
  return index === -1 ? id : id.slice(0, index)
}

// V2 lists only available providers; integrations carry the catalog, methods and stored connections.
export function fromV2(input: V2Input) {
  const integrations = new Map(input.integrations.map((item) => [item.id, item]))
  const virtual = new Set(input.providers.flatMap((item) => credentialOf(item.id) ?? []))
  const cards = input.providers.map((provider): ProviderCard => {
    const base = baseID(provider.id)
    const credential = credentialOf(provider.id)
    const integration = integrations.get(provider.integrationID ?? base)
    const stored = (integration?.connections ?? []).flatMap((item) =>
      item.type === "credential" && !virtual.has(item.id) ? [item.id] : [],
    )
    const ids = credential ? [credential] : stored
    return {
      id: provider.id,
      base,
      name: provider.name,
      connected: true,
      method: v2Method(credential, stored, integration),
      disconnect: ids.length ? { type: "credentials", ids } : { type: "none" },
      models: input.models
        .filter((model) => model.providerID === provider.id && model.status !== "deprecated")
        .map((model) => ({ id: model.id, name: model.name })),
    }
  })
  const catalog = input.integrations.map(
    (item): CatalogEntry => ({
      id: item.id,
      name: item.name,
      methods: item.methods.flatMap((method): CatalogMethod[] => {
        if (method.type === "key") return [{ type: "key" }]
        if (method.type === "oauth") return [{ type: "oauth", label: method.label ?? "" }]
        return []
      }),
    }),
  )
  return { cards, catalog }
}

export function popularEntries(catalog: CatalogEntry[], cards: ProviderCard[], order: string[]) {
  const listed = new Set(cards.map((card) => card.base))
  return order.flatMap((id) => catalog.find((item) => item.id === id && !listed.has(id)) ?? [])
}

export function matches(parts: Array<string | undefined>, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return parts.join(" ").toLowerCase().includes(needle)
}

const decodeMethods = Schema.decodeUnknownOption(Schema.Array(Integration.Method))

// The integration reply is untrusted: malformed sign-in methods fail its read, so the connect dialog falls back
// to the API key method instead of mapping them while it renders.
export function connectableIntegration<T extends { methods: unknown }>(value: T | null | undefined) {
  if (!value || Option.isNone(decodeMethods(value.methods)))
    throw new Error("The server returned a malformed integration.")
  return value
}

function credentialOf(id: string) {
  const index = id.indexOf(SEPARATOR)
  return index === -1 ? undefined : id.slice(index + 1)
}

// Only labeled API keys become their own provider, so a remaining credential is a key unless the integration signs in.
function v2Method(
  credential: string | undefined,
  stored: string[],
  integration:
    | { readonly methods: ReadonlyArray<V2Method>; readonly connections: ReadonlyArray<V2Connection> }
    | undefined,
): ProviderMethod {
  if (credential) return "apiKey"
  if (stored.length) return integration?.methods.some((item) => item.type === "oauth") ? "credential" : "apiKey"
  if (integration?.connections.some((item) => item.type === "env")) return "environment"
  return "config"
}

// Only a web link from the server is rendered as the authorization target.
export function authorizationURL(value: string) {
  if (!URL.canParse(value)) return
  const url = new URL(value)
  return url.protocol === "http:" || url.protocol === "https:" ? url : undefined
}

export function errorMessage(value: unknown, fallback: string): string {
  if (typeof value === "string" && value) return value
  if (value instanceof Error && value.message) return value.message
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string" && value.message)
    return value.message
  // Server error bodies carry their text in `data.message`.
  if (value && typeof value === "object" && "data" in value) {
    const data = value.data
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string" && data.message)
      return data.message
  }
  return fallback
}
