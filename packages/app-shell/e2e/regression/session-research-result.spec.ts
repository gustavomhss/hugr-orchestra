import { expect, test } from "@playwright/test"
import {
  assistantMessage,
  session,
  sessionID,
  setupTimeline,
  userMessage,
} from "../performance/timeline-stability/fixture"
import { expectSessionTitle } from "../utils/waits"
import {
  mockResearchArtifacts,
  nativeResearchSuccess,
  researchDescription,
  researchDocument,
  researchEnvelope,
  researchPartID,
  researchSessionID,
  researchTask,
  setupResearchTimeline,
} from "./session-research-result.fixture"

for (const profile of [
  { reason: "ended", terminal: "Research task ended", sufficiency: "partial", qualifier: "Partial answer" },
  { reason: "blocked", terminal: "Research task blocked", sufficiency: "answered", qualifier: "Question answered" },
  { reason: "failed", terminal: "Research task failed", sufficiency: "answered", qualifier: "Question answered" },
  { reason: "interrupted", terminal: "Research task interrupted", sufficiency: "blocked", qualifier: "Answer blocked" },
  { reason: "running", terminal: "Research task running", sufficiency: "partial", qualifier: "Partial answer" },
] as const) {
  test(`keeps ${profile.reason} terminal independent from ${profile.sufficiency} qualifier`, async ({ page }) => {
    await setupTimeline(page, { messages: [userMessage(), assistantMessage([researchTask(researchEnvelope(profile))])] })
    const result = page.locator(`[data-timeline-part-id="${researchPartID}"] [data-component="research-result"]`)
    await expect(result).toHaveCount(1)
    await expect(result.getByText(profile.terminal, { exact: true })).toBeVisible()
    await expect(result.getByText(profile.qualifier, { exact: true })).toBeVisible()
    await expect(result.getByRole("heading", { name: "Qualified answer", exact: true })).toBeVisible()
    await expect(result.getByText("Coverage excludes unavailable sources.", { exact: true })).toBeVisible()
    await expect(result).not.toContainText("Host-only detail")
  })
}

for (const verification of [{ checked: false }, { parsed: false }]) {
  test(`withholds unverified card ${JSON.stringify(verification)} but opens retained document`, async ({ page }) => {
    const document = researchDocument()
    await setupTimeline(page, {
      messages: [userMessage(), assistantMessage([researchTask(researchEnvelope({ ...verification, documents: [document.receipt] }))])],
    })
    const requests = await mockResearchArtifacts(page, [document])
    const result = page.locator('[data-component="research-result"]')
    await expect(
      result.getByText("Final research card or references could not be verified. Try reopening retained documents.", {
        exact: true,
      }),
    ).toBeVisible()
    await expect(result.getByRole("heading", { name: "Qualified answer", exact: true })).toHaveCount(0)
    await result.getByRole("button", { name: document.receipt.title, exact: true }).click()
    await expect(result.getByRole("heading", { name: "Retained evidence", exact: true })).toBeVisible()
    await expect(result.getByRole("status")).toBeEmpty()
    expect(requests.map((request) => request.cursor)).toEqual([null, "research-page-1"])
  })
}

