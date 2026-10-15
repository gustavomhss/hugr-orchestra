# #96 — Genesis output contract: emit the typed knowledge vocabulary through the governed door

> **Status:** contract frozen 2026-08-10. Owner ratified two load-bearing decisions the same day:
> (1) genesis emits **through the governed door**, not a lower-trust parallel path; (2) close **#96-full
> (all 4 fact shapes)** before the #95 benchmark. Frozen on measured surfaces (bobby's architecture map,
> `master 935276c`); every structural claim below was read in the code, not assumed.

## 0. The crux

Genesis mines facts but emits only **one** of Atlas's four fact shapes (advisory), and it reaches the store
through its own **staging sidecar**, not the governed door. So the product that is _about_ typed, governed,
scoped knowledge produces a single untyped-beyond-advisory, T2-only stream. #96 makes genesis emit the
**full typed vocabulary** — advisory · predicate · relation · negation — and routes every mined fact
**through the governed door** so it faces the same 16-gate ladder a human `atlas emit` faces.

## 1. Measured current state (`master 935276c`, bobby [M])

- **The mine path is SEVERED from the projection (this is a feature — closes #87).** `mine.ts:23-25`
  fixtures make `loadProjection`/`persistProjection`/`commitProjection` throw; the pass writes its own
  staging sidecar via `DiskStore.commitStaging` (`mine.ts:288`). It runs the **S2 admission gate only**
  (`mine-gate.ts` → `admit-harness.ts`), never the governance ladder.
- **The governed door already runs over staging.** `atlas promote` (`adapter-io/src/governed-promote.ts`,
  reachable `bin.ts → cli.ts:206 → promote.ts`) reads the staging sidecar, rehydrates each row from CAS,
  and feeds it to `createGovernedEmit(...).emit` with **`origin:'promoted'`** (`compose.ts:342`) — which
  removes the KNOW-18 fast-path so the full ladder incl. the KNOW-8 `ratify()` actually runs. **This is
  the reconciliation the owner ratified; it exists and is shipped.** (bobby Option B.)
- **The proposer knows 3 shapes, not 4.** `admit-harness.ts:91` `type Proposal = PredicateProposal |
AdvisoryProposal | Abstention`. The `admit()` switch (`:182-189`) has cases `abstain`/`advisory`/
  `predicate` — **no `relation`, no `negation`.** `admitPredicate` (`:206`) exists but the CLI never
  reaches it: `mine-gate.ts:73` hard-codes `kind:'advisory'` on every candidate it builds.
- **The WRITE doors already exist for every shape.** advisory + predicate (`upsert.ts`), relation (`#99a`,
  `relationWellFormed`/`relationKey`), negation (`#99b`, `emitNegation`, `NegationNode`). The asymmetry is
  entirely on the **propose+admit** side.
- **The four node shapes (identity legs are MINTED, never trusted):**
  - `AdvisoryNode` — `{kind, nodeKey, claimNorm, grounding, tier, obviousness?}`.
  - `PredicateNode` — advisory + a mechanically-synthesized+attested `check` (never model-supplied).
  - `RelationNode` (`types.ts:109`) — `{kind:'relation', relationKind, endpointA, endpointB, grounding,
tier, scope?}`; identity = `relationKey = hash(endpointA ‖ relationKind ‖ endpointB)`.
  - `NegationNode` (`negation-types.ts:41`) — `{kind:'negation', id, tier, relationKind, target, scope,
grounding, edgeModel, freshness, claims, authoring}`; its honest-abstention sibling is
    `AbstainedRecord` (`reason: 'scope-open'|'target-not-global'|'scope-empty'`).
- **Shared prerequisite — VERIFIED PRESENT [M] (bobby's [A] resolved 2026-08-10):** a mined fact is scoped
  `atlas:mined` (`mine-staging.ts:39`), and `.atlas/policy.json:15` **already grants** it:
  `"atlas:mined": ["seat:orchestrator"]` (with a long `$comment` recording that this appoints the
  orchestrator as curator so the promotion door may write). The repo's own `.atlas/cas/*` already holds
  mined advisory facts scoped `atlas:mined`, `authoring:ADVISORY` — so the advisory **mine→promote→governed**
  path is demonstrably live today. `WP-96-0` therefore collapses from a build to a **confirmation** (an E2E
  that the promote path — not `atlas emit` — lands a mined row). Honest caveat (`mine-staging.ts:37`, #187):
  the grant lives in `policy.json` which **no live mechanism gates** — a known governance-honesty limit, out
  of #96 scope.

## 2. The decided design

**Door: Option B (bobby).** Mine STAYS severed and writes typed candidates to staging; **`atlas promote`
is the governed door.** Option A (mine calls `governedEmit` inline) is **REJECTED** — it destroys severance
(#87) and either auto-accepts with no ratifier (KNOW-8 becomes false via the KNOW-18 fast-path) or forges
`origin:'promoted'` dishonestly. #96 therefore builds **no new write path**; it unlocks the four proposal
**shapes** upstream of an already-governed door.

**CORRECTION (bobby contract cold-review 2026-08-10, F1) — the shape does NOT "survive staging unchanged".**
Staging **re-mints identity GENERICALLY** for every family: `mine-decide.ts:81` `nodeKey(view)` and `:99`
`primaryAnchorId(view)` both assume a single-anchor intrinsic node. For a **relation** (grounding spans two
files) `deepestCommonUnit` is `''` → `primaryAnchorId` throws `DegenerateAnchorError` (`router.ts:335`),
**unguarded inside `commitStaging` (`mine.ts:288`)** → the first mined relation **crashes the whole pass**.
The governed door already dispatches correctly — `resolveWriteIdentity` (`governed-emit-identity.ts:99-111`)
routes relation→`relationKey`, negation→`negationKey`, else intrinsic `nodeKey`. **The staging mint MUST
mirror it.** This makes `mine-decide.ts` a shared surface WP-96-R _and_ WP-96-N both edit — so the SEAM is
widened to own the family-aware staging mint (below), and R/N never touch identity minting.

**The four shapes, each = a `Proposal` variant + an `admit()` case + a proposer lens that produces it:**

| shape     | proposal type                                           | admit door              | write door | status                                   |
| --------- | ------------------------------------------------------- | ----------------------- | ---------- | ---------------------------------------- |
| advisory  | `AdvisoryProposal` ✅                                   | `admitAdvisory` ✅      | ✅         | **ships today**                          |
| predicate | `PredicateProposal` ✅                                  | `admitPredicate` ✅     | ✅         | blocked on **#219** + mine-gate/proposer |
| relation  | **new** `RelationProposal`                              | **new** `admitRelation` | ✅ #99a    | build propose+admit                      |
| negation  | **new** `NegationProposal` (+abstain→`AbstainedRecord`) | **new** `admitNegation` | ✅ #99b    | build propose+admit                      |

**Proposal shape rule (mirrors the existing pattern):** a `*Proposal` carries the fact's **claim + identity
legs + grounding + tier**, and NOTHING mechanical. The harness mints identity (`relationKey`/`negationKey`),
runs grounding, and (predicate only) synthesizes+attests the `check`. The model never supplies a verdict, a
score, a check, or a minted key — exactly as `PredicateProposal` does today (`admit-harness.ts:62-71`).

- `RelationProposal = {kind:'relation', site, relationKind, endpointA, endpointB, grounding, tier,
scope?, scratch?}`. `admitRelation` grounds it (the endpoints must resolve; the citation must
  re-derive) and yields a `RelationNode`; identity `relationKey` is minted, never trusted.
- `NegationProposal = {kind:'negation', site, relationKind, target, scope, grounding, tier, scratch?}`.
  `admitNegation` enforces the **honest-abstention law** (#99b): if the scope is open / target not global /
  scope empty it yields an `AbstainedRecord`, never a fabricated negative; otherwise a `NegationNode`.

## 3. The #219 ordering constraint (HARD)

A predicate's `claimNorm = normalizeCheck(check)` folds into its **nodeKey** (KNOW-15c) **and** `id(f)`
hashes `check` into CAS — **both unscrubbed today** (`mine-claim-scrub.ts` scrubs the advisory branch only;
`:23-27` reports the predicate leg as an unmeasured second gap). The instant a mine pass emits a
**predicate**, this goes live (a credential shape in a synthesized check reaches CAS raw and pollutes node
identity — the #207/#118/#121 class). **Therefore: #219 (scrub predicate `check` before CAS) MUST land and
merge before WP-96-P is dispatched.** Relation and negation are NOT on the `check`/`claimNorm` identity leg
and are **not** blocked on #219.

## 4. Decomposition (WP cards) + DAG

**Conflict map (revised after bobby F1):** the shared surface is **`mine-decide.ts`** (the family-blind
staging mint), not just `admit-harness.ts`. Both are eliminated first by **WP-96-SEAM**, which owns (i) the
`Proposal` union widening + `admit()` stub cases in `admit-harness.ts`, AND (ii) the **family-aware staging
identity mint** in `mine-decide.ts` — mirroring `resolveWriteIdentity` (relation→`relationKey`,
negation→`negationKey`, else intrinsic `nodeKey`) AND a family-aware `scope` stamp that does **not** overwrite
a negation's identity-scope with `atlas:mined` (F3). After SEAM, R/N fill disjoint `admit*` functions and
touch neither identity minting nor `mine-decide.ts`.

| WP                    | scope (disjoint after SEAM)                                                                                                                                                                                                    | dep-on                                     | gate                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------- |
| **WP-96-0** POLICY    | ~~verify/add grant~~ **grant confirmed present** (`.atlas/policy.json:15`); reduced to a black-box test that a mined advisory row lands in the projection **via `atlas promote`** (not `atlas emit`)                           | —                                          | reachability proof (a mined row actually promotes)                           |
| **WP-219** SCRUB      | ✅ **DONE** (`fix/219-predicate-check-scrub` `d1a40e1`, awaiting billy cold-review + merge) — scrub `f.check` once before `f` so `id(f)` + `nodeKey` see one scrubbed check                                                    | —                                          | **blocks WP-96-P**                                                           |
| **WP-96-SEAM**        | widen `Proposal` union (+`RelationProposal`,`NegationProposal` minus `grounding` — F4) + `admit()` stub cases; **+ family-aware staging mint in `mine-decide.ts`** (identity dispatch + scope stamp, F1/F3)                    | —                                          | a relation row STAGES without `DegenerateAnchorError`; tsc; union exhaustive |
| **WP-96-COMPOSE**     | wire the negation completeness deps (`symbolReverse`/`axes`/`nodeHashOfPath`/`edgeModel`) into the **promote leg** at `compose.ts:337`, mirroring `wire.ts:217-220` — else every promoted negation abstains `scope-empty` (F2) | —                                          | a negation reaches `emitNegation` with its deps satisfied                    |
| **WP-96-P** PREDICATE | `mine-gate` builds `PredicateProposal` (not hardcoded advisory) + proposer predicate lens                                                                                                                                      | WP-219, WP-96-SEAM                         | a mine pass emits an admitted predicate that promotes + is queryable         |
| **WP-96-R** RELATION  | fill `admitRelation` (ground; identity minted by SEAM) + proposer relation lens                                                                                                                                                | WP-96-SEAM                                 | a mined relation promotes; both endpoints resolve; direction preserved       |
| **WP-96-N** NEGATION  | fill `admitNegation` (produce a `NegationNode` **candidate** only — abstention is the DOOR's job, F4) + proposer negation lens                                                                                                 | WP-96-SEAM, WP-96-COMPOSE, **F3 decision** | a mined negation promotes into an admitted `NegationNode`                    |
| **WP-96-E2E**         | one black-box story per shape: `mine → atlas promote → governed door → atlas query` returns the typed fact with correct family/scope/tier/ids                                                                                  | all above                                  | the whole pipeline, subprocess black-box                                     |

```
WP-96-0 (policy) ───────────────────────────────────────┐
WP-96-SEAM ──┬──────────────────────► WP-96-R ───────────┤
             ├─ (F3 decision) ─┐                          │
WP-96-COMPOSE ─────────────────┴────► WP-96-N ────────────┼──► WP-96-E2E
WP-219 ✅ ────► WP-96-P ───────────────────────────────────┘
```

## 5. DoD (every WP) + exit predicate

- tsc `-b` exit 0; the 5 gates (godfile≤400 / layer / spec-conformance / id-integrity / reference-model);
  the full suite green. Every touched file ≤400 LOC (`mine.ts` 370, `admit-harness.ts` — check headroom).
- **Reachability, not a reference model:** each shape WP proves a _mine pass_ emits the shape AND it
  _promotes through the governed door_ AND it is _queryable_ — not merely that a type or an admit function
  exists (reference-model-vs-shipped-path is the repeated trap here: `admitPredicate` existed for months
  with zero callers).
- **Honesty:** the proposer never supplies identity/verdict/score/check; abstention stays a first-class
  outcome (a negation over an open scope ABSTAINS). Each brief must answer _"what did my framing get wrong"_.
- **Exit predicate for #96:** `atlas mine` over a fixture repo yields, through `atlas promote`, at least one
  admitted+queryable fact of **each** of the four shapes, each carrying minted identity, `atlas:mined`
  scope, and the correct family — with a black-box test per shape. Only then is #96 closed and #95 unblocked.

## 5b. F3 — negation governance (OWNER-RATIFIED 2026-08-11): split authz-scope from identity-scope

bobby's F3 found a mined negation cannot promote: its `scope` is BOTH its identity leg (`negationKey` over
directory S) AND its authz binding, and the orchestrator holds `atlas:mined`, not authority over an arbitrary
source directory S. **Owner ratified the principled fix: give negation the SAME clean split relation already
has** — an **authz-scope** (`atlas:mined`, the mining namespace the orchestrator owns) SEPARATE from the
**identity/witness-scope** (directory S, unchanged, still `negationKey`'s leg). This **amends #99b / ADR-0015
D3** (a ratified invariant), so WP-96-N carries the co-amendment across `negation-types.ts` (add the authz
field), `governed-emit-negation.ts` (authz binds the new field, not the directory), the #99b spec/ADR text,
and the goldens — with owner ratification recorded here (2026-08-11). Identity (`negationKey` over S) and the
door-constructed grounding are UNCHANGED. WP-96-N is therefore no longer a small "candidate + lens" WP: it
owns this governance split first, then the candidate + lens. It stays gated behind WP-96-SEAM + WP-96-COMPOSE.

## 6. Ratification / open items owed at build time

- **WP-0 must VERIFY** the `atlas:mined` policy grant (bobby [A], unread). If absent, promotion refuses
  every row and no shape can be proven end-to-end — WP-0 is the true gate-zero, ahead of every shape WP.
- The proposer **lens** side (how a scope-routed persona proposes each shape) is the genesis-team-scope-miner
  design; #96 provides the shape MACHINERY, the lens WP supplies the prompt discipline (GEN-12: one bounded
  proposal, derivable-from-shown-bytes, abstention valued, no self-confidence, no self-score).
- #99c TRANSITION (the 5th shape) is explicitly OUT of #96 (deferred with the transition fact itself).
