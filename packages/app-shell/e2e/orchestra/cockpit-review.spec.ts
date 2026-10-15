import { base64Encode } from "@orchestra/core/util/encode"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { mockOrchestraServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"
import { installDockBridge } from "./session-cockpit-bridge"
import { railTab } from "./session-cockpit.fixture"

const directory = "/work/cockpit-review"
const parent = "ses_review_parent"
const title = "Cockpit review"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const projectID = "proj_cockpit_review"
const child = { focused: "ses_review_a", other: "ses_review_b", finished: "ses_review_c" }
const mixedAgent = "وكيل-worker"
const mixedModel = "p/نموذج-mixed"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" })

for (const mode of ["summary", "running detail", "finished detail"] as const) {
  test(`Tasks ${mode} preserves focus and row identity through child updates`, async ({ page }) => {
    const update = await setup(page)
    await openTasks(page)
    await page.evaluate(() => document.documentElement.setAttribute("dir", "rtl"))
    const panel = page.locator('[data-component="tasks-panel"]')
    await expect(panel.locator('[data-slot="task-row"]')).toHaveCount(3)
    if (mode !== "summary") await panel.getByRole("button", { name: "View all (3)" }).click()
    const id = mode === "finished detail" ? child.finished : child.focused
    const row = panel
      .locator('[data-slot="task-row"]')
      .filter({ hasText: mode === "finished detail" ? "Finished task" : "Focused task" })
    await row.evaluate((element) => {
      ;(element as HTMLElement).dataset.focusProbe = "retained"
    })
    await row.focus()
    await expect(row).toBeFocused()

    update(child.other, { title: "Other child updated" })
    await expect(panel.locator('[data-slot="task-title"]').filter({ hasText: "Other child updated" })).toBeVisible()
    await expect(row).toBeFocused()
    await expect(row).toHaveAttribute("data-focus-probe", "retained")

    // A keyed row must also read its *new* item, including callbacks and details.
    update(id, { model: { providerID: "p", id: "نموذج-updated" } })
    const model = row.getByText("p/نموذج-updated", { exact: true })
    await expect(model).toBeVisible()
    await expect(row).toBeFocused()
    await expect(row).toHaveAttribute("data-focus-probe", "retained")
    await expect(model).toHaveAttribute("dir", "auto")
    await expect(model).toHaveCSS("unicode-bidi", "isolate")
    const agent =
      mode === "summary" ? row.getByText(`@${mixedAgent}`, { exact: true }) : row.getByText(mixedAgent, { exact: true })
    await expect(agent).toHaveAttribute("dir", "auto")
    await expect(agent).toHaveCSS("direction", "rtl")
    await expect(row.locator('[data-slot="task-time"]')).toHaveAttribute("dir", "ltr")
    await row.press("Enter")
    await expect(page).toHaveURL(new RegExp(`/server/${base64Encode(server)}/session/${id}$`))
  })
}

test("compact Dock ignores the full Dock collapsed preference across reentry", async ({ page }) => {
  await setup(page)
  await openCockpit(page)
  const nav = page.locator('[data-component="orchestra-sidebar"]')
  await nav.getByRole("button", { name: "Dock", exact: true }).click()
  const full = page.locator(".zen-browser-shell:not(.is-compact)")
  await expect(full.getByRole("button", { name: "Open", exact: true })).toBeEnabled()
  await full.getByRole("textbox", { name: "Address" }).fill("https://example.com/a")
  await full.getByRole("textbox", { name: "Address" }).press("Enter")
  await expect(full.locator(".zen-tab-title")).toHaveText("Page /a")
  await full.getByRole("button", { name: "Collapse sidebar", exact: true }).click()
  await expect(full).toHaveClass(/is-sidebar-collapsed/)
  await expect(full.locator(".zen-tab-title")).toBeHidden()

  await nav.getByRole("button", { name: "Chat", exact: true }).click()
  await expectSessionTitle(page, title)
  const compact = page.locator(".zen-browser-shell.is-compact")
  await expect(compact).toBeVisible()
  await expect(compact.locator(".zen-tab-title")).toBeVisible()
  await expect(compact.getByRole("button", { name: "+ New tab", exact: true })).toBeVisible()
  await expect(compact).not.toHaveClass(/is-sidebar-collapsed/)
  const dock = page.getByRole("region", { name: "Dock", exact: true })
  await dock.getByRole("tab", { name: "Files", exact: true }).click()
  await dock.getByRole("tab", { name: "Browser", exact: true }).click()
  await expect(compact.locator(".zen-tab-title")).toBeVisible()
  await expect(compact.getByRole("button", { name: "+ New tab", exact: true })).toBeEnabled()

  await nav.getByRole("button", { name: "Dock", exact: true }).click()
  await expect(full).toHaveClass(/is-sidebar-collapsed/)
  await expect(full.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible()
  await expect(full.locator(".zen-tab-title")).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem("orchestra.app-dock.sidebar-collapsed"))).toBe("true")
  await full.getByRole("button", { name: "Expand sidebar", exact: true }).click()
  await expect(full.locator(".zen-tab-title")).toBeVisible()
})

