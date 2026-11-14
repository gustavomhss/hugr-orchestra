import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"
import { mockOrchestraServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"
import { installSseTransport } from "../utils/sse-transport"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const directory = "C:/Orchestra/PromptThinkingLevelRegression"
const projectID = "proj_prompt_thinking_level_regression"
const sessionID = "ses_prompt_thinking_level_regression"

test("shows the V2 thinking level control while relevant", async ({ page }) => {
  const transport = await installSseTransport(page, { server })
  try {
    await mockOrchestraServer(page, {
      directory,
      project: {
        id: projectID,
        worktree: directory,
        vcs: "git",
        name: "prompt-thinking-level-regression",
        time: { created: 1700000000000, updated: 1700000000000 },
        sandboxes: [],
      },
      provider: {
        all: [
          {
            id: "opencode",
            name: "Orchestra",
            models: {
              "thinking-model": {
                id: "thinking-model",
                name: "Thinking Model",
                limit: { context: 200_000 },
                variants: { high: {} },
              },
            },
          },
        ],
        connected: ["opencode"],
        default: { providerID: "opencode", modelID: "thinking-model" },
      },
      sessions: [
        {
          id: sessionID,
          slug: "prompt-thinking-level-regression",
          projectID,
          directory,
          title: "Prompt thinking level regression",
          version: "dev",
          time: { created: 1700000000000, updated: 1700000000000 },
        },
      ],
      pageMessages: () => ({ items: [] }),
    })
    await page.addInitScript(() => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: {} }))
    })

    await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
    const composer = page.locator('[data-component="prompt-input-v2"]')
    const input = composer.locator('[data-component="prompt-input"]')
    const control = composer.getByRole("button", { name: "Choose model variant" })
    await expectAppVisible(composer)
    await transport.waitForConnection()

    await idleComposer(page)
    await expect(control).toBeVisible()

    expect((await transport.connections()).map((connection) => ({ path: connection.path, endedAt: connection.endedAt })))
      .toEqual([{ path: "/api/event", endedAt: undefined }])
    await control.click()
    const high = page.getByRole("menuitemradio", { name: "Reasoning: high" })
    await expect(high).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(control).toBeVisible()
    await expect(high).toBeVisible()
    expect((await transport.connections()).map((connection) => ({ path: connection.path, endedAt: connection.endedAt })))
      .toEqual([{ path: "/api/event", endedAt: undefined }])
    await high.click()

    await idleComposer(page)
    await input.focus()
    await expect(control).toBeVisible()

    await idleComposer(page)
    await expect(control).toBeVisible()
    expect((await transport.connections()).map((connection) => ({ path: connection.path, endedAt: connection.endedAt })))
      .toEqual([{ path: "/api/event", endedAt: undefined }])
  } finally {
    await transport.close()
  }
})

async function idleComposer(page: Page) {
  await page.mouse.move(0, 0)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
}
