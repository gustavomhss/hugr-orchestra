// @atlas/adapter-io — test/escape-classifier.test.ts (#99 sound-negation escape analysis)
//
// Acceptance suite for the tsEscapeClassifier, transcribed FROZEN against a repo-wide tsc escape
// oracle (1135/1135 atlas-export targets, 0 unsound). Pins each proven SAFE/ESCAPE verdict
// individually: `isSafe(node) === true` ⇒ the reference stays a static reference the index sees
// (non-escaping); `false` ⇒ it flows into shared mutable state (escaping). The production escape
// leg (`escape/target-escapes.ts`) drives this SAME classifier over SCIP-range ⋈ tree-sitter
// occurrences and applies the aggregation rule (any non-safe ref ⇒ the symbol escapes), covered
// end-to-end in `escape-assemble.test.ts`. Grammar loaded the same way `ast-parser-lifecycle.test.ts`
// does: directly via web-tree-sitter + `tree-sitter-typescript.wasm`, no eager module-level load.

import { createRequire } from "node:module"
import Parser from "web-tree-sitter"
import { describe, it, expect, beforeAll } from "vitest"
import { tsEscapeClassifier } from "../src/escape/classifier.js"

const require = createRequire(import.meta.url)

type SyntaxNode = Parser.SyntaxNode

const SRC = [
  "import { importedName } from './mod';",
  "fooCallee(1);",
  "new WidgetCtor();",
  "const y: TypeOnlyName = 1 as any;",
  "type T1 = typeof valueInTypeof;",
  "type T2 = ReturnType<typeof valueInTypeof2>;",
  "register(argName);",
  "const z = asOperand as unknown as Foo;",
  "const el = subscriptBase[0];",
].join("\n")

/** Depth-first collection of every `identifier`/`type_identifier` node whose text is `name`,
 *  in source order — so a test can pick the Nth occurrence rather than hand-count columns. */
function findIdentifiers(root: SyntaxNode, name: string): SyntaxNode[] {
  const hits: SyntaxNode[] = []
  const walk = (n: SyntaxNode): void => {
    if ((n.type === "identifier" || n.type === "type_identifier") && n.text === name) hits.push(n)
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i)
      if (c !== null) walk(c)
    }
  }
  walk(root)
  return hits
}

/** Nth (0-based) occurrence of `name`, asserting it exists — keeps call sites destructure-free
 *  and type-clean (findIdentifiers returns an array, not a fixed-length tuple). */
function nthIdentifier(root: SyntaxNode, name: string, n = 0): SyntaxNode {
  const hits = findIdentifiers(root, name)
  const node = hits[n]
  if (node === undefined) throw new Error(`fixture missing occurrence #${n} of "${name}"`)
  return node
}

describe("#99 tsEscapeClassifier — proven SAFE/ESCAPE verdicts", () => {
  let root: SyntaxNode

  beforeAll(async () => {
    await Parser.init()
    const LanguageLoader = (Parser as unknown as { Language: { load(p: string): Promise<unknown> } }).Language
    const TS = await LanguageLoader.load(require.resolve("tree-sitter-typescript/tree-sitter-typescript.wasm"))
    const parser = new Parser()
    parser.setLanguage(TS as Parameters<Parser["setLanguage"]>[0])
    const tree = parser.parse(SRC)
    if (tree === null) throw new Error("fixture failed to parse")
    root = tree.rootNode
  })

  const safe = (name: string, n = 0): boolean => tsEscapeClassifier.isSafe(nthIdentifier(root, name, n))

  it("callee of a call ⇒ SAFE/non-escaping [teeth: drop the call_expression rule ⇒ RED]", () => {
    expect(safe("fooCallee")).toBe(true)
  })

  it("constructor of `new` ⇒ SAFE/non-escaping [teeth: drop the new_expression rule ⇒ RED]", () => {
    expect(safe("WidgetCtor")).toBe(true)
  })

  it("type annotation position (type_identifier) ⇒ SAFE/non-escaping [teeth: drop rule (1) ⇒ RED]", () => {
    expect(safe("TypeOnlyName")).toBe(true)
  })

  it("typeof value in a type position ⇒ SAFE/non-escaping [teeth: drop type_query from TS_TYPE_CTX ⇒ RED]", () => {
    expect(safe("valueInTypeof")).toBe(true)
  })

  it("ReturnType<typeof X> value in a type position ⇒ SAFE/non-escaping", () => {
    expect(safe("valueInTypeof2")).toBe(true)
  })

  it("import binding ⇒ SAFE/non-escaping [teeth: drop import_specifier from TS_LINKAGE ⇒ RED]", () => {
    expect(safe("importedName")).toBe(true)
  })

  it("call argument ⇒ ESCAPE [teeth: mark call_expression args safe ⇒ RED]", () => {
    expect(safe("argName")).toBe(false)
  })

  it(
    "operand of `X as T` ⇒ ESCAPE — the critical regression case (TS_TYPE_CTX must NOT contain " +
      "as_expression/satisfies_expression) [teeth: add as_expression to TS_TYPE_CTX ⇒ RED]",
    () => {
      expect(safe("asOperand")).toBe(false)
    },
  )

  it("subscript/element-access base ⇒ ESCAPE [teeth: mark subscript_expression object safe ⇒ RED]", () => {
    expect(safe("subscriptBase")).toBe(false)
  })
})
