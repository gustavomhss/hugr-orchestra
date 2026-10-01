// @atlas/knowledge — src/evaluator.ts  (WP-5.16.KNOW · EPIC-16 predicate check-engine)
//
// The pure predicate-check evaluator (KNOW-16). A `PredicateNode.check` evaluates to HOLDS/BROKEN/NA
// from Atlas-INDEX state ALONE — a deterministic query over one structural/dependency axis, or a pinned
// declarative assertion — with NO arbitrary code execution, NO sandbox, NO clock/IO (same index state ⇒
// same verdict, REQ-KNOW-16a/16b/16d). A check needing runtime/behavioral execution is OUT OF SCOPE for
// v0 and is REFUSED at admission so the fact stays advisory (REQ-KNOW-16c) — as is, since WP-FIX-6.KNOW
// (#200), a check of an EVALUABLE kind whose body is not a sentence of the grammar below (REQ-KNOW-16a):
// `admit` used to switch on `kind` and never read `query`/`expr` at all. The verdict is packaged to
// feed `atlas-reconcile` (REQ-KNOW-16e). Both node families are live day-one — the predicate family is
// not deferred (REQ-KNOW-9a) — and the evaluator is an OPTIONAL, standalone module: with none wired the
// store operates on advisory nodes alone (REQ-KNOW-9b, the frozen `StoreApi.evaluator?` seam).
//
// SEAM: implements the FROZEN `EvaluatorApi` (types.ts, ≥2-consumer: here + StoreApi) over the pinned
// `Check` union (types.ts); types-only imports of the sealed lower layers; NO raw hashing, NO code-exec path.
//
// [FLAG — indexState granularity] The frozen `EvaluatorApi.evaluate` pins `indexState` to a single
// lower-layer `@atlas/index` `IndexNode` (DAG-safe). The reference prose says "over the Atlas index
// (structural/dependency AXES)" — plural — which may be the multi-axis root set (`Axes`). Honored as the
// pinned single `IndexNode` (the caller selects the axis root); re-flagged for the reference to confirm.
//
// [FLAG — v0 query grammar not frozen] KNOW-16 names the two legs ("a deterministic index-query" / "a
// pinned declarative assertion") but freezes NO concrete query grammar. The minimal, pipe-delimited,
// declarative surface below (`exists|absent|has-object` and `child-count|subtree-hash`) is the honest v0
// interpreter — purely a function of the passed `IndexNode`, with no code-exec fallback (an unrecognized
// query yields NA, never a shell-out). Flagged as a build-ahead choice, NOT a frozen contract.

import type { Status } from "@atlas/contracts"
import type { NodeKey } from "@atlas/contracts"
import type { IndexNode } from "@atlas/index"
import type { Check, EvaluatorApi } from "../types.js"

/**
 * The evaluator verdict — the 3-state subset of `Status` the evaluator can yield. The `'advisory'`
 * member of `Status` is NOT an evaluator verdict: a runtime-requiring check is refused to advisory
 * UPSTREAM (see `admit`), never returned here. `Verdict` is assignable to `Status`, so an
 * `(check, indexState) => Verdict` function satisfies the frozen `EvaluatorApi.evaluate` signature.
 */
export type Verdict = Extract<Status, "HOLDS" | "BROKEN" | "NA">

// ── admission gate (REQ-KNOW-16b / 16c) ──────────────────────────────────────
//
// A proposed check the gate classifies. The evaluable legs mirror the frozen `Check` union; the
// non-evaluable legs are the runtime / arbitrary-code-execution proposals the gate REFUSES — those never
// become a `Check`, so the fact stays `advisory` and `evaluate` is never reached (no code executes).

/** A raw proposed check fed to the admission gate — evaluable (`Check`) or runtime-requiring. */
export type ProposedCheck =
  | Check
  | { readonly kind: "code-exec"; readonly script: string }
  | { readonly kind: "runtime"; readonly behavior: string }

/**
 * The admission verdict: an evaluable `Check` (→ predicate) or a refusal (→ stays advisory).
 *
 * There are two kinds of refusal and they answer different questions. `code-exec` / `runtime` are about
 * the KIND — the proposal asks for a mechanism this evaluator does not have (REQ-KNOW-16b/16c).
 * `malformed-check` is about the TEXT — the leg is one of the two evaluable kinds, but its body is not a
 * sentence of the language `evaluate` speaks. It carries `expected` because a door that only says "no"
 * makes the author bisect their own string; `expected` names the operator forms and quotes back what was
 * read (SCN-KNOW-16a-3).
 */
export type Admission =
  | { readonly evaluable: true; readonly check: Check }
  | { readonly evaluable: false; readonly reason: "code-exec" | "runtime" }
  | { readonly evaluable: false; readonly reason: "malformed-check"; readonly expected: string }

