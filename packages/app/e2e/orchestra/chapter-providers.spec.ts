import { expect, test, type Page, type Route } from "@playwright/test"

const server = "http://127.0.0.1:4096"
const directory = "/repo/providers"
const location = { directory, project: { id: "project-a", directory } }

type Call = { method: string; path: string; body: unknown }

const v1Model = (providerID: string, id: string, name: string) => ({
  id,
  providerID,
  name,
  api: { id, url: "", npm: providerID },
  capabilities: {
    temperature: false,
    reasoning: false,
    attachment: false,
    toolcall: true,
    input: { text: true, audio: false, image: false, video: false, pdf: false },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
    interleaved: false,
  },
  cost: { input: 1, output: 1, cache: { read: 0, write: 0 } },
  limit: { context: 200_000, output: 8_000 },
  status: "active",
  options: {},
  headers: {},
  release_date: "2026-09-01",
  variants: {},
})
const v1Provider = (id: string, name: string, source: string, models: string[]) => ({
  id,
  name,
  source,
  env: [],
  options: {},
  models: Object.fromEntries(models.map((model) => [model, v1Model(id, model, model.toUpperCase())])),
})
const v2Model = (providerID: string, id: string, context: number) => ({
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
  limit: { context, output: 8_000 },
})

test("v1: cards, route, connect, disconnect, enable and custom endpoint use the real config and auth routes", async ({
  page,
}) => {
  const calls: Call[] = []
  await setup(page, "v1", calls)
  await openProviders(page)
  const chapter = page.locator('[data-chapter="providers"]')
  const cards = chapter.locator(".mx-card")
  await expect(cards).toHaveCount(4)
  await expect(chapter.locator(".mx-eyebrow")).toHaveText("Providers project / profile configuration")
  await expect(chapter.locator(".mx-toolbar .mx-badge")).toHaveText("Providers project")

  const anthropic = chapter.locator('.mx-card[data-provider-id="anthropic"]')
  await expect(anthropic.locator(".mx-badge")).toHaveText(["Connected", "API key"])
  await expect(anthropic.locator(".mx-badge.good")).toHaveText("Connected")
  await expect(anthropic.locator("p")).toHaveText("Direct access to Claude models, including Pro and Max")
  const env = chapter.locator('.mx-card[data-provider-id="mistral"]')
  await expect(env.locator(".mx-badge")).toHaveText(["Connected", "Environment"])
  await expect(env.getByRole("button", { name: "Disconnect" })).toBeDisabled()
  const local = chapter.locator('.mx-card[data-provider-id="local"]')
  await expect(local.locator(".mx-badge")).toHaveText(["Disconnected", "Custom"])
  await expect(local.locator(".mx-badge.bad")).toHaveText("Disconnected")
  await expect(local.locator("p")).toHaveText("OpenAI-compatible provider")

  const route = chapter.getByRole("combobox", { name: "Route for new turns" })
  await expect(route).toBeEnabled()
  await expect(route).toHaveValue("anthropic")
  await expect(route.locator("option")).toHaveText([
    "Choose a connected provider",
    "OpenCode Zen",
    "Anthropic",
    "Mistral",
  ])
  await route.selectOption("opencode")
  await expect.poll(() => patches(calls).at(-1)).toEqual({ model: "opencode/big-pickle" })

  const popular = chapter.locator("[data-providers-popular] .mx-row")
  await expect(popular.locator("strong")).toHaveText(["OpenAI", "OpenRouter"])
  await chapter.getByRole("textbox", { name: "Search Providers" }).fill("  router ")
  await expect(cards).toHaveCount(0)
  await expect(chapter.getByRole("status")).toHaveText("No providers match your search.")
  await expect(popular.locator("strong")).toHaveText(["OpenRouter"])
  await chapter.getByRole("textbox", { name: "Search Providers" }).fill("")
  await expect(cards).toHaveCount(4)

  await popular.filter({ hasText: "OpenRouter" }).getByRole("button", { name: "Connect" }).click()
  const dialog = page.locator(".providers-dialog")
  await expect(dialog.getByRole("heading", { name: "Connect OpenRouter" })).toBeVisible()
  await expect(dialog.getByRole("combobox", { name: "Connection method" }).locator("option")).toHaveText(["API key"])
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Enter an API key to continue.")
  expect(calls.filter((call) => call.path.startsWith("/auth/"))).toHaveLength(0)
  await dialog.getByLabel("API key", { exact: true }).fill("test-key")
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog).toHaveCount(0)
  expect(calls.find((call) => call.method === "PUT" && call.path === "/auth/openrouter")?.body).toEqual({
    type: "api",
    key: "test-key",
  })

  await anthropic.getByRole("button", { name: "Disconnect" }).click()
  await expect.poll(() => calls.some((call) => call.method === "DELETE" && call.path === "/auth/anthropic")).toBe(true)
  await expect.poll(() => calls.some((call) => call.method === "POST" && call.path === "/global/dispose")).toBe(true)

  await local.getByRole("button", { name: "Connect" }).click()
  await expect.poll(() => patches(calls).at(-1)).toEqual({ disabled_providers: [] })

  await chapter.getByRole("button", { name: "Connect provider" }).click()
  await expect(dialog.getByRole("heading", { name: "Connect provider" })).toBeVisible()
  await expect(dialog.locator(".mx-row strong").first()).toHaveText("OpenCode Zen")
  await dialog.getByRole("button", { name: "Custom OpenAI-compatible provider" }).click()
  await expect(dialog.getByRole("heading", { name: "Custom provider" })).toBeVisible()
  await expect(dialog.getByLabel("Base URL")).toHaveValue("http://localhost:8080/v1")
  await dialog.getByLabel("Name").fill("Anthropic")
  await dialog.getByLabel("Model ID").fill("qwen")
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Choose a unique provider name.")
  await dialog.getByLabel("Name").fill("My LLM")
  await dialog.getByLabel("Base URL").fill("ftp://nope")
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Enter a valid endpoint URL.")
  await dialog.getByLabel("Base URL").fill("http://localhost:8080/v1")
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog).toHaveCount(0)
  expect(patches(calls).at(-1)).toEqual({
    provider: {
      "my-llm": {
        npm: "@ai-sdk/openai-compatible",
        name: "My LLM",
        options: { baseURL: "http://localhost:8080/v1" },
        models: { qwen: { name: "qwen" } },
      },
    },
    disabled_providers: ["local"],
  })
  await page.screenshot({ path: test.info().outputPath("v1-dark.png") })
})

