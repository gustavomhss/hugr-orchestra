import { createMemo, createSignal, For, onMount, Show } from "solid-js"
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
  let input!: HTMLInputElement
  const shown = createMemo(() => {
    const text = query().trim().toLowerCase()
    return props.entries.filter((entry) => !text || `${entry.label} ${entry.description}`.toLowerCase().includes(text))
  })
  const enabled = () => shown().filter((entry) => !entry.disabled)
  onMount(() => input.focus())
  return (
    <aside
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
        placeholder={props.search}
        aria-label={props.search}
        aria-controls="wf-add-list"
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
            if (entry) props.onPick(entry.key)
          }
        }}
      />
      <div class="wf-drawer-list" id="wf-add-list" role="listbox" aria-label={props.title}>
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
                  data-entry={entry.key}
                  aria-selected={!entry.disabled && enabled()[active()] === entry}
                  disabled={entry.disabled}
                  draggable={!entry.disabled}
                  onDragStart={(event) => event.dataTransfer?.setData("text/relay-kind", entry.key)}
                  onClick={() => props.onPick(entry.key)}
                >
                  <span class={`wf-pick-tile k-${entry.tone}`}>
                    <NodeGlyph name={entry.glyph} />
                  </span>
                  <span>
                    <strong>{entry.label}</strong>
                    <small>{entry.description}</small>
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
