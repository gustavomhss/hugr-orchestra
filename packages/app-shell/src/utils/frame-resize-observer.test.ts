import { describe, expect, test } from "bun:test"
import { coalesceToFrame } from "./frame-resize-observer"

// A frame source the test steps by hand.
function frames() {
  const queue = new Map<number, () => void>()
  let next = 0
  return {
    request: (run: () => void) => {
      queue.set(++next, run)
      return next
    },
    cancel: (id: number) => void queue.delete(id),
    flush: () => queue.forEach((run, id) => (queue.delete(id), run())),
    size: () => queue.size,
  }
}

describe("coalesceToFrame", () => {
  test("runs the callback once on the next frame, not when scheduled", () => {
    const source = frames()
    const calls: number[] = []
    const frame = coalesceToFrame(() => calls.push(calls.length), source)

    frame.schedule()
    frame.schedule()
    frame.schedule()
    expect(calls).toEqual([])
    expect(source.size()).toBe(1)

    source.flush()
    expect(calls).toEqual([0])
  })

  test("schedules again after a frame ran", () => {
    const source = frames()
    let count = 0
    const frame = coalesceToFrame(() => count++, source)

    frame.schedule()
    source.flush()
    frame.schedule()
    source.flush()
    expect(count).toBe(2)
  })

  test("cancel drops the pending frame", () => {
    const source = frames()
    let count = 0
    const frame = coalesceToFrame(() => count++, source)

    frame.schedule()
    frame.cancel()
    source.flush()
    expect(count).toBe(0)
    expect(source.size()).toBe(0)
  })
})