test("keyboard opens exact paged artifact and exposes busy, pressed and named region", async ({ page }) => {
  const document = researchDocument()
  const held = Promise.withResolvers<void>()
  await setupTimeline(page, { messages: [userMessage(), assistantMessage([researchTask(researchEnvelope({ documents: [document.receipt] }))])] })
  const requests = await mockResearchArtifacts(page, [document], { beforeReply: () => held.promise })
  const result = page.locator('[data-component="research-result"]')
  const button = result.getByRole("button", { name: document.receipt.title, exact: true })
  await expect(button).toBeEnabled()
  await expect(button).toHaveAccessibleName(document.receipt.title)
  // Enter the control through sequential navigation; programmatic focus alone would accept tabindex=-1.
  await page
    .locator(`[data-timeline-part-id="${researchPartID}"]`)
    .getByRole("link", { name: new RegExp(researchDescription) })
    .focus()
  await page.keyboard.press("Tab")
  await expect(button).toBeFocused()
  const request = page.waitForRequest((request) => request.url().includes(`/research/${document.receipt.artifact.id}`))
  await button.press("Space")
  await request
  await expect(button).toBeDisabled()
  await expect(button).toHaveAttribute("aria-pressed", "true")
  await expect(result.getByRole("status")).toHaveText("Loading research document")
  const controlledID = await button.getAttribute("aria-controls")
  expect(controlledID).toBeTruthy()
  await expect(page.locator(`[id="${controlledID}"]`)).toHaveAttribute("aria-busy", "true")
  held.resolve()
  const region = result.getByRole("region", { name: document.receipt.title, exact: true })
  await expect(region.getByRole("heading", { name: "Retained evidence", exact: true })).toBeVisible()
  await expect(region).toContainText("Exact retained body.")
  await expect(button).toBeEnabled()
  await expect(page.locator(`[id="${controlledID}"]`)).toHaveAttribute("aria-busy", "false")
  await expect(result.getByRole("status")).toBeEmpty()
  expect(requests).toEqual([
    { sessionID: researchSessionID, artifactID: document.receipt.artifact.id, revision: "1", cursor: null },
    { sessionID: researchSessionID, artifactID: document.receipt.artifact.id, revision: "1", cursor: "research-page-1" },
  ])
})

for (const fault of ["digest", "foreign", "revision", "truncated", "cursor-loop", "malformed", "404", "503"] as const) {
  test(`rejects ${fault} artifact without exposing partial retained text`, async ({ page }) => {
    const document = researchDocument()
    await setupTimeline(page, { messages: [userMessage(), assistantMessage([researchTask(researchEnvelope({ documents: [document.receipt] }))])] })
    const requests = await mockResearchArtifacts(page, [document], {
      reply: (body) => {
        if (fault === "404" || fault === "503") return { status: Number(fault), body: { message: "Retained artifact unavailable" } }
        if (fault === "malformed") return { status: 200, body: { text: body.text } }
        if (fault === "foreign")
          return {
            status: 200,
            body: {
              ...body,
              receipt: { ...body.receipt, binding: { ...body.receipt.binding, executionSessionID: "ses_foreign" } },
            },
          }
        if (fault === "revision") return { status: 200, body: { ...body, ref: { ...body.ref, revision: 2 } } }
        if (fault === "truncated") return { status: 200, body: { ...body, complete: true, cursor: undefined } }
        if (fault === "cursor-loop") return { status: 200, body: { ...body, complete: false, cursor: "research-page-1" } }
        return { status: 200, body: { ...body, text: body.text.replace("Exact", "Wrong") } }
      },
    })
    const result = page.locator('[data-component="research-result"]')
    await result.getByRole("button", { name: document.receipt.title, exact: true }).click()
    await expect(result.getByRole("status")).toHaveText("Research document unavailable")
    await expect(result.getByRole("heading", { name: "Retained evidence", exact: true })).toHaveCount(0)
    await expect(result).not.toContainText("Exact retained body.")
    await expect(result).not.toContainText("Wrong retained body.")
    await expect(result.getByRole("button", { name: document.receipt.title, exact: true })).toBeEnabled()
    expect(requests.map((request) => request.cursor)).toEqual(
      ["digest", "cursor-loop"].includes(fault) ? [null, "research-page-1"] : [null],
    )
  })
}

