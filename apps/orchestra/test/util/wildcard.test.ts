import { test, expect } from "bun:test"
import { Wildcard } from "@/util/wildcard"

test("match handles glob tokens", () => {
  expect(Wildcard.match("file1.txt", "file?.txt")).toBe(true)
  expect(Wildcard.match("file12.txt", "file?.txt")).toBe(false)
  expect(Wildcard.match("foo+bar", "foo+bar")).toBe(true)
})

test("match with trailing space+wildcard matches command with or without args", () => {
  // "ls *" should match "ls" (no args) and "ls -la" (with args)
  expect(Wildcard.match("ls", "ls *")).toBe(true)
  expect(Wildcard.match("ls -la", "ls *")).toBe(true)
  expect(Wildcard.match("ls foo bar", "ls *")).toBe(true)

  // "ls*" (no space) should NOT match "ls" alone — wait, it should because .* matches empty
  // but it WILL match "lstmeval" which is the dangerous case users should avoid
  expect(Wildcard.match("ls", "ls*")).toBe(true)
  expect(Wildcard.match("lstmeval", "ls*")).toBe(true)

  // "ls *" (with space) should NOT match "lstmeval"
  expect(Wildcard.match("lstmeval", "ls *")).toBe(false)

  // multi-word commands
  expect(Wildcard.match("git status", "git *")).toBe(true)
  expect(Wildcard.match("git", "git *")).toBe(true)
  expect(Wildcard.match("git commit -m foo", "git *")).toBe(true)
})

test("all picks the most specific pattern", () => {
  const rules = {
    "*": "deny",
    "git *": "ask",
    "git status": "allow",
  }
  expect(Wildcard.all("git status", rules)).toBe("allow")
  expect(Wildcard.all("git log", rules)).toBe("ask")
  expect(Wildcard.all("echo hi", rules)).toBe("deny")
})

test("allStructured matches command sequences", () => {
  const rules = {
    "git *": "ask",
    "git status*": "allow",
  }
  expect(Wildcard.allStructured({ head: "git", tail: ["status", "--short"] }, rules)).toBe("allow")
  expect(Wildcard.allStructured({ head: "npm", tail: ["run", "build", "--watch"] }, { "npm run *": "allow" })).toBe(
    "allow",
  )
  expect(Wildcard.allStructured({ head: "ls", tail: ["-la"] }, rules)).toBeUndefined()
})

test("allStructured prioritizes flag-specific patterns", () => {
  const rules = {
    "find *": "allow",
    "find * -delete*": "ask",
    "sort*": "allow",
    "sort -o *": "ask",
  }
  expect(Wildcard.allStructured({ head: "find", tail: ["src", "-delete"] }, rules)).toBe("ask")
  expect(Wildcard.allStructured({ head: "find", tail: ["src", "-print"] }, rules)).toBe("allow")
  expect(Wildcard.allStructured({ head: "sort", tail: ["-o", "out.txt"] }, rules)).toBe("ask")
  expect(Wildcard.allStructured({ head: "sort", tail: ["--reverse"] }, rules)).toBe("allow")
})

test("allStructured handles sed flags", () => {
  const rules = {
    "sed * -i*": "ask",
    "sed -n*": "allow",
  }
  expect(Wildcard.allStructured({ head: "sed", tail: ["-i", "file"] }, rules)).toBe("ask")
  expect(Wildcard.allStructured({ head: "sed", tail: ["-i.bak", "file"] }, rules)).toBe("ask")
  expect(Wildcard.allStructured({ head: "sed", tail: ["-n", "1p", "file"] }, rules)).toBe("allow")
  expect(Wildcard.allStructured({ head: "sed", tail: ["-i", "-n", "/./p", "myfile.txt"] }, rules)).toBe("ask")
})

test("match normalizes slashes for cross-platform globbing", () => {
  expect(Wildcard.match("C:\\Windows\\System32\\*", "C:/Windows/System32/*")).toBe(true)
  expect(Wildcard.match("C:/Windows/System32/drivers", "C:\\Windows\\System32\\*")).toBe(true)
})

test("match handles case-insensitivity on Windows", () => {
  if (process.platform === "win32") {
    expect(Wildcard.match("C:\\windows\\system32\\hosts", "C:/Windows/System32/*")).toBe(true)
    expect(Wildcard.match("c:/windows/system32/hosts", "C:\\Windows\\System32\\*")).toBe(true)
  } else {
    // Unix paths are case-sensitive
    expect(Wildcard.match("/users/test/file", "/Users/test/*")).toBe(false)
  }
})

test("match stays fast on patterns that made the old regex backtrack", () => {
  // The old regex took about 15 s on the first input and over a minute on the second, so a regression fails the timing
  // check on the first input instead of hanging on the larger ones.
  const cases = [
    { input: "ab".repeat(150), expected: false },
    { input: "ab".repeat(500), expected: false },
    { input: "ab".repeat(50_000), expected: false },
    { input: `${"ab".repeat(50_000)}c`, expected: true },
  ]
  for (const item of cases) {
    const start = performance.now()
    expect(Wildcard.match(item.input, "*a*b*a*b*c")).toBe(item.expected)
    expect(performance.now() - start).toBeLessThan(250)
  }
})

test("match agrees with the regex it replaced on seeded random cases", () => {
  // Includes case relatives a non-unicode `i` regex folds or keeps apart (ß, dotless ı, long ſ, micro µ, Kelvin K).
  // Both sides fold only on Windows, so the Windows runner of `test:ci --os both` checks the folding.
  const chars = "aAbB c/\\.\n+()[]{}^$|ıIiſsSßµμΣσςKk\u212A"
  let seed = 20261006
  const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32
  const text = (length: number, from = chars) =>
    Array.from({ length }, () => from[Math.floor(next() * from.length)]).join("")
  // Patterns derived from their input (with `?`, `*`, case flips and drops) so a fair share of cases match.
  const mutate = (input: string) =>
    input
      .split("")
      .map((char) => {
        const roll = next()
        if (roll < 0.1) return "?"
        if (roll < 0.2) return "*"
        if (roll < 0.3) return char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase()
        if (roll < 0.35) return ""
        return char
      })
      .join("")
  const cases = Array.from({ length: 5000 }, () => {
    const input = text(Math.floor(next() * 14))
    const pattern = next() < 0.5 ? mutate(input) : text(Math.floor(next() * 10), chars + "***??")
    if (next() < 0.75) return { input, pattern }
    return { input: next() < 0.5 ? input : `${input} ${text(3)}`, pattern: `${pattern} *` }
  })

  expect(
    cases.filter((item) => Wildcard.match(item.input, item.pattern) !== regexMatch(item.input, item.pattern)),
  ).toEqual([])
  expect(cases.filter((item) => regexMatch(item.input, item.pattern)).length).toBeGreaterThan(1000)
  expect(
    cases.filter((item) => item.pattern.endsWith(" *") && regexMatch(item.input, item.pattern)).length,
  ).toBeGreaterThan(200)
})

// The regex matcher that match replaced, kept verbatim as the oracle for the equivalence test.
function regexMatch(input: string, pattern: string) {
  const normalized = input.replaceAll("\\", "/")
  let escaped = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")

  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"

  return new RegExp("^" + escaped + "$", process.platform === "win32" ? "si" : "s").test(normalized)
}
