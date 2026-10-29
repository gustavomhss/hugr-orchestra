# E3: How AI agents operate project-management tools, and what makes an agent-maintained board trustworthy

## Scope and date

- Date of research: 2026-10-28.
- Question: how production PM tools let agents write to boards (issues, status, fields, comments), when they write, how they signal uncertainty, how humans correct them, and reported failures. Input for Maestro as the sole board writer.
- Evidence classes used: **V** = vendor doc or vendor changelog (primary); **U** = user report or community thread; **O** = opinion or practitioner/vendor blog. Vendor marketing pages are treated as **V** only for what they state as product behavior, and flagged where they are third-party aggregators.
- Method limits: WebSearch and WebFetch only. Several primary pages returned 404 or only a title (noted per product). GitHub Projects automation docs were not retrieved. Claims marked "not found" mean the search did not surface a primary statement, not that none exists.

## Per-product findings

### Linear (Agents, Agent Interaction Guidelines)

- **Model (V).** Assigning an issue to an agent sets it as the issue's `delegate`, not `assignee`, so a human keeps ownership. Source: https://linear.app/developers/agents
- **Guidelines (V).** The AIG page makes these normative points: agents must disclose they are agents; "An agent cannot be held accountable", so "final responsibility should always remain with a human"; agents "should provide instant feedback"; agents "should respect requests to disengage" and resume only after "a clear signal"; agents should show whether they are "thinking, waiting for input, executing, or finished"; humans must be able to inspect reasoning and tool calls. Source: https://linear.app/developers/aig.md (the HTML path https://linear.app/developers/aig returned 404 on fetch; the .md worked).
- **Best practices (V).** Must: acknowledge within 10 seconds with a `thought` activity; post `response` when done; post `elicitation` when input is needed and `error` when blocked; rebuild history from Agent Activities, not comments. Must not: treat comments as source of truth ("they are editable and may have changed since your agent's last run"); change triage status or take over assignment when an automation has delegated the issue. Status rule: when delegated work starts on an issue not in started/completed/canceled, move it to the lowest-position started-type status. Source: https://linear.app/developers/agent-best-practices
- **Admin and visibility (V).** Workspace admins choose which teams can use agents; agents are not billable seats; agent user pages, "My issues", and Insights segmented by Delegate expose agent involvement. Agents "cannot sign in to the app, access admin functionality or manage users." Source: https://linear.app/docs/agents-in-linear
- **Gaps.** No rule in the Linear docs found on uncertainty handling beyond elicitation, on undo, or on how agent status changes are audited. The `docs/agents-in-linear` page states none about status-change rules.
- **Signal of uncertainty.** Structured: `elicitation` activity (ask) vs `error` (cannot proceed). This is the cleanest published separation of "need input" from "failed".
- **Human correction.** Reassign the delegate; the agent stops on a disengage request. Activity log is the record.

### GitHub Copilot cloud agent and Agent HQ

- **Assignment flow (V).** Assigning an issue starts a session that creates a draft PR and requests review when done. One PR per task; one repository per run; one branch. Source: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent (fetched) and a search snippet of the Microsoft Learn module (O, third-party-hosted training material): https://learn.microsoft.com/en-us/training/modules/github-copilot-code-agent/2-security-risks-limitations-copilot-code-agent
- **Writes to the board.** Not established. The fetched page says the page "doesn't say whether the cloud agent changes labels, status, or project fields." It mentions Chat "configured with tools for creating or updating issues" but not that the agent uses them. This is a relevant absence: the agent's writes are concentrated in code and PR, not the PM layer.
- **Progress and input (V).** Progress is visible through "session logs show the work and tools used"; humans can "steer the work" mid-run. No clarifying-question mechanism is documented on that page. Hard limit: "maximum execution time of 59 minutes," not extendable.
- **Human control (V, from the Microsoft Learn snippet and GitHub troubleshooting snippet).** Copilot only acts on comments from people with write access; once a PR is merged or closed it no longer responds; workflows do not run automatically on its pushes until a human approves. Stalled sessions time out after an hour; retry = unassign and reassign.
- **Agent HQ / mission control (V announcement, 2025 coverage).** Mission control is described as the "central command center for assigning, steering, and tracking" multiple agents, plus an enterprise control plane with "audit logging." Source: https://github.blog/news-insights/product-news/welcome-home-agents/ (listed in search results; not fetched in full) and https://sdtimes.com/ai/github-unveils-agent-hq-the-next-evolution-of-its-platform-that-focuses-on-agent-based-development/ (O, trade press).
- **GitHub Projects automation.** Not found. Searches returned no Projects docs. Treat as open.

