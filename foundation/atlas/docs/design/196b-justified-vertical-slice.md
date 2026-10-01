# 196b — the `justified` vertical slice (one semantic slot, end-to-end)

> **Status: PROPOSAL, awaits owner ratification of the ONE ratified-surface amendment (§Contract, item 1).**
> Grounded against master `0f541f5`. The lead does not self-ratify a ratified surface (the `Seal` union is
> ADR-0017 surface).

## The goal (one vertical slice, the hard case proven first)

Prove the whole `justified` machinery end-to-end on ONE semantic slot — **`gotcha`** — so that `atlas mine`
emits a fact that is:

- **typed** — carries `predicateSlot: 'gotcha'` (one of the 13 normative `PredicateSlot` members), not
  slotless advisory prose;
- **sealed `justified`** — a first-class seal that names its ground, distinct from a bare unsealed advisory
  and from `proven`;
- **carrying its derivation** — the grounding span into content-addressed bytes PLUS a compact derivation
  that leads a reader to the same conclusion and can be contested (per `genesis-epistemic-contract.md`
  §JUSTIFIED: "the justification … travels with the fact");
- **admitted iff grounded** — no oracle gates it (there is none for a semantic slot); grounding is the
  admission door, the seal reflects proof-strength, per `proven-vs-justified.md`.

`gotcha` is chosen because it is unambiguously semantic (no mechanical oracle temptation — it exercises the
`justified` path, the valuable case), common in real code, and squarely what Atlas exists to surface.

**This slice deliberately does NOT** touch the other 10 unemitted slots. It proves the mechanism; scaling to
the remaining semantic slots (invariant/contract/…) and the provable ones (definition/pre/post) are follow-up
slices that reuse this contract. One slot, all three holes closed.

## The three holes this closes (design ↔ shipped delta, measured on `0f541f5`)

