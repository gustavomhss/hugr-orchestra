# 10 - Framework primitives: build or adopt for Maestro

## Question and scope

- Date: 2026-10-28.
- Question: which orchestration primitives do the big frameworks offer, and should Maestro adopt one or build its own lead protocol on Orchestra's runtime?
- Read first: `06-multi-agent-frameworks.md` (patterns: Magentic-One, MAST, CrewAI hierarchical, LangGraph supervisor, AutoGen selector, OpenAI handoffs, MetaGPT). This report does not repeat those.
- Read-only research. No tests, typecheck, builds or commits were run.
- Evidence tags: [VD] vendor doc, [SC] source or repo metadata, [P] paper, [UR] user report, [BO] blog. [UNV] = not confirmed from a fetched primary source.

## Short answer

Build our own lead protocol on Orchestra's runtime. Copy four framework patterns into it. Do not adopt a framework as the runtime. Details in the last section.

## 1. Framework primitives

### 1.1 LangGraph (MIT [SC])

| Primitive | What it does | Evidence |
|---|---|---|
| Checkpointer | Saves full graph state per `thread_id` at each step. Needed for interrupts and fault tolerance. Memory saver loses data on restart. Checkpoints grow without a retention policy. | [VD] persistence page |
| interrupt() / Command(resume=) | Pauses a node, returns a JSON value to the caller, resumes with the same `thread_id`. Optional `response_schema` (langgraph >= 1.2.12). | [VD] interrupts page |
| Node re-run on resume | On resume the node restarts from its first line. Code before `interrupt()` runs again. Matching is by call order, so interrupts must be called in a fixed order. | [VD] interrupts page |
| Send (map-reduce) | A conditional edge returns one `Send` per item. Results merge via reducer. | [VD] graph API page |
| Command (routing) | A node returns state update and next node together. | [VD] graph API page |
| RetryPolicy / CachePolicy | Per-node retry, default skips ValueError, TypeError, OSError. HTTP errors retry only on 5xx. Per-node cache with TTL. | [VD] graph API page |
| Durability modes | sync / async / exit. Not covered on the pages I read. | [UNV] |
| Time travel | Named in the persistence page intro. Mechanics not on the pages I read. | [UNV] |

- Novel: the interrupt-and-replay model is simple. Its cost is the node re-run rule.
- Limits: a forum reply says a hard cancel mid-node loses in-flight writes, because persistence happens only at step boundaries [UR]. A March 2026 blog warns a process restart with no persistent checkpointer loses paused state [BO].
- GitHub issues: my search returned no GitHub issues. Complaints above are forum and blog only.

### 1.2 Temporal and durable execution

| Primitive | What it does | Evidence |
|---|---|---|
| Event history replay | Workflow code re-runs from the start against recorded events. Must be deterministic. No `Date.now()`, no random, no direct network calls in the workflow. | [VD] workflows page |
| Activities | Side effects (LLM call, tool, DB). Each result is recorded and reused on replay. | [VD] workflows page |
| Retry and timeouts | Retry policy per activity. Start-to-close timeout is strongly recommended, because the server cannot see a dead worker without it. Heartbeats detect stalled activities; a missed heartbeat fails the attempt and the retry policy decides. | [VD] activity failures page |
| Timers | Recorded as events. Do not wait again on replay. | [VD] workflows page |
| Signals / updates | Used for human approval inside a workflow (the OpenAI Agents integration waits on a Signal or Update for approval). | [VD] OpenAI Agents integration page |
| Agents on Temporal | OpenAI Agents SDK integration: loop, handoffs and tool choice run in the workflow; model calls run as activities with durable retries. Python package GA stated 2026-03-23. | [VD] integration page; [BO] Temporal blog (search snippet) |
| Continue-as-new | Needed for long chats, because history size is capped. | [VD] OpenAI Agents integration page |

- Limits stated in the integration page: MCP servers are not durable; `SQLiteSession`, `LocalShellTool`, `ComputerTool` unsupported; sandbox is pre-release; OpenTelemetry is public preview.
- Requires running a Temporal server and workers. This is an infrastructure dependency.

**Restate** [VD]: a journal records each side effect with its result. Replay skips recorded steps. Retries at several levels with exponential backoff. Idempotency keys. Single-writer state per entity. The server proxies calls. License: the GitHub API returned NOASSERTION [SC]; treat as [UNV].

