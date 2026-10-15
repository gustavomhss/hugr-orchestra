import { afterEach, describe, expect, test } from "bun:test"
import { createAppDockOverlayWatch } from "./apps-panel-overlay"

const mounted: Element[] = []

afterEach(() => mounted.splice(0).forEach((element) => element.remove()))

describe("App Dock overlay watch", () => {
  test("a portal overlay over the Dock covers it until the portal closes", async () => {
    const dock = fixture()
    dock.watch.sync()
    expect(dock.changes).toEqual([false])

    // Like a Kobalte dialog: a zero-size portal container whose fixed-position overlay fills the window.
    const portal = mount(document.createElement("div"))
    portal.append(sized(document.createElement("div"), { x: 0, y: 0, width: 1400, height: 900 }))
    await dock.flush()
    expect(dock.changes).toEqual([false, true])

    portal.remove()
    await dock.flush()
    expect(dock.changes).toEqual([false, true, false])
  })

  test("overlays beside the Dock, an empty toast region and a tooltip leave it uncovered", async () => {
    const dock = fixture()
    dock.watch.sync()
    const menu = mount(document.createElement("div"))
    menu.append(sized(document.createElement("div"), { x: 0, y: 100, width: 200, height: 300 }))
    const toasts = mount(document.createElement("div"))
    toasts.append(document.createElement("ol"))
    const tooltip = mount(document.createElement("div"))
    const positioner = sized(document.createElement("div"), { x: 650, y: 120, width: 120, height: 30 })
    const content = document.createElement("div")
    content.setAttribute("role", "tooltip")
    positioner.append(content)
    tooltip.append(positioner)
    await dock.flush()
    expect(dock.changes).toEqual([false])
  })

  test("a popover positioned over the Dock after it mounts covers it", async () => {
    const dock = fixture()
    dock.watch.sync()
    const area = { x: 0, y: 0, width: 160, height: 120 }
    const positioner = sized(document.createElement("div"), area)
    mount(document.createElement("div")).append(positioner)
    await dock.flush()
    expect(dock.changes).toEqual([false])

    // Floating UI places the positioner after mount by rewriting its style.
    Object.assign(area, { x: 700, y: 140 })
    positioner.style.transform = "translate(700px, 140px)"
    await dock.flush()
    expect(dock.changes).toEqual([false, true])
  })

  test("an overlay drawn inside the app tree covers the Dock only while registered", async () => {
    const dock = fixture()
    dock.watch.sync()
    const menu = sized(document.createElement("div"), { x: 520, y: 200, width: 180, height: 160 })
    dock.root.append(menu)
    await dock.flush()
    expect(dock.changes).toEqual([false])

    const release = dock.watch.register(menu)
    await dock.flush()
    expect(dock.changes).toEqual([false, true])
    release()
    menu.remove()
    await dock.flush()
    expect(dock.changes).toEqual([false, true, false])
  })
})

// The app root holds the Dock host at x 600..1200, y 100..600, like the Dock page beside the sidebar.
function fixture() {
  const frames = new Map<number, () => void>()
  const changes: boolean[] = []
  const root = mount(document.createElement("div"))
  const host = sized(document.createElement("div"), { x: 600, y: 100, width: 600, height: 500 })
  root.append(host)
  const watch = createAppDockOverlayWatch({
    body: document.body,
    target: () => host,
    change: (covered) => changes.push(covered),
    requestAnimationFrame: (callback) => {
      const frame = frames.size + 1
      frames.set(frame, callback)
      return frame
    },
    cancelAnimationFrame: (frame) => frames.delete(frame),
  })
  return {
    root,
    changes,
    watch,
    async flush() {
      for (let index = 0; index < 5; index++) await new Promise((resolve) => setTimeout(resolve, 0))
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach((callback) => callback())
    },
  }
}

function mount<T extends Element>(element: T) {
  document.body.append(element)
  mounted.push(element)
  return element
}

// happy-dom has no layout, so each test element reports the box a browser would give it.
function sized<T extends Element>(element: T, area: { x: number; y: number; width: number; height: number }) {
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => new DOMRect(area.x, area.y, area.width, area.height),
  })
  return element
}
