import { expect, test, type Page, type Route } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"
import { currentSession, mockOrchestraServer } from "../utils/mock-server"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const sessionA = session("ses_server_a", "C:/server-a", "Server A session")
const sessionB = session("ses_server_b", "/home/server-b", "Server B session")
const reviewServerB = "http://localhost:4096"

test("review summaries stay server scoped when projects share a directory", async ({ page }) => {
  const pending = Promise.withResolvers<void>()
  const requested: string[] = []
  await mockReviewServers(page, async (origin) => {
    if (origin === reviewServerB) {
      requested.push(origin)
      await pending.promise
    }
    return { status: 200, data: [reviewDiff(origin === serverA ? "server-a.ts" : "server-b.ts")] }
  })
  await installReviewTabs(page)
  await page.goto(`/server/${base64Encode(serverA)}/session/${sessionA.id}`)
  const panel = page.locator("#review-panel")
  await expect(panel.getByRole("button", { name: "server-a.ts", exact: true })).toBeVisible()
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page
    .locator('[data-component="orchestra-profile-picker"]')
    .getByRole("group", { name: "Review B", exact: true })
    .getByRole("menuitemradio", { name: "repo", exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`/session/${sessionB.id}$`))
  await expect.poll(() => requested.includes(reviewServerB)).toBe(true)
  await expect(panel.getByText("server-a.ts", { exact: true })).toHaveCount(0)
  pending.resolve()
  await expect(panel.getByRole("button", { name: "server-b.ts", exact: true })).toBeVisible()
})

test("a failed review summary offers retry instead of a clean-worktree claim", async ({ page }) => {
  let failed = true
  await mockReviewServers(page, async () => ({
    status: failed ? 500 : 200,
    data: failed ? [] : [reviewDiff("recovered.ts")],
  }))
  await installReviewTabs(page)
  await page.goto(`/server/${base64Encode(serverA)}/session/${sessionA.id}`)
  const panel = page.locator("#review-panel")
  const error = panel.getByRole("alert")
  await expect(error).toContainText("Request failed")
  failed = false
  await error.getByRole("button").click()
  await expect(panel.getByRole("button", { name: "recovered.ts", exact: true })).toBeVisible()
  await expect(error).toHaveCount(0)
})

function reviewDiff(file: string) {
  return {
    file,
    before: "before\n",
    after: "after\n",
    patch: `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-before\n+after\n`,
    additions: 1,
    deletions: 1,
    status: "modified",
  }
}

test("detail failures keep the parent list and retry scoped/root loading locally", async ({ page }) => {
  const calls: string[] = []
  let failed = true
  await mockReviewServers(page, async (_, url) => {
    const directory = url.searchParams.get("location[directory]")
    const context = url.searchParams.get("context")
    const summary = { file: "src/detail.ts", additions: 1, deletions: 1, status: "modified" }
    if (directory === "/shared/repo" && !context)
      return { status: 200, data: [summary, { ...summary, file: "other.ts" }] }
    calls.push(`${directory}:${context}`)
    if (failed) return { status: 500, data: [] }
    return {
      status: 200,
      data: [
        {
          ...summary,
          patch:
            "diff --git a/src/detail.ts b/src/detail.ts\n--- a/src/detail.ts\n+++ b/src/detail.ts\n@@ -1 +1 @@\n-before\n+recovered_detail\n",
        },
      ],
    }
  })
  await installReviewTabs(page)
  await page.goto(`/server/${base64Encode(serverA)}/session/${sessionA.id}`, { waitUntil: "domcontentloaded" })
  const panel = page.locator("#review-panel")
  const error = panel.locator('[data-slot="review-detail-error"]')
  await expect(error).toBeVisible({ timeout: 30_000 })
  await expect(panel.getByRole("button", { name: "detail.ts", exact: true })).toBeVisible()
  await expect(panel.getByRole("button", { name: "other.ts", exact: true })).toBeVisible()
  expect(calls).toContain("/shared/repo/src:null")
  expect(calls).toContain("/shared/repo:3")
  failed = false
  await error.getByRole("button").click()
  await expect(error).toHaveCount(0)
  await expect(panel.locator('[data-slot="session-review-v2-file-name"]')).toHaveText("detail.ts")
})