test("foreign execution receipt remains disabled beside usable retained report", async ({ page }) => {
  const document = researchDocument()
  const foreign = researchDocument(["Foreign body"], { index: 2, title: "Foreign report", executionSessionID: "ses_foreign" })
  await setupTimeline(page, { messages: [userMessage(), assistantMessage([researchTask(researchEnvelope({ documents: [document.receipt, foreign.receipt] }))])] })
  const requests = await mockResearchArtifacts(page, [document, foreign])
  const result = page.locator('[data-component="research-result"]')
  await expect(result.getByRole("button", { name: foreign.receipt.title, exact: true })).toBeDisabled()
  await result.getByRole("button", { name: document.receipt.title, exact: true }).click()
  await expect(result.getByRole("heading", { name: "Retained evidence", exact: true })).toBeVisible()
  expect(requests.map((request) => request.artifactID)).toEqual([document.receipt.artifact.id, document.receipt.artifact.id])
})

for (const bytes of [16 * 1024, 16 * 1024 + 1]) {
  test(`artifact page boundary ${bytes} bytes keeps exact supported bound`, async ({ page }) => {
    const heading = "# Page boundary evidence\n\n"
    const document = researchDocument([heading + "x".repeat(bytes - Buffer.byteLength(heading))])
    await setupTimeline(page, {
      messages: [userMessage(), assistantMessage([researchTask(researchEnvelope({ documents: [document.receipt] }))])],
    })
    const requests = await mockResearchArtifacts(page, [document])
    const result = page.locator('[data-component="research-result"]')
    await result.getByRole("button", { name: document.receipt.title, exact: true }).click()
    if (bytes === 16 * 1024) {
      await expect(result.getByRole("heading", { name: "Page boundary evidence", exact: true })).toBeVisible()
      await expect(result.getByRole("status")).toBeEmpty()
    }
    if (bytes > 16 * 1024) {
      await expect(result.getByRole("status")).toHaveText("Research document unavailable")
      await expect(result.getByRole("heading", { name: "Page boundary evidence", exact: true })).toHaveCount(0)
    }
    expect(requests.map((request) => request.cursor)).toEqual([null])
  })
}

test("V2 initial native structured result opens exact retained document", async ({ page }) => {
  const document = researchDocument()
  await setupResearchTimeline(page, {
    value: researchEnvelope({ documents: [document.receipt] }),
  })
  const requests = await mockResearchArtifacts(page, [document])
  const result = page.locator('[data-component="research-result"]')
  await expect(result.getByRole("heading", { name: "Qualified answer", exact: true })).toBeVisible()
  await expect(result.getByText("Partial answer", { exact: true })).toBeVisible()
  await result.getByRole("button", { name: document.receipt.title, exact: true }).click()
  await expect(result.getByRole("region", { name: document.receipt.title, exact: true })).toContainText("Exact retained body.")
  await expect(result.getByRole("status")).toBeEmpty()
  expect(requests.map((request) => request.cursor)).toEqual([null, "research-page-1"])
})

