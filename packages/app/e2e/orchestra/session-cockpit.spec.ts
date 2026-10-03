import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"
import { installDockBridge, type DockCall } from "./session-cockpit-bridge"

const directory = "/work/cockpit"
const projectID = "proj_cockpit"
const parentID = "ses_cockpit_parent"
const parentTitle = "Cockpit parent"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const child = { running: "ses_cockpit_running", failed: "ses_cockpit_failed" }

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" })
test.setTimeout(120_000)

test("the Apps tab shows the Dock, Tasks and Activity together, with local panes", async ({ page }) => {
  const ptys: string[] = []
  const reads: string[] = []
  const lists: string[] = []
  await setup(page, { bridge: false, reads, lists })
  await page.route(
    (url) => url.port === new URL(server).port && url.pathname.startsWith("/pty"),
    (route) => {
      ptys.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    },
  )
  await openCockpit(page)
  await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("Keep this cockpit draft")
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
  await shoot(page, "cockpit-web-unavailable")
  expect(reads).toEqual([])
  expect(lists).not.toContain("docs")

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
  expect(reads).toEqual(["package.json"])
  await expect(dock).toBeVisible()
  await expect(tasks).toBeVisible()

  await pane(dock, "Docs").click()
  const docs = dock.getByRole("tabpanel")
  await expect(docs.locator(".orchestra-docs-entry")).toHaveText(["README.md", "AGENTS.md", "docs"])
  expect(lists).not.toContain("docs")
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
  await shoot(page, "cockpit-docs")
  expect(reads).toEqual(["package.json", "README.md", "docs/guide.md"])
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
  expect(reads).toEqual(["package.json", "README.md", "docs/guide.md"])
  await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toHaveText("Keep this cockpit draft")
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
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __dockSubscriptions: number }).__dockSubscriptions))
    .toBe(1)
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
  await page.locator('[data-component="tasks-panel"]').getByRole("button", { name: "Show less" }).click()
  await expect(activity.getByRole("heading", { name: "Activity" })).toBeInViewport()
  await shoot(page, "cockpit-desktop")
  await page.locator('[data-slot="orchestra-theme-toggle"]').click()
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light")
  await shoot(page, "cockpit-desktop-light")
})

test("address drafts survive title events and lazy pane switches; Escape restores the current URL", async ({
  page,
}) => {
  await setup(page, { bridge: true })
  await openCockpit(page)
  const dock = dockCard(page)
  await expect(dock.getByRole("status")).toHaveText("No tabs open. Enter an address to start browsing.")
  const address = dock.getByRole("textbox", { name: "Address" })
  await expect(address).toBeEnabled()
  await address.fill("https://example.com/a")
  await address.press("Enter")
  await expect(dock.locator(".zen-tab", { hasText: "Page /a" })).toHaveAttribute("aria-selected", "true")
  await address.fill("https://example.com/draft?keep=1")
  await page.evaluate(() =>
    (window as unknown as { __dockEmit: (event: unknown) => void }).__dockEmit({
      type: "state",
      payload: { tabID: "tab-1", generation: 1, url: "https://example.com/a", title: "Updated title", loading: false },
    }),
  )
  await expect(dock.locator(".zen-tab-title")).toHaveText("Updated title")
  await expect(address).toBeFocused()
  await expect(address).toHaveValue("https://example.com/draft?keep=1")
  await pane(dock, "Files").click()
  await pane(dock, "Browser").click()
  await expect(address).toHaveValue("https://example.com/draft?keep=1")
  await address.press("Escape")
  await expect(address).toHaveValue("https://example.com/a")
  expect((await calls(page)).filter((call) => call.type === "navigate")).toEqual([])
  const activityTask = page.getByRole("region", { name: "Activity" }).getByRole("button", {
    name: "Agent Running task Session · Running",
    exact: true,
  })
  await activityTask.focus()
  await expect(activityTask).toBeFocused()
  await page.evaluate(() =>
    (window as unknown as { __dockEmit: (event: unknown) => void }).__dockEmit({
      type: "state",
      payload: { tabID: "tab-1", generation: 1, url: "https://example.com/a", title: "Final title", loading: false },
    }),
  )
  await expect(dock.locator(".zen-tab-title")).toHaveText("Final title")
  await expect(activityTask).toBeFocused()
})

