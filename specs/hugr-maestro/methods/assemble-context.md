# Method: Assemble Context

Status: proposed V2 method, blocked on OpenCode-to-Atlas adapter freeze. ID: `assemble-context`. Composition: M2 Ground.

V1 internal `atlas/` is reference only. Current Atlas foundation source has a distinct candidate seam:
`@atlas/retrieval` `BoundedPack` and `@atlas/memory` Awareness/Orientation. Selected named tests are measured
green; no V2 OpenCode adapter, field mapping, or behavior is frozen until its own contract/proof exists. See
`atlas-foundation-seam-register.md`.

## Purpose

Bind one immutable `PlanRevision` with canonical scope to one immutable, read-only current-Atlas context result
before deterministic plan validation. Context cannot be assembled from an admitted goal: current Atlas retrieval
accepts a `Territory`, and territory does not exist until `draft-plan` proposes canonical scope.

```text
READY      bound Atlas context result; next owner validate-plan
UN-SEEDED  only explicit future Atlas context-envelope declaration permits this result
HOLD       scope, Atlas seam, context evidence, or freshness is unverified
```

This method retrieves and binds context. It does not infer scope, draft/revise a plan, write Atlas, approve, or
create child work.

## Trigger

Committed `PlanRevision` is `PROPOSED` with canonical scope and `PENDING` context requirement, or a previously
bound result became stale.

## Inputs

```text
planRevisionId       immutable proposed revision identity + content hash
canonicalScope        typed territory identifiers and explicit exclusions from revision
orientationRef        current Atlas Awareness/Orientation reference or explicit future unseeded declaration
atlasEnvelopeVersion  frozen current-Atlas adapter contract version; absent until foundation corpus ratifies
methodVersion         version of this contract
```

An admitted `PlanIntent`, prose goal, broad repository path, or V1 territory format is not valid scope input.

## Preconditions

1. Revision is committed, immutable, `PROPOSED`, and has canonical non-empty scope.
2. Every scope identifier resolves through current Atlas territory identity seam.
3. Current Atlas context-envelope adapter/version is ratified and test-measured.

Failure emits `HOLD` with durable reason. An uncovered/malformed current Atlas lookup is `HOLD`, never silently
treated as `UN-SEEDED`: current `BoundedPack` empty result is total and cannot distinguish those cases.

## Candidate Current-Atlas Evidence

Current source candidates, not frozen V2 contract:

```text
@atlas/retrieval/src/pack.ts
  Territory -> BoundedPack { axisHash, invariants, tokenEstimate, stale, truncated, tail }
  deterministic T0/T1 bounded packing under PACK_CAP; truncation receipt has no silent drops

@atlas/memory/src/awareness.ts
  derived shared Awareness; facet-level UN-SEEDED is explicit and never fabricated

@atlas/memory/src/orient.ts
  derived shared Orientation from DEFINE + event log
```

Measured command:

```text
npm test -- --run packages/retrieval/test/wp-6.19-retr.pack.test.ts \
  packages/memory/test/wp-6.24-a-mem.test.ts \
  packages/memory/test/wp-6.24-b-mem.test.ts
```

After `npm ci && npm run build`: `3` files, `30` tests passed. The remaining blocker is adapter identity/envelope
freeze, not foundation source evidence.

## Procedure After Seam Freeze

1. `context-request-schema-guard` validates exact revision hash and canonical scope.
2. Read current Atlas context envelope through frozen adapter. Adapter exposes only evidence current Atlas proves.
3. `context-envelope-guard` checks envelope version, scope identity, snapshot/address, freshness, truncation
   receipt, and configured budget evidence. It does not recreate V1 pack protocol.
4. Persist immutable `ContextRecord` bound to revision hash. `validate-plan` receives record identity only.

## Tools and Guards

| Capability                         | Purpose                                                    | Boundary                       |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| `plan-revision-read`               | read exact proposed revision and canonical scope           | Maestro durable evidence read  |
| `atlas-context-envelope-read`      | frozen adapter over measured current Atlas seam            | Atlas read only                |
| `context-record-write`             | persist immutable bound result                             | Maestro durable evidence write |
| `context-request-schema-guard`     | reject prose, broad, or uncanonical scope                  | before Atlas read              |
| `context-envelope-guard`           | require measured adapter/version and envelope evidence     | before persistence             |
| `no-governed-task-before-approval` | deny Task/child Session without approved revision identity | Session/Task boundary          |

No model skill, shell, product edit, Atlas write, member tool, approval, or task creation is granted.

## Authority

Maestro binds Atlas evidence; it cannot choose scope, promote retrieved text into stakeholder fact, map empty
pack to `UN-SEEDED`, waive stale context, or invent current-Atlas adapter fields.

## Evidence, Output, and Idempotence

`ContextRecord` stores revision hash, canonical scope, Atlas adapter/version, envelope address/snapshot,
freshness/truncation/budget evidence defined by frozen seam, result, timestamp, and next owner.

Deduplication key is `(planRevisionId, atlasEnvelopeVersion, methodVersion)`. Replay returns stored record;
new Atlas evidence creates linked result and never replaces prior plan evidence.

## Refusal and Recovery

| Condition                                                    | Result                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| Non-canonical/empty scope                                    | `HOLD`; no broad lookup or plan/task                     |
| Atlas adapter unratified                                     | `HOLD`; no direct foundation import from Maestro runtime |
| Empty/uncovered/malformed current Atlas pack                 | `HOLD`; never mislabel as unseeded                       |
| Stale, mismatched, provenance-free, or receipt-free envelope | `HOLD`; preserve reason/evidence                         |
| Explicit future Atlas unseeded declaration                   | `UN-SEEDED`; preserve declaration identity               |
| Duplicate trigger                                            | return stored record                                     |

## Acceptance After Ratification

1. Canonical revision scope yields `READY` record bound to exact revision and measured current Atlas envelope.
2. V1-shaped territory/pack input is refused; current foundation adapter is only reader.
3. Empty/uncovered result holds, never fabricates context or unseeded state.
4. Stale context, changed scope, or changed adapter version requires new linked record before validation.
5. No result of this method can create a child Session or Task.

## Anti-Overengineering Boundary

One deterministic binder, zero model skills, one frozen Atlas read adapter, one record, two guards. No V1 store
compatibility layer, generic vector search, context cache, background refresh, Atlas writer, work packet, or
model-chosen query.
