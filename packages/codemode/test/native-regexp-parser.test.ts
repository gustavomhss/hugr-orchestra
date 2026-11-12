import { expect, test } from "bun:test"
import { Parser, version, type Comment, type Options, type Program, type Token } from "acorn"
import { parseWithoutNativeRegExp } from "../src/native-regexp-parser.js"

const options: Options = { ecmaVersion: "latest", locations: true, ranges: true, sourceFile: "input.js" }

const validCases: Array<{ name: string; input: string; options?: Options }> = [
  { name: "plain", input: "const re = /abc/;" },
  { name: "empty noncapturing group", input: "const re = /(?:)/;" },
  { name: "global", input: "const re = /a/g;" },
  { name: "sticky", input: "const re = /a/y;" },
  { name: "unicode", input: "const re = /a/u;" },
  { name: "indices", input: "const re = /a/d;" },
  { name: "unicode sets", input: "const re = /[a&&a]/v;" },
  { name: "combined flags", input: "const re = /a/dgimsuy;" },
  { name: "escaped slash", input: String.raw`const re = /a\/b/;` },
  { name: "escaped backslash", input: String.raw`const re = /a\\b/;` },
  { name: "escaped brackets", input: String.raw`const re = /[\[\]]+/;` },
  { name: "slash in character class", input: "const re = /[/]/;" },
  { name: "negated class", input: "const re = /[^a-z]/;" },
  { name: "named group and backreference", input: String.raw`const re = /(?<word>a)\k<word>/u;` },
  { name: "unicode property", input: String.raw`const re = /\p{Script=Greek}+/u;` },
  { name: "division versus regex", input: "const a = 12 / 3 / 2; const re = /a/; const b = a / 2;" },
  { name: "comments", input: "/* /not-a-literal/ */ const re = /a/; // /neither/\nre;" },
  { name: "template expression", input: "const text = `literal /x/ ${/a/.source}`;" },
  { name: "nested function return", input: "function outer() { return function inner() { return /a/g; }; }" },
  {
    name: "top-level return and await",
    input: "return await Promise.resolve(/a/u);",
    options: { ecmaVersion: "latest", allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true },
  },
  { name: "module", input: "export const re = /a/u; await Promise.resolve(re);", options: { ecmaVersion: "latest", sourceType: "module" } },
  { name: "CRLF locations", input: "\r\nconst re = /a/;\r\nconst another = /b/y;" },
  { name: "ECMAScript 5", input: "var re = /a/g;", options: { ecmaVersion: 5 } },
]

const invalidCases: Array<{ name: string; input: string; options?: Options }> = [
  { name: "newline", input: "const re = /a\nb/;" },
  { name: "unterminated", input: "const re = /abc" },
  { name: "trailing escape", input: "const re = /abc\\" },
  { name: "unterminated class", input: "const re = /[abc/;" },
  { name: "duplicate flags", input: "const re = /a/gg;" },
  { name: "unknown flag", input: "const re = /a/z;" },
  { name: "escaped flag", input: String.raw`const re = /a/\u0067;` },
  { name: "unclosed group", input: "const re = /(/;" },
  { name: "invalid group", input: "const re = /(?z:a)/;" },
  { name: "unknown named backreference", input: String.raw`const re = /\k<missing>/u;` },
  { name: "invalid numbered backreference", input: String.raw`const re = /\2(a)/u;` },
  { name: "unknown Unicode property", input: String.raw`const re = /\p{Definitely_Not_A_Property}/u;` },
  { name: "conflicting unicode flags", input: "const re = /a/uv;" },
  { name: "reversed class range", input: "const re = /[z-a]/u;" },
  { name: "missing unicode-set operand", input: "const re = /[a&&]/v;" },
  { name: "flag unavailable in old grammar", input: "var re = /a/u;", options: { ecmaVersion: 5 } },
  { name: "invalid surrounding division", input: "const answer = 10 / ;" },
]

