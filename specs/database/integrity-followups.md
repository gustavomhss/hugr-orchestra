# Database integrity follow-ups

Status: deferred. Source: round-2 audit, section G (2026-10-17). Indexes from G6 landed in migration
`20261018031800_session_list_indexes`; G4, G7 and G8 need no action.

No foreign key below is added now. SQLite cannot add a foreign key to an existing table; it needs a full
table rebuild (`CREATE TABLE new … ; INSERT … SELECT ; DROP ; RENAME`), and with `PRAGMA foreign_keys=ON`
(`packages/core/src/database/database.ts`) any orphan row already present in a user database makes the
rebuild fail at launch. Every rebuild below therefore starts with an orphan cleanup in the same migration.

## G6. Indexes (done)

Each index matches a query that exists in the code:

| Index | Query |
| --- | --- |
| `session_project_time_updated_idx (project_id, time_updated)` | V1 `Session.list` (`listByProject`, `packages/orchestra/src/session/session.ts`): `project_id = ? … ORDER BY time_updated DESC LIMIT n` |
| `session_time_archived_time_updated_id_idx (time_archived, time_updated, id)` | V1 `Session.listGlobal`: `time_archived IS NULL … ORDER BY time_updated DESC, id DESC LIMIT n` |
| `session_project_time_archived_time_created_id_idx (project_id, time_archived, time_created, id)` | V2 `SessionArchive.list` (`packages/core/src/session/archive.ts`) by project: `project_id = ? AND time_archived IS NULL ORDER BY time_created, id` |

The audit proposed other indexes. None was added, for these reasons:

- V1 lists sort by `time_updated`, not `time_created`.
- No query filters on `time_compacting`.
- No query orders parts by `time_created`. Part reads go through `message_id` (ordered by `id`) and are
  covered by `part_message_id_id_idx`.
- The workspace-scoped variants only narrow a project list that the indexes above already cover.

## G1. `session.workspace_id` and `session.parent_id`

Schema: `packages/core/src/session/sql.ts`, `SessionTable`. Both columns are nullable and unreferenced.

Why not a plain FK: Session rows are projections. `sessionRow` in `packages/core/src/session/projector.ts`
writes `workspaceID` and `parentID` verbatim from the event payload, including during replay and workspace
sync. An immediate FK would reject a child whose parent has not been projected yet, or a session whose
workspace row lives on another machine. Any FK here has to be `DEFERRABLE INITIALLY DEFERRED` at minimum,
and replay order has to be proven parent-first.

Orphan risk today:

- `parent_id`: a child survives its parent if the parent is deleted by a path that does not recurse.
  The V1 `SessionV1.Event.Deleted` projection deletes exactly one row.
- `workspace_id`: a session keeps a workspace ID after that workspace row is deleted by any path other than
  `Workspace.remove`.

App-layer guards that exist:

- `Session.remove` in `packages/orchestra/src/session/session.ts` loads `children(sessionID)` and removes
  each child before the parent.
- `Workspace.remove` in `packages/orchestra/src/control-plane/workspace.ts` removes every session with that
  `workspace_id` (roots first, children through the recursion above) before deleting the `workspace` row.
- `V2Session.create` in `packages/core/src/session.ts` loads `input.parentID` before inserting, so a V2
  create cannot name a missing parent. The V1 `Session.create` path does not check.

Rebuild plan:

1. `UPDATE session SET parent_id = NULL WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM session)`
   (or delete those children; decide whether an orphaned child stays visible as a root).
2. `UPDATE session SET workspace_id = NULL WHERE workspace_id IS NOT NULL AND workspace_id NOT IN (SELECT id FROM workspace)`.
3. Rebuild `session` with `workspace_id REFERENCES workspace(id) ON DELETE CASCADE` and
   `parent_id REFERENCES session(id) ON DELETE CASCADE`, both `DEFERRABLE INITIALLY DEFERRED`; recreate all
   `session_*` indexes. `message`, `todo`, `session_message`, `session_input`, `session_context_epoch`
   and others reference `session(id)`, so the rebuild runs with `PRAGMA foreign_keys=OFF`, ends with
   `PRAGMA foreign_key_check`, and fails the migration on any row it reports.
4. Precondition: a test that replays a child-before-parent event stream and a remote-workspace sync.

