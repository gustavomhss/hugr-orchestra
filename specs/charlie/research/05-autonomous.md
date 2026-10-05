# R05 — OpenHands / SWE-agent mechanisms for Charlie

**Research date:** 2026-10-03. **Disposition:** adapt mechanisms; retain OpenCode/Orchestra execution ownership and Atlas Knowledge+Memory ownership.

**Scope:** primary repositories/docs plus selected source, read-only investigation. This report proposes architecture and evaluation scenarios. It does not report implementation, executed upstream code, measured improvements, benchmark results, or security certification.

**Bottom line:** strongest transfers are structured action feedback, bounded recovery, separate workspace/process isolation, patch-bound verification evidence, provenance-preserving context compression, and replayable task manifests. Upstream products are reference implementations, not Charlie dependencies.

## 1. Verified identities, versions, licenses

GitHub repository and commit APIs resolved these identities. Source claims below use pinned snapshots; live documentation can drift independently.

| Candidate / owner | Inspected snapshot | Confirmed scope and license |
| --- | --- | --- |
| [`OpenHands/OpenHands`][OH] — requested `openhands/OpenHands` resolves here | `a6bba78ffd5a8b31620770f52383b1a2c0477fcd`, commit date 2026-10-03 | Current README identifies **Agent Canvas**: frontend/control center, backend selection, local-stack orchestration. Root [MIT license][OHL], copyright 2025 OpenHands contributors. |
| [`OpenHands/software-agent-sdk`][SDK] — followed official README ownership link | `8ac973c9ac7e71b4589e480f5f62fea723530334`, commit date 2026-10-03 | Current home for agent, tools, conversations, events, workspaces, Agent Server. Root [MIT license][SDKL], copyright 2026 OpenHands contributors. |
| [`SWE-agent/SWE-agent`][SWE] | `3ea751c087f32b16e039a2233dd6eefecef325d5`, commit date 2026-07-16 | ACI, agent/error handling, environment adapter, experiment harness. Root [MIT license][SWEL], copyright 2024 named authors. README recommends mini-swe-agent; live architecture docs say maintenance-only. |

Primary entry points: [OpenHands documentation index][OD0], [SWE-agent architecture][SD0]. Both candidate repositories were reported unarchived by GitHub API; maintenance-only is SWE-agent's own documentation wording, not an archival inference.

License reach: confirmed root license files for these snapshots. Retain notices if copying substantial code. Dependencies, images, datasets, model weights, hosted services, and separately hosted documentation need their own terms checked before redistribution/use. This research recommends concept-level adaptation.

OpenHands split is consequential: researching only today's `OpenHands/OpenHands` would inspect control-center code rather than most requested engineering mechanisms. Conversely, applying old `CodeActAgent`/controller documentation to current SDK would mix generations.

## 2. Target architecture: ownership before mechanisms

Names Charlie, Maestro, Atlas denote roles here. Public display names, exposed aliases, and integration labels must resolve through environment-backed configuration; stable internal capability IDs, evidence IDs, and schema versions must survive renaming. Exact environment keys are a future design decision.

| Owner | Proposed responsibility |
| --- | --- |
| **OpenCode/Orchestra host** | Session admission, provider-turn execution, tool registry, permissions, Location placement, interruption, durable transcript, Session History/Context Epoch selection. |
| **Charlie plugin** | Backend-engineering task policy/profile; typed task/result contract; tool-feedback presentation; verification expectations; task budget policy; references to artifacts and reusable knowledge. Invoke through host facilities. |
| **Maestro native integration** | Optional native capability binding using Charlie's same task/result contract. Supply objective, scope, baseline, limits and evidence references; receive progress, completion/blockage, cancellation acknowledgement. Direct Charlie invocation works without Maestro. |
| **Atlas** | Shared Knowledge+Memory: repository facts, validated failure lessons, provenance, retrieval and evidence references. Session execution/transcript remains host-owned; Charlie does not create another knowledge database or memory service. |
| **Host execution provider** | Workspace allocation/lease and process or container execution, with explicit capabilities and lifecycle. Charlie consumes existing placement/execution interfaces rather than starting another agent server. |

