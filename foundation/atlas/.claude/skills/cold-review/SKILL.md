---
name: cold-review
description: >
  The judgment half of the between-state gate: how a cold-review seat verifies an artifact against the
  FROZEN contract of the state that produced it. The deterministic protocol for the REVIEW layer — the
  refute-first stance, the re-derive-then-diff reading discipline, the grounded-finding precision guard,
  the review's own completeness, and the teeth that separate thorough-clean from shallow-clean. Invoke
  before accepting ANY state artifact; the reconciler is the mechanical half, this is the judgment half.
---

# /cold-review — verifying an artifact against its producing contract

> **Authority (primary sources, read in full):** Fagan, _Design and Code Inspections_, IBM Sys. J. 15(3)
> 1976 (detection≠rework; check-against-spec) · Basili et al., _Perspective-Based Reading_, Empir. SE 1(2)
> 1996 (active reading > ad-hoc; decorrelated-perspective _team coverage_) · Porter/Votta/Basili 1995
> defect-based reading (**checklist alone ≯ ad-hoc** — the result quoted in PBR'96's related work) ·
> Mills defect-seeding / Eick et al. 1993 capture–recapture (the teeth) · Zheng et al. 2023 _LLM-as-a-Judge_
> (reference-guided grading; position-swap) · McAleese et al. 2024 _LLM Critics Help Catch LLM Bugs_
> /CriticGPT (refute-first + planted-bug measurement + the precision guard) · Verga 2024 PoLL &
> _Nine Judges, Two Effective Votes_ 2026 (panel only if decorrelated; >~3 buys nothing). Nothing invented.
>
> _Evidence honesty:_ the classic inspection results are the strong, replicated tier. Among LLM-judge
> papers **only CriticGPT is anchored to ground-truth planted defects** — lean on it; MT-Bench is
> _preference_-agreement, not defect-finding, so it grounds the _reference-guided_ discipline, not a claim
> that the reviewer finds real bugs. PBR's _individual_ boost was weak (non-significant); the durable win
> is _team coverage via decorrelated perspectives_ — this protocol is sized to that finding, not oversold.

## Where this sits (the three layers)

This is a **Protocol** (rules, model-agnostic), packaged as this skill, and operationalized by
[`../../docs/method/prompts/review.md`](../../docs/method/prompts/review.md). Between every state
`Sx → Sx+1` there are **two** gates: the **reconciler** (mechanical coverage — every invariant has a
REQ, ids resolve, enums valid) and **this** (judgment — does the artifact actually satisfy the intent
its contract froze?). The reconciler proves the artifact is _well-formed_; cold-review proves it is
_right_. Never land a state on its author's self-report — that law runs entirely through this gate.

**The seam:** the reconciler never adjudicates judgment — it hands this gate a **semantic queue** (the
items it flagged but could not mechanically clear). This gate adjudicates that queue _in addition to_ its
own re-derived obligations (see DERIVED), and its overall outcome — **APPROVE** or **FIXES-NEEDED** — is
what the reconciler's contract means by "the cold review APPROVEs the semantic queue." The state freezes
only when the reconciler is CRITICAL-free **and** this gate returns APPROVE.

## The stance: refute-first, against the contract — never "evaluate quality"

The reviewer's job is to **find where the artifact FAILS the frozen contract of the state that produced
it** — not to score it, not to like it, not to improve it. "Looks good" is not a review. Default to
defect-hunting (CriticGPT). The contract being reviewed against is the **reference** (MT-Bench
reference-guided): the producing state's DoD, its completeness criteria, and its invariants.

## The predicates — three per-review, plus one gate-cadence check

> A single review is valid iff the **three per-review** predicates hold — GROUNDED · DERIVED · COMPLETE.
> The fourth, **TOOTHED**, is _not_ a per-run check: it is the **gate's** adequacy discipline, applied at
> a cadence (seeded runs / capture–recapture), never on every review. Three predicates prove _this review
> is sound_; the fourth proves _the gate keeps catching defects over time_.

### 1. GROUNDED — every finding cites the clause it violates _(the precision guard)_

> A finding is `{location in the artifact} + {the exact contract clause / rule id it violates} + {the
concrete failure}`. A "defect" with no clause-cite is a **nitpick** and is dropped, not filed.

