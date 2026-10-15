// @atlas/adapter-io — test/ast-gap2-doc-comment.test.ts   (ADR-0014 — GAP-2: bound leading doc-comment)
//
// Acceptance suite for ADR-0014 (ratified 2026-08-09): a unit's grounded bytes are extended upward over its
// BOUND leading doc-comment — the maximal run of `comment` nodes CONTIGUOUS with the declaration (no blank
// line), scanned from the `export`/`export default`/decorated outer node, for BOTH item and block units.
// The rule is decided by CONTIGUITY, not file position: a comment separated by ≥1 blank line (the
// conventional header) is NOT bound and stays FRESH; a contiguous comment — including one at file top on the
// first declaration — IS documentation and DRIFTS the unit when edited.
//
// This closes the symbol/block-frontier drift blind spot: before this, a fact derived from a declaration's
// leading doc-comment was anchored to a unit whose subtreeHash excluded that comment, so a comment-only
// invalidating edit read FRESH. Each golden below folds the ORIGINAL and a MUTATED source through the SAME
// shipped pipeline (`build(foldAstUnits())`) and compares the anchored unit's real `subtreeHash`:
//   • hash CHANGED  ≡ the drift oracle would report DRIFTED (`driftDetect` is subtreeHash-equality, drift.ts)
//   • hash SAME     ≡ FRESH
//
//   • G-GAP2-1   item: edit the bound leading doc-comment ⇒ DRIFTED (the fix; RED before ADR-0014)
//   • G-GAP2-1b  block: edit a method's own leading JSDoc ⇒ DRIFTED (the block-granularity half)
//   • G-GAP2-2   a BLANK-LINE-separated header ⇒ FRESH (contiguity broken; SCN-GROUND-5b family preserved)
//   • G-GAP2-2b  a CONTIGUOUS file-top comment on the first decl ⇒ DRIFTED (no file-position exception)
//   • G-GAP2-3   an import added above (blank-line-separated) ⇒ FRESH (not a comment; must not regress)
//   • G-GAP2-4   a comment separated by a blank line ⇒ not bound; editing it ⇒ FRESH
//   • G-GAP2-7   a comment between two decls binds to the FOLLOWING one (deterministic; pinned choice)
//   • G-GAP2-8   a doc-comment above `export default` and above a decorated class is attached

import { describe, it, expect, beforeAll } from "vitest"
import { build } from "@atlas/index"
import type { Axes } from "@atlas/index"
import { foldAstUnits, initAst } from "../src/ast.js"

const NO_SCIP = { documents: [] }
const axesOf = (src: string): Axes =>
  build(
    foldAstUnits({
      path: ".",
      children: [{ path: "src", children: [{ path: "src/u.ts", children: [], content: src }] }],
    }),
    NO_SCIP,
  )

const keys = (n: { key: string; children: readonly unknown[] }, out: string[] = []): string[] => {
  out.push(n.key)
  for (const c of n.children as { key: string; children: readonly unknown[] }[]) keys(c, out)
  return out
}
const nodeAt = (
  n: { key: string; subtreeHash?: string; children: readonly unknown[] },
  key: string,
): { subtreeHash?: string } | undefined => {
  if (n.key === key) return n
  for (const c of n.children as { key: string; subtreeHash?: string; children: readonly unknown[] }[]) {
    const h = nodeAt(c, key)
    if (h) return h
  }
  return undefined
}
/** The subtreeHash of the FIRST unit key containing `needle` (a `::`-qualified unit), or undefined. */
const unitHash = (src: string, needle: string): string | undefined => {
  const ax = axesOf(src)
  const key = keys(ax.spatial as { key: string; children: readonly unknown[] }).find(
    (k) => k.includes("::") && k.includes(needle),
  )
  return key
    ? nodeAt(ax.spatial as { key: string; subtreeHash?: string; children: readonly unknown[] }, key)?.subtreeHash
    : undefined
}
/** DRIFTED ≡ the anchored unit's subtreeHash changed between `a` and `b`; both must resolve. */
const drifts = (needle: string, a: string, b: string): boolean => {
  const ha = unitHash(a, needle)
  const hb = unitHash(b, needle)
  expect(ha, `unit ${needle} must resolve in original`).toBeTruthy()
  expect(hb, `unit ${needle} must resolve in mutated`).toBeTruthy()
  return ha !== hb
}

