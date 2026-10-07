# Migration or compatibility mode

## Applicability

An assigned transition between supported states or versions: a schema or data phase, a payload or worker coexistence step, or an old/new consumer contract. You implement the supplied phase in the supplied direction.

## Non-trigger

- Every query edit, or a dependency that appears in a lockfile. Select by the assigned transition, not by the word "migration" or a `.sql` file.
- A read-time substitution where the stored schema stays unchanged: that is a [feature](feature.md) query change.

## Inputs

- The shared packet fields.
- The source and target states, the compatibility window and direction, the phase order and the transitional semantics.
- The recovery or forward-only policy, where relevant.

## Steps

1. Implement only the supplied phase, in the supplied order.
2. Write the ordered transition, adapters and the assigned reader and writer changes under the supplied coexistence rules.
3. Use the existing migration runner or contract generator with the old and new fixtures.
4. Run the version-pair and transition checks the packet assigns.

## Tools and outputs

- The project's migration runner or contract generator; the recipe depends on the domain.
- Toolkit engine, only for a SQLx project's assigned migrations or query metadata: [sqlx](../recipes/external/sqlx.md).
- Output: the phase artifacts, the affected queries or bindings, and the transition evidence.

## Limits and checks

- Rollout order, lossy or destructive mapping, contraction prerequisites and unsupported version pairs are owner decisions. If one is unresolved, return a `packet` blocker.
- Do not invent a dual-write or coexistence plan, and do not claim reverse DDL restores erased data.
- A query projection does not perform a persisted backfill. Generating schema or types does not apply a migration.
- A final-state build is not transition evidence. Run state-preservation and interrupted or repeated progress checks when the packet assigns them.
