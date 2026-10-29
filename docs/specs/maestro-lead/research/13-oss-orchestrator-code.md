# 13. Open-source orchestrators, read in code

Date: 2026-10-28. This pass read source, not docs. Each repository was shallow-cloned (`--depth 1`) and treated as untrusted data: no code was run, installed or built. The clones were deleted when the pass finished.

Paths are relative to each repository root at the SHA listed. Quotes are verbatim and under 15 words each; everything else is paraphrase. Anything not read in source is marked **NOT READ**.

| Target | Repository | SHA |
|---|---|---|
| 1a | microsoft/autogen | `004749e6b7102c8fd317b9b1499ce5807223c278` |
| 1b | microsoft/agent-framework | `49b715debe379b65c636255a7e10e89efbee765f` |
| 2 | RooCodeInc/Roo-Code | `b867ec9145750d0ae1ff7f02d35406e9bf2a0b16` |
| 3a | OpenHands/OpenHands, tag 1.0.0 (legacy V0 controller) | `0cb27a4aa8c2656c37c00a8d52ad574c1c21649b` |
| 3b | OpenHands/software-agent-sdk | `02fa855d97bf0bfe5ca14d22bf380d8cce86d142` |
| 4 | openai/codex | `ce2d47bdc4dd2513d5b3567090593b07b0fdfa0a` |
| 5 | crewAIInc/crewAI | `b95aa8bbdea6bc02b465a35fa8da54fecf82f528` |
| 6a | langchain-ai/langgraph-supervisor-py | `88859b34017ac3569bbd4a3092c7e77593a0a960` |
| 6b | langchain-ai/langgraph-swarm-py | `5442a15cdd0ed210589148900c9960c24c489d04` |
| 7 | google/adk-python | `ebec2c83bb2e0a19163ae92371854f682cc8ce2a` |
| 8 | block/goose (now redirects to aaif-goose/goose) | `ee8500d5e060eea6f2bcee92e8a5e351f12c3a70` |
| 9a | cline/cline | `f817e59f698f01487920c00ede2dbecad5c0fa50` |
| 9b | Kilo-Org/kilocode | `bf30ceb00b9dfc47ebf6c645ee3f7960e581441b` |
| 10a | anthropics/claude-agent-sdk-python | `2d485201617258867dd0f74b9e7307056f5938fe` |
| 10b | anthropics/claude-code | `58d6da1e34d6cd1c6379dcbf568bd66f5f9b6102` |

The OpenHands main branch (`e4765e2c5b31`) now holds only the "Agent Canvas" frontend, with no agent code. The agent logic was read in the SDK and in the 1.0.0 tag instead.

---

## 1a. AutoGen Magentic-One

Paths are under `python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_magentic_one/`.

**Delegation contract.** The orchestrator keeps two ledgers.

- **Task ledger.** The facts prompt (`_prompts.py:6-27`) sorts what is known under four headings: given or verified facts, facts to look up, facts to derive, and educated guesses. The plan prompt (`_prompts.py:30-34`) asks for a short bullet plan and says not every team member has to be involved. The full ledger (`_prompts.py:37-56`) combines the task, the team and the plan.
- **Progress ledger.** On each step the orchestrator answers five questions as JSON, each with `{reason, answer}` (`_prompts.py:59-100`): `is_request_satisfied`, `is_in_loop`, `is_progress_being_made`, `next_speaker` and `instruction_or_question`. The worker receives only `instruction_or_question`, which is broadcast into the shared thread.

**Return shape.** The worker posts free text to the shared group thread. The orchestrator re-reads the whole thread on every step.

**Stall rule** (`_magentic_one_orchestrator.py:393-405`):

- A step adds one stall when there is no progress or when it is in a loop. Otherwise the count drops by one, but not below zero.
- When `n_stalls >= max_stalls`, the orchestrator rewrites the task ledger and re-enters the outer loop.
- The loop question is a judgment call by the model: "Are we in a loop where we are repeating the same requests" (`_prompts.py`). The progress prompt counts an inability to read a required file as a barrier.
- Defaults are `max_turns=20` and `max_stalls=3` (`_magentic_one_group_chat.py:117-120`).

**Replanning.** The outer loop is `_reenter_outer_loop` (`_magentic_one_orchestrator.py:262-298`).

- It sends `GroupChatReset` to every participant, clears the thread and rebroadcasts the new ledger.
- The facts-update prompt requires at least one updated guess (`_prompts.py:121-130`).
- The plan-update prompt asks for an explanation of what went wrong and its root cause, then a new plan that avoids repeating those mistakes (`_prompts.py:133-136`).

**Verification.** There is none beyond the model judging `is_request_satisfied`. Worker claims are trusted.

**Report to the human.** The final-answer prompt (`_prompts.py:139-149`) asks for an answer "phrased as if you were speaking to the user". Once `n_rounds > max_turns`, the final answer says "Max rounds reached."

**Decision asks.** None. The loop has no path that pauses for the human.

**Limits.**

