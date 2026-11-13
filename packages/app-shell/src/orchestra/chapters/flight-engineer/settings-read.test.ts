import { expect, test } from "bun:test"
import { savedKeyShown, settleSettingsRead } from "./settings-read"

test("a failed settings read is reported, does not invent a value, and does not reject", async () => {
  const error = new Error("read failed")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const ok = await settleSettingsRead({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a settings read applies and does not report", async () => {
  const applied: boolean[] = []
  const ok = await settleSettingsRead({
    read: Promise.resolve(false),
    current: () => true,
    apply: (value) => applied.push(value),
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
  expect(applied).toEqual([false])
})

test("a missing settings read is not a failure", async () => {
  const ok = await settleSettingsRead({
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

test("a stale settings read is not this request", async () => {
  const error = new Error("stale")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const failed = await settleSettingsRead({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  const saved = await settleSettingsRead({
    read: Promise.resolve(true),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(failed).toBe(false)
  expect(saved).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})

test("a key the read has not confirmed is not shown as saved", () => {
  expect(savedKeyShown(undefined)).toBe(false)
  expect(savedKeyShown(false)).toBe(false)
  expect(savedKeyShown(true)).toBe(true)
})
