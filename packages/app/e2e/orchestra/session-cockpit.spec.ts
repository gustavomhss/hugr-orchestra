import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const directory = "/work/cockpit"
const projectID = "proj_cockpit"
const parentID = "ses_cockpit_parent"
const parentTitle = "Cockpit parent"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const child = { running: "ses_cockpit_running", failed: "ses_cockpit_failed" }

type DockCall = {
  type: string
  url?: string
  tabID?: string
  generation?: number
  bounds?: { x: number; y: number; width: number; height: number }
}

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" })

test("the Apps tab shows the Dock, Tasks and Activity together, with local panes", async ({ page }) => {
  const ptys: string[] = []
  await setup(page, { bridge: false })
  await page.route(
    (url) => url.port === new URL(server).port && url.pathname.startsWith("/pty"),
    (route) => {
      ptys.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    },
  )
  await openCockpit(page)
  const bar = page.locator('[data-slot="session-side-panel-tab-bar"]')
  await expect(bar.getByRole("tab", { name: /^Apps/ })).toHaveAttribute("aria-selected", "true")
  await expect(
    bar.getByRole("tab", { name: /^Apps/ }).locator('[data-slot="session-side-panel-tab-count"]'),
  ).toHaveText("1")
  await expect(bar.getByRole("tab", { name: "Tasks" })).toHaveCount(0)

  // All three at once: the Dock on top, Tasks and Activity under it.
  const dock = dockCard(page)
  const tasks = page.locator('[data-component="tasks-panel"][data-variant="summary"]')
  const activity = page.getByRole("region", { name: "Activity" })
  await expect(dock).toBeVisible()
  await expect(tasks).toBeVisible()
  await expect(activity).toBeVisible()
  await expect(dock.getByRole("tab")).toHaveText(["Browser", "Files", "Docs", "Terminal"])
  await expect(pane(dock, "Browser")).toHaveAttribute("aria-selected", "true")
  await expect(dock.getByRole("tabpanel")).toContainText("Browser unavailable here")

  await expect(tasks.locator('[data-slot="tasks-count"]')).toHaveText("1 task")
  await expect(tasks.locator('[data-slot="task-title"]')).toHaveText(["Running task", "Failed task"])
  await expect(tasks.locator('[data-slot="task-stats"]')).toHaveCount(0)
  await expect(activity.locator('[data-slot="activity-row"]')).toHaveText([
    "AgentFailed taskSession · Failed",
    "AgentRunning taskSession · Running",
    "Janitor reportServer · No report available",
  ])

  // The detail expands the same card, from the same projection.
  await tasks.getByRole("button", { name: "View all (2)" }).click()
  await expect(tasks.locator('[data-slot="task-stats"]')).toHaveCount(2)
  await expect(tasks.locator('[data-slot="task-row"]')).toHaveCount(2)
  await tasks.getByRole("button", { name: "Show less" }).click()
  await expect(tasks.locator('[data-slot="task-stats"]')).toHaveCount(0)

  await pane(dock, "Files").click()
  const files = dock.getByRole("tabpanel")
  await files.getByText("package.json", { exact: true }).click()
  await expect(files.locator(".orchestra-dock-path")).toHaveText("package.json")
  await expect(files.getByText("cockpit-package-contents", { exact: true })).toBeVisible()
  await expect(dock).toBeVisible()
  await expect(tasks).toBeVisible()

  await pane(dock, "Docs").click()
  const docs = dock.getByRole("tabpanel")
  await expect(docs.locator(".orchestra-docs-entry")).toHaveText(["README.md", "AGENTS.md", "docs"])
  await docs.getByRole("button", { name: "docs" }).click()
  await expect(docs.locator(".orchestra-docs-entry")).toHaveText([
    "README.md",
    "AGENTS.md",
    "docs",
    "guide.md",
    "notes.mdx",
  ])
  await docs.getByRole("button", { name: "README.md" }).click()
  await expect(docs.getByRole("heading", { name: "Cockpit readme" })).toBeVisible()
  // A link that climbs above the workspace stays inert; a web link opens outside the app.
  await docs.getByRole("link", { name: "escape" }).click()
  await expect(docs.locator(".orchestra-dock-path")).toHaveText("README.md")
  await docs.getByRole("link", { name: "the site" }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened))
    .toEqual(["https://example.org/site"])
  await docs.getByRole("link", { name: "the guide" }).click()
  await expect(docs.locator(".orchestra-dock-path")).toHaveText("docs/guide.md")
  await expect(docs.getByRole("heading", { name: "Guide" })).toBeVisible()
  expect(page.url()).toContain(`/session/${parentID}`)

  // Selecting the Terminal pane starts nothing.
  await pane(dock, "Terminal").click()
  await expect(dock.getByRole("tabpanel")).toContainText("No terminal is open in this workspace.")
  await expect(dock.getByRole("button", { name: "New terminal" })).toBeVisible()
  expect(ptys.filter((request) => request.startsWith("POST"))).toEqual([])

  // Each pane keeps its place when it comes back.
  await pane(dock, "Docs").click()
  await expect(docs.locator(".orchestra-dock-path")).toHaveText("docs/guide.md")
  await pane(dock, "Files").click()
  await expect(files.locator(".orchestra-dock-path")).toHaveText("package.json")
  await shoot(page, "cockpit-web")
})

