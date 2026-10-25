import { describe, expect, test } from "bun:test"
import { terminalWriter } from "./terminal-writer"

describe("terminalWriter", () => {
  test("buffers and flushes once per schedule", () => {
    const calls: string[] = []
    const scheduled: VoidFunction[] = []
    const writer = terminalWriter(
      (data, done) => {
        calls.push(data)
        done?.()
      },
      (flush) => scheduled.push(flush),
    )

    writer.push("a")
    writer.push("b")
    writer.push("c")

    expect(calls).toEqual([])
    expect(scheduled).toHaveLength(1)

    scheduled[0]?.()
    expect(calls).toEqual(["abc"])
  })

  test("flush is a no-op when empty", () => {
    const calls: string[] = []
    const writer = terminalWriter(
      (data, done) => {
        calls.push(data)
        done?.()
      },
      (flush) => flush(),
    )
    writer.flush()
    expect(calls).toEqual([])
  })

  test("flush waits for pending write completion", () => {
    const calls: string[] = []
    let done: VoidFunction | undefined
    const writer = terminalWriter(
      (data, finish) => {
        calls.push(data)
        done = finish
      },
      (flush) => flush(),
    )

    writer.push("a")

    let settled = false
    writer.flush(() => {
      settled = true
    })

    expect(calls).toEqual(["a"])
    expect(settled).toBe(false)

    done?.()
    expect(settled).toBe(true)
  })

  describe("synchronized output", () => {
    const start = "\x1b[?2026h"
    const end = "\x1b[?2026l"
    const setup = (timeoutMs?: number) => {
      const calls: string[] = []
      const scheduled: VoidFunction[] = []
      const writer = terminalWriter(
        (data, done) => {
          calls.push(data)
          done?.()
        },
        (flush) => scheduled.push(flush),
        timeoutMs,
      )
      const drain = () => scheduled.splice(0).forEach((flush) => flush())
      return { calls, writer, drain }
    }

    test("holds a frame until it closes and writes it in one call", () => {
      const { calls, writer, drain } = setup()
      writer.push(start + "one")
      drain()
      writer.push("two")
      drain()
      expect(calls).toEqual([])

      writer.push(end)
      drain()
      expect(calls).toEqual([start + "one" + "two" + end])
    })

    test("follows a sequence split across chunks", () => {
      const { calls, writer, drain } = setup()
      writer.push("\x1b[?20")
      writer.push("26hframe")
      drain()
      expect(calls).toEqual([])

      writer.push("\x1b[?2026")
      writer.push("l")
      drain()
      expect(calls).toEqual(["\x1b[?2026hframe\x1b[?2026l"])
    })

    test("does not count the same sequence twice", () => {
      const { calls, writer, drain } = setup()
      writer.push(start + end)
      writer.push("x")
      drain()
      expect(calls).toEqual([start + end + "x"])
    })

    test("flush writes a held frame", () => {
      const { calls, writer } = setup()
      writer.push(start + "open")
      writer.flush()
      expect(calls).toEqual([start + "open"])
    })

    test("a frame that never closes is released after the timeout", async () => {
      const { calls, writer, drain } = setup(10)
      writer.push(start + "stuck")
      drain()
      expect(calls).toEqual([])

      await Bun.sleep(40)
      drain()
      expect(calls).toEqual([start + "stuck"])
    })
  })
})