/**
 * Classify a proposed check (KNOW-16). A deterministic index-query or a pinned declarative assertion is
 * EVALUABLE — but only if it PARSES: `kind` alone was never enough. A proposal requiring arbitrary code
 * execution / a sandbox (REQ-KNOW-16b) or runtime / behavioral execution (REQ-KNOW-16c) is REFUSED for its
 * kind; a proposal of an evaluable kind whose body is outside the shipped grammar is REFUSED for its text
 * (REQ-KNOW-16a — a check MUST be a deterministic query over the index, and a string that names no operator
 * is not one). Either way the fact stays advisory and `evaluate` is never reached. Pure + total.
 *
 * WHY THE TEXT LEG EXISTS (measured, `evaluator.admit-grammar.test.ts`). An unparseable body does not fail
 * loudly downstream — the interpreter's fallbacks turn it into a verdict nobody computed:
 *   · `'type-checker/LSP diagnostics: contract'` → no operator → `NA` on every index state, forever;
 *   · `'child-count|mod:auth|'`   → `Number('')` is `0` → `HOLDS` on any node with no children;
 *   · `'child-count|k|three'`     → `Number('three')` is `NaN`, and `n === NaN` is false → `BROKEN`, always.
 * The last two are the reason this is fail-closed (A3) rather than a lint: a `BROKEN` reaches the
 * `atlas-reconcile` merge gate (REQ-KNOW-16e), and blocking a merge on an assertion that was never
 * evaluated is exactly the failure this door now refuses to launder.
 */
export function admit(proposed: ProposedCheck): Admission {
  switch (proposed.kind) {
    case "index-query":
    case "assertion": {
      const expected = whyUnparseable(proposed)
      return expected === null
        ? { evaluable: true, check: proposed }
        : { evaluable: false, reason: "malformed-check", expected }
    }
    case "code-exec":
      return { evaluable: false, reason: "code-exec" }
    case "runtime":
      return { evaluable: false, reason: "runtime" }
    default: {
      const _exhaustive: never = proposed
      return _exhaustive
    }
  }
}

// ── the shipped grammar, in ONE place (I3) ────────────────────────────────────
//
// The door and the interpreter read the SAME table and use the SAME split. That is deliberate: a door
// written against a private copy of the grammar is a door that can narrow the language by drifting, and
// the whole point of admitting on the text is that what is admitted is exactly what `evaluate` can run.

/** The five shipped operators and the form each one takes, by leg. The `<…>` forms are the refusal
 *  message — an operator reading "expected `child-count|<key>|<non-negative integer>`" can fix the string
 *  without opening this file. Adding a member here is a grammar change, not a message change. */
const QUERY_FORMS = {
  exists: "exists|<key>",
  absent: "absent|<key>",
  "has-object": "has-object|<hash>",
} as const
const ASSERTION_FORMS = {
  "child-count": "child-count|<key>|<non-negative integer>",
  "subtree-hash": "subtree-hash|<key>|<hash>",
} as const

const formsOf = (t: Record<string, string>): string => Object.values(t).join(" · ")

/** The query leg's split: the operator, then EVERYTHING after the FIRST `|` as the argument — so a key
 *  that itself contains a `|` survives intact. Shared with `evalQuery`: one split, one language. */
function splitQuery(query: string): { readonly op: string; readonly arg: string } {
  const bar = query.indexOf("|")
  return { op: (bar === -1 ? query : query.slice(0, bar)).trim(), arg: bar === -1 ? "" : query.slice(bar + 1).trim() }
}

/** The assertion leg's split: `|`-delimited, every part trimmed. Shared with `evalAssertion`. */
function splitAssertion(expr: string): readonly string[] {
  return expr.split("|").map((p) => p.trim())
}

/** A child count is a NON-NEGATIVE INTEGER in decimal. Deliberately not `Number(v) >= 0`, which accepts
 *  `''` (coerces to `0`), `'2.5'`, `'0x2'` and `'1e3'` — and the first of those is precisely the input that
 *  used to fabricate a `HOLDS` on any node with no children. */
const COUNT = /^\d+$/

/**
 * Parse a `Check` against the shipped grammar. `null` ⇒ it parses; otherwise the message the door serves.
 *
 * STRICTER THAN THE INTERPRETER, ON PURPOSE, AND ONLY WHERE THE INTERPRETER LIES. `evalAssertion`
 * destructures the first three parts and ignores any beyond, and `evalQuery` accepts an empty argument —
 * both yield a verdict for input that means nothing. Refusing those here narrows nothing a caller could
 * have meant: every one of the twelve shipped operator/verdict pairs is still admitted and still evaluates
 * to the same verdict, pinned by SCN-KNOW-16a-3 before this function existed.
 */
function whyUnparseable(check: Check): string | null {
  if (check.kind === "index-query") {
    const { op, arg } = splitQuery(check.query)
    const form = (QUERY_FORMS as Record<string, string>)[op]
    if (form === undefined)
      return `an index-query must name one of ${formsOf(QUERY_FORMS)} — read ${JSON.stringify(check.query)}`
    if (arg === "") return `${form} takes one non-empty argument — read ${JSON.stringify(check.query)}`
    return null
  }
  const parts = splitAssertion(check.expr)
  const [op = "", key = "", value = ""] = parts
  const form = (ASSERTION_FORMS as Record<string, string>)[op]
  if (form === undefined)
    return `an assertion must name one of ${formsOf(ASSERTION_FORMS)} — read ${JSON.stringify(check.expr)}`
  if (parts.length !== 3)
    return `${form} takes exactly two arguments, got ${parts.length - 1} — read ${JSON.stringify(check.expr)}`
  if (key === "") return `${form} needs a non-empty <key> — read ${JSON.stringify(check.expr)}`
  if (op === "child-count" && !COUNT.test(value))
    return `${form} needs a non-negative decimal integer count — read ${JSON.stringify(check.expr)}`
  if (op === "subtree-hash" && value === "")
    return `${form} needs a non-empty <hash> — read ${JSON.stringify(check.expr)}`
  return null
}

