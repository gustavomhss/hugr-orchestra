# A4 test-vacuity — judge-free planted recall (#95 WP-A4-TV)

The `test-vacuity` PROVEN shape (`packages/adapter-io/src/test-vacuity.ts`, `scanTestVacuity`) folded into the
A4 scoreboard as a **fifth oracle-bearing shape**, measured the SAME way the four semantic arms are
(`calibration-report.a4-planted.md`): ground truth is **planted by edit-distance-1 mutation** and labelled from
the **mutation record ALONE** — zero LLM, zero judge, and zero call to the oracle under test anywhere in the
label or scoring path. This is the AST (tree-sitter) analogue of that report's SCIP substrate.

## The two co-primaries (never blended)

| shape                                   | falseAdmit (soundness — MUST be 0) | recallTrue (coverage) | idioms                        | n   |
| --------------------------------------- | ---------------------------------- | --------------------- | ----------------------------- | --- |
| test-vacuity, `assertion-only-in-catch` | **0/10 = 0.00%**                   | **10/10 = 100.00%**   | 10 real idioms (4 frameworks) | 20  |

- **falseAdmit = |admitted ∧ FALSE| / |FALSE| = 0/10.** Every one of the 10 vacuity-flipped mutants was
  ABSTAINED (not proved). The oracle admitted no false. Had any flip been admitted, the shape test
  `test-vacuity-bench.test.ts` would go RED — this is a bench that CAN fail.
- **recallTrue = |admitted ∧ TRUE| / |TRUE| = 10/10.** The oracle proved the vacuity shape on all 10 genuinely
  `assertion-only-in-catch` TRUE tests, across all four framework families — it generalises past the jest
  `expect` vocabulary to `node:assert` (member + bare-destructured), chai, and ava.

## Instrument

- `packages/adapter-io/test/support/test-vacuity-corpus.ts` — the LABEL-STORE. Plants each FALSE by one
  edit-distance-1 flip of a TRUE base; the label comes from `deriveLabelFromFlip` (the mutation record) — never
  from `scanTestVacuity`. Imports NO symbol from the oracle (anti-circularity, grep-checked by the test).
- `packages/adapter-io/test/support/test-vacuity-scorer.ts` — the two co-primaries
  (`falseAdmit`, `recallTrue`), the same formulas as `bench-scorer.ts`. Imports no oracle symbol.
- `packages/adapter-io/test/test-vacuity-bench.test.ts` — parses every source through the SHIPPED
  `parseTsDoc` + `initAst` tree-sitter path (the exact path the producer `test-vacuity-source.ts` uses), runs
  `scanTestVacuity`, scores, and asserts `falseAdmit === 0`. Runs under `npm test`, no build of the oracle.

## The corpus — diverse REAL idioms (not the oracle's own fixtures)

The TRUE corpus deliberately does NOT reuse `test-vacuity.test.ts`'s unit fixtures — that would re-confirm
PRECISION, not measure RECALL across idioms (the circularity the brief names). It spans the frameworks and
vocabularies real test suites use — the same family Atlas's own #114 audit found five times
(`assertion-only-in-catch`, per `test-vacuity.ts:14` and `ADR-0012:174`):

| id               | framework / idiom                           | TRUE (base)                       | FALSE flip kind       |
| ---------------- | ------------------------------------------- | --------------------------------- | --------------------- |
| jest-await       | jest / async `await…parseAsync()…catch`     | `expect(...).toEqual` in catch    | add-assertions-guard  |
| jest-multi       | jest / MULTIPLE try-catch blocks            | two catches, `expect` in each     | add-success-assertion |
| jest-sync        | jest / sync try-catch                       | `expect(e).toBeInstanceOf`        | add-trailing-throw    |
| jest-template    | jest / template-string test name            | `expect(...).toHaveLength`        | add-assertions-guard  |
| node-strictEqual | node:assert / `assert.strictEqual` (member) | `assert.strictEqual` in catch     | add-success-assertion |
| node-ok-bare     | node:assert / bare `ok` (destructured)      | `ok(...)` in catch                | add-trailing-throw    |
| node-deep        | node:assert / bare `deepStrictEqual`        | `deepStrictEqual` in catch        | move-catch-to-finally |
| chai-expect      | chai / `expect(...).to`                     | `expect(err).to.be.an.instanceof` | add-success-assertion |
| chai-should      | chai / `.should` chain                      | `err.should.have.property`        | move-catch-to-finally |
| ava-t-is         | ava / `t.is`                                | `t.is` in catch                   | add-trailing-throw    |

