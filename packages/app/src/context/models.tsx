import { type Accessor, createContext, createResource, type ParentProps, useContext } from "solid-js"
import { createStore } from "solid-js/store"
import { uniqueBy } from "remeda"
import { createSimpleContext } from "@orchestra/ui/context"
import { useProviders } from "@/hooks/use-providers"
import { createModelCatalog } from "@/hooks/provider-catalog"
import { Persist, persisted } from "@/utils/persist"

export type ModelKey = { providerID: string; modelID: string }

type Visibility = "show" | "hide"
type User = ModelKey & { visibility: Visibility; favorite?: boolean }
type Store = {
  user: User[]
  recent: ModelKey[]
  variant?: Record<string, string | undefined>
}

const RECENT_LIMIT = 5

const Preferences = createContext<ReturnType<typeof createModelPreferences>>()

// One window-wide owner can wrap all server/directory catalogs. Nested ModelsProviders reuse it.
export function ModelPreferencesProvider(props: ParentProps) {
  const preferences = useContext(Preferences) ?? createModelPreferences()
  return <Preferences.Provider value={preferences}>{props.children}</Preferences.Provider>
}

const models = createSimpleContext({
  name: "Models",
  gate: false,
  init: (props: { directory?: Accessor<string | null | undefined> } = {}) => {
    const providers = useProviders(props.directory)
    const preferences = useContext(Preferences)
    if (!preferences) throw new Error("ModelsProvider requires ModelPreferencesProvider")
    const catalog = createModelCatalog(providers.connected, preferences.user)
    return {
      ready: preferences.ready,
      list: catalog.list,
      find: (key: ModelKey) =>
        catalog.list().find((model) => model.id === key.modelID && model.provider.id === key.providerID),
      visible: catalog.visible,
      setVisibility: preferences.setVisibility,
      recent: preferences.recent,
      variant: preferences.variant,
    }
  },
})

export const useModels = models.use

export function ModelsProvider(props: ParentProps<{ directory?: Accessor<string | null | undefined> }>) {
  return (
    <ModelPreferencesProvider>
      <models.provider directory={props.directory}>{props.children}</models.provider>
    </ModelPreferencesProvider>
  )
}

function createModelPreferences() {
  const [store, setStore, _, ready] = persisted(
    Persist.global("model", ["model.v1"]),
    createStore<Store>({
      user: [],
      recent: [],
      variant: {},
    }),
  )

  function update(model: ModelKey, state: Visibility) {
    const index = store.user.findIndex((x) => x.modelID === model.modelID && x.providerID === model.providerID)
    if (index >= 0) {
      setStore("user", index, (current) => ({ ...current, visibility: state }))
      return
    }
    setStore("user", store.user.length, { ...model, visibility: state })
  }

  const setVisibility = (model: ModelKey, state: boolean) => {
    update(model, state ? "show" : "hide")
  }

  const push = (model: ModelKey) => {
    const uniq = uniqueBy([model, ...store.recent], (x) => `${x.providerID}:${x.modelID}`)
    if (uniq.length > RECENT_LIMIT) uniq.pop()
    setStore("recent", uniq)
  }

  const variantKey = (model: ModelKey) => `${model.providerID}/${model.modelID}`
  const getVariant = (model: ModelKey) => store.variant?.[variantKey(model)]

  const setVariant = (model: ModelKey, value: string | undefined) => {
    const key = variantKey(model)
    if (!store.variant) {
      setStore("variant", { [key]: value })
      return
    }
    setStore("variant", key, value)
  }

  const [recentModels] = createResource(
    async () => {
      const recent = store.recent
      await ready.promise
      return recent
    },
    (p) => p,
    { initialValue: [] },
  )
  return {
    ready,
    user: () => store.user,
    setVisibility,
    recent: {
      list: () => recentModels()!,
      push,
    },
    variant: {
      get: getVariant,
      set: setVariant,
    },
  }
}
