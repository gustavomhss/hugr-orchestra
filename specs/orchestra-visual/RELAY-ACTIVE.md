# Relay closure — active implementation checkpoint

Updated: 2026-10-09. Owner priority: Maestro attribution/V3 → W6 → real-model pilot.
Nix is independent. One final milestone PR; no work-package PRs.

## Owner execution cadence

Implement disjoint slices in parallel. No per-slice typecheck, tests, mutation, CI,
build or product smoke while combined implementation is incomplete. Prepare runnable
checks now; perform one integrated validation batch after combined source is ready.
Reuse existing source-bound evidence; keep gates intact. Static cold review remains required.

## Current repair wave and qualification hold

The reviewed authority source set is A `9358d3833a8efc385ddaaeb501264c013859d5a0`
(includes `fd0a7ed2e7`, `4b0b09b17a`, `84513c9ecd`, `66c0532e2d`), C `0c8bc60369`
(includes `2c28b537f4` / `a3b767422a`), runtime `f73d92d083`, and neutralized failed
Nix-request ancestry `7eb2bb766a`. Bounded source findings are closed within their
reviewed scopes. Execution remains unqualified until runtime's affected batch.

### Actual resumed qualification and fixture-only repairs

Runtime composed the accepted full authority source into pending index tree
`26568fd901991632904a682b31c37b4da48acd0f`. Its first Core/Orchestra/CLI typecheck
attempts all exited **127**, exact error `tsgo: comando não encontrado`: missing
installed tool, not a compiler or source diagnostic. Runtime restored frozen
dependencies with `bun install --frozen-lockfile --ignore-scripts` and retained
manifest/lock versions; no lifecycle scripts were run.

The restored compiler batch measured CLI **exit 0**, reused after fixture-only
changes. Core reported only a readonly decoded legacy summary assigned to mutable
storage data in the preservation fixture. Orchestra reported a settlement-fixture
ASI continuation/cascade and a native-versus-legacy message-ID comparison. Actual
Godfile measured **4025 files / 323 warnings / 1 error**: Task backend fixture
**753 LOC**, limit **750**. No scoped CI/native/pilot retry had started at that card.

The same three disjoint authors published fixture-only repairs, composed in clean
`8ef07624bab33dcc51d64fd0b14b7e93f7bf6a81`:

- A `fca89fc1d4ac65472a5144fc146af21205f7d1e2`: use actual mutable legacy storage
  data and typed user storage shape, retaining all authority/replay assertions.
  Independent static approval: `ses_ede1c82cfffe66nn95toC1bBPo`.
- B `c328d3d72c793a873e266ff023be51426be0517a`: one leading semicolon separates
  the completed seed initializer from the case-array `.forEach`. Cases, ports and
  Effect requirements are unchanged. Independent static approval:
  `ses_ede10b0f9ffe2GoE20KDmpgx3V`, exact joint `8ef07624ba`, only that file's delta.
- C `b5b3cdf34f168d03d6c1eba9ec3f68b3910a4160`: includes real fixture-builder reuse
  `2d06d1cbc5`, shared native original-Task validation `b50e5040e0`, and native
  `SessionMessage.ID.make(parent.assistant.id)` at the comparison boundary.
  Scenarios, assertions, actual storage/delivery order and identifier bytes are
  preserved. Independent static approval:
  `ses_ede811595ffe8onazcY8NaqjdT/msg_1221e24d600132TzjMhDMnUgSI`.

Runtime's next affected retry measured Core and Orchestra package `bun typecheck`
**exit 0**, and Godfile **exit 0**: **4025 files / 324 warnings / 0 errors**.
Preservation fixture is **719 LOC** and Task backend fixture **738 LOC**, both
below the hard limit. Actual tool exit metadata is recorded in
`msg_12226f5be0015Y5wLrhD5WTA93`; CLI and unchanged Relay evidence are reused.

