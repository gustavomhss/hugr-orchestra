import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

test("restored local profile loads agents and opens a draft through the mocked API", async ({ page }) => {
  // Match the chapter fixtures without adopting an accidental preview-port override from the config.
  const server = "http://127.0.0.1:4096"
  const directory = "/repo/bootstrap"
  const errors: string[] = []
  const agents: string[] = []
  const mutations: string[] = []
  page.on("response", (response) => {
    const url = new URL(response.url())
    if (url.pathname === "/agent") agents.push(url.origin)
  })
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/(api\/)?session(?:\/|$)/.test(new URL(request.url()).pathname))
      mutations.push(request.url())
  })
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  await page.addInitScript(
    ({ server, directory }) => {
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({ projects: { local: [{ worktree: directory }] } }),
      )
      localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ home: { selection: { server, directory } } }))
    },
    { server, directory },
  )
  await mockOpenCodeServer(page, {
    provider: { all: [], connected: [], default: {} },
    directory,
    project: {
      id: "bootstrap",
      name: "Bootstrap repository",
      worktree: directory,
      vcs: "git",
      sandboxes: [],
      time: { created: 1, updated: 1 },
    },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Agents", exact: true }).click()
  const roster = page.getByRole("list", { name: "Configured agents" })
  await expect(roster.getByRole("listitem")).toHaveCount(1)
  await expect(roster.getByRole("listitem", { name: "build", exact: true })).toBeVisible()
  expect(agents).toContain(server)
  expect(agents.filter((origin) => origin !== server)).toEqual([])
  await page.getByRole("button", { name: "Open Chat", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveText("build")
  await expect(page.locator('[data-component="prompt-input"][contenteditable="true"]')).toBeEditable()
  await expect(page.locator('[data-component="prompt-input"][contenteditable="true"]')).toHaveText("")
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("opencode.window.browser.dat:tabs") ?? "[]")))
    .toMatchObject([{ type: "draft", server, directory }])
  expect(mutations).toEqual([])
  expect(errors.filter((error) => /bootstrap|reading 'every'/.test(error))).toEqual([])
})
