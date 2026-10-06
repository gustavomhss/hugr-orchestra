import { expect, test } from "@playwright/test"
import { card, dialog, directory, openAgents, otherDirectory, serverA, serverB, setup } from "./chapter-agents.fixture"

const maestroOnly = "Only Maestro chats with you; other agents work through it."

test.use({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" })
test.setTimeout(120_000)

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: roster cards show the returned fields`, async ({ page }) => {
    await setup(page, { scheme, models: true })
    await openAgents(page)
    const roster = page.getByRole("list", { name: "Configured agents" })
    await expect(roster.getByRole("listitem")).toHaveCount(5)
    await expect(roster).not.toContainText("secret")
    await expect(page.locator(".orchestra-agents").getByRole("heading", { level: 1 })).toHaveText(
      "Who is doingthe work.",
    )
    await expect(page.getByRole("button", { name: "Create agent", exact: true })).toBeEnabled()
    const plan = card(page, "plan")
    expect.soft(await plan.locator(".agent-role").textContent()).toBe("primary")
    // The card's first paragraph is the description; the Maestro-only note sits in its footer.
    expect.soft(await plan.locator("p").first().textContent()).toBe("Plans repository work")
    await expect(plan.locator(".mx-badge")).toHaveText(["reasoner", "7 steps", "Available"])
    await expect(plan.locator(".mx-badge bdi")).toHaveAttribute("title", "example/reasoner")
    await expect(card(page, "build").locator(".mx-badge")).toHaveText(["Default model", "Unlimited steps", "Available"])
    const offline = card(page, "review").locator(".mx-badge")
    await expect(offline).toHaveText(["solo", "Unlimited steps", "Provider not connected"])
    await expect(offline.last()).toHaveClass(/\bbad\b/)
    await expect(offline.last()).toHaveAttribute("title", "offline is not connected in this profile.")
    await page.screenshot({ path: test.info().outputPath(`${scheme}.png`), fullPage: true })
    // Primary, subagent and all-mode agents alike work through Maestro.
    for (const name of ["plan", "research", "review", "build"]) {
      await expect(card(page, name).locator(".mx-card-foot")).toContainText(maestroOnly)
      await expect(card(page, name).getByRole("button", { name: "Open Chat", exact: true })).toHaveCount(0)
      await expect(card(page, name).getByRole("button", { name: "Configure", exact: true })).toBeEnabled()
    }
    const maestro = card(page, "maestro")
    await expect(maestro.getByRole("button", { name: "Open Chat", exact: true })).toBeEnabled()
    await expect(maestro).not.toContainText(maestroOnly)
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
  await expect(page.locator('[data-component="prompt-input-v2"]')).toBeVisible()
  await expect(page.getByRole("button", { name: "Choose agent", exact: true })).toHaveCount(0)
  expect(mock.requests.filter((request) => !["GET", "HEAD", "OPTIONS"].includes(request.method))).toEqual([])
})

test("agent and agent file requests target the selected profile", async ({ page }) => {
  const mock = await setup(page)
  await openAgents(page)
  await card(page, "plan").getByRole("button", { name: "Configure", exact: true }).click()
  await expect(dialog(page).getByRole("heading", { name: "Configure plan" })).toBeVisible()
  await expect(dialog(page).getByLabel("Description")).toHaveValue("Plans repository work")
  await expect(card(page, "build").locator(".mx-badge")).toHaveText(["Default model", "Unlimited steps"])
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
  await expect(model.locator("option")).toHaveText(["Default model", "Builder", "Reasoner"])
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
  expect(mock.disposed).toEqual([directory])
  await expect(card(page, "reviewer")).toContainText("Reviews the diff")
  await expect(card(page, "reviewer").locator(".agent-role")).toHaveText("subagent")
})

test("configure without a file writes only what changed and shows resolved pattern rules as inherited", async ({
  page,
}) => {
  const mock = await setup(page)
  await openAgents(page)
  await card(page, "plan").getByRole("button", { name: "Configure", exact: true }).click()
  const form = dialog(page)
  await expect(form.getByLabel("Description")).toHaveValue("Plans repository work")
  // `plan` resolves `bash git *: ask` from elsewhere; with no file there is no pattern map to keep.
  const bash = form.getByLabel("Bash", { exact: true })
  await expect(bash).toHaveValue("inherit")
  await expect(bash.locator("option")).toHaveText(["Inherit (allow)", "Allow", "Ask", "Deny"])
  await expect(form.getByLabel("Edit", { exact: true }).locator("option:checked")).toHaveText("Inherit (deny)")
  await form.getByRole("button", { name: "Save", exact: true }).click()
  await expect(form).toHaveCount(0)
  // Nothing resolved from built-ins is frozen into the new file.
  expect(mock.writes.map((write) => write.body)).toEqual([{ permission: {}, revision: "" }])
})

test("configure seeds from the project file and keeps pattern rules it does not edit", async ({ page }) => {
  const mock = await setup(page, {
    protocol: "v2",
    files: {
      plan: {
        path: `${directory}/.opencode/agent/plan.md`,
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
      system: "File prompt",
      permission: { bash: { "git *": "ask" }, question: "allow" },
      revision: "r1",
    },
  ])
  expect(mock.writes[0]?.url).toContain(`${serverA}/api/agent/plan/file`)
  expect(mock.disposed).toEqual([])
})

test("cancel and Escape discard the draft and return focus; remove keeps the definition and disables it", async ({
  page,
}) => {
  const mock = await setup(page, {
    files: {
      plan: {
        path: `${directory}/.opencode/agent/plan.md`,
        exists: true,
        revision: "r1",
        description: "Plan file",
        system: "File prompt",
        permission: { "*": "ask", edit: "deny" },
      },
    },
  })
  await openAgents(page)
  const configure = card(page, "plan").getByRole("button", { name: "Configure", exact: true })
  await configure.click()
  await dialog(page).getByLabel("Description").fill("Changed")
  await page.keyboard.press("Escape")
  await expect(dialog(page)).toHaveCount(0)
  await expect(configure).toBeFocused()
  await configure.click()
  await expect(dialog(page).getByLabel("Description")).toHaveValue("Plan file")
  await dialog(page).getByLabel("Description").fill("Changed again")
  await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(configure).toBeFocused()
  expect(mock.writes).toEqual([])

  await configure.click()
  await dialog(page).getByRole("button", { name: "Remove agent", exact: true }).click()
  await expect(dialog(page).getByRole("heading", { name: "Remove plan?" })).toBeVisible()
  await expect(dialog(page)).toContainText("Existing sessions keep their recorded model and conversation.")
  await expect(dialog(page)).toContainText(
    "Adds disable: true to .opencode/agent/plan.md and keeps the rest of the definition. Delete that line to restore plan.",
  )
  expect(mock.writes).toEqual([])
  await dialog(page).getByRole("button", { name: "Confirm", exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
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
})

test("Maestro cannot be removed or taken out of primary mode; its other fields stay editable", async ({ page }) => {
  const mock = await setup(page, {
    models: true,
    files: {
      // Edited by hand: the server ignores this mode and `disable` for Maestro, and a save writes it back as primary.
      maestro: {
        path: `${directory}/.opencode/agent/maestro.md`,
        exists: true,
        revision: "m1",
        description: "Hand edited",
        mode: "subagent",
        disable: true,
      },
    },
  })
  await openAgents(page)
  await card(page, "maestro").getByRole("button", { name: "Configure", exact: true }).click()
  const form = dialog(page)
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
  await form.getByLabel("Bash", { exact: true }).selectOption("ask")
  await form.getByRole("button", { name: "Save", exact: true }).click()
  await expect(form).toHaveCount(0)
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
  await card(page, "plan").getByRole("button", { name: "Configure", exact: true }).click()
  await expect(dialog(page).getByLabel("Mode", { exact: true })).toBeEnabled()
  await expect(dialog(page).getByRole("button", { name: "Remove agent", exact: true })).toBeVisible()
})

test("Escape while the file loads closes the dialog and a late answer does not reopen it", async ({ page }) => {
  const gate = { release: () => {} }
  const mock = await setup(page, {
    fileGate: new Promise<void>((resolve) => {
      gate.release = resolve
    }),
  })
  await openAgents(page)
  const configure = card(page, "plan").getByRole("button", { name: "Configure", exact: true })
  await configure.click()
  await expect(dialog(page)).toContainText("Loading configuration…")
  await expect(dialog(page).getByRole("button", { name: "Save", exact: true })).toBeDisabled()
  await page.keyboard.press("Escape")
  await expect(dialog(page)).toHaveCount(0)
  await expect(configure).toBeFocused()
  gate.release()
  await expect.poll(() => mock.answered.length).toBe(1)
  await expect(dialog(page)).toHaveCount(0)
  await expect(configure).toBeFocused()
  expect(mock.writes).toEqual([])
})

test("Escape closes the dialog while a navigation tooltip still shows behind it", async ({ page }) => {
  const mock = await setup(page)
  await openAgents(page)
  // The WIP row's tooltip is a Kobalte layer that also listens for Escape on the document.
  await page
    .locator('[data-component="orchestra-sidebar"]')
    .getByRole("button", { name: "Agents", exact: true })
    .hover()
  await expect(page.getByRole("tooltip")).toHaveText("Work in progress, revisit before production")
  const configure = card(page, "plan").getByRole("button", { name: "Configure", exact: true })
  await configure.focus()
  await page.keyboard.press("Enter")
  await expect(dialog(page)).toBeVisible()
  await expect(page.getByRole("tooltip")).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(dialog(page)).toHaveCount(0)
  await expect(configure).toBeFocused()
  expect(mock.writes).toEqual([])
})

test("load failures offer a retry; save conflicts and unsupported servers stay explicit", async ({ page }) => {
  const mock = await setup(page, { fileFailures: 1, writeStatus: 409 })
  await openAgents(page)
  await card(page, "plan").getByRole("button", { name: "Configure", exact: true }).click()
  const form = dialog(page)
  await expect(form.getByRole("alert")).toHaveText("The agent configuration could not be loaded.")
  await expect(form.getByRole("button", { name: "Save", exact: true })).toBeDisabled()
  await form.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(form.getByRole("alert")).toBeHidden()
  await expect(form.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0)
  await form.getByLabel("Description").fill("Mine")
  await form.getByRole("button", { name: "Save", exact: true }).click()
  await expect(form.getByRole("alert")).toHaveText(
    "The agent file changed on disk after it was opened. Close this dialog and open it again to edit the current version.",
  )
  await expect(form.getByLabel("Description")).toHaveValue("Mine")
  expect(mock.writes).toHaveLength(1)
  expect(mock.disposed).toEqual([])
})

for (const fileApi of [false, "html"] as const) {
  test(`a server without the agent file API keeps the editor read-only (${fileApi || "404"})`, async ({ page }) => {
    const mock = await setup(page, { fileApi })
    await openAgents(page)
    await card(page, "plan").getByRole("button", { name: "Configure", exact: true }).click()
    const form = dialog(page)
    await expect(form.getByRole("alert")).toHaveText("This server cannot save agent configuration.")
    await expect(form.getByRole("button", { name: "Save", exact: true })).toBeDisabled()
    await expect(form.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0)
    await expect(form.getByLabel("Description")).toBeDisabled()
    await expect(form.getByRole("button", { name: "Remove agent", exact: true })).toHaveCount(0)
    expect(mock.writes).toEqual([])
  })
}

test("saving while sessions run defers the legacy reload instead of disposing the instance", async ({ page }) => {
  const mock = await setup(page, { sessionStatus: { ses_busy: { type: "busy" } } })
  await openAgents(page)
  await page.getByRole("button", { name: "Create agent", exact: true }).click()
  await dialog(page).getByLabel("Name").fill("reviewer")
  await dialog(page).getByLabel("Description").fill("Reviews the diff")
  await dialog(page).getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
  expect(mock.writes).toHaveLength(1)
  await expect(page.getByRole("status").filter({ hasText: "Saved to" })).toHaveText(
    "Saved to .opencode/agent/reviewer.md. Sessions are running in this profile, so the agent list reloads once they finish.",
  )
  expect(mock.disposed).toEqual([])
})
