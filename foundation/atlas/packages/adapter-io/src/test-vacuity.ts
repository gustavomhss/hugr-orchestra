// @atlas/adapter-io — src/test-vacuity.ts  (#95 — the `test-vacuity` structural PROVEN shape, oracle)
//
// SHIPPED (WP-TV-1a): the reachable PRODUCER (`test-vacuity-source.ts`) VALUE-imports `scanTestVacuity` to walk
// HEAD test units, seal every proven fact through genesis's authority (`trySoundTestVacuity`) and persist it
// through the governed test-vacuity door; the read-side reverify (`reverify-store.ts`) re-runs it at HEAD. So
// this module is no longer a declared reference model — it moved dead → live (its ledger entry was DELETED).
// It is measured + unit-tested (0-false-admit on 14 planted soundness rails; 32 real assertion-only-in-catch
// tests proven on zod v3.23.8, hand-verified). The compose+CLI wiring and the e2e bench are ALSO shipped:
// the composition root exposes the producer/read legs (`compose-test-vacuity.ts`, `governed-emit-test-vacuity.ts`)
// behind the CLI's `atlas test-vacuity` / `atlas test-vacuities` commands, and the judge-free planted A4 bench
// (`test-vacuity-bench.test.ts`, reported in `harness/probes/adjudicate/calibration-report.a4-test-vacuity.md`)
// measured falseAdmit 0/10 and recallTrue 10/10 across four framework families.
//
// A PURE, TOTAL AST oracle: PROVE / ABSTAIN on the SYNTACTIC property "in this test, every assertion-shaped
// call is lexically inside a `catch` clause, and there is no assertion-count guard" — the fragile
// assertion-only-in-catch pattern (`try { …can-reject… } catch (e) { expect(e)… }`): if the `try` body
// completes WITHOUT throwing, the `catch` never runs and the test passes with no visible assertion executed.
// This is the exact vacuous-test smell Atlas's own #114 audit found in five of its tests, and the highest-
// leverage `NEW_SHAPE` the #95 zod shape-census surfaced (~9 of 21 structural advisory claims).
//
// WHAT THIS FACT IS (and is NOT). The proven fact is SYNTACTIC and re-derivable from the unit's AST alone:
// "the ONLY assertion-shaped calls in test T's body sit inside `catch` clauses, and T carries no
// `expect.assertions(...)` / `expect.hasAssertions()` guard." It is NOT a runtime claim that a vacuous
// execution is reachable (that would need to know whether the `try` body can complete normally — a semantic,
// cross-procedural question no AST oracle can settle). The fact flags the fragile SHAPE; it does not assert
// the bug fires. Framed this way it is 0-false-admit by construction — see the soundness rails.
//
// SOUNDNESS RAILS (violating any is a false-admit — the whole point):
//   · OVER-DETECT assertions. Missing an assertion that sits on the success path (in the `try` body, or at
//     top level outside any try) would FALSELY prove the property. So `isAssertionShaped` is deliberately
//     BROAD (any `expect`/`assert*` callee, any `.toX`/`.rejects`/`.resolves`/`.should`/`.throw*` matcher
//     chain). Over-detection only ever moves a test from PROVEN to ABSTAIN — the safe direction.
//   · ANY assertion-shaped call OUTSIDE a `catch` (in the try body, in a `finally`, or bare) ⇒ ABSTAIN. A
//     `finally` runs on the success path too, so an assertion there is NOT catch-only.
//   · An `expect.assertions(n)` / `expect.hasAssertions()` guard anywhere in the body ⇒ ABSTAIN (the test
//     DOES defend against the non-throwing path; the shape is not fragile).
//   · A `try` block that itself GUARDS the success path — a trailing `throw` or a `fail()`-shaped call after
//     the can-reject operation — is NOT fragile: if the operation does not throw, the manual `throw`/`fail`
//     re-enters the `catch`, so the assertion always runs. ANY `throw_statement` or `fail()`-shaped call
//     inside a `try` block ⇒ ABSTAIN. (Missing this is a false-admit — the `try { op(); throw new Error() }
//     catch { expect… }` idiom is a correctly-guarded test, not a vacuous one.)
//   · No `catch` clause holding an assertion, or no assertion at all ⇒ ABSTAIN (a different shape).
//   · A parameterised / modified test call (`test.each`, `it.skip`, computed callee) or a callback that is
//     not a plain function/arrow with a statement-block body ⇒ ABSTAIN (unknown body semantics).
//   · The caller must FAIL CLOSED on a doc it cannot parse (an error tree / non-TS path): pass `undefined`
//     and this module emits nothing. An un-parseable unit yields no proven fact, never a false one.
//
// PURE + TOTAL: no IO, no clock, never throws. The parse + the fail-closed-on-unparseable decision belong to
// the caller (the leg), exactly as `verify-negation.ts` takes an injected `SymbolReverseApi` rather than
// reading the index itself.

