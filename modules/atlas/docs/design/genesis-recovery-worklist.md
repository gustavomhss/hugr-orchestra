# Genesis recovery worklist — 2026-11-04

Owner: the recovering lead session, branch `genesis-run-fix` (PR #1291).
This is an execution ledger, not a new requirements specification.

## Current blocker — protected restart checkpoints required

Production retry 41974029272 ended during mining with exit 143 at 2026-11-05 07:59 UTC. The job's
collection, scan and upload steps were skipped. GitHub explicitly reports `total_count: 0` artifacts;
the previous failed production run's retained artifact is a positive control for the discovery query.
The underlying cause of termination is NOT established by that exit code or the available annotation.

The original nine claims, their byte-compared CAS/answer receipts, successful binding judgments and
verified indexes remain preserved separately. New proposals from 41974029272 have NOT been recovered
or enumerated; progress logs are not their claim/receipt payloads. This is an unresolved evidence gap,
not a completed campaign and not permission to regenerate replacements silently.

Scoped Grok session searches for `atlas-fact`, the schema source path and the transport-control text
did not locate recoverable sessions through the installed CLI. That does not establish that no history
exists in the subscription account used by the runner. No unrelated session content or credentials
were read. Exact runner/session exports, if available, remain the preferred recovery path.

No further mining, publication, merge or cleanup is authorized by a green unit/integration result alone.
Before another long run, establish durable checkpoints outside the ephemeral runner and verify their
restore path. The owner explicitly selected **“Autorizar recomeço protegido”**: accept the unrecovered
response gap from run 41974029272 and restart from the nine preserved claims **only after implementing
and verifying durable external checkpoints**. This accepts the historical gap; it does not recover those
responses, permit another unprotected run, or waive any admission, budget, judgment or publication gate.
The final epic, verified dev merge and owned-resource cleanup are therefore blocked, not called done.

### Protected restart implementation (not yet cleared for mining)

`90d2605e9e` records the explicit owner decision and adds the repo-only checkpoint contract and
prototype. Checkpoints append scanned, hash-linked envelopes to `genesis-checkpoints`, acknowledge a
GitHub commit only after exact blob readback, and restore original staging/CAS and completion bytes
into a new recovery directory. Unchanged payloads reference earlier acknowledged hashes. Candidate
import and publication remain on the existing governed paths. No new production mining was dispatched.

Initial remote verification 42005730304 FAILED its real-store round-trip assertion: the fixture omitted
the real head-revision callback and the store correctly removed its unsupported `derivedAt`. The fixture
now supplies that callback and checks its own durable readback; the equality assertion is not relaxed.
The external death control was not reached, so external checkpoint durability is still unproven.

Independent cold review found prototype defects before production wiring: Map/Set content disappeared
from the staging fingerprint, a nonexistent `MineDeps.onPlan` hook did not checkpoint the real plan, and
identity budget/arms did not actually configure the miner. Repairs fingerprint the real collections,
checkpoint the actual evidence plan before dispatch from the IO thread, and explicitly bind budget/slot.
The envelope guard now uses Atlas's real canonical encoder for CAS addresses and requires fact and
individual claim carriers. Corruption controls relink successor hashes and assert their specific failure
so a stale chain cannot make an unrelated broken guard look effective. These repairs need remote green.

Run 42007274550 passed the script controls, including canonical CAS/carrier refusals, the real store
Map-change acknowledgement and identity-bound options. Its external producer control committed three
envelopes, was killed with exit 137, and restored original claim/answer bytes through the real store.
Lead separately read the remote Git blobs, verified Git and envelope hashes/chain, matched every decoded
payload against original scan buffers and restored files, and rejected a wrong-hash control. The whole
run still FAILED: the subsequent transport worker inherited `--input-type=module` from its inline caller.
That caller is now a normal file entrypoint. The transport's completion-withholding/termination controls
and complete exact-head integration must pass before mining; the death-control result alone is not enough.

Integration 42009143218 PASSED at `ca63ecf20f32661d09662b171da7949d7670b8b2`, including the actual
compiled protected transport, external plan-before-dispatch ordering, upload-refusal withholding,
child termination, canonical-CAS mutation control and the complete existing genesis bundle. Lead
reconciled all seven remote envelopes across producer/transport controls, original buffers and restored
files; the controls made zero subscription calls. These synthetic fixture claims are not the outstanding
actual-subscription multi-claim admission evidence.

Final hardening paces serialized writes below GitHub's documented `GITHUB_TOKEN` and content-creation
quotas, includes the GitHub credential and local capability in the existing decoded-payload scanner,
and force-reaps a model child that ignores termination. Its tests explicitly cover those cases. The
exact new head must pass the same remote integration before restarting the 200-site-per-arm campaign.
The latest fetched `fork/dev` remains `7e3c21c0d0`; verified indexes have not been invalidated by a dev merge.

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
| D1 | Add opt-in stage diagnostics, without changing mining decisions | Live start/end/failure markers distinguish scan, rank/history and model batch; pool mode visible; no prompt/answer/credential bytes; diagnostic-off behavior unchanged | Compiled live pilot 41943429444 retained per-arm scan/history/model timings and parallel-pool markers |
| D2 | Collect current pilot | Preserve mine stdout/stderr, arm reports, staging provenance and judge evidence; reconcile success/failure with actual CLI result | Collected; model refusal established; judge never executed |
| C1 | Review history shortcuts and budget cap | Remove silent signal substitutions or prove exact equivalence on pinned fixtures; cover full plan, explicit budget, interruption/resume and incremental rerun | Candidate implemented; targeted remote tests/mutations passed 41924560574; not landed |
| C2 | Prove compiled concurrency and bounded failure | Real compiled workers overlap under a controlled proposer; budget/order receipts preserved; worker death terminates rather than hanging | Candidate controls passed 41931252280, including unsafe-range rejection; not all worker initialization/child-termination cases |
| C3 | Verify subscription adapter and artifact privacy | Real mining-shaped request succeeds; tool denial established from CLI behavior, not flag name; scanner detects individual and refreshed credentials without printing them | Adapter probe passed 41916959601; scanner controls passed remotely; not full mining proof |
| V1 | Grouped remote verification | One reviewed candidate revision, targeted Atlas tests and script tests, remote typecheck, required guards; falsify new regression tests remotely | Recovery passed 41945340129/41948772342; retained-store, staging-key and binding replay passed 41950086684; multi-fact integration at 84427c436e awaits grouped gate |
| R1 | Reconcile metrics | Report frontier/visited/modelCalls/admission/abstention/hold counts from artifacts, not subtraction guesses | Pilot receipt retained; seven-versus-four settled-key correction remotely verified 41950086684. New admitted-claim/CAS coverage counters await multi-fact integration gate |
| R2a | Instrumented pilot | Indexed frontier nonempty, real model batches settle, evidence collected, judge executes; no quality bypasses | Mining 41943429444 completed; evidence repair and binding replay 41950086684 passed 7/7, no proposer rerun |
| R2 | Budgeted full mining | Budget justified from pilot evidence; no duplicate blind restart; retain source and answer receipts | Next after multi-fact gate and actual old-two/new-seven import/judgment; budget decision still required |
| R3 | Binding publication | Binding judge, hold exclusions, promote reconciliation, Own export and negative check pass; review generated patch before landing | Blocked on R2 |

## Entire inherited campaign (do not silently drop)

| Item | Reference / disposition | Remaining obligation |
| --- | --- | --- |
| Dead-code/spec alignment | #1283, merged `708634ad70a5f8ee5e88526cc71a038288e5cbbb` (inherited record) | Retain alignment through recovery |
| Real SZZ | #1285, merged `8ec5813034` (inherited record) | Do not disable its signal to claim speed |
| Durable hits/decay | #1286, merged `45e3f41c39` (inherited record) | Preserve generated surface and regression coverage |
| Hotspot quality | Corrected age-sensitive candidate composed; real-git and named mutation passed 41945340129 | Preserve through final integration; supersede/close #1300 after landing |
| Owner consumption | Corrected source-author suggestions composed; real-git/fallback and named mutation passed 41945340129 | Preserve through final integration; supersede/close #1302 after landing |
| Multiple facts/site | Frozen contract, cold-reviewed test-first packets, remote behavioral red 41955376732, implementation composed at 84427c436e | Grouped green/mutations and actual subscription multi-claim run, then verified publication |
| Fixed blinded real-data evaluation | Frozen 76-claim run 41955016871 completed; descriptive result committed with actual source/transport/reference provenance | Preserve limitations and immutable results; no heldout tuning or absolute-gold claim |
| ast-grep utility | Real pinned two-query matrix verified in 41937906767 and 41945340129 | Decision closed: useful scoped syntax experiment, insufficient to adopt as production GEN-12 proof engine; no runtime Check/dependency claimed |

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

Cold implementation review of `82e5d0cb0f` returned **FIX-FIRST** before any dispatch. Lead verified and
repaired all three findings: reconstruction now uses an isolated source worktree whose HEAD is exactly
the failed source SHA (not the SCIP-empty historical path), asserts actual dependency edges and traps the
historical fallback; report-only `EEXIST` cannot replace an established model/run fault; environment arms
are resolved by the existing trimmed/case-insensitive resolver only when evidence is enabled. Regressions
cover report-write failure with/without a prior model fault and normalized arm names. A third evidence
mutation replaces original-fault preservation with the writer error. The original expected matrix and
all prior failure gates remain intact. No provider/retry/timeout policy was changed; remote proof remains
pending after this repair.

Independent follow-up approved `3b755b8a8b79cba5f8767bfe7a9c95d1f0aaa0c9` for remote execution.
Run [41937906767](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41937906767) is dispatched
at that exact SHA with `verify_only=true`, `index_run=41931698601`, `refresh_own=false` and `publish=false`.
Its background watcher owns completion. This is the normal scoped suite, eight mutation controls, real AST
checker and a zero-model reconstruction; it is not another Grok/pilot request.

Parallel multiple-fact prerequisite: agent `ses_e5736aa63ffedjNPJD7VLXA3QG` in `genesis-facts-contract`
at `064a194dde3ca418c2e9cc4124412739812dea0c` owns ONLY new CLI/knowledge acceptance test files for an
additive `claimEvidenceByClaim` carrier (`{ factRef, answerRef? }` per normalized claim). NodeKey/place
identity remains unchanged; individual scrubbed fact/answer CAS references survive same-tier claim union,
dedup/reload, and are pruned with claims on raise/replace. Legacy absence remains absence. This is not a
new trust signal. No implementation is authorized before cold critique and remote red; the parser, driver
claim accounting, staged readers, judge and per-claim publication semantics remain explicit dependent work.

Run 41937906767 passed exactly `3b755b8a8b79cba5f8767bfe7a9c95d1f0aaa0c9`: 112 offline scripts,
97 Atlas cases in 19 files, eight named mutations, unsafe ranges/compiled liveness/restoration, committed
Own guard and worker overlap; 77 external source/license blobs; and the ACTUAL two-query/four-variant AST
checker. Its reconstruction consumed 5,691 SCIP documents and 33,605 dependency edges at the failed source
HEAD, produced 1,695 ranked sites, and independently asserted zero proposer entries/calls/spend/writes.
The ranked prefix is schema.ts, layer-node.ts, then `packages/core/src/flag/flag.ts`, matching the two
preserved staged anchors and identifying the missing rank-3 response without another model call.
Artifacts/log are retained in session temp `genesis-verified-41937906767` and `genesis-41937906767.log`.

AST utility disposition: this external pinned binary demonstrably distinguishes the TWO chosen real syntax
claims, targeted mutants and harmless control. It is a repo-only syntax helper, not a persistable Atlas
Check or a runtime dependency-adoption recommendation; no broader semantic/GEN-12 usefulness is claimed.
Fixed real-claim inputs/source bytes are verified, but independent evidence labels and held-out judge
calibration are still open. Do not equate these artifact greens with mining/publication quality.

The next provider diagnostic is scoped to the identified flag.ts only, using the already prepared
three-file source fixture whose bytes are unchanged. Optional trace-file selection must stay INSIDE that
fixture; a `signals` getter traps any accidental history-signal use by the advisory prompt. A separately
declared 90/300/600-second DIAGNOSTIC window is explicit in receipts; production stays at 300,000ms.
A 600-second trace observes whether this isolated request completes, fails differently, or remains active;
one result cannot prove a concurrency/backend cause. It does not authorize silently raising production limits, reducing effort, repeating nine proposals, or
discarding the two already staged candidates. This extension still needs cold review/remote execution.

### Return to mining — owner steering

The owner asked why work was being done without an LLM, then said the task was taking far too long.
Lead acknowledged over-expanding into infrastructure/test/review fronts. Those extra fronts are now frozen;
their committed test packets remain preserved and unfinished, not waived or called implemented.

Real Grok run [41941092589](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41941092589) at
`97a09ee2ea8a7b50a54490c2a2daf8f631320fa5` completed the isolated flag.ts request. Source step ran
00:25:38–00:30:03 UTC (about 265s), with Grok 4.7, zero tools/MCPs, one turn and end_turn success;
1,285 partial reasoning deltas and 87 text deltas were observed, never their contents. The template digest
was `201bf80c681cdad38e36e075b713ac21820503b5a1df818270a907d32e09e30d`, prompt 9,381 bytes.
This is command completion, not admitted/judged knowledge or a byte-identical replay of the old request.

New operational decision, explicitly announced to the owner: raise the subscription workflow proposer
deadline from 300,000 to 600,000ms. The REAL old-cap timeout plus a valid isolated response near that cap
justify headroom against variability; they do not prove concurrency as the cause. Model, effort, one-turn
policy, ranking, gates and site budgets are unchanged. The pool already derives liveness from the resolved
operator timeout, so no hidden per-command clamp is changed. Trace policy receipts now read the actual
model config instead of copying a timeout literal. No more infrastructure work is needed before retrying
the publish=false three-site-per-arm pilot with the existing verified indexes.

Multiple-claim tests are retained as `fe66418016`, fixture isolation `9326d9f059` and strengthened cases
`82d6a1c08a` (from agent `a69d2269e4` / `3a7c547718`). Independent critic approved their scope for remote
red; no carrier implementation or remote red is claimed. They remain paused with the other extras.

### Parallel completion after build refusal

The owner explicitly required parallel work rather than waiting idle for tests. Run 41942375404 at
`ce7a2824dfc29593eafd56119e80525328cef477` failed before model entry: TypeScript rejected the fresh
`rawAnswer` literal in `mine-claim-evidence.test.ts:104`. This was an unverified test packet breaking
the mining build, not another Grok timeout. `f3930682eb` uses the same structural-variable pattern
as the other fixtures; it preserves the runtime input and acceptance assertions.

Wave baseline: `f3930682eb`. Three isolated worktrees, no shared edit sites:
- `genesis-claim-reducer`: projection types and reducer only; frozen optional
  `claimEvidenceByClaim: Record<normalizedClaim, { factRef, answerRef? }>` semantics, filtered to own
  surviving claim keys. No NodeKey change or parser changes.
- `genesis-claim-staging`: CLI staging decision only; individual scrubbed fact CAS receipts, optional
  answer CAS receipts, same frozen map. Existing CAS/reload/scrub seam tests own acceptance.
- `genesis-reconcile`: read-only recovery of the two prior proposals and exact restoration limitations;
  writes its receipt outside the repository, never publishes or calls the model.

Lead owns the build repair, unchanged-budget real mining retry, integration and grouped remote
red/green/mutation verification. Implementation work does not block that mining retry. Existing
claim-carrier tests remain unchanged. Agent outputs are not verification or permission to publish.
Relay arms were created, but hook wiring is unverified and is not claimed as an enforced gate.

The unchanged-budget retry is run [41943429444](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41943429444)
at `bef779fed5650256067777ae735fea3eff4f2c6a`; later carrier work does not alter that run's frozen code.
Carrier acceptance ran independently in [41944747942](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41944747942)
at `fcc0b4bc5c71c2d0e280e9f9e1ebe0b7b2d41762`: six behavioral failures on the absent carrier and 98
passing cases, not a compiler/import failure. Existing recovery mutations, compiled liveness/overlap,
Own freshness and independent utility steps succeeded; the job remains red as intended.

Reducer `1788e5fc1a` and CLI staging `4456a051cb` were read in full by the lead and composed on this
candidate as `675deddcc6` / `00ed0e043a`, not on dev. Independent review found no implementation defect
but required same-claim carrierless replacement, conflicting-receipt DEDUP/request precedence, scrubbed
nested answer receipt and no-answer absence acceptance. Those two test follow-ups run in parallel.
Remote green plus named mutations remain required; preserving individual claims does not implement a
multiple-fact answer parser or downstream judge/publication semantics.

Read-only reconciliation retained the original two proposals and wrote an external receipt at
`genesis-reconciliation-41931698601/receipt.json` under session temp. The agent resolved both facts and
answers through actual Atlas canonical BLAKE3/DiskStore code and re-derived their source anchors.
Lead independently byte-checked every file against that receipt's manifest (with a SHA-256 positive
control) and confirmed both source Git blobs still match the original pilot at the composed candidate.
Retained keys are `1942221e5ea10737cf35031378e4cf76d339f44cb2e9fd9b1366cdb3ab4b679e` and
`3f0a87c1ac80e781bd61f65885c401f3b54ef9f6f53982f49219a831cc3acdb1`. Both remain unjudged.
`index_run` transfers no candidates; blindly copying generations into a nonempty staging store is not
a union. A verified fresh-store restore is possible, but merging retained candidates into a later run
still needs an explicit fail-closed import and inclusion in that run's judgment coverage. No restore,
new model call or publication was performed by this reconciliation.

