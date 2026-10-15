# #196a WAVE PLAN — typed genesis, the dependency-proven vertical slice

> **What #196a is.** The minimal honest vertical of ADR-0017's two-seal design: `atlas mine` emits a
> **typed** fact — `predicateSlot: 'dependency'`, sealed **`proven`** — end-to-end, admitted **iff** the real
> `verify-fact` oracle proves it, with **0 false-proven**. It types the ONE slot that has a real, sound,
> already-wired mechanical oracle today (`verifyDependency`, sound-in-any-world). The ~8 semantic slots
> (validated-ensemble leg) are **#196b**; the tsc `typeOracle` + general check-`synthesize` are DEFERRED
> greenfield (ADR-0017 CORRECTION 2). This slice proves the whole machinery (proposer→slot→proven-gate→seal→
> nodeKey→bench) on the one leg that cannot false-admit.

## GO/NO-GO — HYBRID (contract-first, then 2 parallel, then bench)

`SEAL` is the shared contract (a new additive node field every other WP reads) → freeze it FIRST, sequential.
Then `ORACLE` and `PROPOSER` are write-disjoint (different files) → parallel. `BENCH` depends on all three.

## The measured facts this plan rests on (master `149100f`)

- `seal` goes parallel to `obviousness?` on the node interfaces (`knowledge/src/types.ts:121/204/209/239`) —
  additive + absent-tolerant, the ADR-0012 precedent. No migration, no required field.
- `verifyDependency(...) → FactVerdict { verdict: 'proven' | 'abstain' }` (`genesis/src/verify-fact.ts`)
  over `DepClaim { target, sourceScope, worldScope }` is the sound oracle. `verify-fact-source.ts`
  (`createVerifyFactLeg`) is the production feed off the SCIP index. Both already ride the wired handler
  (`atlas verify-fact`).
- `Candidate.slot: PredicateSlot` already exists; `buildProposal` (`cli/src/mine-gate.ts:87`) already mints
  `PredicateProposal{ slot }`; the admit-harness SOUND arm (`buildSound`) already carries `predicateSlot`;
  `governed-emit.ts` already folds the slot into `nodeKey`. So the identity + proposal plumbing is BUILT —
  the gap is (1) the proposer emitting a dependency slot, (2) the oracle wired into the mine admission,
  (3) the seal field.

## Acceptance items (RED now — each maps 1:1 to a real test)

