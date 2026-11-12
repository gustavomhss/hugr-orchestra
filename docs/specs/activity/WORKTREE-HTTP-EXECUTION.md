# WP-W2 HTTP acceptance anchor

Baseline: 3bf327f497 (W1 scalar metadata correction). This is W2-A acceptance
preparation, not the registry-backed HTTP implementation. W1's corrected hosted
rerun remains pending; it is not a passing W1 claim or W2-B dispatch permission.
PLAN.md retains the six explicit fields for WP-W2 and each W2 task.

## Frozen routes and source seam

Protocol ActivityGroup adds activity.worktrees (GET /api/activity/worktrees,
WorktreeSnapshot or 503) and activity.readWorktree (POST
/api/activity/worktrees/:recordID/read, WorktreeSnapshot or 400/409/503).
Existing authorization/schema middleware still applies. No arbitrary path input
is declared. Both actual handler anchors currently return explicit 503
ServiceUnavailableError, message "Worktree readings are not implemented".
They cannot fabricate an empty inventory or a reading.

Server-internal activity-worktree.ts exports ActivityWorktreeRegistry:
Service implements the frozen Core ActivityWorktree.Monitor interface;
layer(input?: { measure?: typeof ActivityDisk.measure;
afterRegistryRead?: () => Promise<void> }) requires Database.Service.
Its current anchor constructs only unavailable methods. W2-B will replace it
with the reviewed single-statement authoritative registry query and one real
Core monitor per composed service lifetime. Default measurement remains the
actual ActivityDisk engine; the optional boundary lets tests decorate actual
walks with counters/barriers or stricter real budgets. The void afterRegistryRead callback can hold observation after the actual
single-statement SELECT and before reconciliation; it cannot supply or modify
rows. It cannot accept roots from a client request. No alternate production registry or action surface exists.

W06 also holds actual registry reads across an earlier GET and both fresh
pre/post validation, counting real query completions and checking canonical
cache before a new GET can hide regression. W08 now rejects after a real walker
result to verify sanitized collection failure, retained data and retry recovery.

W2-B owns connecting the actual handler to that service, mapping unknown/retired
undefined to 400, ReadCapacityError to 409 and collection/source failures to
sanitized 503. Normal Server composition and legacy activity HTTP tests must
provide the new service using their actual database. Any additional composition
file becomes lead-owned before implementation; no shared-file agent writes.

## Exact expanded ownership

W2-A writes the three focused HTTP fixture/test files, unavailable Protocol and
Server anchors, this execution record, and generator output solely through
packages/client's generate command. W2-B owns real registry/handler/composition
implementation after its own reviewed executable suite and hosted red baseline.
Core/Schema implementation and W1 tests are outside W2 writes.

New Server paths: src/activity-worktree.ts (source/service seam),
test/activity-worktree-fixture.ts, test/activity-worktree-http.test.ts and
test/activity-worktree-races.test.ts. Existing ownership remains Protocol
src/groups/activity.ts, Server src/handlers/activity.ts, actual composition and
legacy HTTP regression wiring, plus generated Client. The test and anchor review
units are separately below 400 changed lines. Generated outputs are reviewed
as their own generator-owned unit, never hand edited.

## Executable acceptance

- W05: actual stored git/non-git projects and R0 registrations; main/root/copy/unregistered rejection, both unauthorized routes, opaque-ID/path refusal, no walk from inventory or invalid IDs, absent attempt/logical, persisted token equality, blank owner and unchanged registry.
- W06: real walker barriers through the actual handler; same-row HTTP requests share one physical walk; four walks occupy capacity and a fifth gets 409; inventory remains available; remove/reinsert and strategy ABA at equal timestamps refuse both joined old reads with 400. Full concurrent response revisions preserve cumulative readings. Fresh prevalidation refuses a now-ineligible row before walking; all four slots can be reused afterward.
- W07: the generated promise Client calls the actual HTTP handler, then canonical Schema decodes the payload. Owned hardlink fixture yields six logical path bytes; real budget and symlink partials retain complete value/time. Missing registered path stays unread despite a body attempting to supply another path. Bytes, registry rows and symlink remain unchanged by reads.
- W08: actual owned registry SQL failure yields sanitized 503 for inventory/manual read, with no empty-success payload or new walk; restoring the table preserves prior reading and row data. A separately composed real handler lifetime over the same database starts with a new instance/record ID and unread data while the first retains its readings.

The fixture reuses actual Core service/SQLite/temp-directory support and serves
ActivityHandler via HttpRouter.toWebHandler with scoped disposal. It does not
replace the handler or bypass auth. Generated Client fetch injection dispatches
to that actual handler, not a fabricated response. The fixture read observer forwards the actual monitor.read call unchanged,
then announces that admission happened; it cannot fabricate results. This keeps
the earlier GET held until POST has actually reached the production collector.
No global mock, arbitrary
root test endpoint or local test suite is used.

Proposed hosted red pack (only after suite/quality reviews and typechecks):
bun run test:ci server test/activity-worktree-http.test.ts
test/activity-worktree-races.test.ts test/activity-http.test.ts --os both.
The four W05–W08 cases should fail for explicit unavailable new behavior; old
activity cases remain the regression floor. Existing native activity HTTP test
retains its expectSpawn declaration and must satisfy Omni positive control.
No W2 red/green evidence exists yet. Independent coverage review must return two
consecutive clean sweeps before implementation; quality review is separate.

## Generation and pending gates

After adding the public Protocol/HttpApi anchors, bun run generate ran from
packages/client and exited 0; no generated file was edited manually. Protocol,
Server and Client typechecks passed. Coverage review found two oracle gaps,
which were closed with the real-query barriers and real-measurement failure
case; two consecutive fresh reviews then returned covers. Independent cold
quality review approved each bounded unit, including explicit persisted-row
presence refinements. Formatting and diff checks passed. Guardrails passed
with 0 gates and the existing reviewed R0 migration-ignore warning. Hosted red
remains pending. No W2-B worker is
released; no owner DB migration or app/server restart occurred. The stop hook
remains unconfigured, so review/Relay evidence is manual only.