test("65 active tasks remain reachable in bounded Tasks and Activity details", async ({ page }) => {
  await setup(page, { bridge: true, many: true })
  await openCockpit(page)
  const tasks = page.locator('[data-component="tasks-panel"]')
  const activity = page.getByRole("region", { name: "Activity" })
  await expect(tasks.locator('[data-slot="tasks-count"]')).toHaveText("65 tasks")
  await expect(tasks.locator('[data-slot="task-row"]')).toHaveCount(3)
  await expect(tasks.getByRole("button", { name: "Failed 1", exact: true })).toBeVisible()
  await tasks.getByRole("button", { name: "View all (66)" }).click()
  const running = tasks.getByRole("list", { name: "Running", exact: true })
  await expect(running.locator('[aria-setsize="65"]')).not.toHaveCount(0)
  expect(await tasks.locator('[data-slot="task-row"]').count()).toBeLessThan(30)
  await running.locator('[aria-posinset="1"] [data-slot="task-row"]').focus()
  await page.keyboard.press("End")
  const last = running.locator('[data-slot="task-row"]').filter({ hasText: "Running task" })
  await expect(last).toBeFocused()
  await expect(last.getByRole("button", { name: "Stop task" })).toBeEnabled()
  expect(await running.locator('[data-slot="task-row"]').count()).toBeLessThan(30)
  await tasks.getByRole("button", { name: "Show less" }).click()

  await activity.getByRole("button", { name: "Agents", exact: true }).click()
  await activity.getByRole("button", { name: "View all (66)" }).click()
  const agents = activity.getByRole("list", { name: "Activity", exact: true })
  await expect(agents.locator('[aria-setsize="66"]')).not.toHaveCount(0)
  expect(await activity.locator('[data-slot="activity-row"]').count()).toBeLessThan(30)
  await agents.locator('[aria-posinset="1"] button').focus()
  await page.keyboard.press("End")
  const lastAgent = activity.getByRole("button", { name: "Agent Running task Session · Running", exact: true })
  await expect(lastAgent).toBeFocused()
  await lastAgent.click()
  await expect(page).toHaveURL(new RegExp(`/server/${base64Encode(server)}/session/${child.running}$`))
})

test("Terminal hands one existing PTY renderer between Dock and bottom panel", async ({ page }) => {
  await setup(page, { bridge: false })
  const requests: string[] = []
  const connections: string[] = []
  await page.route(
    (url) => url.port === new URL(server).port && url.pathname.startsWith("/pty"),
    (route) => {
      const path = new URL(route.request().url()).pathname
      requests.push(`${route.request().method()} ${path}`)
      const pty = {
        id: "pty_cockpit",
        title: "Terminal 1",
        command: "/bin/sh",
        args: [],
        cwd: directory,
        status: "running",
        pid: 1,
      }
      const body = path.endsWith("connect-token") ? { ticket: "cockpit-ticket", expires_in: 60 } : pty
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    },
  )
  await page.routeWebSocket(/\/pty\/pty_cockpit\/connect/, (ws) => {
    connections.push(new URL(ws.url()).pathname)
    ws.send("cockpit-pty-buffer\r\n")
  })
  await openCockpit(page)
  const dock = dockCard(page)
  await pane(dock, "Terminal").click()
  await expect(dock.getByRole("button", { name: "New terminal" })).toBeVisible()
  expect(requests).toEqual([])
  await dock.getByRole("button", { name: "New terminal" }).click()
  await expect.poll(() => connections.length).toBe(1)
  await expect(dock.locator('[data-component="terminal"] canvas')).toBeVisible()
  await page.keyboard.press("Control+Backquote")
  await expect(page.locator('#terminal-panel [data-component="terminal"] canvas')).toBeVisible()
  await expect(dock.getByRole("status").locator("span")).toHaveText("This terminal is shown in the bottom panel.")
  await expect(dock.getByRole("button", { name: "Show here", exact: true })).toBeVisible()
  await expect(page.locator('[data-component="terminal"]')).toHaveCount(1)
  await pane(dock, "Browser").click()
  await pane(dock, "Terminal").click()
  await expect(dock.locator('[data-component="terminal"] canvas')).toBeVisible()
  await expect(page.locator('#terminal-panel [data-component="terminal"]')).toHaveCount(0)
  await expect(page.locator('[data-component="terminal"]')).toHaveCount(1)
  await pane(dock, "Docs").click()
  await expect(page.locator('#terminal-panel [data-component="terminal"] canvas')).toBeVisible()
  await expect(page.locator('[data-component="terminal"]')).toHaveCount(1)
  expect(requests.filter((request) => request.startsWith("POST /pty"))).toEqual([
    "POST /pty",
    ...Array.from({ length: connections.length }, () => "POST /pty/pty_cockpit/connect-token"),
  ])
  expect(requests.filter((request) => request.startsWith("DELETE"))).toEqual([])
  expect(new Set(connections)).toEqual(new Set(["/pty/pty_cockpit/connect"]))
  await shoot(page, "cockpit-terminal")
})

