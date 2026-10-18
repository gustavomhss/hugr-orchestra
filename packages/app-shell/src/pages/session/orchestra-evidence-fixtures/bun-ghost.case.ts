import { expect, test } from "bun:test"

test("prints a misleading failure record", () => {
  console.log("(fail) ghost [1.00ms]")
  expect(true).toBe(true)
})
