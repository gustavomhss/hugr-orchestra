import { expect, type Page, type Request } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

export const serverA = "http://127.0.0.1:4096"
export const serverB = "http://127.0.0.1:4097"
export const directory = "/repo/shared"
export const otherDirectory = "/repo/other"
type MockAgent = {
  name: string
  description?: string
  mode: string
  native?: boolean
  hidden?: boolean
  model?: { providerID: string; modelID: string }
  steps?: number
  prompt?: string
  permission: { permission: string; pattern: string; action: string }[]
  options: Record<string, unknown>
}
const agents: MockAgent[] = [
  {
    name: "build",
    description: "Implements repository changes",
    mode: "primary",
    native: true,
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
    options: {},
  },
  {
    name: "plan",
    description: "Plans repository work",
    mode: "primary",
    native: true,
    model: { providerID: "example", modelID: "reasoner" },
    steps: 7,
    prompt: "Plan before acting.",
    permission: [
      { permission: "*", pattern: "*", action: "allow" },
      { permission: "bash", pattern: "git *", action: "ask" },
      { permission: "edit", pattern: "*", action: "deny" },
    ],
    options: {},
  },
  {
    name: "research",
    description: "Investigates dependencies",
    mode: "subagent",
    native: true,
    permission: [],
    options: {},
  },
  {
    name: "review",
    description: "Reviews repository changes",
    mode: "all",
    native: true,
    model: { providerID: "offline", modelID: "solo" },
    permission: [],
    options: {},
  },
  { name: "secret", mode: "primary", hidden: true, permission: [], options: {} },
]
export type AgentFile = { path: string; exists: boolean; revision: string } & Record<string, unknown>
type Write = { url: string; directory: string | null; body: Record<string, unknown> }

export function card(page: Page, name: string) {
  return page.getByRole("list", { name: "Configured agents" }).getByRole("listitem", { name, exact: true })
}

export function dialog(page: Page) {
  return page.locator("dialog.agents-dialog")
}

export async function openAgents(page: Page, ready = true) {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page
    .locator('[data-component="orchestra-sidebar"]')
    .getByRole("button", { name: "Agents", exact: true })
    .click()
  await expect(page).toHaveURL(/\/orchestra\/agents$/)
  const debug = page.getByRole("button", { name: "Toggle debug tools", exact: true })
  if ((await debug.isVisible()) && (await debug.getAttribute("aria-pressed")) === "true") await debug.click()
  const notice = page.getByRole("button", { name: "Dismiss Tabs information", exact: true })
  if (await notice.isVisible()) await notice.click()
  if (ready) await expect(page.getByRole("list", { name: "Configured agents" })).toBeVisible()
}

function requestDirectory(request: Request) {
  const url = new URL(request.url())
  const header = request.headers()["x-opencode-directory"]
  return (
    url.searchParams.get("location[directory]") ??
    url.searchParams.get("directory") ??
    (header ? decodeURIComponent(header) : null)
  )
}

