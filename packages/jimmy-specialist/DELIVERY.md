# Jimmy delivery closure

## CURRENT — jimmy-engine method, 2026-10-18

The seat `jimmy` is now defined by the jimmy-engine spec (`specs/jimmy-engine/`, `method.md`). The qualification recorded below is superseded by it and stays as history.

- **Prompt.** `modules/maestro/coordination/src/seats/prompt/jimmy.txt`, under 400 words: open the inquiry, check the premise, locate in batches, commit to the ranges that decide the answer, probe when reading is not enough, claim with an evidence class, check and close.
- **Card.** The host assembles card v2 from `inquiry close`. The seat writes no fenced card.
- **Tools.** One descriptor, `packages/core/src/research/seat-tools.ts`, on both engines. Each tool's own description carries its contract; the prompt does not repeat it.
- **Host-enforced rules.** The check before close, citation rules, repeated-call refusal, allowance and domain pinning live in the host, not in prose.
- **Skills.** `jimmy-discovery` and `jimmy-research` (33 files, 16,753 words) are deleted. One optional skill, `jimmy-reference`, holds calibration and web-source doctrine (about 900 words) and is never required before the first search.
- **Guards.** `apps/orchestra/test/research/jimmy-method.test.ts` pins the word cap, the absence of a fenced-card instruction and the single reference skill (JE-AC-M1).

## Superseded — final handoff, 2026-10-10

**Feature implemented; final main CI passed all 12 jobs. Qualification failed; release acceptance is blocked.** Tested source is `fa00d95cb660de09ebbeffc0e1fafc9d02bb7e5c`; final main [38030684084](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38030684084) includes the SDK/plugin build-order repair. Chromium passed 28 cases and final macOS Electron passed three. See [HANDOFF.md](HANDOFF.md) for exact identities, retained failures and remaining model-quality blockers.

The original v15 study retained all 84 trials and grades. Candidate-only v17/v18 confirmation is 35 passed / 7 failed across 42 scheduled slots; saved-output grading reconciliation did not rerun native tasks. Public reports and seals are committed; temporary evaluator bytes are now unavailable and backup availability is unverified. No superiority or release-ready claim follows. Historical preparation plans below describe dated checkpoints. The next product fix is general qualifier/provenance preservation through publication and parent handoff; this document schedules no new model tests.

## Historical delivery checkpoints

## Owner instruction

> beleza. testes pesados so vamos rodar no final. Organiza a casa, para de ficar repetindo bun typecheck a cada meia duzia de passos, e paraleliza o maximo possivel do trabalho. Pode commitar tambem

This instruction changes verification cadence, not acceptance criteria. Implementation commits are recoverable checkpoints, not release approval. No push, PR or release was requested.

## Closure wave

The existing implementation is the common baseline. Each writer uses an isolated worktree. Shared schema, native tool contracts, registry and dependency manifests are frozen during this wave; any required contract change returns to the lead before editing.

| Work package | Owned files | Output | Completion check |
| --- | --- | --- | --- |
| Packaged runtime | `apps/orchestra/test/research/packaged-runtime.test.ts`, `test/research/fixtures/packaged-proof.ts` | Bun/Node proof aligned with actual production builders and native corpus APIs | Both runtimes execute the capture → finding → document → view → verified card path; unavailable authored source is demonstrated |
| UI and consumers | Research UI components, app artifact callback, research i18n, generated Client/SDK outputs | Review/corrections for artifact paging, binding, cancellation, RTL and generator freshness | No stale/foreign document displayed; generators own generated output; changed UI uses established direction/i18n patterns |
| Evaluation preparation | Research pilot/document scripts and evaluation runbook | Final-stage paired-run prerequisites and isolated, honest evaluation telemetry | No private oracle content in source/context; unsupported cases explicitly blocked; no quality/model trial during preparation |
| Lead integration | Prompt, roster identity, delivery/implementation docs | Final charter after capability review, reviewed commits, consolidated gate plan | No unsupported capability claim, no hidden acceptance gap, one authoritative closure status |

All three execution packages are independent under the frozen contract. The lead owns integration order and final claims. Agents do not edit shared status documents, run heavy gates, repeatedly typecheck, push, open PRs or merge.

## Verification cadence

1. Implement and statically review the whole wave.
2. Review each returned diff and integrate only owned paths.
3. Run one typecheck per affected package, concurrently where independent. Repeat only failed checks or checks invalidated by later fixes.
4. Run final change-scoped GitHub Actions suites together by package. Add the epic acceptance lane at the actual epic close. No local test suite.
5. Run final-prompt model evaluation after build/prompt/source identity is frozen. Mechanical runtime gates and provisional quality pilots remain distinct.

## Remaining acceptance work