test("switching panes hides and shows the same native tab, and its bounds follow the Dock", async ({ page }) => {
  await setup(page, { bridge: true })
  await openCockpit(page)
  const dock = dockCard(page)
  await expect(dock.getByRole("status")).toHaveText("No tabs open. Enter an address to start browsing.")
  const address = dock.getByRole("textbox", { name: "Address" })
  await address.fill("https://example.com/a")
  await address.press("Enter")
  const tab = { tabID: "tab-1", generation: 1 }
  await expect(dock.locator(".zen-tab", { hasText: "Page /a" })).toHaveAttribute("aria-selected", "true")
  await expect.poll(() => boundsInSync(page, dock)).toBe("in sync")
  const opened = (await calls(page)).length

  for (const name of ["Files", "Docs", "Terminal"]) {
    await pane(dock, name).click()
    await expect(dock.locator(".zen-browser-host")).toHaveCount(0)
  }
  await pane(dock, "Browser").click()
  await expect(dock.locator(".zen-tab", { hasText: "Page /a" })).toHaveAttribute("aria-selected", "true")
  await expect(address).toHaveValue("https://example.com/a")
  await expect
    .poll(async () => (await calls(page)).slice(opened).filter((call) => call.type === "select"))
    .toHaveLength(1)
  const moves = (await calls(page)).slice(opened)
  // Leaving Browser hides the tab by name; returning selects the same tab and generation. Nothing reopens.
  expect(moves.filter((call) => ["open", "close", "close-tab", "navigate"].includes(call.type))).toEqual([])
  expect(moves.filter((call) => call.type === "hide")).toEqual([{ type: "hide", ...tab }])
  expect(
    moves.filter((call) => call.type === "select").map(({ tabID, generation }) => ({ tabID, generation })),
  ).toEqual([tab])

  // Activity names this window's tab and brings Browser back to it.
  const activity = page.getByRole("region", { name: "Activity" })
  const row = activity.locator('[data-slot="activity-row"][data-kind="dock"]')
  await expect(row).toHaveText("DockPage /aWindow · Page ready")
  await pane(dock, "Files").click()
  await row.click()
  await expect(pane(dock, "Browser")).toHaveAttribute("aria-selected", "true")
  await expect(dock.locator(".zen-tab", { hasText: "Page /a" })).toHaveAttribute("aria-selected", "true")

  // The compact Dock follows the rail: each resize names the tab and carries the host's bounds.
  await expect.poll(() => boundsInSync(page, dock)).toBe("in sync")
  const before = await hostBounds(dock)
  await page.setViewportSize({ width: 1180, height: 760 })
  await expect.poll(() => hostBounds(dock)).not.toEqual(before)
  await expect.poll(() => boundsInSync(page, dock)).toBe("in sync")
  expect(await lastResize(page)).toMatchObject(tab)
  const anchored = await hostBounds(dock)
  await page.locator('[data-component="tasks-panel"]').getByRole("button", { name: "View all (2)" }).click()
  await expect(page.locator('[data-slot="task-stats"]')).toHaveCount(2)
  expect(await hostBounds(dock)).toEqual(anchored)
  await shoot(page, "cockpit-desktop")
  await page.locator('[data-slot="orchestra-theme-toggle"]').click()
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light")
  await shoot(page, "cockpit-desktop-light")
})