for (const scheme of ["dark", "light"] as const) {
  test(`compact Dock ${scheme} uses Orchestra materials for selected, input and hover states`, async ({ page }) => {
    await setup(page, scheme)
    await openCockpit(page)
    const dock = page.getByRole("region", { name: "Dock", exact: true })
    await expect(dock.getByRole("status")).toHaveText("No tabs open. Enter an address to start browsing.")
    const address = dock.getByRole("textbox", { name: "Address" })
    await address.fill("https://example.com/materials")
    await address.press("Enter")
    const selected = dock.locator(".zen-tab.is-active")
    await expect(selected).toHaveText("EPage /materials")
    await expectMaterial(selected, "--orchestra-file-active")
    await expectMaterial(address, "--orchestra-evidence-background")
    await expectMaterial(dock.getByRole("tablist", { name: "Dock panes" }), "--orchestra-context-background")
    await expectMaterial(dock.getByRole("tab", { name: "Browser", exact: true }), "--orchestra-file-active")
    const reload = dock.getByRole("button", { name: "Reload", exact: true })
    const bounds = await reload.boundingBox()
    await reload.hover()
    await expectMaterial(reload, "--orchestra-rail-tab-hover-background")
    expect(await reload.boundingBox()).toEqual(bounds)
    await dock.getByRole("button", { name: "+ New tab", exact: true }).hover()
    await expectMaterial(
      dock.getByRole("button", { name: "+ New tab", exact: true }),
      "--orchestra-rail-tab-hover-background",
    )
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: test.info().outputPath(`cockpit-materials-${scheme}.png`), animations: "disabled" })
  })
}

async function expectMaterial(element: Locator, token: string) {
  await expect
    .poll(() =>
      element.evaluate((element, token) => {
        const probe = document.createElement("span")
        probe.style.cssText = `position:absolute;visibility:hidden;background:var(${token})`
        // A void input cannot render a child probe; use the same token-inheriting parent instead.
        if (!element.parentElement) throw new Error("Material target has no parent")
        element.parentElement.append(probe)
        const actual = getComputedStyle(element)
        const expected = getComputedStyle(probe)
        const result = {
          actual: [actual.backgroundColor, actual.backgroundImage],
          expected: [expected.backgroundColor, expected.backgroundImage],
          bound: actual.getPropertyValue(token).trim().length > 0,
        }
        probe.remove()
        return result.bound && JSON.stringify(result.actual) === JSON.stringify(result.expected) ? true : result
      }, token),
    )
    .toBe(true)
}

// Live work opens the rail on its Tasks tab, which holds the Tasks card.
async function openTasks(page: Page) {
  await page.goto(`/server/${base64Encode(server)}/session/${parent}`)
  await expectSessionTitle(page, title)
  await page.getByRole("button", { name: "Toggle review" }).click()
  await expect(railTab(page, "tasks")).toHaveAttribute("aria-selected", "true")
  await expect(page.locator('[data-component="tasks-panel"]')).toBeVisible()
}

