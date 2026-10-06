---
name: backend-implement
description: "Common procedure for an assigned backend implementation packet: check the packet, select the change mode, implement inside the supplied design, run the named checks and return the backend-result card. Load before editing any assigned backend change. Not for investigation, diagnosis, design or review."
---

# Backend implementation

This skill details how to carry out an assigned backend packet. It sits under your system prompt and never widens it. The packet decides scope, design, write paths and checks; the prompt's Forbidden line still applies. Where this skill and the packet disagree, follow the packet.

## When this applies

- Applies: an assigned server-side change whose behavior, targets and checks are supplied.
- Does not apply: "find out why", "design", "review", "make it faster" without a chosen change, UI work, provisioning or production operations. Those belong to other owners. Return a `packet` blocker that names the owner.
- Also load a domain entry when the work fits: `backend-api`, `backend-data`, `backend-concurrency`, `backend-refactor` or `backend-check`. Do not load guidance because a dependency merely appears in the repository.

## 1. Check the packet

The packet may be plain text, earlier messages or a structured dispatch. Never ask for a form.

| Field | Required |
| --- | --- |
| Target behavior and its acceptance | Always |
| Write paths (named write targets count) | Always |
| Checks, with command and cwd | Always |
| Diagnosis and fix direction | Repairs |
| Decisions: architecture, public API, migration strategy, product behavior | When the change depends on them |
| Interfaces and patterns to follow | When the change depends on them |
| Stack, runtime and dependency versions | When a version-sensitive choice depends on them |
| Known baseline failures, latitude, escalation boundary, return address | When supplied; the default return address is the caller |

Return one `packet` blocker per missing required item, all in one result, naming whose decision it is. Continue assigned work that does not depend on a missing item. Never fill a gap by reading other code.

When the packet supplies a baseline revision, run this in the assigned worktree before editing:

```sh
git rev-parse HEAD
git status --short
git merge-base --is-ancestor <baseline-sha> HEAD
```

HEAD must equal the baseline unless the packet declares an existing delta. A mismatch or a nonzero Git exit is a `packet` blocker that quotes the output, never a clean result. If the packet lists these commands as checks, report them in `checks`.

## 2. Select the mode

Pick one primary mode per deliverable from the packet's starting facts, not from its wording. Read the mode reference when its procedure matters:

- [Feature](references/modes/feature.md): new specified behavior.
- [Diagnosed repair](references/modes/repair.md): supplied cause, fix direction and regression case.
- [Prescribed refactor](references/modes/refactor.md): structural change with behavior to preserve.
- [Migration or compatibility change](references/modes/migration.md): a supplied phase between states or versions.
- [Prescribed optimization](references/modes/optimization.md): a chosen technique with a comparable workload.
- [Assigned tests](references/modes/tests.md): test implementation the packet assigns.

A packet may carry an implementation output and assigned tests; apply both in the supplied order. If the mode label contradicts the facts, such as a "refactor" that changes accepted inputs, return a `packet` blocker that quotes both.

## 3. Implement

- Read the named targets, supplied patterns and the manifests needed to apply the supplied context. Do not search for callers or similar code.
- Your choices: private helpers, idiomatic control flow, concrete SQL, DTO mapping, resource wrappers, fixture arrangement for assigned tests, ordinary parameters of project commands the packet names, and fixes for compile or test errors in lines you wrote. The caller does not need to prewrite SQL, line spans or a tool manual.
- Not your choices: cross-owner architecture, public contract changes, policy, scope, and any edit outside the write paths. Each is a `packet` blocker.
- Follow the conventions of the surrounding code and project instructions. Leave unrelated code and other people's changes alone.
- With a generator or owned tool, generate only the artifacts the change affects. A generated skeleton is not the completed behavior. On failure copy its `error.code` into a `tool` blocker. Before any further mutating call, check what a failed call with partial or unknown effects wrote; never replay it blindly.

## 4. Run the checks

- Run exactly the packet's checks plus mandatory checks from project instructions. List broader checks under `nextActions`.
- In armed delegation the host also runs the checks; the packet decides whether you run them first. Record `skip` only when it says so.
- If a failure points at lines you changed, fix and rerun, at most three attempts per check. Otherwise record `fail` with the relevant output and do not look for the cause. Report known baseline failures; do not fix them.
- A forced skip, zero selected cases or an absent fixture is never a pass, and a local pass is not production evidence.

## 5. Return

The final message is the result. Write, in as few sentences as it takes:

1. The outcome: done or blocked.
2. What changed.
3. What you ran and what it showed.
4. How to use or run the change.
5. Remaining limits and risks.

Delegated: English, terse; the caller reads the typed card, so do not restate it. Direct: the language of the user's latest message; when blocked, list what the user must supply and who owns any diagnosis. Then write exactly one `backend-result` block as the prompt defines, with no tool call after it. The card carries worker claims only: no verification, acceptance, memory status, Session or task IDs.

## 6. Continuity

When an Atlas header is in context, the packet declares a resume, or bound Atlas memory tools are available, read [continuity](references/continuity.md).