test("V2 archive sends the supported request and disables unsupported servers without removing their tabs", async ({
  page,
}) => {
  const requests: Array<{ origin: string; path: string; body: unknown }> = []
  const release = Promise.withResolvers<void>()
  await mockReviewServers(page, async () => ({ status: 200, data: [] }))
  await page.route("**/api/session/*/archive", async (route) => {
    const url = new URL(route.request().url())
    expect(route.request().method()).toBe("POST")
    requests.push({ origin: url.origin, path: url.pathname, body: route.request().postDataJSON() })
    if (url.origin === serverA) {
      await release.promise
      return route.fulfill({ status: 204 })
    }
    // Older V2 deployments may omit this route; protocol version alone does not imply support.
    return json(route, { name: "NotFound", message: "Archive route not installed" }, 404)
  })
  await installReviewTabs(page)
  await page.goto(`/server/${base64Encode(serverA)}/session/${sessionA.id}`)
  await page.getByRole("button", { name: "More options", exact: true }).click()
  const archive = page.locator('[data-action="session-archive"]')
  await expect(archive).not.toHaveAttribute("aria-disabled", "true")
  await archive.click()
  await expect
    .poll(() => requests)
    .toEqual([{ origin: serverA, path: `/api/session/${sessionA.id}/archive`, body: { archived: true } }])
  // Move to the other server before the ACK; removal must keep its tab and active route.
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page
    .locator('[data-component="orchestra-profile-picker"]')
    .getByRole("group", { name: "Review B", exact: true })
    .getByRole("menuitemradio", { name: "repo", exact: true })
    .click()
  const href = `/server/${base64Encode(reviewServerB)}/session/${sessionB.id}`
  await expect(page).toHaveURL(new RegExp(`${href}$`))
  release.resolve()
  const tabs = () => page.evaluate(() => JSON.parse(localStorage.getItem("orchestra.window.browser.dat:tabs") ?? "[]"))
  await expect.poll(tabs).toEqual([{ type: "session", server: reviewServerB, sessionId: sessionB.id }])

  await page.getByRole("button", { name: "More options", exact: true }).click()
  await expect(archive).not.toHaveAttribute("aria-disabled", "true")
  const unsupported = page.waitForResponse(
    (response) => response.url() === `${reviewServerB}/api/session/${sessionB.id}/archive`,
  )
  await archive.click()
  expect((await unsupported).status()).toBe(404)
  await page.getByRole("button", { name: "More options", exact: true }).click()
  await expect(archive).toHaveAttribute("aria-disabled", "true")
  await expect(archive).toContainText(/unavailable/)
  await archive.press("Enter")
  await expect(archive).toHaveAttribute("aria-disabled", "true")
  await page.keyboard.press("Escape")
  await expect(archive).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`${href}$`))
  await expect(page.getByRole("heading", { name: sessionB.title, exact: true })).toBeVisible()
  expect(await tabs()).toEqual([{ type: "session", server: reviewServerB, sessionId: sessionB.id }])
  expect(requests).toEqual([
    { origin: serverA, path: `/api/session/${sessionA.id}/archive`, body: { archived: true } },
    { origin: reviewServerB, path: `/api/session/${sessionB.id}/archive`, body: { archived: true } },
  ])
})

async function mockReviewServers(
  page: Page,
  diff: (origin: string, url: URL) => Promise<{ status: number; data: unknown[] }>,
) {
  await mockOrchestraServer(page, {
    directory: "/shared/repo",
    project: { id: "review", worktree: "/shared/repo", vcs: "git", time: { created: 1, updated: 1 }, sandboxes: [] },
    sessions: [sessionA, sessionB].map((session) => ({ ...session, directory: "/shared/repo", projectID: "review" })),
    provider: { all: [], connected: [], default: {} },
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/api/vcs/diff*", async (route) => {
    const url = new URL(route.request().url())
    const response = await diff(url.origin, url)
    if (response.status !== 200) return json(route, { name: "Error", message: "diff unavailable" }, response.status)
    return json(route, { location: { directory: "/shared/repo" }, data: response.data })
  })
}

async function installReviewTabs(page: Page, ids = [sessionA.id, sessionB.id]) {
  await page.addInitScript(
    ({ serverA, serverB, sessionA, sessionB }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: {} }))
      localStorage.setItem(
        "orchestra.global.dat:server",
        JSON.stringify({
          list: [{ type: "http", http: { url: serverB }, displayName: "Review B" }],
          projects: {
            [serverA]: [{ worktree: "/shared/repo", expanded: true }],
            [serverB]: [{ worktree: "/shared/repo", expanded: true }],
          },
        }),
      )
      localStorage.setItem(
        "orchestra.global.dat:layout",
        JSON.stringify({ review: { diffStyle: "split", panelOpened: true } }),
      )
      localStorage.setItem(
        "orchestra.window.browser.dat:tabs",
        JSON.stringify([
          { type: "session", server: serverA, sessionId: sessionA },
          { type: "session", server: serverB, sessionId: sessionB },
        ]),
      )
    },
    { serverA, serverB: reviewServerB, sessionA: ids[0], sessionB: ids[1] },
  )
}