function dockCard(page: Page) {
  return page.locator(".orchestra-dock-card")
}

function pane(dock: Locator, name: string) {
  return dock.getByRole("tablist", { name: "Dock panes" }).getByRole("tab", { name, exact: true })
}

async function openCockpit(page: Page) {
  await page.goto(`/server/${base64Encode(server)}/session/${parentID}`)
  await expectSessionTitle(page, parentTitle)
  // Once the side panel mounts, the running child opens the cockpit.
  await page.getByRole("button", { name: "Toggle review" }).click()
  await expect(dockCard(page)).toBeVisible()
}

async function calls(page: Page) {
  return page.evaluate(() => structuredClone((window as unknown as { __dock: DockCall[] }).__dock))
}

async function lastResize(page: Page) {
  return (await calls(page)).filter((call) => call.type === "resize").at(-1)
}

// The last bounds sent to the desktop are the host's current box, or the mismatch for the failure message.
async function boundsInSync(page: Page, dock: Locator) {
  const resize = (await lastResize(page))?.bounds
  const host = await hostBounds(dock)
  return JSON.stringify(resize) === JSON.stringify(host) ? "in sync" : JSON.stringify({ resize, host })
}

async function hostBounds(dock: Locator) {
  return dock.locator(".zen-browser-host").evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    }
  })
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), animations: "disabled" })
}

async function setup(page: Page, options: { bridge: boolean }) {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "cockpit",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: {
            "claude-opus-4-6": { id: "claude-opus-4-6", name: "Claude Opus 4.6", limit: { context: 200_000 } },
          },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "claude-opus-4-6" },
    },
    sessions: [
      session(parentID, parentTitle, 1700000000000),
      session(child.running, "Running task (@explore subagent)", 1700000001000, { parentID }),
      session(child.failed, "Failed task (@explore subagent)", 1700000001000, { parentID }),
    ],
    sessionStatus: { [child.running]: { type: "busy" } },
    pageMessages: (sessionID) => ({ items: sessionID === parentID ? parentMessages() : [] }),
    fileList: (path) => files[path] ?? [],
    fileContent: (path) => ({ type: "text", content: contents[path] ?? "" }),
  })
  await page.addInitScript(
    ({ directory, server, sessionId }) => {
      // The tabs introduction toast would sit over the cockpit's lower cards.
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem("opencode.window.browser.dat:tabs", JSON.stringify([{ type: "session", server, sessionId }]))
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", "dark")
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      // Web links leave through window.open; record them instead of opening a page.
      const opened: string[] = []
      Object.assign(window, {
        __opened: opened,
        open: (url: string) => {
          opened.push(url)
          return null
        },
      })
    },
    { directory, server, sessionId: parentID },
  )
  if (options.bridge) await page.addInitScript(installDockBridge)
}

const node = (path: string, type: "file" | "directory" = "file") => ({
  name: path.split("/").at(-1),
  path,
  absolute: `${directory}/${path}`,
  type,
  ignored: false,
})

const files: Record<string, unknown[]> = {
  "": [node("docs", "directory"), node("src", "directory"), node("AGENTS.md"), node("README.md"), node("package.json")],
  docs: [node("docs/guide.md"), node("docs/diagram.png"), node("docs/notes.mdx")],
}

const contents: Record<string, string> = {
  "README.md":
    "# Cockpit readme\n\nSee [the guide](docs/guide.md), [the site](https://example.org/site) and [escape](../outside.md).\n",
  "AGENTS.md": "# Agents\n",
  "docs/guide.md": "# Guide\n\nGuide body.\n",
  "package.json": "cockpit-package-contents",
}

function session(id: string, title: string, created: number, extra?: Record<string, unknown>) {
  return { id, slug: id, projectID, directory, title, version: "dev", time: { created, updated: created }, ...extra }
}

