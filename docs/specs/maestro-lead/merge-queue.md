# Merge queue and CI bundles

Status: design for the owner to decide. Nothing here is built.

This spec covers how Maestro gets many cards into the base branch at once. The target is about 40 seats in parallel,
many pull requests arriving together, CI failing, cards going back to rework and several scopes in flight. The pains
are the owner's: the queue explodes, rebases and conflicts pile up, and work is sometimes lost.

It builds on the lead playbooks (`maestro-lead` `track` and `land`), the board contract
(`docs/specs/projects-board/CONTRACT.md`) and the board-drift source
(`modules/maestro/coordination/src/v2/board-drift-source.ts`), the `maestro-orchestra` map, and `task` children in
their own native worktree (`worktree: true`). At the time of writing, these are on the `maestro-capabilities` branch
(PR #1106, not merged yet). This design builds on them and redoes none of them.

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

**A conveyor, not reverts.** A change reaches the base branch only after the gate has run on everything it can
affect: the whole suite in phase 1, its affected packages in phase 2, and the whole suite again with every epic. No
seat ever builds on code that later has to be reverted. A card that breaks the gate is taken off the conveyor before it lands and goes
back to its owner as a numbered rework attempt. The cards behind it keep moving.

In plain words:

1. `archie` plans the integration shape: each card's area, what it waits on, and the order it lands in. Seats then
   work on different areas by design, not by luck.
2. Each card passes a quick test of what it touched.
3. Passing cards wait on the conveyor. The host takes N at a time and runs the full test once for all of them.
4. If it is green, all N land. If it is red, the host finds the bad card, takes it off, and the rest land.
5. The host pushes a snapshot of every seat's work every 10 minutes, and the board records every step by itself.

It ships in two phases:

- **Phase 1: one conveyor per repository and base branch** (§6). This is enough for about 12–16 merges an hour (§6.7).
- **Phase 2: one conveyor per affected area** (§7). Cards whose `turbo` affected packages do not overlap ride
  separate conveyors that run and land in parallel, and each conveyor's full gate covers only its area. This is
  what removes the throughput ceiling.

Everything else is listed in §12 as later work, built only when the ledger shows it is needed.

Three owners, one decision each. `archie` decides the shape at plan time, because it holds the scoped context of
the whole decomposition (§4.4). The host decides the timing at run time: which ready cards go in which bundle, and
when. Maestro decides only what needs judgment during the run: enqueue, flaky verdicts, and where rework goes. It
never assembles a bundle and never computes conveyor state. There are two gates, as in Mergify's "two-step CI" and as `AGENTS.md` already asks:

1. **Scoped gate, per card.** Change-scoped tests and a typecheck run on the card's own tree, before it may queue.
2. **Full gate, per bundle.** The full suite (phase 1) or the area's suite (phase 2) runs once on base + N queued
   PRs. The bundle replaces the epic PR as the unit that carries the `epic` label.

**No repeated work.** A run that cannot produce a new fact does not run. Every result is keyed by what it tested:
a tree for a scoped check, and base plus member SHAs for a bundle. A result already on file is reused, never rerun.
The spec applies this rule where it bites:
- A scoped green carries over to the PR head when the tree is the same (§5.2).
- An unchanged worktree pushes no snapshot (§8.1).
- After an ejection, only what the ejection can change is rerun: the failing tests and the culprit's affected
  packages (§6.3 step 5).
- A flake probe and an infrastructure retry each run once.
- `merge-if-disjoint` avoids a retest when base moved somewhere the bundle does not touch (§6.5).
- Phase 2's whole-suite safety run is the epic run that already exists, not an extra run (§7.3).

Why not merge first and revert on red, as Google's TAP does? Seats build on each other within minutes. A revert
then takes down every card already built on the bad one, and the cost of a bad landing grows with team speed. Gating
before the base keeps that cost at zero.

## 3. Prior art

| Approach | Batching | On a red | Fit here |
|---|---|---|---|
| GitHub merge queue ([docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)) | Groups of 1–100 PRs on `gh-readonly-queue/*` branches. Workflows need the `merge_group` trigger. | The failing or conflicting PR is removed and the temp branch rebuilt. Bisect is not described. | **No.** It is available only to organization-owned repositories, and this one is personal. It would also need `merge_group` in both workflows and would bypass the `epic` label. |
| GitLab merge trains ([docs](https://docs.gitlab.com/ee/ci/pipelines/merge_trains.html)) | No batching. Each MR is tested on everything ahead of it, up to 20 parallel pipelines. | The MR is removed; pipelines behind it restart. | A full run per MR is the cost the owner rejected. |
| Bors / "not rocket science rule" ([bors.tech](https://bors.tech/), [Hoare](https://graydon2.dreamwidth.org/1597.html)) | A staging branch is tested and the exact tested commit is fast-forwarded to base. | The batch fails as a unit. | We adopt the rule: base moves only to a tested result. The essay page refused our fetch (403); the rule is quoted from bors' summary. |
| Zuul dependent pipeline ([docs](https://zuul-ci.org/docs/zuul/latest/gating.html)) | Speculative: each change tested on top of those ahead, all in parallel. | The failing change is removed and those behind it retested. The window starts at 20, grows by 1 per success and halves on failure. | We size bundles from the measured red rate instead of a feedback window (§6.3). Speculative parallel futures are later work (§12). |
| Mergify ([batches](https://docs.mergify.com/merge-queue/batches)) | `batch_size` 1–128, `batch_max_wait_time`. | The batch is split into parts, tested in sequence; a single failing PR is removed. `batch_max_failure_resolution_attempts` caps the splitting. | Closest to this design. We add isolation first, because the failing tests are known and a scoped rerun of them is cheap. |
| Prow Tide ([docs](https://docs.prow.k8s.io/docs/components/core/tide/)) | Batches per `org/repo:branch` pool, always tested against the latest base. | Falls back to merging single passing PRs. | We adopt the pool key (repository and base branch). |
| Graphite ([blog](https://graphite.com/blog/merge-queue-batching)), Trunk ([docs](https://docs.trunk.io/merge-queue)) | Batching, parallel queues, anti-flake. | Graphite drops the whole batch; its bisect is "coming soon". Trunk's bisection is not confirmed from a page we could read. | Confirms that bisect matters: dropping a whole batch multiplies rework. |
| Uber SubmitQueue ([EuroSys 2019](https://dl.acm.org/doi/10.1145/3302424.3303970); follow-up [arXiv 2501.03440](https://arxiv.org/abs/2501.03440)) | Speculative builds over a conflict graph. | Only green outcomes land. The follow-up reports many premature build aborts and small changes stuck behind large conflicting ones. | A warning against speculation at our scale. The 2019 DOI was not fetched; the follow-up was. |

| Shopify ([merge queue](https://shopify.engineering/introducing-the-merge-queue); [Graphite case study](https://graphite.com/customer/shopify-merge-queu)) | A Shipit queue that merges when the main branch is healthy. | | The vendor case study reports that a single serialized queue became the bottleneck at monorepo scale, and that removing it cut waits from hours to minutes. It is a vendor account, so read it with care. |
| Aviator affected targets ([docs](https://docs.aviator.co/mergequeue/concepts/affected-targets)) | Dynamic queues, one per set of affected targets. The team computes targets with tools such as `bazel-diff` or the Nx CLI. | Per queue | Phase 2 here, with `turbo` computing the targets. |
| Uber, conflict analysis ([blog](https://www.uber.com/us/en/blog/slashing-ci-costs-at-uber/)) | Independent changes build at the same time. | Mainline stays green. | Reports 53% less CI and 37% less waiting. The same post says speculation aborted 40–65% of builds, which is why speculation stays in the later list. |
| Google TAP, flake-aware culprit finding ([ICST 2023](https://hackthology.com/flake-aware-culprit-finding.html)) | Post-merge, with automatic rollback. | Bisection that models flakiness, since repeated reruns stop improving accuracy while cost keeps growing. | We reject post-merge rollback (§2). We keep the lesson: the culprit search treats flakes explicitly (§6.3 step 2). |

None of these queues sees the plan: they meet changes only when they arrive. Here the planner shapes the work
for the conveyor before any code exists (§4.4), and the queue checks the plan against what really arrived.

What we take: the not-rocket-science rule (with one declared exception, §6.5), a queue per pool and later per area,
batching with a size and a wait time, removing the culprit rather than the batch, and two-step CI.

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

`board_queue` refuses unless the card is in Review with a PR, has a complete record (§4.5), is `scoped-green` on its
PR head's tree, not `conflicts`, not paused, and every `depends_on` card is Shipped or queued ahead of it. `hold_before_merge` does not block
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
| Cut, assemble, run, attribute, eject and merge bundles | Give a flaky verdict with `board_bundle`: merge the bundle or retry it (§6.4) |
| Compute lanes from the affected graph (phase 2) | Route rework: same seat with the failing output, or `archie` when scope changes |
| Detect base movement, overlap with write sets, and conflicts | Decide what to do when a bundle dissolves (§6.3 step 6) |
| Reconcile all of this after a restart | Set or change the project's CI contract (§5), once per project |

### 4.4 What `archie` decides at plan time

`archie` already authors the decomposition, and `maestro-plan` already returns a plan in which two slices write one
file. The conveyor needs three more fields per card in the adopted plan:

| Field | Meaning | Used by |
|---|---|---|
| `area` | The workspace packages the card is expected to affect, in the same terms as `turbo`'s affected set (§7.1) | The overlap check at plan review, and plan drift at enqueue |
| `depends_on` | Cards whose code this card needs. It already exists on the board. | Assembly order and isolation (§6.2, §6.3) |
| `order` | The plan's landing order among cards that share an area | Queue order: "earlier" in the cut rules (§7.2) means earlier in `order`, then earlier queued |

Two rules make the fields bind:

- **Plan review.** `maestro-plan` also returns a plan in which cards meant to run at the same time overlap in `area`
  with no `depends_on` or `order` between them. Overlap is allowed when it is declared, because then it is a
  sequence the queue follows instead of a collision it discovers.
- **Plan drift.** At enqueue the host compares the card's real affected set with its `area`. A card that left its
  area raises one `<integration>` line, and Maestro sends it to `archie` as a plan revision. The card still queues
  under its real set, so drift never blocks a landing; it only stops the plan from silently going stale.

The fields are optional, so the conveyor works before `archie` is changed. Without `area` there is no plan-review
overlap check and no drift line, and lanes use only the real affected set. Without `order`, "earlier" means earlier
queued. The fields pay off only once lanes exist, because in phase 1 every card rides one conveyor and `writePaths`
already catch file conflicts. They are built in phase 2, next to lanes (WP9).

`archie` does not build bundles. Fixed bundles chosen at plan time would wait for their slowest member and break
on the first ejection. `archie` owns the shape, and the host fills it with whatever is ready.

### 4.5 The PR record

Today `land` says only that a PR's description "carries the evidence and what was not covered", in free text. A
reviewer cannot tell intent from guesswork, nobody can tell what a change cost, and a bundle cannot summarize its
members. The fix is one record per card. The host renders it, so every PR in every project reads the same way, and
the story of any change can be rebuilt without asking anyone.

**What already exists, and is reused.** Read on `dev` for this design:

| Exists | Trigger | Used here as |
|---|---|---|
| `maestro_record_validation` and `lucy`'s `maestro_record_review` (`modules/maestro/coordination/src/v2/tools/review.ts`): verdict `APPROVE`, `FIX_FIRST` or `REJECT`, with `path:line` findings | Maestro, and `lucy` when Maestro requests a review | Evidence. The host reads them; Maestro does not retype them. |
| Atlas's `logbook`: one append-only entry per PR with `shipped`, `decisions`, `tradeoffs`, `risks`, `openThreads`, `links` (`modules/atlas/docs/reference/atlas-memory.md`) | Designed for the orchestrator, but nothing writes it today: Maestro has no Atlas Memory tools | The record's field set, and its permanent home after merge. |
| Own units: `OWN-SNAPSHOT.json` maps source files to per-unit skills (role, invariants, gotchas) | Git-tracked; `atlas-guard.yml` checks it on PRs | "Read with" links in Change. Reading the snapshot needs no Atlas store. |
| `atlas-worklist.yml` and `atlas repair` (manual, needs the store) | Push to `dev`; a maintainer | Unchanged. Stale Own units after a merge stay their job. |
| Atlas's host adapter (`modules/atlas/packages/persist/src/host-adapter.ts`): PR projection (`attachToPR`), commit trailers `WP`, `Model`, `Gates`, `Verdict`, `TranscriptSha`, and the metering record | Built as a library; its forge writes to an in-memory map and nothing calls it | The renderer and the trailers. WP4 gives the adapter its GitHub writer and its first caller, instead of a second renderer in the board. |

Atlas has the shapes for a PR body, trailers and cost but writes none of them yet. The record supplies their content and makes Atlas's writer real. It adds only what Atlas has no field for: Not covered, Lineage and Integration.

**The record.** Seats never commit; Maestro commits and pushes in `land`. From WP4 on, Maestro no longer writes a PR
body. It writes the record's judgment fields with `board_issue` (`record`). The host opens the PR from the record and
rewrites the body whenever a fact changes, the same way the issue mirror works today.

| Section | Written by | Content |
|---|---|---|
| Title | Maestro | The project's commit convention, for example `type(scope): summary`. The host refuses a title that breaks a convention the project declares. |
| Intent | Maestro | Why the change exists, in the user's terms, in one to three sentences. The outcome, not the files. Atlas `shipped`. |
| Change | Maestro, plus host facts | What changed, by area, and **where to start reading**: the one to three files or hunks that carry the logic. The host appends files and lines changed, the real affected packages, the plan's `area` when it differs, and the Own units whose sources the diff touches, each linked to its skill. |
| Decisions | Maestro | Each choice a reviewer could question, with why. Roads not taken go here, with why not. Atlas `decisions` and `tradeoffs`. |
| Evidence | Host, from records | Each Done when line with its command and result; the probe; the validation and cold review records, with verdict and findings and how each finding was closed; every check row on the PR's tree, with its run link; "used as the user would" or "unseen". |
| Not covered | Maestro | Required. "Nothing" is allowed only with the reason it is complete. |
| Risk | Maestro | `low`, `medium` or `high`; what breaks if the change is wrong and how anyone would notice; and how to undo it. "Revert the merge commit" is not enough when the change migrates data or touches config outside the repository. Atlas `risks`. |
| Follow-ups | Maestro | Each a card key, or "none". Prose with no card is refused, so a follow-up cannot exist only in a PR body. Atlas `openThreads`. |
| Cost | Host only | Attempts and their causes; CI runs and minutes; wall time from Ready to queued; model tokens and spend summed over every attempt's Sessions. |
| Lineage | Host only | Card key and epic, `depends_on`, plan reference, seat ids, reviewer id. |
| Integration | Host only | The integration state (§4), and the bundle and tested-on base once it has one. |

Rules:

- **Facts come from the host, never from prose.** Maestro cannot write Evidence, Cost, Lineage or Integration. A
  check that has no row, or a review that has no record, is shown as missing. A record cannot overstate itself.
- **`board_queue` refuses an incomplete record:** an empty Intent, Decisions, Not covered or Risk; a Risk with no
  level; a follow-up with no card; a `FIX_FIRST` or `REJECT` review with a finding not closed. These are preconditions
  in §4.1, not a checklist.
- **Model spend stays on the board.** The board contract keeps spend out of GitHub, and project repositories may be
  public. The PR shows attempts, CI minutes and wall time; tokens and spend show in the app (§14, decision 6).
- **Commits carry Atlas's trailers.** Maestro's commit uses the PR title as its subject and Intent as its body. The
  host adds Atlas's trailer block with `WP: <KEY>`, plus one key Atlas lacks, `Attempt: a<n>`, added to Atlas's
  trailer type rather than defined beside it.
- **Cost is Atlas's metering record** (`persist/src/metering.ts`): model, tokens, tool uses, wall time, retries,
  reworks, gates, verdict, summed over attempts, plus CI runs and minutes from check rows.

**Rebuilding a change.** One source and four copies, each written by the host:

| Copy | Holds | Rebuilds |
|---|---|---|
| Board record (live source) | Everything, including spend and every attempt | The full story, in the app |
| PR body on GitHub | Everything except spend | The story for a human reviewer, without the app |
| Atlas trailers | Card, attempt, gates, verdict | The path from `git log` or `git blame` back to the PR and the card |
| Atlas logbook entry, written into the bundle (§4.7) | Intent, Decisions, Risk, Follow-ups, links to the PR and card | The "why" for any later agent, through Atlas recall, on any clone |
| Board log, written into the bundle (§4.7) | The record, the thread and every board change up to the cut | Everything above, from the tree alone |

The bundle PR is rendered from its members' records (§6.2). Its body has one line per member with title, intent and
risk; the highest member risk; summed cost plus the bundle's own runs; the tested-on base and skew; and every
ejection with its cause. Its merge commit lists members as `WP:` trailers.

### 4.6 The card thread

From the moment a card exists, every message about it is on the card, as a Jira team keeps it on the ticket:
Maestro's brief and each resume, a seat's question or blocker, Maestro's answer, the return, each review request and
verdict, each rework order with its cause. The owner's notes are already there (`board_note`).

The transport does not change. Maestro still dispatches with `task`, seats still return through it, and a card that is
not on the board already refuses a `task` (`maestro-lead/dispatch`). The host writes each message to the thread **as
it passes**, in the same transaction that delivers it. Agents never post to the board themselves, and do not poll it.

Two reasons for this. A thread that agents must remember to write has gaps exactly where something went wrong. And
routing through the board would add a poll between every question and its answer, where the `task` channel is
immediate. Recording the channel gives the Jira benefit without either cost.

| Kind | Written when | Author |
|---|---|---|
| `brief` | A `task` call for the card, first or resume | `maestro` |
| `question` | A seat returns a blocker or a missing-input question | the seat id |
| `answer` | Maestro resumes the seat after a question | `maestro` |
| `return` | A seat returns done or failed, with its evidence | the seat id |
| `review` | `maestro_request_review` and `lucy`'s `maestro_record_review` | `maestro`, `lucy` |
| `rework` | An attempt row is opened (§4.2) | the host, with the cause |

The board contract changes in two places: `board_note` gains `kind`, and its `author` admits seat ids. Thread rows are
read-only, so the owner's edit and delete stay limited to the owner's own notes. Like every note, they never go to
GitHub. The PR record's Lineage links the thread, and the Atlas logbook entry links it at merge.

### 4.7 Atlas and the board travel with the code

Atlas is git-native (`modules/atlas/docs/explanation/versioning.md`): what agents know and remember travels with the
code at every commit, branch and merge. The board travels the same way. Nothing here adds a second versioning
mechanism; it uses Atlas's, and fills the parts Atlas has designed but not wired.

**Who owns what.**

| Owner | Owns | Scope |
|---|---|---|
| Atlas | The mechanism: append-only logs of content-keyed records (`createDurableLog`), `merge=union` on them, the fold, the write scanner, the logbook template, the host adapter (trailers, PR projection, metering), export | Global: every project, with or without Maestro |
| Atlas | Knowledge and Memory, versioned in git | Global. Seats write their own Memory; the knowledge steward writes Knowledge |
| Board | Projects, cards, notes and activity: the live store in the app database, and its own Atlas log | Global: every project, with or without Maestro |
| Conveyor (host, this spec) | When versions are written: one record commit per bundle, carrying the board log, the logbook entries and the Orientation events | Projects Maestro runs |
| Maestro | Judgment only: the record's fields (§4.5) and the queue order. Never writes a log, a trailer or a PR body | Projects Maestro runs |
| Flight Engineer | Meetings, transcripts and their summaries | Personal to the user. Never in git, never in Atlas |

**What goes to git.** Everything Atlas holds: Memory, Orientation, review, policy, and Knowledge. Today `.gitignore`
keeps Atlas's knowledge store (`.atlas/cas` and its projection) out of git, against the design. Admitting it is an
Atlas change, owned by Atlas, and a precondition of WP10, not part of it. The only thing that never goes to git is the
Flight Engineer's output, which is the user's own. Secrets never go anywhere: Atlas's write scanner refuses them, and
board attachments stay in `CredentialTable` with only their labels logged.

**The board log.** The board gets its own log, `.atlas/board.jsonl`, in the pattern of `review.jsonl`: one
content-keyed record per board write, the same `before` and `after` the `board_activity` row holds, card threads
included (§4.6). It is admitted in `.gitignore` and merged by `union` in `.gitattributes`, like the other three logs.
Board state at any commit is the fold of that log. `board import` rebuilds the board from the tree in front of it.

**When each part is written.**

- **Seat Memory and Knowledge** are written by the seats into the card's worktree, and `land` commits the tracked
  `.atlas` files with the card's paths. The write-set check allows them: they only append.
- **The board log, logbook and Orientation** are written by the conveyor in one commit at the top of each bundle,
  `chore(queue): record <KEY>-B<n>`. It appends the board records since the previous bundle, one Atlas logbook entry
  per member (Atlas's `logbook` API, its first production caller), and an Orientation `milestone` event per member
  (Atlas's Orientation writer, also its first caller). The live board writes to the database only; git gets it at
  the cut, so a card's state changes never conflict with code in flight.
- A rebuilt bundle rewrites its record commit, so an ejected card leaves no logbook entry. Its board records still
  arrive with the next bundle, because the board log holds what happened, not what merged.

What that gives:

- **Check out a branch, get its project and its Atlas.** The tree carries Memory, Knowledge and the board log as they
  stood when that code was cut.
- **Restore.** A lost disk loses nothing that has merged. The database holds only what happened since the last bundle.
- **History.** `git log -p .atlas/board.jsonl` is the project's history beside the code.

**Open, for WP0.** Whether GitHub's server-side merge honors `merge=union`. If it does not, every Atlas log conflicts
on concurrent appends, not only the board's, and the fix belongs to Atlas (its designed `orchestra-atlas` driver, or
one file per writer), applied to all four logs at once. The conveyor's own bundles never race each other, because one
bundle is in flight per conveyor.

**Public repositories.** Notes, threads, question text and spend are left out of `board.jsonl` (§14, decision 7).
The full rows stay in the app database.

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
`scoped-green` without anyone saying so. The same key prevents repeats: `ci_run` on a tree that already has a
result for the same command returns that result and starts nothing. The same goes for bundles: a rebuilt bundle whose
base and member SHAs match a bundle already tested reuses its outcome.

`board_ci_run` (billing) stays as it is. `board_check` is the pass or fail ledger next to it.

## 6. Bundles

### 6.1 Cut

A pool is one repository and base branch. In phase 1 a pool has at most one open bundle. The host cuts a bundle when
the pool has no open bundle and at least one of these holds:

- a. the queue holds `size` cards;
- b. the oldest queued card has waited `waitMinutes`;
- c. every open card of an epic is queued (the **epic bundle**);
- d. Maestro calls `board_queue` with `flush`.

An epic bundle always runs the whole suite, in phase 2 as well. That run is the safety net of §7.3.

### 6.2 Assemble

Candidates are taken in queue order, `urgent` first, then by time queued. Starting from the base tip, the host adds
each candidate with `git merge --no-ff <head>` on a scratch worktree, and skips a candidate when:

- its `depends_on` is neither Shipped nor earlier in this bundle;
- it is on hold or paused;
- `git merge-tree` reports a conflict with the bundle so far. The card stays queued and gets a `conflicts-with-queue`
  notice naming the member it collides with. If it collides with base itself, its state is `conflicts`.

The host stops at `size` members, then pushes `bundle-<KEY>-<n>`, opens a PR into base titled
`chore(queue): bundle <KEY>-B<n>`, renders its body from the members' records with their head SHAs (§4.5), and
applies `full.label`. A bundle
spanning two projects on the same repository takes the first member's key, and its body lists every card.

### 6.3 On red

The failed jobs and their logs give the failing set F: test files, or file paths from typecheck errors.

1. **Infrastructure.** A run cancelled, timed out or without the omni control line is not red. Rerun it once. A
   second infrastructure failure pauses the pool and raises an `<integration>` line.
2. **Base check and flake probe.** Rerun only F, scoped, on base and on the bundle head, in parallel. If F fails on
   base, the red belongs to base, not to the bundle (§6.8). If F passes on the bundle head, the bundle becomes
   `flaky B<n>` (§6.4).
3. **Isolate.** For each member whose diff touches a path in F, or every member when none does, run F scoped on base
   + that member and its `depends_on` members in this bundle. These runs go in parallel, at most `size` of them. Each member that fails alone is a culprit.
4. **Halve.** If no member fails alone, the failure is an interaction. Run F on base + the first half of the members,
   then keep halving whichever prefix fails. The first member whose addition turns the prefix red is the culprit.
   That takes ⌈log₂ N⌉ serial rounds.
5. **Eject and rebuild.** Culprits leave the bundle: their attempt closes with `ejected` and a new attempt opens with
   the cause. Members whose `depends_on` includes a culprit go back to the queue, keeping their place. The host
   rebuilds the bundle from the rest and reruns only what the ejection can change: F, plus the full gate filtered to
   the culprits' affected sets (§7.1). Every other check already passed on a superset of these members and cannot
   change when they leave. If that passes, the bundle merges. A project with no workspace graph reruns the full gate.
6. **Dissolve.** After two rebuilds of the same bundle, or when halving finds no culprit, the bundle dissolves. Every
   member goes back to the queue in its original order, and Maestro gets an `<integration>` line. It may dequeue a
   suspect or send F to `jimmy`.

**Bundle size.** `size` in the contract is the start value. Once the ledger holds 50 bundled cards, the host sets
the size from the per-card red rate p, the share of bundled cards ejected over the last 50: the largest n with
(1 − p)ⁿ ≥ 0.75, that is ⌊ln 0.75 / ln(1 − p)⌋, between 1 and `max`. That gives 8 at p = 3.5% and 2 at p = 10%, so
about three bundles in four go green without a search. It is one formula over rows that already exist, with no
feedback loop to tune.

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
  the affected set of X..Y does not overlap the bundle's (§7.1). A project with no workspace graph compares changed
  paths instead. Otherwise retest. The bundle PR records the skew ("tested on X, merged on Y"). A break that slips
  through is a base red (§6.8).

### 6.6 Merge

A green bundle merges with `gh pr merge --merge`, under the grant given with `board_queue`. Then:

- GitHub marks each member PR merged, and the existing sync ships the card.
- The host closes each open attempt with `merged`.
- The host deletes the bundle branch.
- It deletes snapshot refs only for shipped cards, and only after their merge is on the remote.

### 6.7 Cost at this scale

Let D be the full gate's duration. With one bundle in flight, a bundle of 8 and a red rate below one bundle in four,
the pool merges about 8 / D × ¾ PRs per unit of time. At D = 30 min that is about 12 PRs an hour, and 16 with bundles
of 16. That is phase 1's ceiling. Phase 2 lifts it by running one conveyor per independent area (§7).

### 6.8 Base red

Base can go red with no bundle at fault: a merge from outside the conveyor, a `merge-if-disjoint` skew, or a break
the affected graph missed. The host learns it when F fails on base (§6.3 step 2) or when the whole suite fails on
base (§7.3).

- The bundle in flight is not blamed. Its members go back to the queue and keep their place.
- The host finds the culprit commit with `git bisect run` of F between the last green whole-suite run and the base
  tip. It never reverts.
- It opens a fix card pinned to the front of the queue, naming the culprit commit and F, and raises one
  `<integration>` line.
- Until the fix lands, no bundle is cut whose affected set overlaps F's packages. In phase 1, no bundle is cut at all.

## 7. Phase 2: one conveyor per affected area

One conveyor serializes every merge, including merges that cannot affect each other. Phase 2 splits the pool into
lanes by what a change can break, the way Aviator's affected targets and Uber's conflict analysis do.

### 7.1 Lane key

At enqueue, and again at every cut because base moves, the host computes the card's **affected set**: the workspace packages its diff touches, plus every
package that depends on them. It takes them from `turbo` (`turbo run typecheck --filter='...[<base>...<head>]'
--dry=json`, which lists affected tasks without running them).

A diff that touches a **global path** has no lane: it affects everything. Global paths are listed in the contract,
and for this repository they are the root `package.json`, `bun.lock`, `turbo.json`, root `tsconfig*.json`,
`.github/**` and `script/**`.

### 7.2 Lanes

Lanes are not stored. Two rules decide, at every cut, which queued cards may go:

1. A card may join a new bundle only when its affected set overlaps no bundle in flight.
2. A card is never cut ahead of an earlier card, by `order` and then by time queued (§4.4), whose affected set
   overlaps its own.

The cards that pass both rules are grouped into connected components of overlapping affected sets. Each component is
a lane and cuts its own bundle with the phase 1 algorithm: assemble, run, isolate, halve, eject, merge. Lanes with
disjoint affected sets run and land in parallel.

- A lane's full gate runs only its affected packages: typecheck and tests filtered to the lane's affected set.
- A card with a global path overlaps everything. Rule 2 holds every card queued behind it, so it cannot be starved:
  once the bundles in flight land, it goes alone or with other global cards, on the whole suite.
- A lane bundle lands with `merge-if-disjoint` against base (§6.5). Other lanes move base, but by construction they
  touch nothing in this lane's affected set.

### 7.3 Safety net

The affected graph is a model, and models miss things such as runtime coupling or a test that reads another
package's files. The safety net is the epic bundle, which always runs the whole suite (§6.1). The run that already
closes every epic checks all of base, so the net adds no runs of its own. A project that lands without epics can set
`lanes.fullEvery` to run the whole suite on base every K lane landings; the default is 0, which means off. A red
there is a base red (§6.8): no revert, a fix card at the front, and only the lanes that overlap the failure pause.

### 7.4 Contract

```json
"lanes": {
  "by": "turbo",
  "global": ["package.json", "bun.lock", "turbo.json", "tsconfig*.json", ".github/**", "script/**"],
  "fullEvery": 0
}
```

When `lanes` is absent, or the repository has no workspace graph, the project stays on phase 1. A lane's filtered
full gate needs the CI to accept a package filter. For this repository, that means `typecheck.yml` and `test.yml` gain
a `packages` dispatch input, which is part of WP7.

### 7.5 Throughput

Each lane gives phase 1's throughput, about 12–16 merges an hour at D = 30 min, and its filtered gate is usually
shorter than D. Throughput then grows with the number of independent areas in flight, not with one conveyor's
speed. Maestro's planning feeds this directly: cards that `archie` cuts by package land in different lanes.

## 8. Invariants against lost work

1. **Push early.** Every seat return, and every 10 minutes while a seat runs, the host writes the worktree to a
   snapshot commit through a temporary index (`git add -A` against `GIT_INDEX_FILE`, then `write-tree` and
   `commit-tree` with the previous snapshot as parent). It pushes the commit to `refs/orchestra/wip/<KEY>/a<n>` on
   the project's push remote. The worktree, its index and its HEAD are untouched, so "seats never commit" still
   holds. `.gitignore` applies. When the new tree equals the last snapshot's tree, nothing is written or pushed. On a
   public repository the ref is as public as a PR branch.
2. **Nothing disappears silently.** Ejection, a red check and dequeueing never close a PR or delete a branch. Only a
   merge or a card cut ends an attempt, and every end has an `outcome` row.
3. **Every queue exit has a fact.** A card leaves the queue only by merge, ejection, or dequeue with a reason (from
   the host or from Maestro). An `in-bundle` card whose PR head moved is treated as dequeued by the host. It is never
   merged at a SHA the bundle did not test.
4. **Targeted rebase notices.** When base advances, the host takes `git diff --name-only <old>..<new>` and compares
   it, with the arsenal's `conflictVerdict` semantics, to the declared write set of every queued card (phase 1;
   Building cards are later work, §12).
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

## 9. Context continuity

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
  - a card that is `local` with a dead Session;
  - a card whose real affected set left its planned `area` (§4.4).

  Everything else stays on the board, where `board_read` finds it.

Example:

```
<integration>
- LCH-58 ejected from LCH-B12: test/reminders/schedule.test.ts fails alone on base+LCH-58. Attempt a3 opened. Route it.
- LCH-B13 flaky: test/session/compaction.test.ts failed, then passed on rerun. Merge or retry.
- LCH-61 conflicts with dev at 4f2c1e0 in src/board/github.ts.
</integration>
```

## 10. Failure modes and recovery

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
| Base itself is red | F fails on base, or the whole suite fails on base | §6.8: no member is blamed, fix card at the front |
| A dependency is ejected | Attempt rows | Dependents go back to queued, not to rework |
| A hold is set while the card is bundled | Card read before merge | The member is dropped and the bundle rebuilt. The card waits in the queue. |
| The host crashes mid-bundle | Restart | §8.5 reconcile |
| Maestro's context is compacted | | §9: the board plus `<integration>` rebuild the picture |
| GitHub is signed out or rate-limited | `github_state` | Pools pause and show the fact. Snapshots queue locally and push on recovery. |
| A card leaves its planned area | Real affected set at enqueue differs from `area` | §4.4: a plan revision for `archie`; the card still queues |
| The queue is full and old | The ledger: queue wait above 2 × D | Phase 2 lanes (§7). Within a lane, stacked speculation is the next lever (§12). |

## 11. Scale notes

- Merge-tree checks, diffs and snapshot writes are local git operations of milliseconds to seconds. Forty cards at a
  10 min timer is four snapshots a minute.
- GitHub calls ride the existing 60 s poll: one read per open bundle PR plus its check runs. Snapshot pushes are git
  pushes, not API calls.
- In phase 1, several projects or epics on one repository share one pool, so their merges serialize on base. In
  phase 2 they serialize only where their affected packages overlap. Bundles may mix epics. Cut rule c still closes
  each epic with a bundle.
- Pools on different repositories are independent. A dependency across repositories is satisfied only by the other
  card being Shipped, never by bundling the two together.

## 12. Later, and not at all

**Ledger numbers.** The host computes four numbers from rows it already keeps and shows them on the board, per pool
and per lane:

- **Queue wait:** median time from `queued` to merged.
- **Red rate:** share of bundled cards ejected (p, §6.3).
- **Rework rate:** attempts per Shipped card.
- **Lead time:** median time from `scoped-green` to Shipped.

**Later.** Each item has a trigger on those numbers. Nothing is built before its trigger fires.

| Item | Build it when |
|---|---|
| Speculative bundles stacked within a lane (Zuul, GitLab trains, SubmitQueue) | A lane's queue wait stays above 2 × its gate duration for a week |
| Flake quarantine and flake-aware bisection beyond one probe | The same test appears in `board_flake` in three bundles |
| Test-impact selection finer than packages | A lane's filtered gate is still the bottleneck |
| Preempting an in-flight bundle for an urgent card | An urgent card misses its window because a bundle was in flight |
| Proactive rebase notices to cards that are not queued yet (§8.4) | `conflict:` causes exceed one rework attempt a day |

**Not at all.**

- **GitHub merge queue.** It is not available on this personal repository, needs `merge_group` everywhere, and
  bypasses the `epic` label.
- **Merge first, revert on red.** See §2.
- **A full run per PR.**
- **Host rebasing or merging into a seat's worktree or branch.** The seat does it from the notice.
- **Stacked-PR tooling.** Dependencies go through `depends_on` and queue order.
- **New board stages or columns, and integration-state labels on GitHub.** The bundle PR is the GitHub-visible
  record.
- **Webhooks, and a separate queue process.** The conveyor runs inside the board's poll loop.
- **Letting Maestro write integration state.**

## 13. Work packages

Each package ships with its docs (`docs/guides`), the playbook edits it implies, and the maintenance and ownership
skill updates. Each is gated by `test:ci` on its touched tests and a `typecheck.yml` dispatch. One epic covers each
phase.

**Surface.** No new protocol: the conveyor speaks through the board, its tools and one System Context source.

| Kind | What | Ships | WP |
|---|---|---|---|
| Maestro tools | `ci_run`; `board_queue` (with `urgent` and `flush`); `board_dequeue`; `board_bundle` (flaky verdict: `merge` or `retry`, with a reason). `board_issue` gains `record` (§4.5). `board_read` also returns integration state, attempts, checks and the record. | yes | 2, 4, 5 |
| Host, no tool | The conveyor in the board's poll loop; snapshot refs; the card thread, and the bundle's record commit with the board log, logbook and Orientation records (§4.6, §4.7); the `maestro/integration` source; tables `board_attempt`, `board_check`, `board_flake`, plus queue and bundle rows | yes | 1–8 |
| Contracts | `.orchestra/ci.json` (§5.1, §7.4); the new rows and states in `docs/specs/projects-board/CONTRACT.md`, including `board_note` `kind` and the board file format | repo file, read at run time | 2, 4, 10 |
| Playbooks | `maestro-lead` `land`: Publish becomes "verify, write the record, then `board_queue`", and its golden shows a record; `track`: `<integration>` lines and `Flaky:` citing `board_flake`; `maestro-plan`: the area overlap rule | yes | 4, 5, 9 |
| Seat skill | `archie`'s plan skill: the `area` and `order` fields. `archie` gets no tool. | yes | 9 |
| Guards | One new rule in `script/guards/rules`, `merge-outside-conveyor`: added code that merges a PR into a base branch (`gh pr merge` or the merge API) outside the conveyor module. The CI contract's own rules, such as `merge` being `merge`, are checked by its reader, which refuses an invalid file, not by a guard. Maestro writing integration state is impossible by type, since no such field exists (§4). | CI | 4 |
| Templates | Fixed formats, each made by the host in one place: the PR record, the card PR body rendered from it, and the board log, logbook and Orientation records written into each bundle (§4.5, §4.7), all through Atlas's writers; the bundle PR title and body (members, head SHAs, tested-on base, skew), `<integration>` lines, attempt `cause` strings, and the base-red fix card. `archie`'s plan template gains `area` and `order`. | yes | 4, 5, 9 |
| Checklists | None new. Every precondition the host can check is a refusal, not a list item (§4.1). The judgment that remains already has one: `land`'s verification. The flaky verdict keeps its one rule: a merge names the cause or a card to find it (§6.4). | | |
| Repo only | `conveyor-maintenance` and `conveyor-ownership` in `.orchestra/skills`; a guide in `docs/guides` | no | each WP updates them |

**Phase 1: one conveyor.**

| WP | Scope | Done when |
|---|---|---|
| **0. Spike** (no product code) | Prove on a scratch repo: merging a bundle PR with `--merge` marks member PRs merged; `gh workflow run --ref` works on a bundle branch; a temporary-index tree equals `test:ci`'s uploaded tree for the same worktree; pushing a hidden ref to GitHub works; `turbo --filter='...[A...B]' --dry=json` lists the affected packages for a commit range in this repository; a seat's Atlas Memory write lands in the card's worktree; two PRs that each append to the same `.atlas` log, merged one after the other with `gh pr merge --merge`, do not conflict (GitHub's server merge honors `merge=union`). | Seven yes/no facts with command output, written into this spec |
| **1. Ledger and push-early** | `board_attempt` with stored `writePaths`; snapshot refs on seat return and on the 10 min timer; the `local` and `pushed` states; the `maestro/integration` source with the dead-Session and missing-worktree lines; `track` playbook edits | Kill a seat mid-task: its card shows `pushed`, and its worktree is restored from the ref |
| **2. CI facts** | `.orchestra/ci.json` reader and defaults; `ci_run`; `board_check` keyed by tree; the `scoped-green` and `scoped-red` states | A green scoped run stays valid after Maestro's commit with the same tree, and drops after an edit |
| **3. Conflict notices** | Base-advance diff, matched against queued cards' write sets with `conflictVerdict`, then `merge-tree`; the `conflicts` state and its `<integration>` line | A merge that touches a card's write set notifies only that card; a merge outside it notifies none |
| **4. Queue and green bundles** | `board_queue`, `board_dequeue` and their preconditions; pools; cut rules a–d; assembly; the bundle PR with `full.label`; merge on green; `onBaseMoved`; the card's affected set from `turbo` (§7.1), which `merge-if-disjoint` and the eject rerun use in phase 1 too; the PR record, host-opened PRs through Atlas's host adapter with its GitHub writer, Atlas's trailers plus `Attempt`, the bundle body (§4.5); `land` playbook Publish rewritten to "verify, write the record, then `board_queue`" | Three verified cards merge through one bundle and one full run; all three ship; each PR shows host-filled cost, checks and review records; a record with no Risk is refused at enqueue; the merged card has one logbook entry, inside its bundle |
| **5. Red bundles** | Bundle size from the red rate; the four ledger numbers on the board; infrastructure rerun, base check and flake probe, isolation with in-bundle dependencies, halving, eject into rework, rebuild, dissolve, `board_flake` and the `board_bundle` verdict, base red (§6.8) | A seeded failing member is ejected with the right cause, and the rest merge on the rebuilt bundle; a seeded interaction is found by halving; a seeded red on base ejects no member |
| **6. Recovery** | Restart reconcile for pools, bundles and snapshots | Kill the host between "bundle green" and "merge": on restart it merges once, with no duplicate bundle |
| **10. Thread and board versions** | `board_note` `kind` and seat authors; the host writes thread rows from `task` calls, returns and review records (§4.6); `.atlas/board.jsonl` admitted and unioned like the other Atlas logs; the bundle's record commit with the board log, logbook and Orientation records; the `.atlas` files allowed in `land`'s write-set check, the public redaction and `board import` from a tree (§4.7) | A card's thread shows its brief, a seat question, the answer and the return without any agent posting; a checkout of an older merge imports the board as it stood then; deleting the local database and importing from `dev` restores every merged version |

Order: 0, then 1 and 2 in parallel (disjoint write sets), then 3 and 4, then 5, then 6. WP10's thread half runs in parallel with 1 and 2; its record-commit half follows 4. WP1 ships first, alone if
needed, because lost work is the costliest pain and it needs no queue.

**Phase 2: one conveyor per affected area.** It starts after phase 1 has run a real epic. WP7 and WP9 run in
parallel: WP9 touches only `archie`'s plan skill, `maestro-plan` and the enqueue check, and WP7 is the host's lanes.

| WP | Scope | Done when |
|---|---|---|
| **7. Lanes** | Global paths; the two cut rules, reading `order` when a card has one, and lanes as connected components; global cards; a `packages` dispatch input on `typecheck.yml` and `test.yml`; the `lanes` contract block | Two cards in disjoint packages land in parallel bundles, each running only its packages; a card touching `bun.lock` waits for both and runs the whole suite, and no card queued after it is cut first |
| **8. Safety net** | The epic bundle always on the whole suite, with optional `fullEvery`; pausing only the lanes that overlap a base red | A seeded cross-package break that the affected graph misses is found by the safety run, and only its lane pauses |
| **9. Plan shape** | The `area` and `order` fields in `archie`'s plan skill and in the adopted plan; the overlap rule in `maestro-plan`; plan drift lines at enqueue | A plan with an undeclared area overlap is returned to `archie`; a card that leaves its area raises one drift line and still queues |

## 14. Owner decisions

1. **Bundles carry the `epic` label.** This turns "one full run per epic" into "one full run per bundle, and every
   epic closes with one" (§5.1). Recommended: yes.
2. **`merge-if-disjoint` for `dev`** (§6.5). This is the one exception to the not-rocket-science rule, taken because
   other sessions merge into `dev` directly. Recommended: yes for this repository; `retest` stays the default for
   other projects.
3. **The host merges a green bundle under the grant Maestro gave with `board_queue`,** with no further prompt per
   bundle. Recommended: yes, because enqueue is the merge decision.
4. **Snapshot refs are pushed to the public remote.** They are as public as a PR branch. Recommended: yes, since the
   alternative is work that lives only on one disk.
5. **Phase 2 trusts the affected graph between whole-suite runs** (§7.3). A break the graph misses is caught by the
   next epic bundle, and pauses only the lanes it touches. Recommended: yes, with no extra whole-suite runs (`fullEvery` 0) for this
   repository, because epics already close often.
6. **Model spend stays off GitHub** (§4.5). PRs show attempts, CI minutes and wall time; tokens and spend show only in
   the app. Recommended: yes, matching the board contract; a project may opt in later if its repository is private.
7. **The board log in a public repository is redacted** (§4.7): no notes, threads, question text or spend. A private
   repository tracks everything except secrets. Recommended: yes.
