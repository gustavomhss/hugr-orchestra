# R26 — Hermes tools, middleware, MCP, programmatic execution

## Decision

Adapt **call-scoped composition over Orchestra's existing tools**: derive discovery from host-visible definitions; bind stable identity, effective arguments, authorization, cancellation and settlement to every nested call; return compact aggregates with honest outcome/cost metadata. Existing CodeMode supplies interpreter and discovery. Hermes contributes boundary lessons, not another runtime.

The backend specialist remains OpenCode/Orchestra-native. Maestro optional; Atlas shared through native host services. Display names configurable; actor/tool/session IDs remain stable. No second Python runtime, model gateway, permissions store, executable registry, or memory backend.

## Evidence and version boundary

- Research date: 2026-10-03. Official [release] title: **Hermes Agent v0.21.5 (v2026.9.24)**. Annotated tag object `e3dd27ee2d8b011737a4eea8e3eb3d711ab78690` resolves to `f97608f178d1ffeca59860195ab7da295f7c8e5f` (**R**).
- Main inspected at immutable `d795726f78e532ca31655f74656b4be63a907581` (**M**). All Hermes links below pin M unless marked R. Local target inspected in existing `backend-plugin` checkout at `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0` (**O**), matching research worktree HEAD.
- Primary docs read first: [tools-runtime][d-runtime], [middleware][d-middleware], [observer-hooks][d-observer], [code-execution][d-code], [tool-search][d-search], [plugins][d-plugins], [plugin-llm-access][d-llm], [MCP][d-mcp]. Source/tests then checked; docs are claims, not implementation proof.
- Static inspection only. Python used solely to fetch/parse/diff source text; downloaded modules/tests never imported or executed. Traces/adverse cases are source-derived, not exploit demonstrations. Upstream test assertions below were **read, not run**. No runtime benchmark, token-saving percentage, or passing-suite claim.
- R→M comparisons: `agent/plugin_llm.py` and `tools/mcp_tool_handlers.py` byte-identical. Middleware execution algorithm unchanged; M removes compatibility exports. M adds in-script `tool_errors` reporting and remote RPC file/token hardening; those improvements must not be credited to R. Empty-intersection whitelist fallback exists in both [R code][r-code] and [M code][code].

## 1. Registry visibility, import cost and process startup are separate mechanisms

**Trace:** import `model_tools` → `discover_builtin_tools()` → AST-selected module imports/register calls → toolset selection → profile-overlay registry snapshot → availability probes → dynamic schema rewrites → model definitions. Effect here is loading/registering code and describing tools; authorization of side effects remains downstream.

- [Registry][registry]: `ToolEntry` carries schema, handler, toolset and availability. Model description comes from `entry.schema`, not independent `description=` metadata. `register()` rejects non-object schemas/parameters and cross-toolset shadowing unless explicitly overridden; plugin overrides add operator consent. Profile overlays take precedence over process registrations; identity-conditional restore protects newer registrations during unload.
- Built-in discovery is **eager import after AST classification**, including module-level registration loops and `tools/<package>/tool.py`. Disk cache memoizes classification by file stat, not executable activation. Optional import failures log and leave other tools usable.
- `get_definitions()` memoizes shared probes per pass, atop 30-second TTL and 60-second last-good grace. A failed probe can therefore keep advertising recently available tools. `dispatch()` looks up handler and normalizes its result; it does not repeat toolset/availability authorization.
- [Provider registry][providers]: first `get_provider_profile()`/`list_providers()` scans bundled provider profiles and eligible entry points; bound-home overlays load separately. “Lazy providers” means deferred registry discovery, **not one selected provider imported in isolation**.
- [Plugin discovery][plugin-discovery] `gate_manifest()` checks explicit disable before category/enablement. General plugins require opt-in; bundled backends load immediately; bundled platforms defer until use; memory/model-provider categories use their own loaders. Plugin kind therefore changes import timing and ownership. Default in-process Python remains trusted code; API consent gates are not isolation.
- [MCP discovery][mcp-discovery]: entrypoints own discovery; importing `model_tools` explicitly avoids MCP connect. SDK symbols load on first use. `lazy:true` plus valid cached schema registers tools without transport startup; missing/stale cache falls back to eager connect. First invocation enters `_ensure_lazy_server_connected()` and reconciles phantom cached names.
- [Schema cache][mcp-cache] fingerprints command/args/URL/transport/include/exclude. TTL applies only when supplied. Credential-dependent capability changes can outlive cached descriptions; schema cache is neither live health proof nor execution authority.

