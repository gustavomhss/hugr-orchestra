# R25 — Hermes memory, learning, prompt construction, compression/cache

Research date: 2026-10-03. Research only; source inspection, no test/benchmark execution. Test assertions below describe inspected code, never passes. No downloaded code executed; no subagents, commits, pushes, or config edits.

## Verdict for the backend specialist

Transfer **bounded, scoped persistence; progressive disclosure; revision-aware correction; stable prompt epochs; recoverable history** into Atlas/host. Hermes implements useful persistence and reuse machinery. “Agent grows with you” / “self-improving” does not establish improving task success, factual correctness, or lower total cost.

The backend specialist remains backend plugin inside OpenCode/Orchestra, usable without Maestro. Atlas remains native Knowledge foundation, including per-member persistent project rules and task/PR recall. Optional Maestro supplies native identity/plan context. Host owns Session execution, prompt assembly, provider adapters and compaction. No second `MEMORY.md` store, learning daemon, compactor, or all-stack ingestion framework.

## Evidence boundary and primary docs

- Official [release v0.21.5 / v2026.9.24][release] confirmed. Annotated tag object `e3dd27ee2d8b011737a4eea8e3eb3d711ab78690` [peels][tag] to `f97608f178d1ffeca59860195ab7da295f7c8e5f`.
- Implementation/docs/tests below pinned to **main snapshot `d795726f78e532ca31655f74656b4be63a907581`**. Distinct from release commit; findings are not claims every mechanism shipped unchanged in v0.21.5.
- Started primary guides: [memory][D1], [skills][D2], [curator][D3], [prompt-assembly][D4], [context-compression-and-caching][D5], [micro-compaction][D6], [troubleshooting-agent-quality][D7]. Pinned source overrides stale prose.
- Upstream access used read-only GitHub/raw endpoints. Oversized tree response and intermittent API failures were access failures, not absence evidence; followed explicit files instead. Inspected selected corresponding implementations/assertions, not exhaustive repository correctness.
- Host contracts inspected from research-worktree HEAD `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`: `specs/hugr-maestro/{actor-identity-contract,atlas-context-envelope-contract,atlas-foundation-seam-register}.md`. These are design/source-lift artifacts, not evidence of implemented backend specialist integration or current passing Atlas tests.

### Documentation discrepancies affecting design

| Prose | Pinned behavior / consequence |
|---|---|
| Memory/troubleshooting: snapshot “never changes mid-session”; tool replies show live state | Ordinary writes preserve snapshot; admitted batch-compaction rebuild calls `invalidate_system_prompt → load_from_disk`. Successful writes return terminal usage/count and replaced/removed entry, not entire live inventory. Detached seeded-prompt hygiene has explicit preservation exception. [S1], [S2], [S3], [S11] |
| Memory examples recommend completed-work diaries | Current `MEMORY_SCHEMA` explicitly excludes task progress/completed-work logs; task-learned procedure/preferences go to skills. Keep the backend specialist task/PR recall separate from standing rules. [S2] |
| Prompt guide calls skills both stable and volatile; says `AGENTS.md` is cwd-only | Skills **index** leads volatile tier; explicit auto-loaded skills can occupy stable tier. `AGENTS.md` walks git-root→cwd, with per-directory override precedence. [S3], [S4] |
| Cache guide presents `system_and_3` as strategy | Matching static prefix gets two system breakpoints plus two recent cacheable messages; eligible direct-native tool layout uses tool-array breakpoint and completed transaction endpoints. Legacy system+3 remains fallback. [S9] |
| Review budget says loop stops before crossing cap | `_review_input_budget_exhausted` checks accumulated input at **next iteration**; crossing request already completed. Soft stopping budget, not hard prepaid ceiling. [S10] |
| Compression guide says anchor fingerprints only boundary; opening exchange always protected; every old user message quoted verbatim | Anchor now hashes whole priced message prefix. Early non-system head protection decays after first compaction. Lean user appendix has 24,000-char total / 4,000-char per-message limits and elision. [S12], [S13] |
| Memory calls search “free”, untruncated; README still says LLM-summarized search | Search implementation returns DB text without summarizer; discovery/read truncate, scroll currently does not cap individual message content. Returned text still costs future model input. [S15] |
| Curator lifecycle elsewhere says 30/90 days; telemetry excludes installed skills | Defaults are 14/30 days. Counters now record all skills; curation eligibility remains separate. [S7], [S8] |

## Six mechanisms

### M1 — Small durable facts, frozen render, explicit mutation

**Call chain:** `AIAgent.__init__ → agent_init._init_memory → MemoryStore.load_from_disk → system_prompt._memory_parts → format_for_system_prompt`. Write: registry `memory → memory_tool → _memory_tool → MemoryStore.add/replace/remove/apply_batch → _mutate → atomic_write_text`. Rebuild: `compress_context → _rebuild_system_prompt_at_boundary → invalidate_system_prompt → load_from_disk`. [S1], [S2], [S3], [S11]

**State/identity:** active `HERMES_HOME/memories/{MEMORY,USER}.md`; target `memory|user`; entries split by `\n§\n`; `_system_prompt_snapshot` separate from live lists. Profile/home, not project/member, is storage scope. Entry identity is content/exact-match-first unique substring, not durable entry ID.

