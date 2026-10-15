import { batch, createEffect, createMemo, startTransition } from "solid-js"
import { createStore } from "solid-js/store"
import { useSearchParams } from "@solidjs/router"
import { useTabs } from "@/context/tabs"
import { useModels } from "@/context/models"
import type { ModelKey, ModelSelection } from "@/context/local"
import { cycleModelVariant, getConfiguredAgentVariant, resolveModelVariant } from "@/context/model-variant"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useProviders } from "@/hooks/use-providers"
import { resolveDefaultModel } from "@/hooks/provider-catalog"

type ModelCandidate = Pick<ModelKey, "providerID" | "modelID">
type ModelCatalog = { all: ReadonlyMap<string, { models: Record<string, unknown> }>; connected: readonly string[] }

export const createPromptModelContext = () =>
  createStore<{ agent?: ModelCandidate; recent?: readonly ModelCandidate[] }>({})

export function selectPromptModel(
  input: Partial<Record<"chosen" | "agent" | "configured" | "fallback", ModelCandidate>> & {
    recent?: readonly ModelCandidate[]
  },
  catalog: ModelCatalog,
) {
  return [input.chosen, input.agent, input.configured, ...(input.recent ?? []), input.fallback].find(
    (item): item is ModelCandidate =>
      !!item && catalog.connected.includes(item.providerID) && !!catalog.all.get(item.providerID)?.models[item.modelID],
  )
}

export function createPromptModelSelection(input: { agent: () => { model?: ModelKey; variant?: string } | undefined }) {
  const sdk = useSDK()
  const sync = useSync()
  const models = useModels()
  const prompt = usePrompt()
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
  const providers = useProviders(() => sdk().directory)
  const connected = createMemo(() => new Set(providers.connected().map((item) => item.id)))

  const valid = (model: ModelCandidate) => {
    const provider = providers.all().get(model.providerID)
    return !!provider?.models[model.modelID] && connected().has(model.providerID)
  }

  const configured = () => {
    const model = resolveDefaultModel(providers.defaultModel(), sync().data.config.model)
    if (!model) return
    if (valid(model)) return model
  }

  const fallback = () => {
    const defaults = providers.default()
    return providers.connected().flatMap((provider) => {
      const modelID = defaults[provider.id] ?? Object.values(provider.models)[0]?.id
      return modelID ? [{ providerID: provider.id, modelID }] : []
    })[0]
  }

  const current = () => {
    const key = selectPromptModel(
      {
        chosen: prompt.model.current(),
        agent: input.agent()?.model,
        configured: configured(),
        recent: models.recent.list(),
        fallback: fallback(),
      },
      { all: providers.all(), connected: providers.connected().map((item) => item.id) },
    )
    if (!key) return
    return models.find(key)
  }
  const recentModels = createMemo(() =>
    models.recent
      .list()
      .map(models.find)
      .filter((item): item is NonNullable<typeof item> => !!item),
  )

  const selection = {
    ready: models.ready,
    current,
    recent: recentModels,
    list: models.list,
    cycle(direction: 1 | -1) {
      const items = recentModels()
      const item = current()
      if (!item) return
      const index = items.findIndex((entry) => entry.provider.id === item.provider.id && entry.id === item.id)
      if (index === -1) return
      const next = items[(index + direction + items.length) % items.length]
      if (next) selection.set({ providerID: next.provider.id, modelID: next.id })
    },
    set(item: ModelKey | undefined, options?: { recent?: boolean }) {
      startTransition(() =>
        batch(() => {
          prompt.model.set(item ? { ...item, variant: prompt.model.current()?.variant } : undefined)
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
        return prompt.model.current()?.variant
      },
      current() {
        const resolved = resolveModelVariant({
          variants: this.list(),
          selected: this.selected(),
          configured: this.configured(),
        })
        if (resolved) return resolved
        const model = current()
        if (!model) return
        const saved = models.variant.get({ providerID: model.provider.id, modelID: model.id })
        if (saved && this.list().includes(saved)) return saved
      },
      list() {
        return Object.keys(current()?.variants ?? {})
      },
      set(value: string | undefined) {
        startTransition(() =>
          batch(() => {
            const model = current()
            if (!model) return
            prompt.model.set({ providerID: model.provider.id, modelID: model.id, variant: value ?? null })
            models.variant.set({ providerID: model.provider.id, modelID: model.id }, value)
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
