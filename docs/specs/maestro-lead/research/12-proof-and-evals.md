# 12: Proof plan and evals for Maestro as the best orchestrator

## Scope and date

- Date: 2026-10-28. Design research only. Nothing was run: no tests, typecheck, builds, benchmarks or commits.
- Reads 05 and 06 first. Does not repeat their product or framework findings. Reuses the MAST and OrchestraBench numbers from 06 and cites them again only where needed.
- Evidence classes: **[P]** paper, **[VD]** vendor doc, **[UR]** user report, **[BO]** blog or third-party write-up. **[UNV]** means not confirmed from a fetched primary source.
- Fetched in this pass: arXiv abstract pages (OrchestraBench, EntCollabBench, MultiAgentBench, TheAgentCompany, SWE-Lancer, AI Agents That Matter, Toby Ord half-life, tau2-bench, Commit0, METR 2503.14499), the Anthropic multi-agent post, and OpenAI's SWE-bench Verified note (via search snippet plus the OpenAI URL).
- Not fetched in full: most PDFs, all leaderboards live, and every competitor's own numbers. Those are marked.

## Short answer

1. No public benchmark isolates a lead agent's quality cleanly. Most benchmarks score the whole agent system. Only a few have a controlled orchestration axis (OrchestraBench, EntCollabBench, MultiAgentBench).
2. The best-fitting public evidence is OrchestraBench [P]. It uses failure injection and reports recovery per failure type. It is small (26 gold cases plus mechanism probes). Its code link is not on the abstract page.
3. Maestro's proof should be a paired A/B run on the same tasks, same model, same budget, with injected faults. Owner-time and false-success are the margins. Pass rate alone will not separate the systems.
4. Running any of this needs the owner's permission first. The owner asked for no benchmark without permission (memory: "no-bench-without-permission", 2026-10-19).
5. Competitor numbers are weak. Most vendors publish pass rates on Terminal-Bench, SWE-bench Pro, or internal evals. None publish orchestration-specific numbers that I could find [UNV].

## 1. Candidate benchmarks

