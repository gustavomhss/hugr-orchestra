import { expect, test, type Page } from "@playwright/test"
import { setupRelay } from "./relay.fixture"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "en-US" })
test.setTimeout(180_000)
const details = (page: Page) => page.locator('[data-component="relay-node-details"]')
const editor = (page: Page) => page.locator('[data-component="relay-editor"]')
const canvas = (page: Page) => page.locator('[data-component="relay-canvas"]')
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const failures: string[] = []
  errors.set(page, failures)
  page.on("pageerror", (error) => failures.push(error.stack ?? error.message))
})
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]))

async function workflows(page: Page) {
  await page.goto("/orchestra/workflows", { waitUntil: "domcontentloaded" })
  await expect(page.locator('[data-mx-page="orchestra-workflows"] h1')).toHaveText("Workflows", { timeout: 60_000 })
  await page.getByRole("listitem").filter({ hasText: "Relay · wp-execute" }).click()
  await expect(canvas(page)).toBeVisible()
}

test("cold review: pending save fails after navigation; returning restores exact draft and explicit retry", async ({ page }) => {
  const state = await setupRelay(page)
  await workflows(page)
  await canvas(page).locator('.wf-node[data-id="green.implement"] .wf-tile').dblclick()
  const pending = Promise.withResolvers<void>()
  const arrived = Promise.withResolvers<void>()
  await page.route("**/api/relay/document/relay-wp-execute*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback()
    arrived.resolve()
    await pending.promise
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ _tag: "RelayUnavailableError", message: "Disk full" }) })
  })
  await details(page).getByRole("textbox", { name: "Instructions", exact: true }).fill("Keep these instructions after a late 503.")
  await arrived.promise
  await page.keyboard.press("Escape")
  await editor(page).getByRole("link", { name: "Back to Workflows" }).click()
  await expect(page).toHaveURL(/\/workflows$/)
  pending.resolve()
  await expect(page.getByText("Unsaved changes: Relay · wp-execute", { exact: false })).toBeVisible()
  await page.getByRole("listitem").filter({ hasText: "Relay · wp-execute" }).click()
  await expect(editor(page).locator('[data-save="error"]')).toContainText("Disk full")
  await canvas(page).locator('.wf-node[data-id="green.implement"] .wf-tile').dblclick()
  await expect(details(page).getByRole("textbox", { name: "Instructions", exact: true })).toHaveValue("Keep these instructions after a late 503.")
  await page.unroute("**/api/relay/document/relay-wp-execute*")
  await details(page).getByRole("button", { name: "Try again", exact: true }).click()
  await expect(details(page).locator('[data-save="saved"]')).toBeVisible()
  const body = state.writes.filter((write) => write.method === "PATCH").at(-1)?.body as { nodes: { id: string; parameters: { instructions: string } }[] }
  expect(body.nodes.find((node) => node.id === "green.implement")?.parameters.instructions).toBe("Keep these instructions after a late 503.")
})

