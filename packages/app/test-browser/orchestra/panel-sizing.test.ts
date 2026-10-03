import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import type { Platform } from "@/context/platform"
import type { ServerScope } from "@/utils/server-scope"
let createOrchestraPanelSizing: typeof import("@/orchestra/panel-sizing").createOrchestraPanelSizing

const browser = window as unknown as { happyDOM: { setWindowSize: (size: { width: number }) => void } }
const owners: (() => void)[] = []
const platform = {
  platform: "web",
  openExternal: () => {},
  restart: async () => {},
  notify: async () => {},
} satisfies Platform

beforeAll(async () => {
  // Bun cannot compile the context provider's JSX. The real persistence path
  // must use the explicit platform instead of consulting that provider.
  mock.module("@/context/platform", () => ({
    usePlatform: () => {
      throw new Error("Panel sizing must use the explicit platform")
    },
  }))
  const panel = await import("@/orchestra/panel-sizing")
  createOrchestraPanelSizing = panel.createOrchestraPanelSizing
})

beforeEach(() => browser.happyDOM.setWindowSize({ width: 1400 }))
afterEach(() => {
  owners.splice(0).forEach((dispose) => dispose())
  browser.happyDOM.setWindowSize({ width: 1024 })
})

function createFixture(scope = `panel-sizing-test-${crypto.randomUUID()}` as ServerScope) {
  return createRoot((dispose) => {
    owners.push(dispose)
    const [state, setState] = createStore({
      newSessionDesign: true,
      isDesktop: true,
      reviewOpen: true,
      sidePanelOpen: true,
      resizeOpen: true,
      splitReview: false,
      rowWidth: 1506 as number | undefined,
      width: 600,
      fileTreeWidth: 180,
    })
    const sizing = createOrchestraPanelSizing({
      scope,
      platform,
      newSessionDesign: () => state.newSessionDesign,
      isDesktop: () => state.isDesktop,
      reviewOpen: () => state.reviewOpen,
      sidePanelOpen: () => state.sidePanelOpen,
      resizeOpen: () => state.resizeOpen,
      splitReview: () => state.splitReview,
      rowWidth: () => state.rowWidth,
      width: () => state.width,
      fileTreeWidth: () => state.fileTreeWidth,
      resize: (width) => setState("width", width),
    })
    return { sizing, state, setState, scope, dispose }
  })
}

