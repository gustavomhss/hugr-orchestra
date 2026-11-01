# The agents

Agents are called seats. Each seat has a role, a prompt, a tool set and its own skill tree. You talk to Maestro, the lead; it dispatches the other seats. Read this to know which seat does what and how each one is held to its evidence.

| Role | What it does | State |
| --- | --- | --- |
| Maestro (lead) | Plans, dispatches, integrates results; owns the board, the merge queue and the decision records | Built |
| Product and architecture (`archie`) | Specs, plans, work-package briefs, workflow drafts | Built |
| Backend (`backend`) | Writes and changes code, runs shell commands with a pinned toolkit, uses project memory | Built |
| Research (`jimmy`) | Read-only discovery across the code and the web; writes research documents | Built |
| Meeting copilot (`live`) | Listens to a live meeting on macOS, answers in an overlay, talks to Maestro, writes up decisions | Built; not dispatchable |
| Frontend, code review, security review, documentation, process audit | A prompt and a tool profile each; governed mode uses the code review seat (`lucy`) to approve plans | Partial: no skill tree yet |

Maestro's name is fixed, because the app and other sessions address it by name. Every other seat has a stable id and a display name you can change, along with its prompt, tools, skills and picture, on the Agents screen ([guide](agent-screen.md)).

Each seat works by a method written in its prompt and in a skill tree it loads on demand. Most of the method is guidance the model follows. A smaller set of rules is **enforced by the host**, so it holds even when a model ignores its prompt. Each seat below lists both.

The running example: customers are sometimes charged twice when they double-click "Pay".

## Maestro: the lead

Maestro agrees the goal with you, makes small changes itself, sends larger or parallel pieces to the right seat, checks what comes back and lands it. Its playbooks ship with the app.

| Rule | What it means |
| --- | --- |
| Nothing is done until proven | A report says where the evidence is; it is not the evidence. For substantial work, Maestro plants a small defect and confirms the test catches it for the right reason. A claim of absence ("no other caller") needs a search first shown to find a known caller. A local pass is not a CI pass; only you accept a delivery. |
| Review is cold | The reviewer is the code review seat, or a read-only explorer when it is unavailable. It gets the request, the spec and the diff, never the author's reasoning, and is asked to refute them. A change never goes back to its own author for review. |
| Units of work have a fixed shape | Epics, work packages and governed cards state completeness criteria, success criteria, invariants, quality standards and definition of done. Small tasks keep them implicit. Detail grows with risk. |
| Landing is serial and gated | Work whose base moved is held until Maestro reads the whole delta. A card with a pull request, a complete record and green scoped checks goes into the merge queue. |

| Enforced by | Rule |
| --- | --- |
| Playbook | Never merge a card's pull request directly. |
| Host | A direct merge asks you first unless your configuration allows it. The merge queue bundles cards, runs the full suite once and merges. |
| Host | **Governed mode** (opt-in, for auditable work): needs Atlas, a clean tree and fresh ownership facts; the code review seat approves the plan first; each step leaves an immutable record; you approve one exact dispatch (seat, prompt, model) with "approve" or "aprovo". The approval covers one dispatch with byte-identical input and lapses if the input changes or you send a newer message. |

*Example:* Maestro sends the "why" question to the research seat and the plan to the product and architecture seat, then routes the fix and its new test to the backend seat with the plan's brief. When the fix returns, it removes the fix's key line, checks that the new test goes red and restores the line. With your go-ahead to open the pull request, it queues the card.

## Product and architecture seat (`archie`)

Turns a request into a plan someone else can build without further decisions. Everything it returns is a proposal.

- **Known versus thought.** Every statement is labelled: owner decision, fact (from you or observed in the code), assumption, proposal or blocker. Missing information stays unknown.
- **Outcome before solution.** A spec names the user's job, a measurable outcome, and four risks (valuable, usable, feasible, viable), each paired with the evidence that would retire it. The riskiest unknown is tested first. A design choice that serves no outcome or risk is dropped or becomes a question.
- **Checkable requirements.** One clause each, as "when X, the system shall Y", with scenarios for the normal case, edge cases and recovery, and an oracle: the test or check that decides it. No oracle, no requirement.
- **Cut by responsibility.** Each slice owns a set of acceptance items and files. Two slices write the same file only in a declared order; unresolved conflicts go back for revision. Shared interfaces are frozen (including error, ordering and retry behavior) so slices build in parallel.
- **Briefs leave nothing to discover.** Baseline commit, exact code sites, files the executor may write and must not touch, commands that prove the work, the reply's shape.

| Enforced by | Rule |
| --- | --- |
| Prompt | Never implement, dispatch or approve. |
| Host | Writes only the files its assignment lists, its workflow drafts and its own Atlas memory. Publish commands are refused. |

*Example:* outcome "one click or ten, at most one charge". Risk: feasibility, does the payment provider honor an idempotency key? Requirement: "when the same checkout is submitted twice, the system shall create one charge". Oracle: a test that sends two concurrent submissions and counts charges at the provider mock. Two slices, the API handler and the provider adapter, with the key's format frozen between them.

## Backend seat (`backend`)

