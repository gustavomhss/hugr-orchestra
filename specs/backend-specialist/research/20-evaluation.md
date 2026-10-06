# R20 — the backend specialist evaluation + user-experience bar

Research date: 2026-10-03. Research only; benchmark execution and the backend specialist implementation audit not performed. Runtime premises below come from user brief and repository instructions. Source observations carry references; proposed protocol is recommendation, not measured backend specialist performance.

## Decision

**Optimize accepted backend tasks per total cost, with low user repair burden.** “Agent finished,” “tests green,” and “user liked explanation” each answer different questions. Best-in-class requires all three: correct outcome, dependable collaboration, efficient delivery. Quality cannot be traded away silently for fewer tokens. [S2, S9–S14]

Use existing OpenCode/Orchestra execution path, native Atlas shared memory, optional Maestro. Add thin experiment driver, task manifests, trusted graders, native trace export, paired report. Borrow benchmark evidence methods; current needs do not justify adopting entire platform. Reconsider Harbor only if measured environment/regrading maintenance costs exceed adapter costs while production-runtime fidelity survives. [S5, S8, S9]

“Good enough não serve” means explicit acceptance contracts, truthful verification, reliable recovery, measured improvements. It does not mean maximal architecture, compulsory planning ceremonies, or benchmark percentage chosen without user evidence.

## 1. Primary-source findings: strengths and limits

| Source/context | Useful evidence method | Limit; implication for the backend specialist |
|---|---|---|
| Original SWE-bench; Verified introduction [S1] | Real issue, pre-fix repository, hidden FAIL_TO_PASS and PASS_TO_PASS tests; containers; human screening of task/test alignment. | Original distribution concentrates on Python repositories. Test resolution does not establish deployability, maintenance quality, user understanding, or other language support. Hidden tests must implement disclosed behavior, not hidden naming preferences. |
| Current SWE-bench evaluation guide + grading source [S2] | Separate reports, raw test output, applied patch, evaluation script, harness log. “Completed” means report produced; “resolved” means required tests passed. | Guide warns result cache keys include run/instance IDs: changed patch with reused run ID can reuse old result. Bind evidence to artifact/environment/grader identity; never accept summary exit status alone. |
| OpenAI Verified audit, 2026-02-23 [S3] | Repeated trials, expert review of disputed tasks, targeted contamination elicitation. Found misaligned tests and recoverable task-specific reference material. | Audited failure-heavy subset, not random whole-benchmark sample. Its reported defect fraction cannot describe entire dataset. Provider-authored analysis supports caution, not competitor ranking or blanket proof every result is invalid. |
| SWE-bench Pro paper v2, 2025-11-14 [S4] | Longer multi-file work; explicit requirements/interfaces; human-verified environments; public, held-out, commercial splits; failure analysis. | Paper emphasizes Python/JS/TS/Go; Rust coverage insufficient for the backend specialist claim. Gold-patch-derived requirements reduce ambiguity but do not test conversational scoping. Test dependence remains. Copyleft is exposure-risk rationale, not technical proof training exclusion. Commercial results lack public independent replay. |
| SWE-bench Pro dataset V2, released 2026-09-22 [S5] | Pinned release describes 642 public tasks versus original 731; sanitized history, offline agent phase, pristine-sandbox patch regrading, reference/no-op controls, reachability probes. | Dataset V2 and paper “v2” are different versions. Agent phase still needs model-endpoint access; setup/verifier networking differs. Release control results are authors’ reports, not runs reproduced here. HARD-51 is model-failure-selected challenge slice, not representative workload. |
| Terminal-Bench 2.0 paper; current 4.0 release [S6] | Terminal work with task environment, human solution, executable verifier. 4.0 calibrates resources and repairs tasks; current run guide names 4.0.0. | Broad terminal capability differs from backend plugin UX. Removing saturated tasks changes distribution; historical percentages cannot be compared directly. 4.0’s long budgets and GPU-bearing tasks are not the backend specialist release budgets. |
| Terminal-Bench integrity + continuous benchmark guidance [S7] | Passing trajectories auditable; reward-hack review; oracle/no-op checks; versioned reuse, regrade, rerun. | Public solutions and open internet create answer-retrieval paths. Agent judge can miss hacks or accuse valid solutions; review/dispute path still needed. Fresh task version can invalidate old comparisons. |
| Harbor verifier/separate-verifier/ATIF docs [S8] | Separate instruction/environment/solution/verifier; explicit artifact handoff; structured reward; reusable trajectories with tool-call observations. | Default verifier shares agent container; separate mode is opt-in. Valid JSON or reward file proves format, not correctness. Trajectory export does not imply resume/import support. Native backend specialist resume must be tested separately. |
| Anthropic agent-eval guidance, 2026-01-09 [S9] | Distinguish task/trial/trajectory/outcome; deterministic graders first; human-calibrated model judgment; isolation; capability versus regression suites. | Practitioner guidance, not universal causal experiment. Rigid tool-order grading rejects valid strategies. Simulated users supplement real users; cannot establish novice usability. |
| MT-Bench judge study, 2023 [S10] | Studies position, verbosity, self-enhancement biases and human agreement. | Chat preference agreement does not validate code correctness judgments. The backend specialist needs local judge calibration against maintainer decisions. |
| AI Agents That Matter, 2024 [S11] | Joint accuracy/cost optimization; holdouts; reproducibility; distinguish model evaluation from downstream product choice. | Does not supply the backend specialist budgets or release thresholds. Low cost can hide low success; compare frontier of outcomes, cost, time, repair. |
| Copilot controlled study, 2023 [S12] | Controlled JS HTTP-server task; authors report faster completion with assistance. | Bounded greenfield task and historical tool; not evidence about mature repositories, current models, or lifetime repair cost. |
| METR early-2025 RCT + 2026-02-24 follow-up [S13] | Real maintainer tasks randomized AI-allowed/disallowed; measured time and perceived benefit can diverge. | Early study found slowdown in its specific setting, not universal AI harm. Follow-up explicitly calls current effect estimate unreliable because participant/task selection and concurrent-agent time accounting changed. Neither yields the backend specialist speedup estimate. |
| SPACE, 2021, authors’ Microsoft Research page [S14] | Productivity exceeds activity and cannot be represented by one metric. | Framework, not causal proof. Pair outcome/time logs with repair burden, comprehension, satisfaction; do not equate tool calls, commits, or LOC with productivity. |
| SkillsBench v4, 2026-06-14 [S15] | Matched with/without curated-skills trials, task-level deltas, cost/time diagnostics, leakage controls. Reports heterogeneous gains and harmful skill cases. | Selected expertise-heavy terminal tasks; construction rejects low-separation tasks. Gains are not ecosystem average. Authors acknowledge context-length confound, discovery/authoring interference, imperfect determinism, and weak transfer to GUI/multi-agent/very-long tasks. |
| SWE-agent ACI study + Anthropic tool guidance [S16] | Tool interface, search/edit affordances, concise relevant outputs, namespacing, actionable errors deserve experiments. | Historical/model-specific evidence; adding tools or copying tool budgets does not establish modern benefit. Optimize actual output quality, not predetermined call sequence. |
| Infrastructure-noise experiments, 2026-02-05 [S17] | Resource reservation versus kill ceiling, concurrency, and time limits belong in experiment specification. | More resource headroom can both remove infrastructure faults and enable stronger strategies. Published resource multiplier is setting-specific, not portable release threshold. |

