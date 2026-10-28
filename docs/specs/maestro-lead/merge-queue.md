# Merge queue and CI bundles

Status: design for the owner to decide. Nothing here is built.

This spec covers how Maestro gets many cards into the base branch at once. The target is about 40 seats in parallel,
many pull requests arriving together, CI failing, cards going back to rework and several scopes in flight. The pains
are the owner's: the queue explodes, rebases and conflicts pile up, and work is sometimes lost.

It builds on the lead playbooks (`maestro-lead` `track` and `land`), the board contract
(`docs/specs/projects-board/CONTRACT.md`) and the board-drift source
(`modules/maestro/coordination/src/v2/board-drift-source.ts`). At the time of writing, these live on the
`maestro-capabilities` branch.

## 1. Today

| Fact | Where |
|---|---|
| A `task` with `card` moves the card to Building. An open PR moves it to Review. A merged PR moves it to Shipped. The host polls GitHub every 60 s; there are no webhooks. | `governance.ts` `claim()`, `packages/core/src/board/github.ts` `advance()`, `board.ts` poll loop |
| Seats never commit. The card's worktree HEAD is where the card started. Maestro commits, pushes and opens the PR in `land`. | `maestro-lead/land` steps 2 and Publish 1 |
| Until `land`, a card's work exists only in a local worktree. The board cannot see it, and a removed worktree or a dead host loses it. | same |
| `land` merges each PR on its own "when the project's required checks pass". There is no queue and no bundle. | `maestro-lead/land` Publish 2 |
| The card has `attempts` (a counter) and `crash_reason`. A rework has no identity beyond the counter. | `BoardIssueTable` |
| `board_ci_run` stores billable minutes per Actions run, not pass or fail. Head SHAs are read in passing and not stored. | `github.ts` `runs()` |
| `<board-drift>` lists Building and Review cards whose Session link is missing or dead. | `board-drift-source.ts` |
| Change-scoped tests run through `bun run test:ci`, which snapshots the working tree to a `ci-run-*` branch. `typecheck.yml` and `test.yml` run on `workflow_dispatch` or the `epic` label; neither takes a ref input. | `script/test-ci.ts`, `.github/workflows/` |
| The arsenal's `conflict-map` and `wave-scheduler` compare declared write sets (paths and line ranges, with an `appendOnly` union rule). Both are pure: they persist nothing and never merge. `wave-ledger` writes JSON under the governance state directory. | `modules/maestro/arsenal/src/tools/` |
| Maestro neither configures nor triggers CI. | |

The repository is owned by a personal account (`gustavomhss/hugr-orchestra`, `isInOrganization: false`), and it
allows merge commits.

## 2. Recommendation

**The host runs one batch queue per repository and base branch. Its bundles are ordinary pull requests that carry the
project's full CI. A red bundle is split by isolation, then by halving, and the culprit is ejected into a numbered
rework attempt on the same card. Maestro never computes queue state. It decides only what needs judgment: enqueue,
flaky verdicts, and where rework goes.**

There are two gates, as in Mergify's "two-step CI" and as `AGENTS.md` already asks:

1. **Scoped gate, per card.** Change-scoped tests and a typecheck run on the card's own tree, before it may queue.
2. **Full gate, per bundle.** The full suite runs once on base + N queued PRs. This bundle replaces the epic PR as the
   unit that carries the `epic` label.

Separately, every seat return is pushed as a hidden snapshot ref, so no work lives only on a disk.

## 3. Prior art

