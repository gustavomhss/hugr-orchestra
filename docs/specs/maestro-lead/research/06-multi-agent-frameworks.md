# 06 - Multi-agent frameworks and orchestrator evidence (track E2)

## Scope and date

- Date of research: 2026-10-28.
- Scope: what an orchestrator (lead/manager/supervisor agent) is responsible for, what state it keeps, how it picks the next agent, how it detects stall and failure, how it verifies worker output, and what has been measured. Focus is the orchestrator, not the workers.
- Evidence classes used: **P** = paper with measurement; **V** = vendor/official doc; **B** = blog or opinion; **S** = secondary summary (search snippet or third-party write-up, not read in primary form).
- Gaps: MetaGPT, ChatDev, AgentVerse, CAMEL result tables were not read in primary form. CrewAI and AutoGen were read from official docs only for the specific pages listed. OpenAI Swarm was not verified. Magentic-One exact prompts were read from the HTML of v1 only. Items marked "unverified" should not be cited as fact.

## Per-system findings

### 1. Magentic-One (Microsoft) - P
- Source: arXiv 2411.04468, "Magentic-One: A Generalist Multi-Agent System for Solving Complex Tasks", submitted 2024-11-07. HTML read: https://arxiv.org/html/2411.04468v1
- Orchestrator responsibilities: plan, track progress, re-plan on error, and dispatch specialist agents (web surfer, file surfer, coder, computer terminal).
- State kept, two ledgers:
  - Task Ledger (outer loop): "given or verified facts", "facts to look up", "facts to derive", "educated guesses", and a natural-language plan as "a sequence of steps and assignments of those steps to individual agents".
  - Progress Ledger (inner loop, every iteration): self-reflection questions, paraphrased exactly as the paper's set: is the request fully satisfied; is the team looping or repeating itself; is forward progress being made; which agent should speak next; what instruction or question should be asked of that agent. Answers are structured (JSON-style) so the controller can route on them.
