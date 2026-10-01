# #95 — Benchmark methodology: the planted-ground-truth collapse

**Status:** ratified (owner, 2026-08-16). Umbrella over the per-axis docs
[`95a-recall-a4-methodology.md`](95a-recall-a4-methodology.md) and
[`95b-staleness-a2-methodology.md`](95b-staleness-a2-methodology.md). This doc fixes the ONE methodological
decision that governs every axis: **how a truth number is produced without an unreliable LLM judge in the loop.**

## The problem this kills

The first A1 measurement (30 real atlas sites, reason-freely sub-agent proposers, a 3×sonnet judge panel +
manual audit → **29/30 = 96.7% grounded+true**) is **not a citable number**. It is LLM self-verification, and
three converging results say self-verification does not measure truth:

- LLM-judge agreement with a _mechanical_ oracle on code-truth tasks is only κ≈0.10–0.21 — the weakest task
  class for LLM judges; judges hallucinate bugs in correct code (arXiv 2507.16587).
- Same-family self-preference: a judge favours text that "sounds like itself", so sonnet judging
  sonnet-proposed claims is directionally inflated (arXiv 2410.21819).
- "Nine Judges, Two Effective Votes": 9 judges across 7 families ≈ 2.2 effective votes; **same-family ≈ 1
  effective vote** (arXiv 2605.29800). So a 3×sonnet panel's Fleiss κ measures **self-consistency, not
  correctness** — three correlated judges can agree loudly while jointly wrong. And LLM-Modulo (arXiv
  2402.01817): an LLM verifies no better than it generates; verification must come from _outside_ the model.

Therefore **the 96.7% is demoted to "smoke, non-citable."** It stays only as evidence the pipeline runs.

## The mechanism (one thing, not six)

> **The LLM is the SUBJECT under measurement, not the instrument. Ground truth is something WE control by
> construction (planted / mutation), so no LLM judge ever sits in the correctness loop.**

This is exactly the method that made the negation gate sound (#232: 0-false-admit measured against the `tsc`
ORACLE, never a panel). Applied to A1 it collapses the entire tower — cross-family panels, position-swap,
Fleiss-κ-as-truth, human gold — into a single move, scored by arithmetic:

- We hold a set of `(code, fact)` pairs whose label we **decided by construction**: 10 grounded-true, 10
  planted-false (the false ones mention the anchored code — so a shallow "is it about this code?" grounding
  check passes — but assert something false: wrong constant, wrong callee, inverted condition, fabricated
  behaviour, or a stale comment reported as current). This is the exact #95 failure: grounding is _aboutness_,
  not truth. Ground truth is Khatib mutation-analysis (arXiv 2602.17838): does the claim track the code?
- A **single fresh-context subject** (sonnet sub-agent, per [[model-in-loop-is-subagents]], driven by the
  **frozen** `renderPrompt` — never improvised prose, per [[benchmark-prompts-must-be-frozen-artifacts]])
  answers each pair GROUNDED_TRUE / HALLUCINATED / ABSTAIN.
- Scoring is a **string compare against the planted label** — zero model in the scoring loop:
  - **false-admit-rate** = planted-false pairs the subject called GROUNDED_TRUE ÷ planted-false total.
  - **catch-rate** = planted-false pairs the subject called HALLUCINATED ÷ planted-false total.
  - **false-alarm-rate** = grounded-true pairs the subject called HALLUCINATED ÷ true total.
  - (an ABSTAIN is neither a catch nor an admit — it counts against the denominator, keeping catch-rate
    conservative.)

`harness/probes/adjudicate/detectionRates()` already computes these three and is unit-proven. **No Fleiss κ,
no cross-family panel, no agreement formula** — those existed only to make an LLM-judge trustworthy, and there
is no LLM judge here. The single optional statistic is a Wilson interval on the proportion when n is small
(one line, an error bar — not an apparatus); with n=20 report the raw fraction and the n so the sample size is
visible. The 3×sonnet panel + κ survive ONLY as a labelled secondary "judge self-consistency" signal, never a
headline; cutting them entirely is acceptable.

## What this number is, and what it is NOT (structural honesty)

The subject-test isolates **one faculty**: the LLM's ability to _reject a false claim about code_. That is
precisely the faculty that gates advisory admission on the shipped path — an advisory fact has **no mechanical
oracle**, so its only guard against falsehood is the model's own emit/abstain judgment. So this is not a proxy
for a separate thing; it is that exact faculty, isolated with a clean planted label. Its limits, stated as
limits not TODOs:

- It measures **precision** (does the model reject falses), not **recall/generation** (does the model surface
  the good facts) — recall is A4's separate ground-truth trail ([`95a`](95a-recall-a4-methodology.md)).
- The fixtures are **synthetic-but-clean by design**: you can only plant a false if you know the truth, so
  clean labels beat repo fidelity here. Precision on _real_ mined atlas facts is a separate, weaker number
  that would need a judge — which is exactly the loop we removed. The planted subject-test is the strong one.
- n is small (20). Expansion is trivial and additive (append `(code, fact, label)` pairs); noted as a limit.

## The number that IS strong today: the `proven` seal

The honest #95 story splits by seal, and the strong claim needs no LLM at all:

