import { expect, test } from "bun:test"
import { failure } from "./fixture/assert"

test("PAR01 strict JSON preserves data and rejects duplicates, extensions and unsafe numbers", async () => {
  const { parse } = await import("../src/parse")
  expect(parse('{"name":"ação","count":1,"value":null}', "json"))
    .toEqual({ ok: true, value: { name: "ação", count: 1, value: null } })
  ;[
    '{"name":1,"name":2}', '{"name":1,"na\\u006de":2}', '{"x":{"a":1,"a":2}}',
    '{"x":1,}', '{/* no */"x":1}', '', 'undefined', '{"n":1e999}', '{"n":9007199254740993}',
    '{"n":NaN}', '{"x":1} {"x":2}',
  ].forEach((value) => {
    const result = parse(value, "json")
    failure(result)
  })
})

test("PAR02 YAML is data only, with no aliases, tags, duplicate keys or multiple documents", async () => {
  const { parse } = await import("../src/parse")
  expect(parse('name: ação\ncount: 1\nvalues: [true, null, "2"]', "yaml"))
    .toEqual({ ok: true, value: { name: "ação", count: 1, values: [true, null, "2"] } })
  ;[
    'a: &one [1]\nb: *one', 'a: &unused 1', 'a: !custom value', 'a: !!js/function "x"',
    'a: 1\na: 2', 'a: 1\n---\nb: 2', 'a: .inf', 'a: .nan', 'a: 9007199254740993',
    'a: !!set {x: null}', 'a: !!timestamp 2026-11-04', 'a: !!binary YWJj', '? [a, b]\n: value', '1: value',
  ].forEach((value) => failure(parse(value, "yaml")))
  expect(parse('text: "!custom &anchor *alias <script>run()</script>"', "yaml"))
    .toEqual({ ok: true, value: { text: "!custom &anchor *alias <script>run()</script>" } })
})

test("PAR03 direct admission does not execute accessors or toJSON and rejects non-JSON graphs", async () => {
  const { admit } = await import("../src/parse")
  const calls: string[] = []
  const getter = Object.defineProperty({}, "data", { enumerable: true, get: () => { calls.push("get"); return 1 } })
  const cyclic: { value?: unknown } = {}
  cyclic.value = cyclic
  const sparse = Array(2)
  const arrayGetter = Object.defineProperty([0], "0", { enumerable: true, get: () => { calls.push("array"); return 1 } })
  class Custom { value = 1 }
  ;[getter, { nested: getter }, arrayGetter, { nested: { toJSON: () => { calls.push("nested-json"); return {} } } },
    { toJSON: () => { calls.push("json"); return {} } }, cyclic, sparse, { x: undefined },
    { x: 1n }, { x: () => 1 }, new Date(), new Custom(), { x: Infinity }, { x: NaN },
    { x: Number.MAX_SAFE_INTEGER + 1 }, { x: Symbol("data") }, undefined, () => 1, Symbol("data"), 1n,
  ].forEach((value) => failure(admit(value)))
  const deep = Array.from({ length: 10000 }).reduce<unknown>((value) => [value], 0)
  failure(admit(deep))
  expect(calls).toEqual([])
  expect(admit({ a: [1, true, null], b: "<script>inert</script>" }))
    .toEqual({ ok: true, value: { a: [1, true, null], b: "<script>inert</script>" } })
})