**DBOS** [VD]: open-source library, Postgres as the only required store. Workflows and steps are checkpointed to Postgres. After a crash, PENDING workflows resume at the first step without a saved output. Steps must be idempotent. Recovery in distributed setups needs Conductor or a manual process. Stated limit: about 40K workflows or steps per second on one Postgres.

**Inngest AgentKit** [VD]: agents, networks, routers, shared state, tools (with MCP support). It redirected to agentkit.inngest.com. No limits stated. Repo license Apache-2.0 [SC]; last push 2026-04-29, so the project may be quiet [SC].

Novel in durable execution: the journal. Every side effect is written with its result, and recovery skips them. The rule that matters: side effects must be idempotent or placed after the checkpoint.

### 1.3 Microsoft Agent Framework (successor to AutoGen and Semantic Kernel)

- License MIT [SC]. Open issues 847 at read time [SC].
- AutoGen repo says it is in maintenance mode and points to Agent Framework as successor [VD, via search snippet; date of change conflicting across sources, so [UNV]].

| Primitive | What it does | Evidence |
|---|---|---|
| Magentic orchestration | Manager keeps shared context, picks next agent, tracks progress. Built on Magentic-One. Defaults in the example: max rounds 10, max stalls 3, max resets 2. Replan after stalls. Plan review by human optional. | [VD] Magentic page |
| Progress ledger | Per round: is request satisfied, is team in a loop, is progress made, next speaker, instruction. | [VD] Magentic page |
| Plan review HITL | Request/response: manager raises `MagenticPlanReviewRequest`; caller approves or revises. Python default off; .NET default on. | [VD] Magentic page |
| Checkpoints | Saved at end of each superstep: executor state, pending messages, pending requests and responses, shared state. Python 1.13+ adds an entry checkpoint so the whole run replays. Storage: in-memory, file, Cosmos DB. | [VD] checkpoints page |
| Resume | Restore on the same run, or rehydrate into a new workflow. Executor identities must match the checkpoint. | [VD] checkpoints page |
| Security | Python checkpoints use pickle with a restricted unpickler. Storage is treated as trusted infrastructure. | [VD] checkpoints page |
| Custom manager prompts | Customizable. Custom progress prompt must keep the JSON schema. Note: manager shared across workflows is unsafe if stateful. | [VD] Magentic page |

- Novel: checkpoint-per-superstep plus HITL requests as first-class events. The checkpoint rule (executor identity must match) is a real limit: rebuilt workflows break resume if IDs change.
- Limit stated: "it is untested how well Magentic performs outside the original Magentic-One design" [VD].

### 1.4 Google ADK

- Workflow agents: SequentialAgent, ParallelAgent, LoopAgent [VD]. Deterministic, no model needed to route.
- The page says template workflows are superseded in ADK 2.0 by graph-based and dynamic workflows [VD]. The ADK 2.0 graph workflow page was not read, so details of state scoping (session, user, app, temp) and `output_key` / `escalate` are [UNV] here.
- Licence [UNV].

### 1.5 Claude Agent SDK subagents and Claude Code agent teams

Subagents [VD, code.claude.com]:
- Each subagent has a fresh context. It returns only its final message. Tool allowlist and denylist per agent.
- Nesting: up to 3 layers by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`).
- Concurrency: 20 running at once by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`). Calls over the limit return "Concurrent subagent limit reached".
- Spend: `maxBudgetUsd` / `max_budget_usd` stops spawns and ends the query with `error_max_budget_usd`.
- Resume: a subagent can be resumed with its `agentId`, full history kept. Transcripts kept 30 days by default.
- Default: subagents run in the background unless the caller waits.

Agent teams [VD]: experimental, off by default.
- Shared task list, mailbox files, direct teammate messages.
- Limits stated: no session resume for in-process teammates; no nested teams; one team per session; shutdown can be slow; split panes need tmux or iTerm2.
- Token cost scales with teammates (stated as significant).

Relevance: Maestro's engine on claude-code must keep the `claude_code` system preset (see AGENTS.md ExecutionHost rule). The subagent caps are a useful checklist. Agent teams are not a fit for Maestro's single-writer and resume needs, given the resume limit.

### 1.6 CrewAI Flows

