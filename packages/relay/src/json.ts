export * as RelayJson from "./json"

import { Effect, Result, Schema } from "effect"

// Strict JSON reading and the jq-compatible compact writer every ledger and arm file goes through (WP1).

export class DecodeError extends Schema.TaggedErrorClass<DecodeError>()("RelayJson.DecodeError", {
  reason: Schema.String,
}) {}

export class EncodeError extends Schema.TaggedErrorClass<EncodeError>()("RelayJson.EncodeError", {
  reason: Schema.String,
}) {}

/**
 * The decoded tree. It keeps what a plain JS value loses: member order (integer-like keys included), Python's split
 * between int and float, and each number's literal. The verifier, the chain writer and `repr` read it; `plain`
 * flattens it into ordinary JS values.
 */
export class Int {
  constructor(readonly digits: string) {}
}

export class Float {
  constructor(readonly literal: string) {}

  get value() {
    return Number(this.literal)
  }
}

export class Members {
  constructor(readonly entries: ReadonlyArray<readonly [string, Node]>) {}

  // undefined when the key is absent; null is a JSON value.
  get(key: string) {
    return this.entries.find((entry) => entry[0] === key)?.[1]
  }
}

export type Node = null | boolean | string | Int | Float | ReadonlyArray<Node> | Members

export interface ReadOptions {
  /**
   * python (the default): `strict_json_loads`. jq: how the bash writers' jq reads the same grammar: a repeated key
   * keeps its first place and takes its last value, an unpaired high surrogate escape is refused, an unpaired low one
   * reads as U+FFFD, and integers have no digit limit.
   */
  readonly flavor?: "python" | "jq"
}

/**
 * Decodes exactly one JSON value, like the verifier's `strict_json_loads`: duplicate decoded keys are rejected at
 * every depth (a key spelled with a unicode escape included), and the `NaN`, `Infinity` and `-Infinity` tokens are
 * rejected while quoted spellings and lexical numbers such as `1e999` stay valid.
 */
export const decode = (text: string): Effect.Effect<unknown, DecodeError> =>
  Effect.fromResult(read(text)).pipe(Effect.map(plain))

/**
 * `relay_json_string`: exactly one JSON string, or null as the empty value. Other types and NUL are rejected; tabs and
 * every LF, trailing LF included, are kept.
 */
export const decodeString = (json: string): Effect.Effect<string, DecodeError> =>
  Effect.fromResult(read(json, { flavor: "jq" })).pipe(
    Effect.flatMap((node) => {
      if (node === null) return Effect.succeed("")
      if (typeof node !== "string")
        return Effect.fail(new DecodeError({ reason: "relay_json_string: expected string or null" }))
      if (node.includes("\u0000"))
        return Effect.fail(new DecodeError({ reason: "relay_json_string: NUL is not supported" }))
      return Effect.succeed(node)
    }),
  )

/**
 * `jq -c` byte for byte: key order as given, jq's escape table (0x00–0x1f, 0x7f, `"`, `\`, U+2028, astral
 * characters), integers only. Integer-like object keys are refused, because a JS object would reorder them.
 * Members whose value is undefined are left out, as JSON.stringify does; an unpaired surrogate is written as U+FFFD,
 * as jq reads one that reaches it through `--arg`.
 */
export const compact = (value: unknown): Effect.Effect<string, EncodeError> => {
  const written = writeValue(value, "$", new Set())
  return typeof written === "string" ? Effect.succeed(written) : Effect.fail(written)
}

/**
 * `jq -c` for a decoded tree, as jq prints what it parsed: member order is the tree's, so integer-like keys keep their
 * place, and a number literal is printed in decNumber's canonical form (`1e2` as `1E+2`, `1e-2` as `0.01`), which
 * keeps an integer's digits exactly.
 */
