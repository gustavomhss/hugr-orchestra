import { expect, test, type Locator } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"
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
    window.api = {
      janitor: {
        getReport: async () => ({ report, source: null }),
        publish: async () => true,
        snooze: async () => {},
        dismiss: async () => {},
        onReport: () => () => {},
      },
    }
  }, report)
  await page.addInitScript(
    ({ directory, sessionID }) => {
      localStorage.setItem(`orchestra.janitor.session.local.${directory}`, sessionID)
    },
    { directory: base64Encode(directory), sessionID: janitorSessionID },
  )

  await setupTimeline(page, {
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
      parts: expect.arrayContaining([expect.objectContaining({ text: "Explain stale generated files" })]),
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
        window.api = {
          janitor: {
            getReport: async () => ({ report, source: null }),
            publish: async () => true,
            snooze: async () => {},
            dismiss: async () => {},
            onReport: () => () => {},
          },
        }
        localStorage.setItem(`orchestra.janitor.session.local.${directory}`, sessionID)
      },
      { report, directory: base64Encode(directory), sessionID: janitorSessionID },
    )
    const timeline = await setupTimeline(page, {
      viewport,
      settings: { newLayoutDesigns: true },
      onPrompt: (input) => prompts.push(input),
      sessions: [session(), session({ id: janitorSessionID, title: "Janitor chat" })],
    })
    await page.getByRole("button", { name: "Dismiss Tabs information", exact: true }).click()
    const debug = page.getByRole("button", { name: "Toggle debug tools", exact: true })
    if ((await debug.getAttribute("aria-pressed")) === "true") await debug.click()
    await expect(debug).toHaveAttribute("aria-pressed", "false")
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
        request.method() === "POST" && new URL(request.url()).pathname === `/session/${routeSessionID}/prompt_async`,
    )
    await send.click()
    expect((await sent).postDataJSON()).toEqual(
      expect.objectContaining({
        parts: expect.arrayContaining([expect.objectContaining({ text: "Continue while Janitor report is visible" })]),
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
        request.method() === "POST" && new URL(request.url()).pathname === `/session/${routeSessionID}/abort`,
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
        parts: expect.arrayContaining([expect.objectContaining({ text: "Explain stale generated files" })]),
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