- Control: `@start`, `@listen`, `or_` / `and_`, `@router` with labels [VD].
- State: unstructured dict or Pydantic model; each state gets a UUID [VD].
- Persistence: `@persist`, SQLite default, custom backends. `kickoff(inputs={"id": ...})` resumes; `restore_from_state_id` forks [VD].
- Human feedback: `@human_feedback` pauses; with `emit`, an LLM maps feedback to an outcome [VD, requires CrewAI 1.8.0+].
- Limits stated: usage metrics reset per kickoff; combining `restore_from_state_id` with `from_checkpoint` raises; an unmatched restore ID falls back silently; forked runs can share a persistence key [VD].
- User report: hierarchical manager loops and crashes; `agents=[...]` pattern did not work as documented [UR, one forum post, 2025].
- License MIT [UNV].

### 1.7 Mastra

- Steps with input/output schemas; `.then()` chaining; `.commit()` [VD].
- Suspend and resume: a run can end `suspended` with a `suspendPayload`; resume via `resumeStream()` [VD].
- Shared workflow state with `stateSchema`, persisted across suspend and resume [VD].
- Result is a status union: success, failed, suspended, tripwire, paused [VD].
- Parallel, branch, foreach, dowhile: named in the text but not read [UNV].
- Repo license reported as NOASSERTION [SC]; Apache-2.0 for core is [UNV].

### 1.8 Protocols

**A2A (Agent2Agent)** [VD, a2a-protocol.org]:
- Task states: submitted, working, input-required, auth-required, completed, failed, canceled, rejected, unknown.
- Terminal states: completed, failed, canceled, rejected. Terminal tasks take no new messages.
- Message (one turn), Task (stateful unit with server ID), Artifact (output; spec recommends artifacts over messages).
- contextId groups related tasks. Must match taskId if both present.
- Push notifications via webhook, if the agent declares support.
- input-required: client resumes by sending a message with the same taskId and contextId.

**MCP Tasks** [VD, draft spec; extension repo ext-tasks]:
- Server returns a durable handle (`resultType: "task"`) instead of blocking. Client polls `tasks/get`.
- States: working, input_required, completed, failed, cancelled. Terminal states do not change.
- `input_required` carries `inputRequests`; client answers via `tasks/update`.
- Cancel is cooperative.
- Opt-in by both sides via extension negotiation. Client support varies.
- Status: draft / extension. Not stable.

## 2. Primitive map to Orchestra

Verdict key: HAVE, PARTIAL, MISSING, NOT WANTED. "Not found" means not found in the files I read; I did not run an exhaustive grep.

