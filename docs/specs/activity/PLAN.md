# Activity monitor — rolling execution plan

Baseline: `d20520c2d04221b77b4fdad6785d65886559e322`, branch
`activity-monitor`, recovered OpenCode worktree. This plan implements the owner's
instruction that **every WP and every task has six explicit quality fields**.
The record format and dispatch rules are in [WORK-PACKAGES.md](WORK-PACKAGES.md).

## Truth at this checkpoint

The committed implementation has focused hosted evidence for registered
worktree inventory, Omni pipe observations/native identity/host CPU, and manual
measurements of three Orchestra disk roots. See [RECOVERY.md](RECOVERY.md) for
exact source/run boundaries. This does not close every product acceptance case.
No entire R1–R20 requirement is marked complete by inference.

The 367 original A cases remain preserved. New S01–S16 cases close gaps found
by independent demand-versus-acceptance criticism. W01–W12 specialize the next
bounded implementation. These are in
[ACCEPTANCE-EXTENSIONS.md](ACCEPTANCE-EXTENSIONS.md). They are **specified, not
executed**. The original acceptance file's historical “red” header is not a
captured failing baseline. Full executable mapping and final evidence remain
required; coverage criticism and structural checks cannot supply runtime proof.

## Whole-product coverage ledger

Rows below are product domains, **not dispatchable WPs or hidden tasks**. The
lead decomposes each into bounded WPs with all six fields before execution;
future action contracts are not speculatively frozen during this read-only wave.
Every original A case is retained in `acceptance-map.json`, with all its R tags
and one primary domain owner. Primary ownership does not drop cross-cutting
obligations. S cases are mapped there too. Product evidence starts unverified
until linked to a concrete test and tested source scope.

| Domain             | Existing evidence / remaining obligation                                                                                                            | Must follow                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| R1 readings        | Host CPU and root logical bytes exist; audit all named values, sources, stale/unread cells, residence/frequency coupling and prohibited attribution | Collector-specific contracts                             |
| R2 provenance      | Pipe spawn captures owner; other object creation paths need immutable recorded provenance and cross-tab consistency                                 | Actual producer integration                              |
| R3 identity        | Native generation-qualified identity exists; control addressing and Windows Job proof remain                                                        | Durable action generation, distinct from native ID       |
| R4 seen/path       | Full recorded-path/observed-process presentation and action rejection remain                                                                        | Explicit observation coverage; no machine scan per frame |
| R5 state/flag      | Current alive/gone/unknown subset; seven states and three evidence-backed flags remain                                                              | Recorded lifecycle facts, not PPID inference             |
| R6 hypothesis      | Two deterministic emissions and footprint/work-history evidence remain; unsupported data stays unread                                               | Named footprint source and work completion events        |
| R7 use proof       | cwd, git -C, open files/handles and live-PID locks require actual per-object methods and fail-closed composition                                    | Platform adapters; unsupported remains unproved          |
| R8 closed copies   | Copy/store proof for only node_modules and .turbo remains                                                                                           | R7, identity; no gitignore heuristic                     |
| R9 claimants/move  | Live recorded references, shared classification, same-volume move and reference update remain                                                       | R7, durable ledger and human confirmation                |
| R10 worktree       | Inventory exists; manual disk readings are the next wave; child-only reclaim later preserves git registration                                       | Registered-path resolution; later R7–R9 effects          |
| R11 unique         | Current UI says não colapsei; audit every remaining category and aggregate                                                                          | No APFS clone implementation demanded                    |
| R12 IN/OUT         | Durable generation, requests, six states, arm/revalidate/apply/postconditions and shared counters remain                                            | R7–R11, R13; no agent or aggregate action                |
| R13 confirmation   | Person-only authority bound to object, generation and verb across every route remains                                                               | Trusted caller boundary and frozen action contracts      |
| R14 stop           | Supervisor-addressed single-tree/query preview, exclusions and fresh validation remain                                                              | R3, R5, R12–R13; actual supervisor capability            |
| R15 suspend/resume | Durable pre-effect marks, exact stopped membership, partial outcomes and restart-safe resume remain                                                 | R3, R12–R13; no STOP before durable recovery capability  |
| R16 quarantine     | Same-volume rename ledger, original path, occupied/restore/empty and second readings remain                                                         | R7–R13; move ledger stays separate                       |
| R17 attest/cost    | Three distinct per-object human statements and all exclusion rules remain                                                                           | R12–R13; no inference of squash-merge                    |
| R18 ceiling        | Surface recorded value/threshold/time and honest resident-sum label; do not modify ceiling policy                                                   | Existing Omni event source; separate from footprint      |
| R19 global view    | Chapter/tabs and read-only views exist; Docker, IN/OUT, Quarantine and cross-category ledger/effect rules remain                                    | Collector and durable-ledger contracts                   |
| R20 sampling       | Cached/manual bounded reads exist; apply age/gap/no-global-walk rules to every new producer                                                         | Per-collector limits and instance replacement            |

