# E5 — Published orchestration, delegation and PM skills, prompts and agents

## Scope and date

- Date of research: 2026-10-28.
- Track: published skills, plugins, prompts and subagent definitions for orchestration / delegation / project management (lead and PM craft), and what they teach about skill-tree authoring.
- Method: GitHub REST metadata (stars/forks/dates) fetched live; primary files (SKILL.md, README) fetched from `raw.githubusercontent.com` and summarized; docs pages fetched; third-party aggregator pages used only where noted.
- Star counts are point-in-time snapshots taken today. Third-party aggregators disagreed by an order of magnitude for some repos; only API figures are used here.
- Evidence classes used below:
  - **A**: primary source text read (repo file or official doc), summarized.
  - **B**: third-party catalog or blog summary of a primary source (not read directly).
  - **C**: self-reported or vendor-reported claim, not independently verified.
  - **D**: user or practitioner feedback. None was found in this pass; see gaps.
- Planning content = how work is scoped, specified, sliced, estimated (what to build). Lead content = how an orchestrator briefs, dispatches, monitors, reviews, integrates, and reports on other agents (who does it, how it lands). Maestro is a lead; only LEAD content maps directly onto its craft.

## Collections

| Name | URL | Stars / date (API, 2026-10-28) | Lead content | Planning content | Quality notes |
|---|---|---|---|---|---|
| obra/superpowers | https://github.com/obra/superpowers | 307,017 stars, 27,322 forks; created 2025-10-09; pushed 2026-10-23; MIT. Plugin marketplace install. | Strongest lead content found. `subagent-driven-development`: one fresh implementer per task, never parallel implementers; per-task brief written to a file; explicit model per dispatch; implementer statuses DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED; two-stage review (spec, then quality) with a diff file, not inline diffs; bounded fix loop (rounds 1-3 resume same implementer, 4-5 escalate model, then adjudicate with recorded rulings); controller must not fix code itself, must not pre-judge findings, must not pause for check-ins; stop only for irreversible/security/outside-worktree actions; waits in 5-10 minute stretches; ledger file because conversation memory does not survive compaction. `dispatching-parallel-agents`: independence test (no shared state, no sequential dependency, understandable alone, fixing one does not affect others); one scope per agent; self-contained context; all dispatches in one response; lead reviews summaries, checks conflicts, runs full verification, spot-checks. `requesting-code-review`: mandatory after each task and before merge; reviewer receives SHA range plus description and requirements only; verify feedback before acting; push back with evidence. | Planning is light: a `writing-plans` / `executing-plans` pair exists upstream (not read in this pass) and the controller reads "the plan and its spec" before Task 1 with a pre-flight conflict scan. | A (three SKILL.md files read). Very large popularity; no independent effectiveness study found. Skills are written in a strongly prescriptive, rule-heavy register. |
| obra/superpowers `writing-skills` | https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md | (same repo) | Meta: how to author skills (see authoring lessons). | n/a | A. Explicit TDD-for-docs method; pressure-scenario testing with a subagent. |
| automazeio/ccpm (Claude Code PM) | https://github.com/automazeio/ccpm | 8,422 stars, 840 forks; created 2025-08-18; pushed 2026-10-19; MIT. | PM-as-lead: parallel streams from one issue, agents launched per work stream in a shared epic worktree (`../epic-<name>/`), each scoped to its own files, commit format `Issue #N: ...`. Track via bash scripts scanning local files (standup, status, next, blocked). Tasks marked `parallel: true`. | Strong planning pipeline: guided brainstorm to PRD, PRD to technical epic, epic decomposed into tasks (acceptance criteria, dependencies, parallel flags), capped at 10 tasks per epic by default; sync to GitHub epic issue and sub-issues (via `gh-sub-issue` with task-list fallback); explicitly avoids the GitHub Projects API. | A (README read). Self-reported claims (89% less context-switching time, 75% fewer bugs, 3x faster; own eval 100% vs 27.7%) — class C. No complaints found in README; no independent evidence. Requires git + gh + GitHub repo. Natural-language triggers, slash commands moved to a `v1` branch. |
| bmad-code-org/BMAD-METHOD | https://github.com/bmad-code-org/BMAD-METHOD | 54,673 stars, 6,116 forks; created 2025-04-13; pushed 2026-10-27; license field "Other" (verify before reuse). | Scrum-master persona turns plans into development stories for a dev persona (B; story-file handoff described by aggregators, not verified in README). Persona set includes PM, Architect, Developer, UX, Scrum Master, QA, Technical Writer. | Heavy planning ceremony: analyst brief, PM PRD with functional and non-functional requirements and epics, architecture. | A (README) for the current framing: "sizes itself to the work", small changes go straight to build, durable context across chats. Persona count varies by source (12+ vs 21+). Aggregator star figures range from 8k (stale Aug 2025 list) to ~49k (June 2026 write-up); API figure used. The README does not itself name SM/PM personas or story files, so the lead content above is class B. |
| VoltAgent/awesome-claude-code-subagents | https://github.com/VoltAgent/awesome-claude-code-subagents | API not fetched; aggregators gave 1.5k–7.5k stars (B, unreliable). README lists 161+ agents in 10 categories; MIT (per aggregator). | Meta & Orchestration category: agent-organizer, multi-agent-coordinator, workflow-orchestrator, task-distributor, codebase-orchestrator. No explicit tech-lead agent. | Business & Product has `project-manager`. | A (README). Agent file template: frontmatter (name, description, tools, model) then role, checklists, Communication Protocol and Development Workflow sections. Maintainers state agents are unaudited "as is". Lots of breadth, shallow per-agent discipline: the best reference for file template, weak as lead doctrine. |
| contains-studio/agents | https://github.com/contains-studio/agents | No API data fetched. | Project Management group has `project-shipper` (tagline: launch products that don't crash) and `studio-producer` (keep teams shipping, not meeting). Taglines only. | Same. | A (README). 37 agents in 8 groups. Frontmatter with 3-4 usage examples and a color; system prompt recommended at 500+ words covering identity, responsibilities, constraints, success metrics. Handoff mechanics not described. Lead craft is thin: taglines only. |
| claude-task-master (eyaltoledano) | https://github.com/eyaltoledano/claude-task-master | No API data fetched. | Task-status navigation (list / next / show), subtasks, dependencies, tags, MCP tools for editors. | PRD parse into tasks (`parse-prd`); recommends detailed PRD. | A (README). MCP exposes 36 tools (about 21k tokens) by default, reducible to 15 or 7 via env var (C: own figures, unverified). License MIT with Commons Clause (not OSI). Lead content is task-tracking, not delegation doctrine. |
| Kiro steering and specs | https://kiro.dev/docs/steering/ | No API data (product, not repo). | Steering files as persistent project knowledge; inclusion modes always / conditional (fileMatch) / manual (`#name`) / auto (matched by description). Conditional and auto loading is the reusable idea. | product.md, tech.md, structure.md as foundation files. Spec workflow exists but the steering page does not describe it (not verified here). | A (docs page). Good model for progressive context loading by path/description. |
| Claude Code subagents (official) | https://code.claude.com/docs/en/sub-agents | n/a (vendor doc) | Facts that constrain any lead design: subagents can spawn subagents, default depth 3 (env `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`); delegation driven by `description`; each subagent has isolated context and receives only the delegation message plus CLAUDE.md and git status; final report returns to parent; default 20 concurrent subagents (env `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`); `tools` allowlist / `disallowedTools` denylist; description block warning at 15,000 tokens total. | n/a | A. Authoritative. Note the parallel-cap and depth facts when designing dispatch rules. |
| Roo Code orchestrator mode (Boomerang) | https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks (also docs.roocode.com, redirects) | No API data (not checked). | Orchestrator has no edit rights; delegates with `new_task` (mode + message); subtasks get no parent context, only the message; results return only as the `attempt_completion` summary; subtask instructions should carry full context, clear scope, "do only this", and a concise completion summary; default requires user approval of each subtask creation and completion. Custom slug `orchestrator` overrides built-in (community blog, B). | None in scope. | A (docs summary) for mechanism; B for the FAQ sample prompt. Clean minimal-context model: the summary is the only return channel. |
| Anthropic `skills` repo | https://github.com/anthropics/skills | 184,406 stars, 21,808 forks; created 2025-09-22; pushed 2026-10-09; license field null. | Not lead content. | Not in scope. | A (skill-creator SKILL.md read). Authoring guidance only. |
| ruvnet/claude-flow (now also presented as ruflo) | https://github.com/ruvnet/claude-flow | 79,887 stars, 9,370 forks; created 2025-06-02; pushed 2026-10-28; MIT. Self-described "agent harness", swarms, memory, RAG, integrations. | Swarm coordination and orchestration framework (scope too broad to read in this pass). | n/a | Not read in depth. Breadth-first platform, not a lead doctrine. Treat star count as popularity, not endorsement. Claims are self-described. |
| SuperClaude_Framework | https://github.com/SuperClaude-Org/SuperClaude_Framework | 23,915 stars, 1,986 forks; created 2025-06-22; pushed 2026-09-27; MIT. | Not read in this pass. | n/a | Not checked beyond metadata. |

