import { expect, test } from "@playwright/test"
import {
  createTask,
  DAY,
  directory,
  HOUR,
  NOTE,
  NOTE_DEVICE,
  openSchedule,
  otherDirectory,
  setup,
  SLOT,
} from "./chapter-schedule.fixture"

// Dates render in the browser's timezone and locale: New York proves the page does not use the host zone.
test.use({
  viewport: { width: 1440, height: 900 },
  serviceWorkers: "block",
  timezoneId: "America/New_York",
  locale: "en-US",
})
test.setTimeout(180_000)

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: a task is saved on the server per profile with local dates and the page runs nothing`, async ({
    page,
  }) => {
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
    // Every scheduled run is a Maestro session, so the dialog offers no agent choice.
    await expect(dialog.locator("select")).toHaveCount(1)
    await expect(dialog.getByLabel("Agent", { exact: true })).toHaveCount(0)
    await expect(dialog.locator('select[name="cadence"] option')).toHaveText(["Once", "Every hour", "Daily", "Weekly"])
    await page.screenshot({ path: test.info().outputPath(`${scheme}-dialog.png`) })
    await dialog.getByLabel("Name").fill("Daily review")
    await dialog.getByLabel("Cadence").selectOption("daily")
    await dialog.getByLabel("Next run").fill("2031-01-15T09:30")
    await dialog.getByRole("button", { name: "Schedule", exact: true }).click()
    await expect(dialog.getByRole("alert")).toHaveText("Describe the task.")
    await dialog.getByLabel("What to run").fill("Review the changes and summarize risks.")
    await dialog.getByLabel("Next run").fill("2020-01-01T09:00")
    await dialog.getByRole("button", { name: "Schedule", exact: true }).click()
    await expect(dialog.getByRole("alert")).toHaveText("Choose a future time.")
    expect(api.schedule.calls.filter((call) => call.method !== "GET")).toEqual([])
    await dialog.getByLabel("Next run").fill("2031-01-15T09:30")
    await dialog.getByRole("button", { name: "Schedule", exact: true }).click()
    await expect(dialog).toHaveCount(0)

    // The task's time of day is anchored to the zone it was entered in.
    expect(api.schedule.calls.filter((call) => call.method === "POST")).toEqual([
      {
        method: "POST",
        path: "/api/schedule",
        directory,
        body: {
          name: "Daily review",
          prompt: "Review the changes and summarize risks.",
          cadence: "daily",
          next: SLOT,
          timezone: "America/New_York",
        },
      },
    ])
    const card = view.getByRole("article", { name: "Daily review" })
    await expect(card.locator(".mx-badge")).toHaveText(["Daily", "Scheduled"])
    await expect(card.locator(".mx-badge.good")).toHaveText("Scheduled")
    await expect(card).toContainText("Review the changes and summarize risks.")
    await expect(card.locator("p").nth(1)).toHaveText(/^Next: Jan 15, 2031, 9:30\sAM\s*America\/New_York · 0 runs$/)
    await expect(card.getByRole("switch", { name: "Enable Daily review" })).toHaveAttribute("aria-checked", "true")
    await page.screenshot({ path: test.info().outputPath(`${scheme}-card.png`) })

    await view.getByRole("textbox", { name: "Search scheduled tasks" }).fill("nothing like it")
    await expect(view.locator(".mx-empty")).toHaveText("No scheduled tasks match your search.")
    // Search reads the prompt as well as the name, ignoring case.
    await view.getByRole("textbox", { name: "Search scheduled tasks" }).fill("SUMMARIZE")
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
    expect(api.attempts).toBe(0)
    expect(api.prompts).toEqual([])
  })
}

test("Run now asks the server to run the task, opens its session and shows the recorded run", async ({ page }) => {
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Release notes", prompt: "Draft the release notes." })
  const card = page.getByRole("article", { name: "Release notes" })
  await card.getByRole("button", { name: "Run now", exact: true }).click()

  await expect(page).toHaveURL(/\/session\/ses_schedule_run_1$/)
  const id = api.schedule.tasks[0]!.id
  expect(api.schedule.calls.filter((call) => call.path.endsWith("/run"))).toEqual([
    { method: "POST", path: `/api/schedule/${id}/run`, directory },
  ])
  // The server admits the prompt; the page creates no session and sends no prompt itself.
  expect(api.attempts).toBe(0)
  expect(api.prompts).toEqual([])

  await openSchedule(page)
  const recorded = page.getByRole("article", { name: "Release notes" })
  // A one-off task pauses after it runs and keeps its time.
  await expect(recorded.locator(".mx-badge")).toHaveText(["Once", "Paused"])
  await expect(recorded.getByRole("switch")).toHaveAttribute("aria-checked", "false")
  await expect(recorded.locator("p").nth(1)).toHaveText(/^Next: Jan 15, 2031, 9:30\sAM\s*America\/New_York · 1 run$/)
  await expect(recorded.locator(".mx-note")).toHaveText(
    /^Last: \d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2}\s[AP]M · Open session$/,
  )
  await page.screenshot({ path: test.info().outputPath("dark-after-run.png") })
  await recorded.getByRole("button", { name: "Open session", exact: true }).click()
  await expect(page).toHaveURL(/\/session\/ses_schedule_run_1$/)
})

test("a rejected Run now shows the server's reason, records nothing and can be retried", async ({ page }) => {
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Release notes", prompt: "Draft the release notes." })
  const card = page.getByRole("article", { name: "Release notes" })
  api.schedule.runError = "Session store is unavailable"
  await card.getByRole("button", { name: "Run now", exact: true }).click()
  await expect(page.locator('[data-mx-page="orchestra-schedule"] > .mx-inner > .mx-error')).toHaveText(
    "Could not run Release notes: Session store is unavailable",
  )
  await expect(page).toHaveURL(/\/orchestra\/schedule$/)
  await expect(card.locator("p").nth(1)).toContainText("0 runs")
  await expect(card.locator(".mx-badge")).toHaveText(["Once", "Scheduled"])
  await expect(card.locator(".mx-note")).toHaveCount(0)

  api.schedule.runError = undefined
  await card.getByRole("button", { name: "Run now", exact: true }).click()
  await expect(page).toHaveURL(/\/session\/ses_schedule_run_1$/)
  expect(api.schedule.calls.filter((call) => call.path.endsWith("/run"))).toHaveLength(2)
  expect(api.attempts).toBe(0)
})

test("the server runs due tasks while the page is open; the page shows what it recorded and runs nothing", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2031-01-15T09:00:00-05:00") })
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Hourly check", prompt: "Check the build.", cadence: "hourly" })
  await createTask(page, { name: "Weekly sweep", prompt: "Sweep stale branches.", cadence: "weekly" })
  const hourly = page.getByRole("article", { name: "Hourly check" })
  const weekly = page.getByRole("article", { name: "Weekly sweep" })

  // Past the slot with the page open: the page starts nothing itself and still shows the last server record.
  await page.clock.fastForward("31:00")
  await page.clock.runFor(15_000)
  expect(api.attempts).toBe(0)
  expect(api.prompts).toEqual([])
  await expect(hourly.locator("p").nth(1)).toHaveText(/^Next: Jan 15, 2031, 9:30\sAM\s*America\/New_York · 0 runs$/)

  // What the server's scheduler records: one run admitted, one run that failed, and an overtaken slot.
  api.sessions.push({
    id: "ses_scheduled_run",
    directory,
    agent: "maestro",
    title: "Hourly check",
    time: { created: 1, updated: 1 },
  })
  Object.assign(api.schedule.tasks[0]!, {
    runs: 1,
    next: SLOT + HOUR,
    last: { outcome: "started", time: SLOT + 1_000, slot: SLOT, sessionID: "ses_scheduled_run" },
  })
  Object.assign(api.schedule.tasks[1]!, {
    next: SLOT + 7 * DAY,
    missed: SLOT - 7 * DAY,
    last: { outcome: "failed", time: SLOT + 1_000, slot: SLOT, error: "Session store is unavailable" },
  })
  await page.clock.runFor(15_000)
  await expect(hourly.locator("p").nth(1)).toHaveText(/^Next: Jan 15, 2031, 10:30\sAM\s*America\/New_York · 1 run$/)
  await expect(hourly.locator(".mx-note")).toHaveText(/^Last: 1\/15\/2031, 9:30:01\sAM · Open session$/)
  await expect(weekly.locator("p").nth(1)).toHaveText(/^Next: Jan 22, 2031, 9:30\sAM\s*America\/New_York · 0 runs$/)
  await expect(weekly.locator(".schedule-missed")).toHaveText([
    /^Missed: Jan 8, 2031, 9:30\sAM$/,
    /^Failed: 1\/15\/2031, 9:30:01\sAM · Session store is unavailable$/,
  ])
  await expect(weekly.getByRole("button", { name: "Open session", exact: true })).toHaveCount(0)
  await expect(page.locator(".mx-note").last()).toHaveText(NOTE)
  await page.screenshot({ path: test.info().outputPath("dark-server-runs.png") })

  await hourly.getByRole("button", { name: "Open session", exact: true }).click()
  await expect(page).toHaveURL(/\/session\/ses_scheduled_run$/)
  expect(api.attempts).toBe(0)
})

test("pausing, resuming a one-off with a new time, and removing are saved on the server", async ({ page }) => {
  await page.clock.install({ time: new Date("2031-01-15T09:00:00-05:00") })
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Later once", prompt: "Tag the release.", date: "2031-01-15T09:45" })
  const id = `/api/schedule/${api.schedule.tasks[0]!.id}`
  const once = page.getByRole("article", { name: "Later once" })
  await once.getByRole("switch", { name: "Enable Later once" }).click()
  await expect(once.locator(".mx-badge")).toHaveText(["Once", "Paused"])

  // Past its time while paused: resuming a one-off asks for a new time instead of running it.
  await page.clock.fastForward("50:00")
  await once.getByRole("switch", { name: "Enable Later once" }).click()
  const dialog = page.getByRole("dialog", { name: "Edit Later once" })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Next run").fill("2031-01-15T10:00")
  await dialog.getByRole("button", { name: "Schedule", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(once.locator(".mx-badge")).toHaveText(["Once", "Scheduled"])
  await expect(once.locator("p").nth(1)).toHaveText(/^Next: Jan 15, 2031, 10:00\sAM\s*America\/New_York · 0 runs$/)

  await once.getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByRole("dialog", { name: "Edit Later once" }).getByRole("button", { name: "Remove task" }).click()
  await page.getByRole("dialog", { name: "Remove this item?" }).getByRole("button", { name: "Confirm" }).click()
  await expect(page.locator(".mx-empty")).toHaveText("No scheduled tasks.Create a one-off or recurring task.")

  expect(api.schedule.calls.filter((call) => call.method === "PATCH" || call.method === "DELETE")).toEqual([
    { method: "PATCH", path: id, directory, body: { enabled: false } },
    {
      method: "PATCH",
      path: id,
      directory,
      body: {
        name: "Later once",
        prompt: "Tag the release.",
        cadence: "once",
        next: Date.parse("2031-01-15T10:00:00-05:00"),
        timezone: "America/New_York",
        enabled: true,
      },
    },
    { method: "DELETE", path: id, directory },
  ])
  expect(api.attempts).toBe(0)
})

test("tasks saved on this device move to the server once, with their history", async ({ page }) => {
  await page.clock.install({ time: new Date("2031-01-15T09:00:00-05:00") })
  const api = await setup(page, { legacy: true })
  await openSchedule(page)
  await createTask(page, { name: "Hourly check", prompt: "Check the build.", cadence: "hourly" })
  await createTask(page, { name: "Later once", prompt: "Tag the release.", date: "2031-01-15T09:45" })
  await expect(page.locator(".mx-note").last()).toHaveText(NOTE_DEVICE)
  // A run from the device gives the task history to carry over.
  await page
    .getByRole("article", { name: "Hourly check" })
    .getByRole("button", { name: "Run now", exact: true })
    .click()
  await expect(page).toHaveURL(/\/session\/ses_schedule_1$/)

  // The server now supports scheduled tasks; two windows of the profile open at once.
  api.schedule.supported = true
  const other = await page.context().newPage()
  await setup(other, {}, api)
  await Promise.all([openSchedule(page), openSchedule(other)])
  for (const view of [page, other]) {
    await expect(view.locator("article")).toHaveText([/^Hourly check/, /^Later once/])
    await expect(view.locator(".mx-note").last()).toHaveText(NOTE)
  }
  // Both windows may send a task; reusing its device ID adopts the one the server already has.
  expect(api.schedule.tasks.map((task) => task.name)).toEqual(["Hourly check", "Later once"])
  const creates = api.schedule.calls.filter((call) => call.method === "POST" && call.path === "/api/schedule")
  expect(new Set(creates.map((call) => call.body?.id))).toEqual(new Set(api.schedule.tasks.map((task) => task.id)))
  expect(creates.find((call) => call.body?.name === "Hourly check")?.body).toEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    name: "Hourly check",
    prompt: "Check the build.",
    cadence: "hourly",
    next: SLOT,
    timezone: "America/New_York",
    minute: 570,
    enabled: true,
    history: { runs: 1, last: { time: expect.any(Number), sessionID: "ses_schedule_1" } },
  })
  expect(creates.find((call) => call.body?.name === "Later once")?.body).toMatchObject({
    minute: 585,
    history: { runs: 0 },
  })
  const hourly = page.getByRole("article", { name: "Hourly check" })
  await expect(hourly.locator("p").nth(1)).toContainText("1 run")
  await expect(hourly.locator(".mx-note")).toHaveText(/^Last: .* · Open session$/)

  // The device list is empty now: reopening sends nothing more to move, and the page runs nothing itself.
  const sent = creates.length
  await other.close()
  await openSchedule(page)
  await expect(page.locator("article")).toHaveText([/^Hourly check/, /^Later once/])
  await page.clock.fastForward("50:00")
  await page.clock.runFor(15_000)
  expect(api.schedule.calls.filter((call) => call.method === "POST" && call.path === "/api/schedule")).toHaveLength(
    sent,
  )
  expect(api.attempts).toBe(1)
})

test("edit keeps the task, dialogs dismiss without saving, and remove asks first", async ({ page }) => {
  const api = await setup(page)
  await openSchedule(page)
  await createTask(page, { name: "Weekly sweep", prompt: "Sweep stale branches.", cadence: "weekly" })
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
  await expect(edit.getByLabel("Agent", { exact: true })).toHaveCount(0)
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
  expect(api.schedule.calls.filter((call) => call.method === "PATCH")).toEqual([])

  await card.getByRole("button", { name: "Edit", exact: true }).click()
  await edit.getByLabel("Cadence").selectOption("hourly")
  await edit.getByRole("button", { name: "Schedule", exact: true }).click()
  await expect(edit).toHaveCount(0)
  await expect(card.locator(".mx-badge")).toHaveText(["Every hour", "Scheduled"])
  expect(api.schedule.calls.filter((call) => call.method === "PATCH").map((call) => call.body)).toEqual([
    {
      name: "Weekly sweep",
      prompt: "Sweep stale branches.",
      cadence: "hourly",
      next: SLOT,
      timezone: "America/New_York",
    },
  ])

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
  expect(api.schedule.calls.filter((call) => call.method === "DELETE")).toHaveLength(2)
  expect(api.attempts).toBe(0)
})

test("an unreachable schedule API says so and runs nothing from the page", async ({ page }) => {
  const api = await setup(page)
  api.schedule.unavailable = true
  await openSchedule(page)
  await expect(page.locator(".mx-empty")).toHaveText("Could not load scheduled tasks from the server.")
  await expect(page.locator(".mx-note")).toHaveCount(0)
  api.schedule.unavailable = false
  await openSchedule(page)
  await expect(page.locator(".mx-empty")).toHaveText("No scheduled tasks.Create a one-off or recurring task.")
  expect(api.attempts).toBe(0)
})
