# Maestro V2 Delivery Roadmap

Snapshot: 2026-09-25. Planning baseline: `fork/dev` at `102e763599`.

## Purpose

This file consolidates Maestro/Atlas delivery state, related CI, relevant PRs, and local worktrees. It does not inventory unrelated product branches, close issues, or rewrite issue contracts. Issue bodies own acceptance criteria; this file owns ordering, current disposition, and operational hygiene.

## Sources Of Truth

| Question                           | Source                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Current integration baseline       | `fork/dev` and its GitHub Actions runs                                                            |
| Acceptance and completion criteria | GitHub issues #106 through #114 and their linked native issues                                    |
| Design contracts                   | `specs/hugr-maestro/methods/*.md`, `atlas-context-envelope-*.md`, and `atlas-adapter-research.md` |
| Current delivery posture           | [SESSION-STATE.md](SESSION-STATE.md)                                                              |
| Historical audit material          | Older audit PRs and session records; never use alone as current delivery proof                    |

## Delivered Surface

| Capability                                  | Delivered             | Explicit limit                                                                         |
| ------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| Maestro agent and admission assessment      | Yes                   | Admission is recorded only through explicit Maestro tool invocation.                   |
| Approval presentation and decision evidence | Yes                   | Durable plan and validation readers are missing, so presentation is fail-closed.       |
| Governed Task fence                         | Yes                   | Fence protects explicit governed Task calls only; it does not make public flow usable. |
| Atlas territory catalog implementation      | Yes, inside Atlas     | It is not exported through an installed host boundary.                                 |
| Static Own snapshot and guard               | Yes                   | Host consumption is not yet canonical/freshness-verified.                              |
| GitHub App fallback                         | Yes                   | Fork uses workflow token; App remains supported when fully configured.                 |
| Generate workflow                           | Yes                   | Generated successor baseline is `102e763599`; no workflow URL is recorded here.        |
| Fork publish workflow                       | Intentionally skipped | Release remains upstream-only.                                                         |

## Delivery DAG

```text
CI root cause (#102) ------------> reliable current-base evidence

#107 remediation ledger ---------> trusted Atlas/Own release disposition

#112 catalog boundary -----------> #114 durable plan/context/validation records
                                           |
#109 Own host boundary --------------------+--> #108 context adapter -----> #106 approval readers -----> #111 current-base integration gate

#110 automatic admission -----------------------------------------------> #111 current-base integration gate

#113 safety children (#25, #42, #49, #62, #72, #86) --------------------> #111 current-base integration gate

#102 CI root cause + #107 remediation ledger + all applicable #113 P1/P2 -> #111 current-base integration gate
```

## Ordered Backlog

| Order | Issue   | State                     | Entry condition                                                                                                                                                                                          | Exit condition                                                                                  |
| ----- | ------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 0     | #102    | Current CI defect         | Current Windows failure evidence                                                                                                                                                                         | Root cause and focused regression gate; no global timeout or serialization workaround.          |
| 1     | #107    | Foundation tracker        | Reconcile original Atlas/Own findings                                                                                                                                                                    | Every child has category, dependency, owner, and release disposition.                           |
| 2     | #112    | Partial implementation    | Freeze installed read API                                                                                                                                                                                | OpenCode reads versioned canonical Territory objects without vendor-relative imports.           |
| 3     | #114    | Not implemented           | #112 available                                                                                                                                                                                           | PlanRevision, ContextRecord, and validation records persist/read; absent context produces HOLD. |
| 4     | #109    | Not implemented           | Relevant Own findings resolved or explicitly gated                                                                                                                                                       | Host verifies canonical Own bytes, identity, receipt, freshness, and coverage before injection. |
| 5     | #108    | Not implemented           | #112, #114, and #109 available                                                                                                                                                                           | Deterministic ContextToolPlan persists verified ContextRecord or returns HOLD.                  |
| 6     | #106    | Not implemented           | #114 and #108 available                                                                                                                                                                                  | Approval presenter reads exact durable records and remains fail-closed on mismatch.             |
| 7     | #110    | Partial branch exists     | Rebase from current `dev`; close #62 hardening in same evidence set                                                                                                                                      | Persisted direct stakeholder messages create exactly one admission before model work.           |
| 8     | #113 P2 | Open safety hardening     | Current contracts and defect evidence reconciled                                                                                                                                                         | #25, #42, #49, #62, #72, and #86 are closed or explicitly non-applicable to governed flow.      |
| 9     | #111    | Current-base gate pending | #102 root cause closed, #107 ledger complete, #112, #114, #109, #108, #106, #110, all applicable #113 P1/P2 children, current CI, and independent contract/implementation/mutation-probe review complete | Current-base integration evidence, no historical PR #11 assumption, human merge decision.       |

