import { expect, test, type Page } from "@playwright/test"
import { relayState, setupRelay } from "./relay.fixture"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "en-US" })
test.setTimeout(180_000)

const sidebar = (page: Page) => page.locator(".orchestra-sidebar")
const editor = (page: Page) => page.locator('[data-component="relay-editor"]')
const canvas = (page: Page) => page.locator('[data-component="relay-canvas"]')
const RUNS_MISSING = "This server cannot run workflows yet. Runs, receipts and audits appear here once it can."
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
  test(`${scheme}: the library lists the seeded profiles, and runs say the server cannot run them yet`, async ({
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
    // No live runs, no fabricated last runs and no waiting count while the run routes are missing.
    await expect(view.locator(".wf-attn")).toHaveCount(0)
    await expect(row("Relay · wp-execute").locator(".wf-last")).toHaveCount(0)
    await expect(sidebar(page).locator('[data-slot="orchestra-nav-attention"]')).toHaveCount(0)
    const run = row("Relay · wp-execute").getByRole("button", { name: "Run Relay · wp-execute" })
    await expect(run).toBeDisabled()
    await expect(run).toHaveAttribute("title", "This server cannot run workflows yet")
    await expect(row("Relay · design").getByRole("button", { name: "Run Relay · design" })).toHaveAttribute(
      "title",
      "Needs Relay tools that are not available yet, so it cannot run",
    )

    const templates = view.locator(".wf-tpl-grid .wf-tpl h3")
    await expect(templates).toHaveText([
      "Blank workflow",
      "Relay · tdd_feature",
      "Relay · wp-execute",
      "Relay · design",
      "Relay · planning",
      "Relay · research-v2",
      "Relay · spec-decompose",
    ])
    const blocked = view.locator('.wf-tpl[aria-disabled="true"]')
    await expect(blocked).toHaveCount(4)
    await expect(blocked.locator(".mx-badge.warm")).toHaveText(Array(4).fill("Needs tools not available yet"))
    await page.screenshot({ path: test.info().outputPath(`${scheme}-library.png`) })

    await view.getByRole("textbox", { name: "Search workflows" }).fill("TDD")
    await expect(rows.locator("strong")).toHaveText(["Relay · tdd_feature"])
    await view.getByRole("textbox", { name: "Search workflows" }).fill("")
    await view.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: "Published" }).click()
    await expect(rows.locator("strong")).toHaveText(["Relay · wp-execute", "Relay · tdd_feature"])

    await view.getByRole("tab", { name: /Executions/ }).click()
    await expect(page).toHaveURL(/\/orchestra\/workflows\/executions$/)
    await expect(view.locator('[data-slot="relay-runs-unsupported"]')).toHaveText(RUNS_MISSING)
    await expect(page.locator('[data-slot="orchestra-titlebar-breadcrumb"]')).toHaveText(/Workflows\s*\/\s*Executions/)
    await page.goBack()
    await expect(page).toHaveURL(/\/orchestra\/workflows$/)
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

test("a template that can run is copied with its profile mark; one that cannot is not offered", async ({ page }) => {
  const state = await setupRelay(page)
  await page.goto("/orchestra/workflows/new")
  const dialog = page.getByRole("dialog", { name: "New workflow" })
  await expect(dialog.getByRole("radio", { name: /Relay · tdd_feature/ })).toHaveAttribute("aria-checked", "true")
  // A profile whose tools are missing is shown, but cannot be picked.
  await expect(dialog.getByRole("radio", { name: /Relay · design/ })).toHaveAttribute("aria-disabled", "true")
  await expect(dialog.getByRole("radio", { name: /Relay · design/ })).toHaveAttribute("aria-checked", "false")
  await dialog.getByRole("radio", { name: /Relay · wp-execute/ }).click()
  await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Relay · wp-execute copy")
  await dialog.getByRole("textbox", { name: "Name" }).fill("WP-07 Session recovery")
  await dialog.getByRole("button", { name: "Create and open" }).click()
  await expect(page).toHaveURL(/\/orchestra\/workflows\/doc-\d+$/)
  const created = state.writes.find((write) => write.method === "POST" && write.path === "/api/relay/document")
  const body = created?.body as { name: string; nodes: unknown[]; meta: { relay: { profile: string } } }
  expect([body.name, body.nodes.length, body.meta.relay.profile]).toEqual(["WP-07 Session recovery", 14, "wp-execute"])
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
  await expect(editor(page).getByRole("button", { name: "Run", exact: true })).toBeDisabled()

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

  await editor(page)
    .getByRole("tab", { name: /Executions/ })
    .click()
  await expect(page.locator('[data-slot="relay-runs-unsupported"]')).toHaveText(RUNS_MISSING)
  await editor(page).getByRole("button", { name: "Back to Workflows" }).click()
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
  const publish = page.getByRole("dialog", { name: /Publish v/ })
  await publish.getByRole("button", { name: /Publish v/ }).click()
  await expect(publish).toHaveCount(0)
  const published = state.writes.find((write) => write.path === "/api/relay/document/relay-wp-execute/publish")
  expect(published?.body).toMatchObject({ versionId: expect.stringMatching(/^relay-wp-execute-v\d+$/) })
  await expect(editor(page).locator(".wf-head .mx-badge").first()).toHaveText(/^Published v\d+$/)
  // Publishing does not make the missing run routes appear.
  await expect(editor(page).getByRole("button", { name: "Run", exact: true })).toBeDisabled()
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
