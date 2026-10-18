import { expect, type Page, type Route, type WebSocketRoute } from "@playwright/test"
import type { ModelInfo } from "@opencode-ai/client/promise"
import { mockOrchestraServer } from "./mock-server"

// Shared fixture for the CI/CD chapter spec: two servers with one repository profile each, a
// workflow file inventory, and a server PTY double for pipeline runs.
export const serverA = "http://127.0.0.1:4096"
export const serverB = "http://127.0.0.1:4097"
export const directory = "/repo/orchestra"
export const source =
  "name: Repository checks\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo '<script>literal source</script>'\n"

export function workflowRows(page: Page) {
  return page.locator('[data-slot="cicd-workflows"] .mx-row[data-mx-card]')
}

export async function openSource(page: Page, path: string) {
  await page.getByRole("button", { name: `View ${path}`, exact: true }).click()
  const dialog = page.getByRole("dialog", { name: path })
  await expect(dialog).toBeVisible()
  return dialog
}

export async function createPipeline(page: Page, options: { deploy: boolean; branch?: string }) {
  await page.getByRole("button", { name: "New pipeline", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "New pipeline" })
  await dialog.locator('[name="name"]').fill("Project checks")
  if (options.branch) await dialog.locator('[name="branch"]').fill(options.branch)
  await dialog.locator('[name="command"]').fill("bun run build\nbun test")
  await dialog.locator('[name="environment"]').selectOption({ label: "Staging" })
  if (options.deploy) await dialog.getByRole("checkbox", { name: "Include a deployment stage" }).check()
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

// Server PTY double: records creates, gate input and removal attempts; `exit` ends the run like the
// server (status first, then a normal close), and `missing` answers like a server that lost the
// session. Register it after `setup`: Playwright tries the most recently registered route first.
export async function mockPty(page: Page, protocol: "v1" | "v2") {
  const state = {
    creates: [] as Record<string, unknown>[],
    inputs: [] as string[],
    removed: [] as string[],
    connections: [] as string[],
    sockets: [] as WebSocketRoute[],
    gets: 0,
    status: "running" as "running" | "exited",
    exitCode: undefined as number | undefined,
    missing: false,
    createFailure: false,
    removeFailure: false,
    onConnect: undefined as ((socket: WebSocketRoute) => void) | undefined,
    exit(code: number) {
      state.status = "exited"
      state.exitCode = code
      void state.sockets
        .at(-1)
        ?.close({ code: 1000 })
        .catch(() => undefined)
    },
    reset() {
      Object.assign(state, {
        inputs: [],
        removed: [],
        sockets: [],
        gets: 0,
        status: "running",
        exitCode: undefined,
        removeFailure: false,
      })
    },
  }
  const prefix = protocol === "v1" ? "/pty" : "/api/pty"
  const info = () => ({
    id: "pty_cicd",
    title: "CI/CD · Project checks",
    command: "/bin/zsh",
    args: [],
    cwd: directory,
    status: state.status,
    pid: 1,
    ...(state.status === "exited" ? { exitCode: state.exitCode } : {}),
  })
  const body = (data: unknown) => (protocol === "v1" ? data : { location: { directory }, data })
  await page.route(
    (url) => url.origin === serverA && (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)),
    (route) => {
      const url = new URL(route.request().url())
      const method = route.request().method()
      // The V1 SDK sends the directory as a query only for GET/HEAD; other methods carry a header.
      const header = route.request().headers()["x-orchestra-directory"]
      expect(
        url.searchParams.get(protocol === "v1" ? "directory" : "location[directory]") ??
          (header === undefined ? undefined : decodeURIComponent(header)),
      ).toBe(directory)
      if (url.pathname === prefix && method === "POST") {
        if (state.createFailure) return json(route, {}, 500)
        state.creates.push(route.request().postDataJSON())
        return json(route, body(info()))
      }
      if (url.pathname.endsWith("/connect-token")) return json(route, {}, 404)
      if (method === "DELETE") {
        state.removed.push(url.pathname.split("/").at(-1) ?? "")
        if (state.removeFailure) return json(route, {}, 500)
        return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } })
      }
      state.gets += 1
      if (state.missing)
        return json(
          route,
          protocol === "v1"
            ? { name: "NotFoundError", data: { message: "missing" } }
            : { _tag: "PtyNotFoundError", ptyID: "pty_cicd", message: "missing" },
          404,
        )
      return json(route, body(info()))
    },
  )
  await page.routeWebSocket(new RegExp(`${prefix}/pty_cicd/connect`), (socket) => {
    state.connections.push(socket.url())
    state.sockets.push(socket)
    socket.onMessage((message) => state.inputs.push(String(message)))
    if (state.onConnect) return state.onConnect(socket)
    socket.send(Buffer.concat([Buffer.from([0]), Buffer.from(JSON.stringify({ cursor: 0 }))]))
  })
  return state
}

export async function openChapter(page: Page) {
  await page.goto("/")
  await chooseProfile(page, "Server A repository")
  await page.locator(".orchestra-nav").getByRole("button", { name: "CI/CD", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/cicd$/)
}

export async function chooseProfile(page: Page, name: string) {
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page.getByRole("menuitemradio", { name, exact: true }).click()
}

export async function setup(
  page: Page,
  options: {
    protocol?: "v1" | "v2"
    state?: "empty" | "error" | "unavailable"
    gitlab?: boolean
    listFailure?: () => boolean
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
  await mockOrchestraServer(page, {
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
      return json(route, { location: { directory }, data: [{ id: "opencode", name: "Orchestra", settings: {} }] })
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
        if (options.state === "error" || options.listFailure?.()) return json(route, {}, 500)
        if (options.state === "unavailable") return json(route, {}, 404)
        const parent = url.searchParams.get("path") ?? ""
        if (url.origin === serverA && parent === ".github/workflows") await options.beforeList?.()
        const entries =
          options.state === "empty"
            ? []
            : parent === ""
              ? [{ path: ".github", type: "directory" }].concat(
                  options.gitlab && url.origin === serverA ? [{ path: ".gitlab-ci.yml", type: "file" }] : [],
                )
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
            id: "maestro",
            name: "Maestro",
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
        "orchestra.global.dat:server",
        JSON.stringify({
          list: [serverB],
          projects: {
            local: [{ worktree: directory, expanded: true }],
            [serverB]: [{ worktree: directory, expanded: true }],
          },
          lastProject: { local: directory, [serverB]: directory },
        }),
      )
      localStorage.setItem("orchestra.global.dat:language", JSON.stringify({ locale: "en" }))
      localStorage.setItem("orchestra-color-scheme", scheme)
    },
    { serverB, scheme: options.scheme ?? "dark", directory },
  )
  return requests
}

export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  })
}

export function provider() {
  return {
    all: [
      {
        id: "opencode",
        name: "Orchestra",
        models: { "test-model": { id: "test-model", name: "Test model", limit: { context: 200_000 } } },
      },
    ],
    connected: ["opencode"],
    default: { providerID: "opencode", modelID: "test-model" },
  }
}
