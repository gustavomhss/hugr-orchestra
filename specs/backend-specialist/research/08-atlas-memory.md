# R08 — Atlas-native memory vs Letta/MemGPT and Graphiti/Zep

Research date: 2026-10-03. Atlas baseline: `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`.

## Decision

**Keep Atlas as shared foundation. Borrow memory lifecycle mechanisms, not another memory database.** Best transfers: bounded hot/cold context, stable identity independent of Session/display name, evidence-linked corrections, explicit checkpoint succession, scope-first selection, and task-level evaluation.

The backend specialist runs on OpenCode/Orchestra independently of Maestro. Native Maestro integration supplies orchestration context through adapters; Atlas continues owning shared code-grounded Knowledge and per-member Memory. Task/PR recall stays explicit, except own resumed unit's closing fold once at spawn. Project rules persist across Sessions and display rename. These are target requirements from brief, not claims that every host integration already ships.

**Important distinction:** Atlas already implements durable memory doors. Biggest gaps concern projection semantics and host consumption, not missing storage. Memory and Knowledge share Atlas, but current physical storage differs: `.atlas/memory.jsonl` versus Knowledge CAS/projection. “One Atlas” does not mean one physical file. [A-contract], [A-compose], [A-store]

## Evidence boundary and pins

- **Observed** = inspected executable source at pinned revision. Static inspection, not runtime verification.
- **Documented/reported** = official docs, prompts, or authors' papers. Product claims and published measurements remain attributed.
- **Proposed** = Atlas-compatible design inference; no implementation implied.
- Tests inspected for their actual inputs/reach. No suites, benchmarks, hosted agents, or model evaluations executed. Falsification cases below remain proposals/source-derived predictions.

| Source | Pin / boundary |
| --- | --- |
| Atlas | Local full worktree at revision above; citations use repository-relative paths and line anchors. |
| Letta historical V1 server | `letta-ai/letta@56ba9c25552605eec89de8ed3dc6394b625c1993`, `archive` branch when inspected. |
| Letta repository handoff | `letta-ai/letta@5bcdd177d70fa2b31a754cfcd801e77b2e1ab16a`; README directs active development to `letta-code`. [L-handoff] |
| Current Letta Code | `letta-ai/letta-code@bc4b97c3185302890cfb511c6d1e49f49fc5300c`. |
| Graphiti | `getzep/graphiti@3c427640abf909f12f71f963fce15eb514a3c493`. |
| LongMemEval | Authors' repository `xiaowu0162/LongMemEval@9e0b455f4ef0e2ab8f2e582289761153549043fc`. |
| Papers / live docs | MemGPT `2310.08560v2`; Zep `2501.13956v1`. Official web docs accessed on research date; unversioned docs can change. |

## Atlas source baseline: contract versus implementation

