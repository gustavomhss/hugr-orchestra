# W1 foundation dispatch

Baseline: `e8319438e5cfb7a8039915ce6e8c2cf6ef390f6d`.
Decision: parallel, four disjoint execution slices. Shared registries, schemas,
facades, manifests, generation and migration belong to the lead.
Contract: `W1-BRIEF.md`, Schema `actions/**`, Core `actions/contract.ts`.

| Slice | Worktree | Owned implementation | Dependencies |
| --- | --- | --- | --- |
| Binding | `actions-binding-code` | `core/src/actions/{binding,state}.ts`, focused tests | injected `BindingResolver` |
| Transport | `actions-transport-code` | `core/src/actions/transport.ts`, `transport/**`, focused tests | AppProcess |
| Operations | `actions-operation-code` | `core/src/actions/operations/**`, `operations.ts`, focused tests | Database; trusted Location |
| Client bytes | `actions-client-code` | `client/src/actions-transfer.ts`, focused tests | Schema; generated Client options |

All pairs are conflict-free. Workers may copy the frozen Schema scaffold and Core
contract/error into their own checkout for compiling/CI snapshots; these copies
are dependency support, not worker-owned integration changes. No worker changes
lead files or another checkout. Root node_modules points to the installed runtime
dependencies; package implementations/tests use their own relative source paths.

Each worker reads root instructions and current Effect source, implements the
fixed exports, runs its package typecheck and explicit test files through test:ci.
No local tests, whole-suite run, gate weakening, direct process-spawn imports,
secret logging/persistence or binary whole-buffer fallback. Handwritten files
stay below 400 lines. A meaningful mutation must fail a scoped remote test before
restoration; the lead verifies the evidence and independently reviews the diff.

Return card: exact baseline, full owned file list, exports, check commands/run URLs,
mutation red/restored evidence, open findings and "what did the framing get wrong?".
Stop at implementation/check evidence. No commit, source-branch push, PR or merge
is authorized by the present instruction; test:ci's documented temporary snapshot
is the test transport. Recovery is preserved in the isolated files and this ledger.

Merge order: transport/binding, operation SQL/migration, Client bytes. The lead
reviews each entire owned diff, integrates through explicit file patches, then
typechecks the assembled packages. W2 waits for concrete API/native-payload freeze.

## Raw Client seam

Export `makeActionsTransfer(options: ClientOptions)` from handwritten Client module.
`ClientOptions` and `RequestOptions` come from generated/client; no Core/Server imports.
`download({binding,target,location?}, requestOptions?)` uses GET
`/api/actions/transfer/<binding.id>`, with revision/kind/id/runID/attempt/path and
normal deep-object `location[directory]`/`location[workspace]` query.
`upload({binding,operationID,filename,body,location?}, requestOptions?)` uses POST
`/api/actions/transfer/<binding.id>/upload`, revision/operationID/filename query and
raw application/octet-stream body. The server frames native provider multipart;
the browser never invents native provider URLs. Both return checked Response with
body stream intact; preserve configured headers/fetch, overrides, AbortSignal,
filename/content-type/digest metadata. Error capture is bounded and typed.

Upload is GitLab Secure File creation admitted through a durable operation;
filename is matched to the prepared target.path. Browser streaming support and
Node fetch duplex differences must be explicit, not hidden whole-buffer fallbacks.
