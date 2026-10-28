# 14. How shipped products run a lead agent: primary sources

This report covers how shipped agent products delegate work, report status, ask the human to decide, and show that work is done. It uses primary sources only: vendor docs, official engineering posts, papers, and public issue trackers. Every URL listed below was fetched on 2026-10-28 unless it is marked NOT FETCHED. Search-result snippets were not used as evidence.

Quotes are kept under 15 words, with at most one per source. Everything else is paraphrase. Where a fetched page was silent on a dimension, the text says so instead of guessing.

The aim is to inform Maestro. Maestro delegates to seats, decides, keeps the Projects board, verifies, and reports to the owner. It does not plan or research itself.

## 1. Per-product findings

### 1.1 Anthropic: research system, effective agents, Claude Code

**Fetched**
- https://www.anthropic.com/engineering/multi-agent-research-system
- https://www.anthropic.com/engineering/building-effective-agents
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/sub-agents (read up to character 100000; the tail was not read)
- https://code.claude.com/docs/en/hooks (truncated; the per-event schemas past about character 100000 were not read)
- https://code.claude.com/docs/en/agent-sdk/subagents
- https://code.claude.com/docs/en/agent-sdk/user-input

**Delegation unit and brief.** In the research system, the lead (Opus 4) writes a brief for each subagent (Sonnet 4). The brief has four parts:
- the objective
- the output format
- guidance on tools and sources
- clear task boundaries

Vague briefs made subagents repeat each other's work. The post's example is several subagents researching the same semiconductor topic.

Effort is scaled to the query:
- a simple lookup gets 1 agent and 3 to 10 tool calls
- a comparison gets 2 to 4 subagents with 10 to 15 calls each
- complex research gets more than 10 subagents

In Claude Code, a subagent starts with no conversation history. It sees only the delegation message, CLAUDE.md and git status (forks are the exception). Agent teams give each teammate a spawn prompt for the same reason: the lead's history does not carry over.

**Return shape.** Subagents return condensed findings. For large outputs, the research system stores artifacts outside the conversation and passes back lightweight references. A separate CitationAgent then checks each claim against its source.

In Claude Code the parent receives only the subagent's summary, under a header saying it carries no user authority. The Agent SDK docs warn that the parent may summarize again, so ask explicitly when a report must be passed on verbatim. SDK results carry an `agentId` that can be used to resume the subagent. Messages from inside a subagent carry `parent_tool_use_id` and `agent_id`.

**Progress model.** Agent teams keep a shared task list. Each task is pending, in progress or completed, and a task with unmet dependencies shows as blocked until they clear. Teammates either claim tasks themselves, using file locks, or the lead assigns them.

When a teammate goes idle, the lead is notified automatically and the notice includes the teammate's last answer. Delivery is automatic, so the lead does not poll. Background subagents report through a completion notification.

The research post names "excessive status updates" as an early failure. Building effective agents urges showing the agent's planning steps explicitly.

**Asking the human.** AskUserQuestion takes 1 to 4 questions per call. Each question has:
- 2 to 4 options, each with a label and a description
- a header of at most 12 characters
- an optional multiSelect flag and an optional preview
- an automatic free-text "Other" answer

The answer may stay pending indefinitely. A PreToolUse `defer` decision lets the process exit and resume later. AskUserQuestion is removed from subagents, so only the lead can ask the human. Messages from other agents are labeled as not coming from the user, and a teammate cannot approve a permission on the user's behalf.

**Done and verified.** Hooks can gate completion:
- TaskCompleted with exit code 2 blocks completion and feeds stderr back to the model.
- SubagentStop with exit code 2, or `decision: block` with a reason, keeps the subagent working. Its input includes `last_assistant_message`.
- TeammateIdle with exit code 2 keeps the teammate working.
- TaskCreated with exit code 2 cancels the new task.

Building effective agents recommends checking ground truth from the environment at each step. It also recommends an evaluator-optimizer loop when the success criteria are clear.

**Limits.**
- Subagent depth defaults to 3 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`).
- Concurrency defaults to 20 (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`); past that the call fails with "Concurrent subagent limit reached".
- `maxTurns` caps a subagent; its partial output is marked and can be resumed.
- `maxBudgetUsd` caps spend in the SDK and ends the run with `error_max_budget_usd`.
- Agent teams have no hard size limit. The docs suggest 3 to 5 teammates and 5 to 6 tasks each.
- Agent teams also allow only one team per session and no nested teams. The lead is fixed, permissions are set at spawn, and in-process teammates cannot be resumed.

