import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { expectSessionTitle } from "../utils/waits"
import type { DockCall } from "./session-cockpit-bridge"
import {
  child,
  directory,
  dockCard,
  openCockpit,
  pane,
  parentID,
  parentTitle,
  railTab,
  server,
  setupCockpit,
} from "./session-cockpit.fixture"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" })
test.setTimeout(120_000)

test("the Apps tab hosts only the Dock and the Tasks tab holds Tasks and Activity, with local panes", async ({
  page,
}) => {
  const ptys: string[] = []
  const reads: string[] = []
  const lists: string[] = []
  await setupCockpit(page, { bridge: false, reads, lists })
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
  const count = '[data-slot="session-side-panel-tab-count"]'
  await expect(bar.getByRole("tab")).toHaveText([/^Review/, "Context", /^Tasks/, "Apps"])
  await expect(railTab(page, "apps")).toHaveAttribute("aria-selected", "true")
  // The live count belongs to the Tasks tab, as in the approved rail; Apps carries none.
  await expect(railTab(page, "tasks").locator(count)).toHaveText("1")
  await expect(railTab(page, "apps").locator(count)).toHaveCount(0)

  // Apps hosts the Dock alone; Tasks and Activity live in the Tasks tab.
  const dock = dockCard(page)
  const tasks = page.locator('[data-component="tasks-panel"][data-variant="summary"]')
  const activity = page.getByRole("region", { name: "Activity" })
  await expect(dock).toBeVisible()
  await expect(tasks).toHaveCount(0)
  await expect(activity).toHaveCount(0)
  await expect(dock.getByRole("tab")).toHaveText(["Browser", "Files", "Docs", "Terminal"])
  await expect(pane(dock, "Browser")).toHaveAttribute("aria-selected", "true")
  await expect(dock.getByRole("tabpanel")).toContainText("Browser unavailable here")
  await shoot(page, "cockpit-web-unavailable")
  expect(reads).toEqual([])
  expect(lists).not.toContain("docs")

  await railTab(page, "tasks").click()
  await expect(railTab(page, "tasks")).toHaveAttribute("aria-selected", "true")
  await expect(dock).toHaveCount(0)
  await expect(tasks).toBeVisible()
  await expect(activity).toBeVisible()

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

  // Back in Apps the Dock remounts on the pane it had.
  await railTab(page, "apps").click()
  await expect(pane(dock, "Browser")).toHaveAttribute("aria-selected", "true")
  await pane(dock, "Files").click()
  const files = dock.getByRole("tabpanel")
  await files.getByText("package.json", { exact: true }).click()
  await expect(files.locator(".orchestra-dock-path")).toHaveText("package.json")
  await expect(files.getByText("cockpit-package-contents", { exact: true })).toBeVisible()
  expect(reads).toEqual(["package.json"])
  await expect(dock).toBeVisible()
  await expect(tasks).toHaveCount(0)

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
  await setupCockpit(page, { bridge: true })
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

  // Activity, in the Tasks tab, names this window's tab and brings Apps and its Browser back to it.
  const activity = page.getByRole("region", { name: "Activity" })
  const row = activity.locator('[data-slot="activity-row"][data-kind="dock"]')
  await pane(dock, "Files").click()
  await railTab(page, "tasks").click()
  await expect(dock).toHaveCount(0)
  await expect(row).toHaveText("DockPage /aWindow · Page ready")
  await row.click()
  await expect(railTab(page, "apps")).toHaveAttribute("aria-selected", "true")
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
  // Leaving Apps hides the native tab by name; the Tasks detail cannot move a Dock it does not share.
  const left = (await calls(page)).length
  await railTab(page, "tasks").click()
  await expect(dock).toHaveCount(0)
  await expect
    .poll(async () => (await calls(page)).slice(left).filter((call) => call.type === "hide"))
    .toEqual([{ type: "hide", ...tab }])
  await page.locator('[data-component="tasks-panel"]').getByRole("button", { name: "View all (2)" }).click()
  await expect(page.locator('[data-slot="task-stats"]')).toHaveCount(2)
  await page.locator('[data-component="tasks-panel"]').getByRole("button", { name: "Show less" }).click()
  await expect(activity.getByRole("heading", { name: "Activity" })).toBeInViewport()
  // Returning selects the same tab and generation in the same bounds; nothing reopens.
  await railTab(page, "apps").click()
  await expect.poll(() => boundsInSync(page, dock)).toBe("in sync")
  await expect.poll(() => hostBounds(dock)).toEqual(anchored)
  const back = (await calls(page)).slice(left)
  expect(back.filter((call) => ["open", "close", "close-tab", "navigate"].includes(call.type))).toEqual([])
  expect(back.filter((call) => call.type === "select").map(({ tabID, generation }) => ({ tabID, generation }))).toEqual([
    tab,
  ])
  await shoot(page, "cockpit-desktop")
  await page.locator('[data-slot="orchestra-theme-toggle"]').click()
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light")
  await shoot(page, "cockpit-desktop-light")
})

