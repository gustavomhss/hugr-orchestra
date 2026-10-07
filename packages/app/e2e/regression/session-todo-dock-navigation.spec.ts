import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const directory = "C:/OpenCode/TodoDockNavigation"
const projectID = "proj_todo_dock_navigation"
const sourceID = "ses_todo_dock_source"
const otherID = "ses_todo_dock_other"
const sourceTitle = "Todo dock animation"
const otherTitle = "Separate session"

const activeTodos = [
  { id: "todo-1", content: "Receive todos in the active session", status: "completed", priority: "high" },
  { id: "todo-2", content: "Keep the dock visible across tabs", status: "completed", priority: "high" },
  { id: "todo-3", content: "Close after the final todo", status: "in_progress", priority: "high" },
]

// The dock's spring settles in a 300ms visual duration. Its fades take a good part of that in page time
// at any frame rate, where a snap would change the dock within one write.
const animated = 100

type EventPayload = {
  directory: string
  payload: Record<string, unknown>
}

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" })

test("animates todo lifecycle without replaying it across session tabs", async ({ page }) => {
  test.setTimeout(90_000)
  const events: EventPayload[] = []
  const todos: Record<string, typeof activeTodos> = { [sourceID]: [], [otherID]: [] }
  const sessionStatus: Record<string, { type: "busy" | "idle" }> = {}

  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "todo-dock-navigation",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: {
            "claude-opus-4-6": {
              id: "claude-opus-4-6",
              name: "Claude Opus 4.6",
              limit: { context: 200_000 },
            },
          },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "claude-opus-4-6" },
    },
    sessions: [session(sourceID, sourceTitle, 1700000000000), session(otherID, otherTitle, 1700000001000)],
    sessionStatus: { [sourceID]: { type: "busy" } },
    pageMessages: () => ({ items: [] }),
    events: () => events.splice(0, 1),
    eventRetry: 16,
    sessionStatus: () => sessionStatus,
    todos: (sessionID) => todos[sessionID] ?? [],
  })
  await configurePage(page)

  await page.goto(sessionHref(sourceID))
  await expectSessionTitle(page, sourceTitle)
  const dock = page.locator('[data-component="session-todo-dock"]')
  await expect(dock).toHaveCount(0)

  sessionStatus[sourceID] = { type: "busy" }
  events.push(statusEvent(sourceID, "busy"))
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible()

  await page.waitForTimeout(700)
  const opening = await recordDock(page)
  todos[sourceID] = activeTodos
  events.push(todoEvent(sourceID, activeTodos))
  await expect(dock).toBeVisible()
  await expect(dock.locator('[data-state="in_progress"]')).toHaveCount(1)
  await expect.poll(() => labelOpacity(dock)).toBeGreaterThan(0.98)
  // It mounts transparent and reaches full opacity over the spring's own time, not in one write.
  const opened = (await stop(opening)).filter((sample) => sample.present)
  expect(opened[0]!.opacity).toBeLessThan(0.05)
  expect(opened.find((sample) => sample.opacity > 0.98)!.at - opened[0]!.at).toBeGreaterThan(animated)

  await switchSession(page, otherID, otherTitle)
  await expect(dock).toHaveCount(0)

  // Returning shows the dock already open: no write ever lowers it, so nothing replays.
  const returningOpen = await recordDock(page)
  await switchSession(page, sourceID, sourceTitle)
  await expect(dock).toBeVisible()
  await page.waitForTimeout(500)
  const reopened = (await stop(returningOpen)).filter((sample) => sample.present)
  expect(reopened.length).toBeGreaterThan(0)
  expect(Math.min(...reopened.map((sample) => sample.opacity))).toBeGreaterThan(0.98)
  expect(reopened[0]!.height).toBeGreaterThan(70)
  await expect(dock.locator('[data-state="in_progress"]')).toHaveCount(1)

  const completedTodos = activeTodos.map((todo) => ({ ...todo, status: "completed" }))
  const closing = await recordDock(page)
  todos[sourceID] = completedTodos
  events.push(todoEvent(sourceID, completedTodos))
  await expect(dock).toHaveCount(0)
  // Fully open when its last todo completes, it then fades over the spring's own time, not in one write.
  const closed = await stop(closing)
  const completed = closed.findIndex((sample) => sample.present && sample.active === 0)
  expect(completed).toBeGreaterThan(-1)
  expect(closed[completed]!.opacity).toBeGreaterThan(0.98)
  const faded = closed.slice(completed).find((sample) => !sample.present || sample.opacity < 0.05)!
  expect(faded.at - closed[completed]!.at).toBeGreaterThan(animated)
  todos[sourceID] = []
  events.push(todoEvent(sourceID, []))

  await switchSession(page, otherID, otherTitle)
  const returningEmpty = await recordDock(page)
  await switchSession(page, sourceID, sourceTitle)
  await expect(dock).toHaveCount(0)
  await page.waitForTimeout(500)
  expect((await stop(returningEmpty)).every((sample) => !sample.present)).toBe(true)
})