export async function setup(
  page: Page,
  input: {
    scheme?: "dark" | "light"
    wait?: Promise<void>
    waitOther?: Promise<void>
    response?: { state: string }
    protocol?: "v1" | "v2"
    models?: boolean
    files?: Record<string, AgentFile>
    // `html`: an older server answers unknown routes with its web app and status 200.
    fileApi?: false | "html"
    fileGate?: Promise<void>
    fileFailures?: number
    writeStatus?: number
    sessionStatus?: Record<string, unknown>
  } = {},
) {
  const requests: Array<{ url: string; method: string; directory: string | null }> = []
  const writes: Write[] = []
  const disposed: (string | null)[] = []
  const answered: string[] = []
  const failures = { left: input.fileFailures ?? 0 }
  const roster = agents.map((agent) => ({ ...agent }))
  const files = { ...input.files }
  const project = (name: string, worktree = directory) => ({
    id: name,
    name,
    worktree,
    vcs: "git",
    sandboxes: [],
    time: { created: 1, updated: 1 },
  })
  await page.addInitScript(
    ({ serverA, serverB, directory, otherDirectory, scheme }) => {
      localStorage.setItem("opencode.settings.dat:defaultServerUrl", serverA)
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({
          general: {
            newLayoutDesigns: true,
            agentVisibilityInitialized: true,
            showCustomAgents: false,
            shouldDisplayTabsToast: false,
            newInterfaceNoticeDismissed: true,
          },
        }),
      )
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [serverA, serverB],
          projects: {
            local: [
              { worktree: directory, expanded: true },
              { worktree: otherDirectory, expanded: true },
            ],
            [serverA]: [
              { worktree: directory, expanded: true },
              { worktree: otherDirectory, expanded: true },
            ],
            [serverB]: [{ worktree: directory, expanded: true }],
          },
        }),
      )
      localStorage.setItem(
        "opencode.global.dat:layout",
        JSON.stringify({ home: { selection: { server: serverA, directory } } }),
      )
      localStorage.setItem(
        `opencode.global.dat:${serverA}\0layout`,
        JSON.stringify({ home: { selection: { server: serverA, directory } } }),
      )
    },
    { serverA, serverB, directory, otherDirectory, scheme: input.scheme ?? "dark" },
  )
  await mockOpenCodeServer(page, {
    protocol: input.protocol,
    eventRetry: 60_000,
    provider: input.models
      ? {
          all: [
            {
              id: "example",
              name: "Example",
              models: {
                builder: { id: "builder", name: "Builder", limit: { context: 200_000 } },
                reasoner: { id: "reasoner", name: "Reasoner", limit: { context: 200_000 } },
              },
            },
          ],
          connected: ["example"],
          default: { example: "builder" },
        }
      : { all: [], connected: [], default: {} },
    directory,
    project: project("Atlas"),
    sessions: [],
    sessionStatus: input.sessionStatus,
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/*", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== serverA && url.origin !== serverB) return route.fallback()
    requests.push({ url: url.toString(), method: request.method(), directory: requestDirectory(request) })
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      })
    const selectedDirectory = url.searchParams.get("directory") ?? directory
    if (url.pathname === "/project")
      return json(
        url.origin === serverB ? [project("Boreal")] : [project("Atlas"), project("Other worktree", otherDirectory)],
      )
    if (url.pathname === "/project/current")
      return json(
        project(
          url.origin === serverB ? "Boreal" : selectedDirectory === otherDirectory ? "Other worktree" : "Atlas",
          selectedDirectory,
        ),
      )
    const file = /^\/api\/agent\/([^/]+)\/file$/.exec(url.pathname)
    if (file) {
      if (input.fileApi === false) return json({ message: "Not found" }, 404)
      if (input.fileApi === "html")
        return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>app</title>" })
      const name = decodeURIComponent(file[1])
      const location = { directory, project: { id: "Atlas", directory } }
      const fallback = { path: `${directory}/.opencode/agent/${name}.md`, exists: false, revision: "" }
      if (request.method() === "GET") {
        await input.fileGate
        answered.push(name)
        if (failures.left > 0) {
          failures.left -= 1
          return json({ _tag: "UnknownError", message: "boom" }, 500)
        }
        return json({ location, data: files[name] ?? fallback })
      }
      const body = request.postDataJSON() as Record<string, unknown>
      writes.push({ url: url.toString(), directory: requestDirectory(request), body })
      if (input.writeStatus) return json({ _tag: "ConflictError", message: "changed" }, input.writeStatus)
      // Mirror the server: the next roster read reflects the written definition.
      const index = roster.findIndex((agent) => agent.name === name)
      if (body.disable === true && index !== -1) roster.splice(index, 1)
      if (body.disable !== true && index === -1)
        roster.push({
          name,
          description: String(body.description),
          mode: String(body.mode),
          permission: [],
          options: {},
        })
      files[name] = { ...fallback, ...body, exists: true, revision: `${name}-${writes.length}` }
      return json({ location, data: files[name] })
    }
    if (url.pathname === "/instance/dispose" && request.method() === "POST") {
      disposed.push(requestDirectory(request))
      return json(true)
    }
    if (url.pathname === "/agent" || url.pathname === "/api/agent") {
      if (url.origin === serverA && selectedDirectory === directory) await input.wait
      if (url.origin === serverA && selectedDirectory === otherDirectory) await input.waitOther
      const state = input.response?.state
      if (state === "error" || state === "unavailable")
        return json({ message: "Agent endpoint failed" }, state === "error" ? 500 : 404)
      const data =
        state === "empty"
          ? []
          : url.origin === serverB
            ? [{ ...agents[0], name: "boreal-agent" }]
            : selectedDirectory === otherDirectory
              ? [{ ...agents[0], name: "other-agent" }]
              : roster
      if (input.protocol !== "v2") return json(data)
      return json({
        location: { directory: selectedDirectory },
        data: data.map((agent) => ({
          id: agent.name,
          name: agent.name,
          description: agent.description,
          mode: agent.mode,
          hidden: agent.hidden ?? false,
          // The shape this fork's server sends: no `settings`.
          request: { headers: {}, body: {} },
          steps: agent.steps,
          system: agent.prompt,
          model: agent.model ? { providerID: agent.model.providerID, id: agent.model.modelID } : undefined,
          permissions: agent.permission.map((rule) => ({
            action: rule.permission,
            resource: rule.pattern,
            effect: rule.action,
          })),
        })),
      })
    }
    if (url.pathname === "/path" || url.pathname === "/api/path")
      return json({
        state: selectedDirectory,
        config: selectedDirectory,
        worktree: selectedDirectory,
        directory: selectedDirectory,
        home: "/repo",
      })
    if (url.origin === serverA) return route.fallback()
    if (["/global/event", "/event", "/api/event"].includes(url.pathname))
      return route.fulfill({ contentType: "text/event-stream", body: "retry: 60000\n\n: ok\n\n" })
    if (url.pathname === "/global/health") return json({ healthy: true })
    if (["/skill", "/command", "/lsp", "/formatter", "/permission", "/question", "/vcs/diff"].includes(url.pathname))
      return json([])
    if (url.pathname === "/api/session") return json({ data: [], cursor: {} })
    if (url.pathname === "/api/session/active") return json({ data: {} })
    if (url.pathname === "/provider") return json({ all: [], connected: [], default: {} })
    return json({})
  })
  return { requests, writes, disposed, answered }
}
