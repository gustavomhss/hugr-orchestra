import { batch, createEffect, createMemo, startTransition } from "solid-js"
import { createStore } from "solid-js/store"
import { useSearchParams } from "@solidjs/router"
import { useTabs } from "@/context/tabs"
import { useModels } from "@/context/models"
import { createModelExecutionView, createModelSelectionDisplay, sameModelKey, type ModelKey, type ModelSelection } from "@/context/local"
import { cycleModelVariant, getConfiguredAgentVariant } from "@/context/model-variant"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import type { useServerSDK } from "@/context/server-sdk"
import { useSync } from "@/context/sync"
import { useProviders } from "@/hooks/use-providers"
import { resolveDefaultModel } from "@/hooks/provider-catalog"
import { modelSupportsExecution } from "@/hooks/model-execution"

type ModelCandidate = Pick<ModelKey, "providerID" | "modelID">
type ModelCatalog = { all: ReadonlyMap<string, { models: Record<string, unknown> }>; connected: readonly string[] }

export const createPromptModelContext = () =>
  createStore<{ agent?: ModelCandidate; recent?: readonly ModelCandidate[] }>({})

export function selectPromptModel(
  input: Partial<Record<"chosen" | "agent" | "configured" | "fallback", ModelCandidate>> & {
    recent?: readonly ModelCandidate[]
    engine?: unknown
  },
  catalog: ModelCatalog,
) {
  return [input.chosen, input.agent, input.configured, ...(input.recent ?? []), input.fallback].find(
    (item): item is ModelCandidate => {
      if (!item || !catalog.connected.includes(item.providerID)) return false
      const provider = catalog.all.get(item.providerID)
      const model = provider?.models[item.modelID]
      return !!model && modelSupportsExecution(item.providerID, provider, model, input.engine)
    },
  )
}

export function createPromptModelSelection(input: {
  agent: () => { id?: string; model?: ModelKey; variant?: string; engine?: string } | undefined
  session?: {
    server: ReturnType<typeof useServerSDK>
    id: () => string | undefined
    info: () => { directory: string; workspaceID?: string; model?: { providerID: string; id: string; variant?: string } } | undefined
    ready: () => boolean
  }
}) {
  const sdk = useSDK()
  const sync = useSync()
  const models = useModels()
  const prompt = usePrompt()
  if (!input.session) {
    const tabs = useTabs()
    const [search] = useSearchParams<{ draftId?: string }>()
    createEffect(() => {
      const tab = tabs.store.find((item) => item.type === "draft" && item.draftID === search.draftId)
      if (tab)
        tabs.state(tab, "prompt-model-context", createPromptModelContext)[1]({
          agent: input.agent()?.model,
          recent: models.recent.list(),
        })
    })
  }
  const providers = useProviders(() => sdk().directory)
  const connected = createMemo(() => new Set(providers.connected().map((item) => item.id)))
  const engine = () => input.agent()?.engine ?? sync().data.config.agent?.maestro?.engine

  const valid = (model: ModelCandidate) => {
    const provider = providers.all().get(model.providerID)
    return (
      !!provider?.models[model.modelID] &&
      connected().has(model.providerID) &&
      modelSupportsExecution(model.providerID, provider, provider.models[model.modelID], engine())
    )
  }

  const configured = () => resolveDefaultModel(providers.defaultModel(), sync().data.config.model)

  const fallback = () => {
    const defaults = providers.default()
    return [...providers.all().values()].flatMap((provider) => {
      const preferred = defaults[provider.id]
      const modelID =
        preferred ?? Object.values(provider.models)[0]?.id
      return modelID ? [{ providerID: provider.id, modelID }] : []
    })[0]
  }

  const intent = () => {
    const value = prompt.model.current()
    if (value) return { model: { providerID: value.providerID, modelID: value.modelID }, variant: value.variant }
    const stored = input.session?.info()?.model
    return {
      model: stored ? { providerID: stored.providerID, modelID: stored.id } : undefined,
      variant: stored ? stored.variant ?? null : undefined,
    }
  }
  const candidate = () => intent().model ?? input.agent()?.model ?? configured() ?? models.recent.list()[0] ?? fallback()
  const ready = () => models.ready() && prompt.ready() && input.session?.ready() !== false
  const execution = createModelExecutionView({ sdk, server: input.session?.server,
    sessionID: () => input.session?.id(), placement: input.session?.info,
    ready,
    metadata: () => ({ agents: sync().data.agent, config: sync().data.config, providers: [...providers.all()],
      connected: providers.connected().map((provider) => provider.id), semanticEpoch: sdk().modelExecutionEpoch() }),
    agentID: () => input.agent()?.id ?? "maestro", agent: input.agent, intent, candidate,
    savedVariant: (key) => models.variant.get(key),
  })
  const display = createModelSelectionDisplay({ execution, providers, models, intent, candidate })
  const current = display.current
  const recentModels = createMemo(() =>
    models.recent
      .list()
      .filter(valid)
      .map(models.find)
      .filter((item): item is NonNullable<typeof item> => !!item),
  )

  const selection = {
    intent,
    execution,
    ready: Object.assign(ready, { promise: models.ready.promise }),
    current,
    recent: recentModels,
    list: display.list,
    cycle(direction: 1 | -1) {
      const items = recentModels()
      const item = current()
      if (!item) return
      const index = items.findIndex((entry) => entry.provider.id === item.provider.id && entry.id === item.id)
      if (index === -1) return
      const next = items[(index + direction + items.length) % items.length]
      if (next && execution.allows({ providerID: next.provider.id, modelID: next.id }))
        selection.set({ providerID: next.provider.id, modelID: next.id })
    },
    set(item: ModelKey | undefined, options?: { recent?: boolean }) {
      startTransition(() =>
        batch(() => {
          const variant = sameModelKey(item, candidate()) ? intent().variant : undefined
          prompt.model.set(item ? { ...item, variant } : undefined)
          if (!item) return
          models.setVisibility(item, true)
          if (options?.recent) models.recent.push(item)
        }),
      )
    },
    visible: models.visible,
    setVisibility: models.setVisibility,
    variant: {
      configured() {
        const item = input.agent()
        const model = current()
        if (!item || !model) return
        return getConfiguredAgentVariant({
          agent: { model: item.model, variant: item.variant },
          model: { providerID: model.provider.id, modelID: model.id, variants: model.variants },
        })
      },
      selected() {
        return intent().variant
      },
      current() {
        return execution.input().model?.variant
      },
      list() {
        return Object.keys(current()?.variants ?? {})
      },
      set(value: string | undefined) {
        startTransition(() =>
          batch(() => {
            const item = candidate()
            if (!item) return
            const model = { providerID: item.providerID, modelID: item.modelID }
            prompt.model.set({ ...model, variant: value ?? null })
            models.variant.set(model, value)
          }),
        )
      },
      cycle() {
        const variants = this.list()
        if (variants.length === 0) return
        this.set(
          cycleModelVariant({
            variants,
            selected: this.selected(),
            configured: this.configured(),
          }),
        )
      },
    },
  } satisfies ModelSelection

  return selection
}
