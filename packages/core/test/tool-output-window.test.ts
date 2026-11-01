import { describe, expect, test } from "bun:test"
import { OutputWindow } from "@orchestra/core/tool/output-window"

describe("OutputWindow", () => {
  test("returns everything while it fits", () => {
    const window = OutputWindow.make(20)
    window.push("hello ")
    window.push("world")
    expect(window.dropped).toBe(0)
    expect(window.text()).toBe("hello world")
  })

  test("keeps the start and the end and names what it dropped", () => {
    const window = OutputWindow.make(10)
    window.push("START")
    window.push("m".repeat(100))
    window.push("END!!")
    expect(window.dropped).toBe(100)
    expect(window.text()).toBe("START\n[100 characters omitted from the middle of the output]\nEND!!")
  })

  test("many small chunks drop the same middle as one large chunk", () => {
    const window = OutputWindow.make(10)
    "START".split("").forEach((char) => window.push(char))
    for (let i = 0; i < 100; i++) window.push("m")
    "END!!".split("").forEach((char) => window.push(char))
    expect(window.text()).toBe("START\n[100 characters omitted from the middle of the output]\nEND!!")
  })

  test("never splits a surrogate pair at either cut", () => {
    const window = OutputWindow.make(6)
    window.push("ab\u{1F600}cd" + "x".repeat(50) + "ef\u{1F600}gh")
    const text = window.text()
    // A lone surrogate would survive a round trip through UTF-8 as U+FFFD.
    expect(Buffer.from(text, "utf8").toString("utf8")).toBe(text)
    expect(text).not.toContain("�")
  })

  test("applies the clean function to each half", () => {
    const window = OutputWindow.make(8)
    window.push("aaaa" + "-".repeat(20) + "bbbb")
    expect(window.text((text) => text.toUpperCase())).toContain("AAAA")
    expect(window.text((text) => text.toUpperCase())).toContain("BBBB")
  })
})
