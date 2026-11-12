# WP-W2 HTTP acceptance anchor

Current checkpoint: W1 is complete (43279701564). W2's actual hosted red is
verified on Linux and Windows (43282200736): W05–W08 fail for explicit unavailable
HTTP behavior; all three older HTTP cases pass and Omni control passes with
one real spawn per OS, zero delegated. Named outcomes and exact five-package
trees are in worktree-http-baseline.json. W2-A is complete; W2-B may implement
only the frozen source/handler/composition seams below. Subsequent pending-request
wording is historical preparation, superseded by this checkpoint and final receipt.

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

## Current hosted request

Acceptance, unavailable anchors and generated Client are committed/pushed
through 5781c6c952. The three-file Server Linux/Windows test:ci request uploaded
its snapshot and is waiting for runner capacity (15 queued runs observed).
It is a distinct package/purpose from the active W1 corrected validation, not
a duplicate. Do not dispatch it again. Log: /tmp/activity-worktree-http-red-ci.log;
exit: /tmp/activity-worktree-http-red-ci.exit. No hosted W2 result exists yet.
Requested trees: Server 8c66263cec04327dcdb44dee11a93ff213337380;
Protocol 896cd83f929f6af133f030d347c2e06fdbb9b9f5;
Client cc7c3fd50fd7cf86c377b257456980917e23db7c;
Core 896ecacedc92ec83d74aa7ec82046ac0c24571cf;
Schema c125baa2144abcb969e3a1440b35413a7ebdf185.
The new W05–W08 cases must fail for the explicit unavailable new behavior while
existing activity HTTP outcomes and declared Omni control remain valid.
A helper exit alone is not proof: inspect named hosted outcomes and exact trees.

## Frozen composition placement for W2-B

ActivityHandler must require the registry Service from its composing layer;
it must not internally provide a fresh default registry and hide the fixture's
actual decorated monitor. In src/routes.ts, provide the registry layer after
providing handlers and before the existing serviceLayer provides Database.
The legacy activity-http.test.ts composition supplies the actual registry layer
and its own in-memory Database; the new fixture already supplies its separately
composed real monitor and forwards all reads unchanged. This preserves server
lifetime isolation and the read/query observability used by acceptance.
The real source must call the void afterRegistryRead hook only after its actual
single-statement SELECT and before returning those rows. The callback receives
no data and cannot replace the authoritative result. These are frozen integration
decisions, not an implementation or a waiver of W2's hosted-red prerequisite.

## Verified HTTP baseline and W2-B release

Run [43282200736](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43282200736)
completed with three passes and four expected failures on each OS (31 expects).
W05, W07, W08 and W06 fail on the explicit 503 unavailable anchors; authentication,
declared-root disk reads, process snapshot and native identity regression pass.
Each declared Omni control passed with one real spawn, zero delegated. This is
red acceptance evidence, not a passing API implementation.

Fetched snapshot 5a9799069735f815ada51892f4d6cd9b717a727e matches the requested
Server/Protocol/Client/Core/Schema trees above. All seven named outcomes per OS
and controls are in worktree-http-baseline.json. W1 has separately passed its
unchanged collector suite. Coverage, cold quality, generator, package typechecks
and guard prerequisites were already approved. No W2 acceptance or anchor was
changed to obtain this baseline.

W2-B is split conflict-free: a source worker owns only src/activity-worktree.ts;
the lead owns handlers/activity.ts, routes.ts and legacy activity-http.test.ts
database/service composition. The source/Monitor/Service contract and placement
above stay frozen. Each source unit must receive independent cold review;
Server typecheck and the unchanged three-file both-OS hosted pack gate integration.
No owner app/server/database operations are included. W2 remains incomplete until
the same named red cases become green without losing the existing passes/control.
