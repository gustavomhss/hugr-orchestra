# R21 — OpenClaw identity, version, runtime/session lifecycle

Research date: 2026-10-03. Static source analysis; tests inspected, **not executed**. Scope: OpenClaw runtime slice for Charlie architecture research. Hermes comparison belongs to separate research.

**Recommendation:** transfer identity, durable admission, owner fencing, cancellation, and completion contracts through native OpenCode/Orchestra capabilities. Charlie remains independent plugin; optional Maestro uses same contracts; shared Atlas holds knowledge/memory with native source provenance. Only specialist public labels are configurable; Maestro remains fixed; native IDs stay stable. Host owns execution, scheduling, transcript, and input persistence.

## Version verdict — official “2.0” positively identified

| Evidence | Verified fact |
|---|---|
| [Official blog, “OpenClaw 2.0, Accidentally”][V1] | Dated Aug 30, 2026; explicitly links announcement to release `2026.8.1`. Describes installation/browser rebuild expanding into broader platform update. |
| [Official release documentation][V2] | Exact title: **“v2026.8.1 (AKA OpenClaw 2.0)”**. “2.0” is product/release nickname mapped to date-versioned release, not evidence for a `v2.0.0` source baseline. |
| [GitHub release API, `v2026.8.1`][V3] | `name: OpenClaw 2026.8.1`; `published_at: 2026-08-31T03:30:51Z`. Blog date and GitHub publication timestamp describe different artifacts. |
| [Launch source commit][V8] | Commit API for `v2026.8.1` returned `ea806575e6450e4d1efdfc72c19f04be982a1b9b`, committed `2026-08-30T23:53:40Z`. Two mechanisms verified below at this exact source. |
| [Latest-release API][V4] / [tagged release][V5] | Observed latest: `v2026.9.8`, published `2026-10-03T03:21:47Z`. Release body names SHA `fc23bc864e4553c2d215e479eeec47b67a0bf943`; commit API for tag independently returned same SHA. |
| [Pinned main commit][V6] | `06da0de86c0a27dc1e92995f9d0a2428880ce90c`, committed `2026-10-03T21:39:40Z`. Later than release source. [Package metadata][V7] still says `2026.9.8`; package version alone cannot distinguish builds. |

Official nickname ambiguity resolved. **Launch verification covers only two mechanisms in following table. Sections 1–6 remain later-main audit at `06da0de…`; they do not collectively describe launch.** Latest `2026.9.8` source parity and remaining launch mechanisms remain unverified. Official release docs establish release identity/context; pinned source establishes implementation.

### Launch versus later — bounded two-mechanism verification

Comparator: launch [`ea806575…`][V8] versus later main [`06da0de86…`][V6]. [Official 2.0 release index][V2] explicitly describes sessions/transcripts moving into SQLite and accepted messages surviving managed restarts. Those broad release descriptions do not establish every later retry or completion guarantee.