import type Parser from "web-tree-sitter"

type SyntaxNode = Parser.SyntaxNode

/** One proven `test-vacuity` fact: test `name` in the scanned unit has all its assertion-shaped calls inside
 *  `catch` clauses and no assertion-count guard. `row`/`col` are the 0-based start position of the `test(`/
 *  `it(` call — the witness span into the content-addressed bytes. */
export interface TestVacuityFact {
  readonly testName: string
  readonly shape: "assertion-only-in-catch" | "no-assertion-in-test" | "assertion-never-invoked"
  readonly row: number
  readonly col: number
}

const kids = (n: SyntaxNode): SyntaxNode[] => {
  const out: SyntaxNode[] = []
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i)
    if (c !== null) out.push(c)
  }
  return out
}

const walk = (n: SyntaxNode, f: (n: SyntaxNode) => void): void => {
  f(n)
  for (const c of kids(n)) walk(c, f)
}

/** The trailing identifier of a callee (the segment after the final `.`, or the whole thing if bare):
 *  `strictEqual` → `strictEqual`, `assert.ok` → `ok`, `t.throws` → `throws`, `expect(e).toBe` → `toBe`. */
function trailingName(callee: SyntaxNode): string {
  const m = callee.text.match(/([A-Za-z_$][\w$]*)\s*$/)
  return m === null ? "" : m[1]!
}

/** The CLOSED assertion vocabulary that carries no `expect`/`assert` token in its text, so the substring
 *  branches below miss it: the `node:assert` / `node:test` surface (`strictEqual`, `ok`, `equal`, …, often
 *  DESTRUCTURED so the callee is bare) and the ava/tap/`node:test` `t.*` matchers (`t.is`, `t.throws`, …).
 *  A success-path call to any of these is a real assertion; missing it is the ONLY false-admit direction
 *  (lucy cold-review, PR #234). Over-inclusion here only ever forces ABSTAIN — the safe direction — at the
 *  cost of recall on tests that happen to call an unrelated method of the same bare name. */
const ASSERTION_NAMES = new Set<string>([
  // node:assert
  "strictEqual",
  "deepStrictEqual",
  "notStrictEqual",
  "notDeepStrictEqual",
  "deepEqual",
  "notDeepEqual",
  "equal",
  "notEqual",
  "ok",
  "match",
  "doesNotMatch",
  "throws",
  "notThrows",
  "doesNotThrow",
  "rejects",
  "doesNotReject",
  "ifError",
  "fail",
  // ava / tap / node:test `t.*`
  "is",
  "not",
  "true",
  "false",
  "truthy",
  "falsy",
  "pass",
  "regex",
  "notRegex",
  "assert",
])

/** BROAD by design (soundness rail: over-detect). Matches `expect(...)`, `assert…(...)`, `assertEqual(...)`,
 *  `chai.assert.equal(...)`, `expect(x).toBe(...)`, `await expect(p).rejects…`, `x.should.equal(...)`, AND —
 *  via `ASSERTION_NAMES` on the callee's trailing identifier — the `node:assert`/ava vocabulary whose text
 *  carries no `expect`/`assert` token. The callee text of a `call_expression`. Over-matching only ABSTAINS. */
