# R13 — Grok / Grokbot ecosystem → the backend specialist

Research snapshot: **2026-10-03**. Static source/document review; public firsthand reports checked against current thread state. No live inference, installed products, or measured performance comparison. Evaluation cases below are proposed, not executed.

## Decision

**Use Grok through the backend specialist's existing provider boundary. Borrow small mechanisms from Grok Build and community code; keep Orchestra execution and native Atlas Knowledge/Memory authoritative.** Grok Bot supplies useful product patterns, but its required cloud computer, hosted state, and managed model selection conflict with the backend specialist's independent backend-plugin/no-extra-runtime-or-store target.

Target composition: the backend specialist usable without Maestro. Optional Maestro integration contributes native task/role context to the same plugin. Display names remain configuration, separate from stable agent, Session, provider, and memory-scope identities. Recommendations below are design transfers, not claims that the backend specialist already implements them.

## Identity: what “grok/grokbot” can mean

| Identity | Verified primary evidence | Classification / reuse implication |
|---|---|---|
| **Grok models/API** | [Official model catalog][models], [function calling][functions]. Current docs recommend `grok-4.7`; list a 500k context window. | Model service, not inherently a coding-agent harness. Repository access, command execution, permissions, verification, and durable work ownership come from its client. Advertised context is not demonstrated coding accuracy. |
| **Grok Build**, executable `grok` | [Official overview][build], [xai-org/grok-build][build-repo]. Public Rust CLI/TUI/runtime; interactive, headless, ACP. | Verifiable official coding-agent product. First-party code Apache-2.0; periodic monorepo export, not an independently maintained public contribution workflow. |
| **Grok Bot** | [Official xAI overview][bot], corroborated by [Cursor plans][bot-plans] and [hosting/model controls][bot-security]. | Official documented persistent-teammate product, using Cursor accounts and Cursor-hosted computers. Bots can do coding-adjacent work, browser tasks, shell work, and bug reproduction. Product name does **not** guarantee that every request uses a Grok model: Cursor manages serving models; no customer-facing picker. |
| **`@grok` bot on X / Grok chat** | [xai-org/grok-prompts][prompts] explicitly identifies X/grok.com prompts. | Separate surface from Grok Bot and Grok Build. Prompt repository is AGPL-3.0, not Apache-2.0. Public prompts do not establish a reusable full agent runtime. |
| **superagent-ai/grok-cli** | [README][community] expressly disclaims xAI affiliation. [npm `grok-dev`][npm-dev] publishes version `1.1.7`, MIT, executable `grok`; registry `gitHead` matches reviewed repository revision. | Community Bun/TypeScript coding agent. Not official Grok Build, despite executable-name collision. Historical [npm `@vibe-kit/grok-cli`][npm-vibe] remains `0.0.34`; its `gitHead` resolves to this repository's [historical package manifest][vibe-package] with name `@vibe-kit/grok-cli`, but source package version `0.0.33`. Lineage verified; published-byte equivalence not established. |
| **ScriptedAlchemy/grok-bot-cli** | [Repository][gbot], [npm metadata][npm-gbot]: `0.11.3`, MIT, author Zack Jackson; commands `gbot`/`grok-bot`. | Community management/bridge client for official Grok Bot. Requires signed-in desktop app; uses its encrypted session/routing credentials. Not an official xAI SDK or standalone coding engine. Optional relay features introduce their own worker/state. |
| **pftq/GrokBot** | [Repository README][pftq]: Windows desktop mouse/keyboard script, supports both Grok and ChatGPT; source MIT. | Different community product dating from 2025. README explicitly says demo wait times were truncated and models were slow. Not evidence about current Grok Bot or Grok Build latency. |

**Naming verdict:** official **Grok Bot is resolved and verifiable**. User's unspaced “Grokbot” still does not uniquely identify it; community names above remain distinct candidates. This report studies the official product plus clearly labeled community projects rather than silently substituting one.

### Evidence boundaries

