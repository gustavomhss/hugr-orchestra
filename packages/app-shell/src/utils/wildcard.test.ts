import { expect, test } from "bun:test"
import { matchWildcard } from "./wildcard"

test.each([
  { input: "", pattern: "", expected: true },
  { input: "", pattern: "***", expected: true },
  { input: "", pattern: "?", expected: false },
  { input: "a", pattern: "", expected: false },
  { input: "a/b\nc", pattern: "a*c", expected: true },
  { input: "a\nb", pattern: "a?b", expected: true },
  { input: "a\n", pattern: "a", expected: false },
  { input: "abc", pattern: "abc*bc", expected: false },
  { input: "abc", pattern: "a**?**c", expected: true },
  { input: "axbxc", pattern: "a*b*c", expected: true },
  { input: "abxbc", pattern: "a*bc", expected: true },
  { input: "ABC", pattern: "abc", expected: false },
  { input: "a[b].+(){}^$|", pattern: "a[b].+(){}^$|", expected: true },
  { input: "C:\\models\\a", pattern: "C:/models/*", expected: false },
  { input: "C:\\models\\a", pattern: "C:\\models\\*", expected: true },
  { input: "😀", pattern: "?", expected: false },
  { input: "😀", pattern: "??", expected: true },
  { input: "ls", pattern: "ls *", expected: false },
])("matches $input against $pattern", (item) => {
  expect(matchWildcard(item.input, item.pattern)).toBe(item.expected)
})

test("agrees with the replaced browser regex on seeded short inputs", () => {
  const chars = "abAB /\\.\n+()[]{}^$|😀"
  let seed = 20261007
  const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32
  const text = (from: string) =>
    Array.from({ length: Math.floor(next() * 8) }, () => from[Math.floor(next() * from.length)]).join("")

  Array.from({ length: 3000 }, (_, index) => {
    const input = text(chars)
    const pattern = index % 2 ? text(chars + "**??") : input.replace(/a/g, "?").replace(/b/g, "*")
    // Verbatim former browser matcher is the oracle, limited to short inputs so it cannot hang the test.
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")
    expect(matchWildcard(input, pattern)).toBe(new RegExp(`^${escaped}$`, "s").test(input))
  })
})
