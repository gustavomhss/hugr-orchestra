import { describe, expect, test } from "bun:test"
import { AppDockLinuxDisplay } from "./app-dock-linux-display"

const fit = (width: number, height: number) => AppDockLinuxDisplay.fit({ width, height }, AppDockLinuxDisplay.minimum)

describe("Linux App Dock display floor", () => {
  test("keeps the display at the floor for thumbnail and hidden viewers", () => {
    // Observed 2026-10-06: the cockpit Dock card (372x94) became the X display size.
    expect(fit(372, 94)).toEqual({ width: 1024, height: 768, scale: 94 / 768 })
    expect(fit(1, 1)).toEqual({ width: 1024, height: 768, scale: 1 / 1024 })
    expect(fit(0, 0).scale).toBeGreaterThan(0)
  })

  test("scales a viewer below the floor instead of shrinking the display", () => {
    expect(fit(900, 700)).toEqual({ width: 1024, height: 768, scale: 900 / 1024 })
    expect(fit(512, 384)).toEqual({ width: 1024, height: 768, scale: 0.5 })
  })

  test("grows the display with a larger viewer", () => {
    expect(fit(1920, 1080)).toEqual({ width: 1920, height: 1080, scale: 1 })
    expect(fit(1600, 600)).toEqual({ width: 1600, height: 768, scale: 600 / 768 })
    expect(fit(800, 1200)).toEqual({ width: 1024, height: 1200, scale: 800 / 1024 })
  })

  test("serializes a self-contained page script", () => {
    // The page script embeds `fit` by source; it must compile and stay inert
    // on a page without the stock Xpra client.
    const run = new Function(AppDockLinuxDisplay.script)
    expect(run()).toBe(false)
    const embedded = new Function(`return (${AppDockLinuxDisplay.fit.toString()})`)()
    expect(embedded({ width: 372, height: 94 }, AppDockLinuxDisplay.minimum)).toEqual(fit(372, 94))
  })
})
