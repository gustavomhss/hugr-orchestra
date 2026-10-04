import { expect, test } from "@playwright/test"
import { editor, evidenceFixture, evidencePage, runCard, screenshotRoot } from "./evidence.fixture"
import { partUpdated, toolPart } from "../performance/timeline-stability/fixture"

test.setTimeout(120_000)

for (const sample of [
  {
    command: "bun test",
    file: "bun-fail",
    counts: ["2 failed", "5 passed", "1 skipped", "1 todo"],
    failure: "approval > rejects empty",
  },
  {
    command: "vitest run",
    file: "vitest-fail",
    counts: ["1 failed", "2 passed", "1 skipped", "1 todo"],
    failure: "a.test.ts > approval > rejects empty",
  },
  {
    command: "jest --ci",
    file: "jest-fail",
    counts: ["1 failed", "2 passed", "1 skipped"],
    failure: "approval › rejects empty",
  },
  {
    command: "npx playwright test",
    file: "pw-line-fail",
    counts: ["1 failed", "2 passed", "1 skipped"],
    failure: "a.spec.ts:3:7 › approval › rejects empty",
  },
  {
    command: "pytest",
    file: "pytest-fail",
    counts: ["2 failed", "3 passed", "1 skipped"],
    failure: "test_approval.py::test_rejects_empty",
  },
  {
    command: "go test ./...",
    file: "go-fail",
    counts: ["1 failed", "1 passed", "1 without tests"],
    failure: "TestRejectsEmpty",
  },
  {
    command: "cargo test",
    file: "cargo-fail",
    counts: ["1 failed", "1 passed", "1 skipped"],
    failure: "tests::rejects_empty",
  },
]) {
  test(`evidence shows only reported counts and failures: ${sample.command}`, async ({ page }) => {
    const output = await evidenceFixture(sample.file)
    await evidencePage(page, { command: sample.command, output, metadata: { exit: 1 } })
    const card = runCard(page, sample.command)
    await expect(card).toHaveAttribute("data-state", "failed")
    const row = card
      .locator('[data-slot="evidence-row"]')
      .filter({ has: page.getByText(sample.command.startsWith("go ") ? "Packages" : "Tests", { exact: true }) })
    await expect(row.locator("[data-count]")).toHaveText(sample.counts)
    await expect(card.getByRole("listitem").filter({ hasText: sample.failure })).toHaveCount(1)
    await expect(card).toContainText("Exit 1")
    await expect(card).toContainText("not linked to the current revision")
    if (sample.command === "bun test") await page.screenshot({ path: `${screenshotRoot}/failed-tests.png` })
    await card.getByRole("tab", { name: "Test results", exact: true }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(card.getByRole("tab", { name: "Output", exact: true })).toBeFocused()
    await expect(card.getByRole("tabpanel")).toContainText(sample.failure)
    await expect(card.locator('[data-component="bash-output"]')).toHaveCount(1)
  })
}

test("evidence supports legacy tool parts and keeps incomplete or unknown output raw", async ({ page }) => {
  const timeline = await evidencePage(page, { protocol: "v1" })
  const card = runCard(page)
  await expect(card).toHaveAttribute("data-state", "passed")
  const output = await evidenceFixture("bun-pass")
  for (const value of [
    { command: "bun run test", output, metadata: { exit: 0, truncated: false } },
    { command: "bun test", output: `${output}\nunfinished second run`, metadata: { exit: 0, truncated: false } },
    { command: "bun test", output, metadata: { exit: 1, truncated: false } },
    { command: "bun test", output, metadata: { exit: 0 } },
    { command: "bun test", output: "unrecognized reporter", metadata: { exit: 0, truncated: false } },
  ]) {
    await timeline.send(partUpdated(toolPart("prt_evidence", "bash", "completed", { command: value.command }, value)))
    const raw = page.locator('[data-timeline-part-id="prt_evidence"] [data-component="bash-output"]')
    await expect(raw).toContainText(value.output.trim())
    await expect(card).toHaveCount(0)
  }
})

test("Jest console reporter output has no invented failing test", async ({ page }) => {
  await evidencePage(page, { command: "jest --ci", output: await evidenceFixture("jest-console") })
  const card = runCard(page, "jest --ci")
  await expect(card).toHaveAttribute("data-state", "passed")
  await expect(card.locator('[data-slot="evidence-failures"]')).toHaveCount(0)
  await card.getByRole("tab", { name: "Output", exact: true }).click()
  await expect(card.getByRole("tabpanel")).toContainText("diagnostic output")
})

test("pytest card keeps the complete parameterized failure nodeid", async ({ page }) => {
  await evidencePage(page, {
    command: "pytest",
    output: await evidenceFixture("pytest-nodeid-spaces"),
    metadata: { exit: 1 },
  })
  const card = runCard(page, "pytest")
  await expect(card).toHaveAttribute("data-state", "failed")
  await expect(card.getByRole("listitem")).toHaveText(["pytest_nodeid_case.py::test_label[hello world]"])
  await expect(card.getByRole("listitem")).toHaveAttribute("title", "pytest_nodeid_case.py::test_label[hello world]")
})

for (const sample of [
  { file: "bun-ghost", command: "bun test", exit: 0, text: "(fail) ghost" },
  { file: "pw-extra-failure-row.invalid", command: "playwright test", exit: 1, text: "unrelated failure" },
  { file: "pytest-nodeid-ambiguous", command: "pytest", exit: 1, text: "test_label[hello - world]" },
]) {
  test(`contradictory or ambiguous evidence stays raw: ${sample.file}`, async ({ page }) => {
    await evidencePage(page, {
      command: sample.command,
      output: await evidenceFixture(sample.file),
      metadata: { exit: sample.exit },
    })
    await expect(page.locator('[data-timeline-part-id="prt_evidence"] [data-component="bash-output"]')).toContainText(
      sample.text,
    )
    await expect(runCard(page, sample.command)).toHaveCount(0)
  })
}

test("partial output has no totals, keeps retained log, and never opens a saved path", async ({ page }) => {
  await evidencePage(page, { metadata: { truncated: true, outputPath: "/untrusted/out.txt" } })
  const card = runCard(page)
  await expect(card).toHaveAttribute("data-state", "partial")
  await expect(card.getByText("Partial output", { exact: true })).toBeVisible()
  await expect(card.locator("[data-count]")).toHaveCount(0)
  await expect(card).toContainText("/untrusted/out.txt")
  await expect(card.getByRole("link")).toHaveCount(0)
  await page.screenshot({ path: `${screenshotRoot}/partial-output.png` })
  await card.getByRole("button", { name: "View original output" }).click()
  await expect(card.getByRole("tabpanel")).toContainText("Ran 2 tests across 1 file.")
})

test("unknown exit and zero tests remain neutral", async ({ page }) => {
  const timeline = await evidencePage(page, { protocol: "v1", metadata: { exit: null } })
  await expect(runCard(page)).toHaveAttribute("data-state", "unconfirmed")
  await expect(runCard(page)).toContainText("Exit code not reported")
  await timeline.send(
    partUpdated(
      toolPart(
        "prt_evidence",
        "bash",
        "completed",
        { command: "pytest" },
        {
          output: await evidenceFixture("pytest-zero"),
          metadata: { exit: 5, truncated: false },
        },
      ),
    ),
  )
  await expect(runCard(page, "pytest")).toHaveAttribute("data-state", "empty")
  await expect(runCard(page, "pytest")).toContainText("No tests ran")
})

test("direct shell interruption and missing end never inherit normalized success or duration", async ({ page }) => {
  await evidencePage(page)
  const output = await evidenceFixture("bun-pass")
  const messages = [
    {
      id: "msg_direct_1",
      type: "shell",
      shellID: "shl_1",
      command: "bun test a",
      status: "killed",
      exit: 0,
      output: { output, truncated: false, cursor: 0, size: output.length },
      time: { created: 1700000004000 },
    },
    {
      id: "msg_direct_2",
      type: "shell",
      shellID: "shl_2",
      command: "bun test b",
      status: "exited",
      exit: 0,
      output: { output, truncated: false, cursor: 0, size: output.length },
      time: { created: 1700000005000 },
    },
  ]
  await page.route("**/api/session/*/message?**", (route) =>
    route.fulfill({ json: { data: messages.toReversed(), cursor: {} } }),
  )
  await page.reload()
  await expect(
    page.locator('[data-timeline-part-id="msg_direct_1:tool"] [data-component="bash-output"]'),
  ).toContainText("bun test a")
  await expect(runCard(page, "bun test a")).toHaveCount(0)
  await expect(runCard(page, "bun test b")).toHaveAttribute("data-state", "passed")
  await expect(runCard(page, "bun test b")).toContainText("Process duration not reported")
})

for (const view of [
  { name: "light-en", scheme: "light", locale: "en", direction: "ltr" },
  { name: "rtl-en", scheme: "dark", locale: "en", direction: "rtl" },
  { name: "rtl-ar", scheme: "dark", locale: "ar", direction: "rtl" },
] as const) {
  test(`evidence card identity and interactions: ${view.name}`, async ({ page }) => {
    const fixture = await evidencePage(page, {
      ...view,
      output: await evidenceFixture("bun-fail"),
      metadata: { exit: 1 },
    })
    await expect(page.locator("html")).toHaveAttribute("lang", view.locale)
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", view.scheme)
    // Force CSS direction independently of language in the production bundle.
    // The Arabic case separately exercises the real locale/provider direction.
    if (view.name === "rtl-en") await page.evaluate(() => (document.documentElement.dir = "rtl"))
    await expect(page.locator("html")).toHaveAttribute("dir", view.direction)
    await expect(page.locator("html")).toHaveAttribute("lang", view.locale)
    await editor(page).fill("Keep draft / مسودة")
    const card = runCard(page)
    await expect(card).toHaveAttribute("data-state", "failed")
    await expect(card).toHaveCSS("direction", view.direction)
    await expect(card.locator('[data-slot="evidence-command"] bdi')).toHaveCSS("direction", "ltr")
    await expect(card.locator('[data-slot="evidence-command"]')).toHaveCSS("direction", view.direction)
    await expect(card.locator('[data-count="failed"] bdi')).toHaveCSS("direction", "ltr")
    await expect(card.getByRole("listitem")).toHaveText(["approval > rejects empty", "top level failure"])
    await page.evaluate(() => document.fonts.ready)
    const before = await card.boundingBox()
    const heading = await card.locator('[data-slot="evidence-tabs"]').boundingBox()
    const command = await card.locator('[data-slot="evidence-command"]').boundingBox()
    const end =
      view.direction === "rtl" ? command!.x - heading!.x : heading!.x + heading!.width - command!.x - command!.width
    expect(end).toBeCloseTo(13, 0)
    const result = card.getByRole("tab", { name: "Test results", exact: true })
    const output = card.getByRole("tab", { name: "Output", exact: true })
    await result.focus()
    await page.keyboard.press(view.direction === "rtl" ? "ArrowLeft" : "ArrowRight")
    await expect(output).toBeFocused()
    await expect(output).toHaveAttribute("aria-selected", "true")
    await expect(card.locator('[data-component="bash-output"]')).toHaveCount(1)
    await expect(card.locator('[data-component="bash-output"]')).toHaveCSS("direction", "ltr")
    await expect(card.getByRole("tabpanel")).toContainText("(fail) approval > rejects empty")
    await page.keyboard.press("Home")
    await expect(result).toBeFocused()
    await expect(result).toHaveAttribute("aria-selected", "true")
    expect((await card.boundingBox())!.width).toBeCloseTo(before!.width, 1)
    const geometry = await card
      .getByRole("tab")
      .evaluateAll((tabs) =>
        tabs.map((tab) => ({ width: tab.getBoundingClientRect().width, height: tab.getBoundingClientRect().height })),
      )
    expect(geometry).toHaveLength(2)
    geometry.forEach((tab) => {
      expect(tab.width).toBeGreaterThanOrEqual(28)
      expect(tab.height).toBeGreaterThanOrEqual(28)
    })
    await card.getByRole("button", { name: "Run tests again…", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toHaveCSS("direction", view.direction)
    await expect(dialog.locator("code")).toHaveText("bun test")
    await expect(dialog.locator("code")).toHaveCSS("direction", "ltr")
    // Existing common.cancel translation; evidence copy uses its approved English fallback.
    await dialog.getByRole("button", { name: view.locale === "ar" ? "إلغاء" : "Cancel", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(editor(page)).toHaveText("Keep draft / مسودة")
    expect(fixture.writes).toEqual([])
    await page.screenshot({ path: `${screenshotRoot}/review-${view.name}.png` })
  })
}
