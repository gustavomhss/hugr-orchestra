import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { expectSessionTitle } from "../utils/waits"
import {
  build,
  config,
  created,
  directory,
  governedMessages,
  maestro,
  projectID,
  server,
  sessionID,
  setupGovernance,
  title,
} from "./governance.fixture"

test.use({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" })
test.setTimeout(120_000)

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: shows the session's real Maestro records read-only and returns with Escape`, async ({ page }) => {
    const requests = await setupGovernance(page, {
      scheme,
      agents: [build, maestro],
      config,
      messages: governedMessages(),
    })
    await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
    await expectSessionTitle(page, title)
    await expect(page.getByRole("dialog")).toHaveCount(0)

    const entry = page
      .locator('[data-component="orchestra-sidebar"]')
      .getByRole("button", { name: "Maestro", exact: true })
    const before = requests.length
    await entry.click()
    const dialog = page.getByRole("dialog", { name: "Maestro governance" })
    await expect(dialog).toBeVisible()

    const identity = dialog.locator(".orchestra-governance-facts").filter({ hasText: sessionID })
    await expect(identity).toContainText(sessionID)
    await expect(identity).toContainText(projectID)
    await expect(identity).toContainText("Offered by this server")
    await expect(dialog.locator('[data-slot="reader-unavailable"]')).toContainText(
      "Current governance is unavailable here",
    )
    await expect(dialog.locator('[data-slot="maestro-unavailable"]')).toHaveCount(0)

    // Model prose claims approval; the server result only confirms a historical presentation.
    const summary = dialog.locator(".orchestra-governance-summary")
    await expect(summary).toHaveAttribute("data-state", "awaiting")
    await expect(summary).toContainText("Presentation recorded; no later decision result is loaded.")
    await expect(summary).toContainText("Still current: unknown.")
    await expect(dialog.getByRole("button", { name: /approve|decline|grant|authorize/i })).toHaveCount(0)

    const grounding = dialog.getByRole("region", { name: "Grounding · Atlas / Own" })
    await expect(grounding).toContainText("Configured for Atlas project atlas-hugr. Not verified here.")
    await expect(grounding.locator('[data-kind="catalog"]')).toContainText("cat-7")
    const context = grounding.locator('[data-kind="context"]')
    await expect(context).toHaveAttribute("data-state", "hold")
    await expect(context).toContainText("On hold")
    await expect(context).toContainText("context-dirty: src/approval.ts")

    const evidence = dialog.getByRole("region", { name: "Validation and review" })
    await expect(evidence.locator('[data-kind="validation"]')).toContainText("VALID")
    await expect(evidence.locator('[data-kind="validation"]')).toContainText("evt_maestro_validation_1")
    await expect(evidence.locator('[data-kind="lucy"]')).toContainText("APPROVE")
    await expect(dialog.getByRole("region", { name: "Admission, plan, and work card" })).toContainText(
      "Work-card identity, contents, and attempt binding are not returned",
    )
    await page.screenshot({ path: test.info().outputPath(`governance-${scheme}.png`) })
    // The body scrolls under a fixed header, so the last section is reachable inside the 80dvh bound.
    await evidence.scrollIntoViewIfNeeded()
    await expect(dialog.getByRole("heading", { name: "Maestro governance" })).toBeInViewport()
    await expect(evidence.locator('[data-kind="lucy"]')).toBeInViewport()
    await page.screenshot({ path: test.info().outputPath(`governance-${scheme}-scrolled.png`) })

    const catalog = grounding.locator('[data-kind="catalog"]')
    await catalog.getByText("Retained server output", { exact: true }).click()
    await expect(catalog.locator("pre")).toContainText('"unit":"own:approval"')
    await expect(catalog.locator("pre")).toContainText('"tokenEstimate":120')

    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(entry).toBeFocused()
    await expect(page).toHaveURL(new RegExp(`/session/${sessionID}$`))
    expect(requests.slice(before).filter((request) => request.method !== "GET")).toEqual([])
    // Positive control: the request observer sees the bootstrap reads.
    expect(requests.some((request) => new URL(request.url).pathname === "/agent")).toBe(true)
  })
}

