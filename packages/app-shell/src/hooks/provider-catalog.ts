import type { NormalizedProviderListResponse } from "@orchestra/session-ui/context"
import type { Provider } from "../compat/sdk-v2-client"
import { createMemo, createResource, type Accessor, type Resource, type ResourceActions } from "solid-js"
import type { ModelKey } from "@/context/models"
import type { LayoutRoute } from "@/context/layout-route"
import type { ServerConnection } from "@/context/server"

const emptyProviderCatalog: NormalizedProviderListResponse = { all: new Map(), connected: [], default: {} }

type DirectoryCatalog = {
  ready: boolean
  providers: NormalizedProviderListResponse
}

type ProviderCatalogInput =
  | {
      explicit: true
      directory?: string
      catalog?: DirectoryCatalog
    }
  | {
      explicit: false
      directory?: string
      catalog?: DirectoryCatalog
      global: NormalizedProviderListResponse
    }

export function selectProviderCatalog(input: ProviderCatalogInput) {
  if (input.directory) return input.catalog?.ready ? input.catalog.providers : emptyProviderCatalog
  if (input.explicit) return emptyProviderCatalog
  return input.global
}

export function settingsProviderDirectory(
  route: LayoutRoute,
  input: { draft: (id: string) => string | undefined; session: (id: string) => string | undefined; home?: string },
) {
  if (route.type === "dir-new-sesssion") return route.dir
  if (route.type === "draft") return input.draft(route.draftID)
  if (route.type === "session") return input.session(route.sessionId)
  if (route.type === "chapter") return input.home
  return input.home ?? null
}

export function settingsProviderOwner(
  route: LayoutRoute,
  input: {
    current: ServerConnection.Key
    home: { server: ServerConnection.Key; directory?: string }
    draft: (id: string) => { server: ServerConnection.Key; directory: string } | undefined
    session: (server: ServerConnection.Key, id: string) => string | undefined
  },
) {
  const draft = route.type === "draft" ? input.draft(route.draftID) : undefined
  const server =
    route.type === "home" || route.type === "chapter"
      ? input.home.server
      : (draft?.server ?? route.server ?? input.current)
  return {
    server,
    directory: settingsProviderDirectory(route, {
      home: input.home.directory,
      draft: () => draft?.directory,
      session: (id) => input.session(server, id),
    }),
  }
}

export async function refetchProviderResource<T>(
  resource: Resource<T>,
  actions: ResourceActions<T>,
  failed: () => string,
) {
  const value = await actions.refetch()
  if (resource.state === "errored") throw resource.error ?? new Error(failed())
  if (value === undefined) throw new Error(failed())
  return value
}

// Discovery/auth metadata failures belong to the dialog, not the app's ErrorBoundary. Tag the result
// with its scope so a delayed reply can never expose another directory's data or error.
export function createProviderResource<Input, Value>(
  source: Accessor<Input | undefined>,
  fetcher: (input: Input) => Promise<Value>,
) {
  const request = createMemo(source)
  const [resource, actions] = createResource(request, async (input) =>
    Promise.resolve()
      .then(() => fetcher(input))
      .then(
        (value) => ({ input, ok: true as const, value }),
        (cause: unknown) => ({ input, ok: false as const, cause }),
      ),
  )
  const result = () => {
    if (resource.state !== "ready") return
    const value = resource()
    return value?.input === request() ? value : undefined
  }
  return {
    data: () => {
      const value = result()
      return value?.ok ? value.value : undefined
    },
    error: () => {
      const value = result()
      return value && !value.ok ? { cause: value.cause } : undefined
    },
    loading: () => resource.loading,
    retry: () => actions.refetch(),
  }
}

// Availability comes from the active provider catalog; only an explicit user choice hides a model.
export function createModelCatalog(
  connected: Accessor<Provider[]>,
  preferences: Accessor<ReadonlyArray<ModelKey & { visibility: "show" | "hide" }>>,
) {
  const visibility = createMemo(
    () => new Map(preferences().map((item) => [`${item.providerID}:${item.modelID}`, item.visibility])),
  )
  const list = createMemo(() =>
    connected().flatMap((provider) =>
      Object.values(provider.models).map((model) => ({
        ...model,
        provider,
        name: model.name.replace("(latest)", "").trim(),
        latest: model.name.includes("(latest)"),
      })),
    ),
  )
  return {
    list,
    visible: (model: ModelKey) => visibility().get(`${model.providerID}:${model.modelID}`) !== "hide",
  }
}

export function resolveDefaultModel(
  current: NormalizedProviderListResponse["defaultModel"],
  legacy: string | undefined,
) {
  if (current !== undefined) return current ?? undefined
  if (!legacy) return undefined
  const separator = legacy.indexOf("/")
  if (separator <= 0 || separator === legacy.length - 1) return undefined
  return { providerID: legacy.slice(0, separator), modelID: legacy.slice(separator + 1) }
}
