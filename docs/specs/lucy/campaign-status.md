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
| Phase 1: routed review seat | `lucy-core` | PR #1290; head `4e1ae3b781`; merge remains unauthorized | Recover all failures from epic run `41916276400`, then targeted fixes and independent review |
| Phase 2: queue receipts | `lucy-queue-receipts` | Head `b2d9515222`; pushed, no PR, no epic; implementation has not completed cold review | Receipt-selection and renderer review, full phase-scoped tests, remote typecheck |
| Phase 3: lenses and overlays | Not started | Approved scope exists; implementation packet being prepared | Freeze catalog/skill IDs and write acceptance tests before dispatching dependent work |
| Phases 4–7 | Not started | Language packs, build lane, audits, compliance remain in the approved plan | Follow the build-plan dependency order |

## Recovery wave

Baseline: phase 1 `4e1ae3b781`, phase 2 `b2d9515222`. Four isolated, read-only agents; no shared write paths. No automatic relay hook has been established for this wave; the lead must verify the returned evidence directly.

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
| Godfile rejects review contracts and app wire growth | Backend contract split | Isolated mechanical extraction; preserve schema identities and existing import paths |
| Godfile rejects the fan-out, session runner and generated schema growth | Lead integration | Pending focused extraction; no limit or waiver changes authorized |
| Code-stage review head is a Git tree, but snapshot creation requires a commit | Backend exact-tree slice | Fix and regression tests assigned; no working-tree fallback |
| `git archive` transforms or omits reviewed bytes through export attributes | Backend exact-tree slice | Literal object materialization and attribute controls assigned |
| Queue folds validation-stage pairs instead of the newest linked stage | Backend queue slice | Cross-validation selection, legacy decoding, malformed-row and stage-isolation regressions assigned |
| Queue can admit after a receipt changes during external checks | Backend queue slice | Recheck inside final admission transaction assigned |
| Atlas PR renderer discards receipt identity, method and counts | Lead integration | Pending renderer change and real boundary test |
| Verifier permissions union options across candidates | Lead integration | Pending candidate-scoped permission map and unknown-candidate refusal |
| Reanalysis leaves paging URI, checks and unread counts on the earlier run | Lead integration | Pending complete latest-analysis adoption |
| Raw history and probe citations have no production retention callback | Lead integration | Pending durable artifact retention and reopen-after-cleanup test |
| Overlapping review scopes can remove another binding | Lead integration | Pending exclusive review lifetime and overlap regression |
| Probe cancellation can interrupt restoration of shared snapshot bytes | Lead integration | Pending bracketed mutation/restoration and cancellation test |
| Workspace dependency symlinks can reach live source outside the reviewed snapshot | Lead integration | Pending remapped internal links and divergent-source regression |

The newest epic inventory at `41916276400` initially found five Godfile failures. Other lanes were still running at that observation; recover their final outcomes before re-arming the epic. The CI job logs are retained outside the repository under the session temporary directory's `lucy-ci-evidence` folder.

## Closure checklist

- [ ] Every required epic lane is accounted for at the exact phase 1 head.
- [ ] Phase 1 cold-review findings are fixed and mutation-tested in CI.
- [ ] Phase 2 newest-by-stage semantics work across linked validations and event aggregates.
- [ ] Phase 2 PR rendering shows receipt identity, method, counts and open state, without model spend.
- [ ] Phase 2 scoped acceptance tests and remote typecheck pass on its final head.
- [ ] Phase 3 first execution packet is frozen and dispatched without modifying the phase 1 bundle.
- [ ] The owner's no-merge constraint remains in force until explicitly changed.
