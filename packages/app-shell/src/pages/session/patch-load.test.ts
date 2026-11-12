import { expect, test } from "bun:test"
import { patchClaim, settlePatchLoad } from "./patch-load"

test("a failed patch load is reported, does not invent empty, and does not reject", async () => {
  const error = new Error("load failed")
  const applied: Array<string | undefined> = []
  const reported: unknown[] = []
  const ok = await settlePatchLoad({
    read: Promise.reject(error),
    current: () => true,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(ok).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([error])
})

test("a patch load applies and does not report", async () => {
  const applied: Array<string | undefined> = []
  const ok = await settlePatchLoad({
    read: Promise.resolve(undefined),
    current: () => true,
    apply: (value) => applied.push(value),
    report: () => {
      throw new Error("reported")
    },
  })
  expect(ok).toBe(true)
  expect(applied).toEqual([undefined])
})

test("a missing patch load is not a failure", async () => {
  const ok = await settlePatchLoad({
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

test("a stale patch load is not this request", async () => {
  const error = new Error("stale")
  const applied: Array<string | undefined> = []
  const reported: unknown[] = []
  const failed = await settlePatchLoad({
    read: Promise.reject(error),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  const saved = await settlePatchLoad({
    read: Promise.resolve("@@ patch\n"),
    current: () => false,
    apply: (value) => applied.push(value),
    report: (cause) => reported.push(cause),
  })
  expect(failed).toBe(false)
  expect(saved).toBe(false)
  expect(applied).toEqual([])
  expect(reported).toEqual([])
})

test("a patch the load has not confirmed is not empty", () => {
  expect(patchClaim(false, true, undefined)).toBe("failed")
  expect(patchClaim(false, false, undefined)).toBe("unknown")
  expect(patchClaim(true, false, undefined)).toBe("empty")
  expect(patchClaim(true, false, "@@ patch\n")).toBe("text")
})
