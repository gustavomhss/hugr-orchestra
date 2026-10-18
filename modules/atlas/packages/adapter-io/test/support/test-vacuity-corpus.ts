// @atlas/adapter-io — test/support/test-vacuity-corpus.ts  (#95 WP-A4-TV — the test-vacuity LABEL-STORE)
//
// THE ANTI-CIRCULARITY SPINE (mirrors semantic-bench's AC-1/AC-6). This module is the LABEL-STORE for the
// judge-free A4 test-vacuity bench: it plants ground truth by MUTATION and derives every FALSE/TRUE label from
// the mutation RECORD (`deriveLabelFromFlip`) ALONE — a pure function of the recorded flip, never a verdict of
// the gate under test. It imports NO symbol from `test-vacuity.ts` (the oracle) — if it did, the oracle could
// masquerade as ground truth and the whole 0-false-admit number would be vacuous. A grep-level independence
// guard lives in `test-vacuity-bench.test.ts` (the AC-6 analogue: this file's import lines name no oracle).
//
// TWO DISJOINT HALVES, exactly as the semantic mirror: this module produces SOURCES + LABELS; the TEST parses
// each source through the SAME tree-sitter path the oracle uses (`parseTsDoc`), runs `scanTestVacuity`, and
// hands (row, admitted?) to the scorer. This module never sees an admission outcome.
//
// WHAT IS PLANTED. Each TRUE row is a genuinely `assertion-only-in-catch` VACUOUS test — every assertion-shaped
// call sits inside a `catch`, there is no assertion-count guard, no success-path assertion, no manual
// throw/fail guard in the `try`. Drawn from DIVERSE REAL idioms (jest `expect`-in-catch, `node:assert`
// `strictEqual`/`ok`/`deepStrictEqual` in catch — bare-destructured and `assert.*` member forms, chai
// `.should` / `expect(...).to`, ava `t.is`, multiple `try/catch`, async `await…catch`, template-string test
// name) — NOT the oracle's own unit fixtures (`test-vacuity.test.ts`), which would re-confirm PRECISION, not
// measure RECALL across idioms.
//
// Each FALSE row is that TRUE base mutated by ONE edit-distance-1 flip that FLIPS the vacuity property — one of
// the four the oracle's soundness rails name (`test-vacuity.ts:24-42`):
//   · add-success-assertion  — an assertion on the success path (top-level or in the `try` body).
//   · add-assertions-guard   — an `expect.assertions(n)` / `expect.hasAssertions()` guard.
//   · add-trailing-throw     — a trailing `throw` / `fail()`-shaped call inside the `try`.
//   · move-catch-to-finally  — the catch assertion relocated into a `finally` (runs on the success path too).
// A correct flip makes the oracle ABSTAIN by construction (each is exactly a rail trigger); if the oracle
// ADMITS any FALSE, that is a REAL soundness bug the bench must surface loudly, never a corpus tuning target.

/** The four vacuity-flipping mutation kinds — each an edit-distance-1 edit of a TRUE base that trips exactly
 *  one documented soundness rail of `scanTestVacuity`. */
export type FlipKind =
  | "add-success-assertion" //   assertion on the success path ⇒ rail: "assertion OUTSIDE a catch ⇒ ABSTAIN"
  | "add-assertions-guard" //    expect.assertions(n)/hasAssertions() ⇒ rail: "an assertion guard ⇒ ABSTAIN"
  | "add-trailing-throw" //      trailing throw/fail() in the try ⇒ rail: "a try that guards its success path ⇒ ABSTAIN"
  | "move-catch-to-finally" //  the catch assertion moved to finally ⇒ rail: "a finally runs on the success path"

/** The ground-truth label. TRUE = the un-mutated genuinely-vacuous base; FALSE = a vacuity-flipped mutant.
 *  NEVER a gate verdict. */
export type Label = "TRUE" | "FALSE"

/** One planted corpus row. `flip` is the mutation RECORD: `null` for a TRUE base, a `FlipKind` for a FALSE
 *  mutant. `base` links a FALSE to the `id` of its TRUE base (so the edit-distance-1 pairing is checkable).
 *  `idiom` is the framework/vocabulary the source is drawn from (the recall breakdown groups by it). */
export interface Row {
  readonly id: string
  readonly idiom: string
  readonly label: Label
  readonly flip: FlipKind | null
  readonly base: string | null
  readonly source: string
}

/**
 * DERIVE the label from the mutation RECORD ALONE (the anti-circularity ground-truth function). A row with no
 * flip is the un-mutated TRUE base; any flip is a vacuity-flipping mutation ⇒ FALSE. This calls NO oracle
 * symbol — it reads only the recorded flip, so the label can never be a laundered `scanTestVacuity` verdict.
 */
export function deriveLabelFromFlip(flip: FlipKind | null): Label {
  return flip === null ? "TRUE" : "FALSE"
}

