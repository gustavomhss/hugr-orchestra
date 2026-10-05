import { expect, test } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"
import {
  assistantMessage,
  directory,
  model,
  session,
  sessionID,
  title,
  userMessage,
} from "../performance/timeline-stability/fixture"

for (const newLayoutDesigns of [false, true]) {
  for (const scenario of [
    { name: "missing cost", assistant: false, priced: true, limit: 1000, cost: "—", tokens: "—", usage: "—" },
    {
      name: "missing token data",
      assistant: false,
      priced: false,
      limit: 1000,
      cost: "$0.00",
      tokens: "—",
      usage: "—",
    },
    { name: "unpriced provider", assistant: true, priced: false, limit: 1000, cost: "—", tokens: "300", usage: "30%" },
    {
      name: "missing context limit",
      assistant: true,
      priced: true,
      limit: 0,
      cost: "$0.00",
      tokens: "300",
      usage: "—",
    },
    { name: "reported zeros", assistant: true, priced: true, limit: 1000, cost: "$0.00", tokens: "0", usage: "0%" },
  ]) {
    test(`${newLayoutDesigns ? "v2" : "legacy"} Context displays ${scenario.name}`, async ({ page }) => {
      const assistant = assistantMessage()
      await mockOpenCodeServer(page, {
        directory,
        project: { id: "proj_context_availability", worktree: directory, time: { created: 1 } },
        provider: {
          all: [
            {
              id: model.providerID,
              name: "Provider",
              models: {
                [model.modelID]: {
                  id: model.modelID,
                  name: "Model",
                  limit: { context: scenario.limit },
                  ...(scenario.priced ? { cost: { input: 0, output: 0, cache: { read: 0, write: 0 } } } : {}),
                },
              },
            },
          ],
          connected: [model.providerID],
          default: { [model.providerID]: model.modelID },
        },
        sessions: [session(scenario.name === "missing cost" ? {} : { cost: 0 })],
        pageMessages: () => ({
          items: [
            userMessage(),
            ...(scenario.assistant
              ? [
                  {
                    ...assistant,
                    info: {
                      ...assistant.info,
                      cost: 0,
                      ...(scenario.tokens === "0"
                        ? { tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }
                        : {}),
                    },
                  },
                ]
              : []),
          ],
        }),
      })
      await page.addInitScript((newLayoutDesigns) => {
        localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns } }))
        localStorage.setItem("opencode.global.dat:language", JSON.stringify({ locale: "en" }))
        localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.17.20" }))
      }, newLayoutDesigns)
      await page.setViewportSize({ width: 1400, height: 900 })
      await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
      await expectSessionTitle(page, title)
      const button = page.getByRole("button", { name: "View context usage", exact: true })
      // The approved layout has no usage ring: the header's Review button opens the rail, where
      // Context is a permanent tab.
      if (newLayoutDesigns) {
        await expect(button).toHaveCount(0)
        await page.locator('[data-slot="session-title-actions"]').getByRole("button", { name: "Review" }).click()
        await page.getByRole("tab", { name: "Context", exact: true }).click()
      }
      if (!newLayoutDesigns) {
        await button.hover()
        const tooltip = page.getByRole("tooltip")
        await expect(tooltip).toContainText(`Cost${scenario.cost}`)
        await expect(tooltip).toContainText(`Tokens${scenario.tokens}`)
        await expect(tooltip).toContainText(`Usage${scenario.usage}`)
        await button.click()
      }
      const panel = page.getByRole("tabpanel", { name: "Context", exact: true })
      await expect(panel.getByText("Total Cost", { exact: true }).locator("..")).toHaveText(
        `Total Cost${scenario.cost}`,
      )
      await expect(panel.getByText("Total Tokens", { exact: true }).locator("..")).toHaveText(
        `Total Tokens${scenario.tokens}`,
      )
      await expect(panel.getByText("Usage", { exact: true }).locator("..")).toHaveText(`Usage${scenario.usage}`)
      // The approved rail draws no usage ring, so nothing there can paint an unknown value as known; its
      // honest-unknown signal is the Usage value asserted above ("—" when unknown, a percent otherwise).
      if (newLayoutDesigns)
        await expect(page.getByRole("tab", { name: "Context", exact: true }).locator("circle")).toHaveCount(0)
      // Unknown usage dashes the ring's track; any reported value, 0% included, keeps it solid.
      for (const ring of newLayoutDesigns ? [] : [button, page.getByRole("tab", { name: "Context", exact: true })]) {
        const track = ring.locator("circle").first()
        if (scenario.usage === "—") await expect(track).not.toHaveCSS("stroke-dasharray", "none")
        if (scenario.usage !== "—") await expect(track).toHaveCSS("stroke-dasharray", "none")
      }
    })
  }
}