export const compactNode = (node: Node): string => {
  if (node === null || typeof node === "boolean") return String(node)
  if (typeof node === "string") return quote(node)
  if (node instanceof Int) return node.digits
  if (node instanceof Float) return canonical(node.literal)
  if (node instanceof Members)
    return `{${node.entries.map((entry) => `${quote(entry[0])}:${compactNode(entry[1])}`).join(",")}}`
  return `[${node.map(compactNode).join(",")}]`
}

/**
 * Text as jq holds bytes it received through `--arg` or a file: valid UTF-8 as is, and each sequence jq's decoder
 * rejects (a stray continuation byte, an overlong form, a surrogate, a value past U+10FFFF, a truncated tail) as one
 * U+FFFD.
 */
export const argText = (bytes: Uint8Array): string => {
  const out: string[] = []
  let at = 0
  while (at < bytes.length) {
    const first = bytes[at]!
    const length = first < 0x80 ? 1 : first < 0xc2 ? 0 : first < 0xe0 ? 2 : first < 0xf0 ? 3 : first < 0xf5 ? 4 : 0
    if (length < 2) {
      out.push(length === 1 ? String.fromCharCode(first) : "�")
      at++
      continue
    }
    // jq consumes the whole truncated tail as one sequence.
    if (at + length > bytes.length) {
      out.push("�")
      break
    }
    const sequence = Array.from(bytes.subarray(at + 1, at + length))
    const valid = sequence.findIndex((byte) => (byte & 0xc0) !== 0x80)
    if (valid !== -1) {
      out.push("�")
      at += valid + 1
      continue
    }
    const point = sequence.reduce((point, byte) => (point << 6) | (byte & 0x3f), first & (0xff >> (length + 1)))
    const decodable = point >= SMALLEST[length]! && (point < 0xd800 || point > 0xdfff) && point <= 0x10ffff
    out.push(decodable ? String.fromCodePoint(point) : "�")
    at += length
  }
  return out.join("")
}

/**
 * The decoder behind `decode`, keeping the tree. Error reasons are Python's `str(error)`: a JSONDecodeError with its
 * line, column and code point offset, or the duplicate-key, constant and integer-size ValueErrors.
 */
