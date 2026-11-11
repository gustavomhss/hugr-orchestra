# S4 host and reader preparation result

Attempt `S4-PREP-HOST-001`, native subagent `/root/host_readers`.
Baseline `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocol
`2689c516d63488be37de678cc853dd4556fd5c13`. No integrated candidate was executed.

## Deliverables

- `entrypoints.json`: twelve inspected host, runtime, CLI, UI, publication, input and
  reader surfaces, with exact source references and explicit wiring limitations.
- `host-cases.json`: seventeen preparatory cases with frozen expected outcomes. Every
  case is `NOT_RUN` / `INDETERMINATE`. Eleven have prepared executable controls (ten
  Atlas fixture integration cases and one actual native `atlas_context` caller case).
- `proposals/ownership-host-entrypoints.patch`: new Vitest integration tests through
  `composeRuntime.check`, `handler.handle("atlas-emit")` and published `ownership.read/index`.
- `proposals/v2-atlas-membership.test.patch`: additive Bun test through the actual
  `ToolRegistry.materialize().settle` native `atlas_context` path.
- `source-identities.json`: fifty-two fetched source/protocol records checked against
  their Git blob identity and assigned SHA-256 of exact bytes. These are materialized
  source files, not a complete checkout or an execution environment.

## Concrete findings

1. The native `atlas_context` input accepts only catalog, unit and anchor actions.
   It uses `MaestroAtlasSourceV2`, which verifies the static `OWN-SNAPSHOT.json`,
   territory catalog, declared source blobs and generated Own skill bytes.
   `WorkflowKnowledgeV2.resolve` reacquires those same static units for native anchors.
2. The newer ownership surface is separately composed as `runtime.ownership`.
   `createOwnershipAccess` selects one manifest through the governed projection and
   provenance-filtered store; `readOwnership` verifies a requested required closure.
   At the inspected native tool boundary, there is no route to this reader. The CLI
   `own` and UI `openSurface().own` also call the legacy `runtime.own` surface.
3. `ownershipInput` can detect additions only when the artifact's inputs actually
   declare a `members:` key. It includes Git-visible tracked and nonignored untracked
   files. The static native host instead rehashes only snapshot-declared source paths;
   a new path under a catalog glob has no observed membership comparison there.
   The added actual-tool test freezes AC-09's required refusal, but no red run exists.
4. Publication check and actual emit both call `ownershipAttachmentRefusal` after
   authorization. The attachment validates every root with the current host oracle.
   Prepared tests exercise both doors and then confirm the old accepted carrier still
   reads. Direct CAS insertion is never used as a publication or refusal fallback.
5. Closure reads can isolate independent roots and scopes. The native static source
   validates its whole snapshot before selecting a unit; its integration/isolation
   behavior must therefore be proved separately against the final S1 scope contract.
6. `indexOwnership` invokes the full closure read, including local body verification.
   `bodiesReturned: false` means no body in the returned index; it does not prove zero
   body bytes read internally.

## Boundaries and remaining work

The two proposed test patches are baseline-only preparation. Their fixture reviews
are synthetic and carry no campaign semantic or production authority. Source and
schema inspection are not observed refusal results. `S4-HOST-08` only rejects an
unsupported manifest schema version; it cannot close the complete invalid-generation
criterion. Exact mixed/incomplete accepted generations depend on S3.

The required S1 scope/interface/authority and logical quota, S2 production candidate,
S3 generation/migration/rollback candidate and S5 integrated pin remain unconsumed.
Until those bindings exist, the new host bridge, old-producer refusal, isolated
migration and source-compatible rollback are `BLOCKED` and `INDETERMINATE`.
No scope denominator or shared host API was invented to bypass that dependency.

The CI specialist owns workflow and branch-protection evidence. No tests, gates,
product publication, runtime readback, GitHub run, production activation or binding
judge review was executed by this subagent. Data integrity checks and proposal
preparation are the only locally executed work. No GitHub refs were changed.
