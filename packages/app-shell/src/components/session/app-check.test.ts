import { expect, test } from "bun:test"
import { appPresent, settleAppCheck } from "./app-check"

test("a failed app check is reported, does not invent absent, and does not reject", async () => {
  const error = new Error("check failed")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const ok = await settleAppCheck({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("an app check applies and does not report", async () => {
  const applied: boolean[] = []
  const ok = await settleAppCheck({
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

test("a missing app check is not a failure", async () => {
  const ok = await settleAppCheck({
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

test("a stale app check is not this request", async () => {
  const error = new Error("stale")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const failed = await settleAppCheck({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  const saved = await settleAppCheck({
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

test("an app the check has not confirmed is not present", () => {
  expect(appPresent(undefined)).toBe(false)
  expect(appPresent(false)).toBe(false)
  expect(appPresent(true)).toBe(true)
})
