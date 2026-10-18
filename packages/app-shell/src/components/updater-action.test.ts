import { describe, expect, test } from "bun:test"
import { updaterAction, updaterVisible } from "./updater-action"

describe("updaterAction", () => {
  test("disables update actions when the platform has no updater", () => {
    expect(updaterAction(undefined)).toEqual({ label: "settings.updates.action.checkNow" })
  })

  test("projects updater transitions into one settings action", () => {
    expect(updaterAction({ status: "idle" })).toEqual({
      label: "settings.updates.action.checkNow",
      run: "check",
    })
    expect(updaterAction({ status: "checking" })).toEqual({ label: "settings.updates.action.checking" })
    expect(updaterAction({ status: "downloading", version: "2.0.0" })).toEqual({
      label: "settings.updates.action.downloading",
    })
    expect(updaterAction({ status: "ready", version: "2.0.0" })).toEqual({
      label: "toast.update.action.installRestart",
      run: "install",
    })
    expect(updaterAction({ status: "installing", version: "2.0.0" })).toEqual({
      label: "settings.updates.action.installing",
    })
  })

  test("shows download progress, the release page of an update it cannot install, and a retry after a failure", () => {
    expect(updaterAction({ status: "downloading", version: "2.0.0", percent: 42 })).toEqual({
      label: "orchestra.settings.general.updates.downloading",
      params: { percent: 42 },
    })
    expect(updaterAction({ status: "available", version: "2.0.0", url: "https://example.test/desktop-v2.0.0" })).toEqual({
      label: "orchestra.settings.general.updates.download",
      run: "download",
      description: "orchestra.settings.general.updates.available",
      params: { version: "2.0.0" },
    })
    expect(updaterAction({ status: "error", message: "offline" })).toEqual({
      label: "orchestra.settings.general.updates.retry",
      run: "check",
      description: "orchestra.settings.general.updates.failed",
    })
  })

  test("hides update controls in builds without a feed", () => {
    expect(updaterVisible(undefined)).toBe(false)
    expect(updaterVisible({ status: "disabled" })).toBe(false)
    expect(updaterVisible({ status: "idle" })).toBe(true)
  })
})
