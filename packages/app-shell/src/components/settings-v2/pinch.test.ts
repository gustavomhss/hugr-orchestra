import { expect, test } from "bun:test"
import { pinchKnown, settlePinchRead, settlePinchWrite } from "./pinch"

test("a failed pinch write is reported, reverts, and does not reject", async () => {
  const error = new Error("write failed")
  const reverted: string[] = []
  const reported: unknown[] = []
  const ok = await settlePinchWrite({
    write: Promise.reject(error),
    current: () => true,
    revert: () => reverted.push("reverted"),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(reverted).toEqual(["reverted"])
  expect(reported).toEqual([error])
})

test("a pinch write that saves does not revert or report", async () => {
  const ok = await settlePinchWrite({
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

test("a missing pinch write is not a failure", async () => {
  const ok = await settlePinchWrite({
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

test("a stale pinch write is not this request", async () => {
  const error = new Error("stale")
  const reverted: string[] = []
  const reported: unknown[] = []
  const failed = await settlePinchWrite({
    write: Promise.reject(error),
    current: () => false,
    revert: () => reverted.push("reverted"),
    report: (cause) => reported.push(cause),
  })
  const saved = await settlePinchWrite({
    write: Promise.resolve(),
    current: () => false,
    revert: () => reverted.push("reverted"),
    report: (cause) => reported.push(cause),
  })
  expect(failed).toBe(false)
  expect(saved).toBe(false)
  expect(reverted).toEqual([])
  expect(reported).toEqual([])
})

test("a failed pinch read is reported, does not invent off, and does not reject", async () => {
  const error = new Error("read failed")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const ok = await settlePinchRead({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a pinch read applies and does not report", async () => {
  const applied: boolean[] = []
  const ok = await settlePinchRead({
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

test("a missing pinch read is not a failure", async () => {
  const ok = await settlePinchRead({
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

test("a stale pinch read is not this request", async () => {
  const error = new Error("stale")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const ok = await settlePinchRead({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})

test("a pinch value the read has not confirmed is not off", () => {
  expect(pinchKnown(undefined)).toBe(false)
  expect(pinchKnown(false)).toBe(true)
  expect(pinchKnown(true)).toBe(true)
})
