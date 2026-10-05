# R16 — Coding-agent efficiency without quality loss

Research date: 2026-10-03. Target: Charlie on OpenCode/Orchestra native models/runtime; Atlas owns shared Knowledge/Memory. Evidence: primary provider docs, implementation sources, research papers. Local findings from static source reads; evaluation below remains proposed, not executed.

## Decision

Optimize **verified accepted-task cost and time**, subject to full task contract, evidence, maintainability, and user-repair requirements. Fewer tokens alone proves nothing. Strong approved model/runtime configuration supplies quality baseline; baseline mistakes still require correction. “Good enough” does not lower acceptance bar. Extra machinery must solve measured failure.

Rank below reflects practical adoption order and semantic risk, not measured universal gains. **Adopt** means use existing facility/policy; **adapt** means fit selected provider/model and verify host support; **reject** means unsuitable Charlie default. Provider availability does not establish Orchestra integration. Vendor percentage headlines deliberately excluded.

## Ranked mechanisms

### 1. Cache-stable prefixes and faithful conversation replay — adopt; adapt provider details

Keep stable instructions, tool ordering/schemas, and reusable reference material stable. Put changing task facts after reusable boundary; append updates in correct authority/channel. Preserve tool-call/result IDs and provider-required opaque reasoning items. Stable logical meaning alone cannot produce exact-prefix hit. [OpenAI caching][O1], [Anthropic caching][A1], [xAI caching][X1], [Codex implementation account][I1].

**Adoption rule:** use native cache policy and route options first; check actual read/write buckets. Preserve already useful cached history until native compaction or correctness requires change. Do not reread unchanged content merely because cache makes input cheap.

**Adaptation:** boundary placement must follow model generation. OpenAI's current GPT-5.6+ message-boundary behavior differs from earlier implicit interval caching. Anthropic cache write must exist at reusable boundary; placing breakpoint after changing timestamp can miss despite stable text before it. xAI recommends conversation-affinity routing and faithful reasoning replay.

**Reject:** padding with irrelevant text to qualify for caching; postponing required corrections; cross-model cache-hit assumptions; second caching proxy. Cache saves prefill/billing work, not semantic attention or output generation. Cold first request, expiry, changed schemas, model/effort switches, and compaction belong in evaluation. High hit ratio can coexist with excessive context and high total cost.

### 2. Dependency-complete, just-in-time context — adopt

Start with task contract, repo instructions, relevant Atlas references, and native path/symbol search. Read coherent implementation spans plus callers, contracts, config, and tests needed for proposed change. Expand when imports, invariants, failures, or uncertain ownership require it. Keep lightweight provenance: source identity/version, path/range, and reason relevant. [Anthropic context engineering][A2], [Aider repo map][I2], [SWE-agent][R2].

**Adoption rule:** reuse still-valid excerpts already in context; consult Atlas shared Knowledge/Memory through existing interface. Reopen after mutation, version conflict, truncation, compaction loss, or uncertainty. Same path does not mean same contents. Fresh source overrides stale memory. Memory records decisions and evidence references; it does not certify current code.

**Adaptation:** use native structural/symbol navigation where available; Aider's ranked repository map illustrates context selection, not reason to install another index. Moderate, coherent reads can beat tiny repeated windows. Scope search narrowly when ownership known; broaden deliberately when negative result matters.

**Reject:** fixed “smallest context” quota; target-file-only edits across contracts; blind full-repo ingestion; Charlie retriever duplicating Atlas/native facilities. Retrieval miss is not absence. Known-member positive control plus verified search scope needed before consequential absence claim. Lost-in-the-Middle supports positional stress tests, not universal claim about current coding models. [R1]

### 3. Progressive tool and skill discovery — adopt native skills; adapt tool search

Expose concise names, purpose, and selection criteria first. Load relevant skill body and referenced detail when needed; keep frequently used core tools directly available. Retain loaded guidance through native history; reload only when changed or lost. [Agent Skills][A3], [OpenAI tool search][O2], [Anthropic tool search][A4].

**Adoption rule:** native skill catalog already supplies metadata-first loading. For large tool catalogs, use provider-native deferred discovery only after route supports definition, search result, replay, and usage semantics. Discovery must find required rare tools; empty search requires better query or native catalog fallback.

**Limits:** discovery adds search latency and failure opportunity. OpenAI deferred individual functions still expose name/description; namespaces defer more detail. Anthropic hosted search still requires full definitions in API request: model-context reduction is not HTTP-payload reduction. Small, heavily used catalogs can cost less eagerly loaded. Preserve deterministic definitions/order; native append-only discovery avoids rewriting early prefix.

