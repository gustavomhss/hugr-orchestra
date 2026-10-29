# Strategy: build or adopt, and how Maestro wins

Status: proposal. Sources: [research/10](research/10-frameworks-build-vs-adopt.md) (frameworks),
[research/12](research/12-proof-and-evals.md) (proof), [research/06](research/06-multi-agent-frameworks.md) (patterns),
[research/13](research/13-oss-orchestrator-code.md) (open-source orchestrator code),
[research/14](research/14-products-primary.md) (shipped products), [research/15](research/15-papers-fulltext.md) (papers,
full text).

## Build or adopt: build the lead protocol, adopt no runtime

Orchestra already has the hard parts a framework would sell:

- durable admission (`session_input`)
- durable human gates (`modules/maestro/coordination/src/governed-task.ts:25-52`)
- ledgers and projected history
- compare-and-set on workflow stages (`packages/core/src/relay-workflow-session.ts:80-89`)

LangGraph, CrewAI Flows, Mastra, Microsoft Agent Framework and Temporal each bring their own loop or store. That
conflicts with the V2 rule of one `llm.stream` call per provider turn. Claude Code agent teams are experimental and
cannot resume in-process teammates.

Reading the code of the open-source orchestrators confirms it ([research/13](research/13-oss-orchestrator-code.md)).
Their lead logic is small, and most of it is prompt. Only three of them check a worker's claim in code: Goose (a shell
check must exit 0), Cline (an outcome cannot finalize without a reviewed fragment) and the Claude Agent SDK (a
SubagentStop hook can block). Nothing there is worth a runtime dependency.

**We copy patterns, not code:**

- Magentic-One task and progress ledgers, and its stall threshold of 2 (paper). The decrement for progress, floored at
  0, comes from AutoGen's code, whose default `max_stalls` is 3; Maestro uses 2.
- loop limits like OpenHands (4 repeats of an action, 3 of an error) and Roo (the 4th identical call is blocked)
- Codex's question discipline: at most 3 questions, never about what the agent can discover
- Codex's limits as a reference for the default cap: depth 1, `DEFAULT_AGENT_MAX_THREADS` 6. One open issue (#33447)
  reports 4 slots where 10 were configured; the real cap under V2 is unconfirmed.
- retries for transient faults only
- a heartbeat per seat run
- a journal and replay design for crash recovery (a design first, per AGENTS.md)

A2A and MCP Tasks are worth watching for interop. They are not needed now.

## Where Maestro can win by a wide margin

Nobody publishes numbers on orchestration quality. Vendors publish pass rates, which mostly measure the model. The
margins below are open, and they are the owner's stated pain.

| Margin | Field baseline (evidence) | Maestro mechanism |
|---|---|---|
| False success | False claims of success are 45–48% of failures in τ²-bench retail and airline, 3% in telecom and 75.8% in AppWorld. No LLM judge passes AUROC 0.65 on τ² (0.54 on AppWorld), while simple TF-IDF detectors reach 0.83–0.95 (arXiv 2606.09863). MAST: +15.6 points from a verification step. | `land`: verify state, never the claim; the "not independently verified" label |
| Gaming the check | On Conflicting-SWEbench, GPT-5 cheated on 54% of tasks and o3 on 49%; a `flag_for_human_intervention` path cut that to 9% and 12%, with a much smaller effect for Opus 4.1 (ImpossibleBench, Section 5.3). One-off SWEbench reached 76%. On conflicting LiveCodeBench, a strict prompt alone moved GPT-5 from 92% to 1% | The packet's **If impossible** line and BLOCKED status |
| Latent fault recovery | The agent recovered 0.0 of three latent fault modes on its own, and fixed, heuristic and retry policies pooled 0.08; tool faults 1.0 (OrchestraBench, controlled probes; small sample, full text not read) | Find the cause before retrying; retry only loud errors |
| Ambiguous delegation | 0.30 recovery (OrchestraBench) | `dispatch` refuses a packet with an open choice |
| Stalls | Magentic-One loses 31% on GAIA when its whole Orchestrator, ledgers included, is replaced. OpenHands and Roo detect repeated actions in code ([research/13](research/13-oss-orchestrator-code.md)), but no product reliably tells the lead ([research/14](research/14-products-primary.md)) | Stall count per card, cause written at 2 |
| Self-serving routing | Prompted models send work to the most expensive helper or their own family 73–98% of the time; the 73% is Qwen3-8B sending to GPT-5 (ToolOrchestra, Figure 3) | Route by role and by rule, cheap seat first, escalate on failure |
| Reliability | τ-bench pass^8 falls below 25% for a model at 61% pass^1 | Evals report pass^k, k ≥ 4 |
| Owner time | Not measured by anyone. This owner sent about 100 status pings and rejected jargon, bare votes and hand-backs ([owner evidence](owner-evidence.md)). A cap of one question cut user-attention cost 73% (Ask Less, simulated users). A recommendation with confidence made the team beat either part (Bansal 2021: 0.89 against 0.84 and 0.82). | Owner voice: fixed shapes, one recommendation, two-way doors decided, status volunteered |

The nine gaps no shipped product fills ([integrations](integrations.md#gaps-nobody-fills)) are the rest of the margin.
Each is small to build because Orchestra already owns the board, the Sessions and the seat returns.

"Best" here means winning on these pre-registered metrics with confidence intervals, not on a leaderboard Maestro
cannot control.

## Proof plan (runs only with the owner's permission)

1. **Eval A (primary): injected faults.**
   - 30–50 repo tasks, each with a seeded fault from probes P1–P8: tool error, silent worker, ambiguous brief,
     conflicting outputs, context pollution, premature action, result loss, router trap.
   - The oracle is external: tests, diff and state.
2. **Baselines:**
   - a single agent
   - Claude Code subagents
   - Codex
   - Maestro with its ledgers and verify gate removed (ablation)
   - a blind-retry policy
3. **Metrics, fixed before the run:**
   - verified pass
   - false-success rate
   - recovery per fault class
   - cost per verified task
   - wall-clock
   - owner interventions, and owner questions that the record could have answered
   - owner words read
   - pass^k with k ≥ 4
4. **Rules:**
   - paired runs, with 3 or more runs per task
   - a bootstrap 95% CI
   - "wins" only where the CI excludes zero
   - publish the harness and the seeds
5. **Later:** Eval B (a fixed SWE-bench Pro subset) as an outside tie-breaker, and Eval C (delegation and decision probes).

Order: build skills and integrations first, then Eval A. Measuring before the mechanisms exist would only measure
today's gap.

There is no baseline from real use yet. The app holds 2 Maestro Sessions out of 32, with no board questions, issues or
notes. The first real epic run through `maestro-lead` is the first measurement.
