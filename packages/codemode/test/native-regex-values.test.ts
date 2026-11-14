import { expect, test } from "bun:test"
import { Effect } from "effect"
import { CodeMode } from "../src/index.js"
import type { Capture, Match } from "../src/native-regex.js"
import { fromWireCapture, fromWireMatch, replacementArgs } from "../src/native-regex-values.js"
import { coerceToNumber, coerceToString } from "../src/stdlib/value.js"
import { toHostRegex } from "../src/stdlib/regexp.js"
import { copyIn, copyOut } from "../src/tool-runtime.js"
import { SandboxRegExp } from "../src/values.js"

// Invalid native source is a sentinel for metadata paths, not an executor or a replacement RegExp constructor.
const invalid = { source: "[", flags: "gimsuy", lastIndex: 3 }
const absent = { kind: "undefined" } as const
const empty = { kind: "text", value: "" } as const

test("metadata-only construction, exposed reads and coercion preserve invalid native source without compiling", () => {
  const value = SandboxRegExp.fromState(invalid)
  expect(Object.keys(value)).toEqual(["regex"])
  expect(value.source).toBe("[")
  expect(value.flags).toBe("gimsuy")
  expect(value.lastIndex).toBe(3)
  expect(value.read("source")).toBe("[")
  expect(value.read("flags")).toBe("gimsuy")
  expect(value.read("lastIndex")).toBe(3)
  for (const name of ["global", "ignoreCase", "multiline", "sticky", "unicode", "dotAll"])
    expect(value.read(name)).toBe(true)
  expect(value.read("unknown")).toBeUndefined()
  expect(coerceToString(value)).toBe("/[/gimsuy")
  expect(coerceToString([value, undefined, "tail"])).toBe("/[/gimsuy,,tail")
  expect(coerceToNumber(value)).toBeNaN()
  expect(value.state()).toEqual(invalid)
  expect(Object.keys(value)).toEqual(["regex"])
})

test("metadata-only regex access throws instead of silently materializing a native regex", () => {
  const value = SandboxRegExp.fromState(invalid)
  expect(Object.getOwnPropertyDescriptor(value, "regex")?.enumerable).toBe(true)
  expect(() => value.regex).toThrow()
  expect(value.source).toBe("[")
  expect(value.state()).toEqual(invalid)
  expect(Object.keys(value)).toEqual(["regex"])
})

test("metadata booleans reflect absent flags without touching native storage", () => {
  const value = SandboxRegExp.fromState({ source: "[", flags: "", lastIndex: 0 })
  for (const name of ["global", "ignoreCase", "multiline", "sticky", "unicode", "dotAll"])
    expect(value.read(name)).toBe(false)
  expect(value.read("lastIndex")).toBe(0)
  expect(coerceToString(value)).toBe("/[/")
})

test("metadata construction and each state snapshot are independent copies", () => {
  const input = { source: "[", flags: "g", lastIndex: 2 }
  const value = SandboxRegExp.fromState(input)
  const first = value.state()
  input.source = "caller changed source"
  input.flags = "i"
  input.lastIndex = 99
  expect(value.state()).toEqual({ source: "[", flags: "g", lastIndex: 2 })
  expect(value.state()).not.toBe(first)
  value.updateState({ source: "[", flags: "g", lastIndex: 7 })
  expect(first).toEqual({ source: "[", flags: "g", lastIndex: 2 })
  expect(value.state()).toEqual({ source: "[", flags: "g", lastIndex: 7 })
  expect(Object.keys(value)).toEqual(["regex"])
})

test("updateState updates an aliased metadata index and refuses source or flags replacement atomically", () => {
  const value = SandboxRegExp.fromState({ source: "[", flags: "g", lastIndex: 1 })
  const alias = value
  alias.updateState({ source: "[", flags: "g", lastIndex: 5 })
  expect(value.lastIndex).toBe(5)
  expect(value.read("lastIndex")).toBe(5)
  for (const replacement of [
    { source: "another source", flags: "g", lastIndex: 90 },
    { source: "[", flags: "i", lastIndex: 91 },
  ]) {
    expect(() => value.updateState(replacement)).toThrow()
    expect(alias.state()).toEqual({ source: "[", flags: "g", lastIndex: 5 })
  }
  expect(() => alias.regex).toThrow()
})