**Reject:** startup schema dumping; loading every skill matching vague keyword; new Charlie tool gateway; removing parameter meaning to shorten schemas. Provider guidance about tool counts is heuristic, not deployment threshold.

### 4. Evidence-preserving output budgets — adopt; calibrate ceilings

Separate three budgets: model answer/arguments, hidden reasoning, and tool-result materialization. Request concise final answer: changed behavior, proof, unresolved limitations, source references. Use native range/filter controls and retained full outputs; excerpts must retain paths, meaningful diagnostics, status, and route to omitted evidence. [OpenAI latency guidance][O3], [reasoning/output limits][O6], [Anthropic tool design][A5], [stop reasons][A7].

**Adoption rule:** remove duplicate narration and raw dumps before touching proof or needed reasoning. Reserve capacity for complete patch, required checks, and honest final state. Detect `max_output_tokens`/`max_tokens`/native `length`; incomplete response cannot establish completed work. Incomplete tool arguments must not execute. Recovery must reconcile any earlier completed calls before retrying.

**Limits:** smaller hard ceiling can spend whole allowance on reasoning, return no usable answer, and trigger paid continuation. Head/tail preview can hide decisive middle diagnostic. Producer capture loss differs from model-output truncation: retained output cannot restore bytes producer never captured. Native compaction summary may also lose details; keep durable evidence references and reacquire exact source when needed. Evidence must remain retrievable through acceptance and repair; expired output pointer is not proof.

**Reject:** silently truncating proof, suppressing failing/skipped checks, or equating concise prose with reduced hidden reasoning. Streaming improves responsiveness; measure completed acceptance separately from first visible token. Provider latency percentages are workload heuristics, not Charlie forecasts.

### 5. Native tool-use formats and compact edit operations — adopt; adapt free-form tools selectively

Use native function calls/results through Orchestra protocol adapters, validated schemas, call IDs, and existing patch/edit tools. Avoid additional prose “Thought/Action” parser or redundant wrapper serialization beyond provider contract. Keep descriptions explicit enough for correct first call. [OpenAI function/custom tools][O4], [Anthropic tool lifecycle][A6], [xAI function calling][X4], [SWE-agent][R2].

**Adoption rule:** prefer patch/edit over whole-file regeneration when operation fits. Native JSON schemas suit structured arguments; strict mode improves schema adherence where supported, not factual/semantic correctness. Tool result must distinguish error, empty successful result, and incomplete result.

**Adaptation:** OpenAI custom text tools/CFG can avoid escaping large patches; use only if selected route handles `custom_tool_call`, grammar, output replay, and permissions end to end. Measure malformed-call repairs and actual token counts. Current inspected OpenAI route's declared local-tool shape is `function`; docs support alone is insufficient.

**Reject:** universal JSON-versus-XML token claims; bespoke compressed DSL; abbreviations that obscure parameters; full-file rewrite for small edit. Preserve provider-required ordering and opaque continuation state. xAI's documented function-call streaming currently returns complete call in one chunk; do not assume identical streaming behavior across providers.

### 6. Parallel independent acquisition — adopt native execution

Batch known-independent reads/searches/document fetches from same state. Fetch implementation, contract, and test context concurrently when identities already known. Model may request several calls in one turn; native runner handles settlement. [OpenAI latency][O3], [function calling][O4], [xAI parallel calls][X4].

**Adoption rule:** dependencies decide concurrency. Read-before-edit, edit-before-test, discovery-before-fetch, and overlapping mutations remain ordered. Gather each result/status before dependent decision. Prefer useful small batch over speculative fan-out.

**Limits:** parallelism shortens critical path, not sum of tool work or tokens. Large batch can add irrelevant context, rate-limit retries, inconsistent snapshots, and late stragglers. Native eager execution does not prove calls independent. Concurrent cold provider requests can each incur cache writes; Anthropic cache entry becomes reusable only after first response begins. [A1]

**Reject:** subagents for routine acquisition, new scheduler, parallel edits against shared mutable files, and multiple expensive guesses racing to finish. Use existing host concurrency controls; add host limit only if measured saturation warrants it.

### 7. One retry owner, progress-aware continuation, change-scoped verification — adopt; adapt native limits

Separate transport retry, invalid-tool repair, task strategy revision, and user-requested continuation. Honor transient error classification and `Retry-After`; bounded attempts plus total deadline. Do not stack Charlie retries over native executor retries. [OpenAI rate-limit guidance][O5], [Anthropic tool errors][A6], [SWE-agent failure analysis][R2].