### Autonomous completion authorization and measured next blocker

Owner explicitly authorized autonomous completion through merge to dev, with no bypasses, discarded
inherited work, hidden debt or unfinished TODOs. Lead remains responsible for evidence and cleanup;
this is not permission to fabricate approval/calibration or claim a passing publish when the bar fails.

Remote [41945340129](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41945340129) at
`1cdabc28023149ac57161833a93f8bd07aea760c` passed: 108 scoped Atlas cases and all 14 named mutations,
including independent union, off-claim pruning, inherited-key exclusion, same-claim replacement and
scrubbed nested answer receipt controls. Lead read exact-head logs. Compiled liveness/restoration,
restored-worker overlap, immutable corpus bytes, real AST matrix and Own freshness also passed.
One additional direct answerRef equality assertion follows the static reviewer request; it was not
present in this exact remote green and joins the next grouped gate.

Real pilot [41943429444](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41943429444) completed
mining/frontier/judging at `bef779fed5650256067777ae735fea3eff4f2c6a`; downloaded artifacts are retained.
The job succeeds only because `publish=false` makes the quality bar advisory: judge `pass:false`, one
true/non-obvious and six unverifiable out of seven eligible, no malformed/failed judge calls. This is
NOT a publishing green. Reasons expose missing context: whole-file anchors get only lines 1–41, and
sound dependency/count witnesses lack resolved definition/reference evidence in the prompt.
Repair evidence presentation and rejudge preserved candidates, not a new mining run or a weaker bar.

