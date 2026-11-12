import { expect, test } from "bun:test"
import { settleHotkeyRead, settleHotkeyWrite } from "./hotkey"

test("a failed hotkey write is reported, does not pretend the keys changed, and does not reject", async () => {
  const error = new Error("write failed")
  const applied: string[] = []
  const reported: unknown[] = []
  const ok = await settleHotkeyWrite({
    write: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a hotkey write applies the answer and does not report", async () => {
  const applied: Array<{ ok: boolean }> = []
  const ok = await settleHotkeyWrite({
    write: Promise.resolve({ ok: false }),
    current: () => true,
    apply: (value) => applied.push(value),
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
  expect(applied).toEqual([{ ok: false }])
})

test("a missing hotkey write is not a failure", async () => {
  const ok = await settleHotkeyWrite({
    write: undefined,
    current: () => true,
    apply: () => {
      throw new Error("applied")
    },
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(false)
})

test("a stale hotkey write is not this request", async () => {
  const error = new Error("stale")
  const applied: string[] = []
  const reported: unknown[] = []
  const failed = await settleHotkeyWrite({
    write: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  const saved = await settleHotkeyWrite({
    write: Promise.resolve("saved"),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(failed).toBe(false)
  expect(saved).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})

test("a failed hotkey read is reported, does not replace the list, and does not reject", async () => {
  const error = new Error("read failed")
  const applied: string[][] = []
  const reported: unknown[] = []
  const ok = await settleHotkeyRead({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a hotkey read applies and does not report", async () => {
  const applied: string[][] = []
  const ok = await settleHotkeyRead({
    read: Promise.resolve(["Alt+M"]),
    current: () => true,
    apply: (value) => applied.push(value),
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
  expect(applied).toEqual([["Alt+M"]])
})

test("a missing hotkey read is not a failure", async () => {
  const ok = await settleHotkeyRead({
    read: undefined,
    current: () => true,
    apply: () => {
      throw new Error("applied")
    },
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(false)
})

test("a stale hotkey read is not this request", async () => {
  const error = new Error("stale")
  const applied: string[][] = []
  const reported: unknown[] = []
  const ok = await settleHotkeyRead({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})
