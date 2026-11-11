import { expect, test } from "bun:test"
import { settleProtectionRead, settleProtectionWrite } from "./protection"

test("a failed content-protection write is reported, does not move the switch, and does not reject", async () => {
  const error = new Error("write failed")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const ok = await settleProtectionWrite({
    write: Promise.reject(error),
    current: () => true,
    apply: () => applied.push(true),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a content-protection write applies and does not report", async () => {
  const applied: boolean[] = []
  const ok = await settleProtectionWrite({
    write: Promise.resolve(),
    current: () => true,
    apply: () => applied.push(true),
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
  expect(applied).toEqual([true])
})

test("a missing content-protection write is not a failure", async () => {
  const ok = await settleProtectionWrite({
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

test("a stale content-protection write is not this request", async () => {
  const error = new Error("stale")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const failed = await settleProtectionWrite({
    write: Promise.reject(error),
    current: () => false,
    apply: () => applied.push(true),
    report: (cause) => reported.push(cause),
  })
  const saved = await settleProtectionWrite({
    write: Promise.resolve(),
    current: () => false,
    apply: () => applied.push(true),
    report: (cause) => reported.push(cause),
  })
  expect(failed).toBe(false)
  expect(saved).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})

test("a failed content-protection read is reported, does not invent a value, and does not reject", async () => {
  const error = new Error("read failed")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const ok = await settleProtectionRead({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a content-protection read applies and does not report", async () => {
  const applied: boolean[] = []
  const ok = await settleProtectionRead({
    read: Promise.resolve(true),
    current: () => true,
    apply: (value) => applied.push(value),
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
  expect(applied).toEqual([true])
})

test("a missing content-protection read is not a failure", async () => {
  const ok = await settleProtectionRead({
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

test("a stale content-protection read is not this request", async () => {
  const error = new Error("stale")
  const applied: boolean[] = []
  const reported: unknown[] = []
  const ok = await settleProtectionRead({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})