for (const replacement of ["selection", "envelope"] as const) {
  test(`pending ${replacement} replacement aborts native request and stops stale display`, async ({ page }) => {
    const old = researchDocument(["# Stale document\n\n", "Old body must never display."], { title: "Old report" })
    const fresh = researchDocument(["# Fresh document\n\nFresh body."], { index: 2, title: "Fresh report" })
    const held = Promise.withResolvers<void>()
    const timeline = await setupResearchTimeline(page, {
      status: replacement === "envelope" ? "running" : "completed",
      value: researchEnvelope({ documents: [old.receipt, fresh.receipt] }),
    })
    const requests = await mockResearchArtifacts(page, [old, fresh], {
      beforeReply: (request) => request.artifactID === old.receipt.artifact.id ? held.promise : Promise.resolve(),
    })
    const result = page.locator('[data-component="research-result"]')
    const oldRequest = page.waitForRequest((request) => request.url().includes(`/research/${old.receipt.artifact.id}`))
    await result.getByRole("button", { name: old.receipt.title, exact: true }).click()
    const pending = await oldRequest
    await expect(result.getByRole("status")).toHaveText("Loading research document")
    const oldFailed = page.waitForEvent("requestfailed", { predicate: (request) => request === pending })
    if (replacement === "envelope") {
      const next = researchEnvelope({ answer: "## Replacement answer", documents: [fresh.receipt] })
      const connection = await timeline.transport.waitForConnection()
      expect(connection.path).toBe("/api/event")
      await timeline.transport.writeRaw(`data: ${JSON.stringify(nativeResearchSuccess(next))}\n\n`)
      await expect(result.getByRole("heading", { name: "Replacement answer", exact: true })).toBeVisible()
      await expect(result.getByRole("region", { name: old.receipt.title, exact: true })).toHaveCount(0)
      expect((await oldFailed).failure()?.errorText).toBe("net::ERR_ABORTED")
      held.resolve()
      // A later selection must not rescue a missing envelope cleanup.
      await expect(result.getByRole("status")).toBeEmpty()
      await expect(result.locator("[aria-busy]")).toHaveAttribute("aria-busy", "false")
      await expect(result.getByRole("button", { name: fresh.receipt.title, exact: true })).toHaveAttribute("aria-pressed", "false")
      expect(requests.filter((request) => request.artifactID === old.receipt.artifact.id).map((request) => request.cursor)).toEqual([null])
      await result.getByRole("button", { name: fresh.receipt.title, exact: true }).click()
    }
    if (replacement === "selection") {
      await result.getByRole("button", { name: fresh.receipt.title, exact: true }).click()
      expect((await oldFailed).failure()?.errorText).toBe("net::ERR_ABORTED")
      held.resolve()
    }
    await expect(result.getByRole("heading", { name: "Fresh document", exact: true })).toBeVisible()
    await expect(result.getByRole("status")).toBeEmpty()
    await expect(result.getByRole("button", { name: fresh.receipt.title, exact: true })).toHaveAttribute("aria-pressed", "true")
    await expect(result.getByRole("heading", { name: "Stale document", exact: true })).toHaveCount(0)
    await expect(result).not.toContainText("Old body must never display.")
    expect(requests.filter((request) => request.artifactID === old.receipt.artifact.id).map((request) => request.cursor)).toEqual([null])
  })
}

test("SPA navigation disposes pending document and return cannot restore stale display", async ({ page }) => {
  const document = researchDocument(["# Stale navigation document\n\n", "Old navigation body."])
  const held = Promise.withResolvers<void>()
  const destinationTitle = "Research child destination"
  const task = researchTask(researchEnvelope({ documents: [document.receipt] }))
  await setupTimeline(page, {
    // Child headers prefer the parent Task description over the stored Session title.
    messages: [
      userMessage(),
      assistantMessage([
        {
          ...task,
          state: { ...task.state, input: { ...task.state.input, description: destinationTitle } },
        },
      ]),
    ],
    sessions: [session(), session({ id: researchSessionID, parentID: sessionID, title: destinationTitle })],
  })
  await page.route(new RegExp(`/api/session/${researchSessionID}/message(?:\\?|$)`), (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        data: [
          {
            id: "msg_research_destination",
            type: "user",
            text: "Navigation destination ready",
            time: { created: 1700000000000 },
          },
        ],
        cursor: {},
      }),
    }),
  )
  const requests = await mockResearchArtifacts(page, [document], { beforeReply: () => held.promise })
  const result = page.locator('[data-component="research-result"]')
  const request = page.waitForRequest((request) => request.url().includes(`/research/${document.receipt.artifact.id}`))
  await result.getByRole("button", { name: document.receipt.title, exact: true }).click()
  const pending = await request
  await expect(result.getByRole("status")).toHaveText("Loading research document")
  const failed = page.waitForEvent("requestfailed", { predicate: (request) => request === pending })
  await page
    .locator(`[data-timeline-part-id="${researchPartID}"]`)
    .getByRole("link", { name: new RegExp(destinationTitle) })
    .click()
  await expect(page).toHaveURL(new RegExp(`/session/${researchSessionID}$`))
  await expectSessionTitle(page, destinationTitle)
  await expect(page.getByText("Navigation destination ready", { exact: true })).toBeVisible()
  await expect(result).toHaveCount(0)
  expect((await failed).failure()?.errorText).toBe("net::ERR_ABORTED")
  held.resolve()
  await page.goBack()
  await expect(result.getByRole("heading", { name: "Qualified answer", exact: true })).toBeVisible()
  await expect(result.getByRole("button", { name: document.receipt.title, exact: true })).toHaveAttribute("aria-pressed", "false")
  await expect(result.getByRole("status")).toBeEmpty()
  await expect(result.getByRole("heading", { name: "Stale navigation document", exact: true })).toHaveCount(0)
  expect(requests.map((request) => request.cursor)).toEqual([null])
})

