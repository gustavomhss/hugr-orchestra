# Lucy campaign status

This is the recovery and execution ledger for the approved [build plan](build-plan.md). It records evidence and open work, not approval to merge.

## Owner constraints

- Keep phase integration bundles distinct. New owner direction authorizes small slice PRs; the original `lucy-wp-*` branches remain preservation archives.
- Do not merge phase 1 PR [#1290](https://github.com/gustavomhss/hugr-orchestra/pull/1290) without the owner's authorization.
- Do not run Atlas genesis or restart the desktop app or server.
- Tests run through `bun run test:ci`; type checking runs through `typecheck.yml`. No heavy local tests, type checks, builds, or evaluations.
- Open small PRs and run surgical tests on their changed paths. Run one epic on the final bundle of all campaign work, not per PR, correction or phase. This newer owner direction supersedes the original per-phase cadence without changing acceptance or no-merge constraints.

## Current landing units

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

CI logs are retained under the session temporary directory and the shell output store. Generated Atlas bytes were copied from the real generator's CI output only after checking contiguous base64 chunk offsets and SHA-256; no hand-written generated code or local build was used.

## Closure checklist

- [x] Every selected epic lane is accounted for at the exact phase 1 head, including steps skipped after failures.
- [ ] Phase 1 cold-review findings are fixed and mutation-tested in CI.
- [x] Phase 2 newest-by-stage semantics work across linked validations and event aggregates.
- [x] Phase 2 PR rendering shows receipt identity, method, counts and open state, without model spend.
- [x] Phase 2 scoped acceptance tests and remote typecheck pass on its current code head; later changes are ledger-only.
- [ ] Phase 3 first execution packet is frozen and dispatched without modifying the phase 1 bundle.
- [ ] The owner's no-merge constraint remains in force until explicitly changed.
