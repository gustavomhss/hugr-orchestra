# Backend failure repairs — compaction handoff

Date: 2026-10-08. This snapshot supersedes the older `session-handoff.md` for current execution state.
The owner requested saving state **before continuing**. Stop after saving; resume after compaction.

## Owner instructions and authority

- Chat: Portuguese, persistent full caveman style; code/docs/commits/PRs use normal English.
- Goal: resolve every valid failure from the real backend-seat campaign, selectively rerun affected cases,
  and finish verified delivery. Do not call the specialist complete based on unit CI alone.
- Parallelize independent work. Keep implementation simple; no speculative benchmarks or repeated successful runs.
- Model: **`openai/gpt-6-luna`, OpenAI directly with existing OAuth**, not OpenRouter or Muse Spark.
- Explicit standing publishing authorization: **"commit, pr, merge, tudo isso e responsa sua irmaozao."**
  Own commits, PRs and merges; do not repeatedly ask for routine publishing approval. Gates still apply.
- Owner chose interrupted scaffold **"Falhar fechado (Recommended)"**: retain existing locks/partial artifacts
  for owner review, no automatic stale-lock reclamation or recovery journal.
- Do not print/persist real credentials or refresh inherited owner OAuth. Model evaluation uses a host proxy;
  only inert `bench-proxy` OAuth data reaches the isolated source server.
- Repo unit tests run on Actions via `bun run test:ci`, never local `bun test`. Local package `bun typecheck`
  and godfile allowed. Real CLI/kernel/DB probes and synthetic candidate acceptance are runtime evidence.
- Full epic CI once per completed milestone; targeted gates once code is coherent. Stage exact filenames;
  no `git add -A`, config changes, force pushes, hook bypasses or published-history rewrites.
- Do not stop/restart owner app/server. Only dispose isolated listeners/services/process groups created by us.
- Default branch `dev`, remote `fork` → `gustavomhss/hugr-orchestra`.
- Current identity is `packages/orchestra`, `@orchestra/*`, `ORCHESTRA_*`. Historical private bench may
  reproduce pre-rename OpenCode; product does not gain aliases/migration.
- Native specialist id `backend`; display label configurable. Never spell its default label outside
  `BACKEND_DEFAULT_LABEL` in roster.ts. Maestro name fixed. Preserve dependency direction and V2 session invariants.

## Working directories

All paths below are under `/Users/gustavoschneiter/Documents/HuGR/_worktrees/` unless absolute.
Canonical checkout is a different user/peer worktree; leave its unrelated changes alone.

| Worktree | Branch / tip at snapshot | State |
| --- | --- | --- |
| `backend-failures` | `backend-failures`, `45cc174948839b09bdfe4911f9ad3f0329c24cb7` | Integration branch; clean before this handoff. Contains first repair iterations and framework/Relay catch-up. Later review fixes not integrated. |
| `seat-framework` | `seat-framework`, `d8543e9c667dbd13932b5586cdd79d567ac0fd9a` | Published framework milestone; PR #93 merged. |
| `toolkit-repairs` | `toolkit-repairs`, `1a66c4a8902c806463347c9207ec2072a2e0a630` | Verified review follow-up; clean; integrate later. |
| `generator-pins` | `generator-pins`, `ef3c1419cfccde9bcf3d96373a25b2e5636347cf` | Verified grammar/YAML follow-up; clean; integrate later. |
| `listener-binding` | `listener-binding`, `4f0d921ea6b293e3f73f591812e56cba2a7c0407` | Verified listener-local plugin binding; clean; integrate later. |
| `sandbox-repairs` | `sandbox-repairs`, `79acfdabcb` | Agent cancelled with uncommitted partial follow-up. Preserve/review before editing or committing. |
| `backend-bench` | independent repo, `seat-runner`, `4f0ee9df45e874b720606a3c188e0c1300329c63` | Agent cancelled with uncommitted bootstrap/acquisition/CI follow-up. Original protocol edits also uncommitted. |

Original recovered Claude session: `0e13edec-fdb1-4a51-b3c0-3db1f97753eb`.
Locate its transcript by that UUID under `/Users/gustavoschneiter/.claude/projects/`; historical display names are not reproduced here.