**Cost.** Agents use about 4x the tokens of a chat. Multi-agent systems use about 15x. Token usage alone explained 80% of the performance variance.

**Failures named by the vendor.**
- Spawning 50 subagents for a simple query.
- Endless searching.
- Teammates stopping when they hit an error.
- The lead doing tasks itself instead of waiting for teammates.
- The lead stopping early.
- The SDK notes that Claude may do work itself rather than delegate.

**Failures in the public repo**, anthropics/claude-code (all fetched):
- #82687: teammate reports never reach the lead, and mailbox delivery waits for the lead's next turn (one case about 14.5 hours late). Closed as a duplicate, with no fix referenced.
- #104356: a teammate blocked on a permission or trust prompt waits forever, and neither the lead nor a remote user is told. Open.
- #47930: idle notifications and duplicate echoes each wake the lead for a full turn, costing about 13% to 22% of input tokens. Open.
- #28627: idle notifications were rendered as `Human:` turns. A ghost "shutdown and clean up" line led the lead to run an irreversible TeamDelete. Closed as a duplicate.

### 1.2 Cognition: Devin

**Fetched**
- https://cognition.com/blog/dont-build-multi-agents (2025-06-12; cognition.ai redirected here)
- https://cognition.com/blog/multi-agents-working (2026-04-22)
- https://cognition.com/blog/devin-can-now-manage-devins (2026-03-19)
- https://docs.devin.ai/llms.txt
- https://docs.devin.ai/work-with-devin/advanced-capabilities.md
- https://docs.devin.ai/work-with-devin/devin-session-tools.md
- https://docs.devin.ai/integrations/slack.md
- https://docs.devin.ai/product-guides/creating-playbooks.md
- https://docs.devin.ai/essential-guidelines/instructing-devin-effectively.md
- https://docs.devin.ai/onboard-devin/knowledge-onboarding.md
- https://docs.devin.ai/api-reference/v3/sessions/get-organizations-session

**NOT FETCHED:** the v1 session `status_enum` page (seen only in a search snippet), and a "Devin asks you" page (none was found in llms.txt under that name).

**Delegation unit and brief.** The unit is a session, and the docs recommend one session per sub-task. A good brief has six parts:
- context
- steps
- approach, with the judgment calls made in the brief rather than left to Devin
- references
- success criteria and how to validate them
- checkpoints

Playbooks add fixed sections:
- Overview
- Procedure: one imperative step per line, mutually exclusive and collectively exhaustive
- Specifications, written as postconditions
- Advice
- Forbidden Actions
- What's Needed From User

Playbooks are being replaced by Skills; new accounts get Skills only from 2026-10-24. Knowledge entries load on triggers and show in the session as "Accessed Knowledge".

A manager Devin launches each child with:
- a prompt
- an optional playbook
- tags
- an ACU (compute) limit

The docs say to split the work into independent packages first.

**Return shape.** The v3 session object includes:
- `pull_requests` (URL and state)
- `structured_output`
- `parent_session_id` and `child_session_ids`

Children verify their own work before they report. The coordinator compiles the results.

**Progress model.** v3 `status` is one of new, claimed, running, exit, error, suspended or resuming. While running, `status_detail` is one of working, waiting_for_user, waiting_for_approval or finished. Suspension reasons include inactivity, usage_limit_exceeded and out_of_credits.

In Slack code channels, a status chip shows working, blocked or done, with a live worklog and PR chips. The Progress tab lists commands, edits and browser activity. The coordinator schedules check-ins with itself and tracks ACUs per child. No update frequency is documented.

**Asking the human.** Devin posts questions in the session's Slack thread. Config changes arrive as a diff with an Apply button. The coordinator is woken, even from sleep, when a child finishes or needs input. "Auto-approve child sessions" can be turned off so a person reviews each batch of children. The user can take over the browser (for CAPTCHA or MFA) or the IDE.

**Done and verified.** The session reaches `finished` or `exit`, with PR chips attached. Devin Review averages about 2 bugs per PR, and about 58% of them are severe. The reviewer starts with a clean context and sees only the diff.

**Limits.** No maximum number of children is stated. Each child runs in its own VM. Budget is controlled per child through the ACU limit.