Docker inventory and external-cache roots are separate future read-only fronts.
Docker has no effects in this product. External caches require explicit root
declarations, never arbitrary client paths or expansion to all of /tmp. IN/OUT
and Quarantine depend on actual durable ledgers; they cannot be completed by
inventing empty collectors. Footprint/source research, R5/R6 and R18 remain
visible obligations, even though the earlier five-block summary omitted them.

## Dispatch decision

**HYBRID, preparation only at this checkpoint.** Three first-wave WPs below
are specified but not ready for implementation-agent dispatch. Missing hosted
red baseline, exact anchor code, compilable dependency stubs and final write-set
approval are named readiness gates, not waivers or completed work.

- Lead alone owns shared Schema, Protocol, Server handlers, Client generation,
  page integration and localization edits. Workers must not touch them together.
- WP-W1 Core implementation and independent Docker acceptance/source preparation
  may overlap after separate complete packets. Docker implementation is not
  dispatched until its own WPs, contracts and acceptance suite exist.
- WP-W2 depends on WP-W1's frozen wire/collector contract; WP-W3 depends on the
  frozen API and generated Client. Once compilable stubs exist, disjoint work
  can overlap; integration remains W1 → W2 → W3.
- First-wave writers: one per owned path, maximum three implementation agents;
  reviewers are independent, and all agent contexts inherit the session model.
  Packet ceiling 40k tokens, total working budget 80k per task; re-slice rather
  than dump repository history. Do not override models without authorization.
- Every review unit must stay within 400 changed lines. If a WP exceeds that,
  split it before dispatch and remap every acceptance ID to one child owner.
- Relay arms can be recorded, but the missing SubagentStop hook means there is
  no mechanical stop enforcement. Lead inspection and hosted evidence remain
  manual gates; no enforcement claim is made.

## WP-W1 — registered-worktree reading state

Status: specified; not dispatched. Owner: lead until an exact packet is frozen.
Dependency: existing ActivityDisk.measure and DiskAttempt semantics.
Writes: proposed `packages/core/src/activity-worktree.ts`, its focused Core
test, package export, and lead-owned additions to Schema's activity-monitor.
No writes to project registration, spawn, Session/timeline or existing UI.
Acceptance owner: W01–W04. No cleanup, ownership inference or use proof.

- **Axioms:** registration is evidence of an allowed read root, never ownership or idleness (R2/R10); logical path bytes are not unique bytes (R11).
- **DoD:** acceptance-first Core suite, bounded registry-reading state, immutable snapshots, schema omission/identifier checks, hosted Core Linux/Windows proof, affected package typechecks, independent review and exact evidence links.
- **Completeness criteria:** W01–W04 cover unread, complete, partial, singleflight, independent rows, removal/re-addition, duplicate paths across projects, late responses and lifetime reset. Existing disk gap/platform cases stay covered without copying their implementation into tests.
- **Invariants:** snapshots never walk; only registered-row explicit reads measure; old complete bytes/time survive partial attempts; retired rows cannot be resurrected; no mutation, unique total, action capability or invented owner.
- **Success criteria:** each W01–W04 has a named real-fixture test and hosted result tied to the final Core/Schema source. Source availability or compilation alone cannot close it.
- **Quality standards:** reuse ActivityDisk.measure; retain 10,000-entry/depth-64/cooperative-two-second limits and 32 gap details; Schema remains browser-safe; public optional properties omit undefined; no new process spawn or unbounded result cache.

