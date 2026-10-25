import { describe, expect, test } from "bun:test"
import { CapabilityProcessOutput } from "@orchestra/core/capability/process-control/output"
import { Effect, Exit, Fiber, Layer } from "effect"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)
const bytes = (text: string) => new TextEncoder().encode(text)
const buffer = (capacity: number, ...parts: Array<string | Uint8Array>) => {
  const out = CapabilityProcessOutput.make({ capacity })
  parts.forEach((part) => out.append(typeof part === "string" ? bytes(part) : part))
  return out
}
// Reads everything from cursor in maxBytes steps, asserting each step progresses.
const drain = (out: ReturnType<typeof buffer>, maxBytes: number, cursor?: number) => {
  const chunks = [out.read(cursor, maxBytes)]
  while (chunks[chunks.length - 1].end < out.window().end) {
    const last = chunks[chunks.length - 1]
    const next = out.read(last.end, maxBytes)
    expect(next.end).toBeGreaterThan(last.end)
    chunks.push(next)
  }
  return chunks
}

describe("CapabilityProcessOutput", () => {
  test("ascii reads respect maxBytes and absolute offsets", () => {
    const out = buffer(64, "hello ", "world")
    expect(out.window()).toEqual({ retainedStart: 0, end: 11, eof: false })
    expect(out.read(undefined, 5)).toEqual({ start: 0, end: 5, text: "hello", eof: false })
    expect(out.read(5, 100)).toEqual({ start: 5, end: 11, text: " world", eof: false })
  })

  test("multibyte characters split across appends never split across reads", () => {
    const text = "aé€😀b"
    const encoded = bytes(text)
    const out = buffer(64, ...Array.from(encoded, (byte) => Uint8Array.of(byte)))
    ;[1, 2, 3, 4, 5].forEach((maxBytes) => {
      const chunks = drain(out, maxBytes)
      expect(chunks.map((chunk) => chunk.text).join("")).toBe(text)
      chunks.forEach((chunk) => expect(chunk.text).not.toContain("�"))
    })
    expect(out.read(1, 3)).toEqual({ start: 1, end: 3, text: "é", eof: false })
    expect(out.read(3, 4)).toEqual({ start: 3, end: 6, text: "€", eof: false })
  })

  test("incomplete trailing sequence waits for its remaining bytes", () => {
    const emoji = bytes("😀")
    const out = buffer(64, "a", emoji.subarray(0, 2))
    expect(out.read(0, 100)).toEqual({ start: 0, end: 1, text: "a", eof: false })
    expect(out.read(1, 100)).toEqual({ start: 1, end: 1, text: "", eof: false })
    out.append(emoji.subarray(2))
    expect(out.read(1, 100)).toEqual({ start: 1, end: 5, text: "😀", eof: false })
  })

  test("maxBytes 1 on a 4-byte character returns the whole character", () => {
    const out = buffer(64, "😀😀")
    expect(out.read(0, 1)).toEqual({ start: 0, end: 4, text: "😀", eof: false })
    expect(out.read(4, 1)).toEqual({ start: 4, end: 8, text: "😀", eof: false })
  })

  test("eviction reports lost and advances a mid-sequence start to the next boundary", () => {
    const out = buffer(8, "😀", "cdefgh")
    // Bytes 0..1 evicted: retainedStart lands on the third byte of the emoji.
    expect(out.window()).toEqual({ retainedStart: 2, end: 10, eof: false })
    expect(out.read(0, 100)).toEqual({ start: 4, end: 10, text: "cdefgh", lost: { from: 0, to: 4 }, eof: false })
    expect(out.read(undefined, 3)).toEqual({ start: 4, end: 7, text: "cde", lost: { from: 2, to: 4 }, eof: false })
    const lead = buffer(8, "ab", "😀", "cdef")
    expect(lead.read(0, 4)).toEqual({ start: 2, end: 6, text: "😀", lost: { from: 0, to: 2 }, eof: false })
  })

  test("a retained cursor inside a character advances past it and reports the skip", () => {
    const out = buffer(16, "a😀b")
    expect(out.read(2, 10)).toEqual({ start: 5, end: 6, text: "b", lost: { from: 2, to: 5 }, eof: false })
  })

  test("cursor beyond end returns an empty chunk at end", () => {
    const out = buffer(16, "abc")
    expect(out.read(50, 10)).toEqual({ start: 3, end: 3, text: "", eof: false })
    out.end()
    expect(out.read(50, 10)).toEqual({ start: 3, end: 3, text: "", eof: true })
  })

  test("exact fill keeps everything and one more byte evicts the first", () => {
    const out = buffer(4, "ab", "cd")
    expect(out.read(undefined, 10)).toEqual({ start: 0, end: 4, text: "abcd", eof: false })
    out.append(bytes("e"))
    expect(out.window()).toEqual({ retainedStart: 1, end: 5, eof: false })
    expect(out.read(0, 10)).toEqual({ start: 1, end: 5, text: "bcde", lost: { from: 0, to: 1 }, eof: false })
  })

  test("single append larger than capacity keeps the last capacity bytes", () => {
    const out = buffer(4, "x", "0123456789")
    expect(out.window()).toEqual({ retainedStart: 7, end: 11, eof: false })
    expect(out.read(undefined, 10)).toEqual({ start: 7, end: 11, text: "6789", eof: false })
  })

  test("ring wraparound reads across the physical end", () => {
    const out = buffer(5, "abc", "de", "fg")
    expect(out.read(undefined, 10)).toEqual({ start: 2, end: 7, text: "cdefg", eof: false })
  })

  test("multibyte characters straddling the physical ring end stay whole", () => {
    const out = buffer(8, "abcdef", "😀")
    expect(out.read(undefined, 100)).toEqual({ start: 2, end: 10, text: "cdef😀", eof: false })
    expect(out.read(6, 1)).toEqual({ start: 6, end: 10, text: "😀", eof: false })
    const two = buffer(6, "abcde", "é", "x")
    expect(two.read(5, 1)).toEqual({ start: 5, end: 7, text: "é", eof: false })
    expect(two.read(undefined, 100)).toEqual({ start: 2, end: 8, text: "cdeéx", eof: false })
  })

  test("U+FEFF is kept mid-stream and at a chunk start", () => {
    const out = buffer(32, "a\uFEFFb", "\uFEFFc")
    expect(out.read(0, 100).text).toBe("a\uFEFFb\uFEFFc")
    expect(out.read(1, 3)).toEqual({ start: 1, end: 4, text: "\uFEFF", eof: false })
    expect(out.read(5, 100)).toEqual({ start: 5, end: 9, text: "\uFEFFc", eof: false })
  })

  test("invalid process bytes decode as replacement but valid neighbours stay whole", () => {
    const out = buffer(16, Uint8Array.of(0x61, 0x80, 0xff, 0xe2, 0x82), bytes("é"))
    const chunks = drain(out, 1)
    // A truncated E2 82 is one maximal invalid subpart, so it stays one unit.
    expect(chunks.map((chunk) => chunk.end)).toEqual([1, 2, 3, 5, 7])
    expect(chunks.map((chunk) => chunk.text)).toEqual(["a", "\uFFFD", "\uFFFD", "\uFFFD", "é"])
  })

  test("eof only after end() and cursor reaching end; append after end is ignored", () => {
    const out = buffer(16, "abcd")
    out.end()
    expect(out.read(0, 2)).toEqual({ start: 0, end: 2, text: "ab", eof: false })
    expect(out.read(2, 10)).toEqual({ start: 2, end: 4, text: "cd", eof: true })
    out.append(bytes("late"))
    expect(out.window()).toEqual({ retainedStart: 0, end: 4, eof: true })
  })

  test("end() flushes an incomplete trailing sequence so eof is reachable", () => {
    const out = buffer(16, "a", Uint8Array.of(0xf0, 0x9f))
    out.end()
    expect(out.read(1, 10)).toEqual({ start: 1, end: 3, text: "�", eof: true })
  })

  it.effect("changed resolves immediately when data is already past the cursor", () =>
    Effect.gen(function* () {
      const out = buffer(16, "abc")
      yield* out.changed(2)
    }),
  )

  it.effect("interrupting one waiter leaves the others and the buffer intact", () =>
    Effect.gen(function* () {
      const out = buffer(16, "abc")
      const first = yield* out.changed(3).pipe(Effect.forkChild({ startImmediately: true }))
      const second = yield* out.changed(3).pipe(Effect.forkChild({ startImmediately: true }))
      const later = yield* out.changed(5).pipe(Effect.forkChild({ startImmediately: true }))
      yield* Fiber.interrupt(first)
      expect(Exit.hasInterrupts(yield* Fiber.await(first))).toBe(true)
      out.append(bytes("d"))
      yield* Fiber.join(second)
      expect(later.pollUnsafe()).toBeUndefined()
      expect(out.read(3, 10)).toEqual({ start: 3, end: 4, text: "d", eof: false })
      out.end()
      yield* Fiber.join(later)
      yield* out.changed(100)
    }),
  )

  it.effect("changed waits for a whole character beyond the cursor", () =>
    Effect.gen(function* () {
      const emoji = bytes("😀")
      const order: string[] = []
      const out = buffer(16, "a", emoji.subarray(0, 2))
      const waiter = yield* out.changed(1).pipe(
        Effect.tap(() => Effect.sync(() => order.push("woke"))),
        Effect.forkChild({ startImmediately: true }),
      )
      yield* Effect.yieldNow
      order.push("rest")
      out.append(emoji.subarray(2))
      yield* Fiber.join(waiter)
      expect(order).toEqual(["rest", "woke"])
      expect(out.read(1, 1)).toEqual({ start: 1, end: 5, text: "😀", eof: false })
    }),
  )

  it.effect("end() wakes a waiter blocked on a dangling partial character", () =>
    Effect.gen(function* () {
      const out = buffer(16, "a", Uint8Array.of(0xf0, 0x9f))
      const waiter = yield* out.changed(1).pipe(Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow
      expect(waiter.pollUnsafe()).toBeUndefined()
      out.end()
      yield* Fiber.join(waiter)
      expect(out.read(1, 10)).toEqual({ start: 1, end: 3, text: "\uFFFD", eof: true })
    }),
  )
})