test("PAR04 admission enforces UTF-8, depth and effective-output limits without echoing payload", async () => {
  const { admit, parse } = await import("../src/parse")
  const nest = (levels: number): unknown => Array.from({ length: levels - 1 }).reduce<unknown>((value) => [value], {})
  expect(admit(nest(16)).ok).toBe(true)
  expect(admit(nest(17)).ok).toBe(false)
  expect(admit({ a: [{ b: 1 }] }, { maxDepth: 3 }).ok).toBe(true)
  failure(admit({ a: [{ b: 1 }] }, { maxDepth: 2 }))
  expect(parse('{"a":[{"b":1}]}', "json", { maxDepth: 3 }).ok).toBe(true)
  failure(parse('{"a":[{"b":1}]}', "json", { maxDepth: 2 }))
  expect(parse('a: [{b: 1}]', "yaml", { maxDepth: 3 }).ok).toBe(true)
  failure(parse('a: [{b: 1}]', "yaml", { maxDepth: 2 }))
  failure(parse("[".repeat(10000) + "0" + "]".repeat(10000), "json"))
  failure(parse("[".repeat(10000) + "0" + "]".repeat(10000), "yaml"))
  expect(parse('"' + "a".repeat(262142) + '"', "json").ok).toBe(true)
  expect(parse('"' + "a".repeat(262143) + '"', "json").ok).toBe(false)
  expect(parse('"' + "é".repeat(131071) + '"', "json").ok).toBe(true)
  expect(parse('"' + "é".repeat(131072) + '"', "json").ok).toBe(false)
  expect(parse('a: "' + "x".repeat(200000) + '"', "yaml", { maxBytes: 32 }).ok).toBe(false)
  expect(admit({ a: 1 }, { maxBytes: 7, maxDepth: 1 }).ok).toBe(true)
  expect(admit({ a: 1 }, { maxBytes: 6, maxDepth: 1 }).ok).toBe(false)
  ;[0, -1, 1.5, Infinity, NaN].forEach((maxBytes) => expect(admit({}, { maxBytes }).ok).toBe(false))
  ;[0, -1, 1.5, Infinity, NaN].forEach((maxDepth) => expect(admit({}, { maxDepth }).ok).toBe(false))
  ;[0, -1, 1.5, Infinity, NaN].forEach((value) => {
    failure(parse("{}", "json", { maxBytes: value }))
    failure(parse("{}", "yaml", { maxDepth: value }))
  })
  expect(admit(nest(17), { maxDepth: 1000 }).ok).toBe(false)
  expect(parse('"' + "x".repeat(262143) + '"', "json", { maxBytes: 1048576 }).ok).toBe(false)
  expect(parse('a: "\\u0000"', "yaml", { maxBytes: 12 }).ok).toBe(false)
  failure(parse("[".repeat(17) + "0" + "]".repeat(17), "json", { maxDepth: 1000 }))
  failure(parse("[".repeat(17) + "0" + "]".repeat(17), "yaml", { maxDepth: 1000 }))
  failure(parse('"' + "x".repeat(262143) + '"', "yaml", { maxBytes: 1048576 }))
  expect(parse('"' + "é".repeat(131071) + '"', "yaml").ok).toBe(true)
  failure(parse('"' + "é".repeat(131072) + '"', "yaml"))
  const expansion = '"' + "\\0".repeat(43691) + '"'
  expect(parse('"\\0"', "yaml")).toEqual({ ok: true, value: "\0" })
  expect(parse('"' + "\\0".repeat(43690) + '"', "yaml")).toEqual({ ok: true, value: "\0".repeat(43690) })
  failure(parse(expansion, "yaml"))
  failure(parse(expansion, "yaml", { maxBytes: 1048576 }))
  ;(["json", "yaml"] as const).forEach((format) => {
    expect(parse(" ".repeat(6) + "{}", format, { maxBytes: 8 }).ok).toBe(true)
    failure(parse(" ".repeat(7) + "{}", format, { maxBytes: 8 }))
    failure(parse(" ".repeat(262143) + "{}", format))
    failure(parse(" ".repeat(262143) + "{}", format, { maxBytes: 1048576 }))
    expect(parse("{}", format, { maxBytes: 1048576, maxDepth: 1000 }).ok).toBe(true)
    ;[0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1].forEach((limit) => {
      failure(parse("{}", format, { maxBytes: limit }))
      failure(parse("{}", format, { maxDepth: limit }))
    })
  })
  failure(admit("a".repeat(262143), { maxBytes: 1048576 }))
  expect(admit("é", { maxBytes: 4 }).ok).toBe(true)
  failure(admit("é", { maxBytes: 3 }))
  const result = parse('{"secret":"DO_NOT_ECHO","secret":"other"}', "json")
  expect(JSON.stringify(result)).not.toContain("DO_NOT_ECHO")
})