These are proposed contracts, not assertions about currently exposed plugin APIs. Before implementation, verify host extension points for process cancellation, exit-status evidence, artifact retention and context selection. Missing authority needs deliberate host integration; plugin wrappers cannot promise guarantees they cannot enforce.

V2 alignment: keep durable prompt admission separate from model execution; retain process-global, Session-ID-based execution and Location-scoped tools. Enforce policies through native provider/tool boundaries without creating another LLM loop. Omitted workspace identity retains current implicit-local semantics. Steer/queue admission and provider-turn allowance resets retain host meaning; a separate task-wide budget must have its own explicit scope. Recovery of an interrupted tool or process must not become implicit post-crash provider-work retry.

## 3. Recommended mechanism set

Overhead labels below are architectural estimates, not timings or measured cost claims.

### M1. Typed ACI with bounded observations and rollback-aware editing

**Observed.** SWE-agent's [ACI design notes][SD1] describe small file windows, concise directory-search results, edit-time lint feedback, and explicit empty-output messages. The original 100-line viewer setting is historical experimental guidance, not a universal optimum. Selected [linting edit command][S1] obtains pre-edit diagnostics, writes candidate edit, compares post-edit diagnostics, and undoes edit if new diagnostics appear. This is write-and-rollback behavior, not proof of an atomic transaction. Its [lint helper][S2] only applies to `.py` files, uses a selected Flake8 code set, and returns stdout without validating subprocess return code/stderr. Current [default config][S3] instead selects the Anthropic editor bundle; historical linting ACI is not synonymous with current default behavior.

OpenHands [tool-system docs][OD1] separate Action, Observation and Executor. Selected [terminal schema][O1] preserves command, exit status, timeout, working-directory metadata and full-output location while bounding model-visible output. Soft timeout has explicit still-running representation.

**Why valuable.** Backend tasks often fail through ambiguous shell state, overlong logs, stale edit coordinates or malformed patches before domain reasoning matters. Precise machine feedback makes correction cheaper and auditable.

**Adapt.** Express Charlie tool feedback through host schemas: stable operation ID, working directory/workspace identity, input revision/hash, terminal state, actual exit status, bounded excerpt and artifact reference. Preserve navigable file/search results. Let host editor validate expected old content before mutation; support fast language-appropriate diagnostics as feedback. Use candidate validation or scoped rollback, with concurrency protection against overwriting later edits.

**Reject.** Python-specific lint assumptions, fixed historical window sizes, shell-installed bundles, private editor registries, and “empty output means success.” In selected SWE agent code, empty-output prompt selection depends on whitespace content; Charlie must obtain success from process state and exit status. A lint infrastructure failure is `validation_unavailable`, not successful validation.

**Overhead.** Low for result schemas and excerpts; medium for version-aware editing and language diagnostics. Running full project checks after every edit can dominate iteration time; use fast checks locally, task verification separately.

**Negative/evaluation scenario.** Introduce syntax error into already-lint-dirty file; hide/misconfigure linter; issue command returning nonzero with empty stdout; edit after another writer changes file. Verify exact diagnostics, unchanged unrelated edits, named validation failure, and correct process status. Compare against native tools before adding another wrapper.

### M2. Multidimensional budgets plus typed, bounded recovery

**Observed.** SWE-agent [tool configuration][S4] distinguishes per-command execution timeout, install timeout, cumulative command execution timeout and consecutive timeout ceiling. Cumulative timeout explicitly stops a subsequent step rather than interrupting current command. [Agent source][S5] differentiates format/blocklist/bash-syntax correction, command interruption, runtime failure and terminal exits; failed corrections remain in trajectory even when omitted from later model history. `max_requeries` limits formatting failures, while retry-sentinel branches do not increment that counter. [Model accounting][S6] checks cost and API-call ceilings after updating usage; those checks are not strict pre-spend reservations.

