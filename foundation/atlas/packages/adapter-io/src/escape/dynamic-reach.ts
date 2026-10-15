// @atlas/adapter-io — src/escape/dynamic-reach.ts  (ADR-0016 M2b — the `dynamicReach` closure leg)
//
// Builds the `dynamic-reach(S)` leg the negation door's v2 gate consumes (`NegationEmitDeps.dynamicReach`). A
// door-local tree-sitter scan of every TS/TSX source file for the FIVE opaque-dispatch channels — the ones
// through which S could reach a target X at runtime with NO emitted SCIP occurrence, defeating the
// occurrence-based escape/reverse-caller closure. Per-file channel witnesses are precomputed ONCE; then
// `dynamicReach(scope)` = the UNION of channel witnesses in files UNDER `scope`, on the SAME `underScope`
// containment the door uses for `∩ S` (`anchor-scope.ts`). `[]` ⇒ "scanned S, found no channel".
//
// THE CHANNEL SET (ADR-0016 §Decision / §Soundness 3, HARDENED in M2b's cold-review fix round — every
// narrowing that could silently miss an opaque reach was turned into fail-closed or widened):
//   1. `import(nonliteral)`     — a `call_expression` whose `function` is the `import` keyword and whose first
//                                 argument is NOT a string literal (a literal specifier is statically resolvable).
//   2. `require(nonliteral)`    — a call whose CALLEE NAME is `require` (identifier `require(x)` OR member
//                                 `module.require(x)` / `globalThis.require(x)`) with a non-string-literal arg.
//   3. `ns ESCAPES`             — a namespace-import binding (`import * as ns`) whose reference is NOT a SAFE
//                                 static access. SAFE = `ns.member` (static property) or `ns['literal']` — both
//                                 emit a visible occurrence for the member. UNSAFE (a channel) = ANY other
//                                 position: `ns[expr]` (computed), `ns` passed as an argument (`f(ns)`,
//                                 `Reflect.get(ns,k)`), assigned, or computed-destructured (`const {[k]:x}=ns`).
//                                 This SUBSUMES the old syntactic `ns[nonliteral]` (the lucy false-admit) AND its
//                                 siblings — every form where a member of `ns` is reached with NO occurrence for
//                                 that member. It over-abstains a scope that merely passes `ns` around (rare); that
//                                 is the sound direction. NB: the generic `tsEscapeClassifier` is NOT reused here —
//                                 it treats a member/subscript BASE as escape, which would flag safe static
//                                 `ns.foo` and destroy recall; the `nsRefIsSafe` predicate below is the ns-specific rule.
//   4. `eval(...)`              — a call whose CALLEE NAME is `eval` (identifier or member `globalThis.eval`).
//   5. `new Function(...)`      — a `new_expression` whose constructor's trailing name is `Function`.
//
// FAIL-CLOSED: a TS/TSX file we cannot read/parse is ITSELF a channel witness (`[]` must mean "scanned and
// found none", never "did not scan"). A JS-FAMILY file (`.js`/`.jsx`/`.mjs`/`.cjs`) under S is a JS runtime
// file that CAN host all five constructs but this door parses only the TS grammar, so it is fail-closed as a
// channel (never silently skipped — the module used to claim "a non-TS file cannot host a channel", which is
// FALSE for the JS family; cold-review finding #1). A genuinely other-language file (`.py`/`.rb`/…) cannot host
// a JS/TS runtime channel and is skipped. Enablement is ALSO gated to the scip-typescript indexer in
// `target-escapes.ts` (both-or-neither wiring), so on a non-TS indexer the whole v2 gate falls back to the blanket.
//
// DOCUMENTED RESIDUAL (soundy boundary, stated per honestidade — NOT silently narrowed): the scan sees only the
// files `walkFileTree` yields (git-tracked + readable). A negation is a claim about the COMMITTED/indexed tree,
// so an untracked working-copy file is out of the model by construction; a tracked-but-UNREADABLE file is a
// whole-index degrade (SCIP cannot see it either), not an M2b-specific hole.

