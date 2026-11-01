import { describe, expect, test } from "bun:test"
import { settleNewSessionReady } from "./new-session-ready"

describe("new session ready", () => {
  test("resolves true when the stores load", async () => {
    const reported: unknown[] = []
    const result = await settleNewSessionReady(Promise.all([Promise.resolve(), undefined]), (error) =>
      reported.push(error),
    )
    expect(result).toBe(true)
    expect(reported).toEqual([])
  })

  test("degrades a failed store to false and reports the error instead of rejecting", async () => {
    const failure = new Error("storage unavailable")
    const reported: unknown[] = []
    const result = await settleNewSessionReady(Promise.all([Promise.resolve(), Promise.reject(failure)]), (error) =>
      reported.push(error),
    )
    expect(result).toBe(false)
    expect(reported).toEqual([failure])
  })
})