## G2. `part.session_id` (denormalized)

Schema: `PartTable` in `packages/core/src/session/sql.ts`. Only `message_id` references `message(id)`
(`ON DELETE CASCADE`); `message.session_id` references `session(id)` with cascade.

Orphan risk: none from deletes. A part is removed through the `message` cascade when its session goes, so
it cannot outlive the session. The real risk is drift: `part.session_id` disagreeing with
`message.session_id`. The `PartUpdated` projection in `packages/core/src/session/projector.ts` inserts
`event.data.part.sessionID` without comparing it to the owning message; `onConflictDoUpdate` updates only
`data`, so `session_id` is frozen at first insert.

App-layer guards that exist:

- V1 prompt admission (`packages/core/src/v1/prompt-admission.ts`) joins `MessageTable` and reads
  `messageSession` for the parts it removes.
- Readers that take a session scope filter on both `session_id` and `message_id` (`Session.getPart` in
  `packages/orchestra/src/session/session.ts`; `MessageRemoved` and `PartRemoved` projections), so a
  drifted part is invisible to them rather than misattributed.

Plan: an FK on `session_id` alone does not stop drift. The fix is a composite reference
`(message_id, session_id) REFERENCES message(id, session_id)`, which needs a unique index on
`message(id, session_id)` first. Cleanup before the rebuild:
`DELETE FROM part WHERE session_id <> (SELECT session_id FROM message WHERE message.id = part.message_id)`.
A cheaper alternative with no rebuild: reject the mismatch in the `PartUpdated` projection.

## G3. `scheduled_task_run.session_id` and `scheduled_task_run.message_id`

Schema: `ScheduledTaskRunTable` in `packages/core/src/scheduled-task/sql.ts`. `task_id` references
`scheduled_task(id)` with cascade; `session_id` and `message_id` do not reference anything.

These columns must not get an immediate FK. `ScheduledTask.claim` in `packages/core/src/scheduled-task.ts`
inserts the run with a pre-allocated `session_id` and `message_id` before `dispatch` creates the Session and
admits the prompt. A crash in between leaves a `running` claim that a later process takes over and retries
with the same IDs. A claim that never reaches admission settles as `void` and never gets a Session. Runs
imported from device storage have no `message_id`. `message_id` is a Session input ID
(`SessionMessage.ID`), not a `message` row.

Orphan risk: by design. A run's `session_id` points to nothing for void or not-yet-dispatched claims, and
to a deleted Session after the Session is removed. Run history is meant to survive that, like
`project_checkpoint` (G4).

App-layer guard: readers treat the run as history. `toRun` returns the stored `session_id` without joining
`session`, so a dangling ID shows up as a link to a missing Session, not as an error.

Plan: keep these columns as plain references. If cleanup on Session delete is wanted, add it to the
Session delete path (`DELETE FROM scheduled_task_run WHERE session_id = ? AND state <> 'running'`) and do not
add an FK. If an FK is required, it has to be `DEFERRABLE` and `ON DELETE SET NULL`, `session_id` has to
become nullable, and the claim has to stop writing it before the Session exists.

## G5. JSON column nullability (report only)

Columns: `session.summary_diffs`, `metadata`, `revert`, `permission` and `model` use `text({ mode: "json" })`.
They are nullable with no default.

Drizzle passes a JS `null` through as SQL NULL, so the ORM never writes the text `'null'`. The text `'null'`
appears only through raw SQL writes. On read it parses to `null`, and both `fromRow` mappers
(`packages/orchestra/src/session/session.ts`, `packages/core/src/session/info.ts`) treat it like SQL NULL
(`?? undefined` or a truthiness check). One SQL-side NULL test does exist: the lean-project query in
`packages/orchestra/src/session/lean-project.ts` computes `revert IS NOT NULL`, which would count a raw
`'null'` text as a revert. Nothing in the app writes that text today.

`session.subagent_models` is not ambiguous. It is plain `text()` on purpose: the schema comment and
`fromStorage` in `packages/core/src/session/subagent-models.ts` treat SQL NULL alone as "inherit" and fail
closed on JSON `null` or malformed text.

Action, if wanted later: add a `CHECK (col IS NULL OR json_type(col) <> 'null')` during the next `session`
rebuild (G1), so the constraint lands with the same rebuild.
