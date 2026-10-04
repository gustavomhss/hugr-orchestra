import { createEffect, createSignal } from "solid-js"
import { Portal } from "solid-js/web"
import { tabLabel, type Tab } from "./apps-panel-controller"

// The menu opens with its inline-start corner at (x, y) in the viewport, flipped across that point on an
// axis where it would leave the window and then clamped inside it. It is portaled because the side
// panel's tab panels use `contain: strict`, which makes them the containing block of a fixed descendant:
// drawn in place, the menu lands offset by the panel's origin, clipped, and focusing it scrolls the panel.
// The portal's container is a child of the body, where the Dock's overlay watch already sees it and
// hides the native browser under it.
export function TabMenu(props: {
  tab: Tab
  x: number
  y: number
  rtl: boolean
  setElement: (element: HTMLDivElement) => void
  onDismiss: () => void
  canDuplicate: boolean
  canReload: boolean
  canClose: boolean
  hasOthers: boolean
  hasRight: boolean
  onDuplicate: () => void
  onTogglePin: () => void
  onReload: () => void
  onClose: () => void
  onCloseOthers: () => void
  onCloseRight: () => void
}) {
  let menu: HTMLDivElement | undefined
  let firstItem: HTMLButtonElement | undefined
  const [place, setPlace] = createSignal<{ left: string; top: string }>()
  // Measured at the window's origin, where nothing narrows it, and placed before it paints.
  createEffect(() => {
    const box = menu!.getBoundingClientRect()
    const viewport = document.documentElement
    setPlace({
      left: `${fit(props.rtl ? props.x - box.width : props.x, box.width, viewport.clientWidth, props.x)}px`,
      top: `${fit(props.y, box.height, viewport.clientHeight, props.y)}px`,
    })
  })
  return (
    <Portal>
      <div
        ref={(element) => {
          menu = element
          props.setElement(element)
        }}
        class="zen-tab-menu"
        role="menu"
        aria-label={`Actions for ${tabLabel(props.tab)}`}
        style={place() ?? { left: "0px", top: "0px", visibility: "hidden" }}
        onKeyDown={(event) => {
          // At the end of the body, Tab would carry focus to the document's ends: it returns to the tab.
          if (event.key === "Tab") {
            event.preventDefault()
            props.onDismiss()
            return
          }
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)")]
          const index = items.findIndex((item) => item === document.activeElement)
          const steps: Record<string, number> = {
            ArrowDown: index + 1,
            ArrowUp: index - 1,
            Home: 0,
            End: items.length - 1,
          }
          const next = steps[event.key]
          if (next === undefined) return
          event.preventDefault()
          items[(next + items.length) % items.length]?.focus()
        }}
      >
        <button
          ref={(element) => {
            firstItem = element
            requestAnimationFrame(() => firstItem?.focus())
          }}
          type="button"
          role="menuitem"
          disabled={!props.canDuplicate}
          onClick={props.onDuplicate}
        >
          Duplicate
        </button>
        <button type="button" role="menuitem" onClick={props.onTogglePin}>
          {props.tab.pinned ? "Unpin" : "Pin"}
        </button>
        <button type="button" role="menuitem" disabled={!props.canReload} onClick={props.onReload}>
          Reload
        </button>
        <button type="button" role="menuitem" disabled={!props.canClose} onClick={props.onClose}>
          Close
        </button>
        <button type="button" role="menuitem" disabled={!props.hasOthers} onClick={props.onCloseOthers}>
          Close others
        </button>
        <button type="button" role="menuitem" disabled={!props.hasRight} onClick={props.onCloseRight}>
          Close right
        </button>
      </div>
    </Portal>
  )
}

// One axis of the menu: from `start`, or flipped to end at the anchor when it would pass the window's
// far edge (or to start at it when it would pass the near one), then clamped inside the window.
function fit(start: number, size: number, limit: number, anchor: number) {
  const flipped = start < 0 ? anchor : start + size > limit ? anchor - size : start
  return Math.max(0, Math.min(flipped, limit - size))
}