- The JSON parse of the ledger is retried up to `max_json_retries=10` (`_magentic_one_orchestrator.py:94`).
- In a single-agent team, `next_speaker` is set in code rather than by the model.
- Defect: an invalid `next_speaker` sets `key_error` and breaks out of the retry loop, so it raises `ValueError` on the spot instead of retrying.

## 1b. Microsoft Agent Framework Magentic

File: `python/packages/orchestrations/agent_framework_orchestrations/_magentic.py`.

It uses the same prompts as AutoGen, reformatted (lines 110-260).

**State.** `MagenticContext` holds `stall_count` and `reset_count`; `reset()` zeroes the stalls and adds one reset (388-396). Manager defaults are `max_stall_count=3`, with `max_reset_count` and `max_round_count` set to `None` (489-498, 558-560).

**Inner loop** (1103-1190):

- If creating the progress ledger throws, the loop resets and replans.
- The stall test is a strict `stall_count > max_stall_count`, where AutoGen uses `>=`. With the default of 3, the replan therefore happens on the fourth stall.
- A `next_speaker` that is not a string falls back to the first participant.
- A speaker name that does not exist ends the run with a final answer.

**Reset** (`_reset_and_replan`, 1192-1228). It sends `MagenticResetSignal` to every participant, then replans.

**Decision asks: human plan review** (839-891, 1030-1091).

- With `require_plan_signoff` on, the plan is sent to the human as `MagenticPlanReviewRequest` through `ctx.request_info`.
- The response is `MagenticPlanReviewResponse`, with either `approve()` or `revise(feedback)`.
- A replan after a stall goes to the human again, with `is_stalled=True`. This is the one target that brings the human in exactly at the stall.

**Limits.** `_check_within_limits_or_complete` (1265-1300) ends the run with "Workflow terminated due to reaching maximum {round|reset} count." Checkpoints are saved and restored at 1310-1330. The loop emits `PROGRESS_LEDGER_UPDATED` and `REPLANNED` events.

**Verification.** Same as AutoGen: the model judges the result. Worker claims are trusted.

## 2. Roo Code Orchestrator

**Mode** (`packages/types/src/mode.ts:216`). The orchestrator mode has `groups: []`, which means it has no tools of its own: no read, edit or command. Its custom instructions require every `new_task` message to include:

- all the context the subtask needs, and a clearly defined scope;
- a statement that the subtask does only the work outlined;
- an instruction to finish with `attempt_completion`, whose summary is the source of truth for tracking;
- a statement that these instructions override the subtask mode's own general instructions.

The orchestrator is also told to track subtasks, synthesize the results at the end, and ask clarifying questions.

**Delegation contract** (`src/core/prompts/tools/native-tools/new_task.ts`). The tool takes `mode`, `message` and `todos` (a markdown checklist), and must be called alone.

`src/core/tools/NewTaskTool.ts:40-125`:

1. Validates `todos`, which is required when the `newTaskRequireTodos` setting is on.
2. Checks that the mode exists.
3. Asks the user to approve.
4. Calls `delegateParentAndOpenChild`, which returns "Delegated to child task {id}".

**Return shape (the boomerang).**

- `attempt_completion` takes a single `result`. The tool text says the result must be final and must not need further input, and that the tool may be used only after earlier tool uses are confirmed (`native-tools/attempt_completion.ts`).
- `AttemptCompletionTool.ts:155-180` (`delegateToParent`) asks the user to approve finishing the subtask, then calls `reopenParentFromDelegation`.
- `ClineProvider.ts:2918-3010` adds a `subtask_result` message to the UI. It then injects a `tool_result` tied to the `new_task` tool-use id: "Subtask {id} completed.\n\nResult:\n{summary}".

**Verification.** None. The parent receives only the child's own summary.

**Stall and loop rule.**

- `src/core/tools/ToolRepetitionDetector.ts` compares tool calls as canonical JSON, with a default limit of 3. The counter starts at 0, so the fourth identical consecutive call is blocked with `mistake_limit_reached`, which asks the user.
- The detector is built from `consecutiveMistakeLimit` at `Task.ts:513`, and the mistake limit is checked at `Task.ts:2483`.
- `DEFAULT_CONSECUTIVE_MISTAKE_LIMIT = 3` (`packages/types/src/provider-settings.ts:29`).

**Decision asks.** Mostly approval prompts at launch and at finish. A completion that was not delegated shows the result to the user as `completion_result`; any feedback goes back to the model as `<user_message>`.

**Limits.** Concurrency is one: the child becomes the only active task and the parent is disposed (`ClineProvider.ts:2783`). Depth is unbounded by design, since a child can itself delegate.

## 3a. OpenHands legacy V0 (tag 1.0.0)

**Delegation contract.** `AgentDelegateAction{agent, inputs: dict, thought}` (`openhands/events/action/agent.py:77`).

In `openhands/controller/agent_controller.py`:

- `start_delegate` (724) sets `delegate_level+1` and gives the child the same iteration budget. The iteration count is shared across parent and child.
- `end_delegate` (785-845) turns a FINISHED or REJECTED delegate's outputs into "key: value" lines. The code carries a TODO to replace this with an AI summary (#2395). An errored delegate reports "encountered an error".
- The parent then receives an `AgentDelegateObservation`, "Delegated agent finished with result:", tied to the tool call. `openhands/memory/conversation_memory.py:362` formats that observation for the model.

