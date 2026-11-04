# Genesis recovery worklist — 2026-11-04

Owner: the recovering lead session, branch `genesis-run-fix` (PR #1291).
This is an execution ledger, not a new requirements specification.

## Operating rules

- Run 41903314570 completed with failure; its downloaded evidence is retained. Do not replace a run on an ETA guess.
- No new mining dispatch until the named model-adapter failure passes an isolated, no-reindex probe.
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
| Run 41903314570 | Mine refused with `Max turns reached`; login smoke `ok`; three durable advisory candidates with answer references; judge skipped | Which specific request failed; stage time split within mine; independent quality of staged claims |
| Model concurrency | Compiled pool passed the three-process barrier control in 41908399677; driver clips batches to budget/pool width | Whether the Grok backend itself served those concurrent child requests concurrently |
| Arm concurrency | `cli/src/mine-arms.ts` executes passes sequentially so writes share one owner | A need to serialize proposals within each arm (there is none in the compiled pool path) |
| History bypass | `ATLAS_SKIP_BLAME_PROBE=1` substitutes zero concentration and empty SZZ | Quality equivalence; previous reassurance is withdrawn |
| Signal cap | Current plan attaches history only to the first budget-sized prefix | Safe semantics for incremental `rerun`, which selects changed buckets after planning |

The canceled-run evidence is outside the repository at the session temp directory
`genesis-cancelled-evidence`; earlier failure evidence is at `genesis-fast`.

## Recovery sequence and acceptance

| ID | Work | Acceptance / exit condition | State |
| --- | --- | --- | --- |
| D1 | Add opt-in stage diagnostics, without changing mining decisions | Live start/end/failure markers distinguish scan, rank/history and model batch; pool mode visible; no prompt/answer/credential bytes; diagnostic-off behavior unchanged | Helper remote smoke passed; compiled CLI/live-run integration still pending |
| D2 | Collect current pilot | Preserve mine stdout/stderr, arm reports, staging provenance and judge evidence; reconcile success/failure with actual CLI result | Collected; model refusal established; judge never executed |
| C1 | Review history shortcuts and budget cap | Remove silent signal substitutions or prove exact equivalence on pinned fixtures; cover full plan, explicit budget, interruption/resume and incremental rerun | Open; blocks landing #1291 |
| C2 | Prove compiled concurrency and bounded failure | Real compiled workers overlap under a controlled proposer; budget/order receipts preserved; worker death terminates rather than hanging | Open; source-only slot tests do not prove actual threads |
| C3 | Verify subscription adapter and artifact privacy | Real mining-shaped request succeeds; tool denial established from CLI behavior, not flag name; scanner detects individual and refreshed credentials without printing them | Scanner repair integrated for testing; explicit tool restriction added; isolated probe pending |
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

Remote smoke run [41905242239](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41905242239)
passed on the working-tree snapshot above `79167c7c1c`: five Node tests, no skips, including the in-memory
mutation control. This verifies the production diagnostic helper, not compiled workers, the CLI's stage
wiring, provider latency or genesis completion. `bun run check:guards --base origin/dev` reported no gate
or warning findings/errors for its checked diff. Campaign verification V1 is still open.

Subscription adapter inspection (no provider call, no auth/config inspection): local
`grok --no-auto-update version` matches pinned 1.0.13 (`5e9a58528b76`). Its `--help` separately exposes
`--tools` (built-in allowlist), `--deny` and `--verbatim`. It does not establish that `dontAsk` removes
tools. The wrapper's comment claiming total tool denial is therefore not evidence; C3 remains open.

### Test-only follow-up wave

GO: parallel with the running pilot; no shared edits or model calls. The lead owns runtime/workflow files.
Agent `ses_e57c6d10fffeUTSfXBbWKbX8FE` owns only
`packages/adapter-io/test/open-questions-source.test.ts` in `genesis-owner-options`, starting exactly at
`2ee874c987c27e8164f8504cad0661f1a08bbc28` (small test-only packet; no interface decisions).
Acceptance: real commits yield exact sorted/deduplicated author options, unrelated authors are excluded,
missing paths preserve exact fallback, and another author's commit changes options without changing IDs,
question kinds/counts/ranks. It must push a coherent test-only commit and stop for grouped verification.
No local tests, no per-PR CI, no merge. Mutation (remove real author lookup) is reserved for remote V1;
the agent must not claim it ran. Relay arm: `genesis-owner-coverage-1c8a9957`, wiring still unverified.

Returned owner-test commit: `7fe6d7a7f7120caf82da246aa7a12ae0d17306fb`. Lead read its test-only diff;
real author commits and exact fallback assertions are present. Remote execution/mutation remains pending.

### Isolated adapter failure probe

Pilot evidence: `genesis-pilot-41903314570` in the session temp directory. The three staged rows are all
advisory candidates from the source SHA, with source anchors and answer references. Those are not
ratified facts. A later command failure discarded the multi-arm stdout; the splitter copied that global
refusal to each requested arm. Therefore an empty rendered frontier does not establish a broken index.

The next dispatch is `adapter_probe_run=41903314570`, not another mining run. It restores existing indexes,
checks source-file equality against the staged revision, and uses production prompt readers/parsers plus
compiled proposer workers over those three file fixtures. No ranking/history scan, index rebuild, staging
write, judgment or publication. A barrier-based controlled model first requires three actual child model
commands to enter concurrently. This proves overlap without an optimistic timing threshold. All real
arm probes then retain the one-turn/command timeout caps and record sanitized result categories only.

The old failed prompt was not retained, so this is a bounded mining-shaped regression probe, not a
byte-identical replay or proof of which Grok internal action exhausted its turn. The wrapper now explicitly
removes built-ins, denies tools and requests verbatim prompting rather than increasing agent turns.

Scanner repair `c8dfd08121ca09152584398dce0de9954418306b` was cold-read by the lead and cherry-picked
as `82c5bcfec8` for candidate-branch testing only, not landed on dev. It covers JSON string leaves and
rereads current auth values; its synthetic positive/negative and mutation controls run with the script
bundle in the isolated probe job. Arbitrary unlabeled token fragments are explicitly not claimed covered.

Frozen probe candidate: `1c935ffaa2`. Cold reviewer `ses_e57ba44d1ffeja6IrbjTUK68E5` returned
**APPROVE-FOR-PROBE**, not merge approval, on the wrapper/probe/workflow slice. Isolated run
[41908399677](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41908399677) is dispatched at
`1c935ffaa27e4d8bbe686058a8b602e69121b03d`; its background watcher owns completion notification.
No full mining/epic is armed. `check:guards --base origin/dev` reported no findings/errors for the checked
candidate diff, and the YAML syntax parser accepted the workflow; neither replaces remote execution.

Official current Grok documentation explicitly says read-only tools also run under `dontAsk`, and a bare
`--deny '*'` matches every tool. Its headless guide documents that `--tools` alone retains MCP meta-tools,
which is why the deny rule is also present. These are current-main docs, not a recovered source snapshot
of pinned binary 1.0.13, so the isolated runtime probe is still required:
- https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/22-permissions-and-safety.md
- https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/14-headless-mode.md

Probe 41908399677 completed: remote Atlas typecheck, script bundle, source equality and actual compiled
three-process barrier control passed. Real advisory results were `[proposed, timeout, proposed]`; the
middle fixture is `packages/core/src/effect/layer-node.ts`. Dependency/count were not attempted after
that failure. This establishes concurrent controlled commands, not concurrent Grok backend execution.
Downloaded sanitized results: session temp `genesis-adapter-41908399677`.

The next diagnostic changes output observation only: one production advisory prompt on that fixture,
at most 90 seconds, with partial structured stream metadata. It does not increase timeouts, alter effort,
reindex, mine or publish. Private prompt/stream/stderr buffers stay outside uploaded evidence and are removed;
only fixed-label metadata/counters reach the artifact. No provider text/reasoning/tool payload is exported.

Source inspection found a concrete flaw in our proposed empty-tool flag: current Grok main's
`headless/cli.rs:134–142` turns an empty `--tools` value into `None`, and `grok-agent/src/config.rs` says
an empty tool list inherits all. Pinned 1.0.13 source was not available at its build SHA. Therefore the
wrapper no longer claims this flag removes tools; the bounded trace must observe advertised tools before
another configuration change. The deny rule still blocks execution per the documented permission policy.

Trace [41911649858](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41911649858) completed at
the 90-second cap: `sawInit=true`, `toolCount=24`, `mcpCount=0`, 471 partial events, no final result.
This is observed streaming activity, not proof that every partial was reasoning/text or that no tool was
requested: the old counter only covered completed assistant blocks. No private buffers were retained.

The next corrective candidate replaces the inherited coding profile with explicit empty `toolConfig`,
disabled default-tool/skills/AGENTS discovery, and a full prompt-only system profile. It does not request
a different model/effort or raise spend/turn caps. Runtime acceptance requires advertised tools/MCP servers both zero and
counts partial text/reasoning/tool starts separately. The previous `toolCount=24` is the positive control
for this check. The executable wrapper's version receipt includes pinned CLI version and profile byte hash;
operator config invokes that wrapper directly so the existing model-identity capture can actually read it.

Profile candidate `53828dcf7f` received independent **APPROVE-FOR-TRACE**. Run
[41913732601](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41913732601) is dispatched at
`53828dcf7f2a54c489470398288239c9064d0862`; the existing background watcher owns completion notification.

Run 41913732601 completed at its cap: it still advertised 24 tools and emitted 400 partial reasoning
deltas, zero partial text deltas, no completed result. The profile's declared fields are therefore NOT
runtime proof of a tool-free primary session. Do not attribute the delay to blocked I/O: reasoning was
actively streaming. It remains unproven whether that call would finish within the production 5-minute cap.

Next bounded correction uses a nonempty allowlist containing the known `read_file` tool and an explicit
denylist removing that same member plus `search_tool`/`use_tool` MCP meta-tools. This avoids the documented
empty-list inheritance case without inventing an unknown tool name. The top-level system-prompt override
uses the same versioned profile text rather than trusting profile injection. A trivial 30-second policy
canary must observe zero tools/MCPs and a completed result BEFORE any source request. Only after it passes
does the existing one-file trace run. Model/effort and production caps are not lowered or raised.

Run [41915853835](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41915853835), at
`b1f857a14d8ff3db9f3c7fb8231a7dd491a6fc24`: the policy canary completed with Grok 4.7, zero tools,
zero MCPs, one turn. The source trace also advertised zero tools/MCPs; it emitted 495 partial reasoning
deltas and no text before its 90-second diagnostic cutoff. This verifies the intended filtering path but
does NOT establish failure at the unchanged production 300-second cap. No more policy changes are justified
by that cutoff. The next no-reindex probe uses the existing production cap over all three arms and retains
every arm's result instead of stopping after the first failure. Quality/model effort are not reduced.

### Signal hydration repair — acceptance first

The lead froze optional `createMine` dependency `deferSignals?: boolean` (default stays eager) as the seam.
When enabled, every non-structural candidate must carry a memoized getter yielding its exact history
signals on first access, including candidates beyond any initial ceiling; structural signals stay zero.
CLI composition will opt in and force only the next visited site/batch's getters before dispatch. Any
history hydration error must reach the existing fatal watch/refusal path before a model call, not a quiet
abstention. Remove `signalCap`, not the facts/coverage tail. No ranking/budget/order/admission change.

First delivery is acceptance tests ONLY: eager-vs-deferred value/JSON equivalence, one read per candidate,
untouched tail, structural fallback, per-visit/batch hydration, incremental rerun selecting a site beyond
the original ceiling, interruption/resume, and fatal selected-history failure with zero model calls.
Implementation waits for an independently checked, remotely red suite. This prevents replacing one
untested optimization with another. The public type seam is present as a stub only; no green claim.

### Independent hotspot correction (parallel, no shared runtime/workflow edits)

Frozen lead decision for #1300: replace within-file ordinal weights with committer-time age relative to
the pinned revision's committer timestamp. Weight is `128 * 2 ** (-max(0, revSeconds - commitSeconds) /
(180 * 86400))`; hotspot remains sum of `--follow` commit weights multiplied by the existing pinned-blob
indentation complexity. Empty history is zero; future-dated commits are capped at weight 128. No wall
clock, no history/SZZ bypass and no frontier admission change. Half-life 180 days is an explicit initial
engineering choice, not an empirically calibrated optimum; fixed real-data evaluation remains outstanding.

Acceptance goldens use real commits with explicitly set author/committer timestamps: equal-complexity
single-commit old/new files score 64/128 at age 180/0 days; shared commits at 180/0 days score 192 times
complexity (1 versus 4); 360/180-day commits score 96. Advancing HEAD or editing the worktree cannot
change a query at the original SHA. Rename-follow, missing blob and future-date clamping get cases too.
Remove the copied test scorer: exact fixture constants, not a second implementation, own the new oracle.
Only source/test/type-comment/reference files belong to this agent. Snapshot refresh is lead-owned at
the grouped verification boundary, so concurrent agents never edit generated receipts.
