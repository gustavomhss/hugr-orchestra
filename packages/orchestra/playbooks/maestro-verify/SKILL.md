---
name: maestro-verify
description: Verify returned work, acceptance evidence, test teeth, and integration risk. Use for completion claims, independent review, PR review, or before an authorized integration or release; scope checks to the actual change.
---

# Maestro Verify

## Trigger and rationale

Use when asserting completion, reviewing a deliverable, or preparing authorized integration/release.
Small reversible edits use proportionate existing checks; substantial work needs acceptance and independent
review evidence. An author's report is a pointer to evidence, never the evidence itself.
Lead owns final judgment, project invariants, risk, and integration. Review verdicts grant no Git or runtime authority.

## Inputs

Demand/acceptance items; frozen seam; baseline and full delta; actual check outputs; project instructions;
current source identities/Own pointers; independent findings; skipped configurations and unknowns.
Current static `own_*` facts dominate maps/search; stale/held Own evidence means HOLD, not fallback.

## Procedure

1. Cold-check actual placement, baseline ancestry, commits if claimed, working tree, and every changed path.
   Include uncommitted/untracked deliverables. Commit existence is required only when committing was requested.
   Do not equate a worker's `completed` status with verified completion.
2. Reproduce relevant runner/build/type/lint checks in the actual project. Compare baseline and final results;
   new behavior needs meaningful red-to-green or equivalent direct evidence; preservation checks may already pass.
   Named judged items remain judged. Missing, skipped, or unknown results are not PASS.
3. Prove test teeth: plant a representative behavior defect, confirm the specific test fails for the intended
   reason, restore only your mutation, then rerun. Test actual values, errors, limits, and boundaries;
   no clone of implementation as oracle. Calibrate absence/count claims against a known positive control.
4. For substantial acceptance/review, use an independent cold reviewer. Give diff and frozen spec/invariants,
   not author transcript or rationale. Keep each review slice cognitively bounded; re-slice when too large.
   See [review-checks.md](review-checks.md) for L0–L10 and V1–V4 coverage. Missing independent review stays UNKNOWN.
   Author cannot grade their own work as independent. Lead reads findings and signs off; review is not approval.
5. Inspect invariant/security/migration risk, public docs/decision records, scope creep, bypasses,
   suppression additions, skipped tests, secret exposure, and configuration-specific failures.
   Keep coverage per applicable configuration; one green cell cannot hide another failed or absent cell.
6. Use selected operations below to support findings. They check declared data or acquire scoped facts;
   they do not prove requirements complete, enforce generated policies, or approve an operation.
7. Record evidence and exact gaps. Fix failures at root; do not bypass checks or silently defer debt.
   Any explicit user-authorized deferral records what, who/when, reason, remediation, and tracking;
   it does not transform failed evidence into PASS or replace native governed approval.

## Exact tools and commands

Use `maestro_arsenal_catalog` only for unknown registered capability discovery.
Call `maestro_arsenal_describe` for each selected operation's exact inputSchema/effects before
`maestro_arsenal_execute`. Unavailable operation/acquisition/compiler is UNKNOWN, not a successful empty report.

| Operation | Evidence scope |
| --- | --- |
| `plan-check`, `brief-usage-check` | Acceptance ownership/partition and briefing checks |
| `contract-freezer`, `seam-checker` | Canonical declared surface/signature comparison |
| `symbol-flow-check` | Actual compiler diagnostics across slices |
| `repo-hygiene-check` | Git/filesystem facts with explicit unknowns |
| `plan-to-gates` | Proposed completion commands; native execution receipts still required |
| `plan-to-policy` | Proposed scoped permissions; not host authorization |

```sh
git status --short
git merge-base --is-ancestor <baseline-sha> HEAD
git diff --stat <baseline-sha>
git diff <baseline-sha> -- <owned-path>
git ls-files --others --exclude-standard
```

Resolve baseline/paths before execution. Inspect untracked file contents separately; Git diffs omit them.
Run tests on Actions with `bun run test:ci orchestra <resolved-suite>` from the repository root and
`bun typecheck` from `packages/orchestra`.
For CI claims, inspect `gh pr checks <pr>` at exact PR head; local green is not CI green.
Broaden checks only for changed dependencies/harness, cross-package effects, or unresolved risk.
Never invoke uninstalled source-only scripts (`acceptance-gate.py`, `story-test-gen`, `verify.sh`) as host features.

## Success / fail

Success: scoped acceptance/preservation and required quality checks have reproducible current evidence;
review covers the actual delta; independent test teeth and relevant configuration outcomes are known.
FIX-FIRST: recoverable test/docs/scope/seam failure. REJECT: hard invariant breach or false evidence.
ESCALATE/HOLD: authority, judged decision, or canonical grounding blocker. UNKNOWN stays explicit.
These are review conclusions, not permission to merge, release, push, or record approval.

## Output schema

```text
{target, baseline, sourceIdentity, levels: [{id, status: pass|fail|unknown|not-applicable, evidence, reason}],
 acceptance: [{id, baselineStatus, finalStatus, oracleEvidence}], mutationControls: [],
 independentReview: {status, evidence}, findings: [{severity, path, issue, fix}],
 configurations: [{name, status, evidence}], unknowns: [],
 verdict: approve|fix-first|reject|escalate|hold, next}
```

Return compact findings and output pointers; preserve detailed logs in existing stores, not whole transcripts.
