# G2.1 — ownership update-plan acceptance contract

Status: **first implementation scoped green; technical FIX-FIRST on affected-only ordering**.
Parent: [retained global completion plan](genesis-global-completion-plan.md), AC-05/06 and the
AC-07/09 refusal boundaries. This package supplies only deterministic affected-set analysis, not
reconstruction, semantic revalidation, economic admission, durable activation or production authority.

## Frozen candidate seam

`modules/atlas/packages/knowledge/src/ownership/update-plan.ts` declares:

```ts
planOwnershipUpdate(store, manifest, scope, observe): OwnershipUpdatePlan
```

The exact TypeScript types in that file are the interface anchor; do not redesign them during execution.
No barrel export or generated boundary change yet. The same CAS/manifest/artifact/receipt/result/review
shapes remain in force. There is no new CAS object family or publication door.

- The manifest is the previous accepted generation, not an incomplete candidate assembled by replacing
  result hashes without rebinding reviews. Validate it through existing historical reader checks:
  integrity, shapes, exact scope/root need, required closure/results, body bytes and review bindings.
  Planning historical input drift does not exempt any other validity check. Validate all inventoried
  entries, including those not reached from one particular need root.
- `observe` supplies `present(version)`, explicit `absent`, or `unavailable`. A host must establish absence;
  it must not turn an unreadable/permission/unknown-key failure into deletion. The existing string-or-
  undefined reader oracle cannot by itself distinguish those cases. Host integration is a later package.
- Cache one observation per unique input key within the plan. This provides a coherent **observation
  record**, not a claim that a multi-file host filesystem read is atomic. Execution must recheck inputs.
  Empty/noncanonical present versions are unavailable evidence and HOLD.
- `changes` names every mismatching direct artifact/input binding, its previous version and observed
  value or explicit absence. Canonical order is artifact key then input key, both lexicographic.
- `affected` is the direct-change set plus its transitive required dependents, in deterministic
  dependency-before-dependent order within the **affected subgraph**. When several affected nodes are
  eligible, choose the lexicographically first. An unchanged prerequisite is already satisfied for this
  ordering and cannot delay an affected node behind another independent affected node.
  Manifest entry order cannot change this result. Navigation is not a build edge.
- `frontier` is the directly changed subset with no affected prerequisite in its required closure.
  Only this frontier is immediately eligible for revalidation. A dependent with its own input change
  still waits for a changed prerequisite. `affected` is **potential** propagation, not a list of model calls.
- `unaffected` is every other manifest key, sorted lexicographically. An unchanged valid manifest returns
  an explicit full unaffected inventory, not an ambiguous empty plan.
- Unknown observation, invalid baseline, missing object, malformed/empty manifest, wrong scope/root,
  review mismatch or dependency cycle returns the existing named `OwnershipRefusal`. Do not return a
  partial plan or quietly drop the broken entry. The planning failure does not revoke an independent
  already-valid serving read through the existing reader.
- Planning reads only. It cannot write CAS, replace a publication, return body text, call a recipe/model,
  or turn synthetic review fixtures into semantic acceptance. Result-identity equality and receipt-only
  renewal stopping downstream interpretation remain G2.2, not a promise this function executes them.

## Acceptance spine and baseline

The named tests in `knowledge/test/ownership-update-plan.test.ts` are the authoritative mechanical
items UP-1..24. They use real kernel CAS and explicit synthetic reviewed artifacts; they do not duplicate
the planner algorithm. Cases cover unchanged inventory, source/intent/recipe/membership drift, explicit
absence versus unavailable evidence, navigation independence, dependency order, simultaneous upstream/
downstream drift, baseline refusal, cycles, empty/missing manifests, shared input sampling and read-only
analysis. UP-15 specifically rejects an unreviewed result substitution before it can become a baseline.

At authoring time the module deliberately throws `ownership update planning is not implemented`.
No red or green execution is claimed until the remote runner records each actual named assertion.
The existing change-scoped Atlas lane will add this one file to its grouped list; no existing test or
mutation is removed, and no full epic is requested for the baseline.

Before replacing the stub: obtain a bounded independent suite review against this contract and the
parent AC-05/06 demands; keep the fixed same-session technical/reuse reviewer allocation and spending
gate. Do not self-certify suite completeness or dispatch a new judge without authorization.

### Measured remote baseline