function isAssertionShaped(callExpr: SyntaxNode): boolean {
  const callee = callExpr.child(0)
  if (callee === null) return false
  const t = callee.text
  return (
    /(^|[.\s])expect\b/.test(t) ||
    /(^|[.\s])assert\w*\b/.test(t) ||
    /\.(toBe|toEqual|toThrow|toMatch|toContain|toHaveLength|toBeTruthy|toBeFalsy|toBeNull|toBeUndefined|toBeDefined|toBeInstanceOf|toStrictEqual|rejects|resolves)\b/.test(
      t,
    ) ||
    /\.(should|must)\b/.test(t) ||
    ASSERTION_NAMES.has(trailingName(callee))
  )
}

/** An assertion-count guard that DEFENDS the fragile shape: `expect.assertions(n)` / `expect.hasAssertions()`. */
function isAssertionGuard(callExpr: SyntaxNode): boolean {
  const callee = callExpr.child(0)
  if (callee === null) return false
  return /^expect\s*\.\s*(assertions|hasAssertions)$/.test(callee.text.replace(/\s+/g, ""))
}

/** Is `node` lexically inside a `catch_clause` that is itself within `stop` (the test body)? */
function insideCatch(node: SyntaxNode, stop: SyntaxNode): boolean {
  let p = node.parent
  while (p !== null) {
    if (p.type === "catch_clause") return true
    if (p.id === stop.id) return false
    p = p.parent
  }
  return false
}

/** The plain callback of a `test(name, fn)` / `it(name, fn)` call — a 2-arg call whose callee is the bare
 *  identifier `test` or `it` and whose 2nd arg is an arrow/function with a `statement_block` body. Anything
 *  else (member callee like `test.each`/`it.skip`, arg count ≠ 2, expression-bodied arrow) ⇒ `undefined`
 *  ⇒ ABSTAIN. */
