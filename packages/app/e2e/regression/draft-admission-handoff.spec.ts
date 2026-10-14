import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"
import { mockOrchestraServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

// Production benchmark baseline reused: 38521663841 @ e6c39ff; audited UI source unchanged at e87fd95799.
// These tests run the production routes/composer with HTTP receipts, never provider or Agent/tool frames.
const directory = "C:/Orchestra/DraftAdmissionHandoff"
const draftID = "draft_admission_handoff"
const sessionID = "ses_draft_admission_handoff"
const otherID = "ses_draft_handoff_other"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const otherServer = `http://127.0.0.2:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const draftURL = `/new-session?draftId=${draftID}`
const sessionURL = `/server/${base64Encode(server)}/session/${sessionID}`
const draftTab = `[data-tab-key="draft:${draftID}"]`
const editor = '[data-component="prompt-input-v2"] [data-component="prompt-input"]'
const submit = '[data-component="prompt-input-v2"] [data-action="prompt-submit"]'
const promptPath = `/session/${sessionID}/prompt_async`

test("fresh Send admits exactly one first turn before route/tab remount", async ({ page }) => {
  const fixture = await setup(page)
  const gate = Promise.withResolvers<void>()
  fixture.promptGate = gate.promise
  const original = await page.locator(editor).elementHandle()
  if (!original) throw new Error("Missing draft composer")
  await page.locator(editor).fill("first draft turn")
  const request = page.waitForRequest((request) => new URL(request.url()).pathname === promptPath)
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === promptPath)
  await page.locator(submit).click()
  await request
  await expect(page).toHaveURL(draftURL)
  await expect(page.locator(draftTab)).toHaveCount(1)
  await expect(page.locator(editor)).toHaveText("first draft turn")
  expect(await original.evaluate((element) => element.isConnected)).toBe(true)
  expect(fixture.creates).toHaveLength(1)
  expect(fixture.prompts).toHaveLength(1)
  gate.resolve()
  expect((await response).status()).toBe(204)
  await expect(page).toHaveURL(sessionURL)
  await expect(page.locator(draftTab)).toHaveCount(0)
  await expect(page.locator('[data-component="user-message"]')).toHaveText("first draft turn")
  await expect(page.locator(editor)).toHaveText("")
  expect(await original.evaluate((element) => element.isConnected)).toBe(false)
  expect(fixture.prompts).toEqual([expect.objectContaining({ text: "first draft turn", url: draftURL, draft: true })])
  expect(fixture.messages).toHaveLength(1)
})

test("delayed failure keeps draft and retries same Session/message ID", async ({ page }) => {
  const fixture = await setup(page)
  const gate = Promise.withResolvers<void>()
  fixture.promptGate = gate.promise
  fixture.fail = true
  await page.locator(editor).fill("retry retained turn")
  const request = page.waitForRequest((request) => new URL(request.url()).pathname === promptPath)
  await page.locator(submit).click()
  await request
  await expect(page.locator(editor)).toHaveText("retry retained turn")
  await expect(page.locator(draftTab)).toHaveCount(1)
  gate.resolve()
  await expect(page.getByText("Failed to send prompt", { exact: true })).toBeVisible()
  await expect(page).toHaveURL(draftURL)
  await expect(page.locator(editor)).toHaveText("retry retained turn")
  expect(fixture.creates).toHaveLength(1)
  expect(fixture.messages).toHaveLength(0)
  fixture.fail = false
  const retried = page.waitForResponse((response) => new URL(response.url()).pathname === promptPath)
  await page.locator(submit).click()
  expect((await retried).status()).toBe(204)
  await expect(page).toHaveURL(sessionURL)
  await expect(page.locator('[data-component="user-message"]')).toHaveText("retry retained turn")
  expect(fixture.creates).toHaveLength(1)
  expect(fixture.prompts).toHaveLength(2)
  expect(fixture.prompts[1]?.id).toBe(fixture.prompts[0]?.id)
  expect(fixture.messages).toHaveLength(1)
})

test("new edit during admission stays in draft until deliberate next Send", async ({ page }) => {
  const fixture = await setup(page)
  const gate = Promise.withResolvers<void>()
  fixture.promptGate = gate.promise
  await page.locator(editor).fill("admitted original")
  const request = page.waitForRequest((request) => new URL(request.url()).pathname === promptPath)
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === promptPath)
  await page.locator(submit).click()
  await request
  await page.locator(editor).fill("newer unsent draft")
  gate.resolve()
  await (await response).finished()
  await expect(page.locator(editor)).toHaveText("newer unsent draft")
  await expect(page.locator(draftTab)).toHaveCount(1)
  const next = page.waitForResponse((response) => new URL(response.url()).pathname === promptPath)
  await page.locator(submit).click()
  expect((await next).status()).toBe(204)
  await expect(page).toHaveURL(sessionURL)
  await expect(page.locator('[data-component="user-message"]')).toHaveText(["admitted original", "newer unsent draft"])
  expect(fixture.creates).toHaveLength(1)
  expect(fixture.prompts).toHaveLength(2)
  expect(fixture.prompts[1]?.id).not.toBe(fixture.prompts[0]?.id)
})

test("closing draft before creation receipt cancels its unadmitted prompt", async ({ page }) => {
  const fixture = await setup(page)
  const gate = Promise.withResolvers<void>()
  fixture.createGate = gate.promise
  await page.locator(editor).fill("closed draft must not dispatch")
  const request = page.waitForRequest((request) => new URL(request.url()).pathname === "/session" && request.method() === "POST")
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/session" && response.request().method() === "POST")
  await page.locator(submit).click()
  await request
  await page.locator(draftTab).getByRole("button", { name: "Close tab", exact: true }).click()
  await expect(page.locator(draftTab)).toHaveCount(0)
  await expect(page).toHaveURL(`/server/${base64Encode(otherServer)}/session/${otherID}`)
  gate.resolve()
  await (await response).finished()
  await expect(page.getByRole("heading", { name: "Other server session", exact: true })).toBeVisible()
  expect(fixture.prompts).toEqual([])
  expect(fixture.messages).toEqual([])
  await expect(page).toHaveURL(`/server/${base64Encode(otherServer)}/session/${otherID}`)
})

test("server A to B to A remount cannot resurrect late creation; explicit retry adopts it", async ({ page }) => {
  const fixture = await setup(page)
  const gate = Promise.withResolvers<void>()
  fixture.createGate = gate.promise
  await page.locator(editor).fill("server A retained turn")
  const request = page.waitForRequest((request) => new URL(request.url()).pathname === "/session" && request.method() === "POST")
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/session" && response.request().method() === "POST")
  await page.locator(submit).click()
  await request
  const otherURL = `/server/${base64Encode(otherServer)}/session/${otherID}`
  await page.locator(`a[href="${otherURL}"]`).click()
  await expect(page).toHaveURL(otherURL)
  await expect(page.getByRole("heading", { name: "Other server session", exact: true })).toBeVisible()
  await page.locator(draftTab).locator(`a[href="${draftURL}"]`).click()
  await expect(page.locator(editor)).toHaveText("server A retained turn")
  gate.resolve()
  await (await response).finished()
  await expect(page).toHaveURL(draftURL)
  expect(fixture.prompts).toEqual([])
  // Positive control uses the same HTTP matcher and real composer after the cancelled attempt.
  const retried = page.waitForResponse((response) => new URL(response.url()).pathname === promptPath)
  await page.locator(submit).click()
  expect((await retried).status()).toBe(204)
  await expect(page).toHaveURL(sessionURL)
  await expect(page.locator('[data-component="user-message"]')).toHaveText("server A retained turn")
  expect(fixture.creates).toHaveLength(1)
  expect(fixture.prompts).toHaveLength(1)
})

async function setup(page: Page) {
  const session = {
    id: sessionID, slug: "draft-handoff", projectID: "proj_draft_handoff", directory,
    title: "Admitted draft", version: "dev", time: { created: 1700000000000, updated: 1700000000000 },
  }
  const sessions = [{ ...session, id: otherID, title: "Other server session" }]
  const fixture: {
    creates: unknown[]
    prompts: { id: string; text: string; url: string; draft: boolean }[]
    messages: { info: { id: string; sessionID: string; role: "user"; agent: string; model: unknown; time: { created: number } }; parts: unknown[] }[]
    createGate?: Promise<void>
    promptGate?: Promise<void>
    fail: boolean
  } = { creates: [], prompts: [], messages: [], fail: false }
  await mockOrchestraServer(page, {
    directory,
    project: { id: session.projectID, worktree: directory, vcs: "git", name: "draft-handoff", time: session.time, sandboxes: [] },
    provider: {
      all: [{ id: "opencode", name: "Orchestra", models: { "draft-model": { id: "draft-model", name: "Draft Model", limit: { context: 200000 }, variants: {} } } }],
      connected: ["opencode"], default: { opencode: "draft-model" },
    },
    sessions,
    pageMessages: (id) => ({ items: id === sessionID ? fixture.messages : [] }),
  })
  await page.route("**/*", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() !== "POST") return route.fallback()
    if (path === "/session") {
      fixture.creates.push(request.postDataJSON())
      await fixture.createGate
      sessions.push(session)
      return route.fulfill({ json: session, headers: { "access-control-allow-origin": "*" } })
    }
    if (path !== promptPath) return route.fallback()
    const body = request.postDataJSON() as { messageID: string; agent: string; model: unknown; parts: { type: string; text?: string }[] }
    fixture.prompts.push({
      id: body.messageID, text: body.parts.flatMap((part) => part.type === "text" ? [part.text ?? ""] : []).join("\n"),
      url: new URL(page.url()).pathname + new URL(page.url()).search,
      draft: await page.locator(draftTab).count() === 1,
    })
    await fixture.promptGate
    if (fixture.fail) return route.fulfill({ status: 500, json: { name: "UnknownError", data: { message: "admission failed" } }, headers: { "access-control-allow-origin": "*" } })
    if (!fixture.messages.some((message) => message.info.id === body.messageID)) fixture.messages.push({
      info: { id: body.messageID, sessionID, role: "user", agent: body.agent, model: body.model, time: { created: Date.now() } },
      parts: body.parts,
    })
    return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } })
  })
  await page.addInitScript(({ directory, draftID, server, otherServer, otherID }) => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }))
    localStorage.setItem("orchestra.global.dat:server", JSON.stringify({
      list: [server, otherServer], projects: { [server]: [{ worktree: directory, expanded: true }], [otherServer]: [{ worktree: directory, expanded: true }] },
    }))
    localStorage.setItem("orchestra.window.browser.dat:tabs", JSON.stringify([
      { type: "draft", draftID, server, directory }, { type: "session", server: otherServer, sessionId: otherID },
    ]))
    localStorage.setItem("orchestra.window.browser.dat:tabs.recent", JSON.stringify({ key: `draft:${draftID}` }))
  }, { directory, draftID, server, otherServer, otherID })
  await page.goto(draftURL)
  await expectAppVisible(page.locator(editor))
  // App supplies its shared model control; "Choose model" is tooltip copy, not this button's name.
  const model = page.locator('[data-component="prompt-input-v2"] [data-action="prompt-model"]')
  await expect(model).toHaveCount(1)
  await expect(model).toHaveText("Draft Model")
  await expect(model).toBeEnabled()
  await expect(page.locator(editor)).toBeEditable()
  return fixture
}
