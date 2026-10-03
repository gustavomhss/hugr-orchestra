import { expect, test, type Page, type Response, type Route } from "@playwright/test"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const directory = "/work/shared repository"
type Status = { status: string; error?: string }

function fixture() {
  return {
    requests: [] as { method: string; url: string; directory: string | null }[],
    inventory: {
      [serverA]: {
        shared: { status: "disabled" },
        online: { status: "connected" },
        secured: { status: "needs_auth" },
        broken: { status: "failed", error: "Connection refused by upstream" },
        registration: { status: "needs_client_registration", error: "Register an OAuth client" },
        waiting: { status: "pending" },
      },
      [serverB]: { shared: { status: "connected" }, "only-b": { status: "disabled" } },
    } as Record<string, Record<string, Status>>,
    protocol: "v1" as "v1" | "v2",
    events: {} as Record<string, { directory: string; payload: { type: string; properties: Record<string, never> } }[]>,
    loadError: false,
    actionError: false,
    beforeList: undefined as ((url: URL) => Promise<void>) | undefined,
    beforeAction: undefined as (() => Promise<void>) | undefined,
  }
}

test.use({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" })

test("mixed statuses, search, connection target, refresh, keyboard, and themes", async ({ page }) => {
  const state = fixture()
  const gate = Promise.withResolvers<void>()
  state.beforeAction = () => gate.promise
  await setup(page, state)
  await openChapter(page)
  await expect(page.locator("[data-mcp-name]")).toHaveCount(6)
  await expect(row(page, "broken")).toContainText("Connection refused by upstream")
  await expect(row(page, "registration")).toContainText("Register an OAuth client")
  await expect(row(page, "online").getByRole("switch", { name: "Connected" })).toBeChecked()
  await expect(row(page, "waiting").getByRole("switch")).toBeDisabled()
  await expect(row(page, "secured").getByRole("button", { name: "Authenticate" })).toBeVisible()
  expect(
    state.requests
      .filter((r) => new URL(r.url).pathname === "/mcp")
      .every((r) => new URL(r.url).origin === serverA && new URL(r.url).searchParams.get("directory") === directory),
  ).toBe(true)
  await page.getByRole("searchbox", { name: "Search MCP servers" }).fill("SHARED")
  await expect(page.locator("[data-mcp-name]")).toHaveCount(1)
  const connection = row(page, "shared").getByRole("switch", { name: "Connected" })
  await expect(connection).toBeEnabled()
  await connection.focus()
  await page.keyboard.press("Space")
  await expect.poll(() => state.requests.filter((r) => r.method === "POST").length).toBe(1)
  await expect(connection).toBeDisabled()
  await page.keyboard.press("Space")
  expect(state.requests.filter((r) => r.method === "POST")).toEqual([
    { method: "POST", url: `${serverA}/mcp/shared/connect`, directory: encodeURIComponent(directory) },
  ])
  const refresh = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).origin === serverA &&
      new URL(response.url()).pathname === "/mcp" &&
      new URL(response.url()).searchParams.get("directory") === directory,
  )
  gate.resolve()
  await refresh
  await expect(row(page, "shared")).toHaveAttribute("data-status", "connected")
  await expect(row(page, "shared").getByRole("switch")).toBeChecked()
  await page.getByRole("searchbox").fill("no-such-server")
  await expect(page.getByRole("status")).toHaveText("No MCP servers match your search.")
  await page.getByRole("searchbox").fill("")
  await expect(page.locator("[data-mcp-name]")).toHaveCount(6)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: test.info().outputPath(`dark.png`), animations: "disabled" })
  await page.locator('[data-slot="orchestra-theme-toggle"]').click()
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light")
  await page.screenshot({ path: test.info().outputPath(`light.png`), animations: "disabled" })
  await page.evaluate(() => document.documentElement.setAttribute("dir", "rtl"))
  await page.screenshot({ path: test.info().outputPath(`rtl-light.png`), animations: "disabled" })
})