Runtime published clean source `8d15972b45c95ac91a1f31c3c87946b5c67606aa`, tree
`f28d3cbe9e91186f8584d5658a889cb0e90ce734`, after that retry. Its code matches
`8ef07624ba`; only the campaign ledger is older. The integrator preserves the
current ledger while adopting this measured runtime ancestry. These results are
typing and budget evidence, not scoped CI/native/model qualification. Runtime
owns the next focused Core/Orchestra/native runs; Relay requests the explicit
freeze card before its sole fresh four-native Nix measurement activation.

### Actual focal CI and fresh Nix measurement

Runtime explicitly froze clean `aec262940e6f86dbf55baf33ab7ebe7ccd91770f`, tree
`3e1327e3cbb5d91556b02083fac6b634d1a86552`, identical to reviewed `8ef07624ba`.
This docs-only child aligns the historical ledger; package code and typing evidence
are unchanged. The actual focal requests each changed only `.ci-run.json` from AEC:

| Run | Actual completed result on each OS | Remaining failure |
| --- | --- | --- |
| Core `37981431526`, head `d482e3e908` | 73 pass / 8 fail, 81 tests in three files | All eight receipt-free observation positives/restored controls remain at the old running result; live acceptance fails before the replay leg |
| Orchestra `37981431470`, head `22423b5346` | 88 pass / 2 fail, 90 tests in five files | Completed native and dual background Task cases fail with `actual native private settlement did not resume parent` |

Core Event/evaluator and the other four Orchestra files emitted passing cases.
The generic backend notice case passed. No whole-run green is claimed. The same A
owns actual first-rejection diagnosis in updater/projector/guard fixture, preserving
strict stored facts and positive assertions; C diagnoses the linked caller read-only
until the root is proven. Timeouts are not increased to hide missing settlement.

Native `37981829079` and incidental `37981867753` failed before jobs. Actual GitHub
annotation rejects `runner.temp` in job-level env at workflow lines 55 and 101.
Runtime alone owns the one-file repair: move the unchanged model snapshot path to
the two existing build steps' env. Independent static APPROVE:
`ses_ede10b10bffeZj7Sr8S8b57wwj`, baseline AEC, before blob
`bfae1f08b1ae7ae90fe15c4faf267608b97851ce`, working blob
`295ad1e297eb02d09803a6cba7a1d78dfa4a3dc0`. No native consumer ran in those failures.
Runtime published that exact workflow-only repair as
`be485928d5cb9111fc50fc4dfb9be12447ee71c5`, parent AEC. Controlled native branch
`e2ec5a868f983da025e5eb3611589e1b39b2f986` has the identical repaired tree and
actual run `37984603006` registered. Consumer execution/results remain pending.
That run subsequently completed **failure**: real shared model acquisition, both
Linux consumers, both Darwin consumers, Windows ARM producer and Windows ARM
consumer succeeded. The sole Windows x64 native job failed during CLI build with
`Failed to extract executable for 'bun-windows-x64-baseline-v1.3.14'. The download may be incomplete.`
The real model snapshot loaded before this compiler fallback extraction failure.
Runtime owns the exact failed-lane/vendor-artifact diagnosis; passed lanes are not
silently rerun or promoted into an overall green.
Runtime published one-file repair `905facae5508054e98f617f9345de8a3eaae9222`,
parent `f48ed761aa`: acquire the official Windows x64 baseline ZIP, verify publisher
SHA-256 `538f9c846355d9e847b2671bc00c47da4229a0befb24df3282b739770f3b475f`,
binary/version and PATH ordering before the existing host/build/proof steps. The
publisher API asset `418774449` reports that exact digest for the named 1.3.14 ZIP.
Bounded independent static APPROVE: `ses_ede10b10bffeZj7Sr8S8b57wwj`, workflow blob
`2cd60aac24191ef0e93f5cc49b0f52818ea11d6f`. Explicit `windows_x64_only` dispatch
covers models and that lane only; its success cannot certify the whole matrix.
The repair is composed in `02308248dc`; actual failed-lane verification remains pending.

