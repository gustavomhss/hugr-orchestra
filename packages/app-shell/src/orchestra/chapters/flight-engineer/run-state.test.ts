import { expect, test } from "bun:test"
import { runClaim, settleRunRead, settleRunStop } from "./run-state"

test("a failed run-state read is reported, does not invent stopped, and does not reject", async () => {
  const error = new Error("read failed")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const ok = await settleRunRead({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a run-state read applies and does not report", async () => {
  const applied: boolean[] = []
  const ok = await settleRunRead({
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

test("a missing run-state read is not a failure", async () => {
  const ok = await settleRunRead({
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

test("a stale run-state read is not this request", async () => {
  const error = new Error("stale")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const failed = await settleRunRead({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  const saved = await settleRunRead({
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

test("a failed stop is reported, does not pretend the meeting stopped, and does not reject", async () => {
  const error = new Error("stop failed")
  const cleared: string[] = []
  const reported: unknown[] = []
  const ok = await settleRunStop({
    write: Promise.reject(error),
    current: () => true,
    clear: () => cleared.push("cleared"),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(cleared).toEqual([])
  expect(reported).toEqual([error])
})

test("a stop that saves clears the failure and does not report", async () => {
  const cleared: string[] = []
  const ok = await settleRunStop({
    write: Promise.resolve(),
    current: () => true,
    clear: () => cleared.push("cleared"),
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
  expect(cleared).toEqual(["cleared"])
})

test("a missing stop is not a failure", async () => {
  const ok = await settleRunStop({
    write: undefined,
    current: () => true,
    clear: () => {
      throw new Error("cleared")
    },
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(false)
})

test("a stale stop is not this request", async () => {
  const error = new Error("stale")
  const cleared: string[] = []
  const reported: unknown[] = []
  const ok = await settleRunStop({
    write: Promise.reject(error),
    current: () => false,
    clear: () => cleared.push("cleared"),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(cleared).toEqual([])
  expect(reported).toEqual([])
})

test("a run state the read has not confirmed is not idle", () => {
  expect(runClaim(false, false)).toBe("unknown")
  expect(runClaim(false, true)).toBe("unknown")
  expect(runClaim(true, false)).toBe("idle")
  expect(runClaim(true, true)).toBe("running")
})
