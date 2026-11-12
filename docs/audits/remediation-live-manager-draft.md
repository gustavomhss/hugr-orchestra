# M13 manager contract — source implementation authorized after acceptance review

# M13 manager phase — Root design FREEZE FOR ACCEPTANCE ONLY, no authoring/source GO

Root integration0f1bb80cc2 contains eight green store paths, exact d161 bytes. Node40 and parent-kill/reopen pass both OS. Main capture/client/IPC/UI and original3bugs remain open. Exact private type anchor /tmp/audit-live-manager-contract.ts; next private source files apps/desktop/src/main/live-delivery-manager-contract.ts + live-delivery-manager.ts. No Protocol/HttpApi/generated/dependency change. Node-compatible relative imports .ts; schema parsing remains bounded plain-main boundary, no Core runtime in manager.

Factory `createLiveDeliveryManager(options: LiveDeliveryOptions): LiveDeliveryManager`, fixed-message `DeliveryError` exporting readonly reason:DeliveryFailureReason for rejected start. Future tests use frozen type, refusing scaffold until implementation GO. Four proposed tests: live-delivery-manager.node.test.ts, test/native/live-delivery-manager.node-smoke.mjs, live-delivery-manager.native.test.ts, live-delivery-manager.fixture.ts. No collision with held PhaseA. Parent Bun uses actual AppProcess/Omni to own actual Node manager actor and actual Core SQL peer in3bridge cases. Most units use actual NodeSQLite+real localhost fault peer; no algorithm/storage mocks. Core GET/append/stop semantics not reimplemented as fake proof. No local tests/build.

This phase adds only manager+transport engine, not Senses/Main wiring or old client replacement. Existing legacy client/PhaseA stays private and not a GREEN claim. Whole M13 needs later production wiring and elimination/replacement of the unsafe memory-only path with reviewed regression coverage. No capture/IPC/Electron/full Server consolidation proof here.

Identity/HTTP: current connection comes ONLY from future main serverReady after requestSingleInstanceLock, never renderer/defaultremote. epoch is stable object for one trusted connection; check object plus captured URL/credentials/mode values, recheck after awaits/permit and immediately before each send. profileID always current store.profileID. URL must root http(s) loopback localhost/127.0.0.1/[::1], no userinfo/query/hash/non-root path. New target stores canonical origin+EXACT returned Location.directory. No explicit workspace supported: reject returned workspaceID because private target cannot bind it. Recovered record requires same profile/mode; current trusted port/credentials may rotate. GET verifies returned exact directory plus meeting/session/timeStarted before text for each connection epoch; start ACK itself verifies a new tuple. GET never segment ACK. Historical authority is diagnostic; complete copies immutable stored target after current connection validation, not rotated origin.

All requests redirect:manual, even same-origin3xx; no follow-up Location URL. Basic headers current only, directory via location[directory]. Start200 Info envelope, segments204 empty ACK, stop200 Info envelope, GET200 Detail envelope. Every actual request has REAL10s headers+full-body deadline with owned abort/read cancellation/timer cleared. Backoff sleep seam NEVER controls deadline. GET cap128MiB, other bodies1MiB; malformed/oversized identity response ->blocked target, retain. 401/403 authentication;404 missing;400 MeetingError.data.reason missing_meeting/missing_session ->missing, ended->ended, otherwise conflict. 408/429/5xx/network transient; other unexpectedstatus conflict; all3xx target. Owner cancellation neither failure nor progress; deadline transient deadline. No raw body/status text/private URL/credentials in error/log.

Global manager2HTTP permits FIFO across all records, one sender per record/generation. Backoff outside permit; cancelled waiter removes itself without permit/failure. Resolve before permit and revalidate current connection after permit; owned resolve signal must cancel/observe late resolution. Once stale, no new request/ACK/status overwrite/rearm. Latch generation closed BEFORE abort/join, including discard/shutdown. Existing running HTTP may have already committed remotely; no undo claim. Producer lease separate from HTTP generation.

