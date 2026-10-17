import { type FilteredListProps, useFilteredList } from "@orchestra/ui/hooks"
import {
  createEffect,
  createMemo,
  createUniqueId,
  For,
  type JSX,
  mergeProps,
  on,
  onCleanup,
  Show,
  untrack,
} from "solid-js"
import { createStore } from "solid-js/store"
import { makeEventListener } from "@solid-primitives/event-listener"
import { useI18n } from "../context/i18n"
import { Icon, type IconProps } from "./icon"
import { IconButton } from "./icon-button"
import { TextField } from "./text-field"

function findByKey(container: HTMLElement, key: string) {
  const nodes = container.querySelectorAll<HTMLElement>('[data-slot="list-item"][data-key]')
  for (const node of nodes) {
    if (node.getAttribute("data-key") === key) return node
  }
}

export interface ListSearchProps {
  placeholder?: string
  autofocus?: boolean
  hideIcon?: boolean
  class?: string
  action?: JSX.Element
}

export interface ListAddProps {
  class?: string
  render: () => JSX.Element
}

export interface ListAddProps {
  class?: string
  render: () => JSX.Element
}

export interface ListProps<T> extends FilteredListProps<T> {
  class?: string
  children: (item: T) => JSX.Element
  emptyMessage?: string
  loadingMessage?: string
  onKeyEvent?: (event: KeyboardEvent, item: T | undefined) => void
  onMove?: (item: T | undefined) => void
  onFilter?: (value: string) => void
  activeIcon?: IconProps["name"]
  filter?: string
  search?: ListSearchProps | boolean
  itemWrapper?: (item: T, node: JSX.Element) => JSX.Element
  divider?: boolean
  add?: ListAddProps
  groupHeader?: (group: { category: string; items: T[] }) => JSX.Element
  "aria-label"?: string
  /** Fixed-height, keyed rows. Only the viewport, overscan and focused/active rows are mounted. */
  virtual?: { rowHeight: number; height?: number; overscan?: number }
}

export interface ListRef {
  onKeyDown: (e: KeyboardEvent) => void
  setScrollRef: (el: HTMLDivElement | undefined) => void
  setFilter: (value: string) => void
}

