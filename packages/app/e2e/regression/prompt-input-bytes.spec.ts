import { createHash, randomUUID } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"
import type { ProviderListResponse } from "@orchestra/sdk/v2/client"
import { mockOrchestraServer } from "../utils/mock-server"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const directory = "C:/Orchestra/PromptBytesRegression"
const projectID = "proj_prompt_bytes"
const provider = {
  all: [{
    id: "opencode", name: "Orchestra", source: "config", env: [], options: {},
    models: {
      "claude-opus-4-6": {
        id: "claude-opus-4-6", providerID: "opencode", name: "Claude Opus 4.6",
        api: { id: "claude-opus-4-6", url: "https://provider.invalid", npm: "@ai-sdk/anthropic" },
        capabilities: {
          temperature: true, reasoning: true, attachment: true, toolcall: true, interleaved: false,
          input: { text: true, audio: false, image: true, video: false, pdf: true },
          output: { text: true, audio: false, image: false, video: false, pdf: false },
        },
        cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
        limit: { context: 200_000, output: 8_000 },
        status: "active", options: {}, headers: {}, release_date: "2026-01-01", variants: {},
      },
    },
  }],
  connected: ["opencode"],
  default: { opencode: "claude-opus-4-6" },
} satisfies ProviderListResponse
const sample = "\n```owner-demand\né — 😀\u200B\n\n``` \n\n"
const cases = [
  { mode: "fill", text: sample },
  { mode: "paste", text: sample + "row\n".repeat(240) },
  { mode: "shift-enter", text: "lead\n\né — 😀\u200B\n\n" },
  { mode: "raw-clipboard", text: "\r\n```owner-demand\ré — 😀\u200B\r\n\r\n```\n" },
] as const

// Production app and real editor/store/serializer; fixtures stop at the HTTP boundary.
// Execution requests are captured and aborted, never replaced by model or Agent frames.
for (const newLayoutDesigns of [false, true]) {
  for (const scenario of cases) {
    test(`prompt bytes: ${newLayoutDesigns ? "V2" : "legacy"} ${scenario.mode}`, async ({ page, context }, info) => {
      const sessionID = `ses_prompt_bytes_${randomUUID().replaceAll("-", "")}`
      await mockOrchestraServer(page, {
        protocol: "v1",
        directory,
        project: {
          id: projectID, worktree: directory, vcs: "git", name: "prompt-bytes",
          time: { created: 1700000000000, updated: 1700000000000 }, sandboxes: [],
        },
        provider,
        sessions: [{
          id: sessionID, slug: "prompt-bytes", projectID, directory, title: info.title, version: "dev",
          agent: "maestro", model: { id: "claude-opus-4-6", providerID: "opencode" },
          time: { created: 1700000000000, updated: 1700000000000 },
        }],
        pageMessages: () => ({ items: [] }),
      })
      const endpoint = `/session/${sessionID}/prompt_async`
      await page.route(/\/(?:api\/)?session\/[^/]+\/(?:prompt(?:_async)?|message|command|shell)(?:\?|$)/, (route) =>
        route.request().method() === "POST" ? route.abort("blockedbyclient") : route.fallback(),
      )
      await page.addInitScript(({ newLayoutDesigns, directory, server, sessionID }) => {
        localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns, shouldDisplayTabsToast: false } }))
        if (!newLayoutDesigns) localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.17.20" }))
        localStorage.setItem("orchestra.global.dat:server", JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] }, lastProject: { local: directory },
        }))
        localStorage.setItem("orchestra.window.browser.dat:tabs", JSON.stringify([
          { type: "session", server, sessionId: sessionID },
        ]))
      }, { newLayoutDesigns, directory, server, sessionID })
      await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
      const editor = page.locator('[data-component="prompt-input"][contenteditable="true"]')
      await expect(editor).toHaveCount(1)
      await expect(editor).toBeEditable()
      await expect(page.locator('[data-component="prompt-input-v2"]')).toHaveCount(newLayoutDesigns ? 1 : 0)
      await expect(page.locator('[data-action="prompt-model"]')).toContainText("Claude Opus 4.6")

      if (scenario.mode === "fill") await editor.fill(scenario.text)
      if (scenario.mode === "paste") {
        await context.grantPermissions(["clipboard-read", "clipboard-write"])
        await editor.focus()
        await page.evaluate((text) => navigator.clipboard.writeText(text), scenario.text)
        const clipboard = await page.evaluate(() => navigator.clipboard.readText())
        await info.attach("native-clipboard-receipt.json", {
          contentType: "application/json",
          body: JSON.stringify({ provenance: "native-clipboard-shortcut", text: clipboard, ...receipt(clipboard) }),
        })
        expect(clipboard).toBe(scenario.text)
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
      const payload: { parts: { type: string; text?: string }[]; model: { providerID: string; modelID: string } } = request.postDataJSON()
      expect(payload.parts).toHaveLength(1)
      expect(payload.parts[0]?.type).toBe("text")
      const text = payload.parts[0]?.text ?? ""
      await info.attach("prompt-byte-contract.json", {
        contentType: "application/json",
        body: JSON.stringify({
          protocol: "v1", newLayoutDesigns, mode: scenario.mode, sessionID, dom, canonical, payload,
          inputProvenance: scenario.mode === "raw-clipboard" ? "synthetic-raw-clipboard-event" : scenario.mode === "paste" ? "native-clipboard-shortcut" : scenario.mode,
          requestBody: request.postData(),
          expected: receipt(scenario.text), domHTMLBytes: receipt(dom.html), domTextBytes: receipt(dom.textContent ?? ""),
          canonicalBytes: receipt(canonical.text), requestBytes: receipt(text),
          requestBodyBytes: receipt(request.postData() ?? ""),
          boundary: "HTTP bootstrap fixtures; actual production UI execution request captured then aborted. No backend admission or model/tool proof.",
        }, null, 2),
      })
      expect(payload.model).toEqual({ providerID: "opencode", modelID: "claude-opus-4-6" })
      expect(text).toBe(scenario.text)
      expect(receipt(text)).toEqual(receipt(scenario.text))
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