| Mechanism | Verified at launch `v2026.8.1` | Explicit comparison to later pin |
|---|---|---|
| **Session SQLite storage/admission** | [`chat-restart-recovery.ts::resolveRestartSafeChatAdmission`][LA2] gates eligible idle native sessions. [`chat-send-handler.ts::handleChatSendWithOptions`][LA1] awaits transcript persistence, requires `status:"running"` plus matching `restartRecoveryDeliveryRunId`, then ACKs `started`. [`session-accessor.sqlite-transcript-turn.ts::appendExpectedSessionTranscriptTurn`][LA3] rechecks expected row and writes transcript + lifecycle patch in same SQLite transaction. Separate [`session-accessor.pending-inputs.ts::stageSessionPendingInput`][LA4] stores hashed, approved input in `session_pending_inputs`, outside active transcript. | Later §2 [handler][A1] explicitly calls `stageApproved` before ACK for ordinary visible existing-session input. Later [accessor][A4] supports consumed-input receipts and guarded matching queued/interrupted re-admission across lifecycle changes; [worker kernel][A5] rechecks exact snapshot transactionally. Launch accessor instead rejects existing interrupted/non-live custody with `"Pending input ownership ended; submit a new turn to continue"`. Launch SQLite presence does not imply later reconnect contract. |
| **Terminal-result observation** | [`agent-wait.ts::agentWaitHandler`][LF1] → [`agent-turn-service.ts::waitForTurn`][LF2] → [`agent-job.ts::waitForAgentJob`][LF3]. Launch already returns timing, stop reason, `yielded`, `terminalDelivery`, `terminalReceipt`, and `terminalReply`. Active chat controller selects `source:"chat"`; otherwise `getCanonicalAgentRunSnapshot` can return `dedupe ?? lifecycle`, so unscoped agent observation can finish from lifecycle alone. | Later §6 [wait preparation][F3]/[job tracker][F4] use agent-or-chat source-specific replay-publication barrier, execution-settlement handling, and session-bound evidence merge. Launch missing snapshot infers `gateway_draining` when captured abort entry exists, otherwise `queue`/`providerStarted:false`; later ordinary missing snapshot returns only `{runId,status:"timeout"}`. These are concrete path differences, not whole-runtime parity claims. |

- **Launch adverse evidence, source only:** [`session-accessor.pending-inputs.test.ts`][LAT], lines 76–134, rejects changed same-ID input and uses SQLite trigger failure to assert transcript promotion/custody consumption roll back together; lines 153–199 reject closed custody reuse and mark lifecycle-rotated custody interrupted without replay.
- **Launch terminal evidence, source only:** [`agent-wait-dedupe.test.ts`][LFT], lines 115–136, allows fresh wait to observe completion after prior wait timeout; lines 198–260 preserve timeout status alongside final reply/delivery receipt regardless of event order. Tests inspected, not run.
- **Transfer boundary:** durable admission and separate terminal evidence existed at 2.0 launch. Broader pre-ACK staging, reconnect adoption, source-publication barrier, and detailed cancellation/recovery rules in later audit require their own version scope; this follow-up verifies only table’s two mechanisms.

## 1. Identity: explicit route scope; address distinct from execution ownership

- **Entrypoint:** [`src/routing/resolve-route.ts::resolveAgentRoute`][I1] receives configured agents/bindings plus channel, account, peer, parent peer, guild/team, and roles.
- **Decision:** ordered binding precedence: exact peer → parent peer → peer wildcard → guild+roles → guild → team → account → channel → default. Candidate still must match compound scope. `pickFirstExistingAgentId` validates selected roster identity; ambiguous default resolution can throw. Explicit legacy `main` has compatibility treatment.
- **State/effect:** `choose` → `buildAgentSessionKey` → [`src/routing/session-key.ts::buildAgentPeerSessionKey`][I2]. Default direct-message scope collapses into agent main session. Optional scopes encode peer, channel+peer, or account+channel+peer; declared `identityLinks` can merge direct identities. Group scope normally partitions groups; optional main scope collapses them. Routing computes address, not transcript creation.
- **Returned evidence:** route carries `{agentId, channel, accountId, sessionKey, mainSessionKey, lastRoutePolicy, matchedBy}`. `sessionKey` is persistence/concurrency address; stored `sessionId`, `lifecycleRevision`, per-run identity, and process `lifecycleGeneration` perform different jobs—see writer/cancellation paths below.
- **Adverse path/test source:** `resolveAgentIdFromSessionKey("agent::secret", "primary")` throws `"Malformed agent session key; refusing default-agent resolution."` [Tests][I3] assert malformed qualified keys cannot fall through to default; qualified `agent:ops:incident-42` and `agent:research:incident-42` do not compare equal by request key. Opaque Matrix/Signal identifiers have preservation tests; lowercasing everything is not portable.
- **Charlie transfer:** resolve configurable specialist public labels to stable host agent/session IDs once; carry principal/project scope explicitly. Same Session ID adopts same native Session. Atlas provenance uses stable source IDs, never public label. Renaming specialist label must not rekey history. Maestro remains fixed; Atlas is shared native Knowledge/Memory, outside specialist-label configurability.
- **Failure scenario / rejected baggage:** two users’ DMs accidentally share one main conversation, or same short alias crosses agent boundary. Adopt explicit scope contract; reject default cross-user collapse, channel-specific key grammar, and routing-cache machinery unless actual channel integration needs them.

