import { expect, test, type Page, type Route } from "@playwright/test"
import type { ModelInfo } from "@opencode-ai/client/promise"
import { mockOpenCodeServer } from "../utils/mock-server"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const directory = "/repo/orchestra"
const source =
  "name: Repository checks\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo '<script>literal source</script>'\n"

test.use({ viewport: { width: 1400, height: 900 } })

for (const protocol of ["v1", "v2"] as const) {
  test(`${protocol}: list, literal source, and unsent draft target the profile`, async ({ page }) => {
    const requests = await setup(page, { protocol })
    await openChapter(page)
    const workflows = page.getByRole("navigation", { name: "Workflows", exact: true })
    await expect(workflows.getByRole("button")).toHaveCount(2)
    await expect(page.locator('[data-slot="cicd-source"]')).toHaveText(source)
    expect(await page.locator('[data-slot="cicd-source"]').textContent()).toBe(source)
    await workflows.getByRole("button", { name: ".github/workflows/release.yaml", exact: true }).click()
    await expect(page.locator('[data-slot="cicd-source"]')).toHaveText("name: Release\non: [workflow_dispatch]\n")
    await expect
      .poll(() =>
        requests
          .filter((url) => url.pathname === (protocol === "v1" ? "/file" : "/api/fs/list"))
          .map((url) => url.searchParams.get("path")),
      )
      .toEqual(["", ".github", ".github/workflows"])
    const reads = requests.filter((url) => url.pathname === "/file/content" || url.pathname.startsWith("/api/fs/read/"))
    expect(
      reads.map((url) =>
        protocol === "v1"
          ? url.searchParams.get("path")
          : decodeURIComponent(url.pathname.slice("/api/fs/read/".length)),
      ),
    ).toEqual([".github/workflows/ci.yml", ".github/workflows/release.yaml"])
    expect(
      reads.every(
        (url) =>
          url.origin === serverA &&
          url.searchParams.get(protocol === "v1" ? "directory" : "location[directory]") === directory,
      ),
    ).toBe(true)
    const mutations: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (request.method() !== "GET" && /\/(api\/)?session(?:\/|$)/.test(url.pathname)) mutations.push(request.url())
    })
    await page.getByRole("button", { name: "Discuss in Chat", exact: true }).click()
    await expect(page).toHaveURL(/\/new-session\?draftId=/)
    await expect(page.locator('[data-component="prompt-input"][contenteditable="true"]')).toContainText(
      ".github/workflows/release.yaml",
    )
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("opencode.window.browser.dat:tabs") ?? "[]")))
      .toMatchObject([{ type: "draft", server: serverA, directory }])
    expect(mutations).toEqual([])
  })
}

test("profiles on different servers keep separate inventories and discard a late preview", async ({ page }) => {
  const pending = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  const completed = Promise.withResolvers<void>()
  const requests = await setup(page, {
    beforeRead: async () => {
      started.resolve()
      await pending.promise
    },
    afterRead: () => completed.resolve(),
  })
  await openChapter(page)
  await started.promise
  await expect(page.getByText("Loading workflow source…", { exact: true })).toBeVisible()
  await chooseProfile(page, "Server B repository")
  await expect(page.getByRole("navigation", { name: "Workflows", exact: true }).getByRole("button")).toHaveText([
    ".github/workflows/server-b.yml",
  ])
  await expect(page.locator('[data-slot="cicd-source"]')).toHaveText("name: Server B\n")
  pending.resolve()
  await completed.promise
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          url.origin === serverB &&
          url.pathname.startsWith("/api/fs/read/") &&
          url.searchParams.get("location[directory]") === directory,
      ),
    )
    .toBe(true)
  await expect(page.locator('[data-slot="cicd-source"]')).toHaveText("name: Server B\n")
  await chooseProfile(page, "Server A repository")
  await expect(page.getByRole("navigation", { name: "Workflows", exact: true }).getByRole("button")).toHaveCount(2)
  await expect(page.locator('[data-slot="cicd-source"]')).toHaveText(source)
  await chooseProfile(page, "Server B repository")
  await expect(page.locator('[data-slot="cicd-source"]')).toHaveText("name: Server B\n")
  const mutations: string[] = []
  page.on("request", (request) => {
    if (request.method() !== "GET" && /\/(api\/)?session(?:\/|$)/.test(new URL(request.url()).pathname))
      mutations.push(request.url())
  })
  await page.getByRole("button", { name: "Discuss in Chat", exact: true }).click()
  await expect(page.locator('[data-component="prompt-input"][contenteditable="true"]')).toContainText(
    ".github/workflows/server-b.yml",
  )
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("opencode.window.browser.dat:tabs") ?? "[]")))
    .toMatchObject([{ type: "draft", server: serverB, directory }])
  expect(mutations).toEqual([])
})

