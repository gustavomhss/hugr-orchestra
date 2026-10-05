import { expect, test, type Page, type Route } from "@playwright/test"

const server = "http://127.0.0.1:4096"
const directory = "/repo/providers"
const location = { directory, project: { id: "project-a", directory } }
const secret = "sk-test-not-a-real-key-7f3a"

type Call = { method: string; path: string; body: unknown }
type Mock = {
  calls: Call[]
  failProviders?: boolean
  failModelWrite?: boolean
  auto?: "pending" | "failed" | "complete"
  fillers?: number
}

const v1Model = (providerID: string, id: string) => ({
  id,
  providerID,
  name: id.toUpperCase(),
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
  models: Object.fromEntries(models.map((model) => [model, v1Model(id, model)])),
})
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
  limit: { context: 200_000, output: 8_000 },
})
const v2Provider = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  api: { type: "aisdk", package: "x" },
  request: { headers: {}, body: {} },
  ...extra,
})
const openai = {
  id: "openai",
  name: "OpenAI",
  methods: [
    { type: "key" },
    { type: "oauth", id: "code", label: "Sign in with a code" },
    { type: "oauth", id: "auto", label: "Sign in on this device" },
    {
      type: "oauth",
      id: "prompted",
      label: "Enterprise sign-in",
      prompts: [
        {
          type: "select",
          key: "deployment",
          message: "Deployment",
          options: [
            { label: "Cloud", value: "cloud" },
            { label: "Self-hosted", value: "self" },
          ],
        },
        { type: "text", key: "host", message: "Host", when: { key: "deployment", op: "eq", value: "self" } },
      ],
    },
    { type: "oauth", id: "bad", label: "Broken link" },
  ],
  connections: [
    { type: "credential", id: "oauth-1", label: "me@example.com" },
    { type: "credential", id: "work", label: "work" },
  ],
}
const openrouter = { id: "openrouter", name: "OpenRouter", methods: [{ type: "key" }], connections: [] }

