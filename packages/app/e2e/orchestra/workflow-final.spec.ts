import { expect, test, type Page } from "@playwright/test"
import { setupRelay } from "./relay.fixture"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "en-US" })
test.setTimeout(120_000)
const details = (page: Page) => page.locator('[data-component="relay-node-details"]')
const canvas = (page: Page) => page.locator('[data-component="relay-canvas"]')
const located = (data: unknown) => ({ contentType: "application/json", body: JSON.stringify({ location: { directory: "/repo/orchestra-canonical" }, data }) })

test("final fixes: reload leaves newer typing intact and conflicted", async ({ page }) => {
  const state = await setupRelay(page)
  const doc = state.documents.find((document) => document.id === "relay-wp-execute")!
  const fresh = { ...structuredClone(doc), name: "Fetched v5 workflow", versionCounter: 5, versionId: "remote-v5", nodes: structuredClone(doc.nodes) }
  const pending = Promise.withResolvers<void>()
  const arrived = Promise.withResolvers<void>()
  await page.route("**/api/relay/document/relay-wp-execute*", async (route) => {
    if (route.request().method() === "PATCH") return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ message: "Changed elsewhere", _tag: "RelayConflictError" }) })
    arrived.resolve()
    await pending.promise
    return route.fulfill(located(fresh))
  })
  await page.goto("/orchestra/workflows/relay-wp-execute/node/green.implement", { waitUntil: "domcontentloaded" })
  const instructions = details(page).getByRole("textbox", { name: "Instructions", exact: true })
  await instructions.fill("Before reload")
  await expect(details(page).locator('[data-save="conflict"]')).toBeVisible()
  const response = page.waitForResponse((reply) => reply.request().method() === "GET" && new URL(reply.url()).pathname === "/api/relay/document/relay-wp-execute")
  await details(page).getByRole("button", { name: "Discard local changes and reload" }).click()
  await arrived.promise
  await instructions.fill("Typed while reload was pending")
  pending.resolve()
  await (await response).finished()
  await page.keyboard.press("Escape")
  await page.getByRole("link", { name: "Back to Workflows", exact: true }).click()
  const row = page.locator('[data-document="relay-wp-execute"]')
  await expect(row).toContainText("Fetched v5 workflow")
  await row.click()
  await canvas(page).locator('.wf-node[data-id="green.implement"] .wf-tile').dblclick()
  await expect(instructions).toHaveValue("Typed while reload was pending")
  await expect(details(page).locator('[data-save="conflict"]')).toBeVisible()
})

test("final fixes: publish pending prevents dismissal", async ({ page }) => {
  await setupRelay(page)
  const pending = Promise.withResolvers<void>()
  await page.route("**/api/relay/document/relay-wp-execute/publish*", async (route) => {
    await pending.promise
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Publish offline" }) })
  })
  await page.goto("/orchestra/workflows/relay-wp-execute", { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: "Publish", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: /^Publish / })
  await dialog.getByRole("button", { name: "Publish", exact: true }).click()
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeDisabled()
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeVisible()
  pending.resolve()
  await expect(dialog.getByRole("alert")).toHaveText("Publish offline")
})

test("final fixes: hook creation retains failed inputs and locks pending form", async ({ page }) => {
  await setupRelay(page)
  const pending = Promise.withResolvers<void>()
  await page.route("**/api/relay/document*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback()
    await pending.promise
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Create offline" }) })
  })
  await page.goto("/orchestra/hooks/new", { waitUntil: "domcontentloaded" })
  const dialog = page.getByRole("dialog", { name: "New hook", exact: true })
  const name = dialog.getByRole("textbox", { name: "Name", exact: true })
  await name.fill("Keep hook draft")
  await dialog.getByRole("button", { name: "Create and open", exact: true }).click()
  await expect(name).toBeDisabled()
  await expect(dialog.getByRole("radio").first()).toBeDisabled()
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled()
  await page.keyboard.press("Escape")
  await expect(dialog).toBeVisible()
  pending.resolve()
  await expect(dialog.getByRole("alert")).toHaveText("Create offline")
  await expect(name).toHaveValue("Keep hook draft")
  await expect(name).toBeEnabled()
})

test("final fixes: export joins pending save and refuses failed save or failed compiled export", async ({ page }) => {
  await setupRelay(page)
  const pending = Promise.withResolvers<void>()
  const arrived = Promise.withResolvers<void>()
  const paths: string[] = []
  const downloads: string[] = []
  page.on("download", (download) => downloads.push(download.suggestedFilename()))
  await page.route("**/api/relay/document/relay-wp-execute*", async (route) => {
    paths.push(route.request().method() + " " + new URL(route.request().url()).pathname)
    if (route.request().method() === "PATCH") {
      arrived.resolve()
      await pending.promise
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Save offline" }) })
    }
    if (new URL(route.request().url()).pathname.endsWith("/export")) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Export offline" }) })
    return route.fallback()
  })
  await page.goto("/orchestra/workflows/relay-wp-execute/node/green.implement", { waitUntil: "domcontentloaded" })
  await details(page).getByRole("textbox", { name: "Instructions", exact: true }).fill("Unsaved export input")
  await arrived.promise
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "More actions", exact: true }).click()
  await page.getByRole("menuitem", { name: "Download definition", exact: true }).click()
  expect(paths.some((path) => path.endsWith("/export"))).toBe(false)
  pending.resolve()
  await expect(page.getByText("Could not export", { exact: true })).toBeVisible()
  expect(downloads).toEqual([])
  expect(paths.some((path) => path.endsWith("/export"))).toBe(false)
  await page.unroute("**/api/relay/document/relay-wp-execute*")
  await page.route("**/api/relay/document/relay-wp-execute/export*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Export offline" }) }))
  await page.getByRole("button", { name: "Try again", exact: true }).click()
  await expect(page.locator('[data-save="saved"]')).toBeVisible()
  await page.getByRole("button", { name: "More actions", exact: true }).click()
  await page.getByRole("menuitem", { name: "Download definition", exact: true }).click()
  await expect(page.getByText("Export offline", { exact: true })).toBeVisible()
  expect(downloads).toEqual([])
  await expect(canvas(page)).toBeVisible()
})
