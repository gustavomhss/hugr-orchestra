import { createMemo, createSignal } from "solid-js"
import { modelExecutionReason, useLocal } from "../context/local"
import { map, pipe, sortBy, take } from "remeda"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"
import { DialogVariant } from "./dialog-variant"
import * as fuzzysort from "fuzzysort"
import { useConnected } from "./use-connected"
import { useSync } from "../context/sync"
import { toModel } from "../context/catalog"

export function DialogModel(props: { providerID?: string }) {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const [query, setQuery] = createSignal("")

  const connected = useConnected()
  const providers = createDialogProviderOptions()

  const showExtra = createMemo(() => connected() && !props.providerID)

  const options = createMemo(() => {
    const canonical = local.model.execution.read()
    const providersById = new Map(sync.data.provider_next.all.map((provider) => [provider.id, provider.name]))
    const models = canonical.status === "ready" ? canonical.response.data.models.map((entry) => toModel(entry.model))
      : sync.data.provider.flatMap((provider) => Object.values(provider.models))
    const providerName = (id: string) => providersById.get(id) ?? id
    const unavailable = (providerID: string, modelID: string) => {
      if (canonical.status === "idle") return "Model availability has not been checked"
      if (canonical.status === "loading") return "Checking model availability"
      if (canonical.status !== "ready") return "Could not check model availability"
      const selection = canonical.response.data.selection
      const entry = canonical.response.data.models.find((item) => item.model.providerID === providerID && item.model.id === modelID)
      const reason = selection?.ref.providerID === providerID && selection.ref.id === modelID && selection.status !== "ready"
        ? selection.reason : entry && entry.status !== "ready" ? entry.reason : undefined
      return modelExecutionReason(reason)
    }
    const needle = query().trim()
    const showSections = showExtra() && needle.length === 0
    const favorites = connected() ? local.model.favorite() : []
    const recents = local.model.recent()

    function toOptions(items: typeof favorites, category: string) {
      if (!showSections) return []
      return items.flatMap((item) => {
        const model = models.find((model) => model.providerID === item.providerID && model.id === item.modelID)
        if (!model) return []
        const allowed = local.model.execution.allows(item)
        return [
          {
            value: item,
            title: model.name ?? item.modelID,
            description: providerName(item.providerID),
            category,
            disabled: !allowed,
            footer: !allowed ? unavailable(item.providerID, item.modelID) :
              model.cost?.input === 0 && item.providerID === "opencode" ? "Free" : undefined,
            onSelect: () => {
              onSelect(item.providerID, item.modelID, Object.keys(model.variants ?? {}))
            },
          },
        ]
      })
    }

    const favoriteOptions = toOptions(favorites, "Favorites")
    const recentOptions = toOptions(
      recents.filter(
        (item) => !favorites.some((fav) => fav.providerID === item.providerID && fav.modelID === item.modelID),
      ),
      "Recent",
    )

    const sections = [...favoriteOptions, ...recentOptions]
    const grouped = Object.groupBy(models, (model) => model.providerID)
    const providerOptions = sortBy(Object.keys(grouped), (id) => id !== "opencode", providerName)
      .filter((id) => !props.providerID || id === props.providerID)
      .flatMap((id) => sortModelOptions((grouped[id] ?? []).flatMap((model) => {
        const value = { providerID: id, modelID: model.id }
        if (model.status === "deprecated" || sections.some((option) => option.value.providerID === id && option.value.modelID === model.id)) return []
        const allowed = local.model.execution.allows(value)
        return [{
          value,
          title: model.name ?? model.id,
          releaseDate: model.release_date,
          description: favorites.some((item) => item.providerID === id && item.modelID === model.id) ? "(Favorite)" : undefined,
          category: connected() ? providerName(id) : undefined,
          disabled: !allowed,
          footer: !allowed ? unavailable(id, model.id) : model.cost?.input === 0 && id === "opencode" ? "Free" : undefined,
          onSelect: () => onSelect(id, model.id, Object.keys(model.variants ?? {})),
        }]
      }), props.providerID !== undefined))
    const selected = local.model.intent().model
    if (selected && (!props.providerID || selected.providerID === props.providerID) &&
      ![...sections, ...providerOptions].some((option) => option.value.providerID === selected.providerID && option.value.modelID === selected.modelID)) {
      const known = local.model.known(selected)
      providerOptions.push({ value: selected, title: known?.title ?? selected.modelID, releaseDate: "",
        description: undefined, category: known?.provider ?? selected.providerID, disabled: true,
        footer: unavailable(selected.providerID, selected.modelID), onSelect() {} })
    }

    const popularProviders = !connected()
      ? pipe(
          providers(),
          map((option) => ({
            ...option,
            category: "Popular providers",
          })),
          take(6),
        )
      : []

    if (needle) {
      return [
        ...sortModelOptions(
          fuzzysort.go(needle, providerOptions, { keys: ["title", "category"] }).map((x) => x.obj),
          false,
        ),
        ...fuzzysort.go(needle, popularProviders, { keys: ["title"] }).map((x) => x.obj),
      ]
    }

    return [...sections, ...providerOptions, ...popularProviders]
  })

  const provider = createMemo(() =>
    props.providerID ? sync.data.provider.find((item) => item.id === props.providerID) : null,
  )

  const title = createMemo(() => {
    const value = provider()
    if (!value) return "Select model"
    return value.name
  })

  function onSelect(providerID: string, modelID: string, variants: string[]) {
    if (!local.model.execution.allows({ providerID, modelID })) return
    local.model.set({ providerID, modelID }, { recent: true })
    // Selecting changes the assessment owner. Use the variants from the row just validated.
    const cur = local.model.variant.selected()
    if (cur === null || (typeof cur === "string" && variants.includes(cur))) {
      dialog.clear()
      return
    }
    if (variants.length > 0) {
      dialog.replace(() => <DialogVariant />)
      return
    }
    dialog.clear()
  }

  return (
    <DialogSelect<ReturnType<typeof options>[number]["value"]>
      options={options()}
      actions={[
        {
          command: "model.dialog.provider",
          title: connected() ? "Connect provider" : "View all providers",
          onTrigger() {
            dialog.replace(() => <DialogProvider />)
          },
        },
        {
          command: "model.dialog.favorite",
          title: "Favorite",
          hidden: !connected(),
          onTrigger: (option) => {
            local.model.toggleFavorite(option.value as { providerID: string; modelID: string })
          },
        },
      ]}
      onFilter={setQuery}
      flat={true}
      skipFilter={true}
      showDisabled={true}
      preserveSelection={true}
      title={title()}
      current={local.model.current()}
    />
  )
}

export function sortModelOptions<T extends { footer?: string; releaseDate: string | number; title: string }>(
  options: T[],
  newestFirst: boolean,
) {
  if (newestFirst) return sortBy(options, [(option) => option.releaseDate, "desc"], (option) => option.title)
  return sortBy(
    options,
    (option) => option.footer !== "Free",
    [(option) => option.releaseDate, "desc"],
    (option) => option.title,
  )
}
