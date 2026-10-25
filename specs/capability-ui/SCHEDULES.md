# Schedules

The Schedule chapter exists in dev (`packages/app-shell/src/orchestra/chapters/schedule*.ts(x)`), backed by
`server.schedule`: `schedule.list`, `create`, `update`, `remove`, `run`.

## Gap

Agents create schedules with `schedule_manage` (`packages/core/src/capability/schedule/contract.ts`). Those rows share
`ScheduledTaskTable` with `policy: "capability"` and an `owner`. The legacy routes read only `policy: "legacy-browser"`
rows (`packages/core/src/scheduled-task/shared.ts`, `LEGACY`), so the chapter never shows a schedule an agent created.
Capability schedules also carry fields that `ScheduledTask.Info` cannot express: `interval` and `cron` cadences,
`catchUp`, `repeat`, `skipped`, `disabledReason` and `revision`.

## Backend prerequisite

- S00. Add capability schedule routes to a protocol group that reuse `CapabilityScheduleContract.Schedule` as the
  response: list for the location, plus pause, resume, delete and run on one schedule. They go through
  `CapabilityAuthorization`, like the other capability groups. Owner checks stay in Core, as in
  `ScheduledTask.getOwned`. Creating and editing stay with the agent in this campaign.

## Requirements

- S01. The chapter lists capability schedules in their own section, "Created by agents", below the user's schedules.
  Each row names the session or agent that owns it.
- S02. The cadence renders in words for every kind: "Once at …", "Every 30 min", "Daily at 09:00", "Mondays at 09:00".
  Cron shows the raw expression plus the next run time.
- S03. Each row shows next run, runs, skipped, and the last run outcome. A started run links to its session; a failed
  run shows its error.
- S04. A disabled schedule shows why: "Repeat limit reached" (`exhausted`) or "Owner no longer exists"
  (`owner-missing`).
- S05. Row actions: Pause or Resume, Run now, Delete. Delete confirms. Run now never moves the next slot, which the
  contract guarantees.
- S06. The user's own schedules keep today's behaviour unchanged.

## Tests

Server tests for S00. Model tests for the S02 cadence copy and the S04 reasons. One browser test lists a capability
schedule.