// ── the pure interpreter (REQ-KNOW-16a / 16d) ─────────────────────────────────

/** DFS lookup by `key` over the index subtree — pure, deterministic, no IO. First match wins (keys are
 *  unique per axis; the walk order is fixed by `children`, so the result is index-state-determined). */
function findNode(root: IndexNode, key: string): IndexNode | undefined {
  if (root.key === key) return root
  for (const child of root.children) {
    const hit = findNode(child, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** True iff any node in the subtree carries `hash` in its `objects` — pure, deterministic. */
function hasObject(root: IndexNode, hash: string): boolean {
  if (root.objects.some((o) => String(o) === hash)) return true
  return root.children.some((c) => hasObject(c, hash))
}

/** Interpret a deterministic index-query leg. Unrecognized ⇒ `NA` (never a code-exec fallback).
 *
 *  This `NA` is still REACHABLE and still pinned (SCN-KNOW-16a-1 evaluates `'unrecognized-op|x'` directly):
 *  `evaluate` implements the FROZEN `EvaluatorApi` and is callable on any `Check`, `admit` or no `admit`.
 *  What changed is that a check which came THROUGH `admit` can no longer land here — the door refuses the
 *  unrecognized form first. Uses the shared `splitQuery`, so the door cannot narrow what this accepts. */
function evalQuery(query: string, root: IndexNode): Verdict {
  const { op, arg } = splitQuery(query)
  switch (op) {
    case "exists":
      return findNode(root, arg) !== undefined ? "HOLDS" : "BROKEN"
    case "absent":
      return findNode(root, arg) === undefined ? "HOLDS" : "BROKEN"
    case "has-object":
      return hasObject(root, arg) ? "HOLDS" : "BROKEN"
    default:
      return "NA"
  }
}

/** Interpret a pinned declarative assertion leg over index-derived quantities. TWO distinct `NA`s live
 *  here and only one of them survives the door: a MISSING SUBJECT (`findNode` misses — the assertion does
 *  not apply to this index state) is the legitimate one and is reachable through `admit`; an UNRECOGNIZED
 *  FORM is the other, still reachable by calling `evaluate` directly (as the frozen `EvaluatorApi` allows
 *  and SCN-KNOW-16a-1 does), but no longer by anything the door let through. Uses the shared
 *  `splitAssertion`. */
function evalAssertion(expr: string, root: IndexNode): Verdict {
  const [op, key, value] = splitAssertion(expr)
  if (op === "child-count" && key !== undefined && value !== undefined) {
    const node = findNode(root, key)
    if (node === undefined) return "NA"
    return node.children.length === Number(value) ? "HOLDS" : "BROKEN"
  }
  if (op === "subtree-hash" && key !== undefined && value !== undefined) {
    const node = findNode(root, key)
    if (node === undefined) return "NA"
    return String(node.subtreeHash) === value ? "HOLDS" : "BROKEN"
  }
  return "NA"
}

/**
 * Evaluate a `Check` against index state (KNOW-16). Deterministic + pure — no code-exec, no clock, no
 * IO; same `(check, indexState)` ⇒ same `Verdict`. Yields exactly one of `HOLDS | BROKEN | NA`.
 */
export function evaluate(check: Check, indexState: IndexNode): Verdict {
  return check.kind === "index-query" ? evalQuery(check.query, indexState) : evalAssertion(check.expr, indexState)
}

/** The FROZEN `EvaluatorApi` implementation (types.ts). Standalone + OPTIONAL — the store wires
 *  it only for the predicate family; with none wired, advisory nodes operate alone (REQ-KNOW-9b). */
export function makeEvaluator(): EvaluatorApi {
  return { evaluate }
}

// ── feed the verdict to atlas-reconcile (REQ-KNOW-16e) ────────────────────────
//
// The evaluator does NOT run the reconcile (excluded — frozen in CAMPAIGN-4). It packages the verdict so
// the reconcile input CARRIES it: a `BROKEN` predicate verdict reaches the merge gate, never dropped.

/** A packaged evaluator verdict keyed by the predicate node — the carrier the reconcile input consumes. */
export interface VerdictFeed {
  readonly node: NodeKey
  readonly verdict: Verdict
}

/** Evaluate a predicate's check and package the verdict for the `atlas-reconcile` feed (REQ-KNOW-16e). */
export function verdictFor(node: NodeKey, check: Check, indexState: IndexNode): VerdictFeed {
  return { node, verdict: evaluate(check, indexState) }
}