## Closed framework milestone

PR **#93**: <https://github.com/gustavomhss/hugr-orchestra/pull/93>.
Merged 2026-10-08T03:51:22Z as **`40caeb0d6196147f0eff5a4d435c806ca5401f6e`**.
Full epic: 16 checks passed; Atlas lane skipped by scope. Do not claim skipped Atlas execution.

Delivered definitions/registry, generic permissions/write roots/resume/result binding, scaffold,
fail-closed source/compiled skill admission, UTF-8/LF packaging and genuine second-seat bundle proof.
Atlas and backend toolkit remain explicitly backend-owned. Domain readiness is a separate concern.

Final integrated targeted gate: <https://github.com/gustavomhss/hugr-orchestra/actions/runs/37703750233>,
**93 pass per OS**, source/compiled positives, omitted-map/backend-only-lookup negatives and restored positives.
Independent cold review findings were corrected/re-reviewed. Existing roster hash preserved.

Older **#90** remains open: <https://github.com/gustavomhss/hugr-orchestra/pull/90>, branch `seat-write-roots`.
It predates rename and includes scope guidance plus SQLc flag correction. New repairs carry equivalent relevant
changes; reconcile/supersede it after delivery, rather than merge stale branch blindly.

## Original real-model findings

Evidence in `backend-bench/results/2026-10-07-gpt6-luna-native-isolation/`:
`report.md`, `analysis.md`, `transport.json`, per-case JSON/event streams.

- 21 cases reached backend child; raw **9/21 pass**. Active behavior **7/8**, Go **0/1**, toolkit **2/11**.
- Case 07 is retired direct-language scenario; delegated English response is not a product language failure.
- 02: Maestro invented missing write scope; specialist received completed brief. Pipeline admission issue.
- 10: assigned Go check tried writing owner module cache; independent sealed implementation checks passed.
- 11/12/16: generator mkdir of missing output ancestors denied by narrow write roots.
- 13: existing 7.10.0 client regenerated with pinned 7.25.0; version preflight absent.
- 14: Buf did not provision owned ES plugin/PATH.
- 17/19: empty-host URL rejected by SQLx/PGLS; local DB socket denied by sandbox.
- 18: SQLglot installer failed after pip success; DataFusion cold acquisition exceeded candidate timeout.
- 21: default network denial prevented observing missing-cluster prerequisite. Never relabel permission denial
  as unreachable-cluster evidence merely to satisfy the oracle.
- Positive 15: SQLc/ogen/Squawk. Positive 20: AST/Gitleaks. Preserve these results.

Earlier outer-sandbox campaign is contaminated setup evidence: macOS nested sandbox apply failed.
It was retained, not counted as specialist-quality proof.

## Integrated first repairs vs pending verified follow-ups

`backend-failures` currently contains:
- `a6bd5321b5`: explicit owner packet boundaries; named symbols do not authorize files; exact recipe generation
  before `--check`/`--verify`; SQLc invalid `--no-database` removed.
- `e3afcbea9e` ← `2b60b40e58`: Buf dependency, pip launcher collision, DataFusion build/readiness budget.
- `b63464d87d` ← `225092099b`: first sandbox parent/cache/host service grants/listener API.
- `8103ca5b0a` ← `5686c478e4`: first generator-pin gate.
- `45cc174948`: framework/Relay dev catch-up.

**Next verified commits to integrate after inspecting diff:**

1. Toolkit **`1a66c4a8902c806463347c9207ec2072a2e0a630`**:
   total Exit settlement including defects; truthful READY requires dependency/executable/shim;
   whole dependency-chain background ownership; raw + normalized diagnostic secrecy; installer env isolation.
   Actions <https://github.com/gustavomhss/hugr-orchestra/actions/runs/37722743632>:
   Linux 49 pass; Windows 38 pass / 11 POSIX skips. Actual Windows Buf cold/warm + missing-shim negative pass;
   cold review's "Windows cannot execute plugin" speculation was falsified by actual output.
   Defect mutation <https://github.com/gustavomhss/hugr-orchestra/actions/runs/37721838729> failed as required.

