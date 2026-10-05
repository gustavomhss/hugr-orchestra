import { expect, test, type Page, type Response, type Route } from "@playwright/test"

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
    // The server's resolved config: variables are already substituted.
    config: {
      [serverA]: {
        online: {
          type: "remote",
          url: "https://mcp.example.test/docs?key=resolved-secret",
          headers: { Authorization: "Bearer resolved-secret" },
        },
        broken: { type: "local", command: ["bunx", "broken server", "--token", "resolved-secret"] },
      },
      [serverB]: {},
    } as Record<string, Record<string, unknown>>,
    // The profile files' own entries (GET /mcp/config): online is defined outside the profile.
    entries: {
      [serverA]: { broken: { type: "local", command: ["bunx", "broken server", "--token", "{env:TOKEN}"] } },
      [serverB]: {},
    } as Record<string, Record<string, unknown>>,
    tools: { [serverA]: { online: ["search_docs", "read_page"] }, [serverB]: {} } as Record<
      string,
      Record<string, string[]>
    >,
    protocol: "v1" as "v1" | "v2",
    configError: false,
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
  await expect(row(page, "online").getByRole("switch", { name: "Enable online" })).toBeChecked()
  await expect(row(page, "online").locator("p").first()).toHaveText("https://mcp.example.test/docs?key=•••")
  await expect(row(page, "online").locator(".mx-badge")).toHaveText(["Connected", "http", "2 tools"])
  await expect(row(page, "broken").locator(".mx-badge")).toHaveText(["Error", "stdio"])
  await expect(row(page, "broken").locator("p").first()).toHaveText(`bunx 'broken server' --token •••`)
  await expect(page.locator("[data-mx-page]")).not.toContainText("resolved-secret")
  await expect(page.locator("[data-mx-page]")).toContainText(
    "Switches apply until the server restarts. Saving or removing a server restarts this profile's MCP servers.",
  )
  await expect(row(page, "shared").locator(".mx-badge")).toHaveText(["Disabled"])
  // The switch shows a live connection: a failed server is off and switching it on retries.
  await expect(row(page, "broken").getByRole("switch", { name: "Enable broken" })).not.toBeChecked()
  await expect(row(page, "registration").getByRole("switch", { name: "Enable registration" })).not.toBeChecked()
  await expect(row(page, "shared").getByRole("switch", { name: "Enable shared" })).not.toBeChecked()
  await expect(row(page, "waiting").getByRole("switch")).toBeDisabled()
  await expect(row(page, "secured").getByRole("button", { name: "Authenticate" })).toBeVisible()
  expect(
    state.requests
      .filter((r) => new URL(r.url).pathname === "/mcp")
      .every((r) => new URL(r.url).origin === serverA && new URL(r.url).searchParams.get("directory") === directory),
  ).toBe(true)
  await expect(page.getByRole("searchbox", { name: "Search MCP" })).toHaveAttribute("placeholder", "Search mcp")
  await page.getByRole("searchbox", { name: "Search MCP" }).fill("SHARED")
  await expect(page.locator("[data-mcp-name]")).toHaveCount(1)
  const connection = row(page, "shared").getByRole("switch", { name: "Enable shared" })
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
  await toggleConnection(page, "broken")
  await expect(row(page, "broken")).toHaveAttribute("data-status", "connected")
  await expect(row(page, "broken").getByRole("switch")).toBeChecked()
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
    "/mcp/broken/connect",
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
  await expect(page.locator(".orchestra-mcp-message")).toContainText(
    "Unexpected server error. Check server logs for details.",
  )
  state.loadError = false
  state.inventory[serverA] = { recovered: { status: "disabled" } }
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(row(page, "recovered")).toBeVisible()
})

