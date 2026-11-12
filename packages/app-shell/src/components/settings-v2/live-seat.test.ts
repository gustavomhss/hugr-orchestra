import { expect, test } from "bun:test"
import { liveKnown, liveOn, settleLiveRead, settleLiveWrite } from "./live-seat"

test("a failed live read is reported, does not invent a value, and does not reject", async () => {
  const error = new Error("read failed")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const ok = await settleLiveRead({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a live read applies and does not report", async () => {
  const applied: boolean[] = []
  const ok = await settleLiveRead({
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

test("a missing live read is not a failure", async () => {
  const ok = await settleLiveRead({
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

test("a stale live read is not this request", async () => {
  const error = new Error("stale")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const failed = await settleLiveRead({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  const saved = await settleLiveRead({
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

test("a failed live write is reported, reverts, and does not reject", async () => {
  const error = new Error("write failed")
  const reverted: string[] = []
  const reported: unknown[] = []
  const ok = await settleLiveWrite({
    write: Promise.reject(error),
    current: () => true,
    revert: () => reverted.push("reverted"),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(reverted).toEqual(["reverted"])
  expect(reported).toEqual([error])
})

test("a live write that saves does not revert or report", async () => {
  const ok = await settleLiveWrite({
    write: Promise.resolve(),
    current: () => true,
    revert: () => {
      throw new Error("reverted")
    },
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
})

test("a missing live write is not a failure", async () => {
  const ok = await settleLiveWrite({
    write: undefined,
    current: () => true,
    revert: () => {
      throw new Error("reverted")
    },
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(false)
})

test("a stale live write is not this request", async () => {
  const error = new Error("stale")
  const reverted: string[] = []
  const reported: unknown[] = []
  const ok = await settleLiveWrite({
    write: Promise.reject(error),
    current: () => false,
    revert: () => reverted.push("reverted"),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(reverted).toEqual([])
  expect(reported).toEqual([])
})

test("an unconfirmed live value is not on", () => {
  expect(liveKnown(undefined)).toBe(false)
  expect(liveOn(undefined)).toBe(false)
  expect(liveOn(false)).toBe(false)
  expect(liveOn(true)).toBe(true)
  expect(liveKnown(false)).toBe(true)
})
