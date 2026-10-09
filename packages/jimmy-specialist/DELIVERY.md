# Jimmy delivery closure

## Owner instruction

> beleza. testes pesados so vamos rodar no final. Organiza a casa, para de ficar repetindo bun typecheck a cada meia duzia de passos, e paraleliza o maximo possivel do trabalho. Pode commitar tambem

This instruction changes verification cadence, not acceptance criteria. Implementation commits are recoverable checkpoints, not release approval. No push, PR or release was requested.

## Closure wave

The existing implementation is the common baseline. Each writer uses an isolated worktree. Shared schema, native tool contracts, registry and dependency manifests are frozen during this wave; any required contract change returns to the lead before editing.

| Work package | Owned files | Output | Completion check |
| --- | --- | --- | --- |
| Packaged runtime | `packages/orchestra/test/research/packaged-runtime.test.ts`, `test/research/fixtures/packaged-proof.ts` | Bun/Node proof aligned with actual production builders and native corpus APIs | Both runtimes execute the capture → finding → document → view → verified card path; unavailable authored source is demonstrated |
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

- Packaged runtime proof has not yet passed.
- The system prompt is provisional until the closure review completes.
- R01/R08 are provisional single pilots; paired R01–R14 repetitions are not complete. R14 requires evaluator-owned setup.
- Full named native/Atlas matrix, desktop runtime reach, UI accessibility/direction/locale checks and production timeline benchmark must be reconciled against the governing delivery plan.
- Final generated consumers, cold integration review and consolidated gates remain pending.

`IMPLEMENTATION.md` holds historical evidence. Local `SESSION-CHECKPOINT.md` is a compaction aid, not a shipped artifact or acceptance report.