test("disconnect and OAuth use the dispatcher; failures stay visible until retry", async ({ page }) => {
  const state = fixture()
  await setup(page, state)
  await openChapter(page)
  await toggleConnection(page, "online")
  await expect(row(page, "online").getByRole("switch")).not.toBeChecked()
  state.actionError = true
  await row(page, "secured").getByRole("button", { name: "Authenticate" }).click()
  await expect(row(page, "secured").getByRole("alert")).toContainText("MCP server secured does not support OAuth")
  await toggleConnection(page, "shared")
  await expect(row(page, "shared").getByRole("alert")).toContainText("MCP server not found: shared")
  await expect(row(page, "secured").getByRole("alert")).toContainText("MCP server secured does not support OAuth")
  state.actionError = false
  await row(page, "secured").getByRole("button", { name: "Authenticate" }).click()
  await expect(row(page, "secured").getByRole("switch")).toBeChecked()
  await expect(row(page, "secured").getByRole("alert")).toHaveCount(0)
  expect(
    state.requests
      .filter((r) => r.method === "POST")
      .every((r) => new URL(r.url).origin === serverA && r.directory === encodeURIComponent(directory)),
  ).toBe(true)
  expect(state.requests.filter((r) => r.method === "POST").map((r) => new URL(r.url).pathname)).toEqual([
    "/mcp/online/disconnect",
    "/mcp/secured/auth/authenticate",
    "/mcp/shared/connect",
    "/mcp/secured/auth/authenticate",
  ])
})

test("loading, empty, inventory failure and retry", async ({ page }) => {
  const state = fixture()
  const gate = Promise.withResolvers<void>()
  state.beforeList = () => gate.promise
  state.inventory[serverA] = {}
  await setup(page, state)
  await openChapter(page, false)
  await expect(page.getByRole("status")).toHaveText("Loading MCP servers…")
  gate.resolve()
  await expect(page.getByRole("status")).toHaveText("No MCPs configured")
  // A fresh observer receives a real query failure, then Retry reloads the owning profile.
  state.beforeList = undefined
  state.loadError = true
  await page.reload()
  await expect(page.locator(".orchestra-mcp-message")).toContainText("Could not load MCP servers.")
  await expect(page.locator(".orchestra-mcp-message")).toContainText(
    "Unexpected server error. Check server logs for details.",
  )
  state.loadError = false
  state.inventory[serverA] = { recovered: { status: "disabled" } }
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(row(page, "recovered")).toBeVisible()
})

test("V2 is explicitly unavailable without MCP requests", async ({ page }) => {
  const state = fixture()
  state.protocol = "v2"
  await setup(page, state)
  await openChapter(page, false)
  await expect(page.getByRole("status")).toHaveText("MCP is unavailable with this server protocol.")
  expect(state.requests.filter((r) => new URL(r.url).pathname.includes("/mcp"))).toEqual([])
  await expect(page.locator("[data-mcp-name]")).toHaveCount(0)
})