function session(id: string, title: string, created: number) {
  return {
    id,
    slug: id,
    projectID,
    directory,
    title,
    version: "dev",
    time: { created, updated: created },
  }
}

function statusEvent(sessionID: string, type: "busy" | "idle"): EventPayload {
  return {
    directory,
    payload: { type: "session.status", properties: { sessionID, status: { type } } },
  }
}

function todoEvent(sessionID: string, next: typeof activeTodos): EventPayload {
  return {
    directory,
    payload: { type: "todo.updated", properties: { sessionID, todos: next } },
  }
}

async function configurePage(page: Page) {
  const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
  await page.addInitScript(
    ({ directory, dirBase64, server, sessionIDs }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify(sessionIDs.map((sessionId) => ({ type: "session", server, dirBase64, sessionId }))),
      )
    },
    { directory, dirBase64: base64Encode(directory), server, sessionIDs: [sourceID, otherID] },
  )
}

function sessionHref(sessionID: string) {
  const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
  return `/server/${base64Encode(server)}/session/${sessionID}`
}

async function switchSession(page: Page, sessionID: string, title: string) {
  const href = sessionHref(sessionID)
  const tab = page.locator(`[data-slot="titlebar-tabs"] a[href="${href}"]`).first()
  await expect(tab).toBeVisible()
  await tab.click()
  await expectSessionTitle(page, title)
}

// Records the dock after every DOM change and style write, until stopped. The dock's spring writes its
// progress as inline styles on each frame it gets, so the record holds each value the page showed and when,
// however few frames the browser paints; a fixed sampling window would depend on the frame rate.
function recordDock(page: Page) {
  return page.evaluateHandle(() => {
    const samples: { at: number; present: boolean; active: number; opacity: number; height: number }[] = []
    const read = () => {
      const dock = document.querySelector<HTMLElement>('[data-component="session-todo-dock"]')
      const label = dock?.querySelector<HTMLElement>('[data-action="session-todo-toggle"] span[aria-label]')
      const sample = {
        at: performance.now(),
        present: !!dock,
        active: dock?.querySelectorAll('[data-state="in_progress"]').length ?? 0,
        opacity: label ? Number.parseFloat(getComputedStyle(label).opacity) : 0,
        height: dock?.parentElement?.parentElement?.getBoundingClientRect().height ?? 0,
      }
      const last = samples.at(-1)
      if (
        last &&
        last.present === sample.present &&
        last.active === sample.active &&
        last.opacity === sample.opacity &&
        last.height === sample.height
      )
        return
      samples.push(sample)
    }
    const observer = new MutationObserver(read)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "data-state"],
    })
    read()
    return {
      stop: () => {
        observer.disconnect()
        return samples
      },
    }
  })
}

function stop(recorder: Awaited<ReturnType<typeof recordDock>>) {
  return recorder.evaluate((record) => record.stop())
}

function labelOpacity(dock: Locator) {
  // The first labelled span is the progress label, as the recorder's querySelector reads it.
  return dock
    .locator('[data-action="session-todo-toggle"] span[aria-label]')
    .first()
    .evaluate((label) => Number.parseFloat(getComputedStyle(label).opacity))
}