function plainTestBody(callExpr: SyntaxNode): { name: string; body: SyntaxNode } | undefined {
  const callee = callExpr.child(0)
  if (callee === null || callee.type !== "identifier") return undefined
  if (callee.text !== "test" && callee.text !== "it") return undefined
  const args = kids(callExpr).find((c) => c.type === "arguments")
  if (args === undefined) return undefined
  const argNodes = kids(args).filter((c) => c.type !== "(" && c.type !== ")" && c.type !== ",")
  if (argNodes.length !== 2) return undefined
  const nameNode = argNodes[0]!
  if (nameNode.type !== "string" && nameNode.type !== "template_string") return undefined
  const fn = argNodes[1]!
  if (fn.type !== "arrow_function" && fn.type !== "function" && fn.type !== "function_expression") {
    return undefined
  }
  const body = kids(fn).find((c) => c.type === "statement_block")
  if (body === undefined) return undefined
  return { name: nameNode.text.replace(/^['"`]|['"`]$/g, ""), body }
}

/** A `fail()`-shaped call: bare `fail(...)` or a `.fail(...)` member call (the manual-fail guard idiom). */
function isFailCall(callExpr: SyntaxNode): boolean {
  const callee = callExpr.child(0)
  if (callee === null) return false
  return /(^|\.)fail$/.test(callee.text.replace(/\s+/g, ""))
}

/** Does any `try` BLOCK (not its `catch`) contain a `throw_statement` or a `fail()`-shaped call? Such a
 *  statement GUARDS the success path: if the operation does not throw, the manual throw/fail re-enters the
 *  `catch`, so the assertion always runs and the test is NOT vacuous. */
function anyTryBlockGuards(body: SyntaxNode): boolean {
  let guarded = false
  walk(body, (n) => {
    if (n.type !== "try_statement") return
    // the try block is the first `statement_block` child; `catch_clause`/`finally_clause` are siblings.
    const tryBlock = kids(n).find((c) => c.type === "statement_block")
    if (tryBlock === undefined) return
    walk(tryBlock, (m) => {
      if (m.type === "throw_statement") guarded = true
      if (m.type === "call_expression" && isFailCall(m)) guarded = true
    })
  })
  return guarded
}

/** PROVE / ABSTAIN the assertion-only-in-catch shape for ONE test body. Returns `true` only when EVERY
 *  assertion-shaped call is inside a `catch`, at least one such catch-assertion exists, no assertion guard is
 *  present, at least one `catch_clause` is present, AND no `try` block guards its own success path with a
 *  `throw`/`fail()`. Every other outcome ⇒ ABSTAIN (`false`). */
function bodyIsCatchOnly(body: SyntaxNode): boolean {
  let hasCatch = false
  let catchAssertions = 0
  let assertionOutsideCatch = false
  let hasGuard = false
  walk(body, (n) => {
    if (n.type === "catch_clause") hasCatch = true
    if (n.type !== "call_expression") return
    if (isAssertionGuard(n)) {
      hasGuard = true
      return
    }
    if (isAssertionShaped(n)) {
      if (insideCatch(n, body)) catchAssertions += 1
      else assertionOutsideCatch = true
    }
  })
  if (hasGuard) return false
  if (!hasCatch) return false
  if (assertionOutsideCatch) return false
  if (anyTryBlockGuards(body)) return false
  return catchAssertions > 0
}

/**
 * SHAPE-LOCAL widening of `isAssertionShaped`, used ONLY by `no-assertion-in-test`.
 *
 * WHY IT EXISTS, measured not assumed. The shared matcher requires a WHOLE-WORD `expect`, so a delegating
 * helper named `expectNoCollateral(...)` does not match it. Scanning this repo's own tests with the shape
 * WITHOUT this widening produced 4 hits, and ALL FOUR were that pattern
 * (`packages/knowledge/test/sameas-pairkey-forgery.test.ts`) — correct tests that assert inside a helper.
 * Precision on real code was 0/4. A shape whose only real-world hits are noise should not mint `proven`
 * facts, so absence-of-assertion is judged against a BROADER vocabulary of check-shaped callees.
 *
 * It is deliberately LOCAL: widening the shared matcher would also move the already-measured sibling
 * shape's recall, which is a separate change needing its own re-measurement. Widening here can only move
 * this shape from PROVEN to ABSTAIN — the safe direction — so it cannot introduce a false admit.
 */
function isCheckShaped(callExpr: SyntaxNode): boolean {
  if (isAssertionShaped(callExpr)) return true
  const callee = callExpr.child(0)
  if (callee === null) return false
  const name = trailingName(callee)
  return /^(expect|assert|check|verify|ensure|should)/i.test(name)
}

/**
 * A CHECK that is not a CALL — the getter-style assertion (`x.should.be.ok;`, `expect(x).to.be.true;`'s
 * tail, chai's `.ok`/`.true`/`.empty`/`.NaN`). Cold review found this as a genuine FALSE ADMIT: the oracle
 * inspected only `call_expression`, so a body whose only check is a property chain was proven to "check
 * nothing" while it demonstrably checks something. The claim this shape publishes is the ABSENCE of checks,
 * so absence must be judged over non-call chains too, not merely over calls.
 *
 * Tested on the chain's own text, which is what makes it total: any `should`/`must` segment, or an
 * `expect`/`assert*` head. Over-matching only ever moves this shape from PROVEN to ABSTAIN.
 */
function isCheckShapedChain(member: SyntaxNode): boolean {
  const t = member.text
  return /(^|[.\s])(should|must)\b/.test(t) || /(^|[.\s])expect\b/.test(t) || /(^|[.\s])assert\w*\b/.test(t)
}

/**
 * Is `node` lexically inside a function that is NESTED within `body` (rather than being the test body's own
 * statements)? Cold review found that the discarded-expression counter fired on work inside a declared but
 * never-invoked helper — `test("t", () => { function helper() { doWork(); } })` — which satisfies the coded
 * predicate while contradicting the prose ("the body DOES work"). Dead code is not work.
 */
function insideNestedFunction(node: SyntaxNode, body: SyntaxNode): boolean {
  const NESTED = new Set([
    "function_declaration",
    "function_expression",
    "arrow_function",
    "method_definition",
    "generator_function_declaration",
  ])
  let cur = node.parent
  while (cur !== null && cur.id !== body.id) {
    if (NESTED.has(cur.type)) return true
    cur = cur.parent
  }
  return false
}

/** The vitest/jest matcher vocabulary — FUNCTION-valued matchers. Accessing one without invoking it does
 *  NOTHING, which is the whole defect. Closed on purpose: a name outside this set ABSTAINS (recall loss,
 *  the safe direction), because the shape's soundness rests on the matcher being a function. */
const INVOCABLE_MATCHERS = new Set<string>([
  "toBe",
  "toEqual",
  "toStrictEqual",
  "toBeNull",
  "toBeUndefined",
  "toBeDefined",
  "toBeTruthy",
  "toBeFalsy",
  "toBeNaN",
  "toContain",
  "toContainEqual",
  "toHaveLength",
  "toMatch",
  "toMatchObject",
  "toMatchSnapshot",
  "toMatchInlineSnapshot",
  "toThrow",
  "toThrowError",
  "toBeInstanceOf",
  "toBeGreaterThan",
  "toBeLessThan",
  "toBeGreaterThanOrEqual",
  "toBeLessThanOrEqual",
  "toBeCloseTo",
  "toHaveProperty",
  "toHaveBeenCalled",
  "toHaveBeenCalledWith",
  "toHaveBeenCalledTimes",
  "toHaveReturned",
  "toSatisfy",
])

/**
 * Is this member chain rooted at the BARE global `expect(` — not `<anything>.expect(`?
 *
 * WHY A SUBSTRING TEST IS NOT ENOUGH (cold-review finding). This file's broad-match idiom is safe wherever
 * over-matching pushes a verdict toward ABSTAIN. Here it pushes toward PROVE, so it must be exact: a
 * substring test for `expect(` also matches `request(app).expect(200).toBeNull` (supertest),
 * `this.expect(x).toBe`, `global.expect(...)` — objects whose `expect` METHOD is not jest's global and whose
 * properties may well have access-time side effects. Proving those would be the very false admit the
 * chai-getter rail exists to prevent.
 *
 * So the chain is walked to its base call and the callee must be the bare `identifier` `expect`. Modifier
 * links (`.not`, `.resolves`) are traversed on the way down; anything else roots elsewhere and ABSTAINS.
 */
function rootedAtGlobalExpect(member: SyntaxNode): boolean {
  let cur: SyntaxNode | null = member
  while (cur !== null) {
    if (cur.type === "call_expression") {
      const callee = cur.child(0)
      return callee !== null && callee.type === "identifier" && callee.text === "expect"
    }
    if (cur.type !== "member_expression") return false
    cur = cur.childForFieldName("object")
  }
  return false
}

/**
 * PROVE / ABSTAIN the `assertion-never-invoked` shape: the body contains a matcher that is REFERENCED but
 * never CALLED — `expect(x).toBeNull;` where `expect(x).toBeNull();` was meant. The matcher is a function, so
 * the statement evaluates it and throws the value away: the assertion never executes and the test passes
 * silently. Named by the cross-repo census on zod's `number.test.ts` ("every `.toBeNull` matcher is
 * referenced without being called ... so those assertions never actually execute").
 *
 * SOUNDNESS RAILS (violating any is a false-admit):
 *   · THE CHAIN MUST BE ROOTED AT THE BARE GLOBAL `expect(` (`rootedAtGlobalExpect`, exact — NOT a substring
 *     test). This is the rail that separates a dead jest matcher from a LIVE getter: `x.should.be.ok;`
 *     asserts ON ACCESS (chai defines `ok`/`true`/`empty` as getters with side effects), so flagging it would
 *     be a false admit — the assertion DOES run. Only the bare-global-`expect`-rooted family is
 *     function-valued and therefore dead when un-invoked. A substring test would also match
 *     `request(app).expect(200).toBeNull` (supertest) and `this.expect(x).toBe`, whose `expect` is somebody
 *     else's method with semantics this oracle does not model — cold review caught exactly that.
 *   · THE TRAILING NAME MUST BE IN THE CLOSED `INVOCABLE_MATCHERS` SET. An unknown trailing name may be a
 *     property with getter semantics we do not model, so it ABSTAINS. Costs recall, cannot cost soundness.
 *   · THE MEMBER ACCESS MUST BE THE WHOLE EXPRESSION OF AN `expression_statement`. `const m = expect(x).toBe;`
 *     binds the matcher rather than dropping it, and `expect(x).toBe(1);` parses as a `call_expression`, not a
 *     bare member access — neither is this shape.
 *   · Modifier chains are fine: `expect(x).not.toBeNull;` trails on `toBeNull` and IS the defect.
 *   · Nesting is NOT excluded here (unlike the discarded-work rail of `no-assertion-in-test`): a matcher
 *     un-invoked inside a `forEach` callback is a real, executed-context bug, and excluding nesting would
 *     lose exactly the cases worth catching.
 */
function bodyHasUninvokedMatcher(body: SyntaxNode): boolean {
  let found = false
  walk(body, (n) => {
    if (found || n.type !== "expression_statement") return
    const expr = n.namedChild(0)
    if (expr === null || expr.type !== "member_expression") return
    if (!rootedAtGlobalExpect(expr)) return // bare global `expect(` only — see the rail above
    if (!INVOCABLE_MATCHERS.has(trailingName(expr))) return
    found = true
  })
  return found
}

/**
 * PROVE / ABSTAIN the `no-assertion-in-test` shape for ONE test body: the body does work and makes no
 * EXPLICIT check.
 *
 * PRECISION OF THE CLAIM. "No explicit check" is not "cannot fail": a discarded call that THROWS on bad
 * input (zod's `schema.parse(x)`, an invariant assert inside the callee) still fails the test. That is an
 * implicit smoke check, and it is exactly what the cross-repo census's `unasserted-parse-call` claims
 * describe — "it only checks that parsing does not throw rather than verifying any output". Wording that
 * says such a test "cannot fail on a wrong result" overreaches; the honest fragility is that NO RESULT IS
 * VERIFIED, so a wrong-but-non-throwing result passes silently.
 *
 * WHAT THE FACT IS. Syntactic, exactly like its sibling: "test T's body contains NO assertion-shaped call,
 * carries no assertion guard, and discards at least one expression". It is NOT a claim that T is vacuous at
 * runtime — a body whose only statement is `checkValid(x)` (a helper that asserts internally) matches this
 * SHAPE while being a perfectly good test. Naming the shape, not the bug, is what keeps the family
 * 0-false-admit; the residual is PRECISION (a consumer may judge a flagged test fine), never soundness.
 *
 * SOUNDNESS RAILS (violating any is a false-admit):
 *   · REUSES the deliberately-BROAD `isAssertionShaped`. Over-detection moves a test from PROVEN to ABSTAIN
 *     — the safe direction.
 *   · Judged with `isCheckShaped`, a SHAPE-LOCAL widening (see its own header): the shared matcher needs a
 *     whole-word `expect`, and measuring this shape against this repo's tests without the widening produced
 *     4 hits that were ALL delegating helpers named `expectNoCollateral` — precision 0/4. Widening here can
 *     only move PROVEN to ABSTAIN, never the reverse, so it costs recall and cannot cost soundness.
 *   · RESIDUAL LIMIT, stated: a helper named outside that vocabulary (`hasNoCollateral(...)`) still yields a
 *     proven fact. Sound — no check-shaped call appears in THIS body — but imprecise. Pinned by a
 *     characterization test so it stays visible rather than becoming folklore.
 *   · ANY check anywhere in the body ⇒ ABSTAIN. There is no "outside a catch" carve-out here: this shape
 *     is the ABSENCE of checks, so one anywhere refutes it.
 *   · A CHECK NEED NOT BE A CALL. `isCheckShapedChain` judges non-call member chains (`x.should.be.ok;`,
 *     chai's getter assertions) because the published claim is "checks nothing", not "makes no check-shaped
 *     CALL". Cold review found a body proven by the call-only version while it demonstrably checked — a
 *     real false admit against the stated claim, not a recall loss. Fixed here.
 *   · The discarded-expression counter ignores statements inside a NESTED function: a declared-but-never-
 *     invoked helper is dead code, not work, and counting it satisfied the coded predicate while
 *     contradicting the prose.
 *   · An `expect.assertions(n)` / `expect.hasAssertions()` guard ⇒ ABSTAIN. The guard IS a check, and a
 *     guarded body with no assertion fails at runtime rather than passing vacuously.
 *   · At least one DISCARDED expression statement is required ⇒ otherwise ABSTAIN. An empty body, or a body
 *     of declarations only, is a different smell (an empty/setup-only test), not this one. This is also the
 *     discriminator the observed claims share (`xrepo-zod-shape-census.tsv`: "bare discarded expression",
 *     "absence of any expect/toEqual call", "no expect call on any accessed getter").
 *   · ANY `throw_statement` or `fail()`-shaped call (`isFailCall`) ⇒ ABSTAIN. A body that throws IS checking something.
 *   · ANY `return_statement` carrying a value ⇒ ABSTAIN. A returned promise is an implicit check: the runner
 *     fails the test if it rejects. Missing this would be a false-admit on the whole async-return idiom.
 *   · A `catch_clause` anywhere ⇒ ABSTAIN. That body belongs to the sibling shape's territory; leaving both
 *     shapes able to fire on one test would make the (unitKey, testName) identity ambiguous.
 */
function bodyHasNoAssertion(body: SyntaxNode): boolean {
  let anyAssertion = false
  let hasGuard = false
  let discarded = 0
  let checks = false // a throw / fail() / valued return / catch — the body IS checking something
  walk(body, (n) => {
    if (n.type === "catch_clause" || n.type === "throw_statement") checks = true
    if (n.type === "return_statement" && n.namedChildCount > 0) checks = true
    if (n.type === "expression_statement" && !insideNestedFunction(n, body)) discarded += 1
    // A CHECK need not be a CALL: judge non-call member chains too (cold-review false admit).
    if (n.type === "member_expression" && isCheckShapedChain(n)) anyAssertion = true
    if (n.type !== "call_expression") return
    if (isAssertionGuard(n)) {
      hasGuard = true
      return
    }
    if (isCheckShaped(n)) anyAssertion = true
    if (isFailCall(n)) checks = true
  })
  if (anyAssertion || hasGuard || checks) return false
  return discarded > 0
}

/**
 * Scan a parsed test-unit's AST `root` and return one `TestVacuityFact` per test PROVEN to hold the
 * assertion-only-in-catch shape. PURE + TOTAL. Abstentions are simply absent from the result. Pass the root
 * of a successfully-parsed TS doc; a doc the caller could not parse yields no facts (fail-closed at the leg).
 */
export function scanTestVacuity(root: SyntaxNode): TestVacuityFact[] {
  const facts: TestVacuityFact[] = []
  walk(root, (n) => {
    if (n.type !== "call_expression") return
    const t = plainTestBody(n)
    if (t === undefined) return
    // EXACTLY ONE shape per test — the (unitKey, testName) identity admits no second fact.
    //   · `assertion-never-invoked` is tried FIRST, by ORDERED PRECEDENCE not by construction: a body can
    //     hold BOTH a real catch-assertion and, elsewhere, a matcher that is never invoked. Both predicates
    //     would then be true, and the un-invoked matcher is the strictly more specific, more actionable
    //     defect, so it wins. Stated plainly because it is the one pair that is not disjoint on its own.
    //   · The remaining two ARE disjoint by construction: `bodyIsCatchOnly` requires a catch-assertion,
    //     `bodyHasNoAssertion` refuses any check AND any catch.
    const shape = bodyHasUninvokedMatcher(t.body)
      ? ("assertion-never-invoked" as const)
      : bodyIsCatchOnly(t.body)
        ? ("assertion-only-in-catch" as const)
        : bodyHasNoAssertion(t.body)
          ? ("no-assertion-in-test" as const)
          : undefined
    if (shape === undefined) return
    facts.push({
      testName: t.name,
      shape,
      row: n.startPosition.row,
      col: n.startPosition.column,
    })
  })
  return facts
}