**Lessons the vendor states.**
- Share full context and traces with every agent. One line in the 2025 post captures why: "Actions carry implicit decisions, and conflicting decisions carry bad results."
- In 2026 the patterns that worked were:
  - a single writer, with read-only helpers
  - a generator paired with a verifier
  - escalation to a smarter model ("Smart Friend"), which fails when the primary model is weak
  - manager Devins
- Manager failures:
  - over-prescriptive briefs
  - children not messaging the manager unless told to
  - the manager wrongly assuming it shares state with its children
  - reviewer loops pulling in out-of-scope work

**Failures in a public repo:** NOT FETCHED. Devin has no public issue tracker.

### 1.3 OpenAI: Codex and the Agents SDK

**Fetched**
- https://learn.chatgpt.com/docs/cloud (redirected from developers.openai.com/codex/cloud)
- https://learn.chatgpt.com/docs/codex/cli (redirected from developers.openai.com/codex/cli)
- https://learn.chatgpt.com/docs/agent-configuration/subagents (redirected from developers.openai.com/codex/subagents)
- https://openai.github.io/openai-agents-python/handoffs/
- https://openai.github.io/openai-agents-python/multi_agent/
- "A practical guide to building agents" (PDF from cdn.openai.com, pages 14 to 34 read)
- https://github.com/openai/codex/issues/32027
- https://github.com/openai/codex/issues/33447

**NOT FETCHED:** a Codex page on best-of-N, ask versus code mode, or the PR summary format; the Codex changelog.

**Delegation unit and brief.** In Codex cloud, the unit is a task run in a published environment. Several tasks can run in parallel, and they keep going while the user's computer sleeps.

Codex subagents are spawned when the user asks, or when AGENTS.md or a skill tells Codex to delegate. The built-in agents are default, worker and explorer. Custom agents are TOML files that require `name`, `description` and `developer_instructions`.

The Agents SDK offers two patterns:
- **Agents as tools:** a manager keeps control and owns the final answer.
- **Handoffs:** the specialist becomes the active agent, and by default it sees the full history. A handoff is exposed to the model as a `transfer_to_<agent>` tool, with input metadata such as a reason.

The PDF says the manager pattern fits when one agent should control the run and talk to the user.

**Return shape.** Subagents return summaries, not their intermediate output. Codex waits for every requested result, then gives one consolidated reply. The subagents page puts it as "moving noisy work off the main thread".

In cloud, the user inspects changed files and test results, asks for follow-ups, then commits or opens a PR.

**Progress model.** The web shows a read-only Subagents view with Active and Done lists, and no stop or steer controls there. In the CLI, `/subagents` switches between threads. The IDE shows active subagents above the composer, with a stop-all control. The CLI lets the user watch commands and diffs as they appear.

**Asking the human.** Subagents inherit the parent's sandbox and approval settings. An approval request from a background thread shows that thread's label, and pressing `o` opens the thread. If a fresh approval cannot be shown, the action fails and the error goes back to the parent.

The PDF names two triggers for handing control back to a human:
- exceeding a failure threshold, such as a retry limit
- a high-risk action that is sensitive, irreversible or costly

**Done and verified.** A run ends on one of these exit conditions: a final-output tool, a reply with no tool calls, an error, or a maximum turn count. The PDF also rates each tool's risk as low, medium or high, based on write access, reversibility and financial impact.

**Limits.** The cap is `agents.max_concurrent_threads_per_session`, of which `agents.max_threads` is a legacy alias. The fetched page gives no default number.

**Failures in the public repo**, openai/codex:
- #32027: `max_depth = 1` still lets a child spawn a grandchild, because the V2 handler never checks depth. Open.
- #33447: the V2 runtime ignores `max_threads` without warning, giving 4 slots where 10 were configured, and `features list` misreports the mode. Open.

### 1.4 GitHub Copilot coding agent

**Fetched**
- https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/track-copilot-sessions
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/review-copilot-prs
- https://github.com/orgs/community/discussions/178998

**NOT FETCHED:** a page describing the PR description template.

**Delegation unit and brief.** The unit is one task, which produces one branch and at most one PR. A task can start from:
- the agents panel
- chat
- an issue or PR
- a security campaign
- a scheduled or event-driven automation

**Return shape.** Copilot creates the branch, commits and pushes. Copilot is the commit author and the person who started the task is co-author. Commits are signed, and each commit message links to the session log. The PR can be requested in the first prompt or after reviewing the changes.

