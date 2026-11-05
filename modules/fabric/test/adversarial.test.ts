import { expect, test } from "bun:test"
import { catalog, document } from "./fixture/declaration"
import { failure } from "./fixture/assert"

test("ADV01 compiler defaults cannot expand an admitted declaration beyond the output budget", async () => {
  const { admit } = await import("../src/parse")
  const { compile } = await import("../src/declaration")
  const value = document()
  const small = { ...value, tools: [{ ...value.tools[0], id: "x".repeat(1000) }], bindings: [] }
  const large = { ...value, tools: [{ ...value.tools[0], id: "x".repeat(100000) }], bindings: [] }
  expect(admit(small).ok).toBe(true)
  expect(admit(large).ok).toBe(true)
  expect(compile(small, catalog).ok).toBe(true)
  const result = compile(large, catalog)
  failure(result)
  if (!result.ok) expect(result.diagnostics.some((diagnostic) => diagnostic.code === "limit")).toBe(true)
})

test("ADV02 inherited names are data, never implicit ports or availability labels", async () => {
  const { compile } = await import("../src/declaration")
  const value = document()
  expect(compile({ ...value, bindings: [value.bindings[0]] }, catalog).ok).toBe(true)
  ;["__proto__", "constructor", "toString"].forEach((id) => {
    const result = compile({ ...value, tools: [{ ...value.tools[0], id }], bindings: [] }, catalog, {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.hasOwn(result.availability, id)).toBe(true)
    expect(result.availability[id]).toBe("unverified")
    expect(result.document.layout.overrides.activeTab?.main).toBe(id)
    ;[
      { binding: { from: { tool: "runs", port: id }, to: { tool: "logs", port: "execution" } }, path: "/bindings/0/from" },
      { binding: { from: { tool: "runs", port: "selected" }, to: { tool: "logs", port: id } }, path: "/bindings/0/to" },
    ].forEach((entry) => {
      const invalid = compile({ ...value, bindings: [entry.binding] }, catalog)
      failure(invalid)
      if (!invalid.ok) expect(invalid.diagnostics).toContainEqual({ path: entry.path, code: "invalid-input", messageKey: "fabric.declaration.binding" })
    })
  })
})

test("ADV03 cumulative encoded bytes fail before visiting an out-of-budget tail", async () => {
  const { admit } = await import("../src/parse")
  expect(admit(["x".repeat(29), "y".repeat(28)], { maxBytes: 64 })).toEqual({ ok: true, value: ["x".repeat(29), "y".repeat(28)] })
  // Each string fits by itself. Aggregate bytes exceed 64 at index 1, before
  // the non-JSON tail; this distinguishes incremental accounting from a late stringify.
  const result = admit(["x".repeat(29), "y".repeat(29), undefined], { maxBytes: 64 })
  failure(result)
  if (!result.ok) expect(result.diagnostics[0]).toMatchObject({ path: "/1", code: "limit" })
  failure(admit(Array(16).fill("x".repeat(128)), { maxBytes: 1024 }))
})

test("ADV04 parsed scalar failures preserve escaped JSON pointers", async () => {
  const { admit, parse } = await import("../src/parse")
  ;[
    admit({ "a/b~c": Number.MAX_SAFE_INTEGER + 1 }),
    parse('{"a/b~c":9007199254740992}', "json"),
    parse('a/b~c: .inf', "yaml"),
  ].forEach((result) => {
    failure(result)
    if (!result.ok) expect(result.diagnostics[0]?.path).toBe("/a~1b~0c")
  })
})

test("ADV05 incremental accounting agrees with the JSON engine on escapes and Unicode boundaries", async () => {
  const { admit, parse } = await import("../src/parse")
  ;[
    null, true, false, -0, 0.25, 1e-7, -1.5, "é", "🙂", "\ud800", "\udc00",
    "\0\b\t\n\f\r\u001f\"\\", "\u007f\u0080\u07ff\u0800\ud7ff\ue000\uffff", "\ud800x\udc00",
    Array.from({ length: 32 }, (_, index) => String.fromCharCode(index)).join(""),
    { "a🙂\ud800": [false, "é"] }, [true, false, null, 0.125],
  ].forEach((value) => {
    // The engine is an independent oracle over tiny trusted fixture values,
    // never an attempt to serialize the untrusted graph under test.
    const encoded = JSON.stringify(value)
    const maxBytes = new TextEncoder().encode(encoded).length
    expect(admit(value, { maxBytes })).toEqual({ ok: true, value })
    failure(admit(value, { maxBytes: maxBytes - 1 }))
    expect(parse(encoded, "json", { maxBytes })).toEqual({ ok: true, value: JSON.parse(encoded) })
  })
})

test("ADV06 an over-budget key is rejected before constructing its escaped diagnostic path", async () => {
  const { admit } = await import("../src/parse")
  const result = admit({ ["/".repeat(4096)]: 0 }, { maxBytes: 64 })
  failure(result)
  if (!result.ok) expect(result.diagnostics[0]).toMatchObject({ path: "", code: "limit" })
  const calls: string[] = []
  ;[
    Object.defineProperty({}, "/".repeat(4096), { enumerable: true, get: () => { calls.push("get"); return 0 } }),
    Object.defineProperty({}, "/".repeat(4096), { enumerable: false, value: 0 }),
  ].forEach((record) => {
    const invalid = admit(record, { maxBytes: 64 })
    failure(invalid)
    if (!invalid.ok) expect(invalid.diagnostics[0]).toMatchObject({ path: "", code: "limit" })
  })
  expect(calls).toEqual([])
  const value = admit({ "a/b~c": "x".repeat(64) }, { maxBytes: 64 })
  failure(value)
  if (!value.ok) expect(value.diagnostics[0]).toMatchObject({ path: "/a~1b~0c", code: "limit" })
})
