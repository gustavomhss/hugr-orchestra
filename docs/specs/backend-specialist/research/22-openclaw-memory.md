# R22 — OpenClaw memory, context, caching, efficiency

Research date: 2026-10-03. Research only; source/test inspection, no downloaded code executed. Runtime ownership and tool/plugin policy remain separate research scopes.

**Decision:** borrow provenance, bounded selection, explicit succession, evidence checks, and cache identity semantics. The backend specialist stays in Orchestra; Maestro optional. Atlas remains native shared Knowledge plus per-member task/PR/project Memory. Reject copied embedding store, independent DB/index/context engine, and dreaming daemon absent demonstrated unmet need and measured benefit.

## Evidence and version boundary

- **R = release:** `v2026.9.8`, commit `fc23bc864e4553c2d215e479eeec47b67a0bf943`. GitHub release API reported publication `2026-10-03T03:21:47Z`; annotated tag object `b1c1c6d3af1f68bc82efbb6c92fb224c36df8683` resolves to R. [Release metadata][release], [tag object][tag].
- **M = pinned main:** `06da0de86c0a27dc1e92995f9d0a2428880ce90c`. [Pinned comparison][compare] reports **diverged** histories; M is not interchangeable with R. All mechanism citations below use commit-pinned permalinks; M-only observations marked explicitly.
- **D = moving docs**, read first on research date: [memory architecture][d1], [context engine][d2], [compaction][d3], [active memory][d4], [dreaming][d5]. Useful navigation/design narrative; not release evidence.
- **TEST LIMIT, global:** tests inspected, not run or mutation-probed. “Covers” below means assertions present in pinned test source, not measured pass, production accuracy, crash completeness, latency, or savings. Real filesystem/SQLite fixtures and mocked model/provider boundaries identified separately.
- Local Atlas design read as optional background: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/backend-plugin/specs/backend-specialist/atlas.md` — proposed integration contract, not proof installed host implements it.

## Architecture: keep stores and context effects distinct

R has workspace evidence, derived search/index/provenance state, short-term promotion state, model-visible context, and provider caching. These are different persistence/cost domains. Session ingestion stages excerpts; promotion edits `MEMORY.md`; recall injects bounded context; compaction changes active transcript projection. Legacy context engine's `ingest` is no-op, `assemble` passes messages with `estimatedTokens: 0` for caller estimation, and `compact` delegates to runtime. Memory plugin is not itself replacement context engine. [R1], [R4], [R7], [R14], [R24]

## Six concrete call paths

### 1. Interactive transcript → attributed episodic candidate

Sources: [R1], [R2], [R3], [R4], [R5].

- **Call chain:** `runDreamingSweepPhases` → light/REM `ingestDreamingPhaseSignals` → `ingestSessionTranscriptSignals` → `collectSessionIngestionBatches` → `sessionIngestionSourceFromCorpus` → `scanSessionIngestionSource` → `buildSessionEntry` → `appendSessionCorpusLines` → `recordShortTermRecalls` → ingestion checkpoint write.
- **Fields:** source `{agentId, sessionId, sessionKey, sessionPath, stateKey, scope}`; snapshot `{mtimeMs/revisionMs, size, contentHash, lineCount, lastContentLine}`; candidate `{hash, contentIndex, lineNumber, day, snippet, provenance, sessionOrigin}`. Provenance `{originClass, sessionKind, observedAt, supersedesKey?}` travels separately from prose.
- **Guards:** automatic sweep selects interactive active-session corpus; skips checkpoint artifacts; checks session tombstones and channel/chat-type/hook-source exclusions before transcript read. Export strips internal recalled context, marked recalled turns, heartbeat/dreaming/cron scaffolding; redacts text. Foreign archive provenance forcibly becomes `untrusted`.
- **Classification:** persisted `senderIsOwner: true` → `owner`; assistant after owner → `agent`; persisted `turnTainted: true` → `untrusted`; `internal_system` → `system`; unknown sender → `untrusted`. Missing daily-file provenance differs: workspace notes default `agent`, while recorded flush quarantine stays sticky across edits. This trusts workspace writers; it is not cryptographic source authenticity. [R3], [R4]
- **Transitions:** snapshot absent/excluded/unavailable/unchanged/scanned → append staged lines → reserve `{entryKey, agentId, sessionId, sessionKey, originClass, observedAt}` origin rows **before** publishing recall state → persist cursor/hash state. Merging evidence takes least-trusted origin; conflicting session kinds become `unknown`; supersession key survives merge only when both agree.
- **Bounds/failure:** 240 candidate messages/sweep; adaptive per-file cap 12–80; snippets 12–280 UTF-16 code units. Candidate hash covers scope + timestamp/line + bounded snippet. Missing source can retire checkpoint; unavailable read retains previous checkpoint. Stat shortcut can skip same-size/same-mtime edits unless `verifyContent`; hashes/cursors and corpus append are not one cross-store transaction.
- **Tests/LIMIT:** provenance tests assert owner/agent, tainted assistant, and exclusion of marked recall plus paraphrase using written transcripts; they preseed taint, so do not prove every producer marks it. Ingestion test rewrites equal-size/equal-mtime archive and asserts `verifyContent: true` sees replacement. No blanket exactly-once capture or complete redaction claim. [T1], [T2]

### 2. Candidate → gated promotion, correction, supersession

Sources: [R5], [R6], [R7], [R8], [R9], [R31].

- **Call chain:** `rankShortTermPromotionCandidates` → `applyShortTermPromotions` → authoritative store/provenance refresh → `rehydratePromotionCandidate` → `consolidateMemory` → parse/validate operations → `applyMemoryConsolidationPlan` → preimage/origin reservation → `commitMemoryContent` → mark `promotedAt` → diary/event publication.
- **Fields/gates:** recall/daily/grounded counts remain separate; `userQueryHashes` alone supplies query diversity. Ranking combines relevance, frequency, diversity, recency, spaced recurrence, conceptual tags and phase reinforcement. Apply repeats score, signal-count, query-count, age, contamination and prior-promotion checks. Explicit `untrusted/system` blocked on both append and consolidation paths; consolidation requires trusted origin and interactive session-derived evidence.
- **Freshness:** re-read live source, relocate line range, reject missing snippet or managed dreaming fence; compare whole-source hashes before/after rehydration, then recheck source and full recall-row fingerprints under write lock after model returns. Relocation uses normalized equality/containment and nearest-position tie-breaks, not semantic identity proof. [R7], [R8]
- **Model boundary:** completion gets existing memory plus bounded candidate evidence; returns exactly one `{candidateKey, action: added|merged|superseded, priorEntries}` per candidate. Host constructs replacement text and citations. Merge requires normalized matching fact; supersession requires attached matching lineage and replacement of existing lineage entries; cross-project replacement rejected. Newer timestamp alone is not correction authority. [R6]
- **Transitions/failure:** eligible → planned → revalidated → rewritten/appended → `promotedAt`; existing promotion marker reconciles retry without reappend. Invalid/unavailable model, preimage failure or concurrent `MEMORY.md` edit can take append fallback. Changed source/store can defer candidate. Budget failure leaves file unchanged and candidate unpromoted. Append fallback is weaker than validated supersession: do not infer stale fact retired when model plan failed.
- **Costs:** tool-free completion timeout 60 seconds **per project group**, not whole-sweep cost cap; input includes current memory. Writer ceiling 10,000 characters, lowered to smallest configured consuming-agent bootstrap cap. Default loss fraction 0.25; append compaction removes whole generated sections within its loss bound. Bounded snippet uses estimated tokens × 4 characters, not provider-token measurement. Preimages and reports add I/O/storage. [R6], [R7], [R9]
- **Tests/LIMIT:** mocked completions test unrelated deletion rejection, exact attached supersession, stale-lineage addition rejection, content changes during model/preimage work, and provenance downgrade. File-backed promotion tests test moved/deleted source, repeat marker, and insufficient budget. These constrain edits, not truth of admitted fact or completeness of preserved meaning. [T3], [T4]

### 3. Forget selector → tombstone → recoverable derived-data purge

Sources: [R10], [T5].

- **Call chain:** `forgetMemoryEntries({agentId, sessionIds?, hookSources?, participants?, since?, dryRun?})` → resolve targets → workspace lock → `forgetWorkspaceMemory` → collect origin graph/corpus/file/index plans → lineage recheck → committed tombstone → index purge → phase/recall/checkpoint/preimage cleanup → guarded file rewrites → origin-row deletion.
- **Fields/state:** `selectedEntryKeys`, lineage identity, `mixedLineageEntryKeys`, `untargetableEntryKeys`, `curatedWrites`, `refusals`, per-artifact report; session becomes `reason: forgotten`, preventing later automatic ingestion. Mixed-origin promoted entry is selected whole; report exposes collateral lineage rather than pretending selective prose subtraction.
- **Guards:** selector required; dry-run plans without applying; changing origin graph causes reprepare. Vector purge requires usable vector extension. Tombstone commits separately **before** destructive purge; file replacement checks expected hash/content. Evidence needed for retry is removed last; corpus follows dependent memory artifacts.
- **Failure/cost:** SQL or file error can leave partial purge but durable exclusion and remaining lineage for retry. Agent embedding cache is cleared wholesale, so subsequent indexing may pay re-embedding cost beyond selected facts. Workspace scans, index planning, backup scrub and rewrites have real work cost; this is not a single atomic transaction across stores/files.
- **Retention LIMIT:** source transcript remains; tests explicitly assert retained transcript bytes. Untracked/manual curated content and untargetable legacy entries can remain and appear in report. “Forget” is traced derived-memory cleanup, not erasure of every archive, external copy, prompt already sent, or in-process summary cache.
- **Tests:** R uses real SQLite/FTS/vector and files with injected SQL-trigger/fs faults at index/source/backup/memory/corpus/origin stages; asserts tombstone survives failure, retry converges, clean/untargetable content survives, repeat purge reports no further artifact changes. No power-loss or universal secure-erasure result inferred. [T5]
- **M difference:** target resolution becomes async; `withMemoryForgetWorker` dispatches `forget.mark`, `forget.purge`, then final origin `delete`. Separate recovery test still asserts source transcript retained and fault/retry behavior. Do not attribute worker implementation to R. [M3], [MT2]

### 4. Local trigger recall and explicit ranked search → bounded context

Sources: [R11], [R12], [R13], [R14], [R15], [R16].

- **Call chain:** eligible `before_prompt_build` → current admitted user text/ID → `resolveTriggerRecall` → manager `search(query,{lexicalOnly:true,sources:["memory"],maxResults:24,minScore:0})` in parallel with `listTriggerCandidates` → source/range dedupe → `selectStrongTriggerMatches` → hidden `prependContext`.
- **Fields/guards:** release eligibility requires `source: memory`, trusted `provenance.originClass`, nonempty triggers, and **every** stored project key active. Message words normalized once. Single-word phrase score 0.85; multiword score `0.8 × coverage + 0.2 × min(1, overlap/2)`; final `0.8 × phrase + 0.2 × clamp(retrievalScore)`. Strong threshold **0.65**; deterministic ties; at most 3 hits and 1,800-character body, wrapper extra. Curated enumeration itself capped at 512. [R12], [R13]
- **Ordinary `memory_search`:** `search` → shared candidate window → `searchCandidates` → index identity/repair → keyword retrieval and, unless lexical-only, `embedQueryWithRetry` + vector retrieval → hybrid merge → decay/importance/project weighting → MMR → selection. Defaults: 6 results, minScore 0.35, vector/text 0.7/0.3, MMR λ=0.7, 30-day decay; root/topic memory evergreen. Importance missing = neutral, otherwise multiplier `0.75 + 0.05 × bounded importance`. [R14], [R15], [R16], [R32], [R33]
- **Budget subtlety:** smaller result count does not shrink ordinary shared ranking window: 200 candidates per retrieval lane, then selection; project-aware final selection capped at 200. Ordinary large requests can combine lanes beyond 200. `minScore` is **not universal rejection floor**: lexical fallback/fill can retain below-threshold hits. Index generation and surviving-chunk metadata are rechecked; dirty index sync can run in background, so source-currentness is separate from usable-index identity.
- **Failure/cost:** lookup errors/unsupported enumeration → no strong hit; hook deadline bounds waiting and leaves escalation possible. Lexical-only skips **query embedding**, not disk/index/CPU work; cold bootstrap/sync can still incur indexing/provider work. Explicit hybrid search may call embedding provider even though ranking has no generative-model judgment.
- **D mismatch:** moving architecture doc says 0.72 and vector trigger prefilter; R and M use 0.65 and lexical-only lookup. D also claims curated-only auto-injection. R enumeration is curated-only, but merged search selector checks trust, not filename; its test explicitly accepts trusted `memory/agent.md` and `memory/owner.md`. Thus curated-only guarantee is not supported by inspected selector contract; full noncurated-index production reach remains separate question. [R12], [R37], [T6], [M1]
- **Tests/LIMIT:** trigger tests assert score arithmetic, all-of project filtering, injection cap, lexical flag, shared lookup and cancellation with mocked manager. Search monotonicity test uses real manager/files with fake embeddings; asserts stable prefixes across result limits and below-threshold lexical fill. No measured relevance, exhaustive corpus search, or fixed wall-clock guarantee. [T6], [T7]

### 5. Recall intent + weak local result → model-assisted recall, reuse, evidence check

Sources: [R11], [R17], [R18], [R19], [R20], [R38].

- **Call chain:** `resolveRecallEscalationDecision` → `maybeResolveActiveRecall` → run-local dedupe → `resolveActiveRecall` → optional result-cache hit/circuit check → `runRecallSubagent` → tool-result/transcript evidence → `buildSubagentRecallResult` or `buildTimeoutRecallResult` → summary injection.
- **Guards:** `off` skips deep recall, `always` requests it, default `escalate` needs recognized retrospective intent and no strong lane-one hit. Intent uses explicit multilingual patterns, not general semantic completeness. Hook uses producer's current message, not quoted/projected-history labels; explicit current text without admission ID disables run-local reuse.
- **Reuse fields:** run-local key uses `runId`, request identity, authority/scope; cross-turn SHA-256 key uses agent/session, query, authority fingerprint, selected memory slot, active projects, provider/model, allowed recall tools and optional resource scope. Same-agent private conversation recall disables cross-turn result cache for live reauthorization. Maps are process-local; `agent_end` clears run entries. They do not provide durable once-only admission across restart/compaction.
- **Transitions:** miss → pending → `ok|no_relevant_memory|unavailable|failed|timeout|timeout_partial`. Only nonempty `ok` cached. Default cache TTL 15 seconds, max 1,000 entries; oldest updated entries evicted. Default recall timeout 15 seconds, CLI-dispatch default 45 seconds, configurable ceiling 120 seconds, setup grace separately bounded. Three consecutive agent/provider/model timeouts open 60-second cooldown. These are configured budgets, not measured elapsed times. [R18], [R19], [R34], [R35]
- **Missing evidence/failure:** assistant prose alone cannot become recalled summary: usable allowed-tool evidence required. Timeout partial additionally requires settled work, successful evidence and no recorded cleanup/search failure. Timeout cleanup settles before replacement run reuses managers. Evidence gate proves some usable result exists, not that every summary clause follows from it. Default summary 220 chars (config range 40–1,000) can omit qualifications. [R20], [R34], [R35]
- **Freshness LIMIT:** release result-cache key has authority/resource/model fields but no source revision; TTL is not correction/deletion freshness proof. Immediate edit/forget invalidation across every cached summary was not established by this trace. Run-local dedupe reduces repeat work; it does not prevent repeated context appearance on separate turns.
- **Tests/LIMIT:** mocked runner tests assert same admission reused despite huge projected-history changes, new ID/text starts independent recall, authority/scope partitions cache, empty results reject fabricated summary, and unavailable evidence stays unavailable. They do not establish live model recall quality or durable admission. [T8], [T9], [T17]
- **M difference:** native provider hits carry `{reference:{providerId,id,fragment,revision}, automaticRecall:{eligible,projectKeys,triggers}, excerpt,citations}`; duplicate identity includes revision and fragment. Caller authority checked before/after lookup and cache reuse; audience identity partitions request cache; lease closes. Mock-provider tests cover revision separation, audience split and revocation. This is useful Atlas record-reference semantics, not reason to copy OpenClaw provider infrastructure. [M1], [MT1]

### 6. Pre-compaction flush → summary boundary → retained session context

Sources: [R21], [R22], [R23], [R24], [R25], [R26].

- **Call chain:** `runMemoryFlushIfNeeded` → selected `resolveMemoryFlushPlan` → projected token/byte gate → private flush session/model turn → persisted cycle latch; separately `runSessionCompactionIfNeeded` → `compactEmbeddedAgentSession` → legacy delegate → AgentSession compaction → core `prepareCompaction/findCutPoint` or safeguard hook → finalized result checks → `appendCompaction` → rebuild active messages.
- **Fields/guards:** fresh token total or reconstructed estimate, previous output/current prompt, `contextWindowTokens`, `reserveTokensFloor`, soft margin, optional transcript-byte trigger; `memoryFlush.{kind,compactionCount,failureCount}`. Flush threshold is `max(0, contextWindow − reserve − softMargin)`; duplicate cycle blocked. Incognito, heartbeat, non-writable sandbox and CLI/native-compaction routes skip this flush path. Separate housekeeping-model override does not inherit active model fallback chain.
- **Surprising transition:** completed flush stamps `{kind:succeeded,compactionCount}`. Exhausted failures also stamp that latch to stop cycle retries, while returning `outcome: exhausted` and warning. Therefore latch is scheduling state, **not receipt proving fact persisted**. Flush metadata persistence can itself fail. [R22], [T10]
- **Compaction boundary:** retain `firstKeptEntryId`, protect admitted pending user by entry/idempotency identity; missing explicit pending-entry boundary or cut beyond found pending input rejects. Cut points exclude `toolResult` boundaries, retaining assistant/tool blocks together. Default core recent-tail target 20,000 estimated tokens; reserve 16,384; summary cap 16,000 characters. Prepared foreground budget additionally charges fixed prompt, pending input and retained history; R rejects finalized replacement above that budget. These are estimates, not exact provider admission guarantees. [R23], [R25]
- **Quality/failure:** built-in safeguard, when enabled, budgets final artifact before audit; checks required headings, bounded extracted identifiers and latest ask evidence, then bounded corrective attempts. Up to 12 extracted identifiers and lexical ask checks are not complete semantic preservation. Infeasible required facts or failed corrections cancel before summary commit. Provider/custom paths have their own validation boundary. Cancellation checked before commit; already committed summary is not undone. [R23], [R26], [R36]
- **Tests/LIMIT:** flush test explicitly asserts `exhausted` plus persisted `succeeded` latch. Cut-point tests preserve pending suffix and handle oversized tool output. SQLite boundary test verifies old rows remain and only retained messages feed next summarizer; model is stubbed. Safeguard tests use mocked summaries, including required identifier larger than artifact cap → cancellation. No claim every fact survives summary or every runtime follows embedded path. [T10], [T11], [T12], [T13]

## Cache and work budgets: costs do not disappear

| Domain | Observed mechanism | Cost/limit relevant to Atlas |
| --- | --- | --- |
| Bootstrap snapshots | R `getOrLoadBootstrapFiles` refreshes loader each turn; reuses objects only when content/path/missing/source identity match; 64 snapshots; explicit boundary/rollover clears. [R27] | Stable object reuse avoids churn, not all filesystem work or provider input tokens. Real workspace tests cover edit, replacement inode and restored mtime. [T14] |
| Embedding cache | R key `(provider,model,provider_key,chunk hash)`; finite nonempty vectors validated; invalid entries regenerated; 400-hash read batches; configured producer fixes cap at 50,000 entries; capacity reserved before inserts. [R16], [R28] | Entry cap is not byte cap; high dimensions cost more. Eviction below working set buys repeated paid embedding. Real SQLite tests cover corrupt vectors, identity and capacity, not economic optimum. [T15] |
| Recall caches | R run-local promises + separately bounded successful-summary TTL cache. [R18], [R19] | Save redundant retrieval/model work; freshness, authorization, duplicate context admission remain separate obligations. |
| Provider prompt cache | R `resolveCacheRetention` capability-checks provider/API, maps explicit `none`, `short`, `long`, defaults only direct Anthropic family to `short`. [R29] | Retention intent is not measured cache hit or bill reduction; stable ordered prefixes still consume context window. Tests exercise resolver, not provider billing. [T16] |
| Project identity memo | R normalized origin or `path:<root>` fallback cached per resolved root, max 128 entries; no per-message Git call while cached. [R30] | Remote change can leave memoized identity until eviction/restart; same-host/path accounts can collide by documented design. Atlas exact project binding must remain authority. |
| Dreaming / retrieval | Source scan + rehydration + ranking + preimages/diary + optional model; retrieval output bound separate from candidate work. [R4], [R6], [R7], [R8], [R9], [R14] | Measure storage reads, scanned candidates, CPU, provider calls/input/output and reply latency separately. This research measured none of those costs. |

## Atlas-compatible extraction; proposed semantics, not shipped integration claims

1. **Provenance before publication:** preserve Atlas record ID/content identity, exact project/member/kind/task-or-PR binding, source revision/references and native execution receipt. Keep annotations as data; attach execution linkage through supported host evidence, not ad-hoc fields in closed Atlas templates. Separate remembered experience from admitted shared Knowledge. Basis: paths 1–3.
2. **Correction as explicit succession:** exact prior record/applicability + current source evidence + receipt; retire old active applicability without fabricating erased history. Keep contradictions/missing lineage explicit. Frequency, repeated recall and model confidence are not truth votes. Basis: path 2.
3. **Bounded recall through Atlas:** own project rules/header ordinarily; own task/PR excerpts when relevant; exact closing fold once on proven logical resume. Use Atlas structural search/drill/pagination, not vector-store clone. Response carries coverage, source revision and unavailable/partial/stale distinctions. Basis: paths 4–5.
4. **Durable admission distinct from cache hit:** link exact fold + member/project/logical resume to existing Session admission evidence. Reconcile lost responses and uncertain writes against receipt/state. Existing System Context/Context Epoch machinery handles provider-turn boundaries and compaction; process-local maps cannot certify once-only resume. Basis: paths 5–6.
5. **Cache inside native foundation:** reuse source-valid header/facet/query observations with stable member ID, exact project/scope, source version and authority identity; invalidate on correction, member/project change, unavailable evidence and permission change. Display-name rename changes presentation only. OpenClaw Git remote memo is relevance hint, not substitute for Atlas project authority. Basis: paths 4–5 and cache table.
6. **No competing learning service:** begin with meaningful task failure/progress checkpoints and explicit corrections through Atlas admission. Optional bounded model proposal only after evidenced need; Atlas decides Memory-rule/Knowledge admission. Reject nightly dreaming daemon, extra database/index, bulk transcript reinjection and new context engine. Existing native substrate must first demonstrate missing capability plus quality/recurring-cost benefit.

## Paired falsification scenarios for proposed integration

Each pair needs actual native Atlas + host evidence; OpenClaw unit tests are design evidence, not the backend specialist acceptance results.

| Scenario | Positive control | Adversarial paired case / falsifier | Cost/receipt to record |
| --- | --- | --- | --- |
| Stale source + correction | Fresh source-backed rule admitted; exact successor retires prior applicability. | Edit/delete source while recall/model plan is pending; restore size/mtime; correct again inside cache TTL. Stale rule presented current or stale predecessor still active falsifies contract. | Revalidated content/revision IDs, supersession receipt, rereads and cache misses. |
| Duplicate activation | Exact resumed own fold admitted once; retry returns same admission evidence. | Repeat hook, retry lost response, kill/restart, then resume. Duplicate provider-context admission or duplicate checkpoint falsifies idempotency; same text with genuinely new logical admission must remain distinguishable. | Canonical record/admission IDs, actual model/retrieval invocations and injected bytes. |
| Identity rename | Stable member ID reads/writes same Memory after public-name change. | Same display name on different member, different project/worktree binding, or changed Git remote. Crossover or name-driven owner fork falsifies binding. | Owner/project identity and execution actor separately; cache-key disposition. |
| Compaction | Exact fold/current task and outstanding evidence references remain attributable after host compaction. | Exhaust flush, drop a required reference, compact again, restart. Success-looking cycle latch accepted as write proof, invented final fold, or second fold admission falsifies contract. | Actual memory receipt, compaction/admission references, summary/token estimates and model calls. |
| Retrieval budget | At fixed source version, narrowing output preserves deterministic ranked prefix and explicit coverage. | Large corpus, oversized record/identifier, many equal-ranked hits; lower output budget. Silent omission presented complete, scope lost during truncation, or unchanged full scan sold as cheaper retrieval falsifies claim. | Work scanned vs output bytes/tokens; pagination/omission reasons; CPU/provider usage. |
| Missing evidence / deletion | Real successful source read supports recall; selected tracked deletion reconciles receipts. | Corrupt/unreadable store, zero-hit search with fluent model answer, removed origin edge, partial purge or unavailable source. Invented Knowledge, unavailable→empty collapse, or universal-erasure claim falsifies contract. | Named failure/completeness state, surviving/untargetable references, retry result and re-embedding exposure. |

## Unclosed evidence

No runtime benchmarks, live provider cache measurements, independent recall-quality evaluation, power-loss campaign, or deployed backend specialist/Atlas integration test performed. Taint producer declaration coverage, arbitrary manual-copy deletion, and instant invalidation of every summary cache remain outside demonstrated reach. Docs' “zero latency,” “no hidden state,” and complete-preservation implications should not become product guarantees: inspected paths perform I/O, maintain derived SQLite/process state, call models in selected lanes and deliberately bound/drop context.

## Pinned source register

[release]: https://github.com/openclaw/openclaw/releases/tag/v2026.9.8
[tag]: https://api.github.com/repos/openclaw/openclaw/git/tags/b1c1c6d3af1f68bc82efbb6c92fb224c36df8683
[compare]: https://api.github.com/repos/openclaw/openclaw/compare/fc23bc864e4553c2d215e479eeec47b67a0bf943...06da0de86c0a27dc1e92995f9d0a2428880ce90c
[d1]: https://docs.openclaw.ai/concepts/memory-architecture.md
[d2]: https://docs.openclaw.ai/concepts/context-engine.md
[d3]: https://docs.openclaw.ai/concepts/compaction.md
[d4]: https://docs.openclaw.ai/concepts/active-memory.md
[d5]: https://docs.openclaw.ai/concepts/dreaming.md
[R1]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/session-ingestion.ts
[R2]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/packages/memory-host-sdk/src/host/session-files.ts
[R3]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/packages/memory-host-sdk/src/host/session-provenance.ts
[R4]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/dreaming-phases.ts
[R5]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/short-term-promotion-record.ts
[R6]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/dreaming-consolidation.ts
[R7]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/short-term-promotion-apply.ts
[R8]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/short-term-promotion-rehydrate.ts
[R9]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/memory-budget.ts
[R10]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/memory-forget.ts
[R11]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/index.ts
[R12]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/trigger-recall.ts
[R13]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/memory/manager-keyword-retrieval.ts
[R14]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/memory/manager-search-orchestration.ts
[R15]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/memory/hybrid.ts
[R16]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/agents/memory-search.ts
[R17]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/escalation.ts
[R18]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/recall.ts
[R19]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/recall-state.ts
[R20]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/transcript-result.ts
[R21]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/auto-reply/reply/memory-flush.ts
[R22]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/auto-reply/reply/agent-runner-memory.ts
[R23]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/agents/sessions/agent-session-compaction.ts#L235-L460
[R24]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/context-engine/legacy.ts
[R25]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/packages/agent-core/src/harness/compaction/compaction.ts
[R26]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/agents/agent-hooks/compaction-safeguard.ts#L1262-L1407
[R27]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/agents/bootstrap-cache.ts
[R28]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/memory/manager-embedding-cache.ts
[R29]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/agents/embedded-agent-runner/prompt-cache-retention.ts
[R30]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/agents/project-memory-scope.ts
[R31]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/short-term-promotion.ts#L80-L181
[R32]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/memory/importance.ts
[R33]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/memory/temporal-decay.ts
[R34]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/types.ts
[R35]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/config.ts
[R36]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/agents/agent-hooks/compaction-safeguard-quality.ts
[R37]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/packages/memory-host-sdk/src/host/memory-recall-metadata.ts
[R38]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/recall-run.ts
[T1]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/packages/memory-host-sdk/src/host/session-files.provenance.test.ts#L82-L169
[T2]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/session-ingestion.test.ts#L98-L143
[T3]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/dreaming-consolidation.test.ts
[T4]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/short-term-promotion.test.ts
[T5]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/memory-forget.test.ts#L539-L1019
[T6]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/trigger-recall.test.ts
[T7]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/memory/manager-search-monotonicity.test.ts
[T8]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/index.test.ts#L1015-L1083
[T9]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/index.test.ts#L4681-L4740
[T10]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/auto-reply/reply/agent-runner-memory.test.ts#L1263-L1289
[T11]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/packages/agent-core/src/harness/compaction/compaction-cut-point.test.ts#L89-L132
[T12]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/agents/sessions/agent-session-compaction-boundary.test.ts
[T13]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/agents/agent-hooks/compaction-safeguard.test.ts#L2749-L2790
[T14]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/agents/workspace.bootstrap-cache.test.ts
[T15]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/memory-core/src/memory/manager-embedding-cache.test.ts
[T16]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/src/agents/embedded-agent-runner/prompt-cache-retention.test.ts
[T17]: https://github.com/openclaw/openclaw/blob/fc23bc864e4553c2d215e479eeec47b67a0bf943/extensions/active-memory/index.test.ts#L5776-L5802
[M1]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/extensions/active-memory/trigger-recall.ts
[M3]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/extensions/memory-core/src/memory-forget.ts
[MT1]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/extensions/active-memory/trigger-recall.test.ts#L203-L419
[MT2]: https://github.com/openclaw/openclaw/blob/06da0de86c0a27dc1e92995f9d0a2428880ce90c/extensions/memory-core/src/memory-forget-recovery.test.ts
