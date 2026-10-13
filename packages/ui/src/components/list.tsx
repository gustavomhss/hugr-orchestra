import { type FilteredListProps, useFilteredList } from "@orchestra/ui/hooks"
import { createEffect, createMemo, createUniqueId, For, type JSX, mergeProps, on, Show } from "solid-js"
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
            size: 40,
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
  const reveal = (key: string) => {
    const scroll = scrollRef()
    const node = scroll && findByKey(scroll, key)
    if (scroll && node) scrollIntoView(scroll, node, "nearest")
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
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    const scroll = scrollRef()
    if (!scroll) return
    if (!props.current) return
    const key = props.key(props.current)
    requestAnimationFrame(() => {
      const element = findByKey(scroll, key)
      if (!element) return
      scrollIntoView(scroll, element, "center")
    })
  })

  createEffect(() => {
    const all = flat()
    if (store.mouseActive || all.length === 0) return
    const scroll = scrollRef()
    if (!scroll) return
    if (active() === props.key(all[0])) {
      scroll.scrollTo(0, 0)
      return
    }
    const key = active()
    if (!key) return
    const element = findByKey(scroll, key)
    if (!element) return
    scrollIntoView(scroll, element, "center")
  })

  createEffect(() => {
    const all = flat()
    const current = active()
    const item = all.find((x) => props.key(x) === current)
    props.onMove?.(item)
  })

  const handleSelect = (item: T | undefined, index: number) => {
    props.onSelect?.(item, index)
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
      <div data-slot="list-item-add" classList={{ [add.class ?? ""]: !!add.class }}>
        {add.render()}
      </div>
    )
  }

  function GroupHeader(groupProps: { group: { category: string; items: T[] } }): JSX.Element {
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
      <div data-slot="list-header" data-stuck={state.stuck} ref={(el) => setState("header", el)}>
        {props.groupHeader?.(groupProps.group) ?? groupProps.group.category}
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
      <div ref={setScrollRef} data-slot="list-scroll">
        <Show
          when={flat().length > 0 || showAdd()}
          fallback={
            <div data-slot="list-empty-state">
              <div data-slot="list-message">{emptyMessage()}</div>
            </div>
          }
        >
          <For each={grouped.latest}>
            {(group, groupIndex) => {
              const isLastGroup = () => groupIndex() === grouped.latest.length - 1
              return (
                <div data-slot="list-group">
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
          <Show when={grouped.latest.length === 0 && showAdd()}>
            <div data-slot="list-group">
              <div data-slot="list-items">{renderAdd()}</div>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
