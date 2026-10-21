import { createHash, randomUUID } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"
import type { FilePartInput, TextPartInput } from "../../v2-types"
import type { ProviderListResponse } from "../../v2-wire"

import { mockOrchestraServer } from "../utils/mock-server"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const directory = "C:/Orchestra/PromptBytesRegression"
const projectID = "proj_prompt_bytes"
const provider = {
  all: [{
    id: "orchestra", name: "Orchestra", source: "config", env: [], options: {},
    models: {
      "claude-opus-4-6": {
        id: "claude-opus-4-6", providerID: "orchestra", name: "Claude Opus 4.6",
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
  connected: ["orchestra"],
  default: { orchestra: "claude-opus-4-6" },
} satisfies ProviderListResponse
const sample = "\n```owner-demand\né — 😀\u200B\n\n``` \n\n"
const rawClipboard = "\r\n```owner-demand\ré — 😀\u200B\r\n\r\n```\n"
const cases = [
  { mode: "fill", text: sample },
  { mode: "paste", text: sample + "row\n".repeat(240) },
  { mode: "shift-enter", text: "lead\n\né — 😀\u200B\n\n" },
  { mode: "raw-clipboard", text: rawClipboard },
  { mode: "replace-break", before: "a\nb", text: "axb", cursor: 2 },
  { mode: "insert-break", before: "a\nb", text: "a\n\nb", cursor: 2 },
  { mode: "undo-shift-enter", before: "base", text: "base\n" },
  { mode: "undo-raw-clipboard", before: "base", text: "base" + rawClipboard },
  { mode: "undo-pill", before: "see @note.md ", text: "see @note.md x" },
  { mode: "paste-pill-interior", before: "see @note.md ", text: "see x@note.md ", cursor: 5 },
  { mode: "guarded-enter", text: "keep" },
  { mode: "popover-populated", text: "see @note\n" },
  { mode: "popover-empty", text: "see @missing\n" },
  { mode: "undo-pill-history", text: "see @note.md x\n", cursor: 14 },
] as const

// Production app and real editor/store/serializer; fixtures stop at the HTTP boundary.
// Execution requests are captured and aborted, never replaced by model or Agent frames.
for (const scenario of cases) {
  test(`prompt bytes: V2 ${scenario.mode}`, async ({ page, context }, info) => {
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
        agent: "maestro", model: { id: "claude-opus-4-6", providerID: "orchestra" },
        time: { created: 1700000000000, updated: 1700000000000 },
      }],
      pageMessages: () => ({ items: [] }),
      findFiles: ({ query }) => query.includes("note") ? ["note.md"] : [],
    })
    const endpoint = `/session/${sessionID}/prompt_async`
    const executions: { url: string; body: string | null }[] = []
    await page.route(/\/(?:api\/)?session\/[^/]+\/(?:prompt(?:_async)?|message|command|shell)(?:\?|$)/, (route) => {
      const request = route.request()
      if (request.method() !== "POST") return route.fallback()
      executions.push({ url: request.url(), body: request.postData() })
      return route.abort("blockedbyclient")
    })
    await page.addInitScript(({ directory, server, sessionID }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { shouldDisplayTabsToast: false } }))
      localStorage.setItem("orchestra.global.dat:server", JSON.stringify({
        projects: { local: [{ worktree: directory, expanded: true }] }, lastProject: { local: directory },
      }))
      localStorage.setItem("orchestra.window.browser.dat:tabs", JSON.stringify([
        { type: "session", server, sessionId: sessionID },
      ]))
    }, { directory, server, sessionID })
    await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
    const editor = page.locator('[data-component="prompt-input"][contenteditable="true"]')
    await expect(editor).toHaveCount(1)
    await expect(editor).toBeEditable()
    await expect(page.locator('[data-component="prompt-input-v2"]')).toHaveCount(1)
    await expect(page.locator('[data-action="prompt-model"]')).toContainText("Claude Opus 4.6")
    // Lead-owned join exposes the shared submitting lifecycle on the composer.
    const admission = page.locator("[data-prompt-admitting]")
    await expect(admission).toHaveCount(1)
    await expect(admission).toHaveAttribute("data-prompt-admitting", "false")
    expect(executions).toHaveLength(0)

    const before = "before" in scenario ? scenario.before : undefined
    if (before && scenario.mode !== "undo-pill" && scenario.mode !== "paste-pill-interior") await editor.fill(before)
    if (scenario.mode === "replace-break" || scenario.mode === "insert-break") {
      await editor.press(process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home")
      await editor.press("ArrowRight")
      if (scenario.mode === "replace-break") {
        await editor.press("Shift+ArrowRight")
        await context.grantPermissions(["clipboard-read", "clipboard-write"])
        await page.evaluate(() => navigator.clipboard.writeText("x"))
        await editor.press(process.platform === "darwin" ? "Meta+V" : "Control+V")
      }
      if (scenario.mode === "insert-break") await editor.press("Shift+Enter")
    }
    if (scenario.mode === "undo-shift-enter") await editor.press("Shift+Enter")
    if (scenario.mode === "undo-raw-clipboard") {
      // Known raw CR data enters the real paste handler; history actions below use native keyboard shortcuts.
      await editor.evaluate((element, text) => {
        const clipboardData = new DataTransfer()
        clipboardData.setData("text/plain", text)
        element.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }))
      }, rawClipboard)
    }
    const pill = editor.locator('[data-mention="file"]')
    const pillIdentity = (["undo-pill", "paste-pill-interior", "undo-pill-history"].includes(scenario.mode)) ? await (async () => {
      await editor.fill("see @note")
      await page.locator('[data-suggestion-id="file:note.md"]').click()
      await expect(pill).toHaveText("@note.md")
      await editor.press("End")
      await expect.poll(() => canonicalDraft(page, sessionID)).toEqual({ text: "see @note.md ", cursor: 13 })
      const identity = await pill.elementHandle()
      if (!identity) throw new Error("PROMPT_BYTES_PILL_IDENTITY_MISSING")
      if (scenario.mode === "undo-pill-history") {
        await page.keyboard.insertText("base")
        await expect.poll(() => canonicalDraft(page, sessionID)).toEqual({ text: "see @note.md base", cursor: 17 })
        expect(await identity.evaluate((element) => element.isConnected)).toBe(true)
        await editor.press("Shift+Enter")
        await expect.poll(() => canonicalDraft(page, sessionID)).toEqual({ text: "see @note.md base\n", cursor: 18 })
        expect(await identity.evaluate((element) => element.isConnected)).toBe(true)
        // Fixture selects the known typed word; replacement and history below use native keyboard actions.
        await editor.evaluate((element) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          let node = walker.nextNode()
          while (node && !(node.textContent ?? "").endsWith("base")) node = walker.nextNode()
          if (!node) throw new Error("PROMPT_HISTORY_TYPED_WORD_MISSING")
          const range = document.createRange()
          range.setStart(node, (node.textContent ?? "").length - 4)
          range.setEnd(node, (node.textContent ?? "").length)
          const selection = window.getSelection()!
          selection.removeAllRanges()
          selection.addRange(range)
        })
      }
      if (scenario.mode === "paste-pill-interior") await pill.evaluate((element) => {
        // Synthetic interior endpoint, followed by a genuine native paste: must snap left, outside the pill.
        const range = document.createRange()
        range.setStart(element.firstChild!, 1)
        range.collapse(true)
        const selection = window.getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
      })
      await context.grantPermissions(["clipboard-read", "clipboard-write"])
      await page.evaluate(() => navigator.clipboard.writeText("x"))
      await editor.press(process.platform === "darwin" ? "Meta+V" : "Control+V")
      return identity
    })() : undefined

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

    if (scenario.mode === "popover-populated" || scenario.mode === "popover-empty") {
      const query = scenario.mode === "popover-populated" ? "note" : "missing"
      const fetched = page.waitForResponse((response) => {
        const url = new URL(response.url())
        return url.origin === new URL(server).origin && response.request().method() === "GET" &&
          url.pathname === "/find/file" && url.searchParams.get("query") === query
      })
      await editor.fill(`see @${query}`)
      const response = await fetched
      expect(response.ok()).toBe(true)
      expect(await response.finished()).toBeNull()
      if (scenario.mode === "popover-populated") await expect(page.locator('[data-suggestion-id="file:note.md"]')).toBeVisible()
      if (scenario.mode === "popover-empty") await expect(page.getByText("No matching items", { exact: true })).toBeVisible()
      await editor.press("Shift+Enter")
      await expect(editor.locator("[data-mention]")).toHaveCount(0)
    }

    if (scenario.mode === "guarded-enter") {
      await editor.fill("keep")
      // Synthetic dispatch verifies production handler guards; this is not a native OS IME proof.
      for (const guard of [{ isComposing: true }, { keyCode: 229 }, { altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
        const result = await editor.evaluate((element, init) => {
          const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true, ...init })
          element.dispatchEvent(event)
          return { prevented: event.defaultPrevented, keyCode: event.keyCode, composing: event.isComposing }
        }, guard)
        expect(result).toEqual({ prevented: false, keyCode: "keyCode" in guard ? 229 : 0, composing: "isComposing" in guard })
      }
      await editor.dispatchEvent("compositionstart", { data: "候" })
      expect(await editor.evaluate((element) => {
        const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true })
        element.dispatchEvent(event)
        return event.defaultPrevented
      })).toBe(false)
      await editor.dispatchEvent("compositionend", { data: "" })
    }

    const insertionCursor = "cursor" in scenario ? scenario.cursor : scenario.text.length
    const hasHistory = !!before || scenario.mode === "undo-pill-history"
    await expect.poll(() => canonicalDraft(page, sessionID)).toEqual({ text: scenario.text, cursor: insertionCursor })
    if (hasHistory) {
      const inserted = await canonicalDraft(page, sessionID)
      await info.attach("immediate-insertion-receipt.json", {
        contentType: "application/json", body: JSON.stringify({ phase: "immediate-insertion", expectedLogicalCursor: insertionCursor, canonical: inserted, ...receipt(inserted.text) }),
      })
    }
    if (scenario.mode === "undo-pill-history") {
      for (const text of ["see @note.md base\n", "see @note.md base", "see @note.md "]) {
        await editor.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z")
        await expect.poll(async () => (await canonicalDraft(page, sessionID)).text).toBe(text)
        expect(await pillIdentity!.evaluate((element) => element.isConnected)).toBe(true)
        const canonical = await canonicalDraft(page, sessionID)
        await info.attach(`history-undo-${text.length}.json`, { contentType: "application/json", body: JSON.stringify({ phase: "native-undo", canonical, ...receipt(canonical.text) }) })
      }
      for (const text of ["see @note.md base", "see @note.md base\n", scenario.text]) {
        await editor.press(process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Shift+Z")
        await expect.poll(async () => (await canonicalDraft(page, sessionID)).text).toBe(text)
        expect(await pillIdentity!.evaluate((element) => element.isConnected)).toBe(true)
        const canonical = await canonicalDraft(page, sessionID)
        await info.attach(`history-redo-${text.length}.json`, { contentType: "application/json", body: JSON.stringify({ phase: "native-redo", selectionPolicy: "browser-owned", canonical, ...receipt(canonical.text) }) })
      }
    }
    if (before) {
      if (pillIdentity) expect(await pillIdentity.evaluate((element) => element.isConnected)).toBe(true)
      await editor.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z")
      await expect.poll(async () => (await canonicalDraft(page, sessionID)).text).toBe(before)
      if (pillIdentity) expect(await pillIdentity.evaluate((element) => element.isConnected)).toBe(true)
      const undone = await canonicalDraft(page, sessionID)
      expect(undone.text).toBe(before)
      await info.attach("native-undo-receipt.json", {
        contentType: "application/json", body: JSON.stringify({ provenance: "native-keyboard-history", phase: "native-undo", canonical: undone, ...receipt(undone.text) }),
      })
      await editor.press(process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Shift+Z")
      // Browser history owns Redo selection; our explicit post-insert caret move is outside its transaction.
      // Immediate insertion above still requires the exact logical offset, including cursor 2 for boundary edits.
      await expect.poll(async () => (await canonicalDraft(page, sessionID)).text).toBe(scenario.text)
      if (pillIdentity) expect(await pillIdentity.evaluate((element) => element.isConnected)).toBe(true)
      const redone = await canonicalDraft(page, sessionID)
      await info.attach("native-redo-receipt.json", {
        contentType: "application/json", body: JSON.stringify({ provenance: "native-keyboard-history", phase: "native-redo", selectionPolicy: "browser-owned", canonical: redone, ...receipt(redone.text) }),
      })
    }

    const finalCursor = hasHistory ? scenario.text.length : insertionCursor
    if (hasHistory) {
      await editor.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End")
      // Legacy persists navigation cursor on blur; use its normal focus lifecycle, never mutate draft storage.
      await editor.blur()
      await expect.poll(() => canonicalDraft(page, sessionID)).toEqual({ text: scenario.text, cursor: finalCursor })
      const navigated = await canonicalDraft(page, sessionID)
      await info.attach("post-history-navigation-receipt.json", {
        contentType: "application/json", body: JSON.stringify({ phase: "explicit-end-navigation", expectedCursor: finalCursor, canonical: navigated, ...receipt(navigated.text) }),
      })
    }

    await info.attach("prompt-dom-before-send.json", {
      contentType: "application/json",
      body: JSON.stringify(await editor.evaluate((element) => ({ html: element.innerHTML, textContent: element.textContent }))),
    })
    await expect.poll(() => canonicalDraft(page, sessionID)).toEqual({ text: scenario.text, cursor: finalCursor })
    const canonical = await canonicalDraft(page, sessionID)
    const dom = await editor.evaluate((element) => ({ html: element.innerHTML, textContent: element.textContent }))
    await expect(admission).toHaveAttribute("data-prompt-admitting", "false")
    expect(executions).toHaveLength(0)
    const pending = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === endpoint)
    const failed = page.waitForEvent("requestfailed", { predicate: async (candidate) => candidate === await pending })
    await editor.press("Enter")
    const request = await pending
    expect(new URL(request.url()).origin).toBe(new URL(server).origin)
    expect(await failed).toBe(request)
    await expect(admission).toHaveAttribute("data-prompt-admitting", "false")
    expect(executions).toHaveLength(1)
    expect(new URL(executions[0]!.url).pathname).toBe(endpoint)
    expect(executions[0]!.body).toBe(request.postData())
    const payload: { parts: (TextPartInput | FilePartInput)[]; model: { providerID: string; modelID: string } } = request.postDataJSON()
    const textParts = payload.parts.filter((part) => part.type === "text")
    expect(textParts).toHaveLength(1)
    expect(payload.parts).toHaveLength(pillIdentity ? 2 : 1)
    if (pillIdentity) {
      const start = scenario.mode === "paste-pill-interior" ? 5 : 4
      expect(payload.parts.find((part) => part.type === "file")?.source?.text).toEqual({ value: "@note.md", start, end: start + 8 })
    }
    const text = textParts[0]?.text ?? ""
    await info.attach("prompt-byte-contract.json", {
      contentType: "application/json",
      body: JSON.stringify({
        protocol: "v1", mode: scenario.mode, sessionID, dom, canonical, payload, executions,
        cursorContract: { immediateInsertion: insertionCursor, finalBeforeSend: finalCursor, nativeRedo: "browser-owned selection recorded in history receipts" },
        inputProvenance: scenario.mode === "raw-clipboard" || scenario.mode === "undo-raw-clipboard"
          ? "synthetic-raw-clipboard-event; native keyboard history when requested"
          : scenario.mode === "guarded-enter" ? "synthetic IME/modifier dispatch; no native OS IME claim"
          : scenario.mode === "paste-pill-interior" ? "synthetic pill endpoint; native clipboard/history"
          : scenario.mode === "undo-pill-history" ? "native typing/line edit/history; synthetic typed-word selection; native paste"
          : scenario.mode === "paste" ? "native-clipboard-shortcut" : scenario.mode,
        requestBody: request.postData(),
        expected: receipt(scenario.text), domHTMLBytes: receipt(dom.html), domTextBytes: receipt(dom.textContent ?? ""),
        canonicalBytes: receipt(canonical.text), requestBytes: receipt(text),
        requestBodyBytes: receipt(request.postData() ?? ""),
        boundary: "HTTP bootstrap fixtures; actual production UI execution request captured then aborted. No backend admission or model/tool proof.",
      }, null, 2),
    })
    expect(payload.model).toEqual({ providerID: "orchestra", modelID: "claude-opus-4-6" })
    expect(text).toBe(scenario.text)
    expect(receipt(text)).toEqual(receipt(scenario.text))
  })
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
