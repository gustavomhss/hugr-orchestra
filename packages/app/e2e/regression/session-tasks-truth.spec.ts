import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"
import { railDefaulted } from "../utils/review-rail"

const directory = "C:/OpenCode/TasksTruth"
const projectID = "proj_tasks_truth"
const parentID = "ses_tasks_parent"
const parentTitle = "Tasks truth parent"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const child = {
  running: "ses_tasks_running",
  interrupted: "ses_tasks_interrupted",
  failed: "ses_tasks_failed",
  unknown: "ses_tasks_unknown",
  orphan: "ses_tasks_orphan",
}

test.use({ viewport: { width: 1440, height: 900 } })

test("tasks panel reports only the outcomes the synced data proves", async ({ page }) => {
  await setup(page)
  const panel = await openPanel(page)

  const interrupted = row(panel, "Interrupted task")
  await expect(interrupted).toHaveAttribute("data-state", "interrupted")
  await expect(interrupted.locator('[data-slot="task-state"]')).toHaveText("Interrupted")

  const failed = row(panel, "Failed task")
  await expect(failed).toHaveAttribute("data-state", "error")
  await expect(failed.locator('[data-slot="task-state"]')).toHaveText("Failed")

  const unknown = row(panel, "Unknown child")
  await expect(unknown).toHaveAttribute("data-state", "unknown")
  await expect(unknown.locator('[data-slot="task-state"]')).toHaveText("Status unknown")
  await expect(unknown.locator('[data-slot="task-time"]')).toHaveText("unknown")
  await expect(unknown.locator('[data-slot="task-stat-tools"]')).toHaveText("Tools:unknown")
  await expect(unknown.locator('[data-slot="task-stat-cost"]')).toHaveText("Cost:unknown")

  // The v1 compat layer zero-fills aggregates the server never sent; they must not read as $0.
  const running = row(panel, "Running task")
  await expect(running.locator('[data-slot="task-stat-cost"]')).toHaveText("Cost:unknown")
  await expect(running.locator('[data-slot="task-stat-tokens"]')).toHaveText("Tokens:unknown")

  await expect(row(panel, "Orphan task")).toHaveCount(1)
  await expect(row(panel, "Orphan task")).toHaveAttribute("data-state", "completed")
  await expect(panel.locator('[data-slot="task-row"]')).toHaveCount(5)
})

test("stop interrupts only the child and surfaces pending, failure and retry", async ({ page }) => {
  const aborts: string[] = []
  const release: (() => void)[] = []
  await setup(page)
  await page.route(
    (url) => url.port === new URL(server).port && url.pathname.endsWith("/abort"),
    async (route) => {
      aborts.push(new URL(route.request().url()).pathname)
      const attempt = aborts.length
      await new Promise<void>((resolve) => release.push(resolve))
      return route.fulfill({
        status: attempt === 1 ? 500 : 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(attempt === 1 ? { name: "UnknownError", data: { message: "abort failed" } } : true),
      })
    },
  )
  const panel = await openPanel(page)
  const running = row(panel, "Running task")
  await expect(running).toHaveAttribute("data-state", "running")

  await running.getByRole("button", { name: "Stop task" }).click()
  await expect(running.getByRole("status")).toHaveText("Stopping…")
  await expect(running.getByRole("button", { name: "Stop task" })).toBeDisabled()
  await expect.poll(() => release.length).toBe(1)
  release.shift()?.()

  const alert = running.getByRole("alert")
  await expect(alert).toContainText("Could not stop this task.")
  await alert.getByRole("button", { name: "Retry" }).click()
  await expect(running.getByRole("status")).toHaveText("Stopping…")
  await expect.poll(() => release.length).toBe(1)
  release.shift()?.()

  await expect(running.locator('[data-slot="task-stop-status"]')).toHaveCount(0)
  await expect(running.getByRole("button", { name: "Stop task" })).toBeEnabled()
  expect(aborts).toEqual([`/session/${child.running}/abort`, `/session/${child.running}/abort`])
})