export const read = (text: string, options?: ReadOptions): Result.Result<Node, DecodeError> => {
  const jq = options?.flavor === "jq"
  if (text.startsWith(BOM))
    return Result.fail(
      new DecodeError({ reason: positioned(text, "Unexpected UTF-8 BOM (decode using utf-8-sig)", 0) }),
    )
  const step = value(skip(text, 0), 0)
  if (typeof step === "string") return Result.fail(new DecodeError({ reason: step }))
  const end = skip(text, step.end)
  if (end !== text.length) return Result.fail(new DecodeError({ reason: positioned(text, "Extra data", end) }))
  return Result.succeed(step.node)

  // The C scanner's dispatch on the first character; anything else is read as a number.
  function value(at: number, depth: number): Step<Node> {
    const char = text[at]
    if (char === '"') return string(at + 1)
    if (char === "{" || char === "[") {
      if (depth >= MAX_DEPTH) return "maximum nesting depth exceeded"
      return char === "{" ? object(at + 1, depth + 1) : array(at + 1, depth + 1)
    }
    const literal = LITERALS.find((entry) => text.startsWith(entry[0], at))
    if (literal) return { node: literal[1], end: at + literal[0].length }
    const constant = CONSTANTS.find((entry) => text.startsWith(entry, at))
    if (constant) return `non-JSON constant '${constant}'`
    return number(at)
  }

  function number(at: number): Step<Node> {
    NUMBER.lastIndex = at
    const match = NUMBER.exec(text)
    if (!match) return positioned(text, "Expecting value", at)
    const end = at + match[0].length
    if (match[1] !== undefined || match[2] !== undefined) return { node: new Float(match[0]), end }
    const digits = match[0].replace("-", "").length
    if (!jq && digits > INT_DIGITS)
      return `Exceeds the limit (${INT_DIGITS} digits) for integer string conversion: value has ${digits} digits; use sys.set_int_max_str_digits() to increase the limit`
    return { node: new Int(match[0]), end }
  }

  // `scanstring_unicode`; `start` is just past the opening quote.
  function string(start: number): Step<string> {
    const chunks: string[] = []
    let end = start
    while (true) {
      let next = end
      while (next < text.length && text[next] !== '"' && text[next] !== "\\") {
        if (text.charCodeAt(next) <= 0x1f) return positioned(text, "Invalid control character at", next)
        next++
      }
      if (next >= text.length) return positioned(text, "Unterminated string starting at", start - 1)
      chunks.push(text.slice(end, next))
      if (text[next] === '"') return { node: chunks.join(""), end: next + 1 }
      next++
      if (next === text.length) return positioned(text, "Unterminated string starting at", start - 1)
      if (text[next] !== "u") {
        const escaped = ESCAPES.get(text[next]!)
        if (escaped === undefined) return positioned(text, "Invalid \\escape", next - 1)
        chunks.push(escaped)
        end = next + 1
        continue
      }
      end = next + 5
      if (end >= text.length) return positioned(text, "Invalid \\uXXXX escape", next)
      const unit = hex(next + 1)
      if (unit === undefined) return positioned(text, "Invalid \\uXXXX escape", next)
      if (unit >= 0xd800 && unit <= 0xdbff && end + 6 < text.length && text.startsWith("\\u", end)) {
        const low = hex(end + 2)
        if (low === undefined) return positioned(text, "Invalid \\uXXXX escape", end + 1)
        if (low >= 0xdc00 && low <= 0xdfff) {
          chunks.push(String.fromCharCode(unit, low))
          end += 6
          continue
        }
      }
      if (jq && unit >= 0xd800 && unit <= 0xdbff) return "Invalid \\uXXXX\\uXXXX surrogate pair escape"
      chunks.push(jq && unit >= 0xdc00 && unit <= 0xdfff ? "�" : String.fromCharCode(unit))
    }
  }

  function hex(at: number) {
    const digits = text.slice(at, at + 4)
    return /^[0-9a-fA-F]{4}$/.test(digits) ? Number.parseInt(digits, 16) : undefined
  }

  function object(start: number, depth: number): Step<Node> {
    const entries: Array<readonly [string, Node]> = []
    let at = skip(text, start)
    if (text[at] === "}") return close(entries, at + 1)
    while (true) {
      if (text[at] !== '"') return positioned(text, "Expecting property name enclosed in double quotes", at)
      const key = string(at + 1)
      if (typeof key === "string") return key
      at = skip(text, key.end)
      if (text[at] !== ":") return positioned(text, "Expecting ':' delimiter", at)
      const item = value(skip(text, at + 1), depth)
      if (typeof item === "string") return item
      entries.push([key.node, item.node])
      at = skip(text, item.end)
      if (text[at] === "}") return close(entries, at + 1)
      if (text[at] !== ",") return positioned(text, "Expecting ',' delimiter", at)
      const comma = at
      at = skip(text, at + 1)
      if (text[at] === "}") return positioned(text, "Illegal trailing comma before end of object", comma)
    }
  }

  // The pairs hook runs once the object has closed, so an inner object's duplicate is reported first.
  function close(entries: ReadonlyArray<readonly [string, Node]>, end: number): Step<Node> {
    const seen = new Map<string, number>()
    const kept: Array<readonly [string, Node]> = []
    for (const entry of entries) {
      const index = seen.get(entry[0])
      if (index === undefined) {
        seen.set(entry[0], kept.push(entry) - 1)
        continue
      }
      if (!jq) return `duplicate JSON key ${reprString(entry[0])}`
      kept[index] = entry
    }
    return { node: new Members(kept), end }
  }

  function array(start: number, depth: number): Step<Node> {
    const items: Node[] = []
    let at = skip(text, start)
    if (text[at] === "]") return { node: items, end: at + 1 }
    while (true) {
      const item = value(at, depth)
      if (typeof item === "string") return item
      items.push(item.node)
      at = skip(text, item.end)
      if (text[at] === "]") return { node: items, end: at + 1 }
      if (text[at] !== ",") return positioned(text, "Expecting ',' delimiter", at)
      const comma = at
      at = skip(text, at + 1)
      if (text[at] === "]") return positioned(text, "Illegal trailing comma before end of array", comma)
    }
  }
}