test("copyIn preserves an existing metadata instance at intra-sandbox checkpoints and serializes it only at the public boundary", () => {
  const value = SandboxRegExp.fromState(invalid)
  expect(copyIn(value, "metadata checkpoint", true)).toBe(value)
  const nested = copyIn([value, { pattern: value }], "nested checkpoint", true)
  expect(Array.isArray(nested)).toBe(true)
  if (!Array.isArray(nested)) throw new Error("Expected a copied checkpoint array")
  expect(nested[0]).toBe(value)
  const holder: unknown = nested[1]
  if (typeof holder !== "object" || holder === null) throw new Error("Expected a copied nested holder")
  expect(Reflect.get(holder, "pattern")).toBe(value)
  expect(copyOut(copyIn(value, "public regex value"))).toEqual({})
  expect(copyOut(copyIn([value], "public regex array"))).toEqual([{}])
  expect(coerceToString(value)).toBe("/[/gimsuy")
  expect(Object.keys(value)).toEqual(["regex"])
})

test("defensive copyIn of a real host RegExp uses exposed metadata, resets index and does not recompile", () => {
  const host = /ordinary/g
  // One real host instance has an own source data property. No global constructor or prototype is replaced.
  Object.defineProperty(host, "source", { value: "[" })
  host.lastIndex = 42
  const copied = copyIn(host, "host regex checkpoint", true)
  expect(copied).toBeInstanceOf(SandboxRegExp)
  if (!(copied instanceof SandboxRegExp)) throw new Error("Expected a defensive SandboxRegExp wrapper")
  expect(copied.state()).toEqual({ source: "[", flags: "g", lastIndex: 0 })
  expect(() => copied.regex).toThrow()
  expect(coerceToString(copied)).toBe("/[/g")
  expect(Object.keys(copied)).toEqual(["regex"])
  expect(host.lastIndex).toBe(42)
})

test("native() explicitly materializes valid metadata once, restores index and preserves alias state", () => {
  const value = SandboxRegExp.fromState({ source: "a", flags: "gy", lastIndex: 2 })
  expect(Object.keys(value)).toEqual(["regex"])
  expect(() => value.regex).toThrow()
  const native = value.native()
  expect(native).toBeInstanceOf(RegExp)
  expect(native.source).toBe("a")
  expect(native.flags).toBe("gy")
  expect(native.lastIndex).toBe(2)
  expect(value.native()).toBe(native)
  expect(value.regex).toBe(native)
  expect(native.exec("xxa")?.[0]).toBe("a")
  expect(value.lastIndex).toBe(3)
  value.updateState({ source: "a", flags: "gy", lastIndex: 1 })
  expect(native.lastIndex).toBe(1)
  expect(value.state()).toEqual({ source: "a", flags: "gy", lastIndex: 1 })
  expect(Object.keys(value)).toEqual(["regex"])
})

test("the ordinary untimed constructor retains its native path and existing enumerable key", () => {
  const value = new SandboxRegExp("a", "g")
  expect(value.regex).toBeInstanceOf(RegExp)
  expect(value.native()).toBe(value.regex)
  expect(value.regex.test("a")).toBe(true)
  expect(value.lastIndex).toBe(1)
  expect(Object.keys(value)).toEqual(["regex"])
})

test("the explicit untimed toHostRegex boundary materializes through native() rather than the guarded metadata getter", () => {
  const value = SandboxRegExp.fromState({ source: "a", flags: "g", lastIndex: 2 })
  expect(() => value.regex).toThrow()
  const native = toHostRegex(value, "match", { type: "CallExpression" })
  expect(native).toBe(value.native())
  expect(native.lastIndex).toBe(2)
  expect(native.exec("xxa")?.index).toBe(2)
  expect(value.lastIndex).toBe(3)
})