Start: local UUID allocated first, quota preflight BEFORE HTTP and rechecked after permit. No duplicate concurrent or retained start for same Session: reject active. Bound pending starts+durable records+volatile unconfirmed metadata to128 total (metadata16KiB each/title4KiB); no indefinite waiting queue. Store has no reservation, so local commit can still fail after ACK; never authorize capture without successful durable tuple. Valid known ACK is remembered/committed even if caller cancels after it; with no producer/resources started mark close+seal safely then reject cancelled. A late acquired result is cleaned once. Lost ACK is unknown: NO automatic POST start retry; unconfirmed metadata is volatile and may lack meeting/target. No start idempotency or restart guarantee for missing ACK/failed DB writes.

onChange is synchronous metadata notification only; failure cannot undo accepted storage/HTTP progress. Catch callback exception at this boundary with fixed content-free diagnostic; never pass payload/error text. snapshot read failure returns storage-error and last-known bounded metadata, NEVER ordinary empty. Unconfirmed starts and available/closed state explicit; no fake timestamp/meetingID. Snapshot public IPC later MUST enumerate metadata, never spread transcript/connection/target credentials.

Producer: one lease returned only after tuple commit. append synchronously calls store before accepted event; duplicate no event/requeue/charge. On refusal latch producer signal and pause sender, retain FIRST exact projected unsaved segment only if <=256KiB, reject later callbacks, no flush/no false acceptance. Oversized/unrecoverable body is explicit unsaved:unavailable (do not retain huge text or pretend export); known quota/storage reason visible. Retry persists retained body with same ID/digest before clearing it; duplicate after ambiguous local commit is durable success, no fabricated ACK. Unrecoverable unsaved prevents successful finish/remote close, requires explicit local discard. RequestClose persists intent immediately but does NOT release producer/seal. seal caller has joined capture/STT/cutter callbacks; release producer even if durable seal fails, keep storage-error/no remoteclose. abandon releases joined resources without seal, interrupted/storage-error retained. Producer identity closed refuses late append. HTTP generation cancellation/retry/epoch rotation alone NEVER closes a producer identity; its append/requestClose/seal remain valid until explicit producer latch/seal/abandon/shutdown. A storage refusal latches that producer independently of sender generations. Manager shutdown aborts producer signals but joins MANAGER IO only; future main must join actual capture before manager shutdown.

Drain: exact bounded128/1MiB store.batch, actual204 then exact durable acknowledge prefix. Preserve concurrent append. Reset failures ONLY real durable ACK deletion/confirmed close or explicit Retry; new append/GET/no-op ACK no reset. Seven delays250/500/1000/2000/4000/8000/8000 then8th consecutive transient pauses/no9threquest/timer. Definitive failure blocked/no retrytimer; explicit Retry revalidates current target. If ACK DB delete fails, retain and latch storage-error, no HTTP loop. No remoteStop until closeRequested+sealed+pending0+NOactiveproducer+NOunsaved. Stop200 must validate matching ended tuple; ambiguous stopACK may GET reconcile ONLY with empty pending. Ended with pending ->blocked ended, retain text/export. Completion deletes local quota only with confirmed matching remote closure. Partial GET cannot acknowledge content.

Recovery OPEN ->interrupted/no autocapture/no automatic network until explicit Retry/Finish. Recovered durable closeRequested may seal under supported main single-instance/no producer and drain. finish is synchronous LOCALintent acceptance, not guarantee of remote closure, and refuses active producer/unsaved; requestClose+seal then schedule. retry resets budget/local state and schedules, never starts capture. For known unconfirmed tuple, explicit Retry/Finish may reconcile/create same localID or adopt exact matching stored record then close/seal; NEVER new POSTstart. Unknown tuple refuses target, export/discard remain. discard refuses active producer, closes generation+abort/joins then deletes local state ONLY, no remote stop. shutdown memoized: close admission, abort waiters/timers/HTTP/jobs, await them, close store; no timer or late write after resolve. Observer callback never changes truth.

Acceptance before source: cold review full type/API+matrix, then refusing scaffold and actual runtime positive control; freeze all source tests. Later tests include 2-slot FIFO/cancel fairness, real10s bodyhang,8failures/manualsleep/noTimer, concurrent append exactACK, lateACK/discard/shutdown, restart actualNode file, producer flush/seal/no close, unsaved/oversize, metadata storage unavailability, target/profile/mode/port/Location/tuple/explicitworkspace/malformed and all3xx operations, unknownstart no retry/concurrentcapacity, observer failure, lost stopACK GET proof.3realCore bridges pending503->restore sameID beforestop and307/308 noforeignrequest. Future actual Senses/Main/IPC/renderer/quit and Electron runtime require separate contract/gates before whole M13 closure. No execution authorized by this draft.