- **`proven`** (dependency / count / negation) — a 0-FP **mechanical oracle** (`tsc`, export index, canon
  residual) on **real** atlas code. This is the Clover boundary (arXiv 2310.17807: 0-FP is reachable _only_
  where a formal check exists). Dependency and count are 0-false-admit by a witnessed **reference**-existence
  oracle (`reverseCallers`, `packages/index/src/symbol-reverse.ts`, counts any SCIP `reference` occurrence —
  imports and type-only positions included, not only calls), sound in any world. This is NOT a call-graph
  claim: the oracle proves "B is referenced from scope A," never "A calls B."
  **Negation's soundness is INDEX-FORM-DEPENDENT (corrected 2026-08-17, #178 — the earlier "0-false-admit over
  18,654 admits, recall 80.9% (#232)" was measured on a 2026-08-12 DIST-form `.atlas/index.scip` and does NOT
  transfer to a fresh index).** The #196b sound mutation-bench, on its first run over a fresh `scip-typescript`
  LOCAL-form index, caught the shipped v2 negation door false-admitting **80.86%** of the tsc-FALSE negations:
  scip-typescript emits cross-package refs as collapsed `local` symbols that `symbol-reverse` dropped, so the
  door's closed-world disjointness silently failed (a LIVE T0 door-unsoundness, PRODUCTION-affected via
  `atlas verify-fact negation`). The fix (#178, `opaqueRefSources` split-feed → abstain scope-open) restores a
  GENUINE **0-false-admit**, and the sound property holds ACROSS index builds; **recall is the only number
  that swings, and it is index-BUILD-dependent.** Three measured points, all 0-false-admit post-fix:
  - **committed dist-form index** (the OPERATING case — `.atlas/index.scip` built with the packages'
    `dist/*.d.ts` declarations present): **0-FA, recall 32.5%** (n=1352; measured 2026-08-17). Cross-package
    refs resolve to `dist/*.d.ts` descriptors that `canonicalizeSymbol` (#189) bridges to their source defs,
    so the opaque-local gate rarely fires — the gate-off teeth here is only **0.66%**, not 80%.
  - **degenerate dist-ABSENT rebuild** (`scip-typescript index` run WITHOUT building declarations first):
    **0-FA, recall 4.25%** — every cross-package import collapses to an opaque `local` the door honestly
    abstains over. This is a MISBUILD, not the operating recall; it is where the pre-fix door false-admitted
    80.86% (dist-form was already near-sound).
  - **historical 2026-08-12 dist-form index (#232)**: 0-FA, recall 80.9% — a different, superseded snapshot,
    kept only as the record.
    So **"Approach-3" is not a code campaign but a BUILD RECIPE**: build the packages' declarations (`tsc -b`)
    before `scip-typescript index`, so cross-package refs are dist-form and the existing `canonicalizeSymbol`
    recovers recall. Recall is not a single citable number until the index build is pinned/frozen. Defensible
    headline: negation is **sound (0-false-admit) on any build**; recall is build-dependent (32.5% operating,
    4.25% on a dist-absent misbuild).
- **advisory (unsealed, semantic)** — no sound oracle exists (field-level limit), so it is measured by the
  planted subject-test above and reported as **false-admit-rate + n (+ optional Wilson CI)**, never as
  "accuracy," never overclaimed. **(Corrected 2026-08-16: this bullet used to read "`validated` seal". The
  `validated` seal is CUT — genesis ships proven-only, ADR-0017 CORRECTION 3. Advisory prose now carries NO
  truth-seal; the planted subject-test measures the precision of that UNSEALED advisory faculty, not a seal.
  The measurement is unchanged; only the label the seal gave it is gone.)**

Terminology is Huang et al. (ACM TOIS 10.1145/3703155): _grounded_ = the faithfulness axis, _true_ = the
factuality axis. We did not coin it.

## Verified references

LLM-judge weak on code-truth 2507.16587 · self-preference 2410.21819 · position bias 2406.07791 ·
correlated-panel collapse 2605.29800 · PoLL diverse jury 2404.18796 · Prometheus (rubric = biggest lever)
2310.08491 · G-Eval 2303.16634 · code-truth mutation (Khatib) 2602.17838 · Clover 0-FP 2310.17807 ·
LLM-Modulo self-verify fails 2402.01817 · hallucination two-axis survey Huang ACM TOIS 10.1145/3703155 ·
prompt-as-instrument 2510.05152 / 2604.11581 · temperature 2603.28304 (freeze T=0). Reproducibility =
frozen prompt digest + T=0 + logged model snapshot (HELM / lm-eval-harness discipline).

## Cost (A3) needs no special metered run

The sub-agent transcript already carries the full `usage` block (input / output / cache-write / cache-read
tokens) **and the exact model snapshot** per call. So A3 = read those token counts and multiply by a recorded
rate card — there is no separate "metered mining" apparatus to build and no money-ceremony to authorize; the
meter is the transcript. Tokens are the measured quantity; the dollar figure is `tokens × rate_card` with the
rate card logged alongside (label it if the exact `claude-sonnet-5` price is assumed rather than confirmed,
per [[premissa-sem-evidencia-e-teoria]]). Per-site cost during real mining is the same read over the proposer
sub-agents' transcripts. (Demonstration from this session's 20 A1 subject calls: 760,841 tokens total,
~38k/call, model `claude-sonnet-5` — the meter works end to end.)

## Build state

- Frozen artifact: `harness/probes/adjudicate/fixtures.mjs` (20 planted pairs + `renderPrompt`) and
  `fleiss.mjs::detectionRates` (the arithmetic, unit-proven). Reused as-is.
- Subject-mode run: single fresh sonnet sub-agent per fixture, fed `renderPrompt` verbatim, scored by
  `detectionRates`. Derived report committed alongside the smoke report.
- The κ-panel path (`runPanel`, ≥2 passes) is retained but relabelled secondary; it is not the A1 headline.
