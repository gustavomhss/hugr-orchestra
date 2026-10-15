import { describe, expect, test } from "bun:test"
import type { Tab } from "./apps-panel-controller"
import { dockSnapshot } from "./orchestra-dock-snapshot"

const tab = (extra: Partial<Tab> = {}): Tab => ({
  tabID: "tab-1",
  generation: 3,
  url: "https://example.com/private?token=secret",
  title: "Example",
  ...extra,
})

const ready = (tabs: Tab[], extra = {}) => ({
  status: "ready" as const,
  profile: "repo-a",
  tabs,
  active: tabs[0] && { tabID: tabs[0].tabID, generation: tabs[0].generation },
  navigationError: undefined,
  ...extra,
})

describe("dockSnapshot", () => {
  test("nothing is observed without the desktop bridge or before a view attached", () => {
    expect(dockSnapshot(ready([tab()]), false)).toBeUndefined()
    expect(dockSnapshot({ ...ready([]), status: "idle" }, true)).toBeUndefined()
  })

  test("names the active tab and generation, never its URL", () => {
    const snapshot = dockSnapshot(ready([tab()]), true)
    expect(snapshot).toEqual({
      profile: "repo-a",
      tab: { tabID: "tab-1", generation: 3 },
      title: "Example",
      state: "ready",
    })
    expect(JSON.stringify(snapshot)).not.toContain("token")
    // A tab without a title falls back to its host name only.
    expect(dockSnapshot(ready([tab({ title: undefined })]), true)?.title).toBe("example.com")
  })

  test("reports loading, crash and navigation failure of the active tab only", () => {
    expect(dockSnapshot(ready([tab({ loading: true })]), true)?.state).toBe("loading")
    const crashed = tab({ crashed: { identity: { tabID: "tab-1", generation: 3 }, reason: "oom" } })
    expect(dockSnapshot(ready([crashed]), true)?.state).toBe("crashed")
    const failed = ready([tab()], { navigationError: { tabID: "tab-1", generation: 3, url: "https://example.com" } })
    expect(dockSnapshot(failed, true)?.state).toBe("navigation-error")
    // A failure recorded for an older generation of the same tab does not belong to it.
    const stale = ready([tab()], { navigationError: { tabID: "tab-1", generation: 2, url: "https://example.com" } })
    expect(dockSnapshot(stale, true)?.state).toBe("ready")
  })

  test("restoring, failed and empty Docks have no tab", () => {
    expect(dockSnapshot({ ...ready([]), status: "loading" }, true)).toEqual({ profile: "repo-a", state: "restoring" })
    expect(dockSnapshot({ ...ready([]), status: "failed" }, true)).toEqual({ profile: "repo-a", state: "failed" })
    expect(dockSnapshot(ready([]), true)).toEqual({ profile: "repo-a", state: "no-tabs" })
  })
})
