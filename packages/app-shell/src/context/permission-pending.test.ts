import { afterEach, describe, expect, test } from "bun:test"
import { answerPendingAfterEnable } from "./permission-pending"

const logged: unknown[] = []
const original = console.error

describe("answerPendingAfterEnable", () => {
  afterEach(() => {
    console.error = original
    logged.length = 0
  })

  test("a failed permission list is reported and does not answer prompts", async () => {
    console.error = (...args) => {
      logged.push(args[0])
    }
    const answered: string[] = []
    const reported: unknown[] = []
    const error = new Error("offline")

    await answerPendingAfterEnable({
      list: async () => {
        throw error
      },
      current: () => true,
      respond: (id: string) => answered.push(id),
      report: (failure) => reported.push(failure),
    })

    expect(answered).toEqual([])
    expect(reported).toEqual([error])
    expect(logged).toEqual([error])
  })

  test("a successful list answers each prompt still current", async () => {
    const answered: string[] = []
    const reported: unknown[] = []

    await answerPendingAfterEnable({
      list: async () => ["one", "two"],
      current: () => true,
      respond: (id: string) => answered.push(id),
      report: (failure) => reported.push(failure),
    })

    expect(answered).toEqual(["one", "two"])
    expect(reported).toEqual([])
  })

  test("a list that returns after auto-accept was turned off is not answered", async () => {
    const answered: string[] = []

    await answerPendingAfterEnable({
      list: async () => ["one"],
      current: () => false,
      respond: (id: string) => answered.push(id),
      report: () => {
        throw new Error("must not report")
      },
    })

    expect(answered).toEqual([])
  })
})