Not covered in depth (gap): wshobson/agents, Roo Code custom orchestrator sample prompt full text, SuperClaude personas, Kiro spec workflow pages, contains-studio agent bodies.

## Recurring lead rules

Each rule below is supported by at least two collections unless marked.

1. **Dispatch from a file, not from memory.** Write each brief to its own file; the brief is the only requirements source; the worker starts with no session history (superpowers A; Claude Code subagents A; Roo A; dispatching-parallel-agents A).
2. **Brief contents: scope, goal, constraints, expected output, and the exact interfaces it may rely on.** Include error text or the specific acceptance criteria. Do not paste prior-task history (superpowers A; dispatching-parallel-agents A; Roo A; CCPM B).
3. **Parallel only when independent.** Test: no shared state, no sequential dependency, understandable alone, and one fix cannot change another's result. Parallel workers on the same files or shared state are forbidden (superpowers A; CCPM A, which scopes each agent to its own files; dispatching-parallel-agents A).
4. **Implementers are serial by default; parallelism is for disjoint scopes.** superpowers serializes implementers while dispatching parallel investigators; CCPM parallelizes task streams with file scoping. Both are consistent with rule 3.
5. **Record the base commit before dispatch and the head commit after.** Reviewers get a SHA range (superpowers A).
6. **Reviewers get the diff file and the requirements, not your session.** Independent cold review; never review it yourself to save time (superpowers requesting-code-review A; superpowers subagent-driven A).
7. **Two review gates: spec compliance, then quality.** Both verdicts required; self-review by the implementer never replaces it (superpowers A).
8. **Closed status vocabulary from workers.** DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED; a report without a verdict is not accepted (superpowers A).
9. **Bounded fix loops with escalation and recorded rulings.** Same worker for early rounds, a stronger model later, then the lead adjudicates and writes the ruling down (superpowers A).
10. **Lead does not fix code.** Lead routes the fix back to a worker; lead never pre-judges a finding or tells a reviewer to ignore an issue (superpowers A).
11. **Verify feedback before acting; push back with evidence.** Critical fixed now, Important before moving on, Minor logged (superpowers A).
12. **Do not wait with short polls; post a status line between bounded waits; reconcile live children.** (superpowers A)
13. **Ledger outside conversation memory.** A file records dispatches, base SHAs, verdicts, rulings, completions. Conversation memory does not survive compaction (superpowers A).
14. **Stop conditions are narrow.** Ask only for irreversible or destructive actions, security-sensitive actions, actions outside the worktree (merges, pushes to shared branches, publishes), or a plan so broken that every path is a guess. Otherwise record a ruling and continue (superpowers A). Compare Roo default that requires approval for each subtask (A), which is the opposite default.
15. **Track status from the source of truth, not a separate board.** Issue state is project state; comments are the audit trail; local files drive standup/status scripts (CCPM A). No board/Projects API used (CCPM A).
16. **Decompose into bounded tasks.** CCPM caps 10 tasks per epic and records acceptance criteria, dependencies and a parallel flag per task (CCPM A). Taskmaster: dependencies per task (A).
17. **Return only the summary upward.** Subagent final report is the only thing the parent sees; verbose work stays out (Claude Code A; Roo A).
18. **Model is an explicit per-dispatch choice; cheapest adequate tier for implementers, strongest for architecture and final review** (superpowers A; VoltAgent sets model per agent, A).
19. **Waiting for workers must not block other workers.** (Claude Code concurrency limits A; not a conflict).

