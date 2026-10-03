import { expect, test } from "@playwright/test"
import { evidenceFixture, evidencePage, runCard, screenshotRoot } from "./evidence.fixture"
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

test("evidence keeps command direction and keyboard tabs in RTL", async ({ page }) => {
  await evidencePage(page)
  await page.evaluate(() => (document.documentElement.dir = "rtl"))
  const card = runCard(page)
  await expect(card.locator('[data-slot="evidence-command"]')).toHaveCSS("direction", "ltr")
  await card.getByRole("tab", { name: "Test results", exact: true }).focus()
  await page.keyboard.press("End")
  await expect(card.getByRole("tab", { name: "Output", exact: true })).toBeFocused()
  await expect(card.locator('[data-component="bash-output"]')).toHaveCSS("direction", "ltr")
})