**Selection/update:** enabled stores injected wholesale. Defaults 2,200 / 1,375 characters, not tokenizer bounds. Exact duplicate add succeeds without another entry; semantic contradictions remain model responsibility. `replace` replaces **whole entry**, even when `old_text` selects one sentence. Batch checks final budget atomically; malformed/unmatched/over-limit batch does not commit. Batch cannot empty previously nonempty store; explicit single remove can. Locked re-read avoids stale-snapshot overwrites; unreadable/drifted destructive input refused.

**Cache/cost:** disk changes do not mutate current prefix; saves become visible through immediate tool evidence and later snapshot rebuild. Every request carries rendered memory; cache discount depends on route/TTL. Fourth consecutive consolidation failure returns terminal `done`; success resets counter, so this is feedback against loops, not hard call enforcement. Externally over-limit files load with warning, so advertised caps do not bound every injection path.

**Failure boundary:** conversational “saved” is not receipt. Staged success is not committed success. Unattended review replace/remove always stage, even when ordinary approval gate is off; approval pins full matched entry and rejects changed targets. Threat-pattern scanning protects known syntax, not factual truth, scope, or applicability. A wrong rule can persist and repeatedly steer work.

**The backend specialist transfer:** small Atlas rule projection per member/project; immutable rule ID + revision; authoritative correction against expected revision. Keep original evidence separately. Current correction reaches next safe host provider boundary as explicit context update; refresh frozen projection only at host-owned Context Epoch. Preserve cache where correct; never preserve superseded instruction merely for cache warmth.

### M2 — Progressive skill disclosure plus explicit/self-directed capture

**Call chains:** `system_prompt._skills_prompt → prompt_builder.build_skills_system_prompt → resolved catalog/index`; `skills_list → metadata`; `skill_view → _locate_skill → full SKILL.md or supporting file`. `/learn → build_learn_prompt → ordinary agent tools → skill_manage`. Automatic route: `turn_context._tick_memory_nudge / turn_finalizer.finalize_turn → AIAgent._spawn_background_review → build_cache_parity_fork → run_conversation → skill_manage → _record_success`. [S4], [S5], [S6], [S16], [S17]

**State/selection:** names/frontmatter/relative paths; plugin `plugin:skill` namespace. Read resolution: trusted project → profile-local → configured create directory → external directories. Same-tier distinct name collision requires exact path. Index sorts category/name; OS/environment/available-tool conditions filter offers. Model chooses semantic relevance. Current index instruction says load even **partially relevant** skills—proactive reuse can overfetch, unlike a strict relevance budget.

**Disclosure/cache:** index description budget 60 chars; new-skill create enforces it, edits can keep longer description with warning. `SKILL.md` can reach 100,000 chars; 24k body/sprawling-reference lint is advisory. Listing cache uses roots/stat signature, disabled set, platform and 30s TTL; prompt-index cache includes roots/tool capabilities/platform/disabled categories. Repeat view keys task ID + resolved name/file and `(source path, mtime_ns, size)`; unchanged body returns stub. Compression/prune/micro-splice reset read dedup; review bypasses it to read actual content. Stat fingerprint is cheaper but weaker than revision/content hash.

**Learning policy:** default memory nudge counts 10 user turns; skill nudge counts 10 tool iterations, checked after turn—not “learn every ten completed tasks.” Automatic review requires nonempty final response, non-interrupted turn and enabled gates; automatic delegate reviews skipped. This does not verify task success. Managed-local route can defer to idle. Foreground create, including `/learn`, records `created_by="learn"`; background create records `"agent"`, enabling curator management. Creation validates form/size and writes text; “working procedure” remains model judgment.

**Review cache/cost:** same-model fork inherits provider/credentials, prompt bytes, reasoning settings, tools and logical cache scope; dispatch whitelist restricts actual tools. Persistence detached from parent transcript/external-memory provider. Different-model route keeps recent 24 messages, extending tool boundary, and clips older user/assistant text to 300/200 chars while retaining tool names: deterministic digest, not lossless semantic summary. Up to 16 iterations; default aggregate input stopping budget `min(0.75 × context window, 600,000)`, unknown-window fallback 120,000; soft crossing behavior above. Warm-cache replay still bills each iteration/output/reasoning; route switch loses shared cache and old detailed corrections.

**Learned-rule failure boundary:** prompts reject setup failures, unresolved attempts and blanket “tool broken” claims, but also demand active skill updates. Runtime guards check autonomous ownership and read-before-write, not whether lesson succeeded or generalizes. Read mark names exact path, not read revision. Authoring lint/adopt marker cannot certify truth; optional agent-created content scanner defaults off. Wrong lessons can become durable self-imposed refusals.

**The backend specialist transfer:** reuse host task completion or explicit correction for bounded updates: memory/evidence into Atlas, skill-body changes into owning package/repository. Load relevant procedure through host skill loader, then exact detail on demand. Prefer existing skill revision over near-duplicate. Atlas records source/task/PR outcome, applicability and skill revision references, not competing skill source copies. Capture uses existing host lifecycle, without the backend specialist learning daemon; automatic capture must earn held-out net benefit.

### M3 — Ownership-aware aging, recoverable archival, optional consolidation

