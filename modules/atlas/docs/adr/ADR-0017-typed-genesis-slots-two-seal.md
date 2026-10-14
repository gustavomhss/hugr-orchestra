# ADR-0017 — Genesis emits typed facts via a two-seal slot classifier

**Status:** ACCEPTED — owner-ratified 2026-08-13; AMENDED to one-seal (proven-only) — owner-ratified 2026-08-16 (see CORRECTION 3); AMENDED again — the oracle AWARDS `proven`, never gates admission; oracle-abstain admits `justified`, never drops — owner-ratified 2026-08-19 (see CORRECTION 4); AMENDED again — `justified` becomes a FIRST-CLASS seal value carrying its `derivation` — owner-ratified 2026-08-22 (see CORRECTION 5, 196b).
**Supersedes/relates:** #196 (the measured gap), #152 (KNOW-10 closed-slot gate with no producer), #99 /
ADR-0016 (the negation sound-gate pattern this reuses), ADR-0012 (the additive/absent-tolerant field
precedent), #226 (the independent adjudication panel). Full reasoning:
`docs/design/196-typed-genesis-slot-proposal.md`.

> **CORRECTION 3 (owner-ratified 2026-08-16 — the `validated` seal is CUT; genesis ships proven-only).** The
> owner ruled that genesis ships **sound-by-default** and the `validated` semantic seal is **retired**, not
> built. Rationale (measured, the #196b lens-2 audit): there is **no sound mechanical way to plant semantic
> ground-truth**, so the `validated` seal's honesty could only ever rest on a same-family LLM-ensemble whose
> reliability is an unmeasured number the bench cannot soundly produce — and a non-sound seal shipped beside a
> sound one dilutes the one strong claim (`proven`) the product has. So, superseding Decision points 3 and
> build-leg (c) below:
>
> - `Seal` narrows to **`proven`** only (`packages/knowledge/src/types.ts`). The seal FIELD stays on nodes;
>   sound facts carry `seal:'proven'`, and **advisory prose carries NO seal** — grounded-only, which is
>   honest: grounded is aboutness, not proof.
> - Build-path leg **(c) "build the validated leg" is WITHDRAWN**. The inert `verifyValidated` port,
>   `admitValidated` / `buildValidated` arms, and the `verify-validated-ensemble` adapter (Wave-1/2a, never
>   wired to any shipped path — 0 production callers) are DELETED. A semantic slot with no mechanical oracle
>   **drops** (`DROP_NO_CHECK`) or is emitted as **advisory prose** — never minted as a sealed fact.
> - Two-seal becomes **one-seal**, and this does NOT delete advisory mining: advisory prose (the 100%-precision
>   #223 arm, the bulk of the knowledge output) STAYS; it simply carries no truth-seal. "Sound by default"
>   means the default `atlas mine` run ADDS the sound arms (dependency / count) BESIDE advisory, each fact
>   honestly sealed — it never swaps prose out.
> - Supersedes CORRECTION (2026-08-17, same-family ensemble), now moot: there is no ensemble. The `proven`
>   core of this ADR (sound oracle, 0-false-proven, never mixed) is unchanged and is the entire seal
>   vocabulary now.

> **CORRECTION 4 (owner-ratified 2026-08-19 — the sound oracle AWARDS `proven`, it never GATES admission;
> `genesis-epistemic-contract.md`).** The epistemic contract cut the deterministic oracle as the _truth-gate_
> for model-proposed facts: a fact that NEEDS a model to be found is, by the complementarity argument, exactly
> a fact no deterministic checker is sound for, so an oracle used to admit/reject it can only bless the trivial
> band and reject the semantic facts that are the point. The mine-path admission is therefore INVERTED
> (WP-CUT-MINE, `packages/genesis/src/admit-harness.ts`), superseding the CORRECTION 3 bullet that said an
> abstaining slot **drops** (`DROP_NO_CHECK`):
>
> - The sound oracle (`verifyDependency` / `verifyCount`, symbol-reverse / cardinality) is now a **proof
>   AWARDER, never an admit gate**. When it **proves** the slot the fact is sealed **`proven`** (carrying its
>   re-runnable witness, `buildSound`); when it **abstains** the candidate is **NOT dropped** — a grounded
>   candidate is admitted as **`justified`** (an unsealed advisory, `admitAbstainedAsJustified`), contestable
>   and honestly not labeled proven. Oracle abstention is not a failing check.
> - `DROP_NO_CHECK` / `DROP_DEP_ABSTAIN` / `DROP_COUNT_ABSTAIN` are **retired** (deleted, not commented). The
>   only remaining drops on this path are: ungrounded (fails the truth door), a synthesized `check` that does
>   not compile ∧ HOLDS (GEN-12c/d), a vacuous/toothless check (GEN-12j), malformed, and unwired.
> - `Seal` still narrows to **`proven`** only (`packages/knowledge/src/types.ts`) — `justified` is the
>   **absence** of a seal on a grounded advisory, not a new seal value. The one-seal vocabulary of CORRECTION 3
>   is unchanged; what changed is that oracle-abstain now DOWNGRADES to unsealed-advisory instead of dropping.
> - Scope: this is the MINE path (dependency / count typed slots). The **negation** closed-world door
>   (`governed-emit-negation.ts`, ADR-0016) is **unchanged** — it is a soundness gate on a human `atlas emit`
>   assertion, not a truth-gate on a model-proposed fact, so it is out of the contract's scope (owner-ratified
>   2026-08-19: negation has no production model-proposer; keep the sound door).

> **CORRECTION 5 (owner-ratified 2026-08-22 — `justified` becomes a FIRST-CLASS seal value that carries its
> derivation; 196b vertical slice, `docs/design/196b-justified-vertical-slice.md`).** This REVERSES CORRECTION
> 4's bullet that made `justified` the mere **absence** of a seal. Reason: a grounded semantic fact must be
> _distinguishable_ from a bare advisory, and — per the owner's governing principle — where there is no
> mechanical proof, **the "proof" is the reasoning and the grounds that lead a reader to the same conclusion**,
> and that justification must **travel with the fact**. Absence-of-seal carries neither the distinction nor the
> derivation, so it cannot express the contract. The amendment:
>
> - `Seal = 'proven' | 'justified'` (`packages/knowledge/src/types.ts`). ADDITIVE + absent-tolerant, same
>   discipline as `obviousness`/`witness` — a pre-existing seal-less fact still reads `seal:undefined`, no
>   migration. This is the two-seal vocabulary the design (`genesis-epistemic-contract.md`,
>   `proven-vs-justified.md`) always named; CORRECTION 3 cut only the _non-sound `validated` ensemble seal_,
>   never the `justified` ground.
> - The node gains an additive `derivation?: string` — the `justified` seal's own carried grounds (the
>   contestable chain from the cited bytes), the exact parallel of the `proven` seal's `witness`. It is the
>   model's grounds, NOT its free scratch reasoning (that stays parsed-away, `epistemic-contract` §"keep
>   reasoning scratch").
> - Admit: a grounded semantic-slot candidate with no witness is admitted carrying `predicateSlot` +
>   `seal:'justified'` + `derivation` (superseding the CORRECTION 4 downgrade-to-bare-advisory for the
>   semantic-slot case). `proven` (dependency/count) and the drop set are unchanged; ungrounded still drops.
> - Distinct from the CUT `validated` seal (CORRECTION 3): `validated` was a non-sound _truth-grade_ claimed by
>   an LLM ensemble (impractical, non-assertive). `justified` claims NO proof — it is honestly "a grounded,
>   contestable reading, here are the grounds"; its confidence is raised only by model-independent means and
>   NEVER converted to `proven`. Adding `justified` does not reopen the `validated` cut.