| Area | Observed mechanism | Precise fit / gap |
| --- | --- | --- |
| Production wiring | `composeRuntime` constructs durable memory, scanner, emit/read doors; returns recall/header/awareness/orientation. MCP advertises and routes those read operations. | “REFERENCE MODEL — NO PRODUCTION CALLERS” headers in `memory-read.ts`, `memory-emit.ts`, and `memory-store.ts` are stale. Existing CLI/MCP seams make standalone backend specialist integration plausible. Returning a header is not proof host injects it. [A-compose], [A-mcp] |
| Durable records | `versioned` wraps records in content-addressed events; `createDurableMemory` appends JSONL; `respawnFromRecord` maps event payloads back to records. Memory events set `fresh: true`, `supersedes: []`, and omit `nodeKey`. | Retention/idempotent record membership exist. Memory does not thereby inherit kernel's node-head/supersession projection: kernel `fold` skips events without `nodeKey`. Persistent bytes alone do not identify current checkpoint. [A-store], [A-respawn], [A-kernel] |
| Injection and recall | Running header contains only own `project` entries plus shared slabs. Runtime ranker reads owner and kind, not entry `scope`. Recall recognizes optional `owner`, `kind`, `taskId`, `prId`; requires at least one recognized selector. | MEM-1 is injection scoping, not filesystem confidentiality. Explicit recall can cross owners and can query `project`; actor is not automatically applied. Reviewed recall path has neither pagination nor date/territory selection. Empty selector protection does not bound a broad `{kind: "task"}` result. [A-inject], [A-read], [A-mcp] |
| Project rule identity and selection | Latest record per exact `entry.rule` text wins; ranked score is stored frecency multiplied by `0.5 ** age`, with age measured in unique folded records across every owner/kind. Retain top 12 above/equal to `0.1`. | Rule text doubles as identity. Same text/different scopes collide; changed wording creates another rule. Caller-supplied stored score is not proof of cited use. Exact identical reappend deduplicates, so does not refresh position. `respawnRule` returns retained entry without changing eligibility. [A-read], [A-rules], [A-log] |
| Bounds | Governed emit counts every retained project record for that owner plus candidate. `tok` counts whitespace-separated words in `rule` only. Validator enforces allowed keys and field types. | Contract's approximate model-token cap is not actual rendered-token accounting. Historical versions consume write allowance although read slab deduplicates/evicts. Scope/grounding bytes are uncounted. Reviewed validator body does not enforce task/PR character caps or imperative/dedup semantics promised in prose. [A-emit], [A-rules], [A-template] |
| Resume folds | `foldArchiveFromRecord` filters only `task`; `makeRespawn` uses first matching owner/kind/unit via `.find`. Repeated lookup returns copied fold again. | No task-close/archive predicate in this projection; `MemoryRecord` has no lifecycle marker. Durable PR-to-fold projection is missing here. Once-per-spawn delivery belongs to host lifecycle; reviewed `composeRuntime` return surface does not expose `spawnFold`. PR held-out tests construct `ArchivedFold` directly and explicitly exclude PR record projection. [A-respawn], [A-types], [A-compose], [A-pr-test] |
| Governed writes | Kind derived from closed payload shape; types checked; empty owner refused through `put`; logbook restricted to `orch` and one entry per PR; project cap and named scanner precede append. | Reuse this door. A second entry for same logbook PR is rejected even though refusal suggests a supersede pointer; current template offers `links`, not a first-class correction operation. New temporal/lineage fields require Atlas schema evolution, not stuffing extra keys into existing payloads. [A-emit], [A-template] |
| Read integrity / assembly | Durable reader reports rejected lines; memory header/recall consume only store/log. Shared verdicts return `ok: true` over returned data. Orientation's durable adapter rereads log and calls `orient` each time. | Partial/corrupt history can look like complete/empty successful recall at these doors. Pure memoization/incremental-fold capabilities in reference do not establish end-to-end incremental durable assembly. Costs and degradation receipts need measurement at actual consumer. [A-durable], [A-read], [A-verdict], [A-orientation] |

**Knowledge already has distinct identity/governance semantics.** Deterministic `routeWrite` distinguishes byte deduplication, new node creation, advisory update, and same-check predicate supersession. Reducer retains CAS content, claim provenance, and incumbent scope/tier protections. Composition wires structural grounding/reconciliation. Reuse those mechanisms for code facts; conversational contradiction inference must not replace them. [A-router], [A-upsert], [A-compose]

## Six primary-source findings

### 1. MemGPT's transferable idea is context movement; current Letta adds git-backed progressive disclosure

**Primary evidence.** MemGPT §§2.1–2.4 describes fixed working context, durable recall/archival stores, pressure warnings, queue summarization, explicit paginated retrieval, and model-requested function chaining. Paper also reports agents sometimes stop retrieval too early. Historical Letta `Memory.compile` renders blocks with descriptions/size metadata; `memory_replace` requires a unique exact match, while `memory_rethink` replaces a whole value. These are distinct edit contracts. [P-memgpt], [L-memory], [L-tools]

**Current-source correction.** Active Letta is no longer adequately described as only the V1 database/block architecture. `memory-filesystem.ts` derives per-agent directories and initializes/clones git memory. `memory-format.ts` explicitly distinguishes legacy `system/` core memory from MemFS v2 root Markdown, selected by `MEMORY.md`. Current constraints code counts complete files and aggregate core characters. Live SDK memory docs still describe `system/`; current MemFS docs and source explain newer root layout. Treat this as version skew. [L-handoff], [L-filesystem], [L-format], [L-constraints], [D-letta-memory], [D-memfs]

**Atlas fit.** Keep bounded project rules resident; expose compact discovery/recall affordances for task/PR history. A paged result should carry stable record identity, continuation cursor, returned-budget receipt, and truncation/completeness state. Reuse existing Atlas records and host context assembly. MemGPT heartbeat loop is not the backend specialist's execution model; OpenCode/Orchestra remains runtime owner.

