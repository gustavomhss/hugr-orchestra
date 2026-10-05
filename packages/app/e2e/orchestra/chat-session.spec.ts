import { readFile } from "node:fs/promises"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { expectSessionTitle } from "../utils/waits"
import { directory, setupTimeline } from "../performance/timeline-stability/fixture"
import { parentID, parentTitle, railTab, server, setupCockpit } from "./session-cockpit.fixture"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" })
test.setTimeout(120_000)

const reviewButton = (page: Page) =>
  page.locator('[data-slot="session-title-actions"]').getByRole("button", { name: "Review", exact: true })

async function openParent(page: Page) {
  await page.goto(`/server/${base64Encode(server)}/session/${parentID}`, { waitUntil: "domcontentloaded" })
  await expectSessionTitle(page, parentTitle)
}

test("a fresh profile opens the rail on Review once; the header's Review button closes it for good", async ({
  page,
}) => {
  await setupCockpit(page, { bridge: false, empty: true, rail: "fresh" })
  await openParent(page)
  const panel = page.locator("#review-panel")
  await expect(panel).toBeVisible()
  await expect(railTab(page, "review")).toHaveAttribute("aria-selected", "true")
  await expect(reviewButton(page)).toHaveAttribute("aria-pressed", "true")
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("opencode.global.dat:orchestra.chat.rail")))
    .toBe(JSON.stringify({ defaulted: true }))

  await reviewButton(page).click()
  await expect(panel).toHaveCount(0)
  await expect(reviewButton(page)).toHaveAttribute("aria-pressed", "false")

  // The default applies once per app storage: a reload keeps the user's choice.
  await page.reload({ waitUntil: "domcontentloaded" })
  await expectSessionTitle(page, parentTitle)
  await expect(reviewButton(page)).toHaveAttribute("aria-pressed", "false")
  await expect(panel).toHaveCount(0)
  await reviewButton(page).click()
  await expect(panel).toBeVisible()
  await expect(railTab(page, "review")).toHaveAttribute("aria-selected", "true")
})

test("Create PR previews an editable proposal of the listed changes and downloads it; nothing is sent", async ({
  page,
}) => {
  const patch = (file: string) => `diff --git a/${file} b/${file}\n@@ -1 +1 @@\n-before\n+after\n`
  await setupCockpit(page, {
    bridge: false,
    empty: true,
    vcsDiff: [
      { file: "src/approval.ts", patch: patch("src/approval.ts"), additions: 48, deletions: 32, status: "modified" },
      { file: "docs/flow.md", patch: patch("docs/flow.md"), additions: 18, deletions: 4, status: "modified" },
    ],
  })
  await openParent(page)
  await reviewButton(page).click()
  await expect(railTab(page, "review").locator('[data-slot="session-side-panel-tab-count"]')).toHaveText("2")
  await expect(page.locator('[data-slot="orchestra-review-views"] [aria-current="page"]')).toHaveText("Files Changed 2")

  const exported = page.waitForEvent("download")
  await page.getByRole("button", { name: "Export diff", exact: true }).click()
  const diff = await exported
  expect(diff.suggestedFilename()).toBe(`${parentID}.diff`)
  const text = await readFile((await diff.path())!, "utf8")
  // One unified diff: both patches in order, with no blank line added between them.
  expect([
    patch("src/approval.ts") + patch("docs/flow.md"),
    patch("docs/flow.md") + patch("src/approval.ts"),
  ]).toContain(text)

  const sent: string[] = []
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (request.method() !== "GET" && url.port === new URL(server).port)
      sent.push(`${request.method()} ${url.pathname}`)
  })
  // Positive control: the filter sees a non-GET request to the server before it is trusted to see none.
  await page.evaluate((url) => fetch(`${url}/orchestra-control`, { method: "POST" }).catch(() => undefined), server)
  await expect.poll(() => sent).toEqual(["POST /orchestra-control"])
  sent.length = 0
  await page.getByRole("button", { name: "Create PR", exact: true }).click()
  const draft = page.getByRole("dialog", { name: "Create pull request" })
  await expect(draft).toContainText("Preview the proposal. No remote pull request is created.")
  await expect(draft.getByRole("textbox", { name: "Title" })).toHaveValue(parentTitle)
  await expect(draft.getByRole("textbox", { name: "From branch" })).toHaveValue("main")
  await expect(draft.getByRole("textbox", { name: "Base branch" })).toHaveValue("main")
  const description = draft.getByRole("textbox", { name: "Description" })
  await expect(description).toHaveValue(/^Summary\n- Cockpit parent\n\nFiles\n/)
  await expect(description).toHaveValue(/^- `src\/approval\.ts` \(\+48 −32\)$/m)
  await expect(description).toHaveValue(/^- `docs\/flow\.md` \(\+18 −4\)$/m)

  await draft.getByRole("textbox", { name: "Title" }).fill("Approval proposal")
  await draft.getByRole("textbox", { name: "Base branch" }).fill("dev")
  await draft.getByRole("button", { name: "Create preview", exact: true }).click()
  const preview = page.getByRole("dialog", { name: "Pull request preview" })
  await expect(preview).toContainText("main → dev")
  await expect(preview.getByRole("heading", { name: "Approval proposal", level: 3 })).toBeVisible()
  await expect(preview).toContainText("Nothing was sent: Orchestra has no GitHub or GitLab connection yet.")
  await expect(preview.getByRole("link")).toHaveCount(0)

  const saved = page.waitForEvent("download")
  await preview.getByRole("button", { name: "Download proposal", exact: true }).click()
  const proposal = await saved
  expect(proposal.suggestedFilename()).toBe("Approval proposal-pr.md")
  const markdown = await readFile((await proposal.path())!, "utf8")
  expect(markdown).toMatch(/^# Approval proposal\n\n`main` → `dev`\n\nSummary\n- Cockpit parent\n\nFiles\n/)
  expect(markdown).toContain("- `src/approval.ts` (+48 −32)\n")
  expect(markdown).toContain("- `docs/flow.md` (+18 −4)\n")
  expect(sent).toEqual([])
})

