import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page, type Route } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const directory = "/work/terminal-create"
const projectID = "proj_terminal_create"
const sessionID = "ses_terminal_create"
const title = "Terminal creation"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const pty = {
  id: "pty_created",
  title: "Terminal 1",
  command: "/bin/sh",
  args: [],
  cwd: directory,
  status: "running",
  pid: 1,
}
const location = { directory, project: { id: projectID, directory } }

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", colorScheme: "light" })

for (const protocol of ["v1", "v2"] as const) {
  test(`${protocol}: cockpit shows creation failure and explicit retry without duplicate requests`, async ({
    page,
  }) => {
    const pending: Route[] = []
    const app = await setup(page, protocol, async (route) => {
      pending.push(route)
    })
    const dock = await openTerminal(page)
    const create = dock.getByRole("button", { name: "New terminal", exact: true })
    await expect(create).toBeEnabled()
    expect(app.creates).toHaveLength(0)
    await create.click()
    await expect(create).toBeDisabled()
    await expect(create).toHaveAttribute("aria-busy", "true")
    await expect(dock.getByRole("status")).toContainText("Loading terminal...")
    await expect.poll(() => pending.length).toBe(1)
    // Exercise a queued duplicate click even though the native button is already disabled.
    await create.dispatchEvent("click")
    await pending.shift()!.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ name: "UnknownError", data: { message: "PTY create denied" } }),
    })
    const alert = dock.getByRole("alert")
    await expect(alert).toHaveAccessibleName("New terminal")
    await expect(alert).toContainText("Request failed")
    await expect(alert.locator("span")).toHaveText(protocol === "v1" ? "PTY create denied" : "UnexpectedStatus")
    await expect(dock.locator('[data-component="terminal"]')).toHaveCount(0)
    await expect(alert.getByRole("button", { name: "Retry", exact: true })).toBeEnabled()
    expect(app.creates).toHaveLength(1)
    expect(app.connections).toHaveLength(0)
    await page.screenshot({
      path: test.info().outputPath(`terminal-create-${protocol}-failed.png`),
      animations: "disabled",
    })

    await alert.getByRole("button", { name: "Retry", exact: true }).click()
    await expect(create).toBeDisabled()
    await expect.poll(() => pending.length).toBe(1)
    await pending.shift()!.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(protocol === "v1" ? pty : { location, data: pty }),
    })
    await expect(dock.locator('[data-component="terminal"] canvas')).toBeVisible()
    await expect.poll(() => app.connections.length).toBe(1)
    await expect(dock.getByRole("alert")).toHaveCount(0)
    await expect(page.locator('[data-component="terminal"]')).toHaveCount(1)
    expect(app.creates).toHaveLength(2)
    expect(app.creates.map((request) => request.title)).toEqual(["Terminal 1", "Terminal 1"])
    expect(app.errors).toEqual([])
  })
}

test("a response without a PTY ID fails visibly and retries through the same controller", async ({ page }) => {
  const app = await setup(page, "v1", (route, attempt) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(attempt === 1 ? {} : pty),
    }),
  )
  const dock = await openTerminal(page)
  await dock.getByRole("button", { name: "New terminal", exact: true }).click()
  await expect(dock.getByRole("alert")).toContainText("Request failed")
  await expect(dock.getByRole("alert").locator("span")).toHaveText("Unknown error")
  expect(app.creates).toHaveLength(1)
  expect(app.connections).toHaveLength(0)
  await dock.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(dock.locator('[data-component="terminal"] canvas')).toBeVisible()
  await expect.poll(() => app.connections.length).toBe(1)
  expect(app.creates).toHaveLength(2)
  expect(app.errors).toEqual([])
})

