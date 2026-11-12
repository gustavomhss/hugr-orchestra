# WP-W3 acceptance preparation

Prepared against ca66445207769b748cc57565f557ca56380e6a09. This document is
preparation, not an implementation dispatch or executable acceptance evidence.
The generated Worktrees Client contract exists; W1 validation and W2 HTTP red
and implementation gates remain open. PLAN.md owns WP-W3 and its two tasks,
including their six required fields. Existing FIRST-WAVE-CONTRACT.md is normative.

## Current implementation boundary

The current Worktrees component uses project.list and project.directories through
inventory.ts. It displays registered paths and unread logical cells; it cannot
request a Worktree measurement. It polls registration inventory, uses wall-clock
ages, and has no full-snapshot revision or server-lifetime admission. The current
inventory tests prove that older registration projection only. They cannot prove
the new reading or ordering behavior. The current snapshot.ts updater belongs
to process readings and must remain separate.

W3 will consume generated activity.worktrees and activity.readWorktree. The
authoritative row fields are recordID, projectID, registrationID, directory,
owner, optional attempt and optional logical. There is no project display name
in this wire contract. Initially show projectID in that column; no extra project
query may become an inventory or ownership authority. No Client/Core dependency
or new Protocol endpoint is needed.

## Acceptance seams to freeze before authoring tests

Use a dedicated worktree-reading module and a production request controller,
both called by ActivityWorktrees. A pure test-only projection is insufficient.
The controller must expose its actual Solid store to focused browser-condition
tests and accept a narrow generated Activity Client surface. Tests may decorate
that boundary with deferred request responses; such tests prove admission and
store behavior, not real HTTP or component mounting. Actual HTTP composition is
covered by W2, and isolated rendered inspection remains a separate W3 gate.

The lead's unavailable worktree-reading.ts anchor now freezes these signatures:

```ts
make(input: {
  api: Pick<ReturnType<typeof Orchestra.make>["activity"], "worktrees" | "readWorktree">
  now?: () => number
  report?: (error: unknown) => void
}): Controller
```

Controller exposes readonly state plus refresh(): Promise<void>,
read(recordID: string): Promise<void>, tick(): void and dispose(): void.
State holds snapshot (canonical WorktreeSnapshot or undefined), receivedAt
(monotonic number or undefined), now, inventory status and reads keyed by recordID.
Each status has busy and failed booleans. These are actual reactive Solid store
fields in the eventual implementation, not independent copies for tests.
The unavailable anchor throws explicitly and is not imported by the component.
No functional UI implementation is present. Worker tests must use this API;
no agent may independently redesign it. Required observable operations are
inventory refresh, read by opaque row ID, context retirement/disposal, and
monotonic age ticking. A request owns its
AbortSignal. No manual read is emitted by constructing the controller, rendering,
refreshing, filtering, selecting a session, changing locale or ticking ages.
Construction is side-effect free; the component explicitly calls refresh on
mount. Duplicate pending refreshes or reads of the same row coalesce; different
rows may proceed concurrently. Reading an ID absent from the accepted snapshot
does not issue an HTTP request. While a replacement handshake is pending, rows
are hidden and old-ID actions cannot issue requests. now defaults to
performance.now and report defaults to console.error with an Activity context.
Refresh/read promises settle after their owned operation's status is updated;
disposal suppresses subsequent store updates and reporting, including ignored
AbortSignals from a deferred transport. tick updates monotonic now only.

The component owns server/category context lifetime. Capture the SDK value that
made a request; a later sdk() value must never redirect that request to a different
server after ready resolves. Retire the old controller when that SDK/server
context changes, and on category unmount. Abort and dispose all owned requests
and timers. Server address text alone is insufficient context identity.

## Snapshot admission and request status

Decode incoming data with the canonical WorktreeSnapshot schema before touching
the store. Missing or invalid revision data is a protocol failure. Compare valid
canonical decimal strings exactly, using BigInt or length plus lexical ordering;
never Number. Initial revision zero is valid. Within the established instance,
only a greater revision replaces readings, membership and age anchors. Equal or
lower snapshots are reading no-ops even if their payloads disagree.

A current response naming another instance cannot establish that instance.
Retire the context, abort outstanding requests and issue exactly one inventory
handshake in a fresh context. Only that handshake establishes the replacement.
Old-context successes, errors and mismatches cannot populate it or trigger more
handshakes. A failed handshake remains an explicit failure, not an empty server;
the controller must offer a deliberate inventory retry. Hide the retired
snapshot during this handshake and show pending/unavailable inventory, never
a successful empty count. This is a lifetime change, distinct from an ordinary
same-instance failed refresh, which retains its readings.