test("switching profiles during inventory loading discards the old list", async ({ page }) => {
  const pending = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  const completed = Promise.withResolvers<void>()
  await setup(page, {
    beforeList: async () => {
      started.resolve()
      await pending.promise
    },
    afterList: () => completed.resolve(),
  })
  await openChapter(page)
  await started.promise
  await expect(page.getByText("Loading workflows…", { exact: true })).toBeVisible()
  await chooseProfile(page, "Server B repository")
  await expect(page.locator('[data-slot="cicd-source"]')).toHaveText("name: Server B\n")
  pending.resolve()
  await completed.promise
  await expect(page.getByRole("navigation", { name: "Workflows", exact: true }).getByRole("button")).toHaveText([
    ".github/workflows/server-b.yml",
  ])
})

for (const state of ["empty", "error", "unavailable"] as const) {
  test(`inventory ${state} is explicit`, async ({ page }) => {
    await setup(page, { state })
    await openChapter(page)
    await expect(
      page.getByText(
        {
          empty: "No GitHub Actions workflows found in .github/workflows.",
          error: "Could not load workflows. Try refreshing.",
          unavailable: "Workflow files are unavailable on this server.",
        }[state],
        { exact: true },
      ),
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Discuss in Chat", exact: true })).toHaveCount(0)
  })
}

test("preview failure is recoverable by refresh", async ({ page }) => {
  const state = { fail: true }
  await setup(page, { readFailure: () => state.fail })
  await openChapter(page)
  await expect(page.getByText("Could not read this workflow. Try refreshing.", { exact: true })).toBeVisible()
  state.fail = false
  await page.getByRole("button", { name: "Refresh workflows", exact: true }).click()
  await expect(page.locator('[data-slot="cicd-source"]')).toHaveText(source)
})

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: keyboard selection and screenshot`, async ({ page }) => {
    await setup(page, { scheme })
    await openChapter(page)
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme)
    const debug = page.getByRole("button", { name: "Toggle debug tools", exact: true })
    if ((await debug.isVisible()) && (await debug.getAttribute("aria-pressed")) === "true") await debug.click()
    const notice = page.getByRole("button", { name: "Dismiss Tabs information", exact: true })
    if (await notice.count()) await notice.click()
    const workflow = page.getByRole("button", { name: ".github/workflows/release.yaml", exact: true })
    await workflow.focus()
    await page.keyboard.press("Enter")
    await expect(workflow).toHaveAttribute("aria-pressed", "true")
    await expect(page.locator('[data-slot="cicd-source"]')).toHaveText("name: Release\non: [workflow_dispatch]\n")
    await page.screenshot({ path: test.info().outputPath(`${scheme}.png`) })
    await page.evaluate(() => (document.documentElement.dir = "rtl"))
    await expect(workflow).toBeVisible()
    await page.screenshot({ path: test.info().outputPath(`${scheme}-rtl.png`) })
  })
}

async function openChapter(page: Page) {
  await page.goto("/")
  await chooseProfile(page, "Server A repository")
  await page.locator(".orchestra-nav").getByRole("button", { name: "CI/CD", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/cicd$/)
}

async function chooseProfile(page: Page, name: string) {
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page.getByRole("menuitemradio", { name, exact: true }).click()
}

async function setup(
  page: Page,
  options: {
    protocol?: "v1" | "v2"
    state?: "empty" | "error" | "unavailable"
    scheme?: "dark" | "light"
    beforeRead?: () => Promise<void>
    beforeList?: () => Promise<void>
    afterRead?: () => void
    afterList?: () => void
    readFailure?: () => boolean
  } = {},
) {
  const requests: URL[] = []
  const model: ModelInfo = {
    id: "test-model",
    modelID: "test-model",
    providerID: "opencode",
    name: "Test model",
    capabilities: { input: ["text"], output: ["text"], tools: true },
    variants: [],
    time: { released: 1 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: 200_000, output: 8192 },
  }
  const project = (server: string) => ({
    id: server === serverA ? "project-a" : "project-b",
    name: server === serverA ? "Server A repository" : "Server B repository",
    worktree: directory,
    vcs: "git",
    time: { created: 1, updated: 1 },
    sandboxes: [],
  })
  await mockOpenCodeServer(page, {
    protocol: options.protocol ?? "v2",
    directory,
    project: project(serverA),
    provider: provider(),
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== serverA && url.origin !== serverB) return route.fallback()
    const path = url.pathname
    if (path === "/api/provider")
      return json(route, { location: { directory }, data: [{ id: "opencode", name: "OpenCode", settings: {} }] })
    if (path === "/api/model") return json(route, { location: { directory }, data: [model] })
    if (path === "/api/model/default") return json(route, { location: { directory }, data: model })
    if (path === "/api/mcp") return json(route, { location: { directory }, data: [] })
    if (path === "/api/mcp/resource")
      return json(route, { location: { directory }, data: { resources: [], templates: [] } })
    if (path === "/file" || path === "/api/fs/list" || path === "/file/content" || path.startsWith("/api/fs/read/")) {
      requests.push(url)
      const target = url.searchParams.get(path.startsWith("/api/") ? "location[directory]" : "directory")
      if (target !== directory) return json(route, {}, 400)
      if (path === "/file" || path === "/api/fs/list") {
        if (options.state === "error") return json(route, {}, 500)
        if (options.state === "unavailable") return json(route, {}, 404)
        const parent = url.searchParams.get("path") ?? ""
        if (url.origin === serverA && parent === ".github/workflows") await options.beforeList?.()
        const entries =
          options.state === "empty"
            ? []
            : parent === ""
              ? [{ path: ".github", type: "directory" }]
              : parent === ".github"
                ? [{ path: ".github/workflows", type: "directory" }]
                : url.origin === serverB
                  ? [{ path: ".github/workflows/server-b.yml", type: "file" }]
                  : ["ci.yml", "release.yaml", "notes.md"]
                      .map((name) => ({ path: `.github/workflows/${name}`, type: "file" }))
                      .concat([{ path: ".github/workflows/nested.yml", type: "directory" }])
        return json(route, path === "/file" ? entries : { location: { directory }, data: entries }).finally(() => {
          if (url.origin === serverA && parent === ".github/workflows") options.afterList?.()
        })
      }
      if (url.origin === serverA) await options.beforeRead?.()
      if (options.readFailure?.()) return json(route, {}, 500)
      const text =
        url.origin === serverB
          ? "name: Server B\n"
          : (url.searchParams.get("path") ?? path).endsWith("release.yaml")
            ? "name: Release\non: [workflow_dispatch]\n"
            : source
      if (path === "/file/content") return json(route, { type: "text", content: text })
      return route
        .fulfill({
          status: 200,
          contentType: "application/octet-stream",
          headers: { "access-control-allow-origin": "*" },
          body: text,
        })
        .finally(() => {
          if (url.origin === serverA) options.afterRead?.()
        })
    }
    if (url.origin === serverA) return route.fallback()
    if (["/global/event", "/event", "/api/event"].includes(path))
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ok\n\n" })
    if (path === "/global/health") return json(route, {}, 404)
    if (path === "/api/health") return json(route, { healthy: true, pid: 1, version: "2.0.0" })
    if (path === "/project" || path === "/api/project") return json(route, [project(serverB)])
    if (path === "/project/current") return json(route, project(serverB))
    if (path === "/api/project/current") return json(route, { id: "project-b", directory })
    if (path === "/api/path" || path === "/path")
      return json(route, { directory, worktree: directory, home: directory, config: directory, state: directory })
    if (path === "/api/session") return json(route, { data: [], cursor: {} })
    if (path === "/api/session/active") return json(route, { data: {} })
    if (["/skill", "/command", "/lsp", "/formatter", "/permission", "/question", "/vcs/diff"].includes(path))
      return json(route, [])
    if (path === "/provider") return json(route, provider())
    if (path === "/api/agent")
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
    if (path === "/api/vcs")
      return json(route, { location: { directory }, data: { branch: "dev", defaultBranch: "dev" } })
    if (
      ["/api/command", "/api/skill", "/api/permission/request", "/api/question/request", "/api/reference"].includes(
        path,
      )
    )
      return json(route, { location: { directory }, data: [] })
    return json(route, {})
  })
  await page.addInitScript(
    ({ serverB, scheme, directory }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [serverB],
          projects: {
            local: [{ worktree: directory, expanded: true }],
            [serverB]: [{ worktree: directory, expanded: true }],
          },
          lastProject: { local: directory, [serverB]: directory },
        }),
      )
      localStorage.setItem("opencode.global.dat:language", JSON.stringify({ locale: "en" }))
      localStorage.setItem("opencode-color-scheme", scheme)
    },
    { serverB, scheme: options.scheme ?? "dark", directory },
  )
  return requests
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  })
}

function provider() {
  return {
    all: [
      {
        id: "opencode",
        name: "OpenCode",
        models: { "test-model": { id: "test-model", name: "Test model", limit: { context: 200_000 } } },
      },
    ],
    connected: ["opencode"],
    default: { providerID: "opencode", modelID: "test-model" },
  }
}