**Progress model.** The session log shows the agent's reasoning and the tools it used. The session overview shows progress, token usage and duration. Sessions are listed in the agents panel. Named status labels are not documented on the fetched pages.

**Asking the human.** The user steers by typing into the session, and the message is applied after the current tool call. The user iterates on the PR by mentioning `@copilot` or pushing commits. The agent asks for the human's review when it finishes; the mechanism is not described.

**Done and verified.** Copilot can run tests and linters before it pushes. Workflows do not run on Copilot's pushes until a human clicks "Approve and run workflows". If the repo requires approvals, the person who started the task cannot approve the PR; in the docs' words, "Another reviewer must approve the pull request".

**Limits.**
- One repository per run, one branch at a time, one PR per task.
- 59 minutes per session; this can be shortened with `timeout-minutes` but not extended.
- No concurrency limit is stated.

**Failures in a public forum.** Community discussion #178998: the agent times out on a pre-commit check of about 6 minutes, wrongly assumes the commit succeeded, and retries in a loop until the session limit. Command timeouts cannot be configured. There was no staff answer.

### 1.5 Cursor: cloud agents and Bugbot

**Fetched**
- https://cursor.com/docs/cloud-agent (docs.cursor.com redirected to cursor.com)
- https://cursor.com/docs/bugbot

**NOT FETCHED:** forum complaints and the changelog.

**Delegation unit and brief.** One cloud agent per task, each in its own VM. A task can start from:
- desktop, the web or iOS
- Slack, Linear or the API
- an `@cursor` comment on a GitHub issue or PR

Multi-repo environments let one agent span several repositories.

**Return shape.** The agent pushes a branch, opens merge-ready PRs, and attaches artifacts: screenshots, videos and logs of what changed and how it was verified.

Each Bugbot finding is a PR comment with an explanation, a suggested fix, and "Fix in Cursor" and "Fix in Web" links. An optional Autofix starts a cloud agent to push the fix.

**Progress model.** The fetched page defines no status states. Transcripts and run events are exposed through the Cursor Cloud MCP server. The Bugbot CI check reports `success` only when there are no issues and no unresolved earlier findings; otherwise it reports `neutral`, or `failure` if configured.

**Asking the human.** The user can take over the agent's remote desktop and hand it back. Teammates can view a run read-only. Follow-up messages from teammates need an admin setting.

**Done and verified.** Verification artifacts are attached to the PR, and the PR is where the human decides. Bugbot tracks `resolution_status` as resolved or unresolved per finding.

**Limits.** No concurrency or time cap is stated; a spend limit is set on first use. Bugbot skips oversized PRs and posts a comment asking for a split. Rule files are capped at 30,000 characters each and 100,000 in total.

### 1.6 Factory Droids

**Fetched**
- https://docs.factory.com/cli/configuration/custom-droids (docs.factory.ai redirected here)
- https://docs.factory.com/web/getting-started/overview

**Delegation unit and brief.** The unit is a Task tool call with:
- `subagent_type`, `description` and `prompt`
- optional `image_paths`
- `complexity`: light, medium or heavy, which drives model routing
- `run_in_background`
- `resume`, given a prior task_id

**Return shape.** A single final message. The user sees it only if the parent passes it on.

**Progress model.** Foreground runs stream tool calls, results and TodoWrite updates. Background runs return a task_id at once and notify the parent when they finish. Output is read with TaskOutput, which can block or poll. TaskStop ends a run.

**Asking the human.** AskUser is disabled in subagents. A subagent that is blocked or unsure reports back to the parent, and the parent decides.

**Done and verified.** Nothing beyond the final message. The web app shows diffs and documents next to the session, and the user answers with inline comments.

**Limits.**
- Depth is 1: subagents have no Task tool.
- Each subagent gets a fresh context.
- Autonomy is clamped to the organization's maximum.
- Droids with read-only tools never run above Low autonomy.

### 1.7 Google Jules

**Fetched**
- https://jules.google/docs
- https://jules.google/docs/usage-limits
- https://jules.google/docs/code

**Delegation unit and brief.** A task is a prompt plus a repository and branch. Jules runs it in a VM and reads AGENTS.md. With "Give me a plan", the user approves a plan before any code changes.

**Return shape.** At the end, Jules shows a summary of:
- the files changed
- the total runtime
- the lines added or changed
- the branch name and commit message

"Publish branch" or "Publish PR" pushes the result to GitHub.

