---
name: agent-dispatch-and-landing
description: >
  The lead's protocol for dispatching work to sub-agents and LANDING what comes back — worktree isolation,
  push-early so an agent's death is resumable, the non-negotiable contents of a brief, and the verification
  a lead owes before merging (mutation-probe the agent's own tests, never land on a self-report). Invoke
  before dispatching any agent, and before merging anything an agent produced.
---

# agent-dispatch-and-landing — an agent's death should be a resumable event

## Isolation is not optional

**One worktree per dispatched agent.** Worktrees of the same clone share the index and the stash, so an
agent working in the shared checkout will commit onto _your_ active branch and its work will ride into a
merge that never gated it. Measured: a background task committed onto the lead's branch; the squash carried
**three files when one was intended**, caught only by reading `git show --stat`.

## Push early — before the work is "ready"

> A pushed branch is recoverable state. An agent's context is not.

An agent died mid-task on a session rate limit today. **Its work survived intact**, because it was in its
own worktree and had already pushed a PR. Nothing was in its head.

Two peer sessions the same day died with work inside and left no branch. The loss was not the time — it was
**counting on a deliverable that did not exist**, discovered hours later.

So the dispatch contract carries: _push the branch at the first commit that compiles, even incomplete._
Costs one push; buys every future rate limit.

## What a brief must carry

- **The target, pre-decided.** If the agent must choose an interface, the brief is under-specified. A work
  package with a live decision in it is not ready to dispatch.
- **The files to read first**, by path. Do not make it discover the map.
- **The acceptance items**, each as a real test — not prose about quality.
- **The traps of THIS repository**, verbatim. Mine: never `git add -A` (it sweeps ~1300 untracked store
  blobs); never run the whole test suite concurrently (it has frozen this machine); stage by name; run
  `git show --stat` before pushing.
- **The mutation-probe requirement:** the agent must break its own implementation, confirm the test goes
  red, restore, and **report the measured before/after**.
- **The stop line:** _"open the PR, wait for CI, stop at 'PR green, waiting for the lead'. You do not
  merge."_
- **One question back:** _"what did my framing of this get wrong?"_ This is where the best findings come
  from — an agent told me my write door should fold into an existing one, then read the ADR and found the
  reasoning only applied to the same store.

## Landing: the lead owes verification, not trust

**Never land on a self-report.** Agents have been wrong about test counts, about what shipped, and about
whether a thing was already done. The report is a lead, not evidence.

The landing sequence:

1. **Read the diff for guard changes first.** A diff that touches gate _logic_ deserves more scrutiny than
   everything else in the PR combined — see `gate-authoring`, "prove it is a strengthening".
2. **Verify every citation.** When an agent justifies a decision by citing a ratified document, open the
   document. (It cited an ADR licensing a surface change; the citation was accurate — but that is a fact I
   established, not one I accepted.)
3. **Mutation-probe the agent's own tests.** Break the behaviour its tests claim to protect and confirm
   they go red. Two probes on one PR today: removing an owner filter turned two legs red; removing a decay
   term turned four red. That is what promoted "the tests pass" into "the tests bite".
4. **Run every gate by name**, not the ones that seem relevant.
5. **`git show --stat`** before the merge. Every time.
6. Merge, then **prune**: delete the remote branch, remove the worktree, delete the local branch.

## Cleaning up after an agent that died

A dead agent leaves a **locked** worktree. Before forcing it:

```
ps -p <pid>                                   # the lock names the pid — is it actually alive?
git -C <worktree> status --short | grep -v '^??'   # any uncommitted work?
```

Only then `git worktree remove -f -f`. Forcing a live agent's worktree destroys work; forcing a dead one's
is hygiene. The check is two commands.

To prune remote branches safely, match each branch tip against its merged PR's head SHA — a squash-merged
branch is **never** an ancestor of the target, so `git merge-base --is-ancestor` gives the wrong answer and
`--merged` will not list it.

## Parallelism

Cap concurrent agents at what you can actually review. The lead is the bottleneck, and a queue of unreviewed
green PRs is not progress — it is deferred judgment. Dispatch the next slice when the last one has landed.
