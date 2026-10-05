# R27 — Adversarial agent-failure study: OpenClaw + Hermes

Research date: **2026-10-03**. Scope: **3 OpenClaw cases, 4 Hermes cases**; primary public reports, merge metadata, pinned source, patches, and test assertions. Research only; no project code or tests executed. Regression cases below are proposed experiments, not observed passes.

## Snapshot contract

| Alias | Snapshot | Exact commit | Commit time / release publication, UTC |
|---|---|---|---|
| O-R | OpenClaw `v2026.9.8` | `fc23bc864e4553c2d215e479eeec47b67a0bf943` | Commit `2026-10-02T16:27:25Z`; release `2026-10-03T03:21:47Z` |
| O-M | OpenClaw supplied main | `06da0de86c0a27dc1e92995f9d0a2428880ce90c` | `2026-10-03T21:39:40Z` |
| H-R | Hermes package `v0.21.5`, release tag `v2026.9.24` | `f97608f178d1ffeca59860195ab7da295f7c8e5f` | Commit `2026-09-24T10:08:47Z`; release `2026-09-24T10:09:38Z` |
| H-M | Hermes supplied main | `d795726f78e532ca31655f74656b4be63a907581` | `2026-10-03T21:31:04Z` |

Sources: [OpenClaw release][O-release], [O-M commit][O-main], [Hermes release][H-release], [Hermes version-bump patch][H-version], [H-M commit][H-main]. Release tag spelling is not publication date. Hermes `0.21.5` is package version; verified GitHub release tag is `v2026.9.24`.

Issue/PR status means live GitHub metadata at retrieval. “Present” below means inspected source supports mechanism at named pin, **not independent runtime reproduction**. “Fixed” means identified correction landed; scope stays limited to that correction. Bot triage comments supply leads, not independent proof. No frequency, comparative reliability, or deployment-wide impact estimates inferred.

## Disposition at pins

| Case | O-R / H-R | O-M / H-M | Confidence boundary |
|---|---|---|---|
| O1: dead Gateway owner blocks restart | Hostname-only reclaim defect present | Fixed by supplied main commit | Direct old/new source + regression assertions; Docker incident reported |
| O2: completed child result loses parent handoff | Historical fix included | Durable completion admission present | Merge ancestry + patch/tests; not guarantee of every async delivery path |
| O3: worker-local tools miss Gateway plugin policy | Gap source-correlated | Gap source-correlated after runtime refactor | Open issue; built-in exec policy and launch allowlists still exist |
| H1: deferred review uses wrong profile | Defective context propagation present | Fixed via replacement PR | Old/new source + dispatch test; original PR status misleading alone |
| H2: ineffective compaction repeats | Anti-thrash correction included | Correction retained, with cooldown/recovery logic | Loop mitigation established; auxiliary threshold policy separate |
| H3: late steer acknowledged then lost | Race source-correlated | Race source-correlated | Open report; deterministic reporter harness, no independent run |
| H4: restore confuses unknown ownership with no owner | DB fallback defect + OAuth rollback present | DB fallback defect present; OAuth part fixed | Synthetic report; current automatic-updater reachability unverified |

## OpenClaw

### O1 — Crash recovery refuses dead predecessor after container recreation