import type { FileTree } from "@atlas/index"
import { underScope } from "../anchor-scope.js"
import { astWarmed, isTsPath, parseTsDoc } from "../ast.js"
import { isSymlinkLeaf } from "../fs.js"
import type Parser from "web-tree-sitter"

type SyntaxNode = Parser.SyntaxNode

/** `true` iff `path` is a JS-FAMILY source (`.js`/`.jsx`/`.mjs`/`.cjs`) — a JS runtime file that CAN host the
 *  five dynamic constructs but is NOT parsed by this door's TS grammar, so it is fail-closed as a channel
 *  (finding #1) rather than skipped like a genuinely other-language file. */
function isJsFamilyPath(path: string): boolean {
  return path.endsWith(".js") || path.endsWith(".jsx") || path.endsWith(".mjs") || path.endsWith(".cjs")
}

/** The trailing identifier NAME of a call/new callee — `f` for `f(…)`, `require` for `module.require(…)`,
 *  `eval` for `globalThis.eval(…)`, `Function` for `new x.Function(…)`. `undefined` when the callee is not an
 *  identifier or member-expression (e.g. a computed/parenthesised callee — those are handled by the ns-escape
 *  leg when the base is a namespace binding, and are otherwise not one of the named channels). */
function calleeName(callee: SyntaxNode | null): string | undefined {
  if (callee === null) return undefined
  if (callee.type === "identifier") return callee.text
  if (callee.type === "member_expression") return callee.childForFieldName("property")?.text
  return undefined
}

/** Is a REFERENCE of a namespace-import binding `ns` a SAFE static access (⇒ a visible occurrence for the
 *  member, no opaque reach)? SAFE only for `ns.member` (static property) and `ns['literal']`; EVERY other
 *  position (computed subscript, argument, assignment RHS, destructuring source, …) reaches a member of `ns`
 *  with no occurrence for that member and is therefore a dynamic-reach channel. */
function nsRefIsSafe(node: SyntaxNode): boolean {
  const p = node.parent
  if (p === null) return false
  // `ns.member` — node is the OBJECT of a static (non-computed) member access.
  if (p.type === "member_expression" && p.childForFieldName("object")?.id === node.id) return true
  // `ns['literal']` — node is the OBJECT of a subscript whose index is a string literal.
  if (p.type === "subscript_expression" && p.childForFieldName("object")?.id === node.id) {
    return p.childForFieldName("index")?.type === "string"
  }
  return false
}

/** One source file leaf (repo-relative POSIX path + its exact bytes) — collected from the walked `FileTree`. */
interface Leaf {
  readonly path: string
  readonly content: string
}

/** Collect the non-symlink file leaves (a node with `content` and no children). Symlink leaves are skipped —
 *  their `content` is a link-target path, not a program (mirrors `ast.ts` `refine`). */
function fileLeaves(tree: FileTree, out: Leaf[]): void {
  if (isSymlinkLeaf(tree)) return
  if (tree.content !== undefined && tree.children.length === 0) {
    out.push({ path: tree.path, content: tree.content })
    return
  }
  for (const child of tree.children) fileLeaves(child, out)
}

/** Preorder walk applying `visit` to every named node. */
function walk(node: SyntaxNode, visit: (n: SyntaxNode) => void): void {
  visit(node)
  for (const child of node.namedChildren) walk(child, visit)
}

/** The first NAMED argument of a call node, or `undefined` (an empty/absent arg list). */
function firstArg(call: SyntaxNode): SyntaxNode | undefined {
  return call.childForFieldName("arguments")?.namedChildren[0]
}

/** `true` iff the call's first argument is NOT a string literal — an empty/absent arg counts as non-literal
 *  (fail-closed: `import()`/`require()` with a computed or missing specifier is not statically resolvable). */
function nonLiteralArg(call: SyntaxNode): boolean {
  const arg = firstArg(call)
  return arg === undefined || arg.type !== "string"
}