2. Generator **`ef3c1419cfccde9bcf3d96373a25b2e5636347cf`**:
   closed YAML grammar rejects alias/merge/tag/directive/ambiguous scalar semantics; strict-spec arity fixed;
   wrapper literal-path bypass blocked; multiple PowerShell equals handled; parsed owned call explicitly acquired.
   Actions <https://github.com/gustavomhss/hugr-orchestra/actions/runs/37721218031>: 42 pass per OS.
   Temporary hook calls `BackendToolkit.ensure("openapi-generator")` after pin gate before `prepare`;
   review whether shared prepare API should take parsed ids, without unnecessary refactor.

3. Listener **`4f0d921ea6b293e3f73f591812e56cba2a7c0407`**:
   `ListenerContext.Current` binds plugin SDK + dynamic serverUrl to owning listener; no process-global URL
   policy crossover. Unbound CLI retains old discovery behavior; bound unready listener fails named.
   Overlapping restricted/stock listeners with same directory/session measured with real services.
   Actions <https://github.com/gustavomhss/hugr-orchestra/actions/runs/37723240388>: 4 pass per OS.
   Omitted-binding mutation <https://github.com/gustavomhss/hugr-orchestra/actions/runs/37722807130> fails actual
   completed-read counter. Inspect server.ts merge overlap with sandbox follow-up.

## Cancelled sandbox agent — partial state and critical new finding

Task `ses_ee707f9f0ffesYm3AoN3VtN0Im` returned **Task cancelled** during review corrections.
Owner reported both agents stalled. Lead inspected saved state; do not assume they completed or restart blindly.

Uncommitted files in `sandbox-repairs`:
`packages/core/src/{sandbox-parents,tool-safety-sandbox,tool-safety}.ts`,
`packages/core/test/{tool-safety-loopback,tool-safety-sandbox-repairs}.test.ts`,
`packages/orchestra/src/tool/shell.ts`,
`packages/orchestra/test/server/httpapi-listen-tool-safety.test.ts`,
new `packages/core/test/tool-safety-relay.test.ts`.

Partial changes: `wrap(command, { prepareParents: true })` only at native approved execution boundary;
pre-Verify Relay hook must not create ancestors before shell permission. Unix grant runtime shape validation;
location match before foreign socket stat; multi-root parent rollback; real cache writes/sentinels.

**Important:** agent's adversarial Mac probe invalidated earlier exact-loopback claim.
`remote ip "localhost:<port>"` plus AF_INET also admits another working host/LAN IPv4 at that port.
Partial code now returns **`sandbox-loopback-endpoint-exact-policy-unsupported` even on macOS** for matched
loopback grants. It retains Unix socket support but removes unsafe TCP exception. Do not discard this finding
or restore broad allowance to make case 21 green. Exact endpoint support needs a genuinely enforced solution
or explicit truthful supported-boundary handling. Case 21 currently cannot be claimed resolved.

The partial state is not fully verified or committed. Find completed/failing targeted runs from saved logs
before widening tests; cancellation itself is not a green result. No source/harness process was selected by
the last narrowly filtered process snapshot; tool Task cancellation is authoritative state.

## Cancelled bench agent — partial state

Task `ses_ee72e43aeffegc0BIgjn6kBNdI` returned **Task cancelled**.
Base bench commit `4f0ee9df45e874b720606a3c188e0c1300329c63` delivered rename-aware runtime, owned process
cleanup, nonempty-host Postgres URL, explicit Server.listen profile and `run --attach`.

Uncommitted follow-up: README, harness `{config,host-launcher,host-probe,host-profile,process,report,run-seat}.ts`,
tests `{config,host-profile,process,runtime}.test.ts`, new harness `{acquisition-probe,acquisition,ci-snapshot}.ts`.
`protocol/PRE-REGISTRATION.md` contains lead's saved campaign amendments; preserve it separately.