**Cost / falsification.** Per-turn context remains recurring cost even when bytes are stable. Paging trades smaller prompts for tool/model round trips. Test large recall, long no-whitespace rules, huge grounding fields, and evidence on a later page. Success requires bounded rendered context *and* successful retrieval, not merely fewer returned bytes.

### 2. Stable identity and explicit scope survive Sessions, names, and concurrent work

**Primary evidence.** Letta V1 block `id` is separate from `label`; blocks attach to agents. Current Letta memory directories key on `agentId`; SDK docs distinguish persistent agent, conversation, and connection Session. Graphiti records `group_id`, threads it through search, and `_resolve_request_scope` returns request-local driver/client bundles rather than mutating shared database target during awaited ingestion. Official namespacing docs explicitly say namespace filtering is not application authorization. [L-block], [L-block-manager], [L-filesystem], [D-letta-sessions], [G-engine], [G-search], [D-groups]

Vocabulary differs: Letta's connection Session is not OpenCode's durable Session. Borrow identity separation, not lifecycle types.

**Atlas fit / gap.** Repo path currently selects memory file; opaque owner string selects member. `composeRuntime(repoPath)` resolves actor once from `ATLAS_ACTOR ?? gitUserEmail(repoPath) ?? ""`. The backend specialist needs stable host project/member binding independent of Session ID, display name, current title, or process-global environment switching. Default git email can conflate several agents launched by one developer. Preserve foundation's opaque owner: host/Maestro adapters supply identity; Atlas need not import seat orchestration. [A-contract], [A-compose], [A-types]

**Proposed scope order:** resolve project/store and member → choose Memory kind/unit → match work applicability → resolve current/superseded state → rank → budget. Name changes modify display metadata only. Maestro and standalone adapters must resolve same persistent member/project when intended; separate projects must not converge because names match.

**Cost / falsification.** Identity mapping and scope selectors are small deterministic work but migration decisions matter. Test restart/new Session, member/project display rename, same name in distinct projects, two concurrent members, and native/standalone alternation. Include positive control: foreign Memory bytes remain repo-readable while own header excludes them. MEM-1 must not be relabeled access control.

### 3. Graphiti separates evidence time from ingestion time; contradiction handling remains fallible inference

**Primary evidence.** `EntityEdge` carries `created_at`, `expired_at`, `valid_at`, `invalid_at`, `reference_time`, and source episode IDs. Resolver deduplicates matching endpoints/normalized text before model work; otherwise retrieves candidates, asks model for duplicate/contradicted indices, validates index ranges, and applies temporal overlap logic. Older incoming information can itself receive an end date when a later-valid conflicting edge exists. Equal/unknown starts do not take the simple strictly-earlier invalidation branch. Thus “latest arrival always wins” is an inaccurate account of inspected code, despite wording in 2025 paper. [G-edges], [G-resolve], [G-dedupe], [P-zep]

**Provenance limit.** Episode IDs provide traceability, not proof a claim is true. `store_raw_episode_content=False` explicitly clears raw episode content before persistence. Multi-episode extraction falls back to attributing all episodes if no usable indices remain. “Full provenance/non-lossy memory” depends on capture configuration and attribution quality. Zep's context-construction docs instruct callers to render validity dates so old facts do not look current. [G-engine], [G-resolve], [D-zep-context]

**Atlas fit.** Memory corrections should append evidence-linked successor/retraction records, retaining prior bytes. Distinguish: observation source; when lesson/decision applied; when Atlas recorded it; what it corrects. For code-grounded Knowledge, validity is primarily revision/structural-grounding dependent, often branch-specific—not a single wall-clock interval. Atlas already has CAS and structured transcript/checkpoint references; link those rather than duplicating complete conversations. Memory's optional `ref`/`grounding` accepts a structured anchor or bare string; neither requires explicit source-event lineage. [A-types], [A-persist-types], [A-router]

**Contradictions:** opposite rules in same applicability scope need explicit resolution/contested state. Distinct environments or time ranges can both be valid. Model suggestions can identify candidate conflicts, but candidate search and model classification are not authoritative code truth. Current exact rule-text identity does not resolve semantic opposites. [A-read], [G-resolve]