| # | Primitive | Verdict | Orchestra evidence | Notes |
|---|---|---|---|---|
| P1 | Durable state and admission | PARTIAL | AGENTS.md "V2 Session Core": one durable `session_input` row before wake; `packages/core/src/database/schema.gen.ts:659` (table), `packages/core/src/session/input.ts:134,152` (promotion sets `promoted_seq`), `input.ts:247` | Inputs are durable. AGENTS.md states post-crash continuation of provider work needs a separate design. This is the main gap. |
| P2 | Human gate (pause for a human, resume) | HAVE | `modules/maestro/coordination/src/governed-task.ts:25-52` (`verifyGovernedTask`: HOLD on approval missing, ambiguous, stale); `approval.ts:114` (`evaluateReply`), `approval.ts:182` (newest presentation only); `packages/core/src/board/board.ts:1043,1078` (question open/answered) | Gates are durable records, not in-process pauses. So no node-re-run problem. Better fit than LangGraph interrupt for Maestro. |
| P3 | Fan-out and reduce | PARTIAL | `packages/core/src/tool/task.ts:37-43` (task input, `subagent_type`, `task_id` to resume child, line 97-101); `packages/core/src/tool/task-background.ts:7-14` (foreground subagents can be moved to background); `packages/core/src/session/run-coordinator.ts` header (different sessions run concurrently, same session serialized) | No typed map-reduce with reducer. Parallel child Sessions exist. Writes should stay single-threaded (see 06 report). |
| P4 | Loop and stall control | PARTIAL | `packages/core/src/session/runner/max-steps.ts:2` (`DEFAULT_MAX_STEPS = 200` per user input); `packages/core/src/session/runner/llm.ts:240` (step check), `llm.ts:417` (new input resets allowance); `modules/maestro/coordination/src/v2/workflow/host.ts:38-41` (one FIX_FIRST retry) | Hard step cap exists. No progress-ledger stall counter found. |
| P5 | Retry policy by error class | PARTIAL | `host.ts:38-41` (retry budget for review gate); `packages/core/src/tool/task-governance.ts:39` (input fields "decoded on every retry") | No general per-step retry policy with error classes found. |
| P6 | Routing (next agent) | PARTIAL | `modules/maestro/coordination/src/v2/workflow/arm.ts:18` (`relay-arm` capability); `modules/maestro/coordination/src/v2/governance/workflow.ts:12-38` (HOLD codes for nested task refusal, binding mismatch) | Deterministic routing for workflow steps exists. Maestro still picks seats by model judgment. |
| P7 | Time travel / fork from step | MISSING | Not found in files read. Event log exists (`modules/maestro/coordination/src/lifecycle-fold.ts:1-40` folds durable events). | Not needed for Maestro now. The fold is a replay of lifecycle state, not a restart point. |
| P8 | Tracing and audit | HAVE (audit), PARTIAL (tracing) | `packages/core/src/board/board.ts:1019,1087` (before/after audit rows); `board/decision.ts:99-124` (outcome recorded with before/after) | Audit trail is good. Span-style tracing per step not verified. |
| P9 | Eval hooks | PARTIAL | `modules/maestro/coordination/src/verification-plan.ts:38` (`compileVerificationPlan`: deterministic list of checks, SHA and path validated at lines 78-99) | Deterministic checks exist. No LLM-judge or scored eval hook found. |
| P10 | Shared state and ledgers | HAVE | `lifecycle-fold.ts`; `packages/core/src/session/todo.ts` (SessionTodo); `packages/core/src/session/projector.ts` (projected history); relay ledger seq in `packages/core/src/relay-workflow-session.ts:89` | Equivalent to Magentic task and progress ledger in shape. |
| P11 | Concurrency and budget caps | PARTIAL | Step cap only (P4). `packages/core/src/session/run-coordinator.ts` (per-Session serialization) | No concurrent-subagent cap or spend cap found. |
| P12 | Idempotent CAS on state changes | HAVE | `packages/core/src/relay-workflow-session.ts:80-89` (`settle` checks expected `position`, `attempt`, `ledgerSeq`); `relay-workflow-evaluator.ts:134` ("an interrupted earlier stage holds permanently") | Equivalent to Temporal activity idempotency guard for workflow stages. |
| P13 | Task status vocabulary | PARTIAL | Board statuses (`board.ts:464,746`: open, answered, withdrawn, paused, archived) | A2A-style states not used. Only needed for external agent interop. |
| P14 | Replay of provider work after crash | MISSING | AGENTS.md: post-crash continuation recovery requires a separate explicit design; `session/run-coordinator.ts` is process-local | This is the gap every durable framework fills (Temporal, DBOS, Restate, LangGraph checkpointer). |

Summary of gaps: P14 (replay after crash), P4/P5/P11 (stall, retry classes, caps), P9 (eval hooks), P7 (fork from a point, low priority).

## 3. What is genuinely novel, and what to copy

