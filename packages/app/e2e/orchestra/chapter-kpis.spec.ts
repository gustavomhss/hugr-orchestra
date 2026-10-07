import { expect, test, type Page, type Route } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { mockOrchestraServer } from "../utils/mock-server"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const directory = "/recorded-repo"
const project = {
  id: "project-recorded",
  name: "Recorded repo A",
  worktree: directory,
  vcs: "git",
  sandboxes: [],
  time: { created: 1, updated: 1 },
}
const DAY = 86_400_000
// Fixed clock: 2026-10-04 15:00 UTC with the browser in UTC, the same calendar the mocked server reports.
const now = Date.UTC(2026, 9, 4, 15)
// Server-local days of each bucket edge, as session.activity reports them.
const days30 = [
  "2026-08-06",
  "2026-09-05",
  "2026-09-08",
  "2026-09-12",
  "2026-09-16",
  "2026-09-20",
  "2026-09-23",
  "2026-09-27",
  "2026-10-01",
  "2026-10-05",
]
const days7 = [
  "2026-09-21",
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
  "2026-10-05",
]
const daysAll = [
  "2026-09-01",
  "2026-09-05",
  "2026-09-09",
  "2026-09-13",
  "2026-09-18",
  "2026-09-22",
  "2026-09-26",
  "2026-09-30",
  "2026-10-05",
]
const records = Array.from({ length: 7 }, (_, index) => session(index + 1))
const home = (page: Page) => page.locator('[data-component="orchestra-kpis"]')
const tile = (page: Page, id: string) => home(page).locator(`[data-tile="${id}"]`)
const value = (page: Page, id: string) => tile(page, id).locator(".home-kpi-value")
const rows = (page: Page) => home(page).locator('[data-component="home-impact-row"]')

