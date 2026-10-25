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
  engine?: string
  claude?: { signedIn: boolean; loginError?: string }
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

  // Connect opens the app's one connect dialog, straight on the provider.
  await popular.filter({ hasText: "OpenRouter" }).getByRole("button", { name: "Connect" }).click()
  const connect = page.locator('[data-component="dialog-v2"]')
  await expect(connect.getByText("Connect OpenRouter", { exact: true })).toBeVisible()
  const submit = connect.locator('[data-action="provider-connect-submit"]')
  await submit.click()
  await expect(connect.getByRole("alert")).toHaveText("API key is required")
  expect(mock.calls.filter((call) => call.path.startsWith("/auth/"))).toHaveLength(0)
  await connect.getByLabel("OpenRouter API key", { exact: true }).fill(secret)
  await submit.click()
  await expect(connect).toHaveCount(0)
  expect(mock.calls.find((call) => call.method === "PUT" && call.path === "/auth/openrouter")?.body).toEqual({
    type: "api",
    key: secret,
  })
  await expect(page.getByText("API key saved for OpenRouter", { exact: true })).toBeVisible()
  await expectSecretGone(page)

  const dialog = page.locator(".providers-dialog")
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
  await expect(page.getByRole("tab", { name: "Models" })).toHaveCount(0)

  // Connect provider opens the same dialog on its picker: Claude mode leads, then the custom form and popular providers.
  await chapter.getByRole("button", { name: "Connect provider" }).click()
  await expect(connect.getByText("Connect provider", { exact: true })).toBeVisible()
  await expect(connect.locator("[data-provider-id]").first()).toHaveAttribute("data-provider-id", "_claude-mode")
  await connect.locator('[data-provider-id="_custom"]').click()
  await expect(connect.getByText("Custom provider", { exact: true })).toBeVisible()
  await connect.getByLabel("Provider ID", { exact: true }).fill("anthropic")
  await connect.getByLabel("Display name", { exact: true }).fill("My LLM")
  await connect.getByLabel("Base URL", { exact: true }).fill("ftp://nope")
  await connect.getByPlaceholder("model-id", { exact: true }).fill("qwen")
  await connect.getByPlaceholder("Display Name", { exact: true }).fill("qwen")
  await connect.getByRole("button", { name: "Submit" }).click()
  await expect(connect.getByText("That provider ID already exists", { exact: true })).toBeVisible()
  await expect(connect.getByText("Must start with http:// or https://", { exact: true })).toBeVisible()
  await connect.getByLabel("Provider ID", { exact: true }).fill("my-llm")
  await connect.getByLabel("Base URL", { exact: true }).fill("http://localhost:8080/v1")
  await connect.getByRole("button", { name: "Submit" }).click()
  await expect(connect).toHaveCount(0)
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

test("v2: error and retry, server route, confirmed credential removal, key and picker", async ({ page }) => {
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

  const orchestra = chapter.locator('.mx-card[data-provider-id="opencode"]')
  await expect(orchestra.locator(".mx-badge")).toHaveText(["Connected", "Config"])
  await expect(orchestra.getByRole("button", { name: "Disconnect" })).toBeDisabled()
  const signedIn = chapter.locator('.mx-card[data-provider-id="openai"]')
  await expect(signedIn.locator(".mx-badge")).toHaveText(["Connected", "Credential"])
  const keyed = chapter.locator('.mx-card[data-provider-id="openai#work"]')
  await expect(keyed.locator(".mx-badge")).toHaveText(["Connected", "API key"])
  await expect(keyed.locator("h3")).toHaveText("OpenAI (work)")

  const connect = page.locator('[data-component="dialog-v2"]')
  await keyed.getByRole("button", { name: "Configure" }).click()
  await expect(connect.getByText("Connect OpenAI", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(connect).toHaveCount(0)

  const dialog = page.locator(".providers-dialog")
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
  await connect.getByLabel("OpenRouter API key", { exact: true }).fill(secret)
  await connect.locator('[data-action="provider-connect-submit"]').click()
  await expect(connect).toHaveCount(0)
  expect(
    mock.calls.find((call) => call.method === "POST" && call.path === "/api/integration/openrouter/connect/key")?.body,
  ).toMatchObject({ key: secret })
  await expectSecretGone(page)

  // The picker lists Claude mode and every integration; a server that cannot save a custom provider is not offered one.
  await chapter.getByRole("button", { name: "Connect provider" }).click()
  await expect(connect.locator("[data-provider-id]")).toHaveCount(43)
  await expect(connect.locator('[data-provider-id="_custom"]')).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath("v2-light.png") })
})