## 2. Admission: durable input custody before ACK; execution happens later

- **Entrypoint:** [`src/gateway/server-methods/chat-send-handler.ts::handleChatSendWithOptions`][A1] → [`chat-send-setup.ts::prepareAndAdmitChatSend`][A7] → [`chat-send-admission.ts::admitChatSend`][A2]. Admission reserves lifecycle and registers cancellation before awaited attachment preparation.
- **Decision:** admission rechecks request identity, current session incarnation, lifecycle generation, expiry, permissions/settings, and current target under writer admission. Steer/interrupt capture exact current owner. Queueing behind reset cannot silently retarget replacement session.
- **Durable path:** ordinary visible external input into existing session, excluding internal slash commands/Goal operations, calls `userTurnRecorder.stageApproved` before ACK. [`src/sessions/user-turn-transcript.ts::createUserTurnTranscriptRecorder`][A3] delegates to [`session-accessor.pending-inputs.ts::stageSessionPendingInput`][A4]. Other input classes retain specialized paths; this is not a universal ACK guarantee for every RPC.
- **Commit guard/effect:** `stagePreparedPendingInput` matches request hash/run ID, rejects live duplicate custody, and returns consumed receipt for already-consumed input. [`session-pending-input-operations.kernel.ts::mutatePendingInput`][A5] rechecks session ID and exact read snapshot inside write transaction, crosses admission guard, then inserts/updates `session_pending_inputs` with `state: "queued"`, request hash, approved message bytes, run ID, and lifecycle generation. Staging itself neither edits active transcript nor schedules execution.
- **Returned evidence:** handler requires successful stage; otherwise throws `"Chat input was not durably admitted; refresh and retry."` ACK is `{runId, status:"started", messageSeq?}` before detached `startChatDispatch`. `messageSeq` exists only when recorder attests transcript placement. `started` alone does **not** prove provider started, transcript consumption, or completion. Consumed replay returns cached `status:"ok"` without dispatch.
- **Adverse test source:** [pending-input tests][A6], lines 501–592, inject custody-write failure: assert error response, no dispatch, unchanged transcript, then successful same-ID retry. Approval-time cancellation, process rotation, and session replacement prevent ACK/commit. Lines 594–637 clear transient dedupe cache and retry consumed collected input: assert durable replay, no new dispatch.
- **Charlie transfer:** use native durable prompt admission and same immutable message/input identity for exact retries; conflicting reuse must fail. Expose accepted/pending separately from promoted/running. Preserve Orchestra default `steer` and explicit `queue` semantics, including native safe-boundary promotion; OpenClaw mode names are not semantic equivalence.
- **Failure scenario / rejected baggage:** browser loses ACK, retries, executes same request twice—or receives ACK before failed custody write. Reuse host inbox and receipts; reject plugin outbox database, collector, second queue, or copied OpenClaw approval pipeline.

## 3. Turn ownership: lane serialization plus durable writer fence

