import { expect, test, type Page } from "@playwright/test"
import { setupRelay } from "./relay.fixture"
import { expandAdvanced } from "./compact-navigation.fixture"

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
    await expandAdvanced(page)
    const hooks = sidebar(page).getByRole("button", { name: "Hooks", exact: true })
    await expect(hooks.locator('[data-slot="orchestra-nav-wip"]')).toHaveCount(0)
    await hooks.click()
    await expect(page).toHaveURL(/\/orchestra\/hooks$/)
    await expect(page.locator('[data-slot="orchestra-wip"]')).toHaveCount(0)
    const view = page.locator('[data-mx-page="orchestra-hooks"]')
    const row = (name: string) => view.getByRole("listitem").filter({ hasText: name })
    await expect(row("Protect generated files").getByRole("switch")).toHaveAttribute("aria-checked", "true")
    await expect(row("Protect generated files")).toContainText(/Blocked · \d+ min ago/)
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
    // "Allowed" rows stay hidden until asked for.
    await expect(fires).toHaveCount(4)
    await expect(fires.first()).toContainText("src/generated/client.ts")
    await expect(fires.first().locator(".mx-badge")).toHaveText("Blocked")
    // A command's subject is its sha256, never its text, so the row names the event instead of the hash.
    const command = fires.filter({ hasText: "Before shell command" })
    await expect(command.locator("strong")).toHaveText("Shell command — text not stored")
    await expect(command.locator(".mx-badge")).toHaveText("Approved")
    await expect(command.getByRole("button", { name: "Open session" })).toHaveAttribute("title", "ses_tabs")
    await view.getByRole("button", { name: "Show allowed (2)" }).click()
    await expect(fires).toHaveCount(6)
    const results = view.getByRole("group", { name: "Filter by result" })
    await results.getByRole("button", { name: /^Approved/ }).click()
    await expect(fires).toHaveCount(1)
    await results.getByRole("button", { name: /^All\s*\d+$/ }).click()
    await view.getByRole("combobox", { name: "Filter by hook" }).selectOption({ label: "Protect generated files" })
    await expect(fires).toHaveCount(5)
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

test("held node types and ledgers leave the shell and the hook list usable", async ({ page }) => {
  await setupRelay(page)
  const gate = Promise.withResolvers<void>()
  await page.route(/\/api\/relay\/(node-types|hook\/[^/]+\/decisions)/, async (route) => {
    await gate.promise
    return route.fallback()
  })
  await page.goto("/orchestra/hooks")
  const view = page.locator('[data-mx-page="orchestra-hooks"]')
  const protect = view.getByRole("listitem").filter({ hasText: "Protect generated files" })
  // The rows come from the documents and installs alone; the held reads only delay the last decision and the count.
  await expect(sidebar(page)).toBeVisible()
  await expect(protect.getByRole("switch")).toHaveAttribute("aria-checked", "true")
  await expect(protect).not.toContainText("Blocked")
  await expect(view.getByRole("tab", { name: /Activity/ })).not.toContainText("6")
  gate.resolve()
  await expect(protect).toContainText(/Blocked · \d+ min ago/)
  await expect(view.getByRole("tab", { name: /Activity/ })).toContainText("6")
})

test("a refresh that fails keeps the hook list and offers a retry beside it", async ({ page }) => {
  await setupRelay(page)
  const refresh = { fail: false }
  await page.route(/\/api\/relay\/document(\?|$)/, (route) =>
    refresh.fail
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ _tag: "RelayInvalidError", code: "invalid-request", message: "Refresh refused" }),
        })
      : route.fallback(),
  )
  await page.goto("/orchestra/hooks")
  await expandAdvanced(page)
  const view = page.locator('[data-mx-page="orchestra-hooks"]')
  const protect = view.getByRole("listitem").filter({ hasText: "Protect generated files" })
  await expect(protect).toBeVisible()
  await sidebar(page).getByRole("button", { name: "Skills", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/skills$/)
  refresh.fail = true
  // Opening the chapter again refetches the library, which the cache still holds from the first visit.
  const failed = page.waitForResponse(
    (response) => response.status() === 500 && /\/api\/relay\/document(\?|$)/.test(response.url()),
  )
  await sidebar(page).getByRole("button", { name: "Hooks", exact: true }).click()
  await failed
  await expect(view.getByRole("alert")).toContainText("Could not load hooks")
  await expect(view.getByRole("button", { name: "Try again" })).toBeVisible()
  await expect(protect).toBeVisible()
  refresh.fail = false
  await view.getByRole("button", { name: "Try again" }).click()
  await expect(view.getByRole("alert")).toHaveCount(0)
  await expect(protect).toBeVisible()
})