test("cold review: node modal owns wheel, traps focus and restores canvas focus", async ({ page }) => {
  await setupRelay(page)
  await workflows(page)
  await canvas(page).locator('.wf-node[data-id="green.implement"] .wf-tile').dblclick()
  const instructions = details(page).getByRole("textbox", { name: "Instructions", exact: true })
  await instructions.fill(Array.from({ length: 120 }, (_, i) => `Instruction ${i}`).join("\n"))
  const before = await canvas(page).locator(".wf-world").getAttribute("style")
  await instructions.hover()
  await page.mouse.wheel(0, 400)
  await expect.poll(() => instructions.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await canvas(page).locator(".wf-world").getAttribute("style")).toBe(before)
  await details(page).getByRole("button", { name: "Done", exact: true }).focus()
  await page.keyboard.press("Tab")
  expect(await details(page).evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press("Shift+Tab")
  expect(await details(page).evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press("Escape")
  await expect(details(page)).toHaveCount(0)
  await expect(canvas(page)).toBeFocused()
})

test("cold review: parameters remain usable at 390, 768, 1440, RTL and 200% zoom", async ({ page }) => {
  await setupRelay(page)
  await workflows(page)
  await canvas(page).locator('.wf-node[data-id="green.implement"] .wf-tile').dblclick()
  for (const width of [390, 768, 1440]) {
    for (const direction of ["ltr", "rtl"]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate((dir) => document.documentElement.dir = dir, direction)
      const instructions = details(page).getByRole("textbox", { name: "Instructions", exact: true })
      await expect(instructions).toBeVisible()
      const box = await instructions.boundingBox()
      expect(box!.width).toBeGreaterThan(250)
      const modal = await details(page).boundingBox()
      expect(modal!.x).toBeGreaterThanOrEqual(0)
      expect(modal!.x + modal!.width).toBeLessThanOrEqual(width)
    }
  }
  await page.evaluate(() => document.documentElement.style.zoom = "2")
  const zoomed = await details(page).boundingBox()
  expect(zoomed!.x).toBeGreaterThanOrEqual(0)
  expect(zoomed!.x + zoomed!.width).toBeLessThanOrEqual(1440)
  expect((await details(page).getByRole("textbox", { name: "Instructions", exact: true }).boundingBox())!.width).toBeGreaterThan(250)
})

test("cold review: unknown hook installations show loading/error/retry and never Off or mutable toggles", async ({ page }) => {
  const state = await setupRelay(page)
  const pending = Promise.withResolvers<void>()
  await page.route("**/api/relay/hook**", async (route) => {
    if (new URL(route.request().url()).pathname !== "/api/relay/hook" || route.request().method() !== "GET") return route.fallback()
    await pending.promise
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Install store offline", _tag: "RelayUnavailableError" }) })
  })
  await page.goto("/orchestra/hooks", { waitUntil: "domcontentloaded" })
  await expect(page.getByText("Loading hook installation status…")).toBeVisible()
  await expect(page.getByRole("switch")).toHaveCount(0)
  pending.resolve()
  await expect(page.locator('[data-hook-status="installs"]')).toContainText("Install store offline")
  await expect(page.getByText("Off", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Not fired yet", { exact: true })).toHaveCount(0)
  await page.getByRole("listitem").filter({ hasText: "Protect generated files" }).click()
  await expect(page.locator('[data-hook-status="installs"]')).toContainText("Install store offline")
  await expect(page.getByRole("switch")).toHaveCount(0)
  expect(state.writes).toEqual([])
  await page.unroute("**/api/relay/hook**")
  await page.locator('[data-hook-status="installs"]').getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("switch", { name: "Installed in this profile" })).toHaveAttribute("aria-checked", "true")
  await canvas(page).locator('.wf-node[data-id="b"] .wf-tile').dblclick()
  const name = details(page).getByRole("textbox", { name: "Name", exact: true })
  await name.fill("Block")
  await name.pressSequentially(" generated files")
  await expect(name).toHaveValue("Block generated files")
  await name.fill("   ")
  await expect(name).toHaveAttribute("aria-invalid", "true")
  await page.keyboard.press("Escape")
  await expect(name).toHaveValue("Block generated files")
})

test("cold review: run history uses immutable graph and unavailable history never falls back to draft", async ({ page }) => {
  const state = await setupRelay(page)
  const current = state.documents.find((document) => document.id === "relay-wp-execute")!
  const nodes = structuredClone(current.nodes) as { id: string; parameters: { instructions: string } }[]
  const historical = { ...structuredClone(current), nodes, workflowId: current.id, versionId: "immutable-run-version", versionCounter: 1 }
  nodes.find((node) => node.id === "green.implement")!.parameters.instructions = "Historical instructions only"
  const run = { runID: "recorded", documentID: current.id, version: historical.versionId, status: "completed", steps: [] }
  await page.route("**/api/relay/run**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ location: { directory: "/repo/orchestra-canonical" }, data: new URL(route.request().url()).pathname.endsWith("/run") ? [run] : run }) }))
  const versions: string[] = []
  await page.route("**/api/relay/document/*/version/*", (route) => {
    versions.push(new URL(route.request().url()).pathname)
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ location: { directory: "/repo/orchestra-canonical" }, data: historical }) })
  })
  await workflows(page)
  await page.goto("/orchestra/workflows/relay-wp-execute/run/recorded/node/green.implement", { waitUntil: "domcontentloaded" })
  const instructions = details(page).getByRole("textbox", { name: "Instructions", exact: true })
  await expect(instructions).toHaveValue("Historical instructions only")
  await expect(instructions).toBeDisabled()
  expect(versions.length).toBeGreaterThan(0)
  expect([...new Set(versions)]).toEqual(["/api/relay/document/relay-wp-execute/version/immutable-run-version"])
  expect(state.writes).toEqual([])
  await page.unroute("**/api/relay/document/*/version/*")
  await page.route("**/api/relay/document/*/version/*", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "Version unavailable", _tag: "RelayNotFoundError" }) }))
  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.locator('[data-slot="relay-history-unavailable"]')).toContainText("Could not load this run’s saved workflow version")
  await expect(details(page)).toHaveCount(0)
  await expect(canvas(page)).toHaveCount(0)
})