- **Entrypoint:** [`src/agents/embedded-agent-runner/run-orchestrator.ts::runEmbeddedAgent`][Q1] derives session/global lanes, then `enqueueSession` → deferred transcript-maintenance checkpoint → `enqueueGlobal`.
- **Decision:** [`run/lane-controller.ts::createEmbeddedRunLaneController`][Q2] rechecks abort, lifecycle, and placement after queue wait, before context/hooks execute. [`src/process/command-queue.ts`][Q3] checks per-lane/group capacity; ordinary session lane defaults to concurrency one. Admission increments active task identity before callbacks can reenter queue.
- **Durable state:** global admission calls [`run/session-bootstrap.ts::claimAgentSessionWriter`][Q4]. Existing row must retain expected `sessionId` and `lifecycleRevision`; `updateSessionEntry` persists `activeWriterRunId`. Only after successful claim does replacement emit predecessor’s superseded outcome and cancel predecessor. Returned `{expectedLifecycleRevision, expectedWriterRunId}` travels with transcript target.
- **Commit fence:** [`session-accessor.sqlite-transcript-write.ts::withTranscriptWriteLock`][Q5] invokes [`session-accessor.sqlite-transcript-write-guard.ts::assertLockedTranscriptWriteAllowed`][Q6] inside synchronous SQLite transaction, before/after guarded append/rewrite. Fresh row and expected owner must match; stale writer gets `SessionTranscriptWriterClaimReboundError` / `session-rebound`.
- **Returned evidence:** queue resolves task result or rejects; claim returns fenced target, not permission for unrelated writes. Queue generation/task markers also reject stale completion bookkeeping after reset. Timeout can release lane while old task still unwinds; serialization alone therefore cannot fence late effects. This traced guarantee covers owned transcript writes, not arbitrary external API side effects or distributed execution.
- **Adverse test source:** [`lane-controller.writer-claim.test.ts`][Q7], “supersedes the live prior writer, claims the row, and rejects its late append,” asserts durable claim precedes superseded event/cancel and both stale SessionManager/direct append fail. “leaves the incumbent live when the replacement claim does not commit” injects claim failure and asserts old writer remains authoritative. [Queue cancellation tests][Q8] assert pending cancellation preserves priority/FIFO and does not cancel already-admitted task through queue listener.
- **Charlie transfer:** host Session coordinator remains single turn owner. Attach work/observations to native session/input identity and current host owner token where exposed; validate after awaits. Native host—not plugin—must enforce stale-write fence if extension can persist anything.
- **Failure scenario / rejected baggage:** provider A ignores abort; B starts; A emits late transcript after B. Host fence rejects A. Reject duplicated lane scheduler, global writer registry, SQLite ownership layer, or durable identity for Orchestra’s process-local drain. Drain has no durable identity/transcript boundary.

## 4. Cancellation: captured owner, current authority, durable acknowledgment

- **Entrypoint:** [`src/gateway/server-methods/sessions-abort.ts::sessionAbortHandlers["sessions.abort"]`][C1] validates params and resolves requested run/session/agent against active registries and stored target. Unknown agent mismatches fail; missing active run can return successful `status:"no-active-run"`, `abortedRunId:null`.
- **Decision:** capture session incarnation, lifecycle revision/generation, and exact active controller. [`chat-abort-handler.ts::handleChatAbortRequestWithLifecycle`][C2] rechecks requester/target authority and exact controller object plus agent/session fields after awaited descendant work. Changed target throws `"Run changed before cancellation; retry Stop."`; stale request does not adopt successor registration.
- **Effect:** signal captured owner; persist partial output through captured transcript target; record cancellation lifecycle with `expectedWriter:{runId,sessionId,lifecycleRevision}`. `clearQueued` is explicit request policy, not implicit consequence of cancelling one run.
- **Returned evidence:** `sessions.abort` awaits `settleAbortPersistence` → `waitForChatAbortTerminalPersistence` before final success. Embedded-only owner path likewise awaits its lifecycle write. Descendant/persistence errors remain errors; cancellation acknowledgment is not rollback of already-completed tools.
- **Adverse test source:** [`chat.abort-currentness.test.ts`][C3], lines 258–286, replaces active and pending registrations synchronously during first abort; asserts replacement remains untouched and only original first run reported. Lines 289–344 revoke source/target authority and assert no cancellation. [`chat.abort-persistence.test.ts`][C4], lines 351–407, rejects stale session partial and changed lifecycle revision even without Session ID rotation; transcript stays unchanged.
- **Charlie transfer:** delegate Stop to native session interruption, preserve exact target correlation, distinguish no-active/stale/error from cancelled. Reconnect must read host terminal outcome; UI click or local aborted promise is insufficient evidence.
- **Failure scenario / rejected baggage:** delayed Stop for A arrives after retry B adopted same address; broad “find whatever runs here” kills B. Reject plugin-owned AbortController registry, recursive child-killer, or clearing unrelated session work by display name.

