import { expect, test } from "bun:test"
import { behaviorClaim, settleBehaviorRead } from "./behavior-read"

test("a failed behavior read is reported, does not invent empty, and does not reject", async () => {
  const error = new Error("read failed")
  const applied: Array<string | null> = []
  const reported: unknown[] = []
  const ok = await settleBehaviorRead({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a behavior read applies an empty store and does not report", async () => {
  const applied: Array<string | null> = []
  const ok = await settleBehaviorRead({
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

test("a missing behavior read is not a failure", async () => {
  const ok = await settleBehaviorRead({
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

test("a stale behavior read is not this request", async () => {
  const error = new Error("stale")
  const applied: Array<string | null> = []
  const reported: unknown[] = []
  const failed = await settleBehaviorRead({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  const saved = await settleBehaviorRead({
    read: Promise.resolve("saved"),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(failed).toBe(false)
  expect(saved).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})

test("a behavior set the read has not confirmed is not ready", () => {
  expect(behaviorClaim(false, true)).toBe("failed")
  expect(behaviorClaim(false, false)).toBe("unknown")
  expect(behaviorClaim(true, false)).toBe("ready")
})
