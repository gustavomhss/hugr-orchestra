import { expect, type Page } from "@playwright/test"
import { base64Encode } from "@orchestra/core/util/encode"
import {
  assistantMessage,
  directory,
  sessionID,
  setupTimeline,
  textPart,
  userID,
  userMessage,
} from "../performance/timeline-stability/fixture"

export async function setupIdentity(
  page: Page,
  input: {
    scheme: "dark" | "light"
    viewport: { width: number; height: number }
    locale?: "en" | "ar"
    running?: boolean
  },
) {
  const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
  await page.addInitScript(
    ({ scheme, server, directory, sessionID }) => {
      localStorage.setItem("orchestra-theme-id", "oc-2")
      localStorage.setItem("orchestra-color-scheme", scheme)
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
      localStorage.setItem(
        "orchestra.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem(
        "orchestra.window.browser.dat:tabs",
        JSON.stringify([{ type: "session", server, sessionId: sessionID }]),
      )
    },
    { scheme: input.scheme, server, directory, sessionID },
  )
  const assistant = assistantMessage(
    input.running ? [] : [textPart("prt_orchestra_identity_response", "Orchestra identity fixture response")],
    { completed: !input.running },
  )
  // Execution differs from the user's configured model, proving mounted logo ownership.
  assistant.info.modelID = "gpt-5"
  assistant.info.providerID = "openrouter"
  const messages = [userMessage(), assistant]
  expect(
    messages.map((message) => message.info.role),
    "nonempty real-session fixture",
  ).toEqual(["user", "assistant"])
  const timeline = await setupTimeline(page, {
    messages,
    locale: input.locale ?? "en",
    settings: { newLayoutDesigns: true, shouldDisplayTabsToast: false },
    viewport: input.viewport,
  })
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", input.scheme)
  await expect(page.locator("html")).toHaveAttribute("dir", input.locale === "ar" ? "rtl" : "ltr")
  // The session header also briefs the first prompt; the oracle is the rendered user message itself.
  await expect(
    page.locator(`#message-${userID}`).getByText("Build the timeline stability matrix.", { exact: true }),
  ).toBeVisible()
  await expect(
    page.locator(`[data-titlebar-tab] a[href="/server/${base64Encode(server)}/session/${sessionID}"]`),
  ).toHaveCount(1)
  return { ...timeline, assistant }
}
