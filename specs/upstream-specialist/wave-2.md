# Upstream closure wave 2

Baseline for every worker: immutable reviewed candidate `abf7a72c77fcaeee1206400a8270b2581ae9839c` over dev baseline `73651a0e69`. No worker may commit, push, merge, open a PR, restart the app/server or change another worktree. The existing dirty lead worktrees remain preserved. Latest observed `fork/dev` additionally includes `5d811f0af8` descriptor-store #102; no source in this wave overlaps that store.

GO: five parallel disjoint slices, then sequential integration. Lead retains all interface/authority decisions. Shared-file claims are excluded from workers and use explicit handoffs. Cold review follows integration; a worker report is not a landing gate.

| Slice | Worktree / branch | Owned writes | Dependency |
| --- | --- | --- | --- |
| Core authoring authorization | `upstream-arsenal` | Core Arsenal module, optional private authoring helper, dedicated Core tests | none |
| Orchestra discovery/binding | `upstream-bindings` | `src/tool/maestro-arsenal.ts`, `src/tool/registry.ts`, dedicated tool tests, V2 binding handoff document | Core contract below; roster grants integrated by lead |
| Structural proposal inspection | `upstream-proposal` | `src/maestro/upstream-proposal.ts`, dedicated tests | existing native RelaySprint schema |
| Canonical docs / Maestro handoff | `upstream-docs`, directory `upstream-docs-work` | TEAM/class-map, Maestro transfer handoff document | existing owner decisions |
| Upstream authoring method | `upstream-method` | packaged `walt-specialist/skills/**` | frozen operation IDs and proposal inspection API |

## Frozen Core contract

- Existing IDs `maestro_arsenal_catalog`, `maestro_arsenal_describe`, `maestro_arsenal_execute` unchanged.
- Export `UPSTREAM_AUTHORING_OPERATIONS` from `@orchestra/core/tool/maestro-arsenal`, immutable readonly string list of exactly:

```text
anchor-gen
conflict-map
context-packer
contract-freezer
enrich-plan
plan-check
plan-compiler
plan-to-briefs
plan-to-dag
plan-to-gates
plan-to-policy
seam-checker
sliceability
```

- `Host.nativeUpstream?: boolean` is actual host attestation, never a tool argument. `nativeMaestro` is never forged or widened.
- Native Maestro retains its existing surface. Native upstream gets only the listed pure operations; ordinary/non-native callers remain rejected. Catalog filters to that surface before pagination; describe/execute apply the same restriction before receipt/use. Missing listed operations or non-pure descriptor drift are named failures, not silent omissions.
- Existing bounded describe receipt and project/directory/Session/agent binding retained. A receipt cannot override current access. No approval, acquisition, governance, workflow execution or new public namespace granted.
- `Options.nativeUpstream?` supplies optional actual roster attestation for scoped V2 registration, additionally requiring actual agent ID `walt`. Application resolvers supply the host boolean from real services.

## Frozen Orchestra integration

- V1 host attests upstream only for actual `Agent.Service` result `id === "walt" && native === true`.
- Registry offers three Arsenal tools only to real native Maestro or upstream; existing native permission filtering still applies. Lead adds catalog permission and exact describe/execute operation-pattern grants to the walt profile after Core integration. Other seats receive none.
- V2 `arsenal-bindings.ts` is a shared integration seam. Worker writes a precise additive handoff for actual V2 + native roster identity checks, not concurrent source edits. Relay/related runtime owner must integrate/acknowledge it. Task/Session/`arsenal-completion`/Relay service-schema source files remain Relay-owned.

## Frozen proposal inspection API

- Namespace `UpstreamProposal`, synchronous `inspect(bytes: Uint8Array)`.
- Snapshot supplied bytes once; strict UTF-8 decode, then Effect Schema JSON/native `RelaySprint.Sprint` decoding. No manual JSON parser/catch, effects, file acquisition, arm creation, command execution, normalization/re-encoding or second DSL.
- Return `{ schemaIdentifier: "RelaySprint.Sprint", digest, byteLength, sprint }`. `digest` is SHA-256 of the byte snapshot, not decoded/re-encoded JSON. These are structural inspection facts, not publication/approval/verified provenance.
- Native schema preserves unknown metadata; it is not authority. `gen` is not schema version/approval. Structurally accepted empty checklists, unsupported human kind or runtime-invalid commands do not become semantic PASS.
- Immutable materialization/revision, acquisition identity, real upstream provenance and approved scope remain mandatory W6 integration. No worker-supplied fields replace host facts.

## Authoring and orientation

Transfer product/architecture/spec/planning/decomposition/brief authoring methods into upstream skill references, retaining small Tasks and exact owner/governed rules. Maestro organizes, decides inside owner authority, coordinates review/adoption/dispatch/integration and requests revisions from upstream. Pure structural helpers do not make Maestro the author.

Canonical docs use role or stable ID, not literal default labels. Preserve historic artifacts in `archie-planning`; reconcile implementation-status wording. Maestro prompt/live playbooks remain the neighboring runtime owner's scope: produce exact replacements/handoff, do not concurrently edit those files.

## Verification and return

Tests only through `bun run test:ci` from repo root; typecheck via `bun typecheck` from affected package. No local test guard bypass, root tsc, git config change, blanket stage, secrets, scope-bypass casts or globalThis mocks. Install dependencies with frozen lockfile and ignored scripts when needed. Maximum three CI submissions concurrently; docs/method workers need no new tests for prose edits.

Every code slice supplies discriminating tests and mutation evidence (red with behavior broken, restored afterward). If a compile/test requires a sibling export not integrated yet, name that dependency and do not invent a stub or claim green. Lead verifies after integration and repeats the mutation at the actual boundary.

Return compact: baseline SHA, changed files, implemented contract, checks/run URLs and exact results, mutation/restoration evidence, unresolved blockers, and what framing got wrong. Stop at local reviewed-ready handoff; no landing or permission changes inferred from coordination.