**Adverse case:** unavailable backend remains advertised during grace, or cached tool disappears live. Model-visible schema must not authorize invocation. Preserve explicit “lazy”, “unavailable”, “stale” outcomes instead of silently substituting a different tool.

**Test control:** [registry tests][t-registry] `TestToolsetAvailabilityAggregation` contrasts mixed available/unavailable members; `test_full_bypass_blocked` checks deregister-then-override rejection. [Lazy tests][t-lazy] pair `test_registers_from_cache_without_connect` with `test_cache_miss_falls_back_to_eager_connect`, plus phantom removal. These use import/transport doubles; prove branching intent, not startup latency or real server health.

**The backend specialist seam:** existing Core registry owns executable identity. Derive display/search views from its materialization; any cache key must include host scope/registration generation/policy inputs. Do not replicate Hermes's process-global registry or availability-as-permission assumption.

## 2. Progressive disclosure hides schemas, not authority or all token cost

**Trace:** session-enabled definitions → `classify_tools()`/`assemble_tool_defs()` → eager core + bridge/listing → search/describe result in conversation → `tool_call` normalization → session-scope membership + concrete-argument probe → unwrap underlying name → ordinary agent policy/effect/result path. Sources: [tool-search][search], [dispatcher][model-tools], [batch expansion][batches].

- Any deferred tool activates `auto`/`on`; threshold controls listing size, not activation. Listing budget defaults to `min(5% of context, 4000 estimated tokens)`; estimation is chars/4, not provider tokenization. Catalog degrades per source from descriptions to names to source summaries.
- Search/describe use current scoped, uncollapsed definitions. `tool_describe` returns schemas as tool-result text; it does **not** promote full schemas into provider-native tools. Retrieval failure is distinct from capability absence: empty lexical matches return available-source hints.
- `tool_call` therefore needs [local coercion/schema validation][search-validation]. Invalid enum/required/nested fields can block before dispatch; malformed schemas/external references deliberately defer validation to concrete tool/server; missing optional validator leaves required-field probe only. Do not read this as uniformly strict JSON Schema enforcement.
- Important doc mismatch: `defer: []` removes explicit built-in deferrals, but `is_deferrable_tool_name()` still classifies registered MCP/non-core plugin tools as deferred. For all-eager behavior, `enabled: off` is actual decisive branch.
- Local multi-entry batches split **before assistant-message persistence** into ordinary calls with distinct deterministic IDs; original first-call ID retained, provider tool blocks updated while signed thinking blocks preserved. Every child gets normal scope, validation, hooks and results. Direct `handle_function_call` does not perform this expansion and rejects multi-local batches. Connector-only batches keep their own dispatcher.
- Internal caps: seven search queries, ten described names, ten batch entries. Multiple calls in one response are not one authorized operation. Server concurrency policy is evaluated against underlying tool identity.

**Adverse case:** restricted session guesses another profile/toolset's deferred name, or generic bridge arguments omit required fields. Search-result membership alone is insufficient; invoke must recheck scope and actual leaf schema.

**Test control:** [search tests][t-search] pair valid dispatch with `test_invalid_enum_is_blocked_before_dispatch` (`calls == []`); explicitly test malformed/external-schema fail-open behavior. Stronger [local-batch test][t-batches] runs real stdio JSON-RPC fixture and agent path with stubbed model: allow executes both; scope executes neither; block/schema/interrupt execute only first; transcript IDs/results pair and flush. This is transport/persistence coverage, not hosted-provider conformance.

**The backend specialist seam:** CodeMode already has budgeted namespace listings, exact callable paths and `$codemode.search`. Improve its host-fed view/relevance only when evidence demands; adding Hermes's separate search/describe/call registry would duplicate existing machinery.

## 3. Middleware placement determines effective policy; observer order is path-dependent

