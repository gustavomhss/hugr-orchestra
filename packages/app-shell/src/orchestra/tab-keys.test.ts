import { describe, expect, test } from "bun:test"
import { nextTabIndex } from "./tab-keys"

const at = (key: string, index: number, rtl = false) => nextTabIndex({ key, index, count: 3, rtl })

describe("nextTabIndex", () => {
  test("arrow keys move one tab and wrap at both ends", () => {
    expect(at("ArrowRight", 0)).toBe(1)
    expect(at("ArrowRight", 2)).toBe(0)
    expect(at("ArrowLeft", 1)).toBe(0)
    expect(at("ArrowLeft", 0)).toBe(2)
  })

  test("Home and End jump to the first and last tab", () => {
    expect(at("Home", 2)).toBe(0)
    expect(at("End", 0)).toBe(2)
  })

  test("right-to-left text reverses the arrows but not Home and End", () => {
    expect(at("ArrowRight", 1, true)).toBe(0)
    expect(at("ArrowLeft", 1, true)).toBe(2)
    expect(at("Home", 1, true)).toBe(0)
    expect(at("End", 1, true)).toBe(2)
  })

  test("other keys and empty lists do nothing", () => {
    expect(at("ArrowDown", 0)).toBeUndefined()
    expect(at("Enter", 0)).toBeUndefined()
    expect(nextTabIndex({ key: "ArrowRight", index: 0, count: 0, rtl: false })).toBeUndefined()
  })
})
