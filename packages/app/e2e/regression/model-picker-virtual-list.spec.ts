import { expect, test, type Locator, type Page } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"
import { mockOrchestraServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const directory = "C:/Orchestra/ModelPickerVirtualList"
const projectID = "proj_model_picker_virtual_list"
const sessionID = "ses_model_picker_virtual_list"
const total = 400
// Hundreds of models stay visible by default when the catalog carries no release dates.
const label = (index: number) => String(index).padStart(3, "0")
const routerModels = Object.fromEntries(
  Array.from({ length: total }, (_, index) => [
    `model-${label(index)}`,
    {
      id: `model-${label(index)}`,
      name: `Router Model ${label(index)}`,
      cost: { input: 1, output: 1 },
      limit: { context: 200_000 },
    },
  ]),
)

// Windowed rows are absolutely positioned from fixed row sizes, so they must still stack edge to edge.
async function expectContiguous(rows: Locator) {
  const boxes = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()).sort((a, b) => a.top - b.top),
  )
  expect(boxes.length).toBeGreaterThan(3)
  boxes.slice(1).forEach((box, index) => expect(Math.abs(box.top - boxes[index].bottom)).toBeLessThan(0.5))
}

async function openSession(page: Page) {
  await mockOrchestraServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "model-picker-virtual-list",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode Zen",
          models: {
            "free-model": {
              id: "free-model",
              name: "Free Model",
              cost: { input: 0, output: 0 },
              limit: { context: 1 },
            },
          },
        },
        { id: "router", name: "Router", models: routerModels },
      ],
      connected: ["opencode", "router"],
      default: { providerID: "opencode", modelID: "free-model" },
    },
    sessions: [
      {
        id: sessionID,
        slug: "model-picker-virtual-list",
        projectID,
        directory,
        title: "Model picker virtual list",
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
    ],
    pageMessages: () => ({ items: [] }),
    // Each event-stream reconnect resyncs providers, which resets the list's active row.
    eventRetry: 600_000,
  })
  await page.addInitScript(() => {
    localStorage.setItem(
      "settings.v3",
      JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
    )
  })
  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  const control = page.locator('[data-action="prompt-model"]')
  await expectAppVisible(control)
  await expect(control).toHaveAttribute("data-control-type", "popover")
  await expect(control).toHaveText("Free Model")
  return control
}

test("composer model popover renders a bounded window and keeps keyboard selection", async ({ page }) => {
  const control = await openSession(page)
  await control.click()

  const search = page.getByPlaceholder("Search models", { exact: true })
  await expect(search).toBeFocused()
  const options = page.locator('[data-option-key^="router:"]')
  await expect(page.locator('[data-option-key="opencode:free-model"]')).toHaveAttribute("data-selected-model", "true")
  await expect(page.locator('[data-option-key="router:model-000"]')).toBeVisible()
  await expect.poll(() => options.count()).toBeLessThan(60)
  await expectContiguous(options)

  // Up from the selected free model wraps to "Manage models", then to the last model, far outside the window.
  await search.press("ArrowUp")
  await search.press("ArrowUp")
  await expect(page.locator(`[data-option-key="router:model-${label(total - 1)}"]`)).toBeInViewport()
  await expect.poll(() => options.count()).toBeLessThan(60)
  await search.press("Enter")
  await expect(control).toHaveText(`Router Model ${label(total - 1)}`)

  await control.click()
  await expect(search).toBeFocused()
  await expect(page.locator(`[data-option-key="router:model-${label(total - 1)}"]`)).toBeInViewport()
  await search.fill("model 250")
  await expect(page.locator('[data-option-key="router:model-250"]')).toBeVisible()
  await search.press("Enter")
  await expect(control).toHaveText("Router Model 250")
})

test("model dialog renders a bounded window and keeps keyboard selection", async ({ page }) => {
  const control = await openSession(page)
  const composer = page.locator('[data-component="prompt-input-v2"]')
  await composer.getByRole("button", { name: "Add images and files" }).click()
  await page.getByRole("menuitem", { name: "Commands" }).click()
  await page.locator('[data-suggestion-id="model.choose"]').click()

  const dialog = page.getByRole("dialog")
  const items = dialog.locator('[data-slot="list-item"]')
  const search = dialog.getByPlaceholder("Search models", { exact: true })
  // The command menu may restore focus to its trigger while the dialog opens; focus the search like a user.
  await search.click()
  await expect(search).toBeFocused()
  const current = dialog.locator('[data-slot="list-item"][data-key="opencode:free-model"]')
  await expect(current).toHaveAttribute("data-selected", "true")
  await expect(dialog.locator('[data-slot="list-item"][data-key="router:model-000"]')).toBeVisible()
  await expect.poll(() => items.count()).toBeLessThan(60)
  await expectContiguous(dialog.locator('[data-slot="list-item"][data-key^="router:"]'))

  // The list activates its first row; Up wraps to the last model, far outside the mounted window.
  await expect(current).toHaveAttribute("data-active", "true")
  await search.press("ArrowUp")
  const last = dialog.locator(`[data-slot="list-item"][data-key="router:model-${label(total - 1)}"]`)
  await expect(last).toBeInViewport()
  await expect(last).toHaveAttribute("data-active", "true")
  await expect.poll(() => items.count()).toBeLessThan(60)
  await search.press("Enter")
  await expect(dialog).toHaveCount(0)
  await expect(control).toHaveText(`Router Model ${label(total - 1)}`)

  await composer.getByRole("button", { name: "Add images and files" }).click()
  await page.getByRole("menuitem", { name: "Commands" }).click()
  await page.locator('[data-suggestion-id="model.choose"]').click()
  await search.click()
  await expect(search).toBeFocused()
  await expect(last).toBeInViewport()
  await expect(last).toHaveAttribute("data-selected", "true")
  await search.fill("model 321")
  const match = dialog.locator('[data-slot="list-item"][data-key="router:model-321"]')
  await expect(match).toHaveAttribute("data-active", "true")
  await search.press("Enter")
  await expect(control).toHaveText("Router Model 321")
})