**Agent trace:** parse/canonicalize/unwrap → Relay/request middleware → execution middleware `next_call(final_args)` → `_dispatch_authorized_once` → scope/pre-hook modifications/pruned-argument guard/loop guardrails → checkpoint/start → ACP/leaf approval → handler → result settlement. `_ToolCallRef` and `_CallIds` correlate session, task, turn, provider attempt and tool call. See [executor][executor] `_run_agent_tool_execution_middleware` and `_dispatch_authorized_once`.

**Direct-dispatch trace:** `handle_function_call` → coercion/bridge check → request middleware → pre-hook + ACP approval → execution middleware → registry/leaf → post observer → result transform. Here execution middleware can change arguments **after** pre-hook/ACP policy evaluated them. Leaf-specific checks may still run; parity with agent-wide policy is not established.

- [Middleware][middleware] `_run_execution_chain` nests execution callbacks in registration order. Per-frame `next_call` is single-use. Failure before calling next falls through; failure after successful next preserves downstream result without replay; downstream exceptions propagate through a distinguishing wrapper. This prevents accidental double execution, not arbitrary trusted plugin side effects.
- Request middleware is different: `_apply_request_chain` consumes results returned by `PluginDispatchMixin.invoke_middleware`, whose callbacks receive the same initial kwargs. Last valid replacement wins; returned replacements are not fed into subsequent callbacks as a fold. In-place mutation is another, less controlled path.
- [Plugin dispatch][plugin-dispatch] makes `pre_tool_call` timeout/exception/SystemExit fail closed with block directives. Ordinary bounded observers skip failures. Thus observer doc's blanket “fail-open” statement is incomplete. Callback timeout defaults 30s; timed-out sync workers are abandoned, suppressed 60s, capped at three live abandoned workers per callback. Arbitrary callback code may continue after caller stops waiting.
- **After-order discrepancy:** normal direct dispatch emits post before transform. Sequential registry agent path suppresses inner post, but inner `handle_function_call` still transforms; `_publish_sequential_result` then emits outer post over transformed result (`transform_applied=True`). Inline path emits post then transforms. Source: [executor lines 1648–1825][executor-order]. An audit consumer cannot assume every post event contains raw pre-transform output.
- Registry catches ordinary handler `Exception` into bounded error JSON; cancellation represented by `BaseException` paths is separate. Agent sequential deadline defaults from 420s batch timeout; genuine human wait extends it. Interrupt polling and three-second grace can abandon noncooperative workers, suppress late terminal events and record uncertain effect disposition. “Cancelled result” does not mean external side effect rolled back.

**Adverse case:** plugin author approves `/safe`, execution wrapper rewrites to `/other` in direct/RPC path; or observer records transformed success after original tool failure. Security policy belongs inside host-owned leaf execution over final arguments; telemetry must name raw/effective/projected phases.

**Test control:** [model-tools test][t-model-tools] `test_tool_request_and_execution_middleware_wrap_registry_dispatch` demonstrates both rewrites but does not assert policy against execution-rewritten args. [Guardrail test][t-guardrail] `test_relay_rewrite_precedes_sequential_policy_approval_checkpoint_and_dispatch` checks final path at every agent boundary. [Plugin tests][t-plugins] cover pre-hook exception/timeout blocking; [timeout test][t-timeout] releases late worker and expects only one terminal event. Missing proof to add before adaptation: run identical rewrite/deny case through both entrypoints and assert effect counter plus final-args policy equality.

**The backend specialist seam:** use typed host call context and leaf authorization, not fail-open plugin callbacks as permission store. Observers consume outcomes; behavior-changing adapters must finish before authorization. Emit one host-owned terminal record for success/refusal/error/cancellation/unknown effect, independently of model-facing transformations.

## 4. Programmatic execution: useful aggregation, weaker boundary than “same normal calls”

**Trace:** outer `execute_code` → terminal-scope/lifecycle/script-approval guards → existing terminal backend → session kernel or remote fallback → generated `hermes_tools` RPC → token check → whitelist → call budget → current `CellAuthority` → `handle_function_call(..., task_id=...)` → tool effect → JSON back to script → Python filtering → printed aggregate/error metadata back to model. Sources: [code][code], [RPC][rpc], [kernel][kernel], [environment][code-env].

