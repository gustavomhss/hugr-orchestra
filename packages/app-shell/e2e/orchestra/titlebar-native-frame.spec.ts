import { expect, test, type Page } from "@playwright/test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer, type ViteDevServer } from "vite"
import { nativeFrameViteConfig, type NativeFrameFixture } from "./titlebar-native-frame.fixture"

declare global {
  interface Window {
    nativeFrameFixture: NativeFrameFixture
  }
}

test.use({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1, serviceWorkers: "block" })
test.describe.configure({ mode: "default" })

let server: ViteDevServer
let cache: string
let url: string

test.beforeAll(async () => {
  cache = await mkdtemp(join(tmpdir(), "titlebar-native-frame-"))
  server = await createServer(nativeFrameViteConfig(cache))
  const http = server.httpServer
  if (!http) throw new Error("Native titlebar fixture server has no HTTP listener")
  // Vite's listen(0) falls back to 5173; its HTTP listener accepts an OS-assigned port.
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    http.once("error", onError)
    http.listen(0, "127.0.0.1", () => {
      http.removeListener("error", onError)
      resolve()
    })
  })
  const address = http.address()
  if (!address || typeof address === "string") throw new Error("Native titlebar fixture server has no TCP address")
  url = `http://127.0.0.1:${address.port}/`
})

test.afterAll(async () => {
  await server?.close()
  if (cache) await rm(cache, { recursive: true, force: true })
})

test.beforeEach(async ({ page }) => {
  await open(page)
})

test.afterEach(async ({ page }) => {
  expect(await page.pageErrors(), "fixture must not hide renderer failures").toEqual([])
})

async function open(page: Page, query = "") {
  const response = await page.goto(`${url}native-titlebar-fixture${query}`)
  expect(response, "fixture navigation must return a response").not.toBeNull()
  expect(response!.ok(), "fixture response must succeed").toBe(true)
  const header = page.getByRole("banner", { name: "Native titlebar fixture", exact: true })
  await expect(header).toHaveCount(1)
  await expect(header).toBeVisible()
  await expect.poll(() => page.evaluate(() => typeof window.nativeFrameFixture?.settled)).toBe("function")
  await settled(page)
  expect((await snapshot(page)).pending, "reporter work must complete before the next action").toBe(0)
}

function settled(page: Page) {
  return page.evaluate(() => window.nativeFrameFixture.settled())
}

function snapshot(page: Page) {
  return page.evaluate(() => window.nativeFrameFixture.snapshot())
}

async function update(page: Page, value: Parameters<NativeFrameFixture["update"]>[0]) {
  await page.evaluate((value) => window.nativeFrameFixture.update(value), value)
  await settled(page)
}

test("reports real header bounds and coalesces header, shell and window changes", async ({ page }) => {
  const first = await snapshot(page)
  expect(first.frames).toEqual([{ left: 13, top: 13, height: 45 }])
  expect(first.reads).toBeGreaterThan(0)
  expect(first.completed).toBeGreaterThan(0)
  expect(first.targets).toEqual(["header", "orchestra-shell"])
  await page.evaluate(() => {
    window.nativeFrameFixture.move(36.5, 20.25, 52)
    window.nativeFrameFixture.move(36.5, 20.25, 52)
    window.nativeFrameFixture.move(36.5, 20.25, 52)
  })
  await settled(page)
  expect((await snapshot(page)).frames).toEqual([
    { left: 13, top: 13, height: 45 },
    { left: 37.5, top: 21.25, height: 52 },
  ])
})

test("reactive zoom reads settled CSS geometry without converting to native points", async ({ page }) => {
  await update(page, { zoom: 0.75 })
  expect((await snapshot(page)).frames.at(-1)).toEqual({ left: 13, top: 13, height: 60 })
  await update(page, { zoom: 1.5 })
  expect((await snapshot(page)).frames.at(-1)).toEqual({ left: 13, top: 13, height: 45 })
  const before = await snapshot(page)
  await update(page, { zoom: 2 })
  const after = await snapshot(page)
  expect(after.reads).toBeGreaterThan(before.reads)
  expect(after.completed).toBeGreaterThan(before.completed)
  expect(after.frames).toEqual(before.frames)
})

test("clears and restores frames for fullscreen, legacy and the 768px desktop boundary", async ({ page }) => {
  await update(page, { fullscreen: true })
  expect((await snapshot(page)).frames.at(-1)).toBeNull()
  await update(page, { fullscreen: false })
  expect((await snapshot(page)).frames.at(-1)).toEqual({ left: 13, top: 13, height: 45 })
  await update(page, { newLayout: false })
  expect((await snapshot(page)).frames.at(-1)).toBeNull()
  await update(page, { newLayout: true })
  expect((await snapshot(page)).frames.at(-1)).toEqual({ left: 13, top: 13, height: 45 })
  await page.setViewportSize({ width: 767, height: 800 })
  await settled(page)
  expect((await snapshot(page)).frames.at(-1)).toBeNull()
  await page.setViewportSize({ width: 768, height: 800 })
  await settled(page)
  expect((await snapshot(page)).frames.at(-1)).toEqual({ left: 13, top: 13, height: 45 })
  await open(page, "?reject")
  await update(page, { fullscreen: true })
  expect((await snapshot(page)).frames).toEqual([{ left: 13, top: 13, height: 45 }, null])
})

