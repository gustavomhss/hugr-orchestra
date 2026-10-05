import { expect, test, type Locator } from "@playwright/test"
import { setupCompactNavigation } from "./compact-navigation.fixture"

test.use({ viewport: { width: 1672, height: 941 }, serviceWorkers: "block" })

const wipItems = ["Agents", "MCP", "Hooks", "CI/CD", "Workspaces"]
const wipText = "Work in progress, revisit before production"

test("collapse preserves names, focus, routes, profile and titlebar geometry across reload", async ({ page }) => {
  test.setTimeout(120_000)
  await setupCompactNavigation(page, { selected: true })
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
  // Exactly the owner's five revisit-before-production screens carry the WIP mark, described to assistive tech.
  const marked = sidebar
    .locator(".orchestra-nav-button")
    .filter({ has: page.locator('[data-slot="orchestra-nav-wip"]') })
  expect(await marked.evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")))).toEqual(wipItems)
  for (const name of wipItems) {
    const item = sidebar.getByRole("button", { name, exact: true })
    await expect(item.locator('[data-slot="orchestra-nav-wip"]')).toHaveText("WIP")
    await expect(item).toHaveAttribute("aria-description", wipText)
    await expect(item.locator(".orchestra-pending-dot")).toHaveCount(0)
  }
  expect(
    await sidebar
      .locator(".orchestra-nav-button")
      .evaluateAll(
        (items, text) => items.filter((item) => item.getAttribute("aria-description") === text).length,
        wipText,
      ),
  ).toBe(wipItems.length)
  const chip = (await sidebar.locator('[data-slot="orchestra-nav-wip"]').first().boundingBox())!
  expect(chip.x + chip.width, "the WIP mark fits the 230px row").toBeLessThanOrEqual(
    (await sidebar.boundingBox())!.x + 230 - 10,
  )
  await sidebar.getByRole("button", { name: "Hooks", exact: true }).hover()
  await expect(page.getByRole("tooltip", { name: wipText, exact: true })).toBeVisible()
  await page.mouse.move(900, 500)
  await expect(page.getByRole("tooltip")).toHaveCount(0)
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
  // The compact rail keeps the WIP mark as a dot on the icon.
  await expect(
    sidebar.getByRole("button", { name: "MCP", exact: true }).locator('[data-slot="orchestra-nav-wip"]'),
  ).toHaveCSS("width", "5px")
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

test("V2 profile card counts agents and shows the branch only when the server reports one", async ({ page }) => {
  await setupCompactNavigation(page, { protocol: "v2", selected: true })
  const vcs: string[] = []
  // A V2 server without the legacy endpoint: the card drops the branch instead of showing a stale one.
  await page.route(
    (url) => url.pathname === "/vcs",
    (route) => {
      vcs.push(route.request().url())
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" })
    },
  )
  // Home's dashboard reads the branch for itself; on a chapter page the card is the only reader.
  await page.goto("/orchestra/skills")
  const meta = page.locator('[data-slot="orchestra-profile"] small')
  await expect(meta).toHaveText("1 agent")
  await expect.poll(() => vcs.length).toBe(1)
  // A retry would follow the 404 after about a second.
  await page.waitForTimeout(1_500)
  expect(vcs.length, "the branch is asked once, without retries").toBe(1)
  // The same V2 server answering the legacy endpoint shows the branch it reports.
  await page.unroute((url) => url.pathname === "/vcs")
  await page.reload()
  await expect(meta).toHaveText("1 agent · main")
})

test("WIP chapters mark their page above its content; other pages do not", async ({ page }) => {
  test.setTimeout(120_000)
  await setupCompactNavigation(page)
  await page.goto("/")
  const sidebar = page.locator('[data-component="orchestra-sidebar"]')
  await sidebar.getByRole("button", { name: "Choose repository profile" }).click()
  await page.getByRole("menuitemradio", { name: "Compact project", exact: true }).click()
  const mark = page.locator('[data-slot="orchestra-wip"]')
  for (const [name, wip] of [
    ["Agents", true],
    ["MCP", true],
    ["CI/CD", true],
    ["Workspaces", true],
    ["Skills", false],
    [".env", false],
    ["Dock", false],
  ] as const) {
    await sidebar.getByRole("button", { name, exact: true }).click()
    const panel = page.locator('[data-component="orchestra-chapter"]')
    await expect(panel.locator("h1").first()).toBeVisible()
    if (!wip) {
      await expect(mark).toHaveCount(0)
      continue
    }
    await expect(mark).toHaveText("WIP · revisit before production")
    // Inside the glass panel's top-left, and above every heading and action of the page.
    const box = (await mark.boundingBox())!
    const frame = (await panel.boundingBox())!
    expect(box.x - frame.x).toBeCloseTo(17, 0)
    expect(box.y - frame.y).toBeCloseTo(15, 0)
    const below = await panel.evaluate((element, bottom) => {
      const content = [...element.querySelectorAll("h1, h2, button, [data-mx-page] header")]
      return content.every((item) => item.getBoundingClientRect().top >= bottom)
    }, box.y + box.height)
    expect(below, `${name}: the mark sits above the page`).toBe(true)
  }
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