**Cost / falsification.** Explicit corrections over known IDs are deterministic and avoid embedding cost. Automatic extraction adds model calls, candidate retrieval, false merges, and adjudication work. Test late-arriving old evidence, equal/unknown dates, retracted observations, quoted assistant speculation, same text at different revisions, and disjoint scopes. Never let a new conversational claim silently displace grounded Knowledge.

### 4. Checkpoint succession needs an explicit head and coverage boundary; retention alone cannot supply either

**Primary evidence.** Letta V1 `checkpoint_block_async` stores snapshots with sequence number and actor, advances `current_history_entry_id`, and has explicit undo/redo navigation. ORM maps a version column for optimistic concurrency. Routine also intends to delete future checkpoints after undo—useful cursor pattern, incompatible retention policy for Atlas. Its async deletion call is not awaited in inspected source, so actual pruning is not verified here. This is block-history checkpointing, not deterministic model execution resume. [L-block-manager], [L-block-orm]

Graphiti sagas have episode succession edges and distinct ingestion versus episode-valid-time summary watermarks. `summarize_saga` filters by ingestion time so late backfills can enter later summaries. But inspected code limits fetched episodes and sets ingestion watermark to `utc_now()` after model generation. That is not sufficient evidence of complete coverage under backlog or concurrent ingestion; bounded batch plus moving watermark needs falsification. [G-engine]

**Atlas gap.** Memory currently chooses first own matching task record; a later fold for same task can remain unselected. Generic kernel's deterministic hash head is not semantic “latest checkpoint” and Memory does not use that node fold anyway. `@atlas/persist` explicitly offers redispatch and faithful replay of recorded I/O, not deterministic continuation. [A-respawn], [A-kernel], [A-persist]

**Proposed transfer.** Atlas-owned checkpoint identity plus explicit predecessor/supersedes relationship, unit/owner, lifecycle state, and source coverage boundary. Select valid successor chain; report concurrent incomparable heads rather than silently guessing. Keep correction history, including branches. Host uses durable spawn/context identity to deduplicate one-time fold inclusion across delivery retries; next genuine spawn can recall again. Include durable PR projection and distinguish missing, conflicting, corrupt, and available fold outcomes. These require contract work; current closed templates cannot accept added fields unchanged. [A-template]

**Cost / falsification.** Additional event metadata, head/lineage projection, and host delivery receipt. Test fold A→B selects B; merged incomparable B/C stays explicit; byte-identical replay is idempotent; PR round-trip works; replayed spawn callback does not duplicate context; crash after context persistence does not erase or repeat side effects. Snapshot replay must never be sold as safe provider/tool re-execution.

### 5. Graphiti's candidate → rank → construct pipeline transfers; its default vector stack and mention counts do not

**Primary evidence.** Graphiti edge/node search selects configured BM25/cosine/BFS candidate methods, reranks, and limits results. Recipes choose RRF, MMR, node distance, episode mentions, or cross-encoder. Edge cross-encoder path first RRF-shortlists candidates; edge episode-mentions mode orders by evidence episode count. `SearchFilters` exposes temporal predicates. Filtering/ranking/formatting are separate decisions; a bounded result count is not a prompt-token bound. [G-search], [G-recipes], [G-filters], [D-zep-context]

**Atlas fit / gap.** First use exact project/member/unit/scope and Atlas structural relations. For explicit recall, evaluate inexpensive lexical selection and deterministic rank fusion only if exact selectors underperform. For project rules, current top-12 ranking ignores applicability and decays by unrelated writes. Worked source-derived example: stored score `1` stays above `0.1` after three unique later appends (`0.125`), falls below after four (`0.0625`), even if all belong to another member. [A-read], [A-rules]

Rule-use signal should retain MEM-7 meaning: cited as governing decision. Retrieval, injection, citation, and measured benefit are different observations. Repeated mentions are not evidence of correctness or benefit. Current stored-number bridge and pure cited-hit ledger are different models; neither should be described as complete production cited-use feedback. Reaffirmation and archive reactivation also need real durable events rather than a read returning an old entry. [A-contract], [A-read], [A-rules]

**Cost / falsification.** Existing durable path rereads full JSONL; ranker scans records and searches positions. `createLog.append` and `combine` copy growing maps during reconstruction, adding scaling cost beyond prompt size. Rebuildable Atlas indexes/caches can help without becoming another source of truth. No latency measured here. [A-durable], [A-log]