test("outside git the page refuses new hooks and offers to remove the ones installed earlier", async ({ page }) => {
  const state = await setupRelay(page)
  // Every folder outside git resolves to the one global project those folders share.
  await page.route("**/api/location**", (route) =>
    route.fulfill({ json: { directory: "/", project: { id: "global", directory: "/" } } }),
  )
  await page.goto("/orchestra/hooks")
  const view = page.locator('[data-mx-page="orchestra-hooks"]')
  await expect(view.locator('[data-slot="relay-repository-required"]')).toHaveText(
    "Hooks and workflows need a git repository with at least one commit. This folder has no repository or no first commit yet, so they would apply to every such folder.",
  )
  await expect(view.locator(".hk-scope")).not.toContainText("Applies to every agent session")
  await expect(view.getByRole("button", { name: "New hook", exact: true })).toBeDisabled()
  await expect(view.locator('[data-template="ask-shell"]')).toBeDisabled()
  const row = (name: string) => view.getByRole("listitem").filter({ hasText: name })
  await expect(row("Typecheck when a session stops").getByRole("switch")).toBeDisabled()
  // An earlier install can still be paused.
  await expect(row("Protect generated files").getByRole("switch")).toBeEnabled()
  await view
    .locator('[data-slot="relay-shared-installs"]')
    .getByRole("button", { name: "Uninstall Protect generated files" })
    .click()
  await page
    .getByRole("dialog", { name: "Uninstall Protect generated files?" })
    .getByRole("button", { name: "Uninstall", exact: true })
    .click()
  await expect
    .poll(() => state.writes.map((write) => `${write.method} ${write.path}`))
    .toEqual(["DELETE /api/relay/hook/inst-protect"])
})

test("a damaged hooks file shows the repair banner, and the reset refreshes the installs", async ({ page }) => {
  await setupRelay(page)
  let damaged = true
  const repairs: unknown[] = []
  await page.route("**/api/relay/hook**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === "/api/relay/hook/repair") {
      damaged = false
      repairs.push(request.postDataJSON())
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ location: {}, data: { backup: "/data/hooks.json.corrupt-1-ab", installs: [] } }),
      })
    }
    if (!damaged || path !== "/api/relay/hook" || request.method() !== "GET") return route.fallback()
    return route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ _tag: "RelayConflictError", code: "profile-invalid", message: "hooks.json is not JSON." }),
    })
  })
  await page.goto("/orchestra/hooks")
  const banner = page.locator("[data-hook-damaged]")
  await expect(banner).toContainText("The hooks file is damaged — agent tools in this project are blocked")
  await expect(page.getByRole("switch")).toHaveCount(0)
  await banner.getByRole("button", { name: "Back up and reset installed hooks" }).click()
  await page
    .getByRole("dialog", { name: "Back up and reset installed hooks?" })
    .getByRole("button", { name: "Back up and reset", exact: true })
    .click()
  await expect(banner).toHaveCount(0)
  expect(repairs).toEqual([{ confirm: true }])
  await expect(page.getByRole("switch").first()).toBeVisible()
})

test("New hook starts from Blank, even after a template was opened and cancelled", async ({ page }) => {
  await setupRelay(page)
  await page.goto("/orchestra/hooks")
  const view = page.locator('[data-mx-page="orchestra-hooks"]')
  await view.locator('[data-template="ask-shell"]').click()
  const dialog = page.getByRole("dialog", { name: "New hook", exact: true })
  await expect(dialog.getByRole("radio", { name: /Ask before risky commands/ })).toHaveAttribute("aria-checked", "true")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await view.getByRole("button", { name: "New hook", exact: true }).click()
  await expect(dialog.getByRole("radio", { name: /Blank hook/ })).toHaveAttribute("aria-checked", "true")
})

test("hook canvas: Yes and No ports, Pass and Fail on a Run gate, and a test walk", async ({ page }) => {
  await setupRelay(page)
  await page.goto("/orchestra/hooks/protect-generated")
  await expect(canvas(page).locator(".wf-node")).toHaveCount(4)
  await expect(canvas(page).locator(".wf-port-label")).toHaveText(["Yes", "No"])
  await expect(canvas(page).locator(".wf-banner")).toContainText("Installed in orchestra-canonical · v2 · Blocked")
  await expect(page.getByRole("switch", { name: "Installed in this project" })).toHaveAttribute("aria-checked", "true")

  await page.getByRole("button", { name: "Test", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Test hook" })
  await dialog.getByRole("textbox", { name: "File path" }).fill("src/generated/types.gen.ts")
  await dialog.getByRole("button", { name: "Run test" }).click()
  await expect(canvas(page).locator(".wf-banner")).toContainText(
    "Draft test · src/generated/types.gen.ts → Block change",
  )
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
    "Before create or overwrite file",
    "After create or overwrite file",
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
  await details(page).getByRole("button", { name: "Or match another pattern" }).click()
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
