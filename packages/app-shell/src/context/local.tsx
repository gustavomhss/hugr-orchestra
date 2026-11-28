import { createSimpleContext } from "@orchestra/ui/context"
import { base64Encode } from "@orchestra/core/util/encode"
import { useParams } from "@solidjs/router"
import { type Accessor, batch, createComputed, createEffect, createMemo, createSignal, onCleanup, startTransition, untrack } from "solid-js"
import { makeModelExecutionQuery, type ModelExecutionState } from "@orchestra/client"
import { createStore, type SetStoreFunction, type Store } from "solid-js/store"
import { useModels } from "@/context/models"
import { useProviders } from "@/hooks/use-providers"
import { resolveDefaultModel } from "@/hooks/provider-catalog"
import { Persist, persisted } from "@/utils/persist"
import { cycleModelVariant, getConfiguredAgentVariant } from "./model-variant"
import { useSDK } from "./sdk"
import { useSync } from "./sync"
import { useServerSDK } from "./server-sdk"
import { ScopedKey, type ServerScope } from "@/utils/server-scope"
import { agentKey } from "./agent-identity"
import { modelSupportsExecution } from "@/hooks/model-execution"
import { pathKey } from "@/utils/path-key"
import { sessionModelSelectionPending, type SessionModelRef } from "@/utils/session-model-execution"
import { normalizeCatalogModel } from "./global-sync/utils"

export type ModelKey = { providerID: string; modelID: string; variant?: string }
export const sameModelKey = (left: ModelKey | undefined, right: ModelKey | undefined) =>
  left?.providerID === right?.providerID && left?.modelID === right?.modelID


type State = {
  agent?: string
  model?: ModelKey
  variant?: string | null
  inherited?: true
}

export type Saved = {
  session: Record<string, State | undefined>
}

const WORKSPACE_KEY = "__workspace__"
const handoff = new Map<string, State>()

const handoffKey = (scope: ServerScope, dir: string, id: string) => ScopedKey.from(scope, dir, id)

const migrate = (value: unknown) => {
  if (!value || typeof value !== "object") return { session: {} }

  const item = value as {
    session?: Record<string, State | undefined>
    pick?: Record<string, State | undefined>
  }

  if (item.session && typeof item.session === "object") return { session: item.session }
  if (!item.pick || typeof item.pick !== "object") return { session: {} }

  return {
    session: Object.fromEntries(Object.entries(item.pick).filter(([key]) => key !== WORKSPACE_KEY)),
  }
}

const clone = (value: State | undefined) => {
  if (!value) return
  return {
    ...value,
    model: value.model ? { ...value.model } : undefined,
  } satisfies State
}

export const { use: useLocal, provider: LocalProvider } = createSimpleContext({
  name: "Local",
  init: () => {
    const params = useParams()
    const sdk = useSDK()
    const sync = useSync()
    const serverSDK = useServerSDK()
    const providers = useProviders(() => sdk().directory)
    const models = useModels()
    const [saved, setSaved, , savedReady] = persisted(
      {
        ...Persist.serverWorkspace(serverSDK().scope, sdk().directory, "model-selection", ["model-selection.v1"]),
        migrate,
      },
      createStore<Saved>({
        session: {},
      }),
    )
    return createLocal({ params, sdk, sync, serverSDK, providers, models, saved, setSaved, savedReady })
  },
})

type LocalDeps = {
  params: ReturnType<typeof useParams>
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  serverSDK: ReturnType<typeof useServerSDK>
  providers: ReturnType<typeof useProviders>
  models: ReturnType<typeof useModels>
  saved: Store<Saved>
  setSaved: SetStoreFunction<Saved>
  savedReady: Accessor<boolean>
}