describe("createOrchestraPanelSizing", () => {
  test("keeps the stored first-frame width until the row is measured", () => {
    const fixture = createFixture()
    fixture.setState({ rowWidth: undefined, width: 1600 })
    expect(fixture.sizing.max()).toBe(1000)
    expect(fixture.sizing.resizedWidth()).toBe(1600)
    expect(fixture.sizing.width()).toBe("1600px")
    expect(fixture.state.width).toBe(1600)
  })

  test("reserves a 430px review rail after the 6px gap and holds the 450px chat minimum", () => {
    const fixture = createFixture()
    expect(fixture.sizing.desktop()).toBe(true)
    expect(fixture.sizing.max()).toBe(1070)
    expect(fixture.sizing.width()).toBe("1070px")
    fixture.setState("rowWidth", 886)
    expect(fixture.sizing.max()).toBe(450)
    expect(fixture.sizing.width()).toBe("450px")
    fixture.setState("rowWidth", 1506)
    expect(fixture.sizing.width()).toBe("1070px")
    expect(fixture.state.width).toBe(600)
  })

  test("switches the review rail between 360px and 430px at the live 1180px media boundary", () => {
    browser.happyDOM.setWindowSize({ width: 1180 })
    const fixture = createFixture()
    // Happy DOM initializes listener history to false, even for a matching query.
    window.dispatchEvent(new Event("resize"))
    fixture.setState("rowWidth", 1186)
    expect(fixture.sizing.max()).toBe(820)
    expect(fixture.sizing.width()).toBe("820px")
    browser.happyDOM.setWindowSize({ width: 1181 })
    expect(fixture.sizing.max()).toBe(750)
    expect(fixture.sizing.width()).toBe("750px")
    browser.happyDOM.setWindowSize({ width: 1180 })
    expect(fixture.sizing.width()).toBe("820px")
  })

  test("preserves custom stored widths and clamps only the rendered width", () => {
    const fixture = createFixture()
    fixture.setState("width", 820)
    expect(fixture.sizing.width()).toBe("820px")
    fixture.setState("rowWidth", 1006)
    expect(fixture.sizing.width()).toBe("570px")
    expect(fixture.state.width).toBe(820)
    fixture.setState("rowWidth", 1506)
    expect(fixture.sizing.width()).toBe("820px")
    fixture.setState("width", 300)
    expect(fixture.sizing.width()).toBe("450px")
    expect(fixture.state.width).toBe(300)
  })

  test("persists explicit 600px intent across shrink, grow, and remount, isolated by server", () => {
    const fixture = createFixture()
    expect(fixture.sizing.width()).toBe("1070px")
    fixture.sizing.resize(600)
    expect(fixture.sizing.width()).toBe("600px")
    expect(localStorage.getItem(`opencode.global.dat:${fixture.scope}\0orchestra-session-panel`)).toBe(
      '{"resized":true}',
    )
    fixture.setState("rowWidth", 806)
    expect(fixture.sizing.width()).toBe("450px")
    expect(fixture.state.width).toBe(600)
    fixture.setState("rowWidth", 1506)
    expect(fixture.sizing.width()).toBe("600px")
    fixture.dispose()
    expect(createFixture(fixture.scope).sizing.width()).toBe("600px")
    expect(createFixture().sizing.width()).toBe("1070px")
  })

  test("does not mark terminal-only or legacy resizing as an explicit Orchestra review choice", () => {
    const fixture = createFixture()
    fixture.setState("reviewOpen", false)
    fixture.sizing.resize(600)
    expect(fixture.state.width).toBe(600)
    fixture.setState("reviewOpen", true)
    expect(fixture.sizing.width()).toBe("1070px")
  })

  test("admits full width without side panels and reserves the Orchestra file-tree minimum", () => {
    const fixture = createFixture()
    fixture.setState("sidePanelOpen", false)
    expect(fixture.sizing.width()).toBe("100%")
    fixture.setState({ sidePanelOpen: true, resizeOpen: false, reviewOpen: false })
    expect(fixture.sizing.width()).toBe("calc(100% - 246px)")
    fixture.setState("fileTreeWidth", 420)
    expect(fixture.sizing.width()).toBe("calc(100% - 426px)")
    fixture.setState("newSessionDesign", false)
    expect(fixture.sizing.desktop()).toBe(false)
    expect(fixture.sizing.width()).toBe("calc(100% - 420px)")
    fixture.setState({ newSessionDesign: true, isDesktop: false, fileTreeWidth: 180 })
    expect(fixture.sizing.desktop()).toBe(false)
    expect(fixture.sizing.width()).toBe("calc(100% - 180px)")
  })

  test("uses the existing unified and split clamps outside Orchestra review, retaining each layout gap", () => {
    const fixture = createFixture()
    fixture.setState({ newSessionDesign: false, reviewOpen: false, width: 1600, rowWidth: 1700 })
    expect(fixture.sizing.max()).toBe(1220)
    expect(fixture.sizing.width()).toBe("1220px")
    fixture.setState("splitReview", true)
    expect(fixture.sizing.max()).toBe(900)
    expect(fixture.sizing.width()).toBe("900px")
    fixture.setState("newSessionDesign", true)
    expect(fixture.sizing.max()).toBe(894)
    expect(fixture.sizing.width()).toBe("894px")
    fixture.setState("isDesktop", false)
    expect(fixture.sizing.max()).toBe(892)
    expect(fixture.sizing.width()).toBe("892px")
    fixture.setState("width", 300)
    expect(fixture.sizing.width()).toBe("300px")
  })
})
