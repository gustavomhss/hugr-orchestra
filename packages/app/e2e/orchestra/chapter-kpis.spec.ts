import { expect, test, type Page, type Route } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { mockOpenCodeServer } from "../utils/mock-server"

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
const day = (month: number, date: number) => Date.UTC(2026, month - 1, date)
// Fixed clock: 2026-10-04 15:00 UTC with the browser in UTC, so every window edge is a known midnight.
const now = Date.UTC(2026, 9, 4, 15)
const edges30 = [
  day(8, 6),
  day(9, 5),
  day(9, 8),
  day(9, 12),
  day(9, 16),
  day(9, 20),
  day(9, 23),
  day(9, 27),
  day(10, 1),
  day(10, 5),
]
const edges7 = [day(9, 21), ...Array.from({ length: 8 }, (_, index) => day(9, 28 + index))]
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
    await expect(home(page).getByRole("button", { name: "30d" })).toHaveAttribute("aria-pressed", "true")
    // Held activity: Orchestra tiles show no number, Export is unavailable, git and PR tiles stand alone.
    for (const id of ["tokens", "hours", "messages", "models", "failed"])
      await expect(value(page, id)).toHaveAttribute("data-state", "loading")
    await expect(home(page).locator(".home-kpi-value:not([data-state])")).toHaveText(["12", "3"])
    await expect(value(page, "pullRequests")).toHaveText("Not connected")
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
      "Not connected",
      "3",
      "2",
      "1",
    ])
    expect(await home(page).locator(".home-kpi-foot").allTextContents()).toEqual([
      "↗ 23%vs previous",
      "↘ 20%agent turn wall clock",
      "↗ 567%human + agent",
      "↗ 20%on main",
      "no GitHub or GitLab connection",
      "merge commits",
      "2 providers",
      "of 13 total7.7%",
    ])
    expect(await bars(page, "commits")).toEqual(["50%", "0%", "0%", "0%", "0%", "0%", "0%", "100%"])
    expect(await bars(page, "tokens")).toEqual(["100%", "0%", "0%", "1%", "0%", "0%", "0%", "53%"])
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
    // One activity read per window, each with the hand-computed local-midnight edges.
    expect(requests.map((url) => [url.origin, url.pathname, url.searchParams.get("directory")])).toEqual([
      [serverA, "/session/activity", directory],
    ])
    expect(requests[0]!.searchParams.get("edges")).toBe(edges30.join(","))
    await home(page).getByRole("button", { name: "View all" }).click()
    await expect(rows(page)).toHaveCount(7)
    await home(page).getByRole("button", { name: "Top 5" }).click()
    await expect(rows(page)).toHaveCount(5)
    const download = page.waitForEvent("download")
    await home(page).getByRole("button", { name: "Export" }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe("Recorded repo A-metrics-30d.csv")
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
        ["Pull requests", "Not connected", "", ""],
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
        .map((row) => row.map((cell) => `"${cell.replace(/^-/, "'-")}"`).join(","))
        .join("\r\n") + "\r\n",
    )
    await page.screenshot({ path: testInfo.outputPath(`${scheme}.png`) })
    await testInfo.attach(`${scheme} home`, { path: testInfo.outputPath(`${scheme}.png`), contentType: "image/png" })
    await rows(page).first().click()
    await expect(page).toHaveURL(/\/session\/ses_recorded_001/)
  })
}