test("same directory and MCP name stay isolated across profiles, including late responses", async ({ page }) => {
  const state = fixture()
  await setup(page, state)
  await openChapter(page)
  await expect(row(page, "shared").getByRole("switch")).not.toBeChecked()
  const gate = Promise.withResolvers<void>()
  state.beforeAction = () => gate.promise
  await toggleConnection(page, "shared")
  await expect.poll(() => state.requests.some((r) => r.method === "POST")).toBe(true)
  await chooseProfile(page, "Profile B")
  await expect(row(page, "only-b")).toBeVisible()
  await expect(row(page, "shared").getByRole("switch")).toBeChecked()
  await expect(row(page, "broken")).toHaveCount(0)
  state.actionError = true
  const actionResponse = page.waitForResponse((r) => r.url() === `${serverA}/mcp/shared/connect`)
  gate.resolve()
  await (await actionResponse).finished()
  expect(state.requests.filter((r) => r.method === "POST")).toHaveLength(1)
  // Settle through another B row without clearing a leaked same-name failure.
  state.actionError = false
  state.beforeAction = undefined
  await toggleConnection(page, "only-b")
  await expect(row(page, "only-b")).toHaveAttribute("data-status", "connected")
  await expect(row(page, "shared")).toHaveAttribute("data-status", "connected")
  await expect(row(page, "shared").getByRole("alert")).toHaveCount(0)
  await toggleConnection(page, "shared")
  await expect(row(page, "shared")).toHaveAttribute("data-status", "disabled")
  await expect(row(page, "shared").getByRole("switch")).not.toBeChecked()
  expect(state.requests.filter((r) => r.method === "POST").at(-1)).toEqual({
    method: "POST",
    url: `${serverB}/mcp/shared/disconnect`,
    directory: encodeURIComponent(directory),
  })
  await expect(row(page, "shared").getByRole("alert")).toHaveCount(0)
  await chooseProfile(page, "Profile A")
  await expect(row(page, "shared").getByRole("switch")).not.toBeChecked()
  await expect(row(page, "only-b")).toHaveCount(0)

  const listGate = Promise.withResolvers<void>()
  state.beforeList = (url) => (url.origin === serverA ? listGate.promise : Promise.resolve())
  const lateLists: Promise<unknown>[] = []
  const completed = (response: Response) => {
    if (new URL(response.url()).origin === serverA && new URL(response.url()).pathname === "/mcp")
      lateLists.push(response.finished())
  }
  page.on("response", completed)
  const previousLists = state.requests.filter(
    (r) => new URL(r.url).origin === serverA && new URL(r.url).pathname === "/mcp",
  ).length
  await page.reload()
  await expect(page.getByRole("status")).toHaveText("Loading MCP servers…")
  await chooseProfile(page, "Profile B")
  await expect(row(page, "only-b")).toBeVisible()
  await expect(row(page, "shared")).toHaveAttribute("data-status", "disabled")
  const pendingLists =
    state.requests.filter((r) => new URL(r.url).origin === serverA && new URL(r.url).pathname === "/mcp").length -
    previousLists
  expect(pendingLists).toBeGreaterThan(0)
  state.inventory[serverA] = { "late-a": { status: "failed", error: "Old profile result" } }
  listGate.resolve()
  await expect.poll(() => lateLists.length).toBe(pendingLists)
  await Promise.all(lateLists)
  page.off("response", completed)
  await expect(page.locator("[data-mcp-name]")).toHaveCount(2)
  await expect(row(page, "only-b")).toBeVisible()
  await expect(row(page, "late-a")).toHaveCount(0)
  await expect(row(page, "shared").getByRole("switch")).not.toBeChecked()
  state.actionError = false
  state.beforeAction = undefined
  state.beforeList = undefined
  await toggleConnection(page, "shared")
  await expect(row(page, "shared")).toHaveAttribute("data-status", "connected")
  await expect(row(page, "shared").getByRole("switch")).toBeChecked()
  expect(state.requests.filter((r) => r.method === "POST").at(-1)).toEqual({
    method: "POST",
    url: `${serverB}/mcp/shared/connect`,
    directory: encodeURIComponent(directory),
  })
  await expect(row(page, "late-a")).toHaveCount(0)
  await chooseProfile(page, "Profile A")
  await expect(row(page, "late-a")).toBeVisible()
  await expect(row(page, "only-b")).toHaveCount(0)
})

test("status events refresh the owning profile without connection requests", async ({ page }) => {
  const state = fixture()
  await setup(page, state)
  await openChapter(page)
  await expect(row(page, "shared").getByRole("switch")).not.toBeChecked()
  state.inventory[serverA].shared = { status: "connected" }
  state.events[serverA] = [{ directory, payload: { type: "mcp.status.changed", properties: {} } }]
  await expect(row(page, "shared")).toHaveAttribute("data-status", "connected")
  await expect(row(page, "shared").getByRole("switch")).toBeChecked()
  expect(state.requests.filter((request) => request.method === "POST")).toHaveLength(0)
  await chooseProfile(page, "Profile B")
  await expect(row(page, "only-b")).toBeVisible()
  state.inventory[serverA].shared = { status: "failed", error: "Another profile changed" }
  const refresh = page.waitForResponse(
    (response) => new URL(response.url()).origin === serverA && new URL(response.url()).pathname === "/mcp",
  )
  state.events[serverA] = [{ directory, payload: { type: "mcp.status.changed", properties: {} } }]
  await (await refresh).finished()
  await expect(row(page, "shared")).toHaveAttribute("data-status", "connected")
  await expect(row(page, "broken")).toHaveCount(0)
  await chooseProfile(page, "Profile A")
  await expect(row(page, "shared")).toHaveAttribute("data-status", "failed")
  await expect(row(page, "shared")).toContainText("Another profile changed")
})

function row(page: Page, name: string) {
  return page.locator(`[data-mcp-name="${name}"]`)
}

