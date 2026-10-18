import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show } from "solid-js"
import type { Glyph, Tone } from "./catalog"
import { Ic, NodeGlyph } from "./ui"

export type PanelEntry = {
  key: string
  group: string
  glyph: Glyph
  tone: Tone
  label: string
  description: string
  disabled?: boolean
  // Why a disabled entry cannot be picked; shown in place of its description.
  reason?: string
}

// The right-side "Add a step" panel: search, grouped entries, arrow keys and Enter, or drag onto the canvas.
export function AddPanel(props: {
  title: string
  subtitle: string
  search: string
  foot: string
  close: string
  empty: (query: string) => string
  entries: PanelEntry[]
  onPick: (key: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = createSignal("")
  const [active, setActive] = createSignal(0)
  const prefix = createUniqueId()
  let panel!: HTMLElement
  let input!: HTMLInputElement
  let list!: HTMLDivElement
  // Where focus was when the panel opened: the "+" that opened it, or the canvas the keyboard shortcut was used on.
  const opener = document.activeElement
  const canvas = () => panel.closest<HTMLElement>(".wf-canvas") ?? undefined
  const optionID = (entry: PanelEntry) => `${prefix}-${entry.key}`
  const highlighted = () => {
    const entry = enabled()[active()]
    return entry ? optionID(entry) : undefined
  }
  const shown = createMemo(() => {
    const text = query().trim().toLowerCase()
    return props.entries.filter((entry) => !text || `${entry.label} ${entry.description}`.toLowerCase().includes(text))
  })
  const enabled = () => shown().filter((entry) => !entry.disabled)
  onMount(() => input.focus())
  // Closing the panel hands focus back instead of dropping it on the page, unless it already went somewhere else.
  onCleanup(() => {
    const focused = document.activeElement
    if (focused && focused !== document.body && !panel.contains(focused)) return
    const home = opener instanceof HTMLElement && opener.isConnected && opener !== document.body ? opener : canvas()
    home?.focus({ preventScroll: true })
  })
  // The step this makes opens its details; focus is on the canvas by then, which is where closing them returns.
  const pick = (key: string) => {
    canvas()?.focus({ preventScroll: true })
    props.onPick(key)
  }
  // Arrow keys move the highlight; keep it inside the scrolled list.
  createEffect(() => {
    const key = enabled()[active()]?.key
    if (!key) return
    list.querySelector<HTMLElement>(`[data-entry="${key}"]`)?.scrollIntoView?.({ block: "nearest" })
  })
  return (
    <aside
      ref={panel}
      class="wf-drawer"
      aria-label={props.title}
      data-component="relay-add-panel"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div class="wf-drawer-head">
        <div>
          <h2>{props.title}</h2>
          <p>{props.subtitle}</p>
        </div>
        <button type="button" class="mx-btn icon" aria-label={props.close} title={props.close} onClick={props.onClose}>
          <Ic name="close" />
        </button>
      </div>
      <input
        ref={input}
        class="mx-search"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-autocomplete="list"
        placeholder={props.search}
        aria-label={props.search}
        aria-controls="wf-add-list"
        aria-activedescendant={highlighted()}
        value={query()}
        onInput={(event) => {
          setQuery(event.currentTarget.value)
          setActive(0)
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setActive(Math.min(enabled().length - 1, active() + 1))
          }
          if (event.key === "ArrowUp") {
            event.preventDefault()
            setActive(Math.max(0, active() - 1))
          }
          if (event.key === "Enter") {
            event.preventDefault()
            const entry = enabled()[active()]
            if (entry) pick(entry.key)
          }
        }}
      />
      <div ref={list} class="wf-drawer-list" id="wf-add-list" role="listbox" aria-label={props.title}>
        <Show when={shown().length} fallback={<p class="wf-col-empty">{props.empty(query())}</p>}>
          <For each={shown()}>
            {(entry, index) => (
              <>
                <Show when={index() === 0 || shown()[index() - 1].group !== entry.group}>
                  <div class="wf-drawer-group">{entry.group}</div>
                </Show>
                <button
                  type="button"
                  class="wf-pick"
                  role="option"
                  id={optionID(entry)}
                  data-entry={entry.key}
                  data-reason={entry.disabled && entry.reason ? "" : undefined}
                  aria-selected={!entry.disabled && enabled()[active()] === entry}
                  disabled={entry.disabled}
                  draggable={!entry.disabled}
                  onDragStart={(event) => event.dataTransfer?.setData("text/relay-kind", entry.key)}
                  onClick={() => pick(entry.key)}
                >
                  <span class={`wf-pick-tile k-${entry.tone}`}>
                    <NodeGlyph name={entry.glyph} />
                  </span>
                  <span>
                    <strong>{entry.label}</strong>
                    <small>{entry.disabled && entry.reason ? entry.reason : entry.description}</small>
                  </span>
                </button>
              </>
            )}
          </For>
        </Show>
      </div>
      <div class="wf-drawer-foot">{props.foot}</div>
    </aside>
  )
}
