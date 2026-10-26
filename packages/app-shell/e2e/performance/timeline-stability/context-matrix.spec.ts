import { expect, test } from "@playwright/test"
import {
  defineVisualRegions,
  reportVisualStability,
  startVisualProbe,
  stopVisualProbe,
  visualPlan,
} from "../../utils/visual-stability"
import { assistantMessage, partUpdated, setupTimeline, toolPart, userMessage, waitForVisualSettle } from "./fixture"

const inputs = {
  read: { filePath: "src/a.ts", offset: 0, limit: 120 },
  glob: { path: ".", pattern: "**/*.ts" },
  grep: { path: ".", pattern: "stable", include: "*.ts" },
  list: { path: "src" },
}

// V2 appends every live part to the end of its message, so the growing group is the tail of the turn and no
// sibling can follow it.
test("appends context operations while the group is expanded", async ({ page }, testInfo) => {
  const firstID = "prt_append_01_read"
  const timeline = await setupTimeline(page, {
    messages: [
      userMessage(),
      assistantMessage([toolPart(firstID, "read", "running", inputs.read)], { completed: false }),
    ],
    cpuRate: 4,
  })
  const initialGroup = `[data-timeline-part-ids="${firstID}"]`
  await page.locator(`${initialGroup} [data-slot="collapsible-trigger"]`).click()
  await waitForVisualSettle(page, [initialGroup])
  const regions = defineVisualRegions({
    context: {
      selector: '[data-timeline-part-ids^="prt_append_01_read"]',
      closest: '[data-timeline-row="AssistantPart"]',
    },
  })
  await startVisualProbe(page, regions)
  await timeline.send(partUpdated(toolPart("prt_append_02_glob", "glob", "running", inputs.glob)), 180)
  await timeline.send(partUpdated(toolPart("prt_append_03_grep", "grep", "completed", inputs.grep)), 240)
  await timeline.send(partUpdated(toolPart("prt_append_04_list", "list", "completed", inputs.list)), 500)
  const trace = await stopVisualProbe<keyof typeof regions>(page)
  await reportVisualStability(
    testInfo,
    "context-append",
    trace,
    visualPlan(
      regions,
      [
        { type: "required", regions: ["context"] },
        { type: "unique", regions: ["context"] },
        { type: "stable", regions: ["context"] },
        { type: "opacity", regions: "all" },
        { type: "continuity", regions: "all" },
        { type: "label-stability", regions: "all" },
        { type: "preserve-bottom-anchor" },
      ],
      { perMarker: true },
    ),
  )
  await expect(
    page.locator(
      '[data-timeline-part-ids="prt_append_01_read,prt_append_02_glob,prt_append_03_grep,prt_append_04_list"]',
    ),
  ).toBeVisible()
  await expect(
    page.locator('[data-timeline-part-ids^="prt_append_01_read"] [data-slot="collapsible-trigger"]'),
  ).toHaveAttribute("aria-expanded", "true")
})
