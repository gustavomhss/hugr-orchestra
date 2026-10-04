import { For, Show, createEffect, createMemo, createSignal, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createVirtualizer, defaultRangeExtractor } from "@tanstack/solid-virtual"

// Expanded cockpit cards retain every entity, but mount only the visible range. Keep a focused row
// mounted while scrolling; keyboard navigation can reach rows that have not been mounted yet.
export function OrchestraCockpitList<T extends { key: string }>(props: {
  items: readonly T[]
  estimate: number
  label: string
  children: (item: Accessor<T>) => JSX.Element
}) {
  const [root, setRoot] = createSignal<HTMLDivElement>()
  const [view, setView] = createStore({
    focused: undefined as string | undefined,
    pending: undefined as string | undefined,
  })
  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() {
      return props.items.length
    },
    // Solid refs can still belong to a detached template document with no window. Attaching there
    // prevents the virtualizer from installing its resize and scroll observers on mount.
    getScrollElement: () => (root()?.isConnected ? root()! : null),
    initialRect: { width: 0, height: 320 },
    estimateSize: () => props.estimate,
    overscan: 3,
    get getItemKey() {
      const items = props.items
      return (index: number) => items[index].key
    },
    get rangeExtractor() {
      // The virtualizer memoizes ranges by extractor identity. Capture focus here so a keyboard
      // jump mounts its destination before the native scroll event arrives.
      const focused = props.items.findIndex((item) => item.key === view.focused)
      return (range: Parameters<typeof defaultRangeExtractor>[0]) => {
        const indexes = defaultRangeExtractor(range)
        return focused < 0 || indexes.includes(focused) ? indexes : [...indexes, focused].sort((a, b) => a - b)
      }
    },
  })
  const rows = createMemo(() => new Map(virtualizer.getVirtualItems().map((item) => [item.key, item])))
  const keys = createMemo(() => virtualizer.getVirtualItems().map((item) => item.key))
  // When the list shrinks, a row can update before the virtualizer drops or renumbers it, so a row reads
  // its entity by key: an index from the previous list may now be past the end or name another entity.
  const items = createMemo(() => new Map(props.items.map((item) => [item.key, item])))
  createEffect(() => {
    const key = view.pending
    if (!key || !keys().includes(key)) return
    const index = props.items.findIndex((item) => item.key === key)
    queueMicrotask(() => {
      if (view.pending !== key) return
      const row = root()?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      // A row without a control of its own (an Activity row with no action) takes focus itself, or
      // navigation would stop there.
      const target = row?.querySelector<HTMLElement>(':is(button, [role="button"])') ?? row
      if (!target) return
      target.focus()
      setView("pending", undefined)
    })
  })

  return (
    <div
      ref={setRoot}
      class="orchestra-cockpit-list"
      role="list"
      aria-label={props.label}
      onKeyDown={(event) => {
        const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cockpit-row]") : null
        if (!element || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
        const current = Number(element.dataset.index)
        const index =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? props.items.length - 1
              : Math.max(0, Math.min(props.items.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))
        event.preventDefault()
        setView({ focused: props.items[index].key, pending: props.items[index].key })
        virtualizer.scrollToIndex(index, { align: "auto" })
      }}
    >
      <div style={{ position: "relative", height: `${virtualizer.getTotalSize()}px` }}>
        <For each={keys()}>
          {(key) => (
            <Show when={rows().get(key)}>
              {(row) => (
                <Show when={items().get(String(key))}>
                  {(item) => (
                    <div
                      ref={(element) =>
                        queueMicrotask(() => {
                          // A row removed before this runs keeps its last index, which may now name another
                          // entity or none; measuring it would size the wrong row or throw.
                          if (props.items[Number(element.dataset.index)]?.key === key)
                            virtualizer.measureElement(element)
                        })
                      }
                      data-index={row().index}
                      data-cockpit-row=""
                      role="listitem"
                      tabIndex={-1}
                      aria-posinset={row().index + 1}
                      aria-setsize={props.items.length}
                      onFocusIn={() => setView("focused", String(key))}
                      onFocusOut={(event) => {
                        if (!view.pending && !event.currentTarget.contains(event.relatedTarget as Node | null))
                          setView("focused", undefined)
                      }}
                      style={{
                        position: "absolute",
                        top: "0",
                        "inset-inline": "0",
                        transform: `translateY(${row().start}px)`,
                      }}
                    >
                      {props.children(item)}
                    </div>
                  )}
                </Show>
              )}
            </Show>
          )}
        </For>
      </div>
    </div>
  )
}