### Concrete vacuity lessons from sources

Static inspection of pinned SWE-bench `grading.py`: `SUITE_RAN` checks execution evidence. In `PASS_AND_FAIL` mode, F2P skips fail, while `test_maintained` permits P2P skips; `test_passed` also accepts XFAIL. `FAIL_ONLY` mode treats absent cases as success; empty metric denominators return 1. These semantics have surrounding guards. They are **not** an end-to-end exploit demonstrated here. Lesson: upstream “resolved” is not identical to the backend specialist’s mandatory-check contract. Require actual execution/pass of named mandatory checks. [S2]

Harbor verifier doc’s displayed example enables `set -euo pipefail`, runs pytest, then checks `$?`. Shell control flow can exit on failing pytest before reward-writing branch. Treat missing reward as invalid verification, never success; use failure-path controls before borrowing snippets. This is source inspection, not executed reproduction. [S8]

## 2. Minimal reproducible paired protocol

### Comparison arms

- **B — native baseline:** pinned OpenCode/Orchestra, model, repository instructions, native tools and Atlas service/snapshot; the backend specialist disabled, Maestro off.
- **C — the backend specialist candidate:** same conditions plus frozen backend specialist version/defaults; Maestro off. Main question: incremental plugin value over runtime already available to user.
- **M — optional Maestro:** C with Maestro on, evaluated separately on tasks needing planning/handoff. Compare same total task budget; include planning and handoff costs. Core backend specialist acceptance cannot depend on Maestro installation.

Baseline must be credible native workflow, not deliberately weak prompt or stripped tools. If Atlas behavior is supplied by the backend specialist rather than baseline runtime, record that boundary explicitly: difference is part of treatment. Model upgrades get their own paired comparison; do not change model and plugin together then attribute gain to plugin. [S9, S11, S15]