test("CONTROL parser: original pinned Acorn constructs a native literal", () => {
  expect(version).toBe("8.15.0")
  const parsed = Parser.parse("const re = /a/gy;", options)
  const literals = regexLiterals(parsed)
  expect(literals).toHaveLength(1)
  expect(literals[0].value).toBeInstanceOf(RegExp)
  expect(literals[0].regex).toEqual({ pattern: "a", flags: "gy" })
  expect(literals[0].range).toEqual([11, 16])
})

test.each(validCases)("CONTROL parser: original valid $name", (entry) => {
  const parsed = Parser.parse(entry.input, { ...options, ...entry.options })
  expect(parsed.type).toBe("Program")
  expect(regexLiterals(parsed).length).toBeGreaterThan(0)
})

test.each(invalidCases)("CONTROL parser: original rejects $name", (entry) => {
  const error = syntaxFailure(() => Parser.parse(entry.input, { ...options, ...entry.options }))
  expect(error.name).toBe("SyntaxError")
  expect(typeof error.pos).toBe("number")
  expect(error.loc).toBeDefined()
})

test("CONTROL parser: original invalid regex reports actual source offset and line", () => {
  const input = "const ok = 1;\nconst bad = /(/;"
  const error = syntaxFailure(() => Parser.parse(input, options))
  expect(error.pos).toBe(input.indexOf("/") + 1)
  expect(error.loc).toEqual({ line: 2, column: 12 })
  expect(error.message).toContain("Invalid regular expression")
})

test.each(["array", "function"] as const)("CONTROL parser: original token/comment events with %s callbacks", (mode) => {
  const original = observeEvents((input, options) => Parser.parse(input, options), mode)
  expect(original.comments).toHaveLength(2)
  expect(original.tokens.filter((token) => token.type.label === "eof")).toHaveLength(1)
  const regexTokens = original.tokens.filter((token) => token.type.label === "regexp")
  expect(regexTokens).toHaveLength(2)
  regexTokens.forEach((token) => {
    if (!isRecord(token.value)) throw new Error("Expected original Acorn regex token payload")
    expect(token.value.value).toBeInstanceOf(RegExp)
  })
})

// Run before any other isolated parse: a cached donor must not hide first-call callback leakage.
test.each(["array", "function"] as const)("ACCEPT parser: preserves all token/comment events with %s callbacks", (mode) => {
  const original = observeEvents((input, options) => Parser.parse(input, options), mode)
  const actual = observeEvents(parseWithoutNativeRegExp, mode)
  expect(normalizeRegexValues(actual)).toEqual(normalizeRegexValues(original))
  expect(actual.tokens.length).toBeGreaterThan(10)
  expect(actual.tokens.filter((token) => token.type.label === "eof")).toHaveLength(1)
  expect(actual.comments).toHaveLength(2)
  const regexTokens = actual.tokens.filter((token) => token.type.label === "regexp")
  expect(regexTokens).toHaveLength(2)
  regexTokens.forEach((token) => {
    if (!isRecord(token.value)) throw new Error("Expected Acorn regex token payload")
    expect(token.value.value).toBeNull()
  })
})

test.each(validCases)("ACCEPT parser: preserves complete AST for $name", (entry) => {
  const original = Parser.parse(entry.input, { ...options, ...entry.options })
  const actual = parseWithoutNativeRegExp(entry.input, { ...options, ...entry.options })
  expect(normalizeRegexValues(actual)).toEqual(normalizeRegexValues(original))
  expect(regexLiterals(actual)).toHaveLength(regexLiterals(original).length)
  regexLiterals(actual).forEach((literal) => expect(literal.value).toBeNull())
})

test.each(invalidCases)("ACCEPT parser: preserves SyntaxError details for $name", (entry) => {
  const expected = syntaxFailure(() => Parser.parse(entry.input, { ...options, ...entry.options }))
  const actual = syntaxFailure(() => parseWithoutNativeRegExp(entry.input, { ...options, ...entry.options }))
  expect(actual).toEqual(expected)
})

