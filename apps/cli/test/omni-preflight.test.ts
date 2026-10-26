import { expect, test } from "bun:test"
import { needsOmni } from "../src/omni-preflight"

test("invocations that cannot spawn skip the omni preflight", () => {
  expect(needsOmni(["--version"])).toBe(false)
  expect(needsOmni(["run", "--help"])).toBe(false)
  expect(needsOmni(["help"])).toBe(false)
  expect(needsOmni(["db", "path"])).toBe(false)
})

test("commands that may spawn keep the omni preflight", () => {
  expect(needsOmni([])).toBe(true)
  expect(needsOmni(["run", "fix the build"])).toBe(true)
  expect(needsOmni(["serve"])).toBe(true)
  expect(needsOmni(["db", "query", "select 1"])).toBe(true)
})
