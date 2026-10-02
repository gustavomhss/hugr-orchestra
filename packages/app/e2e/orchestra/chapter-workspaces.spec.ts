import { expect, test, type Page, type Route } from "@playwright/test"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const root = "/repos/orchestra"
const sandboxes = ["/sandboxes/one", "/sandboxes/two"]

const project = (name: string, sandboxes: string[]) => ({
  id: `project-${name}`,
  name,
  worktree: root,
  sandboxes,
  vcs: "git",
  time: { created: 1, updated: 1 },
})

test.use({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" })

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: lists only this repository and opens a sandbox draft without a prompt`, async ({ page }) => {
    const mock = await setup(page, scheme)
    await openChapter(page)
    const chapter = page.locator(".orchestra-workspaces")
    await expect(chapter.locator("[data-directory]")).toHaveCount(3)
    await expect(chapter.locator("code")).toHaveText([root, ...sandboxes])
    await expect(chapter.getByText("Repository root", { exact: true })).toHaveCount(1)
    await expect(chapter.getByText("Sandbox", { exact: true })).toHaveCount(2)
    await expect(chapter.locator(`input[value="${root}"]`)).toBeChecked()
    await expect(chapter.locator(`[data-directory="${root}"]`)).toContainText("Selected for new Chat")
    await page.screenshot({ path: test.info().outputPath(`${scheme}.png`), animations: "disabled" })
    await chapter.locator(`input[value="${root}"]`).focus()
    await page.keyboard.press("ArrowDown")
    await expect(chapter.locator(`input[value="${sandboxes[0]}"]`)).toBeChecked()
    await expect(chapter.locator(`[data-directory="${sandboxes[0]}"]`)).toContainText("Selected for new Chat")
    await expect(chapter.locator(`[data-directory="${root}"]`)).not.toContainText("Selected for new Chat")
    await chapter.getByRole("button", { name: "Open Chat draft", exact: true }).click()
    await expect(page).toHaveURL(/\/new-session\?draftId=[^&]+$/)
    await expect
      .poll(() => drafts(page))
      .toEqual([expect.objectContaining({ type: "draft", server: serverA, directory: sandboxes[0] })])
    await expect
      .poll(() => mock.requests.some((request) => requestDirectory(new URL(request.url)) === sandboxes[0]))
      .toBe(true)
    expect(mock.requests.filter((request) => request.method !== "GET" && request.method !== "OPTIONS")).toEqual([])
    await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toHaveText("")
  })
}

test("same paths on a second server remain isolated while a first-server response is pending", async ({ page }) => {
  const mock = await setup(page)
  await openChapter(page)
  const chapter = page.locator(".orchestra-workspaces")
  await expect(chapter.locator("[data-directory]")).toHaveCount(3)
  mock.state.delay = true
  await chapter.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(chapter.getByRole("status")).toHaveText("Loading workspaces…")
  await expect(chapter.getByRole("button", { name: "Open Chat draft", exact: true })).toBeDisabled()
  await expect.poll(() => mock.pending.length).toBe(1)
  await page.getByRole("button", { name: "Choose repository profile", exact: true }).click()
  await page.getByRole("menuitemradio").filter({ hasText: "Server B repository" }).click()
  await expect(chapter.locator("[data-directory]")).toHaveCount(2)
  await expect(chapter.locator("code")).toHaveText([root, sandboxes[1]])
  await mock.release()
  // Await the actual delayed response and an animation frame, not a guessed timeout.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await expect(chapter.locator("code")).toHaveText([root, sandboxes[1]])
  await chapter.locator(`[data-directory="${sandboxes[1]}"] label`).click()
  await chapter.getByRole("button", { name: "Open Chat draft", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=[^&]+$/)
  await expect.poll(() => drafts(page)).toEqual([expect.objectContaining({ server: serverB, directory: sandboxes[1] })])
  await expect
    .poll(() =>
      mock.requests.some((request) => {
        const url = new URL(request.url)
        return url.origin === serverB && requestDirectory(url) === sandboxes[1]
      }),
    )
    .toBe(true)
  expect(mock.requests.filter((request) => request.method !== "GET" && request.method !== "OPTIONS")).toEqual([])
})

for (const protocol of ["v1", "v2"] as const) {
  test(`${protocol}: refresh reports error, unavailable and empty states and recovers`, async ({ page }) => {
    const mock = await setup(page, "dark", protocol)
    await openChapter(page)
    const chapter = page.locator(".orchestra-workspaces")
    await expect(chapter.locator("[data-directory]")).toHaveCount(3)
    mock.state.status = 500
    await chapter.getByRole("button", { name: "Refresh", exact: true }).click()
    await expect(chapter.getByRole("alert")).toHaveText("Could not load workspaces. Try refreshing.")
    await expect(chapter.getByRole("button", { name: "Open Chat draft", exact: true })).toBeDisabled()
    mock.state.status = 404
    await chapter.getByRole("button", { name: "Refresh", exact: true }).click()
    await expect(chapter.getByRole("status")).toHaveText("Workspace information is unavailable on this server.")
    mock.state.status = 200
    mock.state.empty = true
    await chapter.getByRole("button", { name: "Refresh", exact: true }).click()
    await expect(chapter.getByRole("status")).toHaveText("No repository workspaces were found for this profile.")
    await expect(chapter.locator("[data-directory]")).toHaveCount(0)
    mock.state.empty = false
    await chapter.getByRole("button", { name: "Refresh", exact: true }).click()
    await expect(chapter.locator("code")).toHaveText([root, ...sandboxes])
  })
}

async function openChapter(page: Page) {
  await page.goto("/")
  await expect(page.locator("#orchestra-profile-name")).toHaveText("Server A repository")
  await page
    .locator('[data-component="orchestra-sidebar"]')
    .getByRole("button", { name: "Workspaces", exact: true })
    .click()
  await expect(page).toHaveURL(/\/orchestra\/workspaces$/)
}

async function drafts(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("opencode.window.browser.dat:tabs") ?? "[]"))
}

async function setup(page: Page, scheme: "dark" | "light" = "dark", protocol: "v1" | "v2" = "v2") {
  const state = { status: 200, empty: false, delay: false }
  const requests: { url: string; method: string }[] = []
  const pending: (() => Promise<void>)[] = []
  await page.addInitScript(
    ({ serverA, serverB, root, scheme }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [serverB],
          projects: { local: [{ worktree: root, expanded: true }], [serverB]: [{ worktree: root, expanded: true }] },
          lastProject: { local: root, [serverB]: root },
        }),
      )
      localStorage.setItem(
        "opencode.global.dat:layout",
        JSON.stringify({ home: { selection: { server: serverA, directory: root } } }),
      )
    },
    { serverA, serverB, root, scheme },
  )
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== serverA && url.origin !== serverB) return route.fallback()
    requests.push({ url: url.toString(), method: route.request().method() })
    const current = project(
      url.origin === serverA ? "Server A repository" : "Server B repository",
      url.origin === serverA ? sandboxes : [sandboxes[1]],
    )
    if (["/global/event", "/event", "/api/event"].includes(url.pathname))
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ok\n\n" })
    if (url.pathname === "/global/health")
      return json(route, { healthy: protocol === "v1" }, protocol === "v1" ? 200 : 404)
    if (url.pathname === "/api/health") return json(route, { healthy: true, version: "2.0.0", pid: 1 })
    if (url.pathname === "/api/project" || url.pathname === "/project") {
      const respond = () =>
        json(
          route,
          state.empty ? [] : [current, { ...project("Other repository", ["/other/sandbox"]), worktree: "/other/repo" }],
          url.origin === serverA ? state.status : 200,
        )
      if (state.delay && url.origin === serverA) {
        return new Promise<void>((resolve) =>
          pending.push(async () => {
            await respond()
            resolve()
          }),
        )
      }
      return respond()
    }
    if (url.pathname === "/project/current") return json(route, current)
    if (url.pathname === "/api/project/current") return json(route, { id: current.id, directory: root })
    const directory = requestDirectory(url) ?? root
    if (url.pathname === "/api/path" || url.pathname === "/path")
      return json(route, { state: root, config: root, worktree: root, directory, home: "/home/test" })
    if (url.pathname === "/provider")
      return json(route, { all: [], connected: [], default: { providerID: "", modelID: "" } })
    if (url.pathname === "/agent") return json(route, [{ name: "build", mode: "primary" }])
    if (url.pathname === "/api/agent")
      return json(route, {
        location: { directory },
        data: [
          {
            id: "build",
            name: "Build",
            mode: "primary",
            hidden: false,
            request: { settings: {}, headers: {}, body: {} },
            permissions: [],
          },
        ],
      })
    if (url.pathname === "/api/model/default") return json(route, { location: { directory }, data: null })
    if (url.pathname === "/api/session") return json(route, { data: [], cursor: {} })
    if (url.pathname === "/api/session/active") return json(route, { data: {} })
    if (
      ["/session", "/skill", "/command", "/lsp", "/formatter", "/permission", "/question", "/vcs/diff"].includes(
        url.pathname,
      )
    )
      return json(route, [])
    if (url.pathname.startsWith("/api/")) return json(route, { location: { directory }, data: [] })
    return json(route, {})
  })
  return {
    state,
    requests,
    pending,
    release: async () => {
      const response = page.waitForResponse((response) => response.url() === `${serverA}/api/project`)
      state.delay = false
      await Promise.all(pending.splice(0).map((respond) => respond()))
      await (await response).finished()
    },
  }
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  })
}

function requestDirectory(url: URL) {
  return url.searchParams.get("location[directory]") ?? url.searchParams.get("directory")
}