OpenHands [local conversation source][O2] adds iteration limits, combined LLM spending checks and a nudge-before-stop path. [Stuck detector][O3] checks repeated action/observation, repeated action/error, monologue and alternating patterns over recent events. Equality includes action thought text; semantically repeated work can evade literal equality. Important discrepancy: [guide][OD2] describes context-window-loop detection, but selected `_is_stuck_context_window_error` implementation is a TODO returning `False`.

**Why valuable.** “Retry” covers incompatible situations: a parse error has not mutated anything; a transport timeout may hide a completed mutation; an idle provider request and a child process consume different budgets. One step count cannot bound all of them.

**Adapt.** Have Charlie declare budgets for provider turns/calls, tokens or spend, wall time, command runtime, repair attempts, output volume and workspace resources. Host enforces whichever dimensions it owns. Charge summarization and retries too. Distinguish schema correction, transient provider/read failure, live command still running, confirmed command cancellation, test failure, infrastructure failure and ambiguous write outcome. Bounded correction/nudge precedes `blocked` or `budget_exhausted`; salvage diff/log artifacts with explicit incomplete status. Unknown completion requires reconciliation against operation ID and workspace state before retry.

**Reject.** Resetting budgets on each retry, treating command-time sum as task wall time, assuming soft timeout killed process, promoting salvaged patch to success, and adopting whole RetryAgent/controller. Heuristic stuck detection is advisory evidence, not proof of no progress.

**Overhead.** Low bookkeeping; medium lifecycle/reconciliation work. Retries and summaries have real model cost. Pre-call estimates can reserve allowance, but final spend still depends on provider accounting and in-flight requests.

**Negative/evaluation scenario.** Process applies migration/file mutation then loses response; next poll still runs; cancellation races exit; provider repeatedly emits malformed tool input; action alternates forever; valid compile is quiet but progressing. Check reconciliation before rerun, capped retries, honest incomplete result, and low false-stop rate on valid long work. Inject repeated context errors explicitly rather than assuming upstream stuck detector covers them.

### M3. Separate edit isolation from execution isolation

**Observed.** Current [OpenHands README][OHR] explicitly warns that separate conversation containers mounting same host workspace still share files; use separate directories or worktrees to avoid conflicting edits. [Docker guide][OD3] describes workspace lifecycle and health checks. Selected [DockerWorkspace source][O4] permits caller-supplied mounts, forwarded environment variables and network selection, launches container, checks readiness and handles cleanup. Its defaults include a mutable image tag. Guide's “complete isolation” wording exceeds what configuration alone proves.

SWE-agent [architecture][SD0] places shell execution in SWE-ReX deployment; selected [environment code][S7] delegates deployment/session operations and offers reset/hard-reset. This demonstrates separation of agent policy from execution environment, not a reason to adopt SWE-ReX as Charlie's runtime.

**Why valuable.** Git worktrees isolate working files; they do not isolate processes, network, ports, credentials, databases or every shared Git resource. Containers can isolate execution while still sharing source files through mounts. Backend integration tests need both dimensions understood.

**Adapt.** Request an exclusive host workspace lease bound to repository/base revision and task, then an appropriate execution capability for that workspace. Keep IDs and lifecycle separate. Record image digest/platform where containers are used; namespace temporary databases, ports and writable caches. Reconcile surviving workspace state after process replacement. Export patch and evidence before disposal, through host artifact facilities.

**Reject.** One container equalling one independent checkout, treating local-process mode as sandboxing, broad host workspace mounts, and importing Agent Server/Canvas/automation stack. Do not assume current V2 explicit workspace identity already supplies future placement semantics.

**Overhead.** Medium/high: checkout space, dependency caches, image acquisition, sandbox startup, service setup and cleanup. Worktree-only mode can be appropriate for trusted tasks, with process-isolation capability reported accurately. Warm resources trade startup cost for contamination risk.