| Framework idea | Copy? | Why |
|---|---|---|
| Magentic task ledger + progress ledger, five loop questions per round | COPY (pattern) | Orchestra has the ledger shape (P10). Add the progress questions and a stall counter. Measured in the 06 report (-31% ablation, P). |
| Stall counter that triggers replan and context reset | COPY (pattern) | Missing today (P4). |
| Journal every side effect, skip recorded steps on recovery (Restate, DBOS, Temporal) | COPY (pattern), design first | This is P14. AGENTS.md says it needs a separate design. Record each provider turn and tool result as an event; on restart, replay from events instead of calling the provider again. |
| Side effects idempotent, or placed after the checkpoint (LangGraph, DBOS, Temporal) | COPY (rule) | Simple rule. Apply to seat tools and board writes. |
| Per-step retry with error classes (LangGraph default skips ValueError/TypeError; HTTP retry on 5xx only) | COPY (rule) | P5 is partial. Retry on transient errors only. |
| Start-to-close timeout and heartbeat for stalled workers (Temporal) | COPY (pattern) | Seats can hang. A heartbeat or timeout per seat run detects it. |
| Checkpoint executor identity must match on resume (MS Agent Framework) | NOTE | Same lesson: seat IDs must be stable across restarts. Orchestra uses stable seat IDs (per the naming rule in AGENTS.md). |
| Interrupt that re-runs the node (LangGraph) | IGNORE | Orchestra's durable HOLD gates (P2) avoid this trap. |
| Send / map-reduce with reducer (LangGraph) | IGNORE for now | Fan-out with single writer is already the Maestro rule (see 06 report). |
| Agent teams with shared task list and mailbox (Claude Code) | IGNORE | Experimental. No resume for in-process teammates. No nested teams. Conflicts with single-writer rule. |
| Subagent caps: depth 3, concurrency 20, spend cap (Claude SDK) | COPY (numbers as reference) | Gives a concrete starting set for Orchestra's own caps (P11). |
| Checkpoint storage as trusted infrastructure, restricted deserialization (MS Agent Framework) | COPY (rule) | Applies if Orchestra persists serialized state. Keep it inside the existing DB and trust model. |
| A2A task states and contextId | IGNORE now, watch | Useful only when a seat talks to an external agent. |
| MCP Tasks (`input_required`, polling) | WATCH | Good for long external jobs. Still a draft extension. Could expose a long job as a task later. |
| Temporal workflow engine as runtime | NOT WANTED | Needs a server, a determinism discipline and a second durable store. Orchestra already has a durable session store. |
| LangGraph as runtime | NOT WANTED | Its own state model and checkpointer would sit beside `SessionRunner`. AGENTS.md forbids a second in-memory tool loop and requires one `llm.stream(request)` per provider turn. |
| Microsoft Agent Framework as runtime | NOT WANTED | Second runtime (.NET and Python). Its Magentic is a pattern we can copy. |
| CrewAI Flows as runtime | NOT WANTED | SQLite default persistence. Forum reports of manager loops [UR]. |
| Mastra / Inngest AgentKit / DBOS as runtime | NOT WANTED | Each would add a second store or runtime. DBOS is closest to our need (Postgres-only durable steps), but Orchestra's store is SQLite-based [UNV for store details]. Study DBOS's recovery rule, do not adopt. |

## 4. Known limits and complaints (by framework)

| Framework | Stated limit | Evidence |
|---|---|---|
| LangGraph | Node re-runs on resume; side effects before interrupt repeat | [VD] |
| LangGraph | Hard cancel loses in-flight writes | [UR] forum |
| LangGraph | Memory saver loses state on restart | [VD] |
| Temporal | Determinism constraint; history size needs continue-as-new | [VD] |
| Temporal | MCP servers not durable inside the OpenAI integration | [VD] |
| MS Agent Framework | Untested outside Magentic-One design | [VD] |
| MS Agent Framework | Executor identity must match on resume | [VD] |
| CrewAI | Hierarchical manager loops until it crashes; documented pattern did not work | [UR] forum, 2025 |
| CrewAI | Restore ID falls back silently; forked runs can share a key | [VD] |
| Claude Code teams | No resume for in-process teammates; no nested teams; experimental | [VD] |
| Claude Code subagents | Token cost scales with subagents; 20 concurrent cap | [VD] |
| DBOS | Recovery across nodes needs Conductor or manual work | [VD] |
| GitHub issues | Not searched successfully for LangGraph, MS Agent Framework, CrewAI | Gap |

## 5. Recommendation

**Build our own lead protocol on Orchestra's runtime. Adopt no framework as the runtime. Copy four patterns.**

Reasons:

1. Orchestra already has the hard parts that the frameworks sell. Durable admission (P1), durable HOLD gates (P2), ledgers (P10), compare-and-set on workflow stages (P12). Adopting a second runtime would duplicate these.
2. AGENTS.md rules rule out most frameworks as a runtime. One `llm.stream` per provider turn. No bridge to another loop. Keep the Session model. LangGraph, CrewAI Flows, Mastra and AgentKit each bring their own loop or state.
3. The real gap is P14 (replay after crash), and every framework that solves it does so with its own store and runtime. Solve it on Orchestra's Session store with the journal pattern. Write that design first, as AGENTS.md requires.
4. Temporal is the strongest durable option. Its cost (server, determinism, second store) is high for one lead agent. Revisit only if Maestro goes multi-node.
5. Owner rule "keep it simple" (memory): a small protocol on existing code beats a framework the team must learn.

Copy list, in order:

