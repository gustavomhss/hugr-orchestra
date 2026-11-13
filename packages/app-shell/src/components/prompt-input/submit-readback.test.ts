import { describe, expect, test } from "bun:test"
import { readBackStatus } from "./submit"

describe("readBackStatus", () => {
  test("a failed status read is reported and does not reject", async () => {
    const error = new Error("status failed")
    const reported: unknown[] = []
    await readBackStatus(Promise.reject(error), (cause) => reported.push(cause))
    expect(reported).toEqual([error])
  })

  test("a status read that lands is not reported", async () => {
    const reported: unknown[] = []
    await readBackStatus(Promise.resolve(), (cause) => reported.push(cause))
    expect(reported).toEqual([])
  })
})
