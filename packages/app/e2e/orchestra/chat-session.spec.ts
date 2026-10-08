import { readFile } from "node:fs/promises"
import { base64Encode } from "@orchestra/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { expectSessionTitle } from "../utils/waits"
import { directory, setupTimeline } from "../performance/timeline-stability/fixture"
import { parentID, parentTitle, railTab, server, setupCockpit } from "./session-cockpit.fixture"
import type { PullRequestReply } from "../utils/mock-server"

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
    .poll(() => page.evaluate(() => localStorage.getItem("orchestra.global.dat:orchestra.chat.rail")))
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

const patch = (file: string) => `diff --git a/${file} b/${file}\n@@ -1 +1 @@\n-before\n+after\n`
const changes = [
  { file: "src/approval.ts", patch: patch("src/approval.ts"), additions: 48, deletions: 32, status: "modified" },
  { file: "docs/flow.md", patch: patch("docs/flow.md"), additions: 18, deletions: 4, status: "modified" },
]
// The cockpit session lives in /work/cockpit; the routes run in the session's repository.
const cockpit = "/work/cockpit"
const locationBody = { directory: cockpit, project: { id: "proj_cockpit", directory: cockpit } }
const hostError = (data: Record<string, unknown>): PullRequestReply => ({
  status: 400,
  body: { name: "PullRequestError", data },
})

async function openDraft(page: Page) {
  await page.getByRole("button", { name: "Create PR", exact: true }).click()
  const draft = page.getByRole("dialog", { name: "Create pull request" })
  await expect(draft.getByRole("textbox", { name: "Title" })).toHaveValue(parentTitle)
  return draft
}