**Negative/evaluation scenario.** Concurrent tasks edit same filename and run same database migration. Reuse container with stale environment, mount same worktree twice, or leave child server alive after timeout. Verify workspace ownership conflict is visible, test services are distinct and cleanup evidence corresponds to actual process state. Assess isolation using configured mounts/network/resources, not product label.

### M4. Patch-bound test feedback and honest completion evidence

**Observed.** SWE-agent [default prompt][S3] asks for reproduce → edit → reproduce again → edge cases. Its [review-on-submit command][S8] captures diff, displays configured review messages, advances review stage, then emits submission marker; `--force` bypasses review prompts. This command does not establish test success. [Error autosubmission][S5] attempts to salvage current or previously recorded diff after failures. [Output docs][SD3] distinguish generated predictions from evaluation, and selected [evaluation hook][S9] hands predictions to external `sb-cli`.

**Why valuable.** An agent saying “done,” a nonempty diff and a passing check from an older workspace state are different facts. Backend correctness needs evidence tied to exact tested change and environment.

**Adapt.** Charlie's proposed result envelope carries baseline revision, patch digest, changed-file inventory, task criteria, verification commands, working directory, environment/image identity, start/end state, exit status, selected-test/execution evidence, log references and unresolved failures. Where useful, retain reproduction evidence before fix. Rerun relevant verification when tested code changes. Use statuses such as `verified`, `partial`, `blocked`, `infrastructure_failed` and `budget_exhausted`, with verified scope stated explicitly.

Atlas can retain validated lessons and evidence references. Host retains authoritative action history. Maestro consumes same evidence-bearing result as direct user invocation; textual self-assessment does not gain authority through integration.

**Reject.** Benchmark prompt instruction to revert all test changes; real engineering often needs new regression tests. Reject submit markers or model critique as acceptance oracle, blanket staging/cleanup against shared user work, and treating failure-salvaged patch as verified. Checks must distinguish setup failure, zero selected tests, skips, regressions and known baseline failures.

**Overhead.** Medium: artifact provenance and result collection; test execution often highest recurring cost. Choose checks by changed surface and declared acceptance criteria, then widen only when evidence warrants it.

**Negative/evaluation scenario.** Agent changes test to hide bug, checks select zero cases, service cannot start, or patch changes after green run. Include known-broken and known-correct fixture variants. Verification must reject falsely green evidence and accept genuinely fixed variant. Retain partial patch on infrastructure failure without changing its completion status.

### M5. Compress model view; retain source provenance and protocol structure

**Observed.** OpenHands [condenser docs][OD4] describe head/tail retention and summary events identifying forgotten event IDs. Selected [LLMSummarizingCondenser][O5] adds event-count/token/request triggers, minimum-progress requirement, leading-system-prompt preservation, boundary-aware ranges and bounded hard-reset summary retries. [Tool-call matching][O6] protects action/result boundaries; [tool-loop atomicity][O7] protects applicable thinking/tool-loop groupings.

Documentation defaults have drifted: guide says `max_size=120`, `keep_first=4`; selected class defaults are `240` and `2`, while `default_condenser()` passes `80` and `4`. Copy semantic constraints, not unverified thresholds.

SWE-agent [history processors][S10] support last-N observation elision, keep/remove tags and old file-window elision. Their comments explicitly discuss breaking prompt caching when earlier history changes. Current default config selects cache control, not last-N compression; caching and compression solve different problems.

**Why valuable.** Long backend debugging creates large logs and stale file views. Losing original error, rejected hypothesis, exact verification result or tool-call pairing can cause repeated failures or invalid provider input.

**Adapt.** Use host Session History/Context Epoch extension points to construct bounded views. Keep original transcript/artifacts authoritative; summaries carry source-event/artifact IDs, coverage range, summarizer/config version and unresolved questions. Preserve user constraints, latest code revision, pending operations and evidence needed for next action. Prefer cheap deterministic excerpting before paid summarization, with raw-output drill-down. Atlas retrieves reusable facts/lessons with provenance; current-session compression remains Session-owned.