**Progress model.** A real-time activity feed logs each completed step, its outputs or errors, and any requests for input. Mini diffs appear in the feed, and a full diff view sits on the side.

**Asking the human.** Requests for information or feedback are posted in the feed. A browser notification fires when a task finishes or needs input. The user replies in a chat box.

**Done and verified.** The completion summary above. The fetched pages say nothing about test evidence.

**Limits.**
- Base plan: 3 concurrent tasks and 15 a day.
- Pro: 15 concurrent and 100 a day.
- Ultra: 60 concurrent and 300 a day.
- The daily count uses a rolling 24-hour window.

### 1.8 Amp

**Fetched**
- https://ampcode.com/manual (introduction only)
- https://ampcode.com/docs/models-and-subagents
- https://ampcode.com/docs/orbs/agent-to-agent

**NOT FETCHED:** an Oracle page (the subagents page does not mention it) and the Puck page.

**Delegation unit.** There are two subagents:
- **Task:** does the work end to end, with editing and shell, or in read-only roles for search, research, review and planning.
- **Read Thread:** reads and summarizes another thread.

With agent-to-agent, Amp can start agents in other threads, orbs or runners, send them instructions, move files between them, and collect their results.

**Return shape.** The main agent gets only the final summary. The user can ask a spawned agent to report its result in a specific shape, such as a screenshot or a list of changed files.

**Asking the human.** Subagents cannot talk to the user, and the docs say the user "can't guide them directly". Subagents cannot talk to each other either.

**Limits.** No numeric limits are given. Threads have separate workspaces. The docs say to keep work in a single thread when parts edit the same files or need constant coordination.

### 1.9 Augment

**Fetched:** https://docs.augmentcode.com/using-augment/remote-agent. This URL returned the general Agent page, not a remote-agents page.

**NOT FETCHED:** https://docs.augmentcode.com/using-augment/remote-agents returned 404.

Agent mode pauses before running terminal commands or using external integrations. The user approves with a play button or skips the step. Auto mode runs without pausing. Checkpoints are saved snapshots of the workspace, and each action can be expanded to review it. The fetched page does not describe remote-agent status, limits or PR format.

### 1.10 Linear

**Fetched**
- https://linear.app/developers/aig
- https://linear.app/developers/agent-interaction

**Delegation unit.** An agent session is created when the agent is mentioned or delegated an issue through assignment. A named human stays accountable for the work: "the final responsibility should always remain with a human."

**Progress model.** Linear sets the session state from the last activity the agent emitted. The six states are pending, active, error, awaitingInput, complete and stale.

The agent can emit five activity types:
- **thought:** an internal note or reasoning step
- **action:** a tool call, sent without a result when it starts and again with the result, in past tense, when it ends
- **elicitation:** a request for clarification or confirmation
- **response:** the work is done or a result is ready
- **error:** a failure

Only thought and action can be ephemeral, meaning the next activity replaces them.

A session plan (in technology preview) is a checklist. Each step has content and a status of pending, inProgress, completed or canceled. The whole array must be replaced at once.

**Timing.** The agent must answer the webhook within 5 seconds. It must emit an activity or set an external URL within 10 seconds, or the session is marked unresponsive.

**Asking the human.** The agent sends an elicitation. The human answers with a prompt activity, which reaches the agent as a `prompted` webhook.

**The six principles:**
- disclose that it is an agent
- work natively in the platform
- give instant feedback
- be transparent about internal state
- respect disengagement: stop when asked, and resume only on a clear signal
- keep humans accountable

### 1.11 Atlassian Rovo and Asana AI Teammates

**Fetched**
- https://support.atlassian.com/rovo/docs/agents/
- https://help.asana.com/s/article/ai-teammates (the article body did not render)
- https://asana.com/product/ai/ai-teammates

**NOT FETCHED:** https://www.atlassian.com/blog/announcements/rovo-agents-in-jira (404); the Asana Client Management help article and the Asana forum posts (snippets only).

**Rovo.** Agents are invoked from chat, automation rules or the editor. A custom agent can be set up as a teammate on Jira work items. Agents act outside chat only with the user's confirmation, and this applies to tools and skills alike. Owners review usage and transcripts after the fact, including a "Debug response" view. The fetched page shows no live status.

**Asana.** The product page says humans and AI Teammates work from the same plan. A Teammate's access is limited to the projects its owner picks, using existing permissions. The fetched pages do not describe the mechanics of checkpoints or approvals.