test("Show in chat moves to the record's turn through the existing message hash", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await setupGovernance(page, {
    protocol: "v2",
    agents: [build, maestro],
    config,
    messages: [],
    currentMessages: [
      { id: "msg_user_1", type: "user", time: { created }, text: "Review this plan" },
      {
        id: "msg_maestro_1",
        type: "assistant",
        agent: "maestro",
        model: { id: "claude-opus-4-6", providerID: "opencode" },
        time: { created: created + 1_000 },
        content: [
          {
            id: "call_validation",
            type: "tool",
            name: "maestro_record_validation",
            time: { created: created + 2_000, completed: created + 3_000 },
            state: {
              status: "completed",
              input: { validationRecordID: "evt_proposed", outcome: "INVALID" },
              structured: { validationRecordID: "evt_current_validation", outcome: "VALID" },
              content: [{ type: "text", text: "VALID: evt_current_validation" }],
            },
          },
          {
            id: "call_presentation",
            type: "tool",
            name: "maestro_present_approval",
            time: { created: created + 4_000 },
            state: {
              status: "completed",
              input: {},
              structured: { presentationID: "apr_current" },
              content: [{ type: "text", text: "Retained presentation" }],
            },
          },
        ],
      },
    ],
  })
  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await expectSessionTitle(page, title)
  await page
    .locator('[data-component="orchestra-sidebar"]')
    .getByRole("button", { name: "Maestro", exact: true })
    .click()
  const dialog = page.getByRole("dialog", { name: "Maestro governance" })
  await expect(dialog).toContainText("Offered by this server")
  await expect(dialog.getByRole("region", { name: "Grounding · Atlas / Own" })).toContainText(
    "Not reported by this server",
  )
  await expect(dialog.locator('[data-kind="validation"]')).toContainText("evt_current_validation")
  await expect(dialog.locator('[data-kind="validation"]')).toHaveAttribute("data-state", "recorded")
  await expect(dialog.locator('[data-kind="presentation"]')).toContainText("Time not reported")
  await expect(dialog).not.toContainText("evt_proposed")
  await dialog.getByRole("button", { name: "Show in chat Validation record", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/session/${sessionID}#message-msg_user_1$`))
  expect(errors).toEqual([])
})

test("a server without Maestro is unavailable, and a pending question is not an approval", async ({ page }) => {
  await setupGovernance(page, {
    agents: [build],
    messages: [],
    questions: [
      {
        id: "question_governance",
        sessionID,
        questions: [{ header: "Scope", question: "Approve the plan?", options: [{ label: "Yes", description: "" }] }],
      },
    ],
  })
  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await expectSessionTitle(page, title)
  await page
    .locator('[data-component="orchestra-sidebar"]')
    .getByRole("button", { name: "Maestro", exact: true })
    .click()
  const dialog = page.getByRole("dialog", { name: "Maestro governance" })
  await expect(dialog.locator('[data-slot="maestro-unavailable"]')).toContainText(
    "Maestro is not available on this server",
  )
  await expect(dialog.locator(".orchestra-governance-summary")).toHaveAttribute("data-state", "none")
  await expect(dialog.locator(".orchestra-governance-summary")).toContainText(
    "No approval result found in this session's messages. Durable approval state is unknown.",
  )
  await expect(dialog.getByRole("region", { name: "Grounding · Atlas / Own" })).toContainText(
    "Not reported by this server",
  )
  await expect(dialog).toContainText("Answering it does not approve a plan.")
  await dialog.getByRole("button", { name: "Go to Chat", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-component="dock-prompt"][data-kind="question"]')).toBeVisible()
})

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: RTL preserves mixed IDs, scroll bounds, keyboard focus and ordinary draft`, async ({ page }) => {
    await page.setViewportSize({ width: 850, height: 768 })
    await setupGovernance(page, {
      agents: [build, maestro],
      config,
      messages: governedMessages(),
      locale,
      title: "مراجعة approval / خطة-42",
    })
    await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
    await expectSessionTitle(page, "مراجعة approval / خطة-42")
    if (locale === "en") await page.locator("html").evaluate((element) => element.setAttribute("dir", "rtl"))
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
    await expect(page.locator("html")).toHaveAttribute("lang", locale)
    const composer = page.locator('[contenteditable="true"][data-component="prompt-input"]')
    await composer.fill("Keep my ordinary edit draft")
    await page.locator('[data-slot="titlebar-v2"]').getByRole("button", { name: "Expand sidebar", exact: true }).click()
    const entry = page
      .locator('[data-component="orchestra-sidebar"]')
      .getByRole("button", { name: "Maestro", exact: true })
    await entry.focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog", { name: "Maestro governance" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTitle(sessionID, { exact: true })).toHaveCSS("direction", "ltr")
    await expect(dialog.getByText("مراجعة approval / خطة-42", { exact: true })).toHaveCSS("unicode-bidi", "isolate")
    await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    await expect
      .poll(() => dialog.evaluate((element) => element.getBoundingClientRect().height <= innerHeight * 0.8 + 1))
      .toBe(true)
    await page.keyboard.press("Tab")
    await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`governance-rtl-${locale}.png`) })
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(entry).toBeFocused()
    await expect(composer).toHaveText("Keep my ordinary edit draft")
  })
}

test("without an open session the entry explains how to reach governance", async ({ page }) => {
  await setupGovernance(page, { agents: [build, maestro], config, messages: [] })
  await page.goto("/")
  const entry = page
    .locator('[data-component="orchestra-sidebar"]')
    .getByRole("button", { name: "Maestro", exact: true })
  await entry.click()
  const dialog = page.getByRole("dialog", { name: "Maestro governance" })
  await expect(dialog).toContainText("Open a session in Chat to see its Maestro governance.")
  await expect(dialog.locator(".orchestra-governance-summary")).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)
})

test("route disposal closes governance when the session leaves for Home", async ({ page }) => {
  await setupGovernance(page, { agents: [build, maestro], config, messages: governedMessages() })
  const documents: string[] = []
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url())
  })
  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
  await expectSessionTitle(page, title)
  await page
    .locator('[data-component="orchestra-sidebar"]')
    .getByRole("button", { name: "Maestro", exact: true })
    .click()
  const dialog = page.getByRole("dialog", { name: "Maestro governance" })
  await expect(dialog.locator('[data-kind="presentation"]')).toContainText("apr_1")

  // Host/browser navigation can happen with a modal open. Exercise the real SPA router, not a reload.
  await page.evaluate(() => {
    window.history.pushState(null, "", "/")
    window.dispatchEvent(new PopStateEvent("popstate"))
  })
  await expect(page).toHaveURL(/\/$/)
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('[data-component="dialog-overlay"]')).toHaveCount(0)
  await expect(
    page.locator('[data-component="orchestra-sidebar"]').getByRole("button", { name: "Home", exact: true }),
  ).toHaveAttribute("aria-current", "page")
  expect(documents).toHaveLength(1)
  await page
    .locator('[data-component="orchestra-sidebar"]')
    .getByRole("button", { name: "Maestro", exact: true })
    .click()
  await expect(dialog).toContainText("Open a session in Chat to see its Maestro governance.")
})

test("cross-server remount closes old governance even when the session ID is reused", async ({ page }) => {
  const other = new URL(server)
  other.hostname = other.hostname === "localhost" ? "127.0.0.1" : "localhost"
  const second = other.origin
  const requests = await setupGovernance(page, {
    agents: [build, maestro],
    config,
    messages: governedMessages(),
    otherServer: second,
  })
  const documents: string[] = []
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents.push(request.url())
  })
  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
  await expectSessionTitle(page, title)
  const entry = page
    .locator('[data-component="orchestra-sidebar"]')
    .getByRole("button", { name: "Maestro", exact: true })
  await entry.click()
  const dialog = page.getByRole("dialog", { name: "Maestro governance" })
  await expect(dialog.locator('[data-kind="presentation"]')).toContainText("apr_1")
  const previous = await dialog.getAttribute("id")
  expect(previous).toBeTruthy()
  const destination = `/server/${base64Encode(second)}/session/${sessionID}`
  await page.evaluate((href) => {
    window.history.pushState(null, "", href)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }, destination)
  await expect(page).toHaveURL(new RegExp(`${destination}$`))
  await expect(dialog).toHaveCount(0)
  await expectSessionTitle(page, title)
  await expect
    .poll(() =>
      requests.some(
        (request) =>
          new URL(request.url).origin === second && new URL(request.url).pathname === `/session/${sessionID}`,
      ),
    )
    .toBe(true)
  expect(documents).toHaveLength(1)
  await entry.click()
  await expect(dialog.locator('[data-kind="presentation"]')).toContainText("apr_1")
  await expect(dialog).not.toHaveAttribute("id", previous!)
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)
})