**Stall rule** (`openhands/controller/stuck.py`). Five scenarios:

1. The same action and observation four times.
2. The same action ending in an error three times, with special checks for syntax errors.
3. A monologue: the same agent message three or more times.
4. An alternating pattern across six steps.
5. A context-window error loop: ten or more condensation events.

`_is_stuck` (1098) also checks the delegate. A stuck run raises `AgentStuckInLoopError` (880).

**Decision asks.** `LoopRecoveryAction` (602-617) offers the human three options: restart from before the loop, restart with the last user message, or stop.

**Verification.** None.

**Microagents.** No handling specific to delegate results was found in microagents (NOT FOUND).

## 3b. OpenHands software-agent-sdk

**Stall rule.**

- `StuckDetectionThresholds` (`openhands-sdk/openhands/sdk/conversation/types.py:136-161`) sets `action_observation=4`, `action_error=3`, `monologue=3` and `alternating_pattern=6`.
- `stuck_detector.py` scans at most 20 events (`MAX_EVENTS_TO_SCAN=20`), counting only events since the last user message.
- The action-error rule fires one repeat past its threshold. Before that, `get_action_error_nudge` gives the agent a nudge text.
- The context-window check needs at least 10 events.

**Delegate tool** (`openhands-tools/openhands/tools/delegate/`).

- `definition.py` offers two commands: `spawn` (ids and agent types) and `delegate` (a map from id to task text).
- `impl.py` caps children at `max_children=5` (44, 155).
- The delegates run on parallel threads joined with `join()` and no timeout (318-371). A hung child therefore hangs the parent.
- Each child's result is its final response, or "No response from sub-agent". The parent receives a numbered list of "Agent X: ..." lines, or "Agent X ERROR".

**Task tool** (`openhands-tools/openhands/tools/task/`).

- `definition.py` takes a description (3-5 words), a prompt, `subagent_type` and `resume`. It tells the parent to say what the child should report back.
- On trust, line 140 says: "The agent's results are authoritative — verify ... only when the task involves judgment".
- `manager.py:410-461` (`_run_task`): a FINISHED child returns its result. Any other terminal status (run limit, stuck, paused) becomes an error carrying the reason and the child's "Partial result:". The child inherits the parent's `max_iteration_per_run` and `max_budget_per_run`.

**Final response** (`conversation/response_utils.py:11-41`). It is the message of the last finish action, or else the last agent text message.

**Condenser** (`context/condenser/llm_summarizing_condenser.py`).

- Defaults: `max_size=240`, `keep_first=2`, `minimum_progress=0.1` and `hard_context_reset_max_retries=5`.
- The summary prompt (`condenser/prompts/summarizing_system.j2`) has these sections: user context, task tracking (with "PRESERVE TASK IDs"), completed, pending, current state, code state, tests, changes, dependencies and version-control status.
- Delegate results get no special handling.

## 4. Codex CLI

**Delegation contract** (`codex-rs/core/src/tools/handlers/multi_agents_spec.rs`). The tools:

- `spawn_agent`. In v1 it returns `agent_id` and a nickname; in v2 it requires `task_name` and `message`.
- `send_input` (with an interrupt flag) and `send_message`.
- `followup_task` and `resume_agent`.
- `wait_agent`. In v1 it waits for a final status, which may include the final message, and returns empty on timeout. The v2 mailbox wait "Does not return the content".
- `list_agents` and `interrupt_agent`.
- `close_agent`. Its text says completed agents keep a concurrency slot until they are closed.

**Return shape.** A status enum (386-410): `pending_init`, `running`, `interrupted`, `shutdown`, `not_found`, `{completed: string|null}` and `{errored}`. A `<subagent_notification>` JSON with `{agent_path, status}` is injected as a user-role message (`core/src/context/subagent_notification.rs`).

**Spawn guidance** (`spawn_agent_tool_description`, 692-770):

- Spawn only when the user explicitly asks: "Do not spawn sub-agents unless the user or ... explicitly ask". A request for depth or thoroughness does not count as that permission.
- Separate critical-path work from sidecar work, and never delegate the blocking step.
- Subtasks must be concrete and self-contained, with disjoint write sets. The worker must list the file paths it changed.
- Call `wait_agent` very sparingly, and do not redo delegated work.
- Review the returned changes before integrating them.

**Collaboration prompt** (`codex-rs/core/templates/collab/experimental_prompt.md:1-15`). Tell each agent it is "not alone in the environment". Tell a long-running agent it cannot spawn, to prevent recursion. Close agents when they are done, and scale `timeout_ms` to the work.

**Limits.**

- `codex-rs/core/src/config/mod.rs:260-270` sets `DEFAULT_AGENT_MAX_THREADS=Some(6)` and `DEFAULT_AGENT_MAX_DEPTH=1`. The v2 wait has a 10-second minimum, a 30-second default and a 1-hour maximum.
- Beyond the depth limit the spawn fails with "Agent depth limit reached. Solve the task yourself." (`multi_agents/spawn.rs:73-79`).
- v2 ignores the depth limit: its tests assert this (`multi_agents_tests.rs:2531`).