test("lastIndex remains a getter and does not introduce host writable metadata fields", () => {
  const value = SandboxRegExp.fromState(invalid)
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(value), "lastIndex")
  expect(typeof descriptor?.get).toBe("function")
  expect(descriptor?.set).toBeUndefined()
  expect(Reflect.set(value, "lastIndex", 99)).toBe(false)
  expect(value.lastIndex).toBe(3)
  expect(Object.keys(value)).toEqual(["regex"])
})

for (const assignment of ["r.lastIndex = 3", "r.lastIndex++", "r.lastIndex += 2"]) {
  test(`the actual untimed model still refuses lastIndex assignment: ${assignment}`, async () => {
    const result = await Effect.runPromise(CodeMode.execute({ tools: {}, code: `
      const r = /a/g;
      try { ${assignment}; return { refused: false }; }
      catch { return { refused: true, index: r.lastIndex }; }
    ` }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value).toEqual({ refused: true, index: 0 })
  })
}

test("actual model enumeration/spread keep RegExp opaque despite its internal own regex key", async () => {
  const result = await Effect.runPromise(CodeMode.execute({ tools: {}, code: `
    const r = /a/g; return { keys: Object.keys(r), spread: { ...r }, value: r };
  ` }))
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  expect(result.value).toEqual({ keys: [], spread: {}, value: {} })
})

test("capture reconstruction distinguishes undefined, empty text and exact Unicode text", () => {
  expect(fromWireCapture(absent)).toBeUndefined()
  expect(fromWireCapture(empty)).toBe("")
  expect(fromWireCapture({ kind: "text", value: "😀\u0000\ud800\n" })).toBe("😀\u0000\ud800\n")
})

test("match reconstruction keeps dense undefined captures and an explicit zero UTF-16 index", () => {
  const match = fromWireMatch({ captures: [{ kind: "text", value: "a" }, absent, empty], index: 0 })
  expect(Array.from(match)).toEqual(["a", undefined, ""])
  expect(Object.hasOwn(match, 1)).toBe(true)
  expect(Object.hasOwn(match, "index")).toBe(true)
  expect(Reflect.get(match, "index")).toBe(0)
  expect(Object.hasOwn(match, "groups")).toBe(false)
})

test("match reconstruction preserves absent index/groups versus explicit empty groups", () => {
  const absentGroups = fromWireMatch({ captures: [empty] })
  expect(Object.hasOwn(absentGroups, "index")).toBe(false)
  expect(Object.hasOwn(absentGroups, "groups")).toBe(false)
  const emptyGroups = fromWireMatch({ captures: [empty], groups: {} })
  expect(Object.hasOwn(emptyGroups, "groups")).toBe(true)
  const groups: unknown = Reflect.get(emptyGroups, "groups")
  expect(groups).toEqual({})
  expect(Object.getPrototypeOf(groups)).toBeNull()
})

test("match groups are null-prototype records, preserve undefined/empty and filter every blocked member", () => {
  const wire: Match = { captures: [empty], index: 2, groups: Object.fromEntries([
    ["missing", absent], ["empty", empty], ["word", { kind: "text", value: "😀" }],
    ["constructor", { kind: "text", value: "blocked" }], ["prototype", absent], ["__proto__", empty],
  ] satisfies [string, Capture][]) }
  if (!wire.groups) throw new Error("Expected actual wire groups")
  expect(Object.hasOwn(wire.groups, "__proto__")).toBe(true)
  const match = fromWireMatch(wire)
  const groups: unknown = Reflect.get(match, "groups")
  expect(Object.getPrototypeOf(groups)).toBeNull()
  if (typeof groups !== "object" || groups === null) throw new Error("Expected reconstructed named groups")
  expect(Object.keys(groups)).toEqual(["missing", "empty", "word"])
  expect(Object.hasOwn(groups, "missing")).toBe(true)
  expect(Reflect.get(groups, "missing")).toBeUndefined()
  expect(Reflect.get(groups, "empty")).toBe("")
  expect(Reflect.get(groups, "word")).toBe("😀")
  for (const blocked of ["constructor", "prototype", "__proto__"]) expect(Object.hasOwn(groups, blocked)).toBe(false)
  expect(Reflect.get(match, "index")).toBe(2)
  expect(Object.hasOwn(wire.groups, "constructor")).toBe(true)
})

test("replacement callback arguments use the original parent subject once and preserve UTF-16 offsets/captures", () => {
  const subject = "😀\u0000a\noriginal subject"
  const args = replacementArgs({ match: "a", offset: 3, captures: [absent, empty] }, subject)
  expect(subject.indexOf("a")).toBe(3)
  expect(args).toEqual(["a", undefined, "", 3, subject])
  expect(Object.hasOwn(args, 1)).toBe(true)
  expect(args.filter((value) => value === subject)).toHaveLength(1)
})

test("replacement arguments distinguish absent versus empty groups and filter blocked named captures", () => {
  const subject = "😀a"
  const absentGroups = replacementArgs({ match: "a", offset: 2, captures: [] }, subject)
  const emptyGroups = replacementArgs({ match: "a", offset: 2, captures: [], groups: {} }, subject)
  expect(absentGroups).toEqual(["a", 2, subject])
  expect(emptyGroups).toHaveLength(4)
  expect(emptyGroups.slice(0, 3)).toEqual(absentGroups)
  const emptyNamed = emptyGroups[3]
  if (typeof emptyNamed !== "object" || emptyNamed === null) throw new Error("Expected explicit empty replacement groups")
  expect(Object.getPrototypeOf(emptyNamed)).toBeNull()
  expect(Object.keys(emptyNamed)).toEqual([])
  const args = replacementArgs({ match: "a", offset: 2, captures: [absent], groups: Object.fromEntries([
    ["optional", absent], ["empty", empty], ["constructor", empty], ["prototype", absent], ["__proto__", empty],
  ] satisfies [string, Capture][]) }, subject)
  expect(args.slice(0, 4)).toEqual(["a", undefined, 2, subject])
  const groups = args[4]
  expect(Object.getPrototypeOf(groups)).toBeNull()
  if (typeof groups !== "object" || groups === null) throw new Error("Expected replacement named groups")
  expect(Object.keys(groups)).toEqual(["optional", "empty"])
  expect(Object.hasOwn(groups, "optional")).toBe(true)
  expect(Reflect.get(groups, "optional")).toBeUndefined()
  expect(Reflect.get(groups, "empty")).toBe("")
  expect(args.filter((value) => value === subject)).toHaveLength(1)
})

test("a zero-length replacement uses its actual offset and does not invent captures or groups", () => {
  expect(replacementArgs({ match: "", offset: 2, captures: [] }, "😀")).toEqual(["", 2, "😀"])
  expect(replacementArgs({ match: "", offset: 0, captures: [] }, "")).toEqual(["", 0, ""])
})

test("public copyOut runs after reconstruction, drops array metadata and applies existing undefined policy", () => {
  const match = fromWireMatch({ captures: [{ kind: "text", value: "a" }, absent, empty], index: 2,
    groups: { optional: absent, empty } })
  expect(Reflect.get(match, "index")).toBe(2)
  expect(Object.hasOwn(match, "groups")).toBe(true)
  expect(match[1]).toBeUndefined()
  const ordinary = copyOut(match)
  const normalized = copyOut(match, true)
  expect(ordinary).toEqual(["a", undefined, ""])
  expect(normalized).toEqual(["a", null, ""])
  if (!Array.isArray(ordinary) || !Array.isArray(normalized)) throw new Error("Expected public copied arrays")
  for (const result of [ordinary, normalized]) {
    expect(Object.hasOwn(result, "index")).toBe(false)
    expect(Object.hasOwn(result, "groups")).toBe(false)
  }
  expect(Reflect.get(match, "index")).toBe(2)
  expect(Object.hasOwn(match, "groups")).toBe(true)
})
