# S4 release-selection handoff — 2026-11-14

**Status: DONE** — the finite release-selection task is complete and published. This does not mean S4 campaign completion or `DELIVERY_COMPLETE`.

## Identity

- Repository: `gustavomhss/hugr-orchestra`
- Work branch: `genesis-s4-release-selection-20261114`
- Starting point: current `genesis-fresh-s4` branch ref at branch creation
- Baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`
- Protocol: `ee2521a5b966bd505cc95bd1c733e09e12f33531`
- Reconciliation source: `85f10964d08feb09b9971cf2c25702cd40fc6078`
- S4 resume branch inspected: `genesis-s4-resume-unit-20261114`

## Result

Selected the existing exact release `20261111-v3-fresh-s4-r3` as the **interim bounded shared release pin**:
- release-file commit: `6f643bc05245ebe912d52cbdd8347ce1e5b0046e`
- release path: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime-release.json`
- release file blob: `7513fcca63664ca02094e9ed9b8fab090c20295d`
- code candidate: `e3a8ab8cf56dbff1ee91272df51ffa398d882aa1`
- common controls candidate: `7102f2e3a1a9a3822bcd0ae054b36ecffe9da553`

Consumers must pin the release-file commit and preserve the scope limits in `REPORT.md`. R3 is not approved here as a full-corpus or final S4 release.

R4 is **not selected**: the 2 MiB large-input work is a source delta with product tests/runtime marked NOT_RUN; the R4 handoff checkpoint retains `candidate_revision: null` and pending independent review. The green Actions run `43154719978` on `22815b6821dce26562624b4711c705c7cd786268` is recorded as evidence for that checkpoint only, not as a published R4 release.

## Completed work

- Read the requested REPORT and the available S4 handoff/resume artifacts at their exact refs.
- Read S4 slice instructions and applicable runtime/transport/integration/handoff requirements at the immutable protocol commit.
- Compared the published r3 release with the R4 source delta and the S4 resume branch.
- Preserved the unknown status of private session activity; UNKNOWN was not interpreted as stopped.
- Published this decision and its detailed evidence in `REPORT.md`.

## Evidence / pins

- R3 release blob: `7513fcca63664ca02094e9ed9b8fab090c20295d`.
- R4 candidate manifest blob: `996de7fc4665905b98e4d34c73bda73a403d5999`; patch SHA-256: `fd2aa021204689cdf844fe5a70f0be37db0d335eedf59e6a78226a67f190e0ff`.
- R4 producer dossier blob: `4a82fac6c0b0464bbacbd5ccbbb1a09b5557aabc`.
- R4 checkpoint commit: `22815b6821dce26562624b4711c705c7cd786268`.
- Resume work commit: `b56823c1ba377ea838e7486cc39127c9edbba8b5`; resume handoff commit: `db86cb85018b9525fdce56faeab6c0ffdfa65dba`.
- Resume branch comparison: exactly two commits ahead of its stated base `db9b4235022c4df32fe3bfd4faeea8adcd69abb7), with only the maintenance note and resume handoff added.
- S4 current release file remained byte-identical on the resume branch; no release upgrade was made there.

## Required next steps outside this task

1. S4 owner: finish exact R4 source candidate, hosted gates, generated parity and guards; get two independent runtime binding decisions; reconcile affected knowledge versions; publish versioned R4 release with exact receipts.
2. S4 owner: resolve final J1 L4 disposition, complete/index all 15 artifacts, prepare and bind exact package, execute governed full-package publish/index/read, obtain independent consumer evidence, complete maintenance and final seal.
3. Other slices: use r3 only where input sizes and capability scope fit; otherwise wait for a versioned R4 release. Each consumer uses isolated state and its own exact package/binding.
4. ROOT: consume the selected S4 handoff/release by immutable SHA; do not infer S4 DELIVERY_COMPLETE or global completion from this selection.

## Limits

- No private conversation/session activity was accessible. Active-session status remains UNKNOWN.
- The control reconciliation's REPORT.md was readable at the requested commit; its HANDOFF.md was not available at the stated path/ref in this inspection.
- No implementation, local tests, product tests, CI, runtime operation, binding, publication, semantic judging, merge, deploy or changes to other branches were performed.
- No tokens, physical attempts or billing were inferred.

This handoff closes only the release-selection unit.