test("address drafts survive title events and lazy pane switches; Escape restores the current URL", async ({
  page,
}) => {
  await setupCockpit(page, { bridge: true })
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
  // Activity reads the Dock's state from the Tasks tab, so title events reach it without taking focus.
  await railTab(page, "tasks").click()
  const activity = page.getByRole("region", { name: "Activity" })
  const activityTask = activity.getByRole("button", {
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
  await expect(activity.locator('[data-slot="activity-row"][data-kind="dock"]')).toContainText("Final title")
  await expect(activityTask).toBeFocused()
  await railTab(page, "apps").click()
  await expect(dock.locator(".zen-tab-title")).toHaveText("Final title")
})

test("65 active tasks remain reachable in bounded Tasks and Activity details", async ({ page }) => {
  await setupCockpit(page, { bridge: true, many: true })
  await openCockpit(page)
  await railTab(page, "tasks").click()
  await expect(railTab(page, "tasks").locator('[data-slot="session-side-panel-tab-count"]')).toHaveText("65")
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
  await setupCockpit(page, { bridge: false })
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
  // "Show here" takes the terminal from the bottom panel, so leaving the pane must give it back.
  await dock.getByRole("button", { name: "Show here", exact: true }).click()
  await expect(dock.locator('[data-component="terminal"] canvas')).toBeVisible()
  await expect(page.locator('#terminal-panel [data-component="terminal"]')).toHaveCount(0)
  await pane(dock, "Browser").click()
  await expect(page.locator('#terminal-panel [data-component="terminal"] canvas')).toBeVisible()
  await pane(dock, "Terminal").click()
  await expect(dock.locator('[data-component="terminal"] canvas')).toBeVisible()
  await expect(page.locator('#terminal-panel [data-component="terminal"]')).toHaveCount(0)
  await expect(page.locator('[data-component="terminal"]')).toHaveCount(1)
  await expect(pane(dock, "Terminal")).toHaveAttribute("aria-selected", "true")
  await shoot(page, "cockpit-terminal-selected")
  await pane(dock, "Docs").click()
  await expect(page.locator('#terminal-panel [data-component="terminal"] canvas')).toBeVisible()
  await expect(page.locator('[data-component="terminal"]')).toHaveCount(1)
  // Each handoff reconnects with a fresh ticket; the socket for the latest ticket can open just after the
  // canvas paints, so wait for every ticket to be spent before comparing.
  await expect
    .poll(() => requests.filter((request) => request.endsWith("/connect-token")).length - connections.length)
    .toBe(0)
  expect(requests.filter((request) => request.startsWith("POST /pty"))).toEqual([
    "POST /pty",
    ...Array.from({ length: connections.length }, () => "POST /pty/pty_cockpit/connect-token"),
  ])
  expect(requests.filter((request) => request.startsWith("DELETE"))).toEqual([])
  expect(new Set(connections)).toEqual(new Set(["/pty/pty_cockpit/connect"]))
  await shoot(page, "cockpit-terminal")
})

test("Docs render MDX as text and preserve a denied read with explicit retry", async ({ page }) => {
  await setupCockpit(page, { bridge: false })
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
  await setupCockpit(page, { bridge: false })
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
  await setupCockpit(page, { bridge: false, shell: true })
  const aborts: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/abort")) aborts.push(request.url())
  })
  await openCockpit(page)
  await railTab(page, "tasks").click()
  // The row is named by what it shows; where it leads is its description.
  const shell = page.locator('[data-component="tasks-panel"]').getByRole("button", { name: /^Inspect workspace/ })
  await expect(shell).toHaveAccessibleDescription("Open execution")
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
  await setupCockpit(page, { bridge: false, empty: true })
  await page.goto(`/server/${base64Encode(server)}/session/${parentID}`)
  await expectSessionTitle(page, parentTitle)
  await page.getByRole("button", { name: "Toggle review" }).click()
  // Without live work nothing opens Tasks for the user; its count reads zero.
  await expect(railTab(page, "review")).toHaveAttribute("aria-selected", "true")
  await expect(railTab(page, "tasks").locator('[data-slot="session-side-panel-tab-count"]')).toHaveText("0")
  await railTab(page, "tasks").click()
  await expect(page.locator('[data-component="tasks-panel"]')).toBeVisible()
  await expect(page.locator('[data-slot="task-row"]')).toHaveCount(0)
  await expect(page.getByRole("region", { name: "Activity" })).toContainText("No recent activity")
  await railTab(page, "apps").click()
  const dock = dockCard(page)
  await pane(dock, "Docs").click()
  await expect(dock.getByRole("status")).toContainText("No local documentation found")
  await dock.getByRole("button", { name: "Open in Files" }).click()
  await expect(pane(dock, "Files")).toHaveAttribute("aria-selected", "true")
  await expect(dock.getByRole("status")).toHaveText("This workspace has no files to show.")
  await shoot(page, "cockpit-empty")
})

