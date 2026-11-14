// Serves a fixture's legacy-shaped provider catalog through the V2 provider, model and default model routes. Only
// connected providers are listed, as the V2 server lists only the providers it can run; a fixture without a
// connected list connects all of them.
export function currentCatalog(value: unknown) {
  type LegacyModel = {
    id: string
    name?: string
    family?: string
    status?: string
    attachment?: boolean
    limit?: { context: number; output?: number }
    cost?: { input?: number; output?: number; cache?: { read?: number; write?: number } }
    variants?: Record<string, Record<string, unknown>>
  }
  const catalog = (value ?? {}) as {
    all?: { id: string; name?: string; models?: Record<string, LegacyModel> }[]
    connected?: string[]
    default?: Record<string, string>
  }
  const providers = (catalog.all ?? []).filter((provider) => catalog.connected?.includes(provider.id) ?? true)
  const models = providers.flatMap((provider) =>
    Object.values(provider.models ?? {}).map((model) => ({
      id: model.id,
      modelID: model.id,
      providerID: provider.id,
      name: model.name ?? model.id,
      family: model.family,
      capabilities: { input: model.attachment ? ["text", "image"] : ["text"], output: ["text"], tools: true },
      variants: Object.entries(model.variants ?? {}).map(([id, settings]) => ({ id, settings })),
      time: { released: 1 },
      cost: model.cost
        ? [
            {
              input: model.cost.input ?? 0,
              output: model.cost.output ?? 0,
              cache: { read: model.cost.cache?.read ?? 0, write: model.cost.cache?.write ?? 0 },
            },
          ]
        : [],
      status: model.status ?? "active",
      enabled: true,
      limit: { context: model.limit?.context ?? 200_000, output: model.limit?.output ?? 8192 },
    })),
  )
  // The fixture default is either one { providerID, modelID } pair or a model per provider.
  const preferred = catalog.default?.providerID
    ? [{ providerID: catalog.default.providerID, modelID: catalog.default.modelID }]
    : Object.entries(catalog.default ?? {}).map(([providerID, modelID]) => ({ providerID, modelID }))
  const defaults = preferred.flatMap((pick) =>
    models.filter((model) => model.providerID === pick.providerID && model.id === pick.modelID),
  )
  return {
    providers: providers.map((provider) => ({ id: provider.id, name: provider.name ?? provider.id, settings: {} })),
    models,
    default: defaults[0] ?? models[0] ?? null,
  }
}