| #   | item                                                                                                                                                              | kind       | owner WP                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------- |
| A1  | the mine proposer can emit a `predicate` seed with `slot:'dependency'` (not advisory-only)                                                                        | testable   | PROPOSER                   |
| A2  | a dependency candidate whose `verifyDependency` returns `proven` is ADMITTED carrying `predicateSlot:'dependency'` + `seal:'proven'`                              | testable   | ORACLE                     |
| A3  | a dependency candidate whose oracle ABSTAINS is DROPPED — never admitted as a typed fact (**the 0-false-proven core**)                                            | testable   | ORACLE                     |
| A4  | the emitted proven fact stores `seal:'proven'`; the field is additive + absent-tolerant (a pre-existing seal-less fact reads `seal:undefined`, no crash)          | testable   | SEAL                       |
| A5  | nodeKey folds the slot — a proven `dependency` fact and an advisory at the same anchor get DISTINCT identities and coexist                                        | testable   | SEAL (pin; leg exists)     |
| A6  | benchmark on real mined Atlas facts: **0 false-proven** on the dependency slot (every `proven` fact's dep claim holds vs the oracle), per-slot precision reported | testable   | BENCH                      |
| A7  | the seal is surfaced in the pack/query so a reader sees HOW the slot was decided                                                                                  | **judged** | SEAL                       |
| A8  | a NON-`dependency` typed seed reaching admit is handled deterministically (advisory-fallback, seal-less) and never sealed `proven`                                | testable   | ORACLE                     |
| A9  | two `dependency`-slotted facts at the same anchor map to ONE nodeKey and the second UPDATES the first (collision half of the design)                              | testable   | ORACLE (SEAL pins nodeKey) |
| A10 | mining that yields no `dependency` proof still emits advisories exactly as before — regression over the current advisory-only suite                               | testable   | PROPOSER                   |
| A11 | an abstained/dropped candidate carries NO `seal:'proven'` (seal absent) in any surviving form                                                                     | testable   | ORACLE                     |
| A12 | the admitted `dependency` fact's anchor is (re)grounded and the oracle proof is tied to that SAME grounded anchor                                                 | testable   | ORACLE                     |
| A13 | a malformed/unresolvable dependency TARGET yields `abstain` (dropped) — never `proven`, never a thrown error                                                      | testable   | ORACLE                     |
| A14 | landing a proven `dependency` fact leaves a pre-existing advisory at the anchor byte-for-byte unchanged                                                           | testable   | ORACLE                     |
| A15 | an admitted proven fact records its oracle-provenance (oracle identity + verdict) in the mine ledger, not just the `seal` label                                   | testable   | LEDGER                     |

| A16 | re-mining a previously-proven dependency fact whose target NO LONGER verifies REVOKES the stored `seal:'proven'` (→ advisory/seal-less) — no stale-proven survives a code change | testable | ORACLE (reuse drift/freshness) |
| A17 | a proven dependency fact stays under the SAME T2 tier gating as an advisory at the site — the `proven` seal neither promotes tier nor bypasses tier gating | testable | SEAL (contract) + ORACLE (assert) |

> **SUITE FROZEN at A1–A17.** Cold suite-critic convergence: round 1 +8 gaps, round 2 +2, round 3 (DeepSeek
> via gateway) returned **NO NEW GAPS**. Items A8–A15 folded from round 1; A16–A17 from round 2. A16 is the
> **0-false-proven-OVER-TIME** property — the seal is only "live proven" while its grounding is FRESH, so the
> ORACLE WP TIES the seal to the existing drift/freshness leg (a drifted proven fact stales/demotes via the
> machinery already built), not a new revocation mechanism. A17 keeps the seal orthogonal to tier. Round 3
> convergence check in flight; suite frozen when a round returns dry (or residual logged as explicit backlog,
> never silently dropped).

## WP table

| WP                | owns                               | files (write-disjoint)                                                                       | model  | dep-on                         |
| ----------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- | ------ | ------------------------------ |
| **196a.SEAL**     | A4, A5, A7                         | `knowledge/src/types.ts`, `adapter-io/src/governed-emit.ts` (store leg), query/pack surface  | sonnet | — (FIRST)                      |
| **196a.ORACLE**   | A2, A3, A8, A9, A11, A12, A13, A14 | `adapter-io/src/compose-mine-admission.ts` (+ a small verify-fact→typeOracle adapter module) | sonnet | SEAL@contract                  |
| **196a.PROPOSER** | A1, A10                            | `adapter-io/src/prompt.ts`, `cli/src/mine-decide.ts`                                         | sonnet | SEAL@contract                  |
| **196a.LEDGER**   | A15                                | mine ledger / provenance sidecar writer                                                      | sonnet | ORACLE                         |
| **196a.BENCH**    | A6                                 | `packages/e2e/test/` (new bench)                                                             | sonnet | SEAL, ORACLE, PROPOSER, LEDGER |

> ORACLE owns 8 items — above the ≤4 sweet spot — but they are ONE cohesive owner (the single admit-path
> file `compose-mine-admission.ts` + its tests) and the architecture is pre-decided (the type-expressible-slot
> call below), so the agent has 0 live decisions. Splitting would fork one file across two writers (conflict).
> Held as one WP by design; if it returns too-big, re-slice its tests from its wiring.

## Conflict map

- SEAL ⟂ ORACLE ⟂ PROPOSER on WRITES (disjoint files). SEAL→{ORACLE,PROPOSER} is a **dependency** (they read
  the frozen `Seal` type + the store leg), not a conflict → SEAL freezes first, then the two run parallel.
- BENCH is read-only over the shipped behavior → depends on all, no write conflict.

## FROZEN SEAM (lead pre-decision, 2026-08-13 — grounded, not rushed)

`verify-fact.ts` is **explicitly the POSITIVE DUAL of the #99b negation door** (its own header). So a proven
`dependency` fact is the positive counterpart of a negation and carries the **same two identity legs as
`NegationSeed`**: `target` (the global symbol X the fact depends on) + `scope` (the directory key S). This is
the reuse that resolves the fork — no new extraction machinery, no overlap-invention:

- **PROPOSER** emits, for a dependency claim: `PredicateSeed { slot: 'dependency', target: X, scope: S, claim }`.
- **ORACLE** wires the typeOracle: `expressible(slot) = (slot === 'dependency')`;
  `diagnose(site, 'dependency')` builds `DepClaim { sourceScope: S, target: X, worldScope: S }`, calls the
  composed `createVerifyFactLeg(scip)` dependency leg, returns `'HOLDS'` iff `proven` else `'NA'` (abstain →
  drop). verify-fact is already TOTAL — malformed/missing target/scope → abstain, never a throw.
- The admit-harness **sound arm already carries `predicateSlot`**; ORACLE stamps `seal: 'proven'` there.

**This creates a SHARED CONTRACT** (`target?` + `scope?` on `PredicateSeed` in `genesis/src/extract.ts`, and
on `Candidate`/`PredicateProposal` in `genesis/src/admit-proposals.ts`) that BOTH ORACLE and PROPOSER read →
so it is frozen FIRST as its own tiny additive WP **196a.SEAM2** (mirrors how SEAL went first), then ORACLE
and PROPOSER run write-disjoint in parallel. Revised order: **SEAL ✅ → SEAM2 → (ORACLE ∥ PROPOSER) → LEDGER
→ BENCH**.

## Frozen file-level blast radius (measured on master `b346501`, write-disjoint)

- **ORACLE** owns: `adapter-io/src/compose-mine-admission.ts` (typeOracle: `expressible(slot)=slot==='dependency'`;
  `diagnose(site,'dependency')`→`DepClaim{sourceScope:site.scope,target:site.target,worldScope:site.scope}`→
  `verifyDependency`→`'HOLDS'` iff `proven` else `'NA'`; **signature grows** to take a `SymbolReverseApi`) ·
  `cli/src/mine-gate.ts` (the `composedGate` caller at :160 threads `createSymbolReverse(skeleton…scipOutput)`
  into `buildMineAdmission`; `buildProposal` forwards `target`/`scope`) · `genesis/src/admit-harness.ts`
  (`buildSound` at :331/342 stamps `seal:'proven'` — everything through the sound-oracle arm IS proven).
- **PROPOSER** owns: `adapter-io/src/prompt.ts` (the model emits, for a dependency claim, the `target` global
  symbol + `scope` directory) · `cli/src/mine-decide.ts` (parse → `seed.slot='dependency'` + set
  `Candidate.target`/`Candidate.scope`, the fields `typeOracle.diagnose(site)` reads).
- Disjoint on WRITES (ORACLE: compose-mine-admission, mine-gate, admit-harness; PROPOSER: prompt, mine-decide).
  SEAM2 (merged) is the shared contract both read → no conflict. ORACLE gets lucy cold-review (0-false-proven).

## The one pre-decided architectural call (lead keeps this judgment)

**Model `dependency` as a type-expressible slot whose `diagnose` IS the verify-fact oracle.** In
`buildMineAdmission`, `typeOracle.expressible(slot) = (slot === 'dependency')` and
`typeOracle.diagnose(site, 'dependency')` maps the site → `DepClaim`, calls `verifyDependency`, returns
`'HOLDS'` iff `proven`, else `'NA'` (abstain). This reuses admit-harness's already-tested SOUND-oracle-first
arm (which already carries `predicateSlot` and mints no fabricated `Check`) — so a wrong proposal ABSTAINS,
never mints a false-typed fact. The builder TRANSCRIBES this against the frozen `admit-harness`; it invents no
admission. verify-fact's proven/abstain (no `refuted`, sound-in-any-world) is an exact fit for HOLDS/NA.

## DoD (global gate, every WP)

`npm run build` + `npm test` green · `godfile-guard` (≤400 LOC) · `layer-guard` (no upward edge — the
verify-fact→typeOracle adapter lives in adapter-io, which may import genesis) · `spec-conformance-guard` ·
new tests RED→GREEN, none vacuous · lucy cold-review on the identity/seal change before merge.

## Merge order

SEAL → (ORACLE ∥ PROPOSER) → BENCH → lucy cold-review → squash-merge each via PR (master is `gate`-protected).
