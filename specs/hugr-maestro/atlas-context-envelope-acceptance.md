# Ownership Context: Acceptance

Status: red-suite contract. Owner: static Own materialization and verification slice.

## Fixtures

```text
actorA        { projectId: p1, sessionId: s1, memberId: maestro }
revisionA     { id: r1, hash: h1 }
snapshotA     current Atlas snapshot for p1
unitBilling   canonical unit crates/billing, handle own_billing
unitPayments  canonical unit crates/payments, handle own_payments
```

Fixtures use canonical unit IDs, graph/Knowledge snapshot receipts, and static `SKILL.md` artifacts. A display label
or leaf handle is never sufficient identity.

## Acceptance

### OCE-1: Exact Static Ownership Plan

Given proposed `revisionA` selecting `unitBilling`, `unitPayments` under `snapshotA`.

When Maestro plans ownership context from verified static artifacts.

Then it returns ordered actions with exact actor, revision, snapshot, canonical unit, injective skill name, and
operation `load-skill`; it does not materialize generic Pack or runtime Own state.

### OCE-2: Static Ownership Skill

Given materializer input for `unitBilling`.

When materializer renders its `SKILL.md`.

Then it emits bounded role, terrain, governing/advisory bands, gotchas, relations, drill pointers, and a receipt
binding exact snapshot and cited facts.

### OCE-3: Deterministic Replay

Given equal actor/revision/units/snapshot and unchanged Atlas state.

When materialization and planning run twice.

Then action plan, artifact, and ownership receipt are byte-identical.

### OCE-4: Handle Is Not Identity

Given two distinct units with the same leaf handle `own_billing`.

When Maestro plans ownership context.

Then both actions preserve distinct canonical units and distinct injective skill names; a handle-only request holds
before skill load.

### OCE-5: No Runtime Retrieval

Given every positive and negative case.

When Maestro plans or loads ownership state.

Then spies observe static skill loading only. Runtime `own()`, `atlas-query`, direct `Packer`, write, memory-write,
Task, and child Session creation remain zero.

### OCE-6: Depth Comes From Ownership Pointers

Given an ownership state with finer/drill/manifest or pull-reachable pointers.

When more detail is needed.

Then next context actions load exact static `own_*` skills named by pointers. No path search or global query occurs.

### OCE-7: Incomplete Ownership Holds

Given missing, malformed, stale, over-cap, tail-insufficient, or `UNDER_APPROX` ownership artifact.

When executor tries to satisfy context for proposed `revisionA`.

Then it returns `HOLD` with exact state receipt/pointers. It never calls the state `READY` or `UN-SEEDED`.

### OCE-8: PR Refreshes Impacted Ownership Skills

Given completed ownership receipts from `snapshotA`.

When a PR changes Atlas structural/Knowledge snapshot.

Then verifier recomputes impact; every impacted static skill must bind head snapshot before plan can proceed. Old
receipt cannot satisfy plan.

### OCE-9: Read-Only Boundary

Given OCE-1 through OCE-8.

When adapter runs.

Then zero Atlas runtime read/write or memory-write calls and zero OpenCode Task/child Session creations occur.
