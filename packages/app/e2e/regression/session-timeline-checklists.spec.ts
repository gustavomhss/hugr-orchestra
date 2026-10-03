import { expect, test } from "@playwright/test"
import {
  assistantMessage,
  partUpdated,
  setupTimeline,
  status,
  textPart,
  toolPart,
  userMessage,
} from "../performance/timeline-stability/fixture"

for (const scenario of [
  { protocol: "v1", newLayoutDesigns: true },
  { protocol: "v2", newLayoutDesigns: true },
  { protocol: "v1", newLayoutDesigns: false },
] as const) {
  test(`renders confirmed historical checklists as read-only snapshots (${scenario.protocol}, ${scenario.newLayoutDesigns ? "virtual" : "legacy"})`, async ({
    page,
  }) => {
    const proposed = { todos: [{ content: "Unconfirmed proposal", status: "completed", priority: "high" }] }
    const confirmed = [
      { content: "Verified change", status: "completed", priority: "high" },
      { content: "Next step", status: "in_progress", priority: "medium" },
    ]
    await setupTimeline(page, {
      protocol: scenario.protocol,
      settings: { newLayoutDesigns: scenario.newLayoutDesigns },
      messages: [
        userMessage(),
        assistantMessage([
          toolPart("prt_todo_snapshot", "todowrite", "completed", proposed, {
            metadata: { todos: confirmed },
            output: "[\n...output truncated...",
          }),
          toolPart("prt_todo_output", "todowrite", "completed", proposed, {
            output: JSON.stringify([{ content: "Later snapshot", status: "pending", priority: "low" }]),
          }),
          toolPart("prt_todo_unconfirmed", "todowrite", "completed", proposed),
          toolPart("prt_todo_failed", "todowrite", "error", proposed, { error: "Todo update failed" }),
        ]),
      ],
    })

    const snapshot = page.locator('[data-timeline-part-id="prt_todo_snapshot"]')
    await expect(snapshot.getByRole("button", { name: /To-dos.*1\/2/ })).toBeVisible()
    await expect(snapshot.getByRole("checkbox")).toHaveCount(2)
    const completed = snapshot.getByRole("checkbox", { name: "Verified change" })
    const current = snapshot.getByRole("checkbox", { name: "Next step" })
    await expect(completed).toBeChecked()
    await expect(current).not.toBeChecked()
    await expect(completed).toHaveAttribute("aria-readonly", "true")
    await snapshot.locator('[data-component="todos"]').click()
    await expect(completed).toBeChecked()
    await current.focus()
    await current.press("Space")
    await expect(current).not.toBeChecked()
    await expect(page.locator('[data-timeline-part-id="prt_todo_output"]')).toContainText("Later snapshot")
    await expect(snapshot).toContainText("Next step")
    await expect(page.getByText("Unconfirmed proposal", { exact: true })).toHaveCount(0)
    await expect(page.locator('[data-timeline-part-id="prt_todo_unconfirmed"]')).toHaveCount(0)
    await expect(page.locator('[data-timeline-part-id="prt_todo_failed"]')).toHaveCount(0)
  })
}

test("reveals a pending checklist only after successful confirmation", async ({ page }) => {
  const proposed = { todos: [{ content: "Proposed step", status: "pending", priority: "high" }] }
  const timeline = await setupTimeline(page, {
    messages: [
      userMessage(),
      assistantMessage(
        [toolPart("prt_todo_live", "todowrite", "pending", proposed), textPart("prt_following", "Still working")],
        { completed: false },
      ),
    ],
  })
  const snapshot = page.locator('[data-timeline-part-id="prt_todo_live"]')
  await expect(page.getByText("Still working", { exact: true })).toBeVisible()
  await expect(snapshot).toHaveCount(0)
  await timeline.send(partUpdated(toolPart("prt_todo_live", "todowrite", "running", proposed)))
  await timeline.send(partUpdated(textPart("prt_following", "Running checklist call")))
  await expect(page.getByText("Running checklist call", { exact: true })).toBeVisible()
  await expect(snapshot).toHaveCount(0)
  await timeline.send(
    partUpdated(
      toolPart("prt_todo_live", "todowrite", "completed", proposed, {
        output: JSON.stringify({ todos: [{ content: "Confirmed step", status: "completed", priority: "high" }] }),
      }),
    ),
  )
  await expect(snapshot).toContainText("Confirmed step")
  await expect(snapshot.locator('input[type="checkbox"]')).toBeChecked()
  await timeline.send(status("idle"))
  await expect(snapshot.getByRole("checkbox", { name: "Confirmed step" })).toBeChecked()
  await expect(page.getByText("Proposed step", { exact: true })).toHaveCount(0)
  await expect(page.getByText("Running checklist call", { exact: true })).toBeVisible()
})

test("virtualizes checklist history and preserves snapshot collapse state", async ({ page }) => {
  await setupTimeline(page, {
    settings: { newLayoutDesigns: true },
    messages: Array.from({ length: 150 }, (_, index) => {
      const id = `msg_${String(index + 1000).padStart(4, "0")}_todo_user`
      return [
        userMessage(undefined, { id, created: 1700000000000 + index * 10000 }),
        assistantMessage(
          [
            toolPart(
              `prt_history_todo_${index}`,
              "todowrite",
              "completed",
              {},
              {
                output: JSON.stringify([{ content: `Snapshot ${index}`, status: "pending", priority: "medium" }]),
              },
            ),
          ],
          {
            id: `msg_${String(index + 1000).padStart(4, "0")}_todo_response`,
            parentID: id,
            created: 1700000001000 + index * 10000,
          },
        ),
      ]
    }).flat(),
  })
  const latest = page.locator('[data-timeline-part-id="prt_history_todo_149"]')
  await expect(latest.getByRole("checkbox", { name: "Snapshot 149" })).toBeVisible()
  await expect.poll(() => page.locator('[data-timeline-part-id^="prt_history_todo_"]').count()).toBeLessThan(150)
  const scroller = page.locator(".scroll-view__viewport", { has: page.locator("[data-timeline-virtual-content]") })
  await scroller.hover()
  await page.mouse.wheel(0, -100000)
  const historical = page.locator('[data-timeline-part-id="prt_history_todo_0"]')
  await expect(historical.getByRole("checkbox", { name: "Snapshot 0", exact: true })).toBeVisible()
  await historical.getByRole("button", { name: /To-dos/ }).click()
  await expect(historical.getByRole("checkbox")).toHaveCount(0)
  await scroller.hover()
  await page.mouse.wheel(0, 100000)
  await expect(latest.getByRole("checkbox", { name: "Snapshot 149" })).toBeVisible()
  await expect(historical).toHaveCount(0)
  await scroller.hover()
  await page.mouse.wheel(0, -100000)
  await expect(historical.getByRole("button", { name: /To-dos/ })).toBeVisible()
  await expect(historical.getByRole("button", { name: /To-dos/ })).toHaveAttribute("aria-expanded", "false")
  await expect(historical.getByRole("checkbox")).toHaveCount(0)
  await historical.getByRole("button", { name: /To-dos/ }).click()
  await expect(historical.getByRole("checkbox", { name: "Snapshot 0", exact: true })).toBeVisible()
})
