---
name: janitor-maintenance
description: Use when changing Janitor scanning, scheduling, report state, host sink or desktop report presentation.
---

# Janitor maintenance

This is a repo-only maintainer map, not a runtime seat skill.
Start with [Janitor README](../../../modules/janitor/README.md).

## Owners and sources

| Concern | Source of authority |
|---|---|
| Public entry points | `modules/janitor/package.json`: `./bootstrap`, `./report-state` |
| Scan, findings and evidence | `modules/janitor/src/scan.ts`, `thresholds.ts` |
| Schedule and report delivery | `modules/janitor/src/scheduler.ts`, `bootstrap.ts` |
| Latest module report | `modules/janitor/src/report-state.ts` |
| Desktop presentation and state | `apps/desktop/src/main/janitor.ts`, `janitor-ipc.ts` |

## Authority and lifecycle traps

- Scan uses a read-only command allowlist; it reports findings with evidence and
  suggestions, not proof of authorization to mutate or delete anything.
- A suggestion is not an approval. The scan source says actions require an explicit
  UI click; do not infer an autonomous deletion or approval mechanism from a report.
  Trace any actual action and its authority in its own host before changing it.
- Thresholds set severity; scheduler tracks notification dedupe and emits reports.
  Scanner unavailability is reported, not evidence that the system is clean.
- The loop accepts a host-supplied sink and shares one process-local fiber.
  `ORCHESTRA_JANITOR=0` disables it; the last scope finalizer interrupts the fiber
  and clears the in-memory latest report. Interval is configured from the environment.
- Desktop report, dismissal and snooze handling are distinct from module report-state;
  the desktop IPC validates senders and persists its own presentation state.
- The module README records its then-current consumer boundary; verify wiring before
  assuming the loop is started by a particular host.

## Safe change checklist

1. Keep scanning read-only; trace proposal, approval and any mutation separately.
2. Preserve evidence and unavailable-scanner signals when changing report shape.
3. Check shared-loop lifetime, sink behavior and desktop state independently.
4. Update the module README and user-facing guide when their documented behavior changes.
5. Follow repository testing and guardrail instructions for the actual change.

## Existing test witnesses

- `modules/janitor/src/scan.test.ts`: parser/severity cases and unavailable scanners.
- `modules/janitor/src/scheduler.test.ts`: dedupe, snooze and report emission.
- `modules/janitor/src/bootstrap.test.ts`: kill switch and interval parsing;
  `report-state.test.ts`: cached report reset.
- `apps/desktop/src/main/janitor-ipc.test.ts`: sender validation, source persistence
  and dismissed replay. These witnesses do not certify a cleanup action.