**Call chain:** existing host idle/startup maintenance → `maybe_run_curator → should_run_now → run_curator_review → apply_automatic_transitions → skill_usage.curated_report/archive_skill`; optional `_consolidation_pass → _run_llm_review → skill_manage` with background origin. [S7], [S8], [S6]

**State/identity:** profile `skills/.usage.json` keyed by skill **name**; `created_by`, use/view/patch counts/timestamps, state, pinned flag; `.curator_state` scheduler; `.archive/` recoverable packages; ledger/before-after blobs best-effort. `created_by="agent"` is mutable management opt-in, not authorship proof; manual adoption flips policy without resetting inactivity clock. Pin blocks foreground deletion, not foreground editing; background guard also refuses pinned edits. Pin lookup failure can let foreground delete proceed.

**Selection/update:** enabled by default; first observation seeds clock and defers full interval. Default interval 168h, supplied idle threshold 2h; idle enforced only when caller provides measurement. Latest use/view/patch time, else creation, drives active→stale at 14d and archive at 30d. Never-used items receive grace; pins and cron references—including paused jobs—protect automatic transitions. Hub/external/user-owned items excluded; bundled pruning opt-in. Foreground learned skills remain unmanaged unless adopted. Restore is explicit, with collision checks.

**Quality/cache trade:** archival shrinks later catalog and can reduce irrelevant loads. Aging measures inactivity, **not invalidity**. `skill_view` increments both view/use, including review path; maintenance reads can refresh apparent relevance without successful task reuse. Rare recovery procedures can age out while frequently consulted wrong procedures stay active. Stale items remain readable until archived.

**Consolidation boundary:** off by default. Enabled fork allows skills tools only, sets `max_iterations=9999`, and prompt says fewer than 10 archives means stopped too early. `absorbed_into` must name existing different skill; that establishes forwarding target existence, **not semantic absorption or intact support links**. Read-before-write/ownership guards and recoverable archive help; advisory lint and best-effort ledger do not make merges lossless. Cron reference rewrites occur through report path, best-effort, not one transaction with skill package changes.

**The backend specialist transfer:** Atlas memory records validity/supersession and applicability; inactivity is review hint, not automatic invalidation of project rules. Skill revision/archive/restore remains package/repository-owned; Atlas keeps evidence and references. Keep management policy separate from author identity and success evidence. No archive quotas, giant umbrella mandate, duplicated ledger, or periodic LLM curator. Reuse existing Atlas/host maintenance boundaries.

### M4 — Stable prompt tiers and destination-specific cache planning

**Call chain:** `conversation_loop._restore_or_build_system_prompt → system_prompt.build_system_prompt_parts/build_system_prompt`; outbound `_redecorate_prompt_cache_for_provider → build_prompt_cache_plan / apply_anthropic_cache_control`. [S3], [S4], [S9], [S10]

**State/order:** stable identity/tool/model guidance/coding brief → project/caller context before worktree-specific snapshot → volatile skills index, memory/profile/external memory, plugin sections, profile/date/model/session/runtime hints. `_cached_system_prompt` stored per session; `_cached_system_prompt_static` rebuilt only if literal prefix matches. Workspace snapshot pinned by resolved cwd. Fresh overlays belong late/request-local; capability guidance gated by actual tool availability.

**Selection/update:** project-context type is first nonempty `.hermes.md/HERMES.md → AGENTS chain → CLAUDE.md → Cursor rules`; not union of every convention file. Compaction re-renders admitted prompt and schemas; equal bytes retain object identity. This ordering is a reuse optimization, not an instruction-authority hierarchy.

**Cache identity:** provider cache still depends on actual prompt/tool bytes, model/account/endpoint/route. Hermes logical scope uses compression-lineage root, not arbitrary parent lineage; explicit branch/delegate isolated. Declared gateway scope is `gwk_ + sha256(source|gateway_session_key|reset-generation)[:24]`; reset changes generation. Same-model review inherits resolved scope; divergent compacted review on slot-keyed xAI/Grok route gets `::review` suffix. Cache bucket identifier is not knowledge/member identity. [S18]

**Wire policy/cost:** at most four Anthropic-style markers; static+full-system+two recent cacheable messages, legacy system+three fallback, or eligible direct-native tool-array/static/completed-transaction layout. Copy-on-write keeps persisted transcript undecorated. TTL `auto` chooses human-paced 1h vs machine-paced 5m, then route clamp; LiteLLM tool-part handling differs. Longer TTL can increase write price; model/account/tool-order/early-prefix changes cause cold work. Cache support is backend capability, not universal discount.

**The backend specialist transfer:** host assembles one canonical prompt with Atlas receipt-bound memory projections and package/repository-owned skills; host owns route-specific cache markers and invalidation. Only specialist display names configurable; Maestro fixed. Specialist rename may change rendered bytes once; stable plugin/member IDs, stored rules, history, permissions and recall references retain identity.

### M5 — Usage-anchored batch compaction with durable recall

**Call chain:** host pressure gates → `AIAgent._compress_context` (`CompressionFacadeMixin`) → `conversation_compression.compress_context` → `ContextCompressor.compress → prune/boundary selection → _summarize_window/_generate_summary → call_llm(task="compression")` → admitted `_commit_compaction → SessionDB.archive_and_compact`. Exact-detail recovery: `session_search → _dispatch → _discover/_scroll/_read_session → SessionDB`. [S11], [S12], [S13], [S14], [S15], [S19]

