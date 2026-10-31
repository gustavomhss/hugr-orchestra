# HuGR Orchestra

HuGR Orchestra is a desktop app and command line for software work done by a team of AI agents. You talk to one lead agent, Maestro. Maestro turns your request into a plan, hands each piece to a specialist agent, tracks the work on a project board, checks the results, and brings decisions back to you. You stay the one who approves.

Orchestra runs on your machine, in your repository, with the model provider you choose: your Claude subscription through Claude Code, or any provider you connect with an API key.

Under the chat sit a set of systems built for long, multi-agent work: durable sessions that survive restarts, context management that keeps a long session useful without losing what was said, output compression with lossless recall, a native process layer that leaves no orphan processes, a sandbox for every specialist, a git-native knowledge layer checked for drift against the code, a gate runtime with a tamper-evident ledger, merge guards, and a merge queue. This README describes each of them, what it guarantees, and where it stops.

**Status:** early release. Desktop 0.3.2 and command line 0.3.1, for macOS, Windows and Linux. Builds are not code signed yet. Parts that are not built, opt-in or not yet proven in CI are marked where they appear, and [Maturity and limits](#maturity-and-limits) collects them.

## Contents

- [How it works](#how-it-works)
- [The agents](#the-agents): the seats and how each one works: Maestro's playbooks, product and architecture, backend, research, meeting copilot
- [Architecture](#architecture)
- [Sessions and context](#sessions-and-context): durable sessions, System Context, context continuity, Lean
- [Tools](#tools): built-in tools, how `read` differs, Maestro's tools, MCP Dock, toolkit, skills, plugins, hooks
- [Coordination](#coordination): project board, checks and merge queue, Guardrails, Relay workflows
- [Atlas](#atlas): the knowledge layer, versioned in git, and the ledger of what each task cost
- [Processes and isolation](#processes-and-isolation): omni, the sandbox, the agent terminal
- [Models and engines](#models-and-engines): providers, Claude mode
- [Interfaces](#interfaces): desktop, command line, ACP, HTTP API, live meetings
- [Security model](#security-model)
- [Maturity and limits](#maturity-and-limits)
- [Install](#install), [Guides](#guides), [Build from source](#build-from-source)

## How it works

1. **You ask Maestro.** Pick a project folder, connect a model, and describe the task in Chat.
2. **Maestro plans and delegates.** It splits the task into cards on the project board and dispatches each card to a specialist. Every specialist runs in its own durable session, optionally in its own worktree, that you can open, follow live and steer.
3. **Specialists work inside limits.** Each one runs in an OS sandbox that confines what it can read and write to the paths it was given. A fixed list of actions (push, commit, merge, publish, release, deploy, `rm`, hook bypasses) is refused to them outright. Your own permission rules decide what else needs a prompt.
4. **Results come back checked.** Maestro reads the evidence from the session events themselves, runs the project's declared checks, queues green work into the merge queue, and reports what changed and what is still open.

The board moves on facts: a card advances when work is dispatched, a pull request opens, or a merge lands. You approve plans and decisions; only you move cards out of Intake or archive a project.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme/flow-dark.png">
  <img src="docs/images/readme/flow-light.png" alt="You talk to Maestro, which sends questions to the research seat, plans to the product and architecture seat, briefs to the backend seat and cold reviews to the code review seat; the backend seat's pull request and evidence go to the project board and merge queue, which moves cards from Intake through Building, Review, Queued and Bundle to Shipped.">
</picture>

This is what a new session looks like in the desktop app. The bar under the composer picks the project, where the session runs and the branch; the footer offers Claude mode when no provider is connected yet.

<img src="docs/images/readme/session-composer.png" alt="The desktop app's Chat screen with an empty session: a composer with a model picker and a subagents setting, and below it the project, the place it runs and the branch.">

## The agents

Agents are called seats. Each seat has a role, a prompt, a tool set and its own skill tree.

| Role | What it does | State |
| --- | --- | --- |
| Maestro (lead) | Plans, dispatches, integrates results, owns the board, the merge queue and the decision records | Built |
| Backend | Writes and changes code, runs shell commands with a pinned toolkit of engines, uses project memory | Built |
| Product and architecture | Specs, plans, work-package briefs and workflow drafts | Built |
| Research | Read-only discovery across the code and the web; writes research documents | Built |
| Meeting copilot | Listens to a live meeting on macOS, answers in an overlay, talks to Maestro, writes up decisions and commitments | Built; not dispatchable |
| Frontend, code review, security review, documentation, process audit | Each has a prompt and a tool profile; governed mode uses the code review seat (`lucy`) to approve plans | Partial: no skill tree yet |

Maestro's name is fixed, because the app and other sessions address it by name. Every other seat has a stable id and a display name you can change, along with its prompt, tools, skills and picture, on the Agents screen. See [the agent screen](docs/guides/agent-screen.md).

Each seat works by a method: a few ideas that decide what it does and what it refuses. The method is written in the seat's prompt and in a skill tree it loads on demand, and most of it is guidance the model follows. A smaller set of rules is enforced by the host, so it holds even when a model ignores its prompt: write paths, the OS sandbox, refused commands, the research seat's citation checks and budgets, and governed approvals. Each section says which is which. The sections below explain each method and follow one running example through the seats: customers are sometimes charged twice when they double-click "Pay".

### Maestro: the lead

Maestro holds the judgment. It agrees the goal with the owner, makes small changes itself, sends larger or parallel pieces to the seat built for them, checks what comes back and lands it. Its playbooks ship with the app. Everything in this section is playbook method unless it says the host enforces it.

**Nothing is done until it is proven.** An agent's report says where the evidence is. It is not the evidence. For substantial work, before Maestro accepts a test as proof, it plants a small defect in the code and confirms that the test catches it for the right reason. A test that stays green against broken code proves nothing. For the same reason, a claim that something is absent ("no other caller") needs a search that has first been shown to find a known caller. A local pass is not a CI pass, and only the owner accepts a delivery.

**Review is cold.** For substantial work, the reviewer is the code review seat (`lucy`), or a read-only explorer when that seat is unavailable, and it never sees the author's reasoning. It gets the request, the spec and the diff and is asked to refute them, because a reviewer who reads the author's argument tends to agree with it. Maestro also never sends a change back to its own author for review.

**Units of work have a fixed shape.** Epics, work packages and governed cards state their completeness criteria, success criteria, invariants, quality standards and definition of done. A small task keeps them implicit and relies on the existing checks. An example or a counter-example is added only when it makes a criterion checkable, and the detail grows with the risk.

**Landing is serial and gated.** Work whose base has moved is held until Maestro has read the whole delta. Maestro's playbook forbids merging a card's pull request directly. The host does not block it, but a direct merge asks the owner first unless the owner's configuration allows it. Once a card has a pull request, a complete record and green scoped checks at its head, it goes into the merge queue, where the host bundles cards, runs the full suite once and merges.

**Governed mode is opt-in, for work that must be auditable.** It needs Atlas, a clean tree and fresh ownership facts, and the code review seat must approve the plan first. Each step leaves an immutable record. The owner then approves one exact dispatch (seat, prompt and model) by answering "approve" or "aprovo". The host enforces the rest: the approval allows one dispatch with byte-identical input, and if the input changes or the owner sends a newer message, it no longer counts.

*In the example*, Maestro sends the "why" question to the research seat and the plan to the product and architecture seat. It routes the fix and its new test to the backend seat with the plan's brief. When the fix returns, it removes the fix's key line, checks that the new test goes red and restores the line. With the owner's go-ahead to open the pull request, it queues the card.

### Product and architecture seat (`archie`)

This seat turns a request into a plan that someone else can build without making further decisions. Everything it returns is a proposal. Its prompt forbids implementing, dispatching or approving. The host limits its writes to the files its assignment lists, its workflow drafts and its own Atlas memory, and refuses publish commands.

**It separates what is known from what it thinks.** Every statement is labelled as an owner decision, a fact (supplied by the owner or observed in the code), an assumption, a proposal or a blocker. Missing information stays unknown instead of being filled in. This is what lets Maestro and the owner see which parts of a plan rest on evidence and which rest on a guess.

**It starts from the outcome, not the solution.** A spec names the job the user is trying to do, a measurable outcome, and four risks: is it valuable, usable, feasible and viable? Each risk is paired with the evidence that would retire it, and the riskiest unknown is tested first. Every design choice must point to the outcome or risk it serves. A choice that points to nothing is dropped or turned into a question for the owner.

**Every requirement can be checked.** Requirements are written one clause at a time, in a form like "when X, the system shall Y". Each one gets scenarios for the normal case, the edge cases and recovery, plus an oracle: the test or check that will say whether it holds. A requirement with no oracle stays unknown until one is supplied.

**It cuts work by responsibility.** The plan is sliced into pieces that each own a set of acceptance items and a set of files, so every item has one owner and two slices write the same file only in a declared order. The seat sends unresolved conflicts back for revision before anything runs. Where pieces depend on a shared interface, the seat freezes only that interface, including its error, ordering and retry behavior, so the pieces can be built in parallel.

**A brief leaves the executor nothing to discover.** It names the baseline commit, the exact code sites, the files the executor may write and must not touch, the commands that prove the work and the shape of the reply.

*In the example*, the seat might propose the outcome "one click or ten, at most one charge". The risk is feasibility: does the payment provider honor an idempotency key? The requirement reads "when the same checkout is submitted twice, the system shall create one charge". Its oracle is a test that sends two concurrent submissions and counts charges at the provider mock. The work splits into two slices, the API handler and the provider adapter, with the key's format frozen between them.

### Backend seat (`backend`)

This seat builds what the plan decided. It does not investigate, diagnose or choose a design. It expects a packet with the behavior to build, its acceptance, the files it may write and the checks to run. When anything is missing, it returns a blocker naming what is missing instead of exploring to fill the gap. Keeping exploration out of this seat keeps its changes inside the scope that was reviewed.

**It distrusts signals that only look like proof.** A clean compile does not show that behavior was preserved. Zero executed test cases is missing evidence, not a pass. A timeout does not prove that the remote call failed. A generated stub is not a working endpoint. A check counts only when the healthy case passes and a known-bad case fails for the stated reason.

**It checks state from outside the application.** When the packet asks it to prove a rollback, it injects a later failure and then looks at the database through a second connection. The application's own report is not enough. Its checks use the real database through the project's existing test setup, and it never swaps PostgreSQL for SQLite.

**Its skills carry the hard-won rules of each domain.**
- *Transactions*: only the owner of a transaction commits it, and one write through the pool silently escapes it.
- *Retries*: reuse the same business key as the idempotency key (the id that lets a provider recognize a repeated request) on every attempt, and never mint a new one per retry.
- *Cancellation*: wait for the work to actually stop, and remember that a cancel does not undo committed effects.
- *Webhooks*: verify the signature on the raw bytes before parsing.
- *gRPC*: HTTP 200 is not RPC success.
- *Refactoring*: when the packet selects it, a rename comes from the language service or compiler, which understands bindings. A text match would also hit a shadowed variable.
- *Generated code*: it is never edited by hand. It is regenerated through the project's generator, only when the generated files are inside the seat's write paths (otherwise it returns a blocker), and the seat checks that the diff stays inside them.

**It stops where its knowledge stops.** If what it sees contradicts the diagnosis it was given, it stops and does not invent a new theory. It fixes only check failures that it caused, at most three times per check. A permission denial comes back verbatim, and it never installs a tool. The host enforces the write paths, the OS sandbox (on macOS and Linux) and the refusal of publish commands. Its result card can lower its own outcome but cannot mark the work verified, because only the host's check run and the caller decide that.

*In the example*, the brief says "repair: the handler creates a new provider request per submission; reuse the checkout id as the idempotency key". The seat gets the handler slice; the adapter slice follows against the frozen key format. It writes the change in the files it was given. It runs the supplied concurrency test, which shows two submissions and one charge, and a control that drops the provider's response and retries with the same key. It returns the changed paths, each check with its exit code, and no claim that the work is verified.

### Research seat (`jimmy`)

This seat answers questions with evidence. It cannot edit project files; it writes only research records and its own Atlas memory. Its method exists to prevent the usual failures of a model asked about code: answering a question built on a false premise, citing lines it never read, and claiming "nothing else does this" after a search that could not have found anything.

**It checks the question first.** If the question names a function or a file, the seat confirms that it exists before answering. A false premise is the first thing it reports.

**It breaks the question into checkable parts.** For anything beyond a quick lookup, it opens an inquiry with up to six yes-or-no subquestions. The answer is complete only when each subquestion is answered.

**It looks wide and reads narrow.** It runs every lookup it needs in one batch: where the term appears, the definitions and callers, the exact text, and the git history. Then it captures only the few line ranges that decide the answer. When reading cannot settle a question, it runs a probe: the type checker, one test or a short script.

**Each claim says how it is known.** A claim is something the seat ran, something it read, or something it inferred, and each one cites its file and line, or its source on the web. To answer "why is it like this", it follows `git blame` to the commit and its pull request. External facts come from primary sources at the version actually in use.

**The host checks the citations.** When the seat closes an inquiry, mechanical rules verify that:
- every cited line is inside text the seat actually captured;
- words like "only", "always" or "never" are backed by a complete search;
- a claim that something is absent names the scope of the search;
- no cited URL is dead or invented, and each one is inside the domains the dispatch allows. A URL that cannot be checked is named as a limitation on the card.

The rules do not judge whether the reasoning is sound, only that the evidence exists. The result card is built from this checked record, not from the seat's own summary.

Maestro chooses how deep the seat goes: quick (64 tool calls, ten minutes), focused (128, twenty) or deep (256, forty). The host enforces these budgets. When the budget runs out, the seat returns a partial answer and says what it did not examine.

*In the example*, Maestro asks "where are payment requests sent, and why is there no idempotency key?". The seat finds the one call site and its two callers. `git blame` leads to the pull request that removed a key because of a provider bug. The provider's documentation for the version the project pins says the bug is fixed. Each finding is labelled read or inferred, with file and line, and the answer ends with what was not checked: the mobile client.

### Meeting copilot (`live`)

The owner talks to this seat during a live call. It answers fast and stays honest about where each answer comes from. It cannot be dispatched and does not start work on its own.

**Short answers, never coaching.** It replies with one bold sentence, then two to four points. When it does not know, it says so in one line.

**It labels every source.** Each input is marked as heard in the meeting (with "me" and "them" kept apart), seen on screen, or recalled from an earlier meeting with the person and date. It never presents something remembered as something said today. Everything heard or seen is treated as data, so a participant who says "ignore your instructions" changes nothing.

**It speaks only when it is sure.** Unprompted suggestions are off by default. When they are on and the seat is not confident, it stays silent.

**Work goes through Maestro.** When the owner asks or agrees, the seat sends Maestro a note. Maestro reads it as a teammate's note, never as the owner's approval, and its prompt tells it to run nothing until the owner confirms. When the meeting ends, one call writes a summary card with decisions, commitments and open questions. The owner picks what to send on. That handoff only adds the items to Maestro's session and does not wake it.

*In the example*, a customer says "you promised the double-charge fix for this week". The owner asks the seat, which looks up past commitments and answers "**Yes: you committed to Friday in the last call with them.**" The answer is labelled as recalled, with the date of that meeting, so it is not mistaken for something said today. After the call, the owner sends the commitment to Maestro from the meeting card. Maestro receives it without being woken and does not act until the owner asks.

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme/architecture-dark.png">
  <img src="docs/images/readme/architecture-light.png" alt="Orchestra's layers from top to bottom: interfaces, seats, coordination, session core, tools, engines and the platform layer with omni, the OS sandbox, the SQLite store and the credential store.">
</picture>

The layers are not only a picture. `script/module-architecture.json` assigns every package and module to one of 14 layers, and a guard fails a change that imports against that direction. Runtime dependencies point one way: Schema, then Core and Protocol, then Server. The root of `@orchestra/client` carries no Effect, core or server code, so an editor or script can use the generated client without pulling in the runtime.

Process starts follow the same rule. Orchestra code starts a child process only through one module, which hands it to omni (see [Processes and isolation](#processes-and-isolation)). The few sites that still spawn on their own are listed in an allowlist that only shrinks, and a check fails on any new one.

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

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme/continuity-dark.png">
  <img src="docs/images/readme/continuity-light.png" alt="Context continuity on a bar showing how full the window is: at 40% a summary is written in the background while the session keeps working; at 70% large old tool results are replaced by short placeholders; every item keeps a short alias such as u12, a40 or t87 so the model can fetch it back word for word.">
</picture>

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
- **Nothing is lost.** The original output is stored (64 MiB store, kept for seven days). The model sees a 32-character id and can call `lean_recall` with that id and an optional line range (`120-240`, `120-` or `120`) to read the original byte for byte.
- **Fail-open.** Lean acts only on output from known native tools, and a Lean error never fails the tool call: the model then gets the plain output.
- **Measured.** Each projection records bytes before and after and estimated tokens saved. When a measurement is missing it is shown as unavailable, never as zero.

For example, a `vitest` run that prints 3,000 passing lines and one failure reaches the model as the failure block, the summary counts and an id. If the model later needs line 1,200 of the original, it asks for `1200-1260` and gets those lines exactly as printed.

The Context savings screen in each project shows savings per tool and per command, a history, filters, and switches for each profile and for Lean as a whole. Lean is on by default (`tool_output.lean.enabled`). Independently of Lean, every tool result is bounded to 2,000 lines or 50 KiB; the rest goes to a tool output store the model can page through.

<img src="docs/images/readme/context-savings.png" alt="The Context savings screen: totals of bytes and estimated tokens saved, savings per tool and per command, and switches for each output profile.">


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

### How `read` differs

Most agent harnesses return a file with a line number on every line and cut it at a fixed count. Orchestra's `read` is built so that a small file costs as little as possible and a large one can be walked without guessing.

- **Small files come back whole.** A file up to 50 KB is returned in one piece, without line numbers, so the model spends no tokens on a number column it does not need.
- **Large files are paged.** Above that, `read` takes a 1-based `offset` and a `limit` and returns at most 2,000 lines or 50 KB per call. Each result says whether it was cut (`truncated`) and where the next page starts (`next`), so the model never has to work out the next offset itself.
- **Long lines are cut, not dropped.** A line over 2,000 characters ends with `... (line truncated to 2000 chars)`, so one minified line cannot fill the page.
- **Directories list one level**, directories first, with the same paging.
- **Images are read as images.** JPEG, PNG, GIF and WebP files up to 20 MB are detected by their first bytes, not by their extension, and sent to the model as attachments. An image larger than 2000 pixels on a side or 5 MB encoded is resized with Lanczos3 first.
- **Binary files are refused.** Executables and PDFs fail with "Cannot read binary file", and text that is not valid UTF-8 fails with "File is not valid UTF-8", instead of returning bytes the model would misread.
- **Paths are checked.** A relative path resolves from the working directory. A path outside it asks for external-directory permission first.

For example, a seat facing a 4 MB log from a test run does not read it from the top. It runs `grep` for the failure, then one `read` whose `offset` is the line number grep reported, and gets a page that starts at the error.

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

<img src="docs/images/readme/skills.jpg" alt="The Skills screen: the skills available in the project, grouped by where they were loaded from, with a description for each.">

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

The idea is to pay for the full suite once per bundle instead of once per change. Each card first proves itself with the checks its change touches. Only green cards enter the queue, and the host, not an agent, admits them: a card is refused unless it is in Review with a complete pull request record, is scoped-green, has a linked repository, does not conflict with its base, has its dependencies met, is not paused, and has no follow-ups that are not yet cards on the board.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme/pipeline-dark.png">
  <img src="docs/images/readme/pipeline-light.png" alt="The landing pipeline: a card with a pull request passes scoped checks at its head commit, is admitted to the queue by the host, joins a bundle of four by default, the full suite runs once on the bundle, the bundle is merged locally and fast-forwarded, and a record commit writes each attempt's cost, time and verdict to .atlas in git. A red bundle is halved and bisected, only the card red on its own goes back to Review, an infrastructure failure is rerun once, and a red base opens a bug card.">
</picture>

- **Runs once per tree.** A check result is tied to the tree SHA, so identical content is never tested twice.
- **Bundles.** Green cards are queued and merged together as one pull request (4 cards by default, configurable up to 16, or whatever is ready after 45 minutes). After 50 cards the bundle size adapts to the observed red rate.
- **Red handling.** A red bundle is halved and bisected. A card that is red on its own goes back to Review. An infrastructure failure is rerun once. A flaky test is recorded as a flake. A red base opens a bug card and is never reverted automatically. A bundle that needs more than two rebuilds is dissolved.
- **No lost work.** Every 10 minutes, work in progress (including untracked files) is pushed to a private ref after a gitleaks secret scan. After a crash, worktrees are restored and no bundle is pushed twice.
- **Base tracking.** The base branch is fetched every minute and each queued card is trial-merged against it.

When a bundle merges, the record commit updates the board record and the cost ledger (see [What each task cost](#what-each-task-cost)). Free text is redacted when the repository is public.

### Guardrails

Guardrails is a rule engine that runs on every change: 78 rules today, 53 that block and 25 that warn. Rules match added lines, changed paths or balance between added and removed lines.

- Rules are read from the merge base, so a change cannot weaken the guards that judge it.
- Moved code is recognized and not flagged again.
- Every rule ships with samples that must match and samples that must not.
- An exception is either an inline `guardrail-ignore` with a written reason, which is itself reported, or a `guardrail-approved` label that clears one rule on one pull request.

The rules and their runs are visible in the app under Actions.

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

### What each task cost

Every attempt at a card is metered, and the record lands in git next to the code it produced. When the merge queue lands a bundle, it commits `chore(queue): record <label>`, and the merge commits on the base branch carry `WP:` and `Attempt:` trailers that point back to the record. So `git log` alone can answer "who built this, with which model, and what did it cost?", months later, from any clone.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme/atlas-ledger-dark.png">
  <img src="docs/images/readme/atlas-ledger-light.png" alt="The Atlas ledger: the record commit chore(queue): record label, the .atlas layout with cards/CARD/card.jsonl and one attempts/a-n.jsonl file per attempt, and the fields of one metered attempt: seat, session, engine and model, tokens in and out with cache, tool calls, wall time, reworks, gates and verdict, cost in micro-dollars and the transcript hash.">
</picture>

Each card has a folder, `.atlas/cards/<CARD>/`, with the card's history in `card.jsonl` and one file per attempt in `attempts/a<n>.jsonl`. An attempt records:

- the seat (by role id) and its session;
- the engine and model that ran it;
- tokens in and out, and cache reads and writes;
- tool calls, wall time and how many times the work was sent back;
- the gates it passed or failed and its verdict;
- the model spend in micro-dollars (`costMicroUsd`);
- a hash of its full transcript, so the attempt can be tied to exactly what was said.

*In the example*, the double-charge card might show two attempts: the first sent back once by the cold review for a missing control, the second green. The record says which seat and model each used, how long each ran and what it cost, so the price of the rework is visible instead of folded into a monthly bill.

The numbers are honest about their gaps. A seat whose engine reports no usage shows "not metered", never zero. Budgets warn at 80%, ask at 90% and pause the work at 100%, and a card that costs three times the median of the other cards in its epic or more is flagged, once the epic has at least two other cards to compare with. In a public repository the spend is dropped before the line is written, so model cost never reaches GitHub; the project board's Money panel shows it from the local database instead.

## Processes and isolation

### Omni: the native process layer

Agents start a lot of processes: test runners, dev servers, language servers, package managers, shells. When an agent or the app dies, the usual result is orphan processes holding ports and memory. Omni is a Rust layer (a native addon plus a supervisor binary) that starts child processes for Orchestra and owns each one's whole process tree.

Omni is on by default in builds that include it for their platform. `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER` has three states: unset or `1` uses omni and hands options it does not support yet to the older spawner, `strict` uses omni with no hand-off, and `0` rolls back to the older spawner. An empty value also selects the older spawner. An invalid value falls back to it with a warning, and so does a build without omni for its platform when the flag is set. The guarantees below hold only when omni is in use.

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

### Providers

About 30 built-in provider plugins. The model layer implements six wire protocols: Anthropic Messages, Bedrock Converse, Gemini, OpenAI Chat, OpenAI Responses and OpenAI-compatible chat. The session core routes three of them today (Anthropic Messages, OpenAI Responses and OpenAI-compatible chat); the others are implemented in the model layer but not yet routed by the session core. The model catalog comes from models.dev, with an offline snapshot built in. You pick a reasoning level per model.

### Claude mode

Claude mode runs an agent's turns inside Claude Code, on your Claude subscription. Turn it on in Settings › Providers › Claude mode. Claude Code signs in with your own account (`claude auth login --claudeai`); Orchestra stores no Claude credential.

<img src="docs/images/readme/settings-providers-claude-mode.png" alt="Settings, Providers, Claude mode: the switch that runs agents through Claude Code and the sign-in status of the local Claude Code.">

The hard part is keeping Orchestra's rules while Claude Code does the work. Orchestra does it by treating Claude Code as an execution host for one provider turn, not as a second orchestrator.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme/claude-mode-dark.png">
  <img src="docs/images/readme/claude-mode-light.png" alt="Claude mode: Orchestra's session runner calls the execution host once per provider turn; the host starts Claude Code's query with the claude_code system prompt preset plus an appendix; Claude Code's own tools pass a PreToolUse gate of permission, ToolSafety and sandbox that fails closed, while Orchestra's tools served as mcp__orchestra__ settle through the runner; Agent, Task, SendMessage, ListAgents, RemoteTrigger and PushNotification are refused.">
</picture>

- **One turn, one call.** The session runner still admits your prompt, loads history and persists every event. One provider turn is one call into the host, and Claude Code's internal tool calls are stored as events like any other. Claude Code owns compaction inside its own session.
- **Claude Code stays Claude Code.** `query()` always keeps Claude Code's own system prompt and Orchestra adds only an appendix. Project context goes in with each prompt and is resent only when its hash changes.
- **Orchestra's tools, Orchestra's gate.** Seats, the board, memory, skills and the other Orchestra tools are served to Claude Code as an MCP server (`mcp__orchestra__*`). Claude Code's own tools pass a PreToolUse gate that runs Orchestra's permission rules, ToolSafety and the sandbox, and fails closed. `mcp__orchestra__*` calls pass the same hook only to check governed loading; their permissions are settled by the session runner like any Orchestra tool call.
- **Seats stay real sessions.** Claude Code's Agent and Task tools are refused, so a seat is dispatched with `mcp__orchestra__task` and becomes an Orchestra session with its own history. SendMessage, ListAgents, RemoteTrigger and PushNotification are refused too. A child seat runs on Claude Code only when its model is a Claude model; otherwise it runs on Orchestra's own loop.
- **Billing is passed through, not worked around.** A billing refusal is shown word for word and never retried. Cost comes from Claude Code's own total. Each turn starts one Claude Code process.

See the [Claude mode guide](docs/guides/claude-mode.md).

## Interfaces

- **Desktop app.** The main interface: Chat with Maestro, sessions with live task rows, the project board, workflows, hooks, Actions (checks, queue, Guardrails), Context savings, Atlas, agents, providers, integrations, MCP servers, plugins, a `.env` editor, scheduled tasks, and the MCP Dock. The app starts its own local server on 127.0.0.1 with a random password and restarts it with backoff if it dies.
- **Command line.** `orchestra` runs the same agents in a terminal UI, as a one-shot `orchestra run`, or as a server (`orchestra serve`, with Basic Auth; `orchestra web` adds the web UI). `orchestra attach` connects a terminal UI to a running server. It also manages sessions, agents, models, providers, MCP servers, plugins, the toolkit, the background service and the database; exports or imports transcripts; checks out a pull request into a session (`orchestra pr`); shows token and cost statistics (`orchestra stats`); and upgrades or uninstalls itself.
- **ACP.** `orchestra acp` speaks the Agent Client Protocol on stdio for editors, with session replay, MCP, permissions and modes.
- **HTTP API.** The server exposes about 50 handler groups. Promise and Effect clients are generated from the API definition, and a check fails when they drift.
- **Live meetings (macOS).** The meeting copilot listens to a call, answers in an overlay with hotkeys, can ask Maestro, and leaves a summary card with decisions and commitments. Needs a Deepgram key and Screen Recording permission.
- **Scheduling.** One-off or recurring tasks for Maestro.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/readme/home-dashboard.png">
  <img src="docs/images/readme/home-dashboard-light.jpg" alt="The desktop app's Home screen for a project: the sidebar with Home, Chat, Project Board, Agents and Actions, and the project's overview.">
</picture>

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
- Omni is pre-release; its guarantees hold only where the conformance scenario is green in CI, and only in builds that include omni for their platform.
- The session core routes three of the six wire protocols (Anthropic Messages, OpenAI Responses and OpenAI-compatible chat).
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

User guides are in [`docs/guides`](docs/guides/README.md).

| Topic | Guides |
| --- | --- |
| Start | [Getting started](docs/guides/getting-started.md), [First run](docs/guides/first-run.md), [Settings](docs/guides/settings.md), [Environment](docs/guides/environment.md) |
| Agents | [Maestro](docs/guides/maestro.md), [The agent screen](docs/guides/agent-screen.md), [Agent pictures](docs/guides/agent-avatars.md), [Session requests](docs/guides/session-requests.md), [Live meetings](docs/guides/live-meetings.md) |
| Models | [Claude mode](docs/guides/claude-mode.md), [Credentials](docs/guides/credentials.md), [Composer](docs/guides/hugr-composer.md) |
| Work | [Workflows](docs/guides/workflows.md), [Hooks](docs/guides/hooks.md), [Skills](docs/guides/skills.md), [Instructions and the terminal UI](docs/guides/instructions-and-tui.md), [Checks and the merge queue](docs/guides/merge-queue.md), [Keep awake](docs/guides/keep-awake.md) |
| Tools and trust | [Permissions and saved rules](docs/guides/permissions.md), [Project trust](docs/guides/mcp-project-trust.md), [MCP Dock](docs/guides/mcp-dock-servers.md) |
| When something fails | [Desktop startup](docs/guides/desktop-startup.md), [App error messages](docs/guides/app-error-messages.md), [Config errors](docs/guides/config-errors.md), [MCP and CLI failures](docs/guides/mcp-and-cli-failures.md), [Database backups](docs/guides/database-backups.md) |

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