### Atlassian Jira with Rovo agents

- **Model (V).** Agents can be assigned work items, @mentioned, or triggered by workflow transitions. Output lands in an "Agents" section visible only to the requester until shared as a comment or attachment. "Publish" "completes the task but doesn't share the output." Source: https://support.atlassian.com/jira-software-cloud/docs/collaborate-on-work-items-with-ai-agents/ (fetched).
- **Permissions (V, same page).** Site admin enables Rovo/MCP agents; each agent needs a one-time collaboration grant; workflow-transition triggers need space admin plus edit-workflow permission; agent use consumes Rovo credits starting 2026-12-03.
- **Writes and history (V, partial).** Atlassian says agents use existing permissions and that "approved agent updates are recorded with the work-item history." The page does not say how agent field edits appear in history, and does not say an agent can perform transitions itself. This is a documented gap for our purposes.
- **Attribution (O).** A vendor blog (Revyz) claims Rovo actions inherit the invoking user's identity, so chat-triggered changes may show the human rather than the agent. Source: https://www.revyz.io/blog/human-ai-collaboration-scaling-fast-without-losing-your-jira-data. Unverified against Atlassian docs; matters for audit.
- **Reported failure (U).** Community thread "Rovo agent failing to update issue fields Part #2" (search snippet, Nov 2025): a user reports the agent repeatedly said a Story Points update succeeded when the value never changed; on questioning it admitted it could not write custom fields and that its earlier claims were inaccurate. Source: https://community.atlassian.com/forums/discussion/3151384/rovo-agent-failing-to-update-issue-fields-part-2 . The fetch returned only the title, so this is from the search snippet, not the full thread. Also reported (U, titles only): a suspected unintended deletion after an agent "Create Jira work items" action; agents that stopped updating after an April 2026 incident. Source: https://community.atlassian.com/forums/Rovo-questions (listing).

### Notion Agent

- **Approval modes (V).** Three modes per chat: "Always ask" (no change happens until approved); "Review for me" (default; pauses only when the agent flags something as "potentially unsafe", with the warning that it "won't always flag the same things you would"); "Skip all approvals" (runs everything; you see it after). The skip mode "won't check before changes that are hard to undo." Source: https://www.notion.com/help/choose-how-notion-agent-asks-for-your-approval (fetched). The approval docs are relevant: bulk database changes (e.g., renaming a property across 1,000 rows) are listed as something that may need approval (search snippet of same article).
- **Undo (V).** Ask the agent to undo; page history restores earlier versions; connected-app actions must be fixed in that app. "Switching modes mid-conversation doesn't undo anything your agent already did."
- **Signal.** The agent's own review is the uncertainty signal in default mode, and the docs admit it is imperfect.

### Asana AI Teammates

- **Permissions (V).** Teammates follow the same rules as colleagues: Editor, Commenter, Viewer; they "cannot elevate its own permissions"; they only see objects they are added to; responses are limited to objects both the requesting user and the Teammate can access. Source: https://help.asana.com/s/article/understanding-access-control-for-ai-teammates (via search snippet; not fetched in full).
- **Audit (V, research blog).** Each Teammate has "an identity, permissions, and an audit trail." Source: https://asana.com/ko/inside-asana/ai-teammates-research (search snippet, Korean locale; treat as the same vendor page).
- **Admin (O).** Third-party guide claims admins can restrict who creates or modifies Teammates. Source: https://www.gend.co/blog/asana-ai-admin-settings-governance (third-party; verify).

### ClickUp Brain and Super Agents

