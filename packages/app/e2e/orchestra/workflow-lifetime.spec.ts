import { expect, test, type Page } from "@playwright/test"
import { setupRelay } from "./relay.fixture"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "en-US" })
test.setTimeout(120_000)
const workflow = "relay-wp-execute"
const editor = (page: Page) => page.locator('[data-component="relay-editor"]')
const details = (page: Page) => page.locator('[data-component="relay-node-details"]')
const canvas = (page: Page) => page.locator('[data-component="relay-canvas"]')
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const failures: string[] = []
  errors.set(page, failures)
  page.on("pageerror", (error) => failures.push(error.stack ?? error.message))
})
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]))

const located = (data: unknown) => ({ contentType: "application/json", body: JSON.stringify({ location: { directory: "/repo/orchestra-canonical" }, data }) })
const refused = (status: number) => ({ status, contentType: "application/json", body: JSON.stringify({ _tag: status === 409 ? "RelayConflictError" : "RelayUnavailableError", message: status === 409 ? "Changed elsewhere" : "Activity offline" }) })

function version(document: Record<string, unknown>, counter: number, instructions: string) {
  return {
    ...structuredClone(document),
    versionCounter: counter, versionId: `${document.id}-v${counter}`, checksum: String(counter).repeat(64),
    active: false, activeVersionId: null, activeVersion: null,
    updatedAt: `2026-10-11T12:00:0${counter}Z`,
    nodes: (structuredClone(document.nodes) as { id: string; parameters: Record<string, unknown> }[]).map((node) =>
      node.id === "green.implement" ? { ...node, parameters: { ...node.parameters, instructions } } : node,
    ),
  }
}

async function openNode(page: Page, kind = "workflows", id = workflow, node = "green.implement") {
  await page.goto(`/orchestra/${kind}/${id}`, { waitUntil: "domcontentloaded" })
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 })
  await canvas(page).locator(`.wf-node[data-id="${node}"] .wf-tile`).dblclick()
  await expect(details(page)).toBeVisible()
}

async function library(page: Page, kind = "Workflows") {
  await page.keyboard.press("Escape")
  await editor(page).getByRole("link", { name: `Back to ${kind}` }).click()
  await expect(page.locator(`[data-mx-page="orchestra-${kind.toLowerCase()}"] h1`)).toHaveText(kind)
}

for (const entry of ["workflow library pending", "hook library failed", "workflow editor pending"]) {
  test(`lifetime: delete from ${entry} disposes draft and rejects a late ACK`, async ({ page }) => {
    const state = await setupRelay(page)
    const hook = entry.startsWith("hook")
    const id = hook ? "protect-generated" : workflow
    const pending = Promise.withResolvers<void>()
    const arrived = Promise.withResolvers<void>()
    const answered = Promise.withResolvers<void>()
    await page.route(`**/api/relay/document/${id}*`, async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback()
      const ack = { ...structuredClone(state.documents.find((document) => document.id === id)!), ...route.request().postDataJSON(), versionId: "late-ack", versionCounter: 9 }
      arrived.resolve()
      if (!hook) await pending.promise
      await route.fulfill(hook ? refused(503) : located(ack))
      answered.resolve()
    })
    await openNode(page, hook ? "hooks" : "workflows", id, hook ? "b" : "green.implement")
    await details(page).getByRole("textbox", { name: hook ? "Name" : "Instructions", exact: true }).fill("Retained local edit")
    await arrived.promise
    if (hook) await expect(details(page).locator('[data-save="error"]')).toBeVisible()
    expect(await page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })))).toBe(true)
    if (entry.includes("library")) {
      await library(page, hook ? "Hooks" : "Workflows")
      const row = page.locator(`[data-document="${id}"]`)
      await expect(row).toBeVisible()
      await row.locator('button[aria-haspopup="menu"]').click()
    } else {
      await page.keyboard.press("Escape")
      await editor(page).getByRole("button", { name: "More actions", exact: true }).click()
    }
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click()
    await page.getByRole("dialog", { name: /^Delete / }).getByRole("button", { name: "Delete", exact: true }).click()
    await expect(page.getByRole("dialog", { name: /^Delete / })).toHaveCount(0)
    await expect(page.locator(`[data-mx-page="orchestra-${hook ? "hooks" : "workflows"}"] h1`)).toHaveText(hook ? "Hooks" : "Workflows")
    await expect(page.locator(`[data-document="${id}"]`)).toHaveCount(0)
    expect(state.documents.some((document) => document.id === id)).toBe(false)
    expect(await page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })))).toBe(false)
    const response = hook ? undefined : page.waitForResponse((reply) => reply.request().method() === "PATCH" && new URL(reply.url()).pathname === `/api/relay/document/${id}`)
    pending.resolve()
    await answered.promise
    if (response) await (await response).finished()
    await expect.poll(() => page.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })))).toBe(false)
    await expect(page.getByText(/^Unsaved changes:/)).toHaveCount(0)
    await expect(page.locator(`[data-document="${id}"]`)).toHaveCount(0)
    // Switching chapters reads the actual server list again; deletion must survive either path.
    await page.locator(".orchestra-sidebar").getByRole("button", { name: hook ? "Workflows" : "Hooks", exact: true }).click()
    await page.locator(".orchestra-sidebar").getByRole("button", { name: hook ? "Hooks" : "Workflows", exact: true }).click()
    await expect(page.locator(`[data-document="${id}"]`)).toHaveCount(0)
  })
}

