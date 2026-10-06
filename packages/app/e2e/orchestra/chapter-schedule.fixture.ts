import { expect, type Page, type Route } from "@playwright/test"
import { currentSession, mockOpenCodeServer } from "../utils/mock-server"

// Shared by the schedule specs: a server with or without the scheduled task API, and the page helpers.
export const server = "http://127.0.0.1:4096"
export const directory = "/repo/schedule"
export const otherDirectory = "/repo/other"
const agents = [
  { name: "build", mode: "primary" },
  { name: "plan", mode: "primary" },
  { name: "explore", mode: "subagent" },
  { name: "secret", mode: "primary", hidden: true },
  { name: "review", mode: "all" },
]
export const SESSION_ID = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/
export const MESSAGE_ID = /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/
export const NOTE =
  "Saved on the server for this profile · due tasks run on the server even while this page is closed; a run more than a day late, or overtaken by the next one, is marked Missed."
export const NOTE_DEVICE =
  "Saved on this device for this profile · due tasks run only while this page is open; a run more than a day late, or overtaken by the next one, is marked Missed."
export const HOUR = 3_600_000
export const DAY = 24 * HOUR
export const SLOT = Date.parse("2031-01-15T09:30:00-05:00")

export async function openSchedule(page: Page) {
  await page.goto("/orchestra/schedule", { waitUntil: "domcontentloaded" })
  await expect(page.locator('[data-mx-page="orchestra-schedule"]')).toBeVisible({ timeout: 60_000 })
  const notice = page.getByRole("button", { name: "Dismiss Tabs information", exact: true })
  if (await notice.isVisible()) await notice.click()
}

export async function createTask(
  page: Page,
  input: { name: string; prompt: string; agent: string; cadence?: string; date?: string },
) {
  await page.getByRole("button", { name: "Schedule task", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Schedule task" })
  await dialog.getByLabel("Name").fill(input.name)
  await dialog.getByLabel("What to run").fill(input.prompt)
  await dialog.getByLabel("Cadence").selectOption(input.cadence ?? "once")
  await dialog.getByLabel("Agent").selectOption(input.agent)
  await dialog.getByLabel("Next run").fill(input.date ?? "2031-01-15T09:30")
  await dialog.getByRole("button", { name: "Schedule", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole("article", { name: input.name })).toBeVisible()
}

type ScheduleTask = { id: string; directory: string; name: string; cadence: string; agent: string } & Record<
  string,
  unknown
>

// Records every session-create request and prompt; `hold` keeps the next creates waiting until released.
// `schedule` is the server's scheduled task API in memory: what the page sent and what the server holds.
// A test plays the server's scheduler by editing `schedule.tasks`.
function recorder() {
  const api = {
    attempts: 0,
    fail: false,
    gate: undefined as Promise<void> | undefined,
    requests: [] as unknown[],
    created: [] as unknown[],
    prompts: [] as { sessionID: string; body: Record<string, unknown> }[],
    sessions: [] as ({ id: string } & Record<string, unknown>)[],
    schedule: {
      supported: true,
      unavailable: false,
      runError: undefined as string | undefined,
      runs: 0,
      tasks: [] as ScheduleTask[],
      calls: [] as { method: string; path: string; directory: string | null; body?: Record<string, unknown> }[],
    },
    hold() {
      const gate = Promise.withResolvers<void>()
      api.gate = gate.promise
      return () => gate.resolve()
    },
  }
  return api
}

// `shared` lets a second page of the same context reuse the first page's recorder and sessions.
export async function setup(
  page: Page,
  input: { scheme?: "dark" | "light"; protocol?: "v1" | "v2"; legacy?: boolean } = {},
  shared?: ReturnType<typeof recorder>,
) {
  const protocol = input.protocol ?? "v2"
  const api = shared ?? recorder()
  if (input.legacy) api.schedule.supported = false
  await page.addInitScript(
    ({ server, directory, scheme }) => {
      const selected = sessionStorage.getItem("schedule-e2e-directory") ?? directory
      localStorage.setItem("opencode.settings.dat:defaultServerUrl", server)
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({
          general: { newLayoutDesigns: true, shouldDisplayTabsToast: false, newInterfaceNoticeDismissed: true },
        }),
      )
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [server],
          projects: {
            local: [{ worktree: directory, expanded: true }],
            [server]: [{ worktree: directory, expanded: true }],
          },
        }),
      )
      const layout = JSON.stringify({ home: { selection: { server, directory: selected } } })
      localStorage.setItem("opencode.global.dat:layout", layout)
      localStorage.setItem(`opencode.global.dat:${server}\0layout`, layout)
    },
    { server, directory, scheme: input.scheme ?? "dark" },
  )
  await mockOpenCodeServer(page, {
    protocol,
    eventRetry: 60_000,
    provider: { all: [], connected: [], default: {} },
    directory,
    project: {
      id: "schedule",
      name: "Schedule repository",
      worktree: directory,
      vcs: "git",
      sandboxes: [],
      time: { created: 1, updated: 1 },
    },
    sessions: api.sessions,
    pageMessages: () => ({ items: [] }),
    onPrompt: (prompt) =>
      api.prompts.push({ sessionID: prompt.sessionID, body: prompt.body as Record<string, unknown> }),
  })
  // The shared mock server lists sessions but cannot create them: answer creation here and keep each
  // request. A known session ID is adopted, as the V2 server does.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== server) return route.fallback()
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      })
    if (url.pathname === "/api/schedule" || url.pathname.startsWith("/api/schedule/"))
      return schedule(api, route, url, json)
    if (url.pathname === "/agent") return json(agents.map((agent) => ({ permission: [], options: {}, ...agent })))
    if (url.pathname === "/api/agent")
      return json({
        location: { directory },
        data: agents.map((agent) => ({
          id: agent.name,
          name: agent.name,
          mode: agent.mode,
          hidden: agent.hidden ?? false,
          request: { settings: {}, headers: {}, body: {} },
          permissions: [],
        })),
      })
    const create = url.pathname === (protocol === "v2" ? "/api/session" : "/session")
    if (!create || route.request().method() !== "POST") return route.fallback()
    api.attempts++
    const attempt = api.attempts
    const body = route.request().postDataJSON()
    api.requests.push(body)
    await api.gate
    if (api.fail) return json({ message: "Session store is unavailable" }, 400)
    if (protocol === "v2") api.created.push(body)
    const id = typeof body?.id === "string" ? body.id : `ses_schedule_${attempt}`
    const session = api.sessions.find((item) => item.id === id) ?? {
      id,
      directory,
      agent: body?.agent ?? "build",
      title: "New session",
      time: { created: 1, updated: 1 },
    }
    if (!api.sessions.includes(session)) api.sessions.push(session)
    if (protocol === "v2") return json({ data: currentSession(session, directory) })
    return json({
      id,
      slug: id,
      projectID: "schedule",
      directory,
      title: "New session",
      version: "1",
      time: session.time,
    })
  })
  return api
}