test("V2 lists, toggles, saves and removes through the current API", async ({ page }) => {
  const state = fixture()
  state.protocol = "v2"
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
    "Connect tools to this profile. Saving updates its OpenCode config and restarts its MCP servers.",
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
  await expect(dialog.getByRole("alert")).toHaveText("Request failed: Permission denied writing /work/opencode.json")
  state.configError = false
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Add MCP server" })).toBeFocused()
  await expect(row(page, "docs")).toContainText("https://mcp.example.test/docs")
  await expect(row(page, "docs").locator(".mx-badge")).toHaveText(["Disabled", "http"])
  const put = {
    method: "PUT",
    url: `${serverA}/mcp/docs/config`,
    directory: encodeURIComponent(directory),
    body: { config: { type: "remote", url: "https://mcp.example.test/docs" } },
  }
  expect(state.requests.filter((r) => r.method === "PUT")).toEqual([put, put])
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
  await expect(outside).toContainText("This server is configured outside this profile.")
  await expect(outside.getByLabel("Command or server URL")).toHaveValue("")
  await outside.getByRole("button", { name: "Cancel" }).click()

  const configure = row(page, "broken").getByRole("button", { name: "Configure" })
  await configure.click()
  const edit = page.getByRole("dialog", { name: "Configure broken" })
  await expect(edit.getByRole("alert")).toHaveText("Last connection error: Connection refused by upstream")
  await expect(edit.getByLabel("Name")).toHaveValue("broken")
  await expect(edit.getByLabel("Name")).toHaveJSProperty("readOnly", true)
  await expect(edit.getByLabel("Transport")).toHaveValue("stdio")
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
  await expect(confirm).toContainText("This removes online from Profile A's OpenCode config.")
  await confirm.getByRole("button", { name: "Confirm" }).click()
  await expect(confirm.getByRole("alert")).toHaveText(
    "Request failed: MCP server online is not defined in this project's config",
  )
  await confirm.getByRole("button", { name: "Cancel" }).click()
  await expect(row(page, "online")).toBeVisible()

  await row(page, "broken").getByRole("button", { name: "Configure" }).click()
  await page.getByRole("dialog", { name: "Configure broken" }).getByRole("button", { name: "Remove server" }).click()
  await page.getByRole("dialog", { name: "Remove this item?" }).getByRole("button", { name: "Confirm" }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(row(page, "broken")).toHaveCount(0)
  expect(state.requests.filter((r) => r.method === "PUT" || r.method === "DELETE")).toEqual([
    {
      method: "PUT",
      url: `${serverA}/mcp/broken/config`,
      directory: encodeURIComponent(directory),
      body: { config: { type: "local", command: ["bunx", "fixed server", "--token", "{env:TOKEN}"] } },
    },
    { method: "DELETE", url: `${serverA}/mcp/online/config`, directory: encodeURIComponent(directory) },
    { method: "DELETE", url: `${serverA}/mcp/broken/config`, directory: encodeURIComponent(directory) },
  ])
  const reads = state.requests.filter((r) => ["/mcp/tools", "/mcp/config"].includes(new URL(r.url).pathname))
  expect(reads.length).toBeGreaterThan(0)
  expect(reads.every((r) => new URL(r.url).searchParams.get("directory") === directory)).toBe(true)
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
    const body = route.request().postData()
    state.requests.push({
      method: route.request().method(),
      url: url.toString(),
      directory: await route.request().headerValue("x-opencode-directory"),
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
    if (path === "/config") return json(route, { mcp: state.config[url.origin] })
    if (path === "/mcp/tools") return json(route, state.tools[url.origin])
    if (path === "/mcp/config") return json(route, state.entries[url.origin])
    const config = /^\/mcp\/([^/]+)\/config$/.exec(path)
    if (config) {
      const name = decodeURIComponent(config[1])
      if (state.configError) return json(route, { message: "Permission denied writing /work/opencode.json" }, 400)
      if (route.request().method() === "DELETE" && !(name in state.entries[url.origin]))
        return json(
          route,
          {
            _tag: "McpServerNotFoundError",
            name,
            message: `MCP server ${name} is not defined in this project's config`,
          },
          404,
        )
      if (route.request().method() === "DELETE") {
        delete state.config[url.origin][name]
        delete state.entries[url.origin][name]
        delete state.inventory[url.origin][name]
        return json(route, true)
      }
      const saved = JSON.parse(route.request().postData() ?? "{}").config
      state.config[url.origin][name] = saved
      state.entries[url.origin][name] = saved
      state.inventory[url.origin][name] ??= { status: "disabled" }
      return json(route, true)
    }
    if (path === "/api/mcp")
      return json(route, {
        location: { directory, project: { id: project.id, directory } },
        data: Object.entries(state.inventory[url.origin]).map(([name, status]) => ({ name, status })),
      })
    const current = /^\/api\/mcp\/([^/]+)(\/connect|\/disconnect)?$/.exec(path)
    if (current) {
      const name = decodeURIComponent(current[1])
      if (current[2])
        state.inventory[url.origin][name] = { status: current[2] === "/connect" ? "connected" : "disabled" }
      if (!current[2] && route.request().method() === "PUT") state.inventory[url.origin][name] = { status: "disabled" }
      if (!current[2] && route.request().method() === "DELETE") delete state.inventory[url.origin][name]
      return route.fulfill({ status: 204, headers: cors })
    }
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

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "*",
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) })
}
