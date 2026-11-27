# First-wave identity and response-order contract

Normative planning decisions for WP-R0/W1/W2/W3. This is not implemented code
or executable evidence. Exact signatures and compilable anchors still precede
implementation dispatch. These rules close the two adversarial plan findings.

## Persisted registration incarnation

1. WP-R0 adds a nonempty, unique persisted `registrationID` to each
   project_directory row. Generate it with crypto.randomUUID in the producer's
   transaction on every insertion, including a same-path reinsertion. An actual
   strategy, project or directory identity change also replaces it in the same
   transaction. Ignore/no-op preserves it; rollback exposes no replacement.
2. A migration backfills distinct IDs for existing rows without changing project,
   directory, type, strategy or time_created. Fresh and upgraded schemas enforce
   the same nonnull/unique constraints. Reader calls and restart never allocate
   a new token. Time, path, rowid and observer-assigned UUIDs cannot substitute.
3. Audit all current inserts/updates/deletes and transaction callers. The known
   producer is Core ProjectDirectories.create/remove; any additional writer
   found in the final audit must join this transaction contract before dispatch.
   New direct writes that bypass token renewal are prohibited. This is producer
   maintenance, not permission for the monitor to mutate registrations.
4. Add internal `listRegistrations(projectID)` and
   `getRegistration({ projectID, directory })` reads returning registrationID,
   directory and strategy. Preserve existing list/get and public project API
   output. The new methods query persistence, not a synthetic observer cache.
5. Reading identity is `(projectID, directory, registrationID)` within the
   monitor instance. Preserve measurements only for that exact tuple. If a
   registration disappears or its token changes, retire the row/opaque reading
   ID. A recreated row starts unread. A → absent → A and strategy ABA must be
   detected even when no observer ran during either intervening state.
6. Manual read validates this persisted tuple before walking and again before
   publishing its result. A changed/missing token refuses the old result and
   reconciles the current inventory; never attach it to the new incarnation.
   GET also reconciles authoritative registrations before returning readings.
   This remains a metadata reading window, not an atomic filesystem snapshot,
   action authorization, file identity or the durable R12 action generation.

## Canonical snapshots and ordering

1. The server monitor assigns one process-local `instanceID` and one exact
   monotonic `snapshotRevision` for its whole worktree snapshot. Encode the
   revision as a canonical nonnegative decimal string; compare without Number
   conversion. This revision is separate from registrationID and R12 generation.
2. Commit registry reconciliation and completed/partial measurement attempts
   through one state owner. Every visible change advances snapshotRevision;
   snapshot-only reads do not. Allocate the revision at commit and synchronously
   copy all rows/source/readAt/revision into an immutable response before any
   further await. A full snapshot at revision N includes every change through N.
3. Registry queries/reconciliation run in a serialized lane. A manual read's
   pre/post validation performs its own authoritative query in that lane;
   neither may reuse an inventory query admitted before that validation. An
   older query cannot commit after a newer reconciliation and revert tokens.
   Physical walks may overlap for different rows; their state publication is
   serialized. An old walk cannot publish after its incarnation was retired.
4. Each client request captures its active server/category context token. Abort
   and retire that token on server/category changes. Within the active context
   and instance, accept only a strictly greater snapshotRevision; lower/equal
   snapshots are no-ops for readings, row membership and timestamp anchors.
   Initial valid revision zero is accepted. If a current-context response names
   a different server instance, do not adopt that payload: retire the context,
   abort its requests and perform one new inventory handshake tagged with the new
   context. Only that handshake establishes the replacement instance; responses
   from retired contexts cannot trigger another replacement or populate it.
5. Example oracle: hold GET at revision 0/unread; complete POST at revision 1;
   deliver GET afterward. Revision 1's logical bytes, timestamp and attempt
   remain. For concurrent different-row POSTs, deliver revision 2 before 1;
   retain both results from full snapshot 2. Include equal revisions and values
   above Number.MAX_SAFE_INTEGER to reject lexical/rounded comparisons.
6. Track error/request status per operation and target as well as context. A
   superseded request cannot overwrite the newer outcome for that scope. A
   current failed action still reports its inline error and console.error,
   retaining readings. Success on row B must not hide a current failure on row A.
7. Revision equality never resets sample age. An immutable reading keeps its
   source sampledAt/readAt anchor plus client monotonic elapsed time; partial
   attempts keep their own age. Invalid/missing revision data is a protocol
   error, not an empty or unread successful snapshot.

## Pre-dispatch evidence gates

- G01–G04 specify producer persistence/migration behavior; W03/W04/W06 specify
  unobserved replacement and delayed-read rejection; W09/W10/W12 specify client
  ordering and errors. Each remains pending executable mapping and hosted proof.
- The whole first wave remains not ready for implementation dispatch until
  exact anchors, generated artifacts/stubs, cold suite review and hosted failing
  baselines exist. WP-R0 integrates before the dependent read-only WPs.
- No production schema, database, API or running application was changed by
  writing this document. Migration SQL/backfill and generated-schema parity must
  be reviewed and tested when R0 is implemented, before any installation.
