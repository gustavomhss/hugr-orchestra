---
name: maestro-orchestra-work-hygiene
description: What the janitor module scans, what it never does, how it is scheduled and where reports go.
internal: true
when: The owner asks about disk, stale processes, dev-server ports, cleanup or what the janitor does.
not-when: The question is about git worktrees or repository copies; the janitor does not clean those.
covers: [modules/janitor]
---

# Hygiene and the janitor

## `modules/janitor`

The janitor scans the data directory and the machine for growth, keeps the latest report in process memory and hands each report to a host-supplied sink. It is read-only: it runs only ps, df, du, lsof, docker, git, vm_stat, memory_pressure and powershell.exe, and never deletes or kills. Actions happen only through an explicit click in the UI.
Entry points: `startJanitorLoop`, `enabled`, `configFromEnv` (bootstrap) and `getLatestReport` (report-state).

## What it finds

| Kind | Trigger |
|---|---|
| `disk` | Usage at 0.8 or above is attention; 0.9 or above is urgent |
| `process` | CPU at 80% or above for at least 5 minutes |
| `port` | Dev servers on 3000, 4000, 5173, 8000, 8080 |
| `scanner` | A scanner was unavailable |

Finding messages are written in Portuguese. `thresholds.ts` lists more values (worktree age, stash, cache); `scan.ts` does not use them, so do not claim those are scanned.

## Scheduling

Default interval 15 minutes, dedupe 24 hours. `ORCHESTRA_JANITOR=0` disables it; `ORCHESTRA_JANITOR_INTERVAL_MIN` sets the interval. One loop runs per process.

## Where reports show

The desktop shows them (apps/desktop/src/main/janitor.ts and janitor-ipc.ts) over the channels `janitor-get-report`, `janitor-publish`, `janitor-snooze` and `janitor-dismiss`. A report is capped at 256 KiB. Nothing is written to disk.

## Honest limit

No code under apps, packages or modules calls `startJanitorLoop`; only tests do. The loop may not run in the product, so tell the owner the janitor may report nothing until a host starts it.

## Not janitor work

Removing a repository copy is `ProjectCopy.remove`; restoring gone worktrees is the board snapshot. The janitor is not a git or worktree cleaner.