async function toggleConnection(page: Page, name: string) {
  const connection = row(page, name).getByRole("switch")
  await expect(connection).toBeEnabled()
  await connection.press("Space")
}

async function chooseProfile(page: Page, name: string) {
  await page.getByRole("button", { name: "Choose repository profile" }).click()
  await page.getByRole("menuitemradio", { name, exact: true }).click()
  await expect(page.locator('[data-slot="orchestra-profile"]')).toContainText(name)
}

async function openChapter(page: Page, wait = true) {
  await chooseProfile(page, "Profile A")
  await page.locator('[data-component="orchestra-sidebar"]').getByRole("button", { name: "MCP", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/mcp$/)
  if (wait) await expect(row(page, "shared")).toBeVisible()
}

async function setup(page: Page, state: ReturnType<typeof fixture>) {
  await page.addInitScript(
    ({ serverA, serverB, directory }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [serverA, serverB],
          projects: {
            local: [{ worktree: directory, expanded: true }],
            [serverA]: [{ worktree: directory, expanded: true }],
            [serverB]: [{ worktree: directory, expanded: true }],
          },
          lastProject: { local: directory, [serverA]: directory, [serverB]: directory },
        }),
      )
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", "dark")
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
    },
    { serverA, serverB, directory },
  )
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (![serverA, serverB, "http://localhost:4096"].includes(url.origin)) return route.fallback()
    if (route.request().method() === "OPTIONS") return json(route, {})
    state.requests.push({
      method: route.request().method(),
      url: url.toString(),
      directory: await route.request().headerValue("x-opencode-directory"),
    })
    const project = {
      id: url.origin === serverA ? "project-a" : "project-b",
      name: url.origin === serverA ? "Profile A" : url.origin === serverB ? "Profile B" : "Local profile",
      worktree: directory,
      vcs: "git",
      time: { created: 1, updated: 1 },
      sandboxes: [],
    }
    const path = url.pathname
    if (["/global/event", "/event", "/api/event"].includes(path)) {
      const event = state.events[url.origin]?.shift()
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: event ? `data: ${JSON.stringify(event)}\n\n` : ": ok\n\n",
      })
    }
    if (path === "/global/health")
      return json(route, state.protocol === "v1" ? { healthy: true } : {}, state.protocol === "v1" ? 200 : 404)
    if (path === "/api/health") return json(route, { pid: 1, healthy: true })
    if (path === "/project" || path === "/api/project") return json(route, [project])
    if (path === "/project/current") return json(route, project)
    if (path === "/api/project/current") return json(route, { id: project.id, directory })
    if (path === "/path" || path === "/api/path")
      return json(route, { state: directory, config: directory, worktree: directory, directory, home: "/work" })
    if (path === "/provider") return json(route, { all: [], connected: [], default: {} })
    if (path === "/api/session") return json(route, { data: [], cursor: {} })
    if (["/session", "/skill", "/command", "/lsp", "/formatter", "/permission", "/question"].includes(path))
      return json(route, [])
    if (path === "/mcp") {
      await state.beforeList?.(url)
      // Defect-only failures use the NamedError envelope from HttpApi's error middleware.
      if (state.loadError)
        return json(
          route,
          {
            name: "UnknownError",
            data: { message: "Unexpected server error. Check server logs for details.", ref: "err_test" },
          },
          500,
        )
      return json(route, state.inventory[url.origin])
    }
    const action = /^\/mcp\/([^/]+)\/(connect|disconnect|auth\/authenticate)$/.exec(path)
    if (action) {
      await state.beforeAction?.()
      if (state.actionError) {
        if (action[2] === "auth/authenticate")
          return json(route, { error: `MCP server ${action[1]} does not support OAuth` }, 400)
        return json(
          route,
          {
            _tag: "McpServerNotFoundError",
            name: action[1],
            message: `MCP server not found: ${action[1]}`,
          },
          404,
        )
      }
      const name = decodeURIComponent(action[1])
      state.inventory[url.origin][name] = {
        status: action[2] === "disconnect" ? "disabled" : "connected",
      }
      return json(route, action[2] === "auth/authenticate" ? state.inventory[url.origin][name] : true)
    }
    return json(route, {})
  })
  await page.goto("/")
  await expect(page.locator('[data-component="orchestra-sidebar"]')).toBeVisible()
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "*",
    },
    body: JSON.stringify(body),
  })
}