**Plan tool** (`codex-rs/core/gpt_5_2_prompt.md:36-46`). Exactly one item may be in progress. Do not jump an item from pending to completed, do not mark several complete after the fact, and do not repeat the plan after calling `update_plan`.

**Report to the human** ("Presenting your work", `gpt_5_2_prompt.md:160-242`). The default is "no more than 10 lines". Offer next steps briefly, scale compactness to the size of the change, cite files as `path:line`, and do not show before-and-after pairs.

**Decision asks.**

- `request_user_input` (`codex-rs/core/src/tools/handlers/request_user_input_spec.rs:123-128`) allows one to three short questions: "Prefer 1 and do not exceed 3". Option labels are 1-5 words.
- Plan mode (`codex-rs/collaboration-mode-templates/templates/plan.md:41-80`) says to explore first and ask second. Ask only about something that changes the plan, locks in an assumption or chooses a tradeoff, and never about anything that can be discovered.

**Verification.** Only the instruction to review returned changes. There is no mechanical check.

## 5. CrewAI hierarchical manager

Paths are under `lib/crewai/src/crewai/`.

**Role** (`translations/en.json:2-5`). The manager's role is "Crew Manager". Its backstory says it does not do tasks itself; it evaluates its team's work.

**Delegation contract.**

- The `delegate_work` and `ask_question` tools (`en.json:58-59`) both stress that coworkers know nothing about the task, so the manager must share absolutely everything.
- The schema is `{task, context, coworker}` (`tools/agent_tools/delegate_work_tool.py`).
- An unknown coworker gets an error listing the valid coworkers (`base_agent_tools.py:46-120`).
- A manager that holds any tool other than the delegation tools fails at setup with "Manager agent should not have tools" (`crew.py:1528-1567`).

**Return shape.** The coworker's raw `execute_task` output. The expected-output text (`en.json:22`) demands the actual complete content, not a summary.

**Stall rule.**

- `max_iter=25` per agent (`agents/agent_builder/base_agent.py:285`).
- `_check_tool_repeated_usage` (`tools/tool_usage.py:779`) blocks an identical consecutive tool call and returns the `task_repeated_usage` text (`en.json:49`).

**Verification.** Task guardrails, retried up to `guardrail_max_retries=3` (`task.py:261-289`), are the only mechanical check.

**Decision asks.** `human_input` on a task (`task.py:242`) asks the human for feedback after the task, using the `human_feedback` text (`en.json:23`).

## 6a. langgraph-supervisor

**Delegation contract** (`langgraph_supervisor/handoff.py`).

- `create_handoff_tool` (55-129) builds a `transfer_to_<name>` tool described as "Ask agent '<name>' for help".
- It returns the tool message "Successfully transferred to" and issues `Command(graph=PARENT, goto)`.
- A parallel handoff uses `Send`, with the other tool calls stripped from the message.
- The worker receives the shared message history, not a task brief.

**Return shape.**

- `output_mode` is `full_history` or `last_message` (the default) (`supervisor.py`). After the worker, `create_handoff_back_messages` (132-152) adds a synthetic transfer back to the supervisor.
- `create_forward_message_tool` (155 onward) lets the supervisor pass a worker's message to the user verbatim instead of rewriting it, to keep information intact.

**Stall rule.** None in this library; only the LangGraph recursion limit applies.

**Verification.** None. **Decision asks.** None built in.

**Limits.** `parallel_tool_calls=False` by default. The supervisor prompt is optional and there is no default one.

## 6b. langgraph-swarm

`langgraph_swarm/handoff.py:43-91` sets `active_agent` and moves control. There is no supervisor and no return: control is handed over, never handed back. There is no stall rule and no verification.

## 7. Google ADK

**Transfer** (`src/google/adk/flows/llm_flows/extensions/_agent_transfer.py`).

- `_build_transfer_instruction_body` (161-200) tells the agent to answer the question itself if it is the best agent for it. Otherwise it should call the transfer tool and output nothing but the function call, and only the listed agent names are valid.
- The agent is told to transfer to its parent when neither it nor the other agents fit (226-229).
- The valid targets (`_get_transfer_targets`, 233-263) are:
  - the sub-agents, except those in `single_turn` mode;
  - the parent, unless `disallow_transfer_to_parent` is set;
  - the peers, unless `disallow_transfer_to_peers` is set.
- An agent in a delegated-task mode gets no transfer instructions at all (221-222).
- `TransferToAgentTool` (`tools/transfer_to_agent_tool.py`) puts the valid agent names in a JSON-schema enum, so the model cannot invent a target. A `transfer_reason` field is optional.

**Agent modes** (`utils/_agent_mode.py`).

- `chat`: reached by transfer.
- `task`: a multi-turn task that finishes by calling `finish_task`.
- `single_turn`: completes from its input with no user replies.
- `DELEGATED_TASK_MODES = {task, single_turn}` run as tools, not as transfers.

