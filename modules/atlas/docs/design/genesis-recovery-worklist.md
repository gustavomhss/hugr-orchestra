# Genesis recovery worklist — 2026-11-04

Owner: the recovering lead session, branch `genesis-run-fix` (PR #1291).
This is an execution ledger, not a new requirements specification.

## Operating rules

- Run 41903314570 completed with failure; its downloaded evidence is retained. Do not replace a run on an ETA guess.
- No new mining dispatch until the named model-adapter failure passes an isolated, no-reindex probe.
- No heavy local tests/builds. Group remote verification by campaign scope, not by PR.
- Preserve ranking, evidence, admission, budgets and publication checks. Faster is not permission to
  substitute zero for an unmeasured signal.
- Pilots remain `publish=false`; old bypass-bearing evidence never licenses publication. The recovery
  pilot uses real history after the bypass removal and exact-signal verification.
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
| C1 | Review history shortcuts and budget cap | Remove silent signal substitutions or prove exact equivalence on pinned fixtures; cover full plan, explicit budget, interruption/resume and incremental rerun | Candidate implemented; targeted remote tests/mutations passed 41924560574; not landed |
| C2 | Prove compiled concurrency and bounded failure | Real compiled workers overlap under a controlled proposer; budget/order receipts preserved; worker death terminates rather than hanging | Candidate controls passed 41931252280, including unsafe-range rejection; not all worker initialization/child-termination cases |
| C3 | Verify subscription adapter and artifact privacy | Real mining-shaped request succeeds; tool denial established from CLI behavior, not flag name; scanner detects individual and refreshed credentials without printing them | Adapter probe passed 41916959601; scanner controls passed remotely; not full mining proof |
| V1 | Grouped remote verification | One reviewed candidate revision, targeted Atlas tests and script tests, remote typecheck, required guards; falsify new regression tests remotely | 41931252280 passed at 57c1052167; Own freshness and pool proof included |
| R1 | Reconcile metrics | Report frontier/visited/modelCalls/admission/abstention/hold counts from artifacts, not subtraction guesses | Distinct report counters verified; awaiting pilot artifacts |
| R2a | Instrumented pilot | Indexed frontier nonempty, real model batches settle, evidence collected, judge executes; no quality bypasses | 41931698601 refused on model timeout; two staged proposals retained; failure-evidence acceptance in progress |
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
| Fixed blinded real-data evaluation | Real claim/vote tables recovered; raw envelopes and independent gold not established | Freeze pinned real-data inputs, then blinded evaluation and real judge calibration; historical votes and synthetic pairs are not gold |
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

Acceptance author delivered `e019eebe1a48d60b2e2ea84c50b5f14bf109e712`, based exactly on
`c092cb1b707d234e087c57b2eec57b3b02f62684`. Lead read both test files and added them to the candidate
as `72a0bcc841`; no implementation came with them. Independent read-only suite critic
`ses_e576a0c0effeREObMnqqSj4Bjd` is checking coverage before remote red. The verification-only route
(`41af73f33d`) adds the fixed targeted bundle and checks every requested file exists. It skips auth,
artifact restoration, model requests, mining and publication. This is an extension, not a relaxed gate.

The critic returned **FIX-FIRST**: ceiling 4 in the resume case could not distinguish accidentally reset
spend. Lead added a ceiling-2 interruption/resume case requiring attempts `[1,2,2]`, cumulative counters,
untouched ranks 3–4 with `ceiling`, and no continuation token. Existing ordering assertions already reject
hydration performed only inside the proposer or recording pool. Next gate is remote red, not implementation.

Remote red [41922265507](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41922265507),
SHA `03db37e9797d03b7a586364519cc0cdafee21712`: build/typecheck and script bundle succeeded; targeted
Vitest executed 77 cases, with six behavioral failures in the deferred suites and 71 passes. Failures
show eager signal reads where none were permitted, not a compile or fixture-setup failure. No model,
index restoration, mining or publication ran. Lead then implemented the frozen getter/batch/refusal seam;
no budget/controller logic changed. Regression suite green is still pending.

Owner changes and real-git tests were composed as `2dbb346f8b`, `e77cb5c8af`, `14339bd837`; hotspot source
and corrected age goldens as `411b688379`, `fffa456fda`. Old branch snapshot-only commit was deliberately
not copied: generated Own receipts will be refreshed once for the composed candidate. Corrected hotspot
cold review `ses_e5764d207ffePPTjnu6zECH3yW` approved for grouped testing, not merging.

### Exact selected-path SZZ acceptance

The next grouped verification also adds real-git command-observation tests for the proposed SZZ cost
repair. It must blame only the requested path, memoize that result, and not starve another requested path.
The global newest-200 eligible-fix cap is applied BEFORE path selection; a whole fix modifying more than
50 kept files is still skipped, as pinned by the existing 50/51-file positive/negative control. No signal
is replaced by zero merely because a site was not in the initial visit prefix. Implementation of this
repair waits for the new tests' remote red; concentration remains the exact original computation.

Run [41923478334](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41923478334), at
`e1fa84912e6d15654d2a0ac3cc6e8ed8aafe77b6`: the nine deferred/hydration cases passed, as did real-author
options. Build and script bundle passed. Overall targeted result was 79 passes / three failures: the two
new selected-SZZ cases were red on unrelated path blames, and the hotspot fixture unexpectedly exposed
three `--follow` commits where it expected two. The latter used duplicate one-line bodies, allowing git's
rename/copy inference to join histories. Lead made fixture bodies distinct rather than weakening goldens
or changing production `--follow`. Runtime correction remains to be verified.

Cold hydration review `ses_e5760118cffeBQugQrYwf3nzsM` approved for verification. Its SZZ test critique
required path-specific PATCH assertions and shared global discovery/modified-file metadata caching checks;
both were added. Lead implemented selected-path SZZ only after the remote behavioral red, keeping the
same global fix/width bounds. The retired history bypass was removed from adapter and workflow; the
concentration computation is no longer replaced by zero. No new performance figure is claimed yet.

### Grouped green — precise reach

Run [41924560574](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41924560574) verified
`833be7d48fe5c9e042ca54e3e20321b7b0969564`: remote Atlas build/typecheck, 49 script tests (no skips),
82 Atlas cases across the fixed 16-file bundle, and four mutation controls. The original named assertions
rejected zero history signals, removed age decay, missing author lookup, and removed global SZZ cap.
The runner restored every mutated source and its final source diff check passed. Cold reviewer
`ses_e5760118cffeBQugQrYwf3nzsM` approved the source/controls for this candidate gate, not a dev merge.
No auth/model/index/mining/judge/publication steps ran. Own refresh and worker-death liveness remain
explicit landing blockers. The judge header now accurately states that the workflow uses the same Grok
model in a separate call; this is not independent-model calibration.

For Own refresh, lead inspected the committed snapshot and all its pinned-source diffs: only the
`MinedSignals` hotspot comment changed in `types.ts`; `index.ts` and `extract.ts` are unchanged. Its single
deterministic-bootstrap invariant remains supported. Materialization must use the compiled contract on
the runner, preserve the fact pack, and change only source revision/blob receipts and generated hashes.

Pool proof worktree creation hit the 30-second tool timeout before checkout completed. Its partial,
unregistered tree was preserved at session temp `genesis-pool-incomplete` (no agent wrote there); the
same branch at `833be7d48f` is being checked out with a bounded background command. No tests/builds ran
locally. Do not dispatch a worker until the worktree completion notification and baseline/clean check.

Own run [41926155951](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41926155951) at
`d5917893f604247e283964a2d8471df268b0de83` passed the same build, 49 script tests, 82 Atlas cases and four
mutations, then materialized the reviewed snapshot. The runner asserted the fact packs were unchanged,
passed `own-snapshot-guard`, scanned and uploaded the three-file receipt patch. Lead read the full patch
and applied it without hand-editing generated files. This is receipt freshness, not new mined knowledge.

Pool worktree checkout completed; baseline/clean check passed. Test-only author
`ses_e575083cfffeuYFJgEtn3bmBbW` returned `436cd990062edc8837cb85da9dda393776aceb9e`, one script only.
Its controlled healthy/dead worker fixtures temporarily replace the COMPILED default entry on the runner.
Healthy control must return two dense null answers; dead control must return two dense governed faults.
On the old blocking loop, the dead case is expected to hit the external 45-second timeout. The outer
workflow must restore the exact compiled bytes even on that timeout. This does not test model execution
or production worker initialization. Implementation is still waiting for the remote liveness red.

Worker-death red [41927035541](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41927035541)
at `cf3c023f612ec2bf52dbea7c82f95030457799ea`: build, 49 scripts, 82 Atlas cases and four mutations passed.
The healthy compiled control returned two dense null answers; dead mode reached external timeout 124 after
45 seconds, confirming that the existing blocked-parent callback loop did not terminate. The workflow
EXIT trap invoked restoration on this path; a later byte-comparison check will strengthen that evidence.

Cold test critique requested an explicit return-time assertion, not just the 45s external kill. Lead added
the 32s policy bound (two queued 1s commands plus 30s initialization), with 2s explicitly named scheduling
slack; returning at 40s now fails. Production implementation uses the resolved operator model timeout,
per-worker queued-job count and a clock deadline that does not depend on parent exit callbacks. Missing
positions become dense `ModelCommandError` faults, and a timed-out pool closes after draining settled
answers so a late response cannot contaminate the next batch. No per-command model timeout is shortened.

Run [41927952069](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41927952069) at
`8a1dd385a27466307e1ae0e831b8b1c8883cf7d6` passed: healthy control returned two answers; dead control
returned two dense governed faults in 32,001 ms. Both compiled-worker restorations were byte-checked;
committed Own guard and the barrier control with RESTORED production workers passed. Targeted Atlas and
script suites plus all four mutation controls remained green. This proves the ordinary liveness case.

Cold review found an arithmetic edge not covered by that green: accepted `timeoutMs=1e308` could produce
an infinite deadline. Lead added explicit unsafe operator-timeout rejection before worker startup and
unsafe aggregate-deadline rejection before candidate cloning/dispatch, with no silent timeout clamping.
New controls cover both `1e308` and `Number.MAX_SAFE_INTEGER` and require zero candidate getter reads on
the refused batch. These additions still require remote verification; do not generalize the earlier green.

### Pilot preparation without another blind index rebuild

Optional `index_run` restores a prior same-repository run's dumps only after checking its immutable SHA is
an ancestor and a successful NUL-delimited whole-tree git diff contains ONLY the closed maintenance scope
(Atlas itself, genesis scripts, the workflow, the maintenance skill and its user guide). Any other source,
dependency or config change refuses reuse. A second check parses the ACTUAL restored SCIP documents
strictly, refuses an empty list, and refuses changed paths even inside maintenance scope if they are indexed.
All three dumps must be nonempty; roots and doctor are then checked normally. Synthetic positive/negative
controls exercise real source/dependency paths and a document hidden under an exemption. This policy is
deliberately conservative, not permission to accept arbitrary stale indexes.

Main mining now uses the proven metadata-only prompt policy canary before history work. A configured but
failing subscription/policy check refuses, rather than changing the requested run into a no-model pass.
No-secret diagnostics remain explicit. Source/index/model policy receipts are preserved in the run artifact.
These workflow changes need a cold review and the next scoped gate before an actual pilot dispatch.

### Final preparation wave

Parallel read-only wave at `ab27d260db5e3700f5c4af6214d2cf593b508ae4`; the lead alone edits runtime,
workflow and this ledger. Every worker has a dedicated worktree and explicit baseline/clean checks.
Relay hooks remain unverified, so those checks are required explicitly, not assumed from arm creation.

| Packet | Isolated branch / session | Deliverable / limit |
| --- | --- | --- |
| Cold final review | `genesis-final-review` / `ses_e5736aa6affe3HWjmJ2axs3L6r` | Read `ab27d260db` and `c0bab92c12`; concrete blocking inputs for range/reuse/policy; no edits or model calls |
| Multiple-fact contract | `genesis-facts-contract` / `ses_e5736aa63ffedjNPJD7VLXA3QG` | Exact parser/driver/identity contract and acceptance cases before implementation; preserve single-envelope defense |
| Real-data / ast-grep evidence | `genesis-eval-recovery` / `ses_e5736aa23ffel4neJG2NYwbRFR` | Recover actual fixed artifacts or specify bounded executable corpus work; no invented labels or quality claims |

Conflict map: all three are read-only, no shared edit surface, no dependency between their reports.
Lead owns grouped verification and then R2a. The new reuse diff disables rename detection so an indexed
old path cannot disappear behind a maintenance-to-maintenance rename. No acceptance outcome is claimed
by dispatching this wave. Existing Own receipts are kept; no second refresh is requested.

Run [41930061871](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41930061871) verified
`b05543ea02df0e4e64ce3ba989367c3f3a9e0738`: Atlas build/typecheck, 51 script tests, 82 Atlas cases,
four recovery mutations, unsafe timeout range rejection, healthy/dead compiled controls (dead: two dense
faults in 32,001 ms), byte-checked restoration, committed Own freshness and restored-worker overlap.
No credentials/model/index/mining/judgment/publication ran. This closes the overflow control, not R2a.

Cold review found that root-level SCIP documents preserve `./` spellings; exact-string change comparison
could miss an indexed maintenance path. Lead confirmed `rootedPath` preserves that spelling, normalized
document identities with `node:path` and added alias/invalid-path regressions plus a same-assertion mutation
control. This repair is NOT covered by 41930061871 and blocks the pilot until its scoped gate passes.

R1 preparation also found `split-arms.mjs` reconstructed `llmCalls` from visited ledger rows. That is not a
call receipt. New numeric `metrics:` rows read the actual report's used/issued calls, budget spent,
ledger-admitted facts, staged writes and stored answer count separately. The splitter reads those counters
or says unknown; the summary no longer calls every admitted fact a new staged write. A regression uses
different issued/used/admitted/staged values and the remote mutation replaces issued with used calls.

Parallel evidence recovery corrected the earlier "prose only" boundary: actual claim/vote tables survive
at `harness/probes/adjudicate/{a1-dogfood-verdicts,xrepo-zod-a1-verdicts,gold-seat4,gold-adjudication}.tsv`
under Atlas. Lead checked their blob IDs and read the pinned external source plus provenance disclaimer:
Zod revision `ca42965df46b2f7e2747db29c40a26bcb32a51d5` is explicit, while `gold-seat4.json` says the
fourth-seat producer is unresolved. These are real claims and historical votes, NOT recovered raw response
envelopes or independent gold labels. Do not repeat that provenance search or grade current source as a
historical replay. Fixed real-data evaluation/calibration remains open.

Multiple-fact analysis also found a substantive contract boundary: same-anchor/slot advisories retain
claim union but the latest content/derivation is one record, not independently preserved per-claim grounds.
One array parser alone cannot close the campaign item. Preserve KNOW-15 identity; settle an explicit
claim-level carrier before implementation, keep one bounded response/site, and never permit multiple
fenced responses as a substitute. Production currently stores the whole validated answer envelope despite
comments saying scratch is discarded; this discrepancy must be resolved in that contract, not denied.

Run [41931252280](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41931252280) verified exactly
`57c1052167fce7fe8c9b36a4574a7f1e286eddf5`: 53 script tests without skips (including alias-mutation
control), 90 Atlas cases in 18 files, all five named recovery mutations, unsafe timeout ranges, compiled
worker controls/restoration, committed Own guard and restored-worker overlap. Independent follow-up
review approved for remote verification; no finding was waived. Local guards checked 45 changed paths
with no findings/errors. This is candidate verification, not mining quality or a merge green.

R2a [41931698601](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41931698601) is dispatched at
that exact SHA with `budget=3`, arms `advisory,dependency,count`, `publish=false` and
`index_run=41903314570`. Three selected sites per arm bound this first ranked/evidence/admission/judge
integration attempt; these are NOT another nine-call adapter probe. The 300,000ms model command cap is
unchanged, and index reuse must actually pass source/document checks before any model mining. A refused
reuse does not authorize silently rebuilding/restarting. Background watcher owns completion evidence.

The recovered evidence agents now have disjoint bounded follow-ups on their existing isolated worktrees:
`genesis-eval-recovery` freezes a 76-real-claim Zod input manifest with pinned source blobs and 24/52
calibration/held-out partition (NO gold-label claim); `genesis-facts-contract` prepares an external
two-pattern ast-grep utility probe over actual `llm.ts` with targeted mutants and harmless controls.
Neither changes product/runtime/workflow, calls models, runs local tests, or may merge. The lead will
cold-review and remotely verify these packets before integration; no utility/calibration outcome is
claimed from authoring their machinery. Multiple-fact durable-carrier design remains explicit unfinished work.

The fixed input packet returned as `8660590469106add55c838da9a54b2452606e2aa`, exact three-file scope
and parent `ab27d260db`; independent critic approved for remote testing with the explicit "label-free,
not access-isolated" boundary. Lead read the test/document/manifest shape and composed it on the candidate
as `a46b1fad55`, not on dev. AST packet `064a194dde3ca418c2e9cc4124412739812dea0c` likewise has exact
three-file scope/parent and independent approval for the external experiment; composed as `23e01c3202`.
Neither author executed tests or a real tool. Their reports are not green evidence.

Lead added an independent remote source-byte proof: public immutable commit/tree membership, regular
blob modes, every raw source/license byte hashed using Git's blob encoding, with missing/wrong/truncated
metadata and altered-byte controls. The AST follow-up installs only pinned external CLI 0.51.1 in runner
temp, saves actual version/status/JSON receipts for the eight-query matrix, then checks them mechanically.
No product dependency or runtime Check is added. Both proofs and the offline mutant suites join one
grouped `verify_only` run; pilot 41931698601 stays frozen and is not restarted for these repo-only packets.

### R2a evidence collected — no blind restart

Run 41931698601 completed with refusal, not cancellation. Its strict reuse receipt records 5,691 actual
indexed documents, source revision `3be12844059ee5b6779653236729a8ae69bffb18` and 44 changed maintenance
paths. Policy canary completed with Grok 4.7, zero tools/MCPs, one turn. Mining entered one three-site
parallel batch, then refused on the actual model command's `ETIMEDOUT` at the unchanged 300,000ms cap.
The pool returned; it did not hang. Dependency/count and judge did not run.

Artifact `genesis-pilot-41931698601` is retained in session temp. Its current staging has two advisory rows
with answer references: `packages/schema/src/schema.ts` and `packages/core/src/effect/layer-node.ts`.
These were admitted/stored, NOT judged true. Do not discard or regenerate them merely to debug another
request. The unrecorded failed site's identity is not established by subtracting those two from an older
three-file fixture. The governed refusal replaced all per-arm stdout, so the resulting empty frontier TSVs
are missing rendered evidence, not proof of an empty index. The frontier gate still refuses, but its message
now states that limitation rather than misdiagnosing indexing.

Observed nested phase timings: scan 35,381ms; rank/history 260,905ms, INCLUDING concentration 250,684ms;
selected signal reads 9,777/1,735/3,533ms; model-batch phase 317,018ms INCLUDING those signal reads.
Do not sum nested phases or attribute all selected-signal time to SZZ. Startup before scan and unsampled
provider/backend behavior are outside those measurements. Exact report call/coverage counters were lost
on the fatal render, so R1 is still incomplete rather than guessed from persisted fact counts.

Agent `ses_e5736aa23ffel4neJG2NYwbRFR` now authors test-only failure-evidence acceptance in its isolated
worktree at `8660590469106add55c838da9a54b2452606e2aa`: opt-in full ranked-plan receipt BEFORE provider
entry, report receipt BEFORE captured-fault rethrow, exact counters and no signals/prompt/answer/error text.
Default behavior remains unchanged; the original fault must still be rethrown. Implementation waits for
cold review and remote behavioral red. No next full mining call is licensed by the previous adapter green.

The separate utility run 41933435022 passed build/offline scripts but stopped at lead's source-byte proof:
GitHub's trees endpoint addressed by commit returned the requested commit as `sha`, not `commit.tree.sha`.
Lead repaired the REQUEST to use the explicit immutable tree object SHA and kept the strict identity
assertion, adding a mismatch control. AST was skipped, so no real-binary result is claimed. The next run
executes these two independent proofs even when one fails, retaining the overall failure and both receipts.

Run [41935035465](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41935035465) at
`5600581099967f14126b674e0534eccd01bc6ff1` established the repaired source proof: all 77 immutable regular
source/license blobs matched actual fetched bytes, and all metadata/altered-byte controls passed with no
skips. The offline corpus/mutation suites passed. This freezes real inputs, not true labels or calibration.
Real ast-grep 0.51.1 then emitted empty arrays for both baseline queries; checker correctly refused
`matrix-mismatch: stdio.baseline`. Receipts are retained in session temp `genesis-utility-41935035465`.
The query candidate is repaired by removing the statement semicolon from the assignment-RHS call pattern
and matching the source string's double quotes in the splice pattern; the exact-one/targeted-mutant matrix
and receipt validator are unchanged. This correction needs a real-binary run, not a synthetic green.

Failure-evidence acceptance returned as `b8cb9a9f8144745348c5d08a9490cc216199e8b7`, parent exactly
`8660590469106add55c838da9a54b2452606e2aa`, one test file only; composed on candidate as `9b6a8b3a5c`
for cold review and remote behavioral red. It exercises real disk staging and uses the existing controller
as counter/coverage oracle, not a copied driver. No receipt implementation is present yet. The next scoped
run collects independent compiled gates even if an unrelated proof or the deliberately red acceptance
fails; original failure outcomes still fail the overall job. This is a coverage extension, not a waiver.

Run [41935598579](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41935598579) at
`842159064176a44de71673baabfc8ee999b75fb3` confirmed the intended behavioral red: 91 Atlas cases passed
and the three new enabled-evidence cases failed on missing plan/report files (the disabled case passed).
Build, 112 offline script cases, immutable-source byte proof, existing five mutations, compiled liveness,
Own freshness and restored-worker overlap passed. Independent suite critic approved the acceptance for
red, with an explicit limit: these driver fixtures use injected sequential proposers, not actual workers.

Real AST receipts now have all eight expected match counts, but the strict checker still refused the splice
range. The actual TypeScript `if_statement` owns its trailing `// ≥2 = splice` comment through ASI; the
source-specific range pin truncated it. Lead included that exact comment in the expected span and synthetic
receipt fixture, retaining byte/text/position checks and the same positive/mutant matrix. Do not call the
whole probe green before the real checker accepts it.

Only after that remote red, lead implemented `mine-evidence.ts` and the two driver observer call sites:
allowlisted ranked sites before proposer entry, exact settled report before fault rethrow, no signal getter
serialization or raw model/history/error text. Existing attempts cannot be overwritten. Two new named
remote mutations remove the plan and report observers independently. No scheduling/ranking/admission,
retry, per-command timeout, model effort or Own-pinned file changed.

The next verified run may additionally use `verify_only=true,index_run=41931698601` to reconstruct the
failed source's advisory plan with real history and verified old indexes at its immutable SHA, but an
explicit zero-site budget. Its injected proposer traps any entry, and independent counters must all remain
zero. This reconstructs the candidate identity WITHOUT another Grok request, staging replay, index build
or full mining restart. Reconstruction has its own secret-scan-gated artifact. Its green and the evidence
implementation/mutations remain pending; no follow-up provider call is dispatched yet.

The successful adapter evidence remains run
[41916959601](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41916959601), at
`5c8576eaa26d98db8b4c6af8b2bcc4413f3c8354`: advisory `[proposed, proposed, proposed]`, dependency
`[abstained, abstained, abstained]`, count `[proposed, abstained, proposed]`. Sanitized artifacts are in
the session temp directory `genesis-proven-41916959601`. It did not run ranking, admission, judgment
or publication. Do not repeat these nine requests for unrelated source/test changes.

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
