// harness/probes/a2-corpus/index.mjs — the labeled A2 (staleness) perturbation corpus.
//
// Each entry names a single anchored unit in a single-file TS fixture, a base state (committed as rev A),
// a mutated state (committed as rev B), and the EXPECTED drift verdict `reDerives` must report for a fact
// grounded at that unit at A, re-checked at B. `harness/probes/a2-staleness.mjs` drives every entry through
// the real `createRevIndex`/`reDerives` oracle (packages/adapter-io/src/rev-index.ts) — this file supplies
// no logic, only labeled fixtures.
//
// TWO disjoint classes, per the PR-probe list (docs/design/95b-staleness-a2-methodology.md):
//   - 'preserving'   — the edit must NOT invalidate the anchored unit's cited fact. Expected verdict FRESH.
//     A `true` here is a FALSE-STALE if `reDerives` instead reports drifted.
//   - 'invalidating' — the edit DOES change what the anchored unit says. Expected verdict DRIFTED. A `true`
//     invalidating case where `reDerives` reports FRESH is a TRUE-STALE MISS (the dangerous direction: a
//     fact that is now false keeps reading as trustworthy).
//
// `anchor` is either `{ file }` (the fact is grounded on the WHOLE FILE unit — its qualifiedPath is simply
// the file's own repo-relative path) or `{ needle }` (the fact is grounded on a SUB-FILE item/block unit;
// the harness locates it in `axesAt(A)` by the unique `::`-qualified key ENDING in `:${needle}` — the same
// trailing-name-component convention `ast-gap2-doc-comment.test.ts` uses, so a corpus entry never has to
// hardcode the exact ordinal-bearing key format `unitPath` mints in `ast.ts`).
//
// NOT IN THIS CORPUS: any callee/interface-fold case (the shipped oracle's `driftDetect` folds ONLY the
// local anchor's own subtreeHash — GROUND-11's interface-fold, `freshness()`, has zero production callers
// and is excluded by design; see the methodology doc). NEGATIONS are also excluded — their drift trigger
// carries a 5th signal (edge-model version) this corpus does not model; every entry below is a POSITIVE
// (`predicate`-shaped) grounding.

/** @typedef {{
 *   id: string,
 *   class: 'preserving' | 'invalidating',
 *   description: string,
 *   file: string,
 *   base: string,
 *   mutated: string,
 *   anchor: { file: true } | { needle: string },
 *   expected: 'FRESH' | 'DRIFTED',
 *   note?: string,
 * }} CorpusEntry
 */

