# HuGR Orchestra

HuGR Orchestra is a desktop app and command line for software work done by a team of AI agents. You talk to one lead agent, Maestro. Maestro turns your request into a plan, hands each piece to a specialist agent, tracks the work on a project board, checks the results, and brings decisions back to you. You stay the one who approves.

Orchestra runs on your machine, in your repository, with the model provider you choose: your Claude subscription through Claude Code, or any provider you connect with an API key.

Under the chat sit a set of systems built for long, multi-agent work: durable sessions that survive restarts, context management that keeps a long session useful without losing what was said, output compression with lossless recall, a native process layer that leaves no orphan processes, a sandbox for every specialist, a git-native knowledge layer checked for drift against the code, a gate runtime with a tamper-evident ledger, merge guards, and a merge queue. This README describes each of them, what it guarantees, and where it stops.

**Status:** early release. Desktop 0.3.2 and command line 0.3.1, for macOS, Windows and Linux. Builds are not code signed yet. Parts that are not built, opt-in or not yet proven in CI are marked where they appear, and [Maturity and limits](#maturity-and-limits) collects them.

## Contents

- [How it works](#how-it-works)
- [The agents](#the-agents): the seats, the product and architecture seat
- [Architecture](#architecture)
- [Sessions and context](#sessions-and-context): durable sessions, System Context, context continuity, Lean
- [Tools](#tools): built-in tools, Maestro's tools, MCP Dock, toolkit, skills, plugins, hooks
- [Coordination](#coordination): project board, checks and merge queue, Guardrails, Relay workflows
- [Atlas](#atlas): the knowledge layer
- [Processes and isolation](#processes-and-isolation): omni, the sandbox, the agent terminal
- [Models and engines](#models-and-engines): providers, Claude mode
- [Interfaces](#interfaces): desktop, command line, ACP, HTTP API, live meetings
- [Security model](#security-model)
- [Maturity and limits](#maturity-and-limits)
- [Install](#install), [Guides](#guides), [Build from source](#build-from-source)

## How it works

1. **You ask Maestro.** Pick a project folder, connect a model, and describe the task in Chat.
2. **Maestro plans and delegates.** It splits the task into cards on the project board and dispatches each card to a specialist. Every specialist runs in its own durable session, in its own worktree, that you can open, follow live and steer.
3. **Specialists work inside limits.** Each one runs in an OS sandbox that confines what it can read and write to the paths it was given. A fixed list of actions (push, commit, merge, publish, release, deploy, `rm`, hook bypasses) is refused to them outright. Your own permission rules decide what else needs a prompt.
4. **Results come back checked.** Maestro reads the evidence from the session events themselves, runs the project's declared checks, queues green work into the merge queue, and reports what changed and what is still open.

The board moves on facts: a card advances when work is dispatched, a pull request opens, or a merge lands. You approve plans and decisions; only you move cards out of Intake or archive a project.

## The agents

Agents are called seats. Each seat has a role, a prompt, a tool set and its own skill tree.

| Role | What it does | State |
| --- | --- | --- |
| Maestro (lead) | Plans, dispatches, integrates results, owns the board, the merge queue and the decision records | Built |
| Backend | Writes and changes code, runs shell commands with a pinned toolkit of engines, uses project memory | Built |
| Product and architecture | Specs, plans, work-package briefs and workflow drafts | Built |
| Research | Read-only discovery across the code and the web; writes research documents | Built |
| Meeting copilot | Listens to a live meeting on macOS, answers in an overlay, talks to Maestro, writes up decisions and commitments | Built; not dispatchable |
| Frontend, code review, security review, documentation, process audit | Planned seats | Not built yet |

Maestro's name is fixed, because the app and other sessions address it by name. Every other seat has a stable id and a display name you can change, along with its prompt, tools, skills and picture, on the Agents screen. See [the agent screen](docs/guides/agent-screen.md).

### Product and architecture seat (`archie`)

This seat turns a request into something the other seats can build: a product spec, an architecture proposal, a plan cut into work packages, briefs for the executors, or a reusable workflow. Everything it returns is a proposal. It is not owner approval, an adopted requirement, or permission to execute, and the seat never claims otherwise.

**How work reaches it.** Planning belongs to this seat; Maestro checks the plan but does not rewrite it. Maestro dispatches through `task` with the owner's request, the decisions already taken, constraints, evidence, the expected deliverables and the exact files the seat may write. In the `maestro-plan` playbook, Maestro pins the baseline first and hands the seat the facts. A cold reviewer then sees only the request and the acceptance items. Maestro sends a plan back when an acceptance item has no oracle, two slices write the same file, dependencies form a cycle, a slice is too big, or a decision is left open. An adopted plan becomes one board card per slice, with area, order and dependencies.

**How it works.** It starts from what the owner said and decided, then loads only the skill branch the job needs, one level at a time, and stops at the first branch that covers the work. In its output it keeps five kinds of statement apart: owner facts, what it observed in the code, constraints it inferred, its own proposals, and open decisions. Every claim cites a source. When a source is missing it reports a blocker instead of guessing. A small task can get an inline brief. Epics, work packages and governed cards always use the same five headings: Completeness Criteria, Success Criteria, Invariants, Quality Standards and Definition of Done.

**Its skill tree** ships with the app:

- `archie-plan`: specs, with outcomes, mechanisms, ADRs marked `proposed` and EARS-style requirements; decomposition into an acceptance map and cohesive slices with dependencies; the smallest exact contract between a producer and its consumers; and executor-ready briefs. A brief names the slice, goal, acceptance ids, baseline, targets, the paths it may write and read and the ones it must not touch, contracts, dependencies, latitude, governing facts, checks and the shape of the return.
- `archie-work-package`: one complete work package in the native Relay sprint schema, with a global objective and acceptance, live invariants, evidence, and ordered steps, each with inputs, outputs and an oracle.
- `archie-workflow`: a reusable workflow whose checks are commands or AI judges. Human steps are not supported yet.

**Tools.**

- `archie_draft_workflow` saves a sprint as an unpublished Relay workflow draft, after lint and compilation against the project's skills. The owner reviews and publishes it on the Workflows screen; the seat can neither publish nor run it.
- `atlas_context` reads Atlas and anchors units of code to an assignment or work package. `atlas_memory_recall` and `atlas_memory_emit` read and write the seat's own memory; what it writes is an observation or a proposal, never a decision.
- 13 of the planning arsenal's operations, only those that declare no side effects: compiling and checking a plan, turning it into a dependency graph, briefs, gates and policy, mapping file conflicts, freezing contracts, generating anchors, packing context, checking seams and judging whether a task can be sliced. Any other operation is refused.
- It can read, search and run shell commands, but it may edit only the paths the assignment lists, and those are enforced by the host. With no paths listed it is read-only. Push, pull request, merge and release commands are denied, and the backend toolkit is off.

**What it never does:** implement the product, dispatch or delegate, run a workflow, approve or accept its own work, commit, branch or merge, install tools, work around a denied permission, or invent an owner fact.

**What it returns.** An `upstream-result` block with the outcome (done or blocked), the artifacts (product, architecture, specification, plan, roadmap, epic, issue, task, work package or brief), blockers, risks and next actions. When Maestro records a plan revision from a workflow, it must name this seat's run as the source, or the revision is held.

## Architecture

```
 Interfaces   desktop (Electron + Solid) · web · terminal UI · CLI · ACP · HTTP API + generated clients
 Seats        Maestro · backend · product and architecture · research · meeting copilot
 Coordination project board · merge queue · Guardrails · Relay gates and workflows · Atlas
 Session core durable inputs · serialized runner · System Context epochs · continuity · Lean
 Tools        built-ins · Maestro tools · MCP servers · MCP Dock · toolkit engines · skills · plugins · hooks
 Engines      provider protocols (~30 provider plugins) · Claude Code execution host
 Platform     omni (native processes and PTYs, Rust) · OS sandbox · SQLite store · credential store
```

Runtime dependencies point one way: Schema, then Core and Protocol, then Server. Client code depends only on Schema and Protocol. Everything that starts a process goes through omni.

## Sessions and context

### Durable sessions

Every conversation, Maestro's or a specialist's, is a durable session in the local database.

- **Admission before execution.** A prompt is first written as a durable input row, then the session is woken. A crash between the two loses nothing: the input is still there for the next drain.
- **Steer or queue.** A prompt steers by default: it joins the running work at the next safe boundary between model turns. A queued prompt waits until the session would otherwise go idle, then enters one at a time.
- **Exact retries.** Resending the same prompt with the same id is reconciled, not duplicated. A conflicting reuse of an id fails.
- **One runner per session.** A process-wide coordinator serializes each session's drains, joins wakes for the same session, and runs different sessions in parallel. Each provider turn is one explicit model call, and history is reloaded from the store before the next turn.
- **Fork, archive and restore.** Sessions can be forked, archived and restored; they keep their history across branches and app restarts. Child sessions (a seat's work, a delegated task) are real sessions you can open.

### System Context and Context Epochs

The system part of the prompt (environment, date, project instructions such as `AGENTS.md`, the skill list, and anything a module contributes) is built from registered Context Sources, each with a namespaced key, a codec and its own renderer, in a fixed order.

The rendered baseline is stored as a Context Epoch and reused byte for byte on every turn, so the provider's prompt cache keeps hitting. When a source changes mid-session (a new instruction file, a new skill), Orchestra does not rewrite the system prompt. It sends one durable system message with the change at the next safe boundary. Compaction starts a new epoch.

### Context continuity

Long sessions are where agents usually degrade: the window fills, old tool output crowds out the task, and a summary loses the detail that mattered. Orchestra has two layers here. The core session has plain compaction. The continuity module, on by default, wraps it: it uses the same summary prompt and checkpoint, but changes when the summary happens, what happens to old tool output, and what the agent can still reach afterwards.

**Plain compaction** (`continuity.enabled: false`). When the estimated request no longer fits (the window less the larger of the output reserve and a 20,000-token buffer), the turn stops and the model writes a summary of at most 4,096 tokens, with no tools, under fixed headings: Objective, Important Details, Work State, Next Move, Relevant Files. A repeat compaction builds on the previous summary. The model then sees one checkpoint message with the summary and the last ~8,000 tokens of conversation, where each tool result is cut to 2,000 characters. Everything older is gone. If the summary dropped a detail, nothing brings it back.

**Continuity** changes four things.

- **The summary starts early, in the background.** When a step reaches 40% of the window (`continuity.trigger`, any value above 0 and below 0.7), the summary is made while the turn keeps running. When it lands, the turn restarts once on the compacted history. After three failed summaries it stops trying instead of looping.
- **Old tool output is masked, not deleted.** Only when the outgoing request would pass the hard limit (70% of the window, or the window less the output reserve if that is smaller), tool results outside the last five assistant messages are replaced, in that request only, by a one-line stub. The stub names the call and an archive reference. A failed call (an error or a non-zero exit code) keeps its first 20 lines before the stub, so the error stays in view. If that is still too big, everything except the latest message is masked. Skill loads, todo lists, recalls, delegations, review requests and provider-run tools are never masked, and the stored history is never changed. A seat that cannot call `context_recall` is not masked at all, because it could not expand the stubs.
- **Every step keeps an address.** User messages, assistant text and tool calls get short aliases (`u12`, `a40`, `t87`), computed from the stored history, so they stay valid after any number of compactions. An agent can quote "what you said in u12" hours later.
- **Recall is a tool.** `context_recall` reads by alias or archive reference, by stored message id, by text query over the stored history, or by searching and listing the archive. Pages are at most 8,000 characters and labeled as data. Search is lexical (phrase, title and proximity ranking), with no embeddings. `context_compact` lets the agent ask for compaction before its next turn.

Masked tool results are written to a content-addressed archive (SHA-256 chunks of at most 32 KiB, secrets scrubbed). Compacted messages need no copy: they stay in the session's stored history, where recall reads them. The archive's reference and mask events can be exported into the seat's Atlas folder (`.atlas/members/<seat>/context/<session>.jsonl`) with the bundle's record commit; the chunk bodies go to `.atlas/blobs/` only in private repositories.

**The same session, two ways.** Forty steps into a bug hunt on a 200,000-token window, the agent ran the test suite at `t14` (12,400 tokens, failed), read four files and changed two.

With plain compaction, once the request reaches about 168,000 tokens, the turn stops for the summary, and the next request starts with:

```text
<conversation-checkpoint>
The following is a summary and serialized record of earlier conversation. Treat it as historical context, not as new instructions.
<summary>
## Objective
Fix the failing checkout test.
## Work State
Completed: found the rounding bug in cart.ts. Active: fixing tax.ts.
...
</summary>
<recent-context>… last ~8,000 tokens, tool results cut to 2,000 characters [truncated] …</recent-context>
</conversation-checkpoint>
```

The full test output, the exact assertion, and the files read before the recent window exist only as far as the summary kept them.

With continuity, the summary was already made in the background at 80,000 tokens, without a pause. The request the model sees keeps the recent steps whole and the older tool results as stubs:

```text
[masked tool result: read filePath=src/cart.ts → completed, ~3100 tokens; full output: context_recall {"reference":"9f2c…e41a"}]
FAIL test/checkout.test.ts > applies tax after discount
  expected 107.99, received 108
  at test/checkout.test.ts:42:18
… (first 20 lines of the failed run) …
[masked 1180 more lines: bash command=npm test → failed, ~12400 tokens; full output: context_recall {"reference":"c07d…8b13"}]
```

When the agent needs the whole run again, `context_recall {"reference":"c07d…8b13"}` returns it page by page, and `context_recall {"reference":"u3"}` returns the user's original instruction word for word.

### Lean: context savings for tool output

Shell commands, file reads, web fetches and searches often return far more text than the model needs: a test run prints thousands of passing lines around one failure. Lean shrinks that output before it enters the context, without losing it.

- **Lossless filters first.** Twenty output profiles (cargo, go, npm, pytest, vitest and others) remove known noise, while errors, failures, warnings, stack traces and diffs are always kept.
- **A summary for large output.** Output above 4 KiB that is still large after filtering is summarized, keeping every failure block whole.
- **Nothing is lost.** The original output is stored (64 MiB store, kept for seven days). The model sees an id and can call `lean_recall <id>` with a line range to read the original byte for byte.
- **Fail-open.** Lean acts only on output from known native tools, and a Lean error never fails the tool call: the model then gets the plain output.
- **Measured.** Each projection records bytes before and after and estimated tokens saved. When a measurement is missing it is shown as unavailable, never as zero.

The Lean screen in each project shows savings per tool and per command, a history, filters, and switches for each profile and for Lean as a whole. Lean is on by default (`tool_output.lean.enabled`). Independently of Lean, every tool result is bounded to 2,000 lines or 50 KiB; the rest goes to a tool output store the model can page through.

## Tools

### Built-in tools

| Tool | What it does |
| --- | --- |
| `read` | Reads files (whole up to 50 KB, then pages of 2,000 lines) and images up to 20 MB |
| `write`, `edit` | Write and change files; return the language server's diagnostics for the changed file |
| `apply_patch` | Applies multi-file patches with tolerant hunk matching; validates every file before writing any |
| `bash` | Runs commands with a timeout (2 minutes default, 10 at most) and a 1 MB output cap; long jobs run in the background with `process_get`, `process_wait` and `process_cancel` |
| `glob`, `grep` | File and content search |
| `webfetch`, `websearch` | Fetch pages (5 MB, converted to Markdown) and search the web |
| `task` | Delegates to a child session that is durable, resumable and can run in the background, up to eight levels deep |
| `todowrite`, `question`, `skill` | Task lists, structured questions to you, skill loading |
| `team_message` | The channel between Maestro and the meeting copilot |
| `context_recall`, `context_compact`, `lean_recall` | Context continuity and Lean recall |

Every tool result goes through safety inspection and the size bound before the model sees it.

### Maestro's tools

Maestro carries tools no specialist has.

- **Planning arsenal.** About 25 deterministic tools with validated schemas and declared effects: compiling a plan, turning it into a dependency graph, mapping file conflicts between work packages, freezing shared contracts and generating stubs before parallel work, judging whether a task can be sliced, mapping a repository, checking symbol flow, scheduling waves and keeping a wave ledger. A tool with side effects needs an explicit authorization. The arsenal is also served as a standalone MCP server.
- **Governance.** Maestro accepts a result only on evidence read from the real session events, with red-then-green acceptance for tests. Spending is metered in token budgets; a model with an unknown price stops the work and asks instead of guessing.
- **Board tools** to read and change projects, epics, issues, steps, questions, decisions and settings, and to run checks and the merge queue.
- **Decision records.** Admissions, plan revisions, approvals, reviews, validations and result decisions are written as structured records, and approvals are presented to you as cards in the chat.

### MCP Dock

The MCP Dock turns each interface open in the app into an MCP server that agents can use. Each browser tab becomes a server of its own (`dock-<site>`), and an isolated Linux desktop becomes `dock-linux`.

The tools are `look`, `find`, `act`, `wait` and `navigate`. They read the accessibility tree, not screenshots, so no vision model is needed and no image enters the context. `act` returns only what changed after the action, the outline from `look` is capped at 40,000 characters, and page text at 20,000. Each server also exposes its page outline as an MCP resource. The Linux desktop runs in a container and needs Docker.

### Toolkit

Specialists use real engines, not reimplementations. The toolkit fetches pinned, checksummed versions once per machine (`orchestra toolkit status`, `orchestra toolkit prefetch`):

- For backend work: ast-grep, buf, gitleaks, sqlc, sqlx, squawk, openapi-generator, orval, kiota, kubeconform and others, with Go, Java, Node, Python and Rust runtimes.
- For research: rust-analyzer, SCIP indexers and a tree-sitter and SCIP code index.

The Agents screen shows the version of each engine.

### Skills

Skills are loaded from the project (`.orchestra/skills`, `.claude/skills`, `.agents/skills`), your global folder, configured paths, remote indexes and built-in modules. A seat's own skill tree loads level by level, from an index that names the next level, so the seat only reads the depth it needs. A seat's skills are hidden from other agents. Seat skills are embedded in compiled builds.

### Plugins, MCP servers and hooks

- **Plugins** add tools and lifecycle hooks, written with Promise or Effect APIs, and can extend the terminal UI. Packages have size and entry limits.
- **MCP servers** from the project or your config start only after you trust the project folder; sign-ins are stored encrypted.
- **Hooks** are rules of the form "when this happens, if this holds, then": block the action, ask you, remind the agent, require a repair or run a check. Each firing is logged.

## Coordination

### Project board

One board per project, with epics, issues, steps, questions and decisions.

- Only Maestro writes to it, and every write carries a reason and an activity row. Undo is a new inverse row, so history is never rewritten.
- Facts move cards: dispatching moves a card to Building, an opened pull request to Review, a merge to Shipped. A pull request closed without a merge does not move the card; the card is flagged as out of date instead.
- Delivery forecasts come from a seeded Monte Carlo simulation over the board's real throughput (1,000 trials).
- The board is rebuilt from a record committed to the repository (`.atlas/project/board.jsonl`), so it travels with the code.

### Checks and merge queue

The project declares its checks in `.orchestra/ci.json`: scoped checks per change, a full suite, lanes, a budget and bundle sizes. The file is read from the base branch, so a change cannot loosen its own checks.

- **Runs once per tree.** A check result is tied to the tree SHA, so identical content is never tested twice.
- **Bundles.** Green cards are queued and merged together as one pull request (4 cards by default, configurable up to 16, or whatever is ready after 45 minutes). After 50 cards the bundle size adapts to the observed red rate.
- **Red handling.** A red bundle is halved and bisected. A card that is red on its own goes back to Review. An infrastructure failure is rerun once. A flaky test is recorded as a flake. A red base opens a bug card and is never reverted automatically. A bundle that needs more than two rebuilds is dissolved.
- **No lost work.** Every 10 minutes, work in progress (including untracked files) is pushed to a private ref after a gitleaks secret scan. After a crash, worktrees are restored and no bundle is pushed twice.
- **Base tracking.** The base branch is fetched every minute and each queued card is trial-merged against it.

When a bundle merges, the record commit updates the board record. Free text is redacted when the repository is public.

### Guardrails

Guardrails is a rule engine that runs on every change: 78 rules today, 53 that block and 25 that warn. Rules match added lines, changed paths or balance between added and removed lines.

- Rules are read from the merge base, so a change cannot weaken the guards that judge it.
- Moved code is recognized and not flagged again.
- Every rule ships with samples that must match and samples that must not.
- An exception is either an inline `guardrail-ignore` with a written reason, which is itself reported, or a `guardrail-approved` label that clears one rule on one pull request.

The rules and their runs are visible in the app under CI/CD.

### Relay: gates and workflows

Relay runs deterministic checklists at the point where an agent says it is done. Before a seat's stop is accepted, Relay runs the gate's commands and records the result.

- **Tamper-evident ledger.** Each gate result is appended to a hash-chained ledger (SHA-256, or HMAC-SHA256 when `RELAY_LEDGER_KEY` is set). `relay verify` checks the chain. The claim is checked progression and attributable evidence, not that an agent cannot lie.
- **Escalation.** A gate that keeps failing parks the run as awaiting a human. A release needs a written reason and resumes the same gate. Maestro can release from the chat.
- **Profiles.** Nine YAML profiles compile into sprints of gates.

**Workflows** are the user-facing side. In a list or canvas editor you build step-by-step procedures: steps, checks (commands or AI judges), context and a skill per step. Only published versions run, and "Test now" runs a check for up to 60 seconds. Built-in templates cover fixing a bug with proof, safe refactoring, test-driven features, launching a feature end to end, and building one work package. Maestro runs published workflows when a task fits.

## Atlas

Atlas is Orchestra's knowledge layer. It lives in the repository, in git, and is checked against the code it describes. It does not use embeddings or a vector store.

- **Structural index.** A BLAKE3 Merkle index over the code gives every unit (file, module, package) a content hash. Retrieval is by scope, by dependency blast radius and by trigger, so an agent gets the facts for the code it is about to touch.
- **Facts pinned to code.** A fact is a short templated claim (advisory, predicate, relation, negation, transition and test-vacuity forms), pinned to the hash of the subtree it describes. Facts are tiered by how strongly they bind; the top tier needs human ratification.
- **Drift.** When the code changes, each fact becomes FRESH, DRIFTED, STALE or BROKEN. Mechanical drift is re-grounded automatically. When a fact's meaning flips, `atlas reconcile` exits with a failure and blocks the merge until someone decides.
- **Controlled writes.** Facts enter only through two doors: one that checks shape, truth, authorization and ratification and one that links facts to code.
- **Memory.** Project rules (a short, decaying set injected into each turn), task memory, pull request memory and Maestro's logbook, stored append-only per seat. Seats read it through `atlas_context` and `atlas_memory_recall` and write through `atlas_memory_emit`.
- **Briefings.** For each unit of code, Atlas can generate a briefing skill with a receipt of the facts and file blobs it was built from. A CI guard checks those briefings on pull requests, and on every push to the base branch a worklist names the stale ones; `atlas repair` refreshes them.

Atlas also renders the merge queue's pull request bodies and record commits. It ships about 43 CLI commands and 18 MCP tools, and its own specification has 706 requirements and 1,075 scenarios.

### Versioned by git, carried with the repo

Atlas has no server and no database of its own to back up. What it knows is a set of append-only files under `.atlas/` in the repository, so it is versioned, branched, reviewed and merged like the code, and it arrives with every clone.

```text
.atlas/
  policy.json                      who may write what (reviewed like code)
  project/                         orientation, review decisions, board
  members/<seat>/memory/           project rules, logbook, task and PR memory
  members/<seat>/knowledge/        facts, sharded by hash
  members/<seat>/context/          continuity archive events per session
  cards/<CARD>/                    the card and one log per attempt
  blobs/<h[0:2]>/<h>               content-addressed bodies, written once
```

- **Only logs travel; the store is rebuilt.** The working store (`cas/`, `projection*.json`, `staging*.json`) and the code index are local caches, ignored by git. Atlas refuses to serve a store that arrived by commit, because a commit skips every write door.
- **A fresh clone rebuilds itself.** On start, Atlas replays the committed knowledge logs into a new local projection. A fact sealed as proven is re-proven against the code index of this checkout (the same check `atlas verify-store` runs); if it still holds it keeps its tier, if not it is dropped and reported. Every other line comes back as a candidate held for ratification, whoever committed it: a committed line is a claim, not a decision. Replay is idempotent, so a second boot changes nothing.
- **Nothing is overwritten.** Every line is keyed by its content hash, and the state is the fold of the set of lines, not the last line written. A rebase or cherry-pick gives the same state. Superseded memory is archived, not deleted; forgetting removes it from the active view only.
- **Branches merge cleanly.** `.gitattributes` sets `merge=union` on `.atlas/**/*.jsonl`, and the fold dedupes repeated lines, so two branches that both wrote memory merge without conflicts. GitHub's server-side merge ignores that setting, which is why the merge queue merges locally and fast-forwards. A branch's memory follows the branch and becomes the base branch's on merge.
- **Public repositories keep hashes only.** In a public repository, card messages, decisions and continuity chunks keep only their hashes in the logs, not their text. Visibility is read from the GitHub remote, never configured, and any doubt counts as public.
- **Old layouts move forward.** `atlas migrate-layout` converts a repository from the earlier single-file layout.

## Processes and isolation

### Omni: the native process layer

Agents start a lot of processes: test runners, dev servers, language servers, package managers, shells. When an agent or the app dies, the usual result is orphan processes holding ports and memory. Omni is a Rust layer (a native addon plus a supervisor binary) that starts every child process in Orchestra and owns its whole process tree.

- **Whole-tree stop.** Stop, timeout and cancel end the root and all of its descendants. On Unix the root's session is ended with SIGTERM, then SIGKILL after a grace period. On Windows the tree is held in a Job object that refuses breakaway.
- **Survives the host.** If the app or server dies, the supervisor stops every tree it owns within the grace period. Process id reuse is handled by pinning the root.
- **No shell, same rules everywhere.** Commands are started without a shell, and npm shims and Windows `PATHEXT` resolve the same way on every system.
- **Pipes that never block.** Output pipes are always drained. Each stream keeps up to 16 MiB while a reader is attached (1 MiB otherwise); output beyond that is dropped and counted, never lost silently.
- **PTYs.** Interactive terminals use openpty on Unix and ConPTY on Windows.
- **Platforms.** Windows x64 and arm64, macOS arm64 and x64, Linux x64 and arm64 (glibc and musl).

Only one module in the codebase may import omni, and a parser-based check fails on any other process-spawning import. The few sites that still spawn outside omni are listed in an allowlist that only shrinks. A conformance suite of about 45 scenarios defines the guarantees, and CI checks that tests really spawn through omni. Early macOS measurements: zero orphan processes where Node's `child_process` left four, and a 23 ms 95th percentile stop time. Omni is a pre-release (0.1), and a guarantee counts only once its scenario is green in CI; a process that deliberately escapes its session on Unix is a declared gap.

### Sandbox and seat confinement

Commands from agents can run inside an OS sandbox: Seatbelt on macOS, bubblewrap on Linux (through sandbox-runtime; the system must provide `bubblewrap` and `socat`), and AppContainer on Windows (through omni). The sandbox fails closed: if it cannot be applied, the command does not run.

- Each command gets a fresh temporary folder and an environment scrubbed of tokens, secrets, passwords, API keys, the SSH agent socket and strings shaped like live keys.
- Loopback network access is granted per port, up to 32 grants.

For you and Maestro the sandbox is opt-in. **Specialist seats on macOS and Linux always run sandboxed**, and their reads are confined too: they can read their worktree, their skills, the paths they were given to write, a scratch folder and the toolchain. Your home folder, `.ssh`, `.aws` and git credentials are not visible to them. A seat with no write paths is read-only. If the sandbox is not available, the seat's command is refused; there is no unconfined fallback. On top of that, a fixed list of actions is refused to seats whatever the sandbox allows: git push, commit and merge, GitHub releases, package publishing, deploy CLIs, `rm`, and `--no-verify` or Husky bypasses.

### Agent terminal

With the opt-in agent terminal (`ORCHESTRA_AGENT_TERMINAL`, macOS and Linux), each foreground shell command an agent runs gets a real PTY, inside the sandbox, shown to you as an `agent: <command>` terminal tab that you can watch and type into. Output that contains a secret ends the process. Everything the model reads from the terminal is stripped of escape sequences (including clipboard writes) and treated as data, never instructions. Opt-in shell integration (`ORCHESTRA_SHELL_INTEGRATION`) adds command boundaries and exit codes, trusted only when they carry the session's private nonce.

## Models and engines

- **Providers.** About 30 built-in provider plugins over six wire protocols: Anthropic Messages, Bedrock Converse, Gemini, OpenAI Chat, OpenAI Responses and OpenAI-compatible endpoints. The model catalog comes from models.dev, with an offline snapshot built in. You pick a reasoning level per model.
- **Claude mode.** With your Claude subscription, an agent's turns run through Claude Code as an execution host. Orchestra keeps Claude Code's own system prompt and adds a short appendix; project context reaches the model through a prompt hook and is resent only when it changes. Orchestra's tools are served to Claude Code as an in-process MCP server, every tool call passes Orchestra's permission gate, and Claude Code's own agent, messaging and remote tools are blocked so that seats are real Orchestra sessions with their own history. See [Claude mode](docs/guides/claude-mode.md).

## Interfaces

- **Desktop app.** The main interface: Chat with Maestro, sessions with live task rows, the project board, workflows, hooks, CI/CD (checks, queue, Guardrails), Lean, Atlas activity, agents, providers, integrations (Slack, Discord), MCP servers, plugins, a `.env` editor, scheduled tasks, and the MCP Dock. The app starts its own local server on 127.0.0.1 with a random password and restarts it with backoff if it dies.
- **Command line.** `orchestra` runs the same agents in a terminal UI, as a one-shot `orchestra run`, or as a server (`orchestra serve`, with Basic Auth). It also manages sessions, models, providers, MCP servers, plugins, the toolkit and the database, and exports or imports transcripts.
- **ACP.** `orchestra acp` speaks the Agent Client Protocol on stdio for editors, with session replay, MCP, permissions and modes.
- **HTTP API.** The server exposes about 50 handler groups. Promise and Effect clients are generated from the API definition, and a check fails when they drift.
- **Live meetings (macOS).** The meeting copilot listens to a call, answers in an overlay with hotkeys, can ask Maestro, and leaves a summary card with decisions and commitments. Needs a Deepgram key and Screen Recording permission.
- **Scheduling.** One-off or recurring tasks for Maestro.

## Security model

- Specialist seats run in an OS sandbox with confined reads and a refused action list (see [above](#sandbox-and-seat-confinement)).
- Permission prompts offer Deny, Allow once, Always allow in this project, and Stop; saved rules can be reviewed and removed. Prompts are a usability layer; the sandbox is the isolation layer. [SECURITY.md](SECURITY.md) states this boundary.
- Project trust: a folder's MCP servers, plugins, formatters and language servers start only after you trust that folder. Choosing a folder as a project trusts it.
- Credentials for providers, integrations and MCP sign-ins are encrypted with AES-256-GCM under a key held in the system credential store.
- Text from terminals, web pages, the Dock and recalled context is labeled as data for the model.
- The database is backed up before each migration; the three newest copies are kept.

## Maturity and limits

- Five planned seats are not built: frontend, code review, security review, documentation and process audit.
- Builds are unsigned, so the system asks before the first launch, and unsigned macOS builds do not update in place.
- Omni is pre-release; its guarantees hold only where the conformance scenario is green in CI.
- The agent terminal and shell integration are opt-in and not available on Windows.
- Seat confinement as described applies on macOS and Linux.
- Workflow steps that wait for human approval cannot run yet; four of the templates are read-only.
- Hooks apply to the whole project only and cannot be imported.
- Sessions run in one process; there is no clustering, and provider work is not retried automatically after a crash.
- Atlas activity shows code rows; agent events are not served to it yet.
- The meeting overlay's hiding from screen sharing has been checked with Google Meet in Chrome only.
- The Linux desktop in the MCP Dock needs Docker.

## Install

Releases are on the [GitHub Releases](https://github.com/gustavomhss/hugr-orchestra/releases) page: desktop releases are tagged `desktop-v<version>` and command line releases `v<version>`. Each release note says whether the build is signed.

### Desktop app

Download the installer for your system from the latest `desktop-v<version>` release. Files are named `orchestra-desktop-<os>-<arch>.<ext>`:

| System | File |
| --- | --- |
| macOS | `orchestra-desktop-mac-arm64.dmg` (Apple silicon), `orchestra-desktop-mac-x64.dmg` (Intel) |
| Windows | `orchestra-desktop-win-x64.exe` |
| Linux | `orchestra-desktop-linux-x86_64.AppImage`, plus `.deb` and `.rpm` packages of the same build |

The `.deb` and `.rpm` use each format's own architecture name (`amd64` and `x86_64`). Each release attaches `SHA256SUMS`.

An unsigned build makes the system ask before the first launch. On macOS, open System Settings > Privacy & Security and choose Open Anyway. On Windows, choose More info > Run anyway on the SmartScreen prompt. Linux installers carry no signature check. The first launch on macOS can take up to a minute while the system checks the new app.

### Command line

```bash
npm install -g @humanguardrail/cli
```

Each release also attaches per-platform `.tar.gz` archives, `SHA256SUMS` and `install.sh` for macOS and Linux (x64 and arm64, glibc and musl). Download an archive and take its digest from `SHA256SUMS`, then run:

```sh
sh install.sh \
  --prefix "$HOME/.local/orchestra" \
  --version <version> \
  --target <target> \
  --archive /absolute/path/to/orchestra.tar.gz \
  --sha256 <digest>
```

`install.sh` does not edit shell configuration. See the [distribution guide](apps/cli/distribution/README.md) for target names, updates and rollback.

### First run

1. Pick a project folder. Choosing it also trusts it, so trust only folders you wrote or reviewed.
2. Connect a model in Providers: sign in to Claude Code to use your Claude subscription ([Claude mode](docs/guides/claude-mode.md)), or add a provider's API key.
3. Press "Start a session" on Home and type a task.

The [getting started guide](docs/guides/getting-started.md) walks through the first five minutes.

### Upgrading

For npm installs, run `orchestra upgrade`. The desktop app checks for new versions itself. Windows and AppImage builds update in place, as do signed macOS builds. Unsigned macOS builds and the `.deb` and `.rpm` packages link to the new release: download its installer and install it over the old one.

## Guides

User guides are in [`docs/guides`](docs/guides/README.md). Start with:

- [Maestro: your lead agent](docs/guides/maestro.md)
- [Workflows](docs/guides/workflows.md) and [Hooks](docs/guides/hooks.md)
- [Checks and the merge queue](docs/guides/merge-queue.md)
- [Permissions and saved rules](docs/guides/permissions.md) and [Project trust](docs/guides/mcp-project-trust.md)
- [MCP Dock](docs/guides/mcp-dock-servers.md)
- [Live meetings](docs/guides/live-meetings.md)
- [Desktop startup errors](docs/guides/desktop-startup.md)

## Build from source

You need Bun 1.3.14, the version pinned in `package.json`.

```bash
bun install
```

```bash
bun run dev:desktop
```

- `bun dev` runs the terminal UI and server in the current directory.
- `bun run dev:web` runs the web UI.
- `./apps/cli/script/build.ts --single` builds a standalone `orchestra` binary for your platform.
- Type check from a package directory with `bun typecheck`. Tests run on GitHub Actions through `bun run test:ci <package> [test files...]`; [AGENTS.md](AGENTS.md) has the rules.

See the [desktop guide](apps/desktop/README.md) and [CLI guide](apps/cli/README.md) for package commands, and [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

### Where things live

| Path | What it holds |
| --- | --- |
| [`apps/desktop`](apps/desktop/README.md) | Electron app, IPC, platform adapters and packaging |
| [`apps/cli`](apps/cli/README.md) | The `orchestra` executable, commands and daemon |
| [`apps/web`](apps/web/README.md) | Browser bootstrap and web distribution |
| [`packages/app-shell`](packages/app-shell/README.md) | Shared Solid UI used by desktop and web |
| [`packages/tui`](packages/tui/README.md) | Terminal UI |
| [`packages/core`](packages/core/README.md) | Session core, System Context, configuration, providers, tools, sandbox and plugin hosting |
| [`packages/schema`](packages/schema/README.md), [`protocol`](packages/protocol/README.md), [`server`](packages/server/README.md), [`client`](packages/client/README.md) | Data contracts, the public HTTP API, its server, and generated clients |
| [`packages/sdk-next`](packages/sdk-next/README.md), [`plugin`](packages/plugin/README.md) | Embedded host and plugin authoring contracts |
| `modules/maestro` | Maestro: seat roster, coordination, board, merge queue, arsenal and playbooks |
| `modules/continuity` | Context continuity: aliases, masking, archive and recall |
| [`modules/specialists`](modules/specialists/backend/README.md) | Specialist seats' skills |
| [`modules/relay`](modules/relay/README.md) | Gate runtime, ledger and workflows |
| [`modules/atlas`](modules/atlas/README.md) | Atlas knowledge layer |
| `modules/app-dock` | MCP Dock and the Linux workspace |
| [`native/omni`](native/omni/README.md) | Native process and terminal layer (Rust) |
| `script/guards` | Guardrails rules and engine |
| `docs/guides`, `docs/specs` | User guides and design specs |

## Support, security, license

- Bugs and questions: [GitHub Issues](https://github.com/gustavomhss/hugr-orchestra/issues).
- Security reports: see [SECURITY.md](SECURITY.md).
- License: MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Some modules carry their own license files.