Artifact-derived R1 receipt is `genesis-pilot-41943429444/metrics-reconciliation.json` in session temp:

| Arm | Planned | Issued / used / spent | Admitted / staged | Abstained | Unvisited | Answer receipts |
| --- | ---: | --- | --- | ---: | ---: | ---: |
| advisory | 1695 | 3 / 3 / 3 | 3 / 3 | 0 | 1692 | 3 |
| dependency | 1695 | 3 / 3 / 3 | 1 / 1 | 2 | 1692 | 1 |
| count | 1695 | 3 / 3 / 3 | 3 / 3 | 0 | 1692 | 3 |

All report coverage rows close; durable staging has seven distinct keys. There was no publication/hold
operation in this publish=false run. Nested timings are retained, not summed: advisory scan 29.6s,
rank/history 218.4s (including concentration 209.5s), selected hydration 8.3/1.5/3.0s and model-batch
384.9s including hydration. Later arms reused concentration memo; their model-batches were 44.8s/81.9s.

Next parallel wave: full bounded source presentation + actual indexed caller evidence; a candidate-only
integrity/grounding-checked import; durable-key metric correction; independent source-reference labeling
of the fixed real corpus. Two fresh annotators receive only pinned claim/source inputs, no historical
votes or each other's output. These are source-review reference labels, not absolute gold, and blinding
is instructional rather than an access-isolated capability boundary. Pinned source/license bytes were
fetched to external session temp and every Git blob rechecked before annotation; nothing enters release
resources or developer state. Judge settings must freeze before held-out scoring, never tune on it.

