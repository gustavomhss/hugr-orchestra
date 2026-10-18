import { expect, test, type Page } from "@playwright/test"
import { adopt, relayState, setupRelay } from "./relay.fixture"

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
  test(`${scheme}: the library lists the user's workflows, keeps the shipped profiles as templates, and hides runs`, async ({
    page,
  }) => {
    const state = await setupRelay(page, { scheme })
    // Two profiles are copies the user owns here (published, and never published); the others stay templates.
    adopt(state, "relay-tdd_feature")
    adopt(state, "relay-design")
    await openWorkflows(page)
    const view = page.locator('[data-mx-page="orchestra-workflows"]')
    await expect(view.locator(".mx-eyebrow")).toHaveText("orchestra-canonical · Automation")
    const rows = view.getByRole("listitem")
    await expect(rows.locator("strong")).toHaveText(["Relay · tdd_feature", "Relay · design"])
    const row = (name: string) => rows.filter({ has: page.getByText(name, { exact: true }) })
    await expect(row("Relay · tdd_feature").locator(".wf-badges .mx-badge")).toHaveText(["Published"])
    await expect(row("Relay · design").locator(".wf-badges .mx-badge")).toHaveText(["Not published"])
    // Runs are hidden: no live runs, no last-run column, no waiting count and no run button on a row.
    await expect(view.locator(".wf-attn")).toHaveCount(0)
    await expect(row("Relay · tdd_feature").locator(".wf-last")).toHaveCount(0)
    await expect(sidebar(page).locator('[data-slot="orchestra-nav-attention"]')).toHaveCount(0)
    for (const name of ["Relay · tdd_feature", "Relay · design"])
      await expect(row(name).getByRole("button", { name: `Run ${name}` })).toHaveCount(0)

    // Only a profile that can run is a template, under its own name.
    const templates = view.locator(".wf-tpl-grid .wf-tpl h3")
    await expect(templates).toHaveText(["Start from scratch", "Build one work package"])
    await expect(view.locator('.wf-tpl[aria-disabled="true"]')).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath(`${scheme}-library.png`) })

    await view.getByRole("textbox", { name: "Search workflows" }).fill("TDD")
    await expect(rows.locator("strong")).toHaveText(["Relay · tdd_feature"])
    await view.getByRole("textbox", { name: "Search workflows" }).fill("")
    await view.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: "Published" }).click()
    await expect(rows.locator("strong")).toHaveText(["Relay · tdd_feature"])

    await expect(view.getByRole("tab", { name: /Executions/ })).toHaveCount(0)
    // A bookmarked executions URL opens the library.
    await page.goto("/orchestra/workflows/executions", { waitUntil: "domcontentloaded" })
    await expect(view.locator("h1")).toHaveText("Workflows")
    await expect(view.getByRole("listitem").locator("strong")).toHaveText(["Relay · tdd_feature", "Relay · design"])
  })
}