test("keeps physical coordinates in RTL and skips frame machinery on unsupported platforms", async ({ page }) => {
  await page.evaluate(() => {
    document.documentElement.dir = "rtl"
  })
  await page.setViewportSize({ width: 1001, height: 800 })
  await settled(page)
  expect((await snapshot(page)).frames).toEqual([{ left: 13, top: 13, height: 45 }])
  for (const query of ["?platform=web", "?os=windows", "?os=linux", "?missing"]) {
    await open(page, query)
    expect(await snapshot(page)).toMatchObject({ frames: [], reads: 0, requests: 0, observers: 0, targets: [] })
  }
})

test("navigation child remains no-drag and outside physical macOS controls in both directions", async ({ page }) => {
  await open(page, "?navigation")
  const header = page.getByRole("banner", { name: "Native titlebar fixture", exact: true })
  for (const direction of ["ltr", "rtl"] as const) {
    for (const zoom of [1, 1.25, 2]) {
      await update(page, { direction, zoom })
      await expect(page.locator("html")).toHaveAttribute("dir", direction)
      const toggle = header.getByRole("button", { name: "Expand sidebar", exact: true })
      await expect(toggle).toBeVisible()
      await expect(toggle).toHaveCSS("-webkit-app-region", "no-drag")
      await expect(header).toHaveCSS("-webkit-app-region", "drag")
      const frame = await header.boundingBox()
      expect(frame).not.toBeNull()
      const bounds = await toggle.boundingBox()
      expect(bounds).not.toBeNull()
      const padding = await header.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft))
      expect(padding).toBeCloseTo(84 / zoom, 2)
      expect(bounds!.x).toBeGreaterThanOrEqual(frame!.x + padding - 1)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(frame!.x + frame!.width)
      expect(
        await toggle.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
        }),
      ).toBe(true)
      await toggle.focus()
      await page.keyboard.press("Enter")
      const collapse = header.getByRole("button", { name: "Collapse sidebar", exact: true })
      await expect(collapse).toBeFocused()
      await expect(collapse).toHaveAttribute("aria-expanded", "true")
      expect(await header.boundingBox()).toEqual(frame)
      await collapse.click()
      await expect(toggle).toHaveAttribute("aria-expanded", "false")
      await settled(page)
      expect((await snapshot(page)).frames).toEqual([{ left: 13, top: 13, height: 45 }])
    }
  }
})

test("chat text streaming does not request geometry; unchanged window geometry does not resend", async ({ page }) => {
  const before = await snapshot(page)
  expect(before.frames).toEqual([{ left: 13, top: 13, height: 45 }])
  await page.evaluate(() => window.nativeFrameFixture.stream())
  const stream = page.getByRole("main", { name: "Chat stream fixture", exact: true })
  await expect(stream).toHaveCount(1)
  await expect(stream).toHaveText("token ".repeat(200).trim())
  expect(await snapshot(page)).toEqual(before)
  await page.evaluate(() => window.dispatchEvent(new Event("resize")))
  await settled(page)
  const after = await snapshot(page)
  expect(after.reads).toBeGreaterThan(before.reads)
  expect(after.frames).toEqual(before.frames)
})

test("cleanup cancels pending RAF, disconnects observers and blocks late IPC", async ({ page }) => {
  const before = await snapshot(page)
  expect(before.frames).toEqual([{ left: 13, top: 13, height: 45 }])
  await page.evaluate(() => window.nativeFrameFixture.dispose())
  const disposed = await snapshot(page)
  expect(disposed.frames).toEqual([...before.frames, null])
  expect(disposed.cancelled).toBeGreaterThan(before.cancelled)
  expect(disposed.disconnected).toBe(1)
  expect(disposed.pending).toBe(0)
  expect(disposed.reads).toBe(before.reads)
  await page.evaluate(() => window.nativeFrameFixture.late())
  expect(await snapshot(page)).toEqual(disposed)
})

test("hidden connected header clears native frame and restores measured placement", async ({ page }) => {
  const frame = { left: 13, top: 13, height: 45 }
  const header = page.getByRole("banner", { name: "Native titlebar fixture", exact: true, includeHidden: true })
  await expect(header).toHaveCount(1)
  expect((await snapshot(page)).frames).toEqual([frame])
  await header.evaluate((element) => {
    ;(element as HTMLElement).style.display = "none"
  })
  await settled(page)
  await expect(header).toBeHidden()
  expect(
    await header.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { connected: element.isConnected, width: rect.width, height: rect.height }
    }),
  ).toEqual({ connected: true, width: 0, height: 0 })
  expect((await snapshot(page)).frames).toEqual([frame, null])
  await header.evaluate((element) => {
    ;(element as HTMLElement).style.removeProperty("display")
  })
  await settled(page)
  await expect(header).toBeVisible()
  expect((await snapshot(page)).frames).toEqual([frame, null, frame])
  expect((await snapshot(page)).pending).toBe(0)
})