describe("ADR-0014 — a unit is grounded WITH its bound leading doc-comment", () => {
  beforeAll(async () => {
    await initAst()
  })

  it("G-GAP2-1 (item): editing the bound leading doc-comment DRIFTS the item", () => {
    const original = "/** returns one */\nexport function foo() { return 1; }"
    const mutated = "/** returns two, was one */\nexport function foo() { return 1; }"
    expect(drifts("foo", original, mutated)).toBe(true)
  })

  it("G-GAP2-1b (block): editing a method’s own leading JSDoc DRIFTS the block", () => {
    const original = 'export class Bar {\n  /** greets in English */\n  greet() { return "hi"; }\n}'
    const mutated = 'export class Bar {\n  /** greets in French now */\n  greet() { return "hi"; }\n}'
    expect(drifts("method_definition:0:greet", original, mutated)).toBe(true)
  })

  it("G-GAP2-2 (header, blank-line-separated): editing it stays FRESH", () => {
    const original = "/** file header */\n\nexport function foo() { return 1; }"
    const mutated = "/** file header, edited */\n\nexport function foo() { return 1; }"
    expect(drifts("foo", original, mutated)).toBe(false)
  })

  it("G-GAP2-2b (contiguous file-top comment): editing it DRIFTS the first unit — no file-position exception", () => {
    const original = "/** @module first */\nexport function first() { return 1; }"
    const mutated = "/** @module first, edited */\nexport function first() { return 1; }"
    expect(drifts("first", original, mutated)).toBe(true)
  })

  it("G-GAP2-3 (import above, blank-line-separated): stays FRESH (not a comment; SCN-GROUND-5b)", () => {
    const original = "export function foo() { return 1; }"
    const mutated = "import { z } from 'zod';\n\nexport function foo() { return 1; }"
    expect(drifts("foo", original, mutated)).toBe(false)
  })

  it("G-GAP2-4 (blank-line boundary): a comment separated by a blank line is not bound — editing it stays FRESH", () => {
    const original = "/** distant note */\n\nexport function foo() { return 1; }"
    const mutated = "/** distant note, changed */\n\nexport function foo() { return 1; }"
    expect(drifts("foo", original, mutated)).toBe(false)
  })

  it("G-GAP2-7 (following-decl binding): a between-decls comment binds to the FOLLOWING declaration", () => {
    // Editing `// note` must drift `b` (it binds forward) and NOT `a`.
    const original = "export function a() { return 1; }\n// note\nexport function b() { return 2; }"
    const mutated = "export function a() { return 1; }\n// note changed\nexport function b() { return 2; }"
    expect(drifts("function_declaration:0:b", original, mutated), "binds to following b").toBe(true)
    expect(drifts("function_declaration:0:a", original, mutated), "does not bind to preceding a").toBe(false)
  })

  it("G-GAP2-8 (export default / decorator): a leading doc-comment is attached through the outer wrapper", () => {
    const ed0 = "/** default export */\nexport default function foo() { return 1; }"
    const ed1 = "/** default export, edited */\nexport default function foo() { return 1; }"
    expect(drifts("foo", ed0, ed1), "export default").toBe(true)
    const dc0 = "/** the widget */\n@Component()\nexport class Foo {}"
    const dc1 = "/** the widget, edited */\n@Component()\nexport class Foo {}"
    expect(drifts("Foo", dc0, dc1), "decorated class").toBe(true)
  })
})