Track request sequence/status separately for inventory and each recordID action.
A response may settle its own current operation without admitting an equal/older
snapshot. A superseded completion cannot clear a newer busy/error state. Success
on row B cannot clear row A's failed action. A current failure preserves readings,
records, logical timestamps and age anchors, exposes an inline error and reports
through console.error. Tests should use a passed reporting boundary rather than
replace global console; production defaults to console.error.

An accepted full snapshot has one monotonic receivedAt anchor. Compute ages with
readingAge using server readAt/sample timestamps and local monotonic elapsed
time. Lower/equal snapshots and failures cannot reset that anchor. Partial
attempts keep the old complete logical value/time while their own attempt age
and gaps are independently visible. A new instance replaces the whole snapshot,
including optional fields, and cannot retain retired row errors or busy state.

## Named executable oracle groups

Before dispatch, each proposed case below must name the actual production export
it calls and be mapped in acceptance-map.tsv. Exact filenames and hosted filters
are not yet frozen.

- W09 first: construction/initial inventory emits GET only; manual row action
  passes exactly recordID and its owned signal to the generated read method.
- W09 ordering: hold unread GET, admit newer POST, release older GET; assert the
  whole snapshot, membership, logical time, attempt and age anchor remain newer.
  Repeat with a late superseded GET failure and assert no current error/report.
- W09 concurrency: complete different-row full POST snapshots out of order;
  assert both cumulative results survive. Equal revision is a no-op. Use revisions
  around 9/10 and 9007199254740992/9007199254740993 to reject lexical and numeric
  precision mistakes.
- W09 context: dispose while requests are held, release success and failure,
  assert no update/report/new request. Simulate server replacement and instance
  mismatch; one fresh handshake establishes the new lifetime, clears optional
  readings and ignores every retired response.
- W10 reading: unread stays explicit; complete zero is a measured zero; partial
  without prior complete is unread; partial after complete retains logical bytes
  and original time. Display the logical reading's named source alongside its
  age, and show last attempt details and gaps separately.
- W10 age/protocol: offset server clock, advance local monotonic time, then send
  equal/older snapshots and failures. Logical and attempt ages keep increasing.
  Reject missing/noncanonical revisions without publishing an empty inventory.
- W11 identity/filter: two same-path registrations in different projects remain
  separate opaque rows; filter by full directory/projectID without mutating row
  identity or facts. Distinguish filter miss, successful empty and failed unread.
  Selection/filter/sort/category changes never assign owner.
- W12 operation errors: fail A while B succeeds, retain A's inline failure; retry
  A and prove an older failure cannot override the retry. Verify current error
  reporting without replacing globalThis or console.
- W12 translation: actual EN/BR translator substitutes bytes, age, entry count,
  gap count and row action label without braces. English tab names stay exact;
  pt-BR unique remains "não colapsei" and proof remains unproved.

## Separate isolated rendered gate

After W2 green and W3 implementation, start only owned preview processes with
owned fixture state; preserve the owner's installed app/server and database.
Record process ownership and close only those preview processes afterward.
Use actual authenticated HTTP routes and generated Client, not manufactured
network responses, for these observations:

- EN and BR: initial unread registered rows; explicit row read; real complete
  value and visible named source; real partial retry preserving the earlier
  value/time/source and showing gaps with separate logical/attempt ages.
- Inspect network behavior: mounting/refresh/filter/locale changes issue no
  measurement POST. Only the chosen row's action requests its opaque ID.
- Keyboard: reach refresh, filter and every row read button; activate via keyboard;
  expose busy/error status. Confirm tab keyboard navigation and exact English names.
- Narrow viewport: all logical/unique/proof/age columns remain accessible through
  horizontal scrolling, with full paths available and readable action labels.
- Failed current read/inventory: visible inline error plus console.error, retained
  data and a usable retry. Confirm category/server change retires outstanding work.

These observations are not packaged-Electron or installed-app acceptance. Store
tests are not DOM tests. A failed/unperformed rendered observation leaves W3 open.

## Preparation task contract

- **Axioms:** canonical Server snapshots own facts; tests call production admission
  and request logic; rendering evidence is independent of controller unit proof.
- **DoD:** freeze exact seams including the handshake visibility rule, author
  bounded named tests, receive two clean independent coverage sweeps and separate
  cold quality approval, then capture hosted App red before implementation.
- **Completeness criteria:** every W09–W12 group above maps to named executable
  cases or explicit rendered steps; six required fields remain on every WP/task.
- **Invariants:** no local tests, speculative green evidence, automatic walks,
  fabricated owner, owner runtime restart or edits to generated Client files.
- **Success criteria:** failures identify absent UI behavior; subsequent green
  evidence and rendered artifacts refer to exact delivered source scope.
- **Quality standards:** bounded barriers with cleanup, no arbitrary success sleeps,
  no copied admission algorithm in tests, actual Solid store replacement and
  monotonic clocks, disjoint worker files and lead-owned page/localization seams.
