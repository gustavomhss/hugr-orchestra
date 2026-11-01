import { expect, test, type Locator } from "@playwright/test"
import {
  assistantMessage,
  partDelta,
  setupTimeline,
  status,
  textPart,
  userMessage,
} from "../performance/timeline-stability/fixture"

// The virtualizer is the only owner of follow-at-bottom: the view stays pinned while a reply grows, stops
// following once the user scrolls up, and pins again after they return to the bottom.
test("follows a growing reply, stops after the user scrolls up, and resumes at the bottom", async ({ page }) => {
  const seedID = "prt_follow_streamed_text"
  const timeline = await setupTimeline(page, {
    messages: [userMessage(), assistantMessage([textPart(seedID, "Streaming begins.")], { completed: false })],
    seedHistory: true,
    viewport: { width: 1400, height: 700 },
    reducedMotion: true,
  })
  const scroller = page.locator(".scroll-view__viewport", { has: page.locator("[data-timeline-row]") })
  await timeline.send(status("busy"), 120)
  await expect.poll(() => gap(scroller)).toBeLessThanOrEqual(2)

  const stream = async (from: number, count: number) => {
    for (let index = from; index < from + count; index++) {
      await timeline.send(partDelta(seedID, paragraph(index)), 30)
    }
  }

  const initialHeight = await scroller.evaluate((element) => element.scrollHeight)
  await stream(0, 24)
  await expect.poll(() => scroller.evaluate((element) => element.scrollHeight)).toBeGreaterThan(initialHeight + 700)
  await expect.poll(() => gap(scroller)).toBeLessThanOrEqual(2)

  await scroller.hover()
  await page.mouse.wheel(0, -900)
  await expect.poll(() => gap(scroller)).toBeGreaterThan(300)
  const parked = await scroller.evaluate((element) => element.scrollTop)

  await stream(24, 12)
  await page.waitForTimeout(200)
  expect(Math.abs((await scroller.evaluate((element) => element.scrollTop)) - parked)).toBeLessThanOrEqual(1)
  expect(await gap(scroller)).toBeGreaterThan(300)

  await page.mouse.wheel(0, 100_000)
  await expect.poll(() => gap(scroller)).toBeLessThanOrEqual(2)
  await stream(36, 12)
  await expect.poll(() => gap(scroller)).toBeLessThanOrEqual(2)
})

function gap(scroller: Locator) {
  return scroller.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)
}

function paragraph(index: number) {
  return `\n\nParagraph ${index}. ${"Streamed text keeps growing the last row of the timeline. ".repeat(3)}`
}