- Reviewed official source at `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8` (2026-09-29); its `SOURCE_REV` is `559751fdcec02d413e4c57c8832ab275e4f44980`. Public snapshot need not equal every released binary.
- Reviewed community CLI at `fb97af83f06dca873281d60168430f06c8de6324` (2026-05-15); `grok-bot-cli` at `256fb849de887682a4c9b00a1e42af686833fc8b` (2026-10-02). Links below pin substantive source findings.
- Official docs discovery used <https://docs.x.ai/llms.txt>; GitHub identity cross-check used <https://api.github.com/orgs/xai-org/repos>. GitHub metadata explicitly reports `has_issues: false` for `xai-org/grok-build`; relevant reports exist in official `xai-org/plugin-marketplace`. Empty main-repository issues output was not treated as evidence of reliability.
- Search/API positive controls returned known official repositories, community issue bodies, npm `grok-dev`, and Cursor forum topics. <https://registry.npmjs.org/grokbot/latest> returned HTTP 404: only that exact registry endpoint was unresolved, not all packages/projects named Grokbot. `https://x.ai/news` returned HTTP 403; no claims depend on it.
- Issue reports are case evidence, not prevalence estimates. Staff confirmation, author resolution, open status, and unconfirmed root cause remain distinct. Documentation numbers are quoted capabilities, not measurements made here.

## Findings — mechanism, reuse, fit, limits, evaluation

### F1. Keep tool execution with the backend specialist; model/API supplies decisions

**Evidence / strength:** [Function calling][functions] returns named, JSON-schema-parameterized requests for local execution. Multiple calls may arrive together; callers must return all results. Streaming function calls arrive whole in one chunk. This fits host-owned coding tools across languages.

**Lean pattern / fit:** translate existing tool schemas/results at the provider boundary; preserve tool-call identity and typed errors. Keep one explicit `llm.stream(request)` per provider turn in the existing Session runner. Host executes authorized tools; reload durable projected history before continuation. API examples using SDK-managed loops are examples, not the backend specialist's ownership design.

**Limit:** xAI's [hosted code execution][code-execution] is sandboxed Python, with temporary/stateless context and no external filesystem/network access. It cannot validate the backend specialist's Rust/Go/Node/Next checkout. Model tool requests do not prove execution or correctness.

**Evaluation:** parallel independent reads plus conflicting edits, malformed arguments, and cancellation. Check each issued tool call gets an attributable result; no duplicated write after interruption; compiler/test evidence comes from the selected Location.

### F2. Prefer semantic navigation; bind diagnostics to edited versions

**Evidence / strength:** Build's [LSP tool][lsp] exposes definition, references, hover, implementations, document symbols, and workspace symbols. [Configuration][lsp-config] selects servers by file extension and workspace root. [Diagnostics source][diagnostics] tracks `covers` document versions, handles pushed/pulled reports, and rejects older answers.

**Lean pattern / fit:** use host's configured LSP for narrow symbol slices; feed source-linked snippets and versioned diagnostics through native Atlas Knowledge/context. Reuse diagnostic freshness semantics, not the Rust LSP runtime.

**Limit:** a configured, functioning server is required. A server omitting diagnostic versions is credited by arrival order/latest-sent version; that is weaker evidence. LSP checks are not runtime tests, and configuration support does not establish language-specific success rates.

**Evaluation:** rename Rust trait/Go interface/TS symbol, then deliver old diagnostics after a newer edit. Verify stale success cannot mark current code clean. Missing language server must produce an explicit fallback/unavailable state, not an empty-success verdict.

### F3. Small verification recipes cover broad stacks, with evidence

**Evidence / strength:** community CLI's [recipe source][recipes] explicitly detects Next.js/Node, Python/Django, Go, Rust, and other ecosystems from manifests/lockfiles; derives build/test/start commands. [Evidence guidance][verify-evidence] requests bounded readiness checks, logs, browser interaction, screenshots/video, and explicit failures.

**Lean pattern / fit:** retain only a small manifest → repository-approved command plan plus evidence references. Run through existing host tools; keep project facts in Atlas Knowledge and results with native task/session artifacts. Use host browser capability for Next UI checks where available; report unavailable capability explicitly.

**Limit:** fallback chooses one ecosystem, with `package.json` winning over Python/Go/Rust. Go/Rust defaults use `smokeKind: "none"`; Python entrypoint detection is heuristic. Browser guidance is a prompt, not proof its steps ran. Community `/verify` depends on Shuru sandbox support documented for macOS 14+ Apple Silicon; copying its orchestrator would add runtime/platform coupling.

**Evaluation:** mixed Next frontend + Rust service + Go worker + Python job. Detect package boundaries; honor local instructions; make a UI test fail after build succeeds. Report each checked/unavailable target separately; missing evidence cannot become “verified.”

### F4. Optimize measured useful work, not “fast” model names