Source/index context repair at `32309be42a` passed remote grouped run
[41948772342](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41948772342), including the real
source-reader integration, tail-dropping and exact indexed-role/scope mutation controls. This does not
validate a source restore or a new Grok judgment; those enter the judgment-only route next.

Cold review of retained-candidate import found and repaired a native nonexclusive-put race after the
exclusive CAS install, valid own `__proto__` claim handling, missing old-claim/destination-only survivor
assertions and vacuous empty audit arrays. Follow-up static approval is for remote execution only; real
compiled-store tests and four production mutations precede all judge calls in the replay job.
The staged-key metric repair reads settled Map keys, with a clearly labeled legacy reported-id fallback;
its seven-versus-four case and named mutation also run before replay model calls.

The fixed external corpus contains a 153,859-byte `src/types.ts`; the initial 120,000-byte source bound
could not provide its complete evidence. The explicit bounded capacity is now 256,000 UTF-8 bytes for
source and indexed context, with exact-bound/over-bound controls updated. This changes capacity, not
truth thresholds, prompts, model effort or sample selection. External evaluation freeze v2 preserves
v1 and records this input-size correction before any Grok corpus evaluation calls.
Lead independently validated both source-review reference files against every fixed ID/partition and
actual pinned quote, with corrupted-ID/quote controls. Calibration references agree on 24/24 labels;
held-out references agree on 47/52, with the five disagreements remaining explicit reference uncertainty.
Neither historical votes nor these source-review labels are called absolute gold.