Partial host bootstrap now defaults to **90s**, bounded 0..300s, records stages every 10s into
`host.bootstrap.json`; candidate budget remains separate. Original failure stopped at source import under load.
`writeAcquisitionResult` records operational errors with `grade: null`, preserves partial streams and existing
results; acquisition is not model wrong. Finish review/test/report integration before committing.
Lead changed socket leaf handling to canonical service directory + lstat (Bun/macOS realpath(socket) can fail).

Bench unit verification uses disposable source snapshots / existing Actions uploader; no local unit suite.
CI snapshot helper is partially written. Inspect before using; do not overwrite source implementation or fake
the host/runtime simply to run bench tests.

## Rerun state and resources

New campaign `backend-bench/results/2026-10-08-gpt6-luna-repairs/`:
**01 PASS; 02 PASS**. Then bootstrap failed with `bench-host-ready-timeout` (old 20s readiness).
No complete valid result for remaining cases; do not claim 11/10 passed. Supervisor stopped on missing result.
Evidence/log: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/backend-gpt6-repairs.log`.
Failed work: `.../opencode/backend-bench-NABhKu/host/host.stderr.log` shows input/source-import only;
`host.process.json` shows exit143, pipes closed and no cleanup errors.

Temporary driver files under `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/`:
- `backend-gpt6-campaign.ts`: targets backend-failures; original same-case result collision protection applies.
  Update to a **new campaign** for next attempt; don't overwrite 01/02 or re-grade originals.
  Two shards, 900s case budget; current coordinator throws on missing result and needs safe sibling finalization.
- `backend-fixed-oauth-plugin.ts`: renamed source imports; writes inert OAuth into isolated data only.
- `backend-proxy-metadata.json`: nonsecret owner credential-store neverTouch paths.
- `backend-campaign.sb`: credential denial control only, never outer-wrap whole candidate.

Real owner OAuth is read only inside supervisor and forwarded only to
`https://chatgpt.com/backend-api/codex/responses`; no token belongs in handoff, results or commits.

Reusable pinned cache: `.../opencode/toolkit-repairs-cache`. Warm-ready needed engines include Buf/ES,
SQLglot30.21.0, DataFusion55.1.0, datamodel-codegen, SQLx/kopium, Orval/Kiota/Modelina, controller-gen/kubeconform,
Kysely/PGLS, gocqlx and existing SQLc/ogen/Squawk. Verify actual readiness after code integration; READY metadata
alone does not prove invocation. DataFusion real CSV + EXPLAIN positive/invalid-table negative already measured.

No-model probes passed before cancellation: real HTTP/CLI parent+child/export/isolation; SQLx migration,
psql marker73 and PGLS query over disposable Unix socket; process tree cleanup with unrelated sentinel alive.
Do not repeat successful probes unless changed code/new failure invalidates their reach.

## Resume order

1. Read this snapshot, relevant AGENTS and current git status. Preserve partial work; do not reset/stash/rebase.
2. Finish the two cancelled worktrees directly or with newly bounded delegation. Close approval-order,
   malformed-grant, foreign-location and exact endpoint issues; finish bench bootstrap/acquisition + unit CI.
3. Inspect/cherry-pick verified toolkit/generator/listener follow-ups; reconcile ShellTool and server.ts overlaps.
4. Fetch current fork/dev (framework #93 is merged), catch up without losing peer Relay work. Package typecheck,
   scoped Actions gates and independent cold recheck; every claimed green needs its negative controls.
5. New selective Luna campaign for affected cases. Preserve acceptance/oracles; calibrate real generator outputs
   independently before correcting any fixture expectation. Failed infrastructure remains named, not fake pass.
6. Publish backend repair milestone PR, full epic CI, merge when actual checks + review + rerun substantiate it.
   Reconcile stale #90. Publish bench fixes/evidence in independent bench repo with its own reviewed scope.

The owner paused work for compaction. **Do not continue fixes until this save is reported and compaction occurs.**
# Historical snapshot — superseded by landing closure

The current execution/publication state is the **Landing update — 2026-10-09** in [session-resume-2026-10-08.md](session-resume-2026-10-08.md). Pending work and blockers recorded below are historical; do not resume them as current tasks.