### Starter task inventory

Recommendation: two distinct tasks per workload row below—bounded repair and multi-step change. **Fourteen task packs are coverage pilot, not statistically powered SOTA proof.** JS/TS are languages, Node runtime, Next framework; rows are workload strata, not independent language populations. Assign each task one headline stratum, retain secondary tags, avoid double-counting same task.

Candidate briefs below require selection from real user/backlog incidents; they are not claimed existing benchmark instances.

| Workload | Bounded repair | Multi-step change | Acceptance evidence beyond agent-written unit tests |
|---|---|---|---|
| Rust | Cancellation/error-path defect in async service | Add backward-compatible API behavior spanning service/storage | Actual repository build/tests; adverse request; state after cancellation; required feature/target configuration |
| Go | Request cancellation or transaction rollback defect | Idempotent job/API path across handler and persistence | Real HTTP + real local database; repeated request; rollback state; race check where task requires it |
| Python | Validation/auth or async error propagation bug | Schema migration plus endpoint change | Repository test runner; malformed/unauthorized inputs; populated database upgrade; restart/readback |
| TypeScript | Runtime schema/typed-contract mismatch | Public API plus generated client update | Typecheck through package script, runtime request, actual generator, generated-artifact consistency |
| JavaScript | ESM/CJS import or coercion regression | Maintain compatibility while changing library/API behavior | Supported Node versions from project contract; real imports/callers; bad input; regression checks |
| Node | Streaming/backpressure or shutdown bug | Worker retry/cancellation behavior | Real process, sockets, worker/database; bounded load, disconnect, restart, duplicate-delivery observation |
| Next | Route-handler/auth/cookie/cache defect | Server action/route plus persistent data change | Production build/start, real HTTP/browser flow where needed, server/client boundary, persistence after restart |

Seed different repositories where feasible; easy and hard tasks, familiar and unfamiliar code, both “use extra machinery” and “solve directly” cases. Overlay lifecycle cases in §3 on existing task packs instead of constructing whole language × feature × persona Cartesian product. Existing user incidents become regression cases; fresh unpublished tasks test capability. [S1, S4, S9]

### Execution sequence

1. **Freeze task contract before candidate run.** Manifest records task/version, repository/base SHA, initial dirty-tree artifact if intentional, prompt/answer script, acceptance clauses, mandatory test identities, reference solution, allowed resources/network, stop rules, initial session/Atlas state, model ID/settings, runtime/plugin/tool/skill versions, grader version. Every mandatory assertion traces to disclosed requirement. Keep solution/verifier outside agent access.
2. **Calibrate fixture and environment.** Known-good solution passes; pre-fix/no-op fails for change tasks; representative wrong solution fails. Verify real tool boundary and mandatory test collection in actual environment. Diagnostic “no change needed” tasks instead require correct diagnosis and unchanged state; empty patch is not universally failure.
3. **Prepare isolated native runs.** Same repo/state snapshot per arm; real production CLI/API/tool path and native Location/session placement. Fresh per-trial store, HOME, caches and scratch workspace as specified. Containers may supply services or pristine graders, not replace SessionRunner with new toy agent loop. Preserve repo configuration, dependency graph, shell/OS semantics and resource enforcement.
4. **Pair and counterbalance.** Randomize B/C order within task/run blocks; interleave time windows. Proposed initial decision batch: three independent trials per arm per task. This repeats stochastic behavior; it is not three attempts from which evaluator selects best patch. Log seeds when supported; same seed does not promise deterministic hosted-model output. Fix repetitions before reading results.
5. **Stop consistently.** Shared per-task wall/cost/token ceilings derived from reference workload and intended user session; declared before trials. At cap retain partial patch, state, trace and spend. No hidden extra budget for planner, memory, retries, or candidate-only repair.
6. **Grade actual outcome.** Capture complete deliverable including new/untracked files and migrations. Replay patch/artifacts on pristine task environment with trusted verifier. Separately inspect native runtime state/events for lifecycle tasks; patch replay alone cannot prove session correctness. Grade final artifact, not pre-edit green result.
7. **Review and analyze.** Blinded maintainer acceptance on test-passing deliverables, disputed cases, and sampled failures; report task-paired outcome/cost/time/repair differences. Retain raw denominators and all attempts. Publish per-task wins/losses/ties and per-stack coverage, not pooled test-assertion percentage.
8. **Confirm selected changes on sealed tasks.** Tasks used to tune skills/prompts move to development/regression pool. Fresh same-stratum tasks, preferably different repositories/task families, confirm selected candidate. Predeclare further sampling from pilot variability; do not repeat only losses until green. Uncertain result remains uncertain.

