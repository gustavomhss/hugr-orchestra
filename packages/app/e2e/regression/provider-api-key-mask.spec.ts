import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const directory = "C:/OpenCode/ProviderApiKeyMask"
const projectID = "proj_provider_api_key_mask"
const sessionID = "ses_provider_api_key_mask"
const secret = "sk-mask-test-0123456789"

// Nothing is connected, so the model control opens the connect dialog. A connected OpenCode Zen counts as a
// connected provider like any other and would open the model popover instead.
async function openSession(page: Page) {
  const connections: Array<{ integrationID: string; body: unknown }> = []
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "provider-api-key-mask",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: {
            "free-model": {
              id: "free-model",
              name: "Free Model",
              cost: { input: 0, output: 0 },
              limit: { context: 1 },
            },
          },
        },
        {
          id: "opencode-go",
          name: "OpenCode Go",
          models: {
            "go-model": { id: "go-model", name: "Go Model", cost: { input: 1, output: 1 }, limit: { context: 1 } },
          },
        },
      ],
      connected: [],
      default: {},
    },
    onConnectKey: (input) => connections.push(input),
    sessions: [
      {
        id: sessionID,
        slug: "provider-api-key-mask",
        projectID,
        directory,
        title: "Provider API key mask",
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
    ],
    pageMessages: () => ({ items: [] }),
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
  await expect(control).toHaveAttribute("data-control-type", "dialog")
  return { control, connections }
}

test("masks the provider API key while it is typed and keeps the reveal toggle keyboard operable", async ({ page }) => {
  const { control, connections } = await openSession(page)
  await control.click()
  // OpenCode Go has no featured place in the dialog; it is connected from the full provider list.
  await page.getByRole("button", { name: "See 70+ more providers", exact: true }).click()
  await page.locator('[data-provider-id="opencode-go"]').click()

  const dialog = page.locator('[data-component="dialog-v2"]')
  const key = dialog.getByLabel("OpenCode Go API key", { exact: true })
  await expect(key).toHaveAttribute("type", "password")
  await key.click()
  await expect(key).toBeFocused()
  await key.pressSequentially(secret)
  await expect(key).toHaveValue(secret)
  await expect(key).toHaveAttribute("type", "password")

  await key.press("Tab")
  const show = dialog.getByRole("button", { name: "Show", exact: true })
  await expect(show).toBeFocused()
  await expect(show).toHaveAttribute("aria-controls", (await key.getAttribute("id")) ?? "missing-id")
  await page.keyboard.press("Enter")
  await expect(key).toHaveAttribute("type", "text")
  const hide = dialog.getByRole("button", { name: "Hide", exact: true })
  await expect(hide).toBeFocused()
  await page.keyboard.press("Space")
  await expect(key).toHaveAttribute("type", "password")
  await expect(show).toBeFocused()

  await page.keyboard.press("Shift+Tab")
  await expect(key).toBeFocused()
  await key.press("Enter")
  await expect(dialog).toHaveCount(0)
  expect(connections).toEqual([{ integrationID: "opencode-go", body: { key: secret } }])
})

test("masks the custom provider API key", async ({ page }) => {
  const { control } = await openSession(page)
  await control.click()
  await page.getByRole("button", { name: "See 70+ more providers", exact: true }).click()
  await page.locator('[data-provider-id="_custom"]').click()

  const key = page.locator('[data-component="dialog-v2"]').getByLabel("API key", { exact: true })
  await expect(key).toHaveAttribute("type", "password")
  await key.fill(secret)
  await expect(key).toHaveValue(secret)
  await expect(key).toHaveAttribute("type", "password")
})