## Context

`PredicateSlot` (`packages/knowledge/src/types.ts:283`) is a closed, normative 12-member vocabulary, and
`nodeKey = hash(primaryAnchorId ‖ predicateSlot)` is designed to collide facts of the _same_ type at the
_same_ place so they UPDATE/union instead of proliferating. The #196 measurement (RUN2, `e4882a3`) found
`predicateSlot` **absent in 200/200** mined facts, so identity collapses onto the anchor and two facts of
_different_ types about one place evict each other.

**Corrected root cause (measured on current master `7de5faf`, not the stale card).** The gap is NOT a
missing design — the typed-slot admission ENGINE exists and is tested (`genesis/src/admit-harness.ts`,
GEN-12k; #225 E&V + #229 completed its legs): a proposer proposes a typed `PredicateProposal` carrying a
`slot`, `admit-harness` mints the fact CARRYING `predicateSlot: p.slot` (line 342), and `governed-emit.ts`
folds the slot into `nodeKey` and stores it. What is unwired is the SHIPPED `atlas mine` path: its gate
proposes **advisories only** (`cli/src/mine-gate.ts` `makeAdmitGate`), and its admission supply
(`adapter-io/src/compose-mine-admission.ts:75`) hands the engine **fail-closed STUB oracles** —
`typeOracle: { expressible: () => false, diagnose: () => 'NA' }` and `predicate: { synthesize: () => null,
… }` — explicitly documented there as "a predicate path wired later must supply real ones." So a predicate
candidate can never be admitted-with-slot; every mined fact falls back to a slotless advisory. The absent
slot is a **reference-model-vs-shipped** gap (the engine is real and inert), not an absent classifier.

The 12 slots split by _how_ a slot is checkable — and the engine already models this split. `dependency`
(`verifyDependency`) and `definition` (SCIP `definition`-occurrence, `symbol-reverse.ts`) are structurally
provable; the `typeOracle`'s `expressible`/`diagnose` additionally covers the **type-expressible** slots the
compiler/LSP can decide (`admit-harness.ts` names `contract` / `ownership` / visibility) — so MORE than two
slots are provable once a real oracle is supplied. The genuinely non-expressible remainder (`gotcha`,
`rationale`, and any slot no oracle can decide) is what needs the validated leg.

## Decision (ratified)

Genesis emits a typed slot per fact under a **two-seal** classifier, mirroring the ratified seal distinction
(validate by the _nature_ of the fact, pay by _value_; the two seals never merge):

1. **Propose** — the cheap DeepSeek proposer (the #150 arm) proposes one `predicateSlot`. Fallible by design;
   the gate, never the model, decides admission.
2. **PROVEN slots** (`dependency`, `definition`, plus any slot a mechanical oracle later covers): admitted
   **iff** the oracle discharges the proposal (`proven | abstain`, the #99 pattern — a wrong proposal
   abstains, it can never mint a false-typed fact). Sealed **`proven`**.
3. **VALIDATED slots** (the ~8 semantic): admitted **iff** an _independent_ LLM-ensemble (a distinct model
   family, the #226 panel, majority) agrees with the proposed slot. ~0 false-positive but explicitly **not
   sound**. Sealed **`validated`**.
4. The seal is a stored field on the fact; the two seals are surfaced separately and never combined into one
   score. **nodeKey carries the slot** as designed, so differently-typed facts about one place coexist.
5. The `predicateSlot` and seal fields are **additive and absent-tolerant** (the ADR-0012 `obviousness` /
   #75 `builtAt` discipline): pre-existing facts stay readable, no migration, no fabricated default.
   Totality ("every _newly_ mined fact carries a slot + seal") is enforced behaviourally at the emit path and
   its goldens, not by a required type field.

> **CORRECTION (2026-08-17 — the validated ensemble is SAME-family, per owner decision 2026-08-16).** Points 3
> and the build path below say the validated ensemble is "a distinct model family" via "the gateway." The owner
> subsequently ruled: **the ensemble is independent _sonnet_ raters via the Agent tool — SAME family, not
> cross-family, and NOT the gateway** ("no budget for other-provider quality models; the validation is not
> complex enough to justify the extra complexity"). This changes what the `validated` seal's honesty rests on:
> it is NOT a distinct-family jury's impartiality — it is **fresh, independent, adversarial sonnet raters +
> majority, whose reliability is a MEASURED false-rate (#95), not a claim of family-independence.** Wherever
> this ADR says "distinct model family" / "gateway ensemble," read "independent same-family sonnet ensemble,
> reliability measured." The two-seal core (proven ≠ validated, never mixed, `validated` explicitly non-sound)
> is unchanged. NOTE (owner-gated follow-up): the semantic/validated bench (#95 false-rate) is NOT YET RUN —
> the #196b lens-2 audit found no sound mechanical way to plant semantic ground-truth, so the validated seal's
> number awaits the owner's ratified methodology (option C: adjudication panel, explicitly labelled non-sound).

## Alternatives rejected

- **Proven-only** (abstain on every semantic slot): sound, but leaves ~8/12 slot classes permanently
  untyped — genesis would type almost nothing on real mined prose (mostly ownership/rationale/gotcha), which
  re-creates the ceiling for the semantic majority.
- **LLM-classify-all with only a write-template shape check**: one fallible model self-certifying its own
  classification is exactly the "prompt-typed ≠ true" failure of #201/#202. No independent check.

## Consequences

- Closes the identity collapse (#196) and gives KNOW-10's closed-slot gate (#152) a producer to enforce
  against; `own-source.ts`'s `predicateSlot === 'definition'` read filter starts matching.
- New stored fields (`predicateSlot` already in the frozen shape; a `seal` field parallel to `obviousness`).
- nodeKey identity change is forward-only: old facts keep anchor-collapsed identity, new facts get
  slot-qualified identity. No rewrite of stored nodes.
- A `validated` fact is honestly non-sound: the pack and any reader can see _how_ each slot was decided.

## Build path (a separate campaign, to be decomposed + cold-reviewed)

> **CORRECTION 2 (measured on master `149100f`, 2026-08-13 — the binary, not this ADR's first draft).** The
> first draft called this a "wiring" campaign because "the engine already exists." An admit-harness engine
> DOES exist, but a per-oracle census of PRODUCTION code (not test fixtures) shows most legs this section
> names as ready-to-wire **do not exist as production code** — only ONE proven oracle is genuinely wireable
> now. The honest inventory:
>
> | leg                             | ADR-first-draft claim                  | measured on `149100f`                                                                                                                                                                                                                                                                                     |
> | ------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `dependency` proven oracle      | "#224 machinery"                       | **REAL & wired** — `atlas verify-fact` (`verify-fact.ts` + `verify-fact-source.ts` over `SymbolReverseApi`), PROVE/ABSTAIN, sound-in-any-world. This is the one true proven leg. Rides a **separate seam** from admit-harness's `typeOracle`/`predicate`, though.                                         |
> | check `synthesize` (cand→Check) | "the real check synthesizer from #225" | **DOES NOT EXIST in production.** #225 built the `evaluator` (the _verify_ leg: `Check`→HOLDS/BROKEN), never a _synthesizer_. Every production `synthesize` is `() => null`; all real ones are test fixtures.                                                                                             |
> | tsc/LSP `typeOracle`            | "the real type-checker/LSP typeOracle" | **DOES NOT EXIST.** `expressible: () => false` everywhere in production; the only non-false `expressible` are test fixtures. No slot is ever type-expressible in the shipped path.                                                                                                                        |
> | validated ensemble gate (#226)  | "independent #226 panel"               | **NOT a production admission leg.** #226 is a benchmark-adjudication _skill_ (κ/α), not a shipped gate. An independent-ensemble admission door is greenfield (it can reuse the panel's logic + the gateway ensemble, but the door itself must be built).                                                  |
> | proposer emits a slot           | (implicit)                             | **Partial.** `buildProposal` (`mine-gate.ts:87`) already mints `PredicateProposal{slot: seed.slot}` when `seed.kind==='predicate'`; `mine-decide` reads an `fSlot`. What is missing is a proposer that actually EMITS `seed.kind==='predicate'` with a slot (the DeepSeek #150 arm today emits advisory). |
> | `nodeKey` slot leg              | "already exists"                       | **TRUE** — `governed-emit.ts` folds `predicateSlot` into identity + stores it.                                                                                                                                                                                                                            |
>
> **Corrected scope (owner fork below).** Only the `dependency` proven leg is _wiring_. The validated-ensemble
> gate is greenfield-but-bounded (reuse #226 + gateway). The tsc `typeOracle` and the general check
> `synthesize` are **unbounded greenfield** and, per the anti-overengineering bar, should be DEFERRED — the
> remaining structural slots fall to `validated` (or abstain) until a synthesizer exists, not built in this
> campaign. So the honest #196 campaign is: **proposer-emits-slot + dependency-proven leg + validated-ensemble
> leg + seal field + goldens + bench**, with tsc-oracle/synthesizer explicitly out of scope. Owner ratifies
> the cut before dispatch.

The legs, corrected:

(a) **Wire the one real proven oracle** — bridge `atlas verify-fact`'s dependency oracle into the mine
admission so a `dependency`-slot predicate is admitted **iff** it PROVES (`proven | abstain`), sealed
`proven`. (Probe `definition` via SCIP def-site — cheap; include only if a WP confirms it.) The stubbed
admit-harness `typeOracle`/general-`synthesize` legs stay fail-closed — NOT built here. (b) **Proposer emits a
slot** — the DeepSeek #150 arm proposes `seed.kind==='predicate'` with a `slot`; `buildProposal` already
forwards it. (c) **Build the validated leg** — an independent-ensemble admission door (reuse the #226 panel
logic + the gateway for the distinct-family ensemble) for the semantic slots, sealed `validated`. (d) The
`seal` field (parallel to `obviousness`); the nodeKey slot leg already exists — add absent-tolerant goldens.
(e) A benchmark on real mined facts — per-slot precision, **0 false-proven**, measured false-rate on
**validated**. lucy cold-review on the identity/seal change before merge. NOTE — measure-first per WP: the
`149100f` census above is the current truth; re-confirm each leg on the then-current master before building.