### 1.12 Slack and Microsoft HAX

**Fetched**
- https://docs.slack.dev/ai/agent-design
- https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf (Amershi et al., CHI 2019, pages 1 to 4 read)

**Slack.** The agent design guide says:
- Show a status right after the user's message.
- Keep each step to a short phrase, and keep plan blocks secondary to the final output.
- Batch related notifications into one message.
- Reply in threads, and keep replies in channels minimal.
- When a request is ambiguous, offer the options as buttons with brief context.
- Before an action with real-world effects, show a preview with approve, modify and reject.
- Do not confirm every action, because users grow fatigued and click through.
- For long work, post a message when work starts, update it with the plan as steps finish, then deliver the result.
- Update a message at most every 3 seconds.
- Streamed replies are limited to 10 minutes.
- `setStatus` can be `suspended` when the user must act first.

**HAX.** The paper gives 18 guidelines in four phases. It validated them with 49 design practitioners against 20 products.
- **Initially:** G1 make clear what the system can do; G2 make clear how well it can do it.
- **During interaction:** G3 time services based on context; G4 show contextually relevant information; G5 match relevant social norms; G6 mitigate social biases.
- **When wrong:** G7 support efficient invocation; G8 support efficient dismissal; G9 support efficient correction; G10 scope services when in doubt; G11 make clear why the system did what it did.
- **Over time:** G12 remember recent interactions; G13 learn from user behavior; G14 update and adapt cautiously; G15 encourage granular feedback; G16 convey the consequences of user actions; G17 provide global controls; G18 notify users about changes.

## 2. Comparison matrix

Each cell is a short paraphrase of section 1. "n/s" means the fetched pages are silent.

| Product | Delegation unit and brief | Return shape | Status model and cadence | Asking the human | Done and verified | Limits | Public failures |
|---|---|---|---|---|---|---|---|
| Anthropic research system | Subagent; brief = objective, output format, tools, boundaries; effort scaled | Condensed findings plus artifact references; citation pass | Lead plan saved to memory; too many updates named as a failure | Not covered | LLM judge rubric; CitationAgent | Effort tiers; about 15x tokens | Vendor-named: 50 subagents, endless search |
| Claude Code subagents and teams | Subagent or teammate with a spawn prompt; no inherited history | Summary under a no-authority header; agentId to resume | Tasks pending, in progress, completed, blocked; idle and completion notices are pushed | AskUserQuestion, lead only: 1–4 questions × 2–4 options, can be deferred | TaskCompleted and SubagentStop hooks block with feedback | Depth 3, 20 concurrent, maxTurns, maxBudgetUsd; 3–5 teammates suggested | #82687 silent reports; #104356 hidden prompt; #47930 idle token burn; #28627 ghost Human turn |
| Devin | Session with a six-part brief, playbook, tags, ACU limit | PRs, structured_output, parent and child ids | Status plus status_detail (working, waiting_for_user, waiting_for_approval, finished); Slack chip working, blocked, done | Thread question; diff with Apply; coordinator woken on need | Child verifies itself; clean-context reviewer on the diff | No child cap; ACU per child | No public tracker |
| OpenAI Codex and Agents SDK | Cloud task; subagent TOML; agent as tool or handoff | One consolidated summary; diff and tests to inspect | Active and Done lists; per-thread status in the IDE | Labeled approvals from background threads; fail and return to parent | Exit conditions; tool risk ratings | Concurrent-threads setting, default n/s | #32027 depth not enforced; #33447 thread cap ignored |
| Copilot coding agent | One task, one branch, one PR | Signed commits linked to the log; PR | Session log with tokens and duration; labels n/s | Steering applied after the current tool call; @copilot on the PR | Workflows need human approval; starter cannot approve | 59 min, 1 repo, 1 PR | #178998 timeout retry loop |
| Cursor | Cloud agent per task in a VM; multi-repo | PR plus verification artifacts; Bugbot comment with fix links | n/s; transcript through MCP; CI check states | Remote-desktop takeover | Artifacts; Bugbot resolved or unresolved | Spend limit; oversized PRs skipped | Not fetched |
| Factory | Task call with complexity routing | Single final message | Streamed todos; background id with notify or poll | Subagent reports back; parent decides | n/s | Depth 1; autonomy clamp | Not fetched |
| Jules | Prompt plus repo and branch; plan approval | Summary of files, runtime, lines, branch | Live activity feed | Feed request plus browser notification | Summary only | 3/15/60 concurrent; 15/100/300 a day | Not fetched |
| Amp | Task or Read Thread subagent; agent-to-agent | Final summary only | n/s | Subagents cannot reach the user | User asks for a result shape | n/s | Not fetched |
| Linear | Session from mention or assignment | Response activity | Six states from the last activity; plan checklist; 5 s and 10 s deadlines | Elicitation answered by a prompt | Response activity; human accountable | Timing deadlines | n/a |
| Slack | Thread | Short summary back to the thread | Immediate status; plan updates; at most every 3 s | Option buttons; preview with approve, modify, reject | n/s | 10 min stream | n/a |
| Rovo and Asana | Work item or teammate; scoped access | n/s | n/s (Rovo reviews transcripts after the fact) | Confirmation before acting outside chat | n/s | Permission scope | Not fetched |