// Answers /api/schedule like the server: tasks per location directory, creation that adopts a known ID, and
// Run now that admits the prompt into a new session. Older servers answer 404.
function schedule(
  api: ReturnType<typeof recorder>,
  route: Route,
  url: URL,
  json: (body: unknown, status?: number) => Promise<void>,
) {
  if (!api.schedule.supported) return json({ error: "Not Found" }, 404)
  if (api.schedule.unavailable) return json({ _tag: "ServiceUnavailableError", message: "Unavailable" }, 503)
  const method = route.request().method()
  const body = route.request().postDataJSON() as Record<string, unknown> | null
  const where = url.searchParams.get("location[directory]")
  api.schedule.calls.push({ method, path: url.pathname, directory: where, ...(body ? { body } : {}) })
  const location = { directory: where, project: { id: "schedule", directory } }
  const tasks = api.schedule.tasks
  if (url.pathname === "/api/schedule" && method === "GET")
    return json({ location, data: tasks.filter((task) => task.directory === where) })
  if (url.pathname === "/api/schedule" && method === "POST" && body) {
    const known = tasks.find((task) => task.id === body.id)
    if (known) return json({ location, data: known })
    const history = (body.history ?? {}) as { runs?: number; missed?: number; last?: Record<string, unknown> }
    const created: ScheduleTask = {
      id: typeof body.id === "string" ? body.id : `tsk_e2e_${tasks.length + 1}`,
      directory: where ?? directory,
      name: String(body.name),
      prompt: body.prompt,
      agent: String(body.agent),
      cadence: String(body.cadence),
      timezone: body.timezone,
      minute: body.minute ?? 0,
      next: body.next,
      enabled: body.enabled ?? true,
      runs: history.runs ?? 0,
      ...(history.missed === undefined ? {} : { missed: history.missed }),
      ...(history.last ? { last: { outcome: "started", ...history.last } } : {}),
    }
    tasks.push(created)
    return json({ location, data: created })
  }
  const id = decodeURIComponent(url.pathname.split("/")[3] ?? "")
  const task = tasks.find((item) => item.id === id && item.directory === where)
  if (!task)
    return json({ _tag: "ScheduleNotFoundError", scheduleID: id, message: `Scheduled task not found: ${id}` }, 404)
  if (method === "PATCH" && body) {
    // A new time re-anchors the task and clears its missed slot.
    const retimed = "next" in body || "timezone" in body || "cadence" in body
    Object.assign(task, body, retimed ? { missed: undefined } : {})
    return json({ location, data: task })
  }
  if (method === "DELETE") {
    tasks.splice(tasks.indexOf(task), 1)
    return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } })
  }
  if (url.pathname.endsWith("/run") && method === "POST") {
    if (api.schedule.runError) return json({ _tag: "ScheduleRunError", message: api.schedule.runError }, 500)
    const sessionID = `ses_schedule_run_${++api.schedule.runs}`
    api.sessions.push({
      id: sessionID,
      directory,
      agent: task.agent,
      title: task.name,
      time: { created: 1, updated: 1 },
    })
    Object.assign(task, {
      runs: Number(task.runs) + 1,
      last: { outcome: "started", time: Date.now(), sessionID },
      enabled: task.cadence === "once" ? false : task.enabled,
    })
    return json({ location, data: { sessionID } })
  }
  return json({ error: "Not Found" }, 404)
}