## 5. Restart/recovery: durable claim, bounded failed starts, ambiguity preserved

- **Entrypoints:** [`main-session-restart-recovery-marking.ts::markRestartAbortedMainSessions` / `markStartupOrphanedMainSessionsForRecovery`][R1] mark captured interrupted owners or orphaned running rows. Startup rechecks live run/foreground/yielded ownership in write guard; row saying `running` alone is insufficient.
- **Selection:** [`main-session-restart-recovery-runtime.ts::recoverRestartAbortedMainSessions`][R2] → [`main-session-restart-recovery-store.ts::recoverStore`][R3]. Candidate checks exclude subagent/cron/ACP session classes, current-process owners, disallowed session work, active reservations/foreground claims, and tombstones. Runtime aggregates `{started,settled,failed,skipped}`; these are recovery outcomes, not user-task success counts.
- **Durable decision:** [`main-session-recovery-store.ts::commitMainSessionRecovery`][R4] applies [`main-session-recovery-state.ts::transitionMainSessionRecovery`][R5] under session write admission. `prepare_attempt` verifies session/cycle/revision, charges attempt, and records run/generation reservation before dispatch.
- **Exact budget:** `getMainSessionRecoveryRetryCount = chargedAttempts - (startedAttempt ?? 0)`; [constant][R6] `MAX_RECOVERY_RETRIES = 3`. `register_recovery_turn` advances `startedAttempt` without resetting charge counter. Thus bound is failed starts **since last runtime start**, not strict lifetime limit of three continuations. [Pinned restart docs][R10] say “each interrupted main-session cycle has a durable budget of three charged automatic dispatch attempts”; source gives more precise semantics.
- **Execution/evidence:** [`main-session-restart-dispatch.ts::resumeMainSession`][R7] revalidates session and authority, persists stable recovery dispatch ID, then enters ordinary agent dispatch with that ID as idempotency key and retained source correlation. Synthetic continuation asks model to inspect transcript and reconcile unknown tool outcomes. Function returns `started`, `settled`, `skipped`, or `failed`; accepted-but-unstarted dispatch is not counted as started execution.
- **Adverse decisions:** explicit pre-acceptance Gateway rejection cancels reservation/refunds charge; ambiguous transport result abandons reservation/retains charge and probes terminal state before retry. Exhaustion or missing required message-action authority tombstones. [`resolveMainSessionResumePolicy`][R9] forces safe continuation for unknown terminal delivery; **not universal read-only recovery**—Full Access and replay classification affect policy. Missing result never establishes successful external effect.
- **Adverse test source:** [restart recovery tests][R8], lines 2032–2050 assert refund on explicit refusal; 2094–2127 simulate completed recovery with lost response and assert settled without rerun; 3660–3685 assert exhausted recovery tombstone; 4329–4351 assert unknown terminal provider outcome forces safe continuation. Transport is mocked in these tests; assertions were read, not run.
- **Charlie transfer:** smallest current algorithm is native-state reconciliation: reconnect → inspect admitted input/transcript/terminal receipt → retire consumed retry or retry exact unconsumed admission under current authority. If execution outcome remains unknown, expose interrupted/unknown and use explicit native continuation policy.
- **Failure scenario / rejected baggage:** external send succeeded, process crashed before receipt; blind restart replay sends twice. Reject automatic synthetic resume/model loop, shadow retry budget, recovery scheduler, and recovery store inside Charlie. Orchestra guidance explicitly separates advisory inbox wakes from post-crash provider continuation; this OpenClaw machinery is a future **host design reference**, not permission to add automatic recovery in plugin.