**Delegation contract for tasks** (`agents/llm/task/_task_models.py`). The default input is `{goal, background}` (76-80) and the default output is `{result: str}` (96).

**`finish_task`** (`agents/llm/task/_finish_task_tool.py`).

- The child's instructions (162-166) warn against calling `finish_task` early: finish every part first, and ask the user if the task is unclear.
- The tool validates its arguments against the agent's `output_schema`. A validation failure returns a retryable error naming the missing parameters (194-199).

**AgentTool** (`tools/agent_tool.py`).

- The result is the text parts of the child's last content event, excluding thoughts (499-502).
- If the child has an `output_schema`, the text is validated against it (504-507).
- If no content arrived, the last error message is returned instead.
- `skip_summarization` (268) passes the result through without the parent rewriting it.
- State deltas from the child are merged into the parent's state (464-465).

**Limits.** `max_llm_calls` defaults to 500 per run (`agents/run_config.py:38`), and can be overridden with `ADK_MAX_LLM_CALLS`. Exceeding it raises `LlmCallsLimitExceededError` (`agents/invocation_context.py:91`).

**Not covered.** No stall or loop detector was found beyond the call cap. There is no verification beyond schema validation and no built-in decision path; the human report format is NOT READ.

## 8. Block Goose

Paths are under `crates/goose/src/`.

**Delegation contract** (`agents/platform_extensions/summon.rs`).

- The `delegate` tool (475-530) takes:
  - `instructions`;
  - a `source` (a named recipe or agent);
  - `parameters`;
  - `extensions`, which restricts the child's tools;
  - `provider`, `model` and `temperature` overrides;
  - `max_turns`;
  - `context`, which is injected into the child's system prompt as "# Reference Context" ahead of "# Task Instructions" (334-340);
  - `working_dir`, which must stay within the parent's directory;
  - `resume`, which continues a failed or cancelled delegate.
- A `load` tool instead reads a subagent's instructions into the parent's own context.
- When to delegate (342-398): always on `@name`; infer when the subagent is named without `@`; call it when the request strongly matches its description.

**Return shape.**

- The tool returns "Delegated to subagent {id}" at once (1009-1012).
- The child must finish through a `recipe__final_output` tool, validated against a JSON schema. The default schema is `{summary: string}`, which is required (955-972; `agents/final_output_tool.rs:12`).
- The outcome arrives later as a notice (`agents/state_machine/ops_subagent.rs:33-54`): "Subagent {id} completed" with the output, or "Subagent {id} failed: <first line of reason>". `readable_output` unwraps a lone `summary` field (77-88).
- When other subagents are still running, a finished one's output is shown; when it is the last to finish, it is not (135-145).

**Subagent prompt** (`prompts/subagent_system.md:1-29`). Bounded by turn count and timeout; "Cannot spawn additional subagents"; minimal tool use; if asked for a summary, it must be the last message.

**Limits.**

- Depth is one: "Delegated tasks cannot spawn further delegations" (`summon.rs:875`).
- Concurrency is `GOOSE_MAX_CONCURRENT_SUBAGENTS`, default 5 (`agents/state_machine_builder.rs:89-94`).
- Turns resolve in this order: the delegate parameter, then the recipe setting, then `GOOSE_SUBAGENT_MAX_TURNS`, then `GOOSE_MAX_TURNS`, which defaults to 1000 (`summon.rs:1431-1437`; `config/base.rs:1339-1341`).

**Verification: the strongest mechanical check found** (recipes, `agents/types.rs:11-62`; `agents/retry.rs:14-30`).

- A recipe may declare `retry: {max_retries, checks, on_failure, timeout_seconds, on_failure_timeout_seconds}`.
- Each check is a shell command, and success means exit code 0.
- On failure, the recipe runs its `on_failure` cleanup and retries, up to `max_retries`.

**Stall rule.** None found beyond the turn cap (NOT FOUND). **Decision asks.** None specific to delegation was read (NOT READ).

## 9a. Cline

Cline's agent runtime is now an SDK, under `sdk/packages/core/src/extensions/tools/team/`.

**Delegation contract.**

- `spawn-agent-tool.ts` takes `{systemPrompt, task}` (30-36), runs the child and waits for it, with a 300-second tool timeout (201). It returns `{text, iterations, finishReason, usage}` (158-166).
- `team-tools.ts` adds a lead-and-teammate runtime:
  - `team_spawn_teammate` and `team_run_task`, which can wait for the result or run in the background;
  - `team_await_runs`, `team_status` and `team_task`, a shared task list with `dependsOn` and assignee;
  - a mailbox and broadcast;
  - `team_mission_log`;
  - an outcome workflow: `team_create_outcome`, `team_attach_outcome_fragment`, `team_review_outcome_fragment` and `team_finalize_outcome`.

**Verification: a review gate written in code.** `finalizeOutcome` (`multi-agent.ts:1736-1750`) refuses to finalize while any section lacks a fragment marked `reviewed`. A fragment becomes `reviewed` or `rejected` through an explicit review (1720). There is also a worker-then-reviewer pattern (`createWorkerReviewerTeam`, 542-568).

