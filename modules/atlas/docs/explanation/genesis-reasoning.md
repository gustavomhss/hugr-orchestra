# Genesis — the reasoning (why & how it thinks)

> Explanation companion to [`reference/atlas-genesis.md`](../reference/atlas-genesis.md). The reference is
> the normative spec (pipeline, invariants `GEN-1..16`, surface, acceptance); this doc is the _why_ — the
> design rationale, the S2 reasoning loop in depth, the cost model, and the honest limits. Nothing here is
> normative on its own; it grounds the reference's `GEN-*` invariants.

## Prior art & the choice (why explicit-structural, not embeddings)

Two families exist for "make sense of an existing repo". Genesis commits **entirely to the first** (A-14
forbids the second), and every step is a **named member** of it — not a bespoke heuristic.

|             | **Explicit-structural** (chosen)                                                                                                            | **Dense-vector / GraphRAG** (rejected) |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| retrieval   | graph/query over a fact index                                                                                                               | ANN similarity over embeddings         |
| determinism | byte-reproducible                                                                                                                           | probabilistic, model-versioned         |
| cost        | ∝ importance-surface                                                                                                                        | ∝ repo size (embed everything)         |
| output      | a **checkable fact**                                                                                                                        | an opaque vector                       |
| prior art   | **SCIP** (index; LSIF/stack-graphs = legacy/archived), **Glean**, **Kythe**, **CodeQL/Semgrep**, **Aider repo-map**, **SZZ**, **CodeScene** | VoyageCode2 + vector store, GraphRAG   |

The Atlas's own fact-over-schema model descends from **Glean** (Meta) and **Kythe** (Google) — code fact
databases keyed by a user-defined schema; genesis is how that DB is first populated. (Backend reality, 2025:
`stack-graphs` archived, LSIF legacy → the dependency axis rests on **SCIP-primary**, per-language pinned
indexers; see [`atlas-index.md`](../reference/atlas-index.md) INDEX-3/13.)

## S2 in depth — the propose→verify reasoning loop (the intelligence, harnessed)

The LLM is **never an oracle** here; it is a **candidate proposer inside a mechanical verification harness**.
Genesis is the **static + LLM analog of Daikon** (dynamic likely-invariant detection): where Daikon must
_observe_ invariants from a thorough test-suite, genesis reads structure and _proposes_ them, then
machine-checks each — no test-execution dependency. The kernel idea: **a claim is admitted only when the
model's own synthesized `check` passes on the real code** — the model cannot lie, because its assertion is
executable and gets executed. (Normative form: `GEN-12`.)

**The reasoning context (deterministic, no embeddings).** Per site the model gets a precise pack from the
index — not a vector search: the unit's `source@sha` + `StructRef`; its `RelationSet` (RETR-10: enclosing
known invariants, forward deps' contracts, reverse-closure size); and its **git scar tissue** — the SZZ
bug-introducing commits that touched it, its churn, and the messages of past fixes.

**The loop (bounded, per site):**

```
PROPOSE → VERIFY(ground · check · SCORE obviousness) → [counterexample?] REFINE ≤K → CORROBORATE? → ADMIT | ABSTAIN
```

1. **PROPOSE.** Draft typed candidate(s) `{ slot∈closed-vocab, primaryAnchor, claim, check?, tierHint }`.
   Chain-of-thought is **scratch — discarded**; only the typed candidate persists. **Bug-primed:** the SZZ
   scar tissue aims the model at the _fragile_ invariant — the property whose violation caused a past fix.
   (Mine the bugs to find the invariant.) NB: `primaryAnchor` is **computed mechanically** from the referenced
   symbols, not LLM-chosen (KNOW-15) — only the claim body / slot / check are proposed.
2. **VERIFY — three mechanical gates.** **ground:** `primaryAnchor` re-derives at `@sha`, else drop
   (KNOW-2). **check** _(the crux)_: for a predicate, **compile & run** the synthesized CodeQL/Semgrep
   `check` on current code — it MUST return `HOLDS`; a failing check is a **counterexample**, not a warning.
   **teeth:** it MUST also **flip to `BROKEN` on a mutated counterfactual** of the subtree — a check no mutant
   breaks is vacuous and dropped. **obviousness:** a claim entailed by the signature/types alone is **scored at
   the floor — never rejected** ([ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md)). A rejected
   candidate leaves no record, so the filter's own accuracy could never be measured: you cannot count the good
   facts it discarded, because discarding them is what it did. A stored score is auditable after the fact and
   re-thresholdable at zero cost.
3. **REFINE (counterexample-guided, ≤K retries).** On a failing check, feed the violating fragment back and
   let the model repair claim+check (CEGIS / SpecGen two-phase). Still failing ⇒ **drop, never force**.
4. **CORROBORATE (uncertainty-gated).** Default: one sample. Only for **uncertain or `tier≥T1`** candidates,
   escalate — **self-consistency** (sample `N = 3`, keep convergent claims) or a cheap **refuter**. Gated by
   uncertainty so cost stays bounded.
5. **ABSTAIN (first-class).** If nothing clears the bar, emit a **grounded why-not** (KNOW-13), never a
   manufactured fact. The model is rewarded for silence — the anti-hallucination floor.