/** @type {CorpusEntry[]} */
export const CORPUS = [
  // ── PRESERVING — expect FRESH; a DRIFTED verdict here is a false-stale ──────────────────────────────
  {
    id: "P1-import-added-above",
    class: "preserving",
    description: "a line/import added ABOVE the anchored unit does not touch its own bytes",
    file: "src/u.ts",
    base: "export function foo() { return 1; }\n",
    mutated: "import { z } from 'zod';\n\nexport function foo() { return 1; }\n",
    anchor: { needle: "foo" },
    expected: "FRESH",
  },
  {
    id: "P2-header-separated-by-blank-line",
    class: "preserving",
    description:
      "a license/comment header separated from the decl by a blank line is NOT bound to it (ADR-0014 contiguity rule) — editing the header stays FRESH",
    file: "src/u.ts",
    base: "/** file header */\n\nexport function foo() { return 1; }\n",
    mutated: "/** file header, edited */\n\nexport function foo() { return 1; }\n",
    anchor: { needle: "foo" },
    expected: "FRESH",
  },
  {
    id: "P3-sibling-unit-edited",
    class: "preserving",
    description:
      "editing a SIBLING top-level unit elsewhere in the file does not touch the anchored unit — each item/block is hashed independently",
    file: "src/u.ts",
    base: "export function a() { return 1; }\n\nexport function b() { return 2; }\n",
    mutated: "export function a() { return 1; }\n\nexport function b() { return 99; }\n",
    anchor: { needle: "a" },
    expected: "FRESH",
  },
  {
    id: "P4-unicode-nfd-to-nfc",
    class: "preserving",
    description:
      "a pure Unicode NFD→NFC rewrite of the unit bytes does not drift — the kernel canonicalForm NFC-normalizes before hashing (KERNEL-1, drift.ts)",
    file: "src/u.ts",
    base: 'export function foo() { return "café"; }\n', // é as ONE precomposed codepoint (NFC)
    mutated: 'export function foo() { return "café"; }\n', // e + COMBINING ACUTE ACCENT (NFD) — same text, different bytes
    anchor: { needle: "foo" },
    expected: "FRESH",
    note: "MEASURED distinct byte lengths (5 vs 6) pre-normalization; see the spike in the probe module header.",
  },

  // ── INVALIDATING — expect DRIFTED; a FRESH verdict here is a true-stale MISS ────────────────────────
  {
    id: "I1-in-unit-byte-change",
    class: "invalidating",
    description: "a real in-unit byte change: the returned constant 42 → 43",
    file: "src/u.ts",
    base: "export function foo() { return 42; }\n",
    mutated: "export function foo() { return 43; }\n",
    anchor: { needle: "foo" },
    expected: "DRIFTED",
  },
  {
    id: "I2-whitespace-reformat-inside-unit",
    class: "invalidating",
    description:
      "a whitespace reformat INSIDE the unit — driftDetect applies no whitespace normalization, so re-indenting drifts (drift.ts)",
    file: "src/u.ts",
    base: "export function foo() {\n  return 1;\n}\n",
    mutated: "export function foo() { return 1; }\n",
    anchor: { needle: "foo" },
    expected: "DRIFTED",
  },
  {
    id: "I3-comment-reindent-inside-unit",
    class: "invalidating",
    description:
      "an inline comment INSIDE the unit is re-indented — still a real byte change inside the anchored range",
    file: "src/u.ts",
    base: "export function foo() {\n  // note\n  return 1;\n}\n",
    mutated: "export function foo() {\n    // note\n  return 1;\n}\n",
    anchor: { needle: "foo" },
    expected: "DRIFTED",
  },
  {
    id: "I4-contiguous-leading-doc-comment-item",
    class: "invalidating",
    description:
      "a CONTIGUOUS leading JSDoc edit on an item — ADR-0014's bound-doc-comment extension: the item's grounded bytes include its own contiguous doc-comment (real-parser path, transcribed from ast-gap2-doc-comment.test.ts G-GAP2-1)",
    file: "src/u.ts",
    base: "/** returns one */\nexport function foo() { return 1; }\n",
    mutated: "/** returns two, was one */\nexport function foo() { return 1; }\n",
    anchor: { needle: "foo" },
    expected: "DRIFTED",
  },
  {
    id: "I5-contiguous-leading-doc-comment-block",
    class: "invalidating",
    description:
      "a CONTIGUOUS leading JSDoc edit on a BLOCK (a method's own doc-comment) — the block-granularity half of ADR-0014 (transcribed from ast-gap2-doc-comment.test.ts G-GAP2-1b)",
    file: "src/u.ts",
    base: 'export class Bar {\n  /** greets in English */\n  greet() { return "hi"; }\n}\n',
    mutated: 'export class Bar {\n  /** greets in French now */\n  greet() { return "hi"; }\n}\n',
    anchor: { needle: "greet" },
    expected: "DRIFTED",
  },
  {
    id: "I6-rename-of-cited-symbol",
    class: "invalidating",
    description:
      "renaming the cited symbol re-keys its unit path, so the fact's ORIGINAL anchor.qualifiedPath no longer resolves in the mutated tree — unresolvable is DRIFTED, fail-closed (GROUND-3, drift.ts)",
    file: "src/u.ts",
    base: "export function foo() { return 1; }\n",
    mutated: "export function fooRenamed() { return 1; }\n",
    anchor: { needle: "foo" },
    expected: "DRIFTED",
  },
]
