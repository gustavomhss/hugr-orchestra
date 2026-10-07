// Pure projection of server provider data into the mock's provider cards, popular rows and picker rows.

export type ProviderModel = { id: string; name: string }
export type ProviderMethod = "apiKey" | "environment" | "config" | "custom" | "credential"
export type ProviderDisconnect =
  | { type: "credentials"; ids: string[] }
  | { type: "auth"; custom: boolean }
  | { type: "enable" }
  | { type: "none" }
export type ProviderCard = {
  id: string
  base: string
  name: string
  connected: boolean
  method: ProviderMethod
  custom: boolean
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

type V1Model = { id: string; name: string; status?: string }
type V1Provider = { id: string; name: string; source?: string; models: Record<string, V1Model> }
type V1Input = {
  all: V1Provider[]
  connected: V1Provider[]
  config: {
    provider?: Record<string, { name?: string; npm?: string; models?: Record<string, { name?: string }> }>
    disabled_providers?: string[]
  }
}

const NOTES = {
  orchestra: "dialog.provider.opencode.note",
  "opencode-go": "dialog.provider.opencodeGo.tagline",
  anthropic: "dialog.provider.anthropic.note",
  openai: "dialog.provider.openai.note",
  google: "dialog.provider.google.note",
  openrouter: "dialog.provider.openrouter.note",
  vercel: "dialog.provider.vercel.note",
} as const

const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible"
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
      custom: false,
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

// V1 keeps disabled providers in config, so a disconnected custom endpoint stays listed and can be enabled again.
export function fromV1(input: V1Input) {
  const configured = input.config.provider ?? {}
  const custom = (id: string) =>
    configured[id]?.npm === OPENAI_COMPATIBLE && Object.keys(configured[id]?.models ?? {}).length > 0
  const connected = new Set(input.connected.map((item) => item.id))
  const cards = input.connected.map((provider): ProviderCard => {
    const credential = credentialOf(provider.id)
    return {
      id: provider.id,
      base: baseID(provider.id),
      name: provider.name,
      connected: true,
      method: v1Method(provider.source, custom(provider.id)),
      custom: custom(provider.id),
      disconnect: v1Disconnect(provider.source, credential, custom(provider.id)),
      models: Object.values(provider.models)
        .filter((model) => model.status !== "deprecated")
        .map((model) => ({ id: model.id, name: model.name })),
    }
  })
  const disabled = (input.config.disabled_providers ?? [])
    .filter((id) => !connected.has(id) && Object.hasOwn(configured, id))
    .map(
      (id): ProviderCard => ({
        id,
        base: id,
        name: configured[id]?.name ?? input.all.find((item) => item.id === id)?.name ?? id,
        connected: false,
        method: custom(id) ? "custom" : "config",
        custom: custom(id),
        disconnect: { type: "enable" },
        models: Object.entries(configured[id]?.models ?? {}).map(([model, info]) => ({
          id: model,
          name: info.name ?? model,
        })),
      }),
    )
  const catalog = input.all.map((item): CatalogEntry => ({ id: item.id, name: item.name, methods: [] }))
  return { cards: [...cards, ...disabled], catalog }
}

export function popularEntries(catalog: CatalogEntry[], cards: ProviderCard[], order: string[]) {
  const listed = new Set(cards.map((card) => card.base))
  return order.flatMap((id) => catalog.find((item) => item.id === id && !listed.has(id)) ?? [])
}

export function pickerEntries(catalog: CatalogEntry[], order: string[]) {
  const featured = order.flatMap((id) => catalog.find((item) => item.id === id) ?? [])
  const rest = catalog.filter((item) => !order.includes(item.id)).sort((a, b) => a.name.localeCompare(b.name))
  return [...featured, ...rest]
}

export function matches(parts: Array<string | undefined>, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return parts.join(" ").toLowerCase().includes(needle)
}

export function routeModel(card: ProviderCard, preferred: string | undefined) {
  if (preferred && card.models.some((model) => model.id === preferred)) return preferred
  return card.models[0]?.id
}

export function customProvider(input: { name: string; endpoint: string; model: string; existing: Set<string> }) {
  const id = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  const endpoint = input.endpoint.trim()
  const model = input.model.trim()
  if (!id || input.existing.has(id)) return { error: "name" as const }
  if (!/^https?:\/\//.test(endpoint) || !URL.canParse(endpoint)) return { error: "endpoint" as const }
  if (!model) return { error: "model" as const }
  return {
    id,
    config: {
      npm: OPENAI_COMPATIBLE,
      name: input.name.trim(),
      options: { baseURL: endpoint },
      models: { [model]: { name: model } },
    },
  }
}

type Prompt = {
  type: "text" | "select"
  key: string
  options?: ReadonlyArray<{ value: string }>
  when?: { key: string; op: "eq" | "neq"; value: string }
}

// OAuth prompts appear in order; a prompt shows only when its condition holds for the answers above it.
// An unanswered select defaults to its first option, as the native select displays it.
export function visiblePrompts<T extends Prompt>(prompts: ReadonlyArray<T>, answers: Record<string, string>) {
  return prompts.reduce(
    (result, prompt) => {
      const actual = prompt.when ? result.values[prompt.when.key] : undefined
      if (prompt.when && actual === undefined) return result
      if (prompt.when && (prompt.when.op === "eq") !== (actual === prompt.when.value)) return result
      const value = answers[prompt.key] ?? (prompt.type === "select" ? (prompt.options?.[0]?.value ?? "") : "")
      return { shown: [...result.shown, prompt], values: { ...result.values, [prompt.key]: value } }
    },
    { shown: [] as T[], values: {} as Record<string, string> },
  )
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

function v1Disconnect(source: string | undefined, credential: string | undefined, custom: boolean): ProviderDisconnect {
  if (source === "env") return { type: "none" }
  if (credential) return { type: "credentials", ids: [credential] }
  return { type: "auth", custom }
}

function v1Method(source: string | undefined, custom: boolean): ProviderMethod {
  if (source === "env") return "environment"
  if (source === "api") return "apiKey"
  if (source === "custom" || custom) return "custom"
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
  return fallback
}