Task is unit of inference; repeats within task are not new independent tasks. Paired uncertainty resamples task pairs, and repository clusters when multiple tasks share repository. Tiny per-stack samples support diagnosis, not precise rankings. Report observed repeat consistency; do not calculate all-run reliability from independence assumption that traces do not support. [S9, S11, S15]

Infrastructure rule: retain original result; label failure from evidence, not convenience. Shared sandbox outage may justify rerunning both paired arms under predeclared policy. Candidate-caused resource exhaustion, broken environment edit, and ordinary budget exhaustion remain candidate failures. Report all-scheduled accepted yield plus valid-environment diagnostic view and invalid-run reasons. Neither missing grade nor excluded run becomes pass. [S2, S17]

## 3. Native continuity, shared memory, dynamic identity

These are proposed acceptance fixtures grounded in supplied runtime contract, not claims current implementation passes.

| Scenario | Stimulus | Required observation |
|---|---|---|
| Durable admission | Admit prompt, interrupt before execution; repeat exact message ID; send conflicting retry | Admitted input survives; exact retry reconciles without duplicate visible prompt; conflict rejected. `resume: false` remains admit-only. |
| Task resume | Interrupt after edit and before verification; restart process; explicitly resume same Session | Reconcile files and recorded state; continue unmet acceptance work; preserve user edits; report stale/unrun checks. No need for user to reconstruct task. No automatic post-crash provider retry inferred from advisory wake. |
| Ownership/delivery | Concurrent same-Session resumes, second independent Session, steer then queue | Same-Session execution joins/serializes; other Session can proceed; default steer and explicit queue promote at specified safe boundaries. No fabricated durable “drain identity.” |
| Interrupted side effect | Drop response after idempotent fixture operation commits | Inspect real fixture state before retry; avoid duplicate effect using fixture’s idempotency contract. Unknown completion remains explicit. Test does not claim arbitrary external operations are exactly-once. |
| Rename with recall | Store legitimate project decision in precursor session; rename the backend specialist/Atlas display labels; restart and ask follow-up | Same stable actor/project/session and memory provenance; current display labels resolve correctly; useful decision retrieved without answer-key injection or duplicate store. Labels never become identity keys. |
| Name collision and stale memory | Two projects share display label; code/user correction supersedes remembered decision | Retrieval stays within intended native scope; current evidence/correction wins over stale recall. Assert with distinguishable records and known-hit control. |
| Memory-entry rename | If native Atlas exposes title rename, rename entry separately from actor label | Follow native record identity/provenance contract; lookup/edit remains coherent. Unsupported operation is reported as unsupported, not counted as tested functionality. |
| Optional Maestro | Same task direct; then explicit Maestro handoff, including renamed display label | Direct backend specialist works; handoff carries goal, unresolved decisions and evidence references without resetting identity or duplicating work. Atlas remains shared source of memory. |

Memory warm/cold conditions must be separate. Seed warm state from legitimate earlier task, freeze snapshot before paired runs, charge acquisition/indexing cost explicitly. Independent trials cannot read one another’s outcomes, failed attempts, judge feedback, or hidden solutions. Use native Atlas APIs/storage; second markdown memory system would change product under evaluation. [S5, S9, S15]

## 4. Lean gates with teeth

### Gate A — evidence valid

Trusted manifest, input/environment/artifact/grader identities match. Required test inventory nonempty and actually executed; missing collection, malformed report, absent reward, timeout, all-skipped suite, or parser failure yields named invalid/failing result. Mandatory checks cannot succeed through skip/xfail. Existing unrelated platform exclusions stay explicit with reason and claimed coverage reduced accordingly. [S2, S8]

At task/grader creation or relevant change, run good reference, unchanged buggy tree, realistic wrong patch, missing report, zero-test selection, forced skip and verifier error. Confirm correct rejection *reason*, not merely nonzero exit. Include alternate valid implementation to detect over-specific oracle. Mutation-probe protected behavior in real task environment; synthetic self-test alone misses repo flags, filesystem semantics and service setup. [S1–S3, S5, S7]

### Gate B — requested backend outcome real

Required failure-to-pass behavior, relevant regressions, package build/typecheck and applicable integration contract pass against delivered artifact. Agent-added tests supplement independent acceptance tests. API tasks inspect response and persisted state; streaming tasks exercise disconnect/cancellation; Next tasks use production path. Mocks can isolate logic, but cannot establish real database/HTTP/native-Atlas integration. [S1, S4, S9]