test.describe("legacy tab strip", () => {
  test.use({ viewport: { width: 760, height: 900 } })

  test("closing the active server's last tab opens the remaining server tab", async ({ page }) => {
    const requests: string[] = []
    await mockServers(page, requests)
    await page.addInitScript(
      ({ serverB, sessionA, sessionB }) => {
        localStorage.setItem("settings.v3", JSON.stringify({ general: {} }))
        localStorage.setItem("orchestra.global.dat:server", JSON.stringify({ list: [serverB] }))
        localStorage.setItem(
          "orchestra.window.browser.dat:tabs",
          JSON.stringify([
            { type: "session", server: "http://127.0.0.1:4096", sessionId: sessionA },
            { type: "session", server: serverB, sessionId: sessionB },
          ]),
        )
      },
      { serverB, sessionA: sessionA.id, sessionB: sessionB.id },
    )

    const hrefA = `/server/${base64Encode(serverA)}/session/${sessionA.id}`
    const hrefB = `/server/${base64Encode(serverB)}/session/${sessionB.id}`
    await page.goto(hrefA)
    await expect(page.getByText(sessionA.title).first()).toBeVisible()

    const tabA = page.locator(`[data-titlebar-tab-slot]:has(a[href="${hrefA}"])`)
    await tabA.locator('[data-slot="tab-close"] button').click()

    await expect(page).toHaveURL(new RegExp(`${hrefB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))
    await expect.poll(() => requests.some((url) => url.startsWith(`${serverB}/api/session/${sessionB.id}`))).toBe(true)
    await expect(page.getByText(sessionB.title).first()).toBeVisible()
    const sessionBRequests = requests.filter((url) => url.includes(`/session/${sessionB.id}`))
    expect(sessionBRequests.every((url) => url.startsWith(serverB))).toBe(true)
    expect(
      requests.some((request) => {
        const url = new URL(request)
        return url.origin === serverB && url.searchParams.get("directory") === sessionB.directory
      }),
    ).toBe(true)
  })
})

test("desktop closing the last profile tab goes Home and preserves the other server tab", async ({ page }) => {
  const requests: string[] = []
  await mockServers(page, requests)
  await page.addInitScript(
    ({ serverA, serverB, sessionA, sessionB, directoryA, directoryB }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: {} }))
      localStorage.setItem(
        "orchestra.global.dat:server",
        JSON.stringify({
          list: [serverB],
          projects: {
            [serverA]: [{ worktree: directoryA, expanded: true }],
            [serverB]: [{ worktree: directoryB, expanded: true }],
          },
        }),
      )
      localStorage.setItem(
        "orchestra.window.browser.dat:tabs",
        JSON.stringify([
          { type: "session", server: "http://127.0.0.1:4096", sessionId: sessionA },
          { type: "session", server: serverB, sessionId: sessionB },
        ]),
      )
    },
    {
      serverA,
      serverB,
      sessionA: sessionA.id,
      sessionB: sessionB.id,
      directoryA: sessionA.directory,
      directoryB: sessionB.directory,
    },
  )

  const hrefA = `/server/${base64Encode(serverA)}/session/${sessionA.id}`
  const hrefB = `/server/${base64Encode(serverB)}/session/${sessionB.id}`
  await page.goto(hrefA)
  await expect(page.getByText(sessionA.title).first()).toBeVisible()

  const tabA = page.locator(`[data-titlebar-tab-slot]:has(a[href="${hrefA}"])`)
  const navigations: string[] = []
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname)
  })
  await tabA.locator('[data-slot="tab-close"] button').click()

  // Settle on Home first, so a late jump to the other server's tab would be recorded.
  await expect(page.locator('[data-component="orchestra-home"]')).toBeVisible()
  await expect(page).toHaveURL(new URL("/", page.url()).toString())
  expect(navigations).not.toContain(hrefB)

  // Only traffic after the profile switch proves that session B loads from its own server.
  const mark = requests.length
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page
    .locator('[data-component="orchestra-profile-picker"]')
    .getByRole("menuitemradio", { name: "server-b", exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`${hrefB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))
  await expect
    .poll(() => requests.slice(mark).some((url) => url.startsWith(`${serverB}/api/session/${sessionB.id}`)))
    .toBe(true)
  await expect(page.getByText(sessionB.title).first()).toBeVisible()
  const sessionBRequests = requests.filter((url) => url.includes(`/session/${sessionB.id}`))
  expect(sessionBRequests.every((url) => url.startsWith(serverB))).toBe(true)
  expect(
    requests.slice(mark).some((request) => {
      const url = new URL(request)
      return url.origin === serverB && url.searchParams.get("location[directory]") === sessionB.directory
    }),
  ).toBe(true)
})

test("legacy session routes preserve an existing tab's server", async ({ page }) => {
  await mockServers(page, [])
  await page.addInitScript(
    ({ serverB, sessionB }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: {} }))
      localStorage.setItem("orchestra.global.dat:server", JSON.stringify({ list: [serverB] }))
      localStorage.setItem(
        "orchestra.window.browser.dat:tabs",
        JSON.stringify([{ type: "session", server: serverB, sessionId: sessionB }]),
      )
    },
    { serverB, sessionB: sessionB.id },
  )

  const hrefB = `/server/${base64Encode(serverB)}/session/${sessionB.id}`
  await page.goto(`/${base64Encode(sessionB.directory)}/session/${sessionB.id}`)
  await expect(page).toHaveURL(new RegExp(`${hrefB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`))
})

