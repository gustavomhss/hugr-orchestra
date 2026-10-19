import { expect, test } from "bun:test"
import { clamp } from "../src/clamp"

// Not named `*.test.ts` on purpose: it fails by design, so no test discovery may pick it up. A probe runs it by path.
test("a value equal to the upper bound is kept", () => {
  expect(clamp(10, 0, 10)).toBe(10)
})

test("values inside and below the interval are unaffected", () => {
  expect(clamp(5, 0, 10)).toBe(5)
  expect(clamp(-1, 0, 10)).toBe(0)
})
