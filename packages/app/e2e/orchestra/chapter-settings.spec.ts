import { expect, test, type Page, type Route } from "@playwright/test"
import { mockOrchestraServer } from "../utils/mock-server"

const server = "http://127.0.0.1:4096"
const directory = "/repo/settings"
type Mcp = Record<string, { status: string; error?: string }>

function fixture() {
  return {
    config: {
      model: "openai/gpt-5",
      // Key order matters: the server evaluates rules in order and the last match wins.
      permission: {
        glob: "deny",
        "*": "allow",
        bash: "ask",
        read: { "*": "allow", "*.env": "deny" },
        edit: { "*.md": "deny" },
      },
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

test("tool permissions follow the server's rule order, save in place, roll back failures and use arrow keys", async ({
  page,
}) => {
  const state = fixture()
  await setup(page, state)
  await page.goto("/orchestra/settings", { waitUntil: "domcontentloaded" })
  await expect(page.locator(".perm-tool")).toHaveCount(14)
  await expect(page.getByText("Server-wide defaults for every agent and repository.", { exact: false })).toBeVisible()
  const group = (tool: string) => page.getByRole("radiogroup", { name: tool, exact: true })
  const radio = (tool: string, action: string) => group(tool).getByRole("radio", { name: action, exact: true })
  await expect(radio("Bash", "Ask")).toHaveAttribute("aria-checked", "true")
  await expect(radio("Bash", "Allow")).toHaveAttribute("aria-checked", "false")
  await expect(radio("Read", "Allow")).toHaveAttribute("aria-checked", "true")
  // The config's wildcard comes after the server's built-in Ask for doom loops, so it wins.
  await expect(radio("Doom Loop", "Allow")).toHaveAttribute("aria-checked", "true")
  // glob's Deny comes before the wildcard, which overrides it; the row explains instead of writing.
  await expect(radio("Glob", "Allow")).toHaveAttribute("aria-checked", "true")
  await expect(radio("Glob", "Deny")).toBeDisabled()
  await expect(page.locator('[data-tool="glob"] .tnote')).toHaveText(
    "A later rule in the server config overrides this tool. Edit the config file to change it.",
  )
  // edit only has pattern rules; a "*" the server would append after them would override them.
  await expect(radio("Edit", "Allow")).toHaveAttribute("aria-checked", "true")
  await expect(radio("Edit", "Ask")).toBeDisabled()
  await expect(page.locator('[data-tool="edit"] .tnote')).toHaveText(
    "Pattern rules in the server config set this tool. Edit them in the config file.",
  )

  await radio("Read", "Deny").click()
  await expect(radio("Read", "Deny")).toHaveAttribute("aria-checked", "true")
  await expect.poll(() => state.patches.length).toBe(1)
  const first = state.patches[0] as { permission: Record<string, unknown> }
  expect(first).toEqual({
    permission: {
      glob: "deny",
      "*": "allow",
      bash: "ask",
      read: { "*": "deny", "*.env": "deny" },
      edit: { "*.md": "deny" },
    },
  })
  expect(Object.keys(first.permission)).toEqual(["glob", "*", "bash", "read", "edit"])
  expect(Object.keys(first.permission.read as object)).toEqual(["*", "*.env"])

  // A failed save restores the state before that save, including the earlier successful one.
  state.failPatch = true
  await radio("Bash", "Deny").click()
  await expect(page.getByText("Failed to update permissions")).toBeVisible()
  await expect(radio("Bash", "Ask")).toHaveAttribute("aria-checked", "true")
  await expect(radio("Bash", "Deny")).toHaveAttribute("aria-checked", "false")
  await expect(radio("Read", "Deny")).toHaveAttribute("aria-checked", "true")
  expect(state.patches.length).toBe(1)

  // One tab stop per group, on the checked option; arrows move and select.
  state.failPatch = false
  await expect(radio("Bash", "Ask")).toHaveAttribute("tabindex", "0")
  await expect(radio("Bash", "Allow")).toHaveAttribute("tabindex", "-1")
  await radio("Bash", "Ask").focus()
  await page.keyboard.press("ArrowRight")
  await expect(radio("Bash", "Deny")).toHaveAttribute("aria-checked", "true")
  await expect(radio("Bash", "Deny")).toBeFocused()
  await expect.poll(() => state.patches.length).toBe(2)
  expect((state.patches[1] as { permission: Record<string, unknown> }).permission.bash).toBe("deny")
  await page.keyboard.press("Home")
  await expect(radio("Bash", "Allow")).toHaveAttribute("aria-checked", "true")
  await expect(radio("Bash", "Allow")).toBeFocused()
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
    .poll(() => page.evaluate(() => localStorage.getItem("orchestra.global.dat:model") ?? ""))
    .toMatch(/"providerID":"openai","modelID":"gpt-5","visibility":"hide"/)

  const search = view.getByRole("searchbox", { name: "Search models" })
  await search.fill("sonnet")
  await expect(view.locator("[data-model]")).toHaveCount(1)
  await expect(view.locator("[data-model]")).toHaveAttribute("data-model", "openrouter/claude-sonnet-4")
  await search.fill("nothing like this")
  await expect(view.getByText("No models match your search.")).toBeVisible()

  // The composer reads the same app-wide visibility: the hidden model is gone from its picker.
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Agents" }).click()
  await view.locator('article[data-agent="maestro"]').getByRole("button", { name: "Open Chat" }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await page.locator('[data-action="prompt-model"]').click()
  await expect(page.locator('[data-option-key="openrouter:claude-sonnet-4"]')).toBeVisible()
  await expect(page.locator('[data-option-key="openrouter:gpt-5"]')).toBeVisible()
  await expect(page.locator('[data-option-key="openai:gpt-5"]')).toHaveCount(0)
})

test("agents, MCP servers and shortcuts use the profile's real data and actions", async ({ page }) => {
  const state = fixture()
  await setup(page, state)
  await page.goto("/orchestra/settings?section=agents", { waitUntil: "domcontentloaded" })
  const view = page.locator('[data-mx-page="settings"]')
  const agents = view.locator("article[data-agent]")
  await expect(agents).toHaveCount(2)
  const maestro = view.locator('article[data-agent="maestro"]')
  await expect(maestro.locator(".agent-role")).toHaveText("primary")
  await expect(maestro.locator(".mx-badge")).toHaveText(["gpt-5", "25 steps", "Available"])
  await expect(maestro.getByRole("button", { name: "Open Chat" })).toBeEnabled()
  // Only Maestro chats with the user; every other agent shows why it has no Open Chat.
  const explore = view.locator('article[data-agent="explore"]')
  await expect(explore.getByRole("button", { name: "Open Chat" })).toHaveCount(0)
  await expect(explore.locator(".mx-card-foot")).toHaveText(
    /Only Maestro chats with you; other agents work through it\.$/,
  )
  await expect(maestro.locator(".mx-card-foot")).not.toContainText("Only Maestro")

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

test("v2: Disconnect removes stored credentials, confirms removing several, explains what it cannot remove", async ({
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
        data: [
          provider("openai", "OpenAI"),
          provider("openai#work", "OpenAI (work)", "openai"),
          provider("anthropic", "Anthropic"),
          provider("deepseek", "DeepSeek"),
        ],
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
              { type: "credential", id: "cred-default", label: "default" },
              { type: "credential", id: "work", label: "work" },
              { type: "env", name: "OPENAI_API_KEY" },
            ],
          },
          {
            id: "anthropic",
            name: "Anthropic",
            methods: [{ type: "key" }, { type: "oauth", label: "Claude Pro/Max" }],
            connections: [
              { type: "credential", id: "a-default", label: "default" },
              { type: "credential", id: "a-oauth", label: "me@example.com" },
            ],
          },
          {
            id: "deepseek",
            name: "DeepSeek",
            methods: [{ type: "key" }],
            connections: [{ type: "env", name: "DEEPSEEK_API_KEY" }],
          },
        ],
      })
    if (url.pathname === "/api/model")
      return json(route, {
        location,
        data: [v2Model("openai", "gpt-5"), v2Model("anthropic", "claude"), v2Model("deepseek", "chat")],
      })
    if (url.pathname === "/api/model/default") return json(route, { location, data: v2Model("openai", "gpt-5") })
    return route.fallback()
  })
  await page.goto("/orchestra/settings", { waitUntil: "domcontentloaded" })
  const note = page.getByText("This server does not share its tool defaults", { exact: false })
  await expect(note).toBeVisible()
  // The note sits above the table it explains, and the read-only groups are marked disabled.
  expect(
    await note.evaluate((element) => !!(element.compareDocumentPosition(document.querySelector(".perm-table")!) & 4)),
  ).toBe(true)
  await expect(page.getByRole("radiogroup", { name: "Bash", exact: true })).toHaveAttribute("aria-disabled", "true")
  await expect(
    page.getByRole("radiogroup", { name: "Bash", exact: true }).getByRole("radio", { name: "Allow", exact: true }),
  ).toBeDisabled()

  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Providers" }).click()
  const view = page.locator('[data-mx-page="settings"]')
  await expect(view.getByText("This server does not let the app change its default model.")).toBeVisible()
  const disconnect = (id: string) =>
    view.locator(`article[data-provider="${id}"]`).getByRole("button", { name: "Disconnect" }).click()

  // The default key goes; the labelled key keeps its own card.
  await disconnect("openai")
  await expect.poll(() => removed).toEqual(["/api/credential/cred-default"])
  await disconnect("openai#work")
  await expect.poll(() => removed).toEqual(["/api/credential/cred-default", "/api/credential/work"])

  // Removing more than one credential asks first; Cancel removes nothing.
  await disconnect("anthropic")
  const confirm = page.getByRole("dialog").filter({ hasText: "Remove 2 credentials for Anthropic?" })
  await expect(confirm).toContainText("default, me@example.com")
  await confirm.getByRole("button", { name: "Cancel" }).click()
  await expect(confirm).toHaveCount(0)
  expect(removed).toHaveLength(2)
  await disconnect("anthropic")
  await page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click()
  await expect.poll(() => removed.slice(2).sort()).toEqual(["/api/credential/a-default", "/api/credential/a-oauth"])

  // An environment-only provider is explained, not reported as a failed request.
  await disconnect("deepseek")
  await expect(page.getByText("DeepSeek stays connected")).toBeVisible()
  await expect(page.getByText("DEEPSEEK_API_KEY", { exact: false })).toBeVisible()
  await expect(page.getByText("Request failed")).toHaveCount(0)
  expect(removed).toHaveLength(4)
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
        "orchestra.global.dat:server",
        JSON.stringify({ projects: { local: [{ worktree: directory, expanded: true }] } }),
      )
      localStorage.setItem("orchestra.global.dat:layout", JSON.stringify({ home: { selection: { server, directory } } }))
    },
    { server, directory },
  )
  const model = (id: string, name: string, context: number) => ({ id, name, limit: { context, output: 32_000 } })
  await mockOrchestraServer(page, {
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
          name: "maestro",
          mode: "primary",
          description: "Orchestrates the work.",
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