Root draft clarification after independent cold review: connection(signal) and optional sleep(milliseconds,signal) are resource-free host Promises and may ignore cancellation. Manager-owned await races the owned abort, installs/removes its abort listener, and observes BOTH late fulfillment and rejection without awaiting them during shutdown. After cancellation no late request, ACK, status mutation, permit claim or timer rearm is allowed. No connection resource is transferred. Backoff uses the same cancellation wrapper; real HTTP response/read cancellation remains separately joined. Acceptance includes never-resolving resolver/backoff during cancel and shutdown, late fulfillment/rejection, cancelled FIFO waiter, and epoch rotation/retry while producer remains valid then flush/seal exact IDs. This is not permission to abandon manager-owned HTTP/readers/store jobs.

Root acceptance-only GO: exact public-private types live-delivery-contract.ts and refusing live-delivery-manager.ts scaffold are lead-authored. No production implementation until full acceptance diff cold review. Owned test paths: live-delivery-manager.node.test.ts, live-delivery-manager-control.node.test.ts, test/native/live-delivery-manager.node-smoke.mjs, test/native/live-delivery-manager-control.node-smoke.mjs, live-delivery-manager.native.test.ts, live-delivery-manager.fixture.ts. Controls exercise actual Node SQLite and Node fetch/abort/manual redirects without invoking absent manager; three real-Core bridges use existing actual graph. Add no test-only manager algorithm or fake store/HTTP. All future cases authored before source; include the independently approved producer identity and uncooperative resource-free promise cancellation obligations. No compiler/launcher until source-free acceptance manifest/diff reviewed and Root lease granted. Legacy client/Senses/Main/IPC/UI remain untouched.

Root feasibility freeze (before acceptance authoring): on EVERY identity/reconciliation GET compare each observed remote segment whose ID is locally pending against exact projected local segment fields; any observed mismatch is blocked conflict before another segment POST. GET remains NEVER an ACK. Require GET after an ambiguous append outcome before retrying that batch, in addition to per-epoch identity proof. This detects observed conflicts only; it does not promise protection against a concurrent external writer after validation. Ambiguous STOP or ended response with durably empty pending MUST reconcile exact identity GET: matching ended completes; matching running can retry within the same campaign budget; pending nonempty plus remote ended stays blocked. Do not strand empty records as ordinary terminal ended without that reconciliation.

Unsaved body bound is manager-wide: at most ONE retained <=256KiB exact projected segment globally, owned by its failed record; another failed producer gets unsaved:unavailable metadata and no copied body, never overwrites the first. Both signals latch permanently. Retry may persist the retained body and reopen sender HTTP only; it NEVER revives an aborted producer or accepts later callbacks from it. Seal/abandon still release that lease after caller joins resources. Start success/active producer count may span different Sessions within the128total-record limit.

Outbox invalid maps to controlled conflict, not success or raw errors; malformed producer inputs conflict, size/quota failures quota. After every HTTP response and before local ACK/status/complete, revalidate owned generation and actual current connection identity/values. Start's known late-identity exception remains separately bounded and cannot write after shutdown closes the store. Any partly committed requestClose remains true if later seal fails; failed discard preserves both durable and volatile truth unless deletion actually committed. Never clear metadata just because an overall action returned false. Acceptance must exercise these cases explicitly.

## Typed contract

