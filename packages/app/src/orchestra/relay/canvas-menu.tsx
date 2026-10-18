import { For, onCleanup, onMount } from "solid-js"
import { popupAt } from "./geometry"
import { swallowRepeats } from "./ui"

export type NodeMenuItem = { label: string; title?: string; danger?: boolean; disabled?: boolean; run: () => void }

// The right-click menu of a node. A press outside or Escape closes it; Escape stops here so the layer below stays
// open. `onClose(true)` asks the canvas to take focus back. It opens at the pointer, flips above it when there is no
// room below, and closes when focus moves out of it.
export function NodeMenu(props: {
  label: string
  x: number
  y: number
  area: { w: number; h: number }
  items: NodeMenuItem[]
  onClose: (focus?: boolean) => void
}) {
  let menu!: HTMLDivElement
  onMount(() => {
    const box = menu.getBoundingClientRect()
    const at = popupAt({ x: props.x, top: props.y, bottom: props.y }, { w: box.width, h: box.height }, props.area, 0)
    menu.style.left = `${at.x}px`
    menu.style.top = `${at.y}px`
    const press = (event: PointerEvent) => {
      if (event.target instanceof Node && menu.contains(event.target)) return
      props.onClose()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopImmediatePropagation()
      props.onClose(true)
    }
    document.addEventListener("pointerdown", press, true)
    window.addEventListener("keydown", key, true)
    queueMicrotask(() => menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus())
    onCleanup(() => {
      document.removeEventListener("pointerdown", press, true)
      window.removeEventListener("keydown", key, true)
    })
  })
  return (
    <div
      ref={menu}
      class="wf-ctx"
      role="menu"
      aria-label={props.label}
      style={{ left: `${props.x}px`, top: `${props.y}px` }}
      onKeyDown={(event) => {
        // The editor's own keys (Enter opens the selected node) must not act on a focused menu item.
        event.stopPropagation()
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
        event.preventDefault()
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
        const current = items.findIndex((item) => item === document.activeElement)
        items.at((current + (event.key === "ArrowDown" ? 1 : -1)) % items.length)?.focus()
      }}
      onFocusOut={(event) => {
        const to = event.relatedTarget
        if (to instanceof Node && !menu.contains(to)) props.onClose()
      }}
    >
      <For each={props.items}>
        {(item) => (
          <button
            type="button"
            role="menuitem"
            class={item.danger ? "danger" : ""}
            title={item.title}
            disabled={item.disabled}
            onClick={() => {
              swallowRepeats()
              props.onClose(true)
              item.run()
            }}
          >
            {item.label}
          </button>
        )}
      </For>
    </div>
  )
}