// ─────────────────────────────── TRUE bases — genuinely vacuous, diverse real idioms ───────────────────────────────
// Each is `assertion-only-in-catch`: the ONLY assertion-shaped calls sit inside a `catch`, no guard, no
// success-path assertion, no try-body throw/fail. `test(`/`it(` bare callee, 2 args, string/template name,
// arrow/function body — the shape `plainTestBody` admits.

/** jest, async `await …parseAsync()` then `expect` in catch — the canonical zod assertion-only-in-catch. */
const TRUE_JEST_AWAIT = `
test("array min rejects", async () => {
  try {
    await z.array(z.string()).min(4).parseAsync([]);
  } catch (err) {
    expect((err as ZodError).issues[0].message).toEqual("Array must contain at least 4 element(s)");
  }
});`

/** jest, MULTIPLE try/catch blocks, every assertion in a catch. */
const TRUE_JEST_MULTI = `
it("url error overrides", () => {
  try { z.string().url().parse("not-a-url"); } catch (err) { expect((err as any).message).toEqual("Invalid url"); }
  try { z.string().url("custom").parse("also-bad"); } catch (err) { expect((err as any).message).toEqual("custom"); }
});`

/** jest, plain synchronous single try/catch. */
const TRUE_JEST_SYNC = `
test("throws on bad input", () => {
  try {
    schema.parse(malformed);
  } catch (e) {
    expect(e).toBeInstanceOf(ZodError);
  }
});`

/** jest, template-string test name. */
const TRUE_JEST_TEMPLATE = `
test(\`coerce \${kind} rejects\`, () => {
  try {
    z.coerce.number().parse(Symbol());
  } catch (e) {
    expect((e as any).issues).toHaveLength(1);
  }
});`

/** node:assert, member form `assert.strictEqual` in catch. */
const TRUE_NODE_STRICTEQUAL = `
test("min length message", () => {
  try {
    schema.min(4).parse("ab");
  } catch (err) {
    assert.strictEqual(err.issues[0].code, "too_small");
  }
});`

/** node:assert, DESTRUCTURED bare callee `ok(...)` in catch (no expect/assert token in the callee text). */
const TRUE_NODE_OK_BARE = `
it("rejects negative", () => {
  try {
    positive.parse(-1);
  } catch (err) {
    ok(err instanceof RangeError);
  }
});`

/** node:assert, `deepStrictEqual` (bare, destructured) in catch. */
const TRUE_NODE_DEEP = `
test("deep issue shape", () => {
  try {
    tuple.parse([1]);
  } catch (err) {
    deepStrictEqual(err.issues.map(i => i.code), ["too_small"]);
  }
});`

/** chai, `expect(...).to.equal` in catch. */
const TRUE_CHAI_EXPECT = `
it("chai expect in catch", () => {
  try {
    schema.parse(bad);
  } catch (err) {
    expect(err).to.be.an.instanceof(ZodError);
  }
});`

/** chai, `.should` chain in catch. */
const TRUE_CHAI_SHOULD = `
it("chai should in catch", () => {
  try {
    schema.parse(bad);
  } catch (err) {
    err.should.have.property("issues");
  }
});`

/** ava, `t.is` (bare `t.*`, trailing name in the assertion vocabulary) in catch. */
const TRUE_AVA_T_IS = `
test("ava t.is in catch", t => {
  try {
    schema.parse(bad);
  } catch (err) {
    t.is(err.name, "ZodError");
  }
});`

// ─────────────────────────────── the corpus (base + one flipped mutant each) ───────────────────────────────
// Each FALSE is produced by inserting/relocating exactly the flip named in `flip`, so removing that single edit
// recovers the base (checkable in the bench: `add-*` mutants are base + one extra line; `move-*` relocates the
// same assertion text out of the catch). The flip kinds are cycled so all four rails are exercised.

interface Spec {
  readonly id: string
  readonly idiom: string
  readonly base: string
  readonly flip: FlipKind
  readonly mutant: string
}

