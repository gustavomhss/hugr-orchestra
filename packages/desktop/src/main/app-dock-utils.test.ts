import { describe, expect, test } from "bun:test"
import { appDockURL, appDockZoom, panelBoundsToContent } from "./app-dock-utils"

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
    expect(appDockURL("opencode")).toBe("https://www.google.com/search?q=opencode")
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