// Tests pass fakes straight into createLocal; init is the only place the real hooks and persisted state are wired.
export function createLocal(deps: LocalDeps) {
  const { params, sdk, sync, serverSDK, providers, models, saved, setSaved, savedReady } = deps

  const id = createMemo(() => params.id || undefined)
  const connected = createMemo(() => new Set(providers.connected().map((item) => item.id)))

  // The primary conversation uses Maestro's engine, never another seat's engine or host login.
  const agent = {
    current: () => sync().data.agent.find((item) => agentKey(item) === "maestro"),
    key: () => "maestro",
  }
  const engine = () => agent.current()?.engine ?? sync().data.config.agent?.maestro?.engine

  const [store, setStore] = createStore<{
    draft?: State
    promoting?: State
    last?: {
      type: "agent" | "model" | "variant"
      agent?: string
      model?: ModelKey | null
      variant?: string | null
    }
  }>({
    draft: undefined,
    last: undefined,
  })

  const validModel = (model: ModelKey) => {
    const provider = providers.all().get(model.providerID)
    return (
      !!provider?.models[model.modelID] &&
      connected().has(model.providerID) &&
      modelSupportsExecution(model.providerID, provider, provider.models[model.modelID], engine())
    )
  }

  const scope = createMemo<State | undefined>(() => {
    const session = id()
    if (!session) return store.draft ?? store.promoting
    return saved.session[session] ?? handoff.get(handoffKey(serverSDK().scope, sdk().directory, session))
  })

  createEffect(() => {
    const session = id()
    if (!session) return

    const key = handoffKey(serverSDK().scope, sdk().directory, session)
    const next = handoff.get(key)
    if (!next) return
    if (saved.session[session] !== undefined) {
      handoff.delete(key)
      setStore("promoting", undefined)
      return
    }

    setSaved("session", session, clone(next))
    handoff.delete(key)
    setStore("promoting", undefined)
  })

  const configuredModel = () => resolveDefaultModel(providers.defaultModel(), sync().data.config.model)

  const recentModel = () => {
    for (const item of models.recent.list()) {
      return item
    }
  }

  const defaultModel = () => {
    const defaults = providers.default()
    for (const provider of providers.all().values()) {
      const configured = defaults[provider.id]
      if (configured) {
        const model = { providerID: provider.id, modelID: configured }
        return model
      }

      const first = Object.values(provider.models)[0]
      if (!first) continue
      const model = { providerID: provider.id, modelID: first.id }
      return model
    }
  }

  const fallback = createMemo<ModelKey | undefined>(() => configuredModel() ?? recentModel() ?? defaultModel())

  const intent = () => ({ model: scope()?.model, variant: scope()?.variant })
  const candidate = () => intent().model ?? agent.current()?.model ?? fallback()
  const placement = () => {
    const sessionID = id()
    return sessionID ? sync().session?.get?.(sessionID) : undefined
  }
  const execution = createModelExecutionView({ sdk, server: serverSDK, sessionID: id, placement, ready: () => savedReady() && models.ready(),
    metadata: () => ({ agents: sync().data.agent, config: sync().data.config, providers: [...providers.all()],
      connected: providers.connected().map((provider) => provider.id), semanticEpoch: sdk().modelExecutionEpoch() }),
    agentID: agent.key, agent: agent.current, intent, candidate,
    savedVariant: (key) => models.variant.get(key),
  })
  const display = createModelSelectionDisplay({ execution, providers, models, intent, candidate })
  const current = display.current

  const configured = () => {
    const item = agent.current()
    const model = current()
    if (!item || !model) return
    return getConfiguredAgentVariant({
      agent: { model: item.model, variant: item.variant },
      model: { providerID: model.provider.id, modelID: model.id, variants: model.variants },
    })
  }

  const selected = () => scope()?.variant

  const snapshot = () => {
    const model = current()
    return {
      agent: agent.key(),
      model: model ? { providerID: model.provider.id, modelID: model.id } : undefined,
      variant: selected(),
    } satisfies State
  }

  const write = (next: Partial<State>) => {
    const state = {
      ...(scope() ?? { agent: agent.key() }),
      ...next,
    } satisfies State

    const session = id()
    if (session) {
      setSaved("session", session, state)
      return
    }
    setStore("draft", state)
  }

  const recent = createMemo(() => models.recent.list().filter(validModel).map(models.find).filter(Boolean))

  const model = {
    intent,
    execution,
    ready: Object.assign(() => savedReady() && models.ready(), { promise: models.ready.promise }),
    current,
    recent,
    list: display.list,
    cycle(direction: 1 | -1) {
      const items = recent()
      const item = current()
      if (!item) return

      const index = items.findIndex((entry) => entry?.provider.id === item.provider.id && entry?.id === item.id)
      if (index === -1) return

      let next = index + direction
      if (next < 0) next = items.length - 1
      if (next >= items.length) next = 0

      const entry = items[next]
      if (!entry) return
      if (!execution.allows({ providerID: entry.provider.id, modelID: entry.id })) return
      model.set({ providerID: entry.provider.id, modelID: entry.id })
    },
    set(item: ModelKey | undefined, options?: { recent?: boolean }) {
      startTransition(() =>
        batch(() => {
          const variant = item && sameModelKey(item, candidate()) ? selected() : undefined
          setStore("last", {
            type: "model",
            agent: agent.key(),
            model: item ?? null,
            variant,
          })
          write({ model: item, variant, inherited: undefined })
          if (!item) return
          models.setVisibility(item, true)
          if (!options?.recent) return
          models.recent.push(item)
        }),
      )
    },
    visible(item: ModelKey) {
      return models.visible(item)
    },
    setVisibility(item: ModelKey, visible: boolean) {
      models.setVisibility(item, visible)
    },
    variant: {
      configured,
      selected,
      current() {
        return execution.input().model?.variant
      },
      list() {
        const item = current()
        if (!item?.variants) return []
        return Object.keys(item.variants)
      },
      set(value: string | undefined) {
        startTransition(() =>
          batch(() => {
            const item = candidate()
            if (!item) return
            const model = { providerID: item.providerID, modelID: item.modelID }
            setStore("last", {
              type: "variant",
              agent: agent.key(),
              model,
              variant: value ?? null,
            })
            write({ model, variant: value ?? null, inherited: undefined })
            models.variant.set(model, value)
          }),
        )
      },
      cycle() {
        const items = this.list()
        if (items.length === 0) return
        this.set(
          cycleModelVariant({
            variants: items,
            selected: this.selected(),
            configured: this.configured(),
          }),
        )
      },
    },
  }

  const result = {
    slug: createMemo(() => base64Encode(sdk().directory)),
    model,
    agent,
    session: {
      ready: savedReady,
      reset() {
        setStore({ draft: undefined, promoting: undefined })
      },
      promote(dir: string, session: string, state?: State) {
        const next = clone(state ?? snapshot())
        if (!next) return
        const key = handoffKey(serverSDK().scope, dir, session)
        handoff.set(key, next)

        if (dir === sdk().directory) {
          setSaved("session", session, next)
        }

        setStore("promoting", next)
        setStore("draft", undefined)
      },
      inherited: () => scope()?.inherited === true,
      selectingModel: (sessionID: string, model: SessionModelRef) =>
        sessionModelSelectionPending(serverSDK().currentApi.session, sessionID, model),
      restoreModel(model: ModelKey, variant: string | null | undefined, inherited?: true) {
        write({ model, variant, inherited })
      },
      restore(msg: { sessionID: string; agent: string; model: ModelKey }, inherited?: true) {
        const session = id()
        if (!session) return
        if (msg.sessionID !== session) return
        if (saved.session[session] !== undefined) return
        if (handoff.has(handoffKey(serverSDK().scope, sdk().directory, session))) return

        setSaved("session", session, {
          agent: msg.agent,
          model: msg.model,
          variant: msg.model.variant ?? null,
          inherited,
        })
      },
    },
  }
  return result
}