- RPC whitelist: `web_search`, `web_extract`, `read_file`, `write_file`, `search_files`, `patch`, `terminal`; recursive code execution, delegation and MCP are outside it. Terminal background/PTY/notification-related args are stripped host-side. RPC token authenticates channel; it is not per-operation permission.
- **Fail-open capability edge, R and M:** `_sandbox_tools_for()` returns entire whitelist when intersection is empty. `enabled_tools=[]` or disjoint tools therefore do not mean “none”. Model-facing schema uses actual intersection, producing visibility/execution disagreement. [Existing test][t-code] `test_nonoverlapping_tools_fallback` explicitly expects fallback, but only imports terminal; it does not exercise a denied terminal effect.
- RPC calls reach direct dispatcher, not `AIAgent` executor. `CellAuthority._invoke` forwards only task ID: no distinct nested tool-call/session/turn/API IDs supplied. Captured context restores approval callbacks, but it does not synthesize correlation fields. Outer `suppress_post_tool_call_hook` can also be captured. Docs' “identical to normal tool calls” overstates agent guardrail/checkpoint/observer parity.
- Local socket stubs lock complete send/receive round trip: multiple Python threads **fan into serialized tool dispatch**, not parallel RPC. Protocol has no request ID; persistent client reconnect retries entire request after socket failure. Lost response after successful write can replay that write—single-use middleware is not an RPC idempotency guarantee.
- Kernel key is owner/session + mode + interpreter + cwd + tool set. Data/imports persist; new `CellAuthority` captures current context/callbacks per cell and retires afterward. Kernel transport token persists. A request has no originating cell epoch; a leaked background request arriving during a later active cell can be attributed to that current cell. Retirement proves refusal between cells, not complete cross-cell provenance isolation.
- Environment frozen at spawn; project mode uses session cwd/active venv, strict uses staging cwd/Hermes Python. Local environment scrubs secret-shaped vars, permits scoped explicit passthrough, then binds RPC/profile values. **Neither mode is an OS isolation boundary:** arbitrary Python retains filesystem/process/network authority available to its OS user. [Remote kernel][remote-kernel] and per-call launch inherit existing backend ownership; neither launch helper uses local `_build_child_env` path.
- Defaults: 300s cell timeout, 50 dispatched RPC calls, 50,000-byte inline stdout cap, 10,000-byte raw stderr reader cap. Python `StringIO` captures before clipping; these are not memory/RSS limits. Runner capture/spill can further clip output; “FULL output” labels need qualification. Top-level kernel cap defaults four, idle timeout 1800s; attached/live delegated kernels are exempt from ordinary eviction.
- Another lifetime mismatch: RPC loop captures `max_tool_calls` at kernel spawn; later cells reset counter but reuse that captured maximum. Changing configured cap without replacing kernel need not update live enforcement. Timeout/interrupt kills kernel tree and loses Python state; prior tool side effects remain.
- M adds up to five recognized in-script tool errors to outer result, but script can still return `status: success`. Refused RPC calls return before logging/budget charge, so `tool_errors` is not exhaustive. R lacks this aggregation. Do not treat “script finished” as “all operations succeeded”.

**Test control:** [code tests][t-code] run real child/socket with mocked dispatcher; concurrent TAG requests check response pairing, missing token checks refusal. [Kernel tests][t-kernel] contrast same-session persistence/different-session isolation, reset/exception/timeout, changed approval callback and retired authority. `test_ignored_helper_error_is_reported_for_that_cell_only` expects success plus error metadata. Parent-death test starts real child, confirms alive, kills host, waits child exit. These tests do not prove OS sandboxing or exactly-once writes.

**The backend specialist seam:** reuse confined JS/TS CodeMode with explicit host tools and per-execution limits. Do not adopt Python kernel, socket protocol or empty-whitelist fallback. Preserve per-leaf receipts outside model context; expose aggregate result without suppressing failures or charging only outer call.

## 5. MCP: reuse one client, preserve uncertain outcomes and nested costs

**Trace:** registered MCP tool → `_trust_gate_check` → circuit breaker → acquire/lazy-connect server → per-server `_rpc_lock` and in-flight tracking → SDK `call_tool` → render/sanitize result → breaker bookkeeping → host result. Plugin route: `PluginContext.call_mcp` → exact per-plugin server allowlist → **same** native handler/connection → bounded envelope. Sources: [handlers][mcp-handlers], [plugins][plugins], [MCP loop][mcp-loop].