| the ratified design says                                                                                             | shipped `0f541f5` does                                                                                                                                                              | hole                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Seal = 'proven' \| 'justified'`, each naming its ground (`genesis-epistemic-contract.md` §"seal names its grounds") | `Seal = 'proven'` only (`packages/knowledge/src/types.ts:147`); a grounded semantic fact lands as an UNSEALED advisory via `admitAbstainedAsJustified` (`admit-harness.ts:256-267`) | `justified` is not a first-class seal — indistinguishable from a bare advisory              |
| the fact carries its slot (one of 13, `types.ts:312-325`)                                                            | only `dependency`/`count` carry a slot; the other 11 fall to slotless advisory                                                                                                      | the type is dropped for 11 slots                                                            |
| the justification (grounding span + **derivation**) travels (`epistemic-contract` §JUSTIFIED L27)                    | the node carries `claimNorm` + `grounding` spans, **no derivation carrier**                                                                                                         | the "what leads a reader to the same conclusion" is parsed away as scratch and never stored |

## Contract (freeze FIRST, sequential — every leg reads it)

1. **`Seal` union += `justified`** — `Seal = 'proven' | 'justified'` (`packages/knowledge/src/types.ts:147`).
   Additive, absent-tolerant (a pre-existing seal-less fact reads `seal:undefined`, no crash), the ADR-0012
   precedent. **This is the ratified-surface amendment (ADR-0017 CORRECTION 5) that needs owner ratification** —
   everything else below is unratified-surface implementation.
2. **Derivation carrier** — the node gains an additive `derivation?: string` (absent-tolerant, same discipline
   as `seal`/`obviousness`). It holds the compact, contestable derivation-to-the-claim from the cited bytes —
   NOT the model's free scratch reasoning (which stays parsed-away per `epistemic-contract` §"keep reasoning
   scratch"). It is the thing that "leads a reader to the same conclusion."
3. **Admit rule** — a grounded proposal carrying a semantic `predicateSlot` (here `gotcha`) with no witness is
   admitted carrying `predicateSlot` + `seal:'justified'` + `derivation`, gated ONLY by the truth door
   (grounding). This REPLACES the degenerate `admitAbstainedAsJustified` → bare-advisory downgrade for the
   semantic-slot case (dependency/count `proven` path unchanged; ungrounded still drops).
4. **Proposer output grammar** — the frozen `propose.md` gains a slot classification + a derivation line for a
   `gotcha` candidate; the parser (`llm.ts`) turns it into `PredicateSeed{ kind:'predicate', slot:'gotcha',
derivation, grounding }`. Provenance digest of `propose.md` changes (a deliberate, recorded change).

## Acceptance items (RED now; each 1:1 a real test)

| id  | acceptance test                                                                                                                                                                              | kind     | owning WP |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| A1  | `Seal` type admits `'justified'`; a fact with `seal:'justified'` round-trips store→projection→query, and a pre-existing seal-less fact still reads `seal:undefined` (additive, no migration) | testable | SEAL      |
| A2  | a grounded `gotcha` proposal with no witness is ADMITTED carrying `predicateSlot:'gotcha'` + `seal:'justified'` + a non-empty `derivation`                                                   | testable | ADMIT     |
| A3  | an UNGROUNDED `gotcha` proposal is DROPPED (`DROP_UNGROUNDED`) — grounding is still the door                                                                                                 | testable | ADMIT     |
| A4  | the proposer emits, for a real gotcha unit, a parseable `{slot:'gotcha', derivation, grounding}` seed; a non-gotcha unit emits `NO-FACT`                                                     | testable | PROPOSER  |
| A5  | `verify-store` routes a `seal:'justified'` fact correctly (does not treat it as `proven`, does not crash on it, does not silently skip it as seal-absent)                                    | testable | STORE     |
| A6  | `atlas mine` on a fixture repo with a known gotcha emits ONE fact, durably, carrying slot+justified+derivation, visible via `atlas query`/`atlas node` (blackbox subprocess)                 | testable | BENCH     |
| A7  | the derivation stored is the contestable claim-derivation, NOT the raw scratch reasoning (scratch is still parsed away)                                                                      | judged   | BENCH     |

## WP slices + conflict map

| WP                                     | owns files (disjoint)                                                                                                          | owns AC | dep-on               | model  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------- | -------------------- | ------ |
| **SEAL** (contract, FIRST, sequential) | `packages/knowledge/src/types.ts` (Seal union + `derivation?`), the frozen-projection seam                                     | A1      | —                    | sonnet |
| **PROPOSER**                           | `packages/adapter-io/prompts/propose.md`, `packages/adapter-io/src/llm.ts` (parser), `packages/cli/src/mine-proposer.ts` (arm) | A4      | SEAL@contract        | sonnet |
| **ADMIT**                              | `packages/genesis/src/admit-harness.ts` (semantic-justified path), `packages/adapter-io/src/compose-mine-admission.ts`         | A2, A3  | SEAL@contract        | sonnet |
| **STORE**                              | `packages/adapter-io/src/reverify-store.ts` + `verify-store` leg                                                               | A5      | SEAL@contract        | sonnet |
| **BENCH** (last, integrates)           | `packages/e2e-blackbox/**` new story + a gotcha fixture                                                                        | A6, A7  | PROPOSER+ADMIT+STORE | sonnet |

**Conflict map:** SEAL is the one shared file (`types.ts`) every leg reads → freeze it FIRST (sequential),
then PROPOSER ∥ ADMIT ∥ STORE run parallel (disjoint files), BENCH integrates last. Same shape as 196a. No
`MUTATION_CONFLICT` after SEAL freezes.

## Honest limits stated up front

- One slot (`gotcha`), one fixture — proves the mechanism, not a recall number. Scaling to 11 slots is
  explicit follow-up.
- `justified` is NOT a truth claim. Its confidence is raised only by model-independent means (ensemble,
  human ratification, survival on re-read) — never converted to `proven`. This slice does not build those.
- The derivation is the model's contestable reading; the grounding span is what makes it re-checkable. A
  reader who opens the span may DISAGREE — that is the design working, not a defect.
