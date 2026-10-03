import { createStore, produce } from "solid-js/store"
import type { DockPane } from "./orchestra-dock"

export type CockpitView = {
  pane: DockPane
  /** Last file read in the Files pane. */
  file?: string
  /** Last document read in the Docs pane. */
  doc?: string
  tasks: boolean
  activity: boolean
  activityAgents: boolean
}

const initial: CockpitView = { pane: "browser", tasks: false, activity: false, activityAgents: false }

// Presentation state of each session's cockpit, keyed by the server-qualified session key: the pane
// on top, the last file and document read there and which cards are expanded. It lasts as long as
// the window and holds no data of its own; commands and the cockpit both read and write it here.
const [views, setViews] = createStore<Record<string, CockpitView>>({})
const recent = new Set<string>()

export function cockpitView(key: string) {
  return views[key] ?? initial
}

export function updateCockpitView(key: string, patch: Partial<CockpitView>) {
  recent.delete(key)
  recent.add(key)
  setViews(
    produce((views) => {
      views[key] = { ...(views[key] ?? initial), ...patch }
      if (recent.size <= 32) return
      const oldest = recent.values().next().value!
      recent.delete(oldest)
      delete views[oldest]
    }),
  )
}
