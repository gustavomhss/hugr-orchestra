import { expect, test } from "bun:test"
import { settleRename } from "./rename"

test("a failed rename is reported, does not pretend the title changed, and does not reject", async () => {
  const error = new Error("rename failed")
  const cleared: string[] = []
  const reported: unknown[] = []
  const ok = await settleRename({
    write: Promise.reject(error),
    current: () => true,
    clear: () => cleared.push("cleared"),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(cleared).toEqual([])
  expect(reported).toEqual([error])
})

test("a rename that saves clears the failure and does not report", async () => {
  const reported: unknown[] = []
  const cleared: string[] = []
  const ok = await settleRename({
    write: Promise.resolve(),
    current: () => true,
    clear: () => cleared.push("cleared"),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(true)
  expect(cleared).toEqual(["cleared"])
  expect(reported).toEqual([])
})

test("a missing rename is not a failure", async () => {
  const ok = await settleRename({
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

test("a stale rename is not this request", async () => {
  const error = new Error("stale")
  const cleared: string[] = []
  const reported: unknown[] = []
  const failed = await settleRename({
    write: Promise.reject(error),
    current: () => false,
    clear: () => cleared.push("cleared"),
    report: (cause) => reported.push(cause),
  })
  const saved = await settleRename({
    write: Promise.resolve(),
    current: () => false,
    clear: () => cleared.push("cleared"),
    report: (cause) => reported.push(cause),
  })
  expect(failed).toBe(false)
  expect(saved).toBe(false)
  expect(cleared).toEqual([])
  expect(reported).toEqual([])
})