test("Docs render MDX as text and preserve a denied read with explicit retry", async ({ page }) => {
  await setup(page, { bridge: false })
  await openCockpit(page)
  const dock = dockCard(page)
  await pane(dock, "Docs").click()
  await dock.getByRole("button", { name: "docs", exact: true }).click()
  await dock.getByRole("button", { name: "notes.mdx", exact: true }).click()
  await expect(dock.locator("pre")).toHaveText("export default () => <button>Never execute MDX</button>")
  await expect(dock.getByRole("button", { name: "Never execute MDX" })).toHaveCount(0)
  await dock.getByRole("button", { name: "Docs", exact: true }).click()
  const attempts: string[] = []
  await page.route("**/file/content*", (route) => {
    const path = new URL(route.request().url()).searchParams.get("path")
    if (path !== "AGENTS.md") return route.fallback()
    attempts.push(path)
    return route.fulfill({
      status: attempts.length === 1 ? 403 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        attempts.length === 1
          ? { name: "UnknownError", data: { message: "Read denied" } }
          : { type: "text", content: "# Retry loaded" },
      ),
    })
  })
  await dock.getByRole("button", { name: "AGENTS.md", exact: true }).click()
  await expect(dock.getByRole("alert")).toContainText("Read denied")
  await expect(dock.locator(".orchestra-dock-path")).toHaveText("AGENTS.md")
  await dock.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(dock.getByRole("heading", { name: "Retry loaded" })).toBeVisible()
  expect(attempts).toEqual(["AGENTS.md", "AGENTS.md"])
})

test("Dock roving tabs follow LTR and RTL with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await setup(page, { bridge: false })
  await openCockpit(page)
  const dock = dockCard(page)
  await pane(dock, "Browser").focus()
  await page.keyboard.press("ArrowRight")
  await expect(pane(dock, "Files")).toBeFocused()
  await expect(pane(dock, "Files")).toHaveAttribute("aria-selected", "true")
  await page.evaluate(() => (document.documentElement.dir = "rtl"))
  await page.keyboard.press("ArrowLeft")
  await expect(pane(dock, "Docs")).toBeFocused()
  await expect(pane(dock, "Docs")).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("End")
  await expect(pane(dock, "Terminal")).toBeFocused()
  await expect(dock.getByRole("tabpanel")).toHaveAccessibleName("Terminal")
  await page.keyboard.press("Home")
  await expect(pane(dock, "Browser")).toBeFocused()
  await expect(dock.getByRole("tabpanel")).toContainText("Browser unavailable here")
  await shoot(page, "cockpit-rtl-reduced-motion")
})

test("shell tasks and Activity reveal the confirmed originating turn without interrupting the parent", async ({
  page,
}) => {
  await setup(page, { bridge: false, shell: true })
  const aborts: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/abort")) aborts.push(request.url())
  })
  await openCockpit(page)
  const shell = page
    .locator('[data-component="tasks-panel"]')
    .getByRole("button", { name: "Open execution", exact: true })
  await expect(shell.getByRole("button", { name: "Stop task" })).toHaveCount(0)
  await shell.click()
  await expect(page).toHaveURL(
    new RegExp(`/server/${base64Encode(server)}/session/${parentID}#message-msg_cockpit_user$`),
  )
  const row = page.getByRole("region", { name: "Activity" }).locator('[data-slot="activity-row"][data-kind="shell"]')
  await expect(row).toHaveCount(1)
  await row.click()
  await expect(page).toHaveURL(new RegExp(`#message-msg_cockpit_user$`))
  expect(aborts).toEqual([])
})