The four flip kinds are exactly the oracle's four documented soundness rails (`test-vacuity.ts:24-42`), so a
correct flip forces ABSTAIN by construction:

- **add-success-assertion** — an assertion on the success path (top-level or try body) ⇒ rail _"any
  assertion-shaped call OUTSIDE a catch ⇒ ABSTAIN"_.
- **add-assertions-guard** — `expect.assertions(n)` / `expect.hasAssertions()` ⇒ rail _"an assertion guard ⇒
  ABSTAIN"_.
- **add-trailing-throw** — a trailing `throw` / `fail()`-shaped call inside the try ⇒ rail _"a try that guards
  its own success path ⇒ ABSTAIN"_.
- **move-catch-to-finally** — the catch assertion relocated into a `finally` (runs on the success path) ⇒ rail
  _"a finally is NOT catch-only"_.

## Anti-circularity (the AC-6 analogue)

The label-store and the scorer import **no symbol** from `test-vacuity.ts` (or `@atlas/genesis`). The test
proves it with a static-import grep over both support files — a live `import … from '…/test-vacuity'` would let
the gate under test define its own ground truth (the vacuity class). The label is a pure function of the flip
record (`deriveLabelFromFlip`): `flip === null ⇒ TRUE`, any flip ⇒ `FALSE`. The scorer's teeth
(`AC-teeth`) prove the 0 is EARNED: an all-admit run registers `falseAdmit = 10/10`, so a scorer that always
returned 0 could not have produced this number.

## Re-derivation

The numbers are re-derivable from the committed corpus with one command (no build of the oracle, single-fork):

```
mkdir -p node_modules/@atlas && for d in packages/*/; do ln -sfn "../../$d" "node_modules/@atlas/$(basename $d)"; done
npx tsc -b   # once, to populate packages/*/dist that ast.ts's @atlas/index import resolves
npx vitest run packages/adapter-io/test/test-vacuity-bench.test.ts --pool=forks --poolOptions.forks.singleFork=true
```

The `AC-soundness` test prints `falseAdmit=0/10 recallTrue=10/10 (10 idioms) n=20` on every run.

## The cited-not-committed real-repo observation (PRIOR, NOT re-derivable, NEVER blended)

A prior scratchpad measurement (`test-vacuity.ts:8`, hand-verified) observed **~32 real
`assertion-only-in-catch` tests proven on zod v3.23.8** by this one shape — one shape of the ~3-shape
vacuous-test family the #95 zod shape-census surfaced (`no-assertion-in-test`, `assertion-only-in-catch`,
`unasserted-parse-call`; `95-benchmark-results.md:238-239`). It is **NOT a committed artifact**: no zod
checkout lives in this repo, the number was not re-derived here, and it is reported ONLY as a prior,
non-re-derivable observation. It is **deliberately not blended** into the committed 0/10 · 10/10 planted number
above. A committed real-repo recall number would need a pinned zod checkout — a SEPARATE follow-up, out of this
WP's scope.

## Honest limits

- This is recall over **planted mutations across idiom fixtures**, not recall over an arbitrary real corpus.
  The 10/10 recall says the oracle generalises across the four framework families sampled — NOT that it catches
  every real-world vacuous test (the zod census above suggests real recall is idiom-dependent).
- It covers ONE shape (`assertion-only-in-catch`), the only shape `scanTestVacuity` proves today. The other two
  members of the vacuous-test family (`no-assertion-in-test`, `unasserted-parse-call`) have no sound oracle yet
  and are not measured here.
- The soundness headline (0/10) is the load-bearing number: it is a property (no fabricated proof), and the
  bench is built to go RED if it is ever violated. Recall is a coverage figure, measured not targeted.

## What the framing got wrong

The brief framed the corpus as needing "the 5 real vacuous tests atlas's #114 audit found" as ground-truth
TRUEs. Reading the sources, #114 is the _task id_ for the recurring "a generator/test whose axis no longer
discriminates anything is vacuous" audit (`ADR-0012:174`, `properties-gen.md:59`, `wp-fix-query-guidance.md:19`)
— the "five times" is a COUNT of that class across the repo, not five verbatim `assertion-only-in-catch` test
sources sitting in a doc to copy. The honest move was therefore to plant the SAME shape (`assertion-only-in-catch`,
the specific smell `test-vacuity.ts` proves and the one #114 motivated) across diverse REAL idioms drawn from the
frameworks real suites use, rather than transcribe five particular historical tests that are not preserved as a
citable corpus. Copying five specific atlas tests would also have risked circularity if any overlapped the
oracle's own fixtures; diverse idioms measure recall (generalisation), which is what the number is for.