test("opening a task keeps its owning server when the default server differs", async ({ page }) => {
  const owner = new URL(server)
  owner.hostname = "tasks-owner.test"
  const requests: string[] = []
  await setup(page, owner.origin)
  await page.route(
    (url) => url.pathname.includes(`/session/${child.running}`),
    (route) => {
      requests.push(route.request().url())
      return route.fallback()
    },
  )
  const panel = await openPanel(page, owner.origin)
  expect(owner.origin).not.toBe(server)
  await expect(row(panel, "Running task")).toHaveAttribute("data-state", "running")
  const mark = requests.length
  await row(panel, "Running task").locator('[data-slot="task-title"]').click()

  await expect(page).toHaveURL(
    new URL(`/server/${base64Encode(owner.origin)}/session/${child.running}`, page.url()).href,
  )
  await expectSessionTitle(page, "Running task")
  await expect
    .poll(() => requests.slice(mark).some((request) => new URL(request).pathname.endsWith("/message")))
    .toBe(true)
  const opened = requests.slice(mark)
  expect(opened.map((request) => new URL(request).origin)).toEqual(opened.map(() => owner.origin))
})

function row(panel: ReturnType<Page["locator"]>, headline: string) {
  return panel.locator('[data-slot="task-row"]').filter({
    has: panel.page().locator('[data-slot="task-title"]', { hasText: headline }),
  })
}

async function openPanel(page: Page, owner = server) {
  await page.goto(`/server/${base64Encode(owner)}/session/${parentID}`)
  await expectSessionTitle(page, parentTitle)
  // Once the side panel mounts, the running child opens Orchestra's Tasks tab, whose Tasks card
  // expands into the full list.
  await page.getByRole("button", { name: "Toggle review" }).click()
  await expect(
    page.locator('[data-slot="session-side-panel-tab-bar"] [role="tab"][data-value="tasks"]'),
  ).toHaveAttribute("aria-selected", "true")
  const panel = page.locator('[data-component="tasks-panel"]')
  await expect(panel).toBeVisible()
  await panel.getByRole("button", { name: "View all (5)" }).click()
  await expect(row(panel, "Running task")).toBeVisible()
  return panel
}

async function setup(page: Page, owner = server) {
  await page.addInitScript(railDefaulted)
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "tasks-truth",
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
      session(child.interrupted, "Interrupted task (@explore subagent)", 1700000001000, { parentID }),
      session(child.failed, "Failed task (@explore subagent)", 1700000001000, { parentID }),
      session(child.unknown, "Unknown child (@explore subagent)", 1700000001000, { parentID }),
    ],
    sessionStatus: { [child.running]: { type: "busy" } },
    pageMessages: (sessionID) => ({ items: sessionID === parentID ? parentMessages() : [] }),
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
          list: [server],
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem("opencode.window.browser.dat:tabs", JSON.stringify([{ type: "session", server, sessionId }]))
    },
    { directory, server: owner, sessionId: parentID },
  )
}

function session(id: string, title: string, created: number, extra?: Record<string, unknown>) {
  return { id, slug: id, projectID, directory, title, version: "dev", time: { created, updated: created }, ...extra }
}

function parentMessages() {
  const userID = "msg_tasks_user"
  const assistantID = "msg_tasks_assistant"
  const task = (
    callID: string,
    sessionId: string,
    description: string,
    state: Record<string, unknown>,
    extra = {},
  ) => ({
    id: `prt_${callID}`,
    sessionID: parentID,
    messageID: assistantID,
    type: "tool",
    callID,
    tool: "task",
    state: { input: { description, subagent_type: "explore" }, metadata: { sessionId, ...extra }, ...state },
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
      parts: [{ id: "prt_tasks_user", sessionID: parentID, messageID: userID, type: "text", text: "Delegate" }],
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
        task(
          "call_interrupted",
          child.interrupted,
          "Interrupted task",
          { status: "error", error: "Tool execution aborted", time: { start: 1700000001000, end: 1700000002000 } },
          { interrupted: true },
        ),
        task("call_failed", child.failed, "Failed task", {
          status: "error",
          error: `Subagent failed (task_id: ${child.failed}): boom`,
          time: { start: 1700000001000, end: 1700000003000 },
        }),
        task("call_orphan", child.orphan, "Orphan task", {
          status: "completed",
          title: "Orphan task",
          output: "done",
          time: { start: 1700000001000, end: 1700000004000 },
        }),
      ],
    },
  ]
}