## 6. Actual completion: execution settlement, replay publication, delivery are distinct

- **Producer:** [`src/auto-reply/reply/agent-lifecycle-terminal.ts::createAgentLifecycleTerminalBackstop`][F1] separates `capture` from `emit`; retry can replace captured candidate. `emit` publishes `executionSettled:true`. `finishing`, assistant text, or captured result alone does not establish final execution.
- **Entrypoint:** [`src/gateway/server-methods/agent-wait.ts::agentWaitHandler`][F2] → [`src/gateway/agent-turn/agent-wait.ts::prepareAgentWaitForTurn`][F3] → [`agent-job.ts::waitForAgentJob`][F4]. Handler checks current visibility/session binding before and after await.
- **Decision/state:** `agent-job.ts` stores lifecycle and RPC-source terminal snapshots separately. `getCanonicalAgentRunSnapshot` refuses RPC-source completion until that source’s replay payload has been published. `setGatewayDedupeEntry` treats accepted/started states as active; terminal outcome merge preserves sticky cancellation/hard timeout. Companion reply evidence merges only for same captured session binding.
- **Returned evidence:** terminal observation carries status/timing, stop reason, optional `yielded`, `terminalReply`, `terminalDelivery`, `terminalReceipt`. Known queue reports `status:"pending", timeoutPhase:"queue", providerStarted:false`. Ordinary observation deadline gives `{runId,status:"timeout"}`—no run cancellation and no inferred execution phase; wait same ID again.
- **Completion caveats:** `ok` with `yielded:true` can mean execution handed off/paused, not whole user task finished. Saved reply and delivered reply differ; [`AgentRunTerminalReceipt`][F6] defines `sourceReplyDelivered?:true` as external source final-delivery fact. Progress text/history mirror/quiet stream are weaker evidence. `agent.wait` snapshots are process-local cache, not durable job ledger; tests also exercise cache expiry.
- **Adverse test source:** [`agent-job.execution-settlement.test.ts`][F5], lines 14–30 reject acceptance as completion; parameterized timing/reply test blocks source wait after lifecycle end until replay publication; tests preserve timeout/cancel despite later `ok`, distinguish yielded work, and prevent timing/evidence borrowing from another session/generation. “publishes $label without retry grace” checks settled preparation failure, cancellation, timeout, and yield.
- **Charlie transfer:** project native accepted/running/interrupted/terminal evidence; preserve execution, delivery, and outstanding continuation as separate facts. Optional Maestro observes same facts. Atlas receives committed source provenance, never speculative “done” inferred from prose.
- **Failure scenario / rejected baggage:** model says “done,” then delivery fails or parent yields to child; UI/Atlas incorrectly records success. Reject heuristic completion classifier, extra final-answer model call, idle watchdog, and duplicate durable job ledger. Event-driven host observation avoids wasted polling/provider calls.

## Smallest Charlie contract and rollout priority

Conceptual contract below maps onto existing host APIs/metadata; it is **not** proposal for new database, RPC family, or framework.

| Contract | Native owner / minimal Charlie behavior |
|---|---|
| Stable address | Configuration maps specialist public labels to stable native agent/session IDs. Maestro remains fixed. Retain authenticated scope; specialist alias is presentation. |
| Exact input | Native prompt admission retains message/input ID, immutable payload, and delivery mode. Retry same identity only for exact match; conflicting reuse fails. |
| Admission receipt | Render accepted/pending separately from provider start and visible transcript promotion. Native `resume:false` remains admit-only. |
| Current execution | Native process-global Session execution/coordinator owns local drains; model/tools/filesystem stay Location-scoped. Charlie never manufactures durable drain ID. |
| Stop/reconnect | Native interruption owns current chain. Reconnect rereads durable host facts; request timeout does not authorize cancellation or tool replay. |
| Terminal evidence | Native committed result plus separately available delivery/continuation evidence. Unknown stays unknown. |
| Atlas integration | Shared native Knowledge/Memory uses stable source session/message IDs and existing access scope; Charlie adds provenance, not transcript mirror/store. |
| Optional Maestro | Same admission/observation APIs, same Atlas, same permission boundary. Charlie’s base path remains usable without Maestro. |