**Adoption rule:** same call/arguments against unchanged source with same failure needs new hypothesis, wider evidence, corrected invocation, or stronger model—not identical repetition. Polling that observes state change and rereads after edits are legitimate. Native step budget bounds runaway execution; exhausting it yields explicit incomplete status, never manufactured success. Keep native allowance reset when new user input is promoted, not merely admitted; steer batch resets once.

Verification follows behavior and dependency reach: small reversible edit gets applicable focused checks and diff review; contract migration gets caller/schema/integration checks. Required repo checks remain mandatory. Once acceptance evidence complete, stop unless new change, failure, or unresolved concern justifies more work.

**Limits:** aggressive loop cutoff can kill difficult productive work; progress includes eliminated hypotheses and acquired evidence, not only changed lines. Retrying consumed streams can repeat side effects. Native executor currently caps server delay; when valid `Retry-After` exceeds permitted wait, defer/fail rather than retry sooner. Treat as native adaptation, not Charlie wrapper.

**Reject:** endless reflection/reviewer loops, unconditional plan/approval/evaluation stages for tiny edits, repeated passing suites without cause, or silently abandoning proof at budget boundary.

### 8. Route by verified task difficulty and repair-adjusted cost — adapt last

Start with strongest approved quality baseline. Native model/variant selection can reserve cheaper or lower-effort configurations for bounded tasks with reliable acceptance oracle; ambiguous cross-package changes and hard diagnosis retain capable model. Prefer initial task/phase choice over per-call model thrashing. [OpenAI reasoning][O6], [RouteLLM][R3].

**Adoption rule:** promote cheaper configuration only on held-out paired tasks satisfying same acceptance requirements, with no unresolved quality regression or increased user-repair burden. On observed failure/uncertainty, escalate through native model selection with compact factual handoff and durable history. An escalation is part of original task cost.

**Limits:** routing adds classification overhead; switching models can invalidate cache and discard incompatible reasoning. Cheap attempt plus rereads, repair, revalidation, and human time can exceed capable-model-first cost. Tokenizers differ; token counts across models are workload diagnostics, not common unit of useful work.

**Reject:** “cheapest first” as universal default; learned router before representative Charlie data; self-confidence as acceptance oracle; importing RouteLLM's cost claims into multi-turn coding. Its main experiments route `gpt-4-1106-preview` versus Mixtral 8x7B on MT-Bench, MMLU, and GSM8K—not repository repair with human rework.

## Provider-specific cache and format facts

Facts below describe fetched docs, not tested host capability. Recheck model/API/deployment when adopting.

| Provider/API | Exact operational distinction | Charlie consequence |
| --- | --- | --- |
| OpenAI Responses, GPT-5.6+ [O1] | Minimum cacheable visible prefix 1,024 tokens; implicit latest-eligible-message boundary or explicit `prompt_cache_options.mode` plus `prompt_cache_breakpoint`; four write slots. Current default/supported TTL `30m`. Separate cache-write rate and `input_tokens_details.cache_write_tokens`. | Static prefix needs eligible previously written boundary. Current docs invalidate blanket “OpenAI has only free implicit writes” assumption. Match exact model rates; do not invent missing bucket as zero. |
| OpenAI earlier models [O1] | Implicit interval behavior; minimum can vary with request settings. Earlier `prompt_cache_retention` values differ by model. Stable `prompt_cache_key` influences routing, not guaranteed hit. GPT-5.6+ key primarily separates accounting. | Version cache settings with model/API, not provider name alone. Keep key stable for intended isolation; model switch requires fresh measurement. |
| Anthropic Messages [A1] | Prefix order `tools → system → messages`; default 5-minute TTL, optional 1-hour TTL; up to four breakpoints; 20-position lookback seeks prior writes. Current Claude API groups consecutive tool-use/result blocks as positions. Model-specific minimums. TTL starts at request start. | Slow generation/tool work can consume TTL. Stable reusable boundary must be written; adding marker after variable tail cannot recover nonexistent earlier entry. Account separately for 5m/1h creation. |
| Anthropic deferred tools [A4] | Full catalog supplied server-side; deferred schemas expanded inline through `tool_reference`. Deferred tool cannot itself carry `cache_control`. | Keep core eager and catalog stable; preserve returned reference/history blocks. Discovery adds context without rewriting initial tool prefix. |
| OpenAI tool search [O2] | Responses `tool_search` documented for GPT-5.4 and later; `defer_loading: true`; discovered tools appended to context. Individual deferred function name/description remain visible. | Prefer native namespace discovery for large catalogs, after host adapter support. Hosted and client search require distinct call/result handling. |
| xAI [X1–X4] | Automatic prefix caching; Chat uses `x-grok-conv-id`, Responses uses `prompt_cache_key`; replay encrypted `reasoning_content` or use supported stateful continuation. Usage exposes cache reads. Long-context pricing includes cached prompt tokens in threshold. | Route-specific options, not generic OpenAI assumptions. Compatible API shape does not establish all OpenAI features or pricing semantics. Count complete-call events according to actual xAI stream. |