Fit question: does the benchmark isolate the orchestrator (the lead's choices), or does it only score the whole stack?

| Benchmark | What it measures | Isolates orchestration? | Cost to run (estimate) | License | Published competitor numbers | Contamination and risk | Evidence |
|---|---|---|---|---|---|---|---|
| OrchestraBench (arXiv 2608.05263, Aug 2026) | Failure injection on templated enterprise workflows. Metrics: cascade radius, recovery per MAST failure mode, router accuracy on adversarial cases | **Yes.** Built for this | Low to medium. 26 gold cases plus probes. Real Claude agent across Sonnet, Opus, Haiku | arXiv non-exclusive; no code license stated | No competitor numbers. Own results: tool faults 1.0 recovery; ambiguous delegation 0.30; latent modes 0.0; keyword router 0% vs intent router 100% on 26 adversarial cases; cascade radius 0.9 to 4.7 at depth 3 to 7 [P] | Small sample, new (Aug 2026), code not located on abstract page. Authors say "controlled-chain mechanism probes, not domain-workload claims" | [P] fetched abstract |
| EntCollabBench (arXiv 2605.08761, May 2026) | 11 role-specialized agents in a permission-isolated enterprise org. Workflow and Approval subsets. Scores by DB state and policy adjudication | **Partly.** Tests delegation and context transfer across roles | Medium to high (enterprise DB sim) | Not stated on abstract [UNV] | None in abstract. Says models "still struggle" with delegation, context transfer, parameter grounding, workflow closure, decision commitment | Task count and models not in abstract [UNV] | [P] fetched abstract |
| MultiAgentBench / MARBLE (arXiv 2503.01935, ACL 2025) | Multi-agent collaboration and competition. Milestone KPIs. Topologies: star, chain, tree, graph; group discussion; cognitive planning | **Partly.** Compares coordination protocols, not a lead's choices | Medium | CC BY 4.0 (per arXiv page); code at github.com/MultiagentBench/MARBLE | Abstract: gpt-4o-mini highest average score (no number on abstract); graph topology best in research scenario; cognitive planning +3% milestone rate [P] | Old models (2025). Only the research scenario is confirmed from the abstract [UNV] for others | [P] fetched abstract |
| TheAgentCompany (arXiv 2412.14161) | Tasks in a simulated small software company (web, data, code) | No. Whole-agent | Medium | CC BY 4.0 | Best model 30% autonomous completion at paper time [P]. Old number | Dated; 2024 models | [P] |
| SWE-Lancer (arXiv 2502.12115) | 1,400+ freelance tasks, $1M real payouts. Includes manager tasks choosing among proposals | **Partly.** The manager-choice subset tests decision quality | Medium to high | Not stated [UNV] | "Frontier models unable to solve the majority" (abstract). No number on abstract | Manager subset is the useful part for Maestro; check its exact size in full paper | [P] |
| Terminal-Bench 2.0 (ICLR 2026) | 89 hard terminal tasks with tests | No. Whole-agent, but harness changes scores a lot | Medium. Runs in containers | Harness at tbench.ai [UNV] on license | Third-party snapshot, Apr 2026: Codex with GPT-5.5 82.0%, ForgeCode GPT-5.4 81.8%, TongAgents Gemini 3.1 Pro 80.2%. Open-weight best OpenHands + Opus 4.5 51.9% [BO] | Same model scores differently by harness. Leaderboard snapshots disagree; check live tbench.ai | [P] paper; [BO] numbers |
| SWE-bench Pro (Scale AI) | Long enterprise-style software tasks. Public split 731 tasks, private commercial set 276 | No | Medium. Docker runs | Check [UNV] | Conflicting: one source GPT-5.4 xHigh 59.1% (June 2026); another Claude Mythos Preview 77.8%, Opus 4.7 64.3% (May 2026). Unclear if lab or Scale-run [UNV]. Use Scale's live board | Contamination resistance better than Verified. OpenAI now recommends Pro over Verified | [BO] snapshots; [VD] OpenAI post |
| SWE-bench Verified | Known GitHub issues | No | Medium | MIT [UNV] | OpenAI stopped reporting it (Feb 2026 post). Says about 59.4% of tasks it audited were broken [VD via search snippet, UNV on exact] | Contaminated. Epoch rates Flawed | [VD] |
| GAIA | Multi-step Q&A with tools | Partly. Magentic-One used it | Low | Check [UNV] | Magentic-One 32 to 38 (from 06, [P]) | Old and widely trained on | [P] from 06 |
| tau2-bench (arXiv 2506.07982) | Dual-control conversational tool use (telecom domain on abstract) | No | Low to medium | CC BY 4.0 | Abstract only: "significant performance drops" with user-as-agent. No numbers on abstract [UNV] | Single domain on abstract | [P] |
| Commit0 (arXiv 2412.01769) | Write a library from a spec and unit tests | No | High | Check [UNV] | "None can yet fully reproduce full libraries" (abstract) | Long-horizon; good for a Maestro "build a project" probe | [P] |
| METR time horizon (arXiv 2503.14499) | 50% task completion horizon, in human-time | No. Measures single agent length | Medium to high | Check [UNV] | Earlier: Claude 3.7 Sonnet about 50 min (abstract). Later secondary claims (Opus 4.6 about 14.5 h) are [UNV] | Reliability at 80% is much shorter (secondary) [UNV] | [P] abstract; numbers [UNV] |
| MAST annotated traces (arXiv 2503.13657, dataset) | 1,600+ annotated multi-agent traces, 14 failure modes | Yes for diagnosis; not a score | Low to read; analysis cost only | Check repo [UNV] | Base FM rates in 06 (for example FM-1.3 step repetition 15.7%) | Traces from 7 frameworks, not current | [P] from 06 |

Notes:
- The only public test with a dedicated orchestration axis is OrchestraBench. Its code is not confirmed. Maestro would likely need to build its own harness on the same MAST failure modes.
- EntCollabBench and SWE-Lancer's manager subset are the best external tests of delegation quality. Both need full-paper reads before use.
- METR's and Ord's half-life work measures one agent's task length. It does not measure an orchestrator. It is useful for a "long horizon" headline, not for a lead comparison.

## 2. Metrics to judge a lead on

These go beyond pass rate. Each needs a definition written before any run, so it cannot be redefined later.

| Metric | Definition for Maestro | Source of the idea | Evidence |
|---|---|---|---|
| Task success (verified) | Pass only if an external oracle passes (tests, DB state, diff check). Not the agent's own claim | Anthropic used LLM judge plus human check [VD]; Terminal-Bench, SWE-bench use test oracles [P] | [VD], [P] |
| False-success rate | Share of tasks the lead reports "done" that the oracle marks failed. Primary safety metric | Derived from MAST FM-3.1 and FM-3.3 (premature termination, no verification) 6.2% and 9.1% [P, from 06]. Not measured as a headline by any vendor I found [UNV] | [P] |
| Cascade radius | Number of downstream steps that go bad after one injected fault | OrchestraBench [P] | [P] |
| Recovery rate per fault class | Share of injected faults fixed without a human, split by tool fault, ambiguous delegation, latent (context pollution, conflicting outputs, premature action) | OrchestraBench [P] | [P] |
| Human interventions per task | Number of times the owner must answer a question or unblock a stall | Owner-defined. Similar to "escalation rate" in agent ops. Not found in a public benchmark [UNV] | Owner-defined |
| Owner reading time | Minutes of owner reading to decide. Count words of the reports the owner must read, plus decisions asked | Owner-defined. Proxy: words per decision request | Owner-defined |
| Cost per successful task | Tokens (input, output, cached) and dollars per oracle-passed task. Report with pass rate, never alone | Kapoor et al. say all agent evals must control for cost [P] | [P] |
| Wall-clock to verified done | Time from owner request to oracle pass, including waits | Anthropic notes synchronous bottlenecks [VD] | [VD] |
| Stall detection time | Minutes between a worker going silent and the lead noticing | OrchestraBench blind retry slowed detection [P]; Claude Code user reports of stalled results [UR] | [P], [UR] |
| Result propagation rate | Share of worker results the lead actually reads and uses, versus lost or ignored | Claude Code issue reports (05, [UR]) | [UR] |
| Delegation quality | Share of delegated briefs that a fresh-context worker can complete without asking questions | EntCollabBench error classes (delegation not started, insufficient info, wrong dependency order) [P abstract] | [P] |
| Context drift | Whether the lead's final claim matches the state in the repo or DB | OrchestraBench trusted-state signal [P] | [P] |
| Decision quality | On SWE-Lancer-style choice tasks, does the lead pick the proposal the oracle values more | SWE-Lancer manager tasks [P] | [P] |
| Variance across runs | Pass^k: pass in all k tries, not just once | tau2-bench pass^k metric [P abstract, definition UNV]; Kapoor et al. on stochastic models [P] | [P] |

Caveats:
- Owner reading time and human interventions are not in any public benchmark. Maestro can define them and measure them itself. They will be the most convincing numbers to the owner, but only if the definition is fixed before the run.
- Avoid a single composite score. Report each metric and its confidence interval.

## 3. Proof plan

Goal: show Maestro beats the baselines on the metrics that matter for the owner. Win on false-success, recovery, cost per verified task, and owner time. Do not claim better raw pass rate unless measured.

### 3.1 Evals (pick three)

**Eval A. Injected-fault orchestration suite (primary).**
- Base: OrchestraBench's approach (failure injection on templated workflows, seed-reproducible) [P].
- Build: 30 to 50 Maestro-scale tasks (multi-step software work in a repo: spec, implement, test, report). Each task has a seeded fault from the five MAST modes plus tool faults.
- Oracle: external checks only (tests, git diff checks, DB state). The lead's word is never the oracle.
- Metrics: false-success, recovery per class, cascade radius, interventions, owner words, cost, wall-clock.
- Why: it is the one test that tests the lead's choices directly.

**Eval B. Real repo tasks with an oracle (secondary, external credibility).**
- Base: a fixed subset of SWE-bench Pro public split (not Verified; OpenAI calls Verified contaminated) [VD, BO], run as multi-agent tasks, or a Commit0-style small library task [P].
- Use: 50 to 100 tasks, paired runs, report pass rate with cost and wall-clock.
- Why: an outside number the owner can cite. Pass rate here is a tie-breaker, not the win condition.

**Eval C. Decision and delegation probe (targeted).**
- Base: SWE-Lancer manager-style choice tasks [P] and EntCollabBench delegation classes [P].
- Build: 20 to 30 tasks where the right move is to choose a proposal or to delegate with the right dependency order.
- Metrics: decision quality against the oracle value, delegation quality (brief completeness check), dependency-order errors.

### 3.2 Baselines (same model where possible)

| Baseline | Why | Notes |
|---|---|---|
| Single agent, same model, same tools | Shows value of orchestration at all | Anthropic showed +90.2% on an internal eval with Opus 4 lead and Sonnet 4 subagents, at about 15x tokens vs chat [VD]. Expect the cost to be high. Report it. |
| Claude Code subagents / agent teams, same model | Main competitor for Claude-based Maestro | Use the current release. Record the version. |
| OpenAI Codex (CLI, its own orchestration) | Main competitor for GPT | Different model. Report as "product vs product", not "model vs model" |
| Maestro with its orchestration features turned off (ablation) | Isolates Maestro's own gain | Ablate the ledgers (Magentic-One showed -31% without ledgers [P, from 06]) and the verifier gate (MAST/ChatDev +15.6% [P]) |
| Blind-retry policy | Tests recovery claim | OrchestraBench shows blind retry hurts on latent faults [P] |

Competitors such as Devin, Cursor background agents, Factory, Copilot coding agent, Jules, Augment, and Roo Code: run only if they can be driven the same way. Otherwise cite their published numbers with a clear "not same setup" label. Their own numbers are weak evidence (see section 4).

### 3.3 Fault-injection probes

Use OrchestraBench's mode list [P]. For each probe, record: injected, detected by the lead (yes/no, time), recovered (yes/no, oracle-checked), false-success (yes/no).

| Probe | Injected fault | Pass condition (oracle) |
|---|---|---|
| P1 Tool error | A tool returns an error, then succeeds on retry | Task completes; no false success |
| P2 Silent worker | A worker stops and never returns a result | Lead detects within the stall rule; re-dispatches or reports; does not claim done |
| P3 Ambiguous brief | Brief is missing the dependency order | Lead asks or repairs the brief; oracle passes |
| P4 Conflicting outputs | Two workers write incompatible files | Lead detects conflict, quarantines one, does not merge silently |
| P5 Context pollution | A worker's output contains a false fact | Lead checks against state before using it |
| P6 Premature action | Worker reports success before tests run | Lead runs the verifier before done |
| P7 Result loss | Worker's final message is dropped | Lead reads the artifact (diff, log) and continues |
| P8 Router trap | Misleading keyword in task | Lead routes by intent, matching the oracle's expected seat |

### 3.4 Statistics and reporting rules

- Pre-register the metrics, the oracle, and the stop rule before the first run. Commit the spec.
- Paired design: same tasks, same seeds, same model, same budget per arm.
- At least 3 runs per task (pass^3 style reliability) because agent results vary a lot [P, Kapoor].
- Report: pass rate, false-success rate, recovery per class, cost per verified task, wall-clock, interventions, owner words, each with a bootstrap 95% CI (OrchestraBench used bootstrap CI and paired tests [P]).
- Claim "indisputable" only where the CI of Maestro vs baseline excludes zero on a pre-stated metric. Otherwise report it as a tie.
- Publish the harness, seeds, transcripts, and oracle scripts so others can reproduce. Kapoor et al. list non-reproducibility as a common failure [P].
- Budget: state the dollar cap per arm before running. Anthropic's 15x token figure [VD] means the single-agent baseline is cheap and multi-agent arms are expensive. Show both.

### 3.5 Owner-time metric

- Owner words: count of words the owner must read to make a decision, across the run. Lower is better. Maestro's reports count against it.
- Decisions asked: count of questions Maestro sends the owner. Lower is better, but only if the answer was really needed (oracle check: was it needed, or could Maestro have decided safely?).
- Unneeded asks: asks the owner answered "you could have decided this" (self-report, needs a fixed rubric).
- Owner time: owner words divided by reading speed as a proxy. This is a proxy, not a measure. Label it so.
- This metric is not in any public benchmark [UNV]. Its value is that it matches the owner's stated pain: reports and asks.

### 3.6 Permission and status

- **Running any eval needs the owner's permission.** Memory rules say: ask before any benchmark (2026-10-19), no heavy local runs (2026-10-17), CI only for tests. Eval A and B would run on GitHub Actions or on a model API, which costs money. Ask for: the budget cap, which models, which competitor tools may be driven, and whether a live product (Claude Code, Codex) may be called.
- Nothing in this document has been run. Every number in section 1 is from abstracts or secondary sources, as marked.

## 4. Where competitors are weak (by their own evidence or user reports)

Each item is a margin to win on. Each has a source class. Where the evidence is a user report, it is a hypothesis for the proof, not a fact.

| Weakness | Evidence | Class | Maestro margin to test |
|---|---|---|---|
| Subagent results not propagated; lead stalls | Claude Code issues, "result not propagated", stall after subagent completes (05 cites claudeissues mirror; current status [UNV]) | [UR] | P7 probe; measure result propagation rate and stall detection time |
| Blind retry reproduces latent faults | OrchestraBench: blind retry reproduced latent faults and slowed detection | [P] | Recovery per class; Maestro uses state check before retry |
| Latent modes never recovered | OrchestraBench: context pollution, conflicting outputs, premature action at 0.0 recovery (for the Claude agent tested) | [P] | Show Maestro recovers at least some of these; if not, say so |
| Ambiguous delegation fails about 70% of the time to recover | OrchestraBench: 0.30 recovery | [P] | Brief checklist; P3 probe |
| Keyword routing fails on adversarial inputs | OrchestraBench: 0% keyword router vs 100% intent router on 26 cases | [P] | P8 probe; Maestro routes by intent with a check |
| Cascade radius grows with depth | 0.9 to 4.7 when depth goes 3 to 7 | [P] | Measure cascade radius in Maestro with shallow plans |
| Over-spawning and duplicate work | Early Anthropic agents spawned 50 subagents for simple queries and duplicated work | [VD] | Cost per verified task; subagent count |
| Verbosity, status chatter | Anthropic: chatter and status updates distract (06 cites) | [VD] | Owner words metric |
| Synchronous bottleneck | Anthropic: synchronous execution blocks lead steering | [VD] | Wall-clock to verified done |
| Same model, different harness, very different score | Terminal-Bench snapshots: harness changes ranking | [BO] | Hold the harness fixed; say the harness is the variable |
| Vendor-reported pass rates are not comparable | SWE-bench Pro numbers conflict across sources; SWE-bench Verified contaminated (OpenAI, [VD]) | [VD], [BO] | Run on the same fixed subset; do not quote vendor numbers as head-to-head |
| Stateful errors compound in long runs | Anthropic: "Agents are stateful and errors compound" | [VD] | Checkpoint and resume probe; false-success over run length |

Weak evidence to avoid quoting as fact:
- Devin, Factory, Cursor, Copilot, Jules, Augment, Roo Code: no primary numbers found in this pass for orchestration quality [UNV]. The 05 report gives product mechanics.
- Vendor claims of "bugs per PR" or "% of work done by agents" (for example Devin Review in 06, [BO]/vendor) are not verified.

## 5. Recommendation

1. Ask the owner for permission for Eval A (injected faults) first. It is the cheapest, most direct, and matches the owner's stated pain. Budget cap needed.
2. Build the metrics definitions (section 2) and the oracle list before any run. Commit them.
3. Use Eval B only as an outside tie-breaker, on a fixed public subset. Do not use Verified.
4. Use Eval C after A, if the delegation claim needs a number.
5. Do not claim "best" from pass rate alone. Claim, per metric, with CIs: lower false-success, higher recovery on named fault classes, lower owner words, and a stated cost premium.
6. Before quoting any competitor number, fetch its primary page and record the date and whether it was lab-reported or independently run.

## Open items

- [UNV] OrchestraBench code and dataset location; license.
- [UNV] Full-paper numbers for EntCollabBench, SWE-Lancer manager subset, MultiAgentBench KPIs, tau2 pass^k.
- [UNV] Current SWE-bench Pro leaderboard (Scale live board) and whether scores are lab-reported.
- [UNV] METR current frontier horizons (secondary sources conflict).
- [UNV] Claude Code stall issue status (mirror only).
- [UNV] Any public measure of owner interventions or false-success in a shipped product.

## Sources

- OrchestraBench, arXiv 2608.05263: https://arxiv.org/abs/2608.05263
- EntCollabBench ("Beyond the All-in-One Agent"), arXiv 2605.08761: https://arxiv.org/abs/2605.08761
- MultiAgentBench, arXiv 2503.01935: https://arxiv.org/abs/2503.01935 ; code https://github.com/MultiagentBench/MARBLE
- TheAgentCompany, arXiv 2412.14161: https://arxiv.org/abs/2412.14161
- SWE-Lancer, arXiv 2502.12115: https://arxiv.org/abs/2502.12115
- Terminal-Bench, ICLR 2026: https://proceedings.iclr.cc/paper_files/paper/2026/hash/444a3737adaee10d86ad2ef5f74468e6-Abstract-Conference.html ; leaderboard snapshot (third party): https://www.codesota.com/benchmark/terminal-bench , https://www.morphllm.com/terminal-bench-2
- SWE-bench Pro (Scale), public split and leaderboard: https://labs.scale.com/leaderboard/swe_bench_pro_public (the leaderboard is named in a secondary guide; direct fetch not done) ; secondary: https://aicodereview.cc/blog/swe-bench-scores-leaderboard
- OpenAI, "Why we no longer evaluate SWE-bench Verified" (Feb 2026): https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/
- Epoch AI benchmark review, SWE-bench Verified: https://epoch.ai/benchmarks/swe-bench-verified/review
- Commit0, arXiv 2412.01769: https://arxiv.org/abs/2412.01769
- tau2-bench, arXiv 2506.07982: https://arxiv.org/abs/2506.07982
- METR, "Measuring AI Ability to Complete Long Software Tasks," arXiv 2503.14499: https://arxiv.org/abs/2503.14499 ; METR time horizons page: https://metr.org/time-horizons/
- Toby Ord, "Is there a half-life for the success rates of AI agents?", arXiv 2505.05115: https://arxiv.org/abs/2505.05115
- Kapoor, Stroebl, Narayanan et al., "AI Agents That Matter," arXiv 2407.01502 (TMLR 2025): https://arxiv.org/abs/2407.01502 ; project page https://agents.cs.princeton.edu/
- MAST, "Why Do Multi-Agent LLM Systems Fail?", arXiv 2503.13657: https://arxiv.org/abs/2503.13657
- Anthropic, "How we built our multi-agent research system": https://www.anthropic.com/engineering/multi-agent-research-system
- Magentic-One, arXiv 2411.04468 (via 06): https://arxiv.org/abs/2411.04468
- Claude Code stall issue mirror (via 05, [UR]): https://claudeissues.com/issue/70641-bug-main-agent-stalls-after-a-sub-agent-agent-task-tool-completes-result-not-pro
- Reports 05 and 06 in this folder (prior research, same worktree).