**Priority:** admission/identity + honest completion first; native Stop/reconnect next. Owner fences and autonomous crash recovery belong in host only when exposed contract has demonstrated gap. Avoid copying OpenClaw’s entire gateway/lane/claim graph into plugin.

**Quality checks for later implementation:** rename specialist label mid-session; exact retry versus changed payload/mode; failed custody commit before ACK; Stop racing successor; late old-provider output; lost ACK followed by reconnect; uncertain external delivery; yielded execution with outstanding work. Exercise existing host APIs with adverse paths, not duplicate model loops. These are proposed checks, not executed evidence.

**Efficiency:** reuse native events and receipts; one native admission per logical input; avoid model calls for classification/reconciliation; rely on existing serialized promotion instead of background scans. Queue priority and recovery constants are implementation facts, not measured performance results.

## License, evidence limits, reproducibility

- [Pinned root LICENSE][L1]: MIT, copyright © 2026 OpenClaw Foundation. Copied code/substantial portions require copyright + permission notice. Algorithm/contract adaptation needs far less baggage; third-party dependency licenses require separate check if copied.
- Retrieval: official blog/release/docs; GitHub release/commit APIs; pinned raw source and selected test bodies. Official docs index searched selectively for agent loop, session, queue, restart recovery. Source tree API returned `truncated:false` for inspected path inventories.
- Exact “2.0” verdict rests on positive matching official title/blog, not empty search. Some `gh api` requests timed out; successful raw/API HTTP retrievals supplied cited evidence. Timeout/empty output never treated as absence.
- Tests establish **source-level intended assertions only**; no downloaded code executed, no tests/typechecks/benchmarks run. Mocked transport tests cannot establish real network/provider behavior. No throughput, latency, or exactly-once external-effect guarantee claimed.
- Version boundary remains material: only launch-comparison table and its cited tests were checked at `ea806575…`; sections 1–6 stay scoped to later pinned main. Current official docs can over-simplify code (recovery budget above). Remaining release parity and plugin API availability remain explicit follow-up questions.

## Sources — exact symbols named above; implementation/test permalinks pinned