Run [42198843159](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42198843159) at
`17caf7d966960a644d754d9cb0cfda01c64b2436` completed **FAILURE**, as intended for this baseline.
The lead downloaded artifact `13494165182`, verified ZIP SHA-256
`81c4b7c6d354cb5f413969d0df50a414e8f05369adf7fb5d0e4a68229afc790c` and inspected actual assertion records:
all 20 new UP tests failed with the explicit unimplemented-stub error; all 80 existing grouped regression
assertions passed. Atlas typecheck passed. Mutation probes and boundary regeneration were skipped after
the failed grouped step; neither is claimed executed. Exact assertion names/statuses and artifact binding
are in `genesis-campaign-results/update-plan-red-baseline-v1.json`.

This establishes a non-vacuous per-item red baseline, not suite completeness, a runtime defect in the
previous validated candidate, a green gate or permission to replace the stub before independent review.

### Independent critique and objective repairs

The owner authorized one logical suite-review request to the same Terra 2, with physical-attempt and
currency uncertainty disclosed. The original response is **FIX-FIRST**, not PASS, preserved verbatim in
`genesis-campaign-results/update-plan-suite-v1/terra-2.decision.json`. It identified five missing oracles:
all simultaneous changed bindings/order, changed shared-input sampling, lexicographic scheduling across
independent roots, noncanonical observation versions and preservation of an independent existing read
after a planning refusal.

The current suite strengthens UP-9/10/16 and adds UP-21/22/23 for those exact counterexamples.
`update-plan-suite-v1/repair-map-v1.json` maps every finding to its authored oracle and revised test hash.
The revised suite has not yet been independently accepted; the original FIX-FIRST is unchanged.
No second review is authorized by the first request. The function remains a throwing stub.

The repaired suite's remote baseline subsequently completed at
`f68d32b9063d12b8008dee1ff9532a6812a8887d`, run
[42200487549](https://github.com/gustavomhss/hugr-orchestra/actions/runs/42200487549): all 23 named
tests failed on the stub, all 80 existing grouped regression assertions passed and Atlas typecheck passed.
Mutation/generation steps again did not execute after the intentional failed grouped step.
`genesis-campaign-results/update-plan-red-baseline-v2.json` preserves the exact assertions/artifact digest.

The owner then delegated the next bounded review decision: **“pode decidir voce”**. The lead selected
two sequential logical requests only: the same Terra 2 checks the five-finding suite correction delta;
the same Terra 1 reviews the G2.1 implementation after scoped implementation evidence exists.
No coordinator redispatch or extra round is included. Physical-attempt/currency uncertainty remains
disclosed; this is not an AC-08 conformance claim or a new general evaluation allowance.

The same Terra 2 subsequently accepted all five corrections with no new delta defects. Exact original
text and provenance are preserved in `update-plan-suite-v1/terra-2-delta.decision.json` and
`delta-provenance.json`. This is suite-delta acceptance, not implementation or global acceptance.
The lead then replaced the stub within the frozen seam, reusing the existing historical reader for
baseline validation and keeping observations/affected-set analysis read-only. The scoped lane now also
adds four named implementation-removal probes: direct input change, dependency propagation, frontier
ordering and unavailable-input refusal. These probes extend, not replace, the four prior pilot controls.
No green result or rejecting-probe execution is claimed until their actual remote receipts are checked.

### First green and technical counterexample

Run `42201721370` at `613afdcd76ad0c3f1f069a6abfd135636e241589` passed 103 named assertions,
typecheck, eight named rejecting mutations and generation. Downloaded generated bytes match the snapshot.
`genesis-campaign-results/update-plan-green-v1.json` records the exact-head evidence. Its embedded
`namedRedToGreen` rows are original **before** statuses; the explicit before/after attribution addendum
under `update-plan-implementation-v1/` preserves and clarifies that original record.

The same Terra 1 nevertheless returned **FIX-FIRST** with a concrete uncovered case: changed `a`
depends on unchanged `z`, and changed `b` is independent. Filtering the full-graph order `b,z,a` produces
`b,a`, but the affected-only order must be `a,b`. The original judgment/provenance is preserved in
`update-plan-implementation-v1/`. UP-24 adds that exact counterexample. The new regression baseline
must fail against the real first implementation before its ordering is fixed; no new independent PASS
or additional review allowance is inferred from authoring the test.

## Ownership and stopping line

Owned implementation surface: `knowledge/src/ownership/update-plan.ts` only. Owned acceptance:
`knowledge/test/ownership-update-plan.test.ts`. Lead-owned lane extension: one named test-file addition
to `.github/workflows/atlas-pilot.yml`. Accepted reader, CAS shapes, governed publication and producer
bytes are unchanged. No adapter wiring, import recipe, index export, policy or live skill is added here.

Stop this package at independently reviewed exact-contract implementation, named red→green acceptance,
package typecheck, regression controls and guards. Then freeze the host observation/rebuild integration
as its own G2.2 contract. Do not represent this planner as closing AC-06 or the global campaign.
