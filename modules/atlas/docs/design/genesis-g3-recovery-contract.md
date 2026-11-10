# G3 — durable activation and recovery acceptance contract

Status: **FROZEN for the red suite only.** Not an implementation dispatch, not a spend authorization, not a PR, not a mine, not a production install.

Source sentences, not a new design:

- `genesis-closeout-plan.md:43-45` — interruption/resume via existing CAS and `commitProjection`; concurrent reader; rollback refusal; old-producer migration refusal; no second store; no global retry change.
- `genesis-global-completion-plan.md:102` — completed candidate selection, before/after interruption controls, separate concurrent reader, resume without repeated completed work, incompatible rollback refusal, explicit historical reads. No direct projection publication and no second trust or store system.
- `genesis-global-completion-plan.md:114-121` — fail before activation, after durable completion, and at the publication boundary. A separate reader sees a coherent old or new manifest, or HOLD. After source drift it must not see stale knowledge as current. Resume reuses durable completed work. Entry points reject an incompatible required result and a stale rollback.

## Seam

Use only what already exists:

- `modules/atlas/packages/adapter-io/src/store.ts` — `createDiskStore`, `commitProjection`, `loadProjection`.
- `modules/atlas/packages/adapter-io/src/sidecar-commit.ts` — `commitSidecar` / `commitLoop`.
- `modules/atlas/packages/adapter-io/test/ownership-publication.test.ts` — `RP-5` already labels a historical read after source drift. Do not rewrite it.

No new store, no new trust system, no change to economy retry, no live install.

## Acceptance

Each item is a test in `modules/atlas/packages/adapter-io/test/g3-recovery.test.ts`, driving a real temp-dir `createDiskStore`. If an existing test already bites the same case, cite it and do not duplicate it.

| Name | Assertion |
|---|---|
| G3-01 resume-reuses-completed-work | A `commitProjection` that settles a completed projection is visible to a second `createDiskStore` on the same directory via `loadProjection`. A later `commitProjection` whose decision observes that completed work and returns no `next` does not write a second copy. |
| G3-02 concurrent-reader-sees-a-whole-generation | A second store on the same directory after a settled commit sees that whole projection. A torn head with a readable predecessor falls back to that predecessor, never to empty. That case is already bitten by `sidecar.test.ts` LEG 2a. A fully corrupt sidecar must not crash a read and must not succeed a write: `loadProjection` stays total, and `commitProjection` refuses `unreadable`. Do not collapse those into one refusal. Collapsing them reopens the boot crash and the 402-node erasure LEG 2 closed. |
| G3-03 incompatible-rollback-refused | After a settled projection, a write that would replace it with a foreign identity or an untrusted sidecar is refused, and `loadProjection` on a reopened store still returns the previous projection. |
| G3-04 old-producer-publication-refused | Only if an existing entry point already refuses publication from an old producer. If no such entry point exists, this item is INDETERMINATE. Do not add a migration API to make the test exist. |

## Stop

Red or green, report which. Do not implement a missing mechanism in this package. A green item is evidence the control already holds. A red item stops at the failing test.