A published minimal candidate `5c6426d8f5bb0a473d15447dece6e205be7cc32c`, parent
`fca89fc1d4`, changing only the updater. It snapshots current Immer state before
the same strict equality checks. Source inspection identified proxy/plain object
comparison as the suspected refusal boundary; source-only inspection is not an
observed first-false predicate. Runtime owns the actual eligible-fixture diagnosis
and failed-selector verification before causal/runtime closure is claimed. Strict
stored facts, equality constraints, original fields and positive assertions remain.
The candidate is composed in `c1581317cb`, with bounded independent static APPROVE
`ses_ede10b10bffeZj7Sr8S8b57wwj` on the one-file delta. Its updater blob is
`9a863008a73a6f54ef8b67c5f69e48f19342f1d2`; the measured AEC/9c blob was
`3f4db93e7a69374d5764a84258ed7b7502abcc22`.

Runtime's generation later stalled without tool actions. The user explicitly
answered `Retomar sessão (Recommended)` to interrupt only that generation and
resume the same Runtime Session. The coordinator confirmed clean `be485928d5`,
HTTP abort 200/true and idle status, then persisted compact recovery handoff
`msg_1225fcfdd001kvvyAG5aQZIlIP`. No server was restarted, no source work discarded,
and no new author or qualification result was invented.

Runtime then measured the actual first refusal in Actions diagnostic **`37988400717`**,
head `18262711b544b006587ff07ba0e67191d2336679`, based on `f48ed761aa` with temporary
instrumentation. Both OS jobs completed **24 pass / 0 fail**. Eligible real rows
reported `observation: true`, `dbValidated: true`, and all other branch predicates true.
The actual equality booleans were `draftInput: false`, `snapshotInput: true`,
`draftResult: false`, `snapshotResult: true`; `originalFirstFalse: "input"` and
`snapshotFirstFalse: null`. Invalid lineage/workspace/owner/author cases still refused,
and restored cases accepted. Live and fresh-DB replay controls passed. Raw job evidence:
`tool_122670e4f001vzfR63fgvonmB1` (Linux), `tool_1226b3565001mTRgPFtSpbrkZa` (Windows).
This establishes the refusal boundary in the real fixtures, beyond the earlier static
proxy hypothesis. Runtime removed instrumentation and restored the exact approved
candidate blob; uninstrumented Core and linked Orchestra Task qualification remain pending.

Relay's sole request-only `9c76824c5ce27849f42685dc3579e3201e6103af` has exact parent
AEC and changes only the ready/source-parent JSON line in `nix/distribution.md`.
Run **`37981869304` completed successfully**: prepare, all four matching native
measurements, and independent completion. Five non-expired API-bound artifacts were
downloaded under approved temporary `nix-evidence-37981869304`. Completion identifies
source tree `d8791dd793c0888c49b1b1dee4927d77e5cb2731`, repository `1405035578`, workflow
`379775833`, attempt 1, and status `MEASUREMENT_ONLY_NOT_DISTRIBUTION`; completion
positive/no-op and finite defect controls report `COMPLETION_CONTROLS_OK`.

The four real recursive SHA-256 NAR candidates remain **not applied**:

| System | Captured candidate |
| --- | --- |
| x86_64-linux | `sha256-shNngKjLShpnSR90z+1bggdb9kZ8SeZjwW4P0/pA+tI=` |
| aarch64-linux | `sha256-L3dPE+giop893M8H7Olb0MKYhX6IrhMNEXDaIkbTXvc=` |
| x86_64-darwin | `sha256-MLfyJbv32689GW0iqUh7UHIp4QJLHFrtjKW4c6RqTMs=` |
| aarch64-darwin | `sha256-XG2g3KWXDvMtzyoQoKdkjLi8JNs4JO5aZzwc2Z97iIA=` |