test.use({ viewport: { width: 1440, height: 1200 }, timezoneId: "UTC" })

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: Home paints before activity, then shows exact KPIs, ranks sessions and exports the displayed data`, async ({
    page,
  }, testInfo) => {
    const gate = Promise.withResolvers<void>()
    const requests: URL[] = []
    await setup(page, { scheme, gate: gate.promise, requests })
    await page.goto("/")
    await expect(page.locator('[data-component="orchestra-home"]')).toBeVisible()
    await expect(home(page).locator(".home-kicker")).toHaveText("Project · Recorded repo A")
    await expect(home(page).locator("h1")).toHaveText("What the agentsactually shipped.")
    await expect(home(page).getByRole("button", { name: "30d", exact: true })).toHaveAttribute("aria-pressed", "true")
    // The mock's 520-580 weights render as static Inter Medium with synthetic bold.
    await expect(home(page).locator(".home-kpi-label").first()).toHaveCSS("font-weight", "600")
    expect(
      await home(page)
        .locator(".home-kpi-label")
        .first()
        .evaluate((element) => getComputedStyle(element).fontFamily),
    ).toMatch(/^"Mx Inter Medium"/)
    // Held activity: Orchestra tiles show no number, Export is unavailable, git and PR tiles stand alone.
    for (const id of ["tokens", "hours", "messages", "models", "failed"])
      await expect(value(page, id)).toHaveAttribute("data-state", "loading")
    await expect(home(page).locator(".home-kpi-value:not([data-state])")).toHaveText(["12", "6", "3"])
    await expect(home(page).getByRole("button", { name: "Export" })).toBeDisabled()
    await expect(rows(page)).toHaveCount(0)
    gate.resolve()
    await expect(value(page, "tokens")).toHaveText("1.8M")
    expect(await home(page).locator(".home-kpi-label").allTextContents()).toEqual([
      "Tokens spent",
      "Hours worked",
      "Messages",
      "Commits",
      "Pull requests",
      "Merges",
      "Models run",
      "Failed runs",
    ])
    expect(await home(page).locator(".home-kpi-value").allTextContents()).toEqual([
      "1.8M",
      "2.0h",
      "20",
      "12",
      "6",
      "3",
      "2",
      "1",
    ])
    expect(await home(page).locator(".home-kpi-foot").allTextContents()).toEqual([
      "↗ 23%vs previous",
      "↘ 20%agent turn wall clock",
      "↗ 567%human + agent",
      "↗ 20%on main",
      "open on GitHub",
      "merge commits",
      "2 providers",
      "of 13 total7.7%",
    ])
    expect(await bars(page, "commits")).toEqual(["50%", "0%", "0%", "0%", "0%", "0%", "0%", "100%"])
    expect(await bars(page, "tokens")).toEqual(["100%", "0%", "0%", "1%", "0%", "0%", "0%", "53%"])
    expect(await bars(page, "hours")).toEqual(["100%", "0%", "0%", "0%", "0%", "0%", "0%", "33%"])
    expect(await rows(page).locator(".home-row-title").allTextContents()).toEqual([
      "Recorded session 1running",
      "Recorded session 2",
      "Recorded session 3",
      "Recorded session 7",
      "Recorded session 6",
    ])
    expect(await rows(page).locator(".home-row-sub").allTextContents()).toEqual([
      "Oct 4 · 6 files · +230/−88",
      "Oct 4 · 4 messages",
      "Oct 4 · 1 message",
      "Oct 4 · 2 messages",
      "Oct 4 · 2 messages",
    ])
    expect(await rows(page).locator(".home-row-value").allTextContents()).toEqual([
      "1.2M tokens",
      "600k tokens",
      "30k tokens",
      "4.0k tokens",
      "3.0k tokens",
    ])
    const models = home(page).locator('[data-component="home-model-row"]')
    expect(await models.locator(".home-chip").allTextContents()).toEqual(["gpt", "sonnet"])
    expect(await models.locator(".home-row-value").allTextContents()).toEqual(["1.2M", "600k"])
    expect(requests.map((url) => [url.origin, url.pathname, url.searchParams.get("directory")])).toEqual([
      [serverA, "/session/activity", directory],
    ])
    expect(requests[0]!.searchParams.get("period")).toBe("30d")
    await home(page).getByRole("button", { name: "View all" }).click()
    await expect(rows(page)).toHaveCount(7)
    await home(page).getByRole("button", { name: "Top 5" }).click()
    await expect(rows(page)).toHaveCount(5)
    const download = page.waitForEvent("download")
    await home(page).getByRole("button", { name: "Export" }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe("Recorded repo A-metrics-30d.csv")
    // Numbers are written as-is, negative changes included; only text is guarded against formulas.
    expect(await readFile((await file.path())!, "utf8")).toBe(
      [
        ["Period", "30d"],
        ["From", "2026-09-05"],
        ["To", "2026-10-04"],
        ["Metric", "Value", "Unit", "Change vs previous (%)"],
        ["Tokens spent", "1840000", "tokens", "23"],
        ["Hours worked", "2", "hours", "-20"],
        ["Messages", "20", "count", "567"],
        ["Commits", "12", "count", "20"],
        ["Pull requests", "6", "count", ""],
        ["Merges", "3", "count", ""],
        ["Models run", "2", "count", ""],
        ["Failed runs", "1", "count", ""],
        ["Session", "Tokens", "Messages", "Files", "Additions", "Deletions"],
        ["Recorded session 1", "1200000", "7", "6", "230", "88"],
        ["Recorded session 2", "600000", "4", "", "", ""],
        ["Recorded session 3", "30000", "1", "", "", ""],
        ["Recorded session 7", "4000", "2", "", "", ""],
        ["Recorded session 6", "3000", "2", "", "", ""],
        ["Model", "Tokens", "Runs"],
        ["openai/gpt", "1240000", "10"],
        ["anthropic/sonnet", "600000", "3"],
      ]
        .map((row) => row.map((cell) => `"${cell}"`).join(","))
        .join("\r\n") + "\r\n",
    )
    await page.screenshot({ path: testInfo.outputPath(`${scheme}.png`) })
    await testInfo.attach(`${scheme} home`, { path: testInfo.outputPath(`${scheme}.png`), contentType: "image/png" })
    await rows(page).first().click()
    await expect(page).toHaveURL(/\/session\/ses_recorded_001/)
  })
}

test("period switch reads each period once while fresh, keeps the choice per profile and has no stale numbers", async ({
  page,
}) => {
  const requests: URL[] = []
  const gitRequests: URL[] = []
  const pullRequests = { mode: "github" as const, requests: [] as URL[] }
  await setup(page, { requests, gitRequests, pullRequests })
  await page.goto("/")
  await expect(value(page, "tokens")).toHaveText("1.8M")
  await home(page).getByRole("button", { name: "7d", exact: true }).click()
  await expect(home(page).getByRole("button", { name: "7d", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(value(page, "tokens")).toHaveText("50k")
  await expect(tile(page, "tokens").locator(".home-kpi-foot")).toHaveText("↗ newvs previous")
  await expect(value(page, "commits")).toHaveText("8")
  // Back to 30d inside the stale time: the cached read answers.
  await home(page).getByRole("button", { name: "30d", exact: true }).click()
  await expect(value(page, "tokens")).toHaveText("1.8M")
  expect(requests.map((url) => url.searchParams.get("period"))).toEqual(["30d", "7d"])
  // The open count is the same for every period, so one read serves them all.
  await expect(value(page, "pullRequests")).toHaveText("6")
  expect(pullRequests.requests.map((url) => url.searchParams.get("location[directory]"))).toEqual([directory])
  // Git windows cover the previous period in any time zone; days outside it are not counted.
  expect(gitRequests.map((url) => [url.searchParams.get("since"), url.searchParams.get("until")])).toEqual([
    [String(now - 62 * DAY), String(now)],
    [String(now - 16 * DAY), String(now)],
  ])
  await home(page).getByRole("button", { name: "7d", exact: true }).click()
  await expect(value(page, "tokens")).toHaveText("50k")
  await page.reload()
  await expect(home(page).getByRole("button", { name: "7d", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(value(page, "tokens")).toHaveText("50k")
  // "All" is one read; the server starts it on the first recorded day.
  await home(page).getByRole("button", { name: "All", exact: true }).click()
  await expect(value(page, "tokens")).toHaveText("1.8M")
  await expect(tile(page, "tokens").locator(".home-kpi-foot")).toHaveText("since Sep 1, 2026")
  await expect(tile(page, "tokens").locator(".home-delta")).toHaveCount(0)
  expect(requests.map((url) => url.searchParams.get("period"))).toEqual(["30d", "7d", "7d", "all"])
  expect(gitRequests.at(-1)!.searchParams.get("since")).toBe("0")
})

test("app locale formats numbers while CSV keeps raw values", async ({ page }) => {
  await setup(page, { locale: "de" })
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("lang", "de")
  await expect(value(page, "tokens")).toHaveText("1,8M")
  await expect(value(page, "hours")).toHaveText("2,0h")
  await expect(tile(page, "failed").locator(".home-kpi-foot")).toHaveText("of 13 total7,7%")
  const download = page.waitForEvent("download")
  await home(page).getByRole("button", { name: "Export" }).click()
  const csv = await readFile((await (await download).path())!, "utf8")
  expect(csv).toContain('"Tokens spent","1840000","tokens","23"\r\n')
  expect(csv).toContain('"Hours worked","2","hours","-20"\r\n')
  expect(csv).toContain('"Recorded session 1","1200000","7","6","230","88"\r\n')
})

for (const switchKind of ["server", "worktree"] as const) {
  test(`${switchKind} profile switch mid-load cancels the old profile read`, async ({ page }) => {
    const gate = Promise.withResolvers<void>()
    const requests: URL[] = []
    const completed = Promise.withResolvers<void>()
    await setup(page, {
      gate: gate.promise,
      requests,
      secondServer: switchKind === "server",
      secondDirectory: switchKind === "worktree",
      finished: completed.resolve,
    })
    await page.goto("/")
    await expect(value(page, "tokens")).toHaveAttribute("data-state", "loading")
    await page.getByRole("button", { name: "Choose repository profile" }).click()
    await page.getByRole("menuitemradio", { name: "Recorded repo B" }).click()
    await expect(value(page, "tokens")).toHaveText("777")
    gate.resolve()
    // Wait for the held response and another paint before asserting isolation.
    await completed.promise
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    await expect(value(page, "tokens")).toHaveText("777")
    await expect(home(page)).not.toContainText("1.8M")
    await expect(home(page)).not.toContainText("Recorded session 1")
    expect(
      requests.some(
        (url) =>
          url.origin === (switchKind === "server" ? serverB : serverA) &&
          url.searchParams.get("directory") === (switchKind === "server" ? directory : `${directory}-other`),
      ),
    ).toBe(true)
  })
}

test("failed activity hides totals and Retry reads the profile again", async ({ page }) => {
  const requests: URL[] = []
  const failure = { enabled: true }
  await setup(page, { requests, failure })
  await page.goto("/")
  await expect(home(page).getByRole("alert")).toContainText("No totals are shown")
  for (const id of ["tokens", "hours", "messages", "models", "failed"])
    await expect(value(page, id)).toHaveText("Unavailable")
  await expect(rows(page)).toHaveCount(0)
  await expect(home(page).getByRole("button", { name: "Export" })).toBeDisabled()
  failure.enabled = false
  await home(page).getByRole("button", { name: "Retry" }).click()
  await expect(value(page, "tokens")).toHaveText("1.8M")
  await expect(home(page).getByRole("alert")).toHaveCount(0)
  expect(requests).toHaveLength(2)
})

test("empty, unavailable, partial, non-git and partial-git states are explicit", async ({ page }) => {
  test.slow()
  const git = { mode: "ok" as "ok" | "missing" | "none" | "truncated" | "lines" }
  const activity = { mode: "empty" as "empty" | "missing" | "truncated" }
  await setup(page, { git, activity })
  await page.goto("/")
  await expect(value(page, "tokens")).toHaveText("0")
  await expect(tile(page, "tokens").locator(".home-kpi-foot")).toHaveText("vs previous")
  await expect(home(page)).toContainText("No session activity in this period.")
  await expect(home(page)).toContainText("No model runs in this period.")
  await expect(home(page).getByRole("button", { name: "View all" })).toBeDisabled()
  activity.mode = "missing"
  git.mode = "missing"
  await page.reload()
  await expect(home(page).getByRole("status")).toContainText("Recorded activity is unavailable on this server.")
  await expect(value(page, "tokens")).toHaveText("Unavailable")
  await expect(value(page, "commits")).toHaveText("Unavailable")
  await expect(tile(page, "commits").locator(".home-kpi-foot")).toHaveText("this server cannot read commits")
  activity.mode = "truncated"
  git.mode = "none"
  await page.reload()
  for (const id of ["tokens", "hours", "messages", "models", "failed"])
    await expect(value(page, id)).toHaveText("Partial")
  await expect(rows(page)).toHaveCount(0)
  await expect(home(page).getByRole("button", { name: "Export" })).toBeDisabled()
  await expect(value(page, "merges")).toHaveText("No repository")
  await expect(tile(page, "merges").locator(".home-kpi-foot")).toHaveText("not a git repository")
  // Partial line totals do not affect commit counts.
  activity.mode = "empty"
  git.mode = "lines"
  await page.reload()
  await expect(value(page, "commits")).toHaveText("12")
  await expect(value(page, "merges")).toHaveText("3")
  git.mode = "truncated"
  await page.reload()
  await expect(value(page, "commits")).toHaveText("Partial")
  await expect(value(page, "merges")).toHaveText("Partial")
  await expect(tile(page, "commits").locator(".home-kpi-foot")).toHaveText("the history scan stopped at its limit")
  await expect(tile(page, "commits").locator(".home-bars i")).toHaveCount(0)
})

test("the pull request tile shows the host's open count, or why it cannot know it, never a guess", async ({ page }) => {
  test.slow()
  const pullRequests = { mode: "gitlab" as PullRequestMode }
  await setup(page, { pullRequests })
  await page.goto("/")
  await expect(value(page, "pullRequests")).toHaveText("3")
  await expect(tile(page, "pullRequests").locator(".home-kpi-foot")).toHaveText("open on GitLab")
  await expect(tile(page, "pullRequests").locator(".home-bars i")).toHaveCount(0)
  const states: [PullRequestMode, string, string][] = [
    // The host's total counts, not the page of pull requests it listed.
    ["truncated", "240", "open on GitHub"],
    ["not_installed", "Not connected", "gh is not installed on this server"],
    ["not_authenticated", "Not connected", "glab is not signed in on this server"],
    ["no_remote", "Not connected", "no github.com or gitlab.com remote"],
    ["cli_failed", "Unavailable", "could not read pull requests"],
    ["missing", "Unavailable", "this server cannot read pull requests"],
    ["malformed", "Unavailable", "could not read pull requests"],
  ]
  for (const [mode, state, note] of states) {
    pullRequests.mode = mode
    await page.reload()
    await expect(value(page, "tokens")).toHaveText("1.8M")
    await expect(value(page, "pullRequests")).toHaveText(state)
    await expect(tile(page, "pullRequests").locator(".home-kpi-foot")).toHaveText(note)
  }
  // The export writes the tile's state, not a number.
  const download = page.waitForEvent("download")
  await home(page).getByRole("button", { name: "Export" }).click()
  const csv = await readFile((await (await download).path())!, "utf8")
  expect(csv).toContain('"Pull requests","Unavailable","",""\r\n')
})

test("Configure tracking opens Providers and Manage opens the models settings", async ({ page }) => {
  await setup(page)
  await page.goto("/")
  await expect(value(page, "tokens")).toHaveText("1.8M")
  await home(page).getByRole("button", { name: "Manage" }).click()
  await expect(page.getByRole("dialog").getByRole("tab", { name: "Models", selected: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await home(page).getByRole("button", { name: "Configure tracking" }).click()
  await expect(page).toHaveURL(/\/orchestra\/providers$/)
  await expect(page.locator('[data-component="orchestra-chapter"][data-chapter="providers"]')).toBeVisible()
})

test("at 700px Home keeps the project list and lays tiles in two columns without horizontal scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 900 })
  await setup(page)
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Add project" }).first()).toBeVisible()
  await expect(value(page, "tokens")).toHaveText("1.8M")
  const boxes = await home(page)
    .locator(".home-kpi")
    .evaluateAll((items) => items.slice(0, 3).map((item) => item.getBoundingClientRect().toJSON() as DOMRect))
  expect(boxes[0]!.top).toBe(boxes[1]!.top)
  expect(boxes[1]!.left).toBeGreaterThan(boxes[0]!.right)
  expect(boxes[2]!.top).toBeGreaterThanOrEqual(boxes[0]!.bottom)
  expect(boxes[2]!.left).toBe(boxes[0]!.left)
  expect(
    await page.evaluate(() => ({
      page: document.documentElement.scrollWidth <= window.innerWidth,
      home: [...document.querySelectorAll('[data-component="orchestra-home"] *')].every(
        (element) => element.getBoundingClientRect().right <= window.innerWidth + 0.5,
      ),
    })),
  ).toEqual({ page: true, home: true })
})

test("no selected profile shows no KPIs and reads nothing", async ({ page }) => {
  const requests: URL[] = []
  const gitRequests: URL[] = []
  const pullRequests = { mode: "github" as const, requests: [] as URL[] }
  await setup(page, { requests, gitRequests, pullRequests, noSelection: true })
  await page.goto("/")
  await expect(page.locator('[data-component="orchestra-home"]')).toBeVisible()
  await expect(page.locator('[data-component="orchestra-kpis-empty"]')).toContainText(
    "Choose a project to see what its agents shipped.",
  )
  await page.waitForTimeout(300)
  await expect(home(page)).toHaveCount(0)
  expect(requests).toHaveLength(0)
  expect(gitRequests).toHaveLength(0)
  expect(pullRequests.requests).toHaveLength(0)
})

test("opening a chapter right after choosing a profile replaces Home while activity loads", async ({ page }) => {
  const gate = Promise.withResolvers<void>()
  const requests: URL[] = []
  await setup(page, { noSelection: true, gate: gate.promise, requests })
  await page.goto("/")
  await expect(page.locator('[data-component="orchestra-home"]')).toBeVisible()
  await page.getByRole("button", { name: "Choose repository profile" }).click()
  await page.getByRole("menuitemradio", { name: "Recorded repo A" }).click()
  await expect(page.locator('[data-slot="orchestra-profile"]')).toContainText("Recorded repo A")
  await expect.poll(() => requests.length).toBe(1)
  await page.locator('[data-component="orchestra-sidebar"]').getByRole("button", { name: ".env", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/env$/)
  await expect(page.locator('[data-component="orchestra-chapter"][data-chapter="env"]')).toBeVisible()
  await expect(page.locator('[data-component="orchestra-home"]')).toHaveCount(0)
  gate.resolve()
  await page.waitForTimeout(300)
  await expect(home(page)).toHaveCount(0)
})

async function bars(page: Page, id: string) {
  return tile(page, id)
    .locator(".home-bars i")
    .evaluateAll((items) => items.map((item) => (item as HTMLElement).style.height))
}

function session(value: number) {
  return {
    id: `ses_recorded_${String(value).padStart(3, "0")}`,
    directory,
    projectID: project.id,
    title: `Recorded session ${value}`,
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: Date.UTC(2026, 8, value), updated: Date.UTC(2026, 9, 4) },
  }
}

const fact = (bucket: number, value: number, input: Record<string, unknown>) => ({
  bucket,
  sessionID: session(value).id,
  providerID: null,
  modelID: null,
  user: 0,
  assistant: 0,
  failed: 0,
  tokens: 0,
  ...input,
})
const gpt = { providerID: "openai", modelID: "gpt" }

function response(period: string, days: string[], previous: boolean, facts: unknown[], activeMs?: number[]) {
  return {
    period,
    edges: days.map((day) => Date.parse(`${day}T00:00:00Z`)),
    days,
    previous,
    activeMs: activeMs ?? days.slice(1).map(() => 0),
    truncated: false,
    sessions: records.map((item) => ({
      id: item.id,
      title: item.title,
      parentID: null,
      created: item.time.created,
      updated: item.time.updated,
      additions: item.id === "ses_recorded_001" ? 230 : null,
      deletions: item.id === "ses_recorded_001" ? 88 : null,
      files: item.id === "ses_recorded_001" ? 6 : null,
    })),
    facts,
  }
}

// The 30d period: bucket 0 is the previous window, buckets 1..8 the bars.
const facts30 = [
  fact(0, 1, { ...gpt, user: 1, assistant: 2, tokens: 1_500_000 }),
  fact(1, 1, { user: 2 }),
  fact(1, 1, { ...gpt, assistant: 5, failed: 1, tokens: 1_200_000 }),
  ...[4, 5, 6, 7].map((value) => fact(4, value, { ...gpt, user: 1, assistant: 1, tokens: (value - 3) * 1000 })),
  fact(8, 2, { user: 1 }),
  fact(8, 2, { providerID: "anthropic", modelID: "sonnet", assistant: 3, tokens: 600_000 }),
  fact(8, 3, { ...gpt, assistant: 1, tokens: 30_000 }),
]

function activityFor(period: string) {
  if (period === "7d") return response("7d", days7, true, [fact(7, 2, { ...gpt, assistant: 1, tokens: 50_000 })])
  if (period === "all")
    return response(
      "all",
      daysAll,
      false,
      facts30.filter((item) => item.bucket > 0).map((item) => ({ ...item, bucket: 7 })),
    )
  return response("30d", days30, true, facts30, [9_000_000, 5_400_000, 0, 0, 0, 0, 0, 0, 1_800_000])
}

function gitFor(since: number, mode: string) {
  return {
    repository: mode !== "none",
    since,
    until: now,
    totals: { commits: 0, merges: 0, authors: 0, additions: 0, deletions: 0, filesChanged: 0 },
    days:
      since === now - 16 * DAY
        ? [
            { day: "2026-09-25", commits: 2, merges: 0, additions: 1, deletions: 1 },
            { day: "2026-10-04", commits: 8, merges: 2, additions: 1, deletions: 1 },
          ]
        : [
            { day: "2026-08-20", commits: 10, merges: 1, additions: 1, deletions: 1 },
            { day: "2026-09-06", commits: 4, merges: 1, additions: 1, deletions: 1 },
            { day: "2026-10-04", commits: 8, merges: 2, additions: 1, deletions: 1 },
          ],
    topPaths: [],
    recent: [],
    ahead: null,
    behind: null,
    truncated: mode === "truncated" || mode === "lines",
    partial: { commits: mode === "truncated", lines: mode === "lines" },
  }
}

async function setup(
  page: Page,
  input: {
    scheme?: "dark" | "light"
    locale?: "en" | "de"
    gate?: Promise<void>
    finished?: () => void
    requests?: URL[]
    gitRequests?: URL[]
    secondServer?: boolean
    secondDirectory?: boolean
    failure?: { enabled: boolean }
    git?: { mode: "ok" | "missing" | "none" | "truncated" | "lines" }
    activity?: { mode: "empty" | "missing" | "truncated" }
    pullRequests?: { mode: PullRequestMode; requests?: URL[] }
    noSelection?: boolean
  } = {},
) {
  await page.clock.setFixedTime(now)
  await mockOrchestraServer(page, {
    protocol: "v2",
    directory,
    project,
    sessions: records,
    provider: { all: [], connected: [], default: {} },
    pageMessages: () => ({ items: [] }),
    sessionStatus: { ses_recorded_001: { type: "busy" } },
  })
  await page.addInitScript(
    ({ directory, serverA, serverB, secondServer, secondDirectory, noSelection, scheme, locale }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem("orchestra-theme-id", "oc-2")
      localStorage.setItem("orchestra-color-scheme", scheme)
      localStorage.setItem("orchestra.global.dat:language", JSON.stringify({ locale }))
      localStorage.setItem(
        "orchestra.global.dat:server",
        JSON.stringify({
          list: secondServer ? [serverB] : [],
          projects: {
            local: [{ worktree: directory }, ...(secondDirectory ? [{ worktree: `${directory}-other` }] : [])],
            ...(secondServer ? { [serverB]: [{ worktree: directory }] } : {}),
          },
          lastProject: { local: directory },
        }),
      )
      if (sessionStorage.getItem("kpis-seeded")) return
      sessionStorage.setItem("kpis-seeded", "1")
      localStorage.setItem(
        "orchestra.global.dat:layout",
        JSON.stringify({ home: { selection: { server: serverA, ...(noSelection ? {} : { directory }) } } }),
      )
    },
    {
      directory,
      serverA,
      serverB,
      secondServer: input.secondServer,
      secondDirectory: input.secondDirectory,
      noSelection: input.noSelection,
      scheme: input.scheme ?? "dark",
      locale: input.locale ?? "en",
    },
  )
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== serverA && url.origin !== serverB) return route.fallback()
    if (input.secondDirectory && url.origin === serverA && ["/project", "/api/project"].includes(url.pathname))
      return json(route, [
        project,
        { ...project, id: "project-other", name: "Recorded repo B", worktree: `${directory}-other` },
      ])
    if (url.pathname === "/session/activity") {
      input.requests?.push(url)
      const period = url.searchParams.get("period")!
      if (url.origin === serverB || url.searchParams.get("directory") === `${directory}-other`)
        return json(route, response(period, days30, true, [fact(8, 7, { ...gpt, assistant: 1, tokens: 777 })]))
      if (input.activity?.mode === "missing") return json(route, {}, 404)
      if (input.activity?.mode === "empty") return json(route, response(period, days30, true, []))
      if (input.activity?.mode === "truncated")
        return json(route, { ...response(period, days30, true, facts30), truncated: true })
      await input.gate
      if (input.failure?.enabled) return json(route, {}, 500)
      await json(route, activityFor(period))
      input.finished?.()
      return
    }
    if (url.pathname === "/api/pull-request") {
      input.pullRequests?.requests?.push(url)
      const reply = pullRequestReply(input.pullRequests?.mode ?? "github")
      return json(route, reply.body, reply.status)
    }
    if (url.pathname === "/vcs/activity") {
      input.gitRequests?.push(url)
      const mode = input.git?.mode ?? "ok"
      if (mode === "missing") return json(route, {}, 404)
      return json(route, gitFor(Number(url.searchParams.get("since")), mode))
    }
    if (url.origin !== serverB) return route.fallback()
    if (url.pathname === "/global/health") return json(route, {}, 404)
    if (url.pathname === "/api/health") return json(route, { healthy: true, pid: 2 })
    if (["/api/event", "/event", "/global/event"].includes(url.pathname))
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ok\n\n" })
    if (["/project", "/api/project"].includes(url.pathname))
      return json(route, [{ ...project, name: "Recorded repo B" }])
    if (url.pathname === "/api/session") return json(route, { data: [], cursor: {} })
    if (url.pathname === "/api/session/active") return json(route, { data: {} })
    if (["/path", "/api/path"].includes(url.pathname))
      return json(route, { directory, worktree: directory, home: "/", config: directory, state: directory })
    if (url.pathname === "/api/project/current") return json(route, { id: project.id, directory })
    if (url.pathname === "/project/current") return json(route, { ...project, name: "Recorded repo B" })
    if (
      [
        "/api/agent",
        "/api/command",
        "/api/reference",
        "/api/skill",
        "/api/permission/request",
        "/api/question/request",
        "/api/vcs/status",
        "/api/vcs/diff",
      ].includes(url.pathname)
    )
      return json(route, { location: { directory }, data: [] })
    if (url.pathname === "/api/vcs") return json(route, { location: { directory }, data: { branch: "dev" } })
    if (url.pathname === "/vcs") return json(route, { branch: "dev" })
    if (
      ["/skill", "/command", "/agent", "/lsp", "/formatter", "/permission", "/question", "/vcs/diff"].includes(
        url.pathname,
      )
    )
      return json(route, [])
    if (url.pathname === "/provider") return json(route, { all: [], connected: [], default: {} })
    return json(route, {})
  })
}

type PullRequestMode =
  | "github"
  | "gitlab"
  | "truncated"
  | "not_installed"
  | "not_authenticated"
  | "no_remote"
  | "cli_failed"
  | "missing"
  | "malformed"

// What the server's /api/pull-request answers in each mode: open pull requests from the host CLI, or its reason.
function pullRequestReply(mode: PullRequestMode) {
  const location = { directory, project: { id: project.id, directory } }
  const list = (host: string, count: number, shown = count) => ({
    status: 200,
    body: {
      location,
      data: {
        host,
        repository: "acme/widgets",
        count,
        truncated: shown < count,
        items: Array.from({ length: shown }, (_, index) => ({
          number: index + 1,
          title: `Change ${index + 1}`,
          url: `https://example.test/${index + 1}`,
          state: host === "gitlab" ? "opened" : "open",
          author: "ada",
        })),
      },
    },
  })
  const failure = (kind: string, host?: string) => ({
    status: 400,
    body: { name: "PullRequestError", data: { kind, message: `${kind} on the server`, host } },
  })
  if (mode === "github") return list("github", 6)
  if (mode === "gitlab") return list("gitlab", 3)
  if (mode === "truncated") return list("github", 240, 100)
  if (mode === "missing") return { status: 404, body: {} }
  if (mode === "malformed") return { status: 200, body: { location, data: { host: "github", count: "six" } } }
  return failure(mode, mode === "not_authenticated" ? "gitlab" : "github")
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  })
}
