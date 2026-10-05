// @atlas/adapter-io — test/ast-parser-lifecycle.test.ts  (#211 — WASM-handle lifecycle in the AST fold)
//
// `itemsOf` (ast.ts) mints `new Parser()` per parsed TS/TSX file and gets a `Tree` back. Both are HANDLES
// into the web-tree-sitter WASM heap: GC of the JS wrapper frees NOTHING — only an explicit `.delete()`
// does. Before #211's fix neither was deleted, so a long-lived process (`createRevIndex` builds a fresh
// index per rev, N per process) leaked one Parser + one Tree per parsed file WITHOUT BOUND. This suite
// pins that every parse releases its Tree handle (the fix's `finally` also releases the Parser).
//
// MEASURED, and the reason this is a leak fix and NOT a hash-corruption fix: the leak does NOT corrupt a
// subtreeHash (web-tree-sitter 0.23 re-derives its heap views per access), so `build(foldAstUnits(...))`
// was already byte-stable across dozens of builds. The "wrong hash after ~24 builds / false-DRIFTED" framing
// of #211 did not reproduce; the real defect in this path is the unbounded handle leak, fixed here.

import { createRequire } from "node:module"
import Parser from "web-tree-sitter"
import { describe, it, expect, beforeAll } from "vitest"
import type { FileTree } from "@atlas/index"
import { foldAstUnits, initAst } from "../src/ast.js"

const require = createRequire(import.meta.url)

describe("#211 — every parsed file releases its Tree handle (no unbounded WASM leak)", () => {
  let TreeProto: { delete(): void }

  beforeAll(async () => {
    await initAst() // load the ast.ts grammar singletons so foldAstUnits actually parses (not a no-op)
    // Obtain the concrete `Tree` prototype from a throwaway parse — `Tree.prototype.delete` is writable +
    // configurable (unlike the frozen `Parser.prototype.parse`), so it is the seam we can count on.
    const LanguageLoader = (Parser as unknown as { Language: { load(p: string): Promise<unknown> } }).Language
    const TS = await LanguageLoader.load(require.resolve("tree-sitter-typescript/tree-sitter-typescript.wasm"))
    const probe = new Parser()
    probe.setLanguage(TS as Parameters<Parser["setLanguage"]>[0])
    const dummy = probe.parse("const x = 1;\n") as unknown as { delete(): void } | null
    TreeProto = Object.getPrototypeOf(dummy) as { delete(): void }
    ;(dummy as { delete(): void } | null)?.delete()
    probe.delete()
  })

  it("foldAstUnits deletes one Tree per parsed TS file [teeth: drop the finally ⇒ 0 deletes ⇒ RED]", () => {
    let treeDeletes = 0
    const origTreeDelete = TreeProto.delete
    TreeProto.delete = function (this: { delete(): void }) {
      treeDeletes += 1
      return origTreeDelete.apply(this)
    }
    try {
      const tree: FileTree = {
        path: ".",
        children: [
          {
            path: "src",
            children: [
              { path: "src/a.ts", children: [], content: "export function a() {\n  return 1;\n}\n" },
              { path: "src/b.ts", children: [], content: "export const b = () => 2;\n" },
              { path: "src/c.ts", children: [], content: "export class C {\n  m() {\n    return 3;\n  }\n}\n" },
            ],
          },
        ],
      }
      const out = foldAstUnits(tree)
      // Sanity: the fold actually refined (so the parsers really ran, not a warmup no-op).
      const src = out.children.find((c) => c.path === "src")
      const a = src?.children.find((c) => c.path === "src/a.ts")
      expect(a?.children.length).toBeGreaterThan(0)
    } finally {
      TreeProto.delete = origTreeDelete
    }

    // Three parseable TS files ⇒ exactly three Tree lifecycles, each released.
    expect(treeDeletes).toBe(3)
    // MUTANT: remove the `finally { tree?.delete(); parser?.delete(); }` block in ast.ts ⇒ 0 ⇒ RED.
  })
})