// The Apps tab hosts only the Dock.
async function openCockpit(page: Page) {
  await openTasks(page)
  await railTab(page, "apps").click()
  await expect(page.getByRole("region", { name: "Dock", exact: true })).toBeVisible()
  await expect(page.locator('[data-component="tasks-panel"]')).toHaveCount(0)
}

async function setup(page: Page, scheme: "dark" | "light" = "dark") {
  const session = (id: string, title: string, parentID?: string) => ({
    id,
    slug: id,
    projectID,
    directory,
    title,
    parentID,
    version: "dev",
    time: { created: 1700000000000, updated: 1700000000000 },
    agent: mixedAgent,
    model: { providerID: "p", id: mixedModel.slice(2) },
  })
  const sessions = [
    session(parent, title),
    session(child.focused, "Focused task", parent),
    session(child.other, "Other task", parent),
    session(child.finished, "Finished task", parent),
  ]
  const events: unknown[] = []
  const sequence = { value: 0 }
  await mockOrchestraServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "cockpit-review",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "p",
          name: "Fixture",
          models: { model: { id: "model", name: "Fixture model", limit: { context: 200_000 } } },
        },
      ],
      connected: ["p"],
      default: { providerID: "p", modelID: "model" },
    },
    sessions,
    sessionStatus: { [child.focused]: { type: "busy" }, [child.other]: { type: "busy" } },
    events: () => events.splice(0),
    eventRetry: 50,
    fileList: () => [],
    pageMessages: (id) => ({
      items:
        id === parent
          ? [
              {
                info: {
                  id: "msg_review_user",
                  sessionID: parent,
                  role: "user",
                  time: { created: 1700000000000 },
                  agent: "build",
                  model: { providerID: "p", modelID: "model" },
                },
                parts: [
                  {
                    id: "prt_review_user",
                    messageID: "msg_review_user",
                    sessionID: parent,
                    type: "text",
                    text: "Review cockpit",
                  },
                ],
              },
              {
                info: {
                  id: "msg_review_assistant",
                  sessionID: parent,
                  role: "assistant",
                  parentID: "msg_review_user",
                  time: { created: 1700000001000 },
                  modelID: "model",
                  providerID: "p",
                  mode: "build",
                  agent: "build",
                  path: { cwd: directory, root: directory },
                  cost: 0,
                  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                },
                parts: [
                  {
                    id: "prt_review_task",
                    messageID: "msg_review_assistant",
                    sessionID: parent,
                    type: "tool",
                    tool: "task",
                    callID: "call_review_task",
                    state: {
                      status: "running",
                      title: "Focused task",
                      input: { description: "Focused task", subagent_type: mixedAgent },
                      metadata: { sessionId: child.focused },
                      time: { start: 1700000001000 },
                    },
                  },
                ],
              },
            ]
          : [],
    }),
  })
  await page.addInitScript(
    ({ directory, server, parent, scheme }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "orchestra.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem(
        "orchestra.window.browser.dat:tabs",
        JSON.stringify([{ type: "session", server, sessionId: parent }]),
      )
      localStorage.setItem("orchestra-color-scheme", scheme)
      localStorage.setItem("orchestra-theme-id", "oc-2")
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
    },
    { directory, server, parent, scheme },
  )
  await page.addInitScript(installDockBridge)
  return (id: string, patch: Partial<ReturnType<typeof session>>) => {
    const index = sessions.findIndex((item) => item.id === id)
    if (index < 0) throw new Error(`Unknown fixture session ${id}`)
    sessions[index] = { ...sessions[index], ...patch }
    events.push({
      directory,
      payload: { id: `evt_review_${++sequence.value}`, type: "session.updated", properties: { info: sessions[index] } },
    })
  }
}