**Reject.** Separate memory store, arbitrary text deletion, summary as verified fact, and blind summarizer retries that consume remaining task budget. Signed/provider-specific blocks need adapter-owned preservation rules. If valid boundaries prevent compression, return explicit context blockage or use host-supported recovery rather than constructing malformed history.

**Overhead.** Low deterministic filtering; medium/high summary calls, view construction, raw-artifact retention and cache invalidation. Measure total tokens including summaries and cache misses; smaller prompt alone does not prove lower total cost.

**Negative/evaluation scenario.** Trigger compaction halfway through multi-tool turn; bury decisive failure in long output; retain outdated diagnostic after file revision changes; cause summarizer failure. Check action/result pairing, retrieval of omitted evidence, revision-aware facts and bounded recovery. Compare task completion and repeated mistakes against uncompressed/native-context baseline.

### M6. Versioned task manifests, trajectories and isolated replay

**Observed.** SWE-agent [batch docs][SD2] and selected [instance source][S11] model task ID/problem, repository/base commit, environment image, split, filtering and deterministic shuffle before slicing. Source sorts IDs and seeds shuffle with `42`; this stabilizes selection for a fixed input set, not arbitrary future datasets. Generated image references may use `latest`, so manifest structure alone is not hermeticity.

[Output docs][SD3] describe per-step query/action/observation, per-instance config, patches and exit statuses. [Agent source][S5] records agent/SWE-ReX versions/hashes and replay config. [Replay implementation][S12] replaces model with recorded actions and re-executes in environment; this tests tool/environment behavior, not fresh model decisions. Selected replay `_get_env()` supplies empty post-startup commands, another reason not to assume identical setup merely because configuration was saved.

**Why valuable.** Reproducible tasks enable comparison of one mechanism against baseline, diagnosis of environment drift and separation of model failure from execution failure.

**Adapt.** Export a versioned Charlie task/evidence manifest using host and Atlas artifact references: objective/criteria, repository/base hash, input patch, image digest and architecture, dependency lock/setup hashes, tool/plugin/model configuration, resolved public-name mapping, budget policy, dataset/task revision, case IDs, raw outcomes and evaluator version. Keep replay modes distinct: transcript inspection, tool-only replay in disposable environment, fresh-model rerun, and patch evaluation from fresh baseline. Capture nondeterministic external dependencies explicitly.

**Reject.** Whole batch scheduler, trajectory database, benchmark-specific deployment stack, direct replay against active workspace, and interpreting deterministic shuffle/replay as deterministic agent success. Failure, interruption and unscorable environment outcomes stay visible in denominators.

**Overhead.** Low/medium metadata work, high environment and evaluator maintenance. Artifact volume grows with logs and repeated attempts; retention/retrieval belongs to shared infrastructure.

**Negative/evaluation scenario.** Move image tag, alter setup script, change dataset order/content, rerun non-idempotent migration, or interrupt result writing. Tool-only replay should expose drift without claiming model equivalence; evaluation should name missing evidence/setup divergence instead of silently excluding task.

## 4. Proposed evaluation, not executed results

Start with native OpenCode/Orchestra + Charlie profile baseline. Compare one mechanism at a time, then selected combined configuration, holding task revisions, model/provider settings, tools, permissions, budget and environment fixed. Allow normal LLM variation through predeclared repeated runs; report distributions and failure categories instead of single best run. Include both direct invocation and Maestro-native invocation under same contract.

Suggested backend cases:

| Case | What must be visible |
| --- | --- |
| HTTP validation/schema change | Wrong/missing status handling, generated-client implications, meaningful request/response checks. |
| Database migration | Partial application, rollback limits, idempotence and service state; git reset alone cannot restore database. |
| Async worker/retry defect | Duplicate side effect, cancellation race, timeout-versus-completion ambiguity. |
| Dependency/test-runner change | Installation failure versus code failure, locked environment identity, skipped/zero-selected checks. |
| Long debugging task | Critical old evidence retrieval, summary cost/cache effects, protocol-valid compacted history. |
| Concurrent isolated tasks | Worktree collision, shared cache/database/port contamination, resource cleanup. |

