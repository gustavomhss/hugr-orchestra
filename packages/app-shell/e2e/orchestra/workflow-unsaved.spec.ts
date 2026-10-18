import { expect, test, type Page } from "@playwright/test"
import { setupRelay } from "./relay.fixture"

// Work the server has not accepted must not be lost: it survives a reload through the page's own storage, and a change
// made elsewhere asks what to keep instead of overwriting either side.

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "en-US" })
test.setTimeout(180_000)
const editor = (page: Page) => page.locator('[data-component="relay-editor"]')
const details = (page: Page) => page.locator('[data-component="relay-node-details"]')
const canvas = (page: Page) => page.locator('[data-component="relay-canvas"]')
const instructions = (page: Page) => details(page).getByRole("textbox", { name: "Instructions", exact: true })
const refusal = (status: number, tag: string, message: string) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ _tag: tag, message }),
})
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const failures: string[] = []
  errors.set(page, failures)
  page.on("pageerror", (error) => failures.push(error.stack ?? error.message))
})
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]))

type Saved = { nodes: { id: string; parameters: { instructions: string } }[]; force?: boolean }

test("unsaved edits: an edit whose save fails survives a reload, and opening it restores the text", async ({ page }) => {
  const state = await setupRelay(page)
  // Leaving a page with unsaved work asks first; this test leaves it on purpose.
  page.on("dialog", (dialog) => void dialog.accept())
  const path = "**/api/relay/document/relay-wp-execute*"
  await page.route(path, (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill(refusal(503, "RelayUnavailableError", "Disk full"))
      : route.fallback(),
  )
  await page.goto("/orchestra/workflows/relay-wp-execute/node/green.implement", { waitUntil: "domcontentloaded" })
  await instructions(page).fill("Keep these instructions through a reload.")
  await expect(details(page).locator('[data-save="error"]')).toContainText("Disk full", { timeout: 60_000 })
  await page.keyboard.press("Escape")
  await editor(page).getByRole("link", { name: "Back to Workflows" }).click()
  const retained = page.locator(".wf-retained")
  await expect(retained).toContainText("Could not save changes to Relay · wp-execute")

  // The page goes away with the edit still unsaved; the next page offers it back from the browser's storage.
  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(retained).toContainText("Could not save changes to Relay · wp-execute", { timeout: 60_000 })
  await retained.getByRole("button", { name: "Open", exact: true }).click()
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 })
  await canvas(page).locator('.wf-node[data-id="green.implement"] .wf-tile').dblclick()
  await expect(instructions(page)).toHaveValue("Keep these instructions through a reload.")
  await expect(details(page).locator('[data-save="error"]')).toBeVisible()

  // Nothing was lost: once the server answers again, one retry saves exactly this text.
  await page.unroute(path)
  await details(page).getByRole("button", { name: "Try again", exact: true }).click()
  await expect(details(page).locator('[data-save="saved"]')).toBeVisible()
  const patches = state.writes.filter((write) => write.method === "PATCH")
  expect(patches).toHaveLength(1)
  const body = patches[0]!.body as Saved
  expect(body.nodes.find((node) => node.id === "green.implement")?.parameters.instructions).toBe(
    "Keep these instructions through a reload.",
  )
})

test("conflict: a 409 offers Keep mine, Save mine as a copy and Discard mine, and Keep mine sends force: true", async ({
  page,
}) => {
  const state = await setupRelay(page)
  // The server refuses every write that is not forced, as it does when the stored version moved on.
  const sent: Saved[] = []
  await page.route("**/api/relay/document/relay-wp-execute*", (route) => {
    if (route.request().method() !== "PATCH") return route.fallback()
    const body = route.request().postDataJSON() as Saved
    sent.push(body)
    return body.force ? route.fallback() : route.fulfill(refusal(409, "RelayConflictError", "Changed elsewhere"))
  })
  await page.goto("/orchestra/workflows/relay-wp-execute/node/green.implement", { waitUntil: "domcontentloaded" })
  await instructions(page).fill("Mine, over what changed elsewhere.")
  await expect(details(page).locator('[data-save="conflict"]')).toBeVisible({ timeout: 60_000 })
  await expect(instructions(page)).toBeDisabled()
  await expect(details(page).getByRole("button", { name: "Keep mine", exact: true })).toBeVisible()
  await expect(details(page).getByRole("button", { name: "Save mine as a copy", exact: true })).toBeVisible()
  await expect(details(page).getByRole("button", { name: "Discard mine", exact: true })).toBeVisible()
  expect(state.writes).toEqual([])

  await details(page).getByRole("button", { name: "Keep mine", exact: true }).click()
  await expect(details(page).locator('[data-save="saved"]')).toBeVisible()
  await expect(instructions(page)).toBeEnabled()
  expect(sent.at(0)?.force).toBeUndefined()
  expect(sent.at(-1)?.force).toBe(true)
  const forced = state.writes.filter((write) => write.method === "PATCH")
  expect(forced).toHaveLength(1)
  expect(
    (forced[0]!.body as Saved).nodes.find((node) => node.id === "green.implement")?.parameters.instructions,
  ).toBe("Mine, over what changed elsewhere.")
})
