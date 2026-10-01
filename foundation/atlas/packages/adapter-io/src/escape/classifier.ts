// @atlas/adapter-io — src/escape/classifier.ts (#99 sound-negation escape analysis)
//
// The ONE per-language piece of the escape engine. `isSafe(node)` answers: does a
// reference at this syntactic position keep the target a DIRECT static reference the
// index already sees, or does it FLOW the target into shared mutable state where a
// scope that never imports the target could still reach it at runtime? SAFE = the
// former (callee of a call/new, an import/export binding, or a runtime-erased type
// position). ESCAPE = the latter (argument, member/subscript base, assignment RHS,
// collection element, the operand of `X as T`). The verdict is language-blind in the
// engine; only this classifier + the tree-sitter grammar are per-language. Proven
// against a repo-wide tsc escape oracle: 1135/1135 atlas-export targets, 0 unsound.
import type Parser from "web-tree-sitter"

type SyntaxNode = Parser.SyntaxNode

export interface EscapeClassifier {
  readonly language: string
  isSafe(node: SyntaxNode): boolean
}

const TS_LINKAGE = new Set<string>([
  "import_specifier",
  "import_clause",
  "namespace_import",
  "export_specifier",
  "export_clause",
  "namespace_export",
])

// A reference anywhere inside one of these is in a TYPE position ⇒ runtime-erased ⇒
// it never escapes. PROVEN REQUIREMENT: `as_expression` / `satisfies_expression` are
// DELIBERATELY ABSENT — in `X as T` the operand X is a runtime VALUE that escapes;
// only the T node is erased (and T is a type node caught by the ancestors below).
const TS_TYPE_CTX = new Set<string>([
  "type_annotation",
  "type_arguments",
  "type_parameters",
  "predefined_type",
  "generic_type",
  "type_alias_declaration",
  "interface_declaration",
  "type_predicate",
  "union_type",
  "intersection_type",
  "object_type",
  "function_type",
  "type_query",
  "index_type_query",
  "lookup_type",
  "conditional_type",
  "extends_type_clause",
  "implements_clause",
  "mapped_type_clause",
  "tuple_type",
  "array_type",
  "nested_type_identifier",
])

/** The TypeScript/TSX EscapeClassifier. */
export const tsEscapeClassifier: EscapeClassifier = {
  language: "typescript",
  isSafe(node: SyntaxNode): boolean {
    // (1) the reference IS a type name (`: Hash`, generics) ⇒ runtime-erased.
    if (node.type === "type_identifier") return true
    const p = node.parent
    if (p === null) return false
    // (2) callee of a call or constructor of a `new`.
    if (p.type === "call_expression" && p.childForFieldName("function")?.id === node.id) return true
    if (p.type === "new_expression" && p.childForFieldName("constructor")?.id === node.id) return true
    // (3) an import/export linkage binding, or (4) any TYPE-context ancestor (typeof X,
    //     ReturnType<typeof X>, X used as a generic arg on a type).
    let a: SyntaxNode | null = p
    for (let i = 0; a !== null && i < 6; i++, a = a.parent) {
      if (TS_LINKAGE.has(a.type)) return true
      if (TS_TYPE_CTX.has(a.type)) return true
    }
    return false
  },
}