### Binding replay and frozen-evaluation preflight

Binding replay [41950086684](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41950086684)
at `67b627220c1a2522132d8f22c8d8d00e8146bd3e` restored and judged all seven pilot claims:
7 true/non-obvious, zero false/unverifiable/failed calls, unchanged judge template hash. Lead checked
the downloaded individual verdicts and real retained-store receipt. No new proposer calls or publication
occurred. This validates those seven candidates only, not the separately preserved older two proposals.

The frozen evaluator's static reviews closed an editable-prompt-hash bypass by reconstructing prompts
from pinned source/claim/template/nonce. Actual evaluator tests and 76 Grok judgments remain pending.
Versioned source-review references preserve original labels/quotes, annotator session IDs and original
annotation hashes; both original freeze receipts and the immutable source MIT license remain repo-only.

Workflow review found that a complete 153,859-byte source cannot travel in one Linux argv entry. The
pinned installed Grok 1.0.13 help confirms `--prompt-file`; the wrapper now uses `/dev/stdin`, preserving
the complete prompt without temporary plaintext files or an argv-sized copy. The corpus route checks
freeze corpus/template hashes before requests, tests actual wrapper large-byte transport with a fixture
command, kills the old argv mutation, and runs a large-input real policy canary. These new controls are
authored, not yet remotely verified. Transport acceptance also requires exit zero, not just valid stdout.

