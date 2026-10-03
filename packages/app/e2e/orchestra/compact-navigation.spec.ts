import { expect, test, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

const directory = "/work/compact-navigation"
const server = "http://127.0.0.1:4096"
test.use({ viewport: { width: 1672, height: 941 }, serviceWorkers: "block" })

test("collapse preserves names, focus, routes, profile and titlebar geometry across reload", async ({ page }) => {
  test.setTimeout(120_000)
  await setup(page)
  await page.goto("/")
  const sidebar = page.locator('[data-component="orchestra-sidebar"]')
  const header = page.locator('[data-slot="titlebar-v2"]')
  await expect(sidebar).toHaveCSS("width", "230px")
  const frame = await header.boundingBox()
  const toggle = page.getByRole("button", { name: "Collapse sidebar", exact: true })
  await toggle.focus()
  await page.keyboard.press("Enter")
  await expect(sidebar).toHaveCSS("width", "56px")
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(sidebar.getByRole("button", { name: "Home", exact: true })).toBeFocused()
  expect(await header.boundingBox()).toEqual(frame)
  await expect(sidebar.getByRole("button", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page")
  await expect(sidebar.getByRole("button", { name: "Home", exact: true })).toHaveCSS("width", "40px")
  await expect(sidebar.getByRole("button", { name: "Home", exact: true })).toHaveCSS("height", "34px")
  await expect(sidebar.getByRole("button", { name: "Home", exact: true }).locator("svg")).toHaveCSS("width", "20px")
  await expect(sidebar.getByRole("img", { name: "HuGR", exact: true })).toHaveCSS("width", "32px")
  await expect(sidebar.locator('[data-component="project-avatar-v2"]')).toHaveCSS("width", "30px")
  await sidebar.getByRole("button", { name: "MCP", exact: true }).hover()
  await expect(page.getByRole("tooltip", { name: "MCP", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("tooltip", { name: "MCP", exact: true })).toBeHidden()
  await sidebar.getByRole("button", { name: "Choose repository profile" }).click()
  await page.getByRole("menuitemradio", { name: "Compact project", exact: true }).click()
  await expect(sidebar.locator('[data-slot="orchestra-profile"]')).toContainText("Compact project")
  await sidebar.getByRole("button", { name: "MCP", exact: true }).focus()
  await expect(page.getByRole("tooltip", { name: "MCP", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("tooltip", { name: "MCP", exact: true })).toBeHidden()
  await sidebar.getByRole("button", { name: "Chat", exact: true }).focus()
  await sidebar.getByRole("button", { name: "MCP", exact: true }).focus()
  await expect(page.getByRole("tooltip", { name: "MCP", exact: true })).toBeVisible()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { name: "MCP", exact: true })).toBeVisible()
  await expect(sidebar.getByRole("button", { name: "MCP", exact: true })).toHaveAttribute("aria-current", "page")
  await sidebar.getByRole("button", { name: "Choose repository profile" }).click()
  await expect(page.getByRole("menuitemradio", { name: "Compact project", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menuitemradio", { name: "Compact project", exact: true })).toBeHidden()
  await expect(sidebar.getByRole("button", { name: "Choose repository profile" })).toBeFocused()
  await sidebar.getByRole("button", { name: "Chat", exact: true }).click()
  await expect(page.locator('[data-component="prompt-input-v2"]')).toBeVisible()
  const editor = page.locator('[data-component="prompt-input-v2"] [contenteditable="true"]')
  await editor.fill("Keep this draft while changing navigation")
  const route = page.url()
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click()
  await expect(editor).toHaveText("Keep this draft while changing navigation")
  expect(page.url()).toBe(route)
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click()
  await expect(editor).toHaveText("Keep this draft while changing navigation")
  await page.reload()
  await expect(sidebar).toHaveCSS("width", "56px")
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: test.info().outputPath("compact-dark.png"), animations: "disabled" })
  await page.locator('[data-slot="orchestra-theme-toggle"]').click()
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light")
  await page.screenshot({ path: test.info().outputPath("compact-light.png"), animations: "disabled" })
  await page.evaluate(() => document.documentElement.setAttribute("dir", "rtl"))
  await expect
    .poll(async () => {
      const nav = await sidebar.boundingBox()
      const content = await page.locator(".orchestra-content").boundingBox()
      return !!nav && !!content && nav.x > content.x
    })
    .toBe(true)
  await sidebar.getByRole("button", { name: "MCP", exact: true }).focus()
  await expect(page.getByRole("tooltip", { name: "MCP", exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath("compact-rtl-light.png"), animations: "disabled" })
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click()
  await expect(sidebar).toHaveCSS("width", "230px")
  await page.screenshot({ path: test.info().outputPath("expanded-rtl-light.png"), animations: "disabled" })
})

test("responsive compact mode restores the choice and leaves mobile navigation available", async ({
  page,
  context,
}) => {
  await setup(page)
  await page.goto("/")
  const sidebar = page.locator('[data-component="orchestra-sidebar"]')
  await expect(sidebar).toHaveCSS("width", "230px")
  await page.setViewportSize({ width: 1366, height: 768 })
  await expect(sidebar).toHaveCSS("width", "208px")
  await page.setViewportSize({ width: 1152, height: 768 })
  await expect(sidebar).toHaveCSS("width", "56px")
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  )
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).focus()
  await expect(page.getByRole("tooltip")).toContainText("The sidebar stays compact in this window width.")
  await page.screenshot({ path: test.info().outputPath("compact-1152.png"), animations: "disabled" })
  await page.setViewportSize({ width: 1672, height: 941 })
  await expect(sidebar).toHaveCSS("width", "230px")
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click()
  const other = await context.newPage()
  await setup(other)
  await other.goto("/")
  await expect(other.locator('[data-component="orchestra-sidebar"]')).toHaveCSS("width", "230px")
  await expect(sidebar).toHaveCSS("width", "56px")
  await other.close()
  await page.setViewportSize({ width: 900, height: 768 })
  await expect(sidebar).toBeHidden()
  const header = page.locator('[data-slot="titlebar-v2"]')
  const frame = await header.boundingBox()
  await header.getByRole("button", { name: "Expand sidebar", exact: true }).click()
  await expect(sidebar).toHaveCSS("width", "56px")
  await expect(sidebar).toBeVisible()
  expect(await header.boundingBox()).toEqual(frame)
  await page.screenshot({ path: test.info().outputPath("compact-900-on-demand.png"), animations: "disabled" })
  await header.getByRole("button", { name: "Collapse sidebar", exact: true }).click()
  await expect(sidebar).toBeHidden()
  await page.setViewportSize({ width: 767, height: 768 })
  await expect(sidebar).toHaveCount(0)
  await expect(header.getByRole("button", { name: "Home", exact: true })).toBeVisible()
  await expect(header.getByRole("button", { name: "Home", exact: true })).toBeEnabled()
  await page.setViewportSize({ width: 1672, height: 941 })
  await expect(sidebar).toHaveCSS("width", "56px")
})

async function setup(page: Page) {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "compact-project",
      name: "Compact project",
      worktree: directory,
      vcs: "git",
      time: { created: 1, updated: 1 },
      sandboxes: [],
    },
    provider: { all: [], connected: [], default: {} },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.addInitScript(
    ({ directory, server }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [server],
          projects: {
            local: [{ worktree: directory, expanded: true }],
            [server]: [{ worktree: directory, expanded: true }],
          },
          lastProject: { local: directory, [server]: directory },
        }),
      )
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", "dark")
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
    },
    { directory, server },
  )
}
