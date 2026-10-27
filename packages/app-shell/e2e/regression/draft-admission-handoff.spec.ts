import { expect, test, type Page, type Request } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"
import { currentSession, mockOrchestraServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

// Production benchmark baseline reused: 38521663841 @ e6c39ff; audited UI source unchanged at e87fd95799.
// These tests run the production routes/composer with HTTP receipts, never provider or Agent/tool frames.
const directory = "C:/Orchestra/DraftAdmissionHandoff"
const otherDirectory = "C:/Orchestra/DraftAdmissionHandoffOther"
const draftID = "draft_admission_handoff"
const sessionID = "ses_draft_admission_handoff"
const otherID = "ses_draft_handoff_other"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const otherServer = `http://127.0.0.2:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const draftURL = `/new-session?draftId=${draftID}`
const sessionURL = `/server/${base64Encode(server)}/session/${sessionID}`
const otherURL = `/server/${base64Encode(otherServer)}/session/${otherID}`
const draftTab = `[data-tab-key="draft:${draftID}"]`
const composer = '[data-prompt-admitting]'
const editor = '[data-component="prompt-input-v2"] [data-component="prompt-input"]'
const submit = '[data-component="prompt-input-v2"] [data-action="prompt-submit"]'
const promptPath = `/api/session/${sessionID}/prompt`
const userCard = '[data-component="user-message"]'
const userText = `${userCard} [data-slot="user-message-text"]`

test("fresh Send admits exactly one first turn before route/tab remount", async ({ page }) => {
  const fixture = await setup(page)
  const gate = Promise.withResolvers<void>()
  fixture.promptGate = gate.promise
  const original = await page.locator(editor).elementHandle()
  if (!original) throw new Error("Missing draft composer")
  await page.locator(editor).fill("first draft turn")
  const request = page.waitForRequest(isPromptRequest)
  const response = page.waitForResponse((response) => isPromptRequest(response.request()))
  await page.locator(submit).click()
  const sent = await request
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "true")
  await expect(page).toHaveURL(draftURL)
  await expect(page.locator(draftTab)).toHaveCount(1)
  await expect(page.locator(editor)).toHaveText("first draft turn")
  expect(await original.evaluate((element) => element.isConnected)).toBe(true)
  expect(fixture.creates).toHaveLength(1)
  expect(fixture.prompts).toHaveLength(1)
  gate.resolve()
  const receipt = await response
  expect(receipt.request()).toBe(sent)
  expect(receipt.status()).toBe(200)
  await expect(page).toHaveURL(sessionURL)
  await expect(page.locator(draftTab)).toHaveCount(0)
  await expect(page.locator(userCard)).toHaveCount(1)
  await expect(page.locator(userText)).toHaveText("first draft turn")
  await expect(page.locator(editor)).toHaveText("")
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "false")
  expect(await original.evaluate((element) => element.isConnected)).toBe(false)
  expect(fixture.prompts).toEqual([expect.objectContaining({ text: "first draft turn", url: draftURL, draft: true })])
  expect(fixture.messages).toHaveLength(1)
  expect(fixture.admissions).toHaveLength(1)
  expect(fixture.creates).toHaveLength(1)
})

test("delayed failure keeps draft and retries same Session/message ID", async ({ page }) => {
  const fixture = await setup(page)
  const gate = Promise.withResolvers<void>()
  fixture.promptGate = gate.promise
  fixture.fail = true
  await page.locator(editor).fill("retry retained turn")
  const request = page.waitForRequest(isPromptRequest)
  const response = page.waitForResponse((response) => isPromptRequest(response.request()))
  await page.locator(submit).click()
  const sent = await request
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "true")
  await expect(page.locator(editor)).toHaveText("retry retained turn")
  await expect(page.locator(draftTab)).toHaveCount(1)
  gate.resolve()
  const failure = await response
  expect(failure.request()).toBe(sent)
  expect(failure.status()).toBe(500)
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "false")
  await expect(page.getByText("Failed to send prompt", { exact: true })).toBeVisible()
  await expect(page).toHaveURL(draftURL)
  await expect(page.locator(editor)).toHaveText("retry retained turn")
  expect(fixture.creates).toHaveLength(1)
  expect(fixture.messages).toHaveLength(0)
  fixture.fail = false
  const retried = page.waitForResponse((response) => isPromptRequest(response.request()))
  const retryRequest = page.waitForRequest(isPromptRequest)
  await page.locator(submit).click()
  const retryReceipt = await retried
  expect(retryReceipt.request()).toBe(await retryRequest)
  expect(retryReceipt.status()).toBe(200)
  await expect(page).toHaveURL(sessionURL)
  await expect(page.locator(userCard)).toHaveCount(1)
  await expect(page.locator(userText)).toHaveText("retry retained turn")
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "false")
  expect(fixture.creates).toHaveLength(1)
  expect(fixture.prompts).toHaveLength(2)
  expect(fixture.prompts[1]?.id).toBe(fixture.prompts[0]?.id)
  expect(fixture.prompts[1]?.payload).toEqual(fixture.prompts[0]?.payload)
  expect(fixture.messages).toHaveLength(1)
  expect(fixture.admissions).toHaveLength(2)
})

test("new edit during admission moves to the session composer unsent until deliberate next Send", async ({ page }) => {
  const fixture = await setup(page)
  const gate = Promise.withResolvers<void>()
  fixture.promptGate = gate.promise
  await page.locator(editor).fill("admitted original")
  const request = page.waitForRequest(isPromptRequest)
  const response = page.waitForResponse((response) => isPromptRequest(response.request()))
  await page.locator(submit).click()
  const sent = await request
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "true")
  await page.locator(editor).fill("newer unsent draft")
  await expect(page.locator(editor)).toHaveText("newer unsent draft")
  gate.resolve()
  // V2 admission is the matching 200 receipt, not a streamed body-completion promise.
  const receipt = await response
  expect(receipt.request()).toBe(sent)
  expect(receipt.status()).toBe(200)
  // An admitted prompt always hands the draft off to its Session; the newer edit follows it without being sent.
  await expect(page).toHaveURL(sessionURL)
  await expect(page.locator(draftTab)).toHaveCount(0)
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "false")
  await expect(page.locator(editor)).toHaveText("newer unsent draft")
  await expect(page.locator(userText)).toHaveText(["admitted original"])
  expect(fixture.prompts).toHaveLength(1)
  expect(fixture.admissions).toHaveLength(1)
  const next = page.waitForResponse((response) => isPromptRequest(response.request()))
  const nextRequest = page.waitForRequest(isPromptRequest)
  await page.locator(submit).click()
  const nextReceipt = await next
  expect(nextReceipt.request()).toBe(await nextRequest)
  expect(nextReceipt.status()).toBe(200)
  await expect(page).toHaveURL(sessionURL)
  await expect(page.locator(userCard)).toHaveCount(2)
  await expect(page.locator(userText)).toHaveText(["admitted original", "newer unsent draft"])
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "false")
  expect(fixture.creates).toHaveLength(1)
  expect(fixture.prompts).toHaveLength(2)
  expect(fixture.prompts[1]?.id).not.toBe(fixture.prompts[0]?.id)
  expect(fixture.admissions).toHaveLength(2)
})

test("closing admitting draft tears down its owner and stays Home on a late creation receipt", async ({ page }) => {
  const fixture = await setup(page)
  const gate = Promise.withResolvers<void>()
  fixture.createGate = gate.promise
  const original = await page.locator(composer).elementHandle()
  if (!original) throw new Error("Missing draft composer")
  await page.locator(editor).fill("closed draft must not dispatch")
  const request = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/session" && request.method() === "POST")
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/session" && response.request().method() === "POST")
  await page.locator(submit).click()
  const sent = await request
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "true")
  fixture.rejectPrompts = true
  await page.locator(draftTab).getByRole("button", { name: "Close tab", exact: true }).click()
  // The composer still holds the text while it is admitted, so closing asks before discarding it.
  await page.getByRole("dialog").getByRole("button", { name: "Discard draft", exact: true }).click()
  await expect(page.locator(draftTab)).toHaveCount(0)
  expect(await original.evaluate((element) => element.isConnected)).toBe(false)
  // Desktop tab close selects within the current profile; B's tab is deliberately hidden here.
  await expect(page).toHaveURL("/")
  await expect(page.locator('[data-component="orchestra-home"]')).toBeVisible()
  gate.resolve()
  const created = await response
  expect(created.request()).toBe(sent)
  expect(created.status()).toBe(200)
  expect(await created.json()).toMatchObject({ data: { id: sessionID, location: { directory } } })
  await expect(page).toHaveURL("/")
  await selectProfile(page, "draft-handoff-b")
  await expect(page).toHaveURL(otherURL)
  await expect(page.getByRole("heading", { name: "Other server session", exact: true })).toBeVisible()
  // Closing deletes the source observer. Unit disposal/remount proof awaits its actual finally and checks zero dispatches.
  // This browser case claims teardown and late-receipt UI behavior; unexpected prompt routes fail explicitly below.
  expect(fixture.creates).toHaveLength(1)
  await expect(page).toHaveURL(otherURL)
})

test("server A to B to A remount cannot resurrect late creation; explicit retry adopts it", async ({ page }) => {
  const fixture = await setup(page)
  const gate = Promise.withResolvers<void>()
  fixture.createGate = gate.promise
  const original = await page.locator(editor).elementHandle()
  if (!original) throw new Error("Missing draft composer")
  await page.locator(editor).fill("server A retained turn")
  const request = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/session" && request.method() === "POST")
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/session" && response.request().method() === "POST")
  await page.locator(submit).click()
  const sent = await request
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "true")
  // The tab strip is profile-scoped. Switch profiles through the real app to navigate A -> B -> A.
  await selectProfile(page, "draft-handoff-b")
  await expect(page).toHaveURL(otherURL)
  // The sortable wrapper also exposes a link role. Target the desktop portal's actual navigation anchor.
  const otherTab = page.locator(`#orchestra-session-tabs:visible [data-titlebar-tab-link][href="${otherURL}"]`)
  await expect(otherTab).toHaveCount(1)
  await expect(otherTab).toBeVisible()
  await expect(otherTab).toHaveAttribute("href", otherURL)
  await expect(otherTab.locator('[data-slot="tab-title"]')).toHaveText("Other server session")
  await expect(page.getByRole("heading", { name: "Other server session", exact: true })).toBeVisible()
  expect(await original.evaluate((element) => element.isConnected)).toBe(false)
  await selectProfile(page, "draft-handoff")
  await expect(page).toHaveURL(draftURL)
  await expect(page.locator(draftTab)).toHaveCount(1)
  await expect(page.locator(editor)).toHaveText("server A retained turn")
  // Positive control after A -> B -> A: this is the same retained source, not a fresh false counter.
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "true")
  gate.resolve()
  const created = await response
  expect(created.request()).toBe(sent)
  expect(created.status()).toBe(200)
  expect(await created.json()).toMatchObject({ data: { id: sessionID, location: { directory } } })
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "false")
  await expect(page).toHaveURL(draftURL)
  expect(fixture.admissions).toEqual([])
  // Positive control uses the same HTTP matcher and real composer after the cancelled attempt.
  const retried = page.waitForResponse((response) => isPromptRequest(response.request()))
  const retryRequest = page.waitForRequest(isPromptRequest)
  await page.locator(submit).click()
  const retryReceipt = await retried
  expect(retryReceipt.request()).toBe(await retryRequest)
  expect(retryReceipt.status()).toBe(200)
  await expect(page).toHaveURL(sessionURL)
  await expect(page.locator(userCard)).toHaveCount(1)
  await expect(page.locator(userText)).toHaveText("server A retained turn")
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "false")
  expect(fixture.creates).toHaveLength(1)
  expect(fixture.prompts).toHaveLength(1)
  expect(fixture.prompts[0]?.server).toBe(server)
  expect(fixture.admissions).toHaveLength(1)
})