async function delayCreate(page: Page) {
  const pending = Promise.withResolvers<void>()
  const arrived = Promise.withResolvers<void>()
  await page.route("**/api/relay/document*", async (route) => {
    if (route.request().method() === "POST" && new URL(route.request().url()).pathname === "/api/relay/document") {
      arrived.resolve()
      await pending.promise
    }
    return route.fallback()
  })
  return { pending, arrived }
}

for (const kind of ["workflow", "hook"]) {
  test(`lifetime: Back during ${kind} create caches success without navigating a replacement dialog`, async ({ page }) => {
    const state = await setupRelay(page)
    const delayed = await delayCreate(page)
    const chapter = kind === "workflow" ? "workflows" : "hooks"
    const title = kind === "workflow" ? "Workflows" : "Hooks"
    const heading = page.locator(`[data-mx-page="orchestra-${chapter}"] h1`)
    await page.goto(`/orchestra/${chapter}`, { waitUntil: "domcontentloaded" })
    await expect(heading).toHaveText(title)
    await page.getByRole("button", { name: `New ${kind}`, exact: true }).click()
    const dialog = page.getByRole("dialog", { name: `New ${kind}`, exact: true })
    await dialog.locator('[role="radio"][data-template="blank"]').click()
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(`Late ${kind}`)
    const response = page.waitForResponse((reply) => reply.request().method() === "POST" && new URL(reply.url()).pathname === "/api/relay/document")
    await dialog.getByRole("button", { name: "Create and open", exact: true }).click()
    await delayed.arrived.promise
    await page.goBack()
    await expect(dialog).toHaveCount(0)
    await expect(heading).toHaveText(title)
    await page.getByRole("button", { name: `New ${kind}`, exact: true }).click()
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Replacement owner draft")
    delayed.pending.resolve()
    const reply = await response
    await reply.finished()
    const created = (await reply.json()).data
    // The positive cache outcome also gates the old action's continuation.
    await expect(page.locator(`[data-document="${created.id}"]`)).toContainText(`Late ${kind}`)
    await expect(page).toHaveURL(new RegExp(`/orchestra/${chapter}/new$`))
    await expect(dialog.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Replacement owner draft")
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/orchestra/${chapter}$`))
    await expect(page.locator(`[data-document="${created.id}"]`)).toBeVisible()
    expect(state.documents.filter((document) => document.name === `Late ${kind}`)).toHaveLength(1)
    expect(state.writes.filter((write) => write.method === "POST")).toHaveLength(1)
  })
}

for (const entry of ["workflow library", "workflow editor", "hook editor"]) {
  test(`lifetime: late clone from ${entry} preserves the chosen route and caches its document`, async ({ page }) => {
    const state = await setupRelay(page)
    const delayed = await delayCreate(page)
    const hook = entry.startsWith("hook")
    const chapter = hook ? "hooks" : "workflows"
    const title = hook ? "Hooks" : "Workflows"
    const id = hook ? "protect-generated" : workflow
    const chosen = hook ? "ask-shell" : "relay-tdd_feature"
    await page.goto(`/orchestra/${chapter}`, { waitUntil: "domcontentloaded" })
    const row = page.locator(`[data-document="${id}"]`)
    await expect(row).toBeVisible()
    if (entry.endsWith("editor")) {
      await row.click()
      await editor(page).getByRole("button", { name: "More actions", exact: true }).click()
    } else {
      await row.locator('button[aria-haspopup="menu"]').click()
    }
    const response = page.waitForResponse((reply) => reply.request().method() === "POST" && new URL(reply.url()).pathname === "/api/relay/document")
    await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click()
    await delayed.arrived.promise
    if (entry.endsWith("editor")) await editor(page).getByRole("link", { name: `Back to ${title}`, exact: true }).click()
    await page.locator(`[data-document="${chosen}"]`).click()
    await expect(editor(page).locator(".wf-name")).toHaveValue(String(state.documents.find((document) => document.id === chosen)!.name))
    await editor(page).getByRole("link", { name: `Back to ${title}`, exact: true }).click()
    await expect(page.locator(`[data-mx-page="orchestra-${chapter}"] h1`)).toHaveText(title)
    delayed.pending.resolve()
    const reply = await response
    await reply.finished()
    const created = (await reply.json()).data
    await expect(page.locator(`[data-document="${created.id}"]`)).toContainText(String(created.name))
    await expect(page).toHaveURL(new RegExp(`/orchestra/${chapter}$`))
    await page.locator(`[data-document="${chosen}"]`).click()
    await expect(page).toHaveURL(new RegExp(`/orchestra/${chapter}/${chosen}$`))
    expect(state.writes.filter((write) => write.method === "POST")).toHaveLength(1)
  })
}

test("lifetime: shortcut popup blocks editor and command keys from button focus and restores them on close", async ({ page }) => {
  await setupRelay(page)
  await page.goto(`/orchestra/workflows/${workflow}`, { waitUntil: "domcontentloaded" })
  await canvas(page).getByRole("button", { name: "Keyboard shortcuts", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true })
  const close = dialog.locator("header").getByRole("button", { name: "Close", exact: true })
  await expect(close).toBeFocused()
  await page.keyboard.press("n")
  await page.keyboard.press("ControlOrMeta+k")
  await expect(dialog).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/orchestra/workflows/${workflow}$`))
  await expect(page.locator(".wf-drawer")).toHaveCount(0)
  await expect(page.locator(".command-palette-v2")).toHaveCount(0)
  await close.click()
  await expect(dialog).toHaveCount(0)
  await expect(canvas(page).getByRole("button", { name: "Keyboard shortcuts", exact: true })).toBeFocused()
  await page.keyboard.press("n")
  await expect(page).toHaveURL(new RegExp(`/orchestra/workflows/${workflow}/add$`))
  await expect(page.locator(".wf-drawer").getByRole("textbox")).toBeEditable()
  await page.keyboard.press("Escape")
  await expect(page.locator(".wf-drawer")).toHaveCount(0)
  await page.keyboard.press("ControlOrMeta+k")
  await expect(page.locator(".command-palette-v2").getByRole("textbox")).toBeEditable()
})