### Task W1-A — acceptance and red evidence

Owner: lead; state: pending; writes: proposed `packages/core/test/activity-worktree.test.ts`.
Depends on exact exported signatures being frozen. Owns W01–W04 test authoring;
W1-B owns making those implementation checks pass. This is not duplicate product ownership.

- **Axioms:** metadata reads require actual filesystem fixtures; pre-existing disk unit passes cannot prove a new registry cache (R1/R20).
- **DoD:** author named W01–W04 cases before implementation; cold critic approves coverage twice; run hosted `bun run test:ci core test/activity-worktree.test.ts --os both` and retain the expected failing snapshot/result.
- **Completeness criteria:** exercise all W01–W04 transitions, including removal during an actual in-flight read and project/path reuse; use no local test suite or globalThis mock.
- **Invariants:** tests assert public behavior, never duplicate the production walker; fixture cleanup touches only owned paths; unsupported platform cases remain explicit.
- **Success criteria:** baseline fails for the missing target behavior, not an unrelated environment/configuration fault; logs name the test/snapshot and final rerun will use the same oracles.
- **Quality standards:** real temporary fixtures, deterministic barriers where needed, exact optional-key assertions, no arbitrary sleeps, and tests scoped to this package. Baseline failing state is evidence, not a failing gate to bypass.

### Task W1-B — collector and contract implementation

Owner: unassigned implementation seat; state: awaits W1-A and frozen anchor.
Writes: proposed Core module/export; Schema additions integrated only by lead.

- **Axioms:** measurement identity addresses a read-only registry row; it does not grant action authority (R3/R12). No recorded owner means empty owner (R2).
- **DoD:** implement only the agreed collector/state contract, make W01–W04 pass on hosted Linux/Windows, run `bun typecheck` inside Core and Schema, obtain cold review, update guide/receipts, and pass completion guardrails.
- **Completeness criteria:** all W01–W04 pass; unchanged registrations retain data, changed/removed ones cannot borrow or overwrite it; memory retention is bounded by active registrations plus in-flight state.
- **Invariants:** no FS work from cached snapshot; no process query, registry write, symlink traversal policy expansion or stale-result resurrection; partial never overwrites complete logical reading.
- **Success criteria:** final hosted results plus tested-scope diff establish the implemented transition behavior; all outstanding limitations remain explicit in the contract and UI-facing data.
- **Quality standards:** existing Core patterns, stable domain-qualified schema IDs, self-export module style, no any/import aliases, proper package export, formatting and `bun run check:guards --base origin/dev`.

## WP-W2 — authenticated registered-root API

Status: specified; not dispatched. Owner: lead integration.
Depends on W1 frozen Schema and collector anchor. Writes: activity Protocol,
Server handler, focused HTTP test, generated Client through generator only.
Acceptance owner: W05–W08. No arbitrary path input or project mutation.

- **Axioms:** ProjectDirectories entries with strategy git_worktree are the only inventory source; authenticated clients select opaque reading IDs, never filesystem paths (R10/R20).
- **DoD:** acceptance-first actual HTTP tests, cached inventory/manual read endpoints, Client generation, Core/Protocol/Server/Client typechecks, hosted Server proof, cold review and source-linked receipts.
- **Completeness criteria:** W05–W08 cover auth, invalid IDs, missing registration, strategy change, real fixture bytes, optional schema keys and explicit registry failures. W12 owns client retention after that failure.
- **Invariants:** GET may read registry metadata but starts no disk walk; manual read re-resolves registration; client path cannot widen scope; errors cannot become empty success; no effects or fabricated provenance.
- **Success criteria:** real authenticated HTTP traverses registry → collector → schema → generated Client shape, while each rejected request leaves fixtures/registration unchanged.
- **Quality standards:** Schema → Core/Protocol → Server direction, named Effect services, stable endpoint schemas, generation from packages/client, no hand-edited generated code, bounded concurrent work inherited from W1.