- Trust defaults **full**; explicit untrusted tier requires approval for tools lacking exact `readOnlyHint=True`. Unknown trust spelling becomes untrusted. Approval-system failure blocks before transport/lazy spawn. Server annotation is supplied by server, not a proof of harmlessness.
- `ctx.call_mcp` grant is per server, not per exposed tool. It constructs handler directly: does not traverse session toolset filtering, generic model pre/post hooks or deferred-schema validation. `ctx.dispatch_tool` similarly calls registry directly. Same transport ≠ same caller policy. This is sanctioned trusted-plugin authority, not model-scoped invocation parity.
- Server state/connection ownership are profile-keyed; consuming profile keeps its own trust/concurrency policy. Raw server provenance is stored, never recovered by parsing lossy display names. Actual [wire naming][mcp-names] is `mcp__<server>__<tool>`, with deterministic hash suffix at 64-character cap; docs' single-underscore examples are stale.
- Agent parallel opt-in does not remove `_rpc_lock` in `_make_tool_handler`: inspected native RPC path serializes calls per server. Distinguish planner concurrency, concurrency across servers, and concurrent requests on one connection.
- Breaker opens after three consecutive failures, cooldown 60s; application rejection differs from unreachable transport in message. Dead stdio **before dispatch** reconnects/retries once; death **after start** returns `outcome_uncertain`, without replay. Session-expiry path similarly avoids retrying write-capable calls; read-only calls can retry. OAuth recovery has separate retry branch.
- `_run_on_mcp_loop` polls interrupt/deadline and cancels future. Remote effect may already exist. Plugin envelope keeps `ok/error/result`, but discards fields such as `outcome_uncertain`; result truncation is character-based, not a byte budget. Preserve uncertainty structurally in any backend specialist adapter.
- [Sampling][sampling] can call host `call_llm(task="mcp")` behind MCP request. Defaults 10 requests/minute, 4096 max output tokens, 30s timeout, five tool-use rounds; server-supplied tool schemas forwarded. These are per-server controls, not parent composition's spend budget. `wait_for(to_thread(...))` stopping await does not forcibly stop synchronous provider work. Source labels this legacy sampling lane deprecated in newer protocol; do not infer newer MRTR accounting from it.

**Adverse case:** remote write succeeds then transport dies; automatic retry duplicates effect, or facade strips uncertainty and invites model retry. Another: one apparently cheap MCP tool triggers paid sampling invisible to parent-model transcript.

**Test control:** [MCP plugin tests][t-plugin-mcp] pair deny-before-handler with allowed existing-handler dispatch; transport is mocked. [Trust tests][t-trust] contrast untrusted write/read-only/full trust. [Fast-fail tests][t-mcp-failure] use real MCP loop with stub sessions: pre-call death executes one eventual RPC; mid-call death increments effect once, reconnects, returns uncertainty. Need real-server dropped-response control before claiming end-to-end at-most-once behavior.

**The backend specialist seam:** existing MCP service remains connection/auth owner. Adapt error vocabulary and scope propagation at host invocation boundary; preserve cancellation/uncertain effect independently of compact result. No second MCP client or per-plugin permissions database.

## 6. Plugin LLM facade: borrow host route, retain actual accounting

**Trace:** `ctx.llm` lazily constructs `PluginLlm(plugin_id=manifest key)` → per-call trust-policy/task-ownership read → independent override gates → host auxiliary `call_llm`/`async_call_llm` → text/JSON parsing → usage + route attribution + audit result. [Implementation][plugin-llm] is byte-identical in R/M.

- Default call borrows active provider/model; explicit provider/model/agent/profile overrides independently gated. Owned auxiliary task allowed; foreign/unknown task refused before provider invocation. Canonical plugin key, not display label, selects policy.
- Facade runs one logical completion, not another conversation/tool loop. Existing auxiliary client still owns routing/retry/fallback; one logical call must not be counted as one guaranteed physical provider request.
- Contract caveats: malformed JSON yields text/`parsed=None`; JSON schema mismatch raises `ValueError`; unavailable optional `jsonschema` skips strict validation. `_extract_usage` fills token/cache fields but never populates `cost_usd` despite result type/docs; missing cost is unknown, not zero.
- `agent_id` is gated and returned as attribution, but `_host_kwargs` does not forward it into host `call_llm`. Inspected implementation does not demonstrate advertised cross-agent credential/model selection. Do not turn cosmetic IDs into authority selectors.

