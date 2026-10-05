import { expect, test, type Page, type Route } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

const server = "http://127.0.0.1:4096"
const directory = "/repo/settings"
type Mcp = Record<string, { status: string; error?: string }>

function fixture() {
  return {
    config: {
      model: "openai/gpt-5",
      permission: { "*": "allow", bash: "ask", read: { "*": "allow", "*.env": "deny" } },
      mcp: {
        docs: { type: "remote", url: "https://mcp.example.test/docs" },
        broken: { type: "local", command: ["bunx", "broken-server"] },
      },
    } as Record<string, unknown>,
    mcp: { docs: { status: "connected" }, broken: { status: "failed", error: "Connection refused" } } as Mcp,
    patches: [] as unknown[],
    mcpCalls: [] as string[],
    failPatch: false,
  }
}

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" })

test("the sidebar opens the routed view with the mock's masthead, sections and deep links", async ({ page }) => {
  await setup(page, fixture())
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Settings", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/settings(\?|$)/)
  const view = page.locator('[data-mx-page="settings"]')
  await expect(view.locator(".kicker")).toHaveText("Settings")
  await expect(view.locator("h1")).toHaveText(/^Control what\s*the agents may do\.$/)
  const nav = page.getByRole("navigation", { name: "Settings sections" }).getByRole("button")
  await expect(nav).toHaveText([
    "Permissions",
    "Providers",
    "Models",
    "Agents",
    "MCP",
    "Shortcuts",
    "General",
    "Servers",
  ])
  await expect(nav.filter({ hasText: "Permissions" })).toHaveAttribute("aria-current", "page")
  await nav.filter({ hasText: "Models" }).click()
  await expect(page).toHaveURL(/section=models/)
  await expect(nav.filter({ hasText: "Models" })).toHaveAttribute("aria-current", "page")
  await expect(nav.filter({ hasText: "Permissions" })).not.toHaveAttribute("aria-current", "page")
  await page.goto("/orchestra/settings?section=general", { waitUntil: "domcontentloaded" })
  await expect(view.locator('[data-action="settings-color-scheme"]')).toBeVisible()
  await expect(view.locator('[data-action="settings-language"]')).toBeVisible()
  await nav.filter({ hasText: "Servers" }).click()
  await expect(view.locator(".settings-sec > h3")).toHaveText("Servers")
})

test("tool permissions read the global config and save one rule, keeping patterns and rolling back failures", async ({
  page,
}) => {
  const state = fixture()
  await setup(page, state)
  await page.goto("/orchestra/settings", { waitUntil: "domcontentloaded" })
  await expect(page.locator(".perm-tool")).toHaveCount(14)
  const radio = (tool: string, action: string) =>
    page.getByRole("radiogroup", { name: tool, exact: true }).getByRole("radio", { name: action, exact: true })
  await expect(radio("Bash", "Ask")).toHaveAttribute("aria-checked", "true")
  await expect(radio("Bash", "Allow")).toHaveAttribute("aria-checked", "false")
  await expect(radio("Read", "Allow")).toHaveAttribute("aria-checked", "true")
  await expect(radio("Edit", "Allow")).toHaveAttribute("aria-checked", "true")
  // The config's wildcard outranks the server's built-in Ask for doom loops.
  await expect(radio("Doom Loop", "Allow")).toHaveAttribute("aria-checked", "true")

  await radio("Read", "Deny").click()
  await expect(radio("Read", "Deny")).toHaveAttribute("aria-checked", "true")
  await expect.poll(() => state.patches.length).toBe(1)
  expect(state.patches[0]).toEqual({
    permission: { "*": "allow", bash: "ask", read: { "*": "deny", "*.env": "deny" } },
  })

  state.failPatch = true
  await radio("Bash", "Deny").click()
  await expect(page.getByText("Failed to update permissions")).toBeVisible()
  await expect(radio("Bash", "Ask")).toHaveAttribute("aria-checked", "true")
  await expect(radio("Bash", "Deny")).toHaveAttribute("aria-checked", "false")
})