Measurement is not consumer/product qualification and does not override Core or
Orchestra failures. The input fingerprint pins all package sources and tests.
An actual A repair must be compared against that fingerprint before any hash-only
consumer checkpoint; changed package inputs require fresh capture. Native-workflow
only changes are outside that declared input set and must be assessed separately.
Integrator `f48ed761aa` preserves the successful 9c request ancestry with the next
request inactive. Direct comparison against the declared fingerprint input paths
found exactly the updater blob change above. This is a concrete invalidation,
even if a later normalization happens to produce the same NAR value.

Failure-repair integration checkpoint: `b71cd4e0763a8e42a0da37530ca5fa29a0ffcc9c`.
This is not a qualified runtime freeze. The measured source freeze was
`1f4f2929b0153aa4f68757d9aee33d8f18f55589`; its focused runs exposed concrete failures:

| Run | Measured result | Follow-up |
| --- | --- | --- |
| Orchestra `37953895229` | 171 pass / 10 fail on each OS | Repair the five failed files only |
| Core `37956127836` | 48 pass / 1 fail on each OS | Correct the after-signed-disposition fault fixture |
| Relay `37953896008` | 33 pass / 0 fail on each OS | Reuse unchanged source-bound evidence |
| Native products `37955682776` | Six consumer jobs failed | Runtime owns version formatting and shared real models.dev snapshot repair |
| Nix measurement `37954180585` | Prepare succeeded; four native lanes and completion failed | Repair parser conformance, then measure the new source freeze |

The integration checkpoint includes SDK activation fixture `87442e5384`, Core fault
fixture `be5a5280fb`, private-port fixtures `de8191d564`, initial Task detail/hash repair
`1347d53401`, upstream provenance fixture `99517ce5eb` (mapped to `236017530b`), and Nix
parser repair `5f7e3b0c7c`. Those repairs are source-reviewed, not qualified by a new run.

### Remaining Core / background seam

Existing author A owns only Core `session/message-updater.ts`, `session/projector.ts`,
and `test/upstream-settlement-preservation.test.ts`. A must publish a minimal immutable
repair for receipt-free unfavorable host observation on an already completed original
native Task. The existing adapter receives an internal validation callback backed by
the projector's captured Database and real parent, child, project, directory, agent,
original Task tuple, and returned-assistant rows. Ambient optional Database presence
does not establish trust. An unbacked memory adapter refuses observation.
A published `66c0532e2d58b84cdd35fdb4aadd7c576bab123b`. A bounded draft audit
`ses_ede1c82cfffe66nn95toC1bBPo` found that available original legacy Message/TaskPart
conflicts could not veto its native-owner callback. Same-author follow-up
`84513c9ecda6d0dd4a42313e4629dfddd849b548` closes that gap and is composed in
`00b8ebb71198e98b6408d9f52a5ed1d59ca6e25d`. Returned-author completion remains
required because the strict private proposal reader requires it too.

Independent bounded reviews of that exact composition are static FIX_FIRST:

- Production `ses_ede10b10bffeZj7Sr8S8b57wwj`: child workspace must match parent;
  replay reconstructs a payload without Location, causing live/replay divergence
  for an otherwise eligible observation. A's source follow-up closes workspace
  equality and supplies trusted internal projector origin. Missing or mismatched
  live Location must still refuse.
- Fixtures `ses_ede10b0f9ffe2GoE20KDmpgx3V`: malformed legacy owner lacks required
  common `time` at the typed SQL boundary; preserve malformed assistant fields
  while repairing that shape. Direct stored-author and first-interruption probes
  are also required before claiming guard coverage. No compiler or test ran in
  either static review.

Lead explicitly assigned the same A exactly four total files: Core `event.ts`,
`session/message-updater.ts`, `session/projector.ts`, and the preservation guard
test. Internal projector callback origin is derived inside `commitDurableEvent`
as `replay: input !== undefined`, never from caller payload. Only trusted replay
may reconstruct exact parent Location from captured DB after all retained facts
validate. Live publication and local-only `persist:false` remain non-replay and
must refuse absent/mismatched Location. Subscriber/listener signatures, Payload,
SerializedEvent, Schema, HTTP APIs, storage and ownership/sequence semantics stay
unchanged. No fifth file or additional writer is assigned.