test("Arabic locale keeps pane order logical and code paths LTR", async ({ page }) => {
  await setupCockpit(page, { bridge: false, locale: "ar" })
  await page.goto(`/server/${base64Encode(server)}/session/${parentID}`)
  await expectSessionTitle(page, parentTitle)
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  // Existing Arabic dictionary copy, not a translation supplied by this fixture.
  await page.getByRole("button", { name: "تبديل المراجعة" }).click()
  await expect(railTab(page, "tasks")).toHaveAttribute("aria-selected", "true")
  await railTab(page, "apps").click()
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

// The cockpit sits in side-panel tab panels with `contain: strict`, which become the containing block
// of a fixed menu drawn inside them: the menu must still open at its trigger.
test.describe("Dock tab menu at the cockpit's geometry", () => {
  test.use({ viewport: { width: 1672, height: 941 } })

  for (const locale of ["en", "ar"] as const) {
    test(`the tab menu opens at its trigger (${locale === "ar" ? "RTL" : "LTR"})`, async ({ page }) => {
      const rtl = await openTabs(page, locale, 2)
      const dock = dockCard(page)
      const trigger = dock.locator(".zen-tab", { hasText: "Page /a" })
      const menu = page.getByRole("menu", { name: "Actions for Page /a" })
      const tab = await rect(trigger)
      const start = rtl ? "right" : "left"

      // A pointer opens the menu with its inline-start corner on the pointer.
      const point = { x: Math.round(tab.left + tab.width / 2), y: Math.round(tab.top + tab.height / 2) }
      await page.mouse.click(point.x, point.y, { button: "right" })
      await expect(menu).toBeVisible()
      await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeFocused()
      await expectAnchored(page, menu, point, { x: start, y: "top" })
      await shoot(page, `tab-menu-pointer-${rtl ? "rtl" : "ltr"}`)
      await page.keyboard.press("Escape")
      await expect(menu).toHaveCount(0)
      await expect(trigger).toBeFocused()

      // The keyboard opens it under the trigger, from the trigger's inline-start edge.
      await page.keyboard.press("Shift+F10")
      await expect(menu).toBeVisible()
      await expectAnchored(
        page,
        menu,
        { x: rtl ? tab.right - 8 : tab.left + 8, y: tab.bottom + 4 },
        { x: start, y: "top" },
      )
      await shoot(page, `tab-menu-keyboard-${rtl ? "rtl" : "ltr"}`)
      await menu.getByRole("menuitem", { name: "Pin", exact: true }).click()
      await expect(menu).toHaveCount(0)
      await expect(dock.locator(".zen-tab", { hasText: "Page /a" })).toContainText("Pinned")
    })

    // The Dock card sits at the window's inline-end edge, so the last tab's menu would leave the window.
    test(`the tab menu flips inside the window at its edges (${locale === "ar" ? "RTL" : "LTR"})`, async ({ page }) => {
      const rtl = await openTabs(page, locale, 4)
      const dock = dockCard(page)
      const tabs = dock.locator(".zen-tab")
      const menu = page.getByRole("menu", { name: "Actions for Page /" })
      const width = page.viewportSize()!.width
      const end = rtl ? "left" : "right"
      const tab = await rect(tabs.nth(3))

      const point = { x: Math.round(rtl ? tab.left + 4 : tab.right - 4), y: Math.round(tab.top + tab.height / 2) }
      // The menu is at least 180px wide, so opening toward the inline end would cross the window's edge.
      expect(rtl ? point.x - 180 : width - point.x).toBeLessThan(rtl ? 0 : 180)
      await page.mouse.click(point.x, point.y, { button: "right" })
      await expect(menu).toBeVisible()
      await expectAnchored(page, menu, point, { x: end, y: "top" })
      await shoot(page, `tab-menu-edge-pointer-${rtl ? "rtl" : "ltr"}`)
      const size = await rect(menu)
      await page.keyboard.press("Escape")
      await expect(menu).toHaveCount(0)

      // From the keyboard it flips only if it would not fit from the trigger's inline-start edge.
      const start = rtl ? tab.right - 8 : tab.left + 8
      const fits = rtl ? start - size.width >= 0 : start + size.width <= width
      await tabs.nth(3).focus()
      await page.keyboard.press("Shift+F10")
      await expect(menu).toBeVisible()
      await expectAnchored(
        page,
        menu,
        { x: start, y: tab.bottom + 4 },
        { x: fits ? (rtl ? "right" : "left") : end, y: "top" },
      )
      await page.keyboard.press("Escape")
      await expect(menu).toHaveCount(0)

      // In a short window the menu opens upward from the pointer instead.
      await page.setViewportSize({ width, height: 460 })
      const short = await rect(tabs.nth(3))
      const low = { x: Math.round(rtl ? short.left + 4 : short.right - 4), y: Math.round(short.bottom - 2) }
      expect(low.y + size.height).toBeGreaterThan(460)
      await page.mouse.click(low.x, low.y, { button: "right" })
      await expect(menu).toBeVisible()
      await expectAnchored(page, menu, low, { x: end, y: "bottom" })
      await shoot(page, `tab-menu-edge-short-${rtl ? "rtl" : "ltr"}`)
    })
  }

  test("the tab menu roves with the arrow keys, and Tab returns to its trigger", async ({ page }) => {
    await openTabs(page, "en", 2)
    const trigger = dockCard(page).locator(".zen-tab", { hasText: "Page /a" })
    const menu = page.getByRole("menu", { name: "Actions for Page /a" })
    const item = (name: string) => menu.getByRole("menuitem", { name, exact: true })
    await trigger.click({ button: "right" })
    await expect(item("Duplicate")).toBeFocused()
    for (const [key, name] of [
      ["ArrowDown", "Pin"],
      ["ArrowDown", "Reload"],
      ["ArrowUp", "Pin"],
      ["Home", "Duplicate"],
      ["ArrowUp", "Close right"],
      ["ArrowDown", "Duplicate"],
      ["End", "Close right"],
    ] as const) {
      await page.keyboard.press(key)
      await expect(item(name)).toBeFocused()
    }
    // The menu is portaled to the end of the body: Tab must not carry focus out to the document's ends.
    await page.keyboard.press("Tab")
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await page.keyboard.press("Shift+F10")
    await expect(item("Duplicate")).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })
})

// Opens the cockpit with a page tab and `count - 1` new tabs after it, the last one selected and every
// title loaded.
async function openTabs(page: Page, locale: "en" | "ar", count: number) {
  await setupCockpit(page, { bridge: true, locale })
  await page.goto(`/server/${base64Encode(server)}/session/${parentID}`, { waitUntil: "domcontentloaded" })
  await expectSessionTitle(page, parentTitle)
  const rtl = locale === "ar"
  await expect(page.locator("html")).toHaveAttribute("dir", rtl ? "rtl" : "ltr")
  // Existing dictionary copy for the review toggle, not a translation supplied by this fixture.
  await page.getByRole("button", { name: rtl ? "تبديل المراجعة" : "Toggle review", exact: true }).click()
  await expect(railTab(page, "tasks")).toHaveAttribute("aria-selected", "true")
  await railTab(page, "apps").click()
  const dock = dockCard(page)
  await expect(dock).toBeVisible()
  const address = dock.getByRole("textbox", { name: "Address" })
  await address.fill("https://example.com/a")
  await address.press("Enter")
  await expect(dock.locator(".zen-tab", { hasText: "Page /a" })).toHaveAttribute("aria-selected", "true")
  for (let index = 1; index < count; index++) {
    await dock.getByRole("button", { name: "+ New tab" }).click()
    await expect(dock.locator(".zen-tab")).toHaveCount(index + 1)
    // The page's title arrives after the tab: wait for it, so no tab re-renders under an open menu.
    await expect(dock.locator(".zen-tab").nth(index).locator(".zen-tab-title")).toHaveText("Page /")
    await expect(dock.locator(".zen-tab").nth(index)).toHaveAttribute("aria-selected", "true")
  }
  return rtl
}

async function rect(locator: Locator) {
  return locator.evaluate((element) => element.getBoundingClientRect().toJSON() as DOMRect)
}

// The named corner of the menu sits on the anchor and the menu lies inside the window. It is painted
// where it is laid out: nothing clips or covers it, so both ends of every item hit that item.
async function expectAnchored(
  page: Page,
  menu: Locator,
  anchor: { x: number; y: number },
  corner: { x: "left" | "right"; y: "top" | "bottom" },
) {
  const box = await rect(menu)
  expect({ x: Math.round(box[corner.x]), y: Math.round(box[corner.y]) }).toEqual({
    x: Math.round(anchor.x),
    y: Math.round(anchor.y),
  })
  const viewport = page.viewportSize()!
  expect(box.left).toBeGreaterThanOrEqual(0)
  expect(box.top).toBeGreaterThanOrEqual(0)
  expect(box.right).toBeLessThanOrEqual(viewport.width)
  expect(box.bottom).toBeLessThanOrEqual(viewport.height)
  const hits = await menu.getByRole("menuitem").evaluateAll((items) =>
    items.flatMap((item) => {
      const area = item.getBoundingClientRect()
      const middle = area.top + area.height / 2
      return [area.left + 4, area.right - 4].map((x) => document.elementFromPoint(x, middle) === item)
    }),
  )
  expect(hits).toEqual(Array(12).fill(true))
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