Simple cache break-even, **not empirical savings claim**: for unchanged prefix of length `L`, one paid write at rate `w`, then `n` reads at rate `r`, compare `L × (w + n × r)` with `L × (n + 1) × p`, where `p` means uncached rate. Include misses, expiry, cache preparation, and downstream token changes in actual task comparison. Native compaction can lower total cost despite lower cache-hit ratio; compare compaction cost plus future calls, not hit ratio alone.

## Lean host seam: reuse owners already present

Source root inspected: `/Users/gustavoschneiter/Documents/HuGR/orchestra-canonical`. Paths/lines below locate observed implementation; runtime behavior and deployment parity remain untested.

| Native owner / source | Observed seam | Decision |
| --- | --- | --- |
| `packages/core/src/system-context/index.ts:31–39,135–173,218–290`; `packages/core/src/system-context/registry.ts:25–43`; `packages/core/src/session/history.ts:90–99` | Typed source baseline/update/snapshot; sorted registry; Session-owned history selection. | Trusted Charlie guidance fits existing context source/skill. Atlas retrieved documents stay ordinary tool data; do not elevate raw memory into privileged instructions. Context Epoch stays Session-owned. |
| `packages/core/src/skill/guidance.ts:10–31,49–68`; `packages/core/src/tool/skill.ts:27–51,70–98` | Sorted name/description catalog; body/resources loaded by native `skill`. | Reuse progressive skill loading. No second skill dispatcher. |
| `packages/core/src/session/compaction.ts:176–247` | Native token-pressure/overflow compaction; anchored summary plus recent context. | One compaction owner. Charlie provides exact goals, unresolved facts, and evidence references through normal task context/Atlas memory. |
| `packages/llm/src/cache-policy.ts:18–42,99–110`; `packages/llm/src/protocols/openai-responses.ts:456–497` | Auto hints for Anthropic/Bedrock; existing OpenAI key, effort, verbosity, output options. | Cache placement and provider feature upgrades belong in native route. Typed route currently declares function tools at lines 108–114 and fixed input variants at 78–95; newer discovery/custom/update formats need explicit end-to-end support review. |
| `packages/core/src/tool/registry.ts:50–81,106–120`; `packages/core/src/tool-output-store.ts:138–173` | Canonical materialization/settlement and generic bounding with managed output paths. | Reuse registry/output store; native registration gives permission-filtered definitions, not demonstrated provider-deferred discovery. Full producer output and bounded model view remain distinct. |
| `packages/core/src/session/runner/llm.ts:173–221,239–303,390–412` | Location-scoped model/context, one provider stream, persisted calls then eager fibers, join before continuation, durable inbox promotion. | Charlie supplies task policy, not another model/tool loop. Parallel acquisition must respect dependencies. Process-global SessionExecution/coordinator retain Session-ID ownership. |
| `packages/core/src/session/runner/model.ts:173–233`; `packages/llm/src/route/executor.ts:345–379` | Catalog-backed model/variant selection; native retry owner. | Route and retry through host. Do not silently replay provider work after crash or add second attempt loop. |
| `packages/sdk-next/src/opencode.ts:10–42` | Existing host composition returns client plus `tools.register`. | Thin Atlas adapter only where existing Atlas exposure needs binding. Reuse Atlas search/read/memory semantics, IDs, provenance, freshness; API details not inspected here. No Charlie retriever or memory database. |
| `packages/llm/src/schema/events.ts:7–68`; `packages/core/src/session/runner/publish-llm-event.ts:16–27`; `packages/core/src/observability.ts:11–24` | Canonical inclusive usage, cache breakdown, raw-provider metadata escape hatch; Session projection; existing logging/tracing. | Export evaluation rows from native events/usage/observability. Missing fields belong in host telemetry, not Charlie cost ledger. |

**Accounting blockers to resolve before measured adoption:**