A's immutable follow-up is `4b0b09b17a2bf8edaafce4d8ceb119e2fc011de4`, parent `84513c9ecd`.
It changes exactly those four files. Origin is frozen and passed only to projector
callbacks; listeners/subscribers and durable storage/envelopes are untouched. Real
fixtures cover both available returned-author views, first interruption/workspace
identity, missing live Location with spoofed replay metadata for durable and local-only
publish, and actual recorded events replayed into a fresh isolated destination DB.
The replay case uses real source rows/events and observes a replay-origin callback,
not an already-applied-sequence retry. The malformed owner keeps required common
`time` while omitting required assistant details. Production static APPROVE:
`ses_ede10b10bffeZj7Sr8S8b57wwj/msg_122055f5b001QfnkGcwc0uI94q`, exact joint `54c644fc4e` against
`a76306c684`, only the three Core production files. No author QA ran.

The replay fixture initially compared two potentially unchanged projections. A's
single-file six-line `fd0a7ed2e70916a2e2eef9f548b5c30757af74e3` adds explicit accepted
live expected state, inequality against the original call, and the same expected
state for the fresh destination. Independent oracle static APPROVE:
`ses_ede09c550ffehFp17l17waWde3/msg_122078c6f001TrGz12quIRzc3I`.

A's single-file 32-line `9358d3833a8efc385ddaaeb501264c013859d5a0` closes the final
finite authority-fixture finding: malformed card/author/terminal and empty/non-string
initial host detail leave the full eligible call unchanged in all author views;
duplicate native same-call entries leave the full stored owner unchanged. Restored
actual rows and valid results must produce explicit accepted work-result deltas.
Independent final fixture static APPROVE:
`ses_ede1c82cfffe66nn95toC1bBPo/msg_1220d1606001oIa1NeTHu7SbgI`.
Neither fixture follow-up changes production or the already approved replay route.

Provisional handoff of `817b243512` was superseded by HOLD for that last fixture
finding. Runtime explicitly confirmed no affected typecheck, CI, native check or
pilot had started, and no run/PID needed cancellation. Final handoff must include
`9358d3833a`, not attribute results on the earlier source to these new probes.

Existing author C published `a3b767422a06a0f5d71c60feb4f16bfa3be3262f` and follow-up
`2c28b537f45832f87907ed44358e13cc9c45c916`. C observes the actual unfavorable host exit,
reconciles the same tracker, publishes existing typed Task metadata events, and reads
back the retained result before resolving the Deferred and admitting delivery. EventV2
owns each commit and announcement; there is no outer rollback transaction. Sequential
partial observation commits remain possible and fail closed. Completed native and dual
view cases exercise the actual scheduler and private setter, without preseeded receipts.

C has conditional static approval only:
`ses_ede811595ffe8onazcY8NaqjdT/msg_121cda10a001AnodaWbWSLCjSm`.
The initial Core blocker and reviewed follow-ups are composed. Runtime also confirmed
that C's protected retained observation
path must apply only to the existing host-derived `upstream-work-result-v1` schema.
The established `backend-work-result-v1` contract has no author and must retain its
generic unfavorable-detail/notice path. Same C owns that correction and an actual
completed-native backend notice case; Core trust and private-port DTOs stay strict.
C published that bounded follow-up as `0c8bc6036929d6b5533efb7afc4b5ae30d6e1432`:
protected publication/capture is selected by `UpstreamResult.SCHEMA`; backend
failure still resolves the scheduler and delivers the actual synthetic error notice
without author or upstream receipt. It is composed as `f55c7dfdaa9cf02f4e900d1e1d1ecedd8b2c051c`.
Bounded C follow-up static APPROVE: `ses_ede10b0f9ffe2GoE20KDmpgx3V`, exact `f55c7dfdaa`
against `00b8ebb711`, only the two-file C delta. Backend host detail is checked in
the live streamed result; durable Synthetic assertions prove error state/tag and
returned text, not persisted host detail. Runtime execution remains pending.
No new Session API, service, event, store, receipt before admission, Core-to-Orchestra
dependency, permission waiver, or relaxed private-port terminal equality is authorized.

