# Genesis ownership — production fit and next implementation boundary

Status: SOURCE-INSPECTED FIT; implementation has since started under the
[concrete runtime contract](genesis-ownership-runtime-contract.md), without production acceptance · 2026-11-05.
Research prerequisite: [accepted L1–L4](genesis-ownership-results/README.md).
Baseline: `c9b8e54cbf2c6c2c4bb59bbda2dc878430a54085`.
Authority: [global plan](genesis-ownership-plan.md), GO-A1..7, GO-I1..8, QS-1..6 unchanged.

## Outcome and explicit stop

Make the accepted ownership knowledge consumable through actual Atlas scope/need reads, with exact
manifest bindings, currentness and governed authority. Do not register the research candidate as a live
skill while it can only point to ad hoc Markdown and unverifiable currentness. Do not solve this by stuffing
the four explanations into advisory claims or inventing a parallel store.

This document records the inspected seams and the first implementation acceptance boundary. It is not
permission to bypass existing governance or silently widen frozen types. The data/write/activation contract
must be frozen and independently checked before dependent implementation is dispatched. No extra mining
wave is needed: accepted body bytes and their independent reviews are reusable inputs.

## Actual fit of inspected current code

| Existing surface | Inspected behavior | Reuse and incompatibility |
| --- | --- | --- |
| `packages/kernel/src/types.ts:57–68`, `store.ts:17–23` | `CasObject` is opaque `unknown`; `StoreApi` exposes content-addressed `put/get` | Reuse the SAME CAS for artifact bodies/envelopes/manifests. No kernel runtime dependency or second database is justified by prose bodies. CAS presence alone does not authorize publication. |
| `packages/knowledge/src/types.ts:67–98` | `GroundedFact` is an explicit union of fact kinds | An explanation with inputs, gaps and acceptance is not automatically one of these fact kinds. Do not cast a composed artifact into this union to borrow governance accidentally. Decide its adjacent typed representation explicitly. |
| `packages/contracts/src/pack.ts:32–46,49–68` | `Pack` has governing/advisory fact bands; `PackInvariant.claim` is documented as a one-line structured claim, not a prose blob | Preserve existing query/injection vocabulary. A body-depth read needs a distinct, explicit artifact result; returning full explanations as invariant lines violates the inspected contract. |
| `packages/adapter-io/src/store.ts:13–19,121–126` | Candidate staging is separate from governed projection; commit decision runs against the current snapshot | Reuse candidate/serving separation and whole-decision atomicity. A successful research response or raw CAS write cannot become a serving generation by itself. |
| `packages/adapter-io/src/sidecar.ts:68–98` | The two sidecar families and wire shape are closed/typed around the existing projection | Do not assume arbitrary JSON can be added without serialization, provenance and recovery changes. Prefer extending the existing projection/commit mechanism over a new writer or service, but freeze exact compatibility first. |
| `packages/adapter-io/src/own-source.ts:97–107` | Current rows are read from projection and their CAS values treated as `GroundedFact` | Do not insert composed bodies into that row stream under an unchecked cast. Preserve existing fact-band consumers and give artifact reads an explicit route. |
| `packages/adapter-io/src/governed-promote.ts:10–16,82–89`, `governed-emit.ts:119–125,143–154` | Existing promotion composes the SAME emit leg and its gates; promoted origin removes automatic acceptance; gate helpers and policy/actor are supplied by the owning composition | Publication is not a free-standing file copy or a second authority path. Freeze how an adjacent artifact reaches the existing governed surface and mandatory ratification; an unsupported kind cannot borrow the fact fast path or obtain authority from two model PASS receipts alone. |
| `packages/retrieval/src/own-snapshot.ts:237–262` | Verification checks all expected generated files and every unit's source blobs before READY | Reuse exact-byte/source checks, not its whole-snapshot acceptance as proof of scope isolation. The new requested-closure read must prove an unrelated invalid scope remains readable independently. |
| `script/atlas-genesis/judge.mjs:158–163`, `judge-source.mjs:14–21` | Random data fencing is reusable; source reader now returns complete numbered files | Keep data fencing. Criterion-selected evidence must be assembled explicitly; the old `excerpt` function name is not a selective reader or an acceptance contract for composed layers. |

