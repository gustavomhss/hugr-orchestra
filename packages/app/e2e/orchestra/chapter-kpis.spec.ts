import { expect, test, type Page, type Route } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { currentSession, mockOpenCodeServer } from "../utils/mock-server"

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
const records = Array.from({ length: 103 }, (_, i) => session(i + 1))
const usage = (page: Page) => page.locator('[data-component="orchestra-kpis"]')

test.use({ viewport: { width: 1400, height: 1200 } })

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: Home paints before complete usage, paginates, ranks and exports displayed data`, async ({
    page,
  }, testInfo) => {
    const gate = Promise.withResolvers<void>()
    const requests: URL[] = []
    await setup(page, { scheme, gate: gate.promise, requests })
    await page.goto("/")
    await expect(page.locator('[data-component="orchestra-home"]')).toBeVisible()
    const rows = page.locator('[data-component="home-session-row"]')
    await expect(rows).toHaveCount(24)
    await expect(rows.first()).toBeVisible()
    await rows.first().click({ trial: true })
    const grid = page.locator('[data-slot="orchestra-home-grid"]')
    const listHeight = await grid.evaluate((element) => element.getBoundingClientRect().height)
    await expect(usage(page)).toContainText("100 loaded")
    await expect(usage(page).locator('[data-slot="usage-metric"]')).toHaveCount(0)
    await expect(usage(page).getByRole("button", { name: "Export CSV" })).toBeDisabled()
    // Home's actual new-session control is usable while the usage continuation is held.
    await expect(page.getByRole("button", { name: "New session", exact: true }).first()).toBeVisible()
    gate.resolve()
    await expect(usage(page).locator('[data-slot="usage-metric"]')).toHaveCount(8)
    const values = ["103", "5,356", "10,712", "16,068", "21,424", "26,780", "80,340", "Unavailable"]
    expect(await usage(page).locator("dd").allTextContents()).toEqual(values)
    const titles = [
      "Recorded session 103",
      "Recorded session 102",
      "Recorded session 101",
      "Recorded session 100",
      "Recorded session 99",
    ]
    expect(await usage(page).locator("tbody tr td:first-child").allTextContents()).toEqual(titles)
    expect(await usage(page).locator("tbody tr td:nth-child(2)").allTextContents()).toEqual([
      "1,545",
      "1,530",
      "1,515",
      "1,500",
      "1,485",
    ])
    expect(await usage(page).locator("tbody tr td:nth-child(3)").allTextContents()).toEqual([
      "$2.75",
      "Unavailable",
      "Unavailable",
      "Unavailable",
      "Unavailable",
    ])
    expect(requests.map((url) => url.searchParams.get("cursor"))).toEqual([null, "next-page"])
    expect(
      requests.every(
        (url) =>
          url.origin === serverA &&
          url.pathname === "/api/session" &&
          url.searchParams.get("directory") === directory &&
          url.searchParams.get("order") === "desc" &&
          !url.searchParams.has("parentID") &&
          !url.searchParams.has("archived"),
      ),
    ).toBe(true)
    const download = page.waitForEvent("download")
    await usage(page).getByRole("button", { name: "Export CSV" }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe("recorded-usage.csv")
    const contents = await readFile((await file.path())!, "utf8")
    const displayed = await usage(page).evaluate((section) => [
      [section.querySelector("h2")!.textContent!],
      [section.querySelector("header p")!.textContent!],
      ...Array.from(section.querySelectorAll("dl > div"), (metric) =>
        Array.from(metric.children, (cell) => cell.textContent!),
      ),
      [section.querySelector("h3")!.textContent!],
      ...Array.from(section.querySelectorAll("tr"), (row) => Array.from(row.children, (cell) => cell.textContent!)),
      [section.querySelector(":scope > p:last-child")!.textContent!],
    ])
    // CSV represents these exact displayed rows using raw machine numbers.
    const raw = displayed.map((row, index) =>
      row.map((cell, column) =>
        column > 0 && ((index >= 2 && index <= 9) || (index >= 12 && index <= 16))
          ? cell.replaceAll(",", "").replace("$", "")
          : cell,
      ),
    )
    expect(contents).toBe(
      raw.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n",
    )
    expect(await grid.evaluate((element) => element.getBoundingClientRect().height)).toBe(listHeight)
    const placement = await usage(page).evaluate((section) => {
      const grid = document.querySelector('[data-slot="orchestra-home-grid"]')!
      return {
        after: section.getBoundingClientRect().top >= grid.getBoundingClientRect().bottom,
        sameScroll: section.closest("[data-scrollable]") === grid.closest("[data-scrollable]"),
      }
    })
    expect(placement).toEqual({ after: true, sameScroll: true })
    await rows.first().scrollIntoViewIfNeeded()
    await expect(rows.first()).toBeInViewport()
    await rows.first().click({ trial: true })
    await page.screenshot({ path: test.info().outputPath(`${scheme}-sessions.png`) })
    await usage(page).evaluate((section) => {
      const viewport = section.closest<HTMLElement>("[data-scrollable]")!
      viewport.scrollTop += section.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 220
    })
    await expect(rows.last()).toBeInViewport()
    await expect(usage(page)).toBeInViewport()
    await page.screenshot({ path: test.info().outputPath(`${scheme}.png`) })
    await testInfo.attach(`${scheme} recorded usage`, {
      path: test.info().outputPath(`${scheme}.png`),
      contentType: "image/png",
    })
    await rows.first().click()
    await expect(page).toHaveURL(/\/session\/ses_recorded_/)
  })
}

test("app locale formats grouped tokens and currency while CSV retains raw numbers", async ({ page }) => {
  await setup(page, { locale: "de" })
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("lang", "de")
  await expect(usage(page).locator("dd")).toHaveText([
    "103",
    "5.356",
    "10.712",
    "16.068",
    "21.424",
    "26.780",
    "80.340",
    "Unavailable",
  ])
  await expect(usage(page).locator("tbody tr").first().locator("td")).toHaveText([
    "Recorded session 103",
    "1.545",
    "2,75\u00a0$",
  ])
  const download = page.waitForEvent("download")
  await usage(page).getByRole("button", { name: "Export CSV" }).click()
  const file = await download
  const csv = await readFile((await file.path())!, "utf8")
  expect(csv).toContain('"Input tokens","5356"\r\n')
  expect(csv).toContain('"Recorded tokens","80340"\r\n')
  expect(csv).toContain('"Recorded session 103","1545","2.75"\r\n')
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
    await expect(usage(page)).toContainText("100 loaded")
    await page.getByRole("button", { name: "Choose repository profile" }).click()
    await page.getByRole("menuitemradio", { name: "Recorded repo B" }).click()
    await expect(usage(page).locator("dd").first()).toHaveText("1")
    await expect(usage(page)).toContainText("11,655")
    gate.resolve()
    // Wait for the held response and another paint before asserting isolation.
    await completed.promise
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    await expect(usage(page).locator("dd").first()).toHaveText("1")
    await expect(usage(page)).not.toContainText("80,340")
    await expect(usage(page)).not.toContainText("Recorded session 103")
    expect(
      requests.some(
        (url) =>
          url.origin === (switchKind === "server" ? serverB : serverA) &&
          url.searchParams.get("directory") === (switchKind === "server" ? directory : `${directory}-other`),
      ),
    ).toBe(true)
  })
}

test("failed pagination hides partial totals and retry reads the profile again", async ({ page }) => {
  const requests: URL[] = []
  const failure = { enabled: true }
  await setup(page, { requests, failure })
  await page.goto("/")
  await expect(usage(page).getByRole("alert")).toContainText("No totals are shown")
  await expect(usage(page).locator("dd")).toHaveCount(0)
  await expect(usage(page).getByRole("button", { name: "Export CSV" })).toBeDisabled()
  failure.enabled = false
  await usage(page).getByRole("button", { name: "Retry" }).click()
  await expect(usage(page).locator("dd").first()).toHaveText("103")
  expect(requests.map((url) => url.searchParams.get("cursor"))).toEqual([null, "next-page", null, "next-page"])
})

test("empty and unavailable servers are explicit; mobile and no profile do not load usage", async ({ page }) => {
  // Three navigations need a larger budget on the shared chapter E2E machine.
  test.slow()
  await setup(page, { empty: true })
  await page.goto("/")
  await expect(usage(page)).toContainText("No retained sessions")
  await expect(usage(page).locator("dd").first()).toHaveText("0")
  await expect(usage(page).locator("dd").last()).toHaveText("Unavailable")
  await page.route("**/api/session?**", (route) =>
    new URL(route.request().url()).searchParams.get("limit") === "100" ? json(route, {}, 404) : route.fallback(),
  )
  await page.reload()
  await expect(usage(page)).toContainText("Recorded usage is unavailable")
  await expect(usage(page).locator("dd")).toHaveCount(0)
  const mobile: URL[] = []
  await page.setViewportSize({ width: 700, height: 900 })
  await page.route("**/api/session?**", (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get("limit") === "100") mobile.push(url)
    return route.fallback()
  })
  await page.reload()
  await expect(page.locator('[data-component="orchestra-home"]')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(usage(page)).toHaveCount(0)
  expect(mobile).toHaveLength(0)
})

test("no selected profile shows no usage", async ({ page }) => {
  const requests: URL[] = []
  await setup(page, { requests, noSelection: true })
  await page.goto("/")
  await expect(page.locator('[data-component="orchestra-home"]')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(usage(page)).toHaveCount(0)
  expect(requests).toHaveLength(0)
})

test("opening a chapter right after choosing a profile replaces Home while usage loads", async ({ page }) => {
  const gate = Promise.withResolvers<void>()
  const requests: URL[] = []
  const navigation = Promise.withResolvers<void>()
  const chapter = Promise.withResolvers<void>()
  const held = { usage: false }
  await setup(page, { noSelection: true, gate: gate.promise, requests })
  // The usage view and the chapter page are separate modules. Hold both so the usage view
  // first mounts while the route transition to the chapter is still pending.
  await page.route(
    (url) => url.pathname.endsWith("/orchestra/chapters/kpis.tsx") || /^\/assets\/kpis-[\w-]+\.js$/.test(url.pathname),
    async (route) => {
      held.usage = true
      await navigation.promise
      await route.fallback()
    },
  )
  await page.route(
    (url) => url.pathname.endsWith("/orchestra/chapters/env.tsx") || /^\/assets\/env-[\w-]+\.js$/.test(url.pathname),
    async (route) => {
      navigation.resolve()
      await chapter.promise
      await route.fallback()
    },
  )
  await page.goto("/")
  await expect(page.locator('[data-component="orchestra-home"]')).toBeVisible()
  await page.getByRole("button", { name: "Choose repository profile" }).click()
  await page.getByRole("menuitemradio", { name: "Recorded repo A" }).click()
  // The profile applies after the menu closes; Home must own it before the chapter opens.
  await expect(page.locator('[data-slot="orchestra-profile"]')).toContainText("Recorded repo A")
  await page.locator('[data-component="orchestra-sidebar"]').getByRole("button", { name: ".env", exact: true }).click()
  await navigation.promise
  // The first usage page answered and the second is held: usage is still loading.
  await expect.poll(() => requests.length).toBe(2)
  expect(held.usage).toBe(true)
  chapter.resolve()
  await expect(page).toHaveURL(/\/orchestra\/env$/)
  await expect(page.locator('[data-component="orchestra-chapter"][data-chapter="env"]')).toBeVisible()
  await expect(page.locator('[data-component="orchestra-home"]')).toHaveCount(0)
  await expect(usage(page)).toHaveCount(0)
  gate.resolve()
})

function session(value: number) {
  return {
    id: `ses_recorded_${String(value).padStart(3, "0")}`,
    directory,
    projectID: project.id,
    title: `Recorded session ${value}`,
    cost: value === 103 ? 2.75 : 0,
    tokens: { input: value, output: value * 2, reasoning: value * 3, cache: { read: value * 4, write: value * 5 } },
    ...(value % 2 === 0 ? { parentID: "ses_parent" } : {}),
    time: { created: value, updated: value, ...(value % 3 === 0 ? { archived: value } : {}) },
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
    secondServer?: boolean
    secondDirectory?: boolean
    failure?: { enabled: boolean }
    empty?: boolean
    noSelection?: boolean
  } = {},
) {
  await mockOpenCodeServer(page, {
    protocol: "v2",
    directory,
    project,
    sessions: input.empty
      ? []
      : records
          .filter((item) => !item.parentID && !item.time.archived)
          .slice(-24)
          .toReversed(),
    provider: { all: [], connected: [], default: {} },
    pageMessages: () => ({ items: [] }),
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
    if (url.pathname === "/api/session" && url.searchParams.get("limit") === "100") {
      input.requests?.push(url)
      if (url.origin === serverB || url.searchParams.get("directory") === `${directory}-other`)
        return json(route, {
          data: [currentSession({ ...session(777), directory: url.searchParams.get("directory")! })],
          cursor: {},
        })
      if (input.empty) return json(route, { data: [], cursor: {} })
      if (url.searchParams.get("cursor")) {
        await input.gate
        if (input.failure?.enabled) return json(route, {}, 500)
        await json(route, { data: records.slice(100).map((item) => currentSession(item)), cursor: {} })
        input.finished?.()
        return
      }
      return json(route, {
        data: records.slice(0, 100).map((item) => currentSession(item)),
        cursor: { next: "next-page" },
      })
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