function session(id: string, directory: string, title: string) {
  return {
    id,
    slug: id,
    projectID: `project-${id}`,
    directory,
    title,
    version: "dev",
    time: { created: 1, updated: 1 },
  }
}

async function mockServers(page: Page, requests: string[]) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== serverA && url.origin !== serverB) return route.fallback()
    requests.push(url.toString())
    const current = url.origin === serverA ? sessionA : sessionB
    const directory = url.searchParams.get("directory")
    if (directory && directory !== current.directory) return json(route, { name: "InvalidDirectory" }, 500)
    if (url.pathname === "/global/event" || url.pathname === "/event" || url.pathname === "/api/event")
      return sse(route)
    if (url.pathname === "/api/health") return json(route, { pid: 1, healthy: true })
    if (url.pathname === "/api/session") return json(route, { data: [currentSession(current)], cursor: {} })
    if (url.pathname === "/api/session/active") return json(route, { data: {} })
    if (url.pathname === `/api/session/${current.id}`) return json(route, { data: currentSession(current) })
    if (url.pathname === `/api/session/${current.id}/message`) return json(route, { data: [], cursor: {} })
    if (url.pathname === `/session/${current.id}`) return json(route, current)
    if (/^\/session\/[^/]+$/.test(url.pathname)) return json(route, { name: "NotFoundError" }, 404)
    if (url.pathname === `/session/${current.id}/message`) return json(route, [])
    if (/^\/session\/[^/]+\/(children|todo|diff)$/.test(url.pathname)) return json(route, [])
    if (["/skill", "/command", "/lsp", "/formatter", "/permission", "/question", "/vcs/diff"].includes(url.pathname))
      return json(route, [])
    if (["/global/config", "/config", "/provider/auth", "/mcp"].includes(url.pathname)) return json(route, {})
    if (url.pathname === "/provider")
      return json(route, { all: [], connected: [], default: { providerID: "", modelID: "" } })
    if (url.pathname === "/agent") return json(route, [{ name: "build", mode: "primary" }])
    if (url.pathname === "/project" || url.pathname === "/project/current") {
      const project = {
        id: current.projectID,
        worktree: current.directory,
        vcs: "git",
        time: { created: 1, updated: 1 },
        sandboxes: [],
      }
      return json(route, url.pathname === "/project" ? [project] : project)
    }
    if (url.pathname === "/path")
      return json(route, {
        state: current.directory,
        config: current.directory,
        worktree: current.directory,
        directory: current.directory,
        home: current.directory,
      })
    if (url.pathname === "/api/path")
      return json(route, {
        state: current.directory,
        config: current.directory,
        worktree: current.directory,
        directory: current.directory,
        home: current.directory,
      })
    if (url.pathname === "/vcs") return json(route, { branch: "main", default_branch: "main" })
    if (url.pathname === "/api/vcs")
      return json(route, {
        location: { directory: current.directory },
        data: { branch: "main", defaultBranch: "main" },
      })
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

function sse(route: Route) {
  return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ok\n\n" })
}