Paths in this table are relative to `modules/atlas/`, except `script/atlas-genesis/` at repository root.
These are findings about inspected surfaces, not an exhaustive claim that no other useful mechanism exists.

## Frozen next-work requirements

**Axioms:** reuse the accepted knowledge, SAME CAS and governed authority; extend only where an actual
artifact cannot fit the existing fact/read contracts. Consumption starts from scope plus reader need.
**Invariants:** original research/historical receipts unchanged; no stale current-read fallback; one accepted
manifest per requested required closure; navigation is not a build edge; result identity includes authority,
validity and gaps, not prose alone; receipt identity remains separately auditable. Unknown required impact,
missing objects and malformed authority fail explicitly, never as an empty successful pack.

**Explicit inputs:** exact accepted layer manifests/bodies, source inventory/recipe bindings from the slice,
current policy/write-door contracts, inspected CAS/projection/snapshot seams, and producer-excluded acceptance
cases. Case answers remain withheld from producers. Existing user/project memory is not the artifact store.

**Deliverables:** a frozen artifact/result/receipt/manifest contract, its source-compatible projection/write
fit, an executable acceptance harness against the real reader/write path, and then a minimal vertical reader/
index/skill integration. Do not create a new public node family or mutable sidecar solely for symmetry.

| ID | Required executable decision before claiming the vertical integration |
| --- | --- |
| IFIT-1 | Exact accepted artifact and body round-trip through the SAME CAS; missing, wrong-kind or digest-mismatched objects yield named refusal. A valid body cannot be promoted to authority merely by putting it. |
| IFIT-2 | Candidate construction and activation are separate. Actual policy authority and complete exact semantic-review/required-input bindings are checked inside the governed current-snapshot decision, including on a lost-race retry. |
| IFIT-3 | Reader selects by scope AND need, returns a small scoped index, and can read an exact artifact section/body on demand; unknown need, missing reference, truncation and historical mode are explicit. Selection/read receipts bind exact versions. |
| IFIT-4 | Current reads validate only the requested required closure against current source/recipe/membership/contracts; a changed required input holds that closure, while an unrelated valid scope remains readable. Shared authority/manifest corruption holds its dependent reads. |
| IFIT-5 | Identical input/recipe is reused with zero interpretation calls. A validated unchanged result stops dependent reconstruction; receipt-only rebinding is audited without changing meaning. Changed authority/validity/gaps propagate even with equal prose. |
| IFIT-6 | Real consumer cases use only the skill and real Atlas reader, record every read and stop at named missing/out-of-scope premises. Structural controls and accepted research prose cannot substitute for this run or claim AC-02/03. |

**Quality:** source-compatible APIs, explicit refusals, no unchecked fact casts, no duplicate CAS/graph/governance,
bounded need-driven reads, current repository test discipline. Freeze actual read limits from the finite cases,
not arbitrary token quotas. Non-execution and unresolved provider billing remain explicit.
**Completeness:** every IFIT row has a deciding assertion, named negative mutation and known-good control;
reader/write checks use actual entry points, not copies of their implementation in tests.
**Success/DoD:** all IFIT obligations execute through the intended integration and required consumer rubric,
with exact independent decisions and source-compatible activation/recovery. The author cannot self-certify
semantic acceptance. Final grouped validation and one integrated epic are still required before landing.
**Stopping conditions:** unresolved governing-contract incompatibility, unavailable required impact/currentness,
mixed generation, preservation mismatch, or unapproved new paid evaluation. No automatic fallback model,
provider retry or re-mining follows from a missing implementation premise.

## Next sequence — no further research-layer dispatch

1. Freeze the minimal adjacent composed-artifact representation and publication authority against the actual
   projection/write-door contracts. Resolve whether additive projection fields suffice; do not add another
   sidecar family or reinterpret a fact without an explicit reviewed fit decision.
2. Bind IFIT-1..6 to executable acceptance cases before production changes; independent cold review checks
   the cases against the demand. Preserve any already-passing baseline honestly rather than inventing red.
3. Implement the minimal real candidate→governed activation→scope/need reader chain, reusing accepted research
   bytes. Validate with scoped CI and package checks; no intermediate epic and no source/runtime restart.
4. Evaluate the reserved ownership cases only through that chain, within an explicitly bounded authorized
   evaluation packet. Then close incremental publication/recovery and historical obligations before final epic.
