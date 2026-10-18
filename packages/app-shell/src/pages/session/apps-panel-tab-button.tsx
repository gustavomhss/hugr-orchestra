import { useLanguage } from "@/context/language"
import { isLinux, sameTab, tabLabel, type Tab, type TabIdentity } from "./apps-panel-controller"

// The page area is one panel shared by whichever tab is active.
export const tabPanelID = "zen-browser-panel"
export const tabButtonID = (tab: TabIdentity) => `zen-tab-${tab.tabID}-${tab.generation}`

type MenuRequest = { tab: Tab; x: number; y: number; rtl: boolean; invoker: HTMLButtonElement }

// Only tabs belong to the tablist; the section label and the new-tab button sit beside it, and `contents`
// keeps the tabs laid out as direct items of the column.
export function TabStrip(props: {
  tabs: Tab[]
  active: () => TabIdentity | undefined
  hidden: boolean
  disabled: boolean
  select: (tab: Tab) => void
  setMenu: (menu: MenuRequest) => void
  onNewTab: () => void
}) {
  const t = useLanguage().t
  const browser = () => props.tabs.filter((tab) => !isLinux(tab.url))
  const pinned = () => browser().filter((tab) => tab.pinned)
  return (
    <div class="zen-tabs" hidden={props.hidden}>
      {pinned().length > 0 && <div class="zen-tab-section-label">{t("appDock.browser.pinned")}</div>}
      <div role="tablist" aria-label={t("appDock.browser.tabs")} style={{ display: "contents" }}>
        {[...pinned(), ...browser().filter((tab) => !tab.pinned)].map((tab) => (
          <TabButton tab={tab} active={props.active} select={props.select} setMenu={props.setMenu} />
        ))}
      </div>
      <button class="zen-new-tab" type="button" disabled={props.disabled} onClick={props.onNewTab}>
        {t("appDock.browser.newTab")}
      </button>
    </div>
  )
}

export function TabButton(props: {
  tab: Tab
  active: () => TabIdentity | undefined
  select: (tab: Tab) => void
  setMenu: (menu: MenuRequest) => void
}) {
  const t = useLanguage().t
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
      id={tabButtonID(props.tab)}
      role="tab"
      aria-haspopup="menu"
      aria-controls={tabPanelID}
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
          tabLabel(props.tab).slice(0, 1).toUpperCase()
        )}
      </span>
      <bdi dir="auto" class="zen-tab-title">
        {tabLabel(props.tab)}
      </bdi>
      {props.tab.pinned && <span class="zen-tab-pinmark">{t("appDock.browser.pinned")}</span>}
      {props.tab.audible && <span class="zen-tab-audio">&#9835;</span>}
    </button>
  )
}
