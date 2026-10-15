import { expect, test, type Page } from "@playwright/test"
import { directory, setupTimeline } from "../performance/timeline-stability/fixture"
import { mockOrchestraServer } from "../utils/mock-server"

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

// The shared mock answers V2 catalog reads with `{}`, so a V2 composer has no model and refuses to send.
// Serve the fixture's model in the V2 shape (as the evidence and CI/CD fixtures do), then reload so the
// catalog is read through this route, which takes precedence over the shared mock's.
async function serveV2Catalog(page: Page) {
  const location = { directory }
  const model = {
    id: "claude-opus-4-6",
    modelID: "claude-opus-4-6",
    providerID: "opencode",
    name: "Claude Opus 4.6",
    capabilities: { input: ["text"], output: ["text"], tools: true },
    variants: [],
    time: { released: 1 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: 200_000, output: 8192 },
  }
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === "/api/provider")
      return route.fulfill({ json: { location, data: [{ id: "opencode", name: "Orchestra", settings: {} }] } })
    if (path === "/api/model") return route.fulfill({ json: { location, data: [model] } })
    if (path === "/api/model/default") return route.fulfill({ json: { location, data: model } })
    return route.fallback()
  })
  await page.reload()
  await expect(page.locator('[data-action="prompt-model"]')).toContainText("Claude Opus 4.6")
}

// Theme, version and the profile list are seeded the same way for every protocol.
async function openSession(page: Page, scheme: "dark" | "light", protocol: "v1" | "v2") {
  await page.addInitScript(
    (input) => {
      localStorage.setItem("orchestra-theme-id", "oc-2")
      localStorage.setItem("orchestra-color-scheme", input.scheme)
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
      localStorage.setItem(
        "orchestra.global.dat:server",
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
    protocol,
    onPrompt: (input) => prompts.push(input),
  })
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme)
  return prompts
}

