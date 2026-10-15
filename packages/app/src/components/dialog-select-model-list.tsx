import { useFilteredList } from "@orchestra/ui/hooks"
import { Icon } from "@orchestra/ui/icon"
import { IconButton } from "@orchestra/ui/icon-button"
import { Tag } from "@orchestra/ui/tag"
import { TextField } from "@orchestra/ui/text-field"
import { Tooltip } from "@orchestra/ui/tooltip"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createEffect, createMemo, createSignal, For, type JSX, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useLocal } from "@/context/local"
import { popularProviders } from "@/hooks/use-providers"
import { createGroupedVirtualizer } from "./grouped-virtualizer"
import { ModelTooltip } from "./model-tooltip"

type ModelState = ReturnType<typeof useLocal>["model"]
type ModelItem = ReturnType<ModelState["list"]>[number]

export const isFree = (provider: string, cost: { input: number } | undefined) =>
  provider === "opencode" && (!cost || cost.input === 0)

export const modelKey = (model: ModelItem) => `${model.provider.id}:${model.id}`

// Same markup and data slots as the shared List (so list.css styles it unchanged), but only the rows in
// view are mounted: providers such as OpenRouter expose hundreds of models.
export function ModelList(props: {
  provider?: string
  class?: string
  onSelect: () => void
  action?: JSX.Element
  model?: ModelState
}) {
  const model = props.model ?? useLocal().model
  const language = useLanguage()
  const [store, setStore] = createStore({
    filter: "",
    mouseActive: false,
    scroll: undefined as HTMLDivElement | undefined,
  })
  let input: HTMLInputElement | HTMLTextAreaElement | undefined

  const models = createMemo(() =>
    model
      .list()
      .filter((m) => model.visible({ modelID: m.id, providerID: m.provider.id }))
      .filter((m) => (props.provider ? m.provider.id === props.provider : true)),
  )
  const current = () => {
    const value = model.current()
    return value ? modelKey(value) : undefined
  }
  const select = (item: ModelItem | undefined) => {
    model.set(item ? { modelID: item.id, providerID: item.provider.id } : undefined, { recent: true })
    props.onSelect()
  }

  const list = useFilteredList<ModelItem>({
    items: models,
    key: modelKey,
    get current() {
      return model.current()
    },
    filterKeys: ["provider.name", "name", "id"],
    sortBy: (a, b) => a.name.localeCompare(b.name),
    groupBy: (x) => x.provider.name,
    sortGroupsBy: (a, b) => {
      const aProvider = a.items[0].provider.id
      const bProvider = b.items[0].provider.id
      if (popularProviders.includes(aProvider) && !popularProviders.includes(bProvider)) return -1
      if (!popularProviders.includes(aProvider) && popularProviders.includes(bProvider)) return 1
      return popularProviders.indexOf(aProvider) - popularProviders.indexOf(bProvider)
    },
    onSelect: select,
  })
  const rows = createGroupedVirtualizer({
    groups: () => list.grouped.latest ?? [],
    key: modelKey,
    scrollElement: () => store.scroll,
    // list.css: headers are 8px + 21px (14px at 150%) + 8px, items 6px + 21px + 6px, groups 12px apart.
    header: 37,
    item: 33,
    gap: 12,
    paddingEnd: 12,
    viewport: 320,
  })

  const applyFilter = (value: string) => {
    setStore("filter", value)
    list.onInput(value)
  }

  createEffect(on(list.filter, () => store.scroll?.scrollTo(0, 0), { defer: true }))

  createEffect(() => {
    const key = current()
    if (!store.scroll || !key) return
    requestAnimationFrame(() => rows.scrollTo(key, "center"))
  })

  createEffect(() => {
    const scroll = store.scroll
    const first = list.flat()[0]
    const key = list.active()
    if (store.mouseActive || !scroll || !first || !key) return
    if (key === modelKey(first)) {
      scroll.scrollTo(0, 0)
      return
    }
    rows.scrollTo(key, "center")
  })

  const handleKey = (event: KeyboardEvent) => {
    setStore("mouseActive", false)
    if (event.key === "Escape" || event.defaultPrevented) return
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault()
      const selected = list.flat().find((item) => modelKey(item) === list.active())
      if (selected) select(selected)
      return
    }
    const step = event.key === "ArrowDown" || event.key === "ArrowUp"
    const emacs = event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    if (step || (emacs && (event.key === "n" || event.key === "p"))) list.onKeyDown(event)
  }

  return (
    <div
      data-component="list"
      class={`flex-1 px-3 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0 ${props.class ?? ""}`}
    >
      <div data-slot="list-search-wrapper">
        <div
          data-slot="list-search"
          onPointerDown={(event) => {
            input?.focus()
            // Prevent global listeners (e.g. dnd sensors) from cancelling focus.
            event.stopPropagation()
          }}
        >
          <div data-slot="list-search-container">
            <Icon name="magnifying-glass" />
            <TextField
              autofocus
              variant="ghost"
              data-slot="list-search-input"
              type="text"
              ref={(el: HTMLInputElement | HTMLTextAreaElement) => (input = el)}
              value={store.filter}
              onChange={applyFilter}
              onKeyDown={handleKey}
              placeholder={language.t("dialog.model.search.placeholder")}
              spellcheck={false}
              autocorrect="off"
              autocomplete="off"
              autocapitalize="off"
            />
          </div>
          <Show when={store.filter}>
            <IconButton
              icon="circle-x"
              variant="ghost"
              onClick={() => {
                applyFilter("")
                queueMicrotask(() => input?.focus())
              }}
              aria-label={language.t("ui.list.clearFilter")}
            />
          </Show>
        </div>
        {props.action}
      </div>
      <div ref={(el) => setStore("scroll", el)} data-slot="list-scroll">
        <Show
          when={list.flat().length > 0}
          fallback={
            <div data-slot="list-empty-state">
              <div data-slot="list-message">
                {language.t(list.grouped.loading ? "ui.list.loading" : "dialog.model.empty")}
              </div>
            </div>
          }
        >
          <div style={{ position: "relative", "flex-shrink": 0, height: `${rows.total()}px` }}>
            <For each={rows.groups()}>
              {(category) => (
                <Show when={rows.group(category)}>
                  {(box) => (
                    <div
                      data-slot="list-group"
                      style={{
                        position: "absolute",
                        top: `${box().start}px`,
                        width: "100%",
                        height: `${box().size}px`,
                      }}
                    >
                      <GroupHeader scroll={store.scroll}>{category}</GroupHeader>
                      <div data-slot="list-items">
                        <For each={rows.items(category)}>
                          {(key) => (
                            <Show when={rows.row(key)?.item}>
                              {(item) => (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: `${(rows.row(key)?.start ?? 0) - box().start}px`,
                                    width: "100%",
                                  }}
                                >
                                  <Tooltip
                                    class="w-full"
                                    placement="right-start"
                                    gutter={12}
                                    openDelay={0}
                                    value={
                                      <ModelTooltip
                                        model={item()}
                                        latest={item().latest}
                                        free={isFree(item().provider.id, item().cost)}
                                      />
                                    }
                                  >
                                    <button
                                      data-slot="list-item"
                                      data-key={key}
                                      data-active={key === list.active()}
                                      data-selected={key === current()}
                                      type="button"
                                      onClick={() => select(item())}
                                      onKeyDown={handleKey}
                                      onMouseMove={(event) => {
                                        if (event.movementX === 0 && event.movementY === 0) return
                                        setStore("mouseActive", true)
                                        list.setActive(key)
                                      }}
                                      onMouseLeave={() => {
                                        if (!store.mouseActive) return
                                        list.setActive(null)
                                      }}
                                    >
                                      <div class="w-full flex items-center gap-x-2 text-13-regular">
                                        <span class="truncate">{item().name}</span>
                                        <Show when={isFree(item().provider.id, item().cost)}>
                                          <Tag>{language.t("model.tag.free")}</Tag>
                                        </Show>
                                        <Show when={item().latest}>
                                          <Tag>{language.t("model.tag.latest")}</Tag>
                                        </Show>
                                      </div>
                                      <Show when={key === current()}>
                                        <span data-slot="list-item-selected-icon">
                                          <Icon name="check-small" />
                                        </span>
                                      </Show>
                                    </button>
                                  </Tooltip>
                                </div>
                              )}
                            </Show>
                          )}
                        </For>
                      </div>
                    </div>
                  )}
                </Show>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}

function GroupHeader(props: { scroll?: HTMLDivElement; children: JSX.Element }) {
  const [header, setHeader] = createSignal<HTMLDivElement>()
  const [stuck, setStuck] = createSignal(false)

  createEffect(() => {
    const scroll = props.scroll
    const node = header()
    if (!scroll || !node) return
    const update = () => {
      const rect = node.getBoundingClientRect()
      setStuck(rect.top <= scroll.getBoundingClientRect().top + 1 && scroll.scrollTop > 0)
    }
    makeEventListener(scroll, "scroll", update, { passive: true })
    update()
  })

  return (
    <div data-slot="list-header" data-stuck={stuck()} ref={setHeader}>
      {props.children}
    </div>
  )
}
