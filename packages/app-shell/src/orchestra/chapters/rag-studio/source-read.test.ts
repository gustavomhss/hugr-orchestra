import { expect, test } from "bun:test"
import { settleSourceRead, sourceClaim } from "./source-read"

test("a failed source read is reported, does not invent empty, and does not reject", async () => {
  const error = new Error("read failed")
  const applied: string[] = []
  const reported: unknown[] = []
  const ok = await settleSourceRead({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a source read applies and does not report", async () => {
  const applied: string[] = []
  const ok = await settleSourceRead({
    read: Promise.resolve("source"),
    current: () => true,
    apply: (value) => applied.push(value),
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
  expect(applied).toEqual(["source"])
})

test("a missing source read is not a failure", async () => {
  const ok = await settleSourceRead({
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

test("a stale source read is not this request", async () => {
  const error = new Error("stale")
  const applied: string[] = []
  const reported: unknown[] = []
  const failed = await settleSourceRead({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  const saved = await settleSourceRead({
    read: Promise.resolve("source"),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(failed).toBe(false)
  expect(saved).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})

test("a source the read has not confirmed is not recorded", () => {
  expect(sourceClaim(false, true)).toBe("failed")
  expect(sourceClaim(false, false)).toBe("empty")
  expect(sourceClaim(true, false)).toBe("recorded")
})
