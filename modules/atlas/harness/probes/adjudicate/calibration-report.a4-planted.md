# A4 planted recall — derived report (#196b sound mutation-bench, judge-free)

**AMENDED (WP-C3, 2026-08-18):** the false-admit figures in Table 2 are reported under two named definitions,
not a bare rate — see "Table 2" and the "WP-C3 amendment" section at the end. Bare summary: under the gate's
own documented predicate (witnessed reference-existence), all three structural arms are **0-false-admit**
(dependency 0/23702, count 0/163, negation 0/163); the previously-reported 1.30% / 5.52% figures measure a
mismatch against the bench's stricter, undocumented call-only label, adjudicated 0/318 genuine unsoundness.

WP-B2. Method: [`docs/design/95-benchmark-methodology.md`](../../../docs/design/95-benchmark-methodology.md).
This is the JUDGE-FREE recall number for the four oracle-bearing shapes (`count`, `relation`, `dependency`,
`negation`). Ground truth is **planted by edit-distance-1 mutation** and labelled by an **independent `tsc`
oracle** (`ts.createProgram`) — zero LLM anywhere in the label or scoring path. This supersedes
`harness/probes/a4-recall-pilot.json` as a recall number for these four shapes: that pilot's denominator was
100% same-family-LLM-judge `GROUNDED_TRUE` verdicts (judge = same model family as the miner, never calibrated
live) and it stored no fact text, so it cannot even be re-scored. Per the ratified methodology, a same-family
judge measures _agreement_, not recall.

**Not covered:** advisory / predicate prose has no sound oracle; it is out of scope here (see
`docs/design/95-benchmark-methodology.md` and the `calibration-report.a1-subject.*` planted subject-test for
that shape's separate, judge-in-the-loop-for-generation-but-not-scoring precision number).

## Instrument (reused as-is, nothing new built)

- `packages/adapter-io/test/semantic-bench.test.ts` (#196b WP-1) drives the SHIPPED admission gate over planted
  claims on atlas-self.
- `packages/adapter-io/test/support/bench-scorer.ts` computes, per arm: `falseAdmit = |admitted∧FALSE|/|FALSE|`
  and `recallTrue = |admitted∧TRUE|/|TRUE, groundable|`. Verified independent of the gate: it imports no symbol
  from `admit-harness.ts` / `verify-fact-source.ts` (AC-6, re-checked by the test itself).
- `packages/adapter-io/test/support/mutation-contract.ts` plants each FALSE by a single edit-distance-1 mutation
  from a TRUE base; label comes from the tsc witness, never from the admission gate.
- Fixture self-proof pinned: `semantic-bench-fixture.json`, md5 `daa42ed88403e13b8ab1197adab9f0d3`
  (`semantic-bench-fixture.pin.json`).

## THE index-build trap (why two tables, not one)

`docs/design/95-benchmark-methodology.md` (~L79-102) documents that negation's recall swung 32.5% → 4.25% (8x)
purely from whether `packages/*/dist` declarations existed before `scip-typescript index` ran. The literal
recipe printed in the test file's own header (`scip-typescript index --output .atlas/index.scip` with no
mention of building first) is ambiguous about which state it means — and running it literally, on a repo where
`npm install` alone does not populate `dist/`, reproduces the **dist-absent misbuild**, not the intended
operating state. Per the brief's instruction, both states were run and are reported, labelled, below.

Git sha for both runs: `9eb4d7feaec5eada3df2f33f691c5fe3f8ca5350` (branch `bench/a4-planted`, from `master`).
Tool versions: node v22.17.1, npm 10.9.2, TypeScript 5.9.3, vitest 2.1.9, `@sourcegraph/scip-typescript` 0.4.0.

### Reproduction recipe (run twice for each state — see verification note below)

```
npm install
npx tsc -b                                            # populates packages/*/dist
scip-typescript index --output .atlas/index.scip      # run AFTER tsc -b for dist-form; BEFORE for dist-absent
ATLAS_SEM_BENCH=1 npx vitest run packages/adapter-io/test/semantic-bench.test.ts
```

**Verified by a second independent run:** yes, for BOTH build states — `.atlas/index.scip` deleted and rebuilt
from scratch, then the vitest run repeated. Every numerator/denominator was identical across the two runs of
each state. A third dist-form index rebuild (done to extract raw numerator/denominator counts, since the
shipped test only `console.log`s the percentage) produced a slightly different `.scip` file size (16,994,791 vs
16,980,163 bytes, likely non-deterministic ordering/timestamps in the indexer) but **identical** bench numbers —
so the metric itself is stable even where the raw artifact bytes are not.

## Table 1 — dist-ABSENT index (misbuild; literal test-header recipe as written)

`.atlas/index.scip` = 16,306,497 bytes. `targets=1333 scopes=19`.

| arm        | falseAdmit        | recallTrue        | n     |
| ---------- | ----------------- | ----------------- | ----- |
| count      | 0/163 = 0.00%     | 7/163 = 4.29%     | 326   |
| relation   | 452/452 = 100.00% | 452/452 = 100.00% | 904   |
| dependency | 18/23702 = 0.08%  | 7/163 = 4.29%     | 23865 |
| negation   | 0/163 = 0.00%     | 51/1200 = 4.25%   | 1363  |

Negation TEETH (opaque cross-package-collapse gate forced OFF, non-vacuity check): 132/163 = 80.98% false-admit
— confirms the door's 0% above is _earned_ by the gate, not vacuous (matches the door's historically-adjudicated
~80.86% pre-fix regime). **Shipped test suite result on this build: GREEN.**

