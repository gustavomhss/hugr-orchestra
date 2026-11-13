import { describe, expect, test } from "bun:test"
import { releaseAttempt } from "./provider-connection"

describe("releaseAttempt", () => {
  test("a failed cancel is reported and does not reject", async () => {
    const error = new Error("cancel failed")
    const reported: unknown[] = []
    const done = await releaseAttempt(Promise.reject(error), (cause) => reported.push(cause))
    expect(done).toBe(false)
    expect(reported).toEqual([error])
  })

  test("a cancel that lands is not reported", async () => {
    const reported: unknown[] = []
    const done = await releaseAttempt(Promise.resolve(), (cause) => reported.push(cause))
    expect(done).toBe(true)
    expect(reported).toEqual([])
  })
})