Source: CriticGPT's one hard cost is precision — LLM critics hallucinate and nitpick far more than
humans (an explicit recall-vs-precision tradeoff). What CriticGPT _showed_ beat the model-only frontier
was **human+critic teaming** (here, the lead does the rework). The clause-cite requirement is **our own**
precision guard — inspired by that cost and modeled on Constitutional-AI's
critique-against-an-explicit-principle — not a mitigation CriticGPT itself names.
**Refute-first without a grounding requirement drowns the lead in nitpicks** —
grounding is what makes refute-first pay. (This is the predicate jimmy's product-definition review
already obeyed — every finding cited `ratification-gate:33`, `spec/atlas.md:293` — that is _why_ it was
actionable.)

### 2. DERIVED — re-derive the obligations from the contract, then diff _(not a ticked checklist)_

> Before reading the artifact, **reconstruct what this state was required to deliver** from its frozen
> contract (DoD ∪ completeness facets ∪ invariants). _Then_ diff the artifact against that reconstruction.
> The review dimensions ARE the contract's facets **∪ the reconciler's semantic queue** (the items the
> mechanical half flagged for judgment) — never a universal taxonomy, never a passive tick-list.

Source: the load-bearing finding (Porter/Votta/Basili 1995, defect-based reading, reported in PBR'96) is
_not_ "structured reading is better" in the vague sense — it is that **a passive checklist did NOT beat
ad-hoc**; what beat ad-hoc was an _active
procedure_ where the reviewer must _produce something_ (re-derive, model, test) while reading. And
MT-Bench's reference-guided grading (generate the expected answer first, then grade) cut judge failure
70%→15%. So the reviewer must actively re-derive expected obligations from the contract _first_, not
skim the artifact and pattern-match. Dimensions come from _this_ contract (see the cut-list on ODC).

### 3. COMPLETE — every facet of the contract gets an explicit verdict _(the review's own completeness)_

> The review is complete iff **every** facet of the producing state's contract (each DoD item, each
> completeness criterion, each invariant) receives an explicit PASS or FIXES-NEEDED with evidence — no
> silent skips. A facet the review never mentions is a **hole in the review**, reported as such.

Source: ODC's one transferable idea — the defect-_trigger_ distribution is used "to evaluate the
effectiveness and eventually the _completeness_ of verification processes" (Chillarege 1992). We borrow
only that lens (did the review exercise _each class_ of obligation?), not the 8-type taxonomy. This is
also honesty: an unmentioned facet must read as _unchecked_, never as _passed_.

### 4. TOOTHED — a clean verdict is only creditable if the review catches planted defects

> "Found nothing" is not trustworthy on its own. A **clean** verdict is creditable only when the review
> is periodically run against a **seeded copy** of the artifact (known planted defects) and catches them
> — catch-rate is the review's adequacy. **The reviewer runs blind:** it is _not_ told the run is seeded
> or which defects are planted — the moment it knows, it hunts harder than a normal pass and inflates the
> estimate the check exists to produce. The **gate operator** (not the reviewer) scores the returned
> findings against the held-out seed list. Alternative with no seeding: run **two decorrelated** reviewers
> and use their **overlap** to estimate missed defects (capture–recapture). A review that misses seeds is
> _shallow-clean_; its "clean" on the real artifact is not accepted.

Source: Mills defect-seeding (Lincoln–Petersen catch-rate) and Eick et al. 1993 capture–recapture — the
classic answer to thorough-clean vs shallow-clean. CriticGPT's _tampering_ is exactly adversarial
seeding, and it was the decisive train+eval signal. This is the **teeth** — the review-layer analogue of
mutation adequacy (same idea as [`goldens`](../goldens/SKILL.md) L4 teeth and the CAC teeth-gate), but
the target is the _review process_, not the goldens. Apply it to the gate itself, not to every run.

## Detection ≠ rework (the Fagan discipline)

The reviewer **emits a findings list; it does not fix anything.** Rework is a _separate_ act done by the
**lead/author** afterward. A reviewer that silently repairs the artifact destroys the signal of whether
the _producing state_ actually conformed — and couples the reviewer to the author's context (a cold
review never sees the author's conversation; that is what "cold" means). Findings in, rework out, by
different hands.