Reconstruct trusted verifier, fixtures and toolchain outside agent-controlled state; candidate-edited runner, snapshots, PATH wrappers or cached status cannot serve as authoritative evidence. Pristine replay reduces tampering opportunities; bad-patch controls establish measured reach. Do not silently strip substantive deliverable changes: retain full patch for review, verify trusted checks externally, and explain exclusions. Scope maintenance review assesses unnecessary dependency, abstraction, migration or unrelated rewrite; smallest diff is not itself correctness metric. [S5, S8, S9]

### Gate C — user trust and continuity hold

Named critical fixtures preserve user work, durable identity, scope, interruption/resume and optionality. “Tested,” “saved,” “resumed,” and “done” claims link to actual state/evidence. Missing environment or denied tool produces clear blocker plus useful partial result, not invented success. Confirmed data loss, cross-project memory recall, duplicate operation, false verification, or repeated context loss blocks release regardless of aggregate score.

### Gate D — addition earns its cost

Keep addition when paired evidence improves acceptance, or lowers total cost/time/repair with preserved acceptance and critical invariants. Report tradeoffs when higher quality costs more. Equivalent noisy point estimates do not prove non-inferiority; tolerances and budgets must come from user expectations, maintainer decisions and baseline distribution before confirmation. No invented percentage gate. [S11, S13–S15]

Cheap deterministic/lifecycle regressions run on relevant changes. Paid paired tasks target changed behavior; full coverage batch on release candidate, model/runtime change, or cross-cutting memory/tool change. Reuse unchanged evidence; regrade saved artifacts after verifier-only fix; rerun both arms after agent-visible task/environment change. Preserve original grades and version comparison. [S7]

## 5. Measurements: outcome first, cost honest

Keep separate fields rather than ambiguous `success: true`:

- **Run state:** submitted/ended/capped/interrupted/error, with reason.
- **Verification:** pass/fail/not-run/invalid; individual mandatory check identities and actual statuses.
- **Acceptance:** accepted-first-delivery / accepted-after-repair / rejected / abandoned / pending-review.
- **Critical invariants:** explicit pass/fail/not-observed. Partial credit diagnostic only; cannot offset mandatory failure.

First-delivery acceptance allows ordinary task clarification and internal iteration under declared protocol. It excludes corrective user prompts/manual code repair after delivery. Scripted resume episodes inside lifecycle task remain same task; evaluator must not relabel rescue as fresh autonomous success. [S2, S9, S13]

Report single-attempt resolution/acceptance separately from `pass@k`. Best-of-k only describes product if actual retry/selection policy can identify usable result without hidden oracle; charge every attempt. Observed all-trial consistency answers reliability question, not “at least one worked.” [S9]

For each arm within fixed paired cohort, use:

```text
A0 = deliverable accepted without post-delivery corrective work
A1 = deliverable eventually accepted under declared repair protocol
Cserve = model + external-tool + runtime charges, each counted once
         including planning, memory/indexing, compaction and retry work

first-delivery yield = mean_over_tasks(mean_over_trials(A0))
serving cost per first-delivery acceptance = sum(Cserve for all trials) / sum(A0)
human effort per eventual acceptance = sum(active human effort for all trials) / sum(A1)
```

Zero accepted denominator means undefined/no accepted outcome, never free or zero cost. Ratios require same task mix and trial weighting. Include failed/abandoned spend; also show raw acceptance and cost distributions so cheap failures cannot look optimal. Evaluation/grader expense gets separate line from serving cost. Normal user/maintainer review belongs in human effort; research-only judging is evaluation overhead. Human monetization, if useful, shows declared rate/sensitivity; minutes remain visible. [S11, S14]

| Measure | Record | Avoid |
|---|---|---|
| Tokens/cost | Provider-reported uncached input, cache read/write, output, reasoning when exposed; exact price date; tool/memory/model subtotals; native usage and estimated versus billed labels | Double-counting reasoning already inside output; treating missing usage as zero; claiming subscription/list-price estimate equals invoice |
| Time | Admission→first useful feedback, delivery, accepted outcome; provider/tool/build wait; actual tool durations; setup/indexing, recovery and planned pause intervals | Confusing first token with useful progress; excluding repair; reporting only successful-run latency; summing parallel tool duration as wall time |
| Tool efficiency | Calls by purpose, invalid parameters, redundant unchanged-content reads, retries, output volume/truncation, repeated failures | “Fewest calls wins”; punishing necessary tests or valid alternative strategies |
| Context efficiency | Skill/tool-schema load, retrieved memory/source IDs and freshness, cache hits, compactions, post-resume rereads | Claiming retrieval hit or skill invocation caused success without ablation |
| Human effort | Active setup/specification, clarification, review, debugging, reprompting, manual edit, rollback/recovery; correction turns and time | Counting waiting while user works elsewhere as active effort; excluding abandoned tasks; relying only on self-reported speedup |
| Quality/usability | Maintainer acceptance, user can run result, explain remaining limits and resume/undo; follow-up defect/rework record | LOC/commit volume as output value; satisfaction alone as correctness; no observed follow-up interpreted as no defects |