// Plain JS values: objects keep `__proto__` as an own key, and numbers become what JSON.parse makes of them.
export const plain = (node: Node): unknown => {
  if (node instanceof Int) return Number(node.digits)
  if (node instanceof Float) return node.value
  if (node instanceof Members) return Object.fromEntries(node.entries.map((entry) => [entry[0], plain(entry[1])]))
  if (isList(node)) return node.map(plain)
  return node
}

// Python's `repr` of the decoded value, as the verifier prints it in its messages.
export const repr = (node: Node): string => {
  if (node === null) return "None"
  if (node === true) return "True"
  if (node === false) return "False"
  if (typeof node === "string") return reprString(node)
  if (node instanceof Int) return BigInt(node.digits).toString()
  if (node instanceof Float) return reprFloat(node.value)
  if (node instanceof Members)
    return `{${node.entries.map((entry) => `${reprString(entry[0])}: ${repr(entry[1])}`).join(", ")}}`
  return `[${node.map(repr).join(", ")}]`
}

export const reprString = (text: string): string => {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'"
  const body = Array.from(text, (char) => {
    if (char === quote || char === "\\") return `\\${char}`
    if (char === "\t") return "\\t"
    if (char === "\n") return "\\n"
    if (char === "\r") return "\\r"
    const point = char.codePointAt(0)!
    if (point < 0x20 || point === 0x7f) return `\\x${point.toString(16).padStart(2, "0")}`
    if (point < 0x7f || !NONPRINTABLE.test(char)) return char
    if (point <= 0xff) return `\\x${point.toString(16).padStart(2, "0")}`
    if (point <= 0xffff) return `\\u${point.toString(16).padStart(4, "0")}`
    return `\\U${point.toString(16).padStart(8, "0")}`
  })
  return `${quote}${body.join("")}${quote}`
}

type Step<A> = { readonly node: A; readonly end: number } | string

