import { expect, test, type Page, type Response, type Route } from "@playwright/test"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const directory = "/work/shared repository"
const authorizationUrl = "https://auth.example.test/authorize?state=state-secured"
type Status = { status: string; error?: string }
type Recorded = { method: string; url: string; body?: unknown }

function fixture() {
  return {
    requests: [] as Recorded[],
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
    // Events each server's /api/event stream delivers next.
    events: {} as Record<string, unknown[]>,
    configError: false,
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
  await expect(row(page, "online").getByRole("switch", { name: "Connect online (until restart)" })).toBeChecked()
  await expect(row(page, "online").locator(".mx-badge")).toHaveText(["Connected"])
  await expect(row(page, "broken").locator(".mx-badge")).toHaveText(["Error"])
  await expect(page.locator("[data-mx-page]")).toContainText(
    "Switches apply until the server restarts. Saving or removing a server restarts this profile's MCP servers.",
  )
  await expect(row(page, "shared").locator(".mx-badge")).toHaveText(["Disconnected (until restart)"])
  await expect(row(page, "shared")).toContainText('set "enabled": false in its entry in orchestra.json')
  // The switch shows a live connection: a failed server is off and switching it on retries.
  await expect(row(page, "broken").getByRole("switch", { name: "Connect broken (until restart)" })).not.toBeChecked()
  // A retry cannot register an OAuth client, so the card points to the config instead of offering a switch.
  await expect(row(page, "registration").getByRole("switch")).toHaveCount(0)
  await expect(row(page, "registration")).toContainText("Add oauth.clientId to its entry in orchestra.json")
  await expect(row(page, "shared").getByRole("switch", { name: "Connect shared (until restart)" })).not.toBeChecked()
  await expect(row(page, "waiting").getByRole("switch")).toBeDisabled()
  await expect(row(page, "secured").getByRole("button", { name: "Authenticate" })).toBeVisible()
  const lists = state.requests.filter((r) => new URL(r.url).pathname === "/api/mcp")
  expect(lists.length).toBeGreaterThan(0)
  expect(lists.every((r) => new URL(r.url).origin === serverA && located(r))).toBe(true)
  await expect(page.getByRole("searchbox", { name: "Search MCP" })).toHaveAttribute("placeholder", "Search mcp")
  await page.getByRole("searchbox", { name: "Search MCP" }).fill("SHARED")
  await expect(page.locator("[data-mcp-name]")).toHaveCount(1)
  const connection = row(page, "shared").getByRole("switch", { name: "Connect shared (until restart)" })
  await expect(connection).toBeEnabled()
  await connection.focus()
  await page.keyboard.press("Space")
  await expect.poll(() => actions(state).length).toBe(1)
  await expect(connection).toBeDisabled()
  await page.keyboard.press("Space")
  expect(actions(state).map(target)).toEqual([`POST ${serverA}/api/mcp/shared/connect`])
  expect(actions(state).every(located)).toBe(true)
  const refresh = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).origin === serverA &&
      new URL(response.url()).pathname === "/api/mcp" &&
      new URL(response.url()).searchParams.get("location[directory]") === directory,
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

test("disconnect, retry and OAuth go through the shared toggle; failures stay on their card", async ({ page }) => {
  const state = fixture()
  await setup(page, state)
  // The authorization page stands in for the provider: finishing it completes the server's OAuth callback.
  await page.context().route("https://auth.example.test/**", (route) => {
    state.inventory[serverA].secured = { status: "connected" }
    return route.fulfill({ contentType: "text/html", body: "<p>Signed in</p>" })
  })
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
  const signIn = page.context().waitForEvent("page")
  await row(page, "secured").getByRole("button", { name: "Authenticate" }).click()
  const opened = await signIn
  await expect.poll(() => opened.url()).toBe(authorizationUrl)
  await expect(row(page, "secured").getByRole("switch")).toBeChecked()
  await expect(row(page, "secured").getByRole("alert")).toHaveCount(0)
  await opened.close()
  await toggleConnection(page, "broken")
  await expect(row(page, "broken")).toHaveAttribute("data-status", "connected")
  await expect(row(page, "broken").getByRole("switch")).toBeChecked()
  expect(actions(state).every((r) => new URL(r.url).origin === serverA && located(r))).toBe(true)
  expect(actions(state).map((r) => new URL(r.url).pathname)).toEqual([
    "/api/mcp/online/disconnect",
    "/api/mcp/secured/auth",
    "/api/mcp/shared/connect",
    "/api/mcp/secured/auth",
    "/api/mcp/broken/connect",
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
  await expect(page.getByRole("status")).toHaveText(
    "No MCP servers configured.Add a server to make its tools available to this profile.",
  )
  await expect(page.getByRole("button", { name: "Add MCP server" })).toBeVisible()
  // A fresh observer receives a real query failure, then Retry reloads the owning profile.
  state.beforeList = undefined
  state.loadError = true
  await page.reload()
  await expect(page.locator(".orchestra-mcp-message")).toContainText("Could not load MCP servers.")
  await expect(page.locator(".orchestra-mcp-message")).toContainText("Location directory is not readable")
  state.loadError = false
  state.inventory[serverA] = { recovered: { status: "disabled" } }
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(row(page, "recovered")).toBeVisible()
})

test("V2 lists, toggles, saves and removes through the current API", async ({ page }) => {
  const state = fixture()
  await setup(page, state)
  await openChapter(page)
  await expect(page.locator("[data-mcp-name]")).toHaveCount(6)
  await expect(row(page, "online").locator(".mx-badge")).toHaveText(["Connected"])
  await toggleConnection(page, "shared")
  await expect(row(page, "shared")).toHaveAttribute("data-status", "connected")
  await row(page, "online").getByRole("button", { name: "Tools", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "online tools" })).toContainText(
    "This server does not report MCP tools.",
  )
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(row(page, "online").getByRole("button", { name: "Tools", exact: true })).toBeFocused()
  await page.getByRole("button", { name: "Add MCP server" }).click()
  const dialog = page.getByRole("dialog", { name: "Add MCP server" })
  await dialog.getByLabel("Name").fill("docs")
  await dialog.getByLabel("Transport").selectOption("http")
  await dialog.getByLabel("Command or server URL").fill("https://mcp.example.test/docs")
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(row(page, "docs")).toBeVisible()
  await expect(page.getByRole("button", { name: "Add MCP server" })).toBeFocused()
  // V2 cannot report an existing server's config, so Configure never guesses and overwrites it.
  await row(page, "docs").getByRole("button", { name: "Configure" }).click()
  const configure = page.getByRole("dialog", { name: "Configure docs" })
  await expect(configure).toContainText("Current configuration unavailable from this server.")
  await expect(configure.getByRole("button", { name: "Save" })).toHaveCount(0)
  await expect(configure.getByLabel("Command or server URL")).toBeDisabled()
  await expect(configure.getByLabel("Transport")).toBeDisabled()
  await configure.getByRole("button", { name: "Remove server" }).click()
  await page.getByRole("dialog", { name: "Remove this item?" }).getByRole("button", { name: "Confirm" }).click()
  await expect(row(page, "docs")).toHaveCount(0)
  const writes = state.requests.filter(
    (r) => r.method !== "GET" && r.method !== "OPTIONS" && new URL(r.url).pathname.startsWith("/api/mcp"),
  )
  expect(writes.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
    "POST /api/mcp/shared/connect",
    "PUT /api/mcp/docs",
    "DELETE /api/mcp/docs",
  ])
  expect(writes.every(located)).toBe(true)
  expect(writes[1].body).toEqual({ config: { type: "remote", url: "https://mcp.example.test/docs" } })
  expect(state.requests.filter((r) => /^\/mcp(\/|$)/.test(new URL(r.url).pathname))).toEqual([])
})

test("add validates the name and endpoint and writes the profile config", async ({ page }) => {
  const state = fixture()
  await setup(page, state)
  await openChapter(page)
  await page.getByRole("button", { name: "Add MCP server" }).click()
  const dialog = page.getByRole("dialog", { name: "Add MCP server" })
  await expect(dialog).toContainText(
    "Connect tools to this profile. Saving updates its project config and restarts its MCP servers.",
  )
  await dialog.getByLabel("Name").fill("shared")
  await dialog.getByLabel("Command or server URL").fill("bunx server")
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("An MCP server with this name already exists.")
  for (const name of ["a/b", "..", "__proto__"]) {
    await dialog.getByLabel("Name").fill(name)
    await dialog.getByRole("button", { name: "Save" }).click()
    await expect(dialog.getByRole("alert")).toHaveText("Enter a name. Names cannot be . or .. or contain / or \\.")
  }
  await dialog.getByLabel("Name").fill("docs")
  await dialog.getByLabel("Transport").selectOption("http")
  await dialog.getByLabel("Command or server URL").fill("not a url")
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Enter a valid server URL.")
  await dialog.getByLabel("Command or server URL").fill("ftp://mcp.example.test/docs")
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Enter a valid server URL.")
  expect(state.requests.filter((r) => r.method === "PUT")).toEqual([])
  state.configError = true
  await dialog.getByLabel("Command or server URL").fill("https://mcp.example.test/docs")
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Request failed: Permission denied writing /work/orchestra.json")
  state.configError = false
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Add MCP server" })).toBeFocused()
  await expect(row(page, "docs").locator(".mx-badge")).toHaveText(["Disconnected (until restart)"])
  const puts = state.requests.filter((r) => r.method === "PUT")
  expect(puts.map(target)).toEqual([`PUT ${serverA}/api/mcp/docs`, `PUT ${serverA}/api/mcp/docs`])
  expect(puts.every(located)).toBe(true)
  expect(puts.map((r) => r.body)).toEqual([
    { config: { type: "remote", url: "https://mcp.example.test/docs" } },
    { config: { type: "remote", url: "https://mcp.example.test/docs" } },
  ])
})

test("same directory and MCP name stay isolated across profiles, including late responses", async ({ page }) => {
  const state = fixture()
  await setup(page, state)
  await openChapter(page)
  await expect(row(page, "shared").getByRole("switch")).not.toBeChecked()
  const gate = Promise.withResolvers<void>()
  state.beforeAction = () => gate.promise
  await toggleConnection(page, "shared")
  await expect.poll(() => actions(state).length).toBe(1)
  await chooseProfile(page, "Profile B")
  await expect(row(page, "only-b")).toBeVisible()
  await expect(row(page, "shared").getByRole("switch")).toBeChecked()
  await expect(row(page, "broken")).toHaveCount(0)
  state.actionError = true
  const actionResponse = page.waitForResponse(
    (r) => new URL(r.url()).origin === serverA && new URL(r.url()).pathname === "/api/mcp/shared/connect",
  )
  gate.resolve()
  await (await actionResponse).finished()
  expect(actions(state)).toHaveLength(1)
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
  expect(target(actions(state).at(-1)!)).toBe(`POST ${serverB}/api/mcp/shared/disconnect`)
  expect(actions(state).every(located)).toBe(true)
  await expect(row(page, "shared").getByRole("alert")).toHaveCount(0)
  await chooseProfile(page, "Profile A")
  await expect(row(page, "shared").getByRole("switch")).not.toBeChecked()
  await expect(row(page, "only-b")).toHaveCount(0)

  const listGate = Promise.withResolvers<void>()
  state.beforeList = (url) => (url.origin === serverA ? listGate.promise : Promise.resolve())
  const lateLists: Promise<unknown>[] = []
  const completed = (response: Response) => {
    if (new URL(response.url()).origin === serverA && new URL(response.url()).pathname === "/api/mcp")
      lateLists.push(response.finished())
  }
  page.on("response", completed)
  const listsOfA = () =>
    state.requests.filter((r) => new URL(r.url).origin === serverA && new URL(r.url).pathname === "/api/mcp").length
  const previousLists = listsOfA()
  await page.reload()
  await expect(page.getByRole("status")).toHaveText("Loading MCP servers…")
  await chooseProfile(page, "Profile B")
  await expect(row(page, "only-b")).toBeVisible()
  await expect(row(page, "shared")).toHaveAttribute("data-status", "disabled")
  const pendingLists = listsOfA() - previousLists
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
  state.beforeList = undefined
  await toggleConnection(page, "shared")
  await expect(row(page, "shared")).toHaveAttribute("data-status", "connected")
  await expect(row(page, "shared").getByRole("switch")).toBeChecked()
  expect(target(actions(state).at(-1)!)).toBe(`POST ${serverB}/api/mcp/shared/connect`)
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
  state.events[serverA] = [statusChanged("shared")]
  await expect(row(page, "shared")).toHaveAttribute("data-status", "connected")
  await expect(row(page, "shared").getByRole("switch")).toBeChecked()
  expect(actions(state)).toHaveLength(0)
  await chooseProfile(page, "Profile B")
  await expect(row(page, "only-b")).toBeVisible()
  state.inventory[serverA].shared = { status: "failed", error: "Another profile changed" }
  const refresh = page.waitForResponse(
    (response) => new URL(response.url()).origin === serverA && new URL(response.url()).pathname === "/api/mcp",
  )
  state.events[serverA] = [statusChanged("shared")]
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

// Connection and sign-in requests: every POST the chapter sends to a server's MCP routes.
function actions(state: ReturnType<typeof fixture>) {
  return state.requests.filter((r) => r.method === "POST" && new URL(r.url).pathname.startsWith("/api/mcp/"))
}

function target(request: Recorded) {
  return `${request.method} ${new URL(request.url).origin}${new URL(request.url).pathname}`
}

function located(request: Recorded) {
  return new URL(request.url).searchParams.get("location[directory]") === directory
}

function statusChanged(server: string) {
  return { id: `evt_mcp_${server}_${Date.now()}`, type: "mcp.status.changed", location: { directory }, data: { server } }
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
      localStorage.setItem("settings.v3", JSON.stringify({ general: { shouldDisplayTabsToast: false } }))
      localStorage.setItem(
        "orchestra.global.dat:server",
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
      localStorage.setItem("orchestra-theme-id", "oc-2")
      localStorage.setItem("orchestra-color-scheme", "dark")
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
    },
    { serverA, serverB, directory },
  )
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (![serverA, serverB, "http://localhost:4096"].includes(url.origin)) return route.fallback()
    if (route.request().method() === "OPTIONS") return json(route, {})
    const body = route.request().postData()
    state.requests.push({
      method: route.request().method(),
      url: url.toString(),
      ...(body ? { body: JSON.parse(body) } : {}),
    })
    const project = {
      id: url.origin === serverA ? "project-a" : "project-b",
      name: url.origin === serverA ? "Profile A" : url.origin === serverB ? "Profile B" : "Local profile",
      worktree: directory,
      vcs: "git",
      time: { created: 1, updated: 1 },
      sandboxes: [],
    }
    const location = { directory, project: { id: project.id, directory } }
    const path = url.pathname
    // A live server holds the stream open, so a queued event arrives without waiting out a reconnect backoff.
    if (path === "/api/event") {
      const deadline = Date.now() + 10_000
      while (!state.events[url.origin]?.length && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50))
      const event = state.events[url.origin]?.shift()
      return route
        .fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: event ? `data: ${JSON.stringify(event)}\n\n` : ": ok\n\n",
        })
        .catch(() => undefined)
    }
    if (path === "/global/health") return json(route, {}, 404)
    if (path === "/api/health") return json(route, { pid: 1, healthy: true })
    if (path === "/project" || path === "/api/project") return json(route, [project])
    if (path === "/project/current") return json(route, project)
    if (path === "/api/location") return json(route, location)
    if (path === "/path" || path === "/api/path")
      return json(route, { state: directory, config: directory, worktree: directory, directory, home: "/work" })
    if (path === "/provider") return json(route, { all: [], connected: [], default: {} })
    if (path === "/api/session") return json(route, { data: [], cursor: {} })
    if (["/session", "/skill", "/command", "/lsp", "/formatter", "/permission", "/question"].includes(path))
      return json(route, [])
    if (path === "/api/mcp") {
      await state.beforeList?.(url)
      // A rejected Location query is the list route's declared failure (SchemaErrorMiddleware).
      if (state.loadError)
        return json(route, { _tag: "InvalidRequestError", message: "Location directory is not readable" }, 400)
      return json(route, {
        location,
        data: Object.entries(state.inventory[url.origin]).map(([name, status]) => ({ name, status })),
      })
    }
    if (path === "/api/mcp/resource") return json(route, { location, data: { resources: [], templates: [] } })
    const action = /^\/api\/mcp\/([^/]+)\/(connect|disconnect|auth)$/.exec(path)
    if (action && route.request().method() === "POST") {
      await state.beforeAction?.()
      const name = decodeURIComponent(action[1])
      if (state.actionError && action[2] === "auth")
        return json(route, { _tag: "InvalidRequestError", message: `MCP server ${name} does not support OAuth` }, 400)
      if (state.actionError)
        return json(route, { _tag: "McpServerNotFoundError", server: name, message: `MCP server not found: ${name}` }, 404)
      if (action[2] === "auth") return json(route, { authorizationUrl, oauthState: "state-secured" })
      state.inventory[url.origin][name] = { status: action[2] === "connect" ? "connected" : "disabled" }
      return route.fulfill({ status: 204, headers: cors })
    }
    const server = /^\/api\/mcp\/([^/]+)$/.exec(path)
    if (server) {
      const name = decodeURIComponent(server[1])
      if (route.request().method() === "PUT" && state.configError)
        return json(route, { _tag: "InvalidRequestError", message: "Permission denied writing /work/orchestra.json" }, 400)
      if (route.request().method() === "PUT") state.inventory[url.origin][name] = { status: "disabled" }
      if (route.request().method() === "DELETE") delete state.inventory[url.origin][name]
      return route.fulfill({ status: 204, headers: cors })
    }
    return json(route, {})
  })
  await page.goto("/")
  await expect(page.locator('[data-component="orchestra-sidebar"]')).toBeVisible()
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "*",
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) })
}