test("period switch reads the new window, keeps the choice per profile and has no stale numbers", async ({ page }) => {
  const requests: URL[] = []
  const gitRequests: URL[] = []
  await setup(page, { requests, gitRequests })
  await page.goto("/")
  await expect(value(page, "tokens")).toHaveText("1.8M")
  await home(page).getByRole("button", { name: "7d" }).click()
  await expect(home(page).getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true")
  await expect(value(page, "tokens")).toHaveText("50k")
  await expect(tile(page, "tokens").locator(".home-kpi-foot")).toHaveText("↗ newvs previous")
  await expect(value(page, "commits")).toHaveText("8")
  expect(requests.at(-1)!.searchParams.get("edges")).toBe(edges7.join(","))
  expect(gitRequests.map((url) => [url.searchParams.get("since"), url.searchParams.get("until")])).toEqual([
    [String(day(8, 6)), String(now)],
    [String(day(9, 21)), String(now)],
  ])
  await page.reload()
  await expect(home(page).getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true")
  await expect(value(page, "tokens")).toHaveText("50k")
  // "All" first finds the oldest recorded session, then reads bars from its creation day.
  await home(page).getByRole("button", { name: "All" }).click()
  await expect(value(page, "tokens")).toHaveText("1.8M")
  await expect(tile(page, "tokens").locator(".home-kpi-foot")).toHaveText("since Sep 1, 2026")
  expect(requests.slice(-2).map((url) => url.searchParams.get("edges"))).toEqual([
    `0,${day(10, 5)}`,
    [1, 5, 9, 13, 18, 22, 26, 30].map((date) => day(9, date)).concat(day(10, 5)).join(","),
  ])
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

test("empty, unavailable, non-git and partial states are explicit", async ({ page }) => {
  test.slow()
  const git = { mode: "ok" as "ok" | "missing" | "none" | "truncated" }
  const activity = { mode: "empty" as "empty" | "missing" }
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
  git.mode = "none"
  await page.reload()
  await expect(value(page, "merges")).toHaveText("No repository")
  await expect(tile(page, "merges").locator(".home-kpi-foot")).toHaveText("not a git repository")
  git.mode = "truncated"
  await page.reload()
  await expect(value(page, "commits")).toHaveText("Partial")
  await expect(tile(page, "commits").locator(".home-kpi-foot")).toHaveText("the history scan stopped at its limit")
  await expect(tile(page, "commits").locator(".home-bars i")).toHaveCount(0)
})

test("Configure tracking hides tiles for this profile and Export follows the shown tiles", async ({ page }) => {
  await setup(page)
  await page.goto("/")
  await expect(value(page, "tokens")).toHaveText("1.8M")
  await home(page).getByRole("button", { name: "Configure tracking" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText("Choose which metrics this project shows on Home and includes in Export.")
  await dialog.getByRole("switch", { name: "Pull requests" }).click()
  await dialog.getByRole("switch", { name: "Hours worked" }).click()
  await expect(dialog.getByRole("switch", { name: "Pull requests" })).toHaveAttribute("aria-checked", "false")
  await page.keyboard.press("Escape")
  await expect(home(page).locator(".home-kpi")).toHaveCount(6)
  await expect(tile(page, "pullRequests")).toHaveCount(0)
  await page.reload()
  await expect(value(page, "tokens")).toHaveText("1.8M")
  await expect(home(page).locator(".home-kpi")).toHaveCount(6)
  const download = page.waitForEvent("download")
  await home(page).getByRole("button", { name: "Export" }).click()
  const csv = await readFile((await (await download).path())!, "utf8")
  expect(csv).not.toContain("Pull requests")
  expect(csv).not.toContain("Hours worked")
  expect(csv).toContain('"Merges","3","count",""\r\n')
})

test("Manage opens the models settings", async ({ page }) => {
  await setup(page)
  await page.goto("/")
  await home(page).getByRole("button", { name: "Manage" }).click()
  await expect(page.getByRole("dialog").getByRole("tab", { name: "Models", selected: true })).toBeVisible()
})

test("no selected profile shows no KPIs and reads nothing", async ({ page }) => {
  const requests: URL[] = []
  const gitRequests: URL[] = []
  await setup(page, { requests, gitRequests, noSelection: true })
  await page.goto("/")
  await expect(page.locator('[data-component="orchestra-home"]')).toBeVisible()
  await expect(page.locator('[data-component="orchestra-kpis-empty"]')).toContainText(
    "Choose a project to see what its agents shipped.",
  )
  await page.waitForTimeout(300)
  await expect(home(page)).toHaveCount(0)
  expect(requests).toHaveLength(0)
  expect(gitRequests).toHaveLength(0)
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
    time: { created: day(9, value), updated: day(10, 4) },
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
  activeMs: 0,
  tokens: 0,
  cost: 0,
  ...input,
})
const gpt = { providerID: "openai", modelID: "gpt" }

// The 30d window: bucket 0 is the previous window, buckets 1..8 the bars.
function activity30() {
  return {
    edges: edges30,
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
    facts: [
      fact(0, 1, { ...gpt, user: 1, assistant: 2, tokens: 1_500_000, activeMs: 9_000_000 }),
      fact(1, 1, { user: 2 }),
      fact(1, 1, { ...gpt, assistant: 5, failed: 1, tokens: 1_200_000, activeMs: 5_400_000 }),
      ...[4, 5, 6, 7].map((value) => fact(4, value, { ...gpt, user: 1, assistant: 1, tokens: (value - 3) * 1000 })),
      fact(8, 2, { user: 1 }),
      fact(8, 2, { providerID: "anthropic", modelID: "sonnet", assistant: 3, tokens: 600_000, activeMs: 1_800_000 }),
      fact(8, 3, { ...gpt, assistant: 1, tokens: 30_000 }),
    ],
  }
}

function activityFor(edges: number[]) {
  if (edges.join(",") === edges30.join(",")) return activity30()
  const base = activity30()
  // "All" bars and the 7d window both carry everything in their last bar; 7d has an empty previous window.
  const last = edges.length - 2
  const total = base.facts.filter((item) => item.bucket > 0)
  if (edges[0] === 0) return { ...base, edges, facts: total.map((item) => ({ ...item, bucket: 0 })) }
  if (edges.join(",") === edges7.join(","))
    return { ...base, edges, facts: [fact(last, 2, { ...gpt, assistant: 1, tokens: 50_000 })] }
  return { ...base, edges, facts: total.map((item) => ({ ...item, bucket: last })) }
}

function gitFor(since: number, mode: string) {
  return {
    repository: mode !== "none",
    since,
    until: now,
    totals: { commits: 0, merges: 0, authors: 0, additions: 0, deletions: 0, filesChanged: 0 },
    days:
      since === day(9, 21)
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
    truncated: mode === "truncated",
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
    git?: { mode: "ok" | "missing" | "none" | "truncated" }
    activity?: { mode: "empty" | "missing" }
    noSelection?: boolean
  } = {},
) {
  await page.clock.setFixedTime(now)
  await mockOpenCodeServer(page, {
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
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem("opencode.global.dat:language", JSON.stringify({ locale }))
      localStorage.setItem(
        "opencode.global.dat:server",
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
        "opencode.global.dat:layout",
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
      const edges = url.searchParams.get("edges")!.split(",").map(Number)
      if (url.origin === serverB || url.searchParams.get("directory") === `${directory}-other`)
        return json(route, {
          edges,
          sessions: [],
          facts: [fact(edges.length - 2, 7, { ...gpt, assistant: 1, tokens: 777 })],
        })
      if (input.activity?.mode === "missing") return json(route, {}, 404)
      if (input.activity?.mode === "empty") return json(route, { edges, sessions: [], facts: [] })
      await input.gate
      if (input.failure?.enabled) return json(route, {}, 500)
      await json(route, activityFor(edges))
      input.finished?.()
      return
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

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  })
}