const SPECS: readonly Spec[] = [
  {
    id: "jest-await",
    idiom: "jest / async await…catch",
    base: TRUE_JEST_AWAIT,
    flip: "add-assertions-guard",
    // + `expect.assertions(1)` guard: the test now DEFENDS the non-throwing path ⇒ not fragile ⇒ ABSTAIN.
    mutant: `
test("array min rejects", async () => {
  expect.assertions(1);
  try {
    await z.array(z.string()).min(4).parseAsync([]);
  } catch (err) {
    expect((err as ZodError).issues[0].message).toEqual("Array must contain at least 4 element(s)");
  }
});`,
  },
  {
    id: "jest-multi",
    idiom: "jest / multiple try-catch",
    base: TRUE_JEST_MULTI,
    flip: "add-success-assertion",
    // + a top-level success-path assertion ⇒ an assertion OUTSIDE a catch ⇒ ABSTAIN.
    mutant: `
it("url error overrides", () => {
  expect(z.string().url().safeParse("https://ok").success).toBe(true);
  try { z.string().url().parse("not-a-url"); } catch (err) { expect((err as any).message).toEqual("Invalid url"); }
  try { z.string().url("custom").parse("also-bad"); } catch (err) { expect((err as any).message).toEqual("custom"); }
});`,
  },
  {
    id: "jest-sync",
    idiom: "jest / sync try-catch",
    base: TRUE_JEST_SYNC,
    flip: "add-trailing-throw",
    // + a trailing `throw` after the can-reject op ⇒ the try guards its own success path ⇒ ABSTAIN.
    mutant: `
test("throws on bad input", () => {
  try {
    schema.parse(malformed);
    throw new Error("expected schema.parse to reject");
  } catch (e) {
    expect(e).toBeInstanceOf(ZodError);
  }
});`,
  },
  {
    id: "jest-template",
    idiom: "jest / template-string name",
    base: TRUE_JEST_TEMPLATE,
    flip: "add-assertions-guard",
    // + `expect.hasAssertions()` guard ⇒ ABSTAIN.
    mutant: `
test(\`coerce \${kind} rejects\`, () => {
  expect.hasAssertions();
  try {
    z.coerce.number().parse(Symbol());
  } catch (e) {
    expect((e as any).issues).toHaveLength(1);
  }
});`,
  },
  {
    id: "node-strictEqual",
    idiom: "node:assert / assert.strictEqual",
    base: TRUE_NODE_STRICTEQUAL,
    flip: "add-success-assertion",
    // + a top-level `assert.ok` on the success path ⇒ assertion OUTSIDE a catch ⇒ ABSTAIN.
    mutant: `
test("min length message", () => {
  assert.ok(schema.min(4).safeParse("abcd").success);
  try {
    schema.min(4).parse("ab");
  } catch (err) {
    assert.strictEqual(err.issues[0].code, "too_small");
  }
});`,
  },
  {
    id: "node-ok-bare",
    idiom: "node:assert / bare ok (destructured)",
    base: TRUE_NODE_OK_BARE,
    flip: "add-trailing-throw",
    // + a trailing bare `fail()` in the try ⇒ the try guards its success path ⇒ ABSTAIN.
    mutant: `
it("rejects negative", () => {
  try {
    positive.parse(-1);
    fail("expected positive.parse to reject");
  } catch (err) {
    ok(err instanceof RangeError);
  }
});`,
  },
  {
    id: "node-deep",
    idiom: "node:assert / deepStrictEqual (destructured)",
    base: TRUE_NODE_DEEP,
    flip: "move-catch-to-finally",
    // the ONLY assertion relocated from the catch into a `finally` ⇒ it runs on the success path ⇒ ABSTAIN.
    mutant: `
test("deep issue shape", () => {
  let issues: any[] = [];
  try {
    tuple.parse([1]);
  } catch (err) {
    issues = err.issues;
  } finally {
    deepStrictEqual(issues.map(i => i.code), ["too_small"]);
  }
});`,
  },
  {
    id: "chai-expect",
    idiom: "chai / expect(...).to",
    base: TRUE_CHAI_EXPECT,
    flip: "add-success-assertion",
    // + a top-level chai `expect(...).to` on the success path ⇒ ABSTAIN.
    mutant: `
it("chai expect in catch", () => {
  expect(schema.safeParse(good).success).to.equal(true);
  try {
    schema.parse(bad);
  } catch (err) {
    expect(err).to.be.an.instanceof(ZodError);
  }
});`,
  },
  {
    id: "chai-should",
    idiom: "chai / .should chain",
    base: TRUE_CHAI_SHOULD,
    flip: "move-catch-to-finally",
    // the `.should` assertion relocated into a `finally` ⇒ runs on the success path ⇒ ABSTAIN.
    mutant: `
it("chai should in catch", () => {
  let caught: any = null;
  try {
    schema.parse(bad);
  } catch (err) {
    caught = err;
  } finally {
    caught.should.have.property("issues");
  }
});`,
  },
  {
    id: "ava-t-is",
    idiom: "ava / t.is",
    base: TRUE_AVA_T_IS,
    flip: "add-trailing-throw",
    // + a trailing `t.fail()` in the try ⇒ the try guards its success path ⇒ ABSTAIN.
    mutant: `
test("ava t.is in catch", t => {
  try {
    schema.parse(bad);
    t.fail("expected schema.parse to reject");
  } catch (err) {
    t.is(err.name, "ZodError");
  }
});`,
  },
]

/** The committed corpus: every TRUE base followed by its single FALSE mutant, label derived from the flip
 *  record ALONE (`deriveLabelFromFlip`). Re-derivable and stable — no oracle call anywhere in its construction. */
export const CORPUS: readonly Row[] = SPECS.flatMap((s): Row[] => [
  { id: s.id, idiom: s.idiom, label: deriveLabelFromFlip(null), flip: null, base: null, source: s.base },
  {
    id: `${s.id}--${s.flip}`,
    idiom: s.idiom,
    label: deriveLabelFromFlip(s.flip),
    flip: s.flip,
    base: s.id,
    source: s.mutant,
  },
])

/** The distinct idioms the TRUE corpus spans (the recall breakdown's D). */
export const IDIOMS: readonly string[] = [...new Set(CORPUS.map((r) => r.idiom))]
