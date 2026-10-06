import { expect, test, type Page } from "@playwright/test"
import { relayState, setupRelay } from "./relay.fixture"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "en-US" })
test.setTimeout(180_000)

const sidebar = (page: Page) => page.locator(".orchestra-sidebar")
const editor = (page: Page) => page.locator('[data-component="relay-editor"]')
const canvas = (page: Page) => page.locator('[data-component="relay-canvas"]')

async function openWorkflows(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await sidebar(page).getByRole("button", { name: "Workflows", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/workflows$/)
  await expect(page.locator('[data-mx-page="orchestra-workflows"] h1')).toHaveText("Workflows")
}

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: library lists workflows, live runs and the waiting count, and every view has a URL`, async ({
    page,
  }) => {
    await setupRelay(page, { scheme })
    await openWorkflows(page)
    const view = page.locator('[data-mx-page="orchestra-workflows"]')
    await expect(sidebar(page).locator('[data-slot="orchestra-nav-attention"]')).toContainText("1")
    await expect(view.locator(".mx-eyebrow")).toHaveText("orchestra-canonical / profile automation")
    await expect(view.getByRole("tab", { name: /Workflows/ })).toHaveAttribute("aria-selected", "true")
    await expect(view.locator(".wf-attn .mx-row strong")).toHaveText([
      "Run #1042 · Governed WP execution",
      "Run #311 · Spec decomposition",
    ])
    const rows = view.getByRole("listitem")
    await expect(rows.locator("strong")).toHaveText([
      "Governed WP execution",
      "Spec decomposition",
      "Wave planning",
      "Product design",
      "Research brief",
    ])
    await expect(rows.first().locator(".wf-badges .mx-badge")).toHaveText(["Published v3", "Draft v4"])
    await expect(rows.last().locator(".wf-badges .mx-badge")).toHaveText("Draft v2 · not published")
    await expect(rows.last().getByRole("button", { name: "Run Research brief" })).toBeDisabled()
    await page.screenshot({ path: test.info().outputPath(`${scheme}-library.png`) })

    await view.getByRole("textbox", { name: "Search workflows" }).fill("WAVE")
    await expect(rows.locator("strong")).toHaveText(["Wave planning"])
    await view.getByRole("textbox", { name: "Search workflows" }).fill("")
    await view.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: "Drafts" }).click()
    await expect(rows.locator("strong")).toHaveText(["Research brief"])

    await view.getByRole("tab", { name: /Executions/ }).click()
    await expect(page).toHaveURL(/\/orchestra\/workflows\/executions$/)
    await expect(view.getByRole("listitem")).toHaveCount(8)
    await view
      .getByRole("group", { name: "Filter runs" })
      .getByRole("button", { name: /Awaiting human/ })
      .click()
    await expect(view.getByRole("listitem").locator("strong")).toHaveText("#1042 · Governed WP execution")
    await page.screenshot({ path: test.info().outputPath(`${scheme}-executions.png`) })
    await view.getByRole("listitem").click()
    await expect(page).toHaveURL(/\/orchestra\/workflows\/wp-execute\/executions\/1042$/)
    await expect(page.locator('[data-slot="orchestra-titlebar-breadcrumb"]')).toHaveText(
      /Workflows\s*\/\s*Governed WP execution\s*\/\s*Executions\s*\/\s*Run #1042/,
    )
    await page.goBack()
    await expect(page).toHaveURL(/\/orchestra\/workflows\/executions$/)
  })
}

test("a server without Relay routes says so and shows no count", async ({ page }) => {
  const state = relayState()
  state.supported = false
  await setupRelay(page, { state })
  await openWorkflows(page)
  await expect(page.locator('[data-slot="relay-unsupported"]')).toHaveText(
    "This server does not support workflows yet.",
  )
  await expect(sidebar(page).locator('[data-slot="orchestra-nav-attention"]')).toHaveCount(0)
  await sidebar(page).getByRole("button", { name: "Hooks", exact: true }).click()
  await expect(page.locator('[data-slot="relay-unsupported"]')).toHaveText("This server does not support hooks yet.")
})

test("canvas: open a workflow, inspect a step, walk to its neighbour and close only the top layer", async ({
  page,
}) => {
  await setupRelay(page)
  await openWorkflows(page)
  await page.getByRole("listitem").filter({ hasText: "Governed WP execution" }).click()
  await expect(page).toHaveURL(/\/orchestra\/workflows\/wp-execute$/)
  await expect(canvas(page).locator(".wf-node")).toHaveCount(14)
  await expect(canvas(page).locator(".wf-group-head b")).toHaveText([
    "Bind",
    "Red",
    "Green",
    "Refactor",
    "Verification gate",
    "Seal",
  ])
  await expect(canvas(page).locator(".wf-banner")).toContainText("Run #1042 is waiting for you at Verification gate")
  await expect(canvas(page).locator('.wf-node[data-id="gate.gate"] .wf-state-badge')).toHaveClass(/warm/)
  await expect(editor(page).getByRole("tab", { name: /Executions/ })).toContainText("4")

  await canvas(page).locator('.wf-node[data-id="green.implement"] .wf-tile').dblclick()
  await expect(page).toHaveURL(/\/wp-execute\/node\/green\.implement$/)
  const details = page.locator('[data-component="relay-node-details"]')
  await expect(details.locator("h2")).toHaveText("Implement minimally")
  await expect(details.getByRole("region", { name: "Output" })).toContainText("green-changed-the-source")
  await details.getByRole("button", { name: "Next: Green gate" }).click()
  await expect(page).toHaveURL(/\/node\/green\.gate$/)
  await expect(details.locator("h2")).toHaveText("Green gate")
  await page.keyboard.press("Escape")
  await expect(details).toHaveCount(0)
  await expect(page).toHaveURL(/\/orchestra\/workflows\/wp-execute$/)
  await expect(canvas(page)).toBeVisible()

  await editor(page).getByRole("button", { name: "Back to Workflows" }).click()
  await expect(page).toHaveURL(/\/orchestra\/workflows$/)
})

test("receipt: release asks for a reason, re-checks the gate, and Open step returns with Back to run", async ({
  page,
}) => {
  const state = await setupRelay(page)
  await page.goto("/orchestra/workflows/wp-execute/executions/1042")
  const receipt = page.locator('[data-component="relay-receipt"]')
  await expect(receipt.locator("h2")).toContainText("Run #1042")
  await expect(receipt.locator(".wf-wait-head")).toHaveText("Waiting for you at Verification gate")
  await expect(receipt.locator(".wf-wait-body code")).toHaveText("lints_clean")
  await expect(receipt.locator(".wf-phase b")).toHaveText([
    "Bind",
    "Red",
    "Green",
    "Refactor",
    "Verification gate",
    "Seal",
  ])
  await expect(receipt.locator('[data-step="gate.gate"]')).toContainText("4 / 4")
  await page.screenshot({ path: test.info().outputPath("dark-receipt.png") })

  await receipt.getByRole("button", { name: "Open step" }).click()
  await expect(page).toHaveURL(/\/wp-execute\/run\/1042\/node\/gate\.gate$/)
  const details = page.locator('[data-component="relay-node-details"]')
  await expect(details.getByRole("region", { name: "Output" })).toContainText(
    "Attempt 4 failed and the retry budget (3) is spent.",
  )
  await expect(details.getByRole("button", { name: /Run to here/ })).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(page).toHaveURL(/\/wp-execute\/run\/1042$/)
  await expect(canvas(page).locator(".wf-banner")).toContainText("Viewing run #1042")
  await canvas(page).getByRole("button", { name: "Back to run" }).click()
  await expect(page).toHaveURL(/\/wp-execute\/executions\/1042$/)

  const release = receipt.getByRole("button", { name: "Release and re-check" })
  await expect(release).toBeDisabled()
  await receipt
    .getByRole("textbox", { name: "Release reason (required)" })
    .fill("Fixed the floating promise in recovery.ts")
  await release.click()
  await expect(receipt.locator("h2 .mx-badge")).toHaveText("Running")
  expect(state.writes.filter((write) => write.path.endsWith("/release"))).toEqual([
    {
      method: "POST",
      path: "/api/relay/run/1042/release",
      body: { reason: "Fixed the floating promise in recovery.ts", mode: "recheck" },
    },
  ])
})

test("edit: add a step from the panel, autosave the draft, publish it and start a run", async ({ page }) => {
  const state = await setupRelay(page)
  await page.goto("/orchestra/workflows/wp-execute")
  await expect(canvas(page).locator(".wf-node")).toHaveCount(14)
  await canvas(page).locator('.wf-node[data-id="green.gate"] .wf-tile').click()
  await canvas(page).focus()
  await page.keyboard.press("n")
  await expect(page).toHaveURL(/\/wp-execute\/add$/)
  const panel = page.locator('[data-component="relay-add-panel"]')
  await expect(panel.locator("p").first()).toHaveText("Inserted after Green gate")
  await page.keyboard.press("Escape")
  await expect(panel).toHaveCount(0)
  await expect(page).toHaveURL(/\/wp-execute$/)

  await canvas(page).getByRole("button", { name: "Add step (N)" }).click()
  await panel.getByRole("option", { name: /Run task/ }).click()
  const details = page.locator('[data-component="relay-node-details"]')
  await expect(details.locator("h2")).toHaveText("New task")
  await expect(page).toHaveURL(/\/wp-execute\/node\/execute$/)
  const saved = page.waitForRequest(
    (request) => request.method() === "PATCH" && request.url().includes("/api/relay/document/wp-execute"),
  )
  await details.getByRole("textbox", { name: "Instructions" }).fill("Record the decision.")
  const body = (await saved).postDataJSON() as {
    nodes: { id: string; parameters: { instructions?: string } }[]
    versionId: string
  }
  expect(body.versionId).toBe("wp-execute-v4")
  expect(body.nodes.map((node) => node.id)).toContain("execute")
  await expect(editor(page).locator(".wf-head .wf-save")).toHaveText("Saved")
  await page.keyboard.press("Escape")
  await expect(details).toHaveCount(0)

  await editor(page).getByRole("button", { name: "Publish", exact: true }).click()
  const publish = page.getByRole("dialog", { name: /Publish v/ })
  await publish.getByRole("button", { name: /Publish v/ }).click()
  await expect(publish).toHaveCount(0)
  expect(state.writes.some((write) => write.path === "/api/relay/document/wp-execute/publish")).toBe(true)

  await editor(page).getByRole("button", { name: "Run", exact: true }).click()
  const run = page.getByRole("dialog", { name: "Run Governed WP execution" })
  await expect(run.locator("code")).toContainText(["wp_dir", "base_ref", "test_path"])
  await run.getByRole("textbox", { name: "test_cmd" }).fill("bun test")
  await run.getByRole("button", { name: "Start run" }).click()
  await expect(page).toHaveURL(/\/wp-execute\/executions\/\d+$/)
  const started = state.writes.find((write) => write.path === "/api/relay/run")
  expect(started?.body).toMatchObject({ documentID: "wp-execute", params: { test_cmd: "bun test" } })
})

test("the command palette reaches Workflows and Hooks from any page", async ({ page }) => {
  await setupRelay(page)
  await openWorkflows(page)
  await sidebar(page).getByRole("button", { name: "Search", exact: true }).click()
  await page.getByPlaceholder("Search commands and sessions").fill("Hooks")
  await page.getByRole("option", { name: /^Hooks/ }).click()
  await expect(page).toHaveURL(/\/orchestra\/hooks$/)
})