After A publishes, the coordinator composes A and C and obtains bounded independent
cross-caller review. Runtime alone then owns Core typecheck and the affected selectors:

- Core: `test/relay-workflow-evaluator.test.ts`,
  `test/upstream-settlement-preservation.test.ts`, and existing `test/event.test.ts`
  because the internal Event projector callback wiring changed.
- Orchestra: `test/maestro/upstream-provenance.test.ts`,
  `test/maestro/upstream-settlement.test.ts`, `test/maestro/task-hash.test.ts`,
  `test/maestro/arsenal-activation.test.ts`, and `test/tool/task-backend-result.test.ts`.

The final clean post-check/generated source freeze is still pending. Runtime owns the
approved CLI/version and native models.dev workflow changes, published as
`f73d92d0838e6cb08fd76e1266851bcfd2b78a7a`. The exact approved blobs are retained
in integration `93e46af105`; C's immutable source is composed in `69dd0bab15`.
Neither composition releases the affected checks before corrected A and cross-caller
review. Generated caps remain SDK **16718 LOC**, Client **6646**.

### Nix and pilot qualification

Relay is the sole Nix activation/hash writer. Request-only `7eb2bb766a80f130a8d0758f3337729237b9ea8a`
had exact parent `1f4f2929b0`; upstream created no duplicate request or run. Integration
preserves that request's ancestry with `ready: false`, allowing the next request-only
child of the final freeze to fast-forward the existing branch without a force push.
Actual Linux
artifacts falsified the old parser assumptions: Nix 2.29.2 exits 1 on the expected fixed
output mismatch, counts carry SGR decoration, and derivation fields are `sha256` / `nar`.
The repaired parser replayed both Linux artifacts and rejected six defect classes per
OS in offline conformance checks. This does not qualify the failed native run or authorize
applying its hashes. Package changes require a fresh source fingerprint and four native
measurements before an exact direct-child hash/request-only consumer verification.

WSL still lacks an operational runner proof. The real-model pilot remains unexecuted
and must collect linked actual Task return, author/logical Task, receipt/durable delivery,
grounded V3/current context, publication/materialization/skills, WorkflowBound, same-Session
ledger/cursor/retry, and distinct Maestro validation and Lucy artifacts. Exit 0 is insufficient.

## Historical ready pin and validation handoff

All known semantic repairs and source-growth extractions are composed in clean published
`35c52d2c6716afb18e89cd3fa219da2f1bd55873`. Runtime received exact pin and three independent
static review receipts in `msg_1212e620c001b0GSfQACTiy8h6`.

- Guards/private port/writer and distinct Maestro-validator/Lucy-reviewer identity fixes:
  `e5e0507dd532ccc63f0af39a021b358cf6171585`.
- Grounded V3 consumer: exact upstream `db4b028360` + prepared cases `0cc55ee829`, mapped to
  `eb1d670878` / `75e643f51b`; V3 requires actual grounding, historical V1/V2 preserved.
- Evaluator settlement/repair extraction: `5acf4d190f`.
- Private prompt operations extraction plus options forwarding: `09ce00affa` (includes `0f29096aad`).
- Background Task extraction: `294c98f6f7`.
- Runtime candidate `75c4370b6c` contributes exactly one internal Relay workspace dependency line
  in Orchestra manifest and Bun lock, plus supported generated SDK and human-only generated cap.
  SDK **16718 LOC** explicitly human-authorized; Client **6646** unchanged. No source waiver.

### Cold source-review receipts

All three review exact HEAD `35c52d2c67` against baseline `75e643f51b`. Verdicts are static
APPROVE only, not compilation, runtime, budget-gate or acceptance results.

