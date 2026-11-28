import type { RagStudio } from "@orchestra/schema/rag-studio"
import { expect, test, type Page, type TestInfo } from "@playwright/test"
import { mockOrchestraServer } from "../utils/mock-server"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const directory = "/repo/purchasing"
const projectId = "purchasing"
const sentence = "Orders above $10,000 require written approval from the category lead."
const text = `Purchasing policy\n\n${sentence}\n\nAttach the approval record to the purchase order before sending it to the supplier.`
const sources = [
  { id: "policy", locationId: projectId, path: "/library/procurement/purchasing-policy.txt", contentHash: "policy-hash", status: "read" },
  { id: "supplier", locationId: projectId, path: "/library/procurement/supplier-onboarding.txt", contentHash: "supplier-hash", status: "not_yet_read" },
  { id: "archive", locationId: projectId, path: "/library/archive/purchasing-archive.txt", contentHash: "archive-hash", status: "failed" },
] satisfies RagStudio.Source[]
const detail = {
  source: sources[0],
  text,
  chunks: [{ id: "policy-1", sourceId: "policy", start: 0, end: text.length, text, sourceHash: "policy-hash" }],
} satisfies RagStudio.SourceDetail
const pipeline = {
  parser: "plain", boundary: "document", tokenizer: "utf16", lexical: true, embedding: false,
  embeddingModel: "", queryModel: "", dimension: 0, numericType: "float32", metric: "cosine", k: 4,
} satisfies RagStudio.Pipeline
const revision = { id: "revision-1", snapshot: "corpus-1", pipelineHash: "pipeline-1", fill: "complete" } satisfies RagStudio.Revision
const result = {
  revisionId: revision.id,
  light: "sent",
  reasons: {
    not_in_corpus: "", search_miss: "", dropped_before_model: "",
    sent: "The proposed block contains the approval sentence.",
  },
  fileStatus: "read",
  span: { sourceId: "policy", start: text.indexOf(sentence), end: text.indexOf(sentence) + sentence.length },
  hits: ["policy-1"],
  dropped: [],
  promptText: text,
  promptChunkIds: ["policy-1"],
  retrievalOptional: false,
  sense: "off",
} satisfies RagStudio.QuestionResult

async function setup(page: Page, scheme: "light" | "dark") {
  await page.addInitScript(
    ({ server, directory, scheme }) => {
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem("settings.v3", JSON.stringify({ general: { shouldDisplayTabsToast: false } }))
      localStorage.setItem("orchestra-palette", scheme)
      localStorage.setItem("orchestra-color-scheme", scheme)
      localStorage.setItem("orchestra.global.dat:server", JSON.stringify({ projects: { local: [{ worktree: directory }] } }))
      localStorage.setItem("orchestra.global.dat:layout", JSON.stringify({ home: { selection: { server, directory } } }))
    },
    { server, directory, scheme },
  )
  await mockOrchestraServer(page, {
    provider: { all: [], connected: [], default: {} },
    directory,
    project: { id: projectId, name: "Purchasing", worktree: directory, vcs: "git", sandboxes: [], time: { created: 1, updated: 1 } },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })

  const responses = new Map<string, unknown>([
    ["GET sources", sources],
    ["GET sources/policy", detail],
    ["GET pipeline", pipeline],
    ["POST revisions", revision],
    ["POST ask", result],
    ["POST questions", { id: "question-1" }],
    ["POST passes", { pass: "rechunk", fill: "failed" } satisfies RagStudio.PassResult],
  ])
  await page.route("**/api/rag-studio/**", async (route) => {
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    }
    const request = route.request()
    const path = new URL(request.url()).pathname.replace("/api/rag-studio/", "")
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    const ask = request.method() === "POST" && path === "ask" ? request.postDataJSON() as RagStudio.AskInput : undefined
    if (ask?.text === "This request fails") return route.fulfill({ status: 500, headers })
    const data = responses.get(`${request.method()} ${path}`)
    if (data === undefined) return route.fulfill({ status: 404, headers })
    return route.fulfill({ headers, json: { location: { directory, project: { id: projectId, directory } }, data } })
  })
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path, animations: "disabled" })
  await testInfo.attach(name, { path, contentType: "image/png" })
}