## Work In Progress And PR Triage

### Current-Base Work

Open PRs targeting `dev` include unrelated product work (#5, #12, #13). They are not part of the Maestro/Atlas path unless their issue contracts say so.

### Historical Maestro Line

PRs #87, #88, #89, #115, and #116 target `maestro/rebuild-fork-dev-clean`, not current `dev`. They are historical candidates, not active delivery proof.

Before any of them is resumed:

1. Compare its contract against current issue scope.
2. Rebase or transplant only intended commits onto current `dev`.
3. Rerun current CI and independent review.
4. Close or replace the old PR when its evidence is superseded.

### Known Experimental Worktrees

| Worktree                             | State at snapshot                                                           | Disposition                                                      |
| ------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `orchestra-dev`                      | Clean; local `dev` tracks `fork/feat/app-dock-chromium`, ahead 1/behind 112 | Do not use as integration baseline.                              |
| `orchestra-maestro`                  | Clean `maestro-core` branch                                                 | Preserve until owner classifies branch contents against roadmap. |
| `orchestra-maestro-rebuild`          | Clean; 85 commits behind `fork/dev`                                         | Historical integration branch; do not merge directly.            |
| `orchestra-maestro-rebuild-clean`    | User untracked config/status files                                          | Preserve; never clean or switch over its untracked files.        |
| `agent-issue-110-admission-trigger`  | Clean experiment branch                                                     | Review only through refreshed #110 scope.                        |
| `agent-issue-25-approval-redisplay`  | Clean; 43 commits behind `fork/dev`                                         | Rebase/revalidate or close through #113 P2 safety contract.      |
| `agent-issue-72-consume-attribution` | Clean; 43 commits behind `fork/dev`                                         | Rebase/revalidate or close through #113 P2 safety contract.      |
| `agent-issue-112-territory-catalog*` | Clean experiment branches                                                   | Review only through #112 installed-boundary contract.            |

No worktree is removed, reset, or force-updated by this roadmap. Cleanup requires an owner, a merged/superseded PR decision, clean status, and a worktree-specific command.

## CI Operating Policy

| Workflow    | Fork policy                                 | Current condition                                                                                                                                            |
| ----------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generate`  | Must run and may commit generated output    | Generated successor is `102e763599`; record its workflow URL before claiming matrix health.                                                                  |
| `publish`   | Must skip                                   | Fork policy is upstream-only release; record workflow URL when used as evidence.                                                                             |
| `typecheck` | Must pass                                   | No `102e763599` run citation recorded in this snapshot.                                                                                                      |
| `test`      | Must pass on Linux and Windows              | `688d264010` test run passed: [36169196802](https://github.com/gmhelmold/HuGR-Orchestra/actions/runs/36169196802). No successor evidence; #102 remains open. |
| `nix-eval`  | Must complete its defined evaluation policy | No `102e763599` run citation recorded in this snapshot.                                                                                                      |

Rules:

- A rerun may classify a failure as intermittent, but cannot close a root-cause issue without a reproducer and regression gate.
- No blanket timeout increase, full-suite serialization, `continue-on-error`, skipped required test, or waiver is a CI fix.
- A generated successor commit needs its own current CI evidence; parent-run green is not inherited.

## Milestone Definition

Maestro V2 is ready for governed Atlas-backed work only when all conditions hold:

1. Direct stakeholder message admission is durable and exactly-once.
2. Plan, validation, context, policy, actor, and task intent are immutable and exact-bound.
3. Catalog and Own context cross only installed, read-only, verified boundaries.
4. Every unknown, stale, malformed, cross-project, or cross-session path returns named HOLD before Task creation.
5. Governed Task dispatches once from exact durable approval evidence.
6. Current-base Linux and Windows evidence is green, including root-cause closure for required CI defects.
7. Independent review verifies contracts, implementation, and mutation probes.

## Cadence

At each merge or scope change:

1. Update [SESSION-STATE.md](SESSION-STATE.md) with current SHA and observed result.
2. Update this roadmap only for dependency, WIP, or disposition changes.
3. Update affected GitHub issue with command, SHA, CI URL, and remaining limitation.
4. Reconcile stale PRs and worktrees; preserve user-owned untracked work until an owner explicitly decides otherwise.