| Slice | Reviewer Session | Final assistant receipt |
| --- | --- | --- |
| Evaluator extraction | `ses_eded631b9ffeeuH7Y2JlpZ4P4Q` | `msg_1212a84b7001tGQY9nCG1fj2cZ` |
| Prompt operations extraction | `ses_eded6319bffeD54cwmmW8s7mS8` | `msg_1212cbf3e001w3F8P9BvZWcIAp` |
| Background Task extraction | `ses_eded6318fffevTIEIZGheWYg6T` | `msg_1212b2c36001g13xxJvzkDehF7` |

At that historical checkpoint, runtime owned one coalesced failed-package/Godfile/scoped QA pass after composition and local
PTY setup. Official bun-pty 0.4.9 archive was inspected by runtime; empty installed dist is
local cache/install corruption, not a new source dependency/version change. Relay does not
duplicate those checks. Nix measurement activation waits for actual post-generation/checks
freeze. Core Omni `37943566437` on unrelated `f3b2b67` is not Maestro evidence or a failure card.

## Exact source state

| Front | Source checkpoint | State |
| --- | --- | --- |
| Shared runtime | `b1cad41dc515eec9dcf474c413da853061894ac1` | Consumed into `relay-next`, `nix-closure`, W6 base |
| Nix consumers | `8b812438bc` | Composed initial consumers, provenance/control/PTY source fixes and strict measurement helper; unvalidated, four hashes stale |
| W6 definition/current step | `d438ef8eab` | Source checkpoint; not closure |
| W6 lifecycle | `b72bfccf25` | Initial lifecycle checkpoint; completed by production port/hash and durable settlement checkpoints below |
| W6 production ports / hashes | `992b4c58ec`, `ee502646c7` | Concrete publication/provenance/approval/completion ports, canonical V3/hash path and scoped durable resume implemented |
| W6 host extraction | `b36b725c10ee16ab04771c63b49132b82d92881b` | Named `maestro/workflow-host.ts` boundary; existing composition preserved, no new layer or waiver |
| Complete upstream base | `ed078a033432ef948a813472b888a9245a244166` | Consumes exact b1-based `01a48f6a22`; registration/result/proposal/seat helpers now present |
| Compatible background writer/preservation | `25a7333a045e905d6f23765a74fb9c85c9193f45` | Captured returned assistant, durable V1 readback/private setter, native V2 synthetic/progress with actual parent Location; preserved terminal metadata |
| Canonical background reader | `e032d61e7c19cd4af1ecefacec78b7619e16cf22` | Consumes private `upstreamSettlement`, actual referenced V1 part/V2 synthetic projection, canonical attribution unchanged |
| Same-lock settlement adapter | `d2cc5b16bf8bc4c64ce5949021d57d282170d506` | Published, unvalidated; consumed as `2e3c15cd89` in W6 |
| Upstream attribution/V3 | `8f73c045307f06da311ee6f8b1bb6ba378bf265c` | Upstream source-reviewed; consumed as `30ac511984` |
| Upstream verifier | `cc6f5a8f755bb7d765c5d918ecd23180244be006` | Synchronous source consumed as `4385c5847d`; background reader extension integrated separately |
| V1 pilot launcher | `fe3760f621` | Runtime source consumed; prepare-only default, real execution remains qualification work |
| Native-product / WSL harness | `260d` / `80f3ebecfc` | Runtime source consumed through `56659216d6`; execution proof still pending |

W6 working branch/worktree: `relay-workflow`, temporary OpenCode work directory.
Nix working branch/worktree: `nix-closure`. Integrator: `relay-next`.

## Implementation and qualification boundary

- Background producer and canonical observer are implemented and composed. Final work
  result is captured from the actual returned assistant; delivery reference is written
  after durable readback on the exact original Task. Initial-completion/late metadata
  preservation is implemented; final checks still must establish behavior.
