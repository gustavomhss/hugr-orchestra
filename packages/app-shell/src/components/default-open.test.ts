import { expect, test } from "bun:test"
import { defaultOpenClaim, settleDefaultOpen } from "./default-open"

test("a failed default open read is reported, does not invent unset, and does not reject", async () => {
  const error = new Error("read failed")
  const applied: Array<string | null> = []
  const reported: unknown[] = []
  const ok = await settleDefaultOpen({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a default open read applies an empty answer and does not report", async () => {
  const applied: Array<string | null> = []
  const ok = await settleDefaultOpen({
    read: Promise.resolve(null),
    current: () => true,
    apply: (value) => applied.push(value),
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
  expect(applied).toEqual([null])
})

test("a missing default open read is not a failure", async () => {
  const ok = await settleDefaultOpen({
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

test("a stale default open read is not this request", async () => {
  const error = new Error("stale")
  const applied: Array<string | null> = []
  const reported: unknown[] = []
  const failed = await settleDefaultOpen({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  const saved = await settleDefaultOpen({
    read: Promise.resolve("server"),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(failed).toBe(false)
  expect(saved).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})

test("a default the read has not confirmed is not unset", () => {
  expect(defaultOpenClaim(false, true)).toBe("failed")
  expect(defaultOpenClaim(false, false)).toBe("unknown")
  expect(defaultOpenClaim(true, false)).toBe("known")
})