- `packages/core/src/session/runner/llm.ts:333–340` emits `SessionEvent.Step.Ended` with literal `cost: 0`. This value cannot establish billed cost.
- `packages/llm/src/protocols/openai-responses.ts:168–174,507–520` declares cache-read details and computes non-cached input as total minus reads. New OpenAI write bucket needs native parsing/accounting support before disjoint billing claim.
- `packages/core/src/session/compaction.ts:199–229` handles summary text/errors and publishes compaction completion; shown path does not attach summary usage. Task measurement must include compaction's provider usage at existing native observation boundary.
- `packages/core/src/session/runner/publish-llm-event.ts:16–27` converts missing numbers to zero; evaluator must distinguish provider-reported zero from unavailable data using original usage. `Usage.visibleOutputTokens` subtracts zero when reasoning breakdown missing; call resulting value “unsplit output,” not measured visible text.
- `packages/llm/src/route/executor.ts:345–346` clamps `retryAfterMs` to maximum delay. OpenAI now specifies valid `Retry-After` as minimum: defer when above allowed wait. [O5]

These findings bound what current evidence supports; they do not claim whole repository lacks other telemetry paths. Public Client runtime keeps Schema/Protocol dependencies; host-only composition stays in `sdk-next`/Core/Server. Native prompt admission, steer/queue boundaries, and exact-retry reconciliation remain execution authority.

## Measurement methodology

### Acceptance first

Before comparing configurations, freeze task contract: required behavior, allowed edit scope, repository standards, dependency invariants, applicable tests/typecheck, and required evidence. “Done” text, normal stop reason, passing unrelated test, or evaluator self-score does not establish acceptance.

Record **agent-only verified acceptance** separately from **eventual acceptance after human repair**. Record human interventions even when final patch passes. Independent evaluator should inspect final diff and artifacts; tests verify behavior where appropriate, human review covers requirements tests cannot establish. Author-only tests and model judge alone are insufficient. Failed/skipped/unavailable checks remain explicit.

Quality-preserving adoption requires no unresolved contract/evidence regression and no increased repair burden in intended task strata. Report uncertainty; failure to detect statistical difference does not prove equivalence. Do not exchange lower acceptance for cheaper tokens. Stronger result at same spend can also be efficiency gain.

### Minimal export from existing telemetry

One evaluation row per task trial (`task × configuration × repetition`), linked to native Session/message/provider-request/tool-call IDs. Retries, escalations, and repair episodes stay in same trial; count each accepted trial once. External `eval_id` is experimental label, not new durable Session-drain identity. Aggregate underlying request records once:

| Measure | Required definition |
| --- | --- |
| Input tokens | Inclusive total plus disjoint uncached, cache-read, cache-write buckets; write TTL split when provider reports it. Preserve raw usage and unavailable status. |
| Output tokens | Inclusive billed output; reasoning and non-reasoning remainder separately when reported. Tool-call arguments count as model output; later tool results count as input on every request carrying them. |
| Auxiliary calls | Include summary/compaction, routing, retries, discovery, verification-model calls, canceled/speculative work, and repair continuations. Server-side tools need native usage/trace accounting too. |
| Tool use | Requested/completed/failed/canceled calls, tool name, time, output size, truncation/capture-loss flags; distinguish searches, reads, edits, checks, discovery. Batch of calls is not one underlying call. |
| Repeats/retries | Transport retries, invalid-call repairs, repeated unchanged reads, repeated same-error actions, strategy revisions, model escalations. Mark justified rereads after mutation/context loss. |
| Time | Admission→agent completion and admission→verified acceptance; first visible token, model waits, tool time, backoff, verification, queue/approval waits. Monotonic spans; critical-path wall time differs from summed concurrent spans. |
| User effort | Active review minutes, repair minutes, intervention turns, manual corrections, and cause. Keep unrelated multitasking separate; elapsed wait is not active human time. |
| Outcome | Accepted/unaccepted, agent-only/eventual, failed requirements, evidence references, diff/source identity, missing telemetry. Budget exhaustion and abandonment remain failures/censored outcomes, not dropped samples. |

**Token reconciliation:**

```text
input_total = uncached_input + cache_read_input + cache_write_input
output_total = reasoning_output + non_reasoning_remainder  # only if split reported
task_tokens = sum(input_total + output_total)              # all provider calls
```

