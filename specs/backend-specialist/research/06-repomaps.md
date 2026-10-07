# R06 — Aider / Continue: repository context and bounded backend edits

Research date: 2026-10-03. Recommendation: adopt task-scoped context, deterministic edits, and explicit validation evidence; adapt optional planning/model specialization. Atlas remains shared Knowledge/Memory foundation. Repository maps supply versioned navigation hints, not verified knowledge.

## Evidence scope and current status

Primary docs and source read directly through HTTPS/GitHub API. Source observations below mean static implementation inspection, not executed behavior. **D** = documentation claim; **S** = source-observed implementation; **P** = proposed adaptation. Cost, latency, quality improvements remain unmeasured.

| Project | Current `main` snapshot inspected | Confirmed repository license | Status qualification |
|---|---|---|---|
| Aider | [`5dc9490bb35f9729ef2c95d00a19ccd30c26339c`](https://github.com/Aider-AI/aider/commit/5dc9490bb35f9729ef2c95d00a19ccd30c26339c), committed 2026-05-22 | [Apache-2.0, actual LICENSE.txt][A-license] | Source snapshot, not installed-release verification. |
| Continue | [`5522c6f44ca0ac3528b37244818fbfa39b5af470`](https://github.com/continuedev/continue/commit/5522c6f44ca0ac3528b37244818fbfa39b5af470), committed 2026-07-21 | [Apache-2.0, actual LICENSE][C-license] | [Current README][C-readme] declares repository no longer actively maintained, read-only, and final 2.0.0 release. GitHub API returned `archived: false`; README maintenance statement and GitHub archive flag are different facts. |

Both full root licenses inspected, not inferred from badges. Copying implementation requires Apache license/attribution and changed-file notices, plus applicable NOTICE obligations. Root licenses do not establish licenses for every dependency, grammar, model weight, or hosted service.

Live docs checked include [Aider repository map](https://aider.chat/docs/repomap.html), [lint/test](https://aider.chat/docs/usage/lint-test.html), [Continue Agent](https://docs.continue.dev/ide-extensions/agent/how-it-works), [Plan](https://docs.continue.dev/guides/plan-mode-guide), [Edit context](https://docs.continue.dev/ide-extensions/edit/context-selection), and [Apply role](https://docs.continue.dev/customize/model-roles/apply). Additional documentation read from same pinned source trees. IDE, CLI, retained/deprecated providers, and experimental tools identified separately where behavior differs. Semantic-index construction, embeddings, and deep symbol-resolution tooling remain outside this research.

## Finding 1 — Maps work best as bounded locators

**D:** Aider describes signatures/classes/functions selected using graph ranking, guiding agent toward files needing full inspection. Published map budget defaults around 1k tokens, expanding when chat has no files. [Repository-map docs][A-map-doc]

**S:** `RepoMap` defaults to `map_tokens=1024`, `map_mul_no_files=8`; empty-chat expansion depends on known context size and reserves 4096 tokens. Ranking uses definition/reference-name relationships, chat files, mentioned paths, and identifiers. `base_coder.get_repo_map()` supplies current-message hints and excludes already included editable/read-only files from its normal other-files map. This is task-relative orientation, not an authoritative compiler-resolved dependency graph. Token counting samples longer text; map fitting accepts a 15% tolerance, so nominal map budget is not a hard request limit. [Map implementation][A-map] · [Context assembly][A-context]

**S:** Continue's map generator walks workspace paths and optionally consumes available signatures. It sets map allowance to half model context length and prunes lines to fit. Actual Agent tool registration adds `view_repo_map` only under `enableExperimentalTools`; docs list it without that qualification. Follow registration code rather than stale enum comments. [Generator][C-map] · [Tool registration][C-tools] · [Agent docs][C-agent-doc]

**D/S boundary:** Continue now documents `@Codebase`/`@Docs` as deprecated, preferring agent file/search tools, rules, and external sources. Retained `requestFilesFromRepoMap()` asks an LLM for 5–10 paths and then reads files; its presence does not establish that normal Agent turns run this pipeline. [Migration guidance][C-awareness] · [Retained selector][C-map-selector]

**Decision — ADAPT.** Use small, explicit map allowance for discovery, then read relevant implementation/contracts/tests. Assemble from host-provided repository observations; consume deeper index output through its existing owner if available. Keep missing/unsupported/truncated coverage explicit. Never infer “irrelevant” from omission, or promote map relationships directly into Atlas facts.

**Practical overhead:** Aider approach adds cold scan, parser/ranking work, derived cache, and per-turn map tokens. Continue's half-window allowance can be expensive. Initial plugin can reuse native list/search/read plus bounded rendering; importing either complete indexing/runtime stack is unnecessary for this pattern.

## Finding 2 — Context visibility, edit scope, and freshness need separate contracts

**S:** Aider renders editable file contents, read-only reference contents, and other-file map separately. `allowed_to_edit()` accepts chat files and otherwise asks about new/out-of-chat files. This is an explicit working set, not a sandbox or immutable denylist. [Context assembly][A-context] · [Edit admission][A-admission]

**D/S:** Continue Edit docs say entire current file is context and only highlighted/specified ranges are edited. Source makes distinction more precise: `streamEdit()` supplies selected text plus prefix/suffix, pruning each surrounding segment to one quarter of model context; `streamDiffLines()` constructs replacement diff against highlighted text. Long-file context can therefore be partial. IDE `read_file` separately rejects files over half selected chat model's context when a model is available. [Edit docs][C-edit-doc] · [Range assembly][C-edit-range] · [Diff generation][C-stream-edit] · [Read limit][C-read-limit]

**S:** Continue CLI records successful reads in a session `Set` of real paths and requires membership before Edit. That proves a read happened, not that content remains unchanged. Edit preprocessing computes replacement content; `run()` writes it without comparing current bytes. IDE multi-edit re-reads/recomputes when execution begins, explicitly accounting for pending-call changes. [CLI Read][C-cli-read] · [CLI Edit][C-cli-edit] · [IDE multi-edit][C-multi]

**S:** Aider tag cache checks mtime, but higher-level map cache keys use file sets/budget and optionally mentions; refresh policy also matters. Do not equate cached map with freshly read content. [Map cache][A-map]

**Decision — ADOPT working-set separation; ADAPT freshness.** Context packet should distinguish `editable`, `reference`, `candidate`, and `unknown`; carry Location/worktree identity, base revision, dirty-file content digest, path/range, provenance, and truncation state. Before edits, refresh target bytes and enforce expected version through native edit tooling. Git commit alone cannot identify dirty or unsaved state. Maps may remain disposable task artifacts; Atlas stays sole shared Knowledge/Memory foundation.

**Practical overhead:** Selected-file reads/hashes and small provenance payload. More reliable than caching an entire repository summary indefinitely. Cross-file backend changes still need caller, schema, fixture, migration, and build-manifest context beyond chosen edit ranges.

## Finding 3 — Edit formats reduce output; applicators determine actual bounds

**D:** Aider offers whole-file, SEARCH/REPLACE (`diff`), `diff-fenced`, simplified unified diff, and editor-focused variants. Whole-file output repeats unchanged code; formats are model-configurable. Claims of optimal formats/model pairings are recommendations, not measured here. [Edit-format docs][A-format-doc]

**S:** Aider SEARCH/REPLACE first tries exact text, then leading-whitespace accommodation and ellipsis handling. Failed target matching can retry other files in chat. Ordinary perfect replacement uses first matching block; successful blocks can remain applied when later blocks fail. Parser errors feed correction messages. Thus “SEARCH must exactly match” prompt wording is stricter than complete applicator behavior. [EditBlockCoder][A-edit]

**S:** Continue multi-edit computes sequential replacements in memory and rejects ambiguous multiple occurrences unless `replace_all` is requested. Its underlying matcher tries exact, trimmed, case-insensitive, then whitespace-ignored matching. IDE source revalidates before starting application. These support per-file prevalidation, not a multi-file transaction guarantee. [Replacement engine][C-replace] · [Matching strategies][C-match] · [IDE multi-edit][C-multi]

**S:** Continue Apply first attempts deterministic supported-language full-file handling, then unified-diff handling; otherwise supplies an LLM fallback. Search/replace results use immediate diff application. Apply model selection falls back to chat model. [Apply dispatcher][C-apply] · [VS Code ApplyManager][C-apply-manager]

**Decision — ADOPT deterministic native patches; REJECT silent scope relaxation.** Keep Orchestra's native edit protocol. Add task-level allowed paths/ranges, expected bytes/digest, ambiguity rejection, changed-file/line budget, and post-apply diff accounting where host capabilities support them. On mismatch, refresh context and regenerate bounded edit; do not silently substitute another path or case-insensitive match. Use whole-file generation when task warrants it, with explicit scope. Preserve partial-application status if host cannot atomically apply full batch.

**Practical overhead:** Local matching/diff work plus occasional regeneration request. Deterministic application avoids an extra model call. Model fallback may produce syntactically valid edits yet expand semantic scope; successful application is not proof of correctness.

## Finding 4 — Architect/editor separation helps when handoff is complete

**S:** Aider `ArchitectCoder.reply_completed()` passes architect response into an editor coder, inheriting editable/read-only file sets via `Coder.create(from_coder=...)`. It clears editor conversation, disables editor map, shell-command suggestions, prompt cache, and cache warming; configured editor can equal main model. This is sequential proposal-to-edit translation, not independent validation. [Architect source][A-architect] · [Inherited file context][A-inherit] · [Modes docs][A-modes-doc]

**D/S:** Continue documents Plan as read-only exploration before Agent execution. IDE selector enforces `readonly` for built-ins but retains enabled non-built-in tools regardless of that flag. CLI Plan policies exclude Edit/MultiEdit/Write yet allow Bash and wildcard MCP tools; permission service selects these mode policies. These are materially different capability boundaries. [Plan docs][C-plan-doc] · [IDE selector][C-plan-tools] · [CLI policy][C-cli-plan] · [CLI policy selection][C-cli-policy-service]

**Decision — ADAPT optional separation; REJECT role names as enforcement.** Planning output should be a compact, evidence-backed change contract: intent, invariants, exact scope, API/schema constraints, acceptance commands, unresolved questions, Atlas references, and budget. Executor retains authority to stop on stale facts or inconsistent instructions. Host tool permissions enforce write/execute scope across built-ins and integrations.

Standalone invocation builds that contract from user request. Maestro delegation consumes same contract and returns same result envelope; preserve caller decisions instead of buying a redundant architecture pass. Maestro integration is optional caller adapter, not prerequisite scheduler. Stable machine identity selects specialist; configurable display name affects presentation only.

**Practical overhead:** Split path adds serial model request and repeats selected file context. Missing handoff detail can erase gains. Default small, clear tasks to direct execution; enable split for ambiguous or cross-boundary work after measurement.

## Finding 5 — Compiler/test feedback must report what actually ran

**D/S:** Aider supports per-language lint commands and configured test/build commands. Source defaults `auto_lint=True`, `auto_test=False`, and limits reflected correction rounds with `max_reflections=3`. After edits, lint/test errors can become next model input through confirmation policy. Tests require configuration; presence of feature is not proof every change gets tests. [Lint/test docs][A-check-doc] · [Defaults][A-defaults] · [Repair loop][A-feedback] · [Reflection limit][A-reflections]

**S:** Built-in linting includes tree-sitter syntax checks and Python compilation/selected Flake8 checks. `basic_lint()` explicitly returns for language `typescript`; repository typecheck commands remain necessary. External command diagnostics receive nearby source context. [Linter source][A-linter]

**S:** Continue terminal tool captures local process output/status and has timeout handling. Its remote-workspace branch delegates to IDE terminal, returning: “Command executed in remote terminal. Output capture is not yet available for remote environments.” Retained Problems provider turns IDE diagnostics plus nearby code into context; that is not evidence a complete project compiler or suite ran. [Terminal implementation][C-terminal] · [Problems provider][C-problems]

**Decision — ADOPT bounded feedback loop, ADAPT per-package command manifests.** Select existing lint/typecheck/build/targeted-test commands with correct working directory, toolchain, environment, and fixture/service requirements. Return command, revision/digests, exit/signal/timeout, selected tests/skips where runner exposes them, bounded diagnostics, and full-output reference. Distinguish `passed`, `failed`, `unavailable`, `not-run`. Feed actionable failures into limited repair attempts; then escalate with evidence rather than declaring success.

For this checkout, package-level `bun typecheck` and package-local tests follow supplied project rules. Other backend ecosystems need their own declared Go, Python, Rust, JVM, or .NET commands. Compiler success does not validate DB migration compatibility, transaction behavior, service contracts, or deployment configuration.

**Practical overhead:** Usually dominated by real build/test processes and service setup, not map generation. Incremental targeted checks improve iteration; final checks must retain required integration/environment coverage. Remote “executed” without completion/output is `unavailable`, not `passed`.

## Finding 6 — Optimize accepted-task cost, not model sticker price

**S:** Aider explicitly selects main, weak, and editor models. Weak/main fallback list feeds summarization and commit-message selection. Architect can choose another editor and carries accumulated cost back. `ChatChunks` orders system/examples/read-only/map/history/editable/current context and marks cache boundaries. Cost reporting uses provider usage where available, otherwise token estimates and model prices. [Model roles][A-models] · [Summary configuration][A-summary] · [Architect][A-architect] · [Cache boundaries][A-cache] · [Cost reporting][A-cost]

**D/S boundary:** Aider docs explicitly warn architect mode adds requests and can increase time/cost; caching docs describe opt-in caching and keepalive requests. Continue recommends smaller/cheaper Apply models and advertises provider speed; source proves configurable apply/chat fallback and deterministic paths, not savings or vendor performance. [Modes][A-modes-doc] · [Caching docs][A-cache-doc] · [Continue Apply docs][C-apply-doc] · [ApplyManager][C-apply-manager]

**Decision — ADOPT role-aware budgets and stable context; ADAPT optional model specialization.** Deterministic patch application first. Use cheap model only for measured, constrained transformation with stronger-model escalation and cumulative task cap. Budget all planning, retrieval, editing, summarization, retries, verification, and cache writes/reads; record unknown prices as unknown. Avoid copying cache-warming or fixed model-family recommendations as defaults.

**Practical overhead:** Provider-specific capabilities/pricing metadata, usage accounting, and evaluation maintenance. Extra cheap requests can cost more than one successful strong-model request. Keep stable Atlas/project instructions separate from volatile task evidence; preserve native Session context/caching behavior rather than inventing another history/memory store.

## Proposed Orchestra integration

This is design guidance, not claim of implemented Atlas/Maestro APIs.

- **Input:** stable specialist ID; configurable display label; task/acceptance criteria; Location/worktree; base revision plus dirty-state identity; allowed edit scope; Atlas record references; context/tool/model/check budgets; caller metadata, with Maestro delegation optional.
- **Working context:** small candidate map → current source reads → selected contracts/tests/config → compact implementation brief. Every derived claim carries producer, path/range/version, confidence/evidence status, and coverage limits. Map/source text remains data; it cannot grant permissions or supersede instructions.
- **Execution:** use native tools and Session execution lifecycle; read/version-check → bounded patch → inspect diff → declared checks → bounded repair. Scope expansion returns a structured reason to existing caller policy.
- **Result:** patch/diff identity, changed paths, checks and their execution evidence, unresolved constraints, usage/cost including failures, and cited candidate knowledge observations. Atlas owns shared knowledge validation and persistence. Disposable map caches and task artifacts do not become a parallel memory service.
- **Native context seam:** local `CONTEXT.md` defines Location-scoped Context Sources, stable keys, safe provider-turn admission, Context Epochs, and bounded Model Tool Output. Preserve those semantics. Its lines 119–126 describe producer ownership and mark plugin-defined registration/hot reload as follow-up; do not promise a turnkey registration API based on that document alone. Local reference: `/Users/gustavoschneiter/Documents/HuGR/orchestra-canonical/CONTEXT.md`.

## Evaluation controls — proposed, not executed

**Paired comparisons:** same pinned backend tasks, repository states, model versions, credentials class, test environment, permissions, and total budget. Start with native search/read/edit baseline; independently vary bounded map, richer evidence packet, architect pass, and cheaper editor. Compare same-model split first to isolate workflow effect from model quality. Keep deterministic application/check policy constant when measuring context selection.

**Task coverage:** within-module fix; cross-service API/schema change; DB migration; shared-library change; generated-code boundary; test/fixture/config change; non-symbol runtime wiring. Include compiled and interpreted stacks, monorepo package roots, large files, and unsupported map languages. Manually establish acceptable relevant-file sets; allow multiple valid solutions rather than equating correctness with one reference patch.

**Controls that must detect failure:**

- Known relevant file/symbol must be discoverable in positive-control task; rename/move or omit it from map and ensure full reads/search can recover. Truncation/unsupported extraction must not masquerade as complete coverage.
- Change target after read; duplicate SEARCH text across files and within one file; vary case/indentation; inject out-of-scope edit. Check conflict/ambiguity handling and exact changed-path accounting, including partial batches.
- Provide contradictory stale map and current file; stale Atlas reference; insufficient Maestro brief. Confirm uncertainty stays explicit and unverified observations are not persisted as Atlas truth.
- Exercise planner through permitted integration/terminal paths, not only built-in edit tool, to test actual capability boundary.
- Seed genuine type error and test failure; wrong cwd, missing runner, empty/skipped suite, timeout, remote command without captured result. Verification must distinguish failed/unavailable/not-run from passed. Keep one real repository/toolchain/environment lane so synthetic controls cannot hide integration coverage loss.
- Run cold/warm cache and supported/unsupported provider cases. Include failed attempts and fallback calls in cost totals.

**Outcomes:** independently reviewed task correctness; out-of-scope/unrelated changes; applicable-test results; relevant-file discovery; stale-context incidents; first-apply success and partial-apply recovery; token usage by stage; provider cost per accepted task; elapsed time; build/tool cost; human repair effort. Quality/scope regression must not be traded away for lower token count. No numerical benefit claimed before these controls run.

## What original framing missed

1. **Product lifecycle and surface drift:** Continue's current README declares final release; docs still advertise tools gated experimental in source. IDE and CLI Plan policies differ. “Continue supports X” needs surface/version qualification.
2. **Authority and freshness:** useful context, edit permission, and verified knowledge are separate. Repository SHA misses dirty/unsaved changes; successful prior read misses intervening writes. Maps need coverage/staleness labels.
3. **Backend context outside symbol maps:** routes, DI/config, SQL/migrations, generated schemas, build roots, fixtures, rollout compatibility, and runtime service dependencies often determine correct patch.
4. **Edit execution semantics:** exact-match prompts coexist with permissive matchers, cross-file fallback, and partial application. Planning quality cannot compensate for hidden applicator behavior.
5. **Evidence and economics:** command initiation is not completion; syntax check is not compiler/test coverage; cheap model is not cheap accepted task. Cost and quality must include retries, validation, environment setup, and human repair.

## Limits

Static research only. Upstream tools/tests, models, parsers, and benchmark workloads not executed. Default-branch source may differ from shipped packages or deployed docs; pinned references identify inspected behavior. Deprecated helper presence is not runtime reachability proof. Deep semantic indexing and Atlas/Maestro implementation audits intentionally outside scope. Proposed integration contracts and evaluation controls require later implementation/validation.

## Primary-source permalinks

[A-license]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/LICENSE.txt
[A-map-doc]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/website/docs/repomap.md
[A-map]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/repomap.py
[A-context]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L637-L787
[A-admission]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L2191-L2240
[A-format-doc]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/website/docs/more/edit-formats.md
[A-edit]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/editblock_coder.py
[A-architect]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/architect_coder.py
[A-inherit]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L153-L185
[A-modes-doc]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/website/docs/usage/modes.md
[A-check-doc]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/website/docs/usage/lint-test.md
[A-defaults]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L101-L106
[A-feedback]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1585-L1623
[A-reflections]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L924-L944
[A-linter]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/linter.py
[A-models]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/models.py#L603-L645
[A-summary]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L497-L513
[A-cache]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/chat_chunks.py
[A-cost]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L1994-L2060
[A-cache-doc]: https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/website/docs/usage/caching.md
[C-license]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/LICENSE
[C-readme]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/README.md
[C-map]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/util/generateRepoMap.ts
[C-tools]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/tools/index.ts#L6-L50
[C-agent-doc]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/docs/ide-extensions/agent/how-it-works.mdx
[C-awareness]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/docs/guides/codebase-documentation-awareness.mdx
[C-map-selector]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/retrieval/repoMapRequest.ts
[C-edit-doc]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/docs/ide-extensions/edit/context-selection.mdx
[C-edit-range]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/vscode/src/diff/vertical/manager.ts#L468-L550
[C-stream-edit]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/edit/streamDiffLines.ts
[C-read-limit]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/tools/implementations/readFileLimit.ts
[C-cli-read]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/cli/src/tools/readFile.ts
[C-cli-edit]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/cli/src/tools/edit.ts
[C-multi]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/gui/src/util/clientTools/multiEditImpl.ts
[C-replace]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/edit/searchAndReplace/performReplace.ts
[C-match]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/edit/searchAndReplace/findSearchMatch.ts
[C-apply]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/edit/lazy/applyCodeBlock.ts
[C-apply-manager]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/vscode/src/apply/ApplyManager.ts
[C-plan-doc]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/docs/guides/plan-mode-guide.mdx
[C-plan-tools]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/gui/src/redux/selectors/selectActiveTools.ts
[C-cli-plan]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/cli/src/permissions/defaultPolicies.ts
[C-cli-policy-service]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/extensions/cli/src/services/ToolPermissionService.ts
[C-terminal]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/tools/implementations/runTerminalCommand.ts
[C-problems]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/core/context/providers/ProblemsContextProvider.ts
[C-apply-doc]: https://github.com/continuedev/continue/blob/5522c6f44ca0ac3528b37244818fbfa39b5af470/docs/customize/model-roles/apply.mdx
