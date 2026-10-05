# #95 — Benchmark results: Atlas on four axes, with every number's denominator

**Status:** rewritten 2026-08-18 to reconcile with four artifacts that landed AFTER the first version of this
document (2026-08-16) and contradicted it: the honest A2 re-report (#190), the `proven`-is-reference
correction (#191), the judge-free planted A4 recall report (#196b/WP-B2+C3), and the dead-assertion repair in
the semantic bench (#192). Method: [`95-benchmark-methodology.md`](95-benchmark-methodology.md) — the LLM is
the SUBJECT, ground truth is planted by construction, and no LLM judge sits in a correctness loop where a
mechanical oracle exists. Model held at `claude-sonnet-5` wherever a model is in the loop.

**Reading rule for this document:** every figure appears as `numerator/denominator` with the file it is read
from, so it can be re-derived rather than quoted. Where a figure is a _derivation_ from a published percentage
rather than a printed count, it says so. Where the source is a branch not yet merged to `master`, the branch is
named.

## The scoreboard

| Axis                                                                                                                                                            | The number, with its denominator                                                                                                                                                                                                                                                                                        | Source artifact (read, not remembered)                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **A1 — advisory precision** (planted subject-test, no judge in the correctness loop)                                                                            | false-admit **1/10**, catch **9/10**, false-alarm **0/10**; n=20 fixtures; Wilson95% on false-admit **[0.018, 0.404]**                                                                                                                                                                                                  | `harness/probes/adjudicate/calibration-report.a1-subject.md`                                                                        |
| **A1-dogfood — advisory precision, whole repo** (LLM-panel, same-family, **cross-family-corroborated**, lower evidentiary tier — never blended with planted A1) | **616/657 = 93.8%** TRUE_GROUNDED, Wilson95% **[91.6, 95.4]**; 9 FALSE (1.4%), 31 NOT_GROUNDED; 20/677 abstained. Panel precision **98.7% (75/76)** vs a blind reasoned 4th seat on an 83-item systematic sample — panel under-credits, does not inflate                                                                | `a1-dogfood-verdicts.tsv` (657 rows) + `a1-dogfood-fullrepo.json` + `gold-seat4.tsv` / `gold-adjudication.tsv` / `gold-seat4.json`  |
| **A1-dogfood — CROSS-REPO** (same apparatus, third-party repo `colinhacks/zod` v3.23.8; removes home-field advantage; same-family-judged)                       | **66/76 = 86.8%** TRUE_GROUNDED, Wilson95% **[77.4, 92.7]**; 7 FALSE (9.2%, real proposer hallucination, 2 mechanically verified), 2 NOT_GROUNDED; 7/83 abstained. **Home was optimistic by ~7pts (93.8→86.8)**                                                                                                         | `xrepo-zod-a1-verdicts.tsv` (76 rows) + `xrepo-zod-a1.json`                                                                         |
| **SOTA comparator — proven dependency arm** (vs madge 6.1.0, deterministic, 0 tokens, on zod)                                                                   | Atlas **231** proven edges ⊇ madge **129**: **recall 100% (129/129)**, madge-only **0**; the 102 Atlas-only edges are real semantic (barrel-pierced) deps madge's syntactic graph cannot model                                                                                                                          | `xrepo-zod-sota-comparator.json` + `xrepo-zod-depgraph-compare.json`                                                                |
| **A2 — staleness** (TWO numbers, never blended)                                                                                                                 | non-touching precision **4/4** (0 false-drift, real and discriminating) · semantic cross-file staleness **NOT SUPPORTED** (named limitation)                                                                                                                                                                            | `docs/design/95b-staleness-a2-methodology.md` §6.2/§6.3                                                                             |
| **A3 — cost**                                                                                                                                                   | **$0.964233 / 10 sites = $0.0964 per site**; 0 errors, 1 abstention, all 10 rows `claude-sonnet-5`                                                                                                                                                                                                                      | `harness/probes/a3-cost-sidecar.jsonl` (10 records; sum re-derived 2026-08-18)                                                      |
| **A4 — recall, judge-free** (4 oracle-bearing shapes, planted mutations, `tsc` oracle)                                                                          | dist-form index: count **163/163**, dependency **163/163**, negation **428/1200 = 35.67%**; dist-absent misbuild: count **7/163**, dependency **7/163**, negation **51/1200 = 4.25%**                                                                                                                                   | `harness/probes/adjudicate/calibration-report.a4-planted.md` (`master`, merged in #193; numbers re-verified on `master` 2026-08-22) |
| **A4 — test-vacuity, judge-free planted** (5th oracle-bearing shape, planted mutations, AST/tree-sitter oracle)                                                 | false-admit **0/10 = 0.00%** · recall **10/10 = 100.00%** across **10 real idioms** (jest / node:assert / chai / ava); n=20; labels from the mutation record, no oracle in the label path. Cited-not-committed: ~32 real `assertion-only-in-catch` tests proven on zod v3.23.8 (PRIOR, not re-derivable, never blended) | `harness/probes/adjudicate/calibration-report.a4-test-vacuity.md` (`claude/a4-test-vacuity`)                                        |
| **A4 — agreement@pool (NOT recall)**                                                                                                                            | atlas **10/64** · ungated raw-LLM lister **63/64** · comment-extractor **2/64**, where the denominator 64 is 100% same-family-LLM-judge `GROUNDED_TRUE` verdicts                                                                                                                                                        | `harness/probes/a4-agreement-pool-pilot.json`                                                                                       |
| **Sound-gate false-admit** (the strong claim)                                                                                                                   | Definition A (gate's own witnessed-reference predicate): dependency **0/23702**, count **0/163**, negation **0/163**                                                                                                                                                                                                    | `calibration-report.a4-planted.md` Table 2 (`master`)                                                                               |

There is no cross-vendor SOTA column. The only comparator this program has ever run is the ungated raw-LLM
lister inside the agreement pool, and its figures are the same uncalibrated judge's opinion as everything else
in that row — see A4-agreement below.

## The one honest sentence

**Atlas's defensible claim is soundness on the shapes that have a mechanical oracle, plus a re-runnable
byte-level freshness check — not recall, and not semantic freshness.** On the four oracle-bearing shapes the
admission gate is 0-false-admit under its own documented predicate (dependency 0/23702, count 0/163, negation
0/163), which no ungated lister can claim at all; the drift oracle adds 0 false-drift on 4/4 non-touching
edits, a property a plain list of sentences structurally cannot have. Everything outside that: advisory prose
has no oracle (its precision is the 1/10 planted false-admit, n=20), recall on advisory prose has never been
measured judge-free, and semantic cross-file staleness is **not detected at all**.

## Per-axis detail and caveats

### A1 — advisory precision (`master`)

The subject-test scores one faculty — the LLM's ability to reject a false claim about code — against
**planted-false** fixtures, scored by string-compare against the planted label, so no LLM judge decides
correctness. From `calibration-report.a1-subject.md`: false-admit **1/10 = 0.100** (Wilson95%
[0.018, 0.404]), catch **9/10**, false-alarm **0/10**, n=20 (10 true + 10 planted-false). Frozen instrument:
`harness/probes/adjudicate/fixtures.mjs`, sha256[:16] `01c7bc130eb7f384`. The single leak is `F03`
(`const ABSTAIN = 'NO-FACT'` mis-read as sentinel `"ABSTAIN"` — the name-vs-value confusion class).

**Correction to the 2026-08-16 version of this document.** It reported _"A1 precision **1.00** on real facts
(10/10 adjudicated true)"_ as a headline. That figure is `harness/probes/a4-agreement-pool-pilot.json`:
10 of 10 atlas-sourced clusters were called `GROUNDED_TRUE` by the same-family judge described below. It is
**judge agreement on 10 clusters, not measured precision**, and it is not a headline. Retained here as what it
is: `judge_called_true_per_miner.atlas = 10/10` in that artifact.

Caveats that stand: n=20; fixtures are synthetic-clean by design (you can only plant a false if you know the
truth); the interval, not the point, is the claim.

### A1-dogfood — advisory precision on the WHOLE repo, LLM-panel-judged (`master`, 2026-08-23)

The planted subject-test above scores one faculty on 20 synthetic fixtures. This is the complementary
measurement it cannot give: **let genesis mine the entire Atlas repo and measure how many of the facts it
actually emits are true and grounded.** It is a _weaker evidentiary class_ than every judge-free number in
this document — an LLM panel decides correctness here, because on free-form advisory claims no mechanical
oracle exists. It is labelled `A1-dogfood` and never blended with the planted A1.

**Method.** Proposer = `claude-sonnet-5` (reasoning effort medium) answering the frozen v3 propose prompt at
each of the **677** advisory sites the repo enumerates, via the shipped capture/replay path (no `claude -p` in
the loop; model answers are captured artifacts). Judge = **3× `claude-sonnet-5`, blind and independent**
(each sees only the unit bytes + the one claim — no proposer reasoning, no other judge, no provenance),
majority-of-3, over the **complete 657×3 grid** (every emitted fact judged by all three; 0 gaps).

**Numbers** (from `harness/probes/adjudicate/a1-dogfood-fullrepo.json`):

| quantity                                               | count                                           |
| ------------------------------------------------------ | ----------------------------------------------- |
| sites enumerated                                       | 677                                             |
| facts emitted (rest are `NO-FACT` abstentions)         | **657/677** (20 abstained)                      |
| **TRUE_GROUNDED**                                      | 616                                             |
| FALSE (contradicted / miscounted / mislabelled)        | **9**                                           |
| NOT_GROUNDED (true but leans on bytes not in the unit) | 31                                              |
| UNSURE                                                 | 1                                               |
| **A1-dogfood precision**                               | **616/657 = 93.8%**, Wilson95% **[91.6, 95.4]** |
| unanimous 3/3                                          | 604/657 (92%)                                   |

**Judge-robustness (why the panel is not the story).** Each judge _alone_ scores TRUE_GROUNDED at
93.2% / 93.6% / 93.3% — the number is invariant to which single judge you trust, and 92% of items are
unanimous. The panel corrects noise, it does not manufacture the result.

**The 9 FALSE, by class** — every one is a specific, checkable error, which is what makes them FALSE rather
than vague: over-strong exact enumerations that miscount (`reinvoke` exported surface, negation fold ordering,
the "only kind without a `site` field" claim in `admit-proposals.ts`), a substring-satisfied assertion read as
semantic (`s26-query-description`: `toContain('advisory')` already met by `advisoryDropped`), and a
mislabelled return-invariant (`ownership.test.ts` `reconcileModelCalls()` claim). Full list with per-judge
votes in the artifact.

**The honest headline: scale lowered the number, and that is the finding.** An earlier stratified 57-site
sample (proposer `ox-alpha`, same judge apparatus) read **98.2%** — optimistically high. The full-repo
Sonnet run reads **93.8%**, with 9 genuinely false claims (1.4%) that only surface across the long tail of
real units. The sample was not wrong; it was small. The full run is what "measured for real" means.

**Caveats that stand:** LLM-panel-judged (advisory strength, _not_ proof — this is why it is a separate,
lower-tier row, never mixed with the planted/`tsc`-oracle numbers); precision-per-emitted (abstention fired on
20/677 sites, so this is not a recall number).

**The same-family limit, and the cross-family corroboration that now bounds it.** The judge is the same model
family as the proposer (Sonnet judging a Sonnet proposer's claims). The methodology doc's own literature
(κ≈0.10–0.21 judge-vs-oracle, same-family self-preference) says a same-family panel measures _self-consistency_,
not truth — the same objection that demoted the earlier 96.7% self-verification number. Making the panel
_complete_ (the full 657×3 grid) and _stable_ (per-judge 93.2/93.6/93.3) reduces noise, not this bias.

To bound the bias, an **independent, blind, reasoned fourth seat** — out-of-instrument: not the Sonnet
proposer and not the Sonnet judge panel — adjudicated an **83-item systematic sample** (every 8th of the
sorted 657, deterministic selector). Against that seat:

- **Panel precision = 75/76 = 98.7%.** Of the 76 facts the Sonnet panel called TRUE_GROUNDED, 75 are
  seat-confirmed. **The panel does not inflate.**
- The single over-credit is `924bd913` (`scrub-shapes.ts`), a genesis miscount **mechanically verified false**
  (`FAMILIES` has four openers `g/x/g/A`; `github-token` and `github-pat` share `g`, so the claim "the other
  three families' distinct opening bytes" is false). That is the bench catching a real false fact, not a judge error.
- The other five panel/seat discordances are all in the **conservative** direction — panel `NOT_GROUNDED`
  where the seat accepted `TRUE_GROUNDED`, or both reject. None is a panel over-credit. So **93.8% is, if
  anything, an under-count**: the panel under-credits truth, it does not inflate it.
- A stack of _free-tier_ cross-family LLM judges (mistral/ox-alpha/nemotron/laguna via `hugr-router`) does
  **not** substitute for the reasoned seat — against the same 83 items mistral called only 56/83 `TRUE_GROUNDED`
  (κ≈−0.02 vs the seat, worse than chance: it rejects _true_ facts, which is what earlier looked like "the
  panel inflates"), and laguna rubber-stamps. Stacking cheap LLM judges does not converge on truth; the reasoned
  seat is the anchor.

**The honest residue.** The fourth seat breaks _same-family_ circularity in either case, but its provenance —
strong non-Sonnet model vs. human — is recorded as **UNRESOLVED**; only if it is human is this true ground
truth rather than cross-instrument corroboration. So the qualifier on the headline changes from "same-family,
cross-family pass open" to **"same-family panel, cross-family-corroborated (98.7% panel precision vs a blind
reasoned seat on an 83-item systematic sample)"** — the `93.8%` should still never travel without that clause,
and it is corroborated, not yet a bare external headline. Artifacts (re-derivable):
`harness/probes/adjudicate/gold-seat4.tsv` (the seat), `gold-adjudication.tsv` (the full panel-vs-seat-vs-free
grid), `gold-seat4.json` (the computation).

**Auditability (re-derivable, not trust-the-summary).** Every one of the 657 verdicts is committed, not just
the 9 FALSE: `harness/probes/adjudicate/a1-dogfood-verdicts.tsv` is one row per fact —
`sha · path · j1 · j2 · j3 · majority · claim` — so the headline recomputes with
`awk -F'\t' 'NR>1{c[$6]++} END{for(k in c)print k,c[k]}'` (→ TRUE_GROUNDED 616, FALSE 9, NOT_GROUNDED 31,
UNSURE 1). Summary + the 9 FALSE with votes: `harness/probes/adjudicate/a1-dogfood-fullrepo.json`. The
proposer answers are `claude-sonnet-5` capture artifacts; the run is replay-deterministic given them, but the
answer corpus itself is not committed to this repo (it lives in the run scratchpad) — a known auditability
limit shared with the capture/replay probes, stated here rather than left implicit.

### A1-dogfood — CROSS-REPO: the same apparatus off home field (`master`, 2026-08-24)

Atlas-on-Atlas is a dogfood, and a dogfood can be flattered by home advantage — the proposer and the judge
both know Atlas's conventions. So the identical apparatus (real `atlas mine` advisory slot →
capture/replay → Sonnet proposer effort-medium → 3 blind Sonnet judges, majority-3) was pointed at a
**third-party repo**: **`colinhacks/zod` v3.23.8** (`ca42965`), indexed with `scip-typescript` 0.4.0. Nothing
changed but the target repo.

| metric (zod, advisory slot)           | value                                         |
| ------------------------------------- | --------------------------------------------- |
| sites visited                         | 83                                            |
| facts emitted / abstained             | 76 / 7 (emit 91.6%)                           |
| **A1-dogfood precision (cross-repo)** | **66/76 = 86.8%**, Wilson95% **[77.4, 92.7]** |
| FALSE / NOT_GROUNDED / UNSURE         | 7 (9.2%) / 2 / 1                              |
| unanimous                             | 67/76                                         |
| per-judge TG                          | 88.2 / 85.5 / 85.5%                           |

**The home number was optimistic by ~7 points.** Off home field the precision drops **93.8% → 86.8%**. This
86.8% is the more externally-valid figure (still same-family-judged; no reasoned 4th seat has been run on
zod). The drop is **real proposer hallucination on dense unfamiliar test files, not judge noise** (67/76
unanimous). Two of the 7 FALSE are mechanically verified: `ffc0cbfe` (`partials.test.ts:252` asserts
`.success).toBe(false)`, but the claim said `success === true` — the proposer inverted the boolean) and
`dd7f1aed` (`base.test.ts` contains only a `type guard` and a `test this binding` test; the claim describes a
`parse dateSchema invalid date` test that does not exist — a whole test confabulated). The same-family panel's
grounding discipline caught them. Artifacts: `harness/probes/adjudicate/xrepo-zod-a1-verdicts.tsv` (76 rows,
re-derivable) + `xrepo-zod-a1.json`.

### SOTA comparator — the PROVEN dependency arm vs an independent tool (`master`, 2026-08-24)

The earlier comparator ladder used a no-tool LLM as the floor — a jury called it a strawman. This is the
answer for the **proven** arm (`#99` `depends-on`): compare Atlas's proven dependency edges against a real,
established code-intelligence tool, **both sides mechanical, zero LLM, zero tokens**. Atlas edges come from
`atlas derive-relations` (the derivation _is_ the proof); the reference is **madge 6.1.0**
(`madge --ts-config tsconfig.json --extensions ts --json src`). Target: the same third-party repo, `zod`
v3.23.8.

|                                   | edges                              |
| --------------------------------- | ---------------------------------- |
| Atlas proven (`derive-relations`) | **231**                            |
| madge 6.1.0                       | 129                                |
| intersection                      | 129                                |
| **recall vs madge**               | **129/129 = 100%** (Atlas ⊇ madge) |
| madge-only (Atlas missed)         | **0**                              |
| Atlas-only                        | 102                                |

**Atlas finds everything madge finds, and 102 edges more — and those 102 are real, not false.** madge builds
a **syntactic import-statement graph** (it stops at the imported barrel); Atlas builds a **semantic
symbol→definition graph** (it pierces the barrel to the definition site via SCIP witnessed references). Worked
example: `safeparse.test.ts` imports only `../index`, but calls `z.string()` whose definition lives in
`src/types.ts`; `index.ts` does `export * from "./external"` and `external.ts` does `export * from "./types"`,
so Atlas's `safeparse.test.ts → types.ts` edge is a **true transitive symbol dependency madge structurally
cannot represent**. All 102 Atlas-only targets (types 64, ZodError 21, external 9, index 5, errors/util/en 1
each) are exactly the definition sites reachable through the `index → external` re-export chain.

**So "precision 55.8%" (129/231) would be the WRONG metric** — it penalizes Atlas for correctly resolving
re-export barrels to true definition sites. The two tools define "depends-on" differently (syntactic vs
semantic); Atlas's extra edges are correct-by-construction (`#99` witnessed reference), not false. **Honest
caveat:** the barrel-piercing _mechanism_ was verified (the re-export chain, three sampled sources importing
the barrel, and the `#99` witnessed-reference guarantee), not each of the 102 edges hand-traced; a stronger
import-graph tool (`dependency-cruiser`) would behave like madge here (edge-per-import-statement, no barrel
collapse), so semantic-vs-syntactic is the finding, not a madge weakness. Artifacts:
`harness/probes/adjudicate/xrepo-zod-sota-comparator.json` + `xrepo-zod-depgraph-compare.json` (the full
edge lists).

### Grow proven / shrink advisory — the ceiling, measured (`master`, 2026-08-24)

A jury asked for the proven tier to grow and the advisory tier to shrink. This measures the _ceiling_: of the
76 advisory facts genesis mined on zod, how many could move to a 0-false proven arm, and where does the next
sound-shape investment pay off? Each claim was classified by its SHAPE against the four existing sound shapes
(`depends-on` / `count` / `negation` / `transition`):

| bucket        | count | meaning                                                           |
| ------------- | ----- | ----------------------------------------------------------------- |
| **EXISTING**  | 1     | provable NOW by an existing sound shape                           |
| **NEW_SHAPE** | 21    | structural (AST-checkable) but needs a new sound shape            |
| **SEMANTIC**  | 54    | irreducibly semantic — no mechanical oracle over one unit's bytes |

**Shrink ceiling ≈ 29% (22/76); the other ≈71% is genuinely semantic.** The 54 SEMANTIC claims are almost all
about zod's OWN runtime behavior (`parse` accepts / rejects / throws / coerces) — not mechanizable from the
shown bytes. So the advisory tier is **not reducible by reclassification**; shrinking it means _building new
sound shapes_, exactly as the `transition` shape (`#234`) already did once.

**Why advisory is the hard residue.** `depends-on` and `count` claims are ~0 in the advisory slot because
those shapes already route to the proven arm (separate mine slots). Advisory is **by design** the semantic
leftover — which is why its 86.8% precision is measured on the genuinely-hard claims.

**Highest-leverage next shape: test-vacuity.** ~9 of the 21 NEW_SHAPE claims are one family —
`no-assertion-in-test` (3), `assertion-only-in-catch` (2), `unasserted-parse-call` (2), `commented-out-tests`
(2). A single AST oracle ("every non-exceptional path in a test body carries an assertion") would convert the
largest structural cluster to proven. Suggestive: one of the two mechanically-verified cross-repo FALSEs
(`dd7f1aed`) lands in exactly this family — the shape that would most grow the proven arm is also where genesis
most confabulates on test files.

**Honesty.** This is an ESTIMATE, not a law: one repo (zod), one LLM classifier over claim _text_ (not the
source). Artifacts: `harness/probes/adjudicate/xrepo-zod-shape-census.tsv` (76 rows) + `xrepo-zod-shape-census.json`.

### A2 — staleness (`master`, per #190)

**Report two numbers, never one blended score** (`95b-staleness-a2-methodology.md` §6):

1. **non-touching precision `4/4` (0 false-drift) — MEASURED and discriminating.** All four fact-preserving
   edits (line added above the unit, non-contiguous header comment, sibling-unit edit, Unicode NFD→NFC
   rewrite) stayed FRESH under the shipped `driftDetect` via real `reDerives`. This is the real number:
   §6.2's teeth show every dumb byte-level mutant fails at least one of these four, and `P4` (NFD→NFC, where
   the bytes literally differ but the string is canonically equal) is failed by every mutant that looks at
   bytes at all.
2. **semantic cross-file staleness: NOT SUPPORTED — a named limitation with a falsifying example.**
   `driftDetect` folds only the anchor's own subtree hash and never scans the dependency axis, so a fact can
   become FALSE with its anchored bytes byte-for-byte unchanged and `reDerives` still reports FRESH. §6.3's
   counter-example: a fact "`sortedNames()` returns sorted" whose sorting actually happens in a delegated
   helper — drop the helper's `.sort()` and the fact is false while its anchor's hash is identical.

**Correction to the 2026-08-16 version of this document.** It headlined _"true-stale caught 6/6"_ as evidence
the oracle catches staleness and called this axis "the moat". §6.1 retires that reading: every `invalidating`
corpus entry is by construction a byte edit inside the hashed extent, so `bytes changed ⇒ hash changed ⇒
DRIFTED` holds for any hash function — and the committed teeth matrix shows a trivial `always-DRIFTED`
constant, which never looks at its input, scoring the identical **6/6**. `6/6` is a theorem about the corpus's
own construction, not a measurement of the oracle, and must not be published on its own. Re-derive both the
matrix and this claim: `node harness/probes/a2-staleness-teeth.mjs` (and the confusion matrix itself with
`node harness/probes/a2-staleness.mjs`).

Scope, unchanged: n=10 corpus, own-anchor byte granularity only; the callee/interface `freshness()` leg is
excluded because it has zero production callers (§3); negation staleness is out of corpus (§3).

### A3 — cost (`master`)

`harness/probes/metered-claude.mjs` is a drop-in `propose.cmd` running the real
`claude -p ... --output-format json` and recording the CLI's own `total_cost_usd` per site;
`harness/probes/cost-sum.mjs` rolls it up. Re-derived from the 10 committed records in
`harness/probes/a3-cost-sidecar.jsonl` on 2026-08-18: **sum $0.964233 over 10 sites = $0.0964/site**,
`is_error` true on **0/10**, `abstained` true on **1/10**, `model` = `claude-sonnet-5` on 10/10.

Caveat, load-bearing: **cost is operator-config-dependent.** $0.0964/site is the figure for a `claude -p`
(Claude Code CLI) `propose.cmd`, which carries its own large system prompt; a bare-API operator would be
cheaper. The price is the CLI's own reported cost, not an assumed rate card. An earlier hand estimate of
~$0.003/site was wrong-low by ~32×, which is why this axis is measured rather than estimated.

### A4 — recall, the judge-free number (`master`, merged in #193)

The citable recall figures are the planted ones: ground truth planted by **edit-distance-1 mutation** and
labelled by an **independent `tsc` oracle** (`ts.createProgram`), with zero LLM in the label or scoring path.
Read from `harness/probes/adjudicate/calibration-report.a4-planted.md` (on `master`; measured at git sha
`9eb4d7f`; node v22.17.1, TypeScript 5.9.3, `@sourcegraph/scip-typescript` 0.4.0; recall rates re-verified
identical on `master` 2026-08-22):

| arm        | recall (dist-FORM index, the operating state) | recall (dist-ABSENT index, a misbuild) | false-admit, Definition A                       | false-admit, Definition B |
| ---------- | --------------------------------------------- | -------------------------------------- | ----------------------------------------------- | ------------------------- |
| count      | 163/163 = 100%                                | 7/163 = 4.29%                          | 0/163                                           | 9/163 = 5.52%             |
| dependency | 163/163 = 100%                                | 7/163 = 4.29%                          | 0/23702                                         | 309/23702 = 1.30%         |
| negation   | 428/1200 = 35.67%                             | 51/1200 = 4.25%                        | 0/163                                           | 0/163                     |
| relation   | 452/452 = 100% (construction artifact)        | 452/452 = 100%                         | n/a — `admitRelation` states no truth predicate | 452/452 = 100%            |

Three things this table needs to be read correctly:

- **The two false-admit definitions are not interchangeable.** _Definition A_ is unsoundness under the gate's
  own documented predicate: admitted while `tsc` finds ZERO reference occurrence of the target in the flipped
  scope. _Definition B_ is a mismatch against the bench's stricter, undocumented CALL-only label (`isCallee`,
  `packages/adapter-io/test/support/neg-bench-lib.ts:81-84`). All **318** Definition-B rows (309 dependency +
  9 count) were adjudicated line-by-line in that report and **0/318 are genuine unsoundness** — each has a
  real in-scope SCIP `reference` witness and no in-scope call.
- **`proven` means witnessed REFERENCE existence, not a call graph** (#191,
  `95-benchmark-methodology.md`): `reverseCallers` (`packages/index/src/symbol-reverse.ts`) counts any SCIP
  `reference` occurrence — imports, type-only positions, `instanceof` operands, re-exports. The oracle proves
  "B is referenced from scope A", never "A calls B". Definition B exists precisely because the bench asked a
  question the gate never claimed to answer.
- **Recall is index-BUILD-dependent by roughly an order of magnitude** (count/dependency 4.29% → 100%,
  negation 4.25% → 35.67%). A bare recall percentage without its build recipe (`npx tsc -b` BEFORE
  `scip-typescript index`) is not citable. `relation`'s 100%/100% is a construction artifact: `admitRelation`
  applies no direction door, so every driven proposal is admitted (904 driven / 904 admitted) and the two
  columns restate one count.

Not covered by this instrument: advisory/predicate prose, which has no sound oracle — see A1.

### A4 — agreement@pool, formerly reported as "recall" (`master`, relabelled here)

The 2026-08-16 pilot: 10 real atlas units, 3 miners (atlas `propose.md` advisory / ungated raw-LLM lister /
mechanical comment extractor), 101 adjudicated clusters, of which **64** were called `GROUNDED_TRUE`.

| miner                          | clusters in the judge-true pool | agreement@pool |
| ------------------------------ | ------------------------------- | -------------- |
| atlas (`propose.md`, advisory) | 10/64                           | 15.6%          |
| ungated raw-LLM lister         | 63/64                           | 98.4%          |
| comment extractor              | 2/64                            | 3.1%           |

By shape, of the judge-true pool: predicate 9/44 atlas vs 43/44 lister; advisory 1/9 vs 9/9; dependency 0/4,
negation 0/6, relation 0/1 for atlas (that run drove only the advisory miner). All of these re-derive by
arithmetic from the committed `adjudicated_clusters` rows (verified 2026-08-18).

**Three corrections to the 2026-08-16 version of this document:**

1. **It is agreement, not recall.** The denominator is 100% same-family LLM-judge `GROUNDED_TRUE` verdicts
   from an uncalibrated judge (same model family as the miner; never scored against a mechanical oracle on
   this corpus). By the repo's own ratified methodology — which demotes a 29/30 = 96.7% self-verified figure
   to non-citable for exactly this reason — that measures _agreement_, not truth, and therefore not recall.
   Report it as **agreement@pool(3)**; never as recall, and never bare.
2. **The instrument attribution was false.** The old scoreboard credited the run to `harness/probes/a4-pool.mjs`.
   That driver never ran live: its own test (`a4-pool.test.mjs`) stated live mode was "PENDING and out of this
   WP's scope", it only exercised `mode:'fake'`, it keyed its corpus on FILES while the pilot artifact keys on
   `path::symbol` units, and its output shape (`{mode, modeNote, files, counts, atlasRun, pairCalls,
adjudicated, recall}`) shares no field with the artifact. The pilot is a **hand-tallied** record of per-unit
   sub-agent runs whose producing driver is not recoverable from this repo. That driver has now been deleted
   (see below).
3. **The baseline-precision figures were wrong and are judge opinion anyway.** The old text claimed the
   baseline was "~0.6 precision (one unit 13/14 false, another 8/11)". Re-derived from the artifact: the
   lister's worst unit is **13/13** false (not 13/14), the next is **8/11**, and overall the judge called
   **37/100** lister clusters false (judge-true 63/100 = 0.63). Atlas 10/10 and comment-extractor 2/2 were
   judge-true. Every one of those is the uncalibrated judge's verdict, so they belong in this section, not in
   the A1 precision row.

**Auditability limit, why this can never be upgraded in place:** `adjudicated_clusters` stores only
`{true, sources, shape}` per cluster — no fact text, no prompt, no per-call verdict log. The tallies are
arithmetic-checkable; not one verdict is adjudication-checkable. Re-measuring means a new run, not a re-score.

What survives as a _finding_ rather than a metric: on this corpus a miner asked for **one** high-value fact per
unit surfaced 10 of the 64 things a miner asked for **all** facts surfaced, while the same judge called 37 of
that lister's 100 clusters false. The design axis (frontier selection vs exhaustive listing), not the
percentage, is the transferable part.

## The A4 pooling instrument was deleted, deliberately

`harness/probes/a4-pool.mjs`, `harness/probes/a4-pool.test.mjs` and the two non-Atlas pool members it was the
only consumer of (`baseline-lister.mjs`, `comment-extractor.mjs`) are **removed** on this branch. Reasoning:

- It never measured anything. No live run exists in this repo, its own test declared live mode out of scope,
  and the only committed A4 pool artifact was demonstrably not its output (shape and corpus granularity both
  mismatch).
- Its design is method-obsolete, not merely weak: its recall denominator is an LLM dedup judge plus an LLM
  truth judge. Under the ratified methodology that pipeline cannot produce a citable recall number for any
  shape — and for the four shapes where an oracle exists, `calibration-report.a4-planted.*` already produces
  a judge-free one.
- Left in place it is a trap with a green test: the next reader finds a runnable "recall driver", spends real
  tokens on `mode:'live'`, and publishes an agreement number as recall — the exact error this document just
  had to correct.
- Deleting the driver orphaned its two pool members (no consumer, no coverage), so they went with it.

Kept instead: `harness/probes/a4-agreement-pool-pilot.json` (the renamed pilot), because its 101 committed
cluster rows re-derive every published tally exactly and it is the only cross-miner comparison the program
has. Its `kind`, `NOT_RECALL`, `AUDITABILITY_LIMIT` and `PRODUCER` fields say all of the above in-artifact, so
the number cannot be picked up as recall by someone who never reads this document. The deleted code remains in
git history at commit `b531755`.

## Sound-gate teeth: what proves the 0-false-admit is earned (`master`, merged via #192)

A 0 is only worth reporting if something could have made it non-zero. Per #192
(`packages/adapter-io/test/semantic-bench.test.ts`), three assertions guarding these headlines could not fail
and were replaced with teeth proven to bite:

- **Negation non-vacuity is now `judgeCallersBlind` = 14.72%** (re-verified `14.46%` on `master` 2026-08-22;
  the small drift is the negation-FALSE population growing with the codebase, the teeth still bite `> 0`) — the byte-identical shipped door handed a
  `symbol-reverse` whose `reverseCallers` is `[]`, blinding the exact leg the door's soundness argument names.
  It is **asserted**. The denominator is the 163 tsc-FALSE negation rows (`bench-scorer.ts`:
  `falseAdmit = |admitted∧FALSE| / |FALSE|`); the branch prints the percentage, not the raw numerator, so
  `≈24/163` is a derivation, not a printed count.
- **The old teeth, `judgeGateOff` = 0.00%, is retained as a REPORTED diagnostic**, not as the proof. On a
  dist-form index `canonicalizeSymbol` (#189), not the #99 opaque-local gate, carries the soundness, so
  turning that gate off converts abstains into refutes (134 scope-open → 122 refute, measured) and never into
  admits — `expect(0).toBeGreaterThan(0)`, a dead assertion. Keeping the number printed is what keeps the
  staleness claim checkable in the artifact.
- Honest scope of the teeth: it proves the 0 is earned for the rows the door decides by **refutation**. The
  134 scope-open / 5 escape-open rows are conservative refusals, not proofs, and this mutation does not
  disturb them.

## Provenance (every file cited above)

- A1: `harness/probes/adjudicate/calibration-report.a1-subject.{md,json}`, fixtures `adjudicate/fixtures.mjs`
  (sha256[:16] `01c7bc130eb7f384`). `master`.
- A2: `docs/design/95b-staleness-a2-methodology.md`; re-derive with `node harness/probes/a2-staleness.mjs`
  and `node harness/probes/a2-staleness-teeth.mjs`. `master`.
- A3: `harness/probes/a3-cost-sidecar.jsonl` (10 records, one per site, `total_cost_usd` from the CLI);
  `harness/probes/cost-sum.mjs`. `master`.
- A4 recall + sound-gate false-admit: `harness/probes/adjudicate/calibration-report.a4-planted.{md,json}` —
  `master` (merged in #193); recall rates re-verified identical on `master` 2026-08-22. Instrument:
  `packages/adapter-io/test/semantic-bench.test.ts` + `test/support/bench-scorer.ts`.
- A4 agreement: `harness/probes/a4-agreement-pool-pilot.json`. This branch.
- Teeth: `packages/adapter-io/test/semantic-bench.test.ts` — `master` (merged via #192); the
  `judgeCallersBlind` teeth assertion is live and passes (`14.46% > 0`, re-verified on `master` 2026-08-22).
- Method: `docs/design/95-benchmark-methodology.md` (`proven` = witnessed reference existence),
  `docs/design/95a-recall-a4-methodology.md` (pooling design sketch — the pooling _instrument_ it sketches no
  longer exists in the tree).

## The comparator ladder (2026-08-23): the no-tool floor, measured

The gap this document names above ("There is no cross-vendor SOTA column… the only comparator this program has
ever run is the ungated raw-LLM lister") is now partly closed: a proper **no-tool floor** — a raw LLM asked to
state a fact about a file with **no Atlas discipline at all** (no refute step, no grounding instruction, no
code-derived clause, no NO-FACT option) — has been run on the SAME sites as the Atlas-gated arms, adjudicated by
the SAME rubric, across TWO models. It answers "what does a developer get today by asking the model directly
(Cursor/Copilot-chat), and how much does each layer of Atlas add on top of that?"

**What this is and is not.** The floor and advisory rungs are **3-judge blind-majority adjudication of
self-verifiability** — is the claim TRUE and re-derivable from THIS unit's own bytes — against the ratified
rubric (`atlas-benchmark-adjudication-rubric`), NOT an oracle. Same-family judge (`claude-sonnet` seats), same
caveat this document applies to the agreement-pool row: a same-family LLM judge measures adjudicated agreement,
not ground truth. It is a _stronger_ adjudication than the 2026-08-16 agreement pool (blind, 3 independent
judges, majority vote, adversarial-on-counts, one frozen rubric across all rungs) but it is still judge-based.
Only the **sound rung** is oracle-backed (0-false-admit under Definition A, the same predicate as the A4 table).

**Apparatus (2-pass capture/replay, model-in-loop = sub-agents / gateway, ZERO `claude -p`).** 15 top-frontier
`atlas mine .` sites on Atlas-on-Atlas; frozen `packages/adapter-io/prompts/propose.md` (advisory v3) and the
`DEPENDS-ON` dependency template captured verbatim; the naive floor prompt is the captured `<unit>` block wrapped
in a bare "state one fact" ask. ox-alpha driven via the `hugr-router` gateway (`stealth/ox-alpha`, free, $0);
Sonnet driven as `general-purpose` sub-agents. Scratchpad artifacts (session-local, not committed): the per-arm
`<sha>.answer` sets, the `*-adj-items.json` judge inputs, the three per-rung verdict vectors, and `LADDER-RESULT.md`.

| rung                    | what it is                                          | ox-alpha (free)                | Sonnet                              | source of the number                                                                    |
| ----------------------- | --------------------------------------------------- | ------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------- |
| **floor — no-tool LLM** | raw "state a fact", no Atlas discipline             | self-verifiable **5/15 = 33%** | **6/15 = 40%**                      | 3-judge blind majority; **1 FALSE ox-alpha (id1), 0 FALSE Sonnet**; 9 NOT_GROUNDED each |
| **Atlas advisory**      | `propose.md` v3 (refute + grounding + code-derived) | **10/13 = 77%**                | **9/10 = 90%**                      | 3-judge blind majority (ox-alpha 3/3 unanimous)                                         |
| **Atlas sound**         | dependency slot, `verify-fact` oracle               | **13/13 proven, 0-false**      | 0-false (oracle, model-independent) | oracle admission (Definition A), not a judge                                            |
| **lift floor→advisory** | what Atlas's prompt+grounding adds                  | **+44 pts**                    | **+50 pts**                         | derivation                                                                              |

**The finding.** (1) The floor is low for BOTH models — even Sonnet: **~60% of a raw LLM's facts are NOT
verifiable from the unit's own bytes** (they assert design INTENT, HISTORY, a task/PR number, or behavior in
another file — "deliberately", "#186 deleted", "per INDEX-15"). The model, weak or strong, narrates _why_, not
_what the code does_. (2) Atlas's prompt discipline lifts **precision-per-emitted-fact** ~+44–50 pts on both, by
driving the NOT_GROUNDED population to 0 (the #201 comment-restatement failure) — but see the denominator caveat
below: the advisory arm can ABSTAIN and the floor cannot, so that lift blends the grounding gain with the value
of abstaining on the hard sites. (3) The oracle takes the sound arm to 0-false, model-independently. (4) The
stronger model scores higher at every rung (40>33, 90>77) but the ladder's SHAPE is identical — **on this n=15
slice Atlas lifts both model tiers substantially, not merely the weak one** (the "crutch for weak models"
reading is not supported: the strong model gains as much or more).

**A correction logged in-place (honesty).** From judge j3 alone (3/15) the floor read 20% and the first
reading was "the strong model floors LOWER — Atlas is a bigger lever on the strong model." The 3-judge MAJORITY
refuted that: Sonnet floor is 6/15 = 40%, _higher_ than ox-alpha's 33%. Single-judge misled; majority corrected.
The transferable lesson is the pilot's own (`atlas-95-pilot-rightway`): never publish a single judge's vector.

**Caveats, load-bearing.** n=15, one slice (advisory + dependency + naive floor), one repo (Atlas-on-Atlas);
same-family judge (the standing model-diverse-judge gap); the floor is a raw-LLM no-tool baseline, NOT a
retrieval-augmented SOTA (Sourcegraph-class) — that comparator has still never been run. Tighter CI needs N≫15.

**Denominator caveat on the lift (read before quoting +44/+50).** The floor is scored over all **15** sites
(the naive prompt has no NO-FACT option — it always emits); the advisory arm scores over the **survivors** of
its own abstention (ox-alpha 10/**13**, 2 abstained; Sonnet 9/**10**, 5 abstained). So the +44/+50 pt figure is
a **precision-per-emitted-fact** lift, and it credits abstaining-on-the-hard-site as well as the grounding
discipline. The **same-denominator (per-site, /15) true-fact yield** — which scores a correct abstention
neutrally rather than as a survivor win — is a smaller, also-honest number: TRUE-facts-delivered per 15 sites
goes floor→advisory **5→10 (ox-alpha, +33 pts)** and **6→9 (Sonnet, +20 pts)**. Both lifts are real; the
per-emitted one is larger because it excludes the sites the advisory arm declined to answer.

## What this is NOT

- **Not an absolute-recall claim, and not any recall claim for advisory prose.** The judge-free recall figures
  cover four oracle-bearing shapes on planted mutations of a fixture, not arbitrary real facts. Advisory prose
  has no oracle and no judge-free recall number at all.
- **Not a cross-vendor / retrieval-SOTA comparison.** The comparator ladder above now runs a proper **no-tool
  floor** (raw LLM, no Atlas discipline) under a fixed model with the same 3-judge-adjudicated denominator as
  the advisory arm — the "what you get asking the model directly" baseline. It is NOT a retrieval-augmented
  SOTA system (Sourcegraph-class); no such system has been run. The floor and advisory rungs are same-family
  judge-adjudicated, not oracle-measured (only the sound rung is).
- **Not a claim that Atlas detects staleness.** It detects byte drift inside a fact's own anchored extent with
  0 false-drift on 4/4 non-touching edits; semantic cross-file staleness is NOT SUPPORTED (§6.3).
- **Not build-independent.** Recall swings ~8-23× with whether `packages/*/dist` declarations existed before
  `scip-typescript index` ran. Soundness (0-false-admit under Definition A) holds across both builds measured.