Oracles need positive and negative controls: known failing baseline and known corrected variant; silent nonzero process; unavailable linter; zero-test run; repeated action with changing thought; legitimate repeated poll with progress. These are proposed probes, not claims about passing tests or existing CI protection.

Record accepted task outcome, false completion, lost evidence, duplicate side effects, recovery effectiveness, false stuck stops, total model usage/cost, tool/setup time, wall time, artifact growth and human interventions. Report canceled, infrastructure-failed and unscorable tasks separately while retaining initial denominator. No benchmark ranking is inferred from source design, README claims or historical results.

For any later SWE-bench comparison, identify exact dataset revision/subset/split, model/provider version, agent/config commit, budget, number of attempts and selection policy, tool/image/environment versions, evaluator and evaluation date. Selected `sb-cli` adapter supports lite/verified/multimodal mapping; support for loading other subsets is not identical to support for evaluating them through that adapter [S9].

## 5. Uncertainty and what initial framing missed

1. **Repository identity outlives architecture.** OpenHands candidate is correct, but engineering agent moved behind official SDK boundary. SWE-agent itself now directs new adoption to mini-swe-agent. That successor's mechanisms/performance were not evaluated here.
2. **Primary docs still need source checks.** OpenHands stuck-detector guide describes a context-error detector whose selected method returns `False`; condenser defaults differ across guide/class/default factory. [Evaluation-harness page][OD5] still shows legacy `CodeActAgent`, `openhands/core/main.py` and controller imports, whereas current README describes Canvas + SDK ownership. Treat that page as legacy workflow evidence, not current integration recipe.
3. **ACI design depends on model, language and workload.** Historical 100-line views and Python Flake8 feedback are hypotheses for local adaptation, not universal settings or verified current performance advantage.
4. **Recovery is side-effect reconciliation.** A saved transcript, resumed conversation, recovered patch and rerun action are distinct. Backend migrations, queues and external API writes make this distinction load-bearing. Exactly-once effects are not established by inspected sources.
5. **Workspace isolation, process isolation and data-service isolation differ.** Worktrees and containers solve overlapping but non-equivalent problems. Persistent databases, caches, network services and Git metadata remain part of task environment.
6. **Patch generation is only one backend task shape.** Operations/debugging, schema rollout and incident triage can produce evidence or staged remediation rather than one diff. Charlie's result contract should admit those outcomes without claiming deployment occurred.
7. **“Autonomous” benchmarks hide product choices.** SWE default prompt prohibits test edits; legacy OpenHands evaluation example tells simulated user never to request human help. Those constraints make benchmark interaction repeatable but do not define Charlie's real engineering policy. Blockage/clarification can be correct result.
8. **Atlas needs evidence quality, not another transcript copy.** Preserve distinctions between retrieved fact, source observation, hypothesis, generated summary and verified result, including revision and trust provenance. Tool output and repository text are evidence inputs, not authority to alter task policy.
9. **No local integration or empirical benefit established.** Host plugin capability sufficiency, actual cancellation semantics, cross-platform behavior, failure rates, compression benefit and total overhead remain evaluation work. Selected source is narrower than whole-project assurance.

## 6. Priorities and rejects

**First design pass:** M1 structured outcomes + M4 evidence envelope; M2 budget/stop taxonomy at real host boundaries; M3 explicit workspace/execution capabilities. Use M6 manifests to evaluate these. Add M5 compression policy only after measuring native host behavior and long-task failure modes.

**Reject as dependencies:** OpenHands Canvas/Agent Server/conversation runtime, SWE-agent agent/retry/batch runtime, upstream memory/trajectory stores, benchmark-only submit policy. Reuse semantic contracts and lessons through native host services, optional Maestro binding and shared Atlas foundation.

## 7. Evidence ledger — exact primary URLs

