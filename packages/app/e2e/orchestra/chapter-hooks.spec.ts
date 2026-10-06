import { expect, test, type Page } from "@playwright/test"
import { setupRelay } from "./relay.fixture"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "en-US" })
test.setTimeout(180_000)

const sidebar = (page: Page) => page.locator(".orchestra-sidebar")
const canvas = (page: Page) => page.locator('[data-component="relay-canvas"]')

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: hooks library shows installs and last fires, without the WIP mark`, async ({ page }) => {
    await setupRelay(page, { scheme })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    const hooks = sidebar(page).getByRole("button", { name: "Hooks", exact: true })
    await expect(hooks.locator('[data-slot="orchestra-nav-wip"]')).toHaveCount(0)
    await hooks.click()
    await expect(page).toHaveURL(/\/orchestra\/hooks$/)
    await expect(page.locator('[data-slot="orchestra-wip"]')).toHaveCount(0)
    const view = page.locator('[data-mx-page="orchestra-hooks"]')
    const row = (name: string) => view.getByRole("listitem").filter({ hasText: name })
    await expect(row("Protect generated files").getByRole("switch")).toHaveAttribute("aria-checked", "true")
    await expect(row("Protect generated files")).toContainText("Blocked · 18 min ago")
    await expect(row("Protect generated files").locator(".wf-oneline")).toHaveText(
      "Before edit file → Path matches → Block change",
    )
    await expect(row("Read instructions first").getByRole("switch")).toBeDisabled()
    await expect(view.getByRole("tab", { name: /Activity/ })).toContainText("6")
    await page.screenshot({ path: test.info().outputPath(`${scheme}-hooks.png`) })

    await view.getByRole("tab", { name: /Activity/ }).click()
    await expect(page).toHaveURL(/\/orchestra\/hooks\/activity$/)
    await expect(view.getByRole("listitem").first()).toContainText("src/generated/client.ts")
    await expect(view.getByRole("listitem").first()).toContainText("Blocked")
  })
}

test("install and uninstall go through the hook routes", async ({ page }) => {
  const state = await setupRelay(page)
  await page.goto("/orchestra/hooks")
  const view = page.locator('[data-mx-page="orchestra-hooks"]')
  const typecheck = view.getByRole("listitem").filter({ hasText: "Typecheck when a session stops" })
  await typecheck.getByRole("switch").click()
  await expect(typecheck.getByRole("switch")).toHaveAttribute("aria-checked", "true")
  const protect = view.getByRole("listitem").filter({ hasText: "Protect generated files" })
  await protect.getByRole("switch").click()
  await expect(protect.getByRole("switch")).toHaveAttribute("aria-checked", "false")
  expect(state.writes.map((write) => `${write.method} ${write.path}`)).toEqual([
    "POST /api/relay/hook",
    "POST /api/relay/hook/inst-protect/disable",
  ])
  expect(state.writes[0].body).toEqual({ document: "typecheck-stop", version: "typecheck-stop-v1" })
})

test("hook canvas: Yes and No ports, a test walk, and the trigger's event list", async ({ page }) => {
  await setupRelay(page)
  await page.goto("/orchestra/hooks/protect-generated")
  await expect(canvas(page).locator(".wf-node")).toHaveCount(4)
  await expect(canvas(page).locator(".wf-port-label")).toHaveText(["Yes", "No"])
  await expect(canvas(page).locator(".wf-banner")).toContainText("Installed in orchestra-canonical · v2 · Blocked")
  await expect(page.getByRole("switch", { name: "Installed in this profile" })).toHaveAttribute("aria-checked", "true")

  await page.getByRole("button", { name: "Test", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Test hook" })
  await dialog.getByRole("textbox", { name: "File path" }).fill("src/generated/types.gen.ts")
  await dialog.getByRole("button", { name: "Run test" }).click()
  await expect(canvas(page).locator(".wf-banner")).toContainText("Test · src/generated/types.gen.ts → Block change")
  await expect(canvas(page).locator('.wf-node[data-id="a"]')).toHaveClass(/dim/)
  await page.keyboard.press("Escape")
  await expect(canvas(page).locator(".wf-node.dim")).toHaveCount(0)

  await canvas(page).locator('.wf-node[data-id="t"] .wf-tile').dblclick()
  await expect(page).toHaveURL(/\/protect-generated\/node\/t$/)
  const details = page.locator('[data-component="relay-node-details"]')
  const event = details.getByRole("combobox", { name: "Event" })
  await expect(event.locator("option")).toContainText([
    "Before read file",
    "Before edit file",
    "After shell command",
    "On session stop",
  ])
  await event.selectOption({ label: "After edit file" })
  await expect(details.locator("h2")).toHaveText("After edit file")
  await details.getByRole("button", { name: "Next: Path matches" }).click()
  await details.getByRole("button", { name: "Next: Block change" }).click()
  await expect(details.locator(".wf-alert")).toContainText("Block change needs a Before event.")
  await page.keyboard.press("Escape")
  await expect(page).toHaveURL(/\/orchestra\/hooks\/protect-generated$/)
})