function systemOf(prompts: Array<{ body: unknown }>, index: number) {
  const body = prompts[index]?.body
  if (!body || typeof body !== "object" || !("system" in body)) return undefined
  return body.system
}

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: configured behaviors persist per profile and reach new chat messages`, async ({ page }) => {
    const prompts = await openSession(page, scheme, "v1")
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
    await expect(dialog).toContainText("Active behaviors are added to new chat messages in this profile.")
    await expect(page.locator('[data-slot="dialog-container"].plugins-dialog')).toHaveCSS("width", "680px")
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

// Stands in for the V2 behavior route: records every set the page pushes and answers with `status`.
async function serveBehaviors(page: Page, status = 200) {
  const sets: Array<{
    directory: string | null
    behaviors: Array<{ id: string; name: string; instructions: string }>
  }> = []
  await page.route("**/api/behavior**", (route) => {
    const request = route.request()
    if (request.method() !== "PUT") return route.fallback()
    const location = new URL(request.url()).searchParams.get("location[directory]")
    const body = request.postDataJSON()
    sets.push({ directory: location, behaviors: body.behaviors })
    if (status !== 200) return route.fulfill({ status, json: { name: "NotFound", message: "Not found" } })
    return route.fulfill({
      json: {
        location: { directory: location, project: { id: "timeline", directory: location } },
        data: body.behaviors,
      },
    })
  })
  return sets
}

// The prompt a V2 composer sends must carry only what the user typed: behaviors reach turns through the server.
function expectPlainPrompt(body: unknown, text: string) {
  const sent = JSON.stringify(body)
  expect(sent).toContain(text)
  expect(body).not.toHaveProperty("system")
  for (const leak of ["Caveman", "caveman", "Respond terse", "LLM behaviors", "intensity"])
    expect(sent).not.toContain(leak)
}

test("V2 servers apply the profile's behaviors to turns without touching the prompt", async ({ page }) => {
  const prompts = await openSession(page, "dark", "v2")
  await serveV2Catalog(page)
  const sets = await serveBehaviors(page)
  await openPlugins(page)
  const note = chapter(page).locator('[data-slot="plugins-application"]')
  await expect(note).toHaveText(
    "Active behaviors are kept on this server for this profile and apply to every turn of its chats, including chats already open.",
  )
  // Opening the page hands the server the set it shows: nothing is enabled on a new profile.
  await expect.poll(() => sets.at(-1)).toEqual({ directory, behaviors: [] })

  const caveman = card(page, "Caveman")
  await caveman.getByRole("switch", { name: "Enable Caveman" }).click()
  await expect(caveman.locator(".mx-badge")).toHaveText(["LLM behavior", "full", "Active"])
  await expect
    .poll(() => sets.at(-1)?.behaviors.map((item) => [item.id, item.name]))
    .toEqual([["caveman", "Caveman (intensity: full)"]])
  expect(sets.at(-1)?.behaviors[0]?.instructions).toContain(
    "Respond terse like smart caveman. Preserve technical accuracy.",
  )
  expect(sets.at(-1)?.directory).toBe(directory)
  await caveman.getByRole("button", { name: "Configure", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText("Active behaviors are added to new chat messages in this profile.")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(dialog).toHaveCount(0)

  await sendPrompt(page, "Explain the failing test")
  await expect.poll(() => prompts.length).toBe(1)
  expectPlainPrompt(prompts[0]?.body, "Explain the failing test")

  await openPlugins(page)
  const pushed = sets.length
  await card(page, "Caveman").getByRole("switch", { name: "Enable Caveman" }).click()
  await expect(card(page, "Caveman").locator(".mx-badge")).toHaveText(["LLM behavior", "full", "Disabled"])
  await expect.poll(() => sets.slice(pushed).at(-1)?.behaviors).toEqual([])
})

test("V2 servers without the behavior route keep behaviors on the profile without claiming they reach turns", async ({
  page,
}) => {
  const prompts = await openSession(page, "dark", "v2")
  await serveV2Catalog(page)
  const sets = await serveBehaviors(page, 404)
  await openPlugins(page)
  await expect(chapter(page).locator('[data-slot="plugins-application"]')).toHaveText(
    "Saved for this profile. This server does not accept per-prompt instructions, so behaviors are not applied to turns yet.",
  )
  const caveman = card(page, "Caveman")
  await caveman.getByRole("switch", { name: "Enable Caveman" }).click()
  await expect(caveman.getByRole("switch", { name: "Enable Caveman" })).toHaveAttribute("aria-checked", "true")
  await expect.poll(() => sets.at(-1)?.behaviors.map((item) => item.id)).toEqual(["caveman"])
  await expect(caveman.locator(".mx-badge")).toHaveText(["LLM behavior", "full", "Enabled"])
  await expect(chapter(page)).not.toContainText("Active")
  await caveman.getByRole("button", { name: "Configure", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText("Behaviors are saved for this profile.")
  await expect(dialog).not.toContainText("added to new chat messages")
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await sendPrompt(page, "Explain the failing test")
  await expect.poll(() => prompts.length).toBe(1)
  expectPlainPrompt(prompts[0]?.body, "Explain the failing test")
})

test("each repository profile owns its behaviors", async ({ page }) => {
  const projects = [
    { id: "plugins-a", name: "Plugins A", worktree: "/plugins-a", sandboxes: [], time: { created: 1, updated: 1 } },
    { id: "plugins-b", name: "Plugins B", worktree: "/plugins-b", sandboxes: [], time: { created: 1, updated: 1 } },
  ]
  await mockOrchestraServer(page, {
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
      "orchestra.global.dat:server",
      JSON.stringify({
        projects: {
          local: [
            { worktree: "/plugins-a", expanded: true },
            { worktree: "/plugins-b", expanded: true },
          ],
        },
      }),
    )
    localStorage.setItem("orchestra.window.browser.dat:tabs", "[]")
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