## Table 2 — dist-FORM index (operating/intended state per the methodology doc)

`.atlas/index.scip` = 16,980,163 / 16,980,163 / 16,994,791 bytes across three independent builds. `targets=1333
scopes=19`.

**A false-admit rate reported bare is ambiguous between two different predicates, so every figure below is
reported under both, named:**

- **Definition A — unsoundness under the gate's own documented predicate.** The gate proves reference-existence,
  not call-existence: `verifyDependency` (`packages/genesis/src/verify-fact.ts:96`) admits on
  `reverseCallers(target) ∩ sourceScope ≠ ∅`, and `reverseCallers` (`packages/index/src/symbol-reverse.ts:120`,
  `if (occ.role !== 'reference') continue;`) counts ANY SCIP `reference` occurrence — import, type position,
  `instanceof` operand, re-export — as a witness, not only a call site. `verifyCount`
  (`packages/genesis/src/verify-count.ts:84-90`) proves the same lower-bound over the same witness set. Under
  this predicate, unsoundness means: admitted, but tsc finds ZERO reference occurrence of the target in the
  flipped scope.
- **Definition B — mismatch vs the bench's CALL label.** `isCallee` (`packages/adapter-io/test/support/
neg-bench-lib.ts:81-84`) labels a fact FALSE only when the target has no `CallExpression`/`NewExpression`
  callee occurrence in scope — it does not check references. A row can be Definition-B-"false" (no call) while
  being Definition-A-true (a real reference exists) at the same time; that gap is a **labelling mismatch
  between what the bench calls "false" and what the gate proves**, not a case where the gate admitted something
  it cannot back with a witness.

| arm        | Def A — unsound (0 reference witness, gate's own predicate)                                   | Def B — mismatch vs bench's CALL label | recallTrue        | n     |
| ---------- | --------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------- | ----- |
| count      | 0/163 = 0.00%                                                                                 | 9/163 = 5.52%                          | 163/163 = 100.00% | 326   |
| relation   | n/a — `admitRelation` states no truth predicate (see below), so nothing to be unsound against | 452/452 = 100.00%                      | 452/452 = 100.00% | 904   |
| dependency | 0/23702 = 0.00%                                                                               | 309/23702 = 1.30%                      | 163/163 = 100.00% | 23865 |
| negation   | 0/163 = 0.00%                                                                                 | 0/163 = 0.00%                          | 428/1200 = 35.67% | 1363  |

**Every Definition-B row was adjudicated line-by-line against the code (cold-seat verified, spot-cold-checked
against source) and found to be a definitional gap, not unsoundness:**

- **Dependency, all 309 rows:** 309/309 have a real, non-definition SCIP `reference` occurrence of the target in
  the flipped scope (corroborated independently by tsc's own `refFiles`); 0/309 have a call
  (`CallExpression`/`NewExpression` callee) in that scope. The 2 rows that also trip the bench's separate
  global-call proxy check (`callFiles>0` somewhere in the whole program, not necessarily in-scope) are
  `isGrounded` — witnessed by the import at `packages/adapter-io/src/compose.ts:24`
  (`import { bindGate, isGrounded, driftDetect } from '@atlas/grounding';`) — and `DegenerateAnchorError` —
  witnessed by the import at `packages/adapter-io/src/governed-promote.ts:54` and the `instanceof` operand at
  `:111`. Both witnesses are references, never calls; both are the SAME kind of gap as the other 307, not a
  distinct residual unsoundness.
- **Count, all 9 rows:** each is a boundary case where `atLeast == (in-scope call count) + 1` while in-scope
  _references_ (the gate's actual witness set) `>= atLeast` — i.e. the gate correctly proves a reference-bound
  the bench's call-only oracle cannot see. 9/9.
- **Relation, all 452 rows:** `admitRelation` (`packages/genesis/src/admit-harness.ts:217-221`) applies no
  direction/truth door at all beyond well-formedness + endpoint grounding — every relation proposal driven is
  admitted (904 driven, 904 admitted), so relation's falseAdmit and recallTrue are the same underlying count
  restated two ways, not two independent measurements. There is no stated truth predicate to be unsound
  against, so Definition A is `n/a` for this arm, not `0`.

**Negation TEETH (gate OFF): 0/163 = 0.00%** (near-zero — matches the doc's characterization that on a dist-form
index `canonicalizeSymbol` bridges most cross-package refs so the opaque gate rarely fires; the doc's own figure
for this is 0.66% on an earlier snapshot, this run measured 0.00%, same direction/order of magnitude). **Open
finding, NOT fixed here:** because both the gate-ON and gate-OFF negation false-admit are 0/163 on this
build+index, the shipped non-vacuity assertion at `packages/adapter-io/test/semantic-bench.test.ts:252`
(`expect(teeth.negation.falseAdmit!).toBeGreaterThan(s.negation.falseAdmit!)`) reduces to
`expect(0).toBeGreaterThan(0)` on this exact state — i.e. negation's 0-false-admit is currently proven
non-vacuous by _nothing_ on the operating (dist-form) index, only on the dist-absent misbuild (Table 1, where
gate-OFF is 132/163 = 80.98% > 0). This report does not diagnose or fix it; another seat is triaging it.

**Shipped test suite result on this build: RED.** `AC-6` fails on the first Definition-B dependency row it
walks (`isGrounded`) because the shipped assertion checks `callFiles`, not references — this is the assertion
enforcing Definition B, not Definition A. `count`'s Def-B 9/163 = 5.52% is also nonzero; the shipped `it()`
never reaches that assertion because it throws earlier in the dependency loop, but the printed number is real.
Table 1's dependency/count numbers (18/23702, 0/163) were **not** row-level adjudicated the way Table 2's were
— this report does not know whether Table 1's 18 dependency mismatches are the same definitional-gap pattern or
something else; flagged as unconfirmed, not asserted either way.

## The finding this run surfaced

**On the dist-form (operating, intended) index at git sha `9eb4d7f`, the shipped door's `AC-6` assertion
(which checks Definition B, the bench's CALL label) fails for `dependency` and `count`.** Under Definition A —
the gate's own documented predicate, witnessed reference-existence — the door is **0-false-admit for all three
structural arms measured** (`dependency` 0/23702, `count` 0/163, `negation` 0/163); `relation` states no truth
predicate to check. `docs/design/95-benchmark-methodology.md`'s claim ("Dependency and count are 0-false-admit
by a witnessed-existence oracle, sound in any world") **holds** under the predicate it names (witnessed
reference-existence); it does not hold under the bench's stricter, undocumented call-only label, and that gap
is what `AC-6` (written to Definition B) surfaces as a failure. This is reported as a measured fact, not
diagnosed or fixed here — WP-B2 is measurement, not a build task. The fixture pin's `substrate.rev` field
(`e35dcce`) is an older commit than this worktree's HEAD; nothing in the instrument enforces the checked-out src
matches that annotation (only the synthetic self-proof fixture bytes are hash-pinned), so this drift between the
pinned rev and current master is the likely reason the shipped AC-6 comments (citing `17/23577` residual
dependency false-admits, all oracle-gap) no longer match this run's Definition-B counts (`18/23702` dist-absent,
`309/23702` dist-form).

## Scope-limit disclaimer (from `bench-scorer.ts`, `SCOPE_LIMIT_DISCLAIMER`)

> SOUND HEADLINE = structural arms only (count / dependency / negation vs the independent tsc oracle). The
> relation arm is MEASURED, not guaranteed (no direction oracle). Semantic slots (invariant / sideeffect / …)
> tsc cannot witness are NOT sound-labeled and are routed to the labeled spot-audit, never the sound headline.

`relation`'s 100%/100% in both tables is a construction artifact: `admitRelation` has no direction check, so a
reversed edge grounds identically to the true one and is always admitted — this is neither evidence of
soundness nor unsoundness, just the shape of a gate that does not check direction.

## Honest limits

- This is recall over **planted mutations on a fixture**, not recall over arbitrary real-world facts.
- Covers only the 4 oracle-bearing shapes. Advisory/predicate prose has **no sound oracle** and is not measured
  here — see `calibration-report.a1-subject.md` for that shape's separate precision number (planted subject-test,
  not this instrument).
- Recall is index-build-dependent by roughly an order of magnitude (count/dependency 4.29% → 100%, negation
  4.25% → 35.67%), confirming the doc's warning holds at this rev too — a bare recall percentage without its
  build recipe is not a citable number.
- This report measures ONE git sha and TWO index builds (the two states the doc's own example names); it does
  not sweep git history or alternate indexers.
- **Amended below (WP-C3, 2026-08-18):** why `isGrounded`/`DegenerateAnchorError` and `count` false-admit
  (Definition B) on a dist-form index is now diagnosed — see the "Definition A / Definition B" table and
  adjudication above. All 318 Definition-B rows (309 dependency + 9 count) trace to a labelling gap (bench
  checks calls, gate proves references); 0/318 are unwitnessed admits under the gate's own predicate.
- **Still open (not fixed here):** negation's `AC-6` non-vacuity teeth (`semantic-bench.test.ts:252`) is proven
  by _nothing_ on the dist-form (operating) index at this rev — both gate-ON and gate-OFF false-admit are 0/163
  there, so the assertion reduces to `expect(0).toBeGreaterThan(0)`. Non-vacuity for negation is currently
  demonstrated only on the dist-absent misbuild (Table 1). Flagged for the code owner (another seat is
  triaging it), not diagnosed further here.

## What the brief got wrong (framing errors against the code)

1. The brief said the test "currently only `console.log`s these" numbers and asked for the smallest capture
   change. That's accurate — the shipped test prints only percentages + `n`, no numerator/denominator. Rather
   than editing the shipped test, I added two throwaway, **uncommitted** vitest files under
   `packages/adapter-io/test/_tmp-*.test.ts` that re-implement the exact same accumulation `bench-scorer.ts`
   already does (to recover the raw numerators the console.log omits), ran them, captured stdout, then deleted
   them before this commit — **zero diff to the shipped instrument** (smaller than even a comment-only edit).
2. The brief framed the dist-form/dist-absent trap as being about RECALL swinging (per the doc's own example).
   That's true, but this run surfaced a second effect the brief did not anticipate: on the dist-form (operating)
   index at current `HEAD`, the shipped `AC-6` assertion is **no longer green** for `dependency` and `count`.
   **Correction (WP-C3, 2026-08-18):** the phrase "a soundness finding, not just a recall swing" written here
   was itself an overclaim in the pessimistic direction. Line-by-line adjudication of all 318 flagged rows
   (see the Definition A / Definition B table above) found `AC-6` fails because it checks call-existence, a
   _stricter and undocumented_ label than the gate's own witnessed-reference-existence predicate — 0/318 rows
   are admitted without a witness under the predicate the gate actually implements. It is a labelling-vs-gate
   mismatch (Definition B), not evidence the door admits an unwitnessed fact (Definition A, 0/318). This
   report's own framing needed the same correction it was written to apply to the methodology doc.
3. The fixture pin's `substrate.rev: e35dcce` is stale relative to this worktree's `master` (`9eb4d7f`); nothing
   in the instrument enforces that match (only the synthetic fixture bytes are hash-pinned). This report is for
   `9eb4d7f`, and the mismatch vs the shipped test's own code-comment numbers (`17/23577` etc.) traces to that
   drift plus the Definition-B labelling gap above (corrected in item 2), not to an error in this report's
   method.

## WP-C3 amendment (2026-08-18) — false-admit under two named definitions

**Why:** the version of this report committed at `99575cd` reported `dependency falseAdmit=1.30%` and `count
falseAdmit=5.52%` as bare rates. A subsequent line-by-line adjudication of all 318 of those Table-2 rows
(cold-seat verified, spot-cold-checked against source by the requesting seat) established that **0/318 are
genuine unsoundness** — every one is the gap between the bench's call-only label (`isCallee`,
`neg-bench-lib.ts:81-84`) and the gate's documented reference-existence predicate (`verify-fact.ts:96`,
`symbol-reverse.ts:120`, `verify-count.ts:84-90`). Left as a bare rate, the committed report reads as "the sound
gate admits false facts 1.30% of the time" — false. Understating soundness is the same category of error as
overstating it (see item 2's self-correction above), so this amendment does not delete the original committed
numbers or narrative; it adds the Definition A / Definition B split, the row-level adjudication, and the
negation-teeth open finding (`semantic-bench.test.ts:252`) that make the numbers unambiguous. **What this
amendment changed:** Table 2's false-admit presentation (single rate → two named definitions + adjudication),
the "critical finding" section heading and claim (soundness regression → labelling-gap surfaced by an
assertion written to the stricter definition), the "Honest limits" bullet on the un-diagnosed call-eligible
rows (now diagnosed), and item 2 of "What the brief got wrong" (self-corrected in place). **What this amendment
did NOT change:** recall figures (unaffected by this question), the reproduction recipe, both build-state
tables' existence, the fixture-pin drift finding, or Table 1's raw numbers (not row-level adjudicated in this
pass — flagged as unconfirmed, not reclassified). No bench run was repeated for this amendment; all figures
trace to the artifact already committed at `99575cd` plus code read at the file:line citations above.