**State/identity:** session-bound `_previous_summary`; durable session failure cooldown/streaks; `_usage_anchor` in session model config. Anchor carries prompt/completion counts, base count, last-row fingerprint and whole priced-prefix fingerprint over persisted provider-visible message fields. Fresh dictionaries preserve identity; prefix rewrites invalidate it. Separate system/tool/model changes still need host invalidation. Commit uses session lease/holder, cancellation fence, covered message IDs and watermark to bound publication against held history. Default in-place keeps session ID and soft-archives summarized rows (`active=0, compacted=1`); optional legacy rotation creates linked child ID.

**Pressure policy:** provider usage plus rough appended-message delta, excluding already-priced assistant reply. Whole-context unanchored preflight waits one provider request; usage-less/overflow paths retain fallback. Threshold is not universally documented 50%: sub-512,000 windows have raise-only 75% floor, output reservation/absolute caps/minimum-window behavior and provider overrides apply. Gateway pre-agent hygiene remains separate 85% policy, documented but not fully traced here.

**Retention:** lean default selects tail `2.5% × main window`, clamped 10k–25k and at most 20% of window; protected user/assistant anchors and atomic tool groups can exceed selection budget. First non-system head protection decays after initial compaction. Pre-prune replaces old results with structured outcome-bearing stubs; lean summary adds identifier index, bounded user quotations and recovery pointer. One normal summary request per attempt; fallback/retry may add requests. Sampling/pruning and recurrent summaries are lossy even when original records remain durable.

**Failure behavior:** terminal auth/quota/network/empty/truncated summary preserves original transcript after available retry. Other failures can commit deterministic fallback; repeated overload reaches degraded fallback on third consecutive overload, unless abort-on-failure configured. Cooldown and ineffective/fallback streaks restrain thrash. “Non-destructive” means archived evidence recoverable, not guaranteed present or correctly understood by model. Source comments/prose saying every failure drops middle without summary are stale for these branches.

**Recall policy/cost:** FTS discovery defaults user+assistant roles, hides tool/subagent/kanban sources, demotes cron before lineage dedup, hydrates top result fully and lower matches compactly. Current live lineage filtered; same-session compaction archives admitted, rewind rows hidden. Read defaults first20+last10 rows with 2,000-char message cap; discovery bookends/window cap 1,200/4,000; scroll window is bounded by count but body text unbounded. `session_id` takes read precedence even when query supplied—recovery pointer `query+session_id` does not perform scoped keyword discovery in this dispatcher. Tool-output search requires explicit role selection. Profile naming enables explicit cross-profile read; bare miss does not scan other profiles.

**The backend specialist transfer:** existing host compactor owns thresholds, provider-native compaction and durable transcript publication. Atlas holds scoped task/PR facts/procedure evidence plus exact source pointers. Retrieval must distinguish current evidence, archived evidence, superseded/rewound state and incomplete indexing; preserve result outcome and original stable IDs. Use bounded exact hydration, not full history replay. Recover source before treating summary as proof.

### M6 — Opt-in micro-compaction amortizes pauses, can increase cost

**Call chain:** `finalize_turn → _micro_compact_after_turn → MicroCompactionMixin._micro_compact → _next_exchange/_resolve_compact_cursor → _micro_summarize_one → auxiliary.call_llm(task="compression") → splice → _sync_micro_compact_to_db → archive_and_compact`. [S14], [S17]

**State/policy:** off by default; cadence `max(1,every_n_turns)` counts completed-turn invocations, even no-op passes. Cursor + rolling summary restored from last marker; one eligible assistant/tool exchange before next user is absorbed, head/tail excluded. User text retained by this path, sometimes joined with `display_metadata.model_only`; original display rows remain. Defrag at estimated 2,000 summary tokens rewrites summary only. Micro merge output cap `min(1500,max_summary_tokens)` bounds output, not size of a tool-heavy exchange or total cost.

**Failure/cache:** empty/refusal/length-capped summary leaves exchange intact; three consecutive failures at same cursor skip it for later batch compaction. Only absorbed/rehydrated markers may be superseded. Watermark read failure/stale generation skips or rolls back pass; generic DB-sync exception logs and still returns spliced result, leaving documented resume double-load risk. Host disables path for persistence-isolated review/checkpoint-required agents. Splice resets read dedup so missing old tool content can be fetched again.

**Cost:** every committed rewrite invalidates cache suffix; auxiliary request delays turn closure after answer streamed. No minimum-reclaim threshold: tiny exchange plus marker can increase context size. User text creates retention floor; batch remains armed, so “users never compacted” is micro-path scope, not whole-session guarantee. One exchange per pass does not establish steady-state occupancy under arbitrary workload.

**The backend specialist transfer:** retain host’s existing compaction policy. Transfer semantic lessons—source user intent, marker lineage, publication-before-resume, dedup invalidation. Do not add the backend specialist micro-compactor. Any host experiment must compare billed tokens, completion latency and held-out recall against batch-only, including cache-rich and cache-less routes.

## Inspected tests: assertion reach, not execution evidence