test("empty Docs offers the real Files pane; empty Tasks and Activity claim no work", async ({ page }) => {
  await setup(page, { bridge: false, empty: true })
  await page.goto(`/server/${base64Encode(server)}/session/${parentID}`)
  await expectSessionTitle(page, parentTitle)
  await page.getByRole("button", { name: "Toggle review" }).click()
  await page.locator('[data-slot="session-side-panel-tab-bar"]').getByRole("tab", { name: "Apps", exact: true }).click()
  const dock = dockCard(page)
  await expect(page.locator('[data-slot="task-row"]')).toHaveCount(0)
  await expect(page.getByRole("region", { name: "Activity" })).toContainText("No recent activity")
  await pane(dock, "Docs").click()
  await expect(dock.getByRole("status")).toContainText("No local documentation found")
  await dock.getByRole("button", { name: "Open in Files" }).click()
  await expect(pane(dock, "Files")).toHaveAttribute("aria-selected", "true")
  await expect(dock.getByRole("status")).toHaveText("This workspace has no files to show.")
  await shoot(page, "cockpit-empty")
})

test("Arabic locale keeps pane order logical and code paths LTR", async ({ page }) => {
  await setup(page, { bridge: false, locale: "ar" })
  await page.goto(`/server/${base64Encode(server)}/session/${parentID}`)
  await expectSessionTitle(page, parentTitle)
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  // Existing Arabic dictionary copy, not a translation supplied by this fixture.
  await page.getByRole("button", { name: "تبديل المراجعة" }).click()
  const dock = dockCard(page)
  await pane(dock, "Browser").focus()
  await page.keyboard.press("ArrowLeft")
  await expect(pane(dock, "Files")).toBeFocused()
  await page.keyboard.press("ArrowLeft")
  await expect(pane(dock, "Docs")).toBeFocused()
  await dock.getByRole("button", { name: "README.md", exact: true }).click()
  await expect(dock.locator(".orchestra-dock-path")).toHaveAttribute("dir", "ltr")
  await expect(dock.getByRole("heading", { name: "Cockpit readme" })).toBeVisible()
  await shoot(page, "cockpit-arabic")
})

function dockCard(page: Page) {
  return page.locator(".orchestra-dock-card")
}

function pane(dock: Locator, name: string) {
  return dock.getByRole("tablist", { name: "Dock panes" }).getByRole("tab", { name, exact: true })
}

async function openCockpit(page: Page) {
  await page.goto(`/server/${base64Encode(server)}/session/${parentID}`, { waitUntil: "domcontentloaded" })
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

async function setup(
  page: Page,
  options: {
    bridge: boolean
    many?: boolean
    empty?: boolean
    shell?: boolean
    locale?: "ar"
    reads?: string[]
    lists?: string[]
  },
) {
  const extra = options.many
    ? Array.from({ length: 64 }, (_, index) =>
        session(`ses_cockpit_extra_${index}`, `Background ${index}`, 1700000010000 + index, { parentID }),
      )
    : []
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
      ...(options.empty
        ? []
        : [
            session(child.running, "Running task (@explore subagent)", 1700000001000, { parentID }),
            session(child.failed, "Failed task (@explore subagent)", 1700000001000, { parentID }),
          ]),
      ...extra,
    ],
    sessionStatus: options.empty
      ? {}
      : { [child.running]: { type: "busy" }, ...Object.fromEntries(extra.map((item) => [item.id, { type: "busy" }])) },
    pageMessages: (sessionID) => ({
      items: !options.empty && sessionID === parentID ? parentMessages(options.shell) : [],
    }),
    fileList: (path) => {
      options.lists?.push(path)
      return options.empty ? [] : (files[path] ?? [])
    },
    fileContent: (path) => {
      options.reads?.push(path)
      return { type: "text", content: contents[path] ?? "" }
    },
  })
  await page.addInitScript(
    ({ directory, server, sessionId, locale }) => {
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
      localStorage.setItem("language.v1", JSON.stringify({ locale }))
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
    { directory, server, sessionId: parentID, locale: options.locale ?? "en" },
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
  "docs/notes.mdx": "export default () => <button>Never execute MDX</button>",
  "package.json": "cockpit-package-contents",
}

function session(id: string, title: string, created: number, extra?: Record<string, unknown>) {
  return { id, slug: id, projectID, directory, title, version: "dev", time: { created, updated: created }, ...extra }
}

function parentMessages(shell = false) {
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
        ...(shell
          ? [
              {
                id: "prt_shell",
                sessionID: parentID,
                messageID: assistantID,
                type: "tool",
                callID: "call_shell",
                tool: "shell",
                state: {
                  status: "running",
                  input: { command: "pwd" },
                  title: "Inspect workspace",
                  metadata: {},
                  time: { start: 1700000002000 },
                },
              },
            ]
          : []),
      ],
    },
  ]
}