Test cross-member churn, same text/different scope, exact retry versus genuine cited-use event, obsolete-but-popular rule, empty matching scope, and token-budget boundary. Compare omission cost against prompt savings; promote no heuristic solely because it improves hit count.

### 6. Evaluation must measure decisions and lifecycle failures, not vendor leaderboard rank

**Primary evidence.** MemGPT DMR tests recall from multi-session chat and compares against lossy-summary baselines. Zep paper reports DMR `94.8%` versus cited MemGPT `93.4%`, but its own full-conversation baseline reaches `94.4%` with GPT-4 Turbo. Paper states its attempted LongMemEval MemGPT setup did not produce a successful comparison. Its latency/context table describes that experiment, not Atlas economics or current Graphiti deployment performance. These are authors' results, not reproduced R08 measurements. [P-memgpt], [P-zep]

LongMemEval authors distinguish information extraction, cross-session reasoning, knowledge updates, temporal reasoning, and abstention. Oracle file contains only evidence sessions; retrieval evaluation omits abstention cases while answer evaluation can cover them. Graphiti's inspected `eval_e2e_graph_building.py` selects oracle data and grades graph-building outputs against baseline with an LLM. That file is not end-to-end proof of task success or long-history retrieval. Authors' README also points to newer agentic LongMemEval-V2; pin benchmark version rather than mixing generations. [E-lme], [G-eval]

**Atlas evaluation proposal.** Run identical historical task/PR sequences through: current Atlas; proposed correction/scope/head semantics; and matched-budget simpler selection. Hold model, source order, task difficulty, and context ceiling fixed. Measure:

- Correct next action and completion; repeated failed approach; wrong/superseded rule followed.
- Evidence precision/recall and citation validity; answerable versus genuinely missing evidence; explicit abstention.
- Own-member injection, scope matching, Session/rename persistence, checkpoint selection and once-per-spawn inclusion.
- Full read/ingestion/consolidation cost, prompt tokens, cache behavior, time to first usable context, and recovery after interrupted writes.

Use positive controls, deliberately wrong predecessor/owner/validity mutations, and human spot-checks of model grading. An empty result caused by unavailable/corrupt history must not earn an abstention success. Cold tests must emit real task/PR records through durable doors and consume actual host context, not start from already-projected folds. [A-pr-test], [A-read-test], [A-verdict]

## Proposed integration shape and costs

**Foundation responsibility:** schemas, append-only Memory history, correction/head projections, rule applicability/selection, query budgets and integrity receipts. Shared Knowledge keeps its existing grounding/admission/reconciliation authority.

**The backend specialist/OpenCode adapter responsibility:** stable project/member/store binding; supply path/tool/phase applicability; expose explicit recall; inject bounded project slab at host context boundary; deliver own resumed fold once; record source/citation/context receipts. Session-owned history remains host history. Task recall never becomes automatic similarity injection on every turn.

**Native Maestro adapter responsibility:** map seat/unit/PR identity and lifecycle events into same foundation operations. Standalone execution must not require Maestro's scheduler, seat registry, or memory service. A display rename changes neither persisted owner nor project identity. Current env/git-only composition seam needs deliberate host binding; process-global actor changes during concurrent calls are unsuitable. [A-compose], [A-contract]

| Transfer | Added cost | Keep / avoid |
| --- | --- | --- |
| Stable identity + scope-first reads | Host mapping, selector plumbing, migration compatibility. | Keep. Fixes relevance/lifecycle semantics without model calls. |
| Explicit corrections + checkpoint chain | Schema/versioning work; retained metadata; conflict projection and delivery receipts. | Keep inside Atlas; validate branch/merge semantics. |
| Bounded recall + discovery | Cursor/index/render work; additional calls when paging. | Keep; measure full rendered budget. |
| Cited-use ranking | Durable citation producer and stable rule ID; evaluation to calibrate decay. | Keep MEM-7 distinction between shown, cited, useful. |
| Background consolidation | Additional model calls, source reads, concurrent-write handling, delayed visibility. | Consider only after foreground correctness and measured benefit. Letta documents dreaming, but automatic project promotion would violate Atlas's deliberate promotion contract. [D-letta-memory], [A-contract] |
| Wholesale Graphiti / V1 Letta storage | Graph/SQL service, embeddings, extraction, reranking, synchronization, duplicate authority. | Outside target architecture. Graphiti defaults initialize LLM/embedder/reranker and graph driver; none required for the lifecycle patterns above. [G-engine] |

