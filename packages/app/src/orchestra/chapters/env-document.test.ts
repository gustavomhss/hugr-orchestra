import { describe, expect, test } from "bun:test"
import { envEntries, parseEnv, removeEnv, serializeEnv, writeEnv } from "./env-document"

const fixture =
  '\uFEFF# local settings\r\n\r\n  export TOKEN = "secret#one"  # keep\r\nNAME=\'literal#two\'\r\nPLAIN=hello # note\r\nEMPTY=\r\nMULTI="first\r\nsecond\\nthird\\\"quoted" # tail\r\nunsupported command\r\nBAD-KEY=value\r\nLAST=no-newline'

function written(source: string, index: number | undefined, key: string, value: string) {
  const result = writeEnv(parseEnv(source), index, key, value)
  if ("error" in result) throw new Error(result.error)
  return serializeEnv(result.lines)
}

describe("lossless env document", () => {
  test("list omits comments, blank lines and BOM without changing source or assignment indices", () => {
    const source = "\uFEFF# comment\r\n \t\r\nTOKEN=value\r\n  # another comment\n\nLAST=two"
    const lines = parseEnv(source)
    expect(envEntries(lines).rows.map((row) => [row.index, row.assignment.key])).toEqual([
      [3, "TOKEN"],
      [6, "LAST"],
    ])
    expect(envEntries(lines).preserved).toBe(0)
    expect(serializeEnv(lines)).toBe(source)
  })
  test("unsupported lines appear only in the read-only count, including multiline opaque syntax", () => {
    const lines = parseEnv(fixture)
    expect(envEntries(lines).rows.map((row) => row.assignment.key)).toEqual([
      "TOKEN",
      "NAME",
      "PLAIN",
      "EMPTY",
      "MULTI",
      "LAST",
    ])
    expect(envEntries(lines).preserved).toBe(2)
    expect(envEntries(parseEnv('A="unterminated\nsecond\n')).preserved).toBe(2)
    expect(envEntries(parseEnv("unsupported directive")).preserved).toBe(1)
    expect(serializeEnv(lines)).toBe(fixture)
  })
  test("realistic BOM/CRLF fixture round-trips byte for byte with opaque lines", () => {
    expect(Buffer.from(serializeEnv(parseEnv(fixture)))).toEqual(Buffer.from(fixture))
    expect(
      parseEnv(fixture)
        .filter((line) => !line.assignment)
        .map((line) => line.raw),
    ).toEqual(["\uFEFF", "# local settings\r\n", "\r\n", "unsupported command\r\n", "BAD-KEY=value\r\n"])
  })
  test("export, quotes, inline comments, quoted hashes, empty and multiline values", () => {
    expect(
      parseEnv(fixture).flatMap((line) => (line.assignment ? [[line.assignment.key, line.assignment.value]] : [])),
    ).toEqual([
      ["TOKEN", "secret#one"],
      ["NAME", "literal#two"],
      ["PLAIN", "hello"],
      ["EMPTY", ""],
      ["MULTI", 'first\r\nsecond\nthird"quoted'],
      ["LAST", "no-newline"],
    ])
  })
  test("empty quoted values and single-quoted escapes remain literal", () => {
    const source = "S=''\nD=\"\"\nL='\\n'\n"
    expect(parseEnv(source).map((line) => line.assignment?.value)).toEqual(["", "", "\\n"])
    expect(written(source, 0, "S", "")).toBe(source)
  })
  test("LF, mixed endings, escaped backslashes and malformed quotes remain lossless", () => {
    const source = '# LF\nA="x\\\\y\\t\\r"\r\nB=word#comment\nC="bad" trailing\nD="unterminated\nE=still opaque'
    expect(serializeEnv(parseEnv(source))).toBe(source)
    expect(parseEnv(source)[1]!.assignment?.value).toBe("x\\y\t\r")
    expect(parseEnv(source)[2]!.assignment?.value).toBe("word")
    expect(
      parseEnv(source)
        .slice(3)
        .every((line) => !line.assignment),
    ).toBe(true)
  })
  test("editing only replaces the selected assignment and retains export, comment and ending", () => {
    expect(written(fixture, 3, "RENAMED", 'new#value\n"quote"\\')).toBe(
      fixture.replace(
        '  export TOKEN = "secret#one"  # keep\r\n',
        '  export RENAMED="new#value\\n\\"quote\\"\\\\"  # keep\r\n',
      ),
    )
    expect(written(fixture, 3, "TOKEN", "secret#one")).toBe(fixture)
    expect(written('A="first\nsecond"\nB=stay', 0, "A", "new")).toBe('A="new"\nB=stay')
  })
  test("add uses document endings, adds a boundary after an unterminated last line", () => {
    expect(written(fixture, undefined, "NEW", "value")).toBe(fixture + '\r\nNEW="value"\r\n')
    expect(written("", undefined, "_NEW1", "")).toBe('_NEW1=""\n')
    expect(written("A=old\n", undefined, "B", "two")).toBe('A=old\nB="two"\n')
  })
  test("remove only removes its assignment; opaque lines cannot be removed or edited", () => {
    expect(serializeEnv(removeEnv(parseEnv(fixture), 3))).toBe(
      fixture.replace('  export TOKEN = "secret#one"  # keep\r\n', ""),
    )
    expect(serializeEnv(removeEnv(parseEnv(fixture), 1))).toBe(fixture)
    expect(writeEnv(parseEnv(fixture), 1, "KEY", "value")).toEqual({ error: "readonly" })
  })
  test("invalid names and duplicate additions or renames are rejected", () => {
    for (const key of ["", "1A", "A-B", "A B", "A\nB", "A\n", "A\r", "é", "A=Z"]) {
      expect(writeEnv([], undefined, key, "secret")).toEqual({ error: "invalid" })
    }
    expect(writeEnv(parseEnv(fixture), undefined, "TOKEN", "new")).toEqual({ error: "duplicate" })
    expect(writeEnv(parseEnv(fixture), 4, "TOKEN", "new")).toEqual({ error: "duplicate" })
  })
  test("duplicate imported assignments retain independent line identities", () => {
    expect(written("A=one\nA=two\n", 1, "B", "new")).toBe('A=one\nB="new"\n')
    expect(serializeEnv(removeEnv(parseEnv("A=one\nA=two\n"), 0))).toBe("A=two\n")
    expect(written("A=one\nA=two\n", 1, "A", "new")).toBe('A=one\nA="new"\n')
  })
  test("edited values decode exactly, including CR, LF, tabs, quotes and backslashes", () => {
    const value = " space # ' \" \\ \r\n\t end "
    expect(parseEnv(written("A=old", 0, "A", value))[0]!.assignment?.value).toBe(value)
    expect(written("A=old", 0, "A", value).endsWith("\n")).toBe(false)
  })
})