Report cold setup and warm steady-state separately, plus amortization assumption. Cache policy identical across paired arms except explicit cache/memory ablation. Publish enough resource detail to separate smaller bill from bigger machine or warmer environment. [S13, S17]

## 6. Concrete ablations: earn every skill, memory, plan, tool

Screen on development tasks, changing one feature at a time. Then remove each retained feature from candidate to check contribution in assembled product. Confirm selected bundle on sealed tasks. Exhaustive factorial search unnecessary; targeted interaction tests when traces show skill×memory or plan×tool coupling. Every arm charges all work, including preparation. [S11, S15, S16]

| Ablation | Matched conditions | Decision signal / failure exposed |
|---|---|---|
| Skill value | Native base; concise backend specialist skill; same relevant factual content as plain reference | Accepted-task lift versus extra context/knowledge rather than package label. Hold docs accessible in every arm. |
| Skill loading | Eager full bundle versus native discovery/lazy loading of identical content | Load tokens, irrelevant activation, missed necessary skill, accepted yield; include easy task where skill should stay unused. |
| Skill breadth | Focused procedure versus expanded bundle; where mechanism matters, length-matched neutral/reference control | Heavy recipe displaces better native strategy, conflicts, or spends budget before implementation. Do not assume published optimal bundle size generalizes. |
| Atlas memory | Native history only; memory read enabled; read+write with same legitimate precursor; cold and warm cohorts | Acceptance/repair benefit after reset; source freshness, redundant reads, acquisition cost. Stale/conflicting/irrelevant memory variant tests harm. |
| Planning | Direct backend specialist; short acceptance-oriented plan; optional Maestro plan/handoff | Complex cross-file task versus small fix. Count plan tokens, clarification loops, time before useful change, replan and handoff loss. |
| Added tools | Native toolset versus one added search/index/semantic/batch tool; optionally lazy tool-schema exposure | Better localization and accepted result per total cost, including index setup; ambiguous tool choice, invalid args, stale index, output bloat. |
| Output/context optimization | Full outputs versus bounded relevant excerpts with explicit truncation and drill-down; compaction off/on where supported | Tokens saved without losing failure evidence, resume facts or necessary code. Keep retrievable originals. |
| Combined minimal bundle | Best evidenced bundle versus baseline; leave-one-out checks | Interaction benefit and redundancy. Feature with no demonstrated net contribution stays optional or is removed; uncertainty warrants more evidence, not marketing. |

SOTA target: push accepted-outcome/cost frontier under real user constraints. No current competitor ordering established by this research. “Best-in-class” claim later needs contemporaneous matched product comparisons plus real-user evidence; when competing products use different models, label whole-system comparison, not plugin-only causal effect.

## 7. Novice and advanced UX bar

Use same correctness requirements, different interaction needs. Observe real participants; simulated user answers useful for repeatability, insufficient for comprehension/repair claims. Counterbalance task variants and tool order; avoid making same person solve same task twice after learning solution. Record repo and AI-tool familiarity, withdrawals, task selection and incomplete work. Blinded maintainer reviews artifact quality. [S9, S12–S14]

| Persona/scenario | User-care bar | Observe |
|---|---|---|
| Novice vibecoder: “quero uma API para salvar meus pedidos” | Explain useful scope in plain language; ask material question, make reversible assumptions explicit; working request plus durable data, practical run instructions | Can user launch, submit/read data, understand auth/deployment limits without facilitator rescue? Distinguish working local result from production claim. |
| Novice: failing setup/test | Diagnose actual error, show useful progress/blocker and next action; avoid jargon dump or circular questions | Assistance required, repeated explanation, dead-end commands, false “done,” ability to recognize incomplete verification |
| Novice: pause, rename assistant/memory, return later | Recognizable current names, remembered decisions with provenance, task resumes without re-prompting whole brief | Context reconstruction time, identity confusion, missing work, comprehension of remaining steps |
| Advanced engineer: scoped Rust/Go/Python repair in dirty tree | Minimal justified change, native conventions, relevant executable proof, existing work preserved | Review time, unwanted edits/dependencies, regression, correction prompts; valid alternative fix accepted |
| Advanced: TS/JS/Node/Next cross-boundary change | Preserve API/runtime contract; regenerate where required; real integration and production-path checks | Maintainer can verify diff and commands; migrations/build/streaming errors exposed; remaining uncertainty exact |
| Advanced: explicit budget/scope, optional Maestro, interrupted task | Scope honored, planner optional, work restartable, evidence concise and inspectable | Cost-to-acceptance, handoff loss, duplicate effort, cancellation responsiveness, repair minutes |