for (const profile of [{ locale: "en", dir: "ltr" }, { locale: "en", dir: "rtl" }, { locale: "ar", dir: "rtl" }] as const) {
  test(`mixed Hebrew Arabic and code stay isolated in ${profile.locale}/${profile.dir} with localized labels`, async ({ page }) => {
    const title = "דוח מחקר تقرير 42 src/report.ts"
    const document = researchDocument(["## ממצאים نتائج\n\nעברית العربية `src/report.ts`\n\n```ts\nconst answer = 42\n```\n"], { title })
    await setupTimeline(page, { locale: profile.locale, messages: [userMessage(), assistantMessage([researchTask(researchEnvelope({ answer: "## תשובה إجابة\n\nעברית العربية `src/answer.ts`", documents: [document.receipt] }))])] })
    if (profile.locale === "en" && profile.dir === "rtl") await page.locator("html").evaluate((element) => element.setAttribute("dir", "rtl"))
    await mockResearchArtifacts(page, [document])
    await expect(page.locator("html")).toHaveAttribute("lang", profile.locale)
    await expect(page.locator("html")).toHaveAttribute("dir", profile.dir)
    const result = page.locator('[data-component="research-result"]')
    await expect(result).toHaveCSS("text-align", "start")
    await expect(result.getByText(profile.locale === "ar" ? "انتهت مهمة البحث" : "Research task ended", { exact: true })).toBeVisible()
    await expect(result.getByText(profile.locale === "ar" ? "إجابة جزئية" : "Partial answer", { exact: true })).toBeVisible()
    const answer = result.locator('[data-component="markdown"]').filter({ has: page.getByRole("heading", { name: "תשובה إجابة", exact: true }) })
    await expect(answer).toHaveAttribute("dir", "auto")
    await expect(answer).toHaveCSS("direction", "rtl")
    await expect(answer.locator("p")).toHaveText("עברית العربية src/answer.ts")
    await expect(answer.locator("p code")).toHaveCSS("direction", "ltr")
    await expect(answer.locator("p code")).toHaveCSS("unicode-bidi", "isolate")
    await expect(answer.locator("p code")).toHaveText("src/answer.ts")
    const button = result.getByRole("button", { name: title, exact: true })
    await expect(button.locator("bdi")).toHaveAttribute("dir", "auto")
    await button.focus()
    await button.press("Enter")
    const region = result.getByRole("region", { name: title, exact: true })
    await expect(region.getByRole("heading", { name: "ממצאים نتائج", exact: true })).toBeVisible()
    await expect(region.locator("h3")).toHaveAttribute("dir", "auto")
    await expect(region.locator('[data-component="markdown"]')).toHaveAttribute("dir", "auto")
    await expect(region.locator('[data-component="markdown-code"]')).toHaveCSS("direction", "ltr")
    await expect(region.locator('[data-component="markdown-code"]')).toHaveCSS("unicode-bidi", "isolate")
    await expect(region.locator("pre code")).toHaveText("const answer = 42\n")
    await expect(region.locator("p code")).toHaveCSS("direction", "ltr")
    await expect(region.locator("p code")).toHaveCSS("unicode-bidi", "isolate")
    await expect(region.locator("p code")).toHaveText("src/report.ts")
    const geometry = await button.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }))
    expect(geometry.width).toBeGreaterThan(0)
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1)
  })
}