**Evidence / strength:** [Caching docs][cache] recommend stable `prompt_cache_key`/`x-grok-conv-id`, unchanged prefixes, static material first, and `cached_tokens` inspection. [Reasoning controls][reasoning] offer low/medium/high/xhigh for `grok-4.7`; high is default, reasoning cannot be disabled. [Catalog][models] documents higher whole-request pricing once prompt reaches 200k tokens.

**Lean pattern / fit:** stable cache identity derived from native Session; stable instructions/tool catalog before changing context. Expose explicit effort and task budgets; record uncached/cached input, output/reasoning, tool latency, first token, first visible answer, and time to verified result in existing events.

**Limit:** cache eviction/routing can miss; caching accelerates prefill, not all work. Build latency report R1 shows why token speed alone misses user wait. Community R10's usage parser drops cached-token detail; that hides savings, not provider billing discounts. Neither supports a general Grok speed ranking.

**Evaluation:** same bug fix, cold/warm prefix and low/high effort. Compare verified result, retries, wall time, and billed usage; change an early message as cache-miss control. Track reported serving model, not display name alone.

**Migration ambiguity:** [May 15 retirement guide][retirement] retires `grok-code-fast-1`. Its opening blanket redirect says `grok-4.3`, while code-specific row/section says `grok-build-0.1`. Do not silently adopt old “fast” pricing or assume redirect target; probe actual response model during later integration. No probe ran here.

### F5. Compaction is working context, not durable knowledge

**Evidence / strength:** [Compaction API][compact] replaces history with an opaque `encrypted_content` item; subsequent requests pass it unchanged. [Responses docs][responses] offer server-side chaining with 30-day retention and `store: false` for client-managed history. Grok 4.7 returns encrypted reasoning by default.

**Lean pattern / fit:** native Session remains transcript authority; Atlas stores inspectable facts, decisions, evidence, and corrections. Keep provider-specific opaque items in existing provider/session metadata only if its contract supports them. Budget selected context and compact before overflow; preserve task constraints and evidence references outside lossy summaries.

**Limit:** compaction itself consumes tokens and cannot rescue an already over-limit request. Ciphertext is meaningful to xAI, not portable memory. Docs' Vercel SDK automatic-reasoning behavior is conditional on `store`; explicitly verify round-tripping with `store: false`. A cached prefix or response ID is not durable prompt admission.

**Evaluation:** retain an early API constraint through compaction, process restart, and provider switch. Current source plus native facts must recover the task without decrypting/rewriting provider blobs or depending on an expired response ID.

### F6. Borrow bounded memory discovery, keep Atlas as foundation

**Evidence / strength:** Build's [memory guide][memory] describes workspace/global scopes, bounded topic indexes, per-turn observations and `/dream` consolidation in v2; browsing, toggling, explicit remembering, and forgetting. Memory is experimental; both memory and v2 default off. Legacy retrieval/config sections coexist in the same guide.

**Lean pattern / fit:** small Atlas-backed topic/index summary, selective retrieval, provenance-linked observations, and reviewed promotion into durable knowledge. Preserve workspace scope across clones/worktrees while keeping cross-project preferences separate. Human correction should supersede prior facts visibly.

**Limit:** Build uses its own Markdown/index storage under `~/.grok/memory*`; do not transplant it. “Forget” is documented best-effort; curated workspace/global notes can still become stale even where legacy staleness scoring exempts them. Consolidation is generated synthesis, not source verification.

**Evaluation:** save a successful debugging fact, change the relevant code, resume in another worktree, then correct/forget the fact. Atlas retrieval must distinguish old evidence, current source, scope, and supersession without another memory database or daemon.

### F7. Named teammates need inspectable roles, not name-based routing

**Evidence / strength:** [Grok Bot profiles][bot-profiles] distinguish name/label/description, task chat, learned memory, and templates. Duplication copies configuration but not learned memory/history. Build [custom model config][build] likewise separates model ID from `name = "Display Name"`.

**Lean pattern / fit:** configurable backend specialist display name, stable identity underneath, visible role brief and effective settings. Optional Maestro supplies role/task assignment using those stable IDs; standalone backend specialist uses the same profile contract. Role instructions, saved preferences, and task inputs stay inspectably distinct.

**Limit:** R6: staff confirms current personal-Bot description editor disappeared despite docs. Bot roles are also not filesystem/login isolation: official docs say all Bots on one account share a computer and browser sessions. Model selection is managed, not user-selectable.