- Next-speaker decision: the orchestrator LLM answers the "which agent speaks next" ledger question. No fixed schedule.
- Stall detection: a stall counter increments when a loop is detected or forward progress is missing. When it exceeds a threshold (the paper's experiments use a threshold of <=2), the inner loop breaks, the orchestrator runs a reflection step, updates the task ledger and revises the plan. The paper says "we force all agents to clear their contexts and reset their states after each plan update." It does not clearly say whether the counter resets.
- Verification of worker output: the progress ledger's "satisfied?" question, plus specialist-returned text. No separate verifier agent.
- Measured results (WebArena/GAIA/AssistantBench with GPT-4o, and o1 on GAIA/AssistantBench): GAIA test 32.33 +/- 5.3 (GPT-4o), 38.00 +/- 5.5 (GPT-4o, o1); WebArena 32.8 +/- 3.2 (GPT-4o); AssistantBench test EM 11.0 (GPT-4o), 13.3 (GPT-4o, o1).
- Ablation (P): replacing the orchestrator with AutoGen's GroupChat baseline and removing the ledgers reduces performance by about 31%. Removing any single worker reduces performance by 21% to 39%. Read from the HTML of v1; verify the table before quoting externally.
- Error analysis (P): the paper has no orchestrator-specific failure category. Two codebook examples are orchestrator failures: the orchestrator "commanded agents to use a flawed path repeatedly" and "concluded a task although necessary criteria were unverified".

### 2. MAST taxonomy: "Why Do Multi-Agent LLM Systems Fail?" - P
- Source: arXiv 2503.13657 (v3 submitted 2025-10-26; NeurIPS 2025 D&B). https://arxiv.org/html/2503.13657v3 . Repo: github.com/multi-agent-systems-failure-taxonomy/MAST (per search summary).
- Dataset: MAST-Data, 1,600+ annotated traces across 7 MAS frameworks (v3 text cites 1,642 traces). Taxonomy inter-annotator kappa 0.88 (per search summary of earlier version); LLM judge kappa 0.77 vs experts (earlier version).
- 14 failure modes, 3 categories (paper's names: "System Design Issues", "Inter-Agent Misalignment", "Task Verification"). Prevalence as reported:
  - FM-1.1 disobey task spec 11.8%; FM-1.2 disobey role spec 1.5%; FM-1.3 step repetition 15.7%; FM-1.4 loss of conversation history 2.8%; FM-1.5 unaware of termination conditions 12.4%.
  - FM-2.1 conversation reset 2.2%; FM-2.2 fail to ask for clarification 6.8%; FM-2.3 task derailment 7.4%; FM-2.4 information withholding 0.85%; FM-2.5 ignored other agent's input 1.9%; FM-2.6 reasoning-action mismatch 13.2%.
  - FM-3.1 premature termination 6.2%; FM-3.2 no or incomplete verification 8.2%; FM-3.3 incorrect verification 9.1%.
  - The base of these percentages is not stated in the fetched text. Treat as prevalence, not count.
- Interventions (P): ChatDev, giving the CEO-role agent the final say so the CPO could not end the chat without consensus: +9.4% task success (the paper attributes the same +9.4% inconsistently to role specification). Adding a high-level task-objective verification step: +15.6% on ProgramDev. The authors conclude tactical prompt fixes give inconsistent results and structural changes are needed.
- Attribution to orchestrator (my classification, not the paper's): FM-1.5, FM-3.1, FM-3.2, FM-3.3 and the termination/verification part of FM-1.3 are coordination-owned. FM-2.4 (withholding) and FM-2.6 are shared with workers. FM-1.1 and FM-1.2 are split between spec author and orchestrator.

### 3. Anthropic - "How we built our multi-agent research system" - V (with internal eval, not peer reviewed)
- Source: https://www.anthropic.com/engineering/multi-agent-research-system
- Lead agent: analyzes the query, develops a strategy, spawns subagents in parallel, decides after synthesis whether to research more, can create more subagents or refine approach. Saves the plan to Memory because context can be truncated past about 200k tokens.
- Effort scaling rules (added because early versions "spawned 50 subagents for simple queries"): simple fact finding 1 agent, 3-10 tool calls; direct comparison 2-4 subagents, 10-15 calls each; complex research more than 10 subagents with divided responsibilities.
- Measured: Opus 4 lead plus Sonnet 4 subagents outperformed single-agent Opus 4 by 90.2% on the internal research eval (V, internal). Multi-agent uses about 15x chat tokens, agents about 4x (V).
- Verification: LLM-as-judge rubric (factual accuracy, citation accuracy, completeness, source quality, tool efficiency), 0.0-1.0 score; a separate CitationAgent attaches sources; human testers caught source-quality issues (SEO content farms) the judge missed; production tracing of decision patterns.
- Orchestrator failure modes named by the post: endless web searches for nonexistent sources; excessive status updates distracting other agents; synchronous lead-to-subagent execution as a bottleneck; errors compound in stateful long-running agents (checkpointing and retry required).
- Stated fit limit: poor fit for tasks needing shared context or heavy dependencies, "most coding tasks"; "LLM agents are not yet great at coordinating and delegating to other agents in real time."

### 4. Anthropic - "Building effective agents" (orchestrator-workers) - V
- Source: https://www.anthropic.com/research/building-effective-agents
- Pattern: "a central LLM dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results." Subtasks are not predefined (unlike parallelization).
- Use when subtasks cannot be predicted (multi-file code changes, multi-source search). Stated trade: "Agentic systems often trade latency and cost for better task performance." Warns of "compounding errors". Advice to start simple before adding orchestration (V).

### 5. Cognition - "Don't Build Multi-Agents" (Walden Yan, June 2025) and follow-up (April 2026) - B
- Source: https://cognition.com/blog/dont-build-multi-agents (redirect from cognition.ai). Follow-up: https://cognition.com/blog/multi-agents-working (dated 2026-04-22).
- Principles: "Share context, and share full agent traces, not just individual messages"; "Actions carry implicit decisions, and conflicting decisions carry bad results". Flappy Bird example: two parallel subagents built mismatched styles (Mario-like background, non-Flappy bird), and the merging agent failed.
- Recommended: single-threaded linear agent by default; for context overflow, a separate model compresses history into decisions and events (the author says this compression is hard).
- Follow-up (B): writes stay single-threaded; additional agents contribute intelligence. Patterns that work: clean-context reviewer loop (reviewer sees only the diff, a bridge filters which bugs the coder acts on); "smart friend" escalation to a stronger model (works when both are strong); manager-child "map-reduce-and-manage" in Devin, "still being refined". Measured claims are vendor-reported: Devin Review catches about 2 bugs per Devin PR, about 58% severe.
- Counter-argument: Anthropic (V) above reports a 90.2% gain for a read-only research task. The disagreement is about write parallelism and shared-context tasks, not about orchestration per se. Both sides agree that parallel writers with implicit decisions conflict.

### 6. CrewAI hierarchical process - V
- Source: https://docs.crewai.com/en/learn/hierarchical-process
- Set `process=Process.hierarchical` (default is sequential). Manager delegates by role and capability and "evaluates outcomes to ensure they meet the required standards". Manager via `manager_llm` (auto-created) or `manager_agent` (custom). A manager LLM is required. Delegation is off by default and must be enabled. Docs list no formal limits. The manager's state and stall handling are not documented on this page.

### 7. LangGraph supervisor (langgraph-supervisor) - V/S
- Sources: search results and PyPI (https://pypi.org/project/langgraph-supervisor/); the official docs page was not fetched.
- Supervisor controls all routing; delegation via handoff tools (`create_handoff_tool`); supervisors can nest. Third-party guide notes the supervisor is a single point of failure (S, opinion). No stall or verification mechanism documented in what was read.

### 8. AutoGen SelectorGroupChat (AG2 lineage) - V
- Source: https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/selector-group-chat.html
- Next speaker: an LLM chooses from participant `name` and `description` using a `selector_prompt` (placeholders `{participants}`, `{roles}`, `{history}`). Options: `allow_repeated_speaker`, `selector_func` (custom; returning None falls back to model), `candidate_func` (narrows candidates; invalid with selector_func).
- Termination: composable conditions, e.g. `TextMentionTermination("TERMINATE")` combined with `MaxMessageTermination(25)`. The 25-message cap is the only loop guard shown.
- Guidance: keep selector prompts short ("Try not to overload the model with too much instruction"); use a custom selection function for many per-agent conditions; reasoning models need simpler prompts. Magentic-One's ablation (above) uses GroupChat as the weaker baseline.

### 9. OpenAI Agents SDK handoffs and agents-as-tools (successor to Swarm) - V
- Source: https://openai.github.io/openai-agents-python/handoffs/
- Handoff transfers control to the named agent, exposed to the model as a tool; receiving agent sees prior history unless an input filter changes it. Nested history is an opt-in beta that compacts history. `Agent.as_tool(...)` calls a specialist without transferring the conversation, so the orchestrator keeps control. Stated limits: handoffs stay within one run; input guardrails only on the first agent; tool guardrails do not cover handoffs.
- Swarm: not verified in this pass (no source read). Treat as unverified.

### 10. MetaGPT (arXiv 2308.00352) - P/S
- Encodes SOPs as prompt sequences; assembly-line roles (product manager, architect, engineer); intermediate artifacts checked against SOP. Claims more coherent code than chat-based MAS on HumanEval/MBPP (v6 is marked ICLR 2024). Specific numbers were not verified in primary tables.
- Relevance to orchestrator: the SOP is the orchestrator's state, so stall is defined by missing artifacts, not by LLM judgment.

### 11. ChatDev, AgentVerse, CAMEL - not verified
- Only ChatDev appears in MAST's interventions (above, P). AgentVerse and CAMEL were not read. Do not cite their numbers from memory.

### 12. Newer evaluation work on orchestrators (2026) - P (preprints)
- OrchestraBench, arXiv 2608.05263 (Aug 2026): failure injection on templated enterprise workflows; metrics cascade radius (mean rises 0.9 to 4.7 as pipeline depth goes 3 to 7) and per-mode recovery. With a Claude agent (Sonnet/Opus/Haiku tiers): tool faults recovered fully; ambiguous delegation about 30%; three latent modes (context pollution, conflicting outputs, premature action) never recovered; blind retry reproduced latent faults and slowed detection. A keyword/flag router scored 0% on 26 adversarial cases vs 100% for an intent-reasoning router. Small sample; full paper not read.
- Role-specialized enterprise benchmark, arXiv 2605.08761: delegation breakdown as a major error source, split into delegation never initiated, delegation with insufficient information, and delegation issued at the wrong dependency point. Abstract-level read only.

## Orchestrator state models compared

| System | Orchestrator state kept | Next-agent decision | Stall / failure detection | Worker-output verification | Measured evidence |
|---|---|---|---|---|---|
| Magentic-One (P, 2411.04468) | Task ledger (facts, guesses, plan) + progress ledger rewritten each step | LLM answers "who speaks next" in progress ledger | Stall counter from loop / no-progress; threshold <=2; replan and clear worker contexts | "Is request satisfied?" question; no separate verifier | GAIA 32-38; ablation: no ledgers and GroupChat = -31% |
| MAST/ChatDev fixes (P, 2503.13657) | Not a system; diagnosis of failures | n/a | Taxonomy only | Adding task-objective verifier step: +15.6% | +9.4% CEO final-say; +15.6% verifier |
| Anthropic research (V) | Plan saved to Memory; findings; CitationAgent | Lead decides spawn count by effort rules | Tracing of decision patterns; checkpoint and retry | LLM-as-judge rubric 0-1 + human review | +90.2% vs single-agent (internal) ; 15x tokens |
| Anthropic building-effective-agents (V) | Task list from orchestrator | Dynamic per input | not specified | not specified | none |
| Cognition (B) | Shared full traces; compressed history | Single linear agent default | not specified | Clean-context reviewer loop (follow-up) | Devin Review: ~2 bugs/PR (vendor) |
| CrewAI hierarchical (V) | Manager agent LLM | Manager delegates by role | Manager "evaluates outcomes" | Manager validation step | none documented |
| LangGraph supervisor (V/S) | Supervisor routing state | Supervisor via handoff tools | none documented | none documented | none |
| AutoGen SelectorGroupChat (V) | Shared message history | LLM selector w/ prompt, or custom func | max-message termination (25 in example) | none built-in | used as GroupChat baseline in Magentic-One |
| OpenAI Agents SDK (V) | Conversation history; optional compaction | Model picks handoff tool or as_tool | guardrails on first/last agent only | output guardrail | none in doc |
| MetaGPT (P/S) | SOP artifacts per role | Fixed assembly line | artifact-missing as failure | intermediate artifact checks | HumanEval/MBPP claims (unverified) |

## Orchestrator-attributable failure modes and countermeasures

| Failure mode (orchestrator-owned unless noted) | Evidence | Countermeasure | Countermeasure evidence |
|---|---|---|---|
| Premature termination / concluding without verifying criteria (MAST FM-3.1 6.2%; Magentic-One codebook example) | P 2503.13657, P 2411.04468 | Explicit verification gate before "done"; requirement checklist held in state | +15.6% with task-objective verification step (MAST/ChatDev) |
| No or incorrect verification (FM-3.2 8.2%, FM-3.3 9.1%) | P 2503.13657 | Separate verifier agent with clean context, sees only artifact (Cognition reviewer loop, B); LLM judge + human review (V) | Anthropic judge + human found issues judge missed (V); reviewer loop: vendor only |
| Step repetition / looping (FM-1.3 15.7%) | P 2503.13657; P 2411.04468 | Loop question each iteration + stall counter + replan; hard message cap | Magentic-One ablation -31% without ledgers (P); AutoGen 25-message cap (V, no measured gain) |
| Unaware of termination conditions (FM-1.5 12.4%) | P 2503.13657 | Explicit done criteria written into state before dispatch | Not measured in isolation |
| Role / spec disobeyed (FM-1.1 11.8%, FM-1.2 1.5%) | P 2503.13657 | Write role/spec into the task ledger; CEO-style final authority | +9.4% with final-say role (P, ChatDev) |
| Information withholding / ignored input (FM-2.4 0.85%, FM-2.5 1.9%) | P 2503.13657 | Full traces shared, not summaries (B, Cognition) | Not measured |
| Ambiguous delegation (insufficient info, wrong dependency order) | P 2605.08761 (abstract); P 2608.05263 recovery ~30% | Delegation brief checklist; dependency-aware dispatch; intent-reasoning routing | 100% vs 0% routing on 26 adversarial cases (P 2608.05263, small) |
| Latent faults: context pollution, conflicting outputs, premature action | P 2608.05263 (never recovered; retry worsens) | Do not rely on blind retry; check state, quarantine conflicting outputs | Mechanism probes only |
| Over-spawning subagents for simple queries (50 subagents) | V (Anthropic) | Effort-scaling rules in orchestrator prompt | Qualitative |
| Parallel writers with implicit conflicting decisions | B (Cognition) | Single writer; parallel agents only read/review | Vendor claims |
| Single point of failure in supervisor | S (LangGraph guide, opinion) | Checkpointing, retries | Not measured |
| Chatter / status updates distracting others | V (Anthropic) | Limit updates to the orchestrator; workers report compactly | Qualitative |
| Compounding errors in long runs | V (Anthropic), B (Cognition) | Checkpoints; compressed decision history | Not measured |

## Implications for Maestro

1. Maestro needs two explicit ledgers, like Magentic-One: a task ledger (verified facts, facts to look up, plan with owner per step) and a progress ledger rewritten every decision cycle with the five questions (done? looping? progressing? who next? what instruction?). This is the one design with a measured ablation (-31% without them, P).
2. Stall rule: count loop or no-progress events in the progress ledger; at a threshold (the paper used <=2) stop, rewrite the plan, and reset worker context. Do not rely on the LLM to notice stall on its own.
3. Completion is a gate, not a judgment. Done requires a verifier decision on a stated criterion. Premature termination and missing verification together account for about 14% of MAST failures (P), and the one verifier step measured is +15.6% (P).
4. Verification uses a clean-context verifier that sees the artifact and the criterion, not Maestro's narrative. Use the LLM-judge plus human-spot-check pattern (V) for research-type output.
5. Delegate by handoff for control-keeping work, by agent-as-tool for read-only specialists. Maestro should keep write authority single-threaded (Cognition, B), with parallel agents only reading, reviewing or researching.
6. Caps: maximum subagents per task by complexity tier (Anthropic V); a hard message or step cap with an explicit "escalate to owner" outcome (AutoGen V pattern).
7. Do not trust blind retry for latent faults (OrchestraBench, P preprint). On a worker failure, re-check state and quarantine conflicting outputs before re-dispatch.
8. Log decision patterns for diagnosis (Anthropic, V): trace which agent was chosen, which question caused the choice, not full transcripts.
9. Keep the orchestrator prompt short. The AutoGen docs and Magentic-One both show that next-speaker selection degrades with long selector instructions (V); keep routing rules in code where possible.
10. Evidence gaps to close before design freeze: read Magentic-One's full prompts and stall details (arXiv 2411.04468 PDF), MAST v3 base counts, OrchestraBench full text, and the ChatDev/AgentVerse/CAMEL tables.

## Sources

- Magentic-One, arXiv 2411.04468 (abs and HTML v1): https://arxiv.org/abs/2411.04468 , https://arxiv.org/html/2411.04468v1
- MAST, "Why Do Multi-Agent LLM Systems Fail?", arXiv 2503.13657 (v3 HTML): https://arxiv.org/html/2503.13657v3 ; repo https://github.com/multi-agent-systems-failure-taxonomy/MAST
- Anthropic, "How we built our multi-agent research system": https://www.anthropic.com/engineering/multi-agent-research-system
- Anthropic, "Building effective agents": https://www.anthropic.com/research/building-effective-agents
- Cognition, "Don't Build Multi-Agents": https://cognition.com/blog/dont-build-multi-agents
- Cognition, "Multi-Agents: What's Actually Working" (2026-04-22): https://cognition.com/blog/multi-agents-working
- CrewAI hierarchical process: https://docs.crewai.com/en/learn/hierarchical-process
- LangGraph supervisor (PyPI): https://pypi.org/project/langgraph-supervisor/
- AutoGen SelectorGroupChat: https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/selector-group-chat.html
- OpenAI Agents SDK handoffs: https://openai.github.io/openai-agents-python/handoffs/
- MetaGPT, arXiv 2308.00352: https://arxiv.org/abs/2308.00352
- OrchestraBench, arXiv 2608.05263: https://arxiv.org/abs/2608.05263
- Role-specialized enterprise benchmark, arXiv 2605.08761: https://arxiv.org/pdf/2605.08761
</content>
