import { expect, test } from "bun:test"
import { settlePickerSearch } from "./picker-search"

test("a failed picker search is reported, does not invent empty, and does not reject", async () => {
  const error = new Error("search failed")
  const applied: string[] = []
  const reported: unknown[] = []
  const ok = await settlePickerSearch({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a picker search applies and does not report", async () => {
  const applied: string[] = []
  const ok = await settlePickerSearch({
    read: Promise.resolve(""),
    current: () => true,
    apply: (value) => applied.push(value),
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
  expect(applied).toEqual([""])
})

test("a missing picker search is not a failure", async () => {
  const ok = await settlePickerSearch({
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

test("a stale picker search is not this request", async () => {
  const error = new Error("stale")
  const applied: string[] = []
  const reported: unknown[] = []
  const failed = await settlePickerSearch({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  const saved = await settlePickerSearch({
    read: Promise.resolve("folder"),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(failed).toBe(false)
  expect(saved).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})