Cost model should include capture + validation/scanning + history/index maintenance + selection/rendering + main-model context + consolidation + persistence/sync. “Free retrieval” hides ingestion; “small prompt” hides growing archive reconstruction. Read/write cap checks also span a read then append: atomic append alone does not make cap or logbook-uniqueness decisions atomic across concurrent writers. This is a source-derived concurrency concern, not a reproduced failure. [A-emit], [A-durable]

## Falsification matrix

Cases specify future experiments. Predicted current behavior comes from cited source; no runtime verdict claimed.

| Case | Required observation / counterexample |
| --- | --- |
| Task checkpoint A then corrected B | Current `.find` selects A. Proposed lineage selects B and keeps A inspectable. Same test with actual PR entry must cross durable projection, not synthetic `ArchivedFold`. [A-respawn], [A-pr-test] |
| Duplicate callback versus new spawn | Same spawn/context retry includes fold once; new spawn includes own current fold again; running turns never receive general task/PR history. |
| Rename + new Session + native/standalone switch | Stable identity retrieves same project rules, while identical display name in another project does not. |
| Same member, two applicability scopes | Matching scope alone eligible; same rule text in both scopes does not overwrite identity accidentally. Current ranker has no work-scope argument. [A-read] |
| Opposite rules / backdated correction | Preserve both evidence trails; select by scope and explicit succession; unknown/equal validity remains unresolved rather than arbitrarily newest. |
| Repeated activity by another member | Measure unwanted eviction from global log-position decay. Control: reads alone and exact deduplicated reappend do not advance folded age. [A-read], [A-log] |
| Lifetime write allowance | Many historical versions then small eligible hot set: current all-history cap can reject fresh useful rule. Budget should price defined eligible slab and final rendering. [A-emit], [A-rules] |
| Corrupt line / scanner unavailable | Read integrity receipt distinguishes partial/unavailable from complete empty; scanner failure stays named pre-write refusal. Current public read verdict discards rejection count. [A-durable], [A-verdict], [A-emit] |
| Concurrent near-cap writes / same-PR logbook writes | Exercise read-check-append race; retain every admitted record without allowing aggregate invariant breach. O_APPEND protects append position, not multi-step admission. |
| Branch merge / reordered records | Same event membership must not silently change semantic head or applicability. Current first-fold and log-position scoring can depend on physical/union iteration order. [A-respawn], [A-log], [A-read] |
| Graphiti recurring exact fact | Same endpoint/text but different valid interval exercises duplicate fast path, which reuses prior edge before temporal contradiction processing. Prevent copying that assumption into Atlas. [G-resolve] |
| Graphiti summary backlog / concurrent ingest | More than fetched batch, or new episode arriving during summary generation, tests whether post-generation wall-clock watermark skips unseen evidence. Prefer acknowledged source coverage over current time. [G-engine] |
| Behavioral value | Hold prompt/model budget fixed; remove or corrupt governing rule. Evaluation must detect worse next action, not merely reduced retrieval/citation count. |

## Verified licenses and reuse boundary

| Artifact inspected | Verified license |
| --- | --- |
| Letta V1 archive | Apache-2.0. [LICENSE][L-license] |
| Current Letta Code | Apache-2.0, with explicit brand-assets exclusion for Letta names/logo/wordmark/images/ASCII art. [LICENSE][LC-license] |
| Graphiti | Apache-2.0. [LICENSE][G-license] |
| LongMemEval repository | MIT. This verification covers repository license; no blanket claim about all separately hosted dataset/source-corpus rights. [LICENSE][E-license] |
| MemGPT paper v2 | arXiv page labels CC BY 4.0. [P-memgpt] |
| Zep paper v1 | arXiv page labels CC BY-NC-SA 4.0. Paper license differs from Graphiti code. [P-zep] |

Zep's own current Graphiti README distinguishes OSS framework from managed Zep and proprietary Context Graph Engine. Hosted latency/governance claims are documentation claims, not source-observed guarantees or inherited OSS licensing. Reuse patterns in Atlas; any later code borrowing must retain applicable notices and inspect exact borrowed files/dependencies. [G-readme]

