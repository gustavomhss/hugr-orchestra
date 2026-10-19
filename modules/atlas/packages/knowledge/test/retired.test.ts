import { describe, it, expect } from "vitest"
import { isRetired } from "../src/retired.js"

describe("isRetired", () => {
  it("returns true for SUPERSEDED", () => {
    expect(isRetired({ authoring: "SUPERSEDED" })).toBe(true)
  })
  it("returns false otherwise", () => {
    expect(isRetired({ authoring: "ADVISORY" })).toBe(false)
    expect(isRetired({ authoring: "PREDICATED" })).toBe(false)
    expect(isRetired({})).toBe(false)
    expect(isRetired(undefined)).toBe(false)
    expect(isRetired(null)).toBe(false)
    expect(isRetired("SUPERSEDED")).toBe(false)
  })
})
