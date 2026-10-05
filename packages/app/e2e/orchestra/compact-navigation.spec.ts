import { expect, test, type Locator } from "@playwright/test"
import { setupCompactNavigation } from "./compact-navigation.fixture"

test.use({ viewport: { width: 1672, height: 941 }, serviceWorkers: "block" })

test("collapse preserves names, focus, routes, profile and titlebar geometry across reload", async ({ page }) => {
  test.setTimeout(120_000)
  await setupCompactNavigation(page)
  await page.goto("/")
  const sidebar = page.locator('[data-component="orchestra-sidebar"]')
  const header = page.locator('[data-slot="titlebar-v2"]')
  await expect(sidebar).toHaveCSS("width", "230px")
  const frame = await header.boundingBox()
  const toggle = page.getByRole("button", { name: "Collapse sidebar", exact: true })
  const crumb = header.locator('[data-slot="orchestra-titlebar-breadcrumb"] > span')
  // Reference shell: the collapse control shares the brand row, rows are 31px on a 32px pitch,
  // and the profile card reads the selected repository's agents and branch.
  const brand = (await sidebar.locator(".orchestra-brand").boundingBox())!
  const control = (await toggle.boundingBox())!
  expect(control.width).toBe(28)
  expect(control.y + control.height).toBeLessThanOrEqual(brand.y + brand.height)
  const rows = await sidebar
    .locator("#orchestra-navigation .orchestra-nav-button")
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect()).map((box) => [box.top, box.height]))
  expect(rows[0][0]).toBeCloseTo(brand.y + brand.height + 2, 1)
  expect(rows.map((row) => row[1])).toEqual(rows.map(() => 31))
  expect(rows[1][0] - rows[0][0]).toBeCloseTo(32, 1)
  await expect(sidebar.locator('[data-slot="orchestra-profile"] small')).toHaveText("1 agent · main")
  await expect(sidebar.locator('[data-slot="project-avatar-surface"]')).toHaveCSS(
    "background-color",
    "rgb(44, 112, 189)",
  )
  await expect(crumb.last()).toHaveText("home")
  await expect(crumb.last()).toHaveCSS("font-size", "12px")
  await expectMainGlass(page.locator('[data-component="orchestra-home"]'))
  await toggle.focus()
  await page.keyboard.press("Enter")
  await expect(sidebar).toHaveCSS("width", "56px")
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(sidebar.getByRole("button", { name: "Home", exact: true })).toBeFocused()
  expect(await header.boundingBox()).toEqual(frame)
  await expect(sidebar.getByRole("button", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page")
  await expect(sidebar.getByRole("button", { name: "Home", exact: true })).toHaveCSS("width", "40px")
  await expect(sidebar.getByRole("button", { name: "Home", exact: true })).toHaveCSS("height", "31px")
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
  await expect(crumb.last()).toHaveText("MCP")
  await expectMainGlass(page.locator('[data-component="orchestra-chapter"]'))
  await expect(sidebar.getByRole("button", { name: "MCP", exact: true })).toHaveAttribute("aria-current", "page")
  await sidebar.getByRole("button", { name: "Choose repository profile" }).click()
  await expect(page.getByRole("menuitemradio", { name: "Compact project", exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menuitemradio", { name: "Compact project", exact: true })).toBeHidden()
  await expect(sidebar.getByRole("button", { name: "Choose repository profile" })).toBeFocused()
  await sidebar.getByRole("button", { name: "Chat", exact: true }).click()
  await expect(page.locator('[data-component="prompt-input-v2"]')).toBeVisible()
  await expect(crumb.last()).toHaveText("session")
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
})

// Every main view is one panel of the shared sidebar glass, one 6px gutter from the sidebar.
async function expectMainGlass(main: Locator) {
  const sidebar = main.page().locator('[data-component="orchestra-sidebar"]')
  for (const property of ["background-image", "backdrop-filter", "border-top-color", "box-shadow", "border-radius"])
    expect(await main.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)).toBe(
      await sidebar.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property),
    )
  const panel = (await main.boundingBox())!
  const nav = (await sidebar.boundingBox())!
  expect(panel.x - (nav.x + nav.width)).toBeCloseTo(6, 1)
  expect(panel.y).toBeCloseTo(nav.y, 1)
}

// English direction override is exposed through the development DebugBar.
// Production direction and portal geometry are covered with the actual Arabic locale.
test("English RTL override preserves compact navigation geometry", { tag: "@development-only" }, async ({ page }) => {
  await setupCompactNavigation(page, { scheme: "light" })
  await page.goto("/")
  const sidebar = page.locator('[data-component="orchestra-sidebar"]')
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click()
  await expect(sidebar).toHaveCSS("width", "56px")
  await page.getByRole("button", { name: "DIR: LTR", exact: true }).click()
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(page.getByRole("button", { name: "DIR: RTL", exact: true })).toHaveAttribute("aria-pressed", "true")
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
  await setupCompactNavigation(page)
  await page.goto("/")
  const sidebar = page.locator('[data-component="orchestra-sidebar"]')
  await expect(sidebar).toHaveCSS("width", "230px")
  // The owner keeps the full 230px navigation on common laptop widths, down to the rail breakpoint.
  await page.setViewportSize({ width: 1366, height: 768 })
  await expect(sidebar).toHaveCSS("width", "230px")
  await page.setViewportSize({ width: 1280, height: 768 })
  await expect(sidebar).toHaveCSS("width", "230px")
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
  await setupCompactNavigation(other)
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
