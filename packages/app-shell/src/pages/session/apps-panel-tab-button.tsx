import { sameTab, tabLabel, type Tab, type TabIdentity } from "./apps-panel-controller"

export function TabButton(props: {
  tab: Tab
  active: () => TabIdentity | undefined
  select: (tab: Tab) => void
  setMenu: (menu: { tab: Tab; x: number; y: number; rtl: boolean; invoker: HTMLButtonElement }) => void
}) {
  const openMenu = (x: number, y: number, invoker: HTMLButtonElement) =>
    props.setMenu({ tab: props.tab, x, y, rtl: getComputedStyle(invoker).direction === "rtl", invoker })
  const keydown = (event: KeyboardEvent) => {
    const current = event.currentTarget
    if (!(current instanceof HTMLButtonElement)) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      props.select(props.tab)
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault()
      const rect = current.getBoundingClientRect()
      openMenu(getComputedStyle(current).direction === "rtl" ? rect.right - 8 : rect.left + 8, rect.bottom + 4, current)
    } else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const tabs = [...(current.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']") ?? [])]
      const index = tabs.indexOf(current)
      if (index < 0) return
      const next =
        event.key === "Home"
          ? tabs[0]
          : event.key === "End"
            ? tabs.at(-1)
            : tabs[
                (index +
                  (event.key === (getComputedStyle(current).direction === "rtl" ? "ArrowLeft" : "ArrowRight")
                    ? 1
                    : -1) +
                  tabs.length) %
                  tabs.length
              ]
      event.preventDefault()
      next?.focus()
      next?.click()
    }
  }
  return (
    <button
      class={`zen-tab ${sameTab(props.active(), props.tab) ? "is-active" : ""} ${props.tab.crashed ? "is-crashed" : ""}`}
      type="button"
      role="tab"
      tabindex={sameTab(props.active(), props.tab) ? 0 : -1}
      aria-selected={sameTab(props.active(), props.tab)}
      onClick={() => props.select(props.tab)}
      onContextMenu={(event) => {
        event.preventDefault()
        openMenu(event.clientX, event.clientY, event.currentTarget)
      }}
      onKeyDown={keydown}
    >
      <span class={`zen-tab-icon ${props.tab.loading ? "is-loading" : ""}`}>
        {props.tab.favicon ? (
          <img src={props.tab.favicon} alt="" />
        ) : (
          new URL(props.tab.url).hostname.slice(0, 1).toUpperCase()
        )}
      </span>
      <bdi dir="auto" class="zen-tab-title">
        {tabLabel(props.tab)}
      </bdi>
      {props.tab.pinned && <span class="zen-tab-pinmark">Pinned</span>}
      {props.tab.audible && <span class="zen-tab-audio">&#9835;</span>}
    </button>
  )
}