test("v2: OAuth code, automatic, prompted and unsafe-link flows", async ({ page }) => {
  const mock: Mock = { calls: [], auto: "pending" }
  await setup(page, "v2", mock)
  await openProviders(page)
  const chapter = page.locator('[data-chapter="providers"]')
  const card = chapter.locator('.mx-card[data-provider-id="openai"]')
  const dialog = page.locator('[data-component="dialog-v2"]')
  const method = (name: string) => dialog.getByRole("button", { name, exact: true })
  const oauth = (id: string) =>
    mock.calls.filter((call) => call.path === `/api/integration/openai/connect/oauth` && body(call).methodID === id)

  await card.getByRole("button", { name: "Configure" }).click()
  await expect(dialog.getByText("Select login method for OpenAI.", { exact: true })).toBeVisible()
  await method("Sign in with a code").click()
  await expect(dialog.getByRole("link", { name: "this link" })).toHaveAttribute(
    "href",
    "https://auth.example.test/code",
  )
  await dialog.getByRole("button", { name: "Continue" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Authorization code is required")
  await dialog.getByLabel("Sign in with a code authorization code", { exact: true }).fill("code-123")
  await dialog.getByRole("button", { name: "Continue" }).click()
  await expect(dialog).toHaveCount(0)
  expect(
    mock.calls.find((call) => call.path === "/api/integration/openai/connect/oauth/att-code/complete")?.body,
  ).toEqual({ code: "code-123" })

  // Automatic sign-in polls while it waits, can be cancelled, and starts over after a refusal.
  await card.getByRole("button", { name: "Configure" }).click()
  await method("Sign in on this device").click()
  await expect(dialog.getByLabel("Confirmation code", { exact: true })).toHaveValue("ABCD-1234")
  await expect(dialog.getByText("Waiting for authorization...", { exact: true })).toBeVisible()
  await expect.poll(() => statusPolls(mock)).toBeGreaterThan(1)
  expect(mock.calls.some((call) => call.path.endsWith("/att-auto/complete"))).toBe(false)
  mock.auto = "failed"
  await expect(dialog.getByText("Authorization failed: Denied by user", { exact: true })).toBeVisible()
  mock.auto = "complete"
  await dialog.getByRole("button", { name: "Try again" }).click()
  await expect(dialog).toHaveCount(0)
  expect(oauth("auto")).toHaveLength(2)

  await card.getByRole("button", { name: "Configure" }).click()
  await method("Enterprise sign-in").click()
  await dialog.locator('[data-slot="list-item"]', { hasText: "Self-hosted" }).click()
  await dialog.getByLabel("Host", { exact: true }).fill("https://sso.example.test")
  await dialog.getByRole("button", { name: "Continue" }).click()
  await expect(dialog.getByLabel("Enterprise sign-in authorization code", { exact: true })).toBeVisible()
  expect(body(oauth("prompted")[0]).inputs).toEqual({ deployment: "self", host: "https://sso.example.test" })
  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0)

  // A link that is not a web address is refused, never rendered.
  await card.getByRole("button", { name: "Configure" }).click()
  await method("Broken link").click()
  await expect(
    dialog.getByText("Authorization failed: The server returned an authorization link that is not a web address.", {
      exact: true,
    }),
  ).toBeVisible()
  await expect(dialog.locator("a")).toHaveCount(0)
})

test("v1: Claude mode engine write and sign-in states", async ({ page }) => {
  const mock: Mock = { calls: [], claude: { signedIn: false } }
  await setup(page, "v1", mock)
  await openProviders(page)
  const section = page.locator("[data-providers-claude-mode]")
  await expect(section.getByRole("heading", { name: "Claude mode" })).toBeVisible()
  const engine = section.getByRole("combobox", { name: "Maestro engine" })
  await expect(engine).toHaveValue("orchestra")
  await engine.selectOption("claude-code")
  await expect.poll(() => patches(mock).at(-1)).toEqual({ agent: { maestro: { engine: "claude-code" } } })
  await expect(engine).toHaveValue("claude-code")
  await expect(engine).toBeEnabled()

  // Claude Code opens the browser itself, so the app must not open the fallback URL on its own.
  await page.evaluate(() => {
    const opened: string[] = []
    Object.assign(window, { opened })
    window.open = (url) => {
      opened.push(String(url))
      return null
    }
  })
  const opened = () => page.evaluate(() => (window as unknown as { opened: string[] }).opened)
  await section.getByRole("button", { name: "Sign in to Claude" }).click()
  await expect(section.getByRole("status")).toHaveText("Waiting for your browser…")
  expect(mock.calls.filter((call) => call.path === "/api/provider/claude-code/login")).toHaveLength(1)
  expect(await opened()).toEqual([])
  await section.getByRole("button", { name: "Browser didn't open? Open the sign-in page" }).click()
  await expect.poll(opened).toEqual(["https://claude.example.test/login"])

  await section.getByRole("button", { name: "Cancel" }).click()
  await expect(section.getByRole("status")).toHaveCount(0)
  await section.getByRole("button", { name: "Sign in to Claude" }).click()
  const submit = section.getByRole("button", { name: "Submit code" })
  await expect(submit).toBeDisabled()
  await section.getByLabel("Paste the code from the sign-in page").fill(" abc#state ")
  await submit.click()
  await expect(section.getByText("Signed in as me@example.com · Max")).toBeVisible()
  expect(mock.calls.find((call) => call.path === "/api/provider/claude-code/login/code")?.body).toEqual({
    code: "abc#state",
  })
  await expect(section.getByRole("button", { name: "Sign in to Claude" })).toHaveCount(0)
  await expect(section.getByRole("status")).toHaveCount(0)
})

test("v1: Claude mode shows the sign-in failure message", async ({ page }) => {
  const mock: Mock = { calls: [], claude: { signedIn: false, loginError: "Managed settings block sign-in." } }
  await setup(page, "v1", mock)
  await openProviders(page)
  const section = page.locator("[data-providers-claude-mode]")
  await section.getByRole("button", { name: "Sign in to Claude" }).click()
  await expect(section.getByRole("alert")).toHaveText("Sign-in failed: Managed settings block sign-in.")
  await expect(section.getByRole("button", { name: "Sign in to Claude" })).toBeVisible()
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

async function setup(page: Page, protocol: "v2", mock: Mock, scheme: "dark" | "light" = "dark") {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.addInitScript(
    ({ server, directory, scheme }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { shouldDisplayTabsToast: false } }))
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem("orchestra-theme-id", "oc-2")
      localStorage.setItem("orchestra-color-scheme", scheme)
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
      localStorage.setItem(
        "orchestra.global.dat:server",
        JSON.stringify({ list: [], projects: { local: [{ worktree: directory }] } }),
      )
      localStorage.setItem(
        "orchestra.global.dat:layout",
        JSON.stringify({ home: { selection: { server, directory } } }),
      )
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
    const stored = { ...config, ...(mock.engine ? { agent: { maestro: { engine: mock.engine } } } : {}) }
    if (path === "/global/config" && method === "PATCH") {
      const patch = JSON.parse(raw ?? "{}")
      if (mock.failModelWrite && "model" in patch) return json(route, { message: "write refused" }, 500)
      if (patch.agent) mock.engine = patch.agent.maestro.engine
      return json(route, { ...stored, ...patch })
    }
    if (path === "/global/config") return json(route, stored)
    if (path === "/config") return json(route, { ...stored, model: "anthropic/claude" })
    if (path === "/api/provider/claude-code/account" && mock.claude)
      return json(
        route,
        mock.claude.signedIn ? { signedIn: true, email: "me@example.com", subscription: "Max" } : { signedIn: false },
      )
    if (path === "/api/provider/claude-code/login" && mock.claude)
      return mock.claude.loginError
        ? json(route, { _tag: "ServiceUnavailableError", message: mock.claude.loginError }, 503)
        : json(route, { url: "https://claude.example.test/login" })
    if (path === "/api/provider/claude-code/login/code" && mock.claude) {
      mock.claude.signedIn = true
      return json(route, true)
    }
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
        default: { anthropic: "claude", orchestra: "big-pickle" },
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