export type ModelSelection = ReturnType<typeof useLocal>["model"]

export function createModelSelectionDisplay(input: {
  execution: ReturnType<typeof createModelExecutionView>
  providers: Pick<ReturnType<typeof useProviders>, "all">
  models: Pick<ReturnType<typeof useModels>, "find" | "list">
  intent: () => { model: ModelKey | undefined }
  candidate: () => ModelKey | undefined
}) {
  type Item = NonNullable<ReturnType<typeof input.models.find>>
  const token = (providerID: string, modelID: string) => JSON.stringify([providerID, modelID])
  const canonical = createMemo(() => {
    const result = input.execution.read()
    if (result.status !== "ready") return
    return new Map(result.response.data.models.map(({ model }) => {
      const provider = input.providers.all().get(model.providerID) ?? {
        id: model.providerID, name: model.providerID, source: "custom" as const, env: [], options: {}, models: {},
      }
      const item = { ...normalizeCatalogModel(model, provider.id), provider,
        name: model.name.replace("(latest)", "").trim(), latest: model.name.includes("(latest)") }
      return [token(model.providerID, model.id), item] as const
    }))
  })
  const known = new Map<string, Item>()
  const display = (key: ModelKey | undefined) => {
    if (!key) return
    const provider = input.providers.all().get(key.providerID)
    const metadata = provider?.models[key.modelID]
    const id = token(key.providerID, key.modelID)
    const item = canonical()?.get(id) ?? input.models.find(key) ?? (provider && metadata ? { ...metadata, provider,
      name: metadata.name.replace("(latest)", "").trim(), latest: metadata.name.includes("(latest)") } : undefined)
    if (item) known.set(id, item)
    return item ?? known.get(id)
  }
  return {
    current: () => display(input.intent().model ?? (input.execution.ready() ? input.candidate() : undefined)),
    list: () => {
      const inventory = canonical()
      const items: Item[] = inventory ? [...inventory.values()] : input.models.list()
      const selected = display(input.intent().model)
      return selected && !items.some((item) => item.id === selected.id && item.provider.id === selected.provider.id)
        ? [...items, selected] : items
    },
  }
}