test("Files Changed and All files lead to each other", async ({ page }) => {
  await setupCockpit(page, { bridge: false, empty: true })
  await openParent(page)
  await reviewButton(page).click()
  const views = (tab: "review" | "files") =>
    page.locator(`[data-session-tab="${tab}"] [data-slot="orchestra-review-views"]`)
  await expect(views("review").getByRole("button", { name: "Files Changed 0" })).toHaveAttribute("aria-current", "page")
  await views("review").getByRole("button", { name: "All files", exact: true }).click()
  await expect(page.locator('[data-session-tab="files"]')).toBeVisible()
  await expect(views("files").getByRole("button", { name: "All files", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  )
  await views("files").getByRole("button", { name: "Files Changed 0" }).click()
  await expect(railTab(page, "review")).toHaveAttribute("aria-selected", "true")
  await expect(views("review").getByRole("button", { name: "Files Changed 0" })).toHaveAttribute("aria-current", "page")
  await expect(page.locator('[data-session-tab="files"]')).toBeHidden()
})

test("V1: the delivery toggle explains why every prompt steers", async ({ page }) => {
  await setupCockpit(page, { bridge: false, empty: true })
  await openParent(page)
  const delivery = page.locator('[data-action="prompt-delivery"]')
  await expect(delivery).toHaveText("Steer")
  await expect(delivery).toHaveAttribute("aria-disabled", "true")
  await expect(delivery).toHaveAccessibleDescription(
    "This server delivers every prompt as a steer; queueing needs a server that speaks the V2 protocol.",
  )
  // aria-disabled keeps the toggle focusable so its reason stays reachable; Playwright treats it as
  // disabled, so the click is forced to prove a real click on it changes nothing.
  await delivery.click({ force: true })
  await expect(delivery).toHaveText("Steer")
  await expect(delivery).toHaveAttribute("data-delivery", "steer")
  await expect(delivery).toHaveAttribute("aria-pressed", "false")
})

test("V2: Steer is the default delivery and the Queue choice is sent with the next prompt", async ({ page }) => {
  const prompts: unknown[] = []
  await setupTimeline(page, {
    protocol: "v2",
    locale: "en",
    settings: { newLayoutDesigns: true, shouldDisplayTabsToast: false },
    onPrompt: (input) => prompts.push(input.body),
  })
  // The shared mock answers V2 catalog reads with `{}`, so a V2 composer has no model and never sends.
  // Serve the fixture's model in the V2 shape, then reload so the catalog is read through this route,
  // which takes precedence over the shared mock's.
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
      return route.fulfill({ json: { location, data: [{ id: "opencode", name: "OpenCode", settings: {} }] } })
    if (path === "/api/model") return route.fulfill({ json: { location, data: [model] } })
    if (path === "/api/model/default") return route.fulfill({ json: { location, data: model } })
    return route.fallback()
  })
  await page.reload()
  await expect(page.locator('[data-action="prompt-model"]')).toContainText("Claude Opus 4.6")
  const delivery = page.locator('[data-action="prompt-delivery"]')
  const prompt = page.getByRole("textbox", { name: "Prompt", exact: true })
  await expect(delivery).toHaveText("Steer")
  await expect(delivery).not.toHaveAttribute("aria-disabled", "true")
  await expect(delivery).toHaveAccessibleDescription(/^Steer: /)

  await prompt.fill("First prompt")
  await prompt.press("Enter")
  await expect.poll(() => prompts.length).toBe(1)
  expect(prompts[0]).toMatchObject({ delivery: "steer" })

  await delivery.click()
  await expect(delivery).toHaveText("Queue")
  await expect(delivery).toHaveAttribute("data-delivery", "queue")
  await expect(delivery).toHaveAttribute("aria-pressed", "true")
  await expect(delivery).toHaveAccessibleDescription(/^Queue: /)
  await prompt.fill("Queued prompt")
  await prompt.press("Enter")
  await expect.poll(() => prompts.length).toBe(2)
  expect(prompts[1]).toMatchObject({ delivery: "queue" })
})