## What initial framing missed

1. **Product generations moved.** MemGPT paper, archived Letta V1, current git-backed Letta Code, Graphiti library, and managed Zep are different evidence targets. Modern Letta already uses filesystem/gitrepo progressive disclosure without default MemFS vector index. [L-handoff], [D-memfs]
2. **Storage integrity, epistemic validity, and execution recovery are separate.** A content hash proves byte identity; an episode proves recorded provenance; neither proves a lesson true or tool retry safe. Atlas PERSIST explicitly distinguishes replay from continuation. [A-log], [G-edges], [A-persist]
3. **Atlas's immediate problem is semantic heads and scoped consumption.** Existing durable doors are real. PR projection, first-fold selection, applicability, citation production, word-count budgets, and partial-read receipts define more concrete next work than “add long-term memory.” [A-compose], [A-respawn], [A-read], [A-rules], [A-verdict]
4. **Merge/concurrency and provenance need separate evidence.** Grow-only record membership does not imply order-independent rule selection; append atomicity does not imply atomic admission; source linkage does not imply authentic author or fresh code grounding. [A-log], [A-read], [A-emit], [A-compose]
5. **Foundation independence is architectural leverage.** The backend specialist and Maestro should share Atlas semantics and receipts while host lifecycle stays host-owned. Replacing foundation with a conversational graph would weaken code-grounded authority and create migration/synchronization cost without resolving these gaps.

## Source register

### Atlas — pinned local source

Contract: [A-contract]. Main source trace: [A-respawn], [A-inject], [A-read], [A-emit], [A-store], [A-compose]. Supporting schema/budget: [A-types], [A-template], [A-rules]. Transport/integrity: [A-mcp], [A-durable], [A-verdict], [A-orientation]. Existing algebra/Knowledge/replay: [A-log], [A-kernel], [A-router], [A-upsert], [A-persist], [A-persist-types]. Test reach: [A-pr-test], [A-read-test].

[A-contract]: foundation/atlas/docs/reference/atlas-memory.md
[A-respawn]: foundation/atlas/packages/memory/src/respawn.ts#L43-L175
[A-inject]: foundation/atlas/packages/memory/src/inject.ts#L78-L202
[A-types]: foundation/atlas/packages/memory/src/types.ts#L18-L144
[A-rules]: foundation/atlas/packages/memory/src/rules.ts#L90-L235
[A-template]: foundation/atlas/packages/memory/src/template.ts#L53-L300
[A-read]: foundation/atlas/packages/adapter-io/src/memory-read.ts#L129-L238
[A-emit]: foundation/atlas/packages/adapter-io/src/memory-emit.ts#L116-L239
[A-store]: foundation/atlas/packages/adapter-io/src/memory-store.ts#L19-L62
[A-compose]: foundation/atlas/packages/adapter-io/src/compose.ts#L163-L596
[A-mcp]: foundation/atlas/packages/mcp-server/src/server-memory-tools.ts#L25-L121
[A-durable]: foundation/atlas/packages/adapter-io/src/durable-log.ts#L85-L149
[A-verdict]: foundation/atlas/packages/adapter-io/src/memory-verdicts.ts#L17-L83
[A-orientation]: foundation/atlas/packages/adapter-io/src/orientation-store.ts#L59-L77
[A-log]: foundation/atlas/packages/kernel/src/log.ts#L56-L94
[A-kernel]: foundation/atlas/packages/kernel/src/fold.ts#L98-L183
[A-router]: foundation/atlas/packages/knowledge/src/write/router.ts#L98-L148
[A-upsert]: foundation/atlas/packages/knowledge/src/write/upsert.ts#L261-L406
[A-persist]: foundation/atlas/packages/persist/src/reinvoke.ts#L15-L76
[A-persist-types]: foundation/atlas/packages/persist/src/types.ts#L55-L75
[A-pr-test]: foundation/atlas/packages/memory/test/wp-3.5-b-mem.heldout.test.ts#L1-L159
[A-read-test]: foundation/atlas/packages/adapter-io/test/memory-read.test.ts#L68-L138

### Letta / MemGPT — official repositories, docs, authors' paper