function parentMessages() {
  const userID = "msg_cockpit_user"
  const assistantID = "msg_cockpit_assistant"
  const task = (callID: string, sessionId: string, description: string, state: Record<string, unknown>) => ({
    id: `prt_${callID}`,
    sessionID: parentID,
    messageID: assistantID,
    type: "tool",
    callID,
    tool: "task",
    state: { input: { description, subagent_type: "explore" }, metadata: { sessionId }, ...state },
  })
  return [
    {
      info: {
        id: userID,
        sessionID: parentID,
        role: "user",
        time: { created: 1700000000000 },
        agent: "build",
        model: { providerID: "opencode", modelID: "claude-opus-4-6" },
      },
      parts: [{ id: "prt_cockpit_user", sessionID: parentID, messageID: userID, type: "text", text: "Delegate" }],
    },
    {
      info: {
        id: assistantID,
        sessionID: parentID,
        role: "assistant",
        time: { created: 1700000001000 },
        parentID: userID,
        modelID: "claude-opus-4-6",
        providerID: "opencode",
        mode: "build",
        agent: "build",
        path: { cwd: directory, root: directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      parts: [
        task("call_running", child.running, "Running task", {
          status: "running",
          title: "Running task",
          time: { start: 1700000001000 },
        }),
        task("call_failed", child.failed, "Failed task", {
          status: "error",
          error: `Subagent failed (task_id: ${child.failed}): boom`,
          time: { start: 1700000001000, end: 1700000003000 },
        }),
      ],
    },
  ]
}

// A fake of the desktop preload bridge that records every native call, with the bounds it carries.
function installDockBridge() {
  const calls: DockCall[] = []
  const listeners = new Set<(event: unknown) => void>()
  let manifest = {
    version: 1,
    revision: 0,
    profiles: [{ id: "default", name: "Personal" }],
    activeProfileID: "default",
    tabs: {} as Record<string, { url: string; pinned: boolean }[]>,
    bookmarks: [] as string[],
    history: [] as string[],
  }
  let next = 0
  const emit = (event: unknown) => setTimeout(() => listeners.forEach((listener) => listener(event)), 0)
  type Identity = { tabID: string; generation: number }
  type Bounds = { x: number; y: number; width: number; height: number }
  const api = {
    appDockOpen: async (url: string, _bounds: Bounds, profile = "default") => {
      calls.push({ type: "open", url })
      const opened = { tabID: `tab-${++next}`, generation: next, url }
      if (!manifest.profiles.some((item) => item.id === profile))
        manifest = {
          ...manifest,
          revision: manifest.revision + 1,
          profiles: [...manifest.profiles, { id: profile, name: profile }],
          tabs: { ...manifest.tabs, [profile]: [] },
        }
      emit({
        type: "state",
        payload: { ...opened, title: `Page ${new URL(url).pathname}`, loading: false, audible: false },
      })
      return opened
    },
    appDockSelect: async (tab: Identity, bounds: Bounds) => {
      calls.push({ type: "select", tabID: tab.tabID, generation: tab.generation, bounds })
    },
    appDockHide: async (tab: Identity) => {
      calls.push({ type: "hide", tabID: tab.tabID, generation: tab.generation })
    },
    appDockResize: async (tab: Identity, bounds: Bounds) => {
      calls.push({ type: "resize", tabID: tab.tabID, generation: tab.generation, bounds })
    },
    appDockOcclude: async () => undefined,
    appDockClose: async () => {
      calls.push({ type: "close" })
    },
    appDockCloseTab: async (tabID: string) => {
      calls.push({ type: "close-tab", tabID })
    },
    appDockNavigate: async (tabID: string, url: string) => {
      calls.push({ type: "navigate", tabID, url })
    },
    appDockCommand: async () => undefined,
    appDockFindResult: () => () => undefined,
    appDockEvent: (listener: (event: unknown) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    appDockGetManifest: async () => structuredClone(manifest),
    appDockUpdateManifest: async (revision: number, value: typeof manifest) => {
      if (revision !== manifest.revision) return { status: "conflict", manifest: structuredClone(manifest) }
      manifest = { ...structuredClone(value), revision: revision + 1 }
      return { status: "updated", manifest: structuredClone(manifest) }
    },
  }
  Object.assign(window, { api, __dock: calls })
}