| Source | Assertions inspected | Limit |
|---|---|---|
| [test_memory_tool.py][T1] | Frozen snapshot/reload; whole-entry replacement; batch persistence; overflow stop feedback; background remove staged vs foreground remove committed | Temp files/monkeypatches; cannot establish model calls tool or learns correct fact |
| [test_skill_manager_tool.py][T2] | Concurrent patches preserve both changes; foreground create not autonomous; missing/unmanaged ownership refused; exact supporting-file read required; copied-context read marks isolated | Ownership/scanner paths partly stubbed; no semantic-quality oracle |
| [test_skill_view_dedup.py][T3] | First full / repeat stub / changed file / different task / reset; review gets content and read mark | File-stat invalidation, not arbitrary renderer/config change coverage |
| [test_background_review.py][T4] | Detached fork avoids parent close/finalization; clone protects nested transcript; disabled automatic vs explicit review; superseding interrupt scoped to fork | Fake review agent/provider; no learning-quality or cache-billing proof |
| [test_curator.py][T5] | First-run deferral; pinned/cron references survive; unreferenced old control archives; bundled/disabled excluded from LLM candidates | `_run_llm_review` normally replaced; no proof consolidation preserves knowledge |
| [test_system_prompt.py][T6], [test_prompt_caching.py][T7] | Skills volatile, common project prefix across worktrees, foreign-session prompt rejected; immutable caller data, four-marker/idempotent layouts and route TTL controls | Builders/providers partly simulated; emitted plan ≠ actual cache hit |
| [test_context_compressor.py][T8], [test_usage_anchor.py][T9] | Failed-call stubs retain failure; empty summary aborts; overload degradation persists across fresh compressor; full-prefix rewrite invalidates anchor; sabotage removes anchor advantage | Mock usage/summary responses; real SQLite in selected cases, not vendor tokenization or semantic recall |
| [test_session_search.py][T10] | Real SQLite archived hits vs live/rewind controls; cross-profile explicit vs bare ID; adaptive hydration and read cap | Seeded corpus, not real-world recall/latency benchmark |
| [test_micro_compaction.py][T11] | User text, cadence, failed-summary retention, marker containment; real DB concurrent append/stale-generation controls and exactly-once display | Summarizer substituted; cannot certify summary fidelity/cache economics |

## Minimal Atlas/host contract proposal

1. **Ownership:** the backend specialist orchestration/policy in backend plugin; Atlas canonical memory/Knowledge/rules and task/PR evidence; skills canonical in owning package/repository. Host owns Session Context Epoch/history/tools/provider accounting and skill loading. Native optional Maestro contributes plan/actor context; standalone path uses same Atlas/host semantics.
2. **Identity:** persistent rule ownership `(projectId, memberId, ruleId)`; producing actor `(projectId, sessionId, memberId)`, task/attempt and PR evidence beside it. Only specialist display names configurable; Maestro fixed. Display name/model/roster position never identity. Preserve plugin, member, rule, session, task, receipt and reference IDs across specialist renames.
3. **Existing Maestro boundary:** ratified `ComposedActor` contract uses RFC8785 canonical `{version:"maestro-actor-v1",projectId,sessionId,memberId}`. Inspected proposed Own contract supersedes older runtime-`own()` seam notes: static receipt-bound ownership skills, canonical unit identity, explicit drill pointers, rematerialization after affected PR/head change. Do not replace this with generic task-time Atlas query or memory writes in Maestro. The backend specialist proposal adds no authority to that boundary.
4. **Knowledge classes:** Atlas holds standing project/member rules, task/PR recall with outcome/evidence/head, fresh observed facts and references to skill revisions. Task-class procedures and stack/version/capability conditions remain in package/repository skills. Atlas can project bounded memory views without becoming another skill source. Incident/PR provenance stays attached to evidence; skill prose carries generalized lesson rather than diary.
5. **Update policy:** explicit durable correction or observed completed workflow can revise scoped memory or propose owning-repository skill patch. Unresolved attempt remains task evidence, not successful procedure. Transient setup failure records condition/remedy, never global capability ban. Conflict/supersession explicit; expected revision rejects stale destructive writes. Reuse Atlas memory write/materialization and host repository-change boundaries; missing seam is Atlas/host work, not private backend specialist service.
6. **Selection:** filter project/member/permissions/current applicability first; select bounded Atlas rules and relevant repository skills through host loader, then exact source drill-down. Separate direct user/project authority from advisory learned evidence. No automatic preference inference across members or PR numbers across repositories. No-op when current context already sufficient; correctness-required detail wins over token target.
7. **Freshness/cache:** receipts bind memory revisions, skill package/repository revisions, project/head snapshot, canonical units, renderer/tool-schema versions and ordered selected IDs. Host context epoch freezes selected projection; corrections and head changes invalidate affected receipts before reuse. Dedup only while same revision remains in active model context; compaction eviction clears that fact. Native provider behavior stays host-owned.
8. **All backend stacks:** base semantics language-neutral. Procedures specialize by repo evidence and versions—TypeScript/Node, Python, JVM, Go, Rust, .NET, Ruby, PHP and other host-supported stacks. Match actual DB/build/test/deployment tools, local/container/remote placement and available capabilities; neither TypeScript-only framework nor copied host-path assumptions. Add stack detail only when used.

## Held-out counterexamples and healthy controls — proposed, not run

Freeze training/capture examples separately from evaluation tasks. Include fresh sessions and resumes; evaluate saved lesson on later task, not same transcript that taught it.