OpenAI Responses: `input_tokens` inclusive; subtract `input_tokens_details.cached_tokens` and, for reporting models, `input_tokens_details.cache_write_tokens` to obtain uncached bucket. Anthropic: `input_tokens` is uncached component; add `cache_creation_input_tokens` and `cache_read_input_tokens` for inclusive input. xAI Responses/Chat: cached subset of `input_tokens`/`prompt_tokens`; cited pricing table distinguishes non-cached input, cached input, and output. Record separate write reporting as not applicable/unspecified under that pricing contract, not inferred universal zero. [O1], [A1], [X3]

Do not add reasoning twice to inclusive output. Unknown breakdown stays unknown. Duplicate terminal/step events must not double-count request usage. Missing usage on failed/canceled request is billing uncertainty, not free call. Caching affects weighted price; cached tokens still belong in total processed context.

```text
attempt_cost = sum(request token buckets × applicable unit rates)
             + provider tool charges + attributed execution/other metered charges

cost_per_agent_accepted_task = sum(cost of ALL attempts) / agent_only_accepted_count
cost_per_eventual_accepted_task = sum(cost INCLUDING repair) / eventually_accepted_count
repair_minutes_per_accepted_task = sum(active repair minutes) / eventually_accepted_count
```

Denominator zero means undefined, reported alongside attempts/failures. Include failed tasks in numerators. Report acceptance rate and failure distribution beside ratios. Price each actual model/API/service tier using dated price snapshot, long-context thresholds, and cache TTL; provider billing reconciliation validates estimate. Subscription/quota use needs separate marginal cash cost, allocated cost assumption, and capacity consumption. Human-dollar conversion optional and assumption-labeled; raw repair minutes mandatory.

### Paired experiment design

- Baseline: current native Charlie-quality configuration on fixed task corpus, not deliberately bloated toy harness. Candidate: one mechanism changed; then combined candidate checks interactions.
- Pair by task/repo revision with fresh isolated working state, same acceptance oracle and tool availability. Pin model snapshot, runtime version, skill/catalog versions, Atlas snapshot/freshness state, provider region/tier, effort, output ceilings, concurrency, and task limits.
- Randomize/interleave A/B order; repeat stochastic tasks. Keep tuning tasks separate from held-out tasks/repositories. Prespecify sample size, stopping rule, quality checks, and smallest useful cost/time improvement based on pilot variability and deployment stakes.
- Separate cold, warm, expired, and invalidated cache conditions. Do not let B inherit A's cache accidentally; distinct stable cache namespace or controlled warm-up per arm, confirmed from usage. Include warm-up cost in operational totals; label amortized view separately. Do not claim cache clearing where API does not provide it.
- Report paired acceptance discordances, per-task cost/time deltas, medians and tail latencies with uncertainty; cluster intervals by task/repository and account for repeats. Show tiny-edit and complex-task strata. Do not average away hard-task regressions.
- Human repair experiment needs counterbalanced assignment or independent matched reviewers; same person solving same issue twice carries learning effects. Record active work directly rather than perceived speedup. METR's February 2026 update highlights task/developer selection and concurrent-work timing confounds. [R5]
- Calibrate measurement before trusting results: known successful and failing checker cases; deliberate missing dependency and invalid tool arguments; eligible repeated cache prefix then controlled prefix change; retained-output proof recovery; retry event with known attempt count; fixture with all usage buckets. Check real environment's test reach, exit status, and skipped tests. Protocol fixtures validate accounting; live provider calls establish cache/latency behavior. Neither substitutes for other.

No finite suite proves all future behavior. Roll out only in evaluated task strata, with native trace review for new failure modes; widen evidence before widening routing/context reductions.

## Paired evaluation scenarios

Each row runs baseline A and candidate B on **same task**, then repeats on paired pressure case. These are proposed experiments, not reported results.