**Limits.** Concurrent async runs are capped by `maxConcurrentRuns`, default 2 (`multi-agent.ts:630`). Runs record a heartbeat on a timer (1301-1309).

**Not covered.** No stall detector was found apart from the heartbeat (NOT FOUND). The lead's system prompt and the human report format are NOT READ.

## 9b. Kilo Code

Kilo is now a fork of the same upstream, with the same package layout as Orchestra's lineage. Its orchestrator mode is deprecated (`packages/kilo-docs/pages/code-with-ai/agents/orchestrator-mode.md`): agents with full tools now delegate through `task` themselves.

**Orchestrator prompt** (`<upstream>/src/agent/prompt/orchestrator.txt:1-24`). Explore, then plan subtasks with the files each will likely touch. Group them into waves:

- independent subtasks run in parallel in one message;
- subtasks that may touch the same files go into different waves;
- when unsure, run them sequentially.

It must give each agent all the context it needs, synthesize at the end, and never edit files itself.

**Return shape** (`<upstream>/src/tool/task.ts:80-95`). An XML block `<task id state><summary/><task_result | task_error>`. On an error it adds a hint for resuming. Background tasks notify the parent when they finish, and the parent is told not to poll (70-73). The tool text says the result is not visible to the user, so the parent must relay it, and that outputs "should generally be trusted" (`tool/task.txt:15-17`).

**Shared board** (`<upstream>/src/kilocode/tool/board.ts`).

- Posts are typed `INFO`, `ASK`, `RESULT`, `HOLD` or `VETO` (147).
- Candidate results must include evidence.
- Peer claims, including claims of approval, are untrusted and never authorize work (95).
- `HOLD` and `VETO` are advisory, not locks.

**Goal runner: honest status** (`<upstream>/src/kilocode/session/goal/runner.ts`).

- A completion the model reports is settled with the label "Reported by the working model, not independently verified" (502).
- A turn with no successful action and no explicit report pauses the goal (537), which is a progress-based stall rule.
- A blocked or failed turn pauses as well (480-488).

## 10. Anthropic: claude-agent-sdk-python and claude-code

**claude-agent-sdk-python** (`src/claude_agent_sdk/types.py`).

- `AgentDefinition` (108-126) has these fields: `description`, `prompt`, `tools` and `disallowedTools`, `model`, `skills`, `memory`, `mcpServers`, `initialPrompt`, `maxTurns`, `background`, `effort` and `permissionMode`.
- `SubagentStopHookInput` (445-458) carries `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message` and any in-flight background tasks.
- A hook can return `decision: "block"` with a `reason` (786-809). On SubagentStop, this lets the host refuse a subagent's stop and send it feedback: a programmatic verification gate before the claim reaches the parent.

**claude-code.** The public repository holds a changelog, examples and a plugin marketplace index. Plugins are now developed in `claude-plugins-official` (`plugins/README.md`). The orchestration prompt text (the Agent/Task tool description, the subagent return format, and the depth and concurrency limits) is closed source: NOT READ. This document draws only on the SDK hook contract above and on the issues listed below.

---

## Comparison matrix

| Target | Delegation contract | Return shape | Stall rule | Verification | Human report | Decision asks |
|---|---|---|---|---|---|---|
| Magentic-One | JSON progress ledger, instruction to `next_speaker` | Free text in a shared thread | LLM loop and progress verdict; stalls ≥3 trigger replan with reset | LLM `is_request_satisfied` only | Final answer as if speaking to the user | None |
| Agent Framework Magentic | Same | Same | stalls >3 trigger replan; reset and round caps | Same | Same | Plan sign-off with approve or revise, re-asked on stall |
| Roo Code | `new_task{mode, message, todos}`; mandated brief contents | `tool_result` "Subtask completed. Result: summary" | 4th identical tool call or 3 mistakes ask the user | None | Orchestrator synthesis | Approve launch and finish; mistake limit |
| OpenHands V0 | `AgentDelegateAction{agent, inputs}` | "key: value" outputs observation | Five scenarios (4, 3, 3, 6, 10) | None | Finish message | Loop recovery: three options |
| OpenHands SDK | `delegate{id: task}` or `task{prompt, subagent_type}` | Numbered list or result plus "Partial result" | Same thresholds, last 20 events, nudge first | "Authoritative" unless judgment | Last finish message | NOT READ |
| Codex | `spawn_agent{task_name, message}`, disjoint write sets | Status enum plus notification; v2 wait has no content | NOT FOUND (wait timeouts only) | Prompt: review changes | ≤10 lines, `path:line` | `request_user_input`, 1-3 questions |
| CrewAI | `delegate_work{task, context, coworker}` | Raw complete output | Identical consecutive call blocked; `max_iter` 25 | Guardrails, 3 retries | Task output | `human_input` after task |
| LangGraph supervisor | `transfer_to_<name>`, shared history | `last_message` or full history; `forward_message` | None | None | Supervisor or forwarded verbatim | None |
| LangGraph swarm | Set `active_agent` | No return | None | None | Active agent | None |
| ADK | Transfer (enum names) or task `{goal, background}` | `finish_task` validated `{result}`; AgentTool last text | `max_llm_calls` 500 only | Output-schema validation | NOT READ | NOT READ |
| Goose | `delegate{instructions, context, extensions, max_turns, ...}` | `final_output` JSON schema, default `{summary}`; completed or failed notice | Turn cap only | Recipe shell success checks plus retry | Notices | NOT READ |
| Cline SDK | `{systemPrompt, task}`; team tasks with `dependsOn` | `{text, iterations, finishReason, usage}` | Heartbeat only | Outcome cannot finalize without reviewed fragments | NOT READ | NOT READ |
| Kilo | `task` with waves and full context | `<task id state><summary><task_result>` | Goal pauses on no action and no report | Board: evidence with results; "not independently verified" label | Parent must relay; result is hidden from the user | Ask clarifying questions; pause on blocker |
| Claude Agent SDK | `AgentDefinition` | Last assistant message | NOT READ | SubagentStop hook can block with a reason | NOT READ | NOT READ |