**Evaluation:** rename the backend specialist during an existing Session; verify routing, permissions, Atlas scope, and history stay attached to the same identity. Edit role text through configuration and inspect exactly what applies on the next safe turn boundary.

### F8. Persistence must expose actual recovery semantics

**Evidence / strength:** Build [sessions][sessions] persist conversations/tool calls/file snapshots and todos, support resume/fork/rewind, and expose session search/export. Grok Bot keeps named working context and cloud files across sessions; work continues when the laptop closes.

**Lean pattern / fit:** retain native durable admission and exact-retry reconciliation; keep execution wake advisory. Existing Session storage owns replay; Atlas owns reusable knowledge. Surface checkpoint/evidence freshness and distinguish resumed conversation from restored files and still-running tasks.

**Limit:** Build rewind changes files and truncates conversation. Docs disagree: sessions page says `--session-id` creates, never resumes; [headless flag table][headless] says create-or-resume. Bot reset can lose unsynced work; R5 reports wider rollback, cause unconfirmed. Neither product proves backend-specialist-style exact retry or crash-continuation guarantees.

**Evaluation:** admit-only prompt, restart before wake, exact retry, conflicting reuse, and stale workspace checkpoint. Preserve one admitted input and explicit execution state; do not invent automatic post-crash provider continuation or overwrite newer files while restoring chat.

### F9. Separate steering, queueing, progress, and cancellation

**Evidence / strength:** Build [background tasks][tasks] distinguish running processes from persisted todos, queued prompts, and explicit backgrounding; [shortcuts][keys] describe interjection. Bot [chat][bot-chat] supports redirects and asynchronous visible handoffs.

**Lean pattern / fit:** use native steer/queue vocabulary and safe-boundary promotion. Progress queries read event/task state rather than submitting another work instruction. Cancellation targets existing active ownership chain; show whether a foreground operation, independent background task, or queued input remains.

**Limit:** Bot R4 includes staff observations that arriving messages could restart a computer-use helper; later evidence identified a separate browser-service wait. Build R3 reports conflicting Esc cancellation contracts. Documentation labels cannot prove descendant processes stopped or spending ceased.

**Evaluation:** long build plus status polling, then steer, queued request, and cancel. Polling must not restart work; steers apply at safe boundary; one queue item promotes when otherwise idle. Verify owned work stops and explicitly independent background tasks follow host policy.

### F10. Keep permissions authoritative across every execution route

**Evidence / strength:** Build [permissions][permissions] separate approval from [sandbox][sandbox], give deny precedence, and retain explicit deny/hooks in always-approve. [Plan mode][plan] provides review/comment controls; [hooks][hooks] expose lifecycle events and project trust.

**Lean pattern / fit:** expose plan/approval/auto policy as native host controls with visible effective scope. Plugin delegates execution authorization to existing host permission owner. Maestro coordination uses the same controls.

**Limit:** documented plan mode gates edit tools, not shell writes; child agents are not edit-gated by parent's plan mode. Hook timeouts/crashes/malformed output fail open; only explicit denial blocks. Sandbox defaults off, and child-network restriction is Linux-only. Bot Auto Review is a model-based layer and excludes some side effects, including memory writes.

**Evaluation:** identical disallowed write through edit, shell redirection, MCP, and delegated action; hook timeout; mode switch mid-turn. Assert native policy has the promised scope. Do not equate “plan,” “auto,” or a plugin hook with a complete execution boundary.

### F11. Make debugging evidence and feedback first-class, without a collector

**Evidence / strength:** Bot's [Bug Reproduction use case][use-cases] asks for exact steps, expected/actual result, environment, console/network notes, and minimal test case. Its [skills/routines][routines] turn corrected tasks into reusable instructions with validation/failure handling. Build [usage schema][usage] separates token, reasoning/cache, tool decisions, outcome, first-token, and first-message signals.

**Lean pattern / fit:** native event receipts for command, package/cwd, revision, exit status, relevant diagnostics, artifact references, and next blocker; Atlas Memory learns reviewed corrections, not every chat sentence. Promote a workflow only after replay on a distinct input. Reuse existing observability, not another OTEL service.

