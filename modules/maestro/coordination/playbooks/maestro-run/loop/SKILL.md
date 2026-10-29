---
name: maestro-run-loop
description: Drive ready work, verify returns, recover interruptions, and integrate approved deltas. Use after slices and briefs exist, for dependent execution, failed handoffs, or selective recovery; small work follows a direct inspect/edit/verify loop.
internal: true
when: Slices and briefs exist: dependent execution, failed handoffs or selective recovery.
not-when: Small work that follows a direct inspect, edit and verify loop.
---

# Maestro Loop

## Trigger and rationale

Use to carry planned work through execution, verification, reconciliation, and closure.
Normal small work uses inspect → edit → verify; no mandatory workers, waves, commits, or approval ceremonies.
Lead owns scaffolding decisions, readiness, integration order, risk, decision records, calibration, and outcome.
Execution can be delegated; unexpected architecture/scope forks return to lead. No deterministic zero-decision promise.

## Inputs

Acceptance/slices and `partitionPlan` if used; bounded packets; contract/stub status; observed baseline;
actual native dispatch/return/check receipts; current Own identities; permissions and explicit user authority.
The symbol partitionPlan is distinct from durable prompt PlanRevision. Arsenal cannot replace governed lifecycle.
Current static `own_*` facts dominate maps; stale/held/missing Own context means HOLD and pointer refresh.

## Procedure

1. Create only needed scaffold/anchors through authorized native edits, or approve exact returned scaffold
   text before applying it. `stub-gen` and `plan-to-barrel` generate source, not writes or automatic merges.
   Generated code must compile/test in the actual project; a skeleton is not completed behavior.
2. For parallel work, use `wave-scheduler` on structurally valid supplied events and slices.
   It gives replay-pure readiness/integration advice, not actual dispatch or Git actions.
   Hard dependencies need providers integrated before dispatch. Contract/stub-bound consumers may start
   earlier, but provider dependencies still constrain integration. Conflicting write sites stay reserved
   through verification until integration, not freed merely because a worker returned.
   Choose concurrency from host capacity and review/context cost; avoid barriers that buy only waiting.
3. Dispatch ready work through available native tools under permissions. Explicit governed work retains
   admission → catalog scope/Own IDs → PlanRevision → GROUNDED context → validation/review → exact
   direct-user approval → authorizationID → Task. A ledger event never substitutes for any of these.
4. Record only observed lifecycle events in `wave-ledger`, bounded to caller's project-isolated data directory.
   Worker return is not `sealed`: verification-green plus lead review supports that event.
   `merged` requires an actual authorized integration receipt. Missing/unreadable ledger is UNKNOWN/FAIL,
   never an empty completed wave. Empty scheduler input is valid only when explicitly supplied and valid.
5. Load `maestro-run-verify` for returned evidence. Recheck baseline ancestry, full delta/dirty state,
   main-worktree leakage, current conflicts, shared seam, and exact check outcomes before integration.
   An off-baseline branch is HOLD: inspect full delta and extract only understood, owned changes with
   authority; never blindly merge or assume cherry-picking added files makes it safe.
6. Integrate verified ready work serially only when user instructions and native permissions authorize it.
   Recheck provider order and choose low blast radius first. Resolve append-only conflicts by deliberate
   union, not blanket ours/theirs. Use scoped post-integration checks; run broader checks at closure when
   dependency/harness/global effects require them. Do not hold ready work solely for a ceremonial batch.
7. For interrupted or failed work, inspect durable Session evidence, actual files/Git state, permissions,
   and check outputs before resuming. `completed` without verification is still pending, not success.
   Recover selectively through existing restore/edit tools; never use repository-wide `reset --hard`
   or `clean -fd` as atomic rollback. No claim of automatic crash/provider retry without runtime evidence.
8. Update compact task/decision record after each verified transition. Record blockers, changes to contracts,
   predicted versus observed effort/spend when available, and lessons for the next brief. Clean only owned,
   inactive worktrees/artifacts after checking user changes and authority; retain evidence pointers.

## Exact tools and commands

