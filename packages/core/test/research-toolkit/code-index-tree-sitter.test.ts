import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { CodeIndexTreeSitter } from "../../src/research-toolkit/code-index/tree-sitter"

// T-X5: the structural layer keeps 1-based lines for every definition and import, adds members, nested functions and
// re-exports, and replaces the 1M-character throw with a byte cap reported as a reason.

const run = (path: string, source: string, grammar: "typescript" | "tsx" | "python") =>
  Effect.runPromise(CodeIndexTreeSitter.extract(path, source, grammar))

const SOURCE = `import { a, b as c } from "./x.js"
import * as NS from "@orchestra/core/y"
export * as Self from "./self"
export { q } from "./q"

export const Foo = Schema.Struct({})
export type T = string
enum E { A }
export class K {
  x = 1
  private y = 2
  run() {
    function inner() {}
    const local = 1
  }
}
export namespace N {
  export const z = 1
}
const fn = Effect.fn("x")(function* () {
  const lazy = yield* Effect.promise(() => import("./lazy"))
})
export { fn }
`

describe("code-index tree-sitter", () => {
  test("definitions carry closed 1-based ranges, name lines, containers and export state", async () => {
    const result = await run("a.ts", SOURCE, "typescript")
    const by = Object.fromEntries(result.definitions.map((item) => [item.qualified, item]))
    expect(result.coverage).toEqual({ complete: true })
    expect(result.lines).toBe(23)
    expect(by.Foo).toMatchObject({ kind: "const", startLine: 6, endLine: 6, exported: true })
    expect(by.T).toMatchObject({ kind: "type", startLine: 7, exported: true })
    expect(by.E).toMatchObject({ kind: "enum", startLine: 8, exported: false })
    expect(by.K).toMatchObject({ kind: "class", startLine: 9, endLine: 16, nameLine: 9, exported: true })
    expect(by["K.x"]).toMatchObject({ kind: "property", startLine: 10, exported: true })
    expect(by["K.y"]).toMatchObject({ kind: "property", exported: false })
    expect(by["K.run"]).toMatchObject({ kind: "method", startLine: 12, endLine: 15 })
    expect(by["K.run.inner"]).toMatchObject({ kind: "function", startLine: 13, exported: false })
    expect(by["N.z"]).toMatchObject({ kind: "const", startLine: 18, exported: true })
    expect(by.fn).toMatchObject({ startLine: 20, endLine: 22, exported: true })
    expect(result.definitions[by["K.run"].container!].qualified).toBe("K")
    // Locals inside bodies are not outline entries.
    expect(by["K.run.local"]).toBeUndefined()
    expect(by["fn.lazy"]).toBeUndefined()
  })

  test("imports keep specifier, line and form, re-exports and dynamic imports included", async () => {
    const result = await run("a.ts", SOURCE, "typescript")
    expect(result.imports).toEqual([
      { specifier: "./x.js", line: 1, form: "static", names: ["a", "b"] },
      { specifier: "@orchestra/core/y", line: 2, form: "static", names: ["NS"] },
      { specifier: "./self", line: 3, form: "reexport", names: ["Self"] },
      { specifier: "./q", line: 4, form: "reexport", names: ["q"] },
      { specifier: "./lazy", line: 21, form: "dynamic", names: [] },
    ])
  })

  test("tsx parses JSX components", async () => {
    const result = await run("v.tsx", `export function View() {\n  return <div>{1}</div>\n}\n`, "tsx")
    expect(result.definitions).toEqual([
      { name: "View", qualified: "View", kind: "function", startLine: 1, endLine: 3, nameLine: 1, exported: true },
    ])
  })

  test("python definitions, members and relative imports", async () => {
    const source = `import os, a.b as ab\nfrom .pkg import x, y as z\n\nCONST = 1\n\n@dec\nclass C:\n    attr = 3\n    def m(self):\n        def n(): pass\n\ndef _h(): pass\n`
    const result = await run("m.py", source, "python")
    const by = Object.fromEntries(result.definitions.map((item) => [item.qualified, item]))
    expect(by.C).toMatchObject({ kind: "class", startLine: 6, endLine: 10, nameLine: 7, exported: true })
    expect(by["C.attr"]).toMatchObject({ kind: "property", exported: true })
    expect(by["C.m"]).toMatchObject({ kind: "method", startLine: 9 })
    expect(by["C.m.n"]).toMatchObject({ kind: "function", exported: false })
    expect(by._h).toMatchObject({ exported: false })
    expect(by.CONST).toMatchObject({ kind: "constant", startLine: 4 })
    expect(result.imports).toEqual([
      { specifier: "os", line: 1, form: "static", names: [] },
      { specifier: "a.b", line: 1, form: "static", names: [] },
      { specifier: ".pkg", line: 2, form: "static", names: ["x", "y"] },
    ])
  })

  test("a file over the byte cap is reported, never parsed and never thrown", async () => {
    const result = await run("big.ts", `// ${"x".repeat(CodeIndexTreeSitter.MAX_BYTES)}\n`, "typescript")
    expect(result.coverage).toEqual({ complete: false, reason: "too-large" })
    expect(result.definitions).toEqual([])
  })

  test("a syntax error keeps what parsed but never certifies coverage", async () => {
    const result = await run("bad.ts", `export function ok() {}\nexport const = ;\n`, "typescript")
    expect(result.coverage).toEqual({ complete: false, reason: "partial-parse" })
    expect(result.definitions.map((item) => item.name)).toContain("ok")
  })
})