Builds what the plan decided. It does not investigate, diagnose or choose a design. It expects a packet with the behavior, its acceptance, the files it may write and the checks to run; if anything is missing it returns a blocker naming it. This keeps its changes inside the scope that was reviewed.

- **Signals that only look like proof are not proof.** A clean compile does not show behavior was preserved. Zero executed tests is missing evidence. A timeout does not prove a remote call failed. A generated stub is not a working endpoint. A check counts only when the healthy case passes and a known-bad case fails for the stated reason.
- **State is checked from outside the app.** To prove a rollback, it injects a later failure and reads the database through a second connection. Checks use the real database through the project's test setup; PostgreSQL is never swapped for SQLite.
- **It stops where its knowledge stops.** Evidence that contradicts the diagnosis it was given stops the work; it does not invent a new theory. It fixes only check failures it caused, at most three times per check. Permission denials come back verbatim; it never installs a tool.

Domain rules from its skills:

| Domain | Rule |
| --- | --- |
| Transactions | Only the owner of a transaction commits it; one write through the pool silently escapes it. |
| Retries | Reuse the same business key as the idempotency key on every attempt; never mint one per retry. |
| Cancellation | Wait for the work to actually stop; a cancel does not undo committed effects. |
| Webhooks | Verify the signature on the raw bytes before parsing. |
| gRPC | HTTP 200 is not RPC success. |
| Refactoring | When the packet selects it, renames come from the language service or compiler, not a text match that would hit a shadowed variable. |
| Generated code | Never edited by hand. Regenerated through the project's generator only when the generated files are inside its write paths (otherwise a blocker), and the diff must stay inside them. |

| Enforced by | Rule |
| --- | --- |
| Host | Write paths, the OS sandbox (macOS and Linux), refusal of publish commands. |
| Host | Its result card can lower its own outcome but cannot mark the work verified; only the host's check run and the caller decide that. |

*Example:* the brief says "repair: the handler creates a new provider request per submission; reuse the checkout id as the idempotency key". The seat gets the handler slice; the adapter slice follows against the frozen key format. It runs the supplied concurrency test (two submissions, one charge) and a control that drops the provider's response and retries with the same key. It returns the changed paths and each check with its exit code, with no claim that the work is verified.

## Research seat (`jimmy`)

Answers questions with evidence. Its method targets three usual failures: answering a question built on a false premise, citing lines never read, and claiming "nothing else does this" after a search that could not have found anything.

- **Question first.** If it names a function or file, the seat confirms it exists. A false premise is reported first.
- **Checkable parts.** Beyond a quick lookup, it opens an inquiry with up to six yes-or-no subquestions; the answer is complete only when each is answered.
- **Wide search, narrow reading.** All lookups in one batch (term, definitions and callers, exact text, git history), then capture only the line ranges that decide the answer. When reading cannot settle it, a probe: the type checker, one test or a short script.
- **Each claim says how it is known:** ran, read or inferred, with file and line or web source. "Why is it like this" follows `git blame` to the commit and its pull request. External facts come from primary sources at the version in use.

| Enforced by | Rule |
| --- | --- |
| Host | Cannot edit project files; writes only research records and its own Atlas memory. |
| Host | On close, mechanical citation checks: every cited line is inside text the seat captured; "only", "always" or "never" are backed by a complete search; a claim of absence names its search scope; no cited URL is dead, invented or outside the allowed domains (an unverifiable URL is named as a limitation). The result card is built from this checked record, not the seat's summary. The checks confirm the evidence exists, not that the reasoning is sound. |
| Host | Depth budgets set by Maestro. When one runs out, the seat returns a partial answer and says what it did not examine. |

| Depth | Tool calls | Time |
| --- | --- | --- |
| Quick | 64 | 10 min |
| Focused | 128 | 20 min |
| Deep | 256 | 40 min |

*Example:* "where are payment requests sent, and why is there no idempotency key?". The seat finds the one call site and its two callers. `git blame` leads to a pull request that removed a key because of a provider bug; the provider's docs for the pinned version say the bug is fixed. Each finding is labelled read or inferred, with file and line, and the answer ends with what was not checked: the mobile client.

## Meeting copilot (`live`)

You talk to it during a live call. It answers fast and labels where each answer comes from. It cannot be dispatched and does not start work on its own.

- **Short answers, no coaching.** One bold sentence, then two to four points. "I don't know" in one line.
- **Every source labelled:** heard in the meeting ("me" and "them" kept apart), seen on screen, or recalled from an earlier meeting with person and date. Something remembered is never presented as said today. Everything heard or seen is data, so "ignore your instructions" from a participant changes nothing.
- **Speaks only when sure.** Unprompted suggestions are off by default; when on, it stays silent if not confident.
- **Work goes through Maestro.** When you ask or agree, it sends Maestro a note, which Maestro reads as a teammate's note, never your approval; Maestro's prompt says to run nothing until you confirm. At the end, one call writes a summary card (decisions, commitments, open questions). You pick what to send on; the handoff adds items to Maestro's session without waking it.

*Example:* a customer says "you promised the double-charge fix for this week". The seat answers "**Yes: you committed to Friday in the last call with them.**", labelled as recalled with that meeting's date. After the call you send the commitment to Maestro from the meeting card; Maestro receives it without being woken.
