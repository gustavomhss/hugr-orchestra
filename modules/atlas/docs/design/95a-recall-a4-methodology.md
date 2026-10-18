# 95a — Recall (A4) ground-truth methodology (design sketch)

> Status: **SKETCH** (design, not code). Scope: axis **A4 (recall)** of the #95 benchmark program only.
> This document must NOT gate the first three-axis number (A1 precision · A2 staleness · A3 cost); recall
> is deliberately the last axis measured, because its denominator is the one that cannot be read off a
> single run. Companion to the shipped adjudication rubric (owner-ratified 2026-08-11) used for A1.

## 1. Why recall needs a different instrument than precision

Precision (A1) is **per-emitted-fact**: for each fact Atlas emits, is it grounded + true of the bytes?
The denominator is what Atlas produced, so a run adjudicates itself.

Recall asks the inverse: **of all the facts that a perfect miner SHOULD surface for a fixed corpus, what
fraction did Atlas surface?** The denominator — "all facts that should exist" — is not observable from
Atlas's output, is unbounded in the limit, and is partly subjective. Any recall number is therefore only
as honest as its stated denominator. This document's whole job is to define a denominator we can defend.

## 2. The denominator problem, stated honestly

Three candidate denominators, with what each actually measures:

| Denominator               | What recall then means                          | Honest caveat                                                                                             |
| ------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Exhaustive human gold** | absolute recall vs an expert's complete reading | expensive, subjective, does not scale; two experts disagree, so "complete" is itself an estimate          |
| **Seeded / known-answer** | recall over facts we PLANTED                    | controls the denominator exactly, but measures recall on synthetic invariants, not the real distribution  |
| **Pooling (TREC-style)**  | recall RELATIVE to the union of many miners     | cheap, fair across systems, SOTA in IR — but underestimates absolute recall (misses facts no miner found) |

None is sufficient alone. The design uses **pooling as the primary instrument** (it is the only one that
scales and stays fair vs SOTA baselines) and a **small human gold set as a calibration ceiling** (to bound
how much pooling underestimates). Seeded facts are used narrowly, for the shape-coverage check in §5.

## 3. Primary instrument — pooled relative recall

Borrowed directly from TREC pooling (the standard answer to "recall without an exhaustive gold set"):

1. **Fix the corpus.** A frozen file set at a frozen `@sha` (start small: 10–20 real files, one subsystem,
   so a human can later read all of it — see §4). The corpus is committed, not described.
2. **Run N miners** over the identical corpus: Atlas, plus ≥2 SOTA baselines (e.g. a raw-LLM
   "read the file, list durable facts" prompt with no grounding door; a comment/docstring extractor as a
   floor). Same model tier where the axis is the SYSTEM, not the model.
3. **Pool the union** of all emitted facts. Deduplicate SEMANTICALLY (two systems phrasing the same fact
   count once) — this dedup is itself adjudicated, not string-matched, because paraphrase is the norm.
4. **Adjudicate every pooled candidate for TRUTH** using the A1 rubric (grounded + true of the bytes,
   0-hallucination floor). A pooled candidate that is false is discarded from the denominator — a false
   fact no system should get credit for finding.
5. **Recall(system) = |true facts that system emitted| / |true facts in the pool|.**

**The caveat travels with the number, always:** pooled recall is recall _relative to what the pool found_.
The pool is an UPPER bound on the denominator, hence pooled recall is a LOWER bound's complement — it can
only over-state absolute recall (facts no miner found are invisible and silently excluded). Report it as
"recall@pool(N systems)", never as bare "recall". Adding more diverse miners to the pool only lowers every
system's score, which is the honest direction.

## 4. Calibration ceiling — the small human gold set

To bound how much §3 over-states, one small anchored file set gets an independent human reading:

- **Two annotators** independently read every file and write down every non-obvious, durable, grounded
  fact they would want a newcomer to know (the same bar the prompt states). No system output shown first.
- **Adjudicate disagreements** to a merged gold set; **report inter-annotator agreement** (raw agreement +
  the fraction one annotator found that the other missed). Low agreement is itself a finding: it means
  "all facts that should exist" is fuzzy even for humans, which caps how precise any recall claim can be.
- **Ceiling check:** `|pool ∩ gold| / |gold|` tells us what fraction of the human-found facts the pool
  captured. If the pool misses many gold facts, §3's relative recall is optimistic by at least that much,
  and the number is reported with that gap attached.

This set is small ON PURPOSE — it is a calibration probe, not the benchmark. It never gates the pooled run.

## 5. Stratify by fact SHAPE — where recall exposes the product limit

Recall must be reported **per fact shape**, not just in aggregate, because a miner that only emits one
shape has structurally zero recall on the others — and that is exactly the #99 product limit (Atlas could
not ground a negative, a relation, or a transition). The shapes (the #196 vocabulary; #99a relation and
#99b negation now shipped):

- `advisory` · `predicate` · `relation` · `negation` · … (full 12-type vocabulary as it lands)

For each shape: pooled recall + gold-ceiling as above, restricted to pool candidates of that shape.
**This is the number that makes the #99 fix legible**: relation/negation recall was 0 before the doors
existed; the A4 table is where "we closed the limit" becomes a measured delta instead of a claim. Seeded
known-answer facts (§2 row 2) are the cheap way to sanity-check a shape with too few natural instances in a
small corpus — plant K relation-facts, confirm the pool + Atlas recover them — but seeded results are
labelled separately and never mixed into the natural-distribution number.

## 6. What this sketch deliberately does NOT do

- **No harness code here.** The pooling driver, the semantic-dedup adjudication tool, and the gold-set
  annotation format are follow-on work, scoped only after A1/A2/A3 produce their first numbers.
- **No absolute-recall claim.** Every number this methodology yields is relative-to-pool or
  relative-to-a-small-gold-set, and is reported as such. Anyone who wants absolute recall must first
  defend an exhaustive denominator, which §2 argues is not honestly available at scale.
- **No gating of the 3-axis number.** A4 is a separate track by owner-agreed sequencing.

## 7. Open questions for ratification

1. **Baseline set for the pool** — which SOTA systems count as fair pool members (raw-LLM lister, comment
   extractor, others)? The pool's diversity directly sets how conservative recall@pool is.
2. **Model-held-fixed vs system-held-fixed** — when comparing Atlas to a raw-LLM baseline, is the model
   tier held identical (isolating the grounding DOOR as the variable) or is each system run at its own
   best config? Both are defensible; they answer different questions. Recommend: hold the model fixed, so
   A4 measures Atlas's machinery, not model choice.
3. **Corpus selection bias** — a hand-picked subsystem can flatter recall. Recommend the corpus be drawn
   by a stated rule (e.g. the top-K files by the same frontier ranking A1 already uses), not curated.