test("providers choose the route for new turns and models toggle their composer visibility", async ({ page }) => {
  const state = fixture()
  await setup(page, state)
  await page.goto("/orchestra/settings?section=providers", { waitUntil: "domcontentloaded" })
  const view = page.locator('[data-mx-page="settings"]')
  await expect(view.getByRole("button", { name: "Connect provider", exact: true })).toBeVisible()
  await expect(view.locator(".settings-sec > h3").first()).toHaveText("Providers")
  const cards = view.locator("article.mx-card[data-provider]")
  await expect(cards).toHaveCount(2)
  const openai = cards.filter({ hasText: "OpenAI" })
  await expect(openai.locator(".mx-badge")).toHaveText(["Connected", "API key"])
  await expect(openai.getByRole("button")).toHaveText(["Configure", "Models", "Disconnect"])
  await expect(view.locator('.mx-table [data-provider="anthropic"]')).toContainText("Anthropic")
  await expect(view.locator('.mx-table [data-provider="anthropic"]').getByRole("button")).toHaveText("Connect")

  const route = view.getByRole("combobox", { name: "Route for new turns" })
  await expect(route).toHaveValue("openai")
  await route.selectOption("openrouter")
  await expect.poll(() => state.patches).toEqual([{ model: "openrouter/gpt-5" }])
  await expect(route).toHaveValue("openrouter")

  await openai.getByRole("button", { name: "Models", exact: true }).click()
  await expect(page).toHaveURL(/section=models/)
  const row = view.locator('[data-model="openai/gpt-5"]')
  await expect(row.locator("strong")).toHaveText("GPT-5")
  await expect(row.locator("small")).toHaveText("OpenAI · Context 400K")
  const toggle = row.getByRole("switch", { name: "Enable GPT-5" })
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("opencode.global.dat:model") ?? ""))
    .toMatch(/"providerID":"openai","modelID":"gpt-5","visibility":"hide"/)
})

test("agents, MCP servers and shortcuts use the profile's real data and actions", async ({ page }) => {
  const state = fixture()
  await setup(page, state)
  await page.goto("/orchestra/settings?section=agents", { waitUntil: "domcontentloaded" })
  const view = page.locator('[data-mx-page="settings"]')
  const agents = view.locator("article[data-agent]")
  await expect(agents).toHaveCount(2)
  const build = agents.filter({ hasText: "build" })
  await expect(build.locator(".agent-role")).toHaveText("primary")
  await expect(build.locator(".mx-badge")).toHaveText(["gpt-5", "25 steps", "Available"])
  await expect(build.getByRole("button", { name: "Open Chat" })).toBeEnabled()
  await expect(agents.filter({ hasText: "explore" }).getByRole("button", { name: "Open Chat" })).toBeDisabled()

  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "MCP" }).click()
  const docs = view.locator('[data-mcp-name="docs"]')
  await expect(docs.locator("p")).toHaveText("https://mcp.example.test/docs")
  await expect(docs.locator(".mx-badge")).toHaveText(["Connected", "http"])
  const broken = view.locator('[data-mcp-name="broken"]')
  await expect(broken.locator(".mx-badge")).toHaveText(["Error", "stdio"])
  await expect(broken.locator(".mx-badge.bad")).toHaveText("Error")
  const toggle = docs.getByRole("switch", { name: "Enable docs" })
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  await toggle.click()
  await expect.poll(() => state.mcpCalls).toEqual(["/mcp/docs/disconnect"])
  await expect(toggle).toHaveAttribute("aria-checked", "false")

  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Shortcuts" }).click()
  await expect(view.getByRole("button", { name: "Reset to defaults" })).toBeVisible()
  const palette = view.locator('[data-keybind-row="command.palette"]')
  await expect(palette.locator("strong")).toHaveText("Command palette")
  const binding = (await palette.locator("kbd").textContent()) ?? ""
  expect(binding).toMatch(/K$/)
  await palette.getByRole("button", { name: "Edit Command palette" }).click()
  await expect(palette.locator("kbd")).toHaveText("Press keys")
  await page.keyboard.press("Escape")
  await expect(palette.locator("kbd")).toHaveText(binding)
})