test("ACCEPT parser: separate calls keep actual grammar, positions and independent validation state", () => {
  const calls: Array<{ input: string; options: Options }> = [
    { input: "var old = /a/g;", options: { ecmaVersion: 5 } },
    { input: "\n\nconst modern = /a/u;", options: { ecmaVersion: 2015, locations: true } },
    { input: "export const sets = /[a&&a]/v;", options: { ecmaVersion: "latest", sourceType: "module", ranges: true } },
    { input: "\nvar oldAgain = /b/i;", options: { ecmaVersion: 5, locations: true, ranges: true } },
  ]
  calls.forEach((entry) => {
    expect(normalizeRegexValues(parseWithoutNativeRegExp(entry.input, entry.options))).toEqual(
      normalizeRegexValues(Parser.parse(entry.input, entry.options)),
    )
  })
  expect(syntaxFailure(() => parseWithoutNativeRegExp("var old = /a/u;", { ecmaVersion: 5 }))).toEqual(
    syntaxFailure(() => Parser.parse("var old = /a/u;", { ecmaVersion: 5 })),
  )
})

test("ACCEPT parser: appends to caller program without substituting donor program state", () => {
  const originalProgram = Parser.parse("const seed = 1;", options)
  const actualProgram = Parser.parse("const seed = 1;", options)
  const seed = normalizeRegexValues(actualProgram.body[0])
  const input = "function later() { return /b/y; }"
  const expected = Parser.parse(input, { ...options, program: originalProgram })
  const actual = parseWithoutNativeRegExp(input, { ...options, program: actualProgram })
  expect(actual).toBe(actualProgram)
  expect(actual.body).toHaveLength(2)
  expect(normalizeRegexValues(actual.body[0])).toEqual(seed)
  expect(normalizeRegexValues(actual)).toEqual(normalizeRegexValues(expected))
  expect(regexLiterals(actual)[0].value).toBeNull()
})

test("ACCEPT parser: original Acorn remains native after repeated isolated parses", () => {
  parseWithoutNativeRegExp("const first = /a/g;", options)
  parseWithoutNativeRegExp("const second = /b/y;", options)
  const parsed = Parser.parse("const native = /c/gy;", options)
  const literal = regexLiterals(parsed)[0]
  expect(literal.value).toBeInstanceOf(RegExp)
  expect(literal.regex).toEqual({ pattern: "c", flags: "gy" })
})

function observeEvents(parseInput: (input: string, options: Options) => Program, mode: "array" | "function") {
  const tokens: Token[] = []
  const comments: Array<Comment | unknown[]> = []
  const commentArray: Comment[] = []
  const parsed = parseInput("/* first */ export const re = /a/g;\n// second\nconst other = /b/y;", {
    ...options,
    sourceType: "module",
    onToken: mode === "array" ? tokens : (token) => { tokens.push(token) },
    onComment: mode === "array" ? commentArray : (...event) => { comments.push(event) },
  })
  return { parsed, tokens, comments: mode === "array" ? commentArray : comments }
}

function syntaxFailure(parseInput: () => Program) {
  try {
    parseInput()
  } catch (error) {
    expect(error).toBeInstanceOf(SyntaxError)
    if (!(error instanceof SyntaxError) || !("pos" in error) || !("loc" in error) || !("raisedAt" in error)) {
      throw new Error("Expected an actual Acorn SyntaxError with source coordinates")
    }
    return { name: error.name, message: error.message, pos: error.pos, loc: error.loc, raisedAt: error.raisedAt }
  }
  throw new Error("Expected Acorn to reject invalid input")
}

function regexLiterals(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(regexLiterals)
  if (!isRecord(value)) return []
  if (value.type === "Literal" && isRecord(value.regex)) return [value]
  return Object.values(value).flatMap(regexLiterals)
}

// Only the native value inside a known Acorn regex literal/token payload differs.
function normalizeRegexValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeRegexValues)
  if (!isRecord(value)) return value
  const regexContainer = isRecord(value.regex) || (typeof value.pattern === "string" && typeof value.flags === "string")
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    regexContainer && key === "value" && (entry === null || entry instanceof RegExp) ? null : normalizeRegexValues(entry),
  ]))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