### Task W2-A — HTTP acceptance and red evidence

Owner: lead; state: pending frozen API anchor. Writes: focused activity HTTP tests.

- **Axioms:** codec/auth behavior must be exercised through the real HTTP implementation; a mocked handler cannot prove it (R1/R19).
- **DoD:** write named W05–W08 cases, review coverage, capture hosted `bun run test:ci server test/activity-http.test.ts` red baseline and preserve tested snapshot/expected failure.
- **Completeness criteria:** both endpoints unauthenticated; malformed/removed IDs; strategy swap; registry error; complete and partial measurement; unchanged fixture/registry; decoding omitted optional data.
- **Invariants:** fixture roots are server-resolved; tests do not accidentally target user directories or assert a machine-wide empty inventory; no owner title inferred from path.
- **Success criteria:** failures identify missing new behavior, and the unchanged acceptance tests later pass against the complete implementation. If the pack spawns through Omni, the required positive control must pass.
- **Quality standards:** actual temporary database/registry and owned filesystem fixtures, package runner on hosted CI only, no authentication bypass or direct arbitrary-path test-only API.

### Task W2-B — routes, registry integration and generation

Owner: lead integration; state: awaits W2-A and W1 contract.
Writes: Protocol activity group, Server activity handler, generated Client outputs.

- **Axioms:** registry failure is failure, not an empty successful response; a reading ID has no cleanup or process-control authority (R12/R20).
- **DoD:** implement the frozen routes/registration recheck, run `bun run generate` in packages/client, affected package `bun typecheck`, hosted W05–W08 green, cold diff review and guardrails.
- **Completeness criteria:** all W05–W08 pass, exact registry-filter behavior survives refresh/removal, generated Client uses canonical schemas, old endpoints remain compatible.
- **Invariants:** no arbitrary client path, no automatic walk, no registry creation/deletion, no owner derivation or new effects; dependent drafts cannot alter the frozen API independently.
- **Success criteria:** authenticated real-fixture result matches Core readings and generated schema decoding; unknown IDs refuse; package checks and exact-scope hosted evidence pass.
- **Quality standards:** generate rather than edit, bind named services before methods, limit shared-file writes to the lead, and check formatting/diff/guards. Do not restart the installed app/server.

## WP-W3 — Worktrees manual-reading interface

Status: specified; not dispatched. Owner: unassigned UI seat after anchor freeze.
Depends on W2 generated API and frozen W1 reading shape. Writes: activity
inventory/view helpers and tests; page and EN/BR localization integrated by lead.
Acceptance owner: W09–W12. Existing tab names/tokens/layout remain authoritative.

- **Axioms:** UI renders server readings rather than calculating another byte total; selection cannot assign owner; missing logical/age remain explicitly unread (R1/R2/R19).
- **DoD:** acceptance-first formatter/store/request-lifecycle tests, manual row read controls, hosted App proof, App typecheck, independent review, isolated actual-HTTP EN/BR/narrow inspection and guide update.
- **Completeness criteria:** W09–W12 cover GET-only mount, manual read, cancel/late response, instance replacement, complete/partial/stale, errors, filters, keyboard and both locales.
- **Invariants:** old value retains its timestamp; attempt age is separate; category/server change cannot accept obsolete results; no auto walk, proof, action or owner inference; unique stays não colapsei.
- **Success criteria:** actual rows measure only after their own action; all named tests pass and isolated browser evidence shows real backend data without changing the owner's running installation.
- **Quality standards:** createStore, whole-snapshot instance replacement, monotonic/server-relative ages, shared typed i18n with double-brace placeholders, English tabs, keyboard access and horizontal table readability.