1. Journal and replay after crash (Restate/DBOS/Temporal rule). Design doc first. Closes P14.
2. Magentic ledgers with the five questions and a stall counter (P4, P10).
3. Retry only transient errors per stage, with idempotency rule for seat tools (P5).
4. Heartbeat or timeout per seat run (Temporal) and caps from the Claude SDK list (P11).

Watch, do not build now: A2A for external seats; MCP Tasks for long external jobs.

Limits of this research:
- P5, P7, P9, P11 "not found" means not in the files read, not proven absent.
- Google ADK 2.0 graph workflows, Mastra control flow, Restate and Mastra licenses were not confirmed.
- No GitHub issue search succeeded for LangGraph, MS Agent Framework or CrewAI. Complaints above are forum and blog only.

## Sources

Vendor docs [VD]:
- LangGraph persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- LangGraph interrupts: https://docs.langchain.com/oss/python/langgraph/interrupts
- LangGraph graph API (Send, Command, RetryPolicy, CachePolicy): https://docs.langchain.com/oss/python/langgraph/use-graph-api
- Temporal workflows: https://docs.temporal.io/workflows
- Temporal activity failures and timeouts: https://docs.temporal.io/encyclopedia/detecting-activity-failures
- Temporal OpenAI Agents SDK integration: https://docs.temporal.io/develop/python/integrations/openai-agents
- OpenAI Agents SDK tracing: https://openai.github.io/openai-agents-python/tracing/
- Restate durable execution: https://docs.restate.dev/concepts/durable_execution
- Inngest AgentKit: https://agentkit.inngest.com/
- DBOS architecture: https://docs.dbos.dev/architecture
- MS Agent Framework Magentic: https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/magentic
- MS Agent Framework checkpoints: https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints
- Google ADK workflow agents (redirected to adk.dev): https://adk.dev/agents/workflow-agents/
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Agent SDK subagents: https://code.claude.com/docs/en/agent-sdk/subagents
- Claude Code agent teams: https://code.claude.com/docs/en/agent-teams
- CrewAI Flows: https://docs.crewai.com/en/concepts/flows
- Mastra workflows: https://mastra.ai/docs/workflows/overview
- A2A specification: https://a2a-protocol.org/latest/specification/
- MCP Tasks (draft): https://modelcontextprotocol.io/specification/draft/basic/utilities/tasks

Repo metadata [SC]:
- LangGraph repo: https://api.github.com/repos/langchain-ai/langgraph (MIT)
- MS Agent Framework repo: https://api.github.com/repos/microsoft/agent-framework (MIT, 847 open issues)
- Restate repo: https://api.github.com/repos/restatedev/restate (NOASSERTION)
- Mastra repo: https://api.github.com/repos/mastra-ai/mastra (NOASSERTION)
- Inngest AgentKit repo: https://api.github.com/repos/inngest/agent-kit (Apache-2.0, last push 2026-04-29)
- AutoGen repo (maintenance mode note, via search): https://github.com/microsoft/autogen

User reports and blogs [UR] [BO]:
- LangGraph forum, interrupt and cancel: https://forum.langchain.com/t/how-can-i-implement-the-ability-to-interrupt-and-resume-execution-at-any-time/2356 [UR]
- CrewAI forum, hierarchical loops: https://community.crewai.com/t/hierarchical-process-in-crewai-in-2025/4974 [UR]
- Temporal blog on OpenAI Agents partnership (search snippet): https://temporal.io/blog/announcing-openai-agents-sdk-partnership [BO]

Orchestra local sources [SC]:
- AGENTS.md, "V2 Session Core" section (repo instructions)
- `packages/core/src/tool/task.ts`, `task-background.ts`, `task-governance.ts`
- `packages/core/src/session/execution.ts`, `run-coordinator.ts`, `input.ts`, `runner/max-steps.ts`, `runner/llm.ts`, `todo.ts`
- `packages/core/src/relay-workflow-session.ts`, `relay-workflow-evaluator.ts`
- `packages/core/src/board/board.ts`, `board/decision.ts`
- `modules/maestro/coordination/src/governed-task.ts`, `approval.ts`, `lifecycle-fold.ts`, `verification-plan.ts`
- `modules/maestro/coordination/src/v2/workflow/arm.ts`, `host.ts`; `v2/governance/workflow.ts`; `v2/tools/workflows.ts`
- `packages/core/src/database/schema.gen.ts`

Prior report: `docs/specs/maestro-lead/research/06-multi-agent-frameworks.md` (not repeated here).
