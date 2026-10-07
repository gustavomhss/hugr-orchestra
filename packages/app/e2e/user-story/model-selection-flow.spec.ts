import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const directory = "C:\\OpenCode\\NewProject"

// A fresh install has no provider: nothing is connected for free, so the model control asks for a provider and
// OpenCode Go is connected like any other provider, from the full list.
test("creates a session in a new project, connects OpenCode Go, and selects its model", async ({ page }) => {
  let connectedGo = false
  const connections: Array<{ integrationID: string; body: unknown }> = []

  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "proj_model_selection_flow",
      worktree: directory,
      vcs: "git",
      name: "NewProject",
      time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
      sandboxes: [],
    },
    provider: () => ({
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: {
            "free-model": {
              id: "free-model",
              name: "Free Model",
              cost: { input: 0, output: 0 },
              limit: { context: 200_000 },
            },
          },
        },
        {
          id: "opencode-go",
          name: "OpenCode Go",
          models: {
            "go-model-1": {
              id: "go-model-1",
              name: "Go Model 1",
              cost: { input: 1, output: 1 },
              limit: { context: 200_000 },
            },
          },
        },
      ],
      connected: connectedGo ? ["opencode-go"] : [],
      default: connectedGo ? { "opencode-go": "go-model-1" } : {},
    }),
    integrationMethods: { "opencode-go": [{ type: "api", label: "API key" }] },
    onConnectKey: (input) => {
      connections.push(input)
      if (input.integrationID === "opencode-go") connectedGo = true
    },
    sessions: [],
    pageMessages: () => ({ items: [] }),
    fileList: (path) =>
      path ? [] : [{ name: "NewProject", path: "NewProject", absolute: directory, type: "directory", ignored: false }],
    findFiles: () => ["NewProject"],
  })
  await page.addInitScript(() => {
    localStorage.setItem(
      "settings.v3",
      JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
    )
    if (localStorage.getItem("opencode.global.dat:server") === null)
      localStorage.setItem("opencode.global.dat:server", JSON.stringify({ projects: { local: [] } }))
  })

  await page.goto("/")
  const profile = page.getByRole("button", { name: "Choose repository profile", exact: true })
  await expect(profile).toHaveCount(1)
  await expectAppVisible(profile)
  await expect(profile).toContainText("Choose a project")
  await profile.click()
  const picker = page.locator('[data-component="orchestra-profile-picker"]')
  await expect(picker).toHaveCount(1)
  const addProject = picker.getByRole("menuitem", { name: "Add project", exact: true })
  await expect(addProject).toHaveCount(1)
  await expectAppVisible(addProject)
  await addProject.click()
  const project = page.getByRole("dialog").locator(`[data-directory-path=${JSON.stringify(directory)}]`)
  await expect(project).toHaveCount(1)
  await project.click()
  await expect(profile).toContainText("NewProject")
  // The approved card reads the new profile's agents and branch; its full directory stays verbatim in the title.
  const meta = profile.locator("small")
  // The mock server lists only Orchestra's native maestro agent.
  await expect(meta).toHaveText("1 agent · main")
  await expect(meta).toHaveAttribute("title", directory)
  await expect(profile).toHaveAttribute("aria-expanded", "false")

  // Home is the KPI dashboard; Chat opens a draft for the selected profile that has no session yet.
  const newSession = page
    .locator('[data-component="orchestra-sidebar"]')
    .getByRole("button", { name: "Chat", exact: true })
  await expect(newSession).toHaveCount(1)
  await expect(newSession).toBeEnabled()
  await newSession.click()
  await expect(page).toHaveURL(/\/new-session\?draftId=[^&]+$/)
  const draftURL = new URL(page.url())
  const draftTab = page.locator(`[data-titlebar-tab] a[href=${JSON.stringify(draftURL.pathname + draftURL.search)}]`)
  await expect(draftTab).toHaveCount(1)
  const composer = page.locator('[data-component="prompt-input-v2"]')
  await expect(composer).toHaveCount(1)
  await expectAppVisible(composer)
  const editor = composer.getByRole("textbox", { name: "Prompt", exact: true })
  await expect(editor).toHaveCount(1)
  const draft = "Keep the selected model with this new-session draft."
  await editor.fill(draft)

  const modelControl = page.locator('[data-action="prompt-model"]')
  await expect(modelControl).toHaveCount(1)
  await modelControl.click()
  const unpaid = page.locator('[data-component="dialog-v2"]')
  await expect(unpaid.locator('[data-section="no-provider"]')).toHaveText(
    "No provider is connected yet. Connect one to choose a model.",
  )
  await expect(unpaid.locator('[data-section="free-models"]')).toHaveCount(0)
  // Zen and Go have no featured place: the dialog offers neither, and Go is found in the full provider list.
  await expect(unpaid.locator('[data-provider-id="opencode"], [data-provider-id="opencode-go"]')).toHaveCount(0)
  await unpaid.getByRole("button", { name: "See 70+ more providers", exact: true }).click()
  const goRow = page.locator('[data-provider-id="opencode-go"]')
  await expect(goRow).toHaveCount(1)
  await expect(goRow).not.toContainText("Recommended")
  await goRow.click()
  await page.locator('[data-input="provider-api-key"]').fill("mock-go-api-key")
  await page.locator('[data-action="provider-connect-submit"]').click()
  await expect(page.locator('[data-component="dialog-v2"]')).toHaveCount(0)
  expect(connections).toEqual([{ integrationID: "opencode-go", body: { key: "mock-go-api-key" } }])

  await expect(modelControl).toHaveAttribute("data-control-type", "popover")
  await modelControl.click()
  const goModel = page.locator('[data-option-key="opencode-go:go-model-1"]')
  await expect(goModel).toHaveCount(1)
  await expect(goModel).toBeVisible()
  await goModel.click()

  await expect(modelControl).toHaveText("Go Model 1")
  await expect(editor).toHaveText(draft)
  await page.reload()
  await expect(page).toHaveURL(draftURL.href)
  await expect(draftTab).toHaveCount(1)
  await expect(profile).toContainText("NewProject")
  await expect(meta).toHaveText("1 agent · main")
  await expect(meta).toHaveAttribute("title", directory)
  await expect(modelControl).toHaveText("Go Model 1")
  await expect(editor).toHaveText(draft)
  expect(connections).toEqual([{ integrationID: "opencode-go", body: { key: "mock-go-api-key" } }])
})