Use `maestro_arsenal_catalog` only for needed discovery. Call `maestro_arsenal_describe` for each
selected operation's exact inputSchema/effects before `maestro_arsenal_execute`.
`wave-scheduler`, `wave-ledger`, `plan-to-dag`, `stub-gen`, `plan-to-barrel`, and `relay-arm` are selected
capabilities, not an assumed all-loaded fleet. Missing operations/bindings stay UNKNOWN.
Generated completion chains are proposals until host execution proves lifecycle binding.
An armed `relay-arm` contract is graded on the host's Relay arm when each bound Task completes: every gate in
order, each with its own retry budget (`retryBudget`, default 3; 0 parks on the first failure). A spent budget parks
the arm, and every later dispatch on it HOLDs `completion-parked-awaiting-owner` before a worker starts: report what
failed and why to the owner. Only the owner's approval of a `relay-arm` `release` request resets that gate's budget.
An arm that passed every gate verifies no new work; arm a new contract for the next task.

```sh
git status --short
git rev-parse HEAD
git merge-base --is-ancestor <baseline-sha> HEAD
git diff <baseline-sha> -- <owned-path>
git worktree list --porcelain
```

Resolve parameters in actual assigned worktree; inspect untracked paths separately.
When dispatching a board card, pass `card: "KEY-n"` on `task` (and on `maestro_request_review`); the host records the thread.
For a board card, run its scoped checks with `ci_run` (package and files from the Done when): it follows the
project's `.orchestra/ci.json`, keys results by tree and reruns nothing already settled on that tree. The scoped
tests run in the background and come back `pending`: start every ready card, then call `ci_run` again (`run: false`
only settles) to read each result. Otherwise
run tests on Actions with `bun run test:ci <package> <resolved-suite>` from the repository root and
`bun typecheck` from the package directory. Use `maestro-repo-maintenance` when an authorized Git/PR/release procedure is needed.
Commands here inspect/verify; they do not implicitly authorize commit, push, PR, merge, or release.

Publish a board card in this order: verify (scoped checks green on the PR head), write the record with
`board_issue`, then `board_queue`. Never merge a board card's PR yourself; the host bundles queued cards, runs the
full gate once and merges on green. `board_queue` refuses a card without a PR, a complete record or a green tree.
The record is structure only; the repository may be public, so no spend, transcripts or secrets:

```json
{"intent": "Let a queued card leave the queue without a stage move.",
 "decisions": "Dequeue dissolves the open bundle instead of rebuilding it in place.",
 "not_covered": "Visual queue column; the Interface session owns it.",
 "risk": {"level": "medium", "breaks": "A stale bundle could hold queued cards.", "undo": "Revert the PR; no migration."},
 "follow_ups": ["LCH-61"]}
```

To pull a card back, `board_dequeue`; `board_move` never moves into or out of `queue`. An <integration> line saying a bundle is flaky or the queue is paused waits on you: board_bundle merge ships a flaky bundle as tested; board_bundle retry cuts a flaky or paused bundle's cards into a new bundle. A dissolved bundle's cards are held: release one at a time with `board_bundle release` and its card number, `board_dequeue` a suspect, or send F to jimmy. Merge a flake only when the failing test is unrelated to the bundle's cards. When base goes red, the queue opens a fix card; route it like any bug, and the queue lets it through alone.

## Success / fail

Success: actual requested work has verified acceptance, reconciliation, current evidence/decision pointers,
and honest integration/cleanup status. Closure may be an uncommitted patch when that is requested output.
FAIL: failing checks, scope leakage, drift, or contradictory receipts. HOLD: unresolved authority/baseline/Own.
UNKNOWN: missing events, tools, acquisition, or review. Re-run required checks after recovery, not from memory.
Fix or report precise unresolved blocker; do not hide a failure with a `sealed` or `merged` stamp.

## Output schema

```text
{baseline, mode, decisions: [{slice, readiness, evidence, leadDecision}],
 transitions: [{slice, event, receipt, verificationEvidence}], integration: {status, evidence},
 recovery: [{path, action, permission, verification}], taskRecordPointer,
 cleanup: {ownedPaths, status, unknowns}, calibration: [], verdict: complete|fix-first|hold|unknown, next}
```
