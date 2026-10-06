import { expect, test, type Page } from "@playwright/test"
import { currentSession, mockOpenCodeServer } from "../utils/mock-server"

const server = "http://127.0.0.1:4096"
const directory = "/repo/schedule"
const otherDirectory = "/repo/other"
const agents = [
  { name: "build", mode: "primary" },
  { name: "plan", mode: "primary" },
  { name: "explore", mode: "subagent" },
  { name: "secret", mode: "primary", hidden: true },
  { name: "review", mode: "all" },
]
const SESSION_ID = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/
const MESSAGE_ID = /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/
const NOTE =
  "Saved on this device for this profile · due tasks run only while this page is open; a run more than a day late, or overtaken by the next one, is marked Missed."
// Dates render in the browser's timezone and locale: New York proves the page does not use the host zone.
test.use({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: "block",
  timezoneId: "America/New_York",
  locale: "en-US",
})
test.setTimeout(180_000)

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: a task is saved per profile with local dates and sends nothing until it runs`, async ({ page }) => {
    const api = await setup(page, { scheme })
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await page.locator(".orchestra-sidebar").getByRole("button", { name: "Agendar", exact: true }).click()
    await expect(page).toHaveURL(/\/orchestra\/schedule$/)
    const view = page.locator('[data-mx-page="orchestra-schedule"]')
    await expect(view.getByRole("heading", { level: 1 })).toHaveText("Agendar")
    await expect(view.locator(".mx-eyebrow")).toHaveText("Schedule repository / profile configuration")
    await expect(view.locator(".mx-empty")).toHaveText("No scheduled tasks.Create a one-off or recurring task.")
    await expect(view.locator(".mx-note").last()).toHaveText(NOTE)
    await page.screenshot({ path: test.info().outputPath(`${scheme}-empty.png`) })

    await view.getByRole("button", { name: "Schedule task", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Schedule task" })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('select[name="agent"] option')).toHaveText(["build", "plan", "review"])
    await expect(dialog.locator('select[name="cadence"] option')).toHaveText(["Once", "Every hour", "Daily", "Weekly"])
    await page.screenshot({ path: test.info().outputPath(`${scheme}-dialog.png`) })
    await dialog.getByLabel("Name").fill("Daily review")
    await dialog.getByLabel("Cadence").selectOption("daily")
    await dialog.getByLabel("Agent").selectOption("plan")
    await dialog.getByLabel("Next run").fill("2031-01-15T09:30")
    await dialog.getByRole("button", { name: "Schedule", exact: true }).click()
    await expect(dialog.getByRole("alert")).toHaveText("Describe the task.")
    await dialog.getByLabel("What to run").fill("Review the changes and summarize risks.")
    await dialog.getByLabel("Next run").fill("2020-01-01T09:00")
    await dialog.getByRole("button", { name: "Schedule", exact: true }).click()
    await expect(dialog.getByRole("alert")).toHaveText("Choose a future time.")
    await dialog.getByLabel("Next run").fill("2031-01-15T09:30")
    await dialog.getByRole("button", { name: "Schedule", exact: true }).click()
    await expect(dialog).toHaveCount(0)

    const card = view.getByRole("article", { name: "Daily review" })
    await expect(card.locator(".mx-badge")).toHaveText(["Daily", "plan", "Scheduled"])
    await expect(card.locator(".mx-badge.good")).toHaveText("Scheduled")
    await expect(card).toContainText("Review the changes and summarize risks.")
    await expect(card.locator("p").nth(1)).toHaveText(/^Next: Jan 15, 2031, 9:30\sAM\s*America\/New_York · 0 runs$/)
    await expect(card.getByRole("switch", { name: "Enable Daily review" })).toHaveAttribute("aria-checked", "true")
    await page.screenshot({ path: test.info().outputPath(`${scheme}-card.png`) })

    await view.getByRole("textbox", { name: "Search scheduled tasks" }).fill("nothing like it")
    await expect(view.locator(".mx-empty")).toHaveText("No scheduled tasks match your search.")
    await view.getByRole("textbox", { name: "Search scheduled tasks" }).fill("PLAN")
    await expect(card).toBeVisible()

    await page.reload()
    await expect(view.getByRole("article", { name: "Daily review" })).toBeVisible()
    await page.evaluate((other) => sessionStorage.setItem("schedule-e2e-directory", other), otherDirectory)
    await page.reload()
    await expect(view.locator(".mx-eyebrow")).toHaveText("other / profile configuration")
    await expect(view.locator(".mx-empty")).toHaveText("No scheduled tasks.Create a one-off or recurring task.")
    await page.evaluate(() => sessionStorage.removeItem("schedule-e2e-directory"))
    await page.reload()
    await expect(view.getByRole("article", { name: "Daily review" })).toBeVisible()
    expect(api.created).toEqual([])
    expect(api.prompts).toEqual([])
  })
}

test("Run now creates a session on this profile with the task's prompt and agent, then records it", async ({
  page,
}) => {
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Release notes", prompt: "Draft the release notes.", agent: "plan" })
  const card = page.getByRole("article", { name: "Release notes" })
  await card.getByRole("button", { name: "Run now", exact: true }).click()

  await expect(page).toHaveURL(/\/session\/ses_schedule_1$/)
  expect(api.created).toEqual([{ agent: "plan", location: { directory } }])
  expect(api.prompts).toEqual([
    { sessionID: "ses_schedule_1", body: { id: expect.stringMatching(/^msg_/), text: "Draft the release notes." } },
  ])

  await openSchedule(page)
  const recorded = page.getByRole("article", { name: "Release notes" })
  // A one-off task pauses after dispatch and keeps its time.
  await expect(recorded.locator(".mx-badge")).toHaveText(["Once", "plan", "Paused"])
  await expect(recorded.getByRole("switch")).toHaveAttribute("aria-checked", "false")
  await expect(recorded.locator("p").nth(1)).toHaveText(/^Next: Jan 15, 2031, 9:30\sAM\s*America\/New_York · 1 run$/)
  await expect(recorded.locator(".mx-note")).toHaveText(
    /^Last: \d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2}\s[AP]M · Open session$/,
  )
  await page.screenshot({ path: test.info().outputPath("dark-after-run.png") })
  await recorded.getByRole("button", { name: "Open session", exact: true }).click()
  await expect(page).toHaveURL(/\/session\/ses_schedule_1$/)
  expect(api.created).toHaveLength(1)
  expect(api.prompts).toHaveLength(1)
})

test("a rejected Run now shows the server's reason, records nothing and can be retried", async ({ page }) => {
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Release notes", prompt: "Draft the release notes.", agent: "build" })
  const card = page.getByRole("article", { name: "Release notes" })
  api.fail = true
  await card.getByRole("button", { name: "Run now", exact: true }).click()
  await expect(page.locator('[data-mx-page="orchestra-schedule"] > .mx-inner > .mx-error')).toHaveText(
    "Could not run Release notes: Session store is unavailable",
  )
  expect(api.attempts).toBe(1)
  expect(api.created).toEqual([])
  expect(api.prompts).toEqual([])
  await expect(page).toHaveURL(/\/orchestra\/schedule$/)
  await expect(card.locator("p").nth(1)).toContainText("0 runs")
  await expect(card.locator(".mx-badge")).toHaveText(["Once", "build", "Scheduled"])
  await expect(card.locator(".mx-note")).toHaveCount(0)

  api.fail = false
  await card.getByRole("button", { name: "Run now", exact: true }).click()
  await expect(page).toHaveURL(/\/session\/ses_schedule_2$/)
  expect(api.attempts).toBe(2)
  expect(api.prompts.map((prompt) => prompt.sessionID)).toEqual(["ses_schedule_2"])
})

test("due tasks dispatch while the page is open, recurring dates roll forward and paused tasks wait", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2031-01-15T09:00:00-05:00") })
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, {
    name: "Hourly check",
    prompt: "Check the build.",
    agent: "build",
    cadence: "hourly",
    date: "2031-01-15T09:30",
  })
  await createTask(page, { name: "Later once", prompt: "Tag the release.", agent: "review", date: "2031-01-15T09:45" })
  const hourly = page.getByRole("article", { name: "Hourly check" })
  const once = page.getByRole("article", { name: "Later once" })
  await once.getByRole("switch", { name: "Enable Later once" }).click()
  await expect(once.locator(".mx-badge")).toHaveText(["Once", "review", "Paused"])

  await page.clock.fastForward("31:00")
  // Scheduled runs carry IDs derived from their slot, so a retry or a second tab reconciles.
  await expect
    .poll(() => api.created)
    .toEqual([{ id: expect.stringMatching(SESSION_ID), agent: "build", location: { directory } }])
  await expect
    .poll(() => api.prompts)
    .toEqual([
      {
        sessionID: (api.created[0] as { id: string }).id,
        body: { id: expect.stringMatching(MESSAGE_ID), text: "Check the build." },
      },
    ])
  await expect(hourly.locator("p").nth(1)).toHaveText(/^Next: Jan 15, 2031, 10:30\sAM\s*America\/New_York · 1 run$/)
  await expect(hourly.locator(".mx-badge")).toHaveText(["Every hour", "build", "Scheduled"])
  // Background dispatch stays on this page.
  await expect(page).toHaveURL(/\/orchestra\/schedule$/)

  // Past its time while paused: resuming a one-off asks for a new time instead of running it.
  await page.clock.fastForward("20:00")
  await once.getByRole("switch", { name: "Enable Later once" }).click()
  const dialog = page.getByRole("dialog", { name: "Edit Later once" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Next run").fill("2031-01-15T10:00")
  await dialog.getByRole("button", { name: "Schedule", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(once.locator(".mx-badge")).toHaveText(["Once", "review", "Scheduled"])

  await page.clock.fastForward("10:00")
  await expect.poll(() => api.created).toHaveLength(2)
  expect(api.created[1]).toEqual({ id: expect.stringMatching(SESSION_ID), agent: "review", location: { directory } })
  await expect(once.locator(".mx-badge")).toHaveText(["Once", "review", "Paused"])
  await expect(once.locator("p").nth(1)).toContainText("1 run")
  // Paused tasks were skipped and the hourly task is not due again until 10:30.
  expect(api.created).toHaveLength(2)
  expect(api.prompts.map((prompt) => prompt.body.text)).toEqual(["Check the build.", "Tag the release."])
})

test("a task overdue when the page opens runs at once; a one-off more than a day late is marked Missed", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2031-01-15T09:00:00-05:00") })
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Morning digest", prompt: "Digest.", agent: "build", cadence: "daily" })
  await createTask(page, { name: "Stale once", prompt: "Too late.", agent: "plan", date: "2031-01-15T09:45" })
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Home", exact: true }).click()
  await expect(page).not.toHaveURL(/\/orchestra\/schedule$/)
  // A day later with time paused: only the check on open can dispatch, never the 15 s interval.
  await page.clock.pauseAt(new Date("2031-01-16T10:00:00-05:00"))
  // Paused time also pauses animation frames, so skip the frame-based actionability wait of click().
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Agendar", exact: true }).dispatchEvent("click")
  await expect
    .poll(async () => {
      await page.clock.runFor(500)
      return api.created.length
    })
    .toBe(1)
  expect(api.created).toEqual([{ id: expect.stringMatching(SESSION_ID), agent: "build", location: { directory } }])
  const digest = page.getByRole("article", { name: "Morning digest" })
  await expect(digest.locator("p").nth(1)).toHaveText(/^Next: Jan 17, 2031, 9:30\sAM\s*America\/New_York · 1 run$/)
  await expect(digest.locator(".schedule-missed")).toHaveText(/^Missed: Jan 15, 2031, 9:30\sAM$/)
  const stale = page.getByRole("article", { name: "Stale once" })
  await expect(stale.locator(".mx-badge")).toHaveText(["Once", "plan", "Paused"])
  await expect(stale.locator(".schedule-missed")).toHaveText(/^Missed: Jan 15, 2031, 9:45\sAM$/)
  await expect(stale.locator("p").nth(1)).toContainText("0 runs")
  await expect(page.locator(".mx-note").last()).toHaveText(NOTE)
  await page.clock.runFor(60_000)
  expect(api.attempts).toBe(1)
})

test("two pages of one profile serve a due slot once and both show the run", async ({ page }) => {
  await page.clock.install({ time: new Date("2031-01-15T09:00:00-05:00") })
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Hourly check", prompt: "Check the build.", agent: "build", cadence: "hourly" })
  const other = await page.context().newPage()
  await setup(other, {}, api)
  await openSchedule(other)
  await expect(other.getByRole("article", { name: "Hourly check" })).toBeVisible()

  await page.clock.fastForward("31:00")
  await expect.poll(() => api.attempts).toBe(1)
  await page.clock.runFor(60_000)
  expect(api.attempts).toBe(1)
  expect(api.prompts).toHaveLength(1)
  for (const view of [page, other])
    await expect(view.getByRole("article", { name: "Hourly check" }).locator("p").nth(1)).toHaveText(
      /^Next: Jan 15, 2031, 10:30\sAM\s*America\/New_York · 1 run$/,
    )
  await other.close()
})

test("a failed scheduled run is not retried; Run now retries the same slot with the same IDs", async ({ page }) => {
  await page.clock.install({ time: new Date("2031-01-15T09:00:00-05:00") })
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Hourly check", prompt: "Check the build.", agent: "build", cadence: "hourly" })
  api.fail = true
  await page.clock.fastForward("31:00")
  await expect(page.locator('[data-mx-page="orchestra-schedule"] > .mx-inner > .mx-error')).toHaveText(
    "Could not run Hourly check: Session store is unavailable",
  )
  expect(api.requests).toEqual([{ id: expect.stringMatching(SESSION_ID), agent: "build", location: { directory } }])
  await page.clock.runFor(60_000)
  expect(api.attempts).toBe(1)
  // The failure is remembered across a remount, not only in the page that saw it.
  await openSchedule(page)
  await page.clock.runFor(30_000)
  expect(api.attempts).toBe(1)

  api.fail = false
  const card = page.getByRole("article", { name: "Hourly check" })
  await card.getByRole("button", { name: "Run now", exact: true }).click()
  const slot = (api.requests[0] as { id: string }).id
  await expect(page).toHaveURL(new RegExp(`/session/${slot}$`))
  expect(api.requests.map((body) => (body as { id: string }).id)).toEqual([slot, slot])
  expect(api.prompts).toEqual([
    { sessionID: slot, body: { id: expect.stringMatching(MESSAGE_ID), text: "Check the build." } },
  ])
  await openSchedule(page)
  await expect(card.locator("p").nth(1)).toHaveText(/^Next: Jan 15, 2031, 10:30\sAM\s*America\/New_York · 1 run$/)
  await page.clock.runFor(30_000)
  expect(api.attempts).toBe(2)
})

test("pausing or removing a task during its dispatch keeps the saved list consistent", async ({ page }) => {
  await page.clock.install({ time: new Date("2031-01-15T09:00:00-05:00") })
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Pause me", prompt: "First.", agent: "build", cadence: "hourly" })
  await createTask(page, { name: "Remove me", prompt: "Second.", agent: "plan" })
  const releaseFirst = api.hold()
  await page.clock.fastForward("31:00")
  await expect.poll(() => api.attempts).toBe(1)
  const paused = page.getByRole("article", { name: "Pause me" })
  await paused.getByRole("switch", { name: "Enable Pause me" }).click()
  const releaseSecond = api.hold()
  releaseFirst()
  await expect.poll(() => api.attempts).toBe(2)
  await page.getByRole("article", { name: "Remove me" }).getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByRole("dialog", { name: "Edit Remove me" }).getByRole("button", { name: "Remove task" }).click()
  await page.getByRole("dialog", { name: "Remove this item?" }).getByRole("button", { name: "Confirm" }).click()
  releaseSecond()
  await expect.poll(() => api.prompts).toHaveLength(2)
  await expect(paused.locator(".mx-badge")).toHaveText(["Every hour", "build", "Paused"])
  await expect(paused.locator("p").nth(1)).toHaveText(/^Next: Jan 15, 2031, 10:30\sAM\s*America\/New_York · 1 run$/)
  await expect(page.locator("article")).toHaveText([/^Pause me/])
  await openSchedule(page)
  await expect(page.locator("article")).toHaveText([/^Pause me/])
  await page.clock.runFor(60_000)
  expect(api.attempts).toBe(2)
})

test("leaving the page mid-run neither navigates nor keeps scheduling", async ({ page }) => {
  await page.clock.install({ time: new Date("2031-01-15T09:00:00-05:00") })
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Leave me", prompt: "Run once.", agent: "build" })
  await createTask(page, {
    name: "Later hourly",
    prompt: "Later.",
    agent: "plan",
    cadence: "hourly",
    date: "2031-01-15T10:00",
  })
  const release = api.hold()
  await page.getByRole("article", { name: "Leave me" }).getByRole("button", { name: "Run now", exact: true }).click()
  await expect.poll(() => api.attempts).toBe(1)
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Home", exact: true }).click()
  await expect(page).not.toHaveURL(/\/orchestra\/schedule$/)
  const home = page.url()
  release()
  await expect.poll(() => api.prompts).toHaveLength(1)
  await page.clock.fastForward("01:10:00")
  await page.clock.runFor(30_000)
  expect(api.attempts).toBe(1)
  expect(page.url()).toBe(home)

  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Agendar", exact: true }).click()
  await expect(page.getByRole("article", { name: "Leave me" }).locator(".mx-badge")).toHaveText([
    "Once",
    "build",
    "Paused",
  ])
  await expect(page.getByRole("article", { name: "Leave me" }).locator("p").nth(1)).toContainText("1 run")
  await expect.poll(() => api.attempts).toBe(2)
  expect(api.requests[1]).toEqual({ id: expect.stringMatching(SESSION_ID), agent: "plan", location: { directory } })
})

test("edit keeps the task, dialogs dismiss without saving, and remove asks first", async ({ page }) => {
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Weekly sweep", prompt: "Sweep stale branches.", agent: "plan", cadence: "weekly" })
  const card = page.getByRole("article", { name: "Weekly sweep" })
  const edit = page.getByRole("dialog", { name: "Edit Weekly sweep" })

  // A dialog opened before the previous one's close event lands must still open and stay open.
  await page.getByRole("button", { name: "Schedule task", exact: true }).click()
  const add = page.getByRole("dialog", { name: "Schedule task" })
  await add.getByLabel("Name").fill("Second sweep")
  await add.getByLabel("What to run").fill("Sweep again.")
  await add.getByLabel("Next run").fill("2031-01-16T09:30")
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('dialog[open] button[type="submit"]')?.click()
    const article = [...document.querySelectorAll("article")].find((item) => item.textContent?.includes("Weekly sweep"))
    ;[...(article?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "Edit")?.click()
  })
  await expect(edit).toBeVisible()
  await expect(page.getByRole("article", { name: "Second sweep" })).toBeVisible()
  await expect(page.locator("dialog")).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(edit).toHaveCount(0)

  await card.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(edit.getByLabel("Name")).toHaveValue("Weekly sweep")
  await expect(edit.getByLabel("What to run")).toHaveValue("Sweep stale branches.")
  await expect(edit.getByLabel("Cadence")).toHaveValue("weekly")
  await expect(edit.getByLabel("Agent")).toHaveValue("plan")
  await expect(edit.getByLabel("Next run")).toHaveValue("2031-01-15T09:30")
  await edit.getByLabel("Name").fill("Discarded name")
  await page.keyboard.press("Escape")
  await expect(edit).toHaveCount(0)
  await card.getByRole("button", { name: "Edit", exact: true }).click()
  await edit.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(edit).toHaveCount(0)
  await card.getByRole("button", { name: "Edit", exact: true }).click()
  await edit.getByRole("button", { name: "Close dialog", exact: true }).click()
  await expect(edit).toHaveCount(0)
  await expect(page.getByRole("article", { name: "Discarded name" })).toHaveCount(0)

  await card.getByRole("button", { name: "Edit", exact: true }).click()
  await edit.getByLabel("Agent").selectOption("review")
  await edit.getByLabel("Cadence").selectOption("hourly")
  await edit.getByRole("button", { name: "Schedule", exact: true }).click()
  await expect(edit).toHaveCount(0)
  await expect(card.locator(".mx-badge")).toHaveText(["Every hour", "review", "Scheduled"])

  await card.getByRole("button", { name: "Edit", exact: true }).click()
  await edit.getByRole("button", { name: "Remove task", exact: true }).click()
  const confirm = page.getByRole("dialog", { name: "Remove this item?" })
  await expect(confirm).toContainText("Its configuration is removed from this profile.")
  await expect(confirm).toContainText("This removes the task from Schedule repository.")
  await page.screenshot({ path: test.info().outputPath("dark-confirm.png") })
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(card).toBeVisible()
  await card.getByRole("button", { name: "Edit", exact: true }).click()
  await edit.getByRole("button", { name: "Remove task", exact: true }).click()
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click()
  await expect(confirm).toHaveCount(0)
  await expect(card).toHaveCount(0)
  await expect(page.locator("article")).toHaveText([/^Second sweep/])
  await page.reload()
  await expect(page.locator("article")).toHaveText([/^Second sweep/])
  const second = page.getByRole("article", { name: "Second sweep" })
  await second.getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByRole("dialog", { name: "Edit Second sweep" }).getByRole("button", { name: "Remove task" }).click()
  await page.getByRole("dialog", { name: "Remove this item?" }).getByRole("button", { name: "Confirm" }).click()
  await expect(page.locator(".mx-empty")).toHaveText("No scheduled tasks.Create a one-off or recurring task.")
  await page.reload()
  await expect(page.locator(".mx-empty")).toHaveText("No scheduled tasks.Create a one-off or recurring task.")
  expect(api.created).toEqual([])
})

test("V1 servers dispatch through the legacy session API with the task's agent", async ({ page }) => {
  const api = await setup(page, { protocol: "v1" })
  await openSchedule(page)
  await createTask(page, { name: "Legacy run", prompt: "Summarize open issues.", agent: "review" })
  await page.getByRole("article", { name: "Legacy run" }).getByRole("button", { name: "Run now", exact: true }).click()
  await expect(page).toHaveURL(/\/session\/ses_schedule_1$/)
  expect(api.attempts).toBe(1)
  expect(api.prompts).toEqual([
    {
      sessionID: "ses_schedule_1",
      body: expect.objectContaining({ agent: "review", parts: [{ type: "text", text: "Summarize open issues." }] }),
    },
  ])
})

async function openSchedule(page: Page) {
  await page.goto("/orchestra/schedule", { waitUntil: "domcontentloaded" })
  await expect(page.locator('[data-mx-page="orchestra-schedule"]')).toBeVisible({ timeout: 60_000 })
  const notice = page.getByRole("button", { name: "Dismiss Tabs information", exact: true })
  if (await notice.isVisible()) await notice.click()
}

async function createTask(
  page: Page,
  input: { name: string; prompt: string; agent: string; cadence?: string; date?: string },
) {
  await page.getByRole("button", { name: "Schedule task", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Schedule task" })
  await dialog.getByLabel("Name").fill(input.name)
  await dialog.getByLabel("What to run").fill(input.prompt)
  await dialog.getByLabel("Cadence").selectOption(input.cadence ?? "once")
  await dialog.getByLabel("Agent").selectOption(input.agent)
  await dialog.getByLabel("Next run").fill(input.date ?? "2031-01-15T09:30")
  await dialog.getByRole("button", { name: "Schedule", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole("article", { name: input.name })).toBeVisible()
}

// Records every session-create request and prompt; `hold` keeps the next creates waiting until released.
function recorder() {
  const api = {
    attempts: 0,
    fail: false,
    gate: undefined as Promise<void> | undefined,
    requests: [] as unknown[],
    created: [] as unknown[],
    prompts: [] as { sessionID: string; body: Record<string, unknown> }[],
    sessions: [] as ({ id: string } & Record<string, unknown>)[],
    hold() {
      const gate = Promise.withResolvers<void>()
      api.gate = gate.promise
      return () => gate.resolve()
    },
  }
  return api
}

// `shared` lets a second page of the same context reuse the first page's recorder and sessions.
async function setup(
  page: Page,
  input: { scheme?: "dark" | "light"; protocol?: "v1" | "v2" } = {},
  shared?: ReturnType<typeof recorder>,
) {
  const protocol = input.protocol ?? "v2"
  const api = shared ?? recorder()
  await page.addInitScript(
    ({ server, directory, scheme }) => {
      const selected = sessionStorage.getItem("schedule-e2e-directory") ?? directory
      localStorage.setItem("opencode.settings.dat:defaultServerUrl", server)
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({
          general: { newLayoutDesigns: true, shouldDisplayTabsToast: false, newInterfaceNoticeDismissed: true },
        }),
      )
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [server],
          projects: {
            local: [{ worktree: directory, expanded: true }],
            [server]: [{ worktree: directory, expanded: true }],
          },
        }),
      )
      const layout = JSON.stringify({ home: { selection: { server, directory: selected } } })
      localStorage.setItem("opencode.global.dat:layout", layout)
      localStorage.setItem(`opencode.global.dat:${server}\0layout`, layout)
    },
    { server, directory, scheme: input.scheme ?? "dark" },
  )
  await mockOpenCodeServer(page, {
    protocol,
    eventRetry: 60_000,
    provider: { all: [], connected: [], default: {} },
    directory,
    project: {
      id: "schedule",
      name: "Schedule repository",
      worktree: directory,
      vcs: "git",
      sandboxes: [],
      time: { created: 1, updated: 1 },
    },
    sessions: api.sessions,
    pageMessages: () => ({ items: [] }),
    onPrompt: (prompt) =>
      api.prompts.push({ sessionID: prompt.sessionID, body: prompt.body as Record<string, unknown> }),
  })
  // The shared mock server lists sessions but cannot create them: answer creation here and keep each
  // request. A known session ID is adopted, as the V2 server does.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== server) return route.fallback()
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      })
    if (url.pathname === "/agent") return json(agents.map((agent) => ({ permission: [], options: {}, ...agent })))
    if (url.pathname === "/api/agent")
      return json({
        location: { directory },
        data: agents.map((agent) => ({
          id: agent.name,
          name: agent.name,
          mode: agent.mode,
          hidden: agent.hidden ?? false,
          request: { settings: {}, headers: {}, body: {} },
          permissions: [],
        })),
      })
    const create = url.pathname === (protocol === "v2" ? "/api/session" : "/session")
    if (!create || route.request().method() !== "POST") return route.fallback()
    api.attempts++
    const attempt = api.attempts
    const body = route.request().postDataJSON()
    api.requests.push(body)
    await api.gate
    if (api.fail) return json({ message: "Session store is unavailable" }, 400)
    if (protocol === "v2") api.created.push(body)
    const id = typeof body?.id === "string" ? body.id : `ses_schedule_${attempt}`
    const session = api.sessions.find((item) => item.id === id) ?? {
      id,
      directory,
      agent: body?.agent ?? "build",
      title: "New session",
      time: { created: 1, updated: 1 },
    }
    if (!api.sessions.includes(session)) api.sessions.push(session)
    if (protocol === "v2") return json({ data: currentSession(session, directory) })
    return json({
      id,
      slug: id,
      projectID: "schedule",
      directory,
      title: "New session",
      version: "1",
      time: session.time,
    })
  })
  return api
}