test("shipped profiles are templates only, so a project with none of its own shows the empty state", async ({
  page,
}) => {
  await setupRelay(page)
  await openWorkflows(page)
  const view = page.locator('[data-mx-page="orchestra-workflows"]')
  await expect(view.getByRole("listitem")).toHaveCount(0)
  await expect(view.locator(".wf-empty strong")).toHaveText("No workflows in this project yet")
  await expect(view.locator(".wf-tpl-grid .wf-tpl h3")).toHaveText([
    "Start from scratch",
    "Test-driven feature",
    "Build one work package",
  ])
  // The header button starts from scratch too, not from a template.
  await view.getByRole("button", { name: "New workflow", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "New workflow" })
  await expect(dialog.getByRole("radio", { name: /Start from scratch/ })).toHaveAttribute("aria-checked", "true")
  await expect(dialog.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Blank workflow")
})

test("the library counts its filters, says why one is empty and keeps search and filter after an editor", async ({
  page,
}) => {
  const state = await setupRelay(page)
  adopt(state, "relay-wp-execute")
  adopt(state, "relay-design")
  await openWorkflows(page)
  const view = page.locator('[data-mx-page="orchestra-workflows"]')
  const rows = view.getByRole("listitem")
  const filters = view.getByRole("group", { name: "Filter by status" })
  // A published workflow with newer edits is waiting to be published, so it counts as a draft too.
  await expect(filters.getByRole("button")).toHaveText([/^All\s*2$/, /^Published\s*1$/, /^Drafts\s*2$/])
  await expect(rows.filter({ hasText: "Relay · wp-execute" }).locator(".wf-badges .mx-badge")).toHaveText([
    "Published",
    "Unpublished changes",
  ])

  await filters.getByRole("button", { name: "Drafts" }).click()
  await view.getByRole("textbox", { name: "Search workflows" }).fill("design")
  await expect(rows.locator("strong")).toHaveText(["Relay · design"])
  await rows.filter({ hasText: "Relay · design" }).click()
  await expect(page).toHaveURL(/\/orchestra\/workflows\/relay-design$/)
  await editor(page).getByRole("link", { name: "Back to Workflows" }).click()
  await expect(view.getByRole("textbox", { name: "Search workflows" })).toHaveValue("design")
  await expect(filters.getByRole("button", { name: "Drafts" })).toHaveAttribute("aria-pressed", "true")

  await view.getByRole("textbox", { name: "Search workflows" }).fill("")
  await filters.getByRole("button", { name: "Published" }).click()
  await expect(rows.locator("strong")).toHaveText(["Relay · wp-execute"])
  await view.getByRole("textbox", { name: "Search workflows" }).fill("design")
  await expect(view.getByText("No workflows match your search.")).toBeVisible()
})

test("a library with nothing published says so for the Published filter", async ({ page }) => {
  const state = await setupRelay(page)
  adopt(state, "relay-design")
  await openWorkflows(page)
  const view = page.locator('[data-mx-page="orchestra-workflows"]')
  await view.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: "Published" }).click()
  await expect(view.getByText("Nothing is published yet. Publish a workflow to let Maestro use it.")).toBeVisible()
})