test("a late failure cannot set an error on a remounted cockpit pane", async ({ page }) => {
  const pending: Route[] = []
  const app = await setup(page, "v1", async (route) => {
    pending.push(route)
  })
  const dock = await openTerminal(page)
  await dock.getByRole("button", { name: "New terminal", exact: true }).click()
  await expect.poll(() => pending.length).toBe(1)
  await dock.getByRole("tab", { name: "Browser", exact: true }).click()
  await dock.getByRole("tab", { name: "Terminal", exact: true }).click()
  const failed = page.waitForEvent("console", {
    predicate: (message) => message.text().startsWith("Failed to create terminal"),
  })
  await pending
    .shift()!
    .fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "late failure" }) })
  await failed
  await expect(dock.getByRole("status")).toContainText("No terminal is open in this workspace.")
  await expect(dock.getByRole("alert")).toHaveCount(0)
  await dock.getByRole("button", { name: "New terminal", exact: true }).click()
  await expect.poll(() => pending.length).toBe(1)
  await pending.shift()!.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pty) })
  await expect(dock.locator('[data-component="terminal"] canvas')).toBeVisible()
  expect(app.creates).toHaveLength(2)
  expect(app.errors).toEqual([])
})

test("legacy fire-and-forget terminal creation remains handled and can be requested again", async ({ page }) => {
  const app = await setup(page, "v1", (route, attempt) =>
    route.fulfill({
      status: attempt === 1 ? 500 : 200,
      contentType: "application/json",
      body: JSON.stringify(attempt === 1 ? { message: "legacy failure" } : pty),
    }),
  )
  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
  await expectSessionTitle(page, title)
  const failed = page.waitForEvent("console", {
    predicate: (message) => message.text().startsWith("Failed to create terminal"),
  })
  await page.keyboard.press("Control+Backquote")
  await failed
  expect(app.creates).toHaveLength(1)
  await expect(page.locator('#terminal-panel [data-component="terminal"]')).toHaveCount(0)
  await page.keyboard.press("Control+Backquote")
  await page.keyboard.press("Control+Backquote")
  await expect(page.locator('#terminal-panel [data-component="terminal"] canvas')).toBeVisible()
  await expect.poll(() => app.connections.length).toBe(1)
  expect(app.creates).toHaveLength(2)
  expect(app.errors).toEqual([])
})

async function openTerminal(page: Page) {
  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
  await expectSessionTitle(page, title)
  await page.getByRole("button", { name: "Toggle review" }).click()
  await page.locator('[data-slot="session-side-panel-tab-bar"]').getByRole("tab", { name: "Apps", exact: true }).click()
  const dock = page.getByRole("region", { name: "Dock", exact: true })
  await dock.getByRole("tab", { name: "Terminal", exact: true }).click()
  await expect(dock.getByRole("button", { name: "New terminal", exact: true })).toBeEnabled()
  return dock
}

async function setup(page: Page, protocol: "v1" | "v2", respond: (route: Route, attempt: number) => Promise<void>) {
  const creates: { title?: string }[] = []
  const connections: string[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await mockOpenCodeServer(page, {
    protocol,
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "terminal-create",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: { all: [], connected: [], default: {} },
    sessions: [
      {
        id: sessionID,
        slug: sessionID,
        projectID,
        directory,
        title,
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
    ],
    pageMessages: () => ({ items: [] }),
  })
  const prefix = protocol === "v1" ? "/pty" : "/api/pty"
  await page.route(
    (url) => url.port === new URL(server).port && url.pathname.startsWith(prefix),
    (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === prefix && route.request().method() === "POST") {
        creates.push(route.request().postDataJSON())
        return respond(route, creates.length)
      }
      const data = path.endsWith("connect-token") ? { ticket: "terminal-create-ticket", expires_in: 60 } : pty
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(protocol === "v1" ? data : { location, data }),
      })
    },
  )
  await page.routeWebSocket(new RegExp(`${prefix}/${pty.id}/connect`), (socket) => {
    connections.push(socket.url())
    socket.send("terminal-create-ready\r\n")
  })
  await page.addInitScript(
    ({ directory, server, sessionID }) => {
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
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([{ type: "session", server, sessionId: sessionID }]),
      )
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
    },
    { directory, server, sessionID },
  )
  return { creates, connections, errors }
}