- The compiled Bun/Node native Task/provider/Client/HTTP proof now passed on Linux, Windows and macOS arm64; actual desktop Electron and epic acceptance remain separate.
- At this preparation checkpoint, the system prompt was provisional until closure review.
- At this preparation checkpoint, R01/R08 were provisional single pilots and paired R01–R14 repetitions were incomplete. The current study outcome is recorded above and in HANDOFF.md.
- [QUALIFICATION.md](QUALIFICATION.md) maps every named native/Atlas case to current controls and remaining execution gaps. Desktop runtime reach, UI accessibility/direction/locale and production benchmark evidence remain pending.
- Final generated consumers, cold integration review and consolidated gates remain pending.

`IMPLEMENTATION.md` holds historical evidence. The compaction checkpoint stays outside the checkout; it is not a shipped artifact or acceptance report.

## Current execution state

All three implementation packages returned separate commits and were integrated after diff review. Cold review corrections are included. One consolidated typecheck batch and both prescribed generators completed; only the failed Orchestra check was repeated after its actual compiler fixes. Heavy tests and mutation probes remain deferred to final closure. Temporary writer worktrees are removed; recovery branches retain their commits.

The second preparation wave, based on `3a62efbcee`, adds actual compiled Maestro/Task/provider/HttpApi/generated-client control, rendered browser regression/production benchmark controls and an executable R14 interruption/resume collector. Cold review corrections are integrated. Lead integration preserves V2 structured Task results, adapts canonical native tool-success events without inventing durable facts, propagates native request aborts and fixes missed startup cancellation. New source assertions cover closed final cards, overlapping single-process Atlas writers and startup signals. Package compilation includes the new E2E files and their real performance dependencies; runtime assertions remain unexecuted.

| Remaining block | Owner | Required exit |
| --- | --- | --- |
| Mechanical completeness | Lead + runtime qualification | Reconcile named N/A cases and actual desktop/HTTP/macOS reach; implement remaining detecting controls before launching the final suite |
| UI closure | UI qualification | Real navigation/disposal/server-switch, keyboard, RTL/mixed-text, locale fallback and production timeline baseline/current evidence |
| Evaluation infrastructure | Independent evaluator, lead fixes native adapters | Declare the actual comparator; provision pinned semantic/history/Atlas lanes and R14 exact logical Task continuation; no oracle content returns to candidate authors |
| Final charter freeze | Lead, after mechanical capability review | Capability-accurate prompt and preserved historical behavior hashes; freeze candidate identity once |
| Final acceptance | Qualification + independent graders | Consolidated CI/mutation controls followed by paired R01–R14 repetitions; retain all failures and unknown telemetry |

Preparation is parallel; prompt freeze and acceptance are downstream integration points. A script, authored test or static review does not close an execution requirement.

### Queued change-scoped tests

These are final-stage commands, not results from this wave. Run from the implementation root after the remaining detecting controls are ready. Extend the exact file list when closing a named uncovered requirement, rather than repeatedly rerunning already-passing suites during implementation.

```sh
bun run test:ci orchestra test/maestro/seat-skills-build.test.ts test/research/packaged-runtime.test.ts test/research/corpus-integration.test.ts test/research/task-continuation.test.ts test/research/atlas-context.test.ts test/research/atlas-owners.test.ts test/research/allowance.test.ts test/tool/task.test.ts --os both
bun run test:ci core test/research-binding.test.ts test/research-artifacts.test.ts test/research-records.test.ts test/research-allowance.test.ts --os both
bun run test:ci session-ui src/components/research-document.test.ts --os both
bun run test:ci app src/utils/session-message.test.ts src/context/server-sdk.test.ts src/context/server-session-v2-reducer.test.ts --conditions=browser --os all
```

These scoped commands alone are not the complete epic acceptance matrix. The actual desktop/browser, named uncovered native/Atlas cases, epic lane and independent audition still need their declared execution evidence.

## Measured checkpoint

Final-stage execution has started. `IMPLEMENTATION.md` records exact revisions/runs, including initial failures and targeted repairs. Core guards/services passed on all three platforms; native compiled and Atlas failing cases passed their targeted rerun; document loader and projection controls passed. Production Chromium now passes 28 cases, and the candidate production benchmark completed three repetitions with metrics. No whole-epic, Electron, paired performance or final-prompt real-model acceptance is implied.

Snapshot CI supports `--os macos|all` and explicit Playwright configuration. These are remote commands; no local tests are authorized by their presence:

```sh
bun run test:ci app e2e/regression/session-research-result.spec.ts --runner playwright --config e2e/playwright.production.config.ts --os linux
bun run test:ci app e2e/performance/timeline/session-research-benchmark.spec.ts --runner playwright --config e2e/performance/playwright.config.ts --benchmark-renderer current --os linux
```

Historical next-work plan: finalize the capability-accurate charter/source identity; complete independent calibrated model execution and comparator scope; run detecting mutations and outstanding platform/epic checks. Current handoff supersedes this schedule. Preserve every prior scheduled failure and unknown usage value.
