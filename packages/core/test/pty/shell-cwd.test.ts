import { describe, expect, test } from "bun:test"
import { ShellCwd } from "@orchestra/core/pty/shell-cwd"

const osc = (path: string, end = "\x07") => `\x1b]7;file://localhost${path}${end}`

describe("ShellCwd.parser", () => {
  test("reads a directory ended by BEL or ESC \\ and decodes it", () => {
    const parser = ShellCwd.parser()
    expect(parser.push(`out${osc("/tmp/a%25b c")}more`)).toBe("/tmp/a%b c")
    expect(parser.push(osc("/work", "\x1b\\"))).toBe("/work")
  })

  test("the last directory in a chunk wins", () => {
    expect(ShellCwd.parser().push(osc("/one") + osc("/two"))).toBe("/two")
  })

  test("follows a sequence split at every position", () => {
    const text = `x${osc("/split/here")}y`
    for (let at = 1; at < text.length; at++) {
      const parser = ShellCwd.parser()
      expect(parser.push(text.slice(0, at)) ?? parser.push(text.slice(at))).toBe("/split/here")
    }
  })

  test("ignores relative paths, control characters, bad escapes and unterminated sequences", () => {
    const parser = ShellCwd.parser()
    expect(parser.push(osc("relative"))).toBeUndefined()
    expect(parser.push(osc("/a\x1bb"))).toBeUndefined()
    expect(parser.push(osc("/%E0%A4%A"))).toBeUndefined()
    expect(parser.push("\x1b]7;file://localhost/never-closed" + "x".repeat(5000))).toBeUndefined()
    expect(parser.push("plain text")).toBeUndefined()
  })
})
