import { expect, test, type Page } from "@playwright/test"
import { directory, setupTimeline } from "../performance/timeline-stability/fixture"
import { mockOrchestraServer } from "../utils/mock-server"
import { expandAdvanced } from "./compact-navigation.fixture"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", actionTimeout: 10_000 })
test.setTimeout(120_000)

const sidebar = (page: Page) => page.locator('[data-component="orchestra-sidebar"]')
const chapter = (page: Page) => page.locator('[data-mx-page="orchestra-plugins"]')
const card = (page: Page, name: string) => chapter(page).locator("article.mx-card").filter({ hasText: name })

async function openPlugins(page: Page) {
  await expandAdvanced(page)
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

async function openSession(page: Page, scheme: "dark" | "light") {
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
    settings: { shouldDisplayTabsToast: false },
    locale: "en",
    onPrompt: (input) => prompts.push(input),
  })
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme)
  return prompts
}

test("audit: plugins unmatched search explains the empty result and clearing restores cards", async ({ page }) => {
  await openSession(page, "dark")
  await openPlugins(page)
  await expect(card(page, "Caveman")).toBeVisible()
  const search = chapter(page).getByRole("textbox", { name: "Search plugins" })
  await search.fill("no-behavior-matches-this")
  await expect(chapter(page).getByRole("status")).toHaveText("No matching results")
  await expect(chapter(page).getByRole("article")).toHaveCount(0)
  await search.clear()
  await expect(card(page, "Caveman")).toBeVisible()
  await expect(chapter(page).getByRole("status")).toHaveCount(0)
})

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: configured behaviors persist per profile and reach the server`, async ({ page }) => {
    const prompts = await openSession(page, scheme)
    await serveV2Catalog(page)
    const sets = await serveBehaviors(page)
    await openPlugins(page)

    const view = chapter(page)
    await expect(view.getByRole("heading", { level: 1 })).toHaveText("Plugins")
    await expect(view.locator(".mx-eyebrow")).toHaveText("timeline-stability · Configuration")
    await expect(view.locator(".mx-heading p")).toHaveText(
      "Shape how the LLM thinks and speaks. Each project has its own behavior.",
    )
    await expect(view.getByRole("textbox", { name: "Search plugins" })).toHaveAttribute(
      "placeholder",
      "Search plugins",
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
      "Active behaviors are kept on this server for this project and apply to every turn of its chats, including chats already open.",
    )

    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await expect(caveman.locator(".mx-badge.good")).toHaveText("Active")

    await caveman.getByRole("button", { name: "Configure", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: "Configure Caveman" })).toBeVisible()
    await expect(dialog).toContainText("Active behaviors are added to new chat messages in this project.")
    await expect(page.locator('[data-slot="dialog-container"].plugins-dialog')).toHaveCSS("width", "680px")
    await expect(dialog.getByLabel("Intensity")).toHaveValue("full")
    await dialog.getByLabel("Intensity").selectOption("ultra")
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(caveman.locator(".mx-badge")).toHaveText(["LLM behavior", "ultra", "Active"])

    await view.getByRole("button", { name: "Add plugin", exact: true }).click()
    await expect(dialog.getByRole("heading", { name: "Add plugin" })).toBeVisible()
    await expect(dialog.getByLabel("Intensity")).toHaveCount(0)
    await expect(dialog.getByRole("button", { name: "Remove behavior" })).toHaveCount(0)
    await dialog.getByLabel("Name").fill("Reviewer")
    await dialog.getByLabel("Description").fill("Ask for evidence.")
    await dialog.getByLabel("Behavior instructions").fill("Cite the file and line for every claim.")
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    const reviewer = card(page, "Reviewer")
    await expect(reviewer.locator(".mx-badge")).toHaveText(["LLM behavior", "custom", "Active"])

    // An enabled behavior without instructions sends nothing, so its card does not claim to be Active.
    await view.getByRole("button", { name: "Add plugin", exact: true }).click()
    await dialog.getByLabel("Name").fill("Blank")
    await dialog.getByLabel("Description").fill("Nothing yet.")
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(card(page, "Blank").locator(".mx-badge")).toHaveText(["LLM behavior", "custom", "No instructions"])

    await view.getByRole("textbox", { name: "Search plugins" }).fill("evidence")
    await expect(view.locator("article.mx-card")).toHaveCount(1)
    await expect(reviewer).toBeVisible()
    await view.getByRole("textbox", { name: "Search plugins" }).fill("")

    await page.reload()
    await expect(chapter(page)).toBeVisible()
    await expect(card(page, "Caveman").locator(".mx-badge")).toHaveText(["LLM behavior", "ultra", "Active"])
    await expect(card(page, "Reviewer").locator(".mx-badge")).toHaveText(["LLM behavior", "custom", "Active"])

    // The blank behavior sends nothing, so the server set holds only the two with instructions.
    await expect
      .poll(() => sets.at(-1)?.behaviors.map((item) => item.name))
      .toEqual(["Caveman (intensity: ultra)", "Reviewer"])
    expect(sets.at(-1)?.behaviors[0]?.instructions).toContain(
      "Respond terse like smart caveman. Preserve technical accuracy.",
    )
    expect(sets.at(-1)?.behaviors[1]?.instructions).toBe("Cite the file and line for every claim.")
    await sendPrompt(page, "Explain the failing test")
    await expect.poll(() => prompts.length).toBe(1)
    expectPlainPrompt(prompts[0]?.body, "Explain the failing test")

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

    await expect.poll(() => sets.at(-1)?.behaviors).toEqual([])
    await sendPrompt(page, "Explain it again")
    await expect.poll(() => prompts.length).toBe(2)
    expectPlainPrompt(prompts[1]?.body, "Explain it again")
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
  const prompts = await openSession(page, "dark")
  await serveV2Catalog(page)
  const sets = await serveBehaviors(page)
  await openPlugins(page)
  const note = chapter(page).locator('[data-slot="plugins-application"]')
  await expect(note).toHaveText(
    "Active behaviors are kept on this server for this project and apply to every turn of its chats, including chats already open.",
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
  await expect(dialog).toContainText("Active behaviors are added to new chat messages in this project.")
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

test("a failed behavior sync offers Retry that pushes the set again", async ({ page }) => {
  await openSession(page, "dark")
  await serveV2Catalog(page)
  const failing = await serveBehaviors(page, 500)
  await openPlugins(page)
  const note = chapter(page).locator('[data-slot="plugins-application"]')
  await expect(note).toContainText("this server did not accept the latest change")
  expect(failing.length).toBeGreaterThan(0)
  await page.unroute("**/api/behavior**")
  const sets = await serveBehaviors(page)
  await note.getByRole("button", { name: "Retry", exact: true }).click()
  await expect.poll(() => sets.at(-1)).toEqual({ directory, behaviors: [] })
  await expect(note).toHaveText(
    "Active behaviors are kept on this server for this project and apply to every turn of its chats, including chats already open.",
  )
})

test("V2 servers without the behavior route keep behaviors on the profile without claiming they reach turns", async ({
  page,
}) => {
  const prompts = await openSession(page, "dark")
  await serveV2Catalog(page)
  const sets = await serveBehaviors(page, 404)
  await openPlugins(page)
  await expect(chapter(page).locator('[data-slot="plugins-application"]')).toHaveText(
    "Saved for this project. This server does not accept per-prompt instructions, so behaviors are not applied to turns yet.",
  )
  const caveman = card(page, "Caveman")
  await caveman.getByRole("switch", { name: "Enable Caveman" }).click()
  await expect(caveman.getByRole("switch", { name: "Enable Caveman" })).toHaveAttribute("aria-checked", "true")
  await expect.poll(() => sets.at(-1)?.behaviors.map((item) => item.id)).toEqual(["caveman"])
  await expect(caveman.locator(".mx-badge")).toHaveText(["LLM behavior", "full", "Enabled"])
  await expect(chapter(page)).not.toContainText("Active")
  await caveman.getByRole("button", { name: "Configure", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText("Behaviors are saved for this project.")
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
  const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
  const foreign = "http://fixture-foreign.invalid"
  // This lower-priority route proves that the profile override leaves foreign origins alone.
  await page.route(`${foreign}/**`, (route) => route.fulfill({ status: 418, json: { owner: "foreign" } }))
  await mockOrchestraServer(page, {
    directory: "/plugins-a",
    project: projects[0],
    provider: { all: [], connected: [], default: {} },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.route(`${server}/api/project`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(projects) }),
  )
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== server || url.pathname !== "/api/project/current") return route.fallback()
    const directory = url.searchParams.get("location[directory]") ?? "/plugins-a"
    const project = projects.find((item) => item.worktree === directory)
    if (!project) return route.fulfill({ status: 404, json: { name: "NotFound" } })
    return route.fulfill({ json: { id: project.id, directory } })
  })
  await page.addInitScript(() => {
    localStorage.setItem("settings.v3", JSON.stringify({ general: {}, notifications: {} }))
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
  const outside = await page.goto(`${foreign}/api/project/current?location[directory]=/plugins-b`)
  expect(outside?.status()).toBe(418)
  expect(await outside?.json()).toEqual({ owner: "foreign" })
  const unknown = await page.goto(`${server}/api/project/current?location[directory]=/plugins-unknown`)
  expect(unknown?.status()).toBe(404)
  expect(await unknown?.json()).toEqual({ name: "NotFound" })
})