test("lifetime: node Test dialog supports pointer, typing, submit and Escape restores parent", async ({ page }) => {
  const state = await setupRelay(page)
  await openNode(page, "hooks", "protect-generated", "b")
  const trigger = details(page).locator(".wf-ndv-nav").getByRole("button", { name: "Test", exact: true })
  await trigger.click()
  const child = page.getByRole("dialog", { name: "Test hook", exact: true })
  await expect(child).toBeVisible()
  const input = child.getByRole("textbox", { name: "File path" })
  await input.click({ timeout: 5_000 })
  await input.fill("src/generated/example.ts")
  await expect(input).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(child).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await child.getByRole("textbox", { name: "File path" }).fill("src/generated/second.ts")
  await child.getByRole("button", { name: "Run test", exact: true }).click({ timeout: 5_000 })
  await expect(child).toHaveCount(0)
  await expect(details(page)).toBeVisible()
  await expect(details(page).getByRole("status").filter({ hasText: "src/generated/second.ts" })).toContainText("Block change")
  await expect(trigger).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(details(page)).toHaveCount(0)
  expect(state.writes).toEqual([])
})

for (const queued of [false, true]) {
  test(`lifetime: query-known v3 wins delayed v2 ACK with queued edits ${queued}`, async ({ page }) => {
    const state = await setupRelay(page)
    const index = state.documents.findIndex((document) => document.id === workflow)
    state.documents[index] = version(state.documents[index], 1, "Initial instructions")
    const pending = Promise.withResolvers<void>()
    const arrived = Promise.withResolvers<void>()
    const patches: Record<string, unknown>[] = []
    await page.route(`**/api/relay/document/${workflow}*`, async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback()
      patches.push(route.request().postDataJSON())
      const ack = version({ ...state.documents[index], ...patches[0] }, 2, "First submitted edit")
      arrived.resolve()
      await pending.promise
      return route.fulfill(located(ack))
    })
    await openNode(page)
    await details(page).getByRole("textbox", { name: "Instructions", exact: true }).fill("First submitted edit")
    await arrived.promise
    if (queued) await details(page).getByRole("textbox", { name: "Instructions", exact: true }).fill("Queued local instructions")
    state.documents[index] = { ...version(state.documents[index], 3, "Remote v3 instructions"), name: "Known v3 workflow" }
    await page.keyboard.press("Escape")
    await page.locator(".orchestra-sidebar").getByRole("button", { name: "Hooks", exact: true }).click()
    await expect(page.locator('[data-mx-page="orchestra-hooks"] h1')).toHaveText("Hooks")
    await page.locator(".orchestra-sidebar").getByRole("button", { name: "Workflows", exact: true }).click()
    const row = page.locator(`[data-document="${workflow}"]`)
    await expect(row).toContainText("Known v3 workflow")
    await row.click()
    await expect(editor(page).locator('[data-save="saving"]')).toBeVisible()
    pending.resolve()
    await expect(editor(page).locator(`[data-save="${queued ? "conflict" : "saved"}"]`)).toBeVisible()
    await canvas(page).locator('.wf-node[data-id="green.implement"] .wf-tile').dblclick()
    await expect(details(page).getByRole("textbox", { name: "Instructions", exact: true })).toHaveValue(queued ? "Queued local instructions" : "Remote v3 instructions")
    if (!queued) await expect(editor(page).locator(".wf-name")).toHaveValue("Known v3 workflow")
    expect(patches).toHaveLength(1)
    await library(page)
    await expect(page.locator(`[data-document="${workflow}"]`)).toContainText("Known v3 workflow")
  })
}