Still open: evaluator remote execution and corpus results; multiple-fact parser/driver/promotion/judge
integration; actual old-two/new-seven restoration and judgment; measured expanded mining budget and
binding publication; final integration/epic, `dev` merge and owned-resource cleanup. Acceptance suites
are retained separately from the evaluation route until their deliberate behavioral red is inspected.

Corpus attempt [41954645605](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41954645605)
at `7fe589629b` passed evaluator/source/index/helper tests, immutable source validation and reference/freeze
preflight. The actual large-input policy canary succeeded with zero tools/MCP, but reported `grok-4.6`
instead of frozen `grok-4.7`; the model pin correctly refused before any corpus request. Its descriptive
all-missing score is not a model-quality result. The wrapper now explicitly selects `--model grok-4.7`
instead of relying on the CLI mode's default; the freeze and quality settings are unchanged. Scoring is
skipped when the corpus request step never ran, rather than presenting a failed preflight as 76 judgments.

### Frozen corpus evaluation completed; multi-fact behavioral red established

[41955016871](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41955016871) at
`0451a04cbb3b965f420414643432cd077a100adb` completed all 76 Grok judgments with zero failed calls.
The real policy canary reports `grok-4.7`, one turn, zero tools/MCP. The 180,035-byte fixture input reached
the actual wrapper intact; its old long-argument mutation failed. Exit-one commands with valid verdict
JSON were rejected. Lead independently reconciled every report ID/reference and confusion cell against
the committed corpus/references, verified all 76 attempt receipts, and rejected planted dropped-row and
wrong-confusion controls. Full sanitized artifact SHA-256:
`f846dc6ba96e460d860cc008fb0627a4f68fb78ba657fff7e2da5a5712f8c758`.
Repo-only descriptive result: `script/atlas-genesis/realdata-evaluation-result-v1.json`.

| Partition | Truth agreement vs A / B | True precision vs A / B | Failed calls |
| --- | --- | --- | --- |
| calibration (24) | 22/24 / 22/24 | 20/20 / 20/20 | 0 |
| heldout (52) | 41/52 / 41/52 | 35/37 / 34/37 | 0 |

This is measured reference agreement, NOT a claim of general or perfect judge accuracy. The fixed heldout
mix includes reference disagreements and sparse classes; non-obviousness agreement does not establish
discrimination when a class is absent. No prompt/settings/bar tuning follows these heldout results.

[41955376732](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41955376732) at `85d0de57e7`
built/typechecked the composed acceptance suites and established behavioral red: parser (16/34 failed),
promotion (19/25), grouped extraction (8/8), CLI run evidence (2/2), and actual compiled worker transport
(1/1), plus per-claim judge/publication failures. Existing recovery controls still ran; the failing suites
were not hidden behind missing exports or type errors. Three disjoint implementation packets now own
parser/host mapping, driver/transport/evidence, and governed promotion. Lead owns judgment/publication.

### Integration gate and next production budget

Composed `84427c436e` closes parser/driver/promotion/judgment implementation seams, adds the actual
host-answer two-claim receipt check, and wires named production mutations for collection loss, semantic
grounds, byte/control boundaries, site productivity, clone rebinding, settled CAS identities, resumed
admission counts, trusted origin and full-row promotion settlement. Five additional judge/publication
mutations use actual production modules in memory. None is called green until its remote run completes.

Cold reviews closed escaped controls in retained semantic metadata, missing/foreign representative
pointers, null carrier laundering, invalid full-payload crashes and the predicate normalization namespace.
New double casts were removed by giving identity helpers types matching the grounding/slot/check fields
they actually read; no identity formula changed. Existing router/anchor goldens join the integration gate.

The Own receipt refresh is authorized for the existing unchanged `packages/genesis` pack only: its single
invariant (structural bootstrap before governed seeding) still follows from the composed scan→rank→visit
order. The runner must materialize the three current source blobs and assert byte-equivalent pack content;
lead will inspect and commit the generated patch, not hand-edit snapshot hashes.

Next mining budget decision: the production GEN-2 default is `min(frontier_size, 200)`, not the pilot's
three sites. Use 200 sites per advisory/dependency/count arm (at most 600 new proposer commands), keeping
the default compiled width, one completion/site, 600-second command cap, sequential arms and all quality
thresholds unchanged. The measured pilot establishes 1,695 planned sites/arm, real settlement and binding
judgment; source/history setup cost and bounded pool overlap were separately measured. Import and rejudge
the actual old-two/new-seven union first. Preserve inherited candidates, report repeated visited places
and cold tails honestly, and do not represent a bounded genesis pass as a full repository sweep.

The first two dispatch attempts for the integration gate returned GitHub HTTP 403 rate-limit responses;
no integration job is claimed to have started. The rate endpoint's core counter still showed capacity,
so the precise limit class is unproven. One retry is scheduled after the reported reset at 03:37:56 UTC,
with no polling loop, credential switch or alternate write route. Publication/merge remain blocked on the
actual grouped result. Meaningful source artifacts and proposals are preserved while this service blocks.

