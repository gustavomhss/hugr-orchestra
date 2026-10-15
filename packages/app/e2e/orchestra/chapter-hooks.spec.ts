import { expect, test, type Page } from "@playwright/test"
import { setupRelay } from "./relay.fixture"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "en-US" })
test.setTimeout(180_000)

const sidebar = (page: Page) => page.locator(".orchestra-sidebar")
const canvas = (page: Page) => page.locator('[data-component="relay-canvas"]')
const details = (page: Page) => page.locator('[data-component="relay-node-details"]')

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: the hooks library shows installs and the ledger's last decision, without the WIP mark`, async ({
    page,
  }) => {
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
    await expect(row("Protect generated files")).toContainText(/Blocked · 1[89] min ago/)
    await expect(row("Protect generated files").locator(".wf-oneline")).toHaveText(
      "Before edit file → Path matches → Block change",
    )
    await expect(row("Typecheck when a session stops").locator(".wf-oneline")).toHaveText(
      "On session stop → Run gate → Record",
    )
    await expect(row("Read instructions first").getByRole("switch")).toBeDisabled()
    await expect(view.getByRole("tab", { name: /Activity/ })).toContainText("6")
    await page.screenshot({ path: test.info().outputPath(`${scheme}-hooks.png`) })

    await view.getByRole("tab", { name: /Activity/ }).click()
    await expect(page).toHaveURL(/\/orchestra\/hooks\/activity$/)
    const fires = view.getByRole("listitem")
    await expect(fires).toHaveCount(6)
    await expect(fires.first()).toContainText("src/generated/client.ts")
    await expect(fires.first().locator(".mx-badge")).toHaveText("Blocked")
    // A command's subject is its sha256, never its text.
    const command = fires.filter({ hasText: "command.before" })
    await expect(command.locator("strong")).toHaveText("command sha256 5b8c0f1f2d0b…")
    await expect(command.locator(".mx-badge")).toHaveText("Approved")
  })
}

test("install sends the document only; the server pins the published version", async ({ page }) => {
  const state = await setupRelay(page)
  await page.goto("/orchestra/hooks")
  const view = page.locator('[data-mx-page="orchestra-hooks"]')
  const typecheck = view.getByRole("listitem").filter({ hasText: "Typecheck when a session stops" })
  await typecheck.getByRole("switch").click()
  await expect(typecheck.getByRole("switch")).toHaveAttribute("aria-checked", "true")
  const protect = view.getByRole("listitem").filter({ hasText: "Protect generated files" })
  await protect.getByRole("switch").click()
  await expect(protect.getByRole("switch")).toHaveAttribute("aria-checked", "false")
  expect(state.writes).toEqual([
    { method: "POST", path: "/api/relay/hook", body: { document: "typecheck-stop" } },
    { method: "POST", path: "/api/relay/hook/inst-protect/disable", body: null },
  ])
  expect(state.installs.find((item) => item.document === "typecheck-stop")?.version).toBe("typecheck-stop-v1")
})

test("hook canvas: Yes and No ports, Pass and Fail on a Run gate, and a test walk", async ({ page }) => {
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

  await page.goto("/orchestra/hooks/typecheck-stop")
  await expect(canvas(page).locator(".wf-port-label")).toHaveText(["Pass", "Fail"])
})

test("trigger events come from the contract and Block refuses an After event", async ({ page }) => {
  await setupRelay(page)
  await page.goto("/orchestra/hooks/protect-generated/node/t")
  const event = details(page).getByRole("combobox", { name: "Event" })
  await expect(event.locator("option")).toHaveText([
    "Before read file",
    "After read file",
    "Before edit file",
    "After edit file",
    "Before create file",
    "After create file",
    "Before shell command",
    "After shell command",
    "Before any tool",
    "After any tool",
    "On session start",
    "Before prompt",
    "On session stop",
  ])
  await event.selectOption({ label: "After edit file" })
  await expect(details(page).locator("h2")).toHaveText("After edit file")
  await details(page).getByRole("button", { name: "Next: Path matches" }).click()
  await details(page).getByRole("button", { name: "Next: Block change" }).click()
  await expect(details(page).locator(".wf-alert")).toContainText("Block change needs a Before event.")
  await page.keyboard.press("Escape")
  await expect(page).toHaveURL(/\/orchestra\/hooks\/protect-generated$/)
})

test("a | in a pattern is literal, so a second pattern is another condition on No", async ({ page }) => {
  const state = await setupRelay(page)
  await page.goto("/orchestra/hooks/ask-shell/node/push")
  await expect(details(page).locator(".mx-hint")).toContainText("A | is matched literally")
  const saved = page.waitForRequest(
    (request) => request.method() === "PATCH" && request.url().includes("/api/relay/document/ask-shell"),
  )
  await details(page).getByRole("button", { name: "Add condition" }).click()
  await expect(details(page).locator("h2")).toHaveText("Push command 2")
  const body = (await saved).postDataJSON() as {
    nodes: { id: string; name: string }[]
    connections: Record<string, { main: { node: string }[][] }>
  }
  expect(body.nodes.map((node) => node.name)).toContain("Push command 2")
  expect(body.connections["Push command"]?.main.map((channel) => channel.map((edge) => edge.node))).toEqual([
    ["Ask"],
    ["Push command 2"],
  ])
  expect(body.connections["Push command 2"]?.main.map((channel) => channel.map((edge) => edge.node))).toEqual([
    ["Ask"],
    ["Recursive delete"],
  ])
  expect(state.writes.every((write) => !JSON.stringify(write.body).includes(" | "))).toBe(true)
})