async function conflict(page: Page) {
  const state = await setupRelay(page)
  const index = state.documents.findIndex((document) => document.id === workflow)
  state.documents[index] = version(state.documents[index], 1, "Cached v1 instructions")
  const fresh = { ...version(state.documents[index], 2, "Reloaded v2 instructions"), name: "Reloaded v2 workflow" }
  await page.route(`**/api/relay/document/${workflow}*`, (route) => {
    if (route.request().method() === "PATCH") return route.fulfill(refused(409))
    if (new URL(route.request().url()).pathname === `/api/relay/document/${workflow}`) return route.fulfill(located(fresh))
    return route.fallback()
  })
  await openNode(page)
  await details(page).getByRole("textbox", { name: "Instructions", exact: true }).fill("Local conflict")
  await expect(details(page).locator('[data-save="conflict"]')).toBeVisible()
}

test("lifetime: conflict reload updates shared cache before clean editor is released", async ({ page }) => {
  await conflict(page)
  await details(page).getByRole("button", { name: "Discard local changes and reload" }).click()
  await expect(details(page).getByRole("textbox", { name: "Instructions", exact: true })).toHaveValue("Reloaded v2 instructions")
  await details(page).getByRole("button", { name: "Done", exact: true }).click()
  await editor(page).getByRole("link", { name: "Back to Workflows" }).click()
  await expect(page.locator('[data-mx-page="orchestra-workflows"] h1')).toHaveText("Workflows")
  const row = page.locator(`[data-document="${workflow}"]`)
  await expect(row).toContainText("Reloaded v2 workflow")
  await row.click()
  await canvas(page).locator('.wf-node[data-id="green.implement"] .wf-tile').dblclick()
  await expect(details(page).getByRole("textbox", { name: "Instructions", exact: true })).toHaveValue("Reloaded v2 instructions")
})

test("lifetime: conflict reload keeps focus inside modal and next Escape closes it", async ({ page }) => {
  await conflict(page)
  await details(page).getByRole("button", { name: "Discard local changes and reload" }).click()
  await expect(details(page).locator('[data-save="saved"]')).toBeVisible()
  expect(await details(page).evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press("Escape")
  await expect(details(page)).toHaveCount(0)
  await expect(canvas(page)).toBeFocused()
})

test("lifetime: hook node observations distinguish pending, failure and successful empty decisions", async ({ page }) => {
  await setupRelay(page)
  const pending = Promise.withResolvers<void>()
  const attempts: string[] = []
  await page.route("**/api/relay/hook/inst-protect/decisions*", async (route) => {
    attempts.push(route.request().url())
    if (attempts.length > 1) return route.fulfill(located([]))
    await pending.promise
    return route.fulfill(refused(503))
  })
  await openNode(page, "hooks", "protect-generated", "b")
  const input = details(page).getByRole("region", { name: "Input", exact: true })
  const output = details(page).getByRole("region", { name: "Output", exact: true })
  await expect(input).toContainText("Loading hook activity…")
  await expect(output).toContainText("Loading hook activity…")
  pending.resolve()
  await expect(input.getByRole("alert")).toContainText("Activity offline")
  await expect(output.getByRole("alert")).toContainText("Activity offline")
  await expect(details(page).getByText("This hook has not fired yet.", { exact: false })).toHaveCount(0)
  await input.getByRole("button", { name: "Try again" }).click()
  await expect(input).toContainText("This hook has not fired yet.")
  await expect(input.getByRole("alert")).toHaveCount(0)
  expect(attempts).toHaveLength(2)
})
