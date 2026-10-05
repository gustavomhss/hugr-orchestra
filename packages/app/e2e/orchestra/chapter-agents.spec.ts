import { expect, test, type Page, type Request } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const directory = "/repo/shared"
const otherDirectory = "/repo/other"
type MockAgent = {
  name: string
  description?: string
  mode: string
  native?: boolean
  hidden?: boolean
  model?: { providerID: string; modelID: string }
  steps?: number
  prompt?: string
  permission: { permission: string; pattern: string; action: string }[]
  options: Record<string, unknown>
}
const agents: MockAgent[] = [
  {
    name: "build",
    description: "Implements repository changes",
    mode: "primary",
    native: true,
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
    options: {},
  },
  {
    name: "plan",
    description: "Plans repository work",
    mode: "primary",
    native: true,
    model: { providerID: "example", modelID: "reasoner" },
    steps: 7,
    prompt: "Plan before acting.",
    permission: [
      { permission: "*", pattern: "*", action: "allow" },
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
type AgentFile = { path: string; exists: boolean } & Record<string, unknown>
type Write = { url: string; directory: string | null; body: Record<string, unknown> }

test.use({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" })
test.setTimeout(120_000)

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: roster cards show the returned fields`, async ({ page }) => {
    await setup(page, { scheme })
    await openAgents(page)
    const roster = page.getByRole("list", { name: "Configured agents" })
    await expect(roster.getByRole("listitem")).toHaveCount(4)
    await expect(roster).not.toContainText("secret")
    await expect(page.locator(".orchestra-agents").getByRole("heading", { level: 1 })).toHaveText("Who is doingthe work.")
    await expect(page.getByRole("button", { name: "Create agent", exact: true })).toBeEnabled()
    const plan = card(page, "plan")
    expect.soft(await plan.locator(".agent-role").textContent()).toBe("primary")
    expect.soft(await plan.locator("p").textContent()).toBe("Plans repository work")
    expect.soft(await plan.locator(".mx-badge").allTextContents()).toEqual(["reasoner", "7 steps", "Available"])
    await expect(plan.locator(".mx-badge bdi")).toHaveAttribute("title", "example/reasoner")
    expect
      .soft(await card(page, "build").locator(".mx-badge").allTextContents())
      .toEqual(["Default model", "Unlimited steps", "Available"])
    await page.screenshot({ path: test.info().outputPath(`${scheme}.png`), fullPage: true })
    const research = card(page, "research").getByRole("button", { name: "Open Chat", exact: true })
    await expect(research).toBeDisabled()
    await expect(research).toHaveAttribute("title", "Subagents are invoked by another agent and cannot start a chat directly.")
    await expect(card(page, "review").getByRole("button", { name: "Open Chat", exact: true })).toBeEnabled()
    await expect(card(page, "build").getByRole("button", { name: "Configure", exact: true })).toBeEnabled()
  })
}

test("Open Chat selects the agent in a blank draft for the same profile and sends nothing", async ({ page }) => {
  const mock = await setup(page)
  await openAgents(page)
  await card(page, "plan").getByRole("button", { name: "Open Chat", exact: true }).click()
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
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveText("plan")
  await expect(page.locator('[contenteditable="true"]').first()).toHaveText("")
  expect(mock.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method))).toEqual([])
  expect(
    mock.requests
      .filter((request) => new URL(request.url).pathname === "/agent")
      .every(
        (request) =>
          new URL(request.url).origin === serverA && new URL(request.url).searchParams.get("directory") === directory,
      ),
  ).toBe(true)
  await page.reload()
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveText("plan")
  expect(mock.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method))).toEqual([])
})

test("agent and agent file requests target the selected profile", async ({ page }) => {
  const mock = await setup(page)
  await openAgents(page)
  await card(page, "plan").getByRole("button", { name: "Configure", exact: true }).click()
  await expect(dialog(page).getByRole("heading", { name: "Configure plan" })).toBeVisible()
  await expect(dialog(page).getByLabel("Description")).toHaveValue("Plans repository work")
  const targets = mock.requests.filter((request) => new URL(request.url).pathname === "/agent")
  expect(targets.length).toBeGreaterThan(0)
  expect(
    targets.every(
      (request) =>
        new URL(request.url).origin === serverA && new URL(request.url).searchParams.get("directory") === directory,
    ),
  ).toBe(true)
  const files = mock.requests.filter((request) => new URL(request.url).pathname === "/api/agent/plan/file")
  expect(files.map((request) => [new URL(request.url).origin, request.method, request.directory])).toEqual([
    [serverA, "GET", directory],
  ])
})

test("ordinary drafts retain the native agent visibility setting", async ({ page }) => {
  await setup(page)
  await openAgents(page)
  await page.locator('[data-component="orchestra-sidebar"]').getByRole("button", { name: "Chat", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(page.locator('[data-component="prompt-input-v2"]')).toBeVisible()
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveCount(0)
})

test("an explicit agent stays with its draft when an ordinary draft opens", async ({ page }) => {
  const mock = await setup(page, { models: true })
  await openAgents(page)
  await card(page, "plan").getByRole("button", { name: "Open Chat", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  const chosen = new URL(page.url()).searchParams.get("draftId")
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveText("plan")
  await expect(page.locator('[data-action="prompt-model"]')).toContainText("Reasoner")

  await page
    .locator('[data-slot="orchestra-tab-controls"]')
    .getByRole("button", { name: "New session", exact: true })
    .click()
  await expect.poll(() => new URL(page.url()).searchParams.get("draftId")).not.toBe(chosen)
  await expect(page.locator('[data-component="prompt-input-v2"]')).toBeVisible()
  await expect.soft(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveCount(0)
  await expect.soft(page.locator('[data-action="prompt-model"]')).toContainText("Builder")

  await page.locator(`[data-tab-key="draft:${chosen}"] a`).click()
  await expect.poll(() => new URL(page.url()).searchParams.get("draftId")).toBe(chosen)
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveText("plan")
  await expect(page.locator('[data-action="prompt-model"]')).toContainText("Reasoner")
  expect(mock.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method))).toEqual([])
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
  const mock = await setup(page, { wait: gate, waitOther: otherGate })
  const requests = mock.requests
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
  const plan = card(page, "plan")
  await expect(plan.locator(".mx-badge bdi")).toHaveAttribute("title", "example/reasoner")
  await expect(plan).toContainText("7 steps")
  await plan.getByRole("button", { name: "Configure", exact: true }).click()
  await expect(dialog(page).getByLabel("Provider-turn allowance")).toHaveValue("7")
  await expect(dialog(page).getByLabel("Edit", { exact: true }).locator("option:checked")).toHaveText("Inherit (deny)")
  await expect(dialog(page).getByLabel("Read", { exact: true }).locator("option:checked")).toHaveText("Inherit (allow)")
})

test("create agent writes the project agent file and reloads the legacy roster", async ({ page }) => {
  const mock = await setup(page)
  await openAgents(page)
  await page.getByRole("button", { name: "Create agent", exact: true }).click()
  const form = dialog(page)
  await expect(form.getByRole("heading", { name: "Create agent" })).toBeVisible()
  await expect(form.getByLabel("Mode", { exact: true })).toHaveValue("subagent")
  await expect(form.getByLabel("Bash", { exact: true }).locator("option:checked")).toHaveText("Inherit (allow)")

  await form.getByLabel("Name").fill("plan")
  await form.getByLabel("Description").fill("Reviews the diff")
  await form.getByRole("button", { name: "Save", exact: true }).click()
  await expect(form.getByRole("alert")).toHaveText("An agent with this name already exists.")
  await form.getByLabel("Name").fill("bad name")
  await form.getByRole("button", { name: "Save", exact: true }).click()
  await expect(form.getByRole("alert")).toHaveText("Use letters, numbers, hyphens and underscores for the name.")
  await form.getByLabel("Name").fill("reviewer")
  await form.getByLabel("Provider-turn allowance").fill("0")
  await form.getByRole("button", { name: "Save", exact: true }).click()
  await expect(form.getByRole("alert")).toHaveText("Turn allowance must be a positive integer.")
  expect(mock.writes).toEqual([])

  await form.getByLabel("Provider-turn allowance").fill("5")
  await form.getByLabel("System instructions").fill("Read the diff first.")
  await form.getByLabel("Bash", { exact: true }).selectOption("deny")
  await form.getByRole("button", { name: "Save", exact: true }).click()
  await expect(form).toHaveCount(0)
  expect(mock.writes).toEqual([
    {
      url: expect.stringContaining(`${serverA}/api/agent/reviewer/file`),
      directory,
      body: {
        mode: "subagent",
        description: "Reviews the diff",
        steps: 5,
        system: "Read the diff first.",
        permission: { bash: "deny" },
      },
    },
  ])
  expect(mock.disposed).toEqual([directory])
  await expect(card(page, "reviewer")).toContainText("Reviews the diff")
  await expect(card(page, "reviewer").locator(".agent-role")).toHaveText("subagent")
})

test("configure seeds from the project file and keeps pattern rules it does not edit", async ({ page }) => {
  const mock = await setup(page, {
    protocol: "v2",
    files: {
      plan: {
        path: `${directory}/.opencode/agent/plan.md`,
        exists: true,
        description: "From the file",
        mode: "primary",
        system: "File prompt",
        permission: { edit: "deny", bash: { "git *": "ask" }, question: "allow" },
      },
    },
  })
  await openAgents(page)
  await card(page, "plan").getByRole("button", { name: "Configure", exact: true }).click()
  const form = dialog(page)
  await expect(form.getByLabel("Description")).toHaveValue("From the file")
  await expect(form.getByLabel("Name")).toHaveJSProperty("readOnly", true)
  await expect(form.getByLabel("System instructions")).toHaveValue("File prompt")
  await expect(form.getByLabel("Edit", { exact: true })).toHaveValue("deny")
  await expect(form.getByLabel("Edit", { exact: true }).locator("option").first()).toHaveText("Inherit (allow)")
  await expect(form.getByLabel("Bash", { exact: true })).toHaveValue("custom")

  await form.getByLabel("Edit", { exact: true }).selectOption("inherit")
  await form.getByLabel("Model", { exact: true }).selectOption("")
  await form.getByRole("button", { name: "Save", exact: true }).click()
  await expect(form).toHaveCount(0)
  expect(mock.writes.map((write) => write.body)).toEqual([
    {
      mode: "primary",
      description: "From the file",
      steps: 7,
      system: "File prompt",
      permission: { bash: { "git *": "ask" }, question: "allow" },
    },
  ])
  expect(mock.writes[0]?.url).toContain(`${serverA}/api/agent/plan/file`)
  expect(mock.disposed).toEqual([])
})

test("cancel and Escape discard the draft; remove disables the agent after confirmation", async ({ page }) => {
  const mock = await setup(page)
  await openAgents(page)
  await card(page, "plan").getByRole("button", { name: "Configure", exact: true }).click()
  await dialog(page).getByLabel("Description").fill("Changed")
  await page.keyboard.press("Escape")
  await expect(dialog(page)).toHaveCount(0)
  await card(page, "plan").getByRole("button", { name: "Configure", exact: true }).click()
  await expect(dialog(page).getByLabel("Description")).toHaveValue("Plans repository work")
  await dialog(page).getByLabel("Description").fill("Changed again")
  await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
  expect(mock.writes).toEqual([])

  await card(page, "plan").getByRole("button", { name: "Configure", exact: true }).click()
  await dialog(page).getByRole("button", { name: "Remove agent", exact: true }).click()
  await expect(dialog(page).getByRole("heading", { name: "Remove plan?" })).toBeVisible()
  await expect(dialog(page)).toContainText("Existing sessions keep their recorded model and conversation.")
  expect(mock.writes).toEqual([])
  await dialog(page).getByRole("button", { name: "Confirm", exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
  expect(mock.writes.map((write) => [write.body, write.directory])).toEqual([[{ disable: true }, directory]])
  await expect(page.getByRole("list", { name: "Configured agents" }).getByRole("listitem")).toHaveCount(3)
  await expect(card(page, "plan")).toHaveCount(0)
})

test("a server without the agent file API keeps the editor read-only", async ({ page }) => {
  const mock = await setup(page, { fileApi: false })
  await openAgents(page)
  await card(page, "plan").getByRole("button", { name: "Configure", exact: true }).click()
  const form = dialog(page)
  await expect(form.getByRole("alert")).toHaveText("This server cannot save agent configuration.")
  await expect(form.getByRole("button", { name: "Save", exact: true })).toBeDisabled()
  await expect(form.getByLabel("Description")).toBeDisabled()
  await expect(form.getByRole("button", { name: "Remove agent", exact: true })).toHaveCount(0)
  expect(mock.writes).toEqual([])
})

function card(page: Page, name: string) {
  return page.getByRole("list", { name: "Configured agents" }).getByRole("listitem", { name, exact: true })
}

function dialog(page: Page) {
  return page.locator("dialog.agents-dialog")
}

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

function requestDirectory(request: Request) {
  const url = new URL(request.url())
  const header = request.headers()["x-opencode-directory"]
  return (
    url.searchParams.get("location[directory]") ??
    url.searchParams.get("directory") ??
    (header ? decodeURIComponent(header) : null)
  )
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
    files?: Record<string, AgentFile>
    fileApi?: boolean
  } = {},
) {
  const requests: Array<{ url: string; method: string; directory: string | null }> = []
  const writes: Write[] = []
  const disposed: (string | null)[] = []
  const roster = agents.map((agent) => ({ ...agent }))
  const files = { ...input.files }
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
            agentVisibilityInitialized: true,
            showCustomAgents: false,
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
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== serverA && url.origin !== serverB) return route.fallback()
    requests.push({ url: url.toString(), method: request.method(), directory: requestDirectory(request) })
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
    const file = /^\/api\/agent\/([^/]+)\/file$/.exec(url.pathname)
    if (file) {
      if (input.fileApi === false) return json({ message: "Not found" }, 404)
      const name = decodeURIComponent(file[1])
      const location = { directory, project: { id: "Atlas", directory } }
      if (request.method() === "GET")
        return json({ location, data: files[name] ?? { path: `${directory}/.opencode/agent/${name}.md`, exists: false } })
      const body = request.postDataJSON() as Record<string, unknown>
      writes.push({ url: url.toString(), directory: requestDirectory(request), body })
      // Mirror the server: the next roster read reflects the written definition.
      const index = roster.findIndex((agent) => agent.name === name)
      if (body.disable === true) roster.splice(index, 1)
      if (body.disable !== true && index === -1)
        roster.push({ name, description: String(body.description), mode: String(body.mode), permission: [], options: {} })
      files[name] = { path: `${directory}/.opencode/agent/${name}.md`, exists: true, ...body }
      return json({ location, data: files[name] })
    }
    if (url.pathname === "/instance/dispose" && request.method() === "POST") {
      disposed.push(requestDirectory(request))
      return json(true)
    }
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
              : roster
      if (input.protocol !== "v2") return json(data)
      return json({
        location: { directory: selectedDirectory },
        data: data.map((agent) => ({
          id: agent.name,
          name: agent.name,
          description: agent.description,
          mode: agent.mode,
          hidden: agent.hidden ?? false,
          request: { settings: {} },
          steps: agent.steps,
          system: agent.prompt,
          model: agent.model ? { providerID: agent.model.providerID, id: agent.model.modelID } : undefined,
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
  return { requests, writes, disposed }
}