for (const scheme of ["light", "dark"] as const) {
  for (const layout of [{ name: "wide", width: 1440, columns: 2 }, { name: "narrow", width: 800, columns: 1 }]) {
    test(`Rag Studio cockpit in ${scheme} at ${layout.name} width`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: layout.width, height: 900 })
      await setup(page, scheme)
      await page.goto("/orchestra/rag-studio")
      await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme)
      const tabs = page.getByRole("tablist", { name: "Rag Studio" })
      const filesTab = tabs.getByRole("tab", { name: "Files", exact: true })
      const questionTab = tabs.getByRole("tab", { name: "Question", exact: true })
      const maintainTab = tabs.getByRole("tab", { name: "Maintain", exact: true })
      const files = page.getByRole("tabpanel", { name: "Files", exact: true })
      const question = page.getByRole("tabpanel", { name: "Question", exact: true })
      const maintain = page.getByRole("tabpanel", { name: "Maintain", exact: true })
      await expect(filesTab).toHaveAttribute("aria-selected", "true")
      const inventory = files.getByRole("list", { name: "Files", exact: true })
      await expect(inventory.getByRole("listitem")).toHaveCount(3)
      const policy = inventory.getByRole("button", { name: /purchasing-policy.txt.*Read$/ })
      await expect(inventory.getByRole("button", { name: /supplier-onboarding.txt.*Not yet read$/ })).toBeVisible()
      await expect(inventory.getByRole("button", { name: /purchasing-archive.txt.*Failed$/ })).toBeVisible()
      await policy.click()
      await expect(files.getByRole("region", { name: "The cut" })).toContainText(sentence)
      await capture(page, testInfo, `${scheme}-${layout.name}-files`)

      await filesTab.focus()
      await filesTab.press("ArrowRight")
      await expect(questionTab).toHaveAttribute("aria-selected", "true")
      await expect(files).toBeHidden()
      const lights = question.locator(".rag-lights")
      await expect(lights.getByRole("listitem")).toHaveCount(4)
      const current = lights.locator('[aria-current="true"]')
      await expect(current).toHaveCount(0)
      await question.getByRole("textbox", { name: "Sentence" }).fill(sentence)
      await question.getByRole("button", { name: "Ask", exact: true }).click()
      await expect(current).toHaveText("Sent")
      const passage = question.getByRole("region", { name: "Source passage" })
      await expect(passage.locator("mark")).toHaveText(sentence)
      await expect(question.getByRole("region", { name: "Retrieval trace" })).toContainText("revision-1")
      await expect
        .poll(() => question.locator(".rag-diagnosis").evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length))
        .toBe(layout.columns)
      await expect
        .poll(() => question.evaluate((panel) => panel.scrollWidth - panel.clientWidth))
        .toBeLessThanOrEqual(1)
      await capture(page, testInfo, `${scheme}-${layout.name}-question`)

      const saved = page.waitForRequest((request) =>
        request.method() === "POST" && new URL(request.url()).pathname === "/api/rag-studio/questions",
      )
      await question.getByRole("button", { name: "Save this question" }).click()
      expect((await saved).postDataJSON()).toEqual({ text: sentence, revisionId: revision.id, span: result.span })
      await expect(question.getByRole("status")).toHaveText("Question saved.")
      await maintainTab.click()
      await expect(maintain.getByRole("button", { name: "Whole document", exact: true })).toHaveAttribute("aria-pressed", "true")
      for (const name of ["Read again", "Cut again", "Redo numbers", "Remove pieces"]) {
        await expect(maintain.getByRole("button", { name, exact: true })).toBeVisible()
      }
      await capture(page, testInfo, `${scheme}-${layout.name}-maintain`)

      await filesTab.click()
      await expect(policy).toHaveAttribute("aria-pressed", "true")
      await expect(files.getByRole("region", { name: "The cut" })).toContainText(sentence)
      await questionTab.click()
      await expect(passage.locator("mark")).toHaveText(sentence)
    })
  }
}

test("failed operations clear earlier claims and keep maintenance controls within a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 })
  await setup(page, "light")
  await page.goto("/orchestra/rag-studio")
  const tabs = page.getByRole("tablist", { name: "Rag Studio" })
  await tabs.getByRole("tab", { name: "Question", exact: true }).click()
  const panel = page.getByRole("tabpanel", { name: "Question", exact: true })
  const input = panel.getByRole("textbox", { name: "Sentence" })
  const ask = panel.getByRole("button", { name: "Ask", exact: true })
  await input.fill(sentence)
  await ask.click()
  const activeLight = panel.locator(".rag-lights [aria-current=true]")
  await expect(activeLight).toHaveText("Sent")

  await input.fill("This request fails")
  await ask.click()
  await expect(panel.getByRole("alert")).toHaveText("That did not finish.")
  await expect(activeLight).toHaveCount(0)
  await expect(panel.getByRole("region", { name: "Source passage" })).toBeHidden()

  await tabs.getByRole("tab", { name: "Maintain", exact: true }).click()
  const maintain = page.getByRole("tabpanel", { name: "Maintain", exact: true })
  const metric = maintain.getByRole("group", { name: "Metric", exact: true })
  await expect(metric.getByRole("button", { name: "Cosine", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect.poll(() => metric.evaluate((group) => {
    const bounds = group.getBoundingClientRect()
    return Array.from(group.querySelectorAll("button")).every((button) => {
      const rect = button.getBoundingClientRect()
      return rect.left >= bounds.left && rect.right <= bounds.right
    })
  })).toBe(true)
  await maintain.getByRole("button", { name: /supplier-onboarding.txt.*Not yet read$/ }).click()
  await maintain.getByRole("button", { name: "Cut again", exact: true }).click()
  await expect(maintain.getByRole("alert")).toHaveText("That did not finish.")
})