Not found in any collection (absent, so do not assume): wave or DAG scheduling with a merge order distinct from dispatch order (this is in Maestro's own material elsewhere); throughput or quality measured by independent evaluation; explicit protocol for handing a half-finished worker to another worker after death (superpowers resumes the same implementer; no mention of push-early recovery).

## Skill-tree authoring lessons

Sources: superpowers writing-skills (A), Anthropic skill-creator (A), Kiro steering (A).

1. **Description is trigger, not summary.** Say when to use and the symptoms or keywords, starting "Use when...". Do not summarize the workflow in the description, because agents then follow the summary and skip the body (superpowers A). Anthropic says the same: all "when to use" content belongs in the description, which should be a little pushy to counter under-triggering (A).
2. **Description limit.** Superpowers caps at 1024 characters and restricts names to letters, digits and hyphens (A).
3. **Three-level progressive disclosure.** Metadata always loaded (~100 words); SKILL.md body on trigger; bundled files on demand. Scripts can run without being loaded (Anthropic A).
4. **Size targets.** SKILL.md under 500 lines (Anthropic A). Move reference material over about 100 lines to separate files, keep inline anything under about 50 lines (superpowers A). Reference files over 300 lines need a table of contents (Anthropic A).
5. **Folder layout.** `scripts/` for executable code, `references/` for loaded-on-need docs, `assets/` for output files; organize multi-variant skills one file per variant so only one loads (Anthropic A).
6. **Flat namespace** (superpowers A).
7. **One complete runnable example from a real scenario**, not several mediocre examples in several languages (superpowers A).
8. **Explain reasons instead of all-caps MUST/NEVER.** Heavy rigid phrasing is a sign to reframe (Anthropic A). Superpowers adds: prohibitions suit rules the agent knowingly breaks; positive recipes or required template fields suit omission and output-shape problems (A).
9. **Test skills before writing them.** TDD for docs: run pressure scenarios without the skill, record exact violations and rationalizations, write the minimum skill to close them, re-test, close new loopholes (superpowers A). Micro-test wording against a no-guidance control with 5+ repetitions and read matches manually (A).
10. **Conditional and path-matched loading.** Kiro's inclusion modes: always / fileMatch / manual / description-matched auto (A). Good fit for "load the review skill only at review time".
11. **Project conventions do not belong in a shared skill.** Put them in the project's instructions file (superpowers A).
12. **Keep the always-loaded surface small.** Claude Code warns when all custom subagent descriptions together exceed 15,000 tokens (A). Taskmaster's MCP tool surface costs about 21k tokens by default (C) and can be cut to 7 core tools (C).
13. **Do not put a workflow summary in metadata** (restated because it is the most common authoring error in community skills) (superpowers A).

## Things to avoid

Drawn from the sources above plus stated caveats:

- **Unaudited agent collections.** VoltAgent says agents are "as is" and not audited (A). Do not copy agent bodies into Maestro without reading them. Several entries in large collections are taglines only (contains-studio A).
- **Self-reported benchmarks as proof.** CCPM's 89% / 75% / 3x and 100% vs 27.7% figures are the project's own (C). claude-flow and Taskmaster token figures are self-reported (C).
- **Popularity as endorsement.** Star counts are not effectiveness evidence (no collection in this pass offers independent evaluation). Aggregator star counts for BMAD (about 8k to about 49k) and VoltAgent (1.5k to 7.5k) differ several-fold; use API figures only.
- **License traps.** Taskmaster is MIT with Commons Clause (not OSI open source, may not offer as hosted service). BMAD reports "Other". anthropics/skills reports null. Check before reuse (A).
- **Broad "swarm" platforms for a lead.** claude-flow describes itself as a platform for swarms, memory, RAG and learning (A, self-described). For a conductor that must stay small, the surface is too wide.
- **Planning ceremony for small changes.** BMAD's own README says small changes should go straight to build (A). Maestro should not inherit a full PRD-to-stories pipeline for every task.
- **Workflow summaries inside skill descriptions** (see authoring lesson 1).
- **Lead reviewing its own workers' diffs** to save time. superpowers names this an anti-pattern because it spends the context the lead needs for coordination (A).
- **Silent verdict-free reports accepted.** superpowers rejects a worker report missing a verdict (A).
- **Roo-style blanket approval gates on every subtask** as the default. It doubles the lead's interruptions (A, default setting).
- **Unbounded polling** (superpowers says wait in bounded stretches; A).
- **Relying on conversation memory for the ledger.** It does not survive compaction (superpowers A).

## Sources

- obra/superpowers repo API: https://api.github.com/repos/obra/superpowers
- obra/superpowers subagent-driven-development SKILL.md: https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md
- obra/superpowers dispatching-parallel-agents SKILL.md: https://raw.githubusercontent.com/obra/superpowers/main/skills/dispatching-parallel-agents/SKILL.md
- obra/superpowers requesting-code-review SKILL.md: https://raw.githubusercontent.com/obra/superpowers/main/skills/requesting-code-review/SKILL.md
- obra/superpowers writing-skills SKILL.md: https://raw.githubusercontent.com/obra/superpowers/main/skills/writing-skills/SKILL.md
- obra/superpowers listing (third-party, B): https://www.skills.sh/obra/superpowers/subagent-driven-development
- automazeio/ccpm API: https://api.github.com/repos/automazeio/ccpm
- automazeio/ccpm README: https://raw.githubusercontent.com/automazeio/ccpm/main/README.md
- automazeio/ccpm listing (B): https://www.skillsdirectory.com/skills/automazeio-ccpm
- bmad-code-org/BMAD-METHOD API: https://api.github.com/repos/bmad-code-org/BMAD-METHOD
- bmad-code-org/BMAD-METHOD README: https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/README.md
- BMAD aggregator write-up (B, star figure): https://medium.com/@visrow/a-tale-of-two-frameworks-bmad-method-vs-github-spec-kit-c021ab0ad037
- VoltAgent/awesome-claude-code-subagents README: https://raw.githubusercontent.com/VoltAgent/awesome-claude-code-subagents/main/README.md
- VoltAgent aggregator (B, counts): https://www.sourcepulse.org/projects/11201240
- contains-studio/agents README: https://raw.githubusercontent.com/contains-studio/agents/main/README.md
- eyaltoledano/claude-task-master README: https://raw.githubusercontent.com/eyaltoledano/claude-task-master/main/README.md
- Kiro steering docs: https://kiro.dev/docs/steering/
- Claude Code subagents (official, redirect target of docs.claude.com): https://code.claude.com/docs/en/sub-agents
- Roo Code boomerang tasks (official docs, redirect target): https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks
- Roo Code custom modes / using modes (B, index only): https://docs.roocode.com/features/custom-modes
- Roo orchestrator slug override (community, B): https://www.issoh.co.jp/md/tech/6211
- anthropics/skills API: https://api.github.com/repos/anthropics/skills
- anthropics/skills skill-creator SKILL.md: https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md
- ruvnet/claude-flow API: https://api.github.com/repos/ruvnet/claude-flow
- SuperClaude-Org/SuperClaude_Framework API: https://api.github.com/repos/SuperClaude-Org/SuperClaude_Framework

## Gaps and limits

- No independent effectiveness study or user-complaint evidence was located for any collection (class D empty). Two complaints or caveats were found only as project-stated limits (CCPM execution local only; Taskmaster API key requirement).
- Not read in depth: wshobson/agents, SuperClaude personas, Roo full sample prompt, Kiro spec workflow, BMAD agent bodies (SM/PM story handoff is class B), contains-studio agent bodies, claude-flow internals.
- Planning-only material (PRD, epics, spec flows) was lightly covered by design, since it is out of Maestro's lead scope.
