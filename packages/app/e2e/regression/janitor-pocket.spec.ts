import { expect, test } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import {
  directory,
  sessionID as routeSessionID,
  session,
  setupTimeline,
} from "../performance/timeline-stability/fixture"

const janitorSessionID = "ses_janitor_chat"
const report = JSON.stringify({
  createdAt: "2026-09-08T12:00:00.000Z",
  findings: [
    {
      kind: "stale-worktree",
      severity: "attention",
      summary: "Worktree has stale generated files",
      evidence: "dist/ contains files older than source changes",
      suggestion: "Remove generated files and rerun the build",
    },
  ],
})

test("keeps Janitor chat session, sends prompt, and opens it in session view", async ({ page }) => {
  const prompts: Array<{ sessionID: string; body: unknown }> = []
  await page.addInitScript((report) => {
    window.api = {
      janitor: {
        getReport: async () => ({ report, source: null }),
        publish: async () => true,
        snooze: async () => {},
        dismiss: async () => {},
        onReport: () => () => {},
      },
    }
  }, report)
  await page.addInitScript(
    ({ directory, sessionID }) => {
      localStorage.setItem(`opencode.janitor.session.local.${directory}`, sessionID)
    },
    { directory: base64Encode(directory), sessionID: janitorSessionID },
  )

  await setupTimeline(page, {
    onPrompt: (input) => prompts.push(input),
    sessions: [
      session({
        id: routeSessionID,
        title: "Timeline visual stability",
      }),
      session({
        id: janitorSessionID,
        title: "Janitor chat",
      }),
    ],
  })
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), `opencode.janitor.session.local.${base64Encode(directory)}`),
    )
    .toBe(janitorSessionID)

  await expect(page.getByRole("button", { name: "Open janitor report" })).toBeVisible()
  await page.getByRole("button", { name: "Open janitor report" }).click()
  const pocket = page.getByRole("complementary", { name: "Janitor report" })
  await expect(pocket).toBeVisible()
  await expect(pocket.getByRole("button", { name: "Open session" })).toBeVisible()

  const prompt = pocket.getByRole("textbox", { name: "Prompt" })
  await expect(prompt).toBeVisible()
  await prompt.fill("Explain stale generated files")
  await prompt.press("Enter")
  await expect.poll(() => prompts).toHaveLength(1)
  expect(prompts[0]?.sessionID).toBe(janitorSessionID)
  expect(prompts[0]?.body).toEqual(
    expect.objectContaining({
      parts: expect.arrayContaining([expect.objectContaining({ text: "Explain stale generated files" })]),
    }),
  )

  await pocket.getByRole("button", { name: "Open session" }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${janitorSessionID}$`))
  await expect(page.getByRole("heading", { name: "Janitor chat", exact: true })).toBeVisible()
  await expect(page.getByRole("complementary", { name: "Janitor report" })).toHaveCount(0)

  await page.reload()
  await expect(page).toHaveURL(new RegExp(`/session/${janitorSessionID}$`))
  await expect(page.getByRole("heading", { name: "Janitor chat", exact: true })).toBeVisible()
})