async function setup(page: Page) {
  const session = {
    id: sessionID, slug: "draft-handoff", projectID: "proj_draft_handoff", directory,
    title: "Admitted draft", version: "dev", time: { created: 1700000000000, updated: 1700000000000 },
  }
  const sessions = [{ ...session, id: otherID, directory: otherDirectory, projectID: "proj_draft_handoff_other", title: "Other server session" }]
  const otherProject = { id: "proj_draft_handoff_other", worktree: otherDirectory, vcs: "git", name: "draft-handoff-b", time: session.time, sandboxes: [] }
  const fixture: {
    creates: Request[]
    admissions: Request[]
    prompts: { id: string; text: string; server: string; url: string; draft: boolean; payload: unknown }[]
    messages: { info: { id: string; sessionID: string; role: "user"; agent: string; model: unknown; time: { created: number } }; parts: unknown[] }[]
    createGate?: Promise<void>
    promptGate?: Promise<void>
    fail: boolean
    rejectPrompts: boolean
  } = { creates: [], admissions: [], prompts: [], messages: [], fail: false, rejectPrompts: false }
  // Observe before route filtering: every Session write/admission, including wrong targets and methods, reaches the ledger.
  page.on("request", (request) => {
    if (isCreateWrite(request)) fixture.creates.push(request)
    if (isAdmissionRequest(request)) fixture.admissions.push(request)
  })
  await mockOrchestraServer(page, {
    directory,
    project: { id: session.projectID, worktree: directory, vcs: "git", name: "draft-handoff", time: session.time, sandboxes: [] },
    provider: {
      all: [{ id: "orchestra", name: "Orchestra", models: { "draft-model": { id: "draft-model", name: "Draft Model", limit: { context: 200000 }, variants: {} } } }],
      connected: ["orchestra"], default: { orchestra: "draft-model" },
    },
    sessions,
    pageMessages: (id) => ({ items: id === sessionID ? fixture.messages : [] }),
  })
  await page.route("**/*", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (isCreateWrite(request)) {
      if (request.method() !== "POST" || url.origin !== server || path !== "/api/session") {
        await route.fulfill({ status: 500, json: { error: "Unexpected creation request" }, headers: { "access-control-allow-origin": "*" } })
        throw new Error(`Unexpected creation ${request.method()} ${request.url()}`)
      }
      await fixture.createGate
      sessions.push(session)
      return route.fulfill({ json: { data: currentSession(session, directory) }, headers: { "access-control-allow-origin": "*" } })
    }
    // V2 Send selects the agent and model before it admits the prompt; a closed source must not reach either.
    if (isSelectionRequest(request)) {
      if (!fixture.rejectPrompts) return route.fallback()
      await route.fulfill({ status: 500, json: { error: "Closed source attempted selection" }, headers: { "access-control-allow-origin": "*" } })
      throw new Error("Closed source attempted agent/model selection")
    }
    if (isAdmissionRequest(request)) {
      try {
        if (fixture.rejectPrompts) throw new Error("Closed source attempted prompt admission")
        if (!isPromptRequest(request)) throw new Error(`Unexpected admission ${request.method()} ${request.url()}`)
        const body = requirePromptBody(request)
        fixture.prompts.push({
          id: body.messageID, text: body.text,
          server: url.origin, payload: body.payload,
          url: new URL(page.url()).pathname + new URL(page.url()).search,
          draft: await page.locator(draftTab).count() === 1,
        })
        await fixture.promptGate
        if (fixture.fail) return route.fulfill({ status: 500, json: { name: "UnknownError", data: { message: "admission failed" } }, headers: { "access-control-allow-origin": "*" } })
        if (!fixture.messages.some((message) => message.info.id === body.messageID)) fixture.messages.push({
          info: { id: body.messageID, sessionID, role: "user", agent: "maestro", model: undefined, time: { created: Date.now() } },
          parts: [{ type: "text", text: body.text }],
        })
        return route.fulfill({
          json: { data: { admittedSeq: fixture.messages.length, id: body.messageID, sessionID, prompt: body.prompt, delivery: body.delivery, timeCreated: Date.now() } },
          headers: { "access-control-allow-origin": "*" },
        })
      } catch (error) {
        await route.fulfill({ status: 500, json: { error: String(error) }, headers: { "access-control-allow-origin": "*" } })
        throw error
      }
    }
    if (request.method() === "GET" && url.origin === otherServer) {
      // The mock serves both hosts from one config; B answers with its own repository.
      if (path === "/api/project") return route.fulfill({ json: [otherProject], headers: { "access-control-allow-origin": "*" } })
      if (path === "/api/location" || path === "/api/project/current") return route.fulfill({
        json: path === "/api/location"
          ? { directory: otherDirectory, project: { id: otherProject.id, directory: otherDirectory } }
          : { id: otherProject.id, directory: otherDirectory },
        headers: { "access-control-allow-origin": "*" },
      })
      if (path === "/api/path") return route.fulfill({
        json: { state: otherDirectory, config: otherDirectory, worktree: otherDirectory, directory: otherDirectory, home: "C:/Orchestra" },
        headers: { "access-control-allow-origin": "*" },
      })
    }
    return route.fallback()
  })
  await page.addInitScript(({ directory, otherDirectory, draftID, server, otherServer, otherID, otherURL }) => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { shouldDisplayTabsToast: false } }))
    localStorage.setItem("orchestra.global.dat:server", JSON.stringify({
      list: [server, otherServer], projects: { [server]: [{ worktree: directory, expanded: true }], [otherServer]: [{ worktree: otherDirectory, expanded: true }] },
    }))
    localStorage.setItem("orchestra.window.browser.dat:tabs", JSON.stringify([
      { type: "draft", draftID, server, directory }, { type: "session", server: otherServer, sessionId: otherID },
    ]))
    localStorage.setItem("orchestra.window.browser.dat:tabs.recent", JSON.stringify({ key: `draft:${draftID}` }))
    localStorage.setItem("orchestra.window.browser.dat:tabs.info", JSON.stringify({
      [`${otherServer}\n${otherURL}`]: { title: "Other server session", directory: otherDirectory },
    }))
  }, { directory, otherDirectory, draftID, server, otherServer, otherID, otherURL })
  await page.goto(draftURL)
  await expectAppVisible(page.locator(editor))
  // App supplies its shared model control; "Choose model" is tooltip copy, not this button's name.
  const model = page.locator('[data-component="prompt-input-v2"] [data-action="prompt-model"]')
  await expect(model).toHaveCount(1)
  await expect(model).toHaveText("Draft Model")
  await expect(model).toBeEnabled()
  await expect(page.locator(editor)).toBeEditable()
  await expect(page.locator(composer)).toHaveAttribute("data-prompt-admitting", "false")
  return fixture
}

async function selectProfile(page: Page, name: string) {
  await page.getByRole("button", { name: "Choose project", exact: true }).click()
  const profile = page.locator('[data-component="orchestra-profile-picker"]').getByRole("menuitemradio", { name, exact: true })
  await expect(profile).toHaveCount(1)
  await expect(profile).toBeEnabled()
  await profile.click()
  await expect(page.locator('[data-component="orchestra-profile-picker"]')).toBeHidden()
}

function isPromptRequest(request: Request) {
  const url = new URL(request.url())
  return request.method() === "POST" && url.origin === server && url.pathname === promptPath
}

function isAdmissionRequest(request: Request) {
  const path = new URL(request.url()).pathname
  if (request.method() === "OPTIONS") return false
  if (isSelectionRequest(request)) return false
  if (/^\/(?:api\/)?session\/[^/]+\/prompt$/.test(path)) return true
  return /^\/(?:api\/)?session\/[^/]+(?:\/.*)?$/.test(path) && !["GET", "HEAD", "OPTIONS"].includes(request.method())
}

function isSelectionRequest(request: Request) {
  return request.method() === "POST" && /^\/api\/session\/[^/]+\/(?:agent|model)$/.test(new URL(request.url()).pathname)
}

function isCreateWrite(request: Request) {
  return /^\/(?:api\/)?session$/.test(new URL(request.url()).pathname) && !["GET", "HEAD", "OPTIONS"].includes(request.method())
}

function requirePromptBody(request: Request) {
  const body: unknown = request.postDataJSON()
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Prompt body is not an object")
  if (!("id" in body) || typeof body.id !== "string" || !/^msg_[0-9a-f]{12}[A-Za-z0-9]{14}$/.test(body.id)) {
    throw new Error("Prompt id does not match Identifier.ascending(message)")
  }
  if (!("prompt" in body) || !body.prompt || typeof body.prompt !== "object") throw new Error("Prompt is not an object")
  if (!("text" in body.prompt) || typeof body.prompt.text !== "string") throw new Error("Prompt text is not a string")
  const delivery = "delivery" in body && typeof body.delivery === "string" ? body.delivery : "steer"
  return { messageID: body.id, text: body.prompt.text, prompt: body.prompt, delivery, payload: body }
}
