import { describe, expect, test } from "bun:test"
import { appDockAttached, appDockShown, appDockURL, appDockZoom, panelBoundsToContent } from "./app-dock-utils"

describe("App Dock input", () => {
  test("converts CSS bounds to content bounds", () => {
    expect(panelBoundsToContent({ x: 300, y: 80, width: 600, height: 900 }, 2)).toEqual({
      x: 150,
      y: 40,
      width: 300,
      height: 450,
    })
  })

  test("rejects invalid bounds and zoom", () => {
    expect(() => panelBoundsToContent({ x: 0, y: 0, width: 0, height: 20 }, 1)).toThrow("Invalid App Dock bounds")
    expect(() => panelBoundsToContent({ x: 0, y: 0, width: 20, height: 20 }, 0)).toThrow("Invalid App Dock bounds")
  })

  test("accepts HTTPS and rejects privileged protocols", () => {
    expect(appDockURL("https://example.com/path")).toBe("https://example.com/path")
    expect(appDockURL("  youtube.com  ")).toBe("https://youtube.com/")
    expect(appDockURL("open source browser")).toBe("https://www.google.com/search?q=open%20source%20browser")
    expect(appDockURL("orchestra")).toBe("https://www.google.com/search?q=orchestra")
    expect(() => appDockURL(" ")).toThrow("App Dock address is required")
    expect(() => appDockURL("file:///etc/passwd")).toThrow("App Dock only supports HTTPS URLs")
    expect(() => appDockURL("javascript:alert(1)")).toThrow("App Dock only supports HTTPS URLs")
  })

  test("clamps browser zoom to safe range", () => {
    expect(appDockZoom(0.1)).toBe(0.5)
    expect(appDockZoom(4)).toBe(3)
    expect(appDockZoom(1.2)).toBe(1.2)
    expect(() => appDockZoom(Number.NaN)).toThrow("Invalid App Dock zoom")
  })
})

describe("App Dock attachment", () => {
  // A window's tabs as the desktop keeps them: "a" was recovered in place, so its first generation is gone.
  const tabs = new Map([
    ["a", { generation: 3 }],
    ["b", { generation: 2 }],
  ])

  test("Resize and Hide reach only the attached tab at the generation they name", () => {
    expect(appDockAttached(tabs, "a", { tabID: "a", generation: 3 })).toBe(tabs.get("a")!)
    // Another tab of the window, the attached tab's earlier generation, a closed tab.
    expect(appDockAttached(tabs, "a", { tabID: "b", generation: 2 })).toBeUndefined()
    expect(appDockAttached(tabs, "a", { tabID: "a", generation: 1 })).toBeUndefined()
    expect(appDockAttached(tabs, "c", { tabID: "c", generation: 4 })).toBeUndefined()
    // A hidden Dock has no attached tab, and another window keeps its own tabs.
    expect(appDockAttached(tabs, undefined, { tabID: "a", generation: 3 })).toBeUndefined()
    expect(appDockAttached(undefined, "a", { tabID: "a", generation: 3 })).toBeUndefined()
  })

  test("Show attaches any open tab but ignores an earlier generation of a recovered one", () => {
    expect(appDockShown(tabs, { tabID: "b", generation: 2 })).toBe(tabs.get("b")!)
    expect(appDockShown(tabs, { tabID: "a", generation: 1 })).toBeUndefined()
    expect(() => appDockShown(tabs, { tabID: "c", generation: 4 })).toThrow("Unknown App Dock tab")
    expect(() => appDockShown(undefined, { tabID: "a", generation: 3 })).toThrow("Unknown App Dock tab")
  })
})