## Steal list: the 10 best mechanisms

1. **Progress ledger as structured JSON each step.** Each step answers whether the task is done, whether it is looping, whether it is progressing, who acts next and with what instruction, with a reason for every answer. *AutoGen `_magentic_one/_prompts.py:59-100`.*
2. **Stall counter with decay, then replan with a written root cause and a participant reset.** Plus one per stalled step, minus one per good step; at three, write down what went wrong and why before replanning. *AutoGen `_magentic_one_orchestrator.py:262-298, 393-405`; `_prompts.py:133-136`.*
3. **Human sign-off on the plan, re-asked when the run stalls.** The human sees `approve` or `revise(feedback)` and is pulled back in exactly when autonomy failed. *Agent Framework `_magentic.py:839-891, 1192-1228`.*
4. **A mechanical completion gate.** A shell success check must exit 0 before work counts as done, with bounded retries and cleanup on failure. *Goose `agents/types.rs:11-62`, `agents/retry.rs:14-30`.*
5. **Finalize refuses without review.** An outcome cannot close while any section lacks a fragment marked reviewed. *Cline `sdk/packages/core/src/extensions/tools/team/multi-agent.ts:1736-1750`.*
6. **Honest status label.** A self-reported completion is recorded as "not independently verified"; a turn with no action and no report pauses instead of looping. *Kilo `kilocode/session/goal/runner.ts:502, 537`.*
7. **Mandatory brief contents plus a schema-validated return.** The brief carries full context, scope, "only this work" and the completion contract (Roo `packages/types/src/mode.ts:216`). The return is validated against a schema and retried on a validation error (ADK `_finish_task_tool.py:162-199`; Goose `summon.rs:955-972`).
8. **Failure that keeps partial work.** A non-finished child returns its terminal reason plus "Partial result:" instead of dropping the work, and the failed child stays resumable. *OpenHands SDK `tools/task/manager.py:410-461`; Goose `summon.rs:524`; Kilo `tool/task.ts:83-85`.*
9. **Deterministic loop detectors with fixed thresholds, nudging before stopping.** Four identical action-and-observation pairs, three identical errors, a three-message monologue, a six-step alternation, counted only since the last user message; a nudge comes first. *OpenHands SDK `conversation/types.py:136-161`, `stuck_detector.py`.*
10. **Bounded fan-out and decision asks.** Depth one, a hard thread cap, and a refusal message that tells the agent to do it itself. Disjoint write sets, with the worker listing the paths it changed. At most three questions per ask, and never about what can be discovered. *Codex `config/mod.rs:260-270`, `multi_agents/spawn.rs:73-79`, `multi_agents_spec.rs:692-770`, `request_user_input_spec.rs:123-128`, `templates/plan.md:41-80`.*

Runners-up:

- Treat peer claims of approval as untrusted, and use typed posts: `INFO`, `ASK`, `RESULT`, `HOLD`, `VETO` (Kilo `board.ts:95, 147`).
- Forward a worker's message verbatim when fidelity matters (`langgraph_supervisor/handoff.py:155`).
- Put valid targets in a schema enum, so the model cannot invent an agent name (ADK `transfer_to_agent_tool.py`).

## Failure list: orchestration failures from issue trackers

Retrieved with `gh search issues` on 2026-10-28. Titles are paraphrased.

**Lost or empty hand-back**