### Current-base integration and fresh-index verification

Merged current `fork/dev` (`7e3c21c0d0`) in `443afb5f30`; no conflicting work was discarded. Runs
41962833839/41962901944 stopped before model entry on the collection-narrowing compile error, repaired
in `7998cfd195`. Neither run is candidate-judgment evidence. There is no outstanding retry timer.

Integration 41964340579 at `01baccad47` built/typechecked and passed 435/436 scoped Atlas tests, every
new parser/driver/promotion/compiled-worker acceptance case, all named production mutations, all five
judge/publication mutations, and compiled worker liveness/overlap. It is still a FAILED integration:
the repo-only AST experiment referenced the old parser spelling, and the existing staged-metrics
test still expected source IDs from the now-CAS coverage ledger. Repairs preserve the syntax matrix
and separately assert source-ID versus CAS identities; the next grouped run must prove them green.
Own receipt generation was skipped after these failures; no snapshot refresh has been committed.

Fresh indexing now has an independent, model-free route and uses the same helper as normal mining.
Rejudgment's index run is independent of its retained proposal run. Review-approved strengthening
`1096bd23e7` scans both uploaded dumps and receipts, compares actual checkout changes with HEAD, and
checks each indexed document's actual bytes against HEAD's Git blob (including untracked/ignored and
symlink refusal). Index-only 41964634307 is in progress, not yet reusable. Root typecheck 41964721643
passed at `1096bd23e7`. Candidate-only recovery remains independently grounded, never an index waiver.

PR #1291 now describes the composed campaign rather than the obsolete initial pilot. Remaining work
is unchanged: exact-current integration/Own refresh, actual nine-claim union, 200-site-per-arm mining,
binding publication and reviewed Own output, final epic and verified dev landing, inherited PR closure,
and cleanup of owned resources while keeping all meaningful evidence.

Integration [41965114903](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41965114903)
at `c7aebcd74a7bab9f7a5e4db874b24f1738b91018` is GREEN: 436/436 Atlas cases in 51 files,
script tests including the five judge/publication production mutations, all named recovery mutations,
compiled pool liveness/overlap, immutable-source proof, real updated AST matrix and Own materialization.
Lead downloaded the logs/utility evidence and applied the exact runner-generated `recovery-own.patch`:
the invariant pack is unchanged and all three source blobs equal the current checkout's Git blobs.

Index-only 41964634307 correctly refused a genuinely wrong Python root: pinned scip-python emitted
paths rooted at `modules/relay` (explicit in its log), but the historical manifest prepended `lib/`.
`a8b3a7e13c` fixes the root and indexes from that actual project directory. Restore routes now require
the artifact's root manifest instead of overwriting it; failed, scanned dumps get a distinctly named
debug artifact, never the reusable-index name. The source-byte validation remains mandatory.
The next index-only run has no model calls. Publication uses the same `bun typecheck` package gate as
other routes. Multi-fact acceptance still requires an actual subscription completion admitting multiple
claims with individually preserved receipts in the production campaign—not synthetic tests alone.

Index attempts 41965633624 and 41966855441 exposed generated Python wheel copies and generated
TypeScript declarations in raw indexer output. Pip builds now occur outside the checkout. The explicitly
tracked-source projection in `c7c473a239` preserves complete raw protobuf dumps plus before/after hashes
and every excluded path; it admits only tracked regular documents, then applies the unchanged strict
Git-blob byte check. This does not establish repository-wide absence/completeness or exact total counts.
The exclusion policy is versioned, not a path allowlist or a silent exception to the byte guard.

Integration 41966913287 at `8a69b05da7` verified the committed Own refresh. Integration 41968247008 at
`c7c473a239151708dfef7a087bd92eebbb135c2e` is GREEN, including actual protobuf projection, raw-evidence
immutability, all refusal controls, the production filter mutation and tracked-byte mutation, 436 Atlas
cases and the full named recovery controls. Index-only 41968243554 is still pending; no failed index
artifact is treated as reusable and no new model requests have run during these indexing repairs.

Correction to the preceding diagnosis: `packages/app-shell/src/custom-elements.d.ts` is a tracked
symlink to tracked `packages/ui/src/custom-elements.d.ts`, not generated source. `7a5a1f2f2f` extends
the immutable-source proof to aliases by checking every link's actual text against its Git blob,
requiring an entirely tracked in-repository chain with no cycles, and comparing the final source bytes
with the regular target's Git blob. Untracked generated documents remain explicitly excluded and raw
evidence remains preserved. No alias or dirty-source waiver was introduced.

