---
name: scheduled-task-maintenance
description: Maintains Core scheduled-task persistence, dispatch, and capability scheduling. Use when changing packages/core/src/scheduled-task.ts or scheduled-task modules, durable schedule semantics, or daemon wake behavior.
---

# Scheduled task maintenance

## Ownership map

| Surface | Owner | Boundary |
| --- | --- | --- |
| Task service and daemon | `packages/core/src/scheduled-task.ts` | CRUD, tick, wake and dispatch coordination. |
| Timing decisions | `scheduled-task/model.ts` | Slot planning and task transitions. |
| Durable records | `scheduled-task/shared.ts`, `sql.ts` | Store operations and task/run rows. |
| Capability schedules | `scheduled-task/capability.ts` | Owner-scoped capability operations and session inputs. |
| Port | `scheduled-task/port.ts` | Service-facing contract; check before changing callers. |

The durable schedule is distinct from a daemon wake: writes signal that work may have changed, while tick claims and serves due slots. `untilDue` waits for a due slot, stale running claim, or write; with no scheduled/running work it waits for a write. A wake is not a device claim or a guarantee that a particular device executes the task. Capability scheduling is explicitly separate from the legacy directory-scoped methods.

The service’s `list`, `create`, `update`, and `remove` take a directory; manual `run` and `tick` have their own service semantics. Do not infer readonly access, authorization, or route exposure from this internal interface: trace the actual caller/handler and its auth boundary before documenting or changing it.

## Safe changes

- Preserve the separation between timing/model decisions, persisted claims, and daemon wake coordination.
- For dispatch changes, trace task write → wake → tick/claim → session input; do not conflate durable state with an in-memory wake.
- Preserve task owner and capability scope when changing capability CRUD or dispatch; examine `capability.ts` and its model together.
- Keep timing behavior in `model.ts`; account for the named local-time/DST and missed-slot cases in its tests.
- Existing witnesses: `packages/core/test/scheduled-task-model.test.ts`, `scheduled-task-capability-model.test.ts`, and `scheduled-task-capability.test.ts`. These identify relevant tests; none are asserted to have run.
- For Maestro adaptive waiting, retain the existing maintenance guidance at `.orchestra/skills/maestro-maintenance/SKILL.md` paragraphs 71–89; refer there rather than duplicating it.

## Source trail

- `packages/core/src/scheduled-task.ts` — service contract, timing constants, wake queue and dispatch entrypoints.
- `packages/core/src/scheduled-task/model.ts` — pure timing and transitions.
- `packages/core/src/scheduled-task/port.ts`, `shared.ts`, `sql.ts` — API seam and durable store.
- `packages/core/src/scheduled-task/capability.ts` and `capability-model.ts` — capability-specific path.
- `packages/server/src/handlers/` — inspect the actual task handler for route/auth/read-only boundaries; do not assume from Core.