test("v1: cards, route scope and revert, confirmed disconnects, enable and custom endpoint", async ({ page }) => {
  const mock: Mock = { calls: [] }
  await setup(page, "v1", mock)
  await openProviders(page)
  const chapter = page.locator('[data-chapter="providers"]')
  const cards = chapter.locator(".mx-card")
  await expect(cards).toHaveCount(5)
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
  await expect(route).toHaveValue("anthropic")
  await expect(route).toHaveAccessibleDescription(
    "Saved in this server's config, so it applies to every profile on this server.",
  )
  await expect(route.locator("option")).toHaveText([
    "Choose a connected provider",
    "OpenCode Zen",
    "Anthropic",
    "Mistral",
    "LM Studio",
  ])
  mock.failModelWrite = true
  await route.selectOption("opencode")
  await expect(page.getByText("Request failed", { exact: true })).toBeVisible()
  await expect(route).toHaveValue("anthropic")
  await expect(route).toBeEnabled()
  mock.failModelWrite = false
  await route.selectOption("opencode")
  await expect.poll(() => patches(mock).at(-1)).toEqual({ model: "opencode/big-pickle" })

  const popular = chapter.locator("[data-providers-popular] .mx-row")
  await expect(popular.locator("strong")).toHaveText(["OpenAI", "OpenRouter"])
  const search = chapter.getByRole("textbox", { name: "Search Providers" })
  await search.fill("  router ")
  await expect(cards).toHaveCount(0)
  await expect(chapter.getByRole("status")).toHaveText("No providers match your search.")
  await expect(popular.locator("strong")).toHaveText(["OpenRouter"])
  await search.fill("")
  await expect(cards).toHaveCount(5)

  await popular.filter({ hasText: "OpenRouter" }).getByRole("button", { name: "Connect" }).click()
  const dialog = page.locator(".providers-dialog")
  await expect(dialog.getByRole("heading", { name: "Connect OpenRouter" })).toBeVisible()
  await expect(dialog.getByRole("combobox", { name: "Connection method" }).locator("option")).toHaveText(["API key"])
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Enter an API key to continue.")
  expect(mock.calls.filter((call) => call.path.startsWith("/auth/"))).toHaveLength(0)
  await dialog.getByLabel("API key", { exact: true }).fill(`  ${secret}  `)
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog).toHaveCount(0)
  expect(mock.calls.find((call) => call.method === "PUT" && call.path === "/auth/openrouter")?.body).toEqual({
    type: "api",
    key: secret,
  })
  await expectSecretGone(page)

  await anthropic.getByRole("button", { name: "Disconnect" }).click()
  await expect(dialog.getByRole("heading", { name: "Disconnect Anthropic?" })).toBeVisible()
  await expect(dialog.getByText("This removes the stored key or sign-in for Anthropic.")).toBeVisible()
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toHaveCount(0)
  expect(mock.calls.some((call) => call.method === "DELETE")).toBe(false)
  await anthropic.getByRole("button", { name: "Disconnect" }).click()
  await dialog.getByRole("button", { name: "Disconnect" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText("Anthropic disconnected", { exact: true })).toBeVisible()
  expect(mock.calls.some((call) => call.method === "DELETE" && call.path === "/auth/anthropic")).toBe(true)
  expect(mock.calls.some((call) => call.method === "POST" && call.path === "/global/dispose")).toBe(true)

  const lmstudio = chapter.locator('.mx-card[data-provider-id="lmstudio"]')
  await expect(lmstudio.locator(".mx-badge")).toHaveText(["Connected", "Custom"])
  await lmstudio.getByRole("button", { name: "Disconnect" }).click()
  await dialog.getByRole("button", { name: "Disconnect" }).click()
  await expect(dialog).toHaveCount(0)
  expect(mock.calls.some((call) => call.method === "DELETE" && call.path === "/auth/lmstudio")).toBe(true)
  expect(patches(mock).at(-1)).toEqual({ disabled_providers: ["local", "lmstudio"] })

  await local.getByRole("button", { name: "Connect" }).click()
  await expect.poll(() => patches(mock).at(-1)).toEqual({ disabled_providers: [] })

  await chapter.locator('.mx-card[data-provider-id="opencode"]').getByRole("button", { name: "Models" }).click()
  await expect(page.getByRole("tab", { name: "Models" })).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("Escape")

  await chapter.getByRole("button", { name: "Connect provider" }).click()
  await expect(dialog.getByRole("heading", { name: "Connect provider" })).toBeVisible()
  await expect(dialog.locator(".mx-row strong").first()).toHaveText("OpenCode Zen")
  await dialog.getByRole("button", { name: "Custom OpenAI-compatible provider" }).click()
  await expect(dialog.getByRole("heading", { name: "Custom provider" })).toBeVisible()
  await expect(
    dialog.getByText("It is saved in this server's config, for every profile.", { exact: false }),
  ).toBeVisible()
  await expect(dialog.getByLabel("Base URL", { exact: true })).toHaveValue("http://localhost:8080/v1")
  await dialog.getByLabel("Model ID", { exact: true }).fill("qwen")
  // Catalog, disabled card and config keys all count: "LMStudio" derives the configured `lmstudio` id.
  for (const name of ["Anthropic", "Local", "LMStudio"]) {
    await dialog.getByLabel("Name", { exact: true }).fill(name)
    await dialog.getByRole("button", { name: "Connect" }).click()
    await expect(dialog.getByRole("alert")).toHaveText("Choose a unique provider name.")
  }
  await dialog.getByLabel("Name", { exact: true }).fill("My LLM")
  await dialog.getByLabel("Base URL", { exact: true }).fill("ftp://nope")
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Enter a valid endpoint URL.")
  await dialog.getByLabel("Base URL", { exact: true }).fill("http://localhost:8080/v1")
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog).toHaveCount(0)
  expect(patches(mock).at(-1)).toEqual({
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

test("v2: error and retry, server route, confirmed credential removal, key and pinned picker", async ({ page }) => {
  const mock: Mock = { calls: [], failProviders: true, fillers: 40 }
  await setup(page, "v2", mock, "light")
  await openProviders(page)
  const chapter = page.locator('[data-chapter="providers"]')
  await expect(chapter.getByRole("alert")).toContainText("Could not load providers for this profile.")
  await expect(chapter.locator(".mx-card")).toHaveCount(0)
  mock.failProviders = false
  await chapter.getByRole("button", { name: "Try again" }).click()
  const cards = chapter.locator(".mx-card")
  await expect(cards).toHaveCount(3)

  await expect(chapter.getByRole("combobox", { name: "Route for new turns" })).toHaveCount(0)
  await expect(chapter.locator("[data-providers-route-server]")).toHaveText(
    "This server routes new turns to OpenCode Zen from its own configuration.",
  )

  const opencode = chapter.locator('.mx-card[data-provider-id="opencode"]')
  await expect(opencode.locator(".mx-badge")).toHaveText(["Connected", "Config"])
  await expect(opencode.getByRole("button", { name: "Disconnect" })).toBeDisabled()
  const signedIn = chapter.locator('.mx-card[data-provider-id="openai"]')
  await expect(signedIn.locator(".mx-badge")).toHaveText(["Connected", "Credential"])
  const keyed = chapter.locator('.mx-card[data-provider-id="openai#work"]')
  await expect(keyed.locator(".mx-badge")).toHaveText(["Connected", "API key"])
  await expect(keyed.locator("h3")).toHaveText("OpenAI (work)")

  const dialog = page.locator(".providers-dialog")
  await keyed.getByRole("button", { name: "Configure" }).click()
  await expect(dialog.getByRole("heading", { name: "Connect OpenAI" })).toBeVisible()
  await dialog.getByRole("button", { name: "Cancel" }).click()

  await signedIn.getByRole("button", { name: "Disconnect" }).click()
  await expect(dialog.getByRole("heading", { name: "Disconnect OpenAI?" })).toBeVisible()
  await dialog.getByRole("button", { name: "Disconnect" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText("OpenAI disconnected", { exact: true })).toBeVisible()
  expect(mock.calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual([
    "/api/credential/oauth-1",
  ])

  const popular = chapter.locator("[data-providers-popular] .mx-row")
  await popular.filter({ hasText: "OpenRouter" }).getByRole("button", { name: "Connect" }).click()
  await dialog.getByLabel("API key", { exact: true }).fill(secret)
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog).toHaveCount(0)
  expect(
    mock.calls.find((call) => call.method === "POST" && call.path === "/api/integration/openrouter/connect/key")?.body,
  ).toMatchObject({ key: secret })
  await expectSecretGone(page)

  await chapter.getByRole("button", { name: "Connect provider" }).click()
  await expect(dialog.locator(".mx-row")).toHaveCount(42)
  await expect(dialog.getByRole("button", { name: "Custom OpenAI-compatible provider" })).toBeInViewport()
  await dialog.getByRole("button", { name: "Custom OpenAI-compatible provider" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Custom providers are unavailable on this server")
  await expect(dialog.getByRole("button", { name: "Connect" })).toBeDisabled()
  await page.screenshot({ path: test.info().outputPath("v2-light.png") })
})

test("v2: OAuth code, automatic, prompted and unsafe-link flows", async ({ page }) => {
  const mock: Mock = { calls: [], auto: "pending" }
  await setup(page, "v2", mock)
  await openProviders(page)
  const chapter = page.locator('[data-chapter="providers"]')
  const card = chapter.locator('.mx-card[data-provider-id="openai"]')
  const dialog = page.locator(".providers-dialog")
  const method = dialog.getByRole("combobox", { name: "Connection method" })
  const oauth = (id: string) =>
    mock.calls.filter((call) => call.path === `/api/integration/openai/connect/oauth` && body(call).methodID === id)

  await card.getByRole("button", { name: "Configure" }).click()
  await expect(method.locator("option")).toHaveText([
    "API key",
    "Sign in with a code",
    "Sign in on this device",
    "Enterprise sign-in",
    "Broken link",
  ])
  await method.selectOption({ label: "Sign in with a code" })
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveCount(0)
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog.getByRole("link", { name: "Open the authorization page" })).toHaveAttribute(
    "href",
    "https://auth.example.test/code",
  )
  await expect(method).toBeDisabled()
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Enter the authorization code to continue.")
  await dialog.getByLabel("Authorization code", { exact: true }).fill("code-123")
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog).toHaveCount(0)
  expect(
    mock.calls.find((call) => call.path === "/api/integration/openai/connect/oauth/att-code/complete")?.body,
  ).toEqual({ code: "code-123" })

  await card.getByRole("button", { name: "Configure" }).click()
  await method.selectOption({ label: "Sign in on this device" })
  await dialog.getByRole("button", { name: "Connect" }).click()
  const confirmation = dialog.getByLabel("Confirmation code", { exact: true })
  await expect(confirmation).toHaveValue("ABCD-1234")
  await expect(dialog.getByRole("status")).toHaveText("Waiting for authorization…")
  await expect(dialog.getByRole("button", { name: "Connect" })).toHaveCount(0)
  await confirmation.press("Enter")
  await expect.poll(() => statusPolls(mock)).toBeGreaterThan(1)
  expect(mock.calls.some((call) => call.path.endsWith("/att-auto/complete"))).toBe(false)
  mock.auto = "failed"
  await expect(dialog.getByRole("alert")).toHaveText("Denied by user")
  await expect(method).toBeEnabled()
  await expect(confirmation).toHaveCount(0)
  mock.auto = "complete"
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog).toHaveCount(0)
  expect(oauth("auto")).toHaveLength(2)

  await card.getByRole("button", { name: "Configure" }).click()
  await method.selectOption({ label: "Enterprise sign-in" })
  await expect(dialog.getByLabel("Deployment", { exact: true })).toHaveValue("cloud")
  await expect(dialog.getByLabel("Host", { exact: true })).toHaveCount(0)
  await dialog.getByLabel("Deployment", { exact: true }).selectOption("self")
  await dialog.getByLabel("Host", { exact: true }).fill("https://sso.example.test")
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog.getByLabel("Authorization code", { exact: true })).toBeVisible()
  expect(body(oauth("prompted")[0]).inputs).toEqual({ deployment: "self", host: "https://sso.example.test" })
  await dialog.getByRole("button", { name: "Cancel" }).click()

  await card.getByRole("button", { name: "Configure" }).click()
  await method.selectOption({ label: "Broken link" })
  await dialog.getByRole("button", { name: "Connect" }).click()
  await expect(dialog.getByRole("alert")).toHaveText(
    "The server returned an authorization link that is not a web address.",
  )
  await expect(dialog.locator("a")).toHaveCount(0)
})

function body(call: Call) {
  return call.body as { methodID?: string; inputs?: Record<string, string> }
}

function statusPolls(mock: Mock) {
  return mock.calls.filter((call) => call.method === "GET" && call.path.endsWith("/connect/oauth/att-auto")).length
}

function patches(mock: Mock) {
  return mock.calls.filter((call) => call.method === "PATCH" && call.path === "/global/config").map((call) => call.body)
}

async function expectSecretGone(page: Page) {
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(secret)
  expect(page.url()).not.toContain(secret)
  expect(await page.content()).not.toContain(secret)
}

async function openProviders(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Providers", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/providers$/)
}

async function setup(page: Page, protocol: "v1" | "v2", mock: Mock, scheme: "dark" | "light" = "dark") {
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
    provider: {
      local: { name: "Local LLM", npm: "@ai-sdk/openai-compatible", models: { qwen: { name: "Qwen" } } },
      lmstudio: { name: "LM Studio", npm: "@ai-sdk/openai-compatible", models: { gemma: { name: "Gemma" } } },
    },
    disabled_providers: ["local"],
  }
  const fillers = Array.from({ length: mock.fillers ?? 0 }, (_, index) => ({
    id: `filler-${String(index).padStart(2, "0")}`,
    name: `Filler ${String(index).padStart(2, "0")}`,
    methods: [{ type: "key" }],
    connections: [],
  }))
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== server) return route.fallback()
    const path = url.pathname
    const method = route.request().method()
    const raw = route.request().postData()
    if (method !== "GET" || path.includes("/connect/oauth/"))
      mock.calls.push({ method, path, body: raw ? JSON.parse(raw) : undefined })
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
    if (path === "/global/config" && method === "PATCH") {
      const patch = JSON.parse(raw ?? "{}")
      if (mock.failModelWrite && "model" in patch) return json(route, { message: "write refused" }, 500)
      return json(route, { ...config, ...patch })
    }
    if (path === "/global/config") return json(route, config)
    if (path === "/config") return json(route, { ...config, model: "anthropic/claude" })
    if (path === "/provider")
      return json(route, {
        all: [
          v1Provider("opencode", "OpenCode Zen", "custom", ["big-pickle"]),
          v1Provider("anthropic", "Anthropic", "api", ["claude"]),
          v1Provider("mistral", "Mistral", "env", ["small"]),
          v1Provider("lmstudio", "LM Studio", "config", ["gemma"]),
          v1Provider("openai", "OpenAI", "custom", ["gpt"]),
          v1Provider("openrouter", "OpenRouter", "custom", ["auto"]),
        ],
        connected: ["opencode", "anthropic", "mistral", "lmstudio"],
        default: { anthropic: "claude", opencode: "big-pickle" },
      })
    if (path === "/provider/auth") return json(route, { openrouter: [{ type: "api", label: "API key" }] })
    if (path.startsWith("/auth/") || path === "/global/dispose" || path === "/instance/dispose")
      return json(route, true)
    if (path === "/api/provider") {
      if (mock.failProviders) return json(route, { message: "boom" }, 500)
      return json(route, {
        location,
        data: [
          v2Provider("opencode", "OpenCode Zen", { request: { headers: {}, body: { apiKey: "public" } } }),
          v2Provider("openai", "OpenAI"),
          v2Provider("openai#work", "OpenAI (work)", { integrationID: "openai" }),
        ],
      })
    }
    if (path === "/api/integration") return json(route, { location, data: [openai, openrouter, ...fillers] })
    if (path === "/api/integration/openai") return json(route, { location, data: openai })
    if (path === "/api/integration/openrouter") return json(route, { location, data: openrouter })
    if (path === "/api/integration/openrouter/connect/key")
      return protocol === "v2" ? route.fulfill({ status: 204 }) : json(route, { name: "NotFound" }, 404)
    if (path === "/api/integration/openai/connect/oauth") {
      const methodID = JSON.parse(raw ?? "{}").methodID
      const time = { created: 1, expires: 9_999_999_999_999 }
      if (methodID === "auto")
        return json(route, {
          location,
          data: {
            attemptID: "att-auto",
            url: "https://auth.example.test/device",
            instructions: "Enter code: ABCD-1234",
            mode: "auto",
            time,
          },
        })
      return json(route, {
        location,
        data: {
          attemptID: "att-code",
          url: methodID === "bad" ? "javascript:alert(1)" : "https://auth.example.test/code",
          instructions: "Paste the code",
          mode: "code",
          time,
        },
      })
    }
    if (path === "/api/integration/openai/connect/oauth/att-auto") {
      const time = { created: 1, expires: 9_999_999_999_999 }
      if (mock.auto === "failed")
        return json(route, { location, data: { status: "failed", message: "Denied by user", time } })
      return json(route, { location, data: { status: mock.auto === "complete" ? "complete" : "pending", time } })
    }
    if (path.endsWith("/complete")) return route.fulfill({ status: 204 })
    if (path.startsWith("/api/credential/")) return route.fulfill({ status: 204 })
    if (path === "/api/model")
      return json(route, { location, data: [v2Model("opencode", "big-pickle"), v2Model("openai#work", "gpt")] })
    if (path === "/api/model/default") return json(route, { location, data: v2Model("opencode", "big-pickle") })
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