| Counterexample / failure probe | Healthy control and required observation |
|---|---|
| Same project, two members prefer conflicting workflow; same member across two projects | Same-scope accepted rule reused; foreign rule never selected. Check stable IDs and actual prompt selection, not merely storage rows |
| Rename configurable specialist display name between save and recall | References, ownership and permissions resolve unchanged IDs; rendered label refreshes without duplicate records; Maestro remains fixed |
| Missing `pytest`/JDK/DB credential later repaired; model learned “tool unavailable” | Condition re-evaluated and valid command works; genuine stable version-specific restriction still applies |
| Failed migration/retry sequence described as successful skill | Remains unresolved task evidence; observed successful workflow with source result becomes candidate procedure |
| User narrows rule to one service; stale concurrent writer patches old global version | Scoped revision applies; stale write refused. Current same-revision edit succeeds and unrelated rules survive |
| Rare incident-recovery procedure unused for months; wrong procedure repeatedly viewed | Rare pinned/current procedure remains discoverable; repeated views alone never establish validity or success |
| Merge procedures with relative scripts/references and different backend versions | Every needed reference resolves; contradictory conditions remain separate. Compatible duplicate can consolidate with recoverable prior revision |
| Same PR number in different repos; automation floods recall; relevant text beyond read cap | Correct repo/head/member/task selected; exact bounded hydration reaches source. Healthy interactive and automation-only hits both reachable |
| Early “do not add new helper” past 4k/24k quote budgets; failed test output compacted | Constraint recoverable before action; failed stays failed. Summarized successful output still recognized accurately |
| Resume after another surface appended during summary; stale summary commits; DB publication fails | New input present exactly once; stale generation discarded; original recoverable. Normal commit/resume retains one coherent live history |
| Warm same-model cache vs switched model/account/tools; TTL expired; cache-less local runtime | Record provider-reported cache reads/writes and actual billed input; correct behavior survives cold cache, not fabricated savings |
| Micro absorbs tiny exchanges; large user pastes; summary refusal/length cap; repeated compactions | Batch-only control preserves answer quality; any micro benefit includes aux cost, cache refill, turn-close latency and delayed retrieval |

Use stack-stratified backend tasks: auth/authorization, transactions/migrations, queues/idempotency, dependency/build failures, observability and deployment. Pair same semantic task across supported language/runtime families; exercise host-supported provider routes with/without cache and reported usage. This is proposed coverage, not universal compatibility claim.

Primary outcomes: correct task result, rule precision/applicability, violated user constraints, stale/cross-member retrieval, unsupported “saved/succeeded” claims, exact-source recovery. Efficiency: tool calls/retries, selected vs hydrated bytes/tokens, provider-reported uncached/cache-write/cache-read/output/reasoning tokens, auxiliary usage and p50/p95 turn-close latency. Record model/provider/endpoint/account class, revisions, context size, TTL, tool schema, cache warmth, summary route, workload and repeated-run policy. Compare against host+Atlas baseline; accept efficiency only with held-out quality retained.

## Actual costs and recommendation order

| Mechanism | Costs established by code path; savings unmeasured here |
|---|---|
| Frozen facts | Replayed prompt bytes every request; cache-write/read charges, revision freshness delay, mutation/disk work |
| Progressive procedures | Catalog tax + selected body/reference tokens + tool rounds; dedup saves repeated payload only while earlier content survives |
| Self-review | Extra provider iterations, cached/uncached replay, output/reasoning; clone/guard/staging/retry work; cold digest sacrifices detail; budget can overshoot one request |
| Curator | Scans/stats/locks/archives/ledger/backups; opt-in consolidation adds potentially large model/tool loop and mistaken-merge recovery |
| Batch compression/recall | Summary request/retry, pruning/sampling loss, cold suffix refill, archive/index storage, retrieval calls and re-ingested result tokens |
| Micro-compaction | Frequent aux calls and suffix refill, post-stream delay, marker/rolling-summary overhead, possible context growth and DB recovery |

Upstream prose claims ~75% input-cost reduction, ~3–5× cheaper review, and a micro-compaction session with timing/occupancy examples. Inspected material lacks complete matched workload, exact deployment/pricing/cache conditions and held-out quality context for adoption here; **not the backend specialist estimates or established savings**. Static constants above are policy values, not measurements. “No LLM search call” means no auxiliary inference, not zero token/storage cost.

Priority: **(1)** scoped Atlas rules + exact recall receipts; **(2)** bounded repository-skill disclosure and evidence-linked corrections; **(3)** host prompt epoch/cache accounting and stale/dedup behavior. Consider automatic curation or finer compaction only after those controls expose net benefit. Specialist display names configurable; IDs persist; Maestro fixed.

## Pinned source index