**Limit:** R7's routine reports only “Activity task failed”; a successful manual rerun does not explain original failure. Build [status cost][status] counts current process, restarting at resume, so it is not lifetime Session cost. Bot spending limit can allow already-running work to finish beyond the cap [plans][bot-plans]. No prescribed capture format proves a test actually executed.

**Evaluation:** compiler failure, missing dependency, timed-out browser check, cancelled command, and stale screenshot. Result must identify failed/unrun checks and current evidence. Resume cost/progress must preserve native accounting; correction saved from one run must improve a second without concealing failure.

## Dated public reports — status checked 2026-10-03

| ID / source | Firsthand evidence and current status | Scope / the backend specialist lesson |
|---|---|---|
| **R1** [Build #714](https://github.com/xai-org/plugin-marketplace/issues/714), 2026-09-14 | User supplies 1.0.30 Windows/Grok 4.6 High phase/token logs and fresh-session repro; empty pre-token waits even with cached input. **Open**; follow-up same day. | Specific CLI/proxy/version report, not current 4.7 benchmark. Instrument queue/prefill/reasoning/text/tool/verification phases separately. |
| **R2** [Build #694](https://github.com/xai-org/plugin-marketplace/issues/694), 2026-09-12 | ARM64 TUI/TLS SIGILL while `--version` worked; multiple hardware reports. Original reporter says **1.0.41 fixed their case**, 2026-09-27; issue **closed/completed** that day. | Historical resolved case, not blanket ongoing ARM failure. Integration smoke must exercise real startup/tool/API path, not only version output. |
| **R3** [Build #1076](https://github.com/xai-org/plugin-marketplace/issues/1076), 2026-10-02 | Reporter identifies Esc doc/pager/cancel-trigger mismatch and requests turn-scoped cancellation semantics. **Open**, no subsequent response in retrieved thread. | Public source/contract review, not an independently reproduced incident here. Verify stop behavior instead of importing keyboard labels as guarantees. |
| **R4** [Bot #173037](https://forum.cursor.com/t/173037), 2026-09-26 | User reports accessible computer but stalled browser tasks. Staff first describes helper restarts on new messages; [Oct 2 follow-up](https://forum.cursor.com/t/173037/24) confirms server-side browser/connector waits and suggests on-screen interaction workaround. **Open**, last reply Oct 3. | Staff-supported product issue; two mechanisms at different observations, not one proven universal cause. Distinguish progress polling from steering and expose tool-layer waits. |
| **R5** [Bot #173623](https://forum.cursor.com/t/173623), 2026-10-02 | User reports unexpected cloud snapshot rollback and missing recent files across Bots, with timestamps/version details; cannot reproduce on demand. **Open**, no staff resolution in retrieved thread. | Reported data loss; exact cause and recovery unresolved. Durable-context promise needs visible provenance/checkpoint age; do not assert hosted backup guarantees from marketing. |
| **R6** [Bot #173333](https://forum.cursor.com/t/173333), 2026-09-29 | Users cannot view/edit personal role description. [Staff Sep 30](https://forum.cursor.com/t/173333/7) confirms UI/docs mismatch, says chat workaround unreliable, no ETA. **Open**, more feedback Oct 3. | Strong evidence for inspectable effective role/config, separate from memory and display name. |
| **R7** [Bot #173672](https://forum.cursor.com/t/173672), 2026-10-03 | Reporter describes Oct 2 scheduled failures showing only “Activity task failed”; later manual run succeeded. **Open**, no diagnosis in retrieved thread. | Failure visibility issue; neither failed background run nor successful rerun establishes root cause. Preserve structured run receipts. |
| **R8** [Community CLI #274](https://github.com/superagent-ai/grok-cli/issues/274), 2026-04-18 | User fixing a large C project sees `reasoning part reasoning-<UUID> not found` and gets stuck. Maintainer attributes stream handling to Vercel SDK. **Open**. Linked [Vercel PR #13110](https://github.com/vercel/ai/pull/13110) also **open/unmerged** at check. | Community SDK/stream integration, not official Build or all Grok models. Conformance case: missing/out-of-order reasoning-start must not strand tools/session. Maintainer attribution is not independently proven root cause. |
| **R9** [Community CLI #346](https://github.com/superagent-ai/grok-cli/issues/346), 2026-07-22 | Contributor reports Node/Vitest cannot load storage's static `bun:sqlite` import. **Open**; reviewed [source][community-db] still imports it and owns `~/.grok/grok.db`. | Concrete runtime/storage coupling; Node engine metadata alone is insufficient. Reuse small logic, not community persistence stack. |
| **R10** [Community CLI #254](https://github.com/superagent-ai/grok-cli/issues/254), 2026-04-08 | Outsider's static review flags missing cached-token detail. **Open**; pinned [`getBatchUsage` source][community-agent] still returns aggregate tokens/cost without that breakdown. | Confirmed narrow parser observation. Reject report's blanket discount/billing-loss inference and generic grade; API billing occurs independently of UI accounting. |

## Language coverage evaluation matrix

These are the backend specialist acceptance scenarios, not claimed Grok pass results. Use existing package-local build/test commands and installed tools; an unavailable toolchain is an explicit incomplete result.

| Target | Concrete repair / evidence |
|---|---|
| Rust | Trait/lifetime refactor crossing modules; versioned rust-analyzer diagnostics plus targeted Cargo build/test. Include feature-gated error that plain file inspection misses. |
| Go | Cancellation propagation across goroutines; gopls references, targeted tests and race-enabled case where supported. Verify an idle-looking background worker really stops. |
| Python | Async resource-cleanup bug and changed dependency/API; package's test/type/lint commands, failing reproduction, source-linked corrected memory. |
| TypeScript | Generic type/API change across packages; host language service plus package `typecheck` and affected tests. Do not validate an old diagnostic version. |
| JavaScript / Node | CJS/ESM import-boundary regression; run actual supported Node target and integration test, not Bun-only success. |
| Next.js | Server/client boundary or hydration regression; package build, live route, browser interaction and console evidence. HTTP 200 or screenshot alone is insufficient. |
| Mixed monorepo | Select relevant packages across all above; avoid first-manifest-only recipe. Compact/resume, rename agent, issue steer/queue, and retain one coherent native evidence trail. |

For each scenario record outcome, exact revision/model/effort, usage breakdown, tool calls/retries, first useful feedback, time to verified result, user interventions, and recovery behavior. Pair negative cases with known-working controls; never score unavailable/skipped checks as passed.

## Reuse/license disposition

| Source | Verified license / practical disposition |
|---|---|
| [Grok Build LICENSE](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/LICENSE) | **Apache-2.0** first-party. Small algorithms/data contracts are feasible references. Preserve required license/NOTICE/change notices when copying. Full Rust runtime/TUI/ACP process adds another execution and persistence owner. |
| [Build tool notices](https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/THIRD_PARTY_NOTICES.md) | Codex tool ports **Apache-2.0**; Orchestra ports **MIT**. Check existing host/upstream implementation before porting it back. Vendored/bundled dependencies have their own terms; repository label does not blanket-relicense them. |
| [Community CLI LICENSE](https://github.com/superagent-ai/grok-cli/blob/fb97af83f06dca873281d60168430f06c8de6324/LICENSE) | **MIT** declared by source/npm; source copyright line contains placeholders. Recipe/evidence logic is feasible reference with notices/provenance retained; database, Shuru runtime, TUI, daemon, and Telegram loop do not fit the backend specialist's composition. |
| [grok-bot-cli LICENSE](https://github.com/ScriptedAlchemy/grok-bot-cli/blob/256fb849de887682a4c9b00a1e42af686833fc8b/LICENSE) | **MIT**. Bounded thread polling (`cursor`, `gapReset`) and explicit unknown-delivery receipts are useful patterns. Desktop credential coupling and relay worker/state are not a native backend specialist foundation. |
| [pftq/GrokBot LICENSE](https://github.com/pftq/GrokBot/blob/0e7eb599f81dc1bc0e3be110824d528df27282c7/LICENSE) | **MIT**. Mainly identity disambiguation; Windows desktop-control script is poor fit for independent backend coding plugin. |
| [Grok prompts][prompts] | **AGPL-3.0**. Read for product identity; no prompt-text copying recommendation. |
| Grok Bot hosted product / Grok API models | No reusable source license established for these products from inspected surfaces. Public docs are behavioral evidence, not permission to copy service internals or model weights. Build's Apache license does not license Grok models. |

## Minimal backend specialist transfer

1. Provider adapter: explicit model/effort, cache identity, complete tool/result mapping, raw usage and provider metadata preserved.
2. Native execution: existing Session admission/runner/permissions/tools; progress and cancellation remain host-owned. ACP/headless capability is comparison evidence, not reason to spawn Grok Build inside the backend specialist.
3. Native Atlas: source-linked code facts, bounded retrieval, reviewed durable corrections, visible provenance/forget behavior; Session history and Context Epoch remain Session-owned.
4. Thin profile: configurable display name and inspectable role; optional Maestro assignment, same backend plugin and stable identity.
5. Verification receipts: package-aware commands, current diagnostics, concrete artifacts, named incomplete states; reuse existing observability and storage.

**Unresolved:** user's exact “Grokbot” referent; runtime behavior of current binaries versus exported source; conflicting `--session-id` documentation; `grok-code-fast-1` redirect wording; actual latency/cost/quality under the backend specialist's tool schemas; incident root causes not confirmed above. None requires adding a runtime/store to investigate later.

## Source links

[models]: https://docs.x.ai/developers/models
[functions]: https://docs.x.ai/developers/tools/function-calling
[code-execution]: https://docs.x.ai/developers/tools/code-execution
[reasoning]: https://docs.x.ai/developers/model-capabilities/text/reasoning
[cache]: https://docs.x.ai/developers/advanced-api-usage/prompt-caching/best-practices
[compact]: https://docs.x.ai/developers/advanced-api-usage/context-compaction
[responses]: https://docs.x.ai/developers/model-capabilities/text/generate-text
[retirement]: https://docs.x.ai/developers/migration/may-15-retirement
[build]: https://docs.x.ai/build/overview
[build-repo]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/README.md
[lsp]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/grok_build/lsp/mod.rs
[lsp-config]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/lsp/config.rs
[diagnostics]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-tools/src/implementations/lsp/diagnostics.rs
[memory]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/13-memory.md
[usage]: https://github.com/xai-org/grok-build/blob/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8/crates/codegen/xai-grok-pager/docs/user-guide/24-monitoring-usage.md
[sessions]: https://docs.x.ai/build/features/sessions
[headless]: https://docs.x.ai/build/cli/headless-scripting
[tasks]: https://docs.x.ai/build/features/background-tasks
[keys]: https://docs.x.ai/build/keyboard-shortcuts
[permissions]: https://docs.x.ai/build/features/permissions
[sandbox]: https://docs.x.ai/build/features/sandbox
[plan]: https://docs.x.ai/build/features/plan-mode
[hooks]: https://docs.x.ai/build/features/hooks
[status]: https://docs.x.ai/build/features/status-line
[bot]: https://docs.x.ai/grok-bot/overview
[bot-plans]: https://cursor.com/help/grok-bot/plans
[bot-security]: https://docs.x.ai/grok-bot/security
[bot-profiles]: https://docs.x.ai/grok-bot/bots
[bot-chat]: https://docs.x.ai/grok-bot/chat-and-collaboration
[routines]: https://docs.x.ai/grok-bot/skills-routines-and-automations
[use-cases]: https://docs.x.ai/grok-bot/use-cases
[prompts]: https://github.com/xai-org/grok-prompts
[community]: https://github.com/superagent-ai/grok-cli/blob/fb97af83f06dca873281d60168430f06c8de6324/README.md
[community-db]: https://github.com/superagent-ai/grok-cli/blob/fb97af83f06dca873281d60168430f06c8de6324/src/storage/db.ts
[community-agent]: https://github.com/superagent-ai/grok-cli/blob/fb97af83f06dca873281d60168430f06c8de6324/src/agent/agent.ts
[recipes]: https://github.com/superagent-ai/grok-cli/blob/fb97af83f06dca873281d60168430f06c8de6324/src/verify/recipes.ts
[verify-evidence]: https://github.com/superagent-ai/grok-cli/blob/fb97af83f06dca873281d60168430f06c8de6324/src/verify/evidence.ts
[npm-dev]: https://registry.npmjs.org/grok-dev/latest
[npm-vibe]: https://registry.npmjs.org/@vibe-kit%2Fgrok-cli/latest
[vibe-package]: https://github.com/superagent-ai/grok-cli/blob/b8c6feecdf4cba1daa0e278ceac39868d3c77ca6/package.json
[gbot]: https://github.com/ScriptedAlchemy/grok-bot-cli/blob/256fb849de887682a4c9b00a1e42af686833fc8b/README.md
[npm-gbot]: https://registry.npmjs.org/grok-bot-cli/latest
[pftq]: https://github.com/pftq/GrokBot/blob/0e7eb599f81dc1bc0e3be110824d528df27282c7/README.md
