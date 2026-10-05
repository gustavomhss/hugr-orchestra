---
name: formal-decision
description: >
  Decide how each invariant is verified — state S2 of the decomposition method. Assign every INV a method-tag
  {formal, exhaustive, PBT, reference-model}, and decide which (if any) cluster earns a machine-checked formal
  model, by the 3-conjunct rule. Cheap by default; formal only where it pays. Invoke to tag a cluster/invariant
  before goldens (S3).
---

# /formal-decision — which verification each invariant earns (S2)

> **Authority:** Newcombe et al., "How AWS Uses Formal Methods," CACM'15 (design-level TLA+; the "which
> problems" discipline) · Bornholt et al., ShardStore, SOSP'21 (lightweight FM: executable reference model +
> conformance testing) · Shapiro et al. 2011 (INRIA RR-7506 — the state-based CRDT
> **join-semilattice** reduction: merge = least-upper-bound, commut/assoc/idemp) + Gomes/Kleppmann et al.,
> OOPSLA'17 (the Isabelle-mechanized theorem: concurrent operations **commute ⇒** strong eventual consistency,
> under causal / apply-once delivery) · Desai et al., P, PLDI'13 · Konnov et al., Apalache, OOPSLA'19. Nothing
> here is invented.

## Scope — where it sits (S2)

S2 assigns **every behavioural** `INV` a `method-tag ∈ {formal, exhaustive, PBT, reference-model}` (an **exempt**
INV — nothing to verify — carries `n/a`), and decides which
cluster (if any) earns a **machine-checked formal model** (an `FSPEC`). It runs after S1 (requirements) and
feeds S3 (goldens — each tag says which generator produces the golden cases). The governing law is
**cheap-by-default, formal only where it pays** — most invariants are NOT formally modeled, and that is the
point, not a compromise.

## The decision rule — a cluster earns a formal model only if ALL THREE hold

1. **High-consequence & hard to recover** — a violation causes durable damage that other means can't cheaply
   undo. (ShardStore chose durability/consistency; dropped availability/perf — recoverable, other mitigations.)
2. **Combinatorial state that human review + example tests cannot cover** — concurrency interleavings, crash/
   fault orderings, or an exhaustive case-space. _The discriminator:_ if a competent engineer + good tests
   would plausibly find the bug, a formal model is **overhead**. (AWS's decisive bug needed a 35-step trace.)
3. **Cheap to keep alive** — the model won't rot; a non-expert can maintain it (the anti-rot mock, below).

**Most invariants fail #2** → they get an executable reference model + property-based testing, not a formal
model. Formal methods are for the combinatorial minority.

## What to DELIBERATELY NOT model (the anti-overhead core — both papers are explicit)

Performance / emergent degradation · the code itself (verified design ≠ verified code) · hard real-time ·
concurrent **and** crashing executions simultaneously (check them separately) · resource exhaustion. Naming
what you refuse to model is part of the method, not a gap.

## Tool-per-shape (the state space + property decides the tool, not the domain)

| problem shape                                                                         | tag                       | tool                                                                                                                                                                                                                                                                      | why / fallback                                                                            |
| ------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| concurrent convergence / CRDT merge                                                   | `formal`                  | reduce to **join-semilattice laws** (Shapiro'11: commut/assoc/idemp) / **commutativity ⇒ convergence** (Gomes'17); check by **PBT**; escalate to **TLA+/TLC** for the interleaving model; **Apalache** for an unbounded inductive invariant; **Isabelle** only if audited | convergence is an algebraic property — PBT catches most; a model/proof buys the last mile |
| structural-invariant / routing "infallibility" (totality · mutual-exclusion · no-gap) | `exhaustive`              | **exhaustive enumeration** of the finite input space (or **Alloy** if relational)                                                                                                                                                                                         | brute-force decision table is airtight; no FM tool if the domain is finite+small          |
| state-machine / protocol, esp. async                                                  | `formal` (P) — contingent | **P** (executable, model-checked, drives impl testing) or **TLA+**                                                                                                                                                                                                        | choose P if the spec should also test the impl                                            |
| ordering / deterministic sequential                                                   | `PBT`                     | **executable reference model + property-based testing**                                                                                                                                                                                                                   | not an FM problem; the oracle is the reference model — modeling is overhead               |
| standard behaviour (the bulk)                                                         | `reference-model`         | **executable reference model (~1% of code) + PBT**                                                                                                                                                                                                                        | the ShardStore default                                                                    |

## Anti-rot (unconditional, ShardStore) — how a spec stays cheap to keep alive (conjunct #3)

Reference models are written **in the build language** and **reused as the mock** in unit tests → the build
breaks when the spec drifts from the code. This is the one mechanically-real drift fence and the reason a
non-expert can own the spec. It is a precondition for tagging anything `formal` or `reference-model`.

## Artifacts + connections (no disconnected academic model)

- **Properties first** (the UP anchor) — each `INV` becomes a named safety/liveness property before any model.
- **The model** — only for the cluster that earns it (`formal`).
- **The executable reference model** — the DOWN connector; simplest interface-compatible impl (ShardStore: an
  LSM-tree's model "is a hash map").
- **Conformance harness** — refinement / differential testing against the reference model as oracle; + coverage
  instrumentation to detect code the model no longer reaches (catches rot).

Honest limit: conformance testing is **sampled, not proven** ("success = we could not find a bug"); buy
confidence back with scale + coverage metrics, not with a claim of proof.

## The ratified baseline for the Atlas (applied honestly)

Only **one** cluster earns a machine-checked formal model — the rest is a feature, not a compromise:

| cluster                                        | tag                     | note                                                                                |
| ---------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| CRDT OR-Set merge + supersedes (`FSPEC-merge`) | `formal`                | PBT on the semilattice laws first; TLA+/Apalache only if supersede+remove is subtle |
| write-decision "infallible"                    | `exhaustive`            | enumerate the finite input space; existence + uniqueness of the route               |
| grounding truth-gate                           | `PBT`; **contingent** P | reference automaton + PBT; P only if S2 proves it genuinely async                   |
| retrieval drop-order                           | `PBT`                   | deterministic sequential — formal modeling is overhead                              |
| the other ~128                                 | `reference-model`       | executable reference + PBT + mock                                                   |

## Self-check (before a cluster/INV is tagged)

- [ ] ran the 3-conjunct rule — is `formal` justified by ALL three, or is a cheaper tag right?
- [ ] tool matches the **shape** (convergence / structural / protocol / ordering), not the domain?
- [ ] named what you refuse to model?
- [ ] `formal`/`reference-model` tags carry the anti-rot mock (build-language + reused-as-mock)?
- [ ] each tagged `INV` has its UP property named and its DOWN reference model / conformance path?
