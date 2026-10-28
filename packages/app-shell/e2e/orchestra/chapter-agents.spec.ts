import { expect, test } from "@playwright/test"
import {
  card,
  dialog,
  directory,
  openAgent,
  openAgents,
  otherDirectory,
  saveBar,
  saveChanges,
  screen,
  serverA,
  serverB,
  setup,
  tab,
} from "./chapter-agents.fixture"

test.use({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" })
test.setTimeout(120_000)

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: roster cards show the returned fields`, async ({ page }) => {
    const mock = await setup(page, { scheme, models: true })
    await openAgents(page)
    const roster = page.getByRole("list", { name: "Configured agents" })
    await expect(roster.getByRole("listitem")).toHaveCount(5)
    expect(
      mock.requests.filter(
        (request) => new URL(request.url).pathname === "/api/agent" && request.directory === directory,
      ),
    ).toHaveLength(1)
    await expect(roster).not.toContainText("secret")
    await expect(page.locator(".orchestra-agents").getByRole("heading", { level: 1 })).toHaveText(
      "Who is doing the work.",
    )
    await expect(page.getByRole("button", { name: "Create agent", exact: true })).toBeEnabled()
    const plan = card(page, "plan")
    // A lead agent is any agent that is not a subagent; the card says "Specialist" for the rest.
    expect.soft(await plan.locator(".agent-role").textContent()).toBe("Lead agent")
    expect.soft(await card(page, "research").locator(".agent-role").textContent()).toBe("Specialist")
    expect.soft(await card(page, "review").locator(".agent-role").textContent()).toBe("Lead agent")
    expect.soft(await plan.locator(".agent-desc").textContent()).toBe("Plans repository work")
    await expect(plan.locator(".agent-model")).toHaveText("Reasoner")
    await expect(plan.locator(".agent-model")).toHaveAttribute("title", "example/reasoner")
    await expect(plan.getByRole("img", { name: "Available", exact: true })).toHaveClass(/\bgood\b/)
    await expect(card(page, "build").locator(".agent-model")).toHaveText("Default model")
    await expect(card(page, "build").getByRole("img", { name: "Available", exact: true })).toHaveClass(/\bgood\b/)
    await expect(card(page, "review").locator(".agent-model")).toHaveText("solo")
    const offline = card(page, "review").getByRole("img", { name: "Provider not connected", exact: true })
    await expect(offline).toHaveClass(/\bbad\b/)
    await expect(offline).toHaveAttribute("title", "offline is not connected in this project.")
    await page.screenshot({ path: test.info().outputPath(`${scheme}.png`), fullPage: true })
    // Only Maestro chats with you; every card opens its agent page.
    for (const name of ["plan", "research", "review", "build"]) {
      await expect(card(page, name).getByRole("button", { name: "Open Chat", exact: true })).toHaveCount(0)
      await expect(card(page, name).getByRole("button", { name, exact: true })).toBeEnabled()
    }
    const maestro = card(page, "maestro")
    await expect(maestro.getByRole("button", { name: "Open Chat", exact: true })).toBeEnabled()
  })
}

test("Open Chat opens a blank draft with no agent choice for the same profile and sends nothing", async ({ page }) => {
  const mock = await setup(page)
  await openAgents(page)
  await card(page, "maestro").getByRole("button", { name: "Open Chat", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/, { timeout: 30_000 })
  const draftID = new URL(page.url()).searchParams.get("draftId")
  await expect
    .poll(() =>
      page.evaluate((draftID) => {
        const tabs = JSON.parse(localStorage.getItem("orchestra.window.browser.dat:tabs") ?? "[]") as Array<{
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
  expect(mock.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method))).toEqual([])
  expect(
    mock.requests
      .filter((request) => new URL(request.url).pathname === "/api/agent")
      .every(
        (request) =>
          new URL(request.url).origin === serverA &&
          new URL(request.url).searchParams.get("location[directory]") === directory,
      ),
  ).toBe(true)
  await page.reload()
  await expect(page.locator('[data-component="prompt-input-v2"]')).toBeVisible()
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveCount(0)
  expect(mock.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method))).toEqual([])
})

test("agent and agent file requests target the selected profile", async ({ page }) => {
  const mock = await setup(page)
  await openAgents(page)
  await expect(card(page, "build").getByRole("img", { name: "Provider not connected", exact: true })).toBeVisible()
  await openAgent(page, "plan")
  await expect(screen(page).getByLabel("Description")).toHaveValue("Plans repository work")
  const targets = mock.requests.filter((request) => new URL(request.url).pathname === "/api/agent")
  expect(targets.length).toBeGreaterThan(0)
  expect(
    targets.every(
      (request) =>
        new URL(request.url).origin === serverA &&
        new URL(request.url).searchParams.get("location[directory]") === directory,
    ),
  ).toBe(true)
  const files = mock.requests.filter((request) => new URL(request.url).pathname === "/api/agent/plan/file")
  expect(files.map((request) => [new URL(request.url).origin, request.method, request.directory])).toEqual([
    [serverA, "GET", directory],
  ])
})

test("ordinary drafts offer no agent choice", async ({ page }) => {
  await setup(page)
  await openAgents(page)
  await page.locator('[data-component="orchestra-sidebar"]').getByRole("button", { name: "Chat", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(page.locator('[data-component="prompt-input-v2"]')).toBeVisible()
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveCount(0)
})

test("Open Chat opens a draft on Maestro's configured model", async ({ page }) => {
  const mock = await setup(page, { models: true })
  await openAgents(page)
  await card(page, "maestro").getByRole("button", { name: "Open Chat", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  // Maestro's model, not the provider default Builder, shows the draft runs on Maestro.
  await expect(page.locator('[data-action="prompt-model"]')).toContainText("Reasoner")
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveCount(0)
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
    await expect.poll(() => requests.some((request) => new URL(request.url).pathname === "/api/agent")).toBe(true)
    await page.getByRole("button", { name: "Choose project" }).click()
    await page.getByRole("menuitemradio", { name: "Boreal" }).click()
    await expect(page.getByRole("list", { name: "Configured agents" })).toContainText("boreal-agent")
    pending.release()
    await expect
      .poll(() => completed.filter((url) => url.startsWith(serverA) && new URL(url).pathname === "/api/agent").length)
      .toBeGreaterThanOrEqual(
        requests.filter((request) => request.url.startsWith(serverA) && new URL(request.url).pathname === "/api/agent")
          .length,
      )
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    await expect
      .poll(() => requests.filter((request) => new URL(request.url).pathname === "/api/agent").length)
      .toBeGreaterThanOrEqual(2)
    await expect(page.getByRole("list", { name: "Configured agents" })).not.toContainText("Plans repository work")
    await page.getByRole("button", { name: "Choose project" }).click()
    await page.getByRole("menuitemradio", { name: "Other worktree" }).click()
    await expect(page.getByText("Loading agents…", { exact: true })).toBeVisible()
    await expect(page.getByRole("list", { name: "Configured agents" })).toHaveCount(0)
    pending.releaseOther()
    await expect(page.getByRole("list", { name: "Configured agents" })).toContainText("other-agent")
    await expect(page.getByRole("list", { name: "Configured agents" })).not.toContainText("boreal-agent")
    expect(
      requests.some(
        (request) =>
          request.url.startsWith(serverB) && new URL(request.url).searchParams.get("location[directory]") === directory,
      ),
    ).toBe(true)
    expect(
      requests.some(
        (request) =>
          request.url.startsWith(serverA) &&
          new URL(request.url).searchParams.get("location[directory]") === otherDirectory,
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
          empty: "No visible agents are configured for this project.",
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

test("an agent request retains its response state while a later refresh changes the fixture", async ({ page }) => {
  const pending = Promise.withResolvers<void>()
  const response = { state: "empty" }
  const mock = await setup(page, { response, wait: pending.promise })
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect
      .poll(() =>
        mock.requests.some(
          (request) => new URL(request.url).pathname === "/api/agent" && request.directory === directory,
        ),
      )
      .toBe(true)
    response.state = "ready"
    pending.resolve()
    await page
      .locator('[data-component="orchestra-sidebar"]')
      .getByRole("button", { name: "Agents", exact: true })
      .click()
    await expect(page).toHaveURL(/\/orchestra\/agents$/)
    await expect(page.getByText("No visible agents are configured for this project.", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Refresh", exact: true }).click()
    await expect(page.getByRole("list", { name: "Configured agents" })).toContainText("Plans repository work")
  } finally {
    pending.resolve()
  }
})

test("agents retain configured model, steps and permission rules", async ({ page }) => {
  await setup(page)
  await openAgents(page)
  await expect(card(page, "plan").locator(".agent-model")).toHaveAttribute("title", "example/reasoner")
  await openAgent(page, "plan")
  await expect(screen(page).getByLabel("Provider-turn allowance")).toHaveValue("7")
  await tab(page, "Tools").click()
  await expect(screen(page).getByLabel("Edit", { exact: true }).locator("option:checked")).toHaveText("Inherit (deny)")
  await expect(screen(page).getByLabel("Read", { exact: true }).locator("option:checked")).toHaveText("Inherit (allow)")
})

test("create agent writes the project agent file and reloads the roster", async ({ page }) => {
  const mock = await setup(page, { models: true })
  await openAgents(page)
  const opener = page.getByRole("button", { name: "Create agent", exact: true })
  await opener.click()
  const form = dialog(page)
  await expect(form.getByRole("heading", { name: "Create agent" })).toBeVisible()
  await expect(form.getByLabel("Mode", { exact: true })).toHaveValue("subagent")
  // A new agent only gets profile rules this page cannot see, so no inherited value is claimed.
  await expect(form.getByLabel("Bash", { exact: true }).locator("option:checked")).toHaveText("Inherit")
  const model = form.getByLabel("Model", { exact: true })
  await expect(model.locator("option")).toHaveText(["Inherit", "Builder", "Reasoner"])
  await expect(model.locator("optgroup")).toHaveAttribute("label", "Example")

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
  await model.selectOption("example/reasoner")
  await form.getByLabel("System instructions").fill("Read the diff first.")
  await form.getByLabel("Bash", { exact: true }).selectOption("deny")
  await form.getByRole("button", { name: "Save", exact: true }).click()
  await expect(form).toHaveCount(0)
  await expect(opener).toBeFocused()
  expect(mock.writes).toEqual([
    {
      url: expect.stringContaining(`${serverA}/api/agent/reviewer/file`),
      directory,
      body: {
        mode: "subagent",
        description: "Reviews the diff",
        model: "example/reasoner",
        steps: 5,
        system: "Read the diff first.",
        permission: { bash: "deny" },
      },
    },
  ])
  expect(mock.disposed).toEqual([])
  await expect(card(page, "reviewer")).toContainText("Reviews the diff")
  await expect(card(page, "reviewer").locator(".agent-role")).toHaveText("Specialist")
})

test("saving an agent without a file writes only what changed and shows resolved pattern rules as inherited", async ({
  page,
}) => {
  const mock = await setup(page)
  await openAgents(page)
  await openAgent(page, "plan")
  const form = screen(page)
  await expect(form.getByLabel("Description")).toHaveValue("Plans repository work")
  // Nothing changed yet, so there is nothing to save.
  await expect(saveBar(page)).toHaveCount(0)
  await tab(page, "Tools").click()
  // `plan` resolves `bash git *: ask` from elsewhere; with no file there is no pattern map to keep.
  const bash = form.getByLabel("Bash", { exact: true })
  await expect(bash).toHaveValue("inherit")
  await expect(bash.locator("option")).toHaveText(["Inherit (allow)", "Allow", "Ask", "Deny"])
  await expect(form.getByLabel("Edit", { exact: true }).locator("option:checked")).toHaveText("Inherit (deny)")
  await bash.selectOption("ask")
  await expect(saveBar(page)).toBeVisible()
  await saveChanges(page)
  await expect(saveBar(page)).toHaveCount(0)
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible()
  // Nothing resolved from built-ins is frozen into the new file.
  expect(mock.writes.map((write) => write.body)).toEqual([{ permission: { bash: "ask" }, revision: "" }])
})

test("an agent page seeds from the project file and keeps pattern rules it does not edit", async ({ page }) => {
  const mock = await setup(page, {
    files: {
      plan: {
        path: `${directory}/.orchestra/agent/plan.md`,
        exists: true,
        revision: "r1",
        description: "From the file",
        mode: "primary",
        system: "File prompt",
        permission: { edit: "deny", bash: { "git *": "ask" }, question: "allow" },
      },
    },
  })
  await openAgents(page)
  await openAgent(page, "plan")
  const form = screen(page)
  await expect(form.getByLabel("Description")).toHaveValue("From the file")
  await tab(page, "System prompt").click()
  await expect(form.getByLabel("System instructions")).toHaveValue("File prompt")
  await tab(page, "Tools").click()
  await expect(form.getByLabel("Edit", { exact: true })).toHaveValue("deny")
  await expect(form.getByLabel("Edit", { exact: true }).locator("option").first()).toHaveText("Inherit (allow)")
  await expect(form.getByLabel("Bash", { exact: true })).toHaveValue("custom")

  await form.getByLabel("Edit", { exact: true }).selectOption("inherit")
  await tab(page, "Overview").click()
  await form.getByLabel("Model", { exact: true }).selectOption("")
  await saveChanges(page)
  await expect(saveBar(page)).toHaveCount(0)
  expect(mock.writes.map((write) => write.body)).toEqual([
    {
      mode: "primary",
      description: "From the file",
      system: "File prompt",
      permission: { bash: { "git *": "ask" }, question: "allow" },
      revision: "r1",
    },
  ])
  expect(mock.writes[0]?.url).toContain(`${serverA}/api/agent/plan/file`)
  expect(mock.disposed).toEqual([])
})

test("the skill tree tab lists a seat's roots and opens a root to the nodes below it", async ({ page }) => {
  await setup(page)
  await openAgents(page)
  await openAgent(page, "research")
  await tab(page, "Skill tree").click()
  const tree = screen(page).locator(".agent-tree")
  await expect(tree.locator(":scope > li")).toHaveCount(1)
  const leaf = tree.getByText("research-survey-licenses", { exact: true })
  await expect(leaf).toBeHidden()
  await tree.getByText("research-survey", { exact: true }).click()
  await expect(leaf).toBeVisible()
  await expect(tree).toContainText("Check license terms")
  await expect(tree).toContainText("Opens when: the dependency ships under a license")
})

test("Discard and Back drop the draft; remove keeps the definition and disables it", async ({ page }) => {
  const mock = await setup(page, {
    files: {
      plan: {
        path: `${directory}/.orchestra/agent/plan.md`,
        exists: true,
        revision: "r1",
        description: "Plan file",
        system: "File prompt",
        permission: { "*": "ask", edit: "deny" },
      },
    },
  })
  await openAgents(page)
  await openAgent(page, "plan")
  const description = screen(page).getByLabel("Description")
  await description.fill("Changed")
  await expect(saveBar(page)).toBeVisible()
  await saveBar(page).getByRole("button", { name: "Discard", exact: true }).click()
  await expect(description).toHaveValue("Plan file")
  await expect(saveBar(page)).toHaveCount(0)

  await description.fill("Changed again")
  await screen(page).getByRole("button", { name: "Agents", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/agents$/)
  await expect(screen(page)).toHaveCount(0)
  await openAgent(page, "plan")
  await expect(screen(page).getByLabel("Description")).toHaveValue("Plan file")
  expect(mock.writes).toEqual([])

  await expect(screen(page)).toContainText("Existing sessions keep their recorded model and conversation.")
  await screen(page).getByRole("button", { name: "Remove agent", exact: true }).click()
  await expect(screen(page)).toContainText(
    "Adds disable: true to .orchestra/agent/plan.md and keeps the rest of the definition. Restore plan from the notice that follows, or later by creating an agent with the same name.",
  )
  expect(mock.writes).toEqual([])
  await screen(page).getByRole("button", { name: "Remove plan", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/agents$/)
  expect(mock.writes.map((write) => [write.body, write.directory])).toEqual([
    [
      {
        description: "Plan file",
        system: "File prompt",
        permission: { "*": "ask", edit: "deny" },
        disable: true,
        revision: "r1",
      },
      directory,
    ],
  ])
  await expect(page.getByRole("list", { name: "Configured agents" }).getByRole("listitem")).toHaveCount(4)
  await expect(card(page, "plan")).toHaveCount(0)

  // The page offers to take the removal back: the same definition is written again without `disable`.
  await expect(page.getByRole("status").filter({ hasText: "Removed plan." })).toBeVisible()
  await page.getByRole("button", { name: "Restore", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "Removed plan." })).toHaveCount(0)
  expect(mock.writes.at(-1)?.body).toEqual({
    description: "Plan file",
    system: "File prompt",
    permission: { "*": "ask", edit: "deny" },
    revision: "plan-1",
  })
  await expect(card(page, "plan")).toHaveCount(1)
})

test("Maestro cannot be removed or taken out of primary mode; its other fields stay editable", async ({ page }) => {
  const mock = await setup(page, {
    models: true,
    files: {
      // Edited by hand: the server ignores this mode and `disable` for Maestro, and a save writes it back as primary.
      maestro: {
        path: `${directory}/.orchestra/agent/maestro.md`,
        exists: true,
        revision: "m1",
        description: "Hand edited",
        mode: "subagent",
        disable: true,
      },
    },
  })
  await openAgents(page)
  await openAgent(page, "maestro")
  const form = screen(page)
  await expect(form.getByLabel("Description")).toHaveValue("Hand edited")
  const mode = form.getByLabel("Mode", { exact: true })
  await expect(mode).toBeDisabled()
  await expect(mode).toHaveValue("primary")
  await expect(mode).toHaveAccessibleDescription(
    "Maestro runs every session, so it cannot be removed or taken out of primary mode.",
  )
  await expect(form.getByRole("button", { name: "Remove agent", exact: true })).toHaveCount(0)

  await form.getByLabel("Description").fill("Conducts the team")
  await form.getByLabel("Model", { exact: true }).selectOption("example/builder")
  await tab(page, "Tools").click()
  await form.getByLabel("Bash", { exact: true }).selectOption("ask")
  await saveChanges(page)
  await expect(saveBar(page)).toHaveCount(0)
  expect(mock.writes.map((write) => write.body)).toEqual([
    {
      mode: "primary",
      description: "Conducts the team",
      model: "example/builder",
      permission: { bash: "ask" },
      revision: "m1",
    },
  ])

  // Every other agent keeps both controls.
  await form.getByRole("button", { name: "Agents", exact: true }).click()
  await openAgent(page, "plan")
  await expect(screen(page).getByLabel("Mode", { exact: true })).toBeEnabled()
  await expect(screen(page).getByRole("button", { name: "Remove agent", exact: true })).toBeVisible()
})

test("Back while the file loads leaves the page and a late answer does not bring it back", async ({ page }) => {
  const gate = { release: () => {} }
  const mock = await setup(page, {
    fileGate: new Promise<void>((resolve) => {
      gate.release = resolve
    }),
  })
  await openAgents(page)
  await openAgent(page, "plan", false)
  await expect(screen(page)).toContainText("Loading configuration…")
  await expect(saveBar(page)).toHaveCount(0)
  await screen(page).getByRole("button", { name: "Agents", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/agents$/)
  await expect(screen(page)).toHaveCount(0)
  gate.release()
  await expect.poll(() => mock.answered.length).toBe(1)
  await expect(page).toHaveURL(/\/orchestra\/agents$/)
  await expect(screen(page)).toHaveCount(0)
  await expect(page.getByRole("list", { name: "Configured agents" })).toBeVisible()
  expect(mock.writes).toEqual([])
})

// Production builds hide the WIP tooltip (`showWip`), and this suite runs one, so the tooltip never opens.
test.fixme("Escape closes the dialog while a navigation tooltip still shows behind it", async ({ page }) => {
  const mock = await setup(page)
  await openAgents(page)
  // The WIP row's tooltip is a Kobalte layer that also listens for Escape on the document.
  await page.locator(".orchestra-agents .mx-heading").hover()
  await page
    .locator('[data-component="orchestra-sidebar"]')
    .getByRole("button", { name: "Agents", exact: true })
    .hover()
  await expect(page.getByRole("tooltip")).toHaveText("Work in progress, revisit before production")
  const opener = page.getByRole("button", { name: "Create agent", exact: true })
  await opener.focus()
  await page.keyboard.press("Enter")
  await expect(dialog(page)).toBeVisible()
  await expect(page.getByRole("tooltip")).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(dialog(page)).toHaveCount(0)
  await expect(opener).toBeFocused()
  expect(mock.writes).toEqual([])
})

test("load failures offer a retry; save conflicts and unsupported servers stay explicit", async ({ page }) => {
  const mock = await setup(page, { fileFailures: 1, writeStatus: 409 })
  await openAgents(page)
  await openAgent(page, "plan")
  const form = screen(page)
  await expect(form.getByRole("alert")).toHaveText("The agent configuration could not be loaded.")
  // A failed load leaves the page read-only: nothing can be edited, so nothing can be saved.
  await expect(form.getByLabel("Description")).toBeDisabled()
  await expect(saveBar(page)).toHaveCount(0)
  await form.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(form.getByRole("alert")).toBeHidden()
  await expect(form.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0)
  await form.getByLabel("Description").fill("Mine")
  await saveChanges(page)
  await expect(form.getByRole("alert")).toHaveText(
    "The agent file changed on disk after it was opened. Open the agent again to edit the current version.",
  )
  await expect(form.getByLabel("Description")).toHaveValue("Mine")
  expect(mock.writes).toHaveLength(1)
  expect(mock.disposed).toEqual([])
})

for (const fileApi of [false, "html"] as const) {
  test(`a server without the agent file API keeps the editor read-only (${fileApi || "404"})`, async ({ page }) => {
    const mock = await setup(page, { fileApi })
    await openAgents(page)
    await openAgent(page, "plan")
    const form = screen(page)
    await expect(form.getByRole("alert")).toHaveText("This server cannot save agent configuration.")
    await expect(saveBar(page)).toHaveCount(0)
    await expect(form.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0)
    await expect(form.getByLabel("Description")).toBeDisabled()
    await expect(form.getByRole("button", { name: "Remove agent", exact: true })).toHaveCount(0)
    expect(mock.writes).toEqual([])
  })
}
