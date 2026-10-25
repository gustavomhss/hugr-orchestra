import { describe, expect, test } from "bun:test"
import { ShellMarks } from "@orchestra/core/pty/shell-marks"

const mark = (kind: string, tag: string, exit?: number, end = "\x07") =>
  `\x1b]133;${kind};${exit === undefined ? "" : exit + ";"}orchestra=${tag}${end}`

describe("shell marks", () => {
  test("reads prompt, start and end marks that carry the nonce", () => {
    const parser = ShellMarks.parser("n1")
    expect(parser.push(mark("A", "n1:0") + "text" + mark("C", "n1:1") + mark("D", "n1:1", 7))).toEqual([
      { kind: "prompt", seq: 0 },
      { kind: "start", seq: 1 },
      { kind: "end", seq: 1, exit: 7 },
    ])
    expect(parser.rejected).toBe(0)
  })

  test("accepts ESC \\ as the terminator", () => {
    expect(ShellMarks.parser("n1").push(mark("D", "n1:2", 0, "\x1b\\"))).toEqual([{ kind: "end", seq: 2, exit: 0 }])
  })

  test("rejects marks with a wrong or missing nonce and malformed ones", () => {
    const parser = ShellMarks.parser("n1")
    expect(
      parser.push(
        mark("D", "bad:9", 0) + "\x1b]133;D;0\x07" + mark("D", "n1:x", 0) + mark("D", "n1:3") + mark("Z", "n1:3"),
      ),
    ).toEqual([])
    expect(parser.rejected).toBe(5)
  })

  test("follows a mark split across chunks at every position", () => {
    const whole = "ab" + mark("D", "n1:4", 3) + "cd"
    for (let at = 1; at < whole.length; at++) {
      const parser = ShellMarks.parser("n1")
      expect([...parser.push(whole.slice(0, at)), ...parser.push(whole.slice(at))]).toEqual([
        { kind: "end", seq: 4, exit: 3 },
      ])
      expect(parser.rejected).toBe(0)
    }
  })

  test("a start that never ends does not grow without bound", () => {
    const parser = ShellMarks.parser("n1")
    parser.push("\x1b]133;D;" + "x".repeat(10_000))
    expect(parser.rejected).toBe(1)
    expect(parser.push(mark("A", "n1:0"))).toEqual([{ kind: "prompt", seq: 0 }])
  })
})
