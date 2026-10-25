import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"
import { mockOrchestraServer } from "../utils/mock-server"

const server = "http://127.0.0.1:4096"
const sessionA = session("ses_tab_a", "Tab A session")
const sessionB = session("ses_tab_b", "Tab B session")
const sessionC = session("ses_tab_c", "Tab C session")
const unresolvedSessionID = "ses_tab_unresolved"

test("pressing mouse down on a tab navigates before mouse up", async ({ page }) => {
  await mockServer(page)
  await page.addInitScript(
    ({ server, sessionA, sessionB }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: {} }))
      localStorage.setItem(
        "orchestra.window.browser.dat:tabs",
        JSON.stringify([
          { type: "session", server, sessionId: sessionA },
          { type: "session", server, sessionId: sessionB },
        ]),
      )
    },
    { server, sessionA: sessionA.id, sessionB: sessionB.id },
  )

  const hrefA = `/server/${base64Encode(server)}/session/${sessionA.id}`
  const hrefB = `/server/${base64Encode(server)}/session/${sessionB.id}`
  await page.goto(hrefA)
  await expect(page.getByText(sessionA.title).first()).toBeVisible()

  const linkB = page.locator(`a[data-titlebar-tab-link][href="${hrefB}"]`)
  await expect(linkB).toBeVisible()
  const box = await linkB.boundingBox()
  if (!box) throw new Error("tab link has no bounding box")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()

  // Navigation must happen on mousedown, before the button is released.
  await expect(page).toHaveURL(new RegExp(`${hrefB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))
  await page.mouse.up()
  await expect(page).toHaveURL(new RegExp(`${hrefB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))
})

test("keyboard navigation follows the visible tab order", async ({ page }) => {
  await mockServer(page)
  await page.addInitScript(
    ({ server, sessionA, unresolved, sessionC }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: {} }))
      localStorage.setItem(
        "orchestra.window.browser.dat:tabs",
        JSON.stringify([
          { type: "session", server, sessionId: sessionA },
          { type: "session", server, sessionId: unresolved },
          { type: "session", server, sessionId: sessionC },
        ]),
      )
    },
    { server, sessionA: sessionA.id, unresolved: unresolvedSessionID, sessionC: sessionC.id },
  )

  const hrefA = `/server/${base64Encode(server)}/session/${sessionA.id}`
  const hrefC = `/server/${base64Encode(server)}/session/${sessionC.id}`
  await page.goto(hrefA)
  await expect(page.locator("[data-titlebar-tab-slot]:visible")).toHaveCount(2)
  await expect(page.locator(`[data-titlebar-tab-slot]:has(a[href="${hrefC}"])`)).toBeVisible()

  await page.keyboard.press("Control+Alt+ArrowRight")

  await expect(page).toHaveURL(new RegExp(`${hrefC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))
})

function session(id: string, title: string) {
  return {
    id,
    slug: id,
    projectID: "project-tabs",
    directory: "C:/tab-project",
    title,
    version: "dev",
    time: { created: 1, updated: 1 },
  }
}

async function mockServer(page: Page) {
  await mockOrchestraServer(page, {
    directory: sessionA.directory,
    project: {
      id: sessionA.projectID,
      worktree: sessionA.directory,
      vcs: "git",
      time: { created: 1, updated: 1 },
      sandboxes: [],
    },
    provider: { all: [], connected: [], default: { providerID: "", modelID: "" } },
    sessions: [sessionA, sessionB, sessionC],
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== server) return route.fallback()
    if ([`/api/session/${unresolvedSessionID}`, `/session/${unresolvedSessionID}`].includes(url.pathname))
      return new Promise(() => {})
    return route.fallback()
  })
}
