# Lucy campaign status

This is the recovery and execution ledger for the approved [build plan](build-plan.md). It records evidence and open work, not approval to merge.

## Owner constraints

- Keep phase bundles separate. Slice branches are archives, not separate pull requests.
- Do not merge phase 1 PR [#1290](https://github.com/gustavomhss/hugr-orchestra/pull/1290) without the owner's authorization.
- Do not run Atlas genesis or restart the desktop app or server.
- Tests run through `bun run test:ci`; type checking runs through `typecheck.yml`. No heavy local tests, type checks, builds, or evaluations.
- Run one epic at a time, only for a closed landing bundle. Do not re-arm it for each small correction.

## Current landing units

| Unit | Branch | State | Next gate |
| --- | --- | --- | --- |
| Phase 1: routed review seat | `lucy-core`; repairs on `lucy-repairs` | PR #1290 remains at `4e1ae3b781`; repair commits through `90db118492` pushed separately; merge remains unauthorized | Finish repair tests and remaining cancellation/dependency-link findings before one new epic |
| Phase 2: queue receipts | `lucy-queue-receipts` | Repairs and generated renderer through `17c5b89d96` pushed; no PR or epic | Recheck the latest decoder/test typing corrections and full phase-scoped acceptance |
| Phase 3: lenses and overlays | `lucy-lenses-plan` | Planning packet `de3254b1a1` pushed; no implementation | Execute the frozen catalog/tree packet only in the approved dependency order |
| Phases 4–7 | Not started | Language packs, build lane, audits, compliance remain in the approved plan | Follow the build-plan dependency order |

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
| Godfile rejects the fan-out, session runner and generated schema growth | Lead integration | Fan-out/base-rule extraction and comment-only backlog move in `6746341910`; generated schema split still being installed; no limit/waiver changes |
| Code-stage review head is a Git tree, but snapshot creation requires a commit | Backend exact-tree slice | Literal materialization in `6b03b6e2f9`; tree mutation went red; Linux suite passed; Windows pending |
| `git archive` transforms or omits reviewed bytes through export attributes | Backend exact-tree slice | Literal object reads and both export-attribute controls passed on Linux |
| Queue folds validation-stage pairs instead of the newest linked stage | Backend queue slice | `064801c598`; host note time/rowid order, canonical v1/v2 decoding and P1 legacy counts; replacement mutation went red |
| Queue can admit after a receipt changes during external checks | Backend queue slice | Final-transaction recheck in `064801c598`; actual PR-head-window mutation went red; latest test projection assertion corrected |
| Atlas PR renderer discards receipt identity, method and counts | Lead integration | Real CI-generated record boundary installed in `17c5b89d96`; metadata/legacy/privacy render cases passed |
| Verifier permissions union options across candidates | Lead integration | Candidate-scoped map and unknown-candidate refusal in `90db118492`; scoped CI/mutation evidence pending |
| Reanalysis leaves paging URI, checks and unread counts on the earlier run | Lead integration | Complete latest-analysis adoption and live URI binding in `90db118492`; scoped CI/mutation evidence pending |
| Raw history and probe citations have no production retention callback | Lead integration | Retention callback and reopen-after-scope test prepared; not yet verified; store follows the existing OS-managed analysis cache, not permanent archival storage |
| Overlapping review scopes can remove another binding | Lead integration | Duplicate binding refused in `90db118492`; real-tool overlap regression prepared; scoped CI pending |
| Probe cancellation can interrupt restoration of shared snapshot bytes | Lead integration | Pending bracketed mutation/restoration and cancellation test |
| Workspace dependency symlinks can reach live source outside the reviewed snapshot | Lead integration | Pending remapped internal links and divergent-source regression |

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
- A serial scoped batch is running: phase 2's corrected six-file suite, repair core on Linux and Windows, Maestro bindings/fan-out/chain/results, schema manifest and app governance data. It starts one `test:ci` request at a time and saves separate logs under `lucy-ci-evidence/{phase2-final,repair-core-both,repair-maestro,repair-schema,repair-app}.log`. No epic was armed.

CI logs are retained under the session temporary directory and the shell output store. Generated Atlas bytes were copied from the real generator's CI output only after checking contiguous base64 chunk offsets and SHA-256; no hand-written generated code or local build was used.

## Closure checklist

- [x] Every selected epic lane is accounted for at the exact phase 1 head, including steps skipped after failures.
- [ ] Phase 1 cold-review findings are fixed and mutation-tested in CI.
- [ ] Phase 2 newest-by-stage semantics work across linked validations and event aggregates.
- [ ] Phase 2 PR rendering shows receipt identity, method, counts and open state, without model spend.
- [ ] Phase 2 scoped acceptance tests and remote typecheck pass on its final head.
- [ ] Phase 3 first execution packet is frozen and dispatched without modifying the phase 1 bundle.
- [ ] The owner's no-merge constraint remains in force until explicitly changed.