- **Record:** [#155644][O1], opened `2026-09-22T10:06:46Z`; reported **2026.9.5**, Docker `node:24.21.0`, Linux/arm64. Closed completed `2026-10-03T21:39:42Z`. Reporter observed restart refusals until old lease expired after container hostname changed. Quoted outage durations and failed-start totals belong to reporter, not this study.
- **Mechanism:** O-R [`readStateLeaseProcessOwnerStatus`][O1-old] returns `unknown` before PID/start-time checks whenever `owner.host !== hostname()`. Recreated Docker hostname defeats local death detection. Generic expiry can eventually clear finite leases; null-expiry ownership can remain blocked. Separate shutdown/release complaints in issue were not independently established.
- **Fix:** [PR #164546][O1-fix], merged `2026-10-03T21:39:41Z`, merge `06da0de86c0a27dc1e92995f9d0a2428880ce90c` = O-M. [Acquisition code][O1-code] uses shared boot/PID-namespace evidence and heartbeat classification, rechecks inside SQLite transaction, and releases only observed owner token. Known-dead owners reclaim immediately; unverifiable heartbeat must be **strictly older than 90 s**. Qualified live owners remain protected even after expiry. Heartbeat renews every 15 s; startup wait bounded to 95 s. These are OpenClaw policy values, not proposed Charlie defaults.
- **Release inclusion:** O-R retains old predicate; O-M is fix itself. Thus **main-only at supplied pins**, despite release publication occurring same calendar day. No later release inclusion established.
- **Proof limits:** [Tests][O1-test] cover stale legacy/qualified container leases including null expiry, fresh/90-second-boundary refusal, live-expired owner refusal, and replacement-generation protection. Assertions inspected, not run. PR explicitly reports no two-container Docker probe for this SQLite lease change.
- **User-care lesson:** recovery error must distinguish live conflict, bounded unknown-owner wait, and reclaimable death. “Another owner active” should not turn dead predecessor into user’s manual database-cleanup task.

### O2 — Child finishes, parent never receives usable completion

- **Record:** [#86488][O2], opened `2026-05-25T12:49:58Z`; **2026.5.19**, macOS Darwin 25.4.0, Feishu group, Claude Opus 4.7. Follow-up reports same parent-silence symptom on **2026.5.27**, Telegram topic. Closed completed `2026-05-31T13:03:13Z`.
- **Observed failure:** after `sessions_yield`, completion announcement exhausts short retry path; logs include `completion agent did not deliver through the message tool`, retry-limit suspension, then expired suspended delivery. User must ask again despite child finishing. Reporter’s “no persistent outbox / result gone forever” diagnosis is broader than established evidence: follow-up still sees child completion in transcript, and fix builds on **existing persisted delivery state**.
- **Fix:** [PR #88613][O2-fix], merged `2026-05-31T12:25:23Z`, commit `1e54e908e2e416eb3a3b217b1a9f69b2b3bedbdb`. [Patch implementation][O2-code] selects pending/suspended handoffs for requester; leases before injection; acknowledges after successful injection; releases failed submissions; leaves prompt overflow pending; reclaims stale handoff leases. Original defect best described as **lost delivery/continuation**, not proven deletion of all result bytes.
- **Release inclusion:** GitHub [compare][O2-inclusion] returns `ahead`, merge base equal fix commit: included in O-R. Earliest release not established. Pin-era code has evolved into [`subagent-completion-admission.store.ts`][O2-current], with explicit admission/settlement receipts; historical queue filename should not be mistaken for current layout. Corresponding [O-M module][O2-main-current] also inspected.
- **Proof limits:** [Patch tests][O2-test] assert suspended-result recovery, ack/release, in-flight exclusion, stale-lease recovery, and overflow retained pending. PR reports focused checks; full changed-file check was blocked by dependency installation. Correction promises next-parent-turn handoff; does not prove autonomous parent wake in every topology or exactly-once external messaging.
- **User-care lesson:** completed work stays available while notification fails. Show “result ready; delivery pending”; retry delivery without rerunning expensive child work.

### O3 — Cloud-worker local tools bypass Gateway’s per-call plugin policy

- **Record:** [#161436][O3], opened `2026-09-29T23:33:33Z`; **2026.9.6**, Linux Gateway, crabbox AWS placement. Open at retrieval. Reporter’s denying `before_tool_call` plugin blocks normal Gateway exec but never sees same worker-local exec.
- **Mechanism:** O-R [worker runtime][O3-old] constructs coding tools with `plugins.enabled: false`; local tool hook context uses that configuration. O-M moves construction to [worker-placement-tools][O3-tools], retaining disabled plugins, while [runtime][O3-runtime] wraps placement tools locally. [Policy resolver][O3-policy] consults process-local hook registry; absent applicable handlers allows call through that plugin-policy layer. Source supports missing Gateway policy propagation on this local path.
- **Scope:** this is **per-call Gateway plugin-policy gap**, not absence of all permissions. Inspected pins retain tool-name launch authority, exec security/ask projection, and restrictions for unavailable transports. O-M Gateway-executed proxies are distinct from placement-local exec/files. Current design does not establish that plugin decisions travel with latter.
- **Disposition:** no merged correction or release inclusion established for this specific gap; defective boundary source-correlated at both pins. Issue’s automated review is not treated as executed remote proof. End-to-end denial comparison and dedicated upstream regression test remain unverified.
- **User-care lesson:** tool name being allowed does not establish permission for its particular arguments. Charlie should use native backend permission decisions consistently across supported dispatch paths; optional Maestro must not widen them.

## Hermes

### H1 — Deferred memory review forgets originating profile

- **Record:** canonical [#108537][H1], opened `2026-09-11T19:14:39Z`, reported main `7469c0f2a52baf70c574b110af0772b81bf84227`, Windows/Python 3.13; closed completed `2026-09-28T12:37:58Z`. Corroborating [#120474][H1-duplicate], opened `2026-09-23T17:09:51Z`, main `1753653450`, macOS 26/Python 3.11; closed **duplicate/not planned** `2026-09-23T17:18:17Z`, not proof of fix that day. Both reproductions synthetic; latter reports work-profile fact written into default `USER.md`.
- **Mechanism:** H-R [`_PendingReview`][H1-old] stores agent/session/kwargs/time, not `ContextVars`. Shared dispatcher invokes enabled-setting lookup and spawn in ambient context. Worker’s later propagation copies already-wrong scope. Consequences include dropping enabled profile’s review, running disabled profile’s review, and wrong-profile memory/skill paths.
- **Fix:** original [PR #108538][H1-original] remains open/unmerged. Replacement [PR #126165][H1-fix] merged `2026-09-28T12:37:56Z`, merge `d6c91913689775fee5f38f3f97ecedbefc34104d`; relevant authored commit `a9408582909ca0b6542698216e69eec6ab9ab84c`. H-M [queue][H1-code] captures `copy_context()` at enqueue and runs both gate and spawn under `item.context.run(...)`. Coalescing updates context with newest item while preserving original age.
- **Release inclusion:** H-R old source inspected; H-M corrected source inspected; [merge ancestry][H1-inclusion] confirmed. **Fixed on H-M, not H-R.** No later release inclusion established.
- **Proof limits:** [Merged regression][H1-test] runs dispatcher under disabled ambient home, queues enabled/disabled profiles with distinct secret scopes, and expects only enabled profile with its own home/secret. It substitutes spawn boundary and wake/clock; does not exercise live model-generated memory. Original candidate additionally reports real-thread/MemoryStore probe; do not substitute that claim for merged test’s narrower reach.
- **User-care lesson:** profile/session identity must travel with deferred work, including config recheck. Dynamic display labels cannot be storage keys or authority selectors.

### H2 — Compaction spends tokens without escaping threshold

- **Record:** [#53008][H2], opened `2026-06-26T09:36:24Z`; **v0.17.0**, Ubuntu 24.04/Python 3.11.15; large-context DeepSeek main with smaller Qwen summarizer. Reporter describes repeated near-ineffective compression. Closed **not planned** `2026-07-15T04:47:57Z`, automated reason “implemented on main”; closure alone is not fix evidence.
- **Source-confirmed mechanism:** [commit `7f9485707d0183af0c9f04e1153e1ec9bd98aa68`][H2-patch] documents failed earlier correction: `should_compress()` sees rough preflight count and real provider count separately. Rough under-threshold reading reset ineffective-compression strike, reopening loop despite real prompt remaining over threshold. Message-list shrink is not enough when system/tool prompt floor remains too large.
- **Fix:** [PR #62502][H2-fix] merged `2026-07-11T17:29:50Z`, merge `8121dbb1660adbe561b396bd60d05156c29dbfa7`. Judge one completed compaction against following real usage in `update_from_response`; back off after two ineffective boundaries. Merge also handles no-op/aborted attempts, missing usage, and later real usage that fits. [Ancestry][H2-inclusion] proves inclusion in H-R; [H-R][H2-release-code]/[H-M][H2-main-code] source retain strike and recovery-deadline guards. Earliest release not established.
- **Tests:** [Anti-thrash test patch][H2-tests] includes rough `20,000` versus real `33,564` tokens, threshold `24,576`, alternating both readings; asserts at most two compactions in tested sequence. Healthy tokenizer-skew case must still compact effectively without false strike. Assertions inspected, not executed.
- **Important split:** September 27 follow-up on `v0.21.4+canary.20260926T065603Z` / `d0288be5` confirms mitigation while disputing auxiliary-context threshold clamp. H-R/H-M still carry `_aux_context_ceiling`. Do not call original endless loop current; do not claim every threshold or summarizer-capacity issue fixed. Reporter’s oversized-summary explanation was not independently reproduced.
- **User-care lesson:** budget progress by comparable measurements at correct boundary; stop futile retries and explain stalled progress without disabling healthy work.

### H3 — API accepts steer after last consumer has drained

- **Record:** [#132359][H3], opened `2026-10-03T17:43:19Z`; reproduced by reporter on `f8489405`, rechecked there against `620ceb86fc753ef538fac5151c13edc0623ef1f6`. Open at retrieval. Local fake-provider harness; reported incidence belongs to harness, not production estimate.
- **Mechanism:** H-M [finalizer][H3-final] drains `_pending_steer` once at lines 739–741, then performs tail work and returns. [API worker][H3-api] keeps run `running` until event-loop `_finish`; [handler][H3-handler] checks running state, calls `steer`, returns `accepted: true`. [Agent method][H3-steer] appends nonempty text under slot lock without closing admission at final drain. Late arrival can therefore be accepted into per-run agent after final consumer, then discarded on retirement without `pending_steer` in result.
- **Pin check:** H-R equivalent seams: [`turn_finalizer.py:672–674`][H3-release-final], [`api_server_runs.py:893–955,1123–1154`][H3-release-api], [`interrupt_control.py:244–253`][H3-release-steer]; H-M inspected directly. These files differ between pins; conclusion rests on retained ordering, not byte-identity claim borrowed from reporter.
- **Disposition:** no merged fix/release inclusion established; source-correlated race at both pins. Proposed lock-and-close or final event-loop drain in report is not landed evidence. End-to-end reproduction/test execution unverified here.
- **User-care lesson:** “accepted” must mean recoverable input, not successful assignment to ephemeral slot. Keep admission separate from consumption and completion; user must not audit transcript to discover dropped correction.

### H4 — Snapshot restore treats unknown holder state as permission to replace

- **Record:** [#127010][H4], opened `2026-09-28T23:02:05Z`; reported main `7154128f`, synthetic probes run on `2ec77030`, macOS/Python 3.14.7. Open at retrieval. Reporter explicitly states **no occurrence in own update log**. Treat as reproducible-path claim with source support, not documented production data-loss incident.
- **DB mechanism:** H-R [`backup.py:469–564`][H4-old]; H-M [holder scan][H4-holders] returns `None` off Linux, documented as unknown. `_safe_restore_db` first tries SQLite backup; on failure, [fallback][H4-fallback] checks `if holders`, so `None` permits inode/sidecar replacement under foreign macOS holder. In-process `offline_file_access` guard remains useful but cannot establish foreign-process absence. H-M [snapshot caller][H4-caller] still reaches this fallback.
- **Related automatic-restore path:** [integrity helper][H4-integrity] reports locked/busy read as `valid=False`; [update helper][H4-update] labels invalid result corruption, accepts unknown foreign holders, clears sidecars, copies snapshot. Reporter’s synthetic healthy-DB probe rolls post-snapshot rows back. Helper logic remains at pins; **current automatic-updater entrypoint reachability not established**, so no claim every modern update invokes it.
- **DB disposition:** [PR #127061][H4-holder-pr] (opened `2026-09-28T23:56:20Z`) and [PR #97499][H4-fallback-pr] (opened `2026-08-28T23:08:48Z`) both open/unmerged. No merged correction or release inclusion established for these DB branches; source still supports gap on H-R/H-M.
- **Separate OAuth subfailure, now fixed on main:** snapshot’s spent single-use refresh token overwrote live rotated grant. Original #127063 closed unmerged; replacement [PR #130537][H4-auth-fix] merged `2026-10-03T11:01:01Z`, merge `3973e768166609f29cd4bf9b65b1b62325853969`, [ancestor of H-M][H4-auth-inclusion], after H-R. H-M merges under auth-store lock and retains live generation. [Tests][H4-auth-test] assert rotated token survives while static auth restores; refused/missing auth makes restore incomplete and preserves live bytes. This correction must not be mislabeled current OAuth rollback merely because umbrella issue remains open.
- **User-care lesson:** unavailable verification is not proof of corruption. Preserve user’s newer work and valid login; describe partial restore truthfully. Charlie should surface native repair result, never invent repair by copying database files.

## Reusable regression cases + healthy controls

All proposed; use deterministic barriers, actual persistence/dispatch boundaries, and real foreign processes where ownership matters. Provider substitution can isolate scheduling; cannot prove cloud deployment or filesystem behavior. IDs below map to cases above.

| ID | Adversarial setup / required observation | Healthy control | Lean Charlie prevention |
|---|---|---|---|
| O1 | Crash owner after publishing lease; recreate namespace; test fresh unknown, boundary age, stale unknown, null expiry, and late old-owner release. Recover only rightful ownership; old release cannot clear replacement. | Live owner remains sole owner even when nominal lease expiry elapsed; normal stop/start works. | Reuse native process/session ownership. Show concrete recoverable state. Provider continuation after crash needs explicit resume; recovery of admitted inputs is separate. |
| O2 | Persist child result, fail announcement repeatedly, crash before ack, restart, then resume parent. Result remains discoverable; duplicate delivery attempts retain one logical completion. | Successful first handoff is acknowledged; next parent turn does not reinject it. Overflow waits rather than disappears. | Existing durable result identity + delivery status; acknowledge consumption separately. Retry result delivery, not model work. No exactly-once network claim. |
| O3 | Denying policy receives same harmless file-write probe through each supported parent/child execution path. Denial leaves target untouched and decision attributable to task/tool call. | Allowed read succeeds; launch-denied tool remains unavailable. | Invoke same native permission boundary everywhere; preserve argument-specific decision. Do not construct independent worker-policy system for Charlie. |
| H1 | Queue review for profile A, leave scope, switch ambient B, rename A’s label, then dispatch. Gate, memory destination, and secret scope still resolve A’s stable identity. Repeat with opposing enabled settings. | Immediate A review and standalone single-profile review keep correct scope; disabled A remains disabled. | Carry stable profile/project/session IDs into deferred callbacks; resolve current label for display only. Atlas remains shared identity/memory foundation. |
| H2 | Alternate rough-below/real-above counts after shrinking history; verify finite ineffective-compaction budget and visible pause reason. Missing usage must not become fabricated progress or phantom strike. | Real prompt drops below threshold despite estimator skew; useful compaction remains available and strike resets. | Use native usage/progress signal and bounded retry ownership. Give user reason + next action; avoid another watchdog layer. |
| H3 | Barrier immediately after final steer drain, before terminal publication; submit unique input ID, then release. Accepted input must be durable and consumed or visibly pending; otherwise reject explicitly. Retry same ID cannot duplicate user input. | Steer before normal boundary reaches model once; post-completion request has clear new-turn/rejection behavior. | Use existing durable Session input admission, then advisory wake. “Accepted”, “consumed”, and “completed” derive from distinct records. |
| H4 | On macOS, foreign process holds DB during verification/fallback. Unknown/busy result must leave live DB/WAL generation intact. Restore old OAuth snapshot after live rotation; retain live grant. | Valid snapshot restores offline DB with verified exclusive access; static config restores; known missing snapshot differs from partial refusal. | Native storage owner performs repair. Charlie presents bounded retry/restore status, preserves interrupted task evidence, and never maps unknown health to destructive repair. |

## Charlie synthesis — small, independent, user-centered

1. **One backend truth path.** Charlie stays independent OpenCode/Orchestra backend plugin. Use native durable prompt admission, task/result evidence, permissions, and Session ownership. Atlas stays native shared foundation; Maestro optional consumer/orchestrator of same contracts.
2. **Stable IDs, dynamic labels.** Delayed callbacks retain original identity, location, and authority scope. Label changes update presentation; do not remap memory, task ownership, or acknowledgements. Deferred writes recheck relevant current settings under original identity.
3. **Truthful progress.** Admission receipt is not model consumption; child completion is not parent delivery; successful summary generation is not useful context reduction; partial restore is not full success. Surface existing evidence states with specific next action.
4. **Spend once where possible.** Retain completed results across delivery retry. Bound no-progress model/tool/compression work at existing runner boundary. Crash recovery may promote eligible durable inbox inputs; must not silently replay uncertain provider/tool side effects.
5. **Implementation priority:** H3/O2 loss-of-user-work semantics first; H1 identity-bound deferred work and O3 permission parity alongside supported execution paths. O1/H4 remain native storage/process responsibility; H2 uses existing execution/context budgets. These are boundary assertions, not request for new services or infrastructure catalog.

## Source limits and rejected leads

- Source inspection and upstream assertions establish narrower claims than deployed reproduction. No downloaded project execution, fresh benchmarks, tests, Docker probes, or model calls performed. Upstream test reports are attributed; inspected assertions are not claimed green here.
- Merge ancestry checked through GitHub compare with returned merge base equal named fix commit. Old/new blob inspection supplies negative/positive control for main-only fixes. Open issue or unmerged original PR alone never decides pin applicability. Earliest containing release remains unverified unless explicitly stated.
- OpenClaw [#157949][O-rejected] alleged endless exact-`NO_REPLY` redelivery, but closing review points to bounded core recovery, silent-token exclusion, and deployment-local suppression. Excluded from failure count; reporter’s cost claim does not prove core loop.
- Hermes H4 combines distinct branches; OAuth fix does not fix holder detection. Synthetic damaged-header fallback does not establish spontaneous corruption. Current post-update helper reachability and deployed cloud-policy enforcement remain specific gaps in this study.
- Public reports are selection-biased and mutable. This is regression-case corpus, not architecture survey, security ranking, or prevalence comparison. Local artifact authored only as `RESEARCH.md` in requested metadata-only worktree.

## Primary source index

[O-release]: https://github.com/openclaw/openclaw/releases/tag/v2026.9.8
[O-main]: https://github.com/openclaw/openclaw/commit/06da0de86c0a27dc1e92995f9d0a2428880ce90c
[H-release]: https://github.com/NousResearch/hermes-agent/releases/tag/v2026.9.24
[H-version]: https://github.com/NousResearch/hermes-agent/commit/f97608f178d1ffeca59860195ab7da295f7c8e5f
[H-main]: https://github.com/NousResearch/hermes-agent/commit/d795726f78e532ca31655f74656b4be63a907581
[O1]: https://github.com/openclaw/openclaw/issues/155644
[O1-old]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/infra/state-lease-process-owner.ts#L42-L59
[O1-fix]: https://github.com/openclaw/openclaw/pull/164546
[O1-code]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/infra/gateway-owner-lease.ts
[O1-test]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/infra/gateway-owner-lease.test.ts#L149-L223
[O2]: https://github.com/openclaw/openclaw/issues/86488
[O2-fix]: https://github.com/openclaw/openclaw/pull/88613
[O2-code]: https://github.com/openclaw/openclaw/blob/1e54e908e2e416eb3a3b217b1a9f69b2b3bedbdb/src/agents/subagent-handoff-queue.ts
[O2-test]: https://github.com/openclaw/openclaw/blob/1e54e908e2e416eb3a3b217b1a9f69b2b3bedbdb/src/agents/subagent-handoff-queue.test.ts
[O2-inclusion]: https://api.github.com/repos/openclaw/openclaw/compare/1e54e908e2e416eb3a3b217b1a9f69b2b3bedbdb...fc23bc864e4553c2d215e479eeec47b67a0bf943
[O2-current]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/agents/subagents/completion/subagent-completion-admission.store.ts
[O2-main-current]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/subagents/completion/subagent-completion-admission.store.ts
[O3]: https://github.com/openclaw/openclaw/issues/161436
[O3-old]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/worker/embedded-agent.runtime.ts#L91
[O3-tools]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/worker/worker-placement-tools.ts
[O3-runtime]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/worker/embedded-agent.runtime.ts#L227-L259
[O3-policy]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/src/agents/agent-tools.before-tool-call.policy.ts#L176-L215
[H1]: https://github.com/NousResearch/hermes-agent/issues/108537
[H1-duplicate]: https://github.com/NousResearch/hermes-agent/issues/120474
[H1-original]: https://github.com/NousResearch/hermes-agent/pull/108538
[H1-old]: https://github.com/NousResearch/hermes-agent/blob/f97608f178d1ffeca59860195ab7da295f7c8e5f/agent/review_idle_queue.py#L61-L101
[H1-fix]: https://github.com/NousResearch/hermes-agent/pull/126165
[H1-code]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/review_idle_queue.py#L97-L172
[H1-test]: https://github.com/NousResearch/hermes-agent/blob/a9408582909ca0b6542698216e69eec6ab9ab84c/tests/agent/test_review_idle_queue.py#L349-L396
[H1-inclusion]: https://api.github.com/repos/NousResearch/hermes-agent/compare/d6c91913689775fee5f38f3f97ecedbefc34104d...d795726f78e532ca31655f74656b4be63a907581
[H2]: https://github.com/NousResearch/hermes-agent/issues/53008
[H2-patch]: https://github.com/NousResearch/hermes-agent/commit/7f9485707d0183af0c9f04e1153e1ec9bd98aa68
[H2-fix]: https://github.com/NousResearch/hermes-agent/pull/62502
[H2-tests]: https://github.com/NousResearch/hermes-agent/blob/7f9485707d0183af0c9f04e1153e1ec9bd98aa68/tests/agent/test_compaction_anti_thrash.py
[H2-inclusion]: https://api.github.com/repos/NousResearch/hermes-agent/compare/8121dbb1660adbe561b396bd60d05156c29dbfa7...f97608f178d1ffeca59860195ab7da295f7c8e5f
[H2-release-code]: https://github.com/NousResearch/hermes-agent/blob/f97608f178d1ffeca59860195ab7da295f7c8e5f/agent/context_compressor.py#L2740-L2954
[H2-main-code]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/context_compressor.py#L2992-L3206
[H3]: https://github.com/NousResearch/hermes-agent/issues/132359
[H3-final]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/turn_finalizer.py#L737-L797
[H3-api]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/platforms/api_server_runs.py#L937-L1003
[H3-handler]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/gateway/platforms/api_server_runs.py#L1219-L1250
[H3-steer]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/interrupt_control.py#L250-L259
[H3-release-final]: https://github.com/NousResearch/hermes-agent/blob/f97608f178d1ffeca59860195ab7da295f7c8e5f/agent/turn_finalizer.py#L672-L674
[H3-release-api]: https://github.com/NousResearch/hermes-agent/blob/f97608f178d1ffeca59860195ab7da295f7c8e5f/gateway/platforms/api_server_runs.py#L893-L1154
[H3-release-steer]: https://github.com/NousResearch/hermes-agent/blob/f97608f178d1ffeca59860195ab7da295f7c8e5f/agent/interrupt_control.py#L244-L253
[H4]: https://github.com/NousResearch/hermes-agent/issues/127010
[H4-old]: https://github.com/NousResearch/hermes-agent/blob/f97608f178d1ffeca59860195ab7da295f7c8e5f/hermes_cli/backup.py#L469-L564
[H4-holders]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_cli/backup_restore.py#L30-L73
[H4-fallback]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_cli/backup_restore.py#L219-L290
[H4-caller]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_cli/backup.py#L1570-L1591
[H4-integrity]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_cli/backup.py#L407-L454
[H4-update]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_cli/update_cmd_maint.py#L417-L488
[H4-holder-pr]: https://github.com/NousResearch/hermes-agent/pull/127061
[H4-fallback-pr]: https://github.com/NousResearch/hermes-agent/pull/97499
[H4-auth-fix]: https://github.com/NousResearch/hermes-agent/pull/130537
[H4-auth-inclusion]: https://api.github.com/repos/NousResearch/hermes-agent/compare/3973e768166609f29cd4bf9b65b1b62325853969...d795726f78e532ca31655f74656b4be63a907581
[H4-auth-test]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/hermes_cli/test_snapshot_restore_oauth.py
[O-rejected]: https://github.com/openclaw/openclaw/issues/157949#issuecomment-5827649004