[release]: https://github.com/NousResearch/hermes-agent/releases/tag/v2026.9.24
[tag]: https://api.github.com/repos/NousResearch/hermes-agent/git/tags/e3dd27ee2d8b011737a4eea8e3eb3d711ab78690
[D1]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/user-guide/features/memory.md
[D2]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/user-guide/features/skills.md
[D3]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/user-guide/features/curator.md
[D4]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/prompt-assembly.md
[D5]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/context-compression-and-caching.md
[D6]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/micro-compaction.md
[D7]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/guides/troubleshooting-agent-quality.md
[S1]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/memory_tool_store.py
[S2]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/memory_tool.py
[S3]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/system_prompt.py
[S4]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/prompt_builder.py
[S5]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/skills_tool.py
[S6]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/skill_manager_tool.py
[S7]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/curator.py
[S8]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/skill_usage.py
[S9]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/prompt_caching.py
[S10]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/conversation_loop.py
[S11]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/conversation_compression.py
[S12]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/context_compressor.py
[S13]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/usage_anchor.py
[S14]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/micro_compaction.py
[S15]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/session_search_tool.py
[S16]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/background_review.py
[S17]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/turn_finalizer.py
[S18]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/prompt_cache_scope.py
[S19]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/compression_facade.py
[T1]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/tools/test_memory_tool.py
[T2]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/tools/test_skill_manager_tool.py
[T3]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/tools/test_skill_view_dedup.py
[T4]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_background_review.py
[T5]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_curator.py
[T6]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_system_prompt.py
[T7]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_prompt_caching.py
[T8]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_context_compressor.py
[T9]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_usage_anchor.py
[T10]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/tools/test_session_search.py
[T11]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_micro_compaction.py