- Roo Code: subtasks never return to the orchestrator once VS Code is closed. https://github.com/RooCodeInc/Roo-Code/issues/8621 (closed)
- Roo Code: cancelling a subtask after a streaming error fails to return to the parent. https://github.com/RooCodeInc/Roo-Code/issues/4896 (closed)
- Roo Code: the subtask completion button disappears, and resuming re-runs the work at extra cost. https://github.com/RooCodeInc/Roo-Code/issues/4881 (closed)
- Goose: a delegated subagent completes but never returns to the main thread. https://github.com/aaif-goose/goose/issues/12951 (open)
- Goose: a failed subagent's reason never reaches the parent, which sees only "Delegated to subagent". https://github.com/aaif-goose/goose/issues/12988 (open)
- ADK: AgentTool returns an empty string when the child's last event holds only function parts, such as `finish_task`. https://github.com/google/adk-python/issues/7246 (open)
- ADK: a committed transfer is lost when the target fails before yielding. https://github.com/google/adk-python/issues/7458 (closed)
- ADK: an LlmAgent with transfers loses its output for downstream workflow edges. https://github.com/google/adk-python/issues/7782 (open)
- Claude Code: subagents return only "Done", with no output, on research tasks. https://github.com/anthropics/claude-code/issues/66518 (closed)
- Claude Code: a background subagent that dies on an API error returns a truncated result with no error signal. https://github.com/anthropics/claude-code/issues/101460 (open)
- Claude Code: parallel subagent results never reconcile and the parent wedges permanently. https://github.com/anthropics/claude-code/issues/91037 (open)
- LangGraph supervisor: the user receives only a handoff message instead of the answer. https://github.com/langchain-ai/langgraph-supervisor-py/issues/160 (open)

**False status**

- Codex: running subagents wrongly appear as Done. https://github.com/openai/codex/issues/54953 (open)
- Claude Code: subagents silently fail to write files or call MCP tools. https://github.com/anthropics/claude-code/issues/13890 (closed)

**Loops and stalls**

- LangGraph supervisor: turning off handoff messages causes looping. https://github.com/langchain-ai/langgraph-supervisor-py/issues/152 (open)
- Goose: a subagent loops on `recipe__final_output` when a hook denies it. https://github.com/aaif-goose/goose/issues/13186 (open)
- OpenHands SDK: the stuck detector never catches a context-window error loop, so condensation repeats until the iteration cap. https://github.com/OpenHands/software-agent-sdk/issues/6104 (open)
- OpenHands SDK: validation-loop detection misses repeated failures. https://github.com/OpenHands/software-agent-sdk/issues/6277 (open)
- OpenHands SDK: an empty LLM response ends the run as STUCK, with no retry. https://github.com/OpenHands/software-agent-sdk/issues/6085 (open)
- OpenHands SDK: the agent server silently drops custom stuck thresholds. https://github.com/OpenHands/software-agent-sdk/issues/6240 (open)
- OpenHands: the user cannot recover from "Agent stuck in loop". https://github.com/OpenHands/OpenHands/issues/5480 (closed)
- Cline: commands repeat and the task continues after the user stops it. https://github.com/cline/cline/issues/12246 (open)
- Agent Framework (.NET): the termination condition is not honoured in Magentic. https://github.com/microsoft/agent-framework/issues/7595 (open)
- Agent Framework: Magentic stops after the first query and does not continue. https://github.com/microsoft/agent-framework/issues/5657 (open)

**Limits and permissions not enforced**

- Codex: `max_depth` is not enforced for nested `spawn_agent`. https://github.com/openai/codex/issues/46704 (open)
- Codex: PreToolUse hooks do not fire for `spawn_agent`, so a deny cannot block a spawn. https://github.com/openai/codex/issues/49736 (open)
- Codex: the PreToolUse matcher is bypassed for the namespaced v2 `spawn_agent`. https://github.com/openai/codex/issues/36519 (open)
- Goose: subagents bypass the parent's approval mode. https://github.com/aaif-goose/goose/issues/11778 (open)
- Claude Code: the `permissions.ask` prompt does not appear for Bash run by a background subagent. https://github.com/anthropics/claude-code/issues/100454 (open)

**Shared workspace collisions**

- Claude Code: parallel subagents share a working directory with no warning, silently corrupting builds. https://github.com/anthropics/claude-code/issues/101461 (open)
- Claude Code: `isolation: worktree` switched the parent worktree's branch. https://github.com/anthropics/claude-code/issues/47548 (closed)

**Delegation that cannot route or lacks context**

- CrewAI: hierarchical delegation fails because the manager cannot delegate to its workers. https://github.com/crewAIInc/crewAI/issues/4783 (closed)
- CrewAI: on the second kickoff, the manager delegates to itself. https://github.com/crewAIInc/crewAI/issues/8368 (closed)
- CrewAI: "coworker mentioned not found". https://github.com/crewAIInc/crewAI/issues/1399 (closed)
- LangGraph supervisor: the supervisor does not pass context or state to the sub-agent. https://github.com/langchain-ai/langgraph-supervisor-py/issues/205 (open)
- LangGraph supervisor: request to send a focused query instead of the full history. https://github.com/langchain-ai/langgraph-supervisor-py/issues/265 (open)
- Goose: request to steer a running subagent, or ask it to wrap up with an intermediate result. https://github.com/aaif-goose/goose/issues/12852 (open)
- Kilo: complex orchestration is underwhelming compared with the Roo Code backend. https://github.com/Kilo-Org/kilocode/issues/7518 (closed)
- OpenHands SDK: request for an escalation ladder on failure (model, then a stronger model, then a human). https://github.com/OpenHands/software-agent-sdk/issues/5615 (open)

**Searched but not mined.** AutoGen issue searches for "magentic stall" and "magentic loop" returned nothing. A broad "magentic" search returned only setup and security items, so no AutoGen orchestration failure is listed.