test("the row menu renames a workflow and the duplicate gets a free name", async ({ page }) => {
  const state = await setupRelay(page)
  adopt(state, "relay-design")
  await openWorkflows(page)
  const row = page.locator('[data-document="relay-design"]')
  await row.locator('button[aria-haspopup="menu"]').click()
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Rename workflow" })
  await dialog.getByRole("textbox", { name: "Name" }).fill("Design review")
  await dialog.getByRole("button", { name: "Rename", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row.locator("strong")).toHaveText("Design review")
  expect(state.writes.find((write) => write.method === "PATCH")?.body).toMatchObject({ name: "Design review" })

  for (const expected of ["Design review (copy)", "Design review (copy 2)"]) {
    await row.locator('button[aria-haspopup="menu"]').click()
    await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click()
    await expect(page).toHaveURL(/\/orchestra\/workflows\/doc-\d+$/)
    expect(state.documents.some((document) => document.name === expected)).toBe(true)
    // Back lands on the library, not on the dialog or a dead entry.
    await page.goBack()
    await expect(page).toHaveURL(/\/orchestra\/workflows$/)
  }
})

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

test("outside git the library refuses new workflows and says why, even on the New workflow route", async ({ page }) => {
  await setupRelay(page)
  // Every folder outside git resolves to the one global project those folders share.
  await page.route("**/api/project/current**", (route) => route.fulfill({ json: { id: "global", directory: "/" } }))
  await page.goto("/orchestra/workflows/new")
  const view = page.locator('[data-mx-page="orchestra-workflows"]')
  await expect(view.locator('[data-slot="relay-repository-required"]')).toHaveText(
    "Hooks and workflows need a git repository. This folder isn't one, so they would apply to every non-repository folder.",
  )
  await expect(view.locator(".wf-xlink")).not.toContainText("Available to every agent session")
  await expect(page.getByRole("dialog", { name: "New workflow" })).toHaveCount(0)
  await expect(view.getByRole("button", { name: "New workflow", exact: true })).toBeDisabled()
  await expect(view.locator(".wf-tpl-grid .wf-tpl").first()).toBeDisabled()
})

test("a template that can run is copied as the user's own workflow; one that cannot is not offered", async ({ page }) => {
  const state = await setupRelay(page)
  await page.goto("/orchestra/workflows/new")
  const dialog = page.getByRole("dialog", { name: "New workflow" })
  // Starting from scratch is the default, and a template shows under its own name.
  await expect(dialog.getByRole("radio", { name: /Start from scratch/ })).toHaveAttribute("aria-checked", "true")
  await expect(dialog.getByRole("radio", { name: /Relay · / })).toHaveCount(0)
  // A profile whose tools are missing is not offered at all.
  await expect(dialog.locator('[data-template="relay-design"]')).toHaveCount(0)
  await dialog.getByRole("radio", { name: /Build one work package/ }).click()
  await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Build one work package")
  await dialog.getByRole("textbox", { name: "Name" }).fill("WP-07 Session recovery")
  await dialog.getByRole("textbox", { name: /What is it for/ }).fill("Recover a session after a crash.")
  await dialog.getByRole("button", { name: "Create and open" }).click()
  await expect(page).toHaveURL(/\/orchestra\/workflows\/doc-\d+$/)
  const created = state.writes.find((write) => write.method === "POST" && write.path === "/api/relay/document")
  const body = created?.body as {
    name: string
    description: string
    nodes: unknown[]
    meta: { relay: { profile?: string } }
  }
  // The copy drops the profile mark, so it is not listed as a template.
  expect([body.name, body.description, body.nodes.length, body.meta.relay.profile]).toEqual([
    "WP-07 Session recovery",
    "Recover a session after a crash.",
    14,
    undefined,
  ])
  await expect(editor(page).locator(".wf-name")).toHaveValue("WP-07 Session recovery")
})

test("a copy of the test-driven template carries none of the profile's sample content", async ({ page }) => {
  const state = await setupRelay(page)
  await page.goto("/orchestra/workflows/new")
  const dialog = page.getByRole("dialog", { name: "New workflow" })
  await dialog.getByRole("radio", { name: /Test-driven feature/ }).click()
  await dialog.getByRole("button", { name: "Create and open" }).click()
  await expect(page).toHaveURL(/\/orchestra\/workflows\/doc-\d+$/)
  const created = state.writes.find((write) => write.method === "POST" && write.path === "/api/relay/document")
  const nodes = (created?.body as { nodes: { type: string; parameters: Record<string, unknown> }[] }).nodes
  expect(nodes.find((node) => node.type === "relay.startTrigger")?.parameters.relayBrief).toBe("")
  expect(nodes.filter((node) => node.type === "relay.inject").map((node) => node.parameters.text)).toEqual([""])
  expect(nodes.some((node) => /\b(skill|protocol)\b/i.test(String(node.parameters.instructions)))).toBe(false)
})

test("canvas: inspect a step, walk to its neighbour and close only the top layer", async ({ page }) => {
  const state = await setupRelay(page)
  adopt(state, "relay-wp-execute")
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
  // Runs are hidden, so the step dialog is the Parameters column alone.
  await expect(details.getByRole("region", { name: "Parameters" })).toBeVisible()
  await expect(details.getByRole("region", { name: "Output" })).toHaveCount(0)
  await expect(details.getByRole("region", { name: "Input" })).toHaveCount(0)
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
  await panel.getByRole("option", { name: /Agent step/ }).click()
  const details = page.locator('[data-component="relay-node-details"]')
  await expect(details.locator("h2")).toHaveText("Agent step")
  const saved = page.waitForRequest(
    (request) => request.method() === "PATCH" && request.url().includes("/api/relay/document/relay-wp-execute"),
  )
  await details.getByRole("textbox", { name: "Instructions" }).fill("Record the decision.")
  const body = (await saved).postDataJSON() as {
    nodes: { id: string; position: number[]; parameters: { instructions?: string } }[]
  } & Record<string, unknown>
  expect(Object.keys(body).toSorted()).toEqual([
    "connections",
    "description",
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
  await expect(editor(page).locator(".wf-head .mx-badge").first()).toHaveText("Published")
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

test("workflow authoring: double-clicking New workflow leaves the dialog open", async ({ page }) => {
  await setupRelay(page)
  await openWorkflows(page)
  await page.getByRole("button", { name: "New workflow", exact: true }).dblclick()
  await expect(page.getByRole("dialog", { name: "New workflow" })).toBeVisible()
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
  await dialog.getByRole("radio", { name: /Start from scratch/ }).click()
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