Additional inspected source: [memory initialization](https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/agent_init.py#L1323), [review spawn](https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/run_agent.py#L788), [review guards](https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/skill_manager_guards.py), [dedup keys](https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/skills_tool_dedup.py), [learn prompt](https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/learn_prompt.py), [provenance origin](https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/skill_provenance.py), [README claim](https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/README.md#L19).

## R25A — Offline self-evolution follow-up (2026-10-03)

**Identity/pin:** [GitHub repository metadata](https://api.github.com/repos/NousResearch/hermes-agent-self-evolution) confirms public, non-fork `NousResearch/hermes-agent-self-evolution`, owned by NousResearch organization. Observed default `main` resolves to **`0a929e3aa20e15cf04dc7c28492a7d41a5139125`**, committed 2026-06-17; [immutable tree][E0] anchors all links below.
**License:** README and package metadata declare **MIT, © 2026 Nous Research**. GitHub reports `license:null`; complete pinned tree contains README/pyproject/tests as positive controls but no LICENSE/COPYING file. Verified declaration, not bundled full license text; dependency licenses remain separate. [E0], [E1], [E2]
**Implemented reach:** offline skill wrapper exists; system-prompt evolution remains literal phase placeholder. README phases/guardrails are aspirations beyond implemented path. Dependency is `dspy>=3.0.0`, with no lockfile in pinned tree; exact installed optimizer proposal/Pareto/selection behavior is not fixed by this repo. [E0], [E1], [E2], [E13]

### Actual candidate → evaluation → selection → persistence chain

1. **Seed/generate:** CLI `main → evolve → find_skill/load_skill` reads repo `skills/**/SKILL.md`, separating frontmatter/body. Build dataset, configure only `dspy.LM(eval_model)`, instantiate `SkillModule(body)`. Calls `dspy.GEPA(metric=skill_fitness_metric,max_steps=iterations).compile(trainset,valset)`; candidate proposal/selection delegated to installed DSPy. Any exception in construction/compile invokes `MIPROv2(auto="light").compile(trainset)` instead, omitting explicit valset. `optimizer_model` is recorded/printed but not passed to reflection LM. [E3], [E4]
2. **Trial/evaluator:** `SkillModule.forward → ChainOfThought(TaskWithSkill)(skill_instructions=self.skill_text,task_input) → Prediction(output) → skill_fitness_metric`. This is text-response evaluation, not Hermes tool execution. Metric: empty output→0; otherwise `0.3 + 0.7 × expected-word-set overlap` (empty rubric→0.5). `trace` ignored. Rich `LLMJudge` and length penalty exist but this loop never calls them. Negated/wrong output containing rubric words can score perfectly. [E4], [E5]
3. **Export disconnect:** returned module evaluated as compiled predictor, but exported body is `optimized_module.skill_text`, plain attribute supplied as predictor input. Repository implements no mapping from optimized predictor instructions/demos back into that attribute and does not serialize/reload compiled predictor. Thus compiled-module score is not evidence exported `SKILL.md` reproduces improvement. [E3], [E4]
4. **Local validity:** `validate_all(evolved_body,"skill",baseline_text=body)` checks character count ≤15,000, growth ≤20%, nonempty, and superficial frontmatter markers/name/description substrings. It receives **body**, although `load_skill` removed frontmatter and validator requires it. Normal frontmatter-bearing input therefore hits structural rejection; baseline rejection merely warns, final rejection writes `output/<skill>/evolved_FAILED.md` and returns before holdout. Static call-chain finding, not executed reproduction. [E3], [E4], [E6], [E9]
5. **Conditional holdout/acceptance:** if validity passes, evaluate baseline and compiled module on holdout using same lexical metric; compare arithmetic means. `improvement > 0` changes success message only. Tied/regressed candidates still saved. No local per-task non-regression threshold, uncertainty interval, semantic-preservation oracle, or exported-artifact replay admission in this path. [E3], [E5]
6. **Persistence:** successful validity path writes `output/<skill>/<second-resolution timestamp>/{evolved_skill.md,baseline_skill.md,metrics.json}` regardless score delta. Metrics hold means/config/counts/optimization elapsed time, not per-trial evidence, chosen fallback engine, dependency/artifact hashes or billed usage. Failed file uses fixed name, overwriting earlier failed result; exceptions outside optimizer fallback can abort without run record. Repository skill is not replaced and PR is not created by inspected orchestrator, despite `create_pr=True` config/README diagram. [E3], [E9]

### Held-out data, budgets, failures and overfitting

- **Synthetic/golden split:** synthetic generator reads original skill and requests 20 cases; unseeded row shuffle then 50% train/25% val/remainder holdout. Golden loader accepts saved splits or shuffles single file likewise. Missing split files become empty lists; tiny datasets can leave empty holdout; means divide by `max(1,n)`, yielding zero without rejecting invalid evaluation. Configured `holdout_ratio` is not used by split arithmetic. [E7], [E9]
- **Session-derived data:** `build_dataset_from_external → importers → heuristic relevance → LLM relevance/rubric → EvalExample → row shuffle/save`. “sessiondb” currently mines Hermes JSON transcript files plus Claude/Copilot history, not Hermes SQLite. Hermes pairing takes first subsequent nonempty assistant message, not verified task success. Project/session IDs disappear on conversion to EvalExample; splits are not grouped by task/project/session or deduplicated. Existing mistakes can seed rubrics and related turns leak across splits. [E8]
- **Held-out boundary:** GEPA receives train+val, not holdout; fallback receives train only. Holdout is reserved within one invocation but repeatedly inspecting its scores while retrying optimizers reuses test evidence for selection. Synthetic cases/rubrics share original artifact/model assumptions; category/difficulty metadata does not enforce stratification. No fresh external regression set is consulted by `evolve`. [E3], [E7], [E8]
- **Budgets/failures:** requested iteration count only reaches GEPA `max_steps`; fallback does not receive it or configured population size. External relevance caps candidates at `3×max_examples` (default 50 outputs), catches scoring exceptions and continues; undersized result only warns. No orchestrator-wide dollar/token/wall-clock budget; reported elapsed excludes dataset construction and holdout. Costs include dataset/relevance calls, optimizer trials and two answer generations per holdout example. README dollar estimate is not transferable measured cost. [E3], [E8], [E9]
- **Regression oracles:** `run_test_suite` can invoke pytest with 300s timeout, but `validate_all/evolve` never calls it—even with `--run-tests`. TBLite flag/2% threshold and PR flag are unused by inspected path; per-candidate constraints are not metric gates. Size counts characters, not bytes/tokens; structural check does not parse YAML or prove purpose. [E3], [E6], [E9]
- **Evidence reach:** inspected parser/constraint tests exercise components separately; CLI test exits through `--dry-run`; importer split test stubs import/relevance, and small-dataset test explicitly permits one example. None constitutes executed candidate→export→reload quality proof. PDF generator hardcodes results for BootstrapFewShot on tiny synthetic validation, explaining improvement via injected demos—not exported skill rewrite. Tests/benchmarks not run here; published numbers not adopted. [E10], [E11], [E12], [E14], [E15]

### The backend specialist transfer: bounded offline experiment through existing host

- Keep skill/prompt candidates in owning package/repository revisions; Atlas owns memory, trial evidence/provenance and pointers to those revisions. No duplicate skill source store, DSPy/GEPA dependency by default, or live self-modifying daemon. The backend specialist stays standalone; Maestro integration optional.
- Reuse host task execution to evaluate **exact exported artifact after reload** against baseline on frozen development/validation tasks; inspect sealed, independently grouped holdout only at promotion decision. Record candidate/skill revision, task-group/split hashes, model/tool/backend versions, actual results, failed trials and token/time spend in Atlas. Bound whole campaign; failure stays distinct from bad score and from skipped test.
- Promotion proposed only when executable correctness/regression oracles preserve critical cases and held-out quality meets predeclared rule; lexical score alone insufficient. Healthy controls/counterexamples: correct paraphrase vs rubric-word-stuffed wrong answer; real failing tool execution vs fluent success claim; changed predictor with byte-identical exported skill; missing holdout vs valid grouped set; cheaper average with one broken critical backend task. Use package owner’s existing review/release path, retaining incumbent on failure/tie/insufficient evidence.
- Only specialist display names configurable; immutable specialist IDs survive rename. Maestro name/identity fixed. Offline optimizer has no authority to rewrite identity, ownership policy or its own acceptance oracle.

### New pinned sources

[E0]: https://github.com/NousResearch/hermes-agent-self-evolution/tree/0a929e3aa20e15cf04dc7c28492a7d41a5139125
[E1]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/pyproject.toml
[E2]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/README.md
[E3]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/evolution/skills/evolve_skill.py
[E4]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/evolution/skills/skill_module.py
[E5]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/evolution/core/fitness.py
[E6]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/evolution/core/constraints.py
[E7]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/evolution/core/dataset_builder.py
[E8]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/evolution/core/external_importers.py
[E9]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/evolution/core/config.py
[E10]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/generate_report.py
[E11]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/tests/core/test_constraints.py
[E12]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/tests/skills/test_skill_module.py
[E13]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/evolution/prompts/__init__.py
[E14]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/tests/core/test_config_repo_path.py
[E15]: https://github.com/NousResearch/hermes-agent-self-evolution/blob/0a929e3aa20e15cf04dc7c28492a7d41a5139125/tests/core/test_external_importers.py