test("v2: credentials, read-only route, models visibility and unavailable custom endpoints", async ({ page }) => {
  const calls: Call[] = []
  await setup(page, "v2", calls, "light")
  await openProviders(page)
  const chapter = page.locator('[data-chapter="providers"]')
  const cards = chapter.locator(".mx-card")
  await expect(cards).toHaveCount(3)
  const route = chapter.getByRole("combobox", { name: "Route for new turns" })
  await expect(route).toBeDisabled()
  await expect(route).toHaveValue("opencode")

  const opencode = chapter.locator('.mx-card[data-provider-id="opencode"]')
  await expect(opencode.locator(".mx-badge")).toHaveText(["Connected", "Config"])
  await expect(opencode.getByRole("button", { name: "Disconnect" })).toBeDisabled()
  const openai = chapter.locator('.mx-card[data-provider-id="openai"]')
  await expect(openai.locator(".mx-badge")).toHaveText(["Connected", "Credential"])
  const keyed = chapter.locator('.mx-card[data-provider-id="openai#work"]')
  await expect(keyed.locator(".mx-badge")).toHaveText(["Connected", "API key"])
  await expect(keyed.locator("h3")).toHaveText("OpenAI (work)")

  await openai.getByRole("button", { name: "Disconnect" }).click()
  await expect
    .poll(() => calls.filter((call) => call.method === "DELETE").map((call) => call.path))
    .toEqual(["/api/credential/oauth-1"])

  await opencode.getByRole("button", { name: "Models" }).click()
  const dialog = page.locator(".providers-dialog")
  await expect(dialog.getByRole("heading", { name: "OpenCode Zen models" })).toBeVisible()
  await expect(dialog.locator(".mx-row small")).toHaveText(["OpenCode Zen · Context 200K", "OpenCode Zen · Context 1M"])
  const toggle = dialog.getByRole("switch", { name: "Enable BIG-PICKLE" })
  // The initial state follows the shared release-date rule; the oracle is that the switch flips the real setting.
  const before = await toggle.getAttribute("aria-checked")
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-checked", before === "true" ? "false" : "true")
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await expect(dialog).toHaveCount(0)

  const popular = chapter.locator("[data-providers-popular] .mx-row")
  await popular.filter({ hasText: "OpenRouter" }).getByRole("button", { name: "Connect" }).click()
  await dialog.getByLabel("API key", { exact: true }).fill("test-key")
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog).toHaveCount(0)
  expect(
    calls.find((call) => call.method === "POST" && call.path === "/api/integration/openrouter/connect/key")?.body,
  ).toMatchObject({ key: "test-key" })

  await chapter.getByRole("button", { name: "Connect provider" }).click()
  await dialog.getByRole("button", { name: "Custom OpenAI-compatible provider" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Custom providers are unavailable on this server")
  await expect(dialog.getByRole("button", { name: "Connect" })).toBeDisabled()
  await page.screenshot({ path: test.info().outputPath("v2-light.png") })
})

function patches(calls: Call[]) {
  return calls.filter((call) => call.method === "PATCH" && call.path === "/global/config").map((call) => call.body)
}

async function openProviders(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Providers", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/providers$/)
}

async function setup(page: Page, protocol: "v1" | "v2", calls: Call[], scheme: "dark" | "light" = "dark") {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.addInitScript(
    ({ server, directory, scheme }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({ list: [], projects: { local: [{ worktree: directory }] } }),
      )
      localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ home: { selection: { server, directory } } }))
    },
    { server, directory, scheme },
  )
  const config = {
    provider: { local: { name: "Local LLM", npm: "@ai-sdk/openai-compatible", models: { qwen: { name: "Qwen" } } } },
    disabled_providers: ["local"],
  }
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== server) return route.fallback()
    const path = url.pathname
    const method = route.request().method()
    const body = route.request().postData()
    if (method !== "GET") calls.push({ method, path, body: body ? JSON.parse(body) : undefined })
    const project = {
      id: "project-a",
      name: "Providers project",
      worktree: directory,
      vcs: "git",
      time: { created: 1, updated: 1 },
      sandboxes: [],
    }
    if (path === "/global/event" || path === "/event" || path === "/api/event")
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ok\n\n" })
    if (path === "/global/health") return json(route, { healthy: true }, protocol === "v1" ? 200 : 404)
    if (path === "/api/health") return json(route, { healthy: true, version: "2", pid: 1 })
    if (path === "/global/config")
      return json(route, method === "PATCH" ? { ...config, ...JSON.parse(body ?? "{}") } : config)
    if (path === "/config") return json(route, { ...config, model: "anthropic/claude" })
    if (path === "/provider")
      return json(route, {
        all: [
          v1Provider("opencode", "OpenCode Zen", "custom", ["big-pickle"]),
          v1Provider("anthropic", "Anthropic", "api", ["claude"]),
          v1Provider("mistral", "Mistral", "env", ["small"]),
          v1Provider("openai", "OpenAI", "custom", ["gpt"]),
          v1Provider("openrouter", "OpenRouter", "custom", ["auto"]),
        ],
        connected: ["opencode", "anthropic", "mistral"],
        default: { anthropic: "claude", opencode: "big-pickle" },
      })
    if (path === "/provider/auth") return json(route, { openrouter: [{ type: "api", label: "API key" }] })
    if (path.startsWith("/auth/") || path === "/global/dispose" || path === "/instance/dispose")
      return json(route, true)
    if (path === "/api/provider")
      return json(route, {
        location,
        data: [
          {
            id: "opencode",
            name: "OpenCode Zen",
            api: { type: "aisdk", package: "x" },
            request: { headers: {}, body: { apiKey: "public" } },
          },
          { id: "openai", name: "OpenAI", api: { type: "aisdk", package: "x" }, request: { headers: {}, body: {} } },
          {
            id: "openai#work",
            integrationID: "openai",
            name: "OpenAI (work)",
            api: { type: "aisdk", package: "x" },
            request: { headers: {}, body: {} },
          },
        ],
      })
    if (path === "/api/integration")
      return json(route, {
        location,
        data: [
          {
            id: "openai",
            name: "OpenAI",
            methods: [{ type: "key" }, { type: "oauth", id: "browser", label: "ChatGPT Pro/Plus (browser)" }],
            connections: [
              { type: "credential", id: "oauth-1", label: "me@example.com" },
              { type: "credential", id: "work", label: "work" },
            ],
          },
          { id: "openrouter", name: "OpenRouter", methods: [{ type: "key" }], connections: [] },
        ],
      })
    if (path === "/api/integration/openrouter")
      return json(route, {
        location,
        data: { id: "openrouter", name: "OpenRouter", methods: [{ type: "key" }], connections: [] },
      })
    if (path === "/api/integration/openrouter/connect/key")
      return protocol === "v2" ? route.fulfill({ status: 204 }) : json(route, { name: "NotFound" }, 404)
    if (path.startsWith("/api/credential/")) return route.fulfill({ status: 204 })
    if (path === "/api/model")
      return json(route, {
        location,
        data: [v2Model("opencode", "big-pickle", 200_000), v2Model("opencode", "fledge", 1_048_576)],
      })
    if (path === "/api/model/default")
      return json(route, { location, data: v2Model("opencode", "big-pickle", 200_000) })
    if (path === "/project" || path === "/api/project") return json(route, [project])
    if (path === "/project/current") return json(route, project)
    if (path === "/api/project/current") return json(route, { id: project.id, directory })
    if (path === "/path" || path === "/api/path")
      return json(route, { state: directory, config: directory, worktree: directory, directory, home: "/home/user" })
    if (path === "/api/session") return json(route, { data: [], cursor: {} })
    if (path === "/api/session/active") return json(route, { data: {} })
    if (path === "/api/vcs") return json(route, { location, data: { branch: "dev" } })
    if (path === "/api/mcp/resource") return json(route, { location, data: { resources: [], templates: [] } })
    if (["/session", "/agent", "/command", "/lsp", "/formatter", "/permission", "/question"].includes(path))
      return json(route, [])
    if (path.startsWith("/api/")) return json(route, { location, data: [] })
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