- Frozen private host-only existing Task metadata contract (upstream ACK
  `msg_11f3590e7001Z4VlhB0nt14OBe`):
  `upstreamSettlement: { parentMessageID, parentCallID, workResult, deliveryMessageID,
  deliveryPartID? }`. Multipart V1 requires the actual part reference. Canonical
  `UpstreamAttribution.V1` does not change. Caller notices, process-local job status,
  timestamps and later `lastAssistant()` reads cannot establish these facts.
- Relay owns producer and narrow existing Task/Session settlement; upstream owns observer.
  Missing/failed/undelivered evidence remains named HOLD. No new
  event type/store/approval/loop/coordinator/drain identity. Source readiness is not full closure.
- V1 generic `Session.updatePart` continues to strip caller-new settlement metadata.
  Producer uses private `Session.settleUpstreamTask` after actual User/part readback;
  stored Task receipt is verified before wake. Native V2 uses existing `Synthetic` and
  `Tool.Progress`, explicit actual parent Location, and existing process-global resume.
- Runtime received clean full-source `9b83e5315fa462c0c0ee2053c93380c0ac203b44` in
  `msg_11f70b018001OjTXDuD3LD4kd0` and started the agreed generation/typecheck/scoped CI
  batch. Lead does not duplicate those checks. Nix starts after post-generator source freeze.
- Nix native four-system dependency measurements, consumer builds, output proof and hashes.
- Final native/WSL qualification and read-only V1 credential compatibility/model pilot.

PlanSource/attribution/registry remain upstream-owned. Relay owns binding/lifecycle;
Nix owns `nix/**`, `flake.nix` and Nix workflows; runtime owns native-product workflows.
Peer ACKs grant neither human approval nor permission waivers.

## Evidence reuse and scheduling incident

Native producer proof: `37875718504`; SDK prepared runtime proof: `37877015907`.
Earlier optional `--config PATH` invocation is vacuous and excluded; required `--config=PATH`
fix is part of the valid producer source. Nix toolchain proof `37824668435` is independent.
Initial Nix source push triggered existing toolchain run `37880278652`; cancelled after
prepare/Linux jobs had run. This is not consumer/distribution acceptance. Later source
checkpoints use `[skip ci]`; no further deliberate validation before combined readiness.

Initial Nix static reviews identified unbound measurement provenance, incomplete control
collection and insufficient PTY consumer evidence. Source corrections are composed in
`8b812438bc`; actual controls/native qualification are still deferred. Controlled premerge
bootstrap is restricted to `nix-validation` plus the explicit request in
`nix/distribution.md`; current `ready:false` remains intact.

Unvalidated foreground W6/upstream plus Nix source composition: `dd6c5f367f1a0d8dddd6909cee6fbf0fd1ab13a4`.
No product readiness, test pass, measurement or pilot acceptance follows from this composition.
Full compatible background/runtime/Nix source composition: `9b83e5315fa462c0c0ee2053c93380c0ac203b44`.
Dirty alternative BackendWork delivery implementation was not consumed. Preserve its archived draft.

## Coordination and recovery

Current existing OpenCode server: `http://127.0.0.1:50407`; old `49246` stopped.
Server was discovered, not restarted. Basic auth comes from environment; never log secrets.
Runtime: `ses_ee888bf80ffeckSbRi0RP57V1s`; upstream: `ses_ee6d55370ffe6CYDCP42Ox46NN`.
Recovered host author: `ses_ee10c03f9ffe7gsM6XAunvvWRt`; resumed on live server with
exclusive W6 writes after Task return failed at snapshot `info/exclude`.
Accumulated ACKs persisted; compact existing V1 receipt map sent in
`msg_11ef8eaaf001TcfWB5HVI2uTMG` (review message IDs still being recovered).

Removed only own inactive clean integrated `v1-prompt-admission` and
`python-runtime-retire` worktrees; their branches/commits were preserved. Keep all pending
peer work and frozen Relay golden/fixtures/reviews and oracle pins.
