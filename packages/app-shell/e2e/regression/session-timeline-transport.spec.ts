import { expect, test, type Page } from "@playwright/test"
import {
  assistantID,
  assistantMessage,
  loadedPartID,
  partUpdated,
  setupTimeline,
  shell,
  textEnded,
  textPart,
  userMessage,
} from "../performance/timeline-stability/fixture"

// Each delivery is one V2 event: the history seeds empty text slots, which stay hidden until a text.ended fills them.
function slots(count: number) {
  return {
    messages: [
      userMessage(),
      assistantMessage(Array.from({ length: count }, (_, index) => textPart(`prt_transport_slot_${index}`, ""))),
    ],
  }
}

test("keeps one connection open while delivering multiple events", async ({ page }) => {
  const timeline = await setupTimeline(page, slots(2))

  const first = await timeline.transport.send(textEnded("first event", 0))
  const second = await timeline.transport.send(textEnded("second event", 1))

  await timeline.waitForPart(loadedPartID(assistantID, "text", 0))
  await timeline.waitForPart(loadedPartID(assistantID, "text", 1))
  expect(first.connectionID).toBe(second.connectionID)
  await expect.poll(async () => (await timeline.transport.connections()).length).toBe(1)
  expect(await timeline.transport.acknowledgements()).toHaveLength(2)
})

test("delivers a burst from one stream chunk", async ({ page }) => {
  const timeline = await setupTimeline(page, slots(2))
  const acknowledgements = await timeline.transport.burst([textEnded("burst a", 0), textEnded("burst b", 1)])

  await timeline.waitForPart(loadedPartID(assistantID, "text", 0))
  await timeline.waitForPart(loadedPartID(assistantID, "text", 1))
  expect(acknowledgements.map((item) => item.chunkCount)).toEqual([1, 1])
  expect(new Set(acknowledgements.map((item) => item.deliveryID)).size).toBe(2)
})

test("parses split JSON and a split multibyte code point", async ({ page }) => {
  const timeline = await setupTimeline(page, slots(1))
  const payload = textEnded("split snowman \u2603\u2603\u2603")
  const encoded = new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)
  const snowman = new TextEncoder().encode("\u2603")[0]!
  const multibyte = encoded.indexOf(snowman)

  const acknowledgement = await timeline.transport.split(payload, [9, multibyte + 1, multibyte + 2])

  await timeline.waitForPart(loadedPartID(assistantID, "text"))
  await expect(page.locator(`[data-timeline-part-id="${loadedPartID(assistantID, "text")}"]`)).toContainText(
    "split snowman \u2603\u2603\u2603",
  )
  expect(acknowledgement.chunkCount).toBe(4)
})

test("delivers server heartbeat without mutating the timeline", async ({ page }) => {
  // The sentinel must leave the steady row's own content alone. A live part appends at the message tail, so it
  // lands after the steady part (an earlier part would take over the turn's who/when head), and it is a tool
  // part (a later text part would take over the turn's agent/model footer).
  const steadyID = loadedPartID(assistantID, "text")
  const sentinelID = "prt_transport_z_heartbeat_sentinel"
  const timeline = await setupTimeline(page, {
    messages: [userMessage(), assistantMessage([textPart("prt_transport_steady", "steady")])],
  })
  await timeline.waitForPart(steadyID)
  const before = await stableTimelineRows(page)

  await timeline.transport.writeRaw(": heartbeat\n\n")
  await timeline.send(partUpdated(shell(sentinelID, "completed", "heartbeat processed")))
  await timeline.waitForPart(sentinelID)

  await expect
    .poll(async () => {
      const rows = await timelineRows(page)
      return rows.filter((row) => before.some((item) => item.key === row.key))
    })
    .toEqual(before)
  await expect.poll(async () => (await timeline.transport.connections()).length).toBe(1)
})

test("reconnects after a clean close", async ({ page }) => {
  const timeline = await setupTimeline(page, slots(1))
  const first = await timeline.transport.waitForConnection()

  await timeline.transport.close()
  const second = await timeline.transport.waitForConnection({ after: first.id })
  await timeline.transport.send(textEnded("after close"))

  await timeline.waitForPart(loadedPartID(assistantID, "text"))
  expect(second.id).toBeGreaterThan(first.id)
  expect((await timeline.transport.connections())[0]?.endedBy).toBe("close")
})

test("reconnects after a stream error", async ({ page }) => {
  const timeline = await setupTimeline(page, slots(1))
  const first = await timeline.transport.waitForConnection()

  await timeline.transport.error("contract failure")
  const second = await timeline.transport.waitForConnection({ after: first.id })
  await timeline.transport.send(textEnded("after error"))

  await timeline.waitForPart(loadedPartID(assistantID, "text"))
  await expect.poll(async () => (await timeline.transport.connections()).length).toBe(2)
  expect(second.id).toBeGreaterThan(first.id)
  expect((await timeline.transport.connections())[0]?.endedBy).toBe("error")
})

test("does not request replay when reconnecting the volatile V2 event stream", async ({ page }) => {
  const timeline = await setupTimeline(page, slots(1))
  const first = await timeline.transport.send(textEnded("event with id"), { id: "timeline-event-7" })
  await timeline.waitForPart(loadedPartID(assistantID, "text"))

  await timeline.transport.error("retry with event id")
  const connection = await timeline.transport.waitForConnection({ after: first.connectionID })

  expect(first.eventID).toBe("timeline-event-7")
  expect(connection.headers["last-event-id"]).toBeUndefined()
})

test("passes through non-event fetches", async ({ page }) => {
  const timeline = await setupTimeline(page)

  const health = await page.evaluate(async () => {
    const response = await fetch("/api/health")
    return response.json()
  })

  expect(health).toEqual({ healthy: true, pid: expect.any(Number), version: expect.any(String) })
  await expect.poll(async () => (await timeline.transport.connections()).length).toBe(1)
})

async function stableTimelineRows(page: Page) {
  let previous: Awaited<ReturnType<typeof timelineRows>> | undefined
  let stable = 0
  await expect
    .poll(
      async () => {
        const next = await timelineRows(page)
        stable = JSON.stringify(next) === JSON.stringify(previous) ? stable + 1 : 0
        previous = next
        return stable
      },
      { intervals: [50, 50, 100] },
    )
    .toBeGreaterThanOrEqual(2)
  return previous!
}

function timelineRows(page: Page) {
  return page.locator("[data-timeline-key]").evaluateAll((elements) =>
    elements.map((element) => ({
      key: element.getAttribute("data-timeline-key"),
      row: element.querySelector("[data-timeline-row]")?.getAttribute("data-timeline-row"),
      parts: Array.from(element.querySelectorAll("[data-timeline-part-id]"), (part) =>
        part.getAttribute("data-timeline-part-id"),
      ),
      text: element.textContent,
    })),
  )
}
