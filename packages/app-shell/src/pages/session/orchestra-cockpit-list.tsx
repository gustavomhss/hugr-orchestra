import { For, Show, createEffect, createMemo, createSignal, onCleanup, type Accessor, type JSX } from "solid-js"
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
  const [body, setBody] = createSignal<HTMLDivElement>()
  const [view, setView] = createStore({
    focused: undefined as string | undefined,
    pending: undefined as string | undefined,
  })
  // The row that holds focus and the element inside it that has focus: the row is recognized among removed
  // nodes, and focus returns to the same element (a task's Stop button, not the row that opens the task).
  const holder = { row: undefined as HTMLElement | undefined, target: undefined as HTMLElement | undefined }
  const release = () => {
    setView("focused", undefined)
    holder.row = undefined
    holder.target = undefined
  }
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
      // jump mounts its destination before the native scroll event arrives, and the row that still
      // holds focus stays mounted until the destination takes it; unmounting it drops focus to the page.
      const pinned = [view.focused, view.pending]
        .map((key) => props.items.findIndex((item) => item.key === key))
        .filter((index) => index >= 0)
      return (range: Parameters<typeof defaultRangeExtractor>[0]) => {
        const indexes = defaultRangeExtractor(range)
        const first = indexes[0] ?? 0
        const last = indexes.at(-1) ?? 0
        const reach = range.endIndex - range.startIndex + 1 + range.overscan
        // Arrow keys outrun the scroll event, so a row stepped to usually sits just past the window. Mount the
        // rows between, up to the visible rows plus overscan: a gap there fills later by replacing the node
        // after it. A farther pinned row (Home, End, or a focused row scrolled away from) leaves a gap and
        // keeps the window bounded; the observer below repairs focus if filling that gap takes the row.
        const joined = pinned.flatMap((index) => {
          if (index > last && index - last <= reach)
            return Array.from({ length: index - last }, (_, step) => last + 1 + step)
          if (index < first && first - index <= reach)
            return Array.from({ length: first - index }, (_, step) => index + step)
          return [index]
        })
        return [...new Set([...indexes, ...joined])].sort((a, b) => a - b)
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

  // A focused entity that leaves the list no longer pins a row, and the detached row is let go.
  createEffect(() => {
    const key = view.focused
    if (key && !props.items.some((item) => item.key === key)) release()
  })

  // Shifting the window, or a reorder, can make the reconciler move or replace the focused row's node, and a
  // focused node that leaves the document drops focus to the page. Solid's keyed list decides which nodes it
  // moves and every DOM move detaches the node, while the rows must stay in visual order for Tab and reading
  // order; so the node cannot be kept in place, and focus is put back on that entity's row instead.
  createEffect(() => {
    const element = body()
    if (!element) return
    const observer = new MutationObserver((records) => {
      const removed = holder.row
      if (!removed || !view.focused || !records.some((record) => [...record.removedNodes].includes(removed))) return
      if (document.activeElement && document.activeElement !== document.body) return
      const index = props.items.findIndex((item) => item.key === view.focused)
      const row = removed.isConnected ? removed : root()?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      const target =
        holder.target?.isConnected && row?.contains(holder.target)
          ? holder.target
          : (row?.querySelector<HTMLElement>(':is(button, [role="button"])') ?? row)
      target?.focus({ preventScroll: true })
    })
    observer.observe(element, { childList: true })
    // Pointing anywhere outside the list is a deliberate leave, even onto text that takes no focus, after
    // which document.activeElement is the body just as when the reconciler takes the row.
    const leave = (event: PointerEvent) => {
      if (event.target instanceof Node && root()?.contains(event.target)) return
      release()
    }
    document.addEventListener("pointerdown", leave, true)
    onCleanup(() => {
      observer.disconnect()
      document.removeEventListener("pointerdown", leave, true)
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
        setView("pending", props.items[index].key)
        virtualizer.scrollToIndex(index, { align: "auto" })
      }}
    >
      <div ref={setBody} style={{ position: "relative", height: `${virtualizer.getTotalSize()}px` }}>
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
                      onFocusIn={(event) => {
                        holder.row = event.currentTarget
                        holder.target = event.target instanceof HTMLElement ? event.target : undefined
                        setView("focused", String(key))
                      }}
                      onFocusOut={(event) => {
                        // Focus that goes nowhere (a removed node, another window) keeps the row pinned.
                        const next = event.relatedTarget
                        if (view.pending || !(next instanceof Node) || event.currentTarget.contains(next)) return
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