| Mechanism | Ordinary case ↔ pressure case | A/B change and decisive evidence |
| --- | --- | --- |
| 1 Cache | Warm multi-turn bug fix ↔ same task after TTL expiry, schema reorder, effort/model change, or compaction | Current prompt layout versus stable reusable boundaries. Compare bucket-level usage, billed task cost, first-token and accepted-task time; required corrections must still arrive. |
| 2 Context | Local helper fix ↔ superficially identical fix requiring caller/config invariant outside target file | Current acquisition versus scoped search + coherent dependency reads + Atlas references. Stale Atlas note and renamed symbol challenge freshness; hidden regression check detects narrow-context error. |
| 3 Discovery | Small core-only tool task ↔ rare tool/skill needed inside large catalog | Eager catalog versus native progressive loading. Track definition tokens, discovery calls, failed selection, cache misses, completion; include ambiguous names and zero-result search. |
| 4 Budgets | Short diagnostics ↔ huge output with decisive failure/proof in omitted middle and long patch arguments | Existing output policy versus concise summary + retained complete evidence. Require exact proof recovery and truncation detection; account for reread/continuation cost. |
| 5 Formats | Ordinary structured arguments ↔ quote/newline-heavy multi-file patch | Native function path versus host-supported custom patch format, only where both supported. Compare malformed calls, semantic patch correctness, replay, retries, and output tokens; unsupported route is excluded explicitly. |
| 6 Parallelism | Known independent implementation/test/doc reads ↔ dependency chain, file mutation, or rate-limit pressure | Serial acquisition versus native independent batching. Compare critical path, total work, consistency, stragglers, retries; dependent operations must retain ordering. |
| 7 Control | Tiny reversible edit ↔ repeated deterministic error, transient overload, and genuine multi-step contract change | Current native workflow versus change-scoped checks + progress-aware bounded continuation. Verify real transient recovery, no duplicate effects, no premature success, no unnecessary tiny-edit ceremony. |
| 8 Routing | Mechanical rename with complete oracle ↔ ambiguous cross-package compatibility fix | Capable-model baseline versus cheaper/lower-effort native selection with escalation. Compare agent-only acceptance, total repair cost/time, cache reset, user intervention; include cheap initial answer that fails hidden dependency test. |

## Evidence strength and transfer limits

- **Provider docs [O1–O6, A1/A4/A6/A7, X1–X4]:** primary API contracts and integration guidance. Dynamic pages accessed 2026-10-03. Model/platform limitations matter; example snippets are not Charlie benchmarks.
- **Codex [I1], 2026-01-23:** primary implementation explanation, with commit-linked source. Reports real tool-order cache miss and append-only context strategy. Historical Codex architecture is design evidence, not proof Orchestra behaves identically.
- **Aider [I2]:** primary implementation docs: dependency-graph-ranked symbol map under token budget, expandable on need. Reuse selection principle; adding another map/retriever not justified by source alone.
- **Lost in the Middle [R1], v3:** NaturalQuestions-Open multi-document QA and synthetic UUID key-value retrieval; GPT-3.5-Turbo 0613 variants, Claude-1.3 variants, MPT-30B-Instruct, LongChat-13B, plus additional analyses. Position/length sensitivity supports stress-test design. Neither coding experiment nor current-model effect estimate.
- **SWE-agent [R2], v3:** GPT-4 Turbo `gpt-4-1106-preview` and Claude 3 Opus `claude-3-opus-20240229`; SWE-bench, SWE-bench Lite interface ablations, HumanEvalFix; per-instance API budget $4. File-viewer ablation compares 30 lines, 100 lines, full file: both too little and too much context harmed that setup. Do not universalize 100-line default. Its average successful-instance cost is not all-attempt accepted-task cost defined here.
- **RouteLLM [R3], v4:** preference-trained binary routing; main GPT-4/Mixtral setup above, MT-Bench judged responses, 5-shot MMLU, 8-shot GSM8K. Arena-only training transferred poorly to some evaluated domains; augmentation changed outcomes. Evidence for empirical routing calibration, not turnkey coding router.
- **AI Agents That Matter [R4]:** accuracy-only evaluation can favor expensive/complex agents; holdouts and reproducibility necessary. Motivates joint quality/cost reporting without licensing quality reduction.
- **METR [R5], 2026-02-24:** follow-up developer productivity study reports selection and timing problems and weak evidence about effect magnitude. Earlier 2025 study used experienced OSS maintainers, primarily Cursor with Claude 3.5/3.7 Sonnet. Historical slowdown is not current universal claim. Use lesson: measure active human repair and accepted work, control selection and multitasking.

## Primary citations

