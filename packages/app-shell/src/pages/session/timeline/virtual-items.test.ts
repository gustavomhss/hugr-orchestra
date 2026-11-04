import { expect, test } from "bun:test"
import { filterVirtualIndexes, streamingOverscan, timelineOverscan } from "./virtual-items"

test("caps the render overscan while the session streams", () => {
  expect(timelineOverscan({ settled: 20, streaming: true })).toBe(streamingOverscan)
  expect(streamingOverscan).toBeLessThanOrEqual(8)
})

test("keeps a narrower settled overscan while streaming", () => {
  expect(timelineOverscan({ settled: 6, streaming: true })).toBe(6)
})

test("widens to the settled overscan when idle", () => {
  expect(timelineOverscan({ settled: 20, streaming: false })).toBe(20)
})

test("drops indexes outside the row count", () => {
  expect(filterVirtualIndexes([-1, 0, 2, 3], 3)).toEqual([0, 2])
})
