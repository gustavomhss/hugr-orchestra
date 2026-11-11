# S4 host integration proposals — prepared, not run

Source baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.
Protocol: `2689c516d63488be37de678cc853dd4556fd5c13`.
Author: native subagent `/root/host_readers`, attempt `S4-PREP-HOST-001`.

These are concrete test additions for serial integration by S5. They do not alter
production policy, activate a store, replace historical reviewer identities, or
implement a second store or reader. They are not campaign judgment receipts.
No tests or product commands were executed by this subagent.

## Proposal 1: composed published reader and publication refusal controls

`ownership-host-entrypoints.patch` adds
`modules/atlas/packages/adapter-io/test/ownership-host-entrypoints.test.ts`.
Its source is also provided as `ownership-host-entrypoints.test.ts` for inspection.

Ten expanded mechanical cases use the existing `ownershipFixture` with real disk,
Git, policy, source index and composed runtime. Fixture reviews are explicitly
synthetic and cannot satisfy semantic review, old-producer proof, or new campaign
production. Current inputs are observed by the existing runtime. The tests never
reimplement closure validation or redirect reads to the raw CAS after a refusal.

The cases cover exact body bytes, declared-file drift, a newly added membership,
source removal, missing artifact, broken need index, incompatible dependency result,
unsupported manifest schema version, local closure corruption and shared manifest
corruption. Rejected publication candidates must leave the accepted carrier readable.
Independent roots/scopes are explicit positive controls.

`S4-HOST-08` tests only an unsupported manifest **schema version**. It does not
establish rejection of incomplete or mixed accepted generations. Those cases remain
blocked on S3's concrete generation representation and S5's exact integrated pin.

## Proposal 2: actual native tool caller

`v2-atlas-membership.test.patch` adds one case to the existing
`modules/maestro/coordination/test/v2-atlas.test.ts` fixture. It creates a new source
under that fixture's registered `src/**` territory and calls the actual
`ToolRegistry.materialize().settle` path for `atlas_context` catalog and unit actions.
It expects an explicit HOLD, then checks the valid unit again after cleanup.

This oracle comes from AC-09's registered-scope addition requirement. Source inspection
shows the baseline native host only enumerates snapshot-declared `sourcePaths`; it
does not enumerate new catalog-scope members. The test therefore targets a concrete
source-derived risk. **A failing baseline run has not been observed.** Neither the
expected result nor the source inspection is a test verdict.

The current native tool reads static Own snapshots; the new ownership runtime reads
published `OwnershipManifest` objects from the governed projection. A native bridge
must consume the S1 interface/scope contract and exact S2/S3 candidate. This proposal
does not invent that shared API, infer authority from metadata, or transplant
historical approvals to the new scope. See `entrypoints.json` for the exact boundary.

## Execution and integration requirements

S5 must identify the integrated candidate, apply proposals serially, freeze S1 scope
and allocation bindings, and run the applicable remote tests under `AGENTS.md`.
Atlas tests are Vitest tests under `modules/atlas`; use the repository's actual Atlas
workflow lane. Do not assume `test:ci atlas` is valid. The actual native caller case
belongs to `bun run test:ci maestro test/v2-atlas.test.ts` after serial application.
The CI specialist's workflow matrix owns exact runner/gate capability evidence.

Syntax or patch-application checks validate only proposal format. They do not execute
imports, governed publication, host reads, tests, or candidate integration. Keep their
receipts separate from behavioral acceptance.

Before reporting AC-09/10 complete, bind and execute the remaining exact S3 mixed and
incomplete generation cases, old producer into the new accepted scope, isolated
migration, compatible rollback, incompatible rollback refusal, and untrusted sidecar
controls. Preserve all historical bytes and obtain both S5 judgments for the same pin.