const BOM = "﻿"
const MAX_DEPTH = 1000
// CPython's default `sys.get_int_max_str_digits()`.
const INT_DIGITS = 4300
const NUMBER = /-?(?:0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?/y
const LITERALS = [
  ["null", null],
  ["true", true],
  ["false", false],
] as const
const CONSTANTS = ["NaN", "Infinity", "-Infinity"]
const ESCAPES = new Map([
  ['"', '"'],
  ["\\", "\\"],
  ["/", "/"],
  ["b", "\b"],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
])
// The smallest code point a UTF-8 sequence of each length may encode; anything below is overlong.
const SMALLEST = [0, 0, 0x80, 0x800, 0x10000]
// `str.isprintable()` is false for these categories; the space is the one printable separator.
const NONPRINTABLE = /^[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]$/u
// A JS object lists array-index keys first, in numeric order, whatever order they were set in.
const INDEX = /^(?:0|[1-9]\d*)$/

function skip(text: string, at: number) {
  let end = at
  while (text[end] === " " || text[end] === "\t" || text[end] === "\n" || text[end] === "\r") end++
  return end
}

// JSONDecodeError's message; Python counts code points, not UTF-16 units.
function positioned(text: string, message: string, at: number) {
  const before = Array.from(text.slice(0, at))
  const line = before.filter((char) => char === "\n").length + 1
  return `${message}: line ${line} column ${before.length - before.lastIndexOf("\n")} (char ${before.length})`
}

function isList(node: Node): node is ReadonlyArray<Node> {
  return Array.isArray(node)
}

// Python's float repr: the shortest round-trip digits, with an exponent below 1e-4 and from 1e16.
function reprFloat(value: number) {
  if (Number.isNaN(value)) return "nan"
  if (!Number.isFinite(value)) return value > 0 ? "inf" : "-inf"
  if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0"
  const sign = value < 0 ? "-" : ""
  const [mantissa, exponent] = Math.abs(value).toExponential().split("e")
  const digits = mantissa!.replace(".", "")
  const point = Number(exponent) + 1
  if (point <= -4 || point > 16) {
    const power = Math.abs(point - 1)
      .toString()
      .padStart(2, "0")
    return `${sign}${digits[0]}${digits.length > 1 ? `.${digits.slice(1)}` : ""}e${point - 1 < 0 ? "-" : "+"}${power}`
  }
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}.0`
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
}

// decNumber's to-scientific-string of a JSON number literal: plain notation when the exponent is not positive and the
// adjusted exponent is at least -6, otherwise one digit, the rest after a point, and a signed `E` exponent.
function canonical(literal: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([-+]?\d+))?$/.exec(literal)!
  const fraction = match[3] ?? ""
  const coefficient = `${match[2]}${fraction}`.replace(/^0+(?=\d)/, "")
  const exponent = Number(match[4] ?? 0) - fraction.length
  const adjusted = exponent + coefficient.length - 1
  if (exponent > 0 || adjusted < -6) {
    const rest = coefficient.length > 1 ? `.${coefficient.slice(1)}` : ""
    return `${match[1]}${coefficient[0]}${rest}E${adjusted < 0 ? "-" : "+"}${Math.abs(adjusted)}`
  }
  const point = coefficient.length + exponent
  if (exponent === 0) return `${match[1]}${coefficient}`
  if (point > 0) return `${match[1]}${coefficient.slice(0, point)}.${coefficient.slice(point)}`
  return `${match[1]}0.${"0".repeat(-point)}${coefficient}`
}

// jq prints control characters, `"`, `\` and DEL escaped and every other character as raw UTF-8.
function quote(text: string) {
  return JSON.stringify(text.toWellFormed()).replaceAll("\u007f", "\\u007f")
}

function writeValue(value: unknown, at: string, open: Set<object>): string | EncodeError {
  if (value === null) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "string") return quote(value)
  // String(-0) is "0", as jq prints a computed zero.
  if (typeof value === "number")
    return Number.isSafeInteger(value) ? String(value) : refuse(`${at}: ${value} is not a safe integer`)
  if (typeof value !== "object") return refuse(`${at}: ${typeof value} is not JSON`)
  if (open.has(value)) return refuse(`${at}: circular reference`)
  if (Array.isArray(value)) {
    const items = writeEach(
      value.map((item, index) => [item, `${at}[${index}]`] as const),
      open,
      value,
    )
    return items instanceof EncodeError ? items : `[${items.join(",")}]`
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return refuse(`${at}: not a plain object`)
  const members = Object.entries(value).filter((entry) => entry[1] !== undefined)
  const index = members.find((entry) => INDEX.test(entry[0]) && Number(entry[0]) < 2 ** 32 - 1)
  if (index) return refuse(`${at}: integer-like key ${JSON.stringify(index[0])} would be reordered`)
  const values = writeEach(
    members.map((entry) => [entry[1], `${at}[${JSON.stringify(entry[0])}]`] as const),
    open,
    value,
  )
  if (values instanceof EncodeError) return values
  return `{${members.map((entry, position) => `${quote(entry[0])}:${values[position]}`).join(",")}}`
}

// Writes the children of one container, or returns the first refusal.
function writeEach(children: ReadonlyArray<readonly [unknown, string]>, open: Set<object>, parent: object) {
  open.add(parent)
  const written = children.map((child) =>
    child[0] === undefined ? refuse(`${child[1]}: undefined is not JSON`) : writeValue(child[0], child[1], open),
  )
  open.delete(parent)
  return written.find((item) => item instanceof EncodeError) ?? written.filter((item) => typeof item === "string")
}

function refuse(reason: string) {
  return new EncodeError({ reason })
}
