import { expect, test, type Page } from "@playwright/test"
import { directory, setupTimeline } from "../performance/timeline-stability/fixture"
import { mockOpenCodeServer } from "../utils/mock-server"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", actionTimeout: 10_000 })
test.setTimeout(120_000)

const sidebar = (page: Page) => page.locator('[data-component="orchestra-sidebar"]')
const chapter = (page: Page) => page.locator('[data-mx-page="orchestra-plugins"]')
const card = (page: Page, name: string) => chapter(page).locator("article.mx-card").filter({ hasText: name })

async function openPlugins(page: Page) {
  await sidebar(page).getByRole("button", { name: "Plugins", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/plugins$/)
  await expect(chapter(page)).toBeVisible()
}

async function sendPrompt(page: Page, text: string) {
  await sidebar(page).getByRole("button", { name: "Chat", exact: true }).click()
  const prompt = page.getByRole("textbox", { name: "Prompt", exact: true })
  await prompt.fill(text)
  await prompt.press("Enter")
}

function systemOf(prompts: Array<{ body: unknown }>, index: number) {
  const body = prompts[index]?.body
  if (!body || typeof body !== "object" || !("system" in body)) return undefined
  return body.system
}

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: configured behaviors persist per profile and reach new chat messages`, async ({ page }) => {
    await page.addInitScript(
      (input) => {
        localStorage.setItem("opencode-theme-id", "oc-2")
        localStorage.setItem("opencode-color-scheme", input.scheme)
        localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
        localStorage.setItem(
          "opencode.global.dat:server",
          JSON.stringify({
            projects: { local: [{ worktree: input.directory, expanded: true }] },
            lastProject: { local: input.directory },
          }),
        )
      },
      { scheme, directory },
    )
    const prompts: Array<{ sessionID: string; body: unknown }> = []
    await setupTimeline(page, {
      settings: { newLayoutDesigns: true, shouldDisplayTabsToast: false },
      locale: "en",
      protocol: "v1",
      onPrompt: (input) => prompts.push(input),
    })
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme)
    await openPlugins(page)

    const view = chapter(page)
    await expect(view.getByRole("heading", { level: 1 })).toHaveText("LLM Plugins")
    await expect(view.locator(".mx-eyebrow")).toHaveText("timeline-stability / profile configuration")
    await expect(view.locator(".mx-heading p")).toHaveText(
      "Shape how the LLM thinks and speaks. Each profile has its own behavior.",
    )
    await expect(view.getByRole("textbox", { name: "Search LLM Plugins" })).toHaveAttribute(
      "placeholder",
      "Search llm plugins",
    )
    await expect(view.locator(".mx-toolbar .mx-badge")).toHaveText("timeline-stability")
    // Mock geometry: 30px title, 280px grid tracks, 18px card padding.
    await expect(view.getByRole("heading", { level: 1 })).toHaveCSS("font-size", "30px")
    await expect(view.locator(".mx-grid")).toHaveCSS("gap", "12px")
    await expect(card(page, "Caveman")).toHaveCSS("padding", "18px")

    const caveman = card(page, "Caveman")
    const toggle = caveman.getByRole("switch", { name: "Enable Caveman" })
    await expect(caveman.locator(".mx-badge")).toHaveText(["LLM behavior", "full", "Disabled"])
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await expect(view.locator('[data-slot="plugins-application"]')).toHaveText(
      "Active behaviors are added to the system instructions of new chat messages in this profile (not slash commands or shell runs).",
    )

    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await expect(caveman.locator(".mx-badge.good")).toHaveText("Active")

    await caveman.getByRole("button", { name: "Configure", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: "Configure Caveman" })).toBeVisible()
    await expect(dialog).toHaveCSS("width", "680px")
    await expect(dialog.getByLabel("Intensity")).toHaveValue("full")
    await dialog.getByLabel("Intensity").selectOption("ultra")
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(caveman.locator(".mx-badge")).toHaveText(["LLM behavior", "ultra", "Active"])

    await view.getByRole("button", { name: "Add behavior", exact: true }).click()
    await expect(dialog.getByRole("heading", { name: "Add LLM behavior" })).toBeVisible()
    await expect(dialog.getByLabel("Intensity")).toHaveCount(0)
    await expect(dialog.getByRole("button", { name: "Remove behavior" })).toHaveCount(0)
    await dialog.getByLabel("Name").fill("Reviewer")
    await dialog.getByLabel("Description").fill("Ask for evidence.")
    await dialog.getByLabel("Behavior instructions").fill("Cite the file and line for every claim.")
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    const reviewer = card(page, "Reviewer")
    await expect(reviewer.locator(".mx-badge")).toHaveText(["LLM behavior", "custom", "Active"])

    await view.getByRole("textbox", { name: "Search LLM Plugins" }).fill("evidence")
    await expect(view.locator("article.mx-card")).toHaveCount(1)
    await expect(reviewer).toBeVisible()
    await view.getByRole("textbox", { name: "Search LLM Plugins" }).fill("")

    await page.reload()
    await expect(chapter(page)).toBeVisible()
    await expect(card(page, "Caveman").locator(".mx-badge")).toHaveText(["LLM behavior", "ultra", "Active"])
    await expect(card(page, "Reviewer").locator(".mx-badge")).toHaveText(["LLM behavior", "custom", "Active"])

    await sendPrompt(page, "Explain the failing test")
    await expect.poll(() => prompts.length).toBe(1)
    const system = systemOf(prompts, 0)
    expect(system).toContain("## Caveman (intensity: ultra)")
    expect(system).toContain("Respond terse like smart caveman. Preserve technical accuracy.")
    expect(system).toContain("## Reviewer\nCite the file and line for every claim.")

    await openPlugins(page)
    await card(page, "Caveman").getByRole("switch", { name: "Enable Caveman" }).click()
    await card(page, "Reviewer").getByRole("button", { name: "Configure", exact: true }).click()
    await dialog.getByRole("button", { name: "Remove behavior", exact: true }).click()
    await expect(dialog.getByRole("heading", { name: "Remove this item?" })).toBeVisible()
    await expect(dialog).toContainText("This changes the configuration for timeline-stability.")
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(card(page, "Reviewer")).toHaveCount(0)
    await expect(card(page, "Caveman").locator(".mx-badge")).toHaveText(["LLM behavior", "ultra", "Disabled"])

    await sendPrompt(page, "Explain it again")
    await expect.poll(() => prompts.length).toBe(2)
    expect(systemOf(prompts, 1)).toBeUndefined()
  })
}

test("V2 servers keep behaviors on the profile without claiming they reach turns", async ({ page }) => {
  const prompts: Array<{ sessionID: string; body: unknown }> = []
  await setupTimeline(page, {
    settings: { newLayoutDesigns: true, shouldDisplayTabsToast: false },
    locale: "en",
    protocol: "v2",
    onPrompt: (input) => prompts.push(input),
  })
  await openPlugins(page)
  await expect(chapter(page).locator('[data-slot="plugins-application"]')).toHaveText(
    "Saved for this profile. This server does not accept per-prompt instructions, so behaviors are not applied to turns yet.",
  )
  await card(page, "Caveman").getByRole("switch", { name: "Enable Caveman" }).click()
  await expect(card(page, "Caveman").locator(".mx-badge.good")).toHaveText("Active")
  await sendPrompt(page, "Explain the failing test")
  await expect.poll(() => prompts.length).toBe(1)
  expect(JSON.stringify(prompts[0]?.body)).not.toContain("Caveman")
})

test("each repository profile owns its behaviors", async ({ page }) => {
  const projects = [
    { id: "plugins-a", name: "Plugins A", worktree: "/plugins-a", sandboxes: [], time: { created: 1, updated: 1 } },
    { id: "plugins-b", name: "Plugins B", worktree: "/plugins-b", sandboxes: [], time: { created: 1, updated: 1 } },
  ]
  await mockOpenCodeServer(page, {
    directory: "/plugins-a",
    project: projects[0],
    provider: { all: [], connected: [], default: {} },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.route(`http://127.0.0.1:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}/project`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(projects) }),
  )
  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true }, notifications: {} }))
    localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
    localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
    localStorage.setItem(
      "opencode.global.dat:server",
      JSON.stringify({
        projects: {
          local: [
            { worktree: "/plugins-a", expanded: true },
            { worktree: "/plugins-b", expanded: true },
          ],
        },
      }),
    )
    localStorage.setItem("opencode.window.browser.dat:tabs", "[]")
  })
  await page.goto("/")
  const pick = async (name: string) => {
    await page.locator('[data-slot="orchestra-profile"]').click()
    await page.getByRole("menuitemradio", { name, exact: true }).click()
    await expect(chapter(page).locator(".mx-toolbar .mx-badge")).toHaveText(name)
  }
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page.getByRole("menuitemradio", { name: "Plugins A", exact: true }).click()
  await openPlugins(page)
  const toggle = () => card(page, "Caveman").getByRole("switch", { name: "Enable Caveman" })
  await toggle().click()
  await expect(toggle()).toHaveAttribute("aria-checked", "true")

  await pick("Plugins B")
  await expect(toggle()).toHaveAttribute("aria-checked", "false")
  await pick("Plugins A")
  await expect(toggle()).toHaveAttribute("aria-checked", "true")
})