**The honest limit.** A passing `check` proves the property holds on **current** code and is re-checked on
drift — it is **not** a proof for all future inputs (that needs a theorem prover, out of scope). Like
Daikon's "likely invariants," genesis facts are **machine-checked likely invariants**, not proofs. And
because usefulness (non-obvious ∧ actionable) is the _one_ judgment no mechanism can prove a-priori, the
**decision** is taken **a-posteriori by downstream use** (`GEN-16` / KNOW-17): seed loose-but-thin, let unused
facts decay. The obviousness **score**, by contrast, is computed a-priori at mine time — the one moment the
source bytes and the model are both in hand — and the two **compose** rather than replace each other: genesis
builds the entire graph before any usage exists, so on a cold graph every fact has zero hits and hits-decay is
a no-op; the score is the cold-start prior, hits-decay the warm update. The score is computed by the
**harness's** predicate over the source bytes, never asked of the proposer (GEN-16, ADR-0011).

## Cost model (why cheaper than embedding)

- **Embeddings:** `O(repo size)` vectors + a vector store; retrieval = probabilistic ANN. Re-embed on model
  change. Opaque output.
- **Genesis:** `$0` mechanical skeleton + `O(importance-surface)` LLM calls (the PPR frontier only) +
  deterministic retrieval. The ranking math (PageRank + MSR signals) is the same build-systems and Aider use
  — and it is **free**. No vector store anywhere.

## Cost discipline & the sweet spot (don't let the loop balloon)

The S2 loop is powerful, so it is dangerous: run every mechanism on every site and genesis becomes an
expensive monster. The rule (normative: `GEN-13`) is **cheap by default, escalate by value** — the
sophisticated parts are **dormant**, switched on only when a cheap signal says a candidate is both
**high-value** (tier/blast) and **uncertain**. The common path is **one LLM call + two mechanical gates**;
the expensive path is the rare exception.

| mechanism    | **default (cheap path)**                                       | escalate only when                             | why this is the sweet spot                                                  |
| ------------ | -------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| LLM calls    | top-PPR frontier only                                          | —                                              | cost ∝ importance-surface (GEN-2/3)                                         |
| fact family  | **advisory** — grounded claim, **no check**                    | checkable **and** `tier≥T1` → predicate        | synthesizing + running a check is the pricey part; most facts don't need it |
| CEGIS refine | `K=1` (one repair)                                             | never beyond `K`                               | abstain fast beats forcing                                                  |
| corroborate  | **OFF** (`N=1`)                                                | `T0`-candidate or high-blast **and** uncertain | rare, not per-site                                                          |
| refuter      | **OFF**                                                        | `T0`-candidates only, **small** model          | only the tail, cheapest model                                               |
| check engine | **type-checker / LSP** (sound, `$0`) → **Semgrep** (cheap AST) | **CodeQL** only when dataflow is required      | the compiler already ran; the heavy DB is built **once**, amortized         |
| coverage     | seed the **hot frontier only**                                 | —                                              | the cold tail is seeded **free** by born-from-work                          |

The last row is the biggest lever: **genesis is scopable and need not run whole-repo.** Seed the hot
territories; **cold code nobody works on never pays a genesis pass** — born-from-work (KNOW-13) covers it
for free, only when a wave enters it. So real cost ≈ _importance-surface ∩ what-you-actually-work-on_.

## Optional deepening loops — genesis is iterative, not single-pass

The first S2 pass is a _shallow_ seed. Three **optional** loops can deepen it — each the **depth dial of
GEN-13/GEN-14**: off-or-shallow by default, budget-gated, with a **diminishing-returns / fixpoint stop**.
They add loop _structure_ over existing machinery (propose→verify, `relate()`) — **no new subsystem**. Why
iterative is smarter: the first extraction reveals _where the important unknowns are_, so the frontier is
**refined by what you learn**, not fixed upfront.

| loop                 | what it does                                                                                                                                                   | reuses                          | stop (anti-runaway)                                    | default               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------ | --------------------- |
| **REVIEW** (quality) | an independent cold pass over the just-seeded _set_ — drops contradictions, redundancy, obvious-that-slipped, mis-tiering (cross-fact, vs S2's per-fact check) | the refuter                     | a round that revises nothing (fixpoint), or `N` rounds | on for `tier≥T1` only |
| **ENRICH** (depth)   | deepen an admitted fact — promote advisory→predicate if it now earns a `check`, link related facts, adjust tier                                                | `relate()` + the predicate path | marginal value `< ε`                                   | off                   |
| **EXPAND** (breadth) | follow the graph — a seeded fact's dependency edges surface **new** sites off the static PPR frontier; re-rank + extract                                       | the dependency axis + PPR       | **loop-until-dry** + budget + max-hops                 | off                   |

**These do not replace born-from-work.** Born-from-work is the **free** steady-state enrichment (lazy, as a
wave touches code); the genesis loops are **eager** enrichment paid upfront for a richer _initial_ seed. Use
them only where an upfront-rich seed earns the spend.

## Determinism boundary (honest)

Not end-to-end deterministic — and it says so:

- **S0 + S1 are pure & reproducible** — same repo@rev ⇒ byte-identical skeleton + candidate ranking (PPR
  damping + seed pinned).
- **S2 is LLM** (content non-deterministic), but its **selection** (which sites, what order) is deterministic
  and **every output is grounding-gated** — an ungrounded seed never lands.
- **S3 is human** — the _question set_ is derived mechanically; only the _answers_ are the human's.

The parts that decide _what enters the store_ (ranking + grounding + ratification) are deterministic; only
the _drafting_ is model-driven, and always gated.