## Verdict schema (structured output)

```
COLD-REVIEW — <artifact> against <state-id> contract@<sha>   ·   verdict: APPROVE | FIXES-NEEDED
   <!-- overall verdict = APPROVE | FIXES-NEEDED (the word the reconciler seam + techlead use); per-facet rows below use PASS | FIXES-NEEDED -->
obligations (re-derived from the contract ∪ reconciler's semantic queue, before diffing): <the list = the review's dimensions>
per-facet:                                                  <!-- one row per obligation above; none skipped -->
  <facet / DoD item / invariant> : PASS | FIXES-NEEDED
     └─ finding: <location> violates <clause/rule id> — <concrete failure> — <proposed fix, for the lead>
what PASSED (honest, not manufactured): <facets that genuinely hold — do NOT invent findings to look busy>
review-completeness: <every obligation got a verdict? y/n; if n, which are UNCHECKED>
teeth: <gate-level, reviewer-blind — seeded-run catch-rate / capture-recapture overlap, or "not run this pass">
```

Honesty clause: if the artifact is genuinely clean, say so per-facet and stop. Manufacturing findings to
appear thorough is the inverse failure and is itself a review defect (the CriticGPT nitpick pathology).

## Panel discipline (how many reviewers)

- **Default: one.** A single competent reviewer against the contract is the baseline.
- **Escalate to 2–3 only for high-risk artifacts** (T0 territory, high blast-radius, a load-bearing
  method piece) — and **only if the perspectives are decorrelated** (different lens _and/or_ model
  family: e.g. `bobby` anti-overengineering + `lucy` spec-rigor + `billy` adversarial-security). A
  homogeneous panel (same reviewer twice) is wasted spend.
- **Never more than ~3.** _Nine Judges, Two Effective Votes_ (2026): 9 judges from 7 families delivered
  only ~2.18 effective independent votes (~76% of nominal independence lost to correlated errors),
  asymptote ≈2.6, and the single best judge matched the full panel. PoLL (2024) confirms the win comes
  from _diversity_, not count. This is the same decorrelation principle as PBR's team-coverage result.

## Cut-list — what NOT to adopt (ruthless, against overhead)

- **Full ODC as review dimensions** — 8 defect-types × triggers is a _product-wide process-analytics_
  instrument (Chillarege's own stated purpose), not per-artifact gate machinery. Take only the
  trigger→completeness lens (predicate 3); drop the taxonomy.
- **Large juries (>~3)** — primary evidence (_Nine Judges…_) says they buy almost nothing once errors
  correlate. Cap at 2–3 decorrelated.
- **Full Fagan role ceremony** (moderator + separate reader + recorder + overview meeting) — the
  transferable doctrine is detection≠rework + check-against-spec; the human meeting logistics don't map
  to an automated single-artifact gate.
- **Elaborate verbosity / self-enhancement "fixes"** — MT-Bench offers none that work. Cheap mechanical
  guards only: for any _comparison_ review, swap the order and require the verdict to hold both ways
  (position-bias); an explicit "do not reward length/elaboration" line. Nothing more.
- **Elo / preference scoring as the primary signal** — weakest evidence tier (agreement-with-preference,
  not defect ground truth). Validate the _reviewer itself_ with planted-bug catch-rate (predicate 4),
  not with preference scores.

## Self-check before shipping a review

- [ ] refute-first — did I hunt for contract _failures_, not score quality?
- [ ] GROUNDED — does every finding cite a location AND the exact clause it violates? (drop nitpicks)
- [ ] DERIVED — did I re-derive the state's obligations from the contract _before_ diffing the artifact?
- [ ] COMPLETE — did every contract facet get an explicit PASS/FIXES-NEEDED, with UNCHECKED named honestly?
- [ ] detection≠rework — did I emit findings only, leaving the fix to the lead?
- [ ] honest — did I state what genuinely PASSED without manufacturing findings?
- [ ] panel right-sized — one reviewer, or 2–3 _decorrelated_ for a high-risk artifact, never more?
- [ ] teeth — is this gate covered by a seeded-run or capture-recapture at some cadence (even if not this pass)?
