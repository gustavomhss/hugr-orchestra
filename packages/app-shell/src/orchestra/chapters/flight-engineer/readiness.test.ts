import { expect, test } from "bun:test"
import { refreshReadiness, settlePermissionAsk } from "./readiness"

test("a failed readiness read is reported, ends the wait, and does not reject", async () => {
  const error = new Error("read failed")
  const reported: unknown[] = []
  const applied: string[] = []
  let finished = 0
  const ok = await refreshReadiness({
    read: Promise.reject(error),
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
    finish: () => {
      finished += 1
    },
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
  expect(finished).toBe(1)
})

test("a readiness read applies the value and does not report", async () => {
  const reported: unknown[] = []
  const applied: string[] = []
  let finished = 0
  const ok = await refreshReadiness({
    read: Promise.resolve("ready"),
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
    finish: () => {
      finished += 1
    },
  })
  expect(ok).toBe(true)
  expect(applied).toEqual(["ready"])
  expect(reported).toEqual([])
  expect(finished).toBe(1)
})

test("a missing readiness read ends the wait and does not report", async () => {
  const reported: unknown[] = []
  let finished = 0
  const ok = await refreshReadiness({
    read: undefined,
    apply: () => {
      throw new Error("applied")
    },
    report: (cause) => reported.push(cause),
    finish: () => {
      finished += 1
    },
  })
  expect(ok).toBe(false)
  expect(reported).toEqual([])
  expect(finished).toBe(1)
})

test("a failed permission request is reported and does not reject", async () => {
  const error = new Error("settings failed")
  const reported: unknown[] = []
  const opened = await settlePermissionAsk({
    request: Promise.reject(error),
    report: (cause) => reported.push(cause),
  })
  expect(opened).toBe(false)
  expect(reported).toEqual([error])
})

test("a permission request that opens does not report", async () => {
  const reported: unknown[] = []
  const opened = await settlePermissionAsk({
    request: Promise.resolve(),
    report: (cause) => reported.push(cause),
  })
  expect(opened).toBe(true)
  expect(reported).toEqual([])
})

test("a missing permission request is not a failure", async () => {
  const reported: unknown[] = []
  const opened = await settlePermissionAsk({
    request: undefined,
    report: (cause) => reported.push(cause),
  })
  expect(opened).toBe(false)
  expect(reported).toEqual([])
})
