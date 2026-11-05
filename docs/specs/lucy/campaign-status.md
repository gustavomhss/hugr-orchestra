# Lucy campaign status

This is the recovery and execution ledger for the approved [build plan](build-plan.md). It records evidence and open work, not approval to merge.

## Owner constraints

Execution correction after the owner's duration challenge: stop opening additional
pack or phase fronts and close the active Ruff, round-authority and durable
Session candidates first. This changes the lead's cadence, not the approved
scope, the no-merge boundary, or the requirement to disclose incomplete phases.

- Keep phase integration bundles distinct. New owner direction authorizes small slice PRs; the original `lucy-wp-*` branches remain preservation archives.
- Do not merge phase 1 PR [#1290](https://github.com/gustavomhss/hugr-orchestra/pull/1290) without the owner's authorization.
- Do not run Atlas genesis or restart the desktop app or server.
- Tests run through `bun run test:ci`; type checking runs through `typecheck.yml`. No heavy local tests, type checks, builds, or evaluations.
- Open small PRs and run surgical tests on their changed paths. Run one epic on the final bundle of all campaign work, not per PR, correction or phase. This newer owner direction supersedes the original per-phase cadence without changing acceptance or no-merge constraints.

## Current landing units

### Earlier recovery checkpoint: native Ruff and repository authority

Historical checkpoint, retained for failure provenance. Its pending items are
superseded only where the subsequent closure table and controls below name the
completed evidence; do not relaunch a completed request from this section.

- No campaign PR has been merged or epic-labelled. PR #1290 remains held. The
  receipt branch is recovery documentation, not a runtime integration base.
- Draft #1331 (`lucy-check-guards`, `6faf86424f`) now retains repository-command
  identities from analyzer/synthetic source provenance and the actual execution
  catalog. Independent source rereview approved that repair. Exact-head Linux
  request `42032055598` executed the 49-test four-file selection. Removing only
  repository classification produced six failures in `42032290771`, including
  actual command-approval refusal and custom catalog identity controls. The
  mutation was restored byte-for-byte. Full uploaded-source/log and typecheck
  review remain required before marking the draft ready.
- Complete uploaded-source trees were compared against the frozen local heads
  for `42027038405`, `42022365664`, `42030599793` and `42032055598`. A deliberately
  changed known file exercised the comparator. Full logs and assertion lists are
  saved under `lucy-ci-evidence`, with identities in
  `precision-governed-provenance-identities.json`. This source check alone is not
  behavioral or mutation acceptance.
- Ruff refusal `42031579913` identified the exact preflight failure: the POSIX
  literal-backslash file was a regular file according to `lstat` and `readdir`,
  but the leaf `realpath` call returned ENOENT. Every other selected file passed
  its individual physical selection. No native CLI ran in that failed request.
- Repair `462c976ced` keeps actual root canonicalization and the full nonsymlink
  component walk, then returns its already-verified literal cursor instead of
  passing the leaf through that `realpath` behavior. It does not claim an atomic
  seal against another same-uid process. Integrated primitive head `901ff045ea`
  executed the 24-test Linux selection in `42032159502`, including the actual
  confined Ruff binary, physical file cases and notice fixtures. Full source/log
  and mutation review, macOS controls and refreshed typecheck remain pending.
- Earlier precision and primitive typechecks `42026287332` and `42028073101`
  failed in notice fixture typing; the latter also found the native raw-buffer
  assertion overload. Notice fixture repair `4e110af9dd` is integrated in
  `901ff045ea`; raw-buffer repair `df231acb6d` is not yet integrated. These repairs
  are not a new typecheck success.
- Ruff analyzer `fcc202f51f`, catalog `ccda997848` and independent acceptance
  `7af7668b0f` are preserved on separate branches. Source review requested two
  analyzer repairs: normalize selected worktree-contained absolute paths before
  copied-tree selection/final filtering, and reject dangling base-parent symlinks
  before treating a selected new file as absent. G3 owns that production repair;
  G6 owns the independent selected-path and parent-symlink tests. Neither is in
  the lead runtime yet.
- Open completeness items remain governed rereview route/finding authority,
  durable Session admission/runner fanout, remaining phase-4 packs/advisories and
  phases 5–7. None of the scoped results establishes complete Lucy delivery.

### Subsequent source and runtime controls

Latest closure state (not campaign completion):

| Active unit | Frozen source / evidence | Status |
| --- | --- | --- |
| Repository gate provenance | `6faf86424f`, PR #1331; Linux `42032055598`, typecheck `42031995403`, mutation `42032290771` | Ready for owner review, still unmerged |
| Ruff native integration | `e021d7f38c`; exact-head 20-test Linux selection `42046449942`, Core/Maestro/Schema typecheck `42043649555`; earlier macOS and named Windows controls above | Scoped checks passed; not full campaign/epic acceptance |
| Durable host round and Session fanout | `00c4885f67` passed 12 tests in `42047353297`; `8e039ac8ad` passed both durable tests in `42049825805`, Core/Maestro/Schema/Client typecheck `42049693047` and five Windows round cases in `42053270960` | Omitted admission failed both explicit inbox assertions in `42049826309`; source review found retained-tier fallback, now under correction rather than declared closed |
| Public receipt Client generation | Construction branch `541eac8472`, remote `42044527613` | Complete chunked manifest, hashes, source tree and omni control verified; generated bytes are unchanged and no generated source was edited |

The first generator capture was incomplete and rejected: it had no final manifest
or omni verdict. The corrected capture awaits every bounded stdout chunk. Its
public Schema/Protocol/Client/Server inputs match the current round runtime;
`round-client-generation-identities.json` records that comparison and the full
generated-byte recovery. This was an actual remote `bun run generate` from
`packages/client`, not a local generator or hand-written generated output.

Round-reader mutation `42048663125` removed only the receipt-binding check in the
reader's execution path and changed its expected mismatch into `ok`. A separate
omitted-admission mutation in that request failed first at the scripted provider's
empty-context parser; that failure is **not** accepted as the intended durable
admission assertion. The final fixture checks the actual durable inbox even when
execution fails. In `42049826309`, omitting only the real `sessions.prompt`
admission failed both named SQL assertions with `Expected: > 0`, `Received: 0`.
The matching unmodified source passed in `42049825805`. Complete uploaded trees,
full logs and the comparator's deliberately altered-file control were verified
for both requests and typecheck `42049693047`; their identities and full-log hashes
are in `current-unit-closure-identities.json`. All mutations were restored exactly,
including a successful `git diff --exit-code HEAD` after the server restart. No
completed test or typecheck was rerun for recovery.

Two fixture syntax failures were repaired by the lead. A lightweight in-memory
syntax parser, calibrated with valid and invalid source controls, checked the
affected files without executing tests, typechecking, building the app or running
a local generator. All behavioral execution remains remote.

Direct Windows request `42053270960` passed the three pure host-round cases and
both registered governed publication/continuation cases at `8e039ac8ad`, with
complete source-tree and full-log verification. The registered fixture scripts
the Session port; this closes the named cross-platform receipt dependency check,
not production durable Windows fanout or the later tier-drift correction.

- The actual Ruff primitive also executed on macOS in `42032806682` at
  `901ff045ea` (10 tests). Full uploaded trees for both native OS requests and
  the repository/finding mutations match their intended source, including only
  the one prescribed source mutation. Evidence: `ruff-mutation-identities.json`
  and the corresponding complete logs/assertion lists in `lucy-ci-evidence`.
- Governed finding mutation `42032772141` removed only the pre-publication
  host-finding validator. The fully valid Standard omission case then published
  `APPROVE` and failed its `unverified-finding` assertion. The validator was
  restored exactly. This is load-bearing publication evidence, unlike the
  earlier fixture reach failures.
- Probe-observer removal `42035233492` failed both observation tests. Omitting
  the captured effective catalog at the real analyzer call failed both affected
  registered-request cases in `42036626206`. Both mutations were restored to the
  original head. Complete uploaded-source/log review for both is recorded in
  `closure-wave-identities.json`.
- Ruff analyzer/catalog composition at `685f25d126` executed 48 Core tests in
  `42033350392` and 48 Maestro tests in `42033648467`. A source rereview then found
  a shared selected-SQL traversal/filter mismatch; `686e9bfdb8` refuses invalid
  lexical selections before any known pack dispatch. Its independent SQL control
  initially compared unrelated raw/normalized output ordering; repair
  `0d2d7c1d55` binds a literal native rule identity instead. The corrected SQL
  selection passed nine tests in `42037094426` at `8432e11ea1`.
- Ruff's actual analyzer passed seven macOS cases in `42035590708` at
  `f292edbe65`, including copied-tree selection and rule-status behavior. Its
  source/log comparison is recorded in `closure-wave-identities.json`. Ignoring
  native exclusions failed the intended F821 assertion in `42041347994`, and the
  source was restored. No complete-network-isolation claim follows.
- Windows request `42037280582` is red: the primitive returned `not-run` where
  its frozen adapter contract requires `unsupported`. Repair `ce50cde53e` and
  the explicitly named refusal test `f221836dec` were integrated in `e021d7f38c`.
  The four-test Windows refusal selection passed in `42041979491`, with source/log
  identity verification. Windows native Ruff execution remains unsupported; this
  does not establish governed-round Windows publication or continuation.
- Typecheck `42036995556` reached Maestro after Core and failed on finding-policy
  matcher types and precision-test service requirements. G4 and G6 own those
  fixture-only repairs, now integrated. Refreshed Core/Maestro/Schema typecheck
  `42043649555` passed at `e021d7f38c`.
- The proposed Unix private-store reuse for governed rereview was rejected by
  the lead because it would newly refuse Windows governed publication. The
  corrected [round freeze](rereview-authority-freeze.md) retains host routing and
  the actual executed tier on the same durable receipt. Corrected implementation
  is integrated in `8e039ac8ad`, including strict decoding, newest-FIX_FIRST
  selection, captured executed-tier pinning and Quick open-finding delivery.
  Client generation evidence is the accepted `42044527613` capture above, not the
  incomplete first capture or an earlier construction fixture.
- Initial durable-fanout test candidate `84fbe2f779` still replaced the production
  execution service with a manual coordinator layer. Cold review rejected that
  reach claim. The corrected fixture uses `SessionExecutionLocal.node`, actual
  `LocationServiceMap`, real `SessionV2.prompt`, real SessionRunner and unreplaced
  execution capture nodes; only provider responses are scripted. The remote
  positives and explicit admission-omission failures are named above. This is
  scoped fixture evidence, not universal platform or full-module acceptance.
- Actionlint source capture `0946588310` records actual release `v1.7.12`, five
  independently hashed archives and its licence source. Repository config
  discovery survives `-config-file`; no actionlint runtime contract or native
  compatibility acceptance is established by that capture.

### Recovery ownership and remaining closure

All paths below are under the approved session temporary root
`/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode`, except the
receipt checkout. The lead owns these integration/check worktrees; author
archives remain preserved and are not substitutes for the corrected candidates.

| Worktree | Branch / frozen head | Role |
| --- | --- | --- |
| `lucy-precision-runtime` | `lucy-round-runtime` / `8e039ac8ad` | Authoritative round and durable Session candidate |
| `lucy-wave-g2` | `lucy-ruff-runtime` / `e021d7f38c` | Ruff/native integration candidate |
| `lucy-check-provenance-negative` | `lucy-round-mutant` / `8e039ac8ad` | Mutation source restored exactly; no mutation is pending |
| `lucy-diagnostic-pr` | `lucy-round-generate` / `541eac8472` | Construction-only remote generator capture; not PR #1331's branch |
| `lucy-pr-runtime-check` | `lucy-outcome-runtime` / `3992b3302a` | Preserved outcome predecessor |
| `lucy-ci-evidence` | Non-worktree evidence directory | Full logs, uploaded-tree comparisons and generation bytes/manifests |
| Current receipt checkout | `lucy-queue-receipts` | Recovery documentation only; never a runtime bundle base |

T4's bounded source review accepted the durable-inbox oracle's fixture reach but
returned FIX-FIRST for retained-tier catalog drift: the fanout passed the saved
executed tier through current `runTier`, which could silently fall back from
Standard to Quick. G1 owns the exact-built-tier lookup/refusal repair; G2 owns
independent fanout tests for later Deep availability and removed/unbuilt retained
tiers. Both use isolated branches from `8e039ac8ad`, with disjoint production/test
files. This is closure of the existing round front, not a new feature front.
Direct Windows governed-round acceptance at the unchanged `8e039ac8ad` completed
in `42053270960`; completed Linux/typecheck requests were not relaunched. No automatic Relay stop
hook is established; the lead verifies source, mutations and logs directly rather
than claiming hook enforcement.

Next: finish the retained-tier repair and its independent controls, then close the
existing Godfile reductions under [the source-preserving freeze](fanout-reduction-freeze.md).
That freeze has not been dispatched and does not waive either oversized file.
Remaining phase-4 packs/offline advisories and phase-5–7 runtime work stay open.
No campaign PR is merged, no final campaign epic has run, and Lucy is not complete.

| Unit | Branch | State | Next gate |
| --- | --- | --- | --- |
| Phase 1: routed review seat | `lucy-core`; repairs on `lucy-repairs` | PR #1290 remains at `4e1ae3b781`; repairs through `750a23b8ed` pushed separately; merge remains unauthorized | LF gate now passed both OSes; dependency-shadow implementation and stronger alias controls are in parallel construction/review |
| Phase 2: queue receipts | `lucy-queue-receipts` | Code through `b113ad3670` passed remote typecheck and the corrected 40-case suite; cold source review approved with execution limits; no PR or epic | Hold the separate phase bundle until its phase 1 landing dependency is satisfied |
| Phase 3: lenses and overlays | Parallel slice branches; see `parallel-wave.md` | Catalog, ast-grep, runtime tree prose, Own access, card-only completion and independent acceptance work are being built/reviewed; none is declared landed | Restore all existing gate assertions, combine the actual tree/catalog seam, validate native scopes and implement the plain PR request |
| Phases 4–7 | Separate preparation branches | Pack-license validation is authored; language, Deep and audit/compliance execution candidates are persisted or being reviewed; these are not implemented phases | Freeze the remaining contracts and dispatch the next ready backend slices while surgical checks run |

## Recovery wave

Baseline: phase 1 `4e1ae3b781`, phase 2 `b2d9515222`. Four isolated, read-only agents; no shared write paths. No automatic relay hook has been established for this wave; the lead must verify the returned evidence directly.

Those reviews completed and the same isolated agents then produced scoped backend/planning changes. Repeated model-access verification errors stopped their later assignments. The lead preserved their commits and partial edits, reviewed them and resumed integration; no agent is currently editing a shared path.

| Assignment | Role | Scope | Required return |
| --- | --- | --- | --- |
| CI inventory | Investigator | Exact-head epic job logs, every failed or incomplete lane | Failure inventory, saved log paths, targeted reproduction commands; no reruns |
| Queue receipts | Cold reviewer | K12 selection, queue refusal, PR rendering, regression coverage | Concrete counterexamples and missing acceptance cases; no implementation |
| Review bindings | Cold reviewer | Fan-out lifecycle, exact tree snapshots, candidate option scope, probe evidence | Concrete defects and smallest regression cases; no implementation |
| Phase 3 packet | Architecture | Approved WPs 3.1–3.5, catalog/tree contract and backend ast-grep pin | Ready slice, frozen IDs, acceptance cases, genuine blockers; no implementation |

The lead owns fixes, integration, CI dispatches, PRs and this ledger. After a finding is accepted, code work goes to a backend assignment with explicit files and acceptance; planning stays with architecture. Agent reports are not test evidence. A passing regression test still needs a deliberately broken control before it supports a correctness claim.

## Evidence already collected

- Phase 1 typecheck passed on `fafe79fd24`: run `41903291797`. This is not evidence for later heads.
- Phase 1 initial epic `41912565640` failed. Two fixes were pushed: database schema snapshot (`b3e286c5c5`) and regenerated Atlas surface bundle (`4e1ae3b781`). Other failures have not yet been exhaustively classified.
- The review binding test passed in run `41888203224`, but it accepts `pass`, `fail`, or `not-run`; it does **not** prove that a confined probe actually executed.
- Plain-task settlement test passed in run `41889549135`; the richer card is connected to task metadata.
- Phase 2 runs `41914594440` and `41915052348` exercised the initial queue refusal and a pure receipt fold. They do **not** close cross-validation selection, renderer behavior, legacy decoding, or mutation coverage.
- `bun run check:guards --base origin/dev` ran on the phase 2 recovery baseline and reported no findings. Guard execution is not behavioral verification.
- Phase 2 baseline tests ran in CI as `41917566917`: 28 passed across receipt, queue, tools and scoped-queue files. Cold review still found missing acceptance cases; this run does not close those findings.
- Phase 2 baseline typecheck `41917211583` failed at `review-receipts.ts`: the issue selector took an unbranded string. The backend repair packet includes the canonical issue ID type.

## Accepted findings and assigned repairs

| Finding | Owner | State |
| --- | --- | --- |
| Godfile rejects review contracts and app wire growth | Backend contract split | Extracted in `28ea1c76a1`; remote typecheck passed at `6746341910` |
| Godfile rejects the fan-out, session runner and generated schema growth | Lead integration | Source-preserving extractions and generated split installed; actual complete Godfile gate still outstanding; no limit/waiver changes |
| Code-stage review head is a Git tree, but snapshot creation requires a commit | Backend exact-tree slice | Literal materialization in `6b03b6e2f9`; tree mutation went red; Linux and Windows snapshot tests passed |
| `git archive` transforms or omits reviewed bytes through export attributes | Backend exact-tree slice | Literal object reads and export-attribute controls passed on Linux and Windows |
| Queue folds validation-stage pairs instead of the newest linked stage | Backend queue slice | `064801c598`; host note time/rowid order, canonical v1/v2 decoding and P1 legacy counts; replacement mutation went red |
| Queue can admit after a receipt changes during external checks | Backend queue slice | Final-transaction recheck in `064801c598`; actual PR-head-window mutation went red; latest test projection assertion corrected |
| Atlas PR renderer discards receipt identity, method and counts | Lead integration | Real CI-generated record boundary installed in `17c5b89d96`; metadata/legacy/privacy render cases passed |
| Verifier permissions union options across candidates | Lead integration | Candidate-scoped map/unknown-candidate refusal passed scoped core tests; union mutation failed the intended assertion in `41928312729` |
| Reanalysis leaves paging URI, checks and unread counts on the earlier run | Lead integration | Latest-analysis case executed and passed in `41930216671`; focused mutation coverage still outstanding |
| Raw history and probe citations have no production retention callback | Lead integration | Real binding/citation reopening passed `41930216671` and `41934312621`; cache remains OS-managed temporary storage, not permanent archival storage |
| Overlapping review scopes can remove another binding | Lead integration | Real-tool duplicate-binding regression passed within the scoped binding runs; targeted mutation evidence still outstanding |
| Probe cancellation can interrupt restoration of shared snapshot bytes | Lead integration | Real hunk/base-write acquisition cases passed Linux `41933632905`; old bracket mutation failed both intended cases `41932832457`; delayed-undo cancellation remains unproved |
| Workspace dependency symlinks can reach live source outside the reviewed snapshot | Lead integration | Qualified shadow-graph packet frozen; implementation held for per-OS shared-inode proof; bare external-script imports remain separate open runner work |

## Latest verification evidence

- Epic `41916276400` completed **failure** on `4e1ae3b781`. Its only failed jobs were Godfile (`126877549418`) and Windows core 6/8 (`126877549358`); all other selected jobs succeeded. The Godfile failure skipped later steps in that lane; Windows E2E was not selected. No claim of a complete green epic.
- Windows failure was the tar interpretation of a drive-letter path in `scratch-copy.test.ts`. Literal Git-object materialization removes tar from that path, but Windows verification remains required.
- Snapshot negative control `41920833626` restored the commit-only resolver and failed the intended Git-tree test. Corrected Linux run `41921460350` passed 18 tests with one Windows-only skip.
- Remote typecheck `41924376022` passed on repair head `6746341910`. Later binding changes are not covered by this result.
- Schema generator run `41923386362` passed real generation/check plus corrupt/missing-helper controls. The Bun lane did **not** upload the Playwright-only evidence directory; a follow-up exports generated source bytes in CI logs for checksum-verified installation.
- Initial queue mutation attempt `41924326448` failed at import acquisition, not at the intended assertions. Its new test imported a private, unexported package subpath; that import was corrected without widening the production export surface.
- Queue negative controls `41925094323` failed both intended cases: retaining older validation-stage pairs and removing the final admission recheck. The same run generated the real Atlas record boundary; its stale-committed-bytes check failed as expected before installing those outputs.
- Expanded phase 2 run `41926003383` passed 39 tests; one new test had a mistaken `Held.id` projection after its actual admission-refusal assertions passed. The test now reads `Held.receipt.id`; the run remains red, not accepted as a final gate.
- Phase 2 typecheck `41925926902` failed on union-Option narrowing and new test types. Corrections unwrap each canonical decoder before joining the results, capture the fixture's database service and use a named generated-file presence check; the subsequent result is recorded below.
- Those phase 2 corrections passed remote typecheck `41926736045` on `b113ad3670`. The corrected 40-case acceptance suite still needs a final successful run.
- Follow-up schema generator run `41926918997` passed and its generated main/helper bytes were recovered from the full job log, checksum-verified and installed. A byte comparison reconstructed the prior schema exactly by reinserting the extracted statement; no SQL or execution-order change was found in this extraction.
- Repair commits `754ba6f717` (schema split) and `111495e088` (citation retention and cancellation bracket) are preserved separately. Citation storage is the existing temporary analysis cache, not an indefinite archive. Scoped positive/negative controls remain in progress.
- A local `check:godfile` scan timed out without a verdict. It is **not** a green gate. Targeted source inspection measured the repaired main schema at 919 nonblank lines (existing waiver 946) and fan-out at 730 (limit 750); the actual CI gate remains required.
- Repair remote typecheck `41927910268` passed on `111495e088`, including candidate-scoped offers, latest-analysis bindings, duplicate-binding refusal, citation retention and the snapshot mutation bracket. The later `caa10de54f` changes only the user guide.
- Negative-control run `41928312729` restored unioned verifier options and unbracketed copy mutation. The candidate-scope assertion and both cancellation cases failed at their intended assertions; the mutations were restored before the positive batch.
- The serial scoped batch completed, starting one `test:ci` request at a time and saving separate logs under `lucy-ci-evidence/{phase2-final,repair-core-both,repair-maestro,repair-schema,repair-app}.log`. Its only failed selection was repair core on Windows, whose generator-path defect is tracked below. No epic was armed.
- Phase 2's corrected suite passed as `41928761769`: 40 tests across six files, including the actual generated Atlas record boundary and the PR-head admission window. Together with typecheck `41926736045`, this closes the phase-scoped gate on the current production/test code; later ledger commits are documentation-only.

## Second cold review and follow-ups

- Independent queue review approved the K12 source delta with limits: it did not run tests or verify CI. The lead checked its claims against the separately collected scoped evidence above.
- Independent binding review approved the scoped source delta but identified a coverage gap: the two named cancellation cases exercise the same bracket helper, not both real `ReviewProbe.run` mutation paths or the actual shared permit. A backend slice on `lucy-probe-cancel` adds deterministic real-write cancellation plus an actual queued probe for each path. Until that slice is verified, cancellation is not fully closed.
- Independent extraction review approved runtime identities, app exports, helper behavior, the comment-only runner change and SQL/order preservation. `baseRules` inlines the equivalent `unique` implementation; it is behavior-preserving, not literally identical source. It also found the generator test regenerated before checking committed bytes. A separate `lucy-schema-pin` slice extends the test to check committed output first and require generation to leave both modules byte-identical.
- Architecture prepared a bounded dependency-shadow repair for the remaining live-workspace symlink issue. The packet uses independent directories, shared read-only dependency inodes and remapped reviewed workspace targets; host mutation paths must exclude dependency roots. Policy bounds selected by the lead are 100000 entries, 32 MiB cumulative relative-path bytes, concurrency 8 and link depth 40, not measured performance claims. An independent critic reviews dispatch readiness before implementation.
- Dependency implementation must follow the verified real-cancellation slice before touching `scratch-copy.ts`; no concurrent writes to that shared file are authorized. Arbitrary absolute imports and editable loaders remain explicit limits, not solved by a symlink graph.
- Dependency packet `45df7a71cf` was persisted, then qualified by `d1bb235963` after a cold critic found that JS/TS scripts originate outside the snapshot. Anchored actual-script cases and ordinary test entrypoints are now distinct acceptance items. Bare script imports remain separately open; this packet does not change runner resolution. The critic confirmed READY only within that stated reach and after the cancellation prerequisite.
- The initial cross-platform repair run `41929465754` passed on Linux (46 passed, three skipped). Windows had 35 passed, 12 skipped and one generator failure: the glob path was split on `/`, producing `migration.sql/migration.sql` under Windows separators. The scoped Windows snapshot/probe assertions did not reproduce the original tar failure, but the complete Windows selection remains red until generator repair `5b30717e30` is verified.
- Generator test pinning is committed as `f84b1b8ac2`; Windows path normalization as `5b30717e30`; both are pushed on `lucy-schema-pin`, not yet integrated into the frozen positive batch tree. The real cancellation slice `cf279b34f2` and its corrected fiber-exit assertion `85a2b0e133` are pushed on `lucy-probe-cancel`. Lead review found and corrected the original inspection of `void`; an independent reviewer now checks the new slice. Its scoped core typecheck was dispatched; actual-path negative/positive tests remain required.
- Remaining completed batch results: Maestro `41930216671` passed 29 tests across four files; schema manifest `41930910273` passed six; app governance data `41931300172` passed 20. The lead fetched the full Maestro job log and confirmed the actual binding/probe-marker and latest-analysis cases executed, rather than inferring them from an aggregate count.
- Core-only remote typecheck `41931137697` passed cancellation slice `85a2b0e133`. A subsequent cold review still requested a bounded writer-pause/first-probe-completion rendezvous with an early-`not-run` control; that follow-up is being prepared before actual-path runtime tests. The pause is after the real write and before its Promise returns, not proof that kernel IO remains active. Delayed-undo cancellation is not yet covered.
- With the initial batch finished, the lead staged schema pinning/path fixes and the qualified dependency packet on `lucy-repairs` (`5e21a15886`, `5fce2705b4`, `cb3c88f318`, `8b616c5c27`). Deliberately stale committed-helper run `41932063553` failed the new initial drift assertion before regeneration. The generated helper was restored exactly before further integration.
- The bounded actual-path cancellation test and early-result control were committed as `77fd3d7b90`, then staged with the Writer slice on `lucy-repairs` through `61d7a6a729`; both branches are pushed. Negative run `41932832457` passed the real early-result control and failed both actual queued-probe cases on the intended wrong bytes after cancellation. The bracket was restored before the positive follow-up. Full remote repair typecheck `41932485176` passed on `61d7a6a729`.
- The positive follow-up completed: `41933632905` passed Linux (48 passed, three skipped), but Windows remained red (35 passed, 14 skipped, one initial committed-schema drift failure). The prior `migration.sql/migration.sql` error is fixed; this is a distinct byte mismatch before generation. The lead fetched the full Linux log and confirmed both real cancellation cases plus the early-result control executed. Maestro binding `41934312621` passed its actual probe/citation case against the default Writer. Logs are `lucy-ci-evidence/repair-core-final.log`, `repair-core-final-linux-full.log` and `repair-binding-final.log`.
- Additional dependency-plan criticism found a missing acceptance, not a measured vulnerability: a child might hardlink an original or shadow dependency inode into its writable jail scratch and mutate data/mode through that alias. The design now requires valid-source and writable-scratch controls plus alias write/chmod attempts and outside byte/mode oracles. Real-srt Linux and separate real-seatbelt macOS evidence are prerequisites; Linux cannot establish macOS behavior. A test-only preflight is being authored with owned fixture files, never actual user dependencies. Dependency implementation remains held pending that evidence and the cancellation baseline.
- That per-platform alias oracle is persisted and pushed as `121f772394` on `lucy-links-plan`. It qualifies the policy claim rather than asserting an exploit or authorizing a production sandbox change.

## Current frozen proof queue

- Shared-inode preflight `b5f21aeadf89ec82766726e9b6099254cf6eee79` is pushed on `lucy-inode-proof`; lead checkout `lucy-inode-check` is frozen at that commit. It uses only owned fixture files and checks real shared-inode identity, source reads, writable-scratch controls, independent alias attempts, and outside bytes/modes after exit and jail cleanup. Missing Linux/macOS jails fail rather than skip. A separate core-only remote typecheck was requested for this test.
- LF-policy candidate `568066d19e` is pushed on `lucy-schema-eol` and integrated as `750a23b8ed` on `lucy-repairs`. Only `.gitattributes` and failure-only test diagnostics changed: exact equality and pre-generation checking remain intact; no generator or generated bytes changed. CRLF checkout is a hypothesis, not a measured diagnosis of the previous Windows mismatch.
- One serial queue now requests the named inode preflight on Linux, the same frozen test separately on macOS, then `database-schema-generation.test.ts --os both` on frozen repair head `750a23b8ed`. Logs are `lucy-ci-evidence/{inode-linux,inode-macos,schema-eol-both}.log`. Neither platform result may be inferred from the other. Any observed alias mutation blocks hardlink-shadow dispatch and requires a new design/policy decision; no assertion may be weakened to pass.

That queue completed. Linux `41935716036` and macOS `41936054079` executed
source-read and writable-scratch controls; both original/shadow alias creations
were refused (`EXDEV` and `EPERM` respectively), with unchanged outside bytes and
modes. Alias write/chmod branches therefore did not execute: these runs prove the
valid-source aliases could not be created in those jails, not universal protection
against arbitrary existing aliases. Cold review requested a positive same-jail
hardlink control; follow-up `aa387f4b24` adds it and source-file hashing. Its new
controls require fresh separate Linux/macOS runs before acceptance.

Schema run `41936478927` passed the named exact committed-byte/generation and
corrupt/missing-helper test on Linux and Windows. The LF-policy candidate and
tested integration commit have identical source trees. The lead independently
compared every uploaded blob/gitlink path, mode and hash against the expected
commit for all three runs, excluding only `.ci-run.json`; all source trees matched.
Core-only typecheck `41935569817` passed the original inode preflight commit.

## Parallel construction and small PRs

The owner requested six `xai/grok-4.7` and four `openai/gpt-6.1-terra` tasks.
The exact dispatched sessions, file ownership, contracts and integration order are
recorded in [parallel-wave.md](parallel-wave.md). Ten isolated task sessions were
started; completed tasks receive the next ready execution or independent-review
assignment instead of waiting for unrelated CI. No automatic Relay hook is claimed.

- Small stacked PR [#1304](https://github.com/gustavomhss/hugr-orchestra/pull/1304)
  carries only the LF attribute and failure diagnostics. Independent source review
  approved with evidence limits. It targets frozen predecessor `lucy-repair-base`,
  not `dev`, and carries no epic label.
- Small stacked PR [#1305](https://github.com/gustavomhss/hugr-orchestra/pull/1305)
  carries the original one-file inode preflight. The stronger scratch-link control
  is authored separately; review is qualified, not a blanket safety approval.
- Card-only completion `65392d429c` is source-reviewed separately from its author.
  Negative control `41938742180` removed the receipt filter and failed the intended
  stored-scope assertion; the original code was restored. The surgical positive
  queue runs `v2-review-fanout.test.ts`, then the strengthened inode test separately
  on Linux and macOS. No epic was armed.
- Lead review found that the first standalone card validator allowed a model to
  omit host-confirmed blocking findings and return APPROVE. Correction `d523092ff1`
  is authored; runtime proof and registered-request integration remain pending.
- Lead review rejected the catalog slice's replacement of real-tree/fixture gate
  assertions with subset checks, synthetic nodes and TODOs. The author was directed
  to restore the exact real-tree checks and extend legitimate unit fixtures. An
  intentionally RED integration seam must not be converted into a vacuous green.
- Atlas review initially received the test-first commit `d37b016a9e` instead of
  actual feature tip `a37312bc25`; the lead corrected that baseline and the grant
  follow-up dependency. The test-only review finding is not evidence against the
  unread feature tip. Native-reader and actual scoped-access claims remain distinct.
- Privacy primary-source access gaps remain explicit. Indexed excerpts alone do
  not close the full direct-source capture requirement or certify compliance.

### Surgical follow-up results

- Card-only completion `65392d429c` passed the changed fanout file's nine tests
  in `41939128598`; exact-head Maestro typecheck `41938574280` passed. The full
  job log confirms the new policy and untrusted PR-text cases executed. This does
  not claim registered-request or final-card validation coverage.
- The strengthened inode control `aa387f4b24` passed Linux `41939461225` and
  macOS `41939989712`. Both printed `TMPDIR_LINK_OK`, proving the hardlink
  operation succeeds within writable jail scratch, while the two valid outside
  source aliases remained refused. Outside bytes/modes stayed unchanged. The
  lead read full logs, matched source SHA-256 and compared complete uploaded source
  trees to the frozen commits; the comparison detected a deliberately changed
  known entry. This closes the requested instrument-control gap for these alias
  attempts, not arbitrary preexisting aliases or complete runtime hermeticity.
- PR #1305 was fast-forwarded to the stronger control. Small stacked PR
  [#1306](https://github.com/gustavomhss/hugr-orchestra/pull/1306) carries card-only
  completion; [#1307](https://github.com/gustavomhss/hugr-orchestra/pull/1307) carries
  native Own reading; [#1308](https://github.com/gustavomhss/hugr-orchestra/pull/1308)
  adds the separate native permission-floor/stage-scope integration. The last two
  still require surgical runtime checks. None carries a newly armed epic.
- Independent source review approved actual Atlas reader tip `a37312bc25` with
  limits. Its original tests use a permission-service fixture; real scope/floor
  charging is a separate authored test, not evidence already executed.
- The standalone card validator remains unaccepted until its latest identity and
  verdict corrections pass independent review and actual tests. Delayed-undo
  coverage also remains held: cold review found the proposed detached-undo negative
  control was scheduler-dependent and could miss early permit release.

### Next surgical queue and explicit holds

The serial red-control queue requests only the new pack-license test, the new
Atlas scope test, and the two new phase-3 acceptance files (one package per
request). License and Atlas controls are deliberately mutated in the lead's
isolated `lucy-license-check` and `lucy-atlas-check` checkouts. Restore the license
filter and verifier's common-read inheritance before positive runs. The acceptance
checkout is the unchanged `lucy-wave-g6` branch at `cb0405c561`; its missing-feature
RED must be distinguished from import/acquisition failure. No epic is running.

Dependency implementation `b1c314444c` and independent actual-probe acceptance
`2fa227f922` are authored, not executed. Lead review rejected the implementation's
preservation of arbitrary absolute external symlinks: that violates the frozen
closure even though arbitrary absolute imports embedded in executable code remain
an explicit limitation. The author is correcting this with sibling-worktree and
external-target refusal cases before integration.

Ast-grep is now packaged as three small dependent slices rather than one large
delivery. Cold review found malformed/unknown/outside report rows could become
an empty successful check. A strict parser/acquisition-error correction is being
applied through that stack before any conformance result is accepted. Verified
binary provisioning is confined to isolated remote test-host setup, never a
production review or this machine.

## Rolling verification after the first parallel wave

The negative controls completed and were classified from their actual assertions:

- `41941642328`: removing the license filter admitted `invoke` with a pinned
  backend; the expected license assertion failed. The mutation was restored.
- `41942187953`: verifier inheritance from lead exposed `atlas_context`; both the
  stage assertion and actual `SessionStore.charge` refusal failed. Restored.
- `41944146856`: disabling confirmed-finding completeness let both Standard and
  Quick omit host-confirmed blocking findings and approve. Both intended tests
  failed. Restored before the positive request.
- `41944701983`: disabling the known ast-grep rule guard admitted `hostile-const`;
  the strict acquisition-error assertion failed. Restored before positive tests.

Baseline acceptance `41942717038` failed on missing phase-3 catalog lenses,
profile, overlays and pack, rather than an import error. Tree run `41943251192`
failed at the actual seat-root declaration boundary; it does **not** show that
missing-node, unknown-reference or unreachable-node negative checks ran.

### Positive runs, including failures

- Atlas `41944205185` executed 38 tests across the seven changed/boundary files
  on `fa64af17e9`, including existing memory/header/resume denials. Full job logs
  were read and the uploaded source tree matched that commit, excluding only the
  request file; a deliberately changed entry calibrated the comparison. These are
  registered-tool/direct-store proofs, not a driven LLM settlement or fanout.
  Remote typecheck `41943134122` nevertheless failed four type errors. Corrective
  `8c7e38d341` is authored and still needs exact-head verification.
- License positive `41943599766` failed because the missing-pin fixture supplied
  a present `undefined` value, which the base schema rejected before the expected
  custom diagnostic. Test-only `dec3ea5d08` now actually omits the key; the schema
  was not weakened. The original exact-head core typecheck `41942801161` passed.
- Combined catalog/tree source `bd78f55a98` ran catalog, route and independent
  acceptance in `41944825834`: 87 tests passed and eight failed. The failures are
  not waived. The class-citation test cannot read digits in `experience.a11y`;
  some route assertions incorrectly demand overlay provenance for an already
  catalog-routed lens or ignore explicit caps; the bare `Content-Type` suggestion
  also incorrectly matches `Content-Typed`. Targeted corrections are assigned;
  exact class equality, binding overlays, cap reporting and negative controls stay.

The next positive queue is scoped to the standalone card validator, ast-grep
pack/parser plus existing SARIF regressions, and corrected license fixture. No
final campaign epic has been requested or re-armed.

### Newly authored code and remaining boundaries

- Validator `68e0221094` also treats an explicitly supplied Quick host-confirmed
  list as authoritative. `474c53ceeb` separately exposes immutable host-confirmed
  records from fanout; neither is the registered PR request implementation.
- Privacy scopes `369d4a48d8` declare the audit root and restrict routed review
  access to the privacy leaf; source review and actual registered-skill tests are
  pending. Root declaration should close the named loader seam, not bypass it.
- PR Git evidence `9c7f29b34e` is authored. Lead review found its base inventory
  used the input base commit rather than the reviewed merge base; a corrective
  actual-Git fixture and fix are assigned. Registered request acceptance
  `39df49e9ab` is authored, unexecuted and intentionally RED until the handler lands.
- Dependency graph `70d87494d0` adds root/parent-link refusal, intermediate
  dependency-hop write exclusion, valid path-cap fixtures and interruption joining.
  Tests remain unexecuted. Publication cancellation has no deterministic proof yet;
  source-path replacement is not claimed OS-atomic.
- Ast-grep stack is now `ddf539d0f3` (pack), `c975c35d08` (binary proof) and
  `4f5e181df8` (analyzer). Native POSIX/Windows path identities and invalid-base raw
  artifact attribution were corrected. Real-binary conformance is still pending.
- Shared team-stack prose `eff633e17b` and Squawk source packet `cbdcc24a7d` are
  preparation. Squawk exit 1 is ambiguous without report validation; syntax errors,
  selected-rule semantics and safe file selection require a frozen host contract.
  These artifacts do not establish delivery of phase 4 or later phases.

### Exact-head follow-ups

- Small stacked PR [#1314](https://github.com/gustavomhss/hugr-orchestra/pull/1314)
  contains the ast-grep pack/parser only; [#1315](https://github.com/gustavomhss/hugr-orchestra/pull/1315)
  contains the standalone card validator only. Both state their unclosed integration
  and verification boundaries; neither received an epic label.
- Atlas corrected-head typecheck `41947300685` passed `8c7e38d341` for Core and
  Maestro; ast-grep pack typecheck `41947300874` passed `ddf539d0f3` for Core.
  These are package typechecks, not additional runtime conformance results.
- Validator typecheck `41943722923` failed on its Error override and widened test
  fixture literals. Graph typecheck `41947765798` failed on control-flow narrowing
  and an obsolete Effect API in its test. Both are assigned root corrections,
  without casts hiding errors or weakened assertions.
- Source-reviewed catalog corrections are pushed through `7455411687`, still
  unexecuted. Privacy disclosure/history corrections `64b788f52f` and `79b079b918`
  are also unexecuted. A child sentinel now tests the actual sensitive index, and
  unoffered or unsettled verifier histories become explicit questions rather than
  host-confirmed findings.
- Git evidence corrections `d946fa5bc5` use the merge-base inventory and reject
  lossy UTF-8 acquisition. The registered PR handler is still unimplemented. An
  additional exact-retry seam is being traced: a fresh analyzer artifact URI changes
  brief bytes under the same deterministic prompt ID. This must not be hidden by
  reusing model-card data as host evidence or silently reexecuting provider work.

Real ast-grep binary conformance is now requested remotely on frozen proof head
`c975c35d08`, with verified provisioning confined to an isolated test-host root.
It does not run a binary, install a tool or build anything on this machine.

### Active surgical requests

- Positive queue `sh_1a9401b88001Ep9Ka5YyhC0ZvH`: validator `68e0221094`,
  ast-grep pack `ddf539d0f3` plus SARIF regressions, corrected license `dec3ea5d08`.
- Binary conformance `sh_1a94a0853001ui9hsw3yGE0iNZ`: proof `c975c35d08`.
- Correction queue `sh_1a94d41b5001MCRbqiRHSNOKzD`: Atlas `8c7e38d341`
  changed files, then combined catalog/route/acceptance `7455411687`.

Inspect completion notifications and the named logs in `lucy-ci-evidence`; do not
poll or infer completion. Lead checkouts `lucy-card-check`, `lucy-astgrep-check`,
`lucy-license-check` and `lucy-atlas-check` had their deliberate mutations restored
before these positive requests. Authors are correcting graph and validator type
errors in their own branches; exact positive results on older heads remain bounded
to those heads. No source branch or preservation archive was reset or discarded.

The first positive queue completed: validator `41946979506` passed its 18 tests
on `68e0221094`; pack/parser and SARIF `41947526445` passed 13 tests on
`ddf539d0f3`; corrected license `41948234110` passed two tests on `dec3ea5d08`.
Full logs and complete uploaded source maps were checked against those frozen
commits, with deliberately changed comparison entries detected. Subsequent typed
or path refinements are not implicitly covered by these older-head results.

Real ast-grep conformance `41948511269` passed all three cases on Linux at
`c975c35d08`, with the declared omni positive control and 12 actual spawns. The
lead checked full logs and exact source identity, excluding only the request.
This is real pinned-CLI behavior, not proof of analyzer integration, every OS or
the newer native-path refinement. Latest stack heads are now `ce2c386a7c`,
`72c2c3ee00` and `3b1e0d56d4`; POSIX traversal separators follow native semantics.

Validator typed fix `3fdbeb86a2` is merged forward into host findings `dccfaea005`
and privacy scopes `1d91da66b2`. Graph corrections reach `4897b2bb49`, including
an unreadable-root fixture with an actual permission-failure control. New exact-head
typechecks were dispatched; no results are inferred before completion.

The next registered-handler contract is frozen in [pr-handler-freeze.md](pr-handler-freeze.md).
T2 owns the actual implementation, with host-facts replay artifacts explicitly
separate from governed receipts and fail-closed incomplete retries. G3 is preparing
the first Squawk adapter/parser primitive against tagged primary sources, without
claiming catalog/analyzer wiring or phase-4 completion.

Corrected catalog/route/acceptance run `41949055405` reports 96 passing tests on
`7455411687`; its full identity/control review remains the next evidence step.
Atlas correction `41948625724` instead failed before tests could execute: a new
exclusion constant is read during eager roster initialization before declaration.
This is a runtime initialization defect despite the exact-head typecheck passing,
not three exercised acceptance failures. G4 owns the source correction, and the
registered-PR integration owner was told to merge that fix before runtime proof.

The lead has now checked full logs and exact uploaded source identity for the
96-test catalog run `41949055405`, including the real-tree citation check,
unknown-reference control, independent overlay acceptance and explicit performance
lens cap. Its evidence says one performance lens runs and the second is capped;
it does not claim both executed.

Atlas source-ordering fix `9dd6c027a3` is pushed. A new full seven-file boundary
request `sh_1a95c6ea00016tw0YmsrYeHceV` and package-scoped typecheck are pending
on that tip. T2 was instructed to merge the actual fix into the handler integration
history rather than duplicate or rewrite it.

T2 pushed combined PR base `8c6312d8b5` and the first host-facts slice `475d68f9b7`.
The actual registered handler remains in construction, not delivered by that helper.
The lead froze same-candidate process-local serialization and first-writer-wins
artifact publication before authorizing continuation.

For delayed undo, independent source analysis found a conditional native-I/O-free
release-continuation interval that can support a controlled-scheduler negative
oracle. G5 is implementing a read-only release observer and actual public-probe
test on `lucy-undo-oracle`; neither the old scheduler-dependent test nor this new
approach is accepted without real remote positive and detached-undo mutation runs.

## Registered PR construction, acquisition failures and corrective review

The actual registered PR handler is pushed, not accepted as runtime-complete.
Its initial stack is base `8c6312d8b5`, first-writer facts `8889fa8508`, candidate
mutex `52301b002d` and wiring `1d2f7a7fd9`. Independent leaf review approved the
source with explicit runtime limits. Later facts `308a309094` and mutex tests
`0c6ee9f36d` were integrated at `085b21b568`; all published histories remain.
G6 stage-specific provider fixtures `7d599e9407` and retry cases `131c181e1c`
were integrated into `lucy-pr-runtime` at `1fe1aa2f69e966fb33b5cd733d380abfa44cdda2`.

The negative first-writer control `41951879709` replaced the no-replacement
hardlink with rename. The actual conflicting-writer assertion saw two successful
writers instead of one and failed as intended. The mutation was restored. This
does not prove the later private-store or cancellation corrections.

Snapshot uploads for PR runtime, dependency Linux/macOS and detached-undo control
then failed with GitHub primary API HTTP 403, before workflows/tests existed.
The quota exhaustion was reported at `2026-11-05 02:01:21 UTC`. These are acquisition
failures, not semantic acceptance REDs or greens. Logs are `pr-runtime-positive.log`,
`dependency-proof-linux.log`, `dependency-proof-macos.log` and shell output
`sh_1a96feb95001XG70YJRoDnewj3`. The detached-undo mutation was restored after that
failed upload. No local tests, builds, generators or typechecks replaced CI.

After a single quota check showed renewed availability, the lead resumed bounded
remote verification without changing the CI transport or harness:

- PR typecheck `41952343212` failed at `1fe1aa2f69`. The full log is retained as
  `pr-runtime-typecheck-failed.log`. Root errors are in test fixtures: Context tags
  confused with service interfaces, readonly list return types, `await` inside
  non-async `describe`, missing imports, and overconstrained Effect error channels.
  G6 owns those fixture corrections; G5's test-only Git evidence correction
  `b3d288465c` preserves real Git and the existing failure assertions.
- Dependency integration `273a5917a129cfda9e3965610d70fc91e6765316` combines graph
  `4897b2bb49` and real public-probe acceptance `2fa227f922`. Exact-head Core
  typecheck `41952343197` passed. Runtime graph/scratch/probe proof remains open.
- Undo oracle `ed6b7fdb39` adds a gated actual writer and a read-only release
  observer at the protected undo continuation. Linux/macOS require a jail;
  Windows is explicitly unsupported. Exact-head Core typecheck `41952343651`
  passed. Linux detached-undo negative `41954049384` reached the intended release
  observer assertion in both head-hunk and borrowed-base-test restorations: it
  observed `pending` before the real write gate opened. The declared omni control
  ran with 36 spawns. The mutation was restored before positive requests; this
  negative does not itself establish the restored implementation is correct.
- Atlas runtime `41950323544` passed all seven boundary files at `9dd6c027a3`.
  The lead now read full logs and compared the complete uploaded source map with
  that commit, excluding only the request file; a deliberately changed roster
  entry calibrated the comparison. Core/Maestro typecheck `41949979889` is also
  exact-head green. This is registered-tool/store evidence, not driven LLM fanout.

### Corrections still being proved

The original registered concurrency test's `onGit` signal precedes candidate
registration; one scheduler yield does not prove contention. It also counted a
printed retained URI rather than analyzer artifacts. The lead rejected that proof.
Observer `14f1ff4480` is integrated at handler `ddf331fff4` and is source-reviewed:
it runs inside protected use after registration, before semaphore admission, with
reference cleanup even if observation throws. G6 must use the actual admission
event and real `retained.json` artifacts; gate-bypass mutation remains mandatory.

Private facts review also found that missing UID/`O_NOFOLLOW` support had been
silently tolerated. Correction `c128750ae1`, integrated at handler `865ccfccb0`,
explicitly refuses unsupported platforms before store filesystem work. The lead
initially found only direct writer retirement in the facts commit; the author
then identified the separate composed proof in `865ccfccb0`. The lead read that
actual `lucy-pr-publication-lock.test.ts`: it uses the real candidate mutex,
admission observer, gated publication and different-key control. It remains
unexecuted; its interruption interval needs the actual mutation control, and no
runtime proof is inferred merely from the authored test or the author's report.

Squawk primitives `fa01702121` and jailed binary proof `b99ea72ac6` are authored,
unexecuted and FIX-FIRST. Review found lexical `.sql` checks accepted directories
and external symlinks. The proof derived its expected version from the mutable
manifest and omitted some scanned input trees from preservation. G3 must add
physical regular-file containment, an independent approved 2.67.0/integrity oracle
and complete source-preservation coverage before analyzer/catalog integration.
Network isolation remains untested, not implied by the jail configuration.

The corrective Squawk heads are now primitive `5abc61cc82` and dependent proof
`4f523fe975`. The lead read the actual physical-preflight and independent-pin
diffs. Independent review found the unit fixtures still used POSIX roots and
Windows-invalid filenames on Windows; G3 owns a test-only native-fixture correction.
A Core typecheck on the proof branch is pending.
The new `argv` is effectful and checks actual filesystem state, not a stronger
claim added to the old lexical-only helper. Neither head has runtime acceptance.

K13 generation, history, project-prior and window semantics remain open. A bounded
source-evidence packet `c464bcef56` is pushed. It identifies missing per-rule
generation and cross-session ordering evidence, plus model-supplied rather than
host-derived baseline K10 outcomes. These need a lead-frozen producer/adapter
contract, not invented historical catalogs. This is preparation, not delivery of
phases 4–7. No final epic is armed and #1290 remains unmerged.

The restored undo and dependency runtime queue `sh_1a97f268d001wZzKXPWZG8bEaR`
uses exact heads `ed6b7fdb39` and `273a5917a1`, with Linux and macOS selections
separate. It stops further uploads if quota acquisition fails again. Completion
notifications, exact assertions, required-jail/spawn controls and source identity
still need review before any positive runtime acceptance is recorded.

Small PR [#1319](https://github.com/gustavomhss/hugr-orchestra/pull/1319) now
contains only private replay facts/store and their own tests: 360 inserted lines
across three files, stacked on `lucy-pr-base`. Its body distinguishes the older
overwrite negative control from unexecuted newer ownership/cancellation fixes.
The composed lock test remains on the dependent handler stack; neither PR creation
nor independent source approval is a runtime acceptance or merge authorization.

An architecture-only original privacy-source capture is also assigned separately
from runtime edits. Direct statutory text and original WP248 must be captured or
their access failures recorded; indexed excerpts cannot silently close that gap.
Packet `481b95e624` records readable Commission/EDPB index and endorsement pages,
but no operative legal clauses. Statutory endpoints returned challenges/errors;
no challenge bypass is authorized. A normal download of the exact official WP248
PDF link is being attempted to distinguish a fetcher's MIME limitation from an
actual unavailable source; successful PDF reading is not yet recorded.

The complete Godfile gate still has no new green result. No cap increase, waiver,
campaign completion, benchmark/evaluation, genesis, app/server restart or merge
of #1290 has been authorized by these updates.

### Verified original guidance and receipt-branch ancestry correction

Original WP248 capture `032316a199` is now source-reviewed: the lead read the
official PDF with the native reader, checked its revision and the actual cited
pages, and matched downloaded bytes to SHA-256
`4de1ee2df6bbe9517847b45ba8b0657e7de4c1bd796f107d940df255ca6ded67`.
The specific original-guidance criteria/qualifications gap is closed; current
ePrivacy and UK statutory-source gaps remain open. The document is retained as
[privacy-primary-capture.md](privacy-primary-capture.md), not a compliance verdict.

The lead initially merged that source branch into this receipt branch at
`49dd28a0e5`. Because the receipt branch predates the construction baseline, this
also imported baseline runtime ancestors, despite the author's branch changing
only one document relative to `750a23b8ed`. The lead stopped publication and
reverted **its own merge** with `08d2cb0a23`, without resetting or rewriting any
published or author history. The staged tree after reversal matched pre-merge
receipt commit `63f3e1597e` exactly; the accidental merge was a differing control.
Only the reviewed document was then copied, byte-equal to `032316a199`.

This receipt branch is documentation/recovery state, **not a runtime integration
base**; do not merge its reverted runtime ancestry into the final campaign bundle.
Build that bundle from the frozen construction baseline and actual slice branches.
Before any future integration, inspect the destination-relative full file list,
not merely the author's diff against the construction baseline.

Latest registered proof is `eb3e7318ac`: the same-candidate Quick analyzer delta
is exactly one, and completed retry must not add artifacts. Its partial Session
double proves registered-tool control flow and host analysis only, not durable
Session prompt admission or an actual LLM fanout. Integration and remote proof
remain pending. Squawk native-fixture correction is pack `f01122ab21`, dependent
proof `6fa70a7a08`; its production filesystem checks are unchanged and unexecuted.

The lead integrated actual handler `865ccfccb0`, registered proof `eb3e7318ac`
and Git fixture fix `b3d288465c` into the existing runtime-check branch at
`4789e285eb8ca061e1ccb067953bbaae5a6c51fb`, then pushed it. Full changed file
lists were checked before these construction merges; none is a PR/trunk merge.
`check:guards --base origin/dev` on that integration reported no findings. This
is the named guard runner only, not a new complete Godfile or test-suite result.
Fresh package-scoped typechecks are dispatched for that PR runtime head and the
latest Squawk proof; results remain pending. No local typecheck or runtime test ran.

### Restored runtime results and next exact-head queue

- Restored undo `ed6b7fdb39` passed `41954378377` (Linux) and `41955192866`
  (macOS): both actual restoration cases and the platform control ran, with 38
  declared omni spawns per run. The lead read full logs and matched complete
  uploaded source trees, with calibrated changed-entry comparisons. These positives
  follow the intended Linux detached-undo negative `41954049384`; they establish
  this observer/actual-write/permit ordering, not universal native-I/O quiescence.
- Dependency integration `273a5917a1` passed Linux `41954701773`: 29 passing tests,
  one deliberately inapplicable no-jail fallback skipped, 436 declared omni spawns.
  The actual jailed probes, physical EXDEV and escape/refusal controls ran. Full
  logs and uploaded source identity were checked; this is not a new publication
  interruption proof.
- macOS `41955571042` passed its 29 behavior assertions but failed the omni control:
  the cross-device case declared a required spawn, then returned without one when
  no second volume existed. It is **not green**. Test correction `8942628389`
  registers that case explicitly unsupported without a second volume on macOS or
  Windows; Linux still fails if its second-volume instrument is unavailable.
  Cross-device behavior on an absent macOS volume remains unexercised, not proved
  by Linux. The correction is integrated at `1464181904`.
- Registered PR gate-bypass negative `41956281740` reached the intended identical
  reply assertion: the second actual registered request returned
  `pr-retry-incomplete` while the first returned a validated card. Only `withPermit`
  was bypassed; the observer remained. The lead verified the exact mutation source
  and full log, then restored it. This proves the test catches that bypass, not
  the unexecuted restored full PR path or durable Session prompt admission.

Typecheck `41955857580` on runtime `4789e285eb` found one remaining generic
fixture-environment inference error. G6's one-line concrete `HostEnv` fix
`d500a12a58` is integrated at `126cf84f43`. Squawk typecheck `41955857763`
found an uncalled `locate` function and conformance fixture type errors; test-only
`41e68d9c1c` fixes them without changing parser policy. Neither is implicitly green.

New scoped queue `sh_1a9969d36001gEDo36pBRv7Bc0` runs restored PR and governed
boundaries at `126cf84f43`, first real Squawk Linux units/binary proof at
`41e68d9c1c`, corrected dependency macOS boundaries at `1464181904`, then actual
unsupported replay-storage refusal on Windows. Separate exact-head typechecks
were dispatched for the corrected PR and Squawk heads.

Publication interruption negative `41957538210` completed at `126cf84f43` with
only the write's `uninterruptible` wrapper removed. It reached the intended
composed-lock assertion: `owner-retired` appeared while the actual publication
gate remained closed. The lead read the full log and verified the uploaded tree
against the exact base plus that sole mutation, with a changed-entry comparison
control. The wrapper was restored and the detached `lucy-publication-check`
checkout is clean. This is an intended negative, not a restored positive or proof
of durable Session execution/cross-process ownership. The restored composed test
is already selected in the pending exact-head PR queue; it was not redispatched.

The dependency publication retirement oracle is separately frozen and assigned
to G1 on `lucy-graph-retirement`; no result is claimed for that new construction.

### Latest restored cohort: failures classified without waivers

The next four-request queue completed; the final Windows upload stopped at primary
API HTTP 403 at `2026-11-05 02:57:59 UTC`. Further dispatch/uploads are paused again,
not replaced with local execution or a transport change.

- PR `41957317540` at `126cf84f43` ran 48 tests: 44 passed and four failed. The
  actual restored private-facts tests, mutex tests, composed publication-lock test,
  Git evidence, admission-bound registered retries, authored-tree checks and governed
  chain passed their assertions. The whole selection is **not green**. Two entry
  refusals stopped at `Tool safety HOLD: missing-native-binding`, before the intended
  leaf policy; G6 must use the existing native registry composition that captures
  Location/Event services, not disable safety or accept the HOLD as leaf proof.
  The Standard fanout test still expected only pre-phase-3 packs. The privacy scope
  test assumed a lens that the default Quick cap excludes. T2 owns exact fixture
  corrections: preserve `ast-grep`, preserve production caps, explicitly test the
  capped/default denial, and leave room in a clearly local catalog fixture for the
  real routed-leaf capability controls. No production authority widening is approved.
- Squawk `41957621440` at `41e68d9c1c` passed its ten unit cases and two binary cases,
  but failed the first binary case's unknown-rule splice assertion: its `Native`
  decoder strips message fields, so splicing projected rows failed `message-invalid`
  before reaching the unknown row. G3 must mutate the complete actual raw CLI row,
  not fabricate fields, weaken the parser or change error priority. The declared omni
  control passed with 11 spawns. The complete binary proof is **not green**.
- Corrected dependency macOS run `41957902025` at `1464181904` reports 28 passing
  tests, two explicit skips and a passing declared omni control with 432 spawns.
  Skips are the unavailable second-volume EXDEV case and the inapplicable no-jail
  fallback. Required real jailed probes still ran. The complete uploaded source-map
  and full-log verification remains pending API availability; no absent-volume
  macOS EXDEV or new publication interruption claim is inferred.
- Windows replay-storage refusal did not run: `pr-facts-unsupported-windows.log`
  records the failed snapshot upload and no workflow URL. It is an acquisition
  failure, not a refusal-test failure or Windows proof.

G1's new publication-retirement instrumentation/test is pushed through
`f530740ffd7436eb0c0225136b53f7825e53f980`. The lead required exact scratch-path
cleanup rather than global temp-directory inventory, actual symlink text in source
images, typed native-Promise gates and an asserted interrupted Exit. Independent
source review is pending. The scheduler/observer idea remains unaccepted until
the actual remove-join negative and restored Linux/macOS positives execute remotely.

The latest PR/Squawk typechecks were dispatched before quota exhaustion, but their
results have not yet been fetched. Earlier failures or subsequent source corrections
do not establish exact-head typecheck success. No final epic or #1290 merge is armed.

### Exact-head recovery after renewed quota

A bounded quota check at `2026-11-05 03:09:28 UTC` found 4430 of 5000 core
requests remaining. Scoped uploads resumed without changing the transport or
running local tests, builds, generators or typechecks. New requests still stop on
an acquisition HTTP 403; an earlier failure does not stand in for a Windows run.

Actual PR integration `e2883a8e515ab3f4ec302e5a5ed66b20c4a53513` contains native
registry fixture `e69bfd039b` and scope fixtures `599ee189ee`/`8ec3a08462`.
These preserve leaf safety, production lens caps and the exact phase-3 pack list.
The positive privacy fixture explicitly uses a local catalog with budget room;
the default capped privacy case must remain denied. Latest Squawk proof
`a4a9988d38` changes only the test's raw-row splice, preserving all actual CLI
fields except the deliberately unknown `rule_name`; the parser is unchanged.

Exact-head package typechecks passed on PR `e2883a8e51` in `41959889210` and
Squawk `a4a9988d38` in `41959888840`; their full logs are retained. These are
compile results, not runtime acceptance. Scoped queue `sh_1a9b298ab001ck57iXz3xBd8Fz`
runs the ten-file native/restored PR cohort, Squawk Linux, Squawk macOS only after
Linux succeeds, then the actual Windows replay refusal. Completion notifications,
full assertions, skips, controls and source identity remain to be classified.

Graph remove-join request `41960134070` at `028e1a6c52` failed parsing the test
at line 198, before any test or spawn executed. It proves nothing about the join.
The lead restored the production join immediately. Typecheck `41959890137`
confirmed that syntax failure, not a semantic regression. Author correction
`132c3b7f36` moves the timeout to the outer test's third argument and changes no
gate, observer or production join. Its sole test-file delta was reviewed and
integrated at `eaa229a857a1beb8c4aea623f59f285ad6f0dc80`; exact-head Core
typecheck `41961221456` passed. Fresh remove-join request
`sh_1a9bc7e66001ZoCsewAyPhU5JU` now uses that compilable head in the isolated
`lucy-graph-cancel-check`. Only `onInterrupt` joining is removed. Restore it after
classification; require the intended premature-retirement assertion, then restored
Linux/macOS positives. A parse, import or upload failure is not that negative.

User-guide packet `f2682b8731` changes only `docs/guides/review.md` relative to
its construction base. Independent source review found that its unavailable-check
wording overstated host enforcement: the current card validator does not validate
`checks` completeness or accepted-unavailable decisions, so a shape-valid `APPROVE`
with empty checks can pass. The guide is FIX-FIRST until it distinguishes method
expectations from host-enforced facts. The runtime enforcement gap is an open
campaign blocker, not excused by correcting prose or by the current card tests.
No runtime fix or completed phase is inferred from this documentation review.

Guide correction `d99dc795f7` now distinguishes the required method from actual
PR card validation, without relaxing the required-check policy or private-cache
refusals. The lead read the corrective diff and independent source review approved
that wording. Documentation-only [#1323](https://github.com/gustavomhss/hugr-orchestra/pull/1323)
is stacked on `lucy-pr-runtime`; its destination-relative full file list contains
only `docs/guides/review.md`. The named guard runner passed on that guide worktree.
No guide merge, runtime acceptance or release claim follows. A separate bounded
source packet is assigned to T3 to trace host check identity, settings, durability
and replay seams before the lead freezes a runtime correction.

The earlier pending macOS dependency verification is now complete for
`41957902025` at `1464181904`: the lead checked the entire uploaded source map,
calibrated the comparison with a changed test entry, and read full passing
assertions and both explicit skips. Evidence is retained as
`dependency-native-macos-identity.json` and `dependency-native-macos-full.log`.
This closes that source/log verification only; absent-volume macOS EXDEV and the
newer graph publication-retirement behavior remain outside its reach.

### Native PR, Squawk and Windows cohort verified

Queue `sh_1a9b298ab001ck57iXz3xBd8Fz` completed. The lead compared every complete
uploaded source map to its exact expected commit, using an intentionally changed
known entry as the comparison control, and read the named assertions and platform
skips in full job logs. Records are `native-squawk-windows-identities.json` and
the corresponding `*-full.log` files in the session evidence directory.

- PR integration `e2883a8e51`: `41960447127` passed all 48 tests in the selected
  ten files. Both previously held calls now reached their intended actual leaf
  refusals; the test still asserts no Git/child side effects for non-Maestro and
  no receipt authority for the card-only child. Private facts, composed publication
  lock, real Git scope, exact one-analyzer retry, capped/default privacy denial,
  local-room privacy authority, authored trees and governed regression passed.
  This proves registered-tool control flow and host analysis with the partial
  Session fixture, not durable Session prompt admission or driven LLM fanout.
- Squawk proof `a4a9988d38`: Linux `41960749697` and macOS `41961033927` each
  passed all 13 selected tests, including the three real pinned-binary cases and
  11 declared omni spawns per run. Warning/benign, raw unknown-rule, hostile
  config, syntax, literal glob and source-preservation controls ran. Physical
  preflight tests also passed. This closes those primitive/binary conformance
  proofs; analyzer/catalog integration and tested network isolation remain open.
- Windows `41961420731` at `e2883a8e51`: the actual unsupported-platform read and
  write refusal passed without store creation. Eight POSIX-only tests explicitly
  skipped. This is **one refusal test**, not nine passing tests or Windows private
  cache support. The previous failed upload is not part of this runtime proof.

Integrated PR evidence was added to #1319 with its exact heads and fixture limits;
the host-check enforcement gap remains explicitly blocking there.

Graph negative `41961563688` at `eaa229a857` parsed and ran, but its cancellation
case failed the dispatcher-creation handshake before the intended assertion. The
ordinary hardlink positive passed and the omni control saw 12 spawns. This is
still **not** a successful remove-join control. The join was restored before
author correction `fe2b2d053b`: an explicit initial worker yield, as in the proven
undo oracle, creates the actual scheduler dispatcher before public scratch creation.
No yield was added between interruption and the absence assertion. The sole test
delta was read and integrated at `1afec89f65405ff6f496ae79478acdfa40e6b0cb`;
exact-head Core typecheck `41961935270` passed.

Fresh graph remove-join request `sh_1a9c2a55b001fx2JxtR3sqPHeh` is in flight at
that head. Only production joining is removed in the detached mutation checkout.
Require the intended premature-retirement assertion, restore, then run restored
Linux/macOS positives. If another fixture failure precedes the intended assertion,
stop for causal diagnosis rather than treating any red run as acceptance.

Source packet `8c6510ff45` traces the host-check gap: analyzer checks and owner
settings exist, while fanout results and immutable PR replay facts omit trusted
checks, required obligations and entry-blocker state. Dynamic probe results need
their own binding. This is preparation for a lead-owned contract, not a runtime fix.
K10/K13 host outcome provenance, generation/history and phases 4–7 remain open;
no final campaign epic, cap waiver, #1290 merge or release has been armed.

### Graph join control reached the intended failure

Remove-join run `41962264928` at `1afec89f65` reached the actual retirement
assertion: the observer returned `pending` while the native publication gate was
still closed. Its ordinary hardlink positive passed, and the declared omni control
recorded 11 spawns. Unlike the earlier parse/handshake failures, this is the intended
negative. The lead read the full log and compared the entire uploaded source map
to the exact base plus the sole removed `onInterrupt` join; a deliberately changed
helper entry calibrated that comparison. Evidence is
`graph-join-negative-identity.json` and `graph-dispatcher-join-negative-full.log`.

The production join was restored immediately, and the detached mutation checkout
was checked clean before any positive request. Restored queue
`sh_1a9c55da3001wHdSdn6VQ8zJQh` now runs the retirement, dependency-shadow,
scratch-copy and public dependency-probe files at that exact head on Linux and
macOS. Those results and uploaded-source reviews remain pending; the negative
does not by itself prove the joined implementation is correct.

Small [#1324](https://github.com/gustavomhss/hugr-orchestra/pull/1324) contains only
the read-only graph instrumentation and retirement test, stacked on
`lucy-dependency-proof`. Its full destination-relative delta is two files. The
named guard runner passed; its body distinguishes the intended negative, earlier
fixture failures, exact-head typecheck and pending restored positives. This is
not a merge authorization, kernel-cancellation proof, HOST-permit proof or an
absent-volume macOS EXDEV claim.

### Restored graph publication proof accepted within its scope

The restored four-file cohort at `1afec89f65405ff6f496ae79478acdfa40e6b0cb`
completed on both supported platforms. Linux `41962586936` passed 31 tests with
one inapplicable no-jail fallback skipped and 447 declared omni spawns. macOS
`41963055820` passed 30 tests with two explicit skips and 443 declared omni
spawns. The macOS skips are the unavailable second-volume EXDEV case and the
inapplicable no-jail fallback; neither is counted as a passing assertion.

The lead read the full job logs and checked complete uploaded source identities
against the exact head, calibrating each comparison with a changed retirement-test
entry. Both actual retirement cases ran: interruption waits for native publication
settlement before the observer retires, and uninterrupted publication still creates
ordinary hardlinks and the expected `.bin` symlink. Exact scratch cleanup and
source bytes/modes/link images passed. Existing dependency escape/refusal controls
and real jailed probes also ran; Linux exercised physical EXDEV.

Together with intended remove-join negative `41962264928`, these restored positives
close the specific public-scratch native-publication retirement oracle. They do
not establish universal kernel cancellation, HOST permits, same-UID OS-atomic
replacement or physical EXDEV on an absent macOS volume. Records are
`graph-joined-positive-identities.json` and both `graph-joined-*-full.log` files.
#1324 now records these exact results and limits; it remains unmerged.

The next runtime blocker remains the host-owned required-check/entry-blocker
contract and immutable retry evidence, followed by K10/K13 provenance/generation
and the remaining phase-4–7 implementation. Current PR/primitive greens do not
complete the campaign. No final epic, cap waiver or #1290 merge is armed.

### Autonomous construction: host checks and precision foundations

The owner requested uninterrupted autonomous execution, with no intermediate
chat reports. Construction continues using the existing authorized task sessions;
this entry is recovery state, not a delivery or completion announcement.

The lead froze `host-check-freeze.md`, `precision-freeze.md` and
`outcome-binding-freeze.md`. Host check policy is on `lucy-check-policy`
(`602e6b144e`); actual probe observation, fanout facts, strict PR replay and
pre-publication scoped receipt authorization are on `lucy-check-wiring`
(`76a113e4a4`). Independent tests are on `lucy-check-tests` (`1e79c7198a`).
The actual integration is `lucy-check-runtime` at
`c2a69f8658351e572ca21d81ce23c66fa18ce440`, not the receipt branch.

- Restored cohort `42012068521` passed 72 tests in 11 files at that exact
  integration. It includes omitted/invented/altered/duplicate checks, exact id/lane
  acceptance, acquisition refusal, entry blockers, private immutable replay,
  registered PR leaf refusals, scoped recording and governed-chain regression.
- Removing only `ReviewChecksV2.validate(card, expected.checkFacts)` in a detached
  checkout at `5653d1b7bb` made `42010823179` fail six intended card/registered-PR
  cases while 18 existing cases passed. The call was restored exactly. This
  mutation proves the card binding, not every independent receipt gate.
- Exact-head Core and Maestro typecheck `42010491511` passed. Earlier
  `42006841655` and `42008399560` exposed acceptance-table narrowing and an old
  incomplete typed check fixture; these were fixed without changing runtime
  caps or weakening the assertions. Earlier test failures `42007223135` and
  `42009135382` were classified and repaired as fixture/expectation defects;
  neither is counted as an intended negative.

The pure precision reducer is on `lucy-precision-core` (`3e2d6aa2c9`). It binds
per-native-rule generations, deterministic admission order, exact retries,
project-local history/global prior, strict threshold boundaries and post-demotion
uniqueness windows. The lead implemented private durable admission and replay on
`lucy-precision-store` at `af084bbb369ea202683992ed322661a0c6169b6d`.
Its private schema event is in the durable manifest, not the public Protocol
manifest. Equivalent concurrent retries share one durable order; conflicting
facts, noncanonical replay ids, unexpected aggregate types and unrelated failed
publications cannot silently become clean history. Core/Schema typecheck
`42010492055` and 30 reducer/real-DB tests in `42011333899` passed at that head.
The failed first acquisition `42007678745` was a missing package export, not a
semantic negative. Reducer run `42007931593` exposed a test that incorrectly
reactivated a generation already demoted at read 31; its chronology was corrected,
not the production no-reactivation rule.

For all three named runtime/mutation runs above, the lead read full logs and
compared the complete uploaded source maps against the exact expected tree (or
sole mutation). A deliberately changed known entry calibrated each comparison.
Records are `check-precision-wave-identities.json` and the corresponding full logs
in the session evidence directory. The named guard runner also passed on both
integration worktrees. None of these results closes K10 delivery integration,
derived-state execution filtering or the remaining campaign phases.

Squawk analyzer construction is `lucy-squawk-runtime` (`83ba7330d1`); sourced
catalog construction is `lucy-squawk-catalog` (`c21e179ce6`). The lead integrated
these with SQL skill `53b676f823`, the preserved ast-grep stack and shared stack
prose on `lucy-sql-proof`. Compiled-language leaves are grouped under
`team-stack/compiled` with matching `team-stack-compiled-*` ids to retain the
existing ten-child cap; no cap was raised. Tagged per-rule evidence is at
`e5ddccc380`. The new analyzer/cross-catalog/skill integration still needs its
exact-head remote proof; old primitive conformance is not reused as that proof.

K10 delivery/outcome construction is active on `lucy-outcome-core`
(`5463f0b5a9`), `lucy-outcome-wiring` (`010c28e692`) and the independent
`lucy-outcome-tests` task. Quick paging required a live host outcome getter and a
pre-publication seal, not a new provider turn or an inferred empty read list.
Lead integration is in `lucy-outcome-runtime` in the former
`lucy-pr-runtime-check` worktree; the original `lucy-pr-runtime` branch is
preserved at `e2883a8e51`. These active outcomes are unverified construction.

The final runtime bundle must still start from `750a23b8ed40af0ceef23f3323ae4910d470718a`
and actual slice histories, never from the receipt branch. No campaign merge,
#1290 merge, genesis, benchmark/evaluation, local heavy check, restart, cap waiver
or final epic has been authorized by this recovery entry.

CI logs are retained under the session temporary directory and the shell output store. Generated Atlas bytes were copied from the real generator's CI output only after checking contiguous base64 chunk offsets and SHA-256; no hand-written generated code or local build was used.

## Closure checklist

- [x] Every selected epic lane is accounted for at the exact phase 1 head, including steps skipped after failures.
- [ ] Phase 1 cold-review findings are fixed and mutation-tested in CI.
- [x] Phase 2 newest-by-stage semantics work across linked validations and event aggregates.
- [x] Phase 2 PR rendering shows receipt identity, method, counts and open state, without model spend.
- [x] Phase 2 scoped acceptance tests and remote typecheck pass on its current code head; later changes are ledger-only.
- [ ] Phase 3 first execution packet is frozen and dispatched without modifying the phase 1 bundle.
- [ ] The owner's no-merge constraint remains in force until explicitly changed.
