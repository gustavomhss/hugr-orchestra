import { expect, test, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const directory = "/repo/shared"
const otherDirectory = "/repo/other"
const agents = [
  {
    name: "build",
    description: "Implements repository changes",
    mode: "primary",
    native: true,
    permission: [],
    options: {},
  },
  {
    name: "plan",
    description: "Plans repository work",
    mode: "primary",
    native: true,
    model: { providerID: "example", modelID: "reasoner" },
    steps: 7,
    permission: [
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
  { name: "review", description: "Reviews repository changes", mode: "all", native: true, permission: [], options: {} },
  { name: "secret", mode: "primary", hidden: true, permission: [], options: {} },
]

test.use({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" })
test.setTimeout(120_000)

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: roster and read-only details show returned fields`, async ({ page }) => {
    await setup(page, { scheme })
    await openAgents(page)
    const roster = page.getByRole("list", { name: "Configured agents" })
    await expect(roster.getByRole("button")).toHaveCount(4)
    await expect(roster).not.toContainText("secret")
    await expect(roster).toContainText("Inherited / unspecified")
    const plan = roster.getByRole("button", { name: /^plan Primary/ })
    await plan.focus()
    await page.keyboard.press("Enter")
    await expect(plan).toHaveAttribute("aria-pressed", "true")
    const detail = page.getByRole("article", { name: "Details for plan" })
    await expect(detail).toBeVisible()
    expect.soft(await detail.locator("h2").textContent()).toBe("plan")
    expect.soft(await detail.locator("p").first().textContent()).toBe("Plans repository work")
    const fields = await detail.locator("dd").allTextContents()
    expect.soft(fields[0]).toBe("Primary")
    expect.soft(fields[1]).toBe("example/reasoner")
    expect.soft(fields[2]).toBe("7")
    expect
      .soft(await detail.locator("tbody td").allTextContents())
      .toEqual(["bash", "git *", "Ask", "edit", "*", "Deny"])
    await page.screenshot({ path: test.info().outputPath(`${scheme}.png`), fullPage: true })
    await roster.getByRole("button", { name: /research Subagent/ }).click()
    await expect(page.getByRole("button", { name: "Open Chat", exact: true })).toHaveCount(0)
    await expect(page.getByRole("article")).toContainText("Subagents are invoked by another agent")
    await roster.getByRole("button", { name: /review Primary & subagent/ }).click()
    await expect(page.getByRole("button", { name: "Open Chat", exact: true })).toBeVisible()
    await roster.getByRole("button", { name: /build Primary/ }).click()
    await expect(page.getByRole("article")).toContainText("Unspecified")
    await expect(page.getByRole("article")).toContainText("No permission rules returned.")
  })
}

test("Open Chat opens a blank draft with no agent choice for the same profile and sends nothing", async ({ page }) => {
  const requests = await setup(page)
  await openAgents(page)
  await page
    .getByRole("list")
    .getByRole("button", { name: /^plan Primary/ })
    .click()
  await page.getByRole("button", { name: "Open Chat", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/, { timeout: 30_000 })
  const draftID = new URL(page.url()).searchParams.get("draftId")
  await expect
    .poll(() =>
      page.evaluate((draftID) => {
        const tabs = JSON.parse(localStorage.getItem("opencode.window.browser.dat:tabs") ?? "[]") as Array<{
          draftID?: string
          directory?: string
          server?: string
        }>
        return tabs.find((tab) => tab.draftID === draftID)
      }, draftID),
    )
    .toMatchObject({ server: serverA, directory })
  await expect(page.locator('[contenteditable="true"]').first()).toHaveText("")
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveCount(0)
  expect(requests.filter((request) => request.method === "POST")).toEqual([])
  expect(
    requests
      .filter((request) => new URL(request.url).pathname === "/agent")
      .every(
        (request) =>
          new URL(request.url).origin === serverA && new URL(request.url).searchParams.get("directory") === directory,
      ),
  ).toBe(true)
  await page.reload()
  await expect(page.locator('[data-component="prompt-input-v2"]')).toBeVisible()
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveCount(0)
  expect(requests.filter((request) => request.method === "POST")).toEqual([])
})

test("agent requests target the selected profile", async ({ page }) => {
  const requests = await setup(page)
  await openAgents(page)
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
  const targets = requests.filter((request) => new URL(request.url).pathname === "/agent")
  expect(targets.length).toBeGreaterThan(0)
  expect(
    targets.every(
      (request) =>
        new URL(request.url).origin === serverA && new URL(request.url).searchParams.get("directory") === directory,
    ),
  ).toBe(true)
})

test("ordinary drafts offer no agent choice", async ({ page }) => {
  await setup(page)
  await openAgents(page)
  await page.locator('[data-component="orchestra-sidebar"]').getByRole("button", { name: "Chat", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(page.locator('[data-component="prompt-input-v2"]')).toBeVisible()
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveCount(0)
})

test("Open Chat does not carry the chosen agent's model into the draft", async ({ page }) => {
  const requests = await setup(page, { models: true })
  await openAgents(page)
  await page
    .getByRole("list")
    .getByRole("button", { name: /^plan Primary/ })
    .click()
  await page.getByRole("button", { name: "Open Chat", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(page.locator('[data-action="prompt-model"]')).toContainText("Builder")
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveCount(0)
  expect(requests.filter((request) => request.method === "POST")).toEqual([])
})

test("switching profiles during an agent request isolates servers and directories", async ({ page }) => {
  const completed: string[] = []
  page.on("response", (response) => completed.push(response.url()))
  page.on("requestfailed", (request) => completed.push(request.url()))
  const pending = { release: () => {}, releaseOther: () => {} }
  const gate = new Promise<void>((resolve) => {
    pending.release = resolve
  })
  const otherGate = new Promise<void>((resolve) => {
    pending.releaseOther = resolve
  })
  const requests = await setup(page, { wait: gate, waitOther: otherGate })
  try {
    await openAgents(page, false)
    await expect(page.getByRole("status")).toContainText("Loading agents")
    await expect.poll(() => requests.some((request) => new URL(request.url).pathname === "/agent")).toBe(true)
    await page.getByRole("button", { name: "Choose repository profile" }).click()
    await page.getByRole("menuitemradio", { name: "Boreal" }).click()
    await expect(page.getByRole("list", { name: "Configured agents" })).toContainText("boreal-agent")
    pending.release()
    await expect
      .poll(() => completed.filter((url) => url.startsWith(serverA) && new URL(url).pathname === "/agent").length)
      .toBeGreaterThanOrEqual(
        requests.filter((request) => request.url.startsWith(serverA) && new URL(request.url).pathname === "/agent")
          .length,
      )
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    await expect
      .poll(() => requests.filter((request) => new URL(request.url).pathname === "/agent").length)
      .toBeGreaterThanOrEqual(2)
    await expect(page.getByRole("list", { name: "Configured agents" })).not.toContainText("Plans repository work")
    await page.getByRole("button", { name: "Choose repository profile" }).click()
    await page.getByRole("menuitemradio", { name: "Other worktree" }).click()
    await expect(page.getByText("Loading agents…", { exact: true })).toBeVisible()
    await expect(page.getByRole("list", { name: "Configured agents" })).toHaveCount(0)
    pending.releaseOther()
    await expect(page.getByRole("list", { name: "Configured agents" })).toContainText("other-agent")
    await expect(page.getByRole("list", { name: "Configured agents" })).not.toContainText("boreal-agent")
    expect(
      requests.some(
        (request) =>
          request.url.startsWith(serverB) && new URL(request.url).searchParams.get("directory") === directory,
      ),
    ).toBe(true)
    expect(
      requests.some(
        (request) =>
          request.url.startsWith(serverA) && new URL(request.url).searchParams.get("directory") === otherDirectory,
      ),
    ).toBe(true)
  } finally {
    pending.release()
    pending.releaseOther()
  }
})

for (const state of ["empty", "error", "unavailable"] as const) {
  test(`${state}: explicit roster state and recovery with Refresh`, async ({ page }) => {
    const response = { state: state as string }
    await setup(page, { response })
    await openAgents(page, false)
    await expect(
      page.getByText(
        {
          empty: "No visible agents are configured for this profile.",
          error: "Agents could not be loaded. Try refreshing.",
          unavailable: "This server does not provide an agents API.",
        }[state],
        { exact: true },
      ),
    ).toBeVisible()
    await expect(page.getByRole("list", { name: "Configured agents" })).toHaveCount(0)
    response.state = "ready"
    await page.getByRole("button", { name: "Refresh", exact: true }).click()
    await expect(page.getByRole("list", { name: "Configured agents" })).toContainText("Plans repository work")
  })
}

test("current protocol agents retain configured model, steps and permission rules", async ({ page }) => {
  await setup(page, { protocol: "v2" })
  await openAgents(page)
  await page.getByRole("button", { name: "Refresh", exact: true }).click()
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toBeEnabled()
  await page
    .getByRole("list")
    .getByRole("button", { name: /^plan Primary/ })
    .click()
  const detail = page.getByRole("article", { name: "Details for plan" })
  await expect(detail).toContainText("example/reasoner")
  await expect(detail.locator("dl")).toContainText("Step allowance7")
  await expect(detail.getByRole("row", { name: "bash git * Ask" })).toBeVisible()
})

async function openAgents(page: Page, ready = true) {
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

async function setup(
  page: Page,
  input: {
    scheme?: "dark" | "light"
    wait?: Promise<void>
    waitOther?: Promise<void>
    response?: { state: string }
    protocol?: "v1" | "v2"
    models?: boolean
  } = {},
) {
  const requests: Array<{ url: string; method: string }> = []
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
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== serverA && url.origin !== serverB) return route.fallback()
    requests.push({ url: url.toString(), method: route.request().method() })
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
              : agents
      if (input.protocol !== "v2") return json(data)
      return json({
        location: { directory: selectedDirectory },
        data: data.map((agent) => ({
          id: agent.name,
          name: agent.name,
          description: agent.description,
          mode: agent.mode,
          hidden: "hidden" in agent ? agent.hidden : false,
          request: { settings: {} },
          steps: "steps" in agent ? agent.steps : undefined,
          model:
            "model" in agent && agent.model
              ? { providerID: agent.model.providerID, id: agent.model.modelID }
              : undefined,
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
  return requests
}