## 3. The best practice on each dimension

- **Brief: Devin.** Its six-part brief makes the judgment calls up front, and its playbooks add Postconditions, Forbidden Actions and "What's Needed From User". Anthropic's four parts (objective, output format, tools, boundaries) are the minimum.
- **Return shape: Cursor.** Its PRs carry evidence of how the change was verified (screenshots, video, logs), not just claims. Devin's `structured_output` and the parent and child ids are the best machine-readable return.
- **Status model: Linear.** The state is derived from the last thing the agent emitted, so it cannot drift from what the agent actually did. Linear also has explicit awaitingInput and stale states and hard response deadlines. Devin's `status_detail`, which separates waiting for the user from waiting for approval, is the closest equivalent.
- **Status cadence: Slack.** It sets an immediate first status, batched notifications, one message updated in place, a cap on update frequency, and a warning against confirmation fatigue. Anthropic shows the opposite failure, excessive updates.
- **Asking the human: Claude Code's AskUserQuestion.** It is bounded and structured (labeled options, one free-text escape) and can be deferred. Limiting it to the lead keeps one voice talking to the human. Slack's preview with approve, modify and reject is the best pattern for an action with real-world effect.
- **Done and verified: GitHub Copilot.** Workflows wait for a human and the agent's starter cannot approve, so done is enforced by the platform rather than claimed by the agent. For agent-side gates, Claude Code's TaskCompleted and SubagentStop hooks are the best: a failing check sends the agent back to work with the reason.
- **Limits: Claude Code.** It documents a default depth, a concurrency cap with a named error, turn and spend caps, and a recommended team size. The Codex issues show what happens when documented limits are not enforced.
- **Failure transparency: Anthropic.** Both its blog and its docs name the lead's own failure modes: doing the work itself, stopping early, spawning too many agents.

## 4. Gaps nobody fills

1. **No product reliably tells the lead when a worker is blocked or stalled.** Claude Code's teams lose reports (#82687) and hide blocking prompts (#104356). Copilot loops on timeouts (#178998). Only Linear marks a session stale, and only for a missing first response.
2. **No product makes the lead verify a worker's claim of done.** Products verify the code (CI, Bugbot, Devin Review), but none checks the lead's acceptance of the report. A lead can still pass a self-report upward unchecked.
3. **No product enforces a brief.** Devin and Anthropic publish what a brief should contain. None validates a brief before dispatch; the closest is Claude Code's TaskCreated hook, which can cancel a task.
4. **No product bounds noise from workers to the lead.** Idle notifications cost #47930's reporter about 13% to 22% of input tokens. Slack caps updates to humans, but no product caps worker-to-lead traffic.
5. **No product cleanly separates control messages from human messages.** #28627 shows a system notice taken as a human order. Claude Code's labeling of agent messages is the only defense documented.
6. **No product shows the effective limits at runtime.** Codex #33447 shows a configured cap silently replaced by another.
7. **No product combines a board, a decision inbox and a report in one surface.** Linear has states and elicitations, and Devin has a Slack chip. None merges pending decisions across several workers into one batched question for the owner.
8. **No product checks a worker's report against its brief's success criteria.** Return shapes are free text or PRs; nothing ties the return to the criteria the brief set.
9. **Cadence is not tuned to the human.** Apart from Slack's 3-second cap and Devin's mute, no product sets how often to report from what the human prefers. HAX G3 (time services based on context) and G13 (learn from user behavior) go unimplemented in these agent products.