All source links below pin inspected commits. Documentation links identify live primary pages; where docs/source disagree, mechanism sections state discrepancy. Symbol names identify relevant selected portions. Retrieved source was inspected as text, not executed.

### Repository ownership and licenses

- **OH / OHR:** OpenHands identity and current ownership: [pinned README][OHR], especially “Repository boundaries” and multiple Docker sandbox workspace warning.
- **SDK:** OpenHands Software Agent SDK repository, reached from OHR ownership table.
- **SWE:** [Pinned README][SWER], successor recommendation.
- **OHL / SDKL / SWEL:** pinned root MIT licenses.

### Primary documentation

- **OD0:** OpenHands V1 docs index, product/SDK separation.
- **OD1:** Tool System & MCP — Action/Observation/Executor contracts.
- **OD2:** Stuck Detector — documented patterns; compared with O3.
- **OD3:** Docker Sandbox — lifecycle, workspace setup, deployment claims.
- **OD4:** Condenser — event-backed views; compared with O5–O7.
- **OD5:** Evaluation Harness — legacy controller-oriented recipe and simulated-user policy.
- **SD0:** SWE-agent architecture — SWE-ReX boundary and maintenance-only notice.
- **SD1:** Pinned ACI documentation — historical design observations.
- **SD2:** Pinned batch documentation — task input/output and evaluation separation.
- **SD3:** Pinned output documentation — trajectories/configuration/predictions.

### Selected source

| ID | Source / inspected symbols | Supports |
| --- | --- | --- |
| O1 | [Terminal definition][O1]: `TerminalAction`, `TerminalObservation` | Timeout states, exit code, metadata, bounded output and saved-output pointer. |
| O2 | [LocalConversation][O2]: `_budget_exceeded_detail`, `_check_stuck_or_nudge`, run loops | Combined spending, nudge/stop and iteration limits. |
| O3 | [StuckDetector][O3]: `is_stuck`, `get_action_error_nudge`, `_event_eq`, context-error method | Exact matching, bounded scan, concrete detector limitation. |
| O4 | [DockerWorkspace][O4]: fields, `_start_container`, `cleanup` | Mounts/network/env, launch/readiness/lifecycle. |
| O5 | [LLMSummarizingCondenser][O5]: trigger/range selection, hard reset, default factory | Boundary-aware summary, source IDs, retry limits and defaults. |
| O6 | [ToolCallMatchingProperty][O6] | Action/result boundary protection. |
| O7 | [ToolLoopAtomicityProperty][O7] | Thinking/tool-loop atomicity constraints. |
| S1 | [Linting editor][S1]: `main` | Before/after diagnostics and rollback. |
| S2 | [Flake8 helper][S2]: `flake8`, `format_flake8_output` | Language/check scope, baseline comparison and subprocess caveat. |
| S3 | [Default config][S3] | Actual selected bundles, reproduction/review prompt and cache policy. |
| S4 | [ToolConfig][S4], timeout fields | Different execution bounds and cumulative-time semantics. |
| S5 | [Agent implementations][S5]: `handle_action`, `forward_with_handling`, `attempt_autosubmission_after_error`, trajectory methods | Error taxonomy, repair loops, patch salvage, history/evidence. |
| S6 | [Models][S6]: `_update_stats` and retry configuration | Post-response budget checks and bounded API retry settings. |
| S7 | [SWEEnv][S7]: start/reset/hard-reset/interrupt/communicate | Runtime delegation and environment lifecycle. |
| S8 | [Review-on-submit command][S8] | Staged prompt feedback, diff extraction and force bypass. |
| S9 | [SweBenchEvaluate][S9] | Separate evaluator handoff and supported subset mapping. |
| S10 | [History processors][S10] | Selective observation elision, tags, cache tradeoff. |
| S11 | [Batch instances][S11] | Manifest fields, base commit, dataset selection/shuffle and image defaults. |
| S12 | [RunReplay][S12] | Recorded-action re-execution, config validation and setup caveat. |

## 8. Research artifact boundary