- **Claims (V marketing, search snippets).** Real-time audit trails: "All actions are logged in real time audit trails"; granular per-agent permissions; agents may run "continuously in the background." Source: https://siliconangle.com/2026/05/12/exclusive-clickup-endows-brain-assistant-agentic-capabilities/ and https://clickup.com/ai (marketing).
- **Limits (V, help center snippet).** "Agents cannot delete Checklists or Checklist items. Brain can delete..." Tool availability "vary by plan and user role." Source: https://help.clickup.com/hc/en-us/articles/33032484272023-What-are-ClickUp-AI-tools (snippet).
- **Status.** Marketing says AI teammates "manage updates, blockers, and progress automatically." This is the strongest auto-status claim among the vendors; no docs found describing how uncertainty is shown or how humans reverse it. Classify as O/marketing.
- **Read-only pattern (V).** A stale-task agent "never creates, edits, deletes, or modifies anything"; it reports and suggests. Source: ClickUp Stale Project Task Finder template (search snippet, https://clickup.com/brain/agents/templates/listings/stale-project-task-finder).

### monday.com agents

- **Activity log and undo (V, support snippet).** "you can view the agent's actions and undo them from the activity log." Source: https://support.monday.com/hc/en-us/articles/38411316441874-Run-and-manage-your-AI-agents (snippet). Permissions: read / read-write / edit / create per data scope. Simulation mode to validate before going live (use-case page, V marketing).
- **Approvals.** Human-in-the-loop is described as "your team approves before anything moves forward" (marketing). A third-party page describes a review queue where the agent acts only on explicit opt-in (O, arahi.ai; unverified).

### Height (autonomous PM; shut down)

- **What it was (V, press).** Height 2.0 launched October 2024 as "autonomous"; an AI agent handled "updating specs, pruning backlogs, and triaging bugs." Source: https://getcoai.com/news/height-launches-autonomous-project-management-tool (search snippet; also https://www.businesswire.com/news/home/20241008197812/en).
- **Shutdown.** Announced 2025-03-20 by CEO Michael Villar with about six months' notice; final day 2025-09-24. Sources: https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025/ and secondary aggregator snippets. The company's own announcement was not retrieved.
- **Reasons.** No stated cause found from the company. A profile suggests flexibility did not remove "the treadmill of manually maintaining task metadata" and that "whether autonomous project management is a real category... is not obvious yet" (O, interview profile https://yespress.io/michael-villar). A third-party analysis cites funding pressure (O, speculation). Do not treat any reason as established.
- **Relevance.** Height is the one product whose whole bet was an agent maintaining the board. Its closure is evidence about the category, not about the trust practices. Reason is unknown.

### Plane and Shortcut (MCP-first)

- **Plane.** No official statement found on which MCP server is maintained; community servers can create and update issues with an API key (O). Plane's blog lists the exposed context (work items, states, cycles, comments) and notes write ability "depending on the server's capabilities and permissions." Source: https://plane.so/blog/what-is-mcp-for-project-management (blog, O). Tool-scoping profiles (worker, planner, reviewer) exist in a community Go server (O).
- **Shortcut.** Official hosted MCP server reported via third-party directory (O): agents read and update stories, epics, iterations, docs; OAuth. Read-only toggle exists in community servers (`SHORTCUT_READONLY`), tool scoping via env. Source: https://glama.ai/mcp/servers/@WynnD/mcp-server-shortcut (community; O). Official Shortcut docs not verified.

### Practitioner and cross-vendor patterns (O)

- BuildBetter guide: the agent should draft; "a named human owner" decides status colour and trade-offs. Source: https://blog.buildbetter.ai/how-to-keep-projects-up-to-date-automatically-with-ai/ (fetch returned 404 on the www path; the blog path came from search).
- Rezolve docs separate a pull-based "stale list" the agent visits from a push-based pop-up that interrupts; timing and disable are the levers against over-notification. Source: https://docs.rezolve.ai/docs/helpdesk/agent-assist/proactive-status-update.
- Wrike community pattern: scheduled detection, then escalation, then a single notification to the PM. Source: https://community.wrike.com/discussion/2736/stale-task-escalation-agent.
- A practitioner LinkedIn post (O): weekly Claude+Jira+Slack health check with five checks (missing descriptions, stale WIP, untouched 60+ days, stuck in backlog 2+ weeks, never-triaged priorities) posted as one digest. Source: search snippet only (linkedin, Violetta Gaidak, https://es.linkedin.com/in/violetta-gaidak). Relevant pattern: batch, not per-item pings.
- Searches for "agent noise / notification fatigue" surfaced no detailed practitioner post. The batched-digest pattern is the convergent answer but its evidence base is thin.

## Board-operating practices that converge

1. **Separate delegation from ownership.** Linear (delegate vs assignee), Atlassian (agent output visible only to the requester until shared), Asana (agent is a colleague with its own identity and capped permissions). The human stays accountable; the agent is named as the actor.
2. **Structured "need input" and "cannot proceed" are distinct signals.** Linear's `elicitation` vs `error`. Do not encode a question as a status change or a comment.
3. **Agent identity is always visible.** Linear disclosure; Notion and Atlassian label agent output; Asana gives each Teammate an identity.
4. **Permissions capped to the human's own or narrower.** Asana "cannot elevate its own permissions"; Atlassian per-agent grants; ClickUp per-agent permissions; Linear agents "cannot ... manage users."
5. **Approval mode is a setting the human picks, with a default that is not "skip".** Notion's three modes (default "Review for me"); monday's review queue; ClickUp read-only stale-finders.
6. **Undo lives in the tool's history, not in the agent's memory.** Notion page history; monday activity log undo; Asana/Atlassian audit trails. Notion explicitly says mode switches do not undo.
7. **Comments are not truth; read the activity/state log.** Linear: rebuild from activities, comments are editable. This is the most direct guidance on "what changed since you looked".
8. **Batch, don't ping.** Rezolve pull vs push; Wrike single notification; the weekly digest pattern.
9. **Agents report, humans decide status.** BuildBetter (O); ClickUp stale-finder read-only; Linear keeps triage state and assignment with humans when an automation delegated the issue.
10. **Stop and resume on explicit signal.** Linear AIG disengage rule; GitHub's "stalled session times out after an hour; retry by unassign and reassign."
11. **Hard limits are published.** GitHub: one PR, one repo, 59-minute cap. Linear: no admin access. ClickUp: cannot delete checklists. Publishing limits makes the agent's scope checkable.

## Failure modes

| Failure | Evidence | Class |
|---|---|---|
| Agent claims a write succeeded when it did not (custom fields) | Atlassian community thread, admitted after questioning (search snippet) | U |
| Unexpected bulk or destructive change (suspected mass delete) | Atlassian community title only | U (unverified) |
| Edit-in-place of human-owned fields without visible actor (attribution unclear) | Revyz blog says invoking user identity is used; Atlassian silent on history entries | O / gap |
| Auto-approval mode runs unsafe or irreversible actions | Notion "Skip all approvals" warning; "won't check before changes that are hard to undo" | V (vendor warning) |
| Agent review misses what a human would flag | Notion default-mode warning "won't always flag the same things you would" | V (vendor admission) |
| Undo does not reverse what already happened after a mode switch | Notion help text | V |
| Status updates that are automatic and unexplained | ClickUp "manage updates, blockers, and progress automatically" (marketing, no uncertainty display found) | O |
| Autonomy product shut down | Height, closed 2025-09-24; cause not confirmed | V (fact) / cause unknown |
| Comments read as truth though editable | Linear best-practice warning | V |
| Stall without signal | GitHub stalled session; 59-minute hard stop | V |
| Over-notification from pop-ups | Rezolve design rationale | V (vendor design) |

## Implications for an agent that is the sole board writer

These are recommendations derived from the evidence above. The strongest evidence is for items 1, 2, 4, 6, 7; items 3, 5, 8 rest on thinner evidence.

1. **Maestro is the delegate, never the owner.** Keep human ownership of each Project, Epic, and Issue. Record the human who approved each decision record. Every agent write names the actor as Maestro.
2. **Two channels for "I need you" vs "I failed".** Model the owner question as its own record type (question with recommended option), distinct from a status change and from an error. This follows Linear's elicitation/error split.
3. **Do not treat the board's own text as truth.** When resuming, rebuild from the board's event log (what changed since the last run), not from the last summary. Cards may have been edited by humans or other tools since.
4. **Status must cite evidence.** A stage move (Building to Review, Review to Shipped) should carry a link to the branch, PR, or test result. Stage moves without evidence are a known failure class (Atlassian custom-field claims were false; the same risk applies to "done").
5. **Never claim a write that did not read back.** After each write, read the record and compare. An unverified "updated" is the Atlassian failure mode.
6. **Undo and audit.** Every mutation is logged with before and after values and a reason. Do not rely on mode switches or "undo" to reverse past writes; provide an explicit revert action per record type, as Notion's docs imply they cannot be assumed.
7. **Batch and digest.** Send one periodic digest (stale WIP, aging, blocked, pending questions) rather than per-change notifications. Reserve immediate notifications for owner-question records and for failures that block the seat. This answers notification fatigue without claiming it is solved.
8. **Stale-card detection is read-only first.** A stale finder reports; it does not move cards. Only move a stage when the evidence rule in item 4 is met.
9. **Scope the writer.** Maestro writes only the Projects board; it does not change assignment or triage of issues delegated to humans, and it cannot change permissions. Mirror Asana's "cannot elevate" and Linear's "cannot manage users".
10. **Idle or stopped is a state.** Surface when a seat stalls (GitHub's one-hour timeout is the precedent) so the human can unassign and reassign rather than wait silently.
11. **Explicit attribution in history.** Atlassian's gap on how agent edits appear in history is a warning. Maestro's writes must carry the actor identity in the record itself, not only in the tool's log.
12. **Plan for the category risk.** Height shows an autonomous board can fail commercially; the cause is unknown, so do not assume the cause. Keep Maestro's board useful even if the agent is switched off: the human should be able to read and edit it with no agent.

## Sources

Vendor (V)
- https://linear.app/developers/agents (fetched)
- https://linear.app/developers/aig.md (fetched; https://linear.app/developers/aig returned 404)
- https://linear.app/developers/agent-best-practices (fetched)
- https://linear.app/docs/agents-in-linear (fetched)
- https://linear.app/changelog/2025-07-30-agent-interaction-guidelines-and-sdk (search snippet)
- https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent (fetched)
- https://github.blog/news-insights/product-news/welcome-home-agents/ (search snippet)
- https://support.atlassian.com/jira-software-cloud/docs/collaborate-on-work-items-with-ai-agents/ (fetched)
- https://www.notion.com/help/choose-how-notion-agent-asks-for-your-approval (fetched)
- https://help.asana.com/s/article/understanding-access-control-for-ai-teammates (search snippet)
- https://asana.com/ko/inside-asana/ai-teammates-research (search snippet)
- https://siliconangle.com/2026/05/12/exclusive-clickup-endows-brain-assistant-agentic-capabilities/ (search snippet)
- https://help.clickup.com/hc/en-us/articles/33032484272023-What-are-ClickUp-AI-tools (search snippet)
- https://support.monday.com/hc/en-us/articles/38411316441874-Run-and-manage-your-AI-agents (search snippet)
- https://plane.so/blog/what-is-mcp-for-project-management (search snippet)
- https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025/ (search snippet)
- https://getcoai.com/news/height-launches-autonomous-project-management-tool (search snippet)
- https://docs.rezolve.ai/docs/helpdesk/agent-assist/proactive-status-update (search snippet)

User reports / community (U)
- https://community.atlassian.com/forums/discussion/3151384/rovo-agent-failing-to-update-issue-fields-part-2 (title and search snippet; fetch returned title only)
- https://community.atlassian.com/forums/Rovo-questions (listing; titles only)
- https://community.wrike.com/discussion/2736/stale-task-escalation-agent (search snippet)

Opinion / third-party (O)
- https://www.revyz.io/blog/human-ai-collaboration-scaling-fast-without-losing-your-jira-data
- https://learn.microsoft.com/en-us/training/modules/github-copilot-code-agent/2-security-risks-limitations-copilot-code-agent
- https://sdtimes.com/ai/github-unveils-agent-hq-the-next-evolution-of-its-platform-that-focuses-on-agent-based-development/
- https://yespress.io/michael-villar
- https://www.gend.co/blog/asana-ai-admin-settings-governance
- https://arahi.ai/ai-agent/monday/workflow-automation
- https://glama.ai/mcp/servers/@WynnD/mcp-server-shortcut
- https://blog.buildbetter.ai/how-to-keep-projects-up-to-date-automatically-with-ai/ (search snippet; www path 404)
- https://es.linkedin.com/in/violetta-gaidak (search snippet)
- https://community.wrike.com/discussion/2736/stale-task-escalation-agent

Not found (gaps to close in a follow-up)
- GitHub Projects built-in automation and whether it can trigger or be written by Copilot agents.
- Linear AIG HTML page (only the .md was retrieved).
- Atlassian: whether agent field edits appear as history entries.
- Official Height shutdown announcement and any founder post on causes.
- Official Plane and Shortcut MCP docs.
