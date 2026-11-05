---
name: maestro-orchestra-work-merge-queue
description: How the merge queue admits, bundles, tests and lands cards, what `.orchestra/ci.json` controls, and how red bundles are handled.
internal: true
when: The owner asks why a card is or is not queued, how bundles form, what a red bundle does, or what to put in `.orchestra/ci.json`.
not-when: The question is only about board stages (use the board leaf).
covers: []
---

# The merge queue

Cards in Review with a PR enter the queue. The queue groups them into a bundle, tests the bundle, then merges. It never reverts a merge.

## Configuration

`.orchestra/ci.json` is read from the base branch.

| Field | Meaning |
|---|---|
| `base` | Branch bundles land on |
| `scoped.tests` | Per-card test command with `{package}` and `{files}`; run without a shell |
| `scoped.workflows` | Scoped workflows |
| `full` | `label`, `checks`, `control` for the full gate |
| `bundle` | `size`, `max`, `waitMinutes`, `onBaseMoved` |
| `budget.jobs` | CI job budget |
| `snapshots.remote` | Remote that receives work in progress (default `origin`) |
| `merge` | Must be `merge` |
| `lanes` | `by: "turbo"`, `global`, `jobs`, `workflows`, `fullEvery` |

Code defaults (packages/core/src/board/ci.ts): bundle size 4, max 16, wait 45 minutes, `onBaseMoved` retest. The guide example shows size 8; that is an example value, not the default.

## Admission

A card is refused when it has no PR or an incomplete PR record, is not scoped-green (when scoped checks are declared), has a dependency that is neither shipped nor queued, conflicts with base, is paused, or has follow-ups that are not cards yet.

## Bundles

- The bundle PR is `chore(queue): bundle KEY-B<n>` on branch `bundle-KEY-<n>`. The record commit is `chore(queue): record <KEY>-B<n>`.
- A bundle forms when `bundle.size` cards wait, when a card was queued with flush, or when the oldest card has waited `bundle.waitMinutes`.
- Work in progress is pushed every 10 minutes to `refs/orchestra/wip/<KEY>-<number>/a<attempt>` after a gitleaks scan.

## Red results

- Infrastructure red is rerun once.
- A code red is halved to find the culprit; a card red alone is ejected back to Review. Scoped failures are searched with scoped runs, not full gates.
- After 2 rebuilds, or when halving finds nothing, the bundle dissolves. Its cards are held until Maestro releases them one at a time with `board_bundle release`, which rides alone.
- A red base opens a `bug` fix card.
- A queue can pause until Maestro retries.

## Maestro controls

`board_bundle` actions: merge, retry, release (with a card). Use them for a flaky, paused or dissolved bundle. `board_dequeue` takes a card out; `ci_run` starts a CI run.
