# WP-W2 HTTP preparation

Preparation during the W1 hosted baseline's runner-capacity wait. This document
records the lead's integration decisions for review; it is not a frozen code
anchor, dispatch authorization, runtime implementation or test evidence.
Existing Protocol, Server and Client code is unchanged.

## Scope and quality contract

Parent WP/tasks: WP-W2, W2-A and W2-B in PLAN.md. Their six fields continue to
apply. This bounded preparation task also records all six explicitly:

- **Axioms:** persisted registrations establish read roots, never ownership or action authority; actual authenticated HTTP must exercise the production collector.
- **DoD:** identify existing composition points, propose exact routes and errors, specify a consistent registry adapter and real test harness, then independently review before changing code anchors.
- **Completeness criteria:** inventory/manual read, authentication, invalid/retired IDs, capacity, registry failures, optional keys, complete/partial values and generation obligations each have an assigned integration point.
- **Invariants:** no runtime, public API or generated changes in this preparation; no owner DB/app operations, local tests, process query or filesystem mutation outside owned future fixtures.
- **Success criteria:** the next acceptance packet needs no architecture invention and can use real SQLite, the real walker and the actual HTTP handler.
- **Quality standards:** preserve dependency direction, named Effect services and existing auth; keep bounded review units and explicit pending proof. Never treat this document as executable evidence.

## Proposed wire boundary

| Operation             | Route                                       | Successful payload | Explicit failures                                                                                                                        |
| --------------------- | ------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| activity.worktrees    | GET /api/activity/worktrees                 | WorktreeSnapshot   | ServiceUnavailableError (503) for registry/collection failure                                                                            |
| activity.readWorktree | POST /api/activity/worktrees/:recordID/read | WorktreeSnapshot   | InvalidRequestError (400) for unknown/retired ID; ConflictError (409) for capacity; ServiceUnavailableError (503) for collection failure |

Both routes retain Authorization and SchemaErrorMiddleware. Params use a
nonempty opaque recordID; neither request has a filesystem-path payload.
GET reconciles metadata through Monitor.inventory and does no disk walk.
POST calls Monitor.read; undefined refuses the retired target, even when the
same path now has a new registration. Capacity is an explicit retryable error,
never an empty successful snapshot. Responses use the W1 Schema directly,
including exact decimal revisions and omission-based optional readings.

Unknown IDs must be refused before walking. Extra body/query fields cannot
widen the selected registered target. Source errors must stay HTTP failures;
they cannot be converted into empty successful inventories or invented zeros.
Error payloads must not expose database internals or filesystem error stacks.

## Consistent production source and lifetime

The adapter needs a single authoritative SQLite SELECT joining ProjectTable
with ProjectDirectoryTable, filtering project.vcs = git and directory.strategy
= git_worktree. Select only projectID, directory, registrationID and strategy;
registrationID comes from registration_id. No allocation or registration writes.
A single statement avoids the mixed registry view possible when project IDs
are loaded first and each project's registrations are queried afterward.

Use the existing Database.Service; bind it before invoking its methods. This
source represents the same persisted registry owned by ProjectDirectories.
The R0 internal methods remain compatible; the adapter must not manufacture a
token from path, time, rowid or observer state. W1 owns query serialization and
fresh pre/post checks, so the adapter must not cache or join separate calls.

Create one monitor for each composed server handler lifetime, using the server's
actual Database service. Do not keep a module-global instance bound to a test or
previous server's database. A narrow Server-internal service/factory may expose
the collector to the handler and future HTTP fixture. Tests may decorate only
the real measurement boundary with counters/barriers; no fabricated readings,
replacement HTTP handler, auth bypass or arbitrary-path test endpoint.

The present ActivityHandler has no DB requirement. The new composition must
provide its DB/collector dependencies in normal Server routes and the existing
activity HTTP regression harness. The other handlers/endpoints stay compatible.
The precise internal service code and write-set addition still need freezing.

## Acceptance packet to prepare next

W05 seeds real git and non-git projects and actual R0 registrations, including
main/root/copy/unregistered paths. Assert exact eligible identities, unread
optional keys, blank owner, no walk from GET and no mutation from invalid paths.
W06 exercises both unauthorized routes, same-row singleflight, invalid/retired
IDs, capacity, fresh pre/post checks and real held walks across remove/reinsert
and strategy ABA. Bound barriers and drain all owned requests on failure.
W07 measures actual nested/hardlink fixtures through authenticated HTTP and the
actual collector. Decode with canonical schemas; assert complete bytes/time,
partial retention, independent rows and unchanged fixture/registration data.
The generated Client must compile with and decode the same payload contract.
W08 temporarily makes the owned registry unavailable and requires explicit 503,
then restores it and proves recovery. Assert no empty-success substitution and
no registration/filesystem/process action. Client retention remains W12.

Use the existing HttpApiBuilder real-handler pattern and test-owned Database
layer. Existing server tests demonstrate Database.layerFromPath(":memory:")
and HttpRouter.toWebHandler with scoped disposal; a real Node HTTP test layer
is also available. Do not touch the owner's installed database or restart any
server. Name focused tests in separate bounded files when adding them to the
existing file would exceed a 400-line review unit.

After actual Protocol/HttpApi edits, run bun run generate from packages/client;
never edit generated directories. Run affected package bun typecheck locally,
scoped test:ci on GitHub only, then independent cold review and guards. W1's
hosted baseline still gates W1 implementation; W2's own reviewed executable
suite and hosted red baseline still gate W2 implementation.

## Independent review

Cold review against the actual schema, routes and HTTP harness returned
APPROVE PREPARATION at baseline c207d9b5d1. The single-statement registry source,
scoped lifetime, errors and real-fixture coverage are feasible. Exact internal
service anchors, final write sets, executable acceptance and hosted red evidence
remain pending. git diff --check passed; no tests or runtime code ran. Relay was
armed but the stop hook is unconfigured; this is manual review evidence.