```ts
import type { OutboxMeeting, OutboxSummary, OutboxTarget, LiveOutbox } from "./live-outbox-contract.ts"
import type { MeetingSegment, MeetingServer } from "./live-meeting-client.ts"

export type DeliveryFailureReason = "active" | "closed" | "cancelled" | "storage" | "quota" | "target" | "offline" | "deadline" | "authentication" | "missing" | "ended" | "conflict"
export type DeliveryAction = { readonly ok: true } | { readonly ok: false; readonly reason: DeliveryFailureReason }
export type LiveDeliveryConnection = {
  readonly mode: "shared" | "owned"
  readonly epoch: object
  readonly server: MeetingServer
}
export type DeliveryItem = OutboxSummary & {
  readonly activeProducer: boolean
  readonly unsaved: "none" | "retained" | "unavailable"
  readonly unsavedBytes?: number
}
export type UnconfirmedStart = {
  readonly id: string
  readonly sessionID: string
  readonly title: string
  readonly reason: DeliveryFailureReason
  readonly target?: OutboxTarget
  readonly meeting?: OutboxMeeting
}
export type DeliverySnapshot = {
  readonly state: "ready" | "storage-error" | "closed"
  readonly items: ReadonlyArray<DeliveryItem>
  readonly unconfirmedStarts: ReadonlyArray<UnconfirmedStart>
}
export type DeliveryExport =
  | { readonly kind: "stored"; readonly data: ReturnType<LiveOutbox["export"]>; readonly unsaved?: MeetingSegment; readonly unsavedUnavailable: boolean }
  | { readonly kind: "unconfirmed"; readonly data: UnconfirmedStart }
  | { readonly kind: "storage-unavailable"; readonly id: string; readonly unsaved?: MeetingSegment; readonly unsavedUnavailable: boolean }
export type LiveDeliveryProducer = {
  readonly localID: string
  readonly meetingID: string
  readonly signal: AbortSignal
  append(segment: MeetingSegment): "accepted" | "duplicate" | "refused"
  requestClose(): DeliveryAction
  /** Caller has joined capture/STT/final callbacks. Releases the producer lease even if sealing fails. */
  seal(): DeliveryAction
  /** Caller has joined its resources; release lease without claiming final segments were flushed or sealed. */
  abandon(): void
}
export type LiveDeliveryManager = {
  start(input: { readonly sessionID: string; readonly title: string }, signal: AbortSignal): Promise<LiveDeliveryProducer>
  snapshot(): DeliverySnapshot
  retry(id: string): DeliveryAction
  finish(id: string): DeliveryAction
  discard(id: string): Promise<DeliveryAction>
  export(id: string): DeliveryExport
  shutdown(): Promise<void>
}
export type LiveDeliveryOptions = {
  readonly store: LiveOutbox
  readonly connection: (signal: AbortSignal) => Promise<LiveDeliveryConnection>
  readonly onChange?: () => void
  /** Private deterministic backoff port only; HTTP's real 10s deadline never uses this seam. */
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}
```

## Root source-only authorization

Acceptance freeze `ecdb6bb8ffb299fb40acaab89bd25608783c81ad` was reviewed in full by Root and an independent critic. [Independent Node controls](https://github.com/gustavomhss/hugr-orchestra/actions/runs/43319471495) pass all six cases on Linux and Windows; snapshot `17867ef69b42341096173365d3d0a424c4750787`. They do not import the manager. Node24.22.2/SQLite3.53.4 measured; exact128MiB detail parses in653/619ms. The 96 manager cases and three real-Core bridges remain unexecuted.

Root authorizes manager source implementation against the frozen packet and actual private contract `live-delivery-contract.ts`; this supersedes the earlier acceptance-only prohibition. Exported error name is `LiveDeliveryError`. API, store, frozen tests and legacy production wiring remain outside the write set. Return full source freeze for cold review before compiler or hosted gates. Whole M13 remains open; capture/IPC/Electron/quit require subsequent explicit contracts and verification.

Root clarified before action implementation: Finish commits eligible local close/seal intent but never resets a paused/blocked campaign or its failure budget; no ninth HTTP attempt without explicit Retry or actual durable progress. Its ok=true reports only the accepted local intent. Recovery preserves paused/blocked status and failures; only eligible sending close-intent records continue their remaining durable campaign. A producer seal after an unsaved refusal releases its lease but does not durably seal (which would prevent retained-body retry), returns the original controlled refusal, and preserves committed close intent. Retry may persist the same retained ID without reviving the producer; subsequent Finish seals. Unrecoverable unsaved metadata blocks Finish and remains export/discard-only. Any acceptance gaps for these clarified edges are reviewed before action implementation.