- **O1:** OpenAI, *Prompt caching*, especially model differences, cache lookup boundaries, monitoring usage, compaction. <https://developers.openai.com/api/docs/guides/prompt-caching>
- **O2:** OpenAI, *Tool search*, especially hosted/client loading, namespaces, cache preservation. <https://developers.openai.com/api/docs/guides/tools-tool-search>
- **O3:** OpenAI, *Latency optimization*, especially fewer output tokens/requests, parallelism, streaming. <https://developers.openai.com/api/docs/guides/latency-optimization>
- **O4:** OpenAI, *Function calling*, especially strict mode, parallel calls, custom tools/CFG. <https://developers.openai.com/api/docs/guides/function-calling>
- **O5:** OpenAI, *Rate limits*, “Retrying with exponential backoff.” <https://developers.openai.com/api/docs/guides/rate-limits#retrying-with-exponential-backoff>
- **O6:** OpenAI, *Reasoning models*, output accounting, incomplete responses, preserved reasoning, effort. <https://developers.openai.com/api/docs/guides/reasoning>
- **A1:** Anthropic, *Prompt caching*, breakpoint lookback, invalidation, tracking cache performance. <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
- **A2:** Anthropic, *Effective context engineering for AI agents*, 2025-09-29. <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
- **A3:** Anthropic, *Equipping agents for the real world with Agent Skills*, 2025-10-16; open-standard update 2025-12-18. <https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills>
- **A4:** Anthropic, *Tool search tool*, compatibility, deferred loading, caching. <https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool>
- **A5:** Anthropic, *Writing effective tools for agents — with agents*, 2025-09-11. <https://www.anthropic.com/engineering/writing-tools-for-agents>
- **A6:** Anthropic, *Handle tool calls*, tool-result formatting and errors. <https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls>
- **A7:** Anthropic, *Stop reasons and fallback*, `max_tokens` and incomplete tool-use blocks. <https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#max-tokens>
- **X1:** xAI, *Prompt Caching*. <https://docs.x.ai/developers/advanced-api-usage/prompt-caching>
- **X2:** xAI, *Maximizing Cache Hits* and *What Breaks Caching*. <https://docs.x.ai/developers/advanced-api-usage/prompt-caching/maximizing-cache-hits> · <https://docs.x.ai/developers/advanced-api-usage/prompt-caching/multi-turn>
- **X3:** xAI, *Usage & Pricing*. <https://docs.x.ai/developers/advanced-api-usage/prompt-caching/usage-and-pricing>
- **X4:** xAI, *Function Calling*. <https://docs.x.ai/developers/tools/function-calling>
- **I1:** Michael Bolin / OpenAI, *Unrolling the Codex agent loop*, 2026-01-23, “Performance considerations.” <https://openai.com/index/unrolling-the-codex-agent-loop/>
- **I2:** Aider, *Repository map*, “Optimizing the map.” <https://aider.chat/docs/repomap.html>
- **R1:** Liu et al., *Lost in the Middle: How Language Models Use Long Contexts*, arXiv:2307.03172v3, §§2–5. <https://arxiv.org/html/2307.03172v3>
- **R2:** Yang et al., *SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering*, arXiv:2405.15793v3, §§3–5/Table 3. <https://arxiv.org/html/2405.15793v3>
- **R3:** Ong et al., *RouteLLM: Learning to Route LLMs with Preference Data*, arXiv:2406.18665v4, §§5–6. <https://arxiv.org/html/2406.18665v4>
- **R4:** Kapoor et al., *AI Agents That Matter*, arXiv:2407.01502v1. <https://arxiv.org/abs/2407.01502v1>
- **R5:** Becker et al. / METR, *We are Changing our Developer Productivity Experiment Design*, 2026-02-24. <https://metr.org/blog/2026-02-24-uplift-update/> Earlier setup: <https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/>

[O1]: https://developers.openai.com/api/docs/guides/prompt-caching
[O2]: https://developers.openai.com/api/docs/guides/tools-tool-search
[O3]: https://developers.openai.com/api/docs/guides/latency-optimization
[O4]: https://developers.openai.com/api/docs/guides/function-calling
[O5]: https://developers.openai.com/api/docs/guides/rate-limits#retrying-with-exponential-backoff
[O6]: https://developers.openai.com/api/docs/guides/reasoning
[A1]: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
[A2]: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[A3]: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
[A4]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool
[A5]: https://www.anthropic.com/engineering/writing-tools-for-agents
[A6]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls
[A7]: https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#max-tokens
[X1]: https://docs.x.ai/developers/advanced-api-usage/prompt-caching
[X2]: https://docs.x.ai/developers/advanced-api-usage/prompt-caching/maximizing-cache-hits
[X3]: https://docs.x.ai/developers/advanced-api-usage/prompt-caching/usage-and-pricing
[X4]: https://docs.x.ai/developers/tools/function-calling
[I1]: https://openai.com/index/unrolling-the-codex-agent-loop/
[I2]: https://aider.chat/docs/repomap.html
[R1]: https://arxiv.org/html/2307.03172v3
[R2]: https://arxiv.org/html/2405.15793v3
[R3]: https://arxiv.org/html/2406.18665v4
[R4]: https://arxiv.org/abs/2407.01502v1
[R5]: https://metr.org/blog/2026-02-24-uplift-update/
