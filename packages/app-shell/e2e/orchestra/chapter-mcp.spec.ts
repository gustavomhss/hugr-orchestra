import { expect, test, type Page, type Response, type Route } from "@playwright/test"
import { expandAdvanced } from "./compact-navigation.fixture"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const directory = "/work/shared repository"
type Status = { status: string; error?: string }
type Recorded = { method: string; url: string; directory: string | null; body?: unknown }

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
    // The server's resolved config (GET /api/mcp/config): variables are already substituted.
    config: {
      [serverA]: {
        online: { type: "remote", url: "https://mcp.example.test/docs?key=resolved-secret" },
        broken: { type: "local", command: ["bunx", "broken server", "--token", "resolved-secret"] },
      },
      [serverB]: {},
    } as Record<string, Record<string, unknown>>,
    // The profile files' own entries (GET /api/mcp/entries): online is defined outside the profile.
    entries: {
      [serverA]: { broken: { type: "local", command: ["bunx", "broken server", "--token", "{env:TOKEN}"] } },
      [serverB]: {},
    } as Record<string, Record<string, unknown>>,
    tools: { [serverA]: { online: ["search_docs", "read_page"] }, [serverB]: {} } as Record<
      string,
      Record<string, string[]>
    >,
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
  await expect(row(page, "online").locator("p").first()).toHaveText("https://mcp.example.test/docs?key=•••")
  await expect(row(page, "online").locator(".mx-badge")).toHaveText(["Connected", "http", "2 tools"])
  await expect(row(page, "broken").locator(".mx-badge")).toHaveText(["Error", "stdio"])
  await expect(row(page, "broken").locator("p").first()).toHaveText(`bunx 'broken server' --token •••`)
  await expect(page.locator("[data-mx-page]")).not.toContainText("resolved-secret")
  await expect(page.locator("[data-mx-page]")).toContainText(
    "Switches apply until the server restarts. Saving or removing a server restarts this project's MCP servers.",
  )
  await expect(row(page, "shared").locator(".mx-badge")).toHaveText(["Disconnected (until restart)"])
  await expect(row(page, "shared")).toContainText('set "enabled": false in its entry in orchestra.json')
  // A failed server offers Try again in place of the switch.
  await expect(row(page, "broken").getByRole("button", { name: "Try again" })).toBeVisible()
  await expect(row(page, "broken").getByRole("switch")).toHaveCount(0)
  // A retry cannot register an OAuth client, so the card points to the config instead of offering a switch.
  await expect(row(page, "registration").getByRole("switch")).toHaveCount(0)
  await expect(row(page, "registration")).toContainText("Add oauth.clientId to its entry in orchestra.json")
  await expect(row(page, "shared").getByRole("switch", { name: "Connect shared (until restart)" })).not.toBeChecked()
  await expect(row(page, "waiting").getByRole("switch")).toBeDisabled()
  await expect(row(page, "secured").getByRole("button", { name: "Authenticate" })).toBeVisible()
  expect(
    state.requests
      .filter((r) => new URL(r.url).pathname === "/api/mcp")
      .every((r) => new URL(r.url).origin === serverA && r.directory === directory),
  ).toBe(true)
  await expect(page.getByRole("searchbox", { name: "Search MCP" })).toHaveAttribute("placeholder", "Search MCP")
  await page.getByRole("searchbox", { name: "Search MCP" }).fill("SHARED")
  await expect(page.locator("[data-mcp-name]")).toHaveCount(1)
  const connection = row(page, "shared").getByRole("switch", { name: "Connect shared (until restart)" })
  await expect(connection).toBeEnabled()
  await connection.focus()
  await page.keyboard.press("Space")
  await expect.poll(() => state.requests.filter((r) => r.method === "POST").length).toBe(1)
  await expect(connection).toBeDisabled()
  await page.keyboard.press("Space")
  expect(posts(state)).toEqual([{ method: "POST", url: `${serverA}/api/mcp/shared/connect`, directory }])
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
  await row(page, "broken").getByRole("button", { name: "Try again" }).click()
  await expect(row(page, "broken")).toHaveAttribute("data-status", "connected")
  await expect(row(page, "broken").getByRole("switch")).toBeChecked()
  expect(posts(state).every((r) => r.url.startsWith(`${serverA}/`) && r.directory === directory)).toBe(true)
  expect(posts(state).map((r) => new URL(r.url).pathname)).toEqual([
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
    "No MCP servers configured.Add a server to make its tools available to this project.",
  )
  await expect(page.getByRole("button", { name: "Add MCP server" })).toBeVisible()
  // A fresh observer receives a real query failure, then Retry reloads the owning profile.
  state.beforeList = undefined
  state.loadError = true
  await page.reload()
  await expect(page.locator(".orchestra-mcp-message")).toContainText("Could not load MCP servers.")
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
  await expect(row(page, "online").locator(".mx-badge")).toHaveText(["Connected", "http", "2 tools"])
  await toggleConnection(page, "shared")
  await expect(row(page, "shared")).toHaveAttribute("data-status", "connected")
  await row(page, "online").getByRole("button", { name: "Tools", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "online tools" }).locator(".mx-row strong")).toHaveText([
    "search_docs",
    "read_page",
  ])
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(row(page, "online").getByRole("button", { name: "Tools", exact: true })).toBeFocused()
  await page.getByRole("button", { name: "Add MCP server" }).click()
  const dialog = page.getByRole("dialog", { name: "Add MCP server" })
  await dialog.getByLabel("Name").fill("docs")
  await dialog.getByLabel("Command or server URL").fill("https://mcp.example.test/docs")
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(row(page, "docs")).toBeVisible()
  await expect(page.getByRole("button", { name: "Add MCP server" })).toBeFocused()
  // Configure prefills the profile's own entry the server reports through GET /api/mcp/entries.
  await row(page, "docs").getByRole("button", { name: "Configure" }).click()
  const configure = page.getByRole("dialog", { name: "Configure docs" })
  await expect(configure.getByLabel("Command or server URL")).toHaveValue("https://mcp.example.test/docs")
  await expect(configure.getByLabel("Command or server URL")).toBeEditable()
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
  expect(writes.every((r) => new URL(r.url).searchParams.get("location[directory]") === directory)).toBe(true)
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
    "Connect tools to this project. Saving updates its project config and restarts its MCP servers.",
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
  await dialog.getByLabel("Command or server URL").fill("https://")
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
  await expect(row(page, "docs")).toContainText("https://mcp.example.test/docs")
  await expect(row(page, "docs").locator(".mx-badge")).toHaveText(["Disconnected (until restart)", "http"])
  const put = {
    method: "PUT",
    url: `${serverA}/api/mcp/docs`,
    directory,
    body: { config: { type: "remote", url: "https://mcp.example.test/docs" } },
  }
  expect(writes(state, "PUT")).toEqual([put, put])
})