test("v2: Disconnect removes stored credentials, not the v1 auth file, and tool defaults are read-only", async ({
  page,
}) => {
  const state = fixture()
  const removed: string[] = []
  const legacyAuth: string[] = []
  await setup(page, state, "v2")
  const v2Model = (providerID: string, id: string) => ({
    id,
    providerID,
    name: id.toUpperCase(),
    api: { id, type: "aisdk", package: "@ai-sdk/openai-compatible" },
    capabilities: { tools: true, input: ["text"], output: ["text"] },
    request: { headers: {}, body: {} },
    variants: [],
    time: { released: 1_790_000_000_000 },
    cost: [{ input: 1, output: 1, cache: { read: 0, write: 0 } }],
    status: "active",
    enabled: true,
    limit: { context: 400_000, output: 8_000 },
  })
  const provider = (id: string, name: string, integrationID?: string) => ({
    id,
    integrationID,
    name,
    api: { type: "aisdk", package: "x" },
    request: { headers: {}, body: {} },
  })
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== server) return route.fallback()
    const location = { directory, project: { id: "settings", directory } }
    if (url.pathname.startsWith("/auth/")) legacyAuth.push(url.pathname)
    if (url.pathname.startsWith("/api/credential/") && route.request().method() === "DELETE") {
      removed.push(url.pathname)
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } })
    }
    if (url.pathname === "/api/provider")
      return json(route, {
        location,
        data: [provider("openai", "OpenAI"), provider("openai#work", "OpenAI (work)", "openai")],
      })
    if (url.pathname === "/api/integration")
      return json(route, {
        location,
        data: [
          {
            id: "openai",
            name: "OpenAI",
            methods: [{ type: "key" }],
            connections: [
              { type: "credential", id: "cred-default", label: "Default" },
              { type: "credential", id: "work", label: "work" },
              { type: "env", name: "OPENAI_API_KEY" },
            ],
          },
        ],
      })
    if (url.pathname === "/api/model") return json(route, { location, data: [v2Model("openai", "gpt-5")] })
    if (url.pathname === "/api/model/default") return json(route, { location, data: v2Model("openai", "gpt-5") })
    return route.fallback()
  })
  await page.goto("/orchestra/settings", { waitUntil: "domcontentloaded" })
  await expect(page.getByText("This server does not share its tool defaults", { exact: false })).toBeVisible()
  await expect(
    page.getByRole("radiogroup", { name: "Bash", exact: true }).getByRole("radio", { name: "Allow", exact: true }),
  ).toBeDisabled()

  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Providers" }).click()
  const view = page.locator('[data-mx-page="settings"]')
  await view.locator('article[data-provider="openai"]').getByRole("button", { name: "Disconnect" }).click()
  await expect.poll(() => removed).toEqual(["/api/credential/cred-default"])
  await view.locator('article[data-provider="openai#work"]').getByRole("button", { name: "Disconnect" }).click()
  await expect.poll(() => removed).toEqual(["/api/credential/cred-default", "/api/credential/work"])
  expect(legacyAuth).toEqual([])
})

async function setup(page: Page, state: ReturnType<typeof fixture>, protocol: "v1" | "v2" = "v1") {
  await page.addInitScript(
    ({ server, directory }) => {
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({ projects: { local: [{ worktree: directory, expanded: true }] } }),
      )
      localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ home: { selection: { server, directory } } }))
    },
    { server, directory },
  )
  const model = (id: string, name: string, context: number) => ({ id, name, limit: { context, output: 32_000 } })
  await mockOpenCodeServer(page, {
    protocol,
    provider: {
      all: [
        { id: "openai", name: "OpenAI", source: "api", env: [], models: { "gpt-5": model("gpt-5", "GPT-5", 400_000) } },
        {
          id: "openrouter",
          name: "OpenRouter",
          source: "api",
          env: [],
          models: {
            "claude-sonnet-4": model("claude-sonnet-4", "Claude Sonnet 4", 200_000),
            "gpt-5": model("gpt-5", "GPT-5 via OpenRouter", 400_000),
          },
        },
        { id: "anthropic", name: "Anthropic", source: "env", env: [], models: {} },
      ],
      connected: ["openai", "openrouter"],
      default: { openai: "gpt-5", openrouter: "claude-sonnet-4" },
    },
    directory,
    project: {
      id: "settings",
      name: "Settings repository",
      worktree: directory,
      vcs: "git",
      sandboxes: [],
      time: { created: 1, updated: 1 },
    },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  // Registered after the shared mock, so these answer first.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== server) return route.fallback()
    const method = route.request().method()
    if (method === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE",
          "access-control-allow-headers": "*",
        },
      })
    if (url.pathname === "/global/config" && method === "PATCH") {
      if (state.failPatch) return json(route, { name: "ConfigError", data: { message: "Config is read-only" } }, 500)
      const patch = route.request().postDataJSON()
      state.patches.push(patch)
      Object.assign(state.config, patch)
      return json(route, state.config)
    }
    if (url.pathname === "/global/config" || url.pathname === "/config") return json(route, state.config)
    if (url.pathname === "/mcp") return json(route, state.mcp)
    const toggle = url.pathname.match(/^\/mcp\/([^/]+)\/(connect|disconnect)$/)
    if (toggle && method === "POST") {
      state.mcpCalls.push(url.pathname)
      state.mcp[toggle[1]] = { status: toggle[2] === "connect" ? "connected" : "disabled" }
      return json(route, true)
    }
    if (url.pathname === "/agent")
      return json(route, [
        {
          name: "build",
          mode: "primary",
          description: "The default agent.",
          model: { providerID: "openai", modelID: "gpt-5" },
          steps: 25,
          permission: [],
          options: {},
        },
        { name: "explore", mode: "subagent", description: "Explores the codebase.", permission: [], options: {} },
        { name: "title", mode: "primary", hidden: true, permission: [], options: {} },
      ])
    return route.fallback()
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
