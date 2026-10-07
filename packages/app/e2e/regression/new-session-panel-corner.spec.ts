import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const draftID = "draft_new_session_panel_corner"
const directory = "C:/OpenCode/NewSessionPanelCorner"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`

test.use({ deviceScaleFactor: 1 })

test.describe("Orchestra layout", () => {
  test.use({ viewport: { width: 935, height: 522 } })

  for (const scheme of ["dark", "light"] as const) {
    test(`matches the rounded panel corners to the ${scheme} Orchestra backdrop`, async ({ page }, testInfo) => {
      const corners = await readPanelCorners(page, testInfo, scheme)
      // The glass panel is transparent outside its 9px radius: each corner must show the same workspace
      // backdrop as the gutter just outside it, never a differently coloured layer behind the panel.
      expect(
        corners.filter(
          (corner) =>
            corner.pixel[3] !== 255 ||
            corner.pixel.slice(0, 3).some((value, index) => Math.abs(value - corner.backdrop[index]) > 6),
        ),
      ).toEqual([])
    })
  }
})

test.describe("legacy layout", () => {
  test.use({ viewport: { width: 760, height: 522 } })

  test("matches the rounded panel corners to the dark new-session background", async ({ page }, testInfo) => {
    const corners = await readPanelCorners(page, testInfo, "dark")
    // The Orchestra palette also themes the legacy layout; its near-black is #080c11.
    expect(
      corners.filter(
        ({ pixel: [red, green, blue, alpha] }) => !(red <= 8 && green <= 12 && blue <= 17 && alpha === 255),
      ),
    ).toEqual([])
  })
})

async function readPanelCorners(page: Page, testInfo: TestInfo, scheme: "dark" | "light") {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "proj_new_session_panel_corner",
      worktree: directory,
      vcs: "git",
      name: "new-session-panel-corner",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: { all: [], connected: [], default: {} },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(
    ({ directory, draftID, server, scheme }) => {
      // The fixed tabs toast and its shadow sit next to the bottom-right panel corner.
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([{ type: "draft", draftID, server, directory }]),
      )
    },
    { directory, draftID, server, scheme },
  )

  await page.goto(`/new-session?draftId=${draftID}`)
  await expectAppVisible(page.locator('[data-component="prompt-input"]'))
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme)
  const panel = page.locator('main [data-component="session-new-design"]')
  await expect(panel).toHaveCount(1)
  const box = await panel.boundingBox()
  if (!box) throw new Error("New-session panel bounds are unavailable")

  const left = Math.floor(box.x)
  const top = Math.floor(box.y)
  const right = Math.ceil(box.x + box.width) - 1
  const bottom = Math.ceil(box.y + box.height) - 1
  const screenshot = await page.screenshot({ path: testInfo.outputPath(`new-session-${scheme}.png`) })
  return page.evaluate(
    async ({ source, corners }) => {
      const image = new Image()
      image.src = source
      await image.decode()
      const canvas = document.createElement("canvas")
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext("2d")
      if (!context) throw new Error("2D canvas is unavailable")
      context.drawImage(image, 0, 0)
      const read = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data)
      return corners.map((corner) => ({
        at: [corner.x, corner.y],
        pixel: read(corner.x, corner.y),
        backdrop: read(corner.x + corner.dx, corner.y + corner.dy),
      }))
    },
    {
      source: `data:image/png;base64,${screenshot.toString("base64")}`,
      // Two pixels diagonally outward stays inside the 6px Orchestra gutter.
      corners: [
        { x: left, y: top, dx: -2, dy: -2 },
        { x: right, y: top, dx: 2, dy: -2 },
        { x: left, y: bottom, dx: -2, dy: 2 },
        { x: right, y: bottom, dx: 2, dy: 2 },
      ],
    },
  )
}