export function List<T>(props: ListProps<T> & { ref?: (ref: ListRef) => void }) {
  const i18n = useI18n()
  const id = createUniqueId()
  const cellID = (key: string) => `${id}-${encodeURIComponent(key)}`
  let inputRef: HTMLInputElement | HTMLTextAreaElement | undefined
  const [store, setStore] = createStore({
    mouseActive: false,
    scrollRef: undefined as HTMLDivElement | undefined,
    internalFilter: "",
    scrollTop: 0,
    height: 360,
    focused: undefined as string | undefined,
    focusedElement: undefined as HTMLElement | undefined,
    preferred: undefined as string | undefined,
    pressed: undefined as string | undefined,
  })
  const scrollRef = () => store.scrollRef
  const setScrollRef = (el: HTMLDivElement | undefined) => setStore("scrollRef", el)
  const internalFilter = () => store.internalFilter
  const setInternalFilter = (value: string) => setStore("internalFilter", value)

  const scrollIntoView = (container: HTMLDivElement, node: HTMLElement, block: "center" | "nearest") => {
    const containerRect = container.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()
    const top = nodeRect.top - containerRect.top + container.scrollTop
    const bottom = top + nodeRect.height
    const viewTop = container.scrollTop
    const viewBottom = viewTop + container.clientHeight
    const target =
      block === "center"
        ? top - container.clientHeight / 2 + nodeRect.height / 2
        : top < viewTop
          ? top
          : bottom > viewBottom
            ? bottom - container.clientHeight
            : viewTop
    const max = Math.max(0, container.scrollHeight - container.clientHeight)
    container.scrollTop = Math.max(0, Math.min(target, max))
  }

  const { filter, grouped, flat, active, setActive, onKeyDown, onInput, refetch } = useFilteredList<T>(props)

  type Entry = {
    key: string
    offset: number
    size: number
    index: number
  } & ({ kind: "header"; group: { category: string; items: T[] } } | { kind: "item"; item: T; itemIndex: number })
  const entries = createMemo(() => {
    let offset = 0
    let index = 0
    let itemIndex = 0
    return grouped.latest.flatMap((group): Entry[] => {
      const header: Entry[] = group.category
        ? [{ kind: "header", group, key: `header:${group.category}`, offset, size: 36, index: index++ }]
        : []
      if (header.length) offset += 36
      return [
        ...header,
        ...group.items.map((item): Entry => {
          const entry: Entry = {
            kind: "item",
            item,
            key: props.key(item),
            offset,
            size: props.virtual?.rowHeight ?? 40,
            index: index++,
            itemIndex: itemIndex++,
          }
          offset += entry.size
          return entry
        }),
      ]
    })
  })
  const itemEntries = createMemo(
    () => new Map(entries().flatMap((entry) => (entry.kind === "item" ? [[entry.key, entry] as const] : []))),
  )
  createEffect(() => {
    const all = itemEntries()
    const key = store.focused
    const element = store.focusedElement
    if (!key) return
    queueMicrotask(() => {
      if (document.activeElement !== document.body || store.focused !== key) return
      // Moving a keyed DOM row can blur its input. Restore only that row, never an unrelated focused control.
      if (all.has(key) && element?.isConnected) element.focus({ preventScroll: true })
      if (!all.has(key)) {
        setStore({ focused: undefined, focusedElement: undefined })
        inputRef?.focus({ preventScroll: true })
      }
    })
  })
  const headerIndexes = createMemo(
    () =>
      new Map(
        entries().flatMap((entry) => (entry.kind === "header" ? [[entry.group.category, entry.index] as const] : [])),
      ),
  )
  const keyedEntries = createMemo(() => new Map(entries().map((entry) => [`${entry.kind}:${entry.key}`, entry])))
  const lastFilter = { value: "" }
  createEffect(
    on(grouped, () => {
      if (props.virtual && filter() === lastFilter.value && store.preferred && itemEntries().has(store.preferred))
        setActive(store.preferred)
      if (filter() !== lastFilter.value) setStore("preferred", undefined)
      lastFilter.value = filter()
    }),
  )
  const totalHeight = () => {
    const last = entries().at(-1)
    return last ? last.offset + last.size : 0
  }
  const visible = createMemo(() => {
    const all = entries()
    if (!props.virtual) return all
    const overscan = props.virtual.overscan ?? 5
    // Binary search avoids scanning the catalog on every scroll event.
    let low = 0
    let high = all.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (all[middle].offset + all[middle].size < store.scrollTop) low = middle + 1
      else high = middle
    }
    const start = Math.max(0, low - overscan)
    let end = low
    while (end < all.length && all[end].offset < store.scrollTop + store.height) end++
    const range = all.slice(start, Math.min(all.length, start + 90, end + overscan))
    // Do not unmount a focused switch or an aria-activedescendant while the user scrolls.
    return [...new Set([...range, itemEntries().get(store.focused ?? ""), itemEntries().get(active() ?? "")])]
      .filter((entry): entry is Entry => !!entry)
      .sort((a, b) => a.index - b.index)
  })
  createEffect(() => {
    const element = scrollRef()
    if (!element || !props.virtual || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => setStore("height", element.clientHeight || props.virtual?.height || 360))
    observer.observe(element)
    onCleanup(() => observer.disconnect())
  })
  const reveal = (key: string, center = false) => {
    const scroll = scrollRef()
    if (!scroll) return
    if (!props.virtual) {
      const node = findByKey(scroll, key)
      if (node) scrollIntoView(scroll, node, center ? "center" : "nearest")
      return
    }
    const entry = itemEntries().get(key)
    if (!entry) return
    const height = scroll.clientHeight || store.height
    const target = center
      ? entry.offset - (height - entry.size) / 2
      : entry.offset < scroll.scrollTop
        ? entry.offset
        : entry.offset + entry.size > scroll.scrollTop + height
          ? entry.offset + entry.size - height
          : scroll.scrollTop
    scroll.scrollTop = Math.max(0, Math.min(target, totalHeight() - height))
    setStore("scrollTop", scroll.scrollTop)
  }

  const searchProps = () => (typeof props.search === "object" ? props.search : {})
  const searchAction = () => searchProps().action
  const addProps = () => props.add
  const showAdd = () => !!addProps()

  const moved = (event: MouseEvent) => event.movementX !== 0 || event.movementY !== 0

  const applyFilter = (value: string, options?: { ref?: boolean }) => {
    const prev = filter()
    setInternalFilter(value)
    onInput(value)
    props.onFilter?.(value)

    if (!options?.ref) return

    // Force a refetch even if the value is unchanged.
    // This is important for programmatic changes like Tab completion.
    if (prev === value) {
      void refetch()
      return
    }
    queueMicrotask(() => refetch())
  }

  createEffect(() => {
    if (props.filter === undefined) return
    if (props.filter === internalFilter()) return
    setInternalFilter(props.filter)
    onInput(props.filter)
  })

  createEffect(
    on(
      filter,
      () => {
        scrollRef()?.scrollTo(0, 0)
        setStore("scrollTop", 0)
      },
      { defer: true },
    ),
  )

  const selectedReveal = { key: undefined as string | undefined, done: false }
  createEffect(() => {
    const scroll = scrollRef()
    const key = props.current ? props.key(props.current) : undefined
    const ready = !!key && itemEntries().has(key)
    const searching = filter() !== ""
    if (selectedReveal.key !== key) {
      selectedReveal.key = key
      selectedReveal.done = false
    }
    if (!scroll || !key || selectedReveal.done) return
    // A late catalog must reveal the initial selection, but a search belongs to the user.
    if (searching) {
      selectedReveal.done = true
      return
    }
    if (!ready) return
    selectedReveal.done = true
    untrack(() => {
      setStore("preferred", key)
      setActive(key)
      reveal(key, true)
    })
  })

  createEffect(() => {
    const all = flat()
    if (store.mouseActive || all.length === 0) return
    const scroll = scrollRef()
    if (!scroll) return
    const key = active()
    if (!key) return
    untrack(() => reveal(key))
  })

  createEffect(() => {
    const current = active()
    const item = itemEntries().get(current ?? "")?.item
    props.onMove?.(item)
  })

  const handleSelect = (item: T | undefined, index: number) => {
    if (!item) return props.onSelect?.(item, index)
    const current = itemEntries().get(props.key(item))
    if (!current) return
    props.onSelect?.(current.item, current.itemIndex)
  }

  const handleKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return
    if (e.target instanceof Element && !e.target.isConnected) return
    setStore("mouseActive", false)
    if (e.key === "Escape") return

    const all = flat()
    const rowKey =
      (e.key === "Enter" || e.key === " ") && e.target instanceof HTMLElement
        ? e.target.closest<HTMLElement>('[data-slot="list-row"]')?.dataset.key
        : undefined
    if (rowKey) setActive(rowKey)
    const entry = itemEntries().get(rowKey ?? active() ?? "")
    const selected = entry?.item
    const index = entry?.itemIndex ?? -1
    props.onKeyEvent?.(e, selected)

    if (e.defaultPrevented) return

    const target = e.target
    const text =
      target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== "checkbox")
    const toggle = target instanceof HTMLInputElement && target.type === "checkbox"
    if (!toggle && (e.key === "Enter" || (e.key === " " && !text)) && !e.isComposing) {
      e.preventDefault()
      if (selected) handleSelect(selected, index)
      return
    }
    const navigation =
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      (!text && (e.key === "Home" || e.key === "End")) ||
      (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.key === "n" || e.key === "p"))
    if (!navigation) {
      if (!props.search) onKeyDown(e)
      return
    }
    if (all.length === 0 || e.altKey || e.metaKey || e.isComposing) return
    e.preventDefault()
    if (e.key === "Home" || e.key === "End") setActive(props.key(e.key === "Home" ? all[0] : all[all.length - 1]))
    else onKeyDown(e)
    const key = active()
    if (!key) return
    setStore("preferred", key)
    reveal(key)
    if (text) return
    const origin = document.activeElement
    queueMicrotask(() => {
      if (document.activeElement !== origin && (origin?.isConnected || document.activeElement !== document.body)) return
      const button = scrollRef() && findByKey(scrollRef()!, key)
      const control = toggle
        ? button?.closest('[data-slot="list-row"]')?.querySelector<HTMLElement>('[data-slot="switch-input"]')
        : button
      control?.focus({ preventScroll: true })
    })
  }

  props.ref?.({
    onKeyDown: handleKey,
    setScrollRef,
    setFilter: (value) => applyFilter(value, { ref: true }),
  })

  const renderAdd = () => {
    const add = addProps()
    if (!add) return null
    return (
      <div
        data-slot="list-item-add"
        role="row"
        aria-rowindex={entries().length + 1}
        classList={{ [add.class ?? ""]: !!add.class }}
      >
        <div role="gridcell">{add.render()}</div>
      </div>
    )
  }

  function GroupHeader(groupProps: {
    group: { category: string; items: T[] } | (() => { category: string; items: T[] })
  }): JSX.Element {
    const group = () => (typeof groupProps.group === "function" ? groupProps.group() : groupProps.group)
    const [state, setState] = createStore({
      stuck: false,
      header: undefined as HTMLDivElement | undefined,
    })

    createEffect(() => {
      const scroll = scrollRef()
      const node = state.header
      if (!scroll || !node) return

      const handler = () => {
        const rect = node.getBoundingClientRect()
        const scrollRect = scroll.getBoundingClientRect()
        setState("stuck", rect.top <= scrollRect.top + 1 && scroll.scrollTop > 0)
      }

      makeEventListener(scroll, "scroll", handler, { passive: true })
      handler()
    })

    return (
      <div
        data-slot="list-header"
        role="row"
        aria-rowindex={(headerIndexes().get(group().category) ?? 0) + 1}
        data-stuck={state.stuck}
        ref={(el) => setState("header", el)}
      >
        <span role="columnheader">{props.groupHeader?.(group()) ?? group().category}</span>
      </div>
    )
  }

  const emptyMessage = () => {
    if (grouped.loading) return props.loadingMessage ?? i18n.t("ui.list.loading")
    if (props.emptyMessage) return props.emptyMessage

    const query = filter()
    if (!query) return i18n.t("ui.list.empty")

    const suffix = i18n.t("ui.list.emptyWithFilter.suffix")
    return (
      <>
        <span>{i18n.t("ui.list.emptyWithFilter.prefix")}</span>
        <span data-slot="list-filter">&quot;{query}&quot;</span>
        <Show when={suffix}>
          <span>{suffix}</span>
        </Show>
      </>
    )
  }

  const renderItem = (item: T, index: number) => {
    const key = props.key(item)
    // Lazy props preserve the keyed row's controls across catalog refreshes without mutating caller-owned models.
    const live =
      typeof item === "object" && item !== null
        ? (mergeProps(() => (itemEntries().get(key)?.item ?? item) as object) as T)
        : item
    const node = (
      <button
        data-slot="list-item"
        data-key={key}
        data-active={key === active()}
        data-selected={!!props.current && key === props.key(props.current)}
        type="button"
        onPointerDown={() => setStore("pressed", key)}
        onClick={(event) => {
          const pressed = store.pressed
          setStore("pressed", undefined)
          if (!event.currentTarget.isConnected || (event.detail > 0 && pressed && pressed !== key)) return
          handleSelect(item, index)
        }}
        onMouseMove={(event) => {
          if (moved(event)) {
            setStore({ mouseActive: true, preferred: key })
            setActive(key)
          }
        }}
      >
        {props.children(live)}
        <Show when={props.current && key === props.key(props.current)}>
          <span data-slot="list-item-selected-icon">
            <Icon name="check-small" />
          </span>
        </Show>
        <Show when={props.activeIcon}>
          {(icon) => (
            <span data-slot="list-item-active-icon">
              <Icon name={icon()} />
            </span>
          )}
        </Show>
        <Show when={props.divider}>
          <span data-slot="list-item-divider" />
        </Show>
      </button>
    )
    return (
      <div
        data-slot="list-row"
        data-key={key}
        role="row"
        aria-rowindex={(itemEntries().get(key)?.index ?? index) + 1}
        onFocusIn={(event) => {
          setStore({
            focused: key,
            preferred: key,
            focusedElement: event.target instanceof HTMLElement ? event.target : undefined,
            mouseActive: false,
          })
          setActive(key)
        }}
        onFocusOut={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node))
            setStore({ focused: undefined, focusedElement: undefined })
        }}
        onKeyDown={handleKey}
      >
        <div role="gridcell" id={cellID(key)} data-slot="list-cell">
          {props.itemWrapper ? props.itemWrapper(live, node) : node}
        </div>
      </div>
    )
  }

  return (
    <div data-component="list" classList={{ [props.class ?? ""]: !!props.class }}>
      <Show when={!!props.search}>
        <div data-slot="list-search-wrapper">
          <div
            data-slot="list-search"
            classList={{ [searchProps().class ?? ""]: !!searchProps().class }}
            onPointerDown={(event) => {
              const container = event.currentTarget
              if (!(container instanceof HTMLElement)) return

              const node = container.querySelector("input, textarea")
              const input = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? node : inputRef
              input?.focus()

              // Prevent global listeners (e.g. dnd sensors) from cancelling focus.
              event.stopPropagation()
            }}
          >
            <div data-slot="list-search-container">
              <Show when={!searchProps().hideIcon}>
                <Icon name="magnifying-glass" />
              </Show>
              <TextField
                autofocus={searchProps().autofocus}
                variant="ghost"
                data-slot="list-search-input"
                type="text"
                ref={(el: HTMLInputElement | HTMLTextAreaElement) => {
                  inputRef = el
                }}
                value={internalFilter()}
                onChange={(value) => applyFilter(value)}
                onKeyDown={handleKey}
                role="combobox"
                aria-label={props["aria-label"] ?? searchProps().placeholder}
                aria-autocomplete="list"
                aria-haspopup="grid"
                aria-controls={`${id}-grid`}
                aria-expanded={flat().length > 0}
                aria-activedescendant={active() && itemEntries().has(active()!) ? cellID(active()!) : undefined}
                placeholder={searchProps().placeholder}
                spellcheck={false}
                autocorrect="off"
                autocomplete="off"
                autocapitalize="off"
              />
            </div>
            <Show when={internalFilter()}>
              <IconButton
                icon="circle-x"
                variant="ghost"
                onClick={() => {
                  applyFilter("")
                  queueMicrotask(() => inputRef?.focus())
                }}
                aria-label={i18n.t("ui.list.clearFilter")}
              />
            </Show>
          </div>
          {searchAction()}
        </div>
      </Show>
      <div
        ref={setScrollRef}
        data-slot="list-scroll"
        id={`${id}-grid`}
        role="grid"
        aria-label={props["aria-label"] ?? searchProps().placeholder}
        aria-rowcount={entries().length + Number(showAdd())}
        aria-colcount={1}
        aria-busy={grouped.loading}
        data-virtual={props.virtual ? "true" : undefined}
        style={
          props.virtual
            ? { "block-size": `min(${props.virtual.height ?? 360}px, 45dvh)`, "min-block-size": "0" }
            : undefined
        }
        onScroll={(event) => props.virtual && setStore("scrollTop", event.currentTarget.scrollTop)}
      >
        <Show
          when={flat().length > 0 || showAdd()}
          fallback={
            <div data-slot="list-empty-state">
              <div data-slot="list-message">{emptyMessage()}</div>
            </div>
          }
        >
          <Show
            when={props.virtual}
            fallback={
              <For each={grouped.latest}>
                {(group, groupIndex) => {
                  const isLastGroup = () => groupIndex() === grouped.latest.length - 1
                  return (
                    <div data-slot="list-group" role="rowgroup">
                      <Show when={group.category}>
                        <GroupHeader group={group} />
                      </Show>
                      <div data-slot="list-items">
                        <For each={group.items}>{(item, i) => renderItem(item, i())}</For>
                        <Show when={showAdd() && isLastGroup()}>{renderAdd()}</Show>
                      </div>
                    </div>
                  )
                }}
              </For>
            }
          >
            <div
              data-slot="list-group"
              role="rowgroup"
              style={{
                position: "relative",
                "block-size": `${totalHeight()}px`,
                "min-block-size": `${totalHeight()}px`,
                padding: "0",
              }}
            >
              <div data-slot="list-items" role="presentation">
                <For each={visible().map((entry) => `${entry.kind}:${entry.key}`)}>
                  {(key) => {
                    const initial = keyedEntries().get(key)!
                    const entry = () => keyedEntries().get(key) ?? initial
                    const node =
                      initial.kind === "header" ? (
                        <GroupHeader
                          group={() => {
                            const current = entry()
                            return current.kind === "header" ? current.group : initial.group
                          }}
                        />
                      ) : (
                        renderItem(initial.item, initial.itemIndex)
                      )
                    return (
                      <div
                        role="presentation"
                        style={{
                          position: "absolute",
                          "inset-block-start": `${entry().offset}px`,
                          "inset-inline": "0",
                          "block-size": `${entry().size}px`,
                        }}
                      >
                        {node}
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
            <Show when={showAdd()}>{renderAdd()}</Show>
          </Show>
          <Show when={!props.virtual && grouped.latest.length === 0 && showAdd()}>
            <div data-slot="list-group">
              <div data-slot="list-items">{renderAdd()}</div>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
