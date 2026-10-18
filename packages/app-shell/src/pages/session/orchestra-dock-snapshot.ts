import { sameTab, tabLabel, type AppDockController, type TabIdentity } from "./apps-panel-controller"

/**
 * What the Activity card may know about this window's Dock: the profile and active tab identity,
 * its title and a coarse state. No URL, query, cookies or page content. The desktop's state event
 * carries no time, so the snapshot has none either.
 */
export type DockSnapshot = {
  /** Local UI correlation with the window's Dock profile; it grants nothing over IPC. */
  profile?: string
  tab?: TabIdentity
  title?: string
  state: "restoring" | "failed" | "no-tabs" | "ready" | "loading" | "crashed" | "navigation-error"
}

type DockState = Pick<AppDockController["state"], "status" | "profile" | "tabs" | "active" | "navigationError">

// Read from the controller's existing store, so the snapshot adds no Dock event subscriber.
export function dockSnapshot(state: DockState, available: boolean): DockSnapshot | undefined {
  if (!available || state.status === "idle") return undefined
  if (state.status === "loading") return { profile: state.profile, state: "restoring" }
  if (state.status === "failed") return { profile: state.profile, state: "failed" }
  const tab = state.tabs.find((item) => sameTab(item, state.active))
  if (!tab) return { profile: state.profile, state: "no-tabs" }
  const base = { profile: state.profile, tab: { tabID: tab.tabID, generation: tab.generation }, title: tabLabel(tab) }
  if (tab.crashed) return { ...base, state: "crashed" }
  if (sameTab(state.navigationError, tab)) return { ...base, state: "navigation-error" }
  return { ...base, state: tab.loading ? "loading" : "ready" }
}
