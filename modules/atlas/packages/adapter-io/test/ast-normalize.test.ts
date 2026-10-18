// @atlas/adapter-io — test/ast-normalize.test.ts  (#233 · #99 — the grammar-gap parse rescue)
//
// TEETH for `normalizeForGrammarGaps` + its use inside `parseTsDoc`. The pinned tree-sitter-typescript@0.23.2
// cannot parse three constructs Atlas's own source uses (`export type *`, `import('…').T[]`, a NUL delimiter
// byte), so `parseTsDoc` fail-closed the whole file — the #99 M3 bench measured ~38 recall points lost to it.
// The rescue is LENGTH-PRESERVING (SCIP ranges stay aligned) and SOUND (each construct is type-only or a
// string interior — provably not a value channel/escape), and it preserves the `hasError` re-check for
// EVERYTHING ELSE. These tests pin exactly that, including the soundness-critical non-mangling of a real
// dynamic channel adjacent to a rescued construct.

import { describe, it, expect, beforeAll } from "vitest"
import Parser from "web-tree-sitter"
import { createRequire } from "node:module"
import { initAst, parseTsDoc, normalizeForGrammarGaps } from "../src/ast.js"
import { buildDynamicReach } from "../src/escape/dynamic-reach.js"
import type { FileTree } from "@atlas/index"

const require = createRequire(import.meta.url)
const NUL = String.fromCharCode(0)

let TS: Parameters<Parser["setLanguage"]>[0]
const parses = (src: string): boolean => {
  const p = new Parser()
  p.setLanguage(TS)
  const t = p.parse(src)
  const ok = !t.rootNode.hasError
  t.delete()
  p.delete()
  return ok
}

describe("#233 normalizeForGrammarGaps — length-preserving rescue of the three grammar gaps", () => {
  beforeAll(async () => {
    await Parser.init()
    const Loader = (Parser as unknown as { Language: { load(p: string): Promise<typeof TS> } }).Language
    TS = await Loader.load(require.resolve("tree-sitter-typescript/tree-sitter-typescript.wasm"))
  })

  const gaps: ReadonlyArray<{ name: string; raw: string }> = [
    { name: "export type *", raw: "export type * from './x';\n" },
    { name: "export type * as ns", raw: "export type * as ns from './x';\n" },
    { name: "import().T[]", raw: "export interface I { readonly x: import('@atlas/k').Foo[]; }\n" },
    { name: "NUL delimiter", raw: "export const k = `a" + NUL + "b" + NUL + "c`;\n" },
  ]

  it("each gap does NOT parse raw but DOES parse after normalize [teeth: drop a rule ⇒ RED]", () => {
    for (const g of gaps) {
      expect(parses(g.raw), `${g.name} should FAIL raw (grammar gap)`).toBe(false)
      expect(parses(normalizeForGrammarGaps(g.raw)), `${g.name} should PARSE after normalize`).toBe(true)
    }
  })

  it("normalize is LENGTH-PRESERVING for every gap (SCIP ranges stay aligned)", () => {
    for (const g of gaps) expect(normalizeForGrammarGaps(g.raw).length, g.name).toBe(g.raw.length)
  })

  it("normalize leaves ORDINARY code byte-identical (no accidental rewrite)", () => {
    const ordinary =
      "import { a } from './a';\nexport const f = () => eval(x);\nconst y = arr[0];\ntype T = import('x').Foo;\n"
    expect(normalizeForGrammarGaps(ordinary)).toBe(ordinary)
  })

  it("SOUNDNESS: a real dynamic channel is NOT mangled by the rescue — `import(var)` and `ns[k]` survive", () => {
    // the import-type regex requires a STRING-LITERAL specifier + `.Ident[]`; a dynamic `import(spec)` value
    // call has neither, so it is untouched. A computed `ns[k]` is untouched. Both must still read as channels.
    const src =
      "export type * from './t';\nconst spec = x;\nexport const a = import(spec);\nimport * as ns from './m';\nexport const c = ns[key]();\n"
    expect(normalizeForGrammarGaps(src)).toContain("import(spec)") // channel bytes intact
    expect(normalizeForGrammarGaps(src)).toContain("ns[key]")
  })
})

describe("#233 parseTsDoc — the 3 gaps now parse, but EVERYTHING ELSE still fail-closes", () => {
  beforeAll(async () => {
    await initAst()
  })

  it("parseTsDoc RESCUES a file that mixes all three gaps (was undefined, now a ParsedDoc)", () => {
    const src =
      "export type * from './t';\nexport interface I { x: import('k').Foo[]; }\nexport const s = `a" + NUL + "b`;\n"
    const doc = parseTsDoc("src/x.ts", src)
    expect(doc).toBeDefined()
    doc?.dispose()
  })

  it(
    "parseTsDoc STILL fail-closes on an UNRELATED unparseable construct (re-check preserved) [teeth: " +
      "remove the hasError gate ⇒ RED]",
    () => {
      // a genuinely broken file the rescue does not touch ⇒ still undefined (fail-closed).
      expect(parseTsDoc("src/x.ts", "export const = = = ;\n")).toBeUndefined()
    },
  )

  it(
    "SOUNDNESS end-to-end: a real `eval` channel in a file that ALSO has `export type *` is STILL detected " +
      "(the rescue makes the file parse; the channel is not lost)",
    async () => {
      const tree: FileTree = {
        path: ".",
        children: [
          {
            path: "src/pay/x.ts",
            children: [],
            content: "export type * from './t';\nexport const d = eval(userInput);\n",
          },
        ],
      }
      const dr = buildDynamicReach(tree)!
      const wits = dr("src/pay")
      expect(wits.some((w) => w.endsWith("eval"))).toBe(true) // the real channel survived the rescue
      expect(wits.some((w) => w.endsWith(":unparsed"))).toBe(false) // and the file is no longer a fail-close
    },
  )
})
