# G2.1 — ownership update-plan acceptance contract

Status: **acceptance preparation; implementation is a throwing stub, not delivered behavior**.
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
  dependency-before-dependent order. When several nodes are eligible, choose the lexicographically first.
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
items UP-1..20. They use real kernel CAS and explicit synthetic reviewed artifacts; they do not duplicate
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

## Ownership and stopping line

Owned implementation surface: `knowledge/src/ownership/update-plan.ts` only. Owned acceptance:
`knowledge/test/ownership-update-plan.test.ts`. Lead-owned lane extension: one named test-file addition
to `.github/workflows/atlas-pilot.yml`. Accepted reader, CAS shapes, governed publication and producer
bytes are unchanged. No adapter wiring, import recipe, index export, policy or live skill is added here.

Stop this package at independently reviewed exact-contract implementation, named red→green acceptance,
package typecheck, regression controls and guards. Then freeze the host observation/rebuild integration
as its own G2.2 contract. Do not represent this planner as closing AC-06 or the global campaign.