Cross-persona handoff: **what changed; what ran against which artifact; what remains unverified; how to use/resume/undo.** Helpful brevity means actionable information, not suppressed failure detail. Progress updates mark meaningful state changes; persistent activity animation and long planning text are not progress evidence.

Judge policy: deterministic behavior checks first. Human rubric asks correctness, scope fit, maintainability, verification honesty, comprehension. Optional LLM judge sees task, diff, trusted execution evidence and rubric; returns cited evidence plus pass/fail/unknown. Hide product/model labels, swap pair order, test concise versus verbose equivalent reports. Calibrate on known-good, plausible-wrong, alternative-valid, false-green and repair-heavy examples; record false acceptance/rejection and disagreements. Human adjudicates critical/disputed outcomes; model consensus alone is not independent proof. [S9, S10]

## 8. Contamination, fidelity and limits

- **Exposure control:** record task creation/publication dates, known public issue/solution exposure, model snapshot and unknown training cutoff. Keep solutions/graders out of agent filesystem, git history/refs/stashes, Atlas snapshots, skills and prior trials. Fresh authored holdouts lower risk; cannot prove unknown model training clean. Renaming benchmark identifiers or paraphrasing prompt does not decontaminate solution. [S3–S5, S15]
- **Network fidelity:** choose declared regime. Reproducible offline work uses pinned docs/dependencies and model endpoint only; connected-product lane permits normal tools while auditing retrieved sources for solution leakage. Do not combine regimes into one headline. Pro V2’s offline regime is evidence method, not proposed permanent backend specialist product restriction. [S5, S7]
- **Environment fidelity:** actual repository scripts, configs, services, language targets, OS/architecture, permissions, clock/timezone, resource reservation/ceiling and cache policy matter. Local macOS success cannot stand in for Linux deployment or omitted CI lane. Missing service is explicit invalid/blocker, not passing mock. [S1, S9, S17]
- **Hidden behavior:** outcome tests finite; integration success does not establish universal correctness. Human review also fallible; judging and task construction need their own controls. Reviewed benchmark results do not validate the backend specialist’s native Atlas rename/session semantics or novice repair effort; those require proposed local fixtures/user studies.
- **Scope of result:** pilot exposes large regressions and feature value on sampled work. Broader stack claims need more independent tasks/repositories, repeat evidence, fresh holdouts and user follow-up. No fabricated release percentage, token ceiling, user-repair target, or competitor ranking supplied.

Minimum evidence bundle for future runs: frozen manifest/task contracts; native traces and provider usage; complete artifact/diff; environment identity; raw mandatory-test output/statuses; runtime/memory-state observations; reviewer decision and repair log; paired report with exclusions/uncertainty. Plain files suffice. Add infrastructure only when maintaining this bundle becomes measured bottleneck.

## Sources and exact contexts

All accessed 2026-10-03. Numbers above attributed to source authors; this research does not independently reproduce benchmark results. Versioned paper links distinguish historical experiments from current mutable documentation.