**Adverse case:** hook calls completion for every tool result, multiplying paid work while main context stays small; result claims schema validity without validator installed; audit agent label mistaken for executed route.

**Test control:** [LLM tests][t-plugin-llm] contrast allowed model override with forbidden provider override; facade tests inject callers, schema-success test can skip on missing dependency. [Task tests][t-plugin-task] pair owned task routing with `test_foreign_task_raises_before_invoking_caller` (`captured == {}`), and exercise fallback attribution. Add malformed JSON / invalid schema / missing-validator controls before promising typed result contract. No live model billing proof here.

**The backend specialist seam:** only if plugin-side inference needed, expose narrow facade over Orchestra's existing provider service with host-bound identity, timeout/budget and attempt telemetry. No Hermes auxiliary gateway, auth-profile store or model router port.

## “Zero-context-cost” claim — precise verdict

[README][readme] says Python RPC collapses pipelines into “zero-context-cost turns”. Defensible narrow reading: intermediate subcall results need not enter **parent model conversation**. Literal zero is false.

| Resource | Still charged / retained |
|---|---|
| Parent model tokens | Execute/search schema and listing, generated program, final output/error envelope, prior history; describe results and cold discovery turns when used. |
| Tool execution | Every filesystem/network/MCP operation, retries, CPU, child/kernel memory, output capture/spill, connection startup and cleanup. |
| Other model tokens | `ctx.llm`, MCP sampling and tools that invoke models; retries/fallbacks may add physical attempts. |
| Audit/storage | Per-call receipts, errors, usage, retained results remain necessary even when hidden from model. |

Measure eager versus composition on same task/output-quality target: parent input/output/cache tokens; auxiliary input/output/cache tokens by physical attempt; admitted/succeeded/failed/uncertain subcalls; wall time/tool CPU; output/spill bytes; billed cost when returned. Unknown provider usage/cost stays unknown. Fewer parent tokens can coexist with higher total spend or worse retrieval accuracy.

## Minimal adaptation in the backend specialist / Orchestra

Local anchors below refer to O; they are inspected existing code, not newly shipped integration.

1. **Reuse current composition host.** `packages/opencode/src/tool/code-mode.ts`: `CodeModeTool` builds permission-visible MCP tree; `invokeChildTool` fires before hook, asks permission, calls existing MCP client with abort signal, then after hook; child IDs derive from parent call. This is concrete reuse seam, currently MCP-oriented.
2. **For V2 native leaves, use canonical settlement.** `packages/core/src/tool/registry.ts`: `materialize()` filters definitions and captures registration identities; `settleWith()` rejects stale identity, supplies session/agent/message/call context, runs leaf, bounds output through `ToolOutputStore`. Any future CodeMode view must delegate to that settlement, not reach private executors or add registry authorization callbacks. MCP/plugin registration remains explicitly unfinished in `packages/core/src/tool/AGENTS.md`; do not claim legacy adapter already satisfies V2 integration.
3. **Small host-owned addition:** invocation envelope binding stable actor/session/Location, parent/child call IDs, final argument provenance, deadline and shared subcall/spend budget; derive tool view from current host scope. Each canonical leaf retains resource resolution → permission → effect. Empty exposed set stays empty. Catalog/display rename must not change policy key or execution target.
4. **Close outcomes outside model context.** Host emits one child settlement record even when script catches failure, output is aggregated, or cancellation wins. Preserve unknown-effect status; bounded model aggregate references host-retained evidence. `packages/codemode/src/tool-runtime.ts` currently observes success/failure, explicitly not interruption; host must close cancelled spans rather than invent success.
5. **Choose host budgets explicitly.** `packages/codemode/src/codemode.ts` exposes `timeoutMs`, `maxToolCalls`, `maxOutputBytes`, with absent values unlimited. Existing `CodeModeTool` supplies no execution limits. Set the backend specialist composition policy at host adapter; do not copy Hermes's fixed defaults or make CodeMode generic permission engine.
6. **Keep shared Atlas and optional Maestro native.** Route memory reads/writes through same Atlas host tools and stable project/user/actor namespaces; interpreter globals are not memory. Inspected `maestro/atlas-source.ts` is project-grounding/snapshot verification, not proof of complete shared conversational-memory API. Reuse Atlas owner once integrated; do not add Hermes `MemoryStore` or make standalone backend specialist depend on Maestro activation.
7. **Presentation-only naming.** `maestro/roster.ts` already separates `displayName` from `memberId`; native authorization checks canonical ID/native flag. Make labels configurable around that contract. Plan/approval/Atlas ownership and historical receipts remain keyed by stable IDs.