/** One view owns its query; admissions always acquire independent query owners. */
export function createModelExecutionView(input: {
  sdk: ReturnType<typeof useSDK>
  server?: ReturnType<typeof useServerSDK>
  sessionID: () => string | undefined
  placement?: () => { directory?: string; workspaceID?: string } | undefined
  agentID: () => string | undefined
  agent: () => { model?: ModelKey; variant?: string } | undefined
  intent: () => { model: ModelKey | undefined; variant: string | null | undefined }
  candidate: () => ModelKey | undefined
  savedVariant: (model: ModelKey) => string | undefined
  metadata: () => unknown
  ready?: () => boolean
}) {
  const [view, setView] = createStore<{ value: ModelExecutionState }>({ value: { status: "idle" } })
  const lifetime = { disposed: false }
  const directory = () => input.placement?.()?.directory ?? input.sdk().directory
  const workspaceID = () => input.placement?.()?.workspaceID
  const [locationEpoch, setLocationEpoch] = createSignal(0)
  createComputed(() => {
    const server = input.server?.()
    const path = directory()
    const workspace = workspaceID()
    if (workspace === undefined && path === input.sdk().directory) return
    const stop = server?.onModelExecutionChange?.(path, () => setLocationEpoch((value) => value + 1), workspace)
    if (stop) onCleanup(stop)
  })
  const context = createMemo(() => JSON.stringify({
    metadata: input.metadata(), locationEpoch: locationEpoch(),
    policyEpoch: input.sessionID() ? input.server?.().modelExecutionPolicyEpoch?.() : undefined,
  }))
  const version = () => {
    const id = input.sessionID()
    return id ? input.server?.().sessionManagement.subagentModelsWriteVersion?.(id) ?? 0 : 0
  }
  const owner = createMemo(() => {
    const sdk = input.sdk()
    const server = input.server?.()
    const model = input.candidate()
    const intent = input.intent()
    const agent = input.agent()
    const variant = typeof intent.variant === "string" ? intent.variant : intent.variant === null ? undefined
      : model && agent?.model?.providerID === model.providerID && agent.model.modelID === model.modelID && agent.variant !== undefined
        ? agent.variant : model ? input.savedVariant(model) : undefined
    const sessionID = input.sessionID()
    const request = {
      location: { directory: directory(), workspace: workspaceID() },
      context: sessionID ? { type: "session" as const, sessionID, agentID: input.agentID() }
        : { type: "draft" as const, agentID: input.agentID() },
      model: model ? { providerID: model.providerID, id: model.modelID, variant } : undefined,
    }
    return { sdk, client: sdk.orchestra, server, credentials: JSON.stringify(server?.server?.http), version: version(),
      context: context(),
      active: sdk.transportCurrent?.() !== false && server?.transportCurrent?.() !== false,
      epoch: sdk.connectionEpoch?.() ?? server?.connectionEpoch?.() ?? 0,
      key: JSON.stringify({ request, intent }), request }
  }, undefined, { equals: (left, right) => !!left && left.sdk === right.sdk && left.client === right.client &&
    left.server === right.server && left.credentials === right.credentials && left.version === right.version &&
    left.active === right.active && left.context === right.context && left.epoch === right.epoch && left.key === right.key })
  let readyOwner: ReturnType<typeof owner> | undefined
  const query = makeModelExecutionQuery({
    changed: (value) => { readyOwner = value.status === "ready" ? owner() : undefined; setView("value", value) },
    execute: async (request, options) => {
      const captured = owner()
      if (captured.sdk.transportCurrent?.() === false || captured.server?.transportCurrent?.() === false)
        throw new DOMException("", "AbortError")
      if (request.context.type === "session") await captured.server?.sessionManagement.waitSubagentModels?.(request.context.sessionID)
      if (owner() !== captured || captured.version !== version()) throw new DOMException("", "AbortError")
      const response = await captured.client.models.execution(request, options)
      if (owner() !== captured || captured.version !== version() ||
        captured.credentials !== JSON.stringify(input.server?.().server?.http) ||
        captured.sdk.transportCurrent?.() === false || captured.server?.transportCurrent?.() === false ||
        pathKey(response.location.directory) !== pathKey(request.location?.directory ?? captured.sdk.directory) ||
        response.location.workspaceID !== request.location?.workspace) throw new DOMException("", "AbortError")
      return response
    },
  })
  createComputed(() => {
    const captured = owner()
    const ready = input.ready?.() !== false
    untrack(() => {
      if (!ready) { query.invalidate(); return }
      void query.load(captured, captured.request)
    })
  })
  onCleanup(() => { lifetime.disposed = true; query.dispose() })
  return {
    context,
    read: () => lifetime.disposed ? query.read() : view.value,
    input: () => owner().request,
    reason(key: ModelKey) {
      const value = view.value
      if (lifetime.disposed || input.ready?.() === false || value.status !== "ready" || readyOwner !== owner() || readyOwner?.version !== version()) return
      const requested = owner().request.model
      const selected = value.response.data.selection
      if (requested?.providerID === key.providerID && requested.id === key.modelID &&
        selected?.ref.providerID === key.providerID && selected.ref.id === key.modelID &&
        selected.ref.variant === requested.variant && selected.status !== "ready") return selected.reason
      const entry = value.response.data.models.find((item) => item.model.providerID === key.providerID && item.model.id === key.modelID)
      return entry && entry.status !== "ready" ? entry.reason : undefined
    },
    ready() {
      const value = view.value
      if (lifetime.disposed || input.ready?.() === false || value.status !== "ready" || readyOwner !== owner() || readyOwner?.version !== version()) return false
      const selected = value.response.data.selection
      const model = owner().request.model
      return selected?.status === "ready" && selected.ref.providerID === model?.providerID &&
        selected.ref.id === model?.id && selected.ref.variant === model?.variant
    },
    allows(key: ModelKey) {
      const value = view.value
      if (lifetime.disposed || input.ready?.() === false || value.status !== "ready" || readyOwner !== owner() || readyOwner?.version !== version()) return false
      const requested = owner().request.model
      const selection = value.response.data.selection
      if (requested?.providerID === key.providerID && requested.id === key.modelID &&
        (selection?.status !== "ready" || selection.ref.providerID !== requested.providerID ||
          selection.ref.id !== requested.id || selection.ref.variant !== requested.variant)) return false
      return value.response.data.models.some((entry) => entry.model.id === key.modelID && entry.model.providerID === key.providerID && entry.status === "ready")
    },
  }
}
