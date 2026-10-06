import { expect, test } from "@playwright/test"
import {
  createTask,
  directory,
  MESSAGE_ID,
  NOTE_DEVICE,
  openSchedule,
  SESSION_ID,
  setup,
} from "./chapter-schedule.fixture"

// Servers without scheduled tasks answer 404: tasks stay on this device and this page runs them while it is open.
// Dates render in the browser's timezone and locale: New York proves the page does not use the host zone.
test.use({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: "block",
  timezoneId: "America/New_York",
  locale: "en-US",
})
test.setTimeout(180_000)

test("due tasks dispatch while the page is open, recurring dates roll forward and paused tasks wait", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2031-01-15T09:00:00-05:00") })
  const api = await setup(page, { legacy: true })
  await openSchedule(page)
  await createTask(page, {
    name: "Hourly check",
    prompt: "Check the build.",
    agent: "build",
    cadence: "hourly",
    date: "2031-01-15T09:30",
  })
  await createTask(page, {
    name: "Later once",
    prompt: "Tag the release.",
    agent: "review",
    date: "2031-01-15T09:45",
  })
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
  const api = await setup(page, { legacy: true })
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
  await expect(page.locator(".mx-note").last()).toHaveText(NOTE_DEVICE)
  await page.clock.runFor(60_000)
  expect(api.attempts).toBe(1)
})

test("two pages of one profile serve a due slot once and both show the run", async ({ page }) => {
  await page.clock.install({ time: new Date("2031-01-15T09:00:00-05:00") })
  const api = await setup(page, { legacy: true })
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
  const api = await setup(page, { legacy: true })
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
  const api = await setup(page, { legacy: true })
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
  const api = await setup(page, { legacy: true })
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

test("V1 servers dispatch through the legacy session API with the task's agent", async ({ page }) => {
  const api = await setup(page, { protocol: "v1", legacy: true })
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