### Task W3-A — UI acceptance and red evidence

Owner: lead; state: pending frozen Client. Writes: focused activity unit/store tests.

- **Axioms:** Solid store replacement and request ordering need actual production updaters; projection-only tests cannot prove component requests or visual behavior (R19/R20).
- **DoD:** map W09–W12 to named unit/store cases and explicit browser steps, obtain cold coverage review, then capture a scoped hosted App red baseline using the repository test:ci runner.
- **Completeness criteria:** request lifecycle, late results, row identity, lifetime reset, source/age formatting, no-match versus empty, blank owner, translated interpolation and errors are each covered by an identified oracle.
- **Invariants:** tests never claim store tests are DOM/Electron tests; no local suite, owner server restart or mock fixture promoted as real integration evidence.
- **Success criteria:** the hosted baseline fails for missing UI behavior; each manual-only step has expected observable outcomes and remains pending until inspected.
- **Quality standards:** test the actual updater/formatter, use existing store browser-condition lane, avoid duplicated algorithms, and choose exact file filters before CI dispatch.

### Task W3-B — interface implementation and isolated verification

Owner: UI implementation seat; state: awaits W3-A and frozen Client.
Writes: disjoint activity view files; lead serializes page/localization edits.

- **Axioms:** read-only inventory is registration evidence, not idle/owner evidence; partial observed bytes cannot replace the logical cell (R1/R7/R20).
- **DoD:** implement frozen request/render behavior; pass scoped hosted unit/store tests and App `bun typecheck`; cold review; inspect isolated actual-HTTP EN/BR/narrow/keyboard/error scenarios; record exact artifacts and close only owned preview processes.
- **Completeness criteria:** every W09–W12 oracle has passing evidence or the WP remains incomplete; verify failed manual read retains values and reports an inline error with console.error.
- **Invariants:** no production app/server restart, automatic walk, unproved action, owner fabrication, new byte aggregate, translated tab name or hidden unread column.
- **Success criteria:** a user can explicitly measure a registered row, see its source/age/gaps and recognize stale results; obsolete responses never appear in another server/category; all final evidence matches the delivered source scope.
- **Quality standards:** shared CSS/tokens, accessibility and i18n; localization corpus check for new terminology; abort requests and dispose timers; tests hosted only; completion guards and guide/RECOVERY updates.

## Exact contract-freeze checklist before implementation dispatch

1. Lead fixes canonical worktree record/snapshot schema and Core signatures.
   Candidate: opaque row ID, project ID, registered directory, optional attempt
   and last complete logical reading, server lifetime/source/readAt. Reuse
   DiskAttempt; do not widen DiskRootID or claim durable action identity.
2. Decide identity keys, retirement/in-flight behavior and cache cardinality;
   write anchor code and a compilable unavailable stub, never a fake empty pass.
3. Fix endpoint paths/methods/error schemas and actual ProjectDirectories
   service wiring; verify global authentication and no client-supplied paths.
4. Lead freezes request/result ownership and supplies a generated Client stub
   for UI compile work. No dependent agent designs a new cross-WP interface.
5. Author actual tests from W01–W12, obtain independent coverage criticism,
   capture hosted red baselines, approve exact write sets and check conflicts.
   Then assign implementation owners and mark only eligible tasks ready.

## Completion and delivery

WP completion means its six fields are satisfied with inspected evidence;
product completion means the entire A/S coverage ledger is closed, not merely
W01–W12 or three green WPs. Re-run required checks only for changed source or
new concerns. Before integration, independently review each bounded diff and
check its actual baseline/files/tests. Preserve inherited untracked recovery
artifacts. No bulk merge/release/install or owner-app restart is authorized by
this planning artifact. Delivery approval will concern a concrete reviewed result.