test("configure prefills the raw profile entry, skips unedited saves, and removes", async ({ page }) => {
  const state = fixture()
  await setup(page, state)
  await openChapter(page)
  await row(page, "online").getByRole("button", { name: "Tools", exact: true }).click()
  const tools = page.getByRole("dialog", { name: "online tools" })
  await expect(tools.locator(".mx-dialog-head p")).toHaveText("https://mcp.example.test/docs?key=•••")
  await expect(tools.locator(".mx-row strong")).toHaveText(["search_docs", "read_page"])
  await expect(tools.locator(".mx-row").first()).toContainText("Available when this server is connected")
  await tools.getByRole("button", { name: "Close dialog" }).click()
  await row(page, "shared").getByRole("button", { name: "Tools", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "shared tools" })).toContainText(
    "Connect this server to list its tools.",
  )
  await page.keyboard.press("Escape")

  // Defined outside the profile: nothing resolved is shown or copied.
  await row(page, "online").getByRole("button", { name: "Configure" }).click()
  const outside = page.getByRole("dialog", { name: "Configure online" })
  await expect(outside).toContainText("This server is configured outside this project.")
  await expect(outside.getByLabel("Command or server URL")).toHaveValue("")
  await outside.getByRole("button", { name: "Cancel" }).click()

  const configure = row(page, "broken").getByRole("button", { name: "Configure" })
  await configure.click()
  const edit = page.getByRole("dialog", { name: "Configure broken" })
  await expect(edit.getByRole("alert")).toHaveText("Last connection error: Connection refused by upstream")
  await expect(edit.getByLabel("Name")).toHaveValue("broken")
  await expect(edit.getByLabel("Name")).toHaveJSProperty("readOnly", true)
  await expect(edit.getByLabel("Command or server URL")).toHaveValue(`bunx 'broken server' --token {env:TOKEN}`)
  await expect(page.locator("dialog")).not.toContainText("resolved-secret")
  await edit.getByRole("button", { name: "Save" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(configure).toBeFocused()
  expect(state.requests.filter((r) => r.method === "PUT")).toEqual([])

  await configure.click()
  await edit.getByLabel("Command or server URL").fill(`bunx "fixed server" --token {env:TOKEN}`)
  await edit.getByRole("button", { name: "Save" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(configure).toBeFocused()
  await expect(row(page, "broken").locator("p").first()).toHaveText(`bunx 'fixed server' --token •••`)

  await row(page, "online").getByRole("button", { name: "Configure" }).click()
  await page.getByRole("dialog", { name: "Configure online" }).getByRole("button", { name: "Remove server" }).click()
  const confirm = page.getByRole("dialog", { name: "Remove this item?" })
  await expect(confirm).toContainText("This removes online from Profile A's project config.")
  await confirm.getByRole("button", { name: "Confirm" }).click()
  await expect(confirm.getByRole("alert")).toHaveText("Request failed: MCP server not found: online")
  await confirm.getByRole("button", { name: "Cancel" }).click()
  await expect(row(page, "online")).toBeVisible()

  await row(page, "broken").getByRole("button", { name: "Configure" }).click()
  await page.getByRole("dialog", { name: "Configure broken" }).getByRole("button", { name: "Remove server" }).click()
  await page.getByRole("dialog", { name: "Remove this item?" }).getByRole("button", { name: "Confirm" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(row(page, "broken")).toHaveCount(0)
  expect([...writes(state, "PUT"), ...writes(state, "DELETE")]).toEqual([
    {
      method: "PUT",
      url: `${serverA}/api/mcp/broken`,
      directory,
      body: { config: { type: "local", command: ["bunx", "fixed server", "--token", "{env:TOKEN}"] } },
    },
    { method: "DELETE", url: `${serverA}/api/mcp/online`, directory },
    { method: "DELETE", url: `${serverA}/api/mcp/broken`, directory },
  ])
  const reads = state.requests.filter((r) =>
    ["/api/mcp/tools", "/api/mcp/entries", "/api/mcp/config"].includes(new URL(r.url).pathname),
  )
  expect(reads.length).toBeGreaterThan(0)
  expect(reads.every((r) => r.directory === directory)).toBe(true)
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
  const actionResponse = page.waitForResponse(
    (r) => new URL(r.url()).origin === serverA && new URL(r.url()).pathname === "/api/mcp/shared/connect",
  )
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
  expect(posts(state).at(-1)).toEqual({ method: "POST", url: `${serverB}/api/mcp/shared/disconnect`, directory })
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
  const previousLists = state.requests.filter(
    (r) => new URL(r.url).origin === serverA && new URL(r.url).pathname === "/api/mcp",
  ).length
  await page.reload()
  await expect(page.getByRole("status")).toHaveText("Loading MCP servers…")
  await chooseProfile(page, "Profile B")
  await expect(row(page, "only-b")).toBeVisible()
  await expect(row(page, "shared")).toHaveAttribute("data-status", "disabled")
  const pendingLists =
    state.requests.filter((r) => new URL(r.url).origin === serverA && new URL(r.url).pathname === "/api/mcp").length -
    previousLists
  expect(pendingLists).toBeGreaterThan(0)
  state.inventory[serverA] = { "late-a": { status: "failed", error: "Old profile result" } }
  listGate.resolve()
  // The mock event stream reconnects, so the app may list again after the gate opens; wait for at least the gated lists.
  await expect.poll(() => lateLists.length).toBeGreaterThanOrEqual(pendingLists)
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
  expect(posts(state).at(-1)).toEqual({ method: "POST", url: `${serverB}/api/mcp/shared/connect`, directory })
  await expect(row(page, "late-a")).toHaveCount(0)
  await chooseProfile(page, "Profile A")
  await expect(row(page, "late-a")).toBeVisible()
  await expect(row(page, "only-b")).toHaveCount(0)
})

for (const path of ["/api/mcp/config", "/api/mcp/entries"] as const) {
  test(`audit: MCP ${path} must load before editing; read failure has retry`, async ({ page }) => {
    const state = fixture()
    await setup(page, state)
    const gate = Promise.withResolvers<void>()
    const started = Promise.withResolvers<void>()
    const fault = { fail: true }
    await page.route(
      (url) => url.origin === serverA && url.pathname === path,
      async (route) => {
        if (!fault.fail) return route.fallback()
        started.resolve()
        await gate.promise
        return json(route, { message: "Config read denied" }, 503)
      },
    )
    await openChapter(page)
    await started.promise
    await row(page, "broken").getByRole("button", { name: "Configure", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Configure broken" })
    await expect(dialog.getByRole("status")).toHaveText("Loading MCP configuration…")
    await expect(dialog.getByRole("textbox")).toHaveCount(0)
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toHaveCount(0)
    gate.resolve()
    await expect(dialog.getByRole("alert")).toHaveText("Could not load MCP configuration. Retry before editing.")
    await expect(dialog).not.toContainText("This server is configured outside this project.")
    fault.fail = false
    await dialog.getByRole("button", { name: "Retry", exact: true }).click()
    await expect(dialog.getByLabel("Command or server URL")).toHaveValue(`bunx 'broken server' --token {env:TOKEN}`)
    await expect(dialog.getByLabel("Command or server URL")).toBeEditable()
    await dialog.getByLabel("Command or server URL").fill("bunx keep-this-draft")
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(state.requests.filter((request) => request.method === "PUT").map((request) => request.body)).toEqual([
      { config: { type: "local", command: ["bunx", "keep-this-draft"] } },
    ])
  })
}

test("held trust and tool reads leave the shell and the server cards usable", async ({ page }) => {
  const state = fixture()
  await setup(page, state)
  const gate = Promise.withResolvers<void>()
  await page.route(
    (url) => url.origin === serverA && (url.pathname === "/api/trust" || url.pathname === "/api/mcp/tools"),
    async (route) => {
      await gate.promise
      return route.fallback()
    },
  )
  // The cards come from the status read alone: a pending trust list or tool list must not suspend the chapter.
  await openChapter(page)
  const sidebar = page.locator('[data-component="orchestra-sidebar"]')
  await expect(sidebar).toBeVisible()
  await expect(row(page, "online").locator(".mx-badge")).toHaveText(["Connected", "http"])
  // The shell stays navigable while the reads are held.
  await sidebar.getByRole("button", { name: "Skills", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/skills$/)
  await expect(sidebar).toBeVisible()
  await sidebar.getByRole("button", { name: "MCP", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/mcp$/)
  await expect(row(page, "online")).toBeVisible()
  gate.resolve()
  await expect(row(page, "online").locator(".mx-badge")).toHaveText(["Connected", "http", "2 tools"])
})

test("audit: MCP tools distinguish loading, read failure, retry, empty and unknown", async ({ page }) => {
  const state = fixture()
  state.tools[serverA].broken = []
  await setup(page, state)
  const gate = Promise.withResolvers<void>()
  const fault = { fail: true }
  await page.route(
    (url) => url.origin === serverA && url.pathname === "/api/mcp/tools",
    async (route) => {
      if (!fault.fail) return route.fallback()
      await gate.promise
      return json(route, { message: "Tools unavailable" }, 503)
    },
  )
  await openChapter(page)
  await row(page, "online").getByRole("button", { name: "Tools", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "online tools" })
  await expect(dialog.getByRole("status")).toHaveText("Loading MCP tools…")
  gate.resolve()
  await expect(dialog.getByRole("alert")).toContainText("Could not load MCP tools.")
  await expect(dialog).not.toContainText("Connect this server to list its tools.")
  fault.fail = false
  await dialog.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(dialog.locator(".mx-row strong")).toHaveText(["search_docs", "read_page"])
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await row(page, "broken").getByRole("button", { name: "Tools", exact: true }).click()
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("This server reports no tools.")
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click()
  await row(page, "shared").getByRole("button", { name: "Tools", exact: true }).click()
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Connect this server to list its tools.")
})

// Writes as origin and path, with the V2 location directory they targeted.
function writes(state: ReturnType<typeof fixture>, method: string) {
  return state.requests
    .filter((r) => r.method === method)
    .map((r) => ({ ...r, url: `${new URL(r.url).origin}${new URL(r.url).pathname}` }))
}

function posts(state: ReturnType<typeof fixture>) {
  return writes(state, "POST")
}

function row(page: Page, name: string) {
  return page.locator(`[data-mcp-name="${name}"]`)
}

async function toggleConnection(page: Page, name: string) {
  const connection = row(page, name).getByRole("switch")
  await expect(connection).toBeEnabled()
  await connection.press("Space")
}

async function chooseProfile(page: Page, name: string) {
  await page.getByRole("button", { name: "Choose project" }).click()
  await page.getByRole("menuitemradio", { name, exact: true }).click()
  await expect(page.locator('[data-slot="orchestra-profile"]')).toContainText(name)
}

async function openChapter(page: Page, wait = true) {
  await chooseProfile(page, "Profile A")
  await expandAdvanced(page)
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
      directory: url.searchParams.get("location[directory]"),
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
    const path = url.pathname
    if (path === "/api/event") {
      // Each stream opens with server.connected, so the client reconnects without backing off.
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: [
          { id: "evt_connected", type: "server.connected", data: {} },
        ]
          .map((item) => `data: ${JSON.stringify(item)}\n\n`)
          .join(""),
      })
    }
    if (path === "/api/health") return json(route, { pid: 1, healthy: true })
    // The trust list the "Trust this project" banner reads; this project is trusted, so no banner shows.
    if (path === "/api/trust") return json(route, [directory])
    if (path === "/project" || path === "/api/project") return json(route, [project])
    if (path === "/project/current") return json(route, project)
    if (path === "/api/project/current") return json(route, { id: project.id, directory })
    if (path === "/path" || path === "/api/path")
      return json(route, { state: directory, config: directory, worktree: directory, directory, home: "/work" })
    if (path === "/provider") return json(route, { all: [], connected: [], default: {} })
    if (path === "/api/session") return json(route, { data: [], cursor: {} })
    if (["/session", "/skill", "/command", "/lsp", "/formatter", "/permission", "/question"].includes(path))
      return json(route, [])
    const location = { directory, project: { id: project.id, directory } }
    if (path === "/api/mcp/resource") return json(route, { location, data: { resources: [], templates: [] } })
    if (path === "/api/mcp/config") return json(route, { location, data: state.config[url.origin] })
    if (path === "/api/mcp/entries") return json(route, { location, data: state.entries[url.origin] })
    if (path === "/api/mcp/tools") return json(route, { location, data: state.tools[url.origin] })
    if (path === "/api/mcp") {
      await state.beforeList?.(url)
      // A defect is an undeclared 500, which the client reports without a body.
      if (state.loadError) return json(route, { name: "UnknownError", data: { message: "Unexpected" } }, 500)
      return json(route, {
        location,
        data: Object.entries(state.inventory[url.origin]).map(([name, status]) => ({ name, status })),
      })
    }
    const action = /^\/api\/mcp\/([^/]+)\/(connect|disconnect|auth)$/.exec(path)
    if (action) {
      const name = decodeURIComponent(action[1])
      await state.beforeAction?.()
      if (state.actionError && action[2] === "auth")
        return json(route, { message: `MCP server ${name} does not support OAuth` }, 400)
      if (state.actionError)
        return json(route, { _tag: "McpServerNotFoundError", name, message: `MCP server not found: ${name}` }, 404)
      state.inventory[url.origin][name] = { status: action[2] === "disconnect" ? "disabled" : "connected" }
      // An empty authorization URL: the server signed in without a browser round trip.
      if (action[2] === "auth") return json(route, { authorizationUrl: "", oauthState: "state" })
      return route.fulfill({ status: 204, headers: cors })
    }
    const server = /^\/api\/mcp\/([^/]+)$/.exec(path)
    if (server) {
      const name = decodeURIComponent(server[1])
      if (state.configError) return json(route, { message: "Permission denied writing /work/orchestra.json" }, 400)
      // Mcp.remove fails when the profile files never defined the server.
      if (route.request().method() === "DELETE" && !Object.hasOwn(state.entries[url.origin], name))
        return json(
          route,
          { _tag: "McpServerNotFoundError", server: name, message: `MCP server not found: ${name}` },
          404,
        )
      if (route.request().method() === "DELETE") {
        delete state.config[url.origin][name]
        delete state.entries[url.origin][name]
        delete state.inventory[url.origin][name]
      }
      if (route.request().method() === "PUT") {
        const saved = JSON.parse(route.request().postData() ?? "{}").config
        state.config[url.origin][name] = saved
        state.entries[url.origin][name] = saved
        state.inventory[url.origin][name] ??= { status: "disabled" }
      }
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