- **[S1] SWE-bench foundations.** [Jimenez et al., paper v3](https://arxiv.org/abs/2310.06770v3), abstract: issue/PR-derived Python repository tasks. [OpenAI, Introducing SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/), 2024-08-13, updated 2025-02-24: “Background,” “Annotation Criteria,” “Discussion & Limitations”; F2P/P2P, human review, ambiguous tests and contamination.
- **[S2] SWE-bench harness.** [Evaluation guide](https://www.swebench.com/SWE-bench/guides/evaluation/): “Result Caching,” “Understanding Evaluation Results.” [Pinned grading implementation](https://github.com/SWE-bench/SWE-bench/blob/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e/swebench/harness/grading.py): `SUITE_RAN`, `test_passed`, `test_maintained`, `get_logs_eval`, metric denominators. Static source inspected, not executed.
- **[S3] Verified audit.** [OpenAI, Why SWE-bench Verified no longer measures frontier coding capabilities](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/), 2026-02-23: audit selected 138 inconsistently solved tasks; “Too narrow and too wide tests,” “Contamination,” “Discussion.” Also reports some Pro contamination; lower exposure is not zero exposure.
- **[S4] Pro research.** [Deng et al., SWE-Bench Pro, paper v2](https://arxiv.org/html/2509.16941v2), 2025-11-14: §§3–4 task construction/environments; §5 scaffold/settings; §6 augmentation/failure analysis; §7 limits. Public/commercial and budgeted analyses use different settings; do not merge numbers.
- **[S5] Pro current release.** [Dataset V2 README, pinned 66f9276](https://github.com/scaleapi/SWE-bench_Pro-os/blob/66f92766bba642462d4bbe5479e83f91f9211862/v2/README.md), release commit 2026-09-22: “The locked protocol,” “Release gate for this tree,” “What changed from v1.” Release report, not independently validated control results.
- **[S6] Terminal-Bench versions.** [Merrill et al., paper v1](https://arxiv.org/abs/2601.11868v1), 2026-01-17, abstract concerns 2.0. [Terminal-Bench 4.0](https://www.tbench.ai/news/terminal-bench-4-0), 2026-08-28 per official news index: resource calibration, task repairs/removal, breaking version changes. [Current run guide](https://www.tbench.ai/run) specifies 4.0.0 and GPU-capable sandbox for full set.
- **[S7] Benchmark maintenance/integrity.** [Leaderboard Integrity Update](https://www.tbench.ai/news/leaderboard-integrity-update), 2026-04-19: trace requirement, reward hacking and judge/challenge process. [Continuous Benchmarks](https://www.tbench.ai/news/continuous-benchmarks), 2026-07-30: oracle/no-op/cheating controls; reuse versus regrade versus rerun. Dates from official news index.
- **[S8] Harbor primary docs.** [Verifier](https://docs.harborframework.com/core-concepts/tasks/verifier.md), reward contract and shell example; [Separate verifier](https://docs.harborframework.com/core-concepts/tasks/separate-verifier.md), default shared mode and artifact transfer; [Create a task](https://docs.harborframework.com/tutorials/create-a-task.md), oracle workflow; [ATIF](https://docs.harborframework.com/core-concepts/agents/atif.md), trajectory fields and export/import distinction. Living docs, access-date snapshot.
- **[S9] Agent-eval guidance.** [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), 2026-01-09: definitions, grader tradeoffs, nondeterminism, task/reference quality, isolated environments, human calibration and complementary user research.
- **[S10] Judge reliability.** [Zheng et al., Judging LLM-as-a-Judge, v4](https://arxiv.org/abs/2306.05685v4), 2023-12-24: abstract’s bias categories and preference-agreement context. Findings about chat evaluation, not backend-specialist-specific code grading.
- **[S11] Cost/reproducibility.** [Kapoor et al., AI Agents That Matter, v1](https://arxiv.org/abs/2407.01502v1), 2024-07-01: abstract’s joint cost/accuracy, holdout, downstream-developer and reproducibility critique.
- **[S12] Bounded productivity experiment.** [Peng et al., The Impact of AI on Developer Productivity, v1](https://arxiv.org/abs/2302.06590v1), 2023-02-13: controlled JavaScript HTTP-server task, abstract. Historical task-specific speedup, not generalized forecast.
- **[S13] Real-work productivity + update.** [METR early-2025 study](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/), 2025-07-10: methodology, scope limits, measured versus perceived productivity. [Changing experiment design](https://metr.org/blog/2026-02-24-uplift-update/), 2026-02-24: selection, changed task mix and concurrent-agent time accounting weaken current estimates.
- **[S14] Productivity dimensions.** [Forsgren et al., SPACE, authors’ research page](https://www.microsoft.com/en-us/research/publication/the-space-of-developer-productivity-theres-more-to-it-than-you-think/), ACM Queue, February 2021: productivity not single activity metric. Publisher full-text page returned access error; claim uses accessible authors’ abstract.
- **[S15] Augmentation experiment.** [Li et al., SkillsBench v4](https://arxiv.org/html/2602.12670v4), 2026-06-14: §§3–4 construction/paired protocol; §5 heterogeneous outcomes/heavy-skill failures; §6.1 context and transfer limits; Appendix L cost/time. Use this version, not earlier inventory/results.
- **[S16] Tool evidence.** [Yang et al., SWE-agent ACI, v3](https://arxiv.org/abs/2405.15793v3), 2024-11-11: abstract, interface contribution. [Anthropic, Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents), 2025-09-11: tool choice, namespaces, meaningful outputs, token efficiency and evaluation. Extract tool-design methods; retain the backend specialist’s native execution loop.
- **[S17] Environment confounding.** [Anthropic, Quantifying infrastructure noise in agentic coding evals](https://www.anthropic.com/engineering/infrastructure-noise), 2026-02-05: controlled resource configurations, reservation/limit distinction, strategy-changing headroom and reporting recommendations. Numeric effects/multipliers specific to those experiments.