Both integration 41969397745 and fresh indexing 41969394500 passed at the SAME revision
`7a5a1f2f2f4dfdddf157fabfe0415c9201822037`. The reusable index validates 5,741 actual documents.
Lead downloaded both artifacts, reconciled every raw/scoped dump SHA-256 and exclusion count, checked
the unchanged root manifest, and rejected a planted wrong-hash control. Reusable indexes are now
available; the earlier failed debug artifacts are not their source. The actual nine-claim retained union
is dispatched with `judge_run=41943429444`, `retained_runs=41931698601`, `index_run=41969394500`,
`publish=false`. This spends judgment calls only; no inherited proposal is replaced or implicitly judged.

Retained replay [41970192259](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41970192259)
passed the actual nine-claim union at `7a5a1f2f2f`: nine true/non-obvious, zero false/unverifiable/failed
calls. The seven places contain all nine distinct claims, including both older proposals. Lead matched
every parent/factRef to its own judgment, compared every original fact/answer byte with both original
artifacts, verified the unchanged judge-template hash and nine successful attempt receipts, and rejected
planted missing-record/wrong-factRef controls. No known retained negative verdict is being ignored.

Production [41970798064](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41970798064) is
running at `89eb02ad79b6f4e69ff98aa9d83e52e4500a5a29`: budget 200 per advisory/dependency/count arm,
both original retained sources, verified indexes from 41969394500, `publish=true`. Arms remain sequential,
proposer workers parallel, and the unchanged binding judge/governed promotion/exclusion checks decide
publication. Still required: real subscription multi-claim admission evidence, artifact-derived metrics
and honest cold-tail report, reviewed publication output, final exact-head gates/epic, verified dev merge,
inherited PR closure and owned-resource cleanup. A dispatched production run is not a publication result.

Production 41970798064 FAILED at the actual command boundary: Node's synchronous stdin pipe is a
Unix socket, and Grok's pathname reopen of `/dev/stdin` returned ENXIO. The regular-file redirection
controls had not exercised that boundary. The advisory report records eight issued commands, zero
completed calls/admissions/stored answers; lead compared the full retained projection and all CAS bytes
with the successful nine-claim union and confirmed they are unchanged. No failed run licenses publication.

`95a4c5a997` repairs the wrapper by privately materializing full stdin, reopening it as a regular file,
unlinking the pathname BEFORE the same direct Grok exec, and preserving cleanup on early signals/errors.
The actual compiled ModelClient now has a large-input fixture that reopens the pathname, checks exact
bytes and pre-exec unlink, and requires the old socket-reopening production mutation to fail with ENXIO.
A separate real-subscription socket canary precedes mining; model/effort/turn budget and the 600-second
production cap are unchanged. Missing judgment still refuses publication, but artifact collection now
copies all recoverable state before that refusal. No local tests or model calls were used.

The isolated adapter probe now accepts the existing independent `index_run` selector with the same
strict ancestry/whole-change/document checks; it must pass with the verified current indexes before
retrying production. It runs no rank/history/mining/storage/publication, but exercises the real compiled
workers and subscription command. Its outer diagnostic deadline no longer undercuts the production cap.

The initial socket regression control's positive large-input leg passed, but its intentionally broken
child exited before the parent finished a large write, masking ENXIO with EPIPE. `edba77519d` keeps the
full-byte positive control and uses a small negative input to isolate the same socket pathname-reopen
defect without that unrelated write race. No failure was reclassified as an accepted model response.

Isolated probe [41972885539](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41972885539)
passed at `edba77519d`: actual compiled-client subscription control accepted all 180,112 prompt bytes;
all nine real compiled-worker requests settled (advisory/count proposed, dependency abstained). The
policy receipt observes `grok-4.7`, one turn and zero tools/MCP. Lead reconciled the actual receipts and
rejected a planted command-failed control. This proves transport, not admission or publication quality.

Pre-epic static guard review found `llm.ts` over Atlas's hard file ceiling. `2a27e5427e` extracts only
command error vocabulary/interpretation into `llm-command-failure.ts`, retaining the same public exports,
class identity, spawn site and parser bodies. No waiver or spawn-allowlist change was introduced. The
static size guard passes; remote integration 41973520612 must validate the composed runtime before the
production retry. Snapshot/retained evidence and the strict publication bar remain unchanged.

Integration 41973520612 passed at `2a27e5427e6752f748529139ed109d614a773636`; the extracted error
helpers preserve public constructor identity and all scoped/runtime/mutation controls remain green.
Production retry [41974029272](https://github.com/gustavomhss/hugr-orchestra/actions/runs/41974029272)
is now running at `afc309cda35168d9cb7636b6b57b74e21c6d7b6a`, after the isolated real-subscription
probe passed. It keeps budget 200 per arm, both original retained sources, fresh indexes 41969394500,
and binding publication. The prior eight failed command dispatches remain separately reported; they
did not complete requests, admit claims or replace retained evidence. No result is presumed for this retry.

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
