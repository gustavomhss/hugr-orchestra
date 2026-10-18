import { expect, test, type Page } from "@playwright/test"
import { relayState, setupRelay } from "./relay.fixture"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "en-US" })
test.setTimeout(180_000)

const sidebar = (page: Page) => page.locator(".orchestra-sidebar")
const editor = (page: Page) => page.locator('[data-component="relay-editor"]')
const canvas = (page: Page) => page.locator('[data-component="relay-canvas"]')
const SEEDED = [
  "Relay · wp-execute",
  "Relay · spec-decompose",
  "Relay · tdd_feature",
  "Relay · planning",
  "Relay · design",
  "Relay · research-v2",
]

async function openWorkflows(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await sidebar(page).getByRole("button", { name: "Workflows", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/workflows$/)
  await expect(page.locator('[data-mx-page="orchestra-workflows"] h1')).toHaveText("Workflows")
}

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: the library lists the seeded profiles, offers only templates that can run, and hides runs`, async ({
    page,
  }) => {
    await setupRelay(page, { scheme })
    await openWorkflows(page)
    const view = page.locator('[data-mx-page="orchestra-workflows"]')
    await expect(view.locator(".mx-eyebrow")).toHaveText("orchestra-canonical / profile automation")
    const rows = view.getByRole("listitem")
    await expect(rows.locator("strong")).toHaveText(SEEDED)
    const row = (name: string) => rows.filter({ has: page.getByText(name, { exact: true }) })
    await expect(row("Relay · wp-execute").locator(".wf-badges .mx-badge")).toHaveText(["Published v3", "Draft v4"])
    await expect(row("Relay · tdd_feature").locator(".wf-badges .mx-badge")).toHaveText(["Published v1"])
    await expect(row("Relay · design").locator(".wf-badges .mx-badge")).toHaveText(["Draft v1 · not published"])
    // Runs are hidden: no live runs, no last-run column, no waiting count and no run button on a row.
    await expect(view.locator(".wf-attn")).toHaveCount(0)
    await expect(row("Relay · wp-execute").locator(".wf-last")).toHaveCount(0)
    await expect(sidebar(page).locator('[data-slot="orchestra-nav-attention"]')).toHaveCount(0)
    for (const name of ["Relay · wp-execute", "Relay · design"])
      await expect(row(name).getByRole("button", { name: `Run ${name}` })).toHaveCount(0)

    // Profiles that still need tools are not offered as templates.
    const templates = view.locator(".wf-tpl-grid .wf-tpl h3")
    await expect(templates).toHaveText(["Blank workflow", "Relay · tdd_feature", "Relay · wp-execute"])
    await expect(view.locator('.wf-tpl[aria-disabled="true"]')).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath(`${scheme}-library.png`) })

    await view.getByRole("textbox", { name: "Search workflows" }).fill("TDD")
    await expect(rows.locator("strong")).toHaveText(["Relay · tdd_feature"])
    await view.getByRole("textbox", { name: "Search workflows" }).fill("")
    await view.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: "Published" }).click()
    await expect(rows.locator("strong")).toHaveText(["Relay · wp-execute", "Relay · tdd_feature"])

    await expect(view.getByRole("tab", { name: /Executions/ })).toHaveCount(0)
    // A bookmarked executions URL opens the library.
    await page.goto("/orchestra/workflows/executions", { waitUntil: "domcontentloaded" })
    await expect(view.locator("h1")).toHaveText("Workflows")
    await expect(view.getByRole("listitem").locator("strong")).toHaveText(SEEDED)
  })
}

test("a server without the Relay routes says so on both chapters", async ({ page }) => {
  const state = relayState()
  state.supported = false
  await setupRelay(page, { state })
  await openWorkflows(page)
  await expect(page.locator('[data-slot="relay-unsupported"]')).toHaveText(
    "This server does not support workflows yet.",
  )
  await sidebar(page).getByRole("button", { name: "Hooks", exact: true }).click()
  await expect(page.locator('[data-slot="relay-unsupported"]')).toHaveText("This server does not support hooks yet.")
})

test("a template that can run is copied as the user's own workflow; one that cannot is not offered", async ({ page }) => {
  const state = await setupRelay(page)
  await page.goto("/orchestra/workflows/new")
  const dialog = page.getByRole("dialog", { name: "New workflow" })
  await expect(dialog.getByRole("radio", { name: /Relay · tdd_feature/ })).toHaveAttribute("aria-checked", "true")
  // A profile whose tools are missing is not offered at all.
  await expect(dialog.getByRole("radio", { name: /Relay · design/ })).toHaveCount(0)
  await dialog.getByRole("radio", { name: /Relay · wp-execute/ }).click()
  await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Relay · wp-execute copy")
  await dialog.getByRole("textbox", { name: "Name" }).fill("WP-07 Session recovery")
  await dialog.getByRole("button", { name: "Create and open" }).click()
  await expect(page).toHaveURL(/\/orchestra\/workflows\/doc-\d+$/)
  const created = state.writes.find((write) => write.method === "POST" && write.path === "/api/relay/document")
  const body = created?.body as { name: string; nodes: unknown[]; meta: { relay: { profile?: string } } }
  // The copy drops the profile mark, so it is not listed as a template.
  expect([body.name, body.nodes.length, body.meta.relay.profile]).toEqual(["WP-07 Session recovery", 14, undefined])
  await expect(editor(page).locator(".wf-name")).toHaveValue("WP-07 Session recovery")
})

test("canvas: inspect a step, walk to its neighbour and close only the top layer", async ({ page }) => {
  await setupRelay(page)
  await openWorkflows(page)
  await page.getByRole("listitem").filter({ hasText: "Relay · wp-execute" }).click()
  await expect(page).toHaveURL(/\/orchestra\/workflows\/relay-wp-execute$/)
  await expect(canvas(page).locator(".wf-node")).toHaveCount(14)
  await expect(canvas(page).locator(".wf-group-head b")).toHaveText([
    "Bind",
    "Red",
    "Green",
    "Refactor",
    "Verification Gate",
    "Seal",
  ])
  await expect(canvas(page).locator(".wf-banner")).toHaveCount(0)
  await expect(canvas(page).locator(".wf-state-badge")).toHaveCount(0)
  await expect(editor(page).getByRole("button", { name: "Run", exact: true })).toHaveCount(0)
  await expect(editor(page).getByRole("button", { name: "Use in chat", exact: true })).toBeVisible()

  await canvas(page).locator('.wf-node[data-id="green.implement"] .wf-tile').dblclick()
  await expect(page).toHaveURL(/\/relay-wp-execute\/node\/green\.implement$/)
  const details = page.locator('[data-component="relay-node-details"]')
  await expect(details.locator("h2")).toHaveText("Implement minimally")
  await expect(details.getByRole("region", { name: "Output" })).toContainText("No output for this step yet.")
  await details.getByRole("button", { name: "Next: Green gate" }).click()
  await expect(page).toHaveURL(/\/node\/green\.gate$/)
  await expect(details.locator("h2")).toHaveText("Green gate")
  await page.keyboard.press("Escape")
  await expect(details).toHaveCount(0)
  await expect(page).toHaveURL(/\/orchestra\/workflows\/relay-wp-execute$/)
  await expect(canvas(page)).toBeVisible()

  await expect(editor(page).getByRole("tab", { name: /Executions/ })).toHaveCount(0)
  await editor(page).getByRole("link", { name: "Back to Workflows" }).click()
  await expect(page).toHaveURL(/\/orchestra\/workflows$/)
})

test("edit: a step added from the panel autosaves the loaded version with whole-number positions, then publishes", async ({
  page,
}) => {
  const state = await setupRelay(page)
  await page.goto("/orchestra/workflows/relay-wp-execute")
  await expect(canvas(page).locator(".wf-node")).toHaveCount(14)
  await canvas(page).locator('.wf-node[data-id="green.gate"] .wf-tile').click()
  await canvas(page).focus()
  await page.keyboard.press("n")
  await expect(page).toHaveURL(/\/relay-wp-execute\/add$/)
  const panel = page.locator('[data-component="relay-add-panel"]')
  await expect(panel.locator("p").first()).toHaveText("Inserted after Green gate")
  await page.keyboard.press("Escape")
  await expect(panel).toHaveCount(0)

  await canvas(page).getByRole("button", { name: "Add step (N)" }).click()
  await panel.getByRole("option", { name: /Run task/ }).click()
  const details = page.locator('[data-component="relay-node-details"]')
  await expect(details.locator("h2")).toHaveText("New task")
  const saved = page.waitForRequest(
    (request) => request.method() === "PATCH" && request.url().includes("/api/relay/document/relay-wp-execute"),
  )
  await details.getByRole("textbox", { name: "Instructions" }).fill("Record the decision.")
  const body = (await saved).postDataJSON() as {
    nodes: { id: string; position: number[]; parameters: { instructions?: string } }[]
  } & Record<string, unknown>
  expect(Object.keys(body).toSorted()).toEqual([
    "connections",
    "expectedChecksum",
    "name",
    "nodeGroups",
    "nodes",
    "versionId",
  ])
  expect(body.versionId).toBe("relay-wp-execute-v4")
  expect(body.nodes.every((node) => node.position.every(Number.isInteger))).toBe(true)
  expect(body.nodes.find((node) => node.id === "execute")?.parameters.instructions).toBe("Record the decision.")
  await expect(editor(page).locator(".wf-head .wf-save")).toHaveText("Saved")
  await page.keyboard.press("Escape")
  await expect(details).toHaveCount(0)

  await editor(page).getByRole("button", { name: "Publish", exact: true }).click()
  const publish = page.getByRole("dialog", { name: /^Publish / })
  await publish.getByRole("button", { name: "Publish", exact: true }).click()
  await expect(publish).toHaveCount(0)
  const published = state.writes.find((write) => write.path === "/api/relay/document/relay-wp-execute/publish")
  expect(published?.body).toMatchObject({ versionId: expect.stringMatching(/^relay-wp-execute-v\d+$/) })
  await expect(editor(page).locator(".wf-head .mx-badge").first()).toHaveText(/^Published v\d+$/)
  // Publishing does not bring a run button back.
  await expect(editor(page).getByRole("button", { name: "Run", exact: true })).toHaveCount(0)
  expect(state.writes.some((write) => write.path.startsWith("/api/relay/run"))).toBe(false)
})

test("the command palette reaches Workflows and Hooks from any page", async ({ page }) => {
  await setupRelay(page)
  await openWorkflows(page)
  await sidebar(page).getByRole("button", { name: "Search", exact: true }).click()
  await page.getByPlaceholder("Search commands and sessions").fill("Hooks")
  await page.getByRole("option", { name: /^Hooks/ }).click()
  await expect(page).toHaveURL(/\/orchestra\/hooks$/)
})

test("workflow authoring: typed names, failed autosave retry and creation focus", async ({ page }) => {
  const state = await setupRelay(page)
  await openWorkflows(page)
  const create = page.getByRole("button", { name: "New workflow", exact: true })
  await create.click()
  const dialog = page.getByRole("dialog", { name: "New workflow" })
  const name = dialog.getByRole("textbox", { name: "Name", exact: true })
  await expect(name).toBeFocused()
  await name.fill("Keep my workflow name")
  await dialog.getByRole("radio", { name: /Blank workflow/ }).click()
  await expect(name).toHaveValue("Keep my workflow name")
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(create).toBeFocused()

  await page.goto("/orchestra/workflows/relay-wp-execute/node/green.implement")
  const details = page.locator('[data-component="relay-node-details"]')
  const stepName = details.getByRole("textbox", { name: "Name", exact: true })
  await stepName.fill("Review")
  await stepName.pressSequentially(" changes")
  await expect(stepName).toHaveValue("Review changes")

  const path = "**/api/relay/document/relay-wp-execute*"
  await page.route(path, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback()
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ _tag: "RelayUnavailableError", code: "unavailable", message: "Storage unavailable; retry." }) })
  })
  const instructions = details.getByRole("textbox", { name: "Instructions", exact: true })
  await instructions.fill("Keep these unsaved instructions.")
  await expect(details.locator('[data-save="error"]')).toContainText("Storage unavailable; retry.")
  await expect(instructions).toHaveValue("Keep these unsaved instructions.")
  await page.unroute(path)
  await details.getByRole("button", { name: "Try again", exact: true }).click()
  await expect(details.locator('[data-save="saved"]')).toBeVisible()
  const saved = state.writes.filter((write) => write.method === "PATCH").at(-1)?.body as { nodes: { id: string; name: string; parameters: { instructions: string } }[] }
  expect(saved.nodes.find((node) => node.id === "green.implement")).toMatchObject({ name: "Review changes", parameters: { instructions: "Keep these unsaved instructions." } })
})

test("workflow authoring: leaving during autosave serializes later edits against the returned version", async ({ page }) => {
  const state = await setupRelay(page)
  await openWorkflows(page)
  await page.goto("/orchestra/workflows/relay-wp-execute/node/green.implement")
  const details = page.locator('[data-component="relay-node-details"]')
  const pending = Promise.withResolvers<void>()
  const arrived = Promise.withResolvers<void>()
  const requests: { versionId: string; nodes: { id: string; parameters: { instructions: string } }[] }[] = []
  await page.route("**/api/relay/document/relay-wp-execute*", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback()
    requests.push(route.request().postDataJSON())
    if (requests.length === 1) {
      arrived.resolve()
      await pending.promise
    }
    return route.fallback()
  })
  const instructions = details.getByRole("textbox", { name: "Instructions", exact: true })
  await instructions.fill("First edit")
  await arrived.promise
  await instructions.fill("Last edit before leaving")
  await page.keyboard.press("Escape")
  await editor(page).getByRole("link", { name: "Back to Workflows" }).click()
  await expect(page).toHaveURL(/\/orchestra\/workflows$/)
  expect(requests).toHaveLength(1)
  pending.resolve()
  await expect.poll(() => state.writes.filter((write) => write.method === "PATCH").length).toBe(2)
  expect(requests).toHaveLength(2)
  expect(requests[1].versionId).not.toBe(requests[0].versionId)
  expect(requests[1].nodes.find((node) => node.id === "green.implement")?.parameters.instructions).toBe("Last edit before leaving")
})