/** Scan one parsed doc for the channels; returns the witness strings (`relpath:line:col:kind`). */
function scanChannels(relp: string, root: SyntaxNode): string[] {
  // Pass 1 — the namespace-import bindings in this file (`import * as ns from '…'` ⇒ `ns`). Channel #3 fires on
  // ANY unsafe reference of one of THESE (a plain object's `o[k]` reaches no module symbol, so it is ignored).
  const nsBindings = new Set<string>()
  walk(root, (n) => {
    if (n.type === "namespace_import") {
      const id = n.namedChildren.find((c) => c.type === "identifier")
      if (id !== undefined) nsBindings.add(id.text)
    }
  })

  const wit: string[] = []
  const site = (n: SyntaxNode, kind: string): string =>
    `${relp}:${n.startPosition.row + 1}:${n.startPosition.column + 1}:${kind}`

  walk(root, (n) => {
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function")
      if (fn?.type === "import") {
        if (nonLiteralArg(n)) wit.push(site(n, "import-nonliteral")) // channel #1
        return
      }
      const name = calleeName(fn) // channels #2 (require) / #4 (eval), identifier OR member callee form.
      if (name === "require") {
        if (nonLiteralArg(n)) wit.push(site(n, "require-nonliteral"))
      } else if (name === "eval") {
        wit.push(site(n, "eval"))
      }
    } else if (n.type === "new_expression") {
      if (calleeName(n.childForFieldName("constructor")) === "Function") wit.push(site(n, "new-Function")) // #5
    } else if (n.type === "identifier" && nsBindings.has(n.text) && !nsRefIsSafe(n)) {
      // channel #3 — a namespace binding referenced in a non-safe position (computed subscript, argument,
      // assignment, destructuring source, …): a member of `ns` is reachable with no occurrence for it. The
      // `namespace_import` DECLARATION site (`import * as ns`) is itself a `nsRefIsSafe`=false identifier whose
      // parent is `namespace_import`; exclude it explicitly so the import does not self-report as a channel.
      if (n.parent?.type !== "namespace_import") wit.push(site(n, "ns-escape"))
    }
  })
  return wit
}

/**
 * Build the `dynamicReach` leg over the walked `FileTree`, or `undefined` when it cannot be constructed
 * SOUNDLY (AST grammars not warmed — an un-warmed process parses nothing, so an empty result would be an
 * unsound "no channel"). `undefined` ⇒ the caller wires NEITHER v2 leg (the door falls back to the sound blanket).
 */
export function buildDynamicReach(tree: FileTree): ((scope: string) => readonly string[]) | undefined {
  if (!astWarmed()) return undefined
  const leaves: Leaf[] = []
  fileLeaves(tree, leaves)

  const byFile = new Map<string, string[]>() // relpath → channel witnesses (only files that HAVE a channel)
  for (const leaf of leaves) {
    if (!isTsPath(leaf.path)) {
      // A JS-family file CAN host every channel but this door parses only the TS grammar ⇒ FAIL-CLOSED as a
      // channel (finding #1). A genuinely other-language file (`.py`/…) cannot host a JS/TS channel ⇒ skipped.
      if (isJsFamilyPath(leaf.path)) byFile.set(leaf.path, [`${leaf.path}:0:0:js-unscanned`])
      continue
    }
    const parsed = parseTsDoc(leaf.path, leaf.content)
    if (parsed === undefined) {
      byFile.set(leaf.path, [`${leaf.path}:0:0:unparsed`]) // FAIL-CLOSED: unread/unparsed TS file IS a channel.
      continue
    }
    try {
      const wit = scanChannels(leaf.path, parsed.root)
      if (wit.length > 0) byFile.set(leaf.path, wit)
    } finally {
      parsed.dispose()
    }
  }

  return (scope: string): readonly string[] => {
    const out: string[] = []
    for (const [relp, wits] of byFile) if (underScope(relp, scope)) out.push(...wits)
    return out.sort()
  }
}