**Proposed acceptance controls, not executed:** rename display label with same actor/tool IDs and verify identical grant/receipt target; expose empty/disjoint tree and prove zero effects; rewrite denied path before final leaf policy and prove no write; revoke/replace tool after materialization and reject stale call; interrupt composed write with simulated lost response and retain uncertain outcome without replay; compare same aggregate with hidden child failures/auxiliary spend still recorded. Use allowed-call positive controls alongside every denial assertion. These controls target host seam, not a duplicate Hermes implementation.

## Sources (immutable unless local O anchor stated)

[release]: https://github.com/NousResearch/hermes-agent/releases/tag/v2026.9.24
[r-code]: https://github.com/NousResearch/hermes-agent/blob/f97608f178d1ffeca59860195ab7da295f7c8e5f/tools/code_execution_tool.py#L556-L558
[readme]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/README.md#L28
[d-runtime]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/tools-runtime.md
[d-middleware]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/middleware.md
[d-observer]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/observer-hooks.md
[d-code]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/user-guide/features/code-execution.md
[d-search]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/user-guide/features/tool-search.md
[d-plugins]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/user-guide/features/plugins.md
[d-llm]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/developer-guide/plugin-llm-access.md
[d-mcp]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/website/docs/user-guide/features/mcp.md
[registry]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/registry.py
[providers]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/providers/__init__.py
[plugin-discovery]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_cli/plugins_discovery.py
[model-tools]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/model_tools.py#L707-L969
[search]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/tool_search.py
[search-validation]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/tool_search_validation.py#L74-L136
[batches]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/tool_call_batches.py#L14-L63
[executor]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/tool_executor.py#L684-L830
[executor-order]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/tool_executor.py#L1648-L1825
[middleware]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_cli/middleware.py
[plugin-dispatch]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_cli/plugins_dispatch.py
[code]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/code_execution_tool.py
[rpc]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/code_execution_rpc.py
[kernel]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/code_kernel.py
[remote-kernel]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/code_kernel_remote.py#L207-L267
[code-env]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/code_execution_env.py
[mcp-discovery]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/mcp_tool_discovery.py
[mcp-cache]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/mcp_schema_cache.py
[mcp-handlers]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/mcp_tool_handlers.py
[mcp-loop]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/mcp_tool_loop.py#L148-L183
[mcp-names]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/mcp_tool_schema.py#L172-L183
[sampling]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tools/mcp_tool_sampling.py#L89-L231
[plugins]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/hermes_cli/plugins.py#L510-L714
[plugin-llm]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/agent/plugin_llm.py
[t-registry]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/tools/test_registry.py
[t-lazy]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/tools/test_mcp_lazy_start.py
[t-search]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/tools/test_tool_search.py
[t-batches]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_local_tool_batches.py
[t-model-tools]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/tools/test_model_tools.py#L76-L128
[t-guardrail]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_tool_call_guardrail_runtime.py#L249-L323
[t-plugins]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/hermes_cli/test_plugins.py
[t-timeout]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_sequential_tool_timeout.py#L169-L215
[t-code]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/tools/test_code_execution.py
[t-kernel]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/tools/test_code_kernel.py
[t-plugin-mcp]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/hermes_cli/test_plugin_call_mcp.py
[t-trust]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/tools/test_mcp_trust_gating.py
[t-mcp-failure]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/tools/test_mcp_stdio_fastfail_reconnect.py#L95-L180
[t-plugin-llm]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_plugin_llm.py
[t-plugin-task]: https://github.com/NousResearch/hermes-agent/blob/d795726f78e532ca31655f74656b4be63a907581/tests/agent/test_plugin_llm_task_routing.py
