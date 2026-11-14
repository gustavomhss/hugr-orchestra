import { expect, test } from "bun:test"
import { NativeRegex } from "../src/index.js"

const regex = { source: "(a)?", flags: "g", lastIndex: 2 }
const text = { kind: "text", value: "" }
const absent = { kind: "undefined" }
const match = { captures: [text, absent], index: 2, groups: { optional: absent, empty: text } }

function request(operation: NativeRegex.Request["operation"]): NativeRegex.Request {
  if (operation === "construct") return { version: 1, operation, pattern: "(a)?", flags: "g" }
  if (operation === "replace" || operation === "replaceAll")
    return { version: 1, operation, regex, subject: "😀a", replacement: "$1" }
  return { version: 1, operation, regex, subject: "😀a" }
}

const valid = [
  { operation: "construct", result: { kind: "constructed" } },
  { operation: "test", result: { kind: "boolean", value: true } },
  { operation: "exec", result: { kind: "match", value: match } },
  { operation: "match", result: { kind: "match", value: match } },
  { operation: "matchAll", result: { kind: "matches", value: [match] } },
  { operation: "search", result: { kind: "number", value: -1 } },
  { operation: "split", result: { kind: "split", value: [text, absent] } },
  { operation: "replace", result: { kind: "string", value: "" } },
  { operation: "replaceAll", result: { kind: "string", value: "a" } },
  { operation: "collectReplace", result: { kind: "replacements", value: [{ match: "a", offset: 2, captures: [absent], groups: {} }] } },
  { operation: "collectReplaceAll", result: { kind: "replacements", value: [] } },
] satisfies Array<{ operation: NativeRegex.Request["operation"]; result: unknown }>

for (const entry of valid) {
  test(`native regex protocol accepts ${entry.operation}`, () => {
    const reply = { version: 1, ok: true, regex, ...entry }
    expect<unknown>(NativeRegex.decodeReply(request(entry.operation), reply)).toEqual(reply)
  })
}

test("native regex protocol preserves null, global strings and catchable native errors", () => {
  for (const result of [{ kind: "match", value: null }, { kind: "strings", value: null }, { kind: "strings", value: [""] }]) {
    const reply = { version: 1, ok: true, operation: "match", regex, result }
    expect<unknown>(NativeRegex.decodeReply(request("match"), reply)).toEqual(reply)
  }
  for (const state of [{}, { regex }]) {
    const reply = { version: 1, ok: false, operation: "construct", name: "SyntaxError", message: "invalid pattern", ...state }
    expect<unknown>(NativeRegex.decodeReply(request("construct"), reply)).toEqual(reply)
  }
})

test("native regex protocol refuses operation mismatch even with a valid shared result kind", () => {
  expect(() => NativeRegex.decodeReply(request("replace"), {
    version: 1, ok: true, operation: "replaceAll", regex, result: { kind: "string", value: "a" },
  })).toThrow("operation mismatch")
  expect(() => NativeRegex.decodeReply(request("exec"), {
    version: 1, ok: false, operation: "test", name: "Error", message: "failed",
  })).toThrow("operation mismatch")
})

test("native regex protocol refuses wrong result kinds and malformed capture tags", () => {
  expect(() => NativeRegex.decodeReply(request("test"), {
    version: 1, ok: true, operation: "test", regex, result: { kind: "string", value: "true" },
  })).toThrow()
  for (const capture of [undefined, null, "", { kind: "text" }, { kind: "text", value: undefined }, { kind: "undefined", value: "" }, { kind: "missing" }]) {
    expect(() => NativeRegex.decodeReply(request("exec"), {
      version: 1, ok: true, operation: "exec", regex, result: { kind: "match", value: { captures: [capture] } },
    })).toThrow()
  }
})

test("native regex protocol refuses unknown fields at every nested boundary", () => {
  const reply = { version: 1, ok: true, operation: "exec", regex, result: { kind: "match", value: match } }
  for (const invalid of [
    { ...reply, extra: true },
    { ...reply, regex: { ...regex, extra: true } },
    { ...reply, result: { ...reply.result, extra: true } },
    { ...reply, result: { kind: "match", value: { ...match, extra: true } } },
    { ...reply, result: { kind: "match", value: { captures: [{ ...text, extra: true }] } } },
    { ...reply, result: { kind: "match", value: { captures: [], groups: { group: { ...absent, extra: true } } } } },
  ]) expect(() => NativeRegex.decodeReply(request("exec"), invalid)).toThrow()
})

test("native regex protocol refuses invalid state and UTF-16 offsets", () => {
  for (const value of [-1, 0.5, NaN, Infinity, "2", null]) {
    expect(() => NativeRegex.decodeReply(request("test"), {
      version: 1, ok: true, operation: "test", regex: { ...regex, lastIndex: value }, result: { kind: "boolean", value: true },
    })).toThrow()
    expect(() => NativeRegex.decodeReply(request("exec"), {
      version: 1, ok: true, operation: "exec", regex, result: { kind: "match", value: { captures: [], index: value } },
    })).toThrow()
    expect(() => NativeRegex.decodeReply(request("collectReplace"), {
      version: 1, ok: true, operation: "collectReplace", regex,
      result: { kind: "replacements", value: [{ match: "a", offset: value, captures: [] }] },
    })).toThrow()
  }
})

test("native regex protocol preserves undefined and empty text tags plus absent versus empty groups", () => {
  for (const groups of [{}, { groups: {} }, { groups: { optional: absent, empty: text } }]) {
    const value = { captures: [absent, text], index: 2, ...groups }
    const decoded = NativeRegex.decodeReply(request("exec"), {
      version: 1, ok: true, operation: "exec", regex, result: { kind: "match", value },
    })
    if (!decoded.ok || decoded.operation !== "exec" || decoded.result.value === null) throw new Error("Expected exec match")
    expect<unknown>(decoded.result.value).toEqual(value)
    expect(Object.hasOwn(decoded.result.value, "groups")).toBe(Object.hasOwn(value, "groups"))
    expect(decoded.result.value.captures).toEqual([{ kind: "undefined" }, { kind: "text", value: "" }])
    expect(decoded.result.value.index).toBe(2)
  }
})
