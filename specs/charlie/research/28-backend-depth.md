# R28 — Backend depth at ownership and publication boundaries

Research date: 2026-10-03. **Decision:** add seven demand-loaded procedure cards to Charlie's backend repertoire. Select by changed failure boundary, not language or repository size.
Evidence: primary source code and documentation inspected; failure schedules reconstructed from those mechanisms. **No runtime tests, fault injections, benchmarks, or deployed behavior observed.** Oracles below are proposed verification designs, not passing results.

## Scope, pins, and added value

| Project | Source pin | Release pin supplied for comparison |
| --- | --- | --- |
| OpenClaw | [`06da0de86c0a27dc1e92995f9d0a2428880ce90c`](https://github.com/openclaw/openclaw/commit/06da0de86c0a27dc1e92995f9d0a2428880ce90c) | [`fc23bc864e4553c2d215e479eeec47b67a0bf943`](https://github.com/openclaw/openclaw/commit/fc23bc864e4553c2d215e479eeec47b67a0bf943) |
| Hermes | [`d795726f78e532ca31655f74656b4be63a907581`](https://github.com/NousResearch/hermes-agent/commit/d795726f78e532ca31655f74656b4be63a907581) | [`f97608f178d1ffeca59860195ab7da295f7c8e5f`](https://github.com/NousResearch/hermes-agent/commit/f97608f178d1ffeca59860195ab7da295f7c8e5f) |

Code observations use source pins unless explicitly labeled release. OpenClaw release's `state-lease-process-owner.ts` returns `unknown` for foreign hostname; source pin qualifies boot/PID namespace and heartbeat. Release lease heartbeat is 30 seconds; source uses 15. [O1], [O2], [OR1], [OR2]

Hermes release and source `mcp_schema_cache.py` both implement config fingerprint plus optional TTL; missing TTL means indefinite eligibility. This inspected-file comparison establishes neither whole-release parity nor source-feature availability in release. [H1], [HR1]

Versioned docs below establish API semantics, not mandatory versions. Moving SQLite/Next/TypeScript/Go-guide pages reflect retrieval date; inspect project's actual runtime, driver, deployment adapter, and linked SQLite build before applying.

Selectively reviewed existing reports under `/Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin/specs/charlie/research/`:
- `17-rust-go.md`, §3 and R2/R3/G1/G2: already covers owned cancellation, transaction scope, bounded workers, uncertain commits.
- `18-backend-stacks.md`, C4/C5 and Python/JS/Node/Next overlays: already covers async blocking, resource scopes, cache authorization, stream pressure, framework versions.
- `19-data-api.md`, §§1–5/7: already covers isolation, durable idempotency/outbox, migration coexistence, API compatibility, calibrated oracles.
R28 adds precise recovery classifications, physical file/producer ownership, layered cache publication, peak-resource accounting, and registration-generation transitions. Reuse earlier general procedures; load only relevant deeper card.

## R1 — Qualify liveness; fence writes at their destination

- **Trigger →** stale lease, restart/container replacement, lock reclaim, worker takeover, old completion overwriting successor.
- **Diagnose →** Which host/boot/PID namespace makes PID comparable? Can PID have been reused? Is heartbeat stale, owner proven dead, or evidence unknown? Which transaction rechecks ownership? Does actual write destination reject displaced owners?
- **Observed →** OpenClaw source shares namespace classifier between file lock and SQLite lease: same-host changed boot proves old generation dead; incomparable namespace uses heartbeat policy; fresh uncertainty refuses takeover. Qualified live owner remains protected despite expired lease. Acquisition rechecks inside immediate transaction; release retains physical-custody checks. [O1], [O2]
- **Minimal mechanism →** preserve `live / dead / unknown` classification and existing host owner. If backend already supports ownership transfer, assign non-reused epoch and make protected writes conditional on current epoch at sink. For same-DB lease and business rows, hold lease-row lock through epoch check and mutation; claimant uses same lock. PostgreSQL `FOR UPDATE` lasts through transaction. A preflight check followed by unlocked write is insufficient. [D1]
- **Failure interleaving →** source commit reports crash → replacement hostname → old hostname-only lease becomes `unknown` → restart blocked. Distinct unsafe “fix”: A pauses → TTL expires → B acquires → A resumes write. Deadline solved admission, never revoked A's ability to write.
- **Healthy oracle →** dead comparable owner can be recovered; fresh incomparable owner and qualified live-but-expired owner remain protected. After legitimate takeover, force A's late mutation/release: successor state survives and B's valid write succeeds.
- **Negative oracle →** replace destination epoch check with acquire-time check, or reclaim solely by TTL. Controlled paused-owner schedule must expose stale write or premature takeover, not merely timeout error.
- **Do not generalize →** OpenClaw's 90-second foreign-heartbeat policy is failure-detector policy, not proof process died, distributed consensus, or remote-effect fencing. Random owner identity is not automatically ordered fencing token. PostgreSQL locks protect participating DB operations, not unrelated remote APIs.
- **Small task →** process-local serialization or existing transaction usually enough. Charlie uses existing OpenCode/Orchestra ownership; this recipe does not authorize adding coordinator or clustered Session execution.

## R2 — Preserve WAL family and lock custody before inspecting or recovering

- **Trigger →** SQLite backup/export, repair, file replacement, “read-only” inspection, missing committed data after restart.
- **Diagnose →** Where are last committed pages: main file or WAL? Is writer live? Could opening/closing raw descriptor disturb its locks? Must inspection preserve source artifacts? Which physical generation does handle reference? Is operation backup, forensic capture, or authorized repair?
- **Observed →** OpenClaw uses owned-connection backup or isolated snapshot worker, checks file/sidecar identity, and recovers hot rollback copy privately; super-journal recovery is refused on that private path. `readSqliteSourceContentVersionSync` keeps raw descriptor work in child. Hermes `_secure_state_db_files` uses path `chmod` and exclusive new-file creation rather than opening/closing existing DB for hardening. [O3], [O4], [H2]
- **Primary semantics →** SQLite commit may exist only in WAL. Main-only copy can lose committed rows. Ordinary read-only opens may need WAL-index creation/recovery. Under default Unix POSIX locking, unrelated same-process `close()` on DB inode can drop SQLite's locks; managed-language ownership does not change OS behavior. [D2], [D3]
- **Minimal mechanism →** use installed driver's online-backup facility for ordinary live backup; give backup completion, error, and cleanup explicit owner. Artifact-preserving inspection needs coherent private family under existing maintenance path. Verify source generation before publishing; refuse unstable input. Restore through existing maintenance owner after writers/readers drain, never replace file under live handles. [D3], [D4]
- **Failure interleaving →** A holds SQLite locks → diagnostic thread opens/reads/closes same file outside SQLite → process locks drop → B can enter conflicting access. Separate recovery failure: commit lands in WAL → copy only main → restored DB opens but committed sentinel vanished.
- **Healthy oracle →** snapshot contains known committed WAL-only sentinel plus consistent related rows. Quiescent forensic source remains byte-identical; live-writer case separately preserves lock exclusion. Restore observes intended generation and retained business data, not only `integrity_check` success.
- **Negative oracle →** main-only copy loses sentinel. Raw-descriptor close variant must make competing lock acquisition observable. Byte checks require isolated/quiescent fixture; concurrent legitimate writer invalidates “unchanged source bytes” oracle.
- **Do not generalize →** do not copy OpenClaw's raw-family/WAL-prefix implementation into generic backup helper, or Hermes repair/retirement machinery into Charlie. A stable checksum is not snapshot-isolation proof. Online backup can restart under concurrent writes; progress need not imply bounded completion. [D4]
- **Small task →** ordinary CRUD needs current DB API, no file probes. One-off export uses existing backup command. Actual SQLite version matters across Rust/Go/Python/Node bindings; WAL correctness depends on engine/VFS and filesystem, not package language. [D2], [D3]

## R3 — Cancel one consumer without losing producer cleanup authority

- **Trigger →** coalesced requests, shared in-flight cache fill, canceled export, stream retry, thread offload, teardown returning before work stops.
- **Diagnose →** Who owns producer versus each waiter? Can first canceled waiter abort work still needed by second? Who joins last orphan? Can late result/finalizer reach successor? Is reported “done” task settlement, resource closure, or actual worker exit?
- **Observed →** OpenClaw snapshot single-flight tracks waiters and leased results separately; final canceled participant retains producer-close responsibility. Failed result is explicitly insufficient evidence producer joined. Hermes stream delivery increments writer token and checks supersession before delta delivery; gateway run generations guard displaced turn cleanup. [O5], [H3], [H4]
- **Minimal mechanism →** reuse runtime scope/handle collection. Consumer cancellation removes that subscription; producer stops only when owner ends or all legitimate consumers leave. Retain handle and cleanup obligation until settled. Reject stale publication and stale release using captured identity/generation at authoritative mutation boundary. Non-cooperative work stays accounted for until actual completion or existing process owner terminates it.
- **Failure interleaving →** A and B share snapshot producer P → A cancels → naive cleanup kills P or removes file B needs. Alternate: worker A times out → B becomes current → A emits late chunk or runs name-only finalizer → B's output/slot corrupted. These are concrete ownership transitions represented by cited code, not executed reproductions.
- **Healthy oracle →** first cancel preserves B's valid result; last cancel joins P and removes owned staging resources. Release paused A after B starts: A cannot publish into B or release B's slot; B still completes useful work. Count actual producer completion, not just rejected waiter.
- **Negative oracle →** abort producer on first unsubscribe; drop retained handle on timeout; remove identity check from finalizer. Same reached-transition fixtures must distinguish each broken obligation.
- **Runtime semantics →** Tokio dropped `JoinHandle` detaches; `abort` needs completion observation and cannot stop started `spawn_blocking`. Go `CancelFunc` does not join. Python task cancellation is cooperative; running executor future cannot be canceled. Node `finished(..., {signal})` cancels waiting, not underlying stream; pipeline signal does destroy pipeline, but generator must cooperate. [L1], [L2], [L3], [L4], [L5], [L6]
- **Do not generalize →** Hermes compatibility stream-fence accessor falls back to unfenced behavior when unavailable; token checks are local publication guards, not proof thread exited or remote work stopped. Its separate token check and callback are not universal atomic sink fencing. OpenClaw retained-operation machinery is specialized native cleanup plumbing. [H3a], [O5]
- **Small task →** one awaited operation with existing scope usually enough. Add subscriber accounting only for genuinely shared work; use existing Session runner ownership rather than second loop or per-plugin task supervisor.

## R4 — Classify dispatch phase and post-commit failure before retry

- **Trigger →** timeout/reconnect wrapper, response delivery recovery, SDK retries, error after DB commit, duplicate external effect.
- **Diagnose →** Was request never dispatched, definitively rejected, possibly applied, or known committed? Does retry repeat same intent? Did failure occur in business effect or later logging/permission/response cleanup? Can remote status be queried? Does recovery layer replay before caller sees uncertainty?
- **Observed →** Hermes `_StdioChildExited.in_flight` separates dead-before-dispatch from death after call starts; only former gets automatic replay there. Session-expired write-capable call reconnects transport but returns `outcome_uncertain`. OpenClaw `runOpenClawStateWriteTransaction` stops cold-admission retry once callback entered and keeps post-commit permission-hardening failure from reclassifying committed write as failed. [H5], [O6]
- **Minimal mechanism →** carry phase/outcome alongside cause through existing error type; preserve stable business key from R19. Before-call recovery can retry within original budget when non-dispatch is established. After possible dispatch, reconcile or use verified provider idempotency. Known commit plus ancillary failure remains committed with separately reported ancillary failure; required atomic work belongs before commit. PostgreSQL explicitly says successful cancellation dispatch need not affect completed command. [D5]
- **Failure interleaving →** server applies write → response pipe closes → transport reconnects → generic retry applies write again. Local variant: commit succeeds → permission/logging step throws → caller sees generic failure → repeats committed operation.
- **Healthy oracle →** record actual dispatch/effect and original key; drop reply after effect then reconcile same operation without second effect. Pre-dispatch dead transport may recover and perform intended effect once. Inject ancillary failure after confirmed commit: business outcome stays committed, failure remains diagnosable.
- **Negative oracle →** collapse both stdio-death phases into retryable error, or move post-commit ancillary work inside retried unit. Destination-side effect ledger detects duplication; local HTTP status or mock call count alone cannot prove remote outcome.
- **Do not generalize →** Hermes comment that 401 is always pre-dispatch is adapter assumption, not universal HTTP/proxy guarantee. `readOnlyHint` is untrusted unless server trusted under MCP contract. Suppressing replay in one adapter does not establish end-to-end at-most-once execution. [H5], [D6]
  Hermes delivery ledger deliberately marks ambiguous redelivery as possible duplicate; writes are best-effort and row-cap pruning can discard outstanding rows after terminal rows. Its `INSERT OR REPLACE` re-recording resets state/attempt budget. Do not copy it as strict payment/outbox/durable-admission guarantee. [H8]
- **Small task →** naturally idempotent conditional update may need only structured outcome. Add durable intent/reconciliation only at harmful replay boundary; never turn post-crash Session inspection into automatic provider continuation.

## R5 — Invalidate derived caches through generations and freshness propagation

- **Trigger →** cache clear, live config/tool change, long-lived derived schema cache, background fill completing after invalidation.
- **Diagnose →** Which inputs change meaning? Does outer hit skip inner TTL check? Can pre-invalidation fill repopulate current map? Is absence distinct from explicit empty/null? Which deployment/process owns invalidation epoch? Does hit still pass current authorization?
- **Observed →** Hermes `_tool_defs_cache_key` includes registry generation/config signature/scope; `get_tool_definitions` hit returns without recomputing availability. Inner `_check_fn_cached` has TTL, but outer key carries no freshness deadline. Separately, inner probe executes outside cache lock, then stores under lock; `invalidate_check_fn_cache` clears maps without rejecting old in-flight fill. These are freshness gaps at inspected function boundaries; caller-side invalidation may narrow exposure. No deployed incident asserted. [H6], [H7]
- **Minimal mechanism →** map dependency → freshness/version → derived entries. For mutable custom cache, capture epoch before computing; publish only if epoch still current under same synchronization as invalidation. Bump epoch and invalidate dependent plane together. Propagate inner expiry to outer entry or route relevant changes through invalidation; versioned keys alone do not make unchanged-but-expired dependency fresh.
- **Failure interleaving →** A starts old availability probe → setting changes and invalidator clears → A returns old verdict → writes it back as current. Layered variant: outer definitions cached → inner availability TTL passes → outer hit skips probe until key changes, entry is evicted, or caller explicitly invalidates it.
- **Healthy oracle →** pause fill before publication, invalidate, release fill: later lookup uses current meaning. Hold config/registry identity fixed beyond dependency freshness window: required probe reruns. Unchanged fresh input still hits intended cache. Verify actual hit/miss path, not bypassed test cache.
- **Negative oracle →** remove epoch comparison or omit propagated expiry; same schedules return old verdict. Include absent versus explicit-empty configuration pair only where real semantics differ.
- **Next semantics →** inspected Next 16.3.8 docs: `updateTag` is Server-Action-only and next read waits for fresh data; `revalidateTag(tag, 'max')` serves stale-while-revalidate. Choose after committed mutation according to requirement. Neither API invalidates unrelated application `Map`, Python memo, or worker-local cache. [L7]
- **Do not generalize →** Hermes schema-cache fingerprint intentionally omits credential identity; live connection sharing uses richer identity. TTL-free manifest is not permanent truth. `config_fingerprint` normalizes missing/empty include lists together while registration distinguishes them; registration re-filters, so hash collision alone is not proof forbidden execution. [H1], [H9]
- **Small task →** remove unnecessary memo or invalidate one existing entry. Epoch belongs in existing cache owner when race exists; no cache service, Atlas mirror, or universal cache abstraction. Short-lived request memo often needs no persistent invalidation protocol.

## R6 — Bound peak live resources, pending admission, and payload bytes separately

- **Trigger →** burst stalls, file-descriptor exhaustion, several pool instances, large fan-out/export, slow streaming consumer.
- **Diagnose →** Is limit on idle objects, active objects, queued requests, or bytes? Does each instance multiply budget? Are opening/closing resources counted? Does fallback acquire resource already held by caller? Can chunk size or decoded expansion bypass item limit?
- **Observed →** Hermes read pool uses permits shared by canonical DB path and process, acquired before opening; idle connections retain permits. Pool queue alone bounds returned connections, not peak alive. Exhausted read budget falls back to locked writer connection. Extra descriptor-headroom probe is best-effort; writer handles remain separate cost. [H2], [H10]
- **Minimal mechanism →** reuse shared pool/admission owner at scope of scarce resource. Bound pending producer work before allocating one task/request per item; hold live-resource permit through use and closure. Bound chunk/page size plus queued bytes and decoded expansion where relevant. Backpressure or explicit overload is preferable to hidden unbounded queue. Check fallback for lock-order/deadlock inversion.
- **Failure interleaving →** idle queue empty → many simultaneous readers each open fresh connection → only return path enforces queue size → peak descriptors exhausted before return. Per-instance semaphore merely moves failure to several instances. Stream variant: object queue bounded, but each object contains arbitrarily large payload.
- **Healthy oracle →** force overlapping opens across instances and paths, blocked consumer, early disconnect, and partial-open failure. Observe actual live descriptors/queued bytes plus logical permits; next healthy request succeeds. Bound stated population: pool cap alone does not bound process writers, sockets, or driver/native buffers.
- **Negative oracle →** move permit acquisition after open, make permits instance-local, or ignore pressure while retaining item-only cap. Reached concurrency schedule must exceed resource contract; merely completing slower is not failure evidence.
- **Runtime semantics →** Go `SetMaxIdleConns` differs from `SetMaxOpenConns`; open limit can deadlock nested acquisition. Python 3.13 executor `map` collects inputs immediately despite worker cap. Tokio blocking-thread limit leaves queued work, so application admission still matters. Node object-mode high-water mark counts objects, not bytes, and is threshold rather than hard cap. [L2], [L5], [L6], [L8]
- **Do not generalize →** Hermes numerical ceilings/fallback reflect its workload. `_close_read_conn` returns permit even after logged close failure: logical accounting alone cannot certify physical descriptor ceiling. Do not infer whole-process memory bound from stream threshold or whole-service concurrency from one DB pool.
- **Small task →** serial iteration, existing bounded page, or current pool often sufficient. Keep straightforward synchronous small operation; add worker farm or streaming only when workload requires it.

## R7 — Publish schema, handler, and teardown ownership as one generation

- **Trigger →** dynamic handler registration, plugin reload, schema-cache startup, SDK model-field changes, stale disposer removing new registration.
- **Diagnose →** Which schema produced call arguments? Which handler generation consumes them? Does discovery perform side effects? Can old unload remove new entry? Is wire field name different from SDK attribute? Does normalization collapse distinct names?
- **Observed →** Hermes `ToolEntry` couples schema/handler; `register` validates basic schema shape and increments generation. `restore_registration` compares object identity before restoring previous entry. OpenClaw live-snapshot-owner disposer removes only its own registration object. Hermes `_write_schema_cache` reads both SDK `input_schema` and wire `inputSchema` through `mcp_field`, avoiding cached empty parameter schema described in source comments. [H6], [O7], [H9]
- **Minimal mechanism →** prepare and validate replacement before publication; publish bundle through existing registry mutation boundary and invalidate dependent definitions. Capture registration identity for teardown and dispatch; compare-and-remove/restore only same owner. If advertised old schema can outlive reload, retain compatible old handler through admitted call or reject stale contract before effects; do not silently reinterpret payload under incompatible handler.
- **Failure interleaving →** A registers handler/schema → B replaces same name → delayed A cleanup deletes by name → B disappears. Wire variant: SDK renames runtime attribute → permissive `getattr(..., {})` caches empty schema → restart lazy-loads tools with stripped parameters although handler still requires them.
- **Healthy oracle →** publish B, run A disposer, then invoke B with nontrivial required argument and observe B's effect/result. Compare live and cached schema semantics across restart, including required/nested fields. Malformed registration must not replace functioning entry; deliberately colliding normalized names must follow explicit collision policy.
- **Negative oracle →** remove identity CAS from disposer or read only obsolete SDK attribute. New-generation invocation or schema round-trip must fail for intended reason, not unknown fixture/tool.
- **Language/protocol semantics →** TS assertions disappear at compilation, so JS and TS need actual runtime decoder. Rust/Go static types also do not couple separately published external schema to mutable dispatch table; keep bundle coherent through existing synchronization. Python dataclass/dict presence is not JSON Schema validation. MCP distinguishes wire schema, list-change notification, runtime invocation, and untrusted annotations. [L9], [D6]
- **Do not generalize →** Hermes basic object-shape check is not full JSON Schema validation; identity-safe unload does not prove whole reload atomicity. Import-time discovery and compatibility fallbacks are platform-specific choices. OpenClaw's snapshot registry is one local example, not general plugin framework.
- **Small task →** static route/tool uses existing decoder plus handler registration. No reload protocol needed if lifecycle cannot reload. Charlie extends native host surface; no parallel tool catalog or transplanted MCP/agent runtime.

## Charlie application: keep work lightweight and evidence honest

1. Inspect changed boundary and real owner. Load matching card only; ordinary CRUD can stay with R19 transaction/constraint/authorization procedure.
2. State one invariant and shortest failing schedule. Choose installed driver/runtime facility; use language notes only when that boundary crosses it. No mandatory Rust/Go/Python/TS migration, framework, database, or test toolchain.
3. For future implementation verification, pair useful healthy transition with targeted bad interleaving and known-bad control. Establish barrier was reached; inspect actual destination/resource. Missing environment, skipped path, or unjoined worker means inconclusive—not green. No such execution performed for R28.
4. Native Atlas may retain compact lesson: trigger, invariant, source revision, boundary, minimized schedule, evidence pointer, invalidation condition. Research remains labeled source-observed/proposed; Atlas memory never substitutes for live lease, commit receipt, authorization, or current schema.
5. Existing OpenCode/Orchestra owns Session admission/execution, tools, resource scopes, and process-local coordination. Preserve durable admission before advisory wake; keep post-crash provider continuation separate from storage inspection/recovery. Native Atlas remains Knowledge/Memory authority. **No second agent platform, memory store, coordinator, or generic infrastructure layer.**

## Primary source register

Exact symbols named above are navigation anchors; immutable code links fix inspected revision. Upstream comments/commit narratives are attributed engineering rationale, not measured outcomes.

- **O1:** `acquireGatewayOwnerLease`, `readStoppedGatewayOwnerLease`, `release` — transactional admission, qualified liveness, custody-aware cleanup.
- **O2:** `classifyGatewayOwnerProcessNamespace` — boot/namespace/heartbeat branches and source policy constants.
- **OR1/OR2:** release `readStateLeaseProcessOwnerStatus` and `acquireGatewayOwnerLease` — narrower hostname evidence and release heartbeat.
- **O3/O4:** `readSqliteSourceContentVersionSync`, `prepareReadOnlySourceInProcess`, `createOnlineReadOnlyBackup`, `recoverPrivateJournalCopy`, `prepareSqliteReadOnlyLocationFromOwnedDatabase` — source-preserving inspection and backup ownership.
- **O5:** `startSnapshotFlight`, `startCloseProducer`, `leaseFlight` — waiter/result/producer lifetimes.
- **O6:** `runOpenClawStateWriteTransaction` — callback-entered retry boundary and post-commit hardening.
- **O7:** `registerLiveSqliteSnapshotOwner` — identity-safe disposer.
- **H1/HR1:** `config_fingerprint`, `get_cached_entry`, `write_cache_entry` — source/release cache policy.
- **H2/H10:** `_secure_state_db_files`, `_get_read_conn`, `_close_read_conn`, `_read_ctx`, `_PathReadBudget` — lock custody and resource ceilings.
- **H3/H3a/H4:** `StreamDeliveryMixin`, compatibility `_fence_call`, `_release_running_agent_state`, `_release_turn_lease` — local supersession guards and limits.
- **H5/H8:** stdio/session-expired recoverers; `record_obligation`, sweeps, `_prune_unlocked` — replay phase and best-effort delivery boundaries.
- **H6/H7:** `ToolRegistry`, `_check_fn_cached`, invalidation, `get_tool_definitions`, cache key — registration ownership and layered freshness.
- **H9:** `_write_schema_cache`, `_make_tool_filter`, `_connection_identity`, `_register_candidates` — SDK aliases, identity and publication boundaries.
- **D1–D6:** PostgreSQL 18 row/advisory locks and cancellation; SQLite WAL §§2/4/5, corruption §§1.2–1.4/2.2/2.5/2.7, backup §3.1; MCP 2025-06-18 tools contract.
- **L1–L9:** Tokio 1.47.1 task ownership; Go 1.25.0 context; Python 3.13 tasks/executors; Node 24.0.0 streams; Next docs rendered 16.3.8; Go connection guide; TypeScript assertions.

[O1]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/infra/gateway-owner-lease.ts
[O2]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/infra/gateway-lock-payload.ts
[OR1]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/infra/state-lease-process-owner.ts
[OR2]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/infra/gateway-owner-lease.ts
[O3]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/infra/sqlite-snapshot-source.ts
[O4]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/infra/sqlite-readonly-location.ts
[O5]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/infra/sqlite-snapshot-single-flight.ts
[O6]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/state/openclaw-state-db.ts
[O7]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/infra/sqlite-live-snapshot.ts
[H1]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/mcp_schema_cache.py
[HR1]: https://github.com/NousResearch/hermes-agent/blob/f97608f178d1ffeca59860195ab7da295f7c8e5f/tools/mcp_schema_cache.py
[H2]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_state.py
[H3]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/stream_delivery.py
[H3a]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/stream_single_writer.py
[H4]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/run_agent_cache.py
[H5]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/mcp_tool_handlers.py
[H6]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/registry.py
[H7]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/model_tools.py
[H8]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/delivery_ledger.py
[H9]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/mcp_tool_registration.py
[H10]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_state_readpool.py
[D1]: https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS
[D2]: https://sqlite.org/wal.html
[D3]: https://sqlite.org/howtocorrupt.html
[D4]: https://sqlite.org/backup.html#file_and_database_connection_locking
[D5]: https://www.postgresql.org/docs/18/libpq-cancel.html#LIBPQ-PQCANCELBLOCKING
[D6]: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
[L1]: https://docs.rs/tokio/1.47.1/tokio/task/struct.JoinHandle.html
[L2]: https://docs.rs/tokio/1.47.1/tokio/task/fn.spawn_blocking.html
[L3]: https://pkg.go.dev/context@go1.25.0#CancelFunc
[L4]: https://docs.python.org/3.13/library/asyncio-task.html#task-cancellation
[L5]: https://docs.python.org/3.13/library/concurrent.futures.html#concurrent.futures.Future.cancel
[L6]: https://nodejs.org/docs/v24.0.0/api/stream.html
[L7]: https://nextjs.org/docs/app/api-reference/functions/updateTag
[L8]: https://go.dev/doc/database/manage-connections
[L9]: https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions
