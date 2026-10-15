# R24 — Hermes native runtime, sessions, recovery

## Decision

Borrow identity fences, receipt distinctions, scoped cancellation, recovery classification. The backend specialist stays Orchestra plugin; optional Maestro adapter uses native work lifecycle. Atlas stays shared Knowledge/Memory. Resolve specialist public labels through environment-backed host configuration; Maestro retains its fixed public name. Persist native IDs, never display names. Reuse host runtime, store, scheduler.

Hermes provides useful small mechanisms, but its conversation runner, gateway, SQLite ownership, child threads, and recovery automation form substantial runtime infrastructure. Public child lifecycle is process-local supervision, not restart-resumable work execution.

## Provenance and method

- Official [site][site] links `NousResearch/hermes-agent`; repository metadata links back to same site and declares `main` default branch.
- GitHub latest-release API returned **Hermes Agent v0.21.5**, tag **v2026.9.24**, published **2026-09-24T10:09:38Z**. Tag resolves to **`f97608f178d1ffeca59860195ab7da295f7c8e5f`** (`R`); commit timestamp 10:08:47Z. [Release][release] / [commit][release-commit].
- Requested main snapshot **`d795726f78e532ca31655f74656b4be63a907581`** (`M`) exists; commit timestamp **2026-10-03T21:31:04Z**. [Pinned commit][main-commit]. “Main” below means this snapshot, not moving branch head.
- Read official architecture, agent-loop, session-storage, gateway-session-lifecycle, subagent-lifecycle-api, state-db-recovery, and user storage-recovery docs, then followed implementations and test bodies. [D1]–[D7] pin docs to `M`; live architecture page used for official-site cross-check only.
- Static research only. Downloaded source read as text; no Hermes code, test suite, benchmark, installation, or mutation probe executed. Test descriptions below state **test-source reach**, not passing results or production guarantees.
- Calibration: fetched `subagent_lifecycle.py` at both pins; both Git blob hashes `9bf556943d17dc2edbe665d8934eff8f5fb3b7ee`. Same instrument distinguishes lease file: `R=520c443c4da831f2c298fe25b42a7bcaa42a2d58`, `M=3347f05f3823be35832d1af6665926b7b7ab0740`. Failed/timeout fetches contributed no absence claims. Findings scoped to cited paths.

## Native architecture and identity boundaries

`CLI / gateway / ACP / API → AIAgent.run_conversation → turn facade → conversation loop / turn phases → persistence → caller-specific delivery`. Gateway runs synchronous agent work through worker machinery; active objects, pending events, cancellation flags and child futures live in process. SQLite shares transcript/lease state across cooperating processes. [D1], [facade], [gateway-turn]

| Identity | Actual meaning; consequence |
|---|---|
| Profile / `HERMES_HOME` | Store/config namespace. Docs resolve context override, then environment, then platform default. Keep profile identity with routing and child operations. [D3], [routing] |
| `session_key` | Deterministic conversation lane: profile namespace, platform, chat type, Slack workspace scope, chat/thread, optional participant. Multiple keys may `/resume` one session; key alone cannot serialize transcript. Missing DM identifiers can collapse lane. [identity], [local-lease] |
| `session_id` | Durable conversation incarnation; explicit reset/branch/delegation differ from compression continuation. Compression can keep ID or rotate. `parent_session_id` alone does not identify work: `_delegate_from`, `_branched_from`, `_reset_from` distinguish edge kinds. [sessions], [compression] |
| `message_uid` / physical row `id` | Logical message identity survives cloned generations; physical row ID changes. Absorbed-message and tool-call occurrence UIDs preserve merge provenance. Identity codec restores stored values; content equality is not identity. [message-identity], [messages] |
| `task_id` / `turn_id` | AIAgent invocation/environment identity versus fresh execution-turn identity. Missing task ID gets UUID; turn ID combines session, task and random suffix. Reusing task ID is not durable input-retry reconciliation. [facade], [turn-context] |
| Gateway generation / active-turn token / lease holder | Three different authorities: stale in-process callback fence; crash-recovery marker; cross-process transcript-write owner. None alone proves task completion or external delivery. [ingress], [markers], [durable-lease] |
| Child `subagent_id` / child `session_id` | Public handle names supervision record (`sa-…`); child transcript has own session ID and parent linkage. Serializable handle is not persisted execution. [child-api], [child-build] |
| Native work identity | Hermes also has Kanban `tasks.id`, `task_runs.id`, `current_run_id`, claim token, worker PID/start stamp. `claim_task → _claim_and_open_run` CAS opens attempt; `_end_run` stamps terminal outcome under `ended_at IS NULL`. Distinct subsystem, not what generic `AIAgent.task_id` means. Identity comparison only; dispatcher not audited here. [work] |

## Six concrete traces — M unless R explicitly named

### T1 — Ingress → routing/auth guards → volatile acceptance

- **Entry:** `GatewayInboundMixin._handle_message(event) → _hm_admit_event`. Reset inherited session ContextVars; canonicalize multiplex identity; reject unserved explicit profile route; drop ignored Slack channel; queue during startup restore. Human events then pass plugin pre-dispatch, authorization, bot-loop gate. Internal events bypass human auth here; startup-resume path separately rechecks current owner authorization. [ingress], [startup]
- **Guard:** busy-session path still behind admission. Emergency stop / external drain / concurrent-session capacity can reject new turns. Claim pending-agent sentinel and run generation before remaining awaits; replacement turn cannot be released by stale predecessor’s `finally`. [ingress]
- **State/effect:** route resolves `session_key → session_id`; `_enqueue_fifo` stores `MessageEvent` in adapter RAM slot or conversation overflow list, stamps `_gateway_accepted=True`. Ordinary queue-mode follow-ups use FIFO; compatible photo bursts merge. Queue-cap branch logs and drops. [queue]
- **Receipt:** `None`, busy notice, or in-process acceptance marker is **not durable prompt admission receipt**. Actual user transcript persistence occurs inside agent turn after execution admission (T2). Gateway queues shown here do not constitute restart-replay inbox.
- **Adverse:** unavailable adapter can prevent enqueue; crash loses RAM backlog; marker-write failure logs/returns `False`, and `_hmwa_prepare_turn` ignores that return before loading history. Therefore crash-recovery coverage has best-effort gap. Unreadable transcript returns `history_unavailable`, not empty history. [queue], [gateway-turn], [ingress]
- **Controls / test reach:** `test_busy_session_auth_bypass.py` asserts unauthorized sender cannot queue, steer or interrupt active shared-thread agent; mocks auth, adapters and agent, directly invokes busy hook. It does not exercise real platform identity/auth backend or full cold ingress. Healthy path in source admits authorized sender; T2’s registry tests assert distinct sessions remain concurrent. [T-auth], [T-local]
- **The backend specialist extraction:** keep native `SessionV2.prompt` durable input admission and exact-retry rules. Plugin acceptance must cite native input/message ID; UI acknowledgment never substitutes for durable host receipt.

### T2 — Conversation execution → layered ownership → fenced transcript writes

- **Entry:** gateway `_hmwa_acquire_turn_lease` before history load; then `TurnFacadeMixin.run_conversation → admit_durable_turn_lease → SessionDB.acquire_session_turn_lease`. Gateway lock is asyncio/process-local, keyed by resolved session ID; durable lease covers cooperating CLI/Desktop/gateway writers. [gateway-turn], [local-lease], [facade], [durable-lease]
- **Guard:** SQL resolves compression-root lease key in same transaction as claim; explicit fork/reset/delegate edges stop ancestor walk. Holder includes PID, PID-namespace token, turn and platform. Claim/reclaim uses SQLite transaction; expired/dead-local owner can yield. Missing DB/ID, unsupported lease interface or persistence-disabled fork skips this protocol. [lease-sql], [durable-lease]
- **State/effect:** acquire before execution, even fresh rowless ID on `M`; after contention, reread row, resolve latest compression tip, reload history. Refresher maintains holder; lease loss hard-interrupts active turn. `_persist_turn_start` invokes persistence before first model call; batch append checks holder in same write transaction. Stale holder gets `SessionTurnLeaseLostError`; still-matching expired holder may renew atomically. [turn-context], [persist], [messages]
- **Receipt:** timeout returns `completed=False`, `failed=True`, `failure_reason="session_busy"`, `failure_retryable=True`, `error="session_turn_lease_timeout:<id>"`; provider loop not entered. Soft wait-interrupt carries never-persisted user input in returned history for follow-up; hard stop discards that carry. [durable-lease]
- **Adverse:** gateway-local `rebind` logs and retains old lock if rotated target already has live lease—explicit local fail-open edge. Durable holder fence supplies additional protection only where writers participate; ordinary append calls without holder/reject flag do not universally enforce turn lease. This is shared-SQLite coordination, not distributed placement/scheduling. [local-lease], [messages]
- **Controls / test reach:** `test_alias_key_turn_waits_and_order_is_preserved`, `test_distinct_sessions_do_not_contend`, timeout/reacquire tests exercise real asyncio registry with simulated work. `test_first_turn_on_fresh_session_serializes_a_second_writer` uses two real temporary SessionDB handles and threads, but replaces model loop. `test_flush_messages_to_session_db_fences_stale_holder_on_live_db` asserts stale-owner rejection and healthy-owner append through actual flush path. Neither reviewed test runs separate OS processes. [T-local], [T-cross]
- **The backend specialist extraction:** keep Session-ID-based native coordinator and generation-scoped finalization. Hermes lease details inform invariants; plugin should not add SQLite leases or process ownership above host.

### T3 — Cancellation → scoped stop → completion envelope

- **Entry:** `InterruptControlMixin.interrupt(..., hard_cancel, require_generation)` or `redirect(text)`. Interrupt publishes under redirect/activity locks; optional activity generation rejects stale watchdog observation before mutation. Hard stop respects compression commit fence. [interrupt]
- **Guard/state:** execution-thread and concurrent-worker interrupt bits scoped to owning agent; active children receive stop fan-out. Redirect during model request cancels request only; during tool work becomes steer. Late unconsumed steer returns as `pending_steer`. Lease teardown stops timers, joins, clears only its own interrupt, then releases ownership. [interrupt], [durable-lease], [finalizer]
- **Effect:** streaming `_abort_for_interrupt` sets request-local cancellation before socket abort; `_handle_stream_error` sees that bit and skips retry/fallback. Other transient transport errors follow separate classifier. Bounded worker join is cleanup attempt, not arbitrary Python-thread termination. [transport]
- **Receipt:** `finalize_turn` shapes missing assistant tail before persist, returns `final_response`, `messages`, `completed`, `failed`, `interrupted`, `turn_exit_reason`, usage, session ID, optional failure/cleanup fields. `chat()` returns only text and discards this distinction. `completed` excludes interrupted/failed turns and most budget-exhaustion exits. [finalizer], [facade]
- **Adverse:** finalizer preserves answer even when cleanup/persistence raises, exposing `cleanup_errors`; nonempty text is not durable-storage acknowledgment. `on_session_end` hook fires per finalized turn here, so hook name is not proof conversation ended. Returned completion also precedes gateway delivery acknowledgment (T5).
- **Controls / test reach:** `test_cascading_interrupt` invokes actual HTTP-call helper with mocked request clients/forced transport error; cancellation case expects one create and `InterruptedError`, not real provider/socket cancellation. Final-response tests inspect real finalizer with FakeAgent; delayed-SQLite case uses actual SessionDB replacement to check timestamp preservation. Cleanup tests inject persistence failure and compare healthy no-error turn; assertions preserve answer while budget completion stays false. [T-cancel], [T-final], [T-cleanup]
- **The backend specialist extraction:** distinguish cancellation request, observed terminal state, durable result, delivered result, and verified work outcome. Bind late callbacks to native attempt/generation; preserve partial artifact refs without declaring success.

### T4 — Plugin launch → parent/capability guard → child result

- **Entry:** `PluginContext.subagent_lifecycle → SubagentLifecycleService.launch(SubagentLaunchRequest)`. Resolver must yield active bound parent; validates goal/context/metadata sizes, matching parent, supported settings, toolset narrowing. Duplicate `(parent_session_id, correlation_id)` rejected while retained. [D5], [child-api]
- **Guard/state:** `_build_child_preserving_parent_tools → _build_child_agent` allocates distinct child session, parent linkage and `_delegate_from`; fresh independent iteration budget, own DB ownership handle, attach to parent interrupt chain. Actual role is **depth/config-derived**; request’s `role` does not directly grant/restrict child depth. [child-build]
- **Effect:** process-local registry + daemon executor runs `_run_child_lifecycle → _run_single_child → _finalize_child_results`; child cleanup in `finally`, parent aggregation serialized. Handle carries version, subagent/parent IDs, correlation, creation time, model/provider, role/depth, HMAC capability. `_record` verifies capability and currently resolved parent identity. [child-api], [child-lifecycle]
- **Receipt:** `launch` returns handle, `wait(timeout)` can return incomplete/timed-out without stopping work, `cancel` returns `CANCEL_REQUESTED`; terminal result appears later. Result clips summary/error fields to 32k characters, omits transcript/reasoning fields, computes hash. Forged/wrong-parent handle becomes `UNKNOWN_HANDLE`; post-restart lookup becomes `RECONNECT_UNAVAILABLE`, never replacement launch.
- **Adverse:** terminal metadata retained in process; one-hour cleanup is lazy at later launch. Serialized capability does not survive process-secret/registry loss. Correlation check and insertion use separate registry critical sections, with child construction between and no recheck: concurrent same-key launches can both pass (source-level race, not experimentally reproduced). Construction’s separate lock does not reserve correlation. Frozen result dataclass does not deeply freeze nested mappings. [child-api], [child-lifecycle]
- **Completion loss:** `_build_result_entry` labels usable budget-exhausted output `status="completed"`, with `truncated=True` / `exit_reason="max_iterations"`; shared finalization preserves status. Public lifecycle `_run` maps that status to `SUCCEEDED` but drops those two fields. Therefore `SUCCEEDED` can mean usable partial summary, not fulfilled work contract. [child-result], [child-lifecycle], [child-api]
- **Controls / test reach:** lifecycle tests fake child construction and execution, exercise actual service executor/cancel/HMAC-parent checks, host aggregation hooks/cost rollup, and facade parent binding. Assertions cover contract wiring; reviewed cases do not exercise real model children, process restart, concurrent correlation race, or exhausted-budget mapping. [T-child]
- **The backend specialist extraction:** expose thin capability-scoped native-child handle; preserve raw terminal reason, partial/truncated and evidence fields. Retry must reconcile native work identity, not launch another child because reconnect failed.

### T5 — Crash marker → recover-or-deliver guard → bounded outbox receipt

- **Entry:** `SessionStore.mark_turn_active` saves opaque token + aware-UTC start before publishing in memory. `clear_turn_active(key, token)` CAS prevents old unwind clearing replacement. Current routing metadata primary is SQLite `gateway_routing`; `sessions.json` legacy import/mirror. [markers], [routing]
- **Normal effect:** adapter `send_final_ledgered` records obligation and `attempting` before send; successful ledger acquisition releases active-turn marker. `_finalize_delivery_obligation` uses transport `SendResult.success` for `delivered`/`failed`. Stable obligation key hashes lane, inbound message reference and content. [delivery], [ledger]
- **Restart guard:** clean-shutdown receipt discards orphan markers before unlink; unclean startup first classifies marked transcript tail. Reply after marker start → ledger stored reply, no new generation; no reply → `resume_pending`. Unmarked recently active session untouched. Suppressed internal silence clears marker without sending. [startup], [markers]
- **Resume effect:** fresh eligible marker + connected adapter + currently authorized owner + no running slot → claim sentinel, synthesize internal event, run existing conversation. Ledger claims clear resume flags before auto-resume scheduling. Breaker skips automation for current boot, retains pending state. This can retry provider work; it is not instruction-pointer/process checkpoint restoration. [startup]
- **Receipt:** outbox states `pending → attempting → delivered/failed`, later `abandoned`; redelivery visibly warns possible duplicate. Startup claim checks process ownership and deliverable platform/profile; attempt budget not spent on missing adapter. Defaults: 3 recovery attempts, 24-hour stale cutoff, bounded retention/pruning. [ledger]
- **Adverse:** platform accepted/send-ACK-lost window remains at-least-once. Ledger recording/finalization best-effort; disabled ledger or write failure weakens guarantee. Slash/ephemeral replies excluded. General send record uses `INSERT OR REPLACE`, resetting state/attempts on same key; do not treat hash alone as monotonic exactly-once receipt. Fresh marker without persisted input can only resume stored history, not reconstruct vanished prompt. [delivery], [ledger]
- **Controls / test reach:** active-turn tests use real temp SQLite/SessionStore: unmarked answered chat stays idle; marked unanswered chat resumes; persisted unledgered answer becomes outbox row; human silence-marker gets notice while internal silence suppressed. They call recovery methods directly, not SIGKILL/restart a gateway. Ledger tests use real DB plus forged orphan owner: live-owner exclusion, second-claim exclusion, missing-platform budget retention and later healthy claim. No real platform send guarantee. [T-recovery], [T-ledger]
- **The backend specialist extraction:** project existing native obligation/result states; separate “execution unfinished” from “result exists, delivery owed.” Orchestra advisory wakes must not become Hermes-style implicit post-crash provider retry. Recovery needs explicit native design.

### T6 — Persistence failure → damage-class guard → recoverable evidence

- **Entry:** agent batch flush → `SessionDB.append_messages_batch → _execute_write`. `BEGIN IMMEDIATE`, commit/rollback, jittered lock retry; callback settlement uncertainty is not unconditional retry permission. [persist], [messages], [db]
- **Guard/effect A:** FTS-scoped corruption → `_enter_fts_fail_open`: atomically set durable `fts_stale`, drop sync triggers, retry canonical write; searches degrade to LIKE. Live failure path does not perform full-index rebuild. [fts]
- **Guard/effect B:** bare structural corruption → `_halt_db_corrupt`, typed `StateDbCorruptError`, sticky profile/handle quarantine, stop later writes and explicit close checkpoint. Agent diverts pending batch to JSONL; diversion itself can fail and only logs. Offline repair/recovery uses guarded maintenance path per docs, not live model turn. [db], [persist], [D6], [D7]
- **Receipt:** successful canonical append versus explicit persistence failure/diverted evidence; index availability is separate state. WAL checkpoint means SQLite page maintenance, not completed task or resumable model execution.
- **Compression checkpoint distinction:** `compress_context` defaults to in-place compaction; `archive_and_compact` atomically archives old generation and preserves concurrently appended/uncovered rows through coverage/watermark logic. Optional rotation publishes child lineage. `compression.checkpoint_required` instead demands memory-provider pre-compress API v2 and blocks unsupported/failing checkpoint; finalizer disables micro-compaction under that requirement. This is pre-loss evidence boundary, not Python stack/tool-side-effect rollback. Atlas implementation internals outside R24. [compression], [messages], [finalizer]
- **Controls / test reach:** quarantine test injects malformed-connection error over real DB, checks fail-fast and no explicit checkpoint; healthy contrast corrupts actual FTS shadow bytes and expects canonical append with stale index, not whole-store quarantine. Python 3.12 close-configuration case explicitly skips when SQLite API unavailable. Checkpoint contract tests use stub providers plus real DB reopen for summary marker; micro-compaction test compares armed/off gate with recording compressor. No disk-fault/power-loss durability proof. [T-corrupt], [T-checkpoint]
- **The backend specialist extraction:** keep transcript canonical in host. Distinguish unavailable/unknown from empty; surface typed storage/recovery capability failure. Atlas checkpoint integration, if supported, records evidence references through existing boundary; never makes Atlas another session store.

## Release versus main; docs versus executable paths

| Claim | Source-grounded correction |
|---|---|
| Both pins have durable turn leases | True, but `R` skips lease when session row absent; `M` leases rowless client-addressed ID, probes after admission, reloads after DB contention too. Do not attribute fresh-ID fix to v0.21.5. [R-lease], [durable-lease], [T-cross] |
| Child lifecycle new on main | False for reviewed implementation: exact same blob at both pins. Capability handles, process-local results and reconnect limitation already in release. [R-child], [child-api] |
| Recovery markers/outbox only on main | Release `run_startup.py` already has `_recover_unclean_sessions`, `_ledger_crash_left_replies`, owner reauthorization and restart-loop guard. Detailed traces here use `M`; surrounding runtime not assumed identical. [R-startup] |
| Lifecycle docs: JSON map storage, idle/daily-reset diagram, 3+ restarts → suspension | `M` routing DB is primary; `_route_reset_reason` returns suspension only. Reviewed startup breaker skips current boot rather than documented forced reset. Docs also contain correct explicit-boundary prose, so page is internally mixed. [D4], [routing], [markers], [startup] |
| Agent-loop docs: compression generates child ID; interrupt abandons/discards response | In-place compaction default keeps ID; optional rotation remains. Request-local socket abort and visible-text redirect checkpoint exist; simplistic docs diagram insufficient for cancellation/recovery contract. [D2], [compression], [interrupt], [transport] |
| FIFO/exact retry/completion imply durable work success | Gateway FIFO is process-local; lifecycle duplicate correlation rejected, not reconciled; child `SUCCEEDED` may hide truncated outcome; delivery explicitly at-least-once. Preserve separate receipts. |

## Efficiency, costs and limits

- Reuse stable prompt/history prefix; reload only after contention when possible. Per-message intrinsic persisted marker + flush cursor avoids rewriting whole transcript; logical UIDs protect identity across compaction. Added cost: lease acquisition/release, ancestry lookup, periodic refresh, durable marker/outbox writes. [durable-lease], [persist]
- Durable lease defaults 300s TTL / 60s refresh / 1800s wait; gateway-local lease default wait 5s and soft registry cap 512, preserving held/waited entries. Shared periodic scheduler replaces per-turn timer threads; waiting still consumes caller/worker capacity. These are source constants, not measured latency. [durable-lease], [local-lease]
- Public lifecycle executor has 8 workers; child objects built before submission, accepted backlog not hard-bounded by that worker count. Results’ one-hour lazy retention bounds age only when cleanup runs; many queued/live children still consume resources. Independent child budgets allow aggregate spend above parent cap. [child-api], [child-build]
- Derived-index degradation preserves transcript path but LIKE search costs more; explicit rebuild and WAL maintenance can contend with writers. Never interpret storage docs’ “nothing is lost” as universal guarantee: durable admission gaps, failed diversion and external effects remain separate. [fts], [D7]
- No benchmark numbers, observed throughput, provider cancellation latency, or fleet reliability established. Source-defined bounds and qualitative overhead only.

## The backend specialist mechanisms worth extracting

| Priority | Small mechanism | Existing owner / boundary |
|---|---|---|
| P0 | Native ID tuple: session, admitted input, child, optional work + attempt, generation; environment names resolved once to bindings | Orchestra owns session/input IDs; Maestro adapter supplies native work/attempt IDs when present. |
| P0 | Receipt ladder: admitted, running, cancel-requested, terminal, persisted, delivered, verified; partial and unknown explicit | Plugin projects native events/results. Completion prose never closes Maestro work by itself. |
| P0 | Generation-qualified cancellation/cleanup; observe terminal result before claiming stopped | Existing host execution ownership. No second coordinator or PID registry. |
| P1 | Recovery classification: absent result versus persisted result awaiting delivery; exact retry reconciliation | Existing host journal/store APIs and explicit recovery policy. No plugin outbox DB, timer or auto-resume scheduler. |
| P1 | Bounded child request/result, parent-scoped authority, artifact refs, precise failure/truncation reason | Native child-session API; unsupported reconnect/cancel capability returns typed unsupported/unknown, not replacement launch. |
| P2 | Checkpoint capability negotiation and non-destructive context-boundary evidence | Atlas remains shared Knowledge/Memory; host retains transcript and execution. Unsupported checkpoint blocks only operation requiring it. |

Acceptance cases for later implementation: same native input exact retry versus conflicting reuse; two lanes sharing session versus distinct sessions; late old-generation finish versus valid current finish; cancel-requested versus observed cancelled; complete-but-undelivered versus unfinished; reconnect unavailable versus healthy reconnect; storage unavailable versus genuinely empty; truncated child summary versus verified work. These are proposed backend specialist cases, not tests added or run in R24.

## Pinned evidence index

[site]: https://hermes-agent.nousresearch.com
[release]: https://github.com/NousResearch/hermes-agent/releases/tag/v2026.9.24
[release-commit]: https://github.com/NousResearch/hermes-agent/commit/f97608f178d1ffeca59860195ab7da295f7c8e5f
[main-commit]: https://github.com/NousResearch/hermes-agent/commit/d795726f78e532ca31655f74656b4be63a907581
[D1]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/architecture.md
[D2]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/agent-loop.md
[D3]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/session-storage.md
[D4]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/gateway-session-lifecycle.md
[D5]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/subagent-lifecycle-api.md
[D6]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/state-db-recovery.md
[D7]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/user-guide/session-storage-recovery.md
[ingress]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/run_inbound.py
[identity]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/session.py#L653-L750
[routing]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/session_persistence.py#L214-L522
[sessions]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_state_sessions.py
[message-identity]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_state_identity.py#L1-L96
[queue]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/run_busy.py#L100-L425
[gateway-turn]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/run_turn.py#L2047-L2239
[local-lease]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/turn_lease.py
[facade]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/turn_facade.py
[durable-lease]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/turn_facade_lease.py
[lease-sql]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_state_compression.py#L539-L682
[turn-context]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/turn_context.py
[persist]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/session_persistence.py#L290-L513
[messages]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_state_messages.py
[interrupt]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/interrupt_control.py
[transport]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/chat_completion_helpers.py#L3683-L4102
[finalizer]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/turn_finalizer.py
[child-api]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/subagent_lifecycle.py
[child-build]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/delegate_tool.py#L190-L329
[child-result]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/delegate_tool_child_run.py#L552-L624
[child-lifecycle]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/delegate_tool_results.py#L300-L410
[markers]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/session_lifecycle.py
[startup]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/run_startup.py#L292-L796
[delivery]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/platforms/base.py#L4246-L4409
[ledger]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/delivery_ledger.py
[db]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_state.py#L993-L1558
[fts]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_state_fts.py#L347-L426
[compression]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/conversation_compression.py#L2972-L4307
[work]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_cli/kanban_db.py#L2027-L2373
[R-lease]: https://github.com/NousResearch/hermes-agent/blob/f97608f178d1ffeca59860195ab7da295f7c8e5f/agent/turn_facade_lease.py#L221-L317
[R-child]: https://github.com/NousResearch/hermes-agent/blob/f97608f178d1ffeca59860195ab7da295f7c8e5f/agent/subagent_lifecycle.py
[R-startup]: https://github.com/NousResearch/hermes-agent/blob/f97608f178d1ffeca59860195ab7da295f7c8e5f/gateway/run_startup.py#L531-L790
[T-auth]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/gateway/test_busy_session_auth_bypass.py#L59-L193
[T-local]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/gateway/test_turn_lease.py#L42-L217
[T-cross]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_cross_process_turn_lease.py#L237-L818
[T-cancel]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_cascading_interrupt.py#L37-L140
[T-final]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_turn_finalizer_final_response_persistence.py#L7-L273
[T-cleanup]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_turn_finalizer_cleanup_guard.py#L108-L169
[T-child]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_subagent_lifecycle.py#L19-L180
[T-recovery]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/gateway/test_active_turn_recovery.py#L183-L543
[T-ledger]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/gateway/test_delivery_ledger.py#L23-L720
[T-corrupt]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/hermes_state/test_state_db_corrupt_quarantine.py#L24-L188
[T-checkpoint]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_pre_compress_checkpoint_contract.py#L263-L538
