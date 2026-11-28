import { expect, test } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"
import { SessionEvent } from "@orchestra/schema/session-event"
import { SessionMessage } from "@orchestra/schema/session-message"
import { SessionInput } from "@orchestra/schema/session-input"
import { Schema } from "effect"
import { mockOrchestraServer } from "../utils/mock-server"
import { installSseTransport } from "../utils/sse-transport"

const directory = "C:/Orchestra/ExistingSessionAdmission"
const sessionID = "ses_existing_admission"
const projectID = "proj_existing_admission"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const promptPath = `/api/session/${sessionID}/prompt`
const text = "retain first existing Session turn"
const editor = '[data-component="prompt-input-v2"] [data-component="prompt-input"][contenteditable="true"]'
const submit = '[data-component="prompt-input-v2"] [data-action="prompt-submit"]'
const admitting = '[data-prompt-admitting]'
const user = '[data-component="user-message"]'
const model = { providerID: "orchestra", id: "existing-model" }

// Actual production route/Local/follower/composer/SDK; HTTP receipts and stream are controlled.
// This is UI retry identity evidence, not a claim about backend durability or provider execution.
test("existing empty Session retains first Send identity across canonical projection and lost ACK", async ({ page }, info) => {
  const transport = await installSseTransport(page, { server })
  const gate = Promise.withResolvers<void>()
  const prompts: string[] = []
  const writes: string[] = []
  const unexpected: string[] = []
  const canonical: { message?: SessionMessage.User } = {}
  const reads: string[] = []
  const time = 1700000000000
  try {
    await mockOrchestraServer(page, {
      directory,
      project: { id: projectID, worktree: directory, vcs: "git", name: "existing-admission", time: { created: time, updated: time }, sandboxes: [] },
      provider: {
        all: [{ id: model.providerID, name: "Orchestra", models: {
          [model.id]: { id: model.id, name: "Existing Model", limit: { context: 200000 }, variants: {} },
        } }],
        connected: [model.providerID], default: { [model.providerID]: model.id },
      },
      sessions: [{ id: sessionID, slug: "existing-admission", projectID, directory, title: "Empty existing Session",
        version: "dev", agent: "maestro", model, time: { created: time, updated: time } }],
      pageMessages: () => ({ items: canonical.message ? [{ info: { id: canonical.message.id, sessionID, role: "user", agent: "maestro", model,
        time: { created: time } }, parts: [{ type: "text", text }] }] : [] }),
    })
    await page.route("**/*", async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (request.method() === "GET" && canonical.message && url.origin === server &&
        url.pathname === `/api/session/${sessionID}/message/${canonical.message.id}`) {
        reads.push(url.pathname)
        return route.fulfill({ json: { data: Schema.encodeSync(SessionMessage.User)(canonical.message) },
          headers: { "access-control-allow-origin": "*" } })
      }
      if (["GET", "HEAD", "OPTIONS"].includes(request.method()) || !/^\/(?:api\/)?session(?:\/|$)/.test(url.pathname))
        return route.fallback()
      writes.push(`${request.method()} ${url.pathname}`)
      if (url.origin === server && request.method() === "POST" &&
        [`/api/session/${sessionID}/agent`, `/api/session/${sessionID}/model`].includes(url.pathname))
        return route.fallback()
      if (url.origin !== server || request.method() !== "POST" || url.pathname !== promptPath) {
        unexpected.push(`${request.method()} ${request.url()}`)
        return route.fulfill({ status: 500, json: { error: "Unexpected Session write" }, headers: { "access-control-allow-origin": "*" } })
      }
      const body = request.postData()
      if (!body) throw new Error("Prompt POST missing body")
      prompts.push(body)
      if (prompts.length === 1) {
        await gate.promise
        return route.abort("failed")
      }
      if (prompts.length !== 2 || body !== prompts[0] || !canonical.message) {
        unexpected.push("Unexpected prompt retry")
        return route.fulfill({ status: 500, json: { error: "Unexpected prompt retry" } })
      }
      const payload = request.postDataJSON()
      const receipt = Schema.decodeUnknownSync(Schema.toEncoded(SessionInput.Admitted))({
        admittedSeq: 1, id: canonical.message.id, sessionID, prompt: payload.prompt,
        delivery: payload.delivery, timeCreated: time,
      })
      return route.fulfill({ json: { data: receipt }, headers: { "access-control-allow-origin": "*" } })
    })
    await page.addInitScript(({ directory, server, sessionID }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { shouldDisplayTabsToast: false } }))
      localStorage.setItem("orchestra.global.dat:server", JSON.stringify({
        projects: { local: [{ worktree: directory, expanded: true }] }, lastProject: { local: directory },
      }))
      localStorage.setItem("orchestra.window.browser.dat:tabs", JSON.stringify([{ type: "session", server, sessionId: sessionID }]))
    }, { directory, server, sessionID })
    await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
    await transport.waitForConnection()
    await expect(page.locator(editor)).toBeEditable()
    await expect(page.locator('[data-action="prompt-model"]')).toHaveText("Existing Model")
    await expect(page.locator(admitting)).toHaveAttribute("data-prompt-admitting", "false")
    await expect(page.locator(user)).toHaveCount(0)
    expect(prompts).toEqual([])
    expect(writes).toEqual([])
    await page.locator(editor).fill(text)
    const first = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === promptPath)
    await page.locator(submit).click()
    const sent = await first
    const failed = page.waitForEvent("requestfailed", { predicate: (request) => request === sent })
    await expect.poll(() => prompts).toEqual([sent.postData()])
    expect(writes).toEqual([`POST /api/session/${sessionID}/agent`, `POST /api/session/${sessionID}/model`, `POST ${promptPath}`])
    await expect(page.locator(admitting)).toHaveAttribute("data-prompt-admitting", "true")
    // Existing Sessions clear in flight; the captured snapshot restores the editor after failure.
    await expect(page.locator(editor)).toHaveText("")
    const payload = sent.postDataJSON()
    expect(payload).toMatchObject({ id: expect.stringMatching(/^msg_/), prompt: { text } })
    canonical.message = Schema.decodeUnknownSync(SessionMessage.User)({ id: payload.id, type: "user", text,
      time: { created: time }, files: [], agents: [] })
    const canonicalPath = `/api/session/${sessionID}/message/${payload.id}`
    const projected = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname === canonicalPath)
    // A missed admission event is supported: Prompted hydrates its missing input through the real message GET.
    const event = Schema.decodeUnknownSync(Schema.toEncoded(SessionEvent.Prompted))({
      id: "evt_existing_promoted", type: "session.next.prompted", location: { directory },
      data: { timestamp: time, sessionID, messageID: payload.id, prompt: payload.prompt, delivery: payload.delivery },
    })
    const delivery = await transport.send(event)
    const projection = await projected
    expect(projection.status()).toBe(200)
    expect(await projection.json()).toEqual({ data: Schema.encodeSync(SessionMessage.User)(canonical.message) })
    expect(reads).toEqual([canonicalPath])
    expect(delivery.bytes).toBeGreaterThan(0)
    await expect(page.locator(user)).toHaveCount(1)
    await expect(page.locator(user)).toHaveAttribute("data-timeline-part-id", `${payload.id}:text:0`)
    await expect(page.locator(`${user} [data-slot="user-message-text"]`)).toHaveText(text)
    await expect(page.locator(editor)).toHaveText("")
    await expect(page.locator(admitting)).toHaveAttribute("data-prompt-admitting", "true")
    gate.resolve()
    expect(await failed).toBe(sent)
    await expect(page.locator(admitting)).toHaveAttribute("data-prompt-admitting", "false")
    await expect(page.locator(editor)).toHaveText(text)
    const retry = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === promptPath)
    await page.locator(submit).click()
    const accepted = await retry
    expect(accepted.status()).toBe(200)
    expect(accepted.request().postData()).toBe(sent.postData())
    expect(accepted.request().postDataJSON().id).toBe(payload.id)
    expect(prompts).toEqual([sent.postData(), sent.postData()])
    expect(await accepted.json()).toMatchObject({ data: { id: payload.id, admittedSeq: 1 } })
    await expect(page.locator(admitting)).toHaveAttribute("data-prompt-admitting", "false")
    await expect(page.locator(editor)).toHaveText("")
    await expect(page.locator(user)).toHaveCount(1)
    await expect(page.locator(`${user} [data-slot="user-message-text"]`)).toHaveText(text)
    expect(unexpected).toEqual([])
    expect((await transport.connections()).map((connection) => ({ path: connection.path, endedAt: connection.endedAt })))
      .toEqual([{ path: "/api/event", endedAt: undefined }])
    await info.attach("existing-session-admission.json", { contentType: "application/json",
      body: JSON.stringify({ writes, prompts, reads, delivery, messageID: payload.id, boundary: "Controlled HTTP and SSE; no backend durability claim" }) })
  } finally {
    gate.resolve()
    if (!page.isClosed()) await transport.close()
  }
})
