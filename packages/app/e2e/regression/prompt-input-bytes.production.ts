import { createHash } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const sample = "\n```owner-demand\né — 😀\u200B\n\n``` \n\n"
const cases = [
  { mode: "fill", text: sample },
  { mode: "paste", text: sample + "row\n".repeat(240) },
  { mode: "shift-enter", text: "lead\n\né — 😀\u200B\n\n" },
  { mode: "raw-clipboard", text: "\r\n```owner-demand\ré — 😀\u200B\r\n\r\n```\n" },
] as const

// Run against the production config and an isolated REAL server with a configured default model.
// Only execution requests are aborted: this proves DOM -> durable draft -> actual UI request, not admission.
for (const newLayoutDesigns of [false, true]) {
  for (const scenario of cases) {
    test(`prompt bytes: ${newLayoutDesigns ? "V2" : "legacy"} ${scenario.mode}`, async ({ page, context }, info) => {
      const directory = process.env.ORCHESTRA_PROMPT_BYTES_DIRECTORY
      if (!directory) throw new Error("ORCHESTRA_PROMPT_BYTES_DIRECTORY_REQUIRED")
      const protocol = process.env.ORCHESTRA_PROMPT_BYTES_PROTOCOL ?? "v1"
      expect(["v1", "v2"]).toContain(protocol)
      const sessions = protocol === "v1" ? "/session" : "/api/session"
      const created = await page.request.post(`${server}${sessions}?directory=${encodeURIComponent(directory)}`, {
        data: protocol === "v1" ? { title: info.title } : { location: { directory } },
      })
      expect(created.ok(), await created.text()).toBe(true)
      const result = (await created.json()) as { id?: string; data?: { id?: string } }
      const sessionID = protocol === "v1" ? result.id : result.data?.id
      if (!sessionID) throw new Error("PROMPT_BYTES_SESSION_CREATE_FAILED")
      const endpoint = protocol === "v1" ? `/session/${sessionID}/prompt_async` : `/api/session/${sessionID}/prompt`
      await page.route(/\/(?:api\/)?session\/[^/]+\/(?:prompt(?:_async)?|message|command|shell)(?:\?|$)/, (route) =>
        route.request().method() === "POST" ? route.abort("blockedbyclient") : route.fallback(),
      )
      await page.addInitScript(({ newLayoutDesigns, directory, server, sessionID }) => {
        localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns, shouldDisplayTabsToast: false } }))
        localStorage.setItem("orchestra.global.dat:server", JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] }, lastProject: { local: directory },
        }))
        localStorage.setItem("orchestra.window.browser.dat:tabs", JSON.stringify([
          { type: "session", server, sessionId: sessionID },
        ]))
      }, { newLayoutDesigns, directory, server, sessionID })
      try {
        await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
        const editor = page.locator('[data-component="prompt-input"][contenteditable="true"]')
        await expect(editor).toHaveCount(1)
        await expect(editor).toBeEditable()
        if (newLayoutDesigns) await expect(editor.locator("xpath=ancestor::form")).toHaveAttribute("data-component", "prompt-input-v2")
        if (!newLayoutDesigns) await expect(editor.locator("xpath=ancestor::form")).not.toHaveAttribute("data-component", "prompt-input-v2")

        if (scenario.mode === "fill") await editor.fill(scenario.text)
        if (scenario.mode === "paste") {
          await context.grantPermissions(["clipboard-read", "clipboard-write"])
          await editor.focus()
          await page.evaluate((text) => navigator.clipboard.writeText(text), scenario.text)
          expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(scenario.text)
          await editor.press(process.platform === "darwin" ? "Meta+V" : "Control+V")
        }
        if (scenario.mode === "shift-enter") {
          await editor.fill("lead")
          await editor.press("Shift+Enter")
          await editor.press("Shift+Enter")
          await page.keyboard.insertText("é — 😀\u200B")
          await editor.press("Shift+Enter")
          await editor.press("Shift+Enter")
        }
        if (scenario.mode === "raw-clipboard") {
          await editor.focus()
          await editor.evaluate((element, text) => {
            const clipboardData = new DataTransfer()
            clipboardData.setData("text/plain", text)
            element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }))
          }, scenario.text)
        }

        await info.attach("prompt-dom-before-send.json", {
          contentType: "application/json",
          body: JSON.stringify(await editor.evaluate((element) => ({ html: element.innerHTML, textContent: element.textContent }))),
        })
        await expect.poll(() => canonicalDraft(page, sessionID)).toEqual({ text: scenario.text, cursor: scenario.text.length })
        const canonical = await canonicalDraft(page, sessionID)
        const dom = await editor.evaluate((element) => ({ html: element.innerHTML, textContent: element.textContent }))
        const pending = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === endpoint)
        await editor.press("Enter")
        const request = await pending
        const payload = request.postDataJSON() as { parts?: { type: string; text?: string }[]; text?: string }
        const text = protocol === "v1" ? payload.parts?.filter((part) => part.type === "text").map((part) => part.text).join("") : payload.text
        await info.attach("prompt-byte-contract.json", {
          contentType: "application/json",
          body: JSON.stringify({ protocol, newLayoutDesigns, mode: scenario.mode, dom, canonical, payload,
            requestBody: request.postData(),
            expected: receipt(scenario.text), canonicalBytes: receipt(canonical.text), requestBytes: receipt(text ?? ""),
            boundary: "Execution request aborted before server admission; no model/tool calls.",
          }, null, 2),
        })
        if (protocol === "v1") expect(payload.parts).toHaveLength(1)
        expect(text).toBe(scenario.text)
        expect(receipt(text ?? "")).toEqual(receipt(scenario.text))
      } finally {
        const removed = await page.request.delete(`${server}${sessions}/${sessionID}?directory=${encodeURIComponent(directory)}`)
        expect(removed.ok(), await removed.text()).toBe(true)
      }
    })
  }
}

function receipt(text: string) {
  return { bytes: Buffer.byteLength(text), sha256: createHash("sha256").update(text).digest("hex") }
}

async function canonicalDraft(page: Page, sessionID: string) {
  return page.evaluate(async (id) => {
    if (!(await indexedDB.databases()).some((db) => db.name === "orchestra-drafts")) throw new Error("PROMPT_DRAFT_DB_MISSING")
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("orchestra-drafts", 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const document = await new Promise<string | undefined>((resolve, reject) => {
        const store = db.transaction("documents", "readonly").objectStore("documents")
        const keys = store.getAllKeys()
        keys.onerror = () => reject(keys.error)
        keys.onsuccess = () => {
          const matching = keys.result.filter((key) => String(key).endsWith(`:session:${id}:prompt`))
          if (matching.length !== 1) return reject(new Error(`PROMPT_DRAFT_IDENTITY_COUNT:${matching.length}`))
          const value = store.get(matching[0]!)
          value.onsuccess = () => resolve(value.result as string | undefined)
          value.onerror = () => reject(value.error)
        }
      })
      if (!document) throw new Error("PROMPT_DRAFT_DOCUMENT_MISSING")
      const state = JSON.parse(document) as { prompt: { type: string; content?: string }[]; cursor?: number }
      return { text: state.prompt.map((part) => part.content ?? "").join(""), cursor: state.cursor }
    } finally {
      db.close()
    }
  }, sessionID)
}