Output: this `RESEARCH.md` in existing metadata-only detached worktree `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/charlie-r05-autonomous`, base `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`. Research used GitHub metadata/content APIs and primary document retrieval. No upstream installs, code execution, benchmark runs, production implementation, subagents, commits, pushes or configuration edits were part of this work.

[OH]: https://github.com/OpenHands/OpenHands
[SDK]: https://github.com/OpenHands/software-agent-sdk
[SWE]: https://github.com/SWE-agent/SWE-agent
[OHR]: https://github.com/OpenHands/OpenHands/blob/a6bba78ffd5a8b31620770f52383b1a2c0477fcd/README.md
[SWER]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/README.md
[OHL]: https://github.com/OpenHands/OpenHands/blob/a6bba78ffd5a8b31620770f52383b1a2c0477fcd/LICENSE
[SDKL]: https://github.com/OpenHands/software-agent-sdk/blob/8ac973c9ac7e71b4589e480f5f62fea723530334/LICENSE
[SWEL]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/LICENSE
[OD0]: https://docs.openhands.dev/llms.txt
[OD1]: https://docs.openhands.dev/sdk/arch/tool-system.md
[OD2]: https://docs.openhands.dev/sdk/guides/agent-stuck-detector.md
[OD3]: https://docs.openhands.dev/sdk/guides/agent-server/docker-sandbox.md
[OD4]: https://docs.openhands.dev/sdk/arch/condenser.md
[OD5]: https://docs.openhands.dev/openhands/usage/developers/evaluation-harness.md
[SD0]: https://swe-agent.com/latest/background/architecture/
[SD1]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/docs/background/aci.md
[SD2]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/docs/usage/batch_mode.md
[SD3]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/docs/usage/trajectories.md
[O1]: https://github.com/OpenHands/software-agent-sdk/blob/8ac973c9ac7e71b4589e480f5f62fea723530334/openhands-tools/openhands/tools/terminal/definition.py
[O2]: https://github.com/OpenHands/software-agent-sdk/blob/8ac973c9ac7e71b4589e480f5f62fea723530334/openhands-sdk/openhands/sdk/conversation/impl/local_conversation.py
[O3]: https://github.com/OpenHands/software-agent-sdk/blob/8ac973c9ac7e71b4589e480f5f62fea723530334/openhands-sdk/openhands/sdk/conversation/stuck_detector.py
[O4]: https://github.com/OpenHands/software-agent-sdk/blob/8ac973c9ac7e71b4589e480f5f62fea723530334/openhands-workspace/openhands/workspace/docker/workspace.py
[O5]: https://github.com/OpenHands/software-agent-sdk/blob/8ac973c9ac7e71b4589e480f5f62fea723530334/openhands-sdk/openhands/sdk/context/condenser/llm_summarizing_condenser.py
[O6]: https://github.com/OpenHands/software-agent-sdk/blob/8ac973c9ac7e71b4589e480f5f62fea723530334/openhands-sdk/openhands/sdk/context/view/properties/tool_call_matching.py
[O7]: https://github.com/OpenHands/software-agent-sdk/blob/8ac973c9ac7e71b4589e480f5f62fea723530334/openhands-sdk/openhands/sdk/context/view/properties/tool_loop_atomicity.py
[S1]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/tools/windowed_edit_linting/bin/edit
[S2]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/tools/windowed/lib/flake8_utils.py
[S3]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/config/default.yaml
[S4]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/sweagent/tools/tools.py
[S5]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/sweagent/agent/agents.py
[S6]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/sweagent/agent/models.py
[S7]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/sweagent/environment/swe_env.py
[S8]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/tools/review_on_submit_m/bin/submit
[S9]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/sweagent/run/hooks/swe_bench_evaluate.py
[S10]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/sweagent/agent/history_processors.py
[S11]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/sweagent/run/batch_instances.py
[S12]: https://github.com/SWE-agent/SWE-agent/blob/3ea751c087f32b16e039a2233dd6eefecef325d5/sweagent/run/run_replay.py
