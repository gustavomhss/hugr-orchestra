---
name: maestro-repo-maintenance
description: Scoped Git hygiene, independent PR review, change-aware checks, and release preparation. Use before an authorized branch, PR, integration, release/tag, or when repository state drifts; this skill grants no publication authority.
---

# Maestro Repository Maintenance

## Trigger and rationale

Use for Git/PR/release procedures or repository drift. Tiny changes need proportionate verification,
not a mandatory branch/PR/wave. Larger or risky changes need bounded independent review and actual checks.
Source TechLead scripts/hooks are not installed host features; inspect this project's scripts/config first.
User instructions and native permissions decide authority. No implicit commit, push, PR, merge, or release authority.

## Inputs

Requested operation; project instructions/scripts/templates; default branch; current baseline/dirty state;
full change scope; actual CI at exact head; independent review; release version/changelog/signing policy.
For canonical ownership, current static `own_*` facts dominate maps; stale or held pointers mean HOLD.

## Procedure

1. Inspect state before action. Distinguish intended user work from strays; do not delete unfamiliar files.
   Use `repo-hygiene-check` for scoped Git/filesystem acquisition and `profile` only for explicit project
   governance preferences. Preferences are data, not permission or hidden global hook installation.
2. Match procedure to change. Small covered patch uses scoped checks; substantial/risky delta needs
   independent cold review. Choose review slices by cohesive responsibility and cognitive load, not fixed
   source-brand model/LOC constants. Minimize WIP and long-lived branches without inventing deadlines.
3. For independent review use [reviewer-brief.md](reviewer-brief.md). Reviewer gets diff + spec, never
   author transcript. Findings are advisory; lead retains judgment and native approval requirements.
   AI PR tooling is not the sole gate. If review cannot run, report UNKNOWN instead of self-certifying it.
4. Scope CI toward changed domains; ambiguous harness/dependency/global changes require broader checks.
   Required project checks remain required. A skipped configuration is not green. Distinguish local
   runs from exact-head CI; generated gate/policy advice is not enforcement.
5. When explicitly asked to commit, inspect status, full diff, and recent history; stage intended paths,
   including deliberate integration fixups only. Conventional message/title: `type(scope): summary`.
   Never use blanket staging to sweep user/runtime state into integration. Do not bypass hooks/checks.
6. When explicitly asked for PR, inspect remote tracking and every included commit plus base diff.
   Use project template: why/scope, how tested, risk/recovery, related issue. Report PR URL.
   Independent review and green checks inform integration; neither grants permission to merge.
7. For an explicitly authorized release/tag, discover actual release recipe and version policy.
   Check intended clean state, version/changelog agreement, curated release notes, unpublished tag,
   complete required gate, applicable signing, compatibility risk, and selective recovery limits.
   Do not copy absent `release.sh`, bump scripts, SSH config, or branch rules from TechLead.
   A proposed release recipe is not execution; stop when required policy/checks are unknown or failing.
8. Maintain decision/outcome pointers; clean only owned inactive artifacts/worktrees with permission.
   Preserve user work, secrets, lockfile security pins, evidence, and unpublished changes.

## Exact tools and inspection commands

Use `maestro_arsenal_catalog` only when narrow discovery is needed; call `maestro_arsenal_describe`
for each selected operation's exact inputSchema/effects before `maestro_arsenal_execute`.
Selected: `repo-hygiene-check`, `repo-mapper`, `profile`; `plan-to-gates` and `plan-to-policy` generate
proposals only. Unavailable capability or failed Git/state acquisition remains UNKNOWN/FAIL.

In this repository, default branch is `dev`; local `main` may not exist. Inspect actual tracking first:

```sh
git status --short
git diff
git diff --cached
git log --oneline -10
git branch -vv
git diff dev...HEAD
git worktree list --porcelain
```

If local `dev` is unavailable, use verified `origin/dev`. For an existing PR: `gh pr view <pr>` and
`gh pr checks <pr>`; confirm exact head. In `packages/orchestra`: `bun typecheck`; tests run on Actions from
the repository root: `bun run test:ci orchestra <resolved-suite>`. Resolve parameters before executing.
If branching is authorized here, use at most three hyphen-separated words, no slashes/type prefixes.

## Destructive/bypass refusal

No `--no-verify`, published-history amend/rebase, force-push, moving published tags, `filter-branch`,
or `gc --prune=now`. No repository-wide `reset --hard`/`clean -fd` rollback. A dry-run is inspection,
not deletion authority; force-with-lease is still not implicit push authority.
Do not modify Git signing/config, global instructions, hooks, or protection rules without explicit scope.
Do not commit telemetry, generated runtime policy/state, secrets, or build artifacts by accident.
Native host interception must prove any enforcement claim; doctrine/plugin presence alone is not a guard.

## Success / fail

Success: requested authorized operation has scoped evidence, independent review where needed,
intentional Git state, exact-head checks, and current curated records. Preparation can conclude without publication.
STOP: bypass/destructive request outside authority, unreviewed risky delta, red release gate, or published-tag reuse.
UNKNOWN: missing recipe/tool/review/configuration evidence. HOLD: stale Own or governed authority.
Report explicit gaps; do not invent a green result or silently install the source governance machinery.

## Output schema

```text
{requestedOperation, authorityEvidence, baseline, changedPaths, scopeTier: small|substantial|risky,
 independentReview: {status, evidence}, checks: [{command, cwd, head, status, evidence}],
 hygiene: {intendedDirtyPaths, findings, unknowns}, release: {status, version, tag, policyEvidence},
 blocking: [], verdict: ready|stop|hold|unknown, next}
```