Original mechanism: [P-memgpt]. Version handoff: [L-handoff]. V1 blocks, editing and checkpointing: [L-block], [L-memory], [L-tools], [L-block-manager], [L-block-orm]. Current runtime: [L-filesystem], [L-format], [L-constraints]. Live docs: [D-letta-memory], [D-memfs], [D-letta-sessions]. Licenses: [L-license], [LC-license].

[P-memgpt]: https://arxiv.org/html/2310.08560v2
[L-handoff]: https://github.com/letta-ai/letta/blob/5bcdd177d70fa2b31a754cfcd801e77b2e1ab16a/README.md
[L-block]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/letta/schemas/block.py
[L-memory]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/letta/schemas/memory.py
[L-tools]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/letta/functions/function_sets/base.py
[L-block-manager]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/letta/services/block_manager.py
[L-block-orm]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/letta/orm/block.py
[L-filesystem]: https://github.com/letta-ai/letta-code/blob/bc4b97c3185302890cfb511c6d1e49f49fc5300c/src/agent/memory-filesystem.ts
[L-format]: https://github.com/letta-ai/letta-code/blob/bc4b97c3185302890cfb511c6d1e49f49fc5300c/src/agent/memory-format.ts
[L-constraints]: https://github.com/letta-ai/letta-code/blob/bc4b97c3185302890cfb511c6d1e49f49fc5300c/src/memory-constraints.ts
[D-letta-memory]: https://docs.letta.com/agent-sdk/memory/index.md
[D-memfs]: https://docs.letta.com/concepts/memfs/index.md
[D-letta-sessions]: https://docs.letta.com/agent-sdk/sessions/index.md
[L-license]: https://github.com/letta-ai/letta/blob/56ba9c25552605eec89de8ed3dc6394b625c1993/LICENSE
[LC-license]: https://github.com/letta-ai/letta-code/blob/bc4b97c3185302890cfb511c6d1e49f49fc5300c/LICENSE

### Graphiti / Zep — official repositories, docs, authors' paper

Architecture/results: [P-zep]. Temporal evidence/resolution: [G-edges], [G-resolve], [G-dedupe], [G-engine]. Selection: [G-search], [G-recipes], [G-filters]. Evaluation: [G-eval]. Product boundary/docs: [G-readme], [D-groups], [D-zep-context]. License: [G-license].

[P-zep]: https://arxiv.org/html/2501.13956v1
[G-edges]: https://github.com/getzep/graphiti/blob/3c427640abf909f12f71f963fce15eb514a3c493/graphiti_core/edges.py
[G-resolve]: https://github.com/getzep/graphiti/blob/3c427640abf909f12f71f963fce15eb514a3c493/graphiti_core/utils/maintenance/edge_operations.py
[G-dedupe]: https://github.com/getzep/graphiti/blob/3c427640abf909f12f71f963fce15eb514a3c493/graphiti_core/prompts/dedupe_edges.py
[G-engine]: https://github.com/getzep/graphiti/blob/3c427640abf909f12f71f963fce15eb514a3c493/graphiti_core/graphiti.py
[G-search]: https://github.com/getzep/graphiti/blob/3c427640abf909f12f71f963fce15eb514a3c493/graphiti_core/search/search.py
[G-recipes]: https://github.com/getzep/graphiti/blob/3c427640abf909f12f71f963fce15eb514a3c493/graphiti_core/search/search_config_recipes.py
[G-filters]: https://github.com/getzep/graphiti/blob/3c427640abf909f12f71f963fce15eb514a3c493/graphiti_core/search/search_filters.py
[G-eval]: https://github.com/getzep/graphiti/blob/3c427640abf909f12f71f963fce15eb514a3c493/tests/evals/eval_e2e_graph_building.py
[G-readme]: https://github.com/getzep/graphiti/blob/3c427640abf909f12f71f963fce15eb514a3c493/README.md
[D-groups]: https://help.getzep.com/graphiti/core-concepts/graph-namespacing.md
[D-zep-context]: https://help.getzep.com/advanced-context-block-construction.md
[G-license]: https://github.com/getzep/graphiti/blob/3c427640abf909f12f71f963fce15eb514a3c493/LICENSE

### Evaluation — benchmark authors

Dataset/task definitions and evaluation instructions: [E-lme]. Repository license: [E-license].

[E-lme]: https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/README.md
[E-license]: https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/LICENSE
