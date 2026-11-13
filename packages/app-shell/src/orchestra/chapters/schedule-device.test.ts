import { describe, expect, test } from "bun:test"
import { dropUnprompted } from "./schedule-device"

describe("dropUnprompted", () => {
  test("a failed delete is reported and does not reject", async () => {
    const error = new Error("remove failed")
    const reported: unknown[] = []
    const dropped = await dropUnprompted(Promise.reject(error), (cause) => reported.push(cause))
    expect(dropped).toBe(false)
    expect(reported).toEqual([error])
  })

  test("a delete that lands is not reported", async () => {
    const reported: unknown[] = []
    const dropped = await dropUnprompted(Promise.resolve(), (cause) => reported.push(cause))
    expect(dropped).toBe(true)
    expect(reported).toEqual([])
  })
})