[V1]: https://openclaw.ai/blog/openclaw-2-accidentally
[V2]: https://docs.openclaw.ai/releases/2026.8.1
[V3]: https://api.github.com/repos/openclaw/openclaw/releases/tags/v2026.8.1
[V4]: https://api.github.com/repos/openclaw/openclaw/releases/latest
[V5]: https://github.com/openclaw/openclaw/releases/tag/v2026.9.8
[V6]: https://github.com/openclaw/openclaw/commit/06da0de86c0a27dc1e92995f9d0a2428880ce90c
[V7]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/package.json
[V8]: https://github.com/openclaw/openclaw/commit/ea806575e6450e4d1efdfc72c19f04be982a1b9b
[LA1]: https://github.com/openclaw/openclaw/blob/ea806575e6450e4d1efdfc72c19f04be982a1b9b/src/gateway/server-methods/chat-send-handler.ts#L222-L387
[LA2]: https://github.com/openclaw/openclaw/blob/ea806575e6450e4d1efdfc72c19f04be982a1b9b/src/gateway/server-methods/chat-restart-recovery.ts
[LA3]: https://github.com/openclaw/openclaw/blob/ea806575e6450e4d1efdfc72c19f04be982a1b9b/src/config/sessions/session-accessor.sqlite-transcript-turn.ts#L149-L298
[LA4]: https://github.com/openclaw/openclaw/blob/ea806575e6450e4d1efdfc72c19f04be982a1b9b/src/config/sessions/session-accessor.pending-inputs.ts
[LAT]: https://github.com/openclaw/openclaw/blob/ea806575e6450e4d1efdfc72c19f04be982a1b9b/src/config/sessions/session-accessor.pending-inputs.test.ts#L76-L199
[LF1]: https://github.com/openclaw/openclaw/blob/ea806575e6450e4d1efdfc72c19f04be982a1b9b/src/gateway/server-methods/agent-wait.ts
[LF2]: https://github.com/openclaw/openclaw/blob/ea806575e6450e4d1efdfc72c19f04be982a1b9b/src/gateway/agent-turn/agent-turn-service.ts#L653-L709
[LF3]: https://github.com/openclaw/openclaw/blob/ea806575e6450e4d1efdfc72c19f04be982a1b9b/src/gateway/agent-turn/agent-job.ts#L526-L607
[LFT]: https://github.com/openclaw/openclaw/blob/ea806575e6450e4d1efdfc72c19f04be982a1b9b/src/gateway/agent-turn/agent-wait-dedupe.test.ts#L115-L261
[I1]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/routing/resolve-route.ts#L269-L440
[I2]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/routing/session-key.ts
[I3]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/routing/session-key.test.ts
[A1]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/gateway/server-methods/chat-send-handler.ts#L272-L624
[A2]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/gateway/server-methods/chat-send-admission.ts
[A3]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/sessions/user-turn-transcript.ts#L553-L598
[A4]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/config/sessions/session-accessor.pending-inputs.ts#L188-L482
[A5]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/config/sessions/session-pending-input-operations.kernel.ts#L79-L158
[A6]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/gateway/server-methods/chat-send-pending-inputs.test.ts#L501-L637
[A7]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/gateway/server-methods/chat-send-setup.ts
[Q1]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/embedded-agent-runner/run-orchestrator.ts#L181-L250
[Q2]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/embedded-agent-runner/run/lane-controller.ts#L294-L453
[Q3]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/process/command-queue.ts
[Q4]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/embedded-agent-runner/run/session-bootstrap.ts#L409-L489
[Q5]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/config/sessions/session-accessor.sqlite-transcript-write.ts#L542-L660
[Q6]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/config/sessions/session-accessor.sqlite-transcript-write-guard.ts
[Q7]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/embedded-agent-runner/run/lane-controller.writer-claim.test.ts
[Q8]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/process/command-queue.cancellation.test.ts#L89-L198
[C1]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/gateway/server-methods/sessions-abort.ts
[C2]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/gateway/server-methods/chat-abort-handler.ts#L565-L674
[C3]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/gateway/server-methods/chat.abort-currentness.test.ts#L258-L345
[C4]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/gateway/server-methods/chat.abort-persistence.test.ts#L351-L410
[R1]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/main-session-recovery/main-session-restart-recovery-marking.ts
[R2]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/main-session-recovery/main-session-restart-recovery-runtime.ts#L68-L113
[R3]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/main-session-recovery/main-session-restart-recovery-store.ts
[R4]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/main-session-recovery/main-session-recovery-store.ts
[R5]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/main-session-recovery/main-session-recovery-state.ts
[R6]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/main-session-recovery/main-session-restart-recovery-shared.ts#L21-L23
[R7]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/main-session-recovery/main-session-restart-dispatch.ts
[R8]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/main-session-recovery/main-session-restart-recovery.test.ts
[R9]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/main-session-recovery/main-session-restart-recovery-resume-policy.ts#L340-L382
[R10]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/docs/gateway/restart-recovery.md
[F1]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/auto-reply/reply/agent-lifecycle-terminal.ts
[F2]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/gateway/server-methods/agent-wait.ts
[F3]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/gateway/agent-turn/agent-wait.ts
[F4]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/gateway/agent-turn/agent-job.ts
[F5]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/gateway/agent-turn/agent-job.execution-settlement.test.ts
[F6]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/agent-run-terminal-receipt.ts
[L1]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/LICENSE
