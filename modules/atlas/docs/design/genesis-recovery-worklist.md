# Genesis recovery worklist — 2026-11-04

Owner: the recovering lead session, branch `genesis-run-fix` (PR #1291).
This is an execution ledger, not a new requirements specification.

## Operating rules

- Keep run 41903314570 running. Its existing background watcher owns completion notification.
  Do not poll, cancel or replace it on an ETA guess.
- No new mining dispatch until its evidence is collected and the next change has a named failure to fix.
- No heavy local tests/builds. Group remote verification by campaign scope, not by PR.
- Preserve ranking, evidence, admission, budgets and publication checks. Faster is not permission to
  substitute zero for an unmeasured signal.
- No publication from the current pilot: it is `publish=false` and uses unverified history bypasses.
- Record hypotheses as hypotheses. A successful login smoke is not a successful mining completion;
  a Grok timeout is not proof that SZZ consumed the preceding time.
- Never inspect or print subscription credentials. Do not put raw model prompts or auth into diagnostics.

## Evidence and corrections

| Item | Established evidence | Not established |
| --- | --- | --- |
| Run 41886309301 | Downloaded `mine.txt` reports `spawnSync sh ETIMEDOUT`; login smoke says `ok` | Time split between history stages and model calls |
| Run 41897986981 | Canceled by this lead; downloaded mine stdout/stderr are empty | Whether it reached Grok; cancellation does not diagnose the bottleneck |
| Run 41903314570 | Dispatched at `3be12844059ee5b6779653236729a8ae69bffb18`, budget 3, publication disabled | Completion, facts, judge outcome and stage timings |
| Model concurrency | `cli/src/mine.ts:449` selects compiled operator-configured pool; `mine-pool.ts` workers issue proposals; `genesis/src/drive.ts:185` clips batches to budget and pool width | That this specific running binary actually selected the pool |
| Arm concurrency | `cli/src/mine-arms.ts` executes passes sequentially so writes share one owner | A need to serialize proposals within each arm (there is none in the compiled pool path) |
| History bypass | `ATLAS_SKIP_BLAME_PROBE=1` substitutes zero concentration and empty SZZ | Quality equivalence; previous reassurance is withdrawn |
| Signal cap | Current plan attaches history only to the first budget-sized prefix | Safe semantics for incremental `rerun`, which selects changed buckets after planning |

The canceled-run evidence is outside the repository at the session temp directory
`genesis-cancelled-evidence`; earlier failure evidence is at `genesis-fast`.

## Recovery sequence and acceptance

| ID | Work | Acceptance / exit condition | State |
| --- | --- | --- | --- |
| D1 | Add opt-in stage diagnostics, without changing mining decisions | Live start/end/failure markers distinguish scan, rank/history and model batch; pool mode visible; no prompt/answer/credential bytes; diagnostic-off behavior unchanged | Implemented; remote smoke pending |
| D2 | Collect current pilot | Preserve mine stdout/stderr, arm reports, staging provenance and judge evidence; reconcile success/failure with actual CLI result | Waiting for existing watcher |
| C1 | Review history shortcuts and budget cap | Remove silent signal substitutions or prove exact equivalence on pinned fixtures; cover full plan, explicit budget, interruption/resume and incremental rerun | Open; blocks landing #1291 |
| C2 | Prove compiled concurrency and bounded failure | Real compiled workers overlap under a controlled proposer; budget/order receipts preserved; worker death terminates rather than hanging | Open; source-only slot tests do not prove actual threads |
| C3 | Verify subscription adapter and artifact privacy | Real mining-shaped request succeeds; tool denial established from CLI behavior, not flag name; scanner detects individual and refreshed credentials without printing them | Open |
| V1 | Grouped remote verification | One reviewed candidate revision, targeted Atlas tests and script tests, remote typecheck, required guards; falsify new regression tests remotely | Not dispatched |
| R1 | Reconcile metrics | Report frontier/visited/modelCalls/admission/abstention/hold counts from artifacts, not subtraction guesses | Blocked on D2/V1 |
| R2a | Instrumented pilot | Indexed frontier nonempty, real model batches settle, evidence collected, judge executes; no quality bypasses | Blocked on C1–C3/V1 |
| R2 | Budgeted full mining | Budget justified from pilot evidence; no duplicate blind restart; retain source and answer receipts | Blocked on R2a |
| R3 | Binding publication | Binding judge, hold exclusions, promote reconciliation, Own export and negative check pass; review generated patch before landing | Blocked on R2 |

## Entire inherited campaign (do not silently drop)

| Item | Reference / disposition | Remaining obligation |
| --- | --- | --- |
| Dead-code/spec alignment | #1283, merged `708634ad70a5f8ee5e88526cc71a038288e5cbbb` (inherited record) | Retain alignment through recovery |
| Real SZZ | #1285, merged `8ec5813034` (inherited record) | Do not disable its signal to claim speed |
| Durable hits/decay | #1286, merged `45e3f41c39` (inherited record) | Preserve generated surface and regression coverage |
| Hotspot quality | #1300 @ `6ffe03bf0df82fce0036a0015afdced2ef502629` | Cold review, resolve positional-recency mismatch against requirement, grouped verification |
| Owner consumption | #1302 @ `2ee874c987c27e8164f8504cad0661f1a08bbc28` | Cold review actual author suggestions/fallback and grouped verification |
| Multiple facts/site | Discovery only | Preserve single-response splice defense; settle schema/parser/driver contract and test multiple independent claims per anchor/slot |
| Fixed blinded real-data evaluation | Benchmark prose exists; actual fixed answer/adjudication corpus not recovered | Recover or establish versioned corpus, blinded evaluation and real judge calibration; synthetic pairs are not a substitute |
| ast-grep utility | Discovery only; current production synthesis returns null | Decide usefulness against GEN-12 with executable evidence; do not quietly mandate a new dependency or call this implemented |

## Review wave

Hybrid: lead owns runtime diagnosis and integration; one independent read-only reviewer checks #1300/#1302
in the existing `genesis-owner-options` worktree. No shared edits. Baselines are pinned above.
Reviewer returns blocker + concrete failing input + file/line + verification paths; never merges.
Relay arm `genesis-cold-review-d04c8cb3` was created; stop-hook wiring is unverified, so its deterministic
baseline/unchanged checks are also required explicitly. No test result is claimed from static review.

Cold review returned: #1300 **FIX-FIRST** (weight is a touching-count transform, not age-sensitive recency;
its tests explicitly require the wrong tie). #1302 **APPROVE-FOR-TEST**, with missing real-git author/fallback
acceptance coverage. Neither verdict permits a merge. Lead must independently verify the findings before
requesting the exact fixes. Review session: `ses_e57d02030ffeNBSFmMqo1qGfAk`.

Diagnostic verification command (small remote smoke, not a campaign green):
`bun run test:ci script ../../script/atlas-genesis/progress.node-smoke.mjs --runner node`.
Its positive control mutates the production enable expression in memory and requires the same batch
assertions to reject the mutant; it does not alter the working tree or invoke a provider.

Remote smoke run 41904831876 failed before executing tests: the `script` package resolves to
`packages/script`, not repository-root `script`. The corrected explicit file above is relative to the
resolved package; the original failure provides no evidence about the implementation.