| Approach | Batching | On a red | Fit here |
|---|---|---|---|
| GitHub merge queue ([docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)) | Groups of 1–100 PRs on `gh-readonly-queue/*` branches. Workflows need the `merge_group` trigger. | The failing or conflicting PR is removed and the temp branch rebuilt. Bisect is not described. | **No.** It is available only to organization-owned repositories, and this one is personal. It would also need `merge_group` in both workflows and would bypass the `epic` label. |
| GitLab merge trains ([docs](https://docs.gitlab.com/ee/ci/pipelines/merge_trains.html)) | No batching. Each MR is tested on everything ahead of it, up to 20 parallel pipelines. | The MR is removed; pipelines behind it restart. | A full run per MR is the cost the owner rejected. |
| Bors / "not rocket science rule" ([bors.tech](https://bors.tech/), [Hoare](https://graydon2.dreamwidth.org/1597.html)) | A staging branch is tested and the exact tested commit is fast-forwarded to base. | The batch fails as a unit. | We adopt the rule: base moves only to a tested result. The essay page refused our fetch (403); the rule is quoted from bors' summary. |
| Zuul dependent pipeline ([docs](https://zuul-ci.org/docs/zuul/latest/gating.html)) | Speculative: each change tested on top of those ahead, all in parallel. | The failing change is removed and those behind it retested. The window starts at 20, grows by 1 per success and halves on failure. | We adopt the adaptive window for bundle size. Speculative parallel futures are cut (§11). |
| Mergify ([batches](https://docs.mergify.com/merge-queue/batches)) | `batch_size` 1–128, `batch_max_wait_time`. | The batch is split into parts, tested in sequence; a single failing PR is removed. `batch_max_failure_resolution_attempts` caps the splitting. | Closest to this design. We add isolation first, because the failing tests are known and a scoped rerun of them is cheap. |
| Prow Tide ([docs](https://docs.prow.k8s.io/docs/components/core/tide/)) | Batches per `org/repo:branch` pool, always tested against the latest base. | Falls back to merging single passing PRs. | We adopt the pool key (repository and base branch). |
| Graphite ([blog](https://graphite.com/blog/merge-queue-batching)), Trunk ([docs](https://docs.trunk.io/merge-queue)) | Batching, parallel queues, anti-flake. | Graphite drops the whole batch; its bisect is "coming soon". Trunk's bisection is not confirmed from a page we could read. | Confirms that bisect matters: dropping a whole batch multiplies rework. |
| Uber SubmitQueue ([EuroSys 2019](https://dl.acm.org/doi/10.1145/3302424.3303970); follow-up [arXiv 2501.03440](https://arxiv.org/abs/2501.03440)) | Speculative builds over a conflict graph. | Only green outcomes land. The follow-up reports many premature build aborts and small changes stuck behind large conflicting ones. | A warning against speculation at our scale. The 2019 DOI was not fetched; the follow-up was. |

What we take: the not-rocket-science rule (with one declared exception, §6.5), a per-pool queue, batching with a
size and a wait time, an adaptive window, removing the culprit rather than the batch, and two-step CI.

## 4. Board: integration states

The seven stages stay as they are. Integration is a sub-state of Building and Review that **the host derives from
facts on every poll and never stores as a typed field**. Neither Maestro nor the owner can write it.

| State | Stage | Derived from |
|---|---|---|
| `local` | Building | The worktree differs from the card's last snapshot ref, or no snapshot exists. |
| `pushed` | Building | The worktree tree equals the tree of `refs/orchestra/wip/<KEY>/a<n>` on the remote. |
| `scoped-red` | Building, Review | The latest scoped check on the card's current tree failed. |
| `scoped-green` | Building, Review | Every scoped check the contract requires passed on the card's current tree (§5). |
| `conflicts` | Building, Review | `git merge-tree --write-tree <base> <head>` reports a conflict. |
| `queued` | Review | A queue row exists and its head SHA equals the PR's head SHA. |
| `in-bundle B<n>` | Review | The card is a member of an open bundle whose recorded member SHA equals its PR head. |
| `bundle-green B<n>` | Review | The bundle's full checks passed and the bundle PR is not merged yet. |
| `ejected B<n>` | Review, then Building | The bundle attributed a failure to this card (§6.3). |
| `rework a<n>` | Building | An attempt row with a cause and no outcome yet (§4.2). |

A merged bundle merges each member's head into base, so GitHub marks the member PRs merged, and the existing sync moves
each card to Shipped. Nothing new is needed for that last step.

### 4.1 Transitions

```
local --(seat return or 10 min timer: host pushes snapshot)--> pushed
pushed --(ci_run scoped, green on this tree)--> scoped-green
scoped-green --(Maestro: land verified, board_queue)--> queued      [host checks preconditions]
queued --(host cuts a bundle)--> in-bundle B<n>
in-bundle --(full checks green)--> bundle-green --(host merges bundle PR)--> Shipped
in-bundle --(attributed failure)--> ejected --> rework a<n+1> (Building)
in-bundle --(bundle red, not attributed to this card)--> queued      [keeps its place]
queued | in-bundle --(PR head moved, hold set, PR closed, dependency ejected)--> dequeued, with the fact as reason
any --(merge-tree conflict with base)--> conflicts                  [a notice, not a stage move]
```

`board_queue` refuses unless the card is in Review with a PR, `scoped-green` on its PR head's tree, not `conflicts`,
not paused, and every `depends_on` card is Shipped or queued ahead of it. `hold_before_merge` does not block
queueing; it blocks bundling, so the card waits in the queue until the owner releases it.

### 4.2 Rework identity

A new table, `board_attempt`, records one row per dispatch of a card:

| Column | Notes |
|---|---|
| `issue_id`, `n` | Primary key. `n` starts at 1. `board_issue.attempts` becomes `max(n)`. |
| `seat`, `session_id`, `worktree`, `branch`, `pr_number` | What this attempt ran on. |
| `snapshot_sha` | The last pushed snapshot of this attempt. |
| `cause` | Why this attempt exists. Null for the first attempt. Otherwise one of `ejected:B<n>:<check>:<test or file>`, `review:<finding>`, `failed:<crash_reason>`, `conflict:<base sha>`. |
| `outcome` | `merged`, `ejected`, `failed`, `superseded` or `cut`; null while open. |

Rework keeps the card, its branch and its PR. The seat pushes fixes onto the same PR, and the queue sees a new head.
When the fix changes scope or write set, it goes to `archie`, which may open a new card. That card's `depends_on`
links back to the original, and its first attempt's `cause` names `<KEY>#a<n>`. The original card is then cut with
that reason. Either way, "what happened to LCH-58" is answered by one query, never by Maestro's memory.

### 4.3 What the host derives, what Maestro decides

| Host, mechanically | Maestro, by judgment |
|---|---|
| Push a snapshot ref on every seat return and every 10 min while a seat runs | Run `land`'s verification (probe, cold review, use as the user would) |
| Record every scoped and full check against a tree or commit | Choose the scoped tests that `ci_run` runs, from the card's Done when |
| Derive every integration state | `board_queue` a verified card. This is the merge decision, and it needs the session's grant. |
| Refuse `board_queue` when a precondition fails | `board_dequeue` with a reason, and mark a card `urgent` (front of the next bundle) |
| Cut, assemble, run, attribute, eject and merge bundles | Give a flaky verdict: merge the bundle or retry it (§6.4) |
| Resize the bundle window | Route rework: same seat with the failing output, or `archie` when scope changes |
| Detect base movement, overlap with write sets, and conflicts | Decide what to do when a bundle dissolves (§6.3 step 6) |
| Reconcile all of this after a restart | Set or change the project's CI contract (§5), once per project |

## 5. CI: who triggers it and how a project configures it

### 5.1 The contract

Each repository may carry `.orchestra/ci.json`. The host reads it from the base branch, so a change to it goes
through a PR like any other change.

```json
{
  "base": "dev",
  "scoped": {
    "tests": "bun run test:ci {package} {files}",
    "workflows": ["typecheck.yml"]
  },
  "full": {
    "label": "epic",
    "checks": ["typecheck", "test"]
  },
  "bundle": { "size": 8, "max": 16, "waitMinutes": 45, "onBaseMoved": "merge-if-disjoint" },
  "merge": "merge"
}
```

- `scoped.tests` is a command run in the card's worktree. Maestro supplies `{package}` and `{files}` from the Done when.
- `scoped.workflows` are dispatched with `gh workflow run <file> --ref <card branch>`.
- `full.label` is added to the bundle PR. `full.checks` are the check names that must pass on it. With no label,
  the checks the PR triggers on its own are the full gate.
- `merge` must be `merge`: squash or rebase would rewrite member SHAs, and GitHub would no longer mark member PRs
  merged.

Defaults, when there is no file:

| Repository has | Scoped gate | Full gate | Bundle |
|---|---|---|---|
| Required checks on PRs | The PR's own checks | The bundle PR's checks | `size` 4 |
| No CI | Maestro's `land` verification only | none | `size` 1: the queue only serializes merges and runs conflict checks |

This repository's instance is the example above. With it, the `epic` label moves from "the epic PR" to "each bundle
PR". That keeps the `AGENTS.md` rule of one full run per epic, as long as a bundle covers an epic (§6.1, cut rule c).

### 5.2 Triggering

`ci_run` is a new Maestro tool, and the only way Maestro triggers CI. It takes a card and the scoped arguments, then:

1. Runs `scoped.tests` in the card's worktree. For this repository, `test:ci` uploads exactly the working tree.
2. Dispatches `scoped.workflows` on the card's pushed branch, when it has one.
3. Writes a `board_check` row: `issue_id`, `attempt`, `kind` (`scoped`, `workflow` or `full`), `tree_sha` (from a
   temporary index, so the worktree is untouched), `commit_sha`, `outcome`, `url`, `failing` (test files or check
   names), `started_at`, `ended_at`.

Because checks are keyed by tree, a green on the snapshot stays valid on the PR head when the commit Maestro makes
in `land` has the same tree. Any edit after the check changes the tree, and the card drops back from
`scoped-green` without anyone saying so.

`board_ci_run` (billing) stays as it is. `board_check` is the pass or fail ledger next to it.

## 6. Bundles

### 6.1 Cut

A pool is one repository and base branch. In phase 1 a pool has at most one open bundle. The host cuts a bundle when
the pool has no open bundle and at least one of these holds:

- a. the queue holds `size` cards;
- b. the oldest queued card has waited `waitMinutes`;
- c. every open card of an epic is queued (the **epic bundle**);
- d. Maestro calls `board_queue` with `flush`.

### 6.2 Assemble

Candidates are taken in queue order, `urgent` first, then by time queued. Starting from the base tip, the host adds
each candidate with `git merge --no-ff <head>` on a scratch worktree, and skips a candidate when:

- its `depends_on` is neither Shipped nor earlier in this bundle;
- it is on hold or paused;
- `git merge-tree` reports a conflict with the bundle so far. The card stays queued and gets a `conflicts-with-queue`
  notice naming the member it collides with. If it collides with base itself, its state is `conflicts`.

The host stops at `size` members, then pushes `bundle-<KEY>-<n>`, opens a PR into base titled
`chore(queue): bundle <KEY>-B<n>`, lists members and their head SHAs in the body, and applies `full.label`. A bundle
spanning two projects on the same repository takes the first member's key, and its body lists every card.

### 6.3 On red

The failed jobs and their logs give the failing set F: test files, or file paths from typecheck errors.

1. **Infrastructure.** A run cancelled, timed out or without the omni control line is not red. Rerun it once. A
   second infrastructure failure pauses the pool and raises an `<integration>` line.
2. **Flake probe.** Rerun only F, scoped, on the bundle head. If it passes, the bundle becomes `flaky B<n>` (§6.4).
3. **Isolate.** For each member whose diff touches a path in F, or every member when none does, run F scoped on base
   + that member alone. These runs go in parallel, at most `size` of them. Each member that fails alone is a culprit.
4. **Halve.** If no member fails alone, the failure is an interaction. Run F on base + the first half of the members,
   then keep halving whichever prefix fails. The first member whose addition turns the prefix red is the culprit.
   That takes ⌈log₂ N⌉ serial rounds.
5. **Eject and rebuild.** Culprits leave the bundle: their attempt closes with `ejected` and a new attempt opens with
   the cause. Members whose `depends_on` includes a culprit go back to the queue, keeping their place. The host
   rebuilds the bundle from the rest and runs the full gate once more.
6. **Dissolve.** After two rebuilds of the same bundle, or when halving finds no culprit, the bundle dissolves. Every
   member goes back to the queue in its original order, the window halves, and Maestro gets an `<integration>` line.
   It may dequeue a suspect or send F to `jimmy`.

Window: `size` grows by 1 after each green bundle, up to `max`, and halves (minimum 1) after each dissolve (Zuul).

### 6.4 Flakes

A red that passes on a scoped rerun is not a green until its cause is known (`maestro-lead/track`). The host does not
merge a `flaky` bundle. It records the test in a `board_flake` row (test, bundle, first seen, count) and puts one
`<integration>` line before Maestro. Maestro then does one of two things:

- **Merge**, writing "Decided: flaky <test>, cause <known cause or a card to find it>" as the reason. A flake
  without a cause gets a chore card, so the merge never hides it.
- **Retry** the full gate once.

### 6.5 Base moved

The bundle was tested on base X, and base is now Y. This repository's `dev` takes merges from other sessions too, so
holding them is not allowed. `onBaseMoved` decides:

- `retest`: rebuild on Y and run the full gate again. This is the strict not-rocket-science rule.
- `merge-if-disjoint` (this repository's setting): merge only when `git merge-tree` of Y and the bundle is clean and
  no path changed in X..Y is in the bundle's diff. Otherwise retest. The bundle PR records the skew ("tested on X,
  merged on Y"), and the next bundle's full run covers it.

### 6.6 Merge

A green bundle merges with `gh pr merge --merge`, under the grant given with `board_queue`. Then:

- GitHub marks each member PR merged, and the existing sync ships the card.
- The host closes each open attempt with `merged`.
- The host deletes the bundle branch.
- It deletes snapshot refs only for shipped cards, and only after their merge is on the remote.

### 6.7 Cost at this scale

Let D be the full gate's duration. With one bundle in flight, a window of 8 and a red rate below one bundle in four,
the pool merges about 8 / D × ¾ PRs per unit of time. At D = 30 min that is about 12 PRs an hour, and 16 at the
largest window of 16. If queue wait regularly exceeds 2 × D, the fix is a second pool lane: speculative bundle B<n+1>
built on top of B<n>. That is in the cut list until the ledger shows the wait.

## 7. Invariants against lost work

1. **Push early.** Every seat return, and every 10 minutes while a seat runs, the host writes the worktree to a
   snapshot commit through a temporary index (`git add -A` against `GIT_INDEX_FILE`, then `write-tree` and
   `commit-tree` with the previous snapshot as parent). It pushes the commit to `refs/orchestra/wip/<KEY>/a<n>` on
   the project's push remote. The worktree, its index and its HEAD are untouched, so "seats never commit" still
   holds. `.gitignore` applies. On a public repository the ref is as public as a PR branch.
2. **Nothing disappears silently.** Ejection, a red check and dequeueing never close a PR or delete a branch. Only a
   merge or a card cut ends an attempt, and every end has an `outcome` row.
3. **Every queue exit has a fact.** A card leaves the queue only by merge, ejection, or dequeue with a reason (from
   the host or from Maestro). An `in-bundle` card whose PR head moved is treated as dequeued by the host. It is never
   merged at a SHA the bundle did not test.
4. **Targeted rebase notices.** When base advances, the host takes `git diff --name-only <old>..<new>` and compares
   it, with the arsenal's `conflictVerdict` semantics, to the declared write set of every Building or Review card.
   `task`'s `writePaths` are stored on the attempt row. Only cards with an overlap get checked, with `git merge-tree`
   against their snapshot or PR head:
   - an overlap that merges clean is a quiet note on the card ("base touched src/x.ts; merges clean");
   - a conflict is an `<integration>` line naming the files, and the seat merges base in its own worktree on its next
     dispatch (`land` already says how).
   No card is notified about a merge that does not touch its write set. The host never rebases or merges into a
   seat's worktree: a running seat may have uncommitted work there.
5. **Recovery after a crash.** On start, the host reconciles each open pool: it reads every open bundle PR and its
   checks, every queued card's PR head, and every snapshot ref. It then resumes the step the rows say is next. Bundle
   steps are idempotent, keyed by bundle id and member SHAs. A worktree that is gone but has a snapshot ref is
   recoverable with `git worktree add <path> <snapshot>`. Gone with no snapshot is a drift line, never silent.

## 8. Context continuity

The board holds state. Maestro's context holds judgment. That is the split `maestro-lead/track` already makes:

- Integration state, attempts, checks, bundles and flakes are rows. Maestro never copies them into its per-card
  Session block, so a compaction cannot make them stale. After a compaction, `board_read` (with `since`) and the
  `<integration>` block rebuild the picture.
- The Session block keeps Facts, Guesses and Evidence, and `Flaky:` now cites a `board_flake` row rather than holding
  the fact itself.
- A new System Context source, `maestro/integration`, follows the `board-drift` pattern: Maestro's turns only,
  nothing rendered when nothing is actionable, and one "resolved" line when it clears. It lists only what waits on
  Maestro:
  - an ejection to route;
  - a flaky bundle to decide;
  - a conflict on a card in flight;
  - a dissolved bundle;
  - a paused pool;
  - a card that is `local` with a dead Session.

  Everything else stays on the board, where `board_read` finds it.

Example:

```
<integration>
- LCH-58 ejected from LCH-B12: test/reminders/schedule.test.ts fails alone on base+LCH-58. Attempt a3 opened. Route it.
- LCH-B13 flaky: test/session/compaction.test.ts failed, then passed on rerun. Merge or retry.
- LCH-61 conflicts with dev at 4f2c1e0 in src/board/github.ts.
</integration>
```

## 9. Failure modes and recovery

| Failure | Detected by | Recovery |
|---|---|---|
| A seat dies with uncommitted work | Session end, or the 10 min timer | The last snapshot is at most 10 min old. Redispatch from it (`rework`, cause `failed`). |
| A worktree is removed early | Missing path on poll | Restore it from the snapshot ref. With no snapshot, it is a drift line. |
| A bundle is red because of code | Failed checks | §6.3: isolate, halve, eject, rebuild |
| A bundle is red because of a flake | The scoped rerun passes | §6.4: Maestro's verdict |
| CI infrastructure fails | Cancelled, timed out, or no omni control line | Rerun once, then pause the pool |
| A member's PR head moves in the bundle | Head SHA differs from the recorded one | The member is dequeued and the bundle rebuilt without it |
| A member's PR is closed by a human | Poll | Dequeued with that fact. The board raises a question, as it does today for closed issues. |
| Base moves under a bundle | Base SHA differs | §6.5 |
| A dependency is ejected | Attempt rows | Dependents go back to queued, not to rework |
| A hold is set while the card is bundled | Card read before merge | The member is dropped and the bundle rebuilt. The card waits in the queue. |
| The host crashes mid-bundle | Restart | §7.5 reconcile |
| Maestro's context is compacted | | §8: the board plus `<integration>` rebuild the picture |
| GitHub is signed out or rate-limited | `github_state` | Pools pause and show the fact. Snapshots queue locally and push on recovery. |
| The queue is full and old | The ledger: queue wait above 2 × D | Report it to the owner with the numbers; a second lane is the only lever (§6.7) |

## 10. Scale notes

- Merge-tree checks, diffs and snapshot writes are local git operations of milliseconds to seconds. Forty cards at a
  10 min timer is four snapshots a minute.
- GitHub calls ride the existing 60 s poll: one read per open bundle PR plus its check runs. Snapshot pushes are git
  pushes, not API calls.
- Several projects or epics on one repository share one pool, so their merges serialize on base. Bundles may mix
  epics. Cut rule c still closes each epic with a bundle.
- Pools on different repositories are independent. A dependency across repositories is satisfied only by the other
  card being Shipped, never by bundling the two together.

## 11. Cut list: what not to build

- **GitHub merge queue.** It is not available on this personal repository, needs `merge_group` everywhere, and
  bypasses the `epic` label.
- **Speculative parallel bundles** (Zuul, GitLab trains, SubmitQueue). Build them only when the ledger shows queue wait
  above 2 × D.
- **A full run per PR.**
- **Host rebasing or merging into a seat's worktree or branch.** The seat does it from the notice.
- **Stacked-PR tooling.** Dependencies go through `depends_on` and queue order.
- **Flake quarantine, auto-retry beyond one probe, and test-impact selection for the full gate.**
- **Preempting an in-flight bundle for an urgent card.** Urgent means the front of the next bundle.
- **New board stages or columns, and integration-state labels on GitHub.** The bundle PR is the GitHub-visible
  record.
- **Webhooks, and a separate queue process.** The pool runs inside the board's poll loop.
- **Letting Maestro write integration state.**

## 12. Work packages

Each package ships with its docs (`docs/guides`), the playbook edits it implies, and the maintenance and ownership
skill updates. Each is gated by `test:ci` on its touched tests and a `typecheck.yml` dispatch. One epic covers the
whole campaign.

| WP | Scope | Done when |
|---|---|---|
| **0. Spike** (no product code) | Prove on a scratch repo: merging a bundle PR with `--merge` marks member PRs merged; `gh workflow run --ref` works on a bundle branch; a temporary-index tree equals `test:ci`'s uploaded tree for the same worktree; pushing a hidden ref to GitHub works. | Four yes/no facts with command output, written into this spec |
| **1. Ledger and push-early** | `board_attempt` with stored `writePaths`; snapshot refs on seat return and on the 10 min timer; the `local` and `pushed` states; the `maestro/integration` source with the dead-Session and missing-worktree lines; `track` playbook edits | Kill a seat mid-task: its card shows `pushed`, and its worktree is restored from the ref |
| **2. CI facts** | `.orchestra/ci.json` reader and defaults; `ci_run`; `board_check` keyed by tree; the `scoped-green` and `scoped-red` states | A green scoped run stays valid after Maestro's commit with the same tree, and drops after an edit |
| **3. Rebase notices** | Base-advance diff, matched against write sets with `conflictVerdict`, then `merge-tree`; the `conflicts` state and its `<integration>` line | A merge that touches a card's write set notifies only that card; a merge outside it notifies none |
| **4. Queue and green bundles** | `board_queue`, `board_dequeue` and their preconditions; pools; cut rules a–d; assembly; the bundle PR with `full.label`; merge on green; `onBaseMoved`; `land` playbook Publish rewritten to "verify, then `board_queue`" | Three verified cards merge through one bundle and one full run; all three ship |
| **5. Red bundles** | Infrastructure rerun, flake probe, isolation, halving, eject into rework, rebuild, dissolve, adaptive window, `board_flake` and the flaky verdict | A seeded failing member is ejected with the right cause, and the rest merge on the rebuilt bundle; a seeded interaction is found by halving |
| **6. Recovery** | Restart reconcile for pools, bundles and snapshots | Kill the host between "bundle green" and "merge": on restart it merges once, with no duplicate bundle |

Order: 0, then 1 and 2 in parallel (disjoint write sets), then 3 and 4, then 5, then 6. WP1 ships first, alone if
needed, because lost work is the costliest pain and it needs no queue.

## 13. Owner decisions

1. **Bundles carry the `epic` label.** This turns "one full run per epic" into "one full run per bundle, and every
   epic closes with one" (§5.1). Recommended: yes.
2. **`merge-if-disjoint` for `dev`** (§6.5). This is the one exception to the not-rocket-science rule, taken because
   other sessions merge into `dev` directly. Recommended: yes for this repository; `retest` stays the default for
   other projects.
3. **The host merges a green bundle under the grant Maestro gave with `board_queue`,** with no further prompt per
   bundle. Recommended: yes, because enqueue is the merge decision.
4. **Snapshot refs are pushed to the public remote.** They are as public as a PR branch. Recommended: yes, since the
   alternative is work that lives only on one disk.
