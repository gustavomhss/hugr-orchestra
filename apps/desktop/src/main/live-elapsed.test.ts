import { expect, test } from "bun:test"

import { elapsed } from "./live-elapsed"

test("elapsed shows minutes and seconds, and hours once past one", () => {
  expect(elapsed(0)).toBe("0:00")
  expect(elapsed(65_000)).toBe("1:05")
  expect(elapsed(3_725_000)).toBe("1:02:05")
})
