import type { JSX } from "solid-js"

const keys = ["ArrowLeft", "ArrowRight", "Home", "End"]

// Which tab a key moves to, or undefined when the key is not a tab key. Arrow keys wrap and follow the writing
// direction: in right-to-left text the right arrow moves to the previous tab.
export function nextTabIndex(input: { key: string; index: number; count: number; rtl: boolean }) {
  if (input.count < 1 || !keys.includes(input.key)) return undefined
  if (input.key === "Home") return 0
  if (input.key === "End") return input.count - 1
  const forward = (input.key === "ArrowRight") !== input.rtl
  return (input.index + (forward ? 1 : -1) + input.count) % input.count
}

// WAI-ARIA tabs with automatic activation: set this on the `role="tablist"` element and give each tab
// `tabindex={selected ? 0 : -1}` so the list is one tab stop and the arrow keys move between its tabs.
export const tabKeydown: JSX.EventHandler<HTMLElement, KeyboardEvent> = (event) => {
  const current = event.target
  if (!(current instanceof HTMLButtonElement) || current.getAttribute("role") !== "tab") return
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
  const index = nextTabIndex({ key: event.key, index: tabs.indexOf(current), count: tabs.length, rtl: current.matches(":dir(rtl)") })
  if (index === undefined) return
  event.preventDefault()
  tabs[index]?.focus()
  tabs[index]?.click()
}