test("Create PR opens the pull request through the server and shows only the address the host returned", async ({
  page,
}) => {
  const created = Promise.withResolvers<PullRequestReply>()
  const requests: { url: URL; body: unknown }[] = []
  await setupCockpit(page, {
    bridge: false,
    empty: true,
    vcsDiff: changes,
    pullRequests: {
      create: (input) => {
        requests.push(input)
        return created.promise
      },
    },
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

  const draft = await openDraft(page)
  await expect(draft).toContainText("Opens the pull request with the gh or glab CLI signed in on this server.")
  await expect(draft.getByRole("textbox", { name: "From branch" })).toHaveValue("main")
  await expect(draft.getByRole("textbox", { name: "Base branch" })).toHaveValue("main")
  const description = draft.getByRole("textbox", { name: "Description" })
  await expect(description).toHaveValue(/^Summary\n- Cockpit parent\n\nFiles\n/)
  await expect(description).toHaveValue(/^- `src\/approval\.ts` \(\+48 −32\)$/m)
  await expect(description).toHaveValue(/^- `docs\/flow\.md` \(\+18 −4\)$/m)
  await draft.getByRole("textbox", { name: "Title" }).fill("Approval proposal")
  await draft.getByRole("textbox", { name: "From branch" }).fill("feature/approval")
  await draft.getByRole("textbox", { name: "Base branch" }).fill("dev")
  const body = await description.inputValue()
  await draft.getByRole("button", { name: "Create pull request", exact: true }).click()

  // While the host answers, the form is locked and the dialog cannot be dismissed.
  await expect(draft.getByRole("button", { name: "Creating pull request…", exact: true })).toBeDisabled()
  await expect(draft.getByRole("textbox", { name: "Title" })).toBeDisabled()
  await expect(draft.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled()
  await page.keyboard.press("Escape")
  await expect(draft).toBeVisible()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]!.url.searchParams.get("location[directory]")).toBe(cockpit)
  expect(requests[0]!.body).toEqual({ title: "Approval proposal", body, base: "dev", head: "feature/approval" })

  const url = "https://github.com/acme/widgets/pull/31"
  created.resolve({
    status: 200,
    body: { location: locationBody, data: { host: "github", repository: "acme/widgets", number: 31, url } },
  })
  const result = page.getByRole("dialog", { name: "Pull request created" })
  await expect(result).toContainText("feature/approval → dev")
  await expect(result.getByRole("heading", { name: "Approval proposal", level: 3 })).toBeVisible()
  await expect(result.getByRole("status")).toHaveText(`Opened at ${url}`)
  await expect(result.getByRole("link", { name: url, exact: true })).toHaveAttribute("href", url)
  await expect(result.getByRole("button", { name: "Download proposal" })).toHaveCount(0)
  await expect(result).not.toContainText("Nothing was sent")
  await result.getByRole("button", { name: "Close", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Create PR", exact: true })).toBeFocused()
  expect(requests).toHaveLength(1)
})

test("When the host CLI cannot open it, Create PR keeps the Markdown proposal with one line saying why", async ({
  page,
}) => {
  test.slow()
  const replies: { reply: PullRequestReply; reason: string; line: string }[] = [
    {
      reply: hostError({ kind: "not_installed", message: "gh is not installed on this server", host: "github" }),
      reason: "not_installed",
      line: "Nothing was sent: gh is not installed on this server. Download the proposal and open the pull request from your host.",
    },
    {
      reply: hostError({ kind: "not_authenticated", message: "glab is not signed in", host: "gitlab" }),
      reason: "not_authenticated",
      line: "Nothing was sent: glab is not signed in on this server. Run glab auth login there, or download the proposal.",
    },
    {
      reply: hostError({ kind: "no_remote", message: "This repository has no github.com or gitlab.com remote" }),
      reason: "no_remote",
      line: "Nothing was sent: this repository has no github.com or gitlab.com remote. Download the proposal and open the pull request from your host.",
    },
    {
      reply: hostError({
        kind: "branch_not_pushed",
        message: "main is not pushed to origin",
        host: "github",
        branch: "main",
        remote: "origin",
      }),
      reason: "branch_not_pushed",
      line: "Nothing was sent: push main to origin first, or download the proposal.",
    },
    {
      reply: hostError({
        kind: "cli_failed",
        message: "gh failed: Validation Failed: A pull request already exists for acme:main.",
        host: "github",
      }),
      reason: "cli_failed",
      line: "No pull request address came back: gh failed: Validation Failed: A pull request already exists for acme:main. Check your host before you try again, or download the proposal.",
    },
    {
      reply: { status: 404, body: {} },
      reason: "unavailable",
      line: "Nothing was sent: this server cannot open pull requests. Download the proposal and open the pull request from your host.",
    },
    // A success without an https address is not a pull request.
    {
      reply: {
        status: 200,
        body: {
          location: locationBody,
          data: { host: "github", repository: "acme/widgets", number: 31, url: "javascript:alert(1)" },
        },
      },
      reason: "error",
      line: "Orchestra could not confirm a pull request. Check your host before you try again, or download the proposal.",
    },
  ]
  const queue = [...replies]
  await setupCockpit(page, {
    bridge: false,
    empty: true,
    vcsDiff: changes,
    pullRequests: { create: () => queue.shift()!.reply },
  })
  await openParent(page)
  await reviewButton(page).click()
  for (const [index, item] of replies.entries()) {
    const draft = await openDraft(page)
    await draft.getByRole("textbox", { name: "Title" }).fill("Approval proposal")
    await draft.getByRole("textbox", { name: "Base branch" }).fill("dev")
    await draft.getByRole("button", { name: "Create pull request", exact: true }).click()
    const preview = page.getByRole("dialog", { name: "Pull request preview" })
    await expect(preview.getByRole("status")).toHaveAttribute("data-reason", item.reason)
    await expect(preview.getByRole("status")).toHaveText(item.line)
    await expect(preview).toContainText("main → dev")
    await expect(preview.getByRole("heading", { name: "Approval proposal", level: 3 })).toBeVisible()
    await expect(preview.getByRole("link")).toHaveCount(0)
    if (index === 0) {
      const saved = page.waitForEvent("download")
      await preview.getByRole("button", { name: "Download proposal", exact: true }).click()
      const proposal = await saved
      expect(proposal.suggestedFilename()).toBe("Approval proposal-pr.md")
      const markdown = await readFile((await proposal.path())!, "utf8")
      expect(markdown).toMatch(/^# Approval proposal\n\n`main` → `dev`\n\nSummary\n- Cockpit parent\n\nFiles\n/)
      expect(markdown).toContain("- `src/approval.ts` (+48 −32)\n")
      expect(markdown).toContain("- `docs/flow.md` (+18 −4)\n")
    }
    await preview.getByRole("button", { name: "Close", exact: true }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
  }
  expect(queue).toEqual([])
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
  // aria-disabled keeps the toggle focusable so its reason stays reachable, and Playwright will not click
  // an aria-disabled control. The toggle itself takes the pointer at its center, and a real click there
  // changes nothing.
  const box = await delivery.boundingBox()
  if (!box) throw new Error("The delivery toggle has no layout box")
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  expect(
    await delivery.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), center),
  ).toBe(true)
  await page.mouse.click(center.x, center.y)
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
      return route.fulfill({ json: { location, data: [{ id: "opencode", name: "Orchestra", settings: {} }] } })
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
