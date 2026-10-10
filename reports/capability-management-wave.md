# Connection management wave

## Frozen execution contract

Baseline: `8846e685b2`, followed by this contract checkpoint. Campaign continuation authorized by owner on 2026-10-09. Parallel execution: three authors, isolated worktrees, no intermediate PR or CI. Lead owns integration, generated clients and request-ledger extension.

| Package | Ownership | Dependency |
| --- | --- | --- |
| Store | `core/src/capability/connection/store.ts`, existing `connection/index.ts`, dedicated Store tests | Frozen store-contract |
| Management | `core/src/capability/connection/management.ts`, dedicated management tests/fixture | Frozen contracts; Store implementation before runtime tests |
| Protocol | `protocol/src/groups/capability-connections.ts`, dedicated Protocol tests | Schema DTOs |
| Lead | Aggregate Protocol/Server/Client registration; ledger verification hook; Server handlers and delivery | Above packages |

No overlapping author files. No agent changes contracts, manifests, aggregate routes or generated files. Return final SHA, owned file list, exact focused commands/results, measured red/restore/green probes, unresolved framing errors. Cold review slices <=400 changed LOC, author != reviewer. Lead inspects full file lists/diffs and independently probes before normal merges.

## Authority, reads and replay

- Read methods use actual stored project/directory/workspace ownership, never caller-selected Location to adopt an existing ID. Collection list uses actual resolved Location placement.
- Actions: `connection.list`, `connection.get`, `connection.targets`, `connection.disconnect`, `target.create`, `target.retarget`, `target.remove`, `binding.put`, `binding.remove`.
- Primary resources: connection operations including target creation use `{kind:"connection",id:connectionID}`; target/binding mutation uses `{kind:"target",id:targetID}`. Collection list has no resource and requires a resource-unrestricted grant. Target listing additionally checks each returned target with the same action and target resource; bounded live keyset traversal may produce a short/empty page with continuation.
- Missing/foreign unauthorized IDs expose one constant unavailable/denied shape, not raw rows or identity. Public output contains refs/state/credential-presence only; never credential IDs/values/endpoints/subjects/scope hashes/raw target resources.
- Every mutation goes through `CapabilityRequest.commit`. Optional fourth `verify(tx)` callback is SQL-only and runs inside the immediate writer before both receipt reconciliation and fresh mutation. It verifies actual stored parent ownership against captured placement and current private authority. Fresh callback alone validates active state/current generation/ref. No approvals/network/model tools under writer.
- Exact retry of disconnect/retarget/remove must survive state/generation change or removed target. Parent connection persists and proves placement. Payload contains full original ref; changed parent/ref/input cannot reuse receipt. Recheck target's actual parent when target still exists; if absent, only exact ledger retry succeeds, fresh mutation fails.
- Binding public input never accepts agentID. Read SessionTable, require exact parent placement and nonempty persisted agent; derive branded Agent.ID. Include derived actor in idempotency payload and recheck same actor under writer using verification hook, also on replay. Actor switch requires new explicit request; no default/newest/model-context actor. Trusted existing host bind remains compatible.
- Current verification hook carries honest SQL/error unions and preserves full mixed Causes. It cannot open a nested transaction or supply authorization itself.
- Capture DTOs before effects with descriptor-safe existing `CapabilityOperatorScope.capture` plus strict type schemas. Freeze/copy method facade inputs; reject accessors/proxies, oversized input and excess fields without executing serializers.
- Query limit defaults16, range1..32. Sort ascending opaque IDs and fetch limit+1; coverage `live`, never snapshot/count claim. Filter scoped entries with full-Cause-safe handling: only pure expected scope denial may become an omitted item; mixed faults propagate.

## Store

`CapabilityConnectionStore.make` is an effect yielding frozen store-contract Interface. SQL methods receive explicit transaction/placement and never start their own transaction. Factor shared connection/target ownership, generation, active-state and SQL mutation primitives out of existing facade. Reuse those from trusted facade/model credential validation; preserve existing public behavior. Store errors honestly include Capability/SqlError/EffectDrizzleQueryError; do not use first-Fail mapping at new boundaries. Bind validates Session placement, action trim/nonempty/deduplication. Management owns derived actor checks. Retarget/disconnect/remove invalidate bindings. No credential mutation or network calls.

## Protocol and delivery

Group `server.capability.connections`; factory `makeCapabilityConnectionsGroup(locationMiddleware)` applies Location middleware then CapabilityAuthorization so authentication executes first.

| Method | Path | Endpoint | Payload/success |
| --- | --- | --- | --- |
| GET | `/api/capability/connections` | `capability.connection.list` | LocationQuery + encoded pagination / ConnectionPage |
| GET | `/api/capability/connections/:connectionID` | `capability.connection.get` | LocationQuery / Connection |
| GET | `/api/capability/connections/:connectionID/targets` | `capability.connection.targets` | LocationQuery + encoded pagination / TargetPage |
| POST | `/api/capability/connections/disconnect` | `capability.connection.disconnect` | DisconnectInput / Receipt |
| POST | `/api/capability/targets` | `capability.target.create` | CreateTargetInput / Receipt |
| POST | `/api/capability/targets/retarget` | `capability.target.retarget` | RetargetInput / Receipt |
| POST | `/api/capability/targets/remove` | `capability.target.remove` | RemoveTargetInput / Receipt |
| POST | `/api/capability/bindings` | `capability.binding.put` | PutBindingInput / Receipt |
| POST | `/api/capability/bindings/remove` | `capability.binding.remove` | RemoveBindingInput / Receipt |

All endpoints protected; mutation idempotency-key required by ledger. Numeric query limit uses Effect Schema number-from-string transform matching local protocol patterns. Protocol depends only Schema/Effect. Server handlers thin, use owning ServerOperator, Database and shared Store/Management, map each expected Fail without dropping mixed Cause reasons. Generated Client group `connections`, explicit endpoint mapping for `createTarget`, `retargetTarget`, `removeTarget`, `bind`, `unbind`. Regenerate via package command only.

## Required meaningful checks

Store: existing connection regression tests; real SQL stale/foreign refs, invalidation, unbind, supplied-transaction rollback. Management: authentic scoped facade/private request frame, real DB and Store, receipts and concurrent retry, changed idem conflicts, disconnect/retarget/remove exact retries, foreign placement and scoped ID privacy, missing/stale actor and actor switch while writer held, deletion/owner change while writer held, generation exhaustion, redacted bounded live pagination, missing/revoked authority. HTTP/SDK: actual middleware/router and generated client, absent auth before Location, actual placement/IDs, idempotency header, redacted receipts and strict DTO rejection.

Focused local tests only (`ORCHESTRA_LOCAL_TESTS=1 bun test ./test/<file>.test.ts` from package), `bun typecheck` from packages. No paid/live vendor calls, account changes, global guards/env changes, full suites or heavy platform qualification. Push first compiling checkpoint and final; stop after report, never PR/CI/merge.
