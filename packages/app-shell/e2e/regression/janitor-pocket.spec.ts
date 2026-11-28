import { expect, test, type Locator } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"
import type {} from "../../../../apps/desktop/src/renderer/env"
import { currentSession } from "../utils/mock-server"
import {
  directory,
  sessionID as routeSessionID,
  session,
  setupTimeline,
  status,
} from "../performance/timeline-stability/fixture"

const janitorSessionID = "ses_janitor_chat"
const report = JSON.stringify({
  createdAt: "2026-09-08T12:00:00.000Z",
  findings: [
    {
      kind: "stale-worktree",
      severity: "attention",
      summary: "Worktree has stale generated files",
      evidence: "dist/ contains files older than source changes",
      suggestion: "Remove generated files and rerun the build",
    },
  ],
})

test("keeps Janitor chat session, sends prompt, and opens it in session view", async ({ page }) => {
  const prompts: Array<{ sessionID: string; body: unknown }> = []
  await page.addInitScript((report) => {
    Object.assign(window, {
      api: {
        janitor: {
          getReport: async () => ({ report, source: null }),
          publish: async () => true,
          snooze: async () => true,
          dismiss: async () => true,
          onReport: () => () => {},
        },
      } satisfies Pick<Window["api"], "janitor">,
    })
  }, report)
  await page.addInitScript(
    ({ directory, sessionID }) => {
      localStorage.setItem(`orchestra.janitor.session.local.${directory}`, sessionID)
    },
    { directory: base64Encode(directory), sessionID: janitorSessionID },
  )

  await setupTimeline(page, {
    settings: { janitorEnabled: true },
    onPrompt: (input) => prompts.push(input),
    sessions: [
      session({
        id: routeSessionID,
        title: "Timeline visual stability",
      }),
      session({
        id: janitorSessionID,
        title: "Janitor chat",
      }),
    ],
  })
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), `orchestra.janitor.session.local.${base64Encode(directory)}`),
    )
    .toBe(janitorSessionID)

  await expect(page.getByRole("button", { name: "Open janitor report" })).toBeVisible()
  await page.getByRole("button", { name: "Open janitor report" }).click()
  const pocket = page.getByRole("complementary", { name: "Janitor report" })
  await expect(pocket).toBeVisible()
  await expect(pocket.getByRole("button", { name: "Open session" })).toBeVisible()

  const prompt = pocket.getByRole("textbox", { name: "Prompt" })
  await expect(prompt).toBeVisible()
  await prompt.fill("Explain stale generated files")
  await prompt.press("Enter")
  await expect.poll(() => prompts).toHaveLength(1)
  expect(prompts[0]?.sessionID).toBe(janitorSessionID)
  expect(prompts[0]?.body).toEqual(
    expect.objectContaining({
      delivery: "steer",
      prompt: expect.objectContaining({ text: "Explain stale generated files" }),
    }),
  )

  await pocket.getByRole("button", { name: "Open session" }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${janitorSessionID}$`))
  await expect(page.getByRole("heading", { name: "Janitor chat", exact: true })).toBeVisible()
  await expect(page.getByRole("complementary", { name: "Janitor report" })).toHaveCount(0)

  await page.reload()
  await expect(page).toHaveURL(new RegExp(`/session/${janitorSessionID}$`))
  await expect(page.getByRole("heading", { name: "Janitor chat", exact: true })).toBeVisible()
})

test("Janitor uses the adopted Session model and policy while a draft tab is open", async ({ page }) => {
  const draftID = "draft_janitor_policy"
  const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
  const storedModel = { providerID: "opencode", id: "claude-opus-4-6", variant: "default" }
  const janitor = session({ id: janitorSessionID, title: "Janitor chat", model: storedModel })
  await page.addInitScript(({ directory, draftID, report, server, sessionID, slug }) => {
    Object.assign(window, {
      api: {
        janitor: {
          getReport: async () => ({ report, source: null }),
          publish: async () => true,
          snooze: async () => true,
          dismiss: async () => true,
          onReport: () => () => {},
        },
      } satisfies Pick<Window["api"], "janitor">,
    })
    localStorage.setItem(`orchestra.janitor.session.local.${slug}`, sessionID)
    localStorage.setItem("orchestra.window.browser.dat:tabs", JSON.stringify([{ type: "draft", draftID, server, directory }]))
    localStorage.setItem("orchestra.global.dat:server", JSON.stringify({
      projects: { local: [{ worktree: directory, expanded: true }] }, lastProject: { local: directory },
    }))
  }, { directory, draftID, report, server, sessionID: janitorSessionID, slug: base64Encode(directory) })
  await setupTimeline(page, { settings: { janitorEnabled: true }, sessions: [session(), janitor], variants: ["default"] })

  const writes: unknown[] = []
  const history = Promise.withResolvers<void>()
  let metadataUnavailable = true
  let firstHistory = true
  let creates = 0
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/session") creates++
  })
  let policy: { mode: "allowlist"; models: unknown[] } | { mode: "inherit" } = { mode: "allowlist", models: [] }
  await page.route((url) => url.pathname === `/api/session/${janitorSessionID}`, (route) => {
    if (route.request().method() !== "GET") return route.fallback()
    if (metadataUnavailable) return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" } })
    return route.fulfill({
      json: { data: { ...currentSession(janitor), subagentModels: policy } },
      headers: { "access-control-allow-origin": "*" },
    })
  })
  await page.route((url) => url.pathname === `/api/session/${janitorSessionID}/subagent-models`, (route) => {
    if (route.request().method() !== "POST") return route.fallback()
    const body = route.request().postDataJSON()
    writes.push(body)
    policy = body.policy
    return route.fulfill({ json: { data: policy }, headers: { "access-control-allow-origin": "*" } })
  })

  await page.route((url) => url.pathname === `/api/session/${janitorSessionID}/message`, async (route) => {
    if (route.request().method() !== "GET" || !firstHistory) return route.fallback()
    firstHistory = false
    await history.promise
    return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" } })
  })

  await page.goto(`/new-session?draftId=${draftID}`)
  const draft = page.locator('[data-session-kind="new"] [data-component="prompt-input-v2"]')
  const draftInput = draft.getByRole("textbox", { name: "Prompt" })
  const draftChip = draft.locator('[data-action="prompt-subagent-models"]')
  await draftInput.fill("Unsent draft text")
  await expect(draftChip).toHaveText("Subagents · Default")
  await draftChip.click()
  const dialog = page.getByRole("dialog", { name: "Subagent models" })
  const draftModel = dialog.getByRole("switch", { name: "Claude Opus 4.6" })
  await expect(draftModel).toBeEnabled()
  await dialog.locator('[data-slot="list-item"][data-key="opencode:claude-opus-4-6"]').click()
  await expect(draftModel).toBeChecked()
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(draftChip).toHaveText("Subagents · 1")

  const pocket = page.getByRole("complementary", { name: "Janitor report" })
  await page.getByRole("button", { name: "Open janitor report" }).click()
  await expect(pocket.getByText("Composer unavailable here.")).toBeVisible()
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key),
    `orchestra.janitor.session.local.${base64Encode(directory)}`)).toBe(janitorSessionID)
  expect(creates).toBe(0)

  metadataUnavailable = false
  const modelRequest = page.waitForRequest((request) => request.method() === "POST" &&
    new URL(request.url()).pathname === "/api/model/execution" && request.postDataJSON().context.sessionID === janitorSessionID)
  const chip = pocket.locator('[data-action="prompt-subagent-models"]')
  try {
    await pocket.getByRole("button", { name: "Retry" }).click()
    expect((await modelRequest).postDataJSON()).toMatchObject({
      context: { type: "session", sessionID: janitorSessionID }, model: storedModel,
    })
    await expect(pocket.getByRole("textbox", { name: "Prompt" })).toBeEditable()
    await expect(chip).toHaveText("Subagents · 0")
  } finally {
    history.resolve()
  }
  const retryHistory = pocket.getByRole("button", { name: "Retry" })
  await expect(retryHistory).toBeVisible()
  await expect(pocket.getByRole("textbox", { name: "Prompt" })).toBeEditable()
  await retryHistory.click()
  await expect(retryHistory).toHaveCount(0)
  expect(creates).toBe(0)
  await chip.click()
  await expect(dialog.locator('[data-status="none-allowed"]')).toBeVisible()
  await dialog.getByRole("button", { name: "Inherit", exact: true }).click()
  await expect.poll(() => writes).toEqual([{ policy: { mode: "inherit" } }])
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(draftChip).toHaveText("Subagents · 1")
  await expect(draftInput).toHaveText("Unsent draft text")
  await expect(page).toHaveURL(`/new-session?draftId=${draftID}`)
})

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 720 },
]) {
  test(`collapsed Janitor leaves composer and navigation actionable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const prompts: Array<{ sessionID: string; body: unknown }> = []
    await page.addInitScript(
      ({ report, directory, sessionID }) => {
        Object.assign(window, {
          api: {
            janitor: {
              getReport: async () => ({ report, source: null }),
              publish: async () => true,
              snooze: async () => true,
              dismiss: async () => true,
              onReport: () => () => {},
            },
          } satisfies Pick<Window["api"], "janitor">,
        })
        localStorage.setItem(`orchestra.janitor.session.local.${directory}`, sessionID)
      },
      { report, directory: base64Encode(directory), sessionID: janitorSessionID },
    )
    const timeline = await setupTimeline(page, {
      viewport,
      settings: { janitorEnabled: true },
      onPrompt: (input) => prompts.push(input),
      sessions: [session(), session({ id: janitorSessionID, title: "Janitor chat" })],
    })
    const debug = page.getByRole("button", { name: "Toggle debug tools", exact: true })
    if ((await debug.isVisible()) && (await debug.getAttribute("aria-pressed")) === "true") await debug.click()
    const pocket = page.getByRole("complementary", { name: "Janitor report" })
    const open = pocket.getByRole("button", { name: "Open janitor report", exact: true })
    const composer = page.locator('[data-component="prompt-input-v2"]')
    const input = composer.locator('[data-component="prompt-input"][contenteditable="true"]')
    const send = composer.getByRole("button", { name: "Send", exact: true })
    await expect(open).toBeVisible()
    await expect(open).toContainText("Janitor found 1 issue")
    await expect(pocket).toHaveCSS("width", "420px")
    await input.fill("Continue while Janitor report is visible")
    await expect(send).toBeEnabled()
    await expectCenterHit(send)
    await expectCenterHit(open)

    // Check real header/sidebar controls too: relocating obstruction must not move the bug.
    const navigation = page.locator(
      'header button, [data-session-title] button, [data-component="sidebar-nav-desktop"] button, [data-component="sidebar-nav-mobile"] button',
    )
    const visible = await navigation.evaluateAll((buttons) =>
      buttons.flatMap((button, index) => {
        const rect = button.getBoundingClientRect()
        return rect.width > 0 &&
          rect.height > 0 &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight &&
          rect.left >= 0 &&
          rect.right <= innerWidth
          ? [index]
          : []
      }),
    )
    expect(visible.length, "fixture must expose navigation controls").toBeGreaterThan(0)
    for (const index of visible) await expectCenterHit(navigation.nth(index))
    await test.info().attach("collapsed", { body: await page.screenshot(), contentType: "image/png" })

    const sent = page.waitForRequest(
      (request) =>
        request.method() === "POST" && new URL(request.url()).pathname === `/api/session/${routeSessionID}/prompt`,
    )
    await send.click()
    expect((await sent).postDataJSON()).toEqual(
      expect.objectContaining({
        delivery: "steer",
        prompt: expect.objectContaining({ text: "Continue while Janitor report is visible" }),
      }),
    )
    await expect.poll(() => prompts).toHaveLength(1)
    expect(prompts[0]?.sessionID).toBe(routeSessionID)
    await expect(open).toBeVisible()

    await timeline.send(status("busy"))
    const stop = composer.getByRole("button", { name: "Stop", exact: true })
    await expect(stop).toBeEnabled()
    await expectCenterHit(stop)
    const stopped = page.waitForRequest(
      (request) =>
        request.method() === "POST" && new URL(request.url()).pathname === `/api/session/${routeSessionID}/interrupt`,
    )
    await stop.click()
    await stopped
    await timeline.send(status("idle"))

    await open.click()
    await expect(pocket.getByRole("button", { name: "Open session", exact: true })).toBeVisible()
    await expect(pocket).toHaveCSS("bottom", "16px")
    await expect(pocket).toHaveCSS("z-index", "1000")
    await expect(pocket).toHaveCSS("width", "420px")
    const chat = pocket.getByRole("textbox", { name: "Prompt", exact: true })
    await expect(chat).toBeEditable()
    await test.info().attach("expanded", { body: await page.screenshot(), contentType: "image/png" })
    await chat.fill("Explain stale generated files")
    await chat.press("Enter")
    await expect.poll(() => prompts).toHaveLength(2)
    expect(prompts[1]).toEqual({
      sessionID: janitorSessionID,
      body: expect.objectContaining({
        delivery: "steer",
        prompt: expect.objectContaining({ text: "Explain stale generated files" }),
      }),
    })

    const close = pocket.getByRole("button", { name: "Collapse janitor report", exact: true })
    await close.focus()
    await expect(close).toBeFocused()
    await close.press("Enter")
    await expect(open).toBeVisible()
    await input.fill("Send remains clear after collapse")
    await expectCenterHit(send)
    await expectCenterHit(open)
    await open.focus()
    await expect(open).toBeFocused()
    await open.press("Enter")
    const dismiss = pocket.getByRole("button", { name: "Dismiss", exact: true })
    await expect(dismiss).toBeEnabled()
    await dismiss.focus()
    await expect(dismiss).toBeFocused()
    await dismiss.press("Enter")
    await expect(pocket).toHaveCount(0)
  })
}

async function expectCenterHit(target: Locator) {
  await expect(target).toBeVisible()
  await expect
    .poll(
      () =>
        target.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          const hit = document.elementFromPoint(point.x, point.y)
          if (rect.width > 0 && rect.height > 0 && !!hit && element.contains(hit)) return null
          return {
            target: element.getAttribute("aria-label") ?? element.textContent,
            hit: hit?.closest("button, aside")?.getAttribute("aria-label") ?? hit?.tagName ?? null,
            point,
          }
        }),
      { message: "control center must hit actual control, not Janitor or another overlay" },
    )
    .toBeNull()
}
