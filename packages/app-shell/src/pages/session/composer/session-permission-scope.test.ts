import { describe, expect, test } from "bun:test"
import { alwaysScope } from "./session-permission-scope"

describe("alwaysScope", () => {
  test("a request with nothing to save offers no always", () => {
    expect(alwaysScope([])).toBeUndefined()
  })

  test("a wildcard save covers every request of the tool", () => {
    expect(alwaysScope(["*"])).toBe("any")
  })

  test("a saved command or path covers only that exact resource", () => {
    expect(alwaysScope(["git status"])).toBe("exact")
    expect(alwaysScope(["/repo/src/index.ts"])).toBe("exact")
  })
})
