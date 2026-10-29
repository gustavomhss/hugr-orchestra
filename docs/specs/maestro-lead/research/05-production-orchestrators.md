# E1: How production coding harnesses implement the lead/orchestrator role

## Scope and date

- Date of research: 2026-10-28.
- Question: how production coding agents implement a lead that delegates to subagents or sessions. Covered: delegation mechanism, the brief the lead writes, the return shape, progress display, parallelism, verification before acceptance, and user-reported failure modes.
- Evidence classes used below: **[VD]** vendor doc (official product docs or vendor engineering post), **[PP]** published system prompt, **[SC]** source code, **[UR]** user report (GitHub or forum issue, review site), **[BO]** blog or third-party opinion, **[SS]** vendor marketing or search-snippet only (page not fetched in full).
- No leaked system prompts were used.
- Caveat: several products (Cursor, Factory, Augment, Copilot's internals, Devin's parallel mechanics) were only partly readable. Gaps are marked.
- Caveat: the Claude Code GitHub issues were read through `claudeissues.com` mirrors, not github.com. Their current status is unverified.

## Per-product findings

### 1. Claude Code (Agent tool, subagents, agent teams, TodoWrite)

| Dimension | Finding | Class | Source |
|---|---|---|---|
| Mechanism | The spawn tool is named **Agent**, renamed from **Task** in v2.1.63; `Task(...)` still works as an alias. Delegation is automatic, matched on each subagent's `description`, or explicit by name. | VD | https://code.claude.com/docs/en/sub-agents |
| Brief | Claude writes the delegation message itself. The subagent starts without conversation history. Rules that must reach the subagent have to be restated in that prompt. The subagent gets its own system prompt, the task message, CLAUDE.md (unless `omitClaudeMd`), a git status snapshot, and preloaded skills. | VD | same |
| Return | The parent gets the subagent's **final report**, not its transcript. Full transcripts are saved to `~/.claude/projects/.../subagents/agent-{id}.jsonl`. Partial output comes back if `maxTurns` is hit or the run ends on an API error. | VD | same |
| Nesting | Subagents can spawn subagents, by default up to 3 layers. `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` changes this; `1` turns nesting off. | VD | same |
| Background | Foreground subagents block the main thread and pass permission prompts through. Background subagents run concurrently; their permission prompts appear in the main session, labeled. Subagents spawned from the main conversation start in the background by default in interactive sessions (fork mode). | VD | same |
| Parallelism | No total cap. Default **20 concurrent**; configurable with `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`. | VD | same |
| Resume | Each invocation is new unless resumed. A completed subagent gets an agent ID; resume via `SendMessage` to its ID or name, keeping full history. Built-in Explore and Plan are one-shot and cannot be resumed. | VD | same |
| When to delegate | Main conversation for frequent back-and-forth, shared context across phases, small targeted changes, or latency-sensitive work. Subagents for verbose output the lead does not need, tool restrictions, or self-contained work returning a summary. "use proactively" in a description encourages delegation. | VD | same |
| Built-ins | Explore (Haiku-based per third-party sources, unverified) and Plan. | BO | https://claudelog.com/mechanics/sub-agents/ |
| Agent teams | Experimental, disabled by default; enabled by `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. One session is the **team lead**; teammates each have their own context and can message each other directly. Shared task list with pending / in progress / completed and dependencies; claiming uses file locking; teammates can self-claim. Mailbox at `~/.claude/teams/{team}/inboxes/`. Idle teammates auto-notify the lead with their final answer. Hooks `TeammateIdle`, `TaskCreated`, `TaskCompleted` can exit 2 to push back. | VD | https://code.claude.com/docs/en/agent-teams |
| Team limits | One team per session; no nested teams; the lead is fixed; in-process teammates do not survive `/resume`; task status can lag; shutdown can be slow. Official guidance: start with 3–5 teammates; 5–6 tasks per teammate; avoid two teammates editing the same file; "Wait for your teammates to complete their tasks" because the lead sometimes starts implementing itself. | VD | same |
| Cost | Teams use "significantly more tokens"; subagent results are summarized back, teammates are full instances. | VD | same |
| Enabling teams changes delegation | With the flag on, a subagent the lead names launches as a teammate, so teams can form without being asked. The docs call this out explicitly. | VD | same |
| Plan approval | A teammate spawned while the lead is in plan mode works read-only and sends a plan approval request; if its mode is unchanged, Claude Code approves automatically without the lead reviewing. | VD | same |
| Messages between agents | Receiving agent is told the message came from another Claude session, not the user; a teammate cannot approve a permission on the user's behalf or relay a denied action to another teammate. | VD | same |
| Progress display | Agent panel in the lead's terminal; Enter opens a teammate's transcript; idle rows hide after 30 s. | VD | same |
| TodoWrite | Not fetched in this pass. Task list is documented as shared-task-list for teams and "Task tools" in the tools reference. | gap | https://code.claude.com/docs/en/tools-reference |
| Background/parallel guidance from Anthropic engineering | See the multi-agent research system post under Cross-product: lead writes objective, output format, tools/sources, and boundaries; spawns 3–5 subagents in parallel; scales effort to query complexity. | VD | https://www.anthropic.com/engineering/multi-agent-research-system |

Failure modes reported by users (all on claudeissues.com mirrors, [UR]):
- Main agent stalls after a subagent completes; the result is not propagated; idle heartbeats arrive but the final report does not. A regression in one build. https://claudeissues.com/issue/70641-bug-main-agent-stalls-after-a-sub-agent-agent-task-tool-completes-result-not-pro
- Task tool has no timeout; orchestrator blocks indefinitely after a subagent finishes. https://claudeissues.com/issue/49150-bug-task-tool-has-no-timeout-subagent-hang-leaves-orchestrator-stuck-indefinitel
- Parallel subagents wedge after finishing and stay alive for hours; a suggested workaround is to read output from the filesystem instead of trusting the report. https://claudeissues.com/issue/65423-bug-parallel-sub-agents-permanently-wedge-after-completing-work-unkillable-ignor
- Subagent returns "Tool result missing due to internal error" and the parent treats it as pending, not failed. https://claudeissues.com/issue/56869-sub-agent-returning-tool-result-missing-due-to-internal-error-silently-hangs-par
- Subagent final assistant message not delivered to parent. https://claudeissues.com/issue/86996-bug-subagent-final-assistant-messages-not-delivered-to-parent-session
- Background-daemon sessions never receive subagent results; parent with `run_in_background: false` blocks. https://claudeissues.com/issue/75035-agent-subagent-results-never-delivered-to-parent-in-background-job-sessions
- Subagent goes idle without its final report reaching the parent. https://claudeissues.com/issue/90093-bug-subagent-goes-idle-without-its-final-report-ever-reaching-the-parent-session
- `classifyHandoffIfNeeded is not defined` crashes on return path; parent gets "failed" status. https://claudeissues.com/issue/24027-subagent-fails-with-classifyhandoffifneeded-is-not-defined-on-task-completion
- Third-party guidance: subagents start with zero context, so a brief missing the objective yields an incomplete summary. https://wmedia.es/en/tips/claude-code-subagent-context-loss [BO]

### 2. OpenAI Codex (CLI / ChatGPT Work) and OpenAI Agents SDK

**Codex subagents** [VD, fetched via redirect to learn.chatgpt.com]:
- Spawn: on an explicit request ("spawn one agent per point"); `AGENTS.md` or skill instructions can also trigger delegation in local Codex. In ChatGPT Work, delegation is explicit except at the highest intelligence level, where it can be proactive.
- The parent orchestrates: spawning, routing follow-ups, waiting, closing threads.
- Results: "Codex waits until all requested results are available, then returns a consolidated response." Each subagent thread can be opened to inspect its full work.
- Brief: the docs suggest the prompt state how to divide work, whether to wait for all agents, and what summary to return. Custom agent files require `name`, `description`, `developer_instructions`.
- Parallelism: `agents.max_concurrent_threads_per_session` caps open spawned threads; default chosen by Codex.
- Depth: not stated.
- Sandbox: subagents inherit the parent turn's sandbox and approval settings. A custom agent file cannot override `sandbox_mode`, `approval_policy`, `model_provider`, or `mcp_servers`. Telling an agent not to edit does not make it read-only.
- Caveats in docs: more tokens; parallel write-heavy work conflicts, so parallelism is recommended mainly for read-heavy work; in non-interactive runs, an action needing new approval fails and the error goes back to the parent; the web sidebar is read-only, and stopping or steering a subagent is done by asking Codex.
- Source: https://learn.chatgpt.com/docs/agent-configuration/subagents (fetched after redirect from https://developers.openai.com/codex/subagents)

**Agents SDK** [VD, fetched]:
- Two patterns. **Handoffs**: control moves to a specialist who owns the reply for that branch. **Agents as tools (manager pattern)**: the main agent keeps ownership of the final answer and calls specialists as helpers; specialist output returns to the manager, which writes the reply.
- The doc recommends starting with one agent and adding specialists only for capability isolation, policy isolation, prompt clarity, or trace legibility.
- Source: https://developers.openai.com/api/docs/guides/agents/orchestration

Known user report on the SDK [UR, forum]: a manager that uses handoffs stops after the first handoff returns and needs a re-prompt. https://community.openai.com/t/agents-sdk-looping-handoffs/1256231

### 3. Devin (managed Devins, playbooks)

- Mechanism [VD]: a coordinating session scopes the work, groups files into independent packages, and launches one child session per package, each in its own isolated VM. Auto-approve of child sessions is on by default; it can be turned off to review each batch before launch. Source: https://docs.devin.ai/work-with-devin/advanced-capabilities
- Brief [VD]: the coordinator gives each child a prompt, optional playbook, tags, and an ACU limit. It can send follow-up messages to running children.
- Return and wake [VD]: the coordinator is notified when a child finishes or needs input and is woken automatically; no polling required.
- Progress [VD]: ACU consumption per child; pause or terminate stuck children; schedule self-messages to check back; MCP tools can wait for a set of parallel sessions to finish in one call.
- Verification [VD]: the doc describes the coordinator "compiles results" and does not describe a separate verification step.
- Playbooks [VD]: reusable runbooks, can be created, updated and deleted through the Devin MCP, and can carry automation macros. Successful sessions can be turned into playbooks.
- Limits [VD]: no maximum child count stated; per-child ACU limit but no overall budget cap stated. For fan-out with a combine step, or stages that depend on earlier results, the doc recommends a "dynamic workflow" (recorded, resumable script).
- User reports [UR, weak]: a G2 reviewer reports five parallel sessions as a productivity gain. Aggregator sites mention drift in long sessions and overreaching changes that need review. https://www.g2.com/products/devin-ai/reviews ; https://www.rfp.wiki/artificial-intelligence/devin-ai. No forum threads on parallel failures were found in this pass.

### 4. Cursor (cloud / background agents)

- Official help page (search snippet) [VD/SS]: each cloud agent gets a dedicated VM with the repo, dependencies, secrets and network access; it works on its own branch and opens a PR; it can attach videos, screenshots and logs so the human can validate without checking out. Source: https://cursor.com/help/ai-features/background-agents.md (not fetched in full; the docs landing page fetch did not reach the agents section).
- Parallelism [BO]: multiple at once; one directory entry says up to 8, unverified. https://enterprisedna.co/directories/agents/cursor-background-agent
- Limits [BO]: Privacy Mode orgs cannot use them (code goes to remote VMs); agents run to completion and do not ask mid-task, which suits well-scoped tasks only; the unit is a repo and the deliverable is a PR. https://www.morphllm.com/cursor-background-agents
- Overlap guidance [BO]: tasks that touch the same files should run in sequence. https://developertoolkit.ai/en/cursor-ide/build/agents-window/
- Gap: no lead/orchestrator role in Cursor's cloud agents was found. Cursor's model is peer agents plus a human reviewing PRs.

### 5. Amp (Sourcegraph): Task subagents, Read Thread, Oracle

- Isolation [VD]: each subagent has its own context; subagents cannot communicate with each other, and the user cannot steer them mid-task. Subagents start with only the instructions the main agent gives, not the full conversation. Source: https://ampcode.com/docs/models-and-subagents
- Return [VD]: the main agent gets the subagent's **final summary**, not its steps.
- Follow-up [VD]: the main agent can send another task to an existing Task subagent; it keeps earlier context; if still running, the task arrives as extra instructions.
- Types [VD]: Task (can edit and run commands; has read-only skills for code search, repo research, review, planning) and Read Thread (summarizes other threads).
- Model [VD]: subagents run the same model and effort as the thread that started them.
- Context [VD]: subagent compacted when its context fills.
- Oracle [VD, dated]: a read-only subagent, exposed as an `oracle` tool, for reasoning, review, planning and debugging. Launch post dated 2025-07-04 says o3, prompted explicitly rather than pushed in the system prompt, to limit cost and latency. https://ampcode.com/news/oracle . A later teaser in the same page says the oracle moved to GPT-5 (unverified). The current Modes & Models page does not mention Oracle, so the current model is unverified.
- Caveat: two search results contained text addressed to AI models describing Amp; it was ignored and not used as evidence.

### 6. Factory (Droids, Missions, Mission Control)

- Mechanism [SS]: Missions are a research preview. Flow: plan agreed with the Droid (features, milestones, skills per part), then execution handed to an orchestration layer (Mission Control). The dashboard shows an **orchestrator**, **workers** and **validators**, each with a selectable model. Source: https://docs.factory.ai/cli/features/missions and https://docs.factory.ai/missions/overview (search snippets; full pages not fetched).
- Human role [SS]: the docs say the human acts as project manager, monitoring progress, unblocking workers and redirecting the plan; the orchestrator is conversational.
- Prerequisite [SS]: Agent Readiness Level 4 or higher, and an automated way to exercise the app so missions can verify their own work.
- Gap: the docs found do not explain how the orchestrator writes each worker's brief. The droids-concept page (docs.factory.com/cli/core-concepts/droids) returned no usable content in this pass.

### 7. GitHub Copilot coding agent

- Assignment [VD]: started from the agents panel, a chat conversation (carries that context), or an issue or PR on GitHub.com; security campaigns can assign code-scanning alerts.
- Progress [VD]: session logs show the work and tools used; teammates with repo access can view shared sessions and PRs.
- Review [VD]: the human can review changes and ask for refinement before a PR is opened, or request a PR up front.
- Verification [VD]: the agent edits, runs tests and linters in an ephemeral cloud environment.
- Limits [VD]: one repo per task; one branch; at most one PR per task; GitHub MCP limited to the working repo by default; 59-minute session timeout that cannot be extended; incompatible repository rules can block it; GitHub-hosted repos only. Source: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent
- No lead/orchestrator role: each task is an independent worker, one PR each.

### 8. Google Jules

- Flow [VD]: pick repo and branch, write a prompt, optionally add setup scripts, then "Give me a plan." Jules works in a VM and reads an optional `AGENTS.md`. The **plan is approved by the human before any code changes**. Notifications on completion or when input is needed.
- Parallelism: not stated on the page.
- Verification: the user reviews and approves the plan, then reviews code (separate guides not read).
- Limits: described as "an experimental coding agent"; output depends on a clear prompt. Source: https://jules.google/docs (fetched; cited page is the product docs root as fetched).
- No lead/orchestrator role described.

### 9. Augment Intent

- Coordinator [SS, vendor marketing]: analyzes the codebase, drafts a **living spec**, generates tasks for specialist agents; each specialist runs in parallel in its own context; the spec is updated as work completes and changes propagate to active agents. Roles listed: Investigate, Implement, Verify, Critique, Debug, Code Review. Each prompt creates a Space with its own git branch and worktree. Research Preview; supports bring-your-own agents including Claude Code and Codex. Sources: https://www.augmentcode.com/product/intent , https://docs.augmentcode.com/intent (404 when fetched; search snippets only).
- Independent reviews: none found. One Product Hunt commenter observed that Claude's own orchestrator works similarly. https://www.producthunt.com/p/augment-code/intent-by-augment-code-is-spec-driven-multi-agent-development-the-next-step-after-the-ide

### 10. Roo Code (Boomerang Tasks / Orchestrator mode) and Kilo Code

Roo Code [VD, fetched via the redirected URL]:
- Mechanism: the built-in Orchestrator delegates each subtask with `new_task`, setting `mode` and `message`. The orchestrator itself cannot read or write files, call MCP tools, or run commands by default, to keep its context on coordination.
- Brief: subtasks do not inherit parent context. The docs' example custom prompt asks the orchestrator to include the context the subtask needs, a clearly defined scope, a statement that the subtask should do only that work, and an instruction to finish with `attempt_completion` and a summary in `result`. It also says these orchestrator instructions override conflicting mode instructions.
- Return: only the `result` summary returns to the parent. The docs say the parent should work from summaries; subtasks keep their own conversation history.
- Approval: by default, the human must approve creation and completion of each subtask; auto-approval can be turned on.
- Source: https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks (redirected from docs.roocode.com).

Kilo Code [VD, search snippet]: the Orchestrator mode is **deprecated** in the current Kilo docs and is scheduled for removal. Delegation is now handled by the Code, Plan and Debug agents; read-only agents such as Ask cannot delegate. The older flow was: parent pauses, subtask runs in another mode, parent resumes with only the subtask summary. Source: https://kilo.ai/docs/code-with-ai/agents/orchestrator-mode (search snippet). This is itself evidence that a dedicated orchestrator mode was judged unnecessary by its own vendor.

### Summary table for the seven core questions

| Product | Delegation mechanism | Brief the lead writes | Return shape | Progress shown | Parallelism | Verification before accept |
|---|---|---|---|---|---|---|
| Claude Code subagents | Agent tool, auto by description or by name | Full prompt; no history inherited | Final report only; transcript on disk | Background labels, transcript files | 20 default, env-configurable | None built in; lead reads report |
| Claude Code teams | Named teammates, shared task list | Spawn prompt, role | Idle notice with final answer; mailbox messages | Agent panel; task list | Team of 3–5 recommended | Hooks TaskCompleted, TeammateIdle can reject |
| Codex | Explicit spawn request or AGENTS.md | Division of work, wait flag, summary spec | Consolidated when all done | Thread view; sidebar read-only | max_concurrent_threads setting | Not described |
| Agents SDK | Handoff or agent-as-tool | Agent instructions | Tool output to manager | Traces | Not specified | Guardrails (per docs) |
| Devin | Coordinator spawns child sessions | Prompt, playbook, tags, ACU cap | Child notifies coordinator; coordinator compiles | ACU per child; wait-for-set call | Not capped in doc | Not described |
| Cursor cloud | Start from UI or API per repo | Task prompt | Branch and PR | Agents window | Unverified, up to 8 claimed | Human reviews PR |
| Amp | Task subagent auto or explicit | Instructions passed by main agent | Final summary | Thread steps | Not stated | Main agent reads summary; Oracle review on request |
| Factory Missions | Orchestrator plans, workers execute | Plan with milestones; unverified | Via Mission Control | Mission Control dashboard | Not stated | Validators role |
| Copilot agent | Assign issue or chat | Issue or chat context | PR | Session logs | One task, one PR | Tests and linters in its VM; human review |
| Jules | Prompt then plan | Prompt plus AGENTS.md | Plan then code | Notifications | Not stated | Human approves plan before code |
| Augment Intent | Coordinator spec to tasks | Living spec | Spec updated | Spec and Space view | Parallel specialists | Verify and Critique specialist roles (vendor claim) |
| Roo Boomerang | new_task with mode and message | Context, scope, finish-with-summary | `result` summary | Per-subtask approval | Not stated | Human approves creation and completion |
| Kilo | Deprecated orchestrator, now Code/Plan/Debug delegation | as Roo | summary | | | |

## Cross-product patterns (what most converge on)

1. **Fresh-context workers with a one-way brief.** Every product that spawns workers says they start without the lead's history (Claude Code, Amp, Roo, Devin child prompts, Codex custom agents). The lead's brief is the only channel. Converged: the brief must carry the objective, scope and the context needed. Anthropic's own guidance names four parts: objective, output format, tools and sources, task boundaries [VD].
2. **Return is a summary, not the transcript.** Claude Code, Amp, Roo (`result`), Codex (consolidated response) and Devin (child compile) all return a condensed result to the parent. Full transcripts are kept separately for inspection (Claude Code JSONL, Codex thread view, Devin session view). The lead does not see the work, only the report, which is the source of the verification gap below.
3. **Parallelism is for independent, read-heavy work.** Codex says parallel write-heavy work conflicts; Claude Code says avoid same-file edits and keep to 3–5 teammates; Cursor says sequence same-file tasks; Anthropic's research system spawns 3–5 in parallel for research. Converged: parallel fan-out for research and review, serialization or file-ownership for implementation.
4. **Human gates are attached to plans or to spawning.** Jules approves a plan before code; Roo approves subtask creation and completion; Devin can disable auto-approve of child batches; Claude Code's plan mode for teammates. Converged: the human gate sits before execution (plan) or at spawn, not only at merge.
5. **Subagents cannot talk to each other except through the lead or a shared list.** Amp and Claude Code subagents say so explicitly. Agent teams (Claude Code) and Augment's shared spec are the exceptions; both are newer and experimental.
6. **Read-only or narrowed-tool orchestrators.** Roo's orchestrator cannot read or write files; Augment and Factory separate planning, implementation and validation roles; Codex prohibits custom agents from overriding parent sandbox. Converged: the coordinator's tool set is kept small, and verification is a distinct role.
7. **Verification is delegated to a separate role, or to tests and PRs, not to the lead's reading.** Factory has validator agents; Augment has Verify and Critique roles; Claude Code has TaskCompleted and TeammateIdle hooks; Copilot and Cursor rely on the PR and human review; Anthropic's research system uses a separate CitationAgent and an LLM judge against a rubric. None of the products fetched describes the lead itself verifying worker output in detail; the docs describe synthesis and notification, not inspection.
8. **Progress is a status panel plus push notification, not polling.** Devin wakes the coordinator on child completion; Claude Code auto-delivers teammate messages and idle notices; Jules and Copilot notify. Shared task lists with pending / in progress / completed and dependencies appear in Claude Code teams and Devin's wait call.
9. **Cost is acknowledged and scales with agents.** Anthropic reports about 4x tokens for agents and about 15x for multi-agent systems [VD]. Claude Code, Codex and Devin all warn about token use. Anthropic notes the pattern suits high-value tasks.
10. **Convergence on "keep the orchestrator thin".** Kilo deprecated its orchestrator mode in favor of task-specific agents; OpenAI recommends starting with one agent and adding specialists only for isolation or legibility; Roo warns against giving the orchestrator capabilities that poison its context.

## Failure modes

Grouped by class. Evidence class noted.

### A. Result propagation (lead never gets the answer)

- Subagent final report not delivered; parent stalls or waits indefinitely. Multiple Claude Code issues across versions [UR] (see Per-product list).
- Background/daemon sessions never receive results [UR].
- Crash on the return path yields a "failed" status with no result [UR].
- No timeout on the delegate call [UR].
- Mitigation users found: read the subagent transcript or filesystem output directly instead of trusting the report [UR].

### B. Thin or wrong brief

- Subagents start with zero context; a brief missing the objective yields an incomplete summary [BO, VD-consistent].
- Vague briefs cause duplicated searches and coverage gaps [VD, Anthropic research system].
- Orchestrator splits a dependency chain into parallel subtasks, and the shared foundation lives in one subagent while the others never get it [academic, arXiv 2607.28802 taxonomy; via search snippet].

### C. Orchestrator trusts subagent output

- In hierarchical coding, the orchestrator accepted flawed sub-agent outputs (incomplete span identification) as ground truth with no validation step [academic, BOAD arXiv 2512.23631; search snippet, not read in full].
- The ICLR 2025 failure taxonomy (150+ tasks, five MAS, 18 failure modes) lists weak verification and quality control as a top-level category [academic; https://iclr.cc/virtual/2025/33314 ; search snippet].

### D. Over-delegation and wasted effort

- Spawning many subagents for simple queries; endless searching for nonexistent sources; continuing after results were sufficient; excess status updates distracting peers [VD, Anthropic research system].
- Claude Code teams: lead starts implementing itself instead of waiting; too few tasks per teammate; lead stops early and declares the team done [VD].

### E. Concurrency and conflicts

- Parallel write-heavy agents conflict on the same files [VD, Codex; VD, Claude Code; BO, Cursor].
- Practitioner reports of diffs that compile alone and break together [BO]. A dataset claim of ~28% PR conflict rate (AgenticFlict) and a 30% success drop from CooperBench appear only in a secondary blog; not verified against the papers. https://codex.danielvaughan.com/2026/06/06/multi-agent-coordination-problem-concurrent-agents-semantic-conflicts-codex-cli/ [BO, unverified numbers].
- Approval and sandbox: in non-interactive flows, subagent actions that need approval fail and the error returns to the parent [VD, Codex].

### F. Opaque progress and stuck workers

- Subagents wedged for hours after completing work [UR, Claude Code].
- Idle Claude Code teammate rows hide from the agent panel after 30 s (they stay addressable and reappear on their next turn), so a quiet worker is easy to lose sight of [VD, Claude Code agent teams].
- Codex's sidebar is read-only; to steer a subagent the user must ask the parent [VD].

### G. Platform-level and session-level

- Agent teams do not survive `/resume` for in-process teammates [VD].
- Copilot sessions time out at 59 minutes, not extendable [VD].
- Devin: drift in long sessions and overreaching changes reported on aggregators [UR, weak].
- Subagent-specific mode or model drift: Claude Code teammates' model is fixed at spawn [VD].

## Implications for an orchestrator that must not plan or research itself

These follow from the convergence above. Each is grounded in a source; none is a recommendation to adopt a specific design yet.

1. **Keep the coordinator's tool set narrow.** Roo's default orchestrator cannot read files, call MCP, or run commands; the docs call this an anti-context-poisoning measure [VD]. Anthropic's research system uses a lead that synthesizes, not researches [VD]. A Maestro that must not research should have no read or search tools beyond what it needs to track state.
2. **The brief is the whole contract, so template it.** Every product passes only the brief across. Anthropic's four parts (objective, output format, tools and sources, boundaries) plus Roo's explicit "finish by calling the completion tool with a summary" and Codex's "how to divide the work, whether to wait, what to return" give a checklist that a lead can fill mechanically. Missing context is the most common cause of thin results [VD + BO].
3. **Require a structured return, and validate it before acceptance.** Results that return as free text are the source of the stalled and wrong-acceptance modes. Devin and Copilot return via a PR or child-session completion; Claude Code returns a final message. The lead should refuse to accept a return that lacks the agreed output format, and should inspect the artifact (diff, test output, transcript path) rather than the summary alone. Users' workaround of reading the transcript or filesystem [UR, Claude Code] supports checking the artifact.
4. **Separate the verifier from the producer.** Factory's validators, Augment's Verify and Critique roles, Claude Code's TaskCompleted hook, and Anthropic's CitationAgent all put verification outside the worker that produced the output. An orchestrator that does not plan or research is especially exposed to the "orchestrator trusts subagent output" failure, because it has nothing else to check against. The verifier should be a delegated role, not the orchestrator reading a summary.
5. **Use push notification and a status surface, and set timeouts.** Devin wakes the coordinator on child completion; Claude Code auto-delivers idle notices. Users report indefinite waits when no timeout exists [UR]. Any delegation should carry a deadline and a "still working / idle / failed / done" state the lead can read without polling.
6. **Serialize or own files.** Parallel implementation needs disjoint file ownership or sequencing. Claude Code (avoid same-file edits), Codex (parallelism mainly for read-heavy), Cursor (same-file tasks in sequence) agree. Parallel research and review fan-out is the proven case.
7. **Put the human gate on the plan, not only on the merge.** Jules and Roo gate the plan or the subtask creation; Devin lets the human turn off auto-approve for child batches; Claude Code teammates can be held in plan mode. For a Maestro that reports to the owner, the plan or spawn batch is the natural approval point, which keeps the owner informed without a status wall.
8. **Delegation depth should be capped by configuration.** Claude Code caps nesting at 3 by default and lets the user set it to 1; Codex does not state a depth limit. A conductor that must not do the work itself benefits from depth 1 (lead to workers, no grandchildren) unless a worker needs its own team.
9. **Budget by token cost, and say so.** Anthropic's figures (about 4x for agents, 15x for multi-agent) and the product warnings mean fan-out must be justified by value. Devin's per-child ACU cap is the only per-child budget found; no product stated a global budget cap that a lead can read.
10. **Plan for a worker that never returns.** Given the wedge and stall reports, the lead needs a rule for a delegate that is idle with no result: read its output artifact, then either resume it with a message (Claude Code, Amp, Codex allow this) or spawn a replacement with the same brief plus what was learned. Claude Code's docs recommend exactly this recovery [VD].
11. **Do not reuse the orchestrator-mode design as is.** Kilo deprecated its mode, and Roo's built-in version exists mainly because of context limits in IDE chat. Products now move to a plain agent with task-specific subagents. The lesson for Maestro is the mechanics (brief, summary return, approval), not the mode as a separate product role.

## Sources

Vendor docs (VD):
- Claude Code subagents: https://code.claude.com/docs/en/sub-agents
- Claude Code agent teams: https://code.claude.com/docs/en/agent-teams
- Claude Code glossary (agent teams flag): https://code.claude.com/docs/en/glossary
- Anthropic, How we built our multi-agent research system: https://www.anthropic.com/engineering/multi-agent-research-system
- OpenAI Codex subagents (via redirect): https://learn.chatgpt.com/docs/agent-configuration/subagents (originally https://developers.openai.com/codex/subagents)
- OpenAI Agents SDK orchestration: https://developers.openai.com/api/docs/guides/agents/orchestration
- Devin advanced capabilities: https://docs.devin.ai/work-with-devin/advanced-capabilities
- Amp Modes and subagents: https://ampcode.com/docs/models-and-subagents
- Amp Oracle launch post (2025-07-04): https://ampcode.com/news/oracle
- Roo Code Boomerang Tasks (via redirect): https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks (originally https://docs.roocode.com/features/boomerang-tasks)
- GitHub Copilot cloud agent: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent
- Google Jules docs: https://jules.google/docs
- Cursor background/cloud agents help (search snippet): https://cursor.com/help/ai-features/background-agents.md

Vendor marketing / search snippet (SS):
- Factory Missions: https://docs.factory.ai/cli/features/missions ; https://docs.factory.ai/missions/overview
- Augment Intent: https://www.augmentcode.com/product/intent ; https://docs.augmentcode.com/intent (404 on fetch)
- Kilo Code orchestrator mode (deprecated): https://kilo.ai/docs/code-with-ai/agents/orchestrator-mode

Published system prompts (PP): none used.

User reports (UR):
- https://claudeissues.com/issue/70641-bug-main-agent-stalls-after-a-sub-agent-agent-task-tool-completes-result-not-pro
- https://claudeissues.com/issue/49150-bug-task-tool-has-no-timeout-subagent-hang-leaves-orchestrator-stuck-indefinitel
- https://claudeissues.com/issue/65423-bug-parallel-sub-agents-permanently-wedge-after-completing-work-unkillable-ignor
- https://claudeissues.com/issue/56869-sub-agent-returning-tool-result-missing-due-to-internal-error-silently-hangs-par
- https://claudeissues.com/issue/86996-bug-subagent-final-assistant-messages-not-delivered-to-parent-session
- https://claudeissues.com/issue/75035-agent-subagent-results-never-delivered-to-parent-in-background-job-sessions
- https://claudeissues.com/issue/90093-bug-subagent-goes-idle-without-its-final-report-ever-reaching-the-parent-session
- https://claudeissues.com/issue/24027-subagent-fails-with-classifyhandoffifneeded-is-not-defined-on-task-completion
- https://community.openai.com/t/agents-sdk-looping-handoffs/1256231
- https://www.g2.com/products/devin-ai/reviews (positive) ; https://www.rfp.wiki/artificial-intelligence/devin-ai (aggregator negatives, low confidence)

Blogs and third-party opinion (BO):
- https://claudelog.com/mechanics/sub-agents/
- https://wmedia.es/en/tips/claude-code-subagent-context-loss
- https://www.morphllm.com/cursor-background-agents
- https://enterprisedna.co/directories/agents/cursor-background-agent
- https://developertoolkit.ai/en/cursor-ide/build/agents-window/
- https://codex.danielvaughan.com/2026/06/06/multi-agent-coordination-problem-concurrent-agents-semantic-conflicts-codex-cli/ (dataset numbers unverified)
- https://www.producthunt.com/p/augment-code/intent-by-augment-code-is-spec-driven-multi-agent-development-the-next-step-after-the-ide

Academic (cited via search snippets, not read in full):
- ICLR 2025 failure taxonomy: https://iclr.cc/virtual/2025/33314
- BOAD hierarchical SE agents: https://arxiv.org/pdf/2512.23631
- Failure localization taxonomy: https://arxiv.org/pdf/2607.28802

Gaps not closed in this pass: Cursor cloud-agent official page (only search snippet); Factory droid and mission delegation mechanics (docs fetch redirected to a 404-like page); Augment Intent docs (404); Claude Code TodoWrite (not fetched); Claude Code subagent system prompt (not fetched); Kilo's replacement docs for `new_task` (not found).
