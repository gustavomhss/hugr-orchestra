# Research UI qualification

## Status and identity

Preparation originally authored these controls without execution. Subsequent production Chromium execution passed all 28 cases in [37985413261](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37985413261), and the candidate benchmark completed its three predeclared repetitions in [37985414156](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37985414156). Original-baseline comparison and detecting mutations are still pending; scoped browser results do not establish full desktop or real-model acceptance.

Lead integration compiled app/E2E and session-ui. Root AGENTS prescribes GitHub Actions testing; measured runs above used the snapshot CI Playwright runner. Local production recipes below require separately authorized local execution and do not themselves grant it.

- Preparation checkout: `jimmy-ui-close`, starting at `3a62efbcee`.
- Original product comparator: `73651a0e69a2912d9244dbb73e985c5828c03058` (`73651`). It has no `ResearchResult` renderer.
- Candidate for final execution: the lead's frozen integrated checkout SHA, recorded before building. Do not substitute this preparation baseline for the original comparator.
- Data: deterministic synthetic public fixture strings; no evaluator/private oracle content.
- Production path targeted by authored controls: app session timeline → task tool projection → `ResearchResult` → `DirectoryDataProvider` callback → generated `client.v2.research.artifact` → HTTP page decoding/integrity → production `Markdown`. The tests do not mount a copied component or duplicate HTML.
- Shared mock transport, SSE transport and benchmark fixture/config/probes stay frozen. Static `git diff` between original comparator and preparation baseline returned identical shared harness files; the positive control (`research-result.tsx`) returned an added renderer. This establishes source comparability, not runtime performance.
- Cold-review scope adds only the optional fourth `AbortSignal` callback parameter in `session-ui/src/context/data.tsx`, forwards it through `components/research-document.ts`, and supplies it to the generated SDK request in `app/src/pages/directory-layout.tsx`. Existing component controllers now reach the native fetch. These are local callback/RequestInit changes, not Protocol or Server HttpApi changes.

## Authored detecting controls — all UNRUN

`packages/app/e2e/regression/session-research-result.spec.ts`:

| Concern | Observable assertion / positive control |
| --- | --- |
| Terminal versus answer qualification | All five terminal reasons display exact terminal copy alongside independently chosen `answered`, `partial` or `blocked` qualifier, rendered answer heading and limitation. Host-only detail is not projected. |
| Verification admission | `referencesChecked=false` and `card.parsed=false` withhold answer heading and show exact unverified fallback; retained document still opens successfully. |
| Generated-client paging | Exact child Session ID, artifact ID, `revision=1`, initial absent cursor and next cursor; complete Markdown heading/body renders only after both pages. |
| V2 initial load / native replacement | `protocol: v2` bootstrap followed by canonical `SessionMessage.Message`-validated native REST data. Native envelope replacement sends schema-validated and re-encoded `SessionEvent.Tool.Success` (`session.next.tool.success`) directly through `/api/event`, without a test-owned compatibility rename. |
| Keyboard and accessibility | Task link → Tab reaches named document button; Space opens it. Pending button disabled and pressed; `aria-controls` names real busy target; exact loading status becomes empty; selected document is a region named by its heading. |
| Integrity and unavailable data | Wrong digest, foreign receipt binding, changed revision, truncation, repeated cursor, malformed response, HTTP 404 and 503 produce exact unavailable status, bounded request sequence, no retained/altered partial text. Successful paging is the positive control. |
| Supported page bound | A digest-correct 16,384-byte page renders; digest-correct 16,385-byte page fails. This isolates page size from digest/receipt-size rejection. |
| Foreign offered document | Foreign execution receipt's named button is disabled beside usable document; usable document completes through the expected artifact requests. |
| Pending selection / envelope replacement | V1 and V2 hold the old first HTTP page. Register failure wait before the action, require that exact request to emit native `requestfailed` with `net::ERR_ABORTED`, then release the held route. Envelope replacement must reach abort, empty status, non-busy target and unselected fresh button before any fresh selection, so selection cannot mask missing cleanup. Fresh content completes with no old cursor or stale display. |
| SPA navigation / disposal | Hold document request, register failure wait, navigate using real task link to child Session, assert destination title/content and removed result, require exact native request abort, then release route and return through history. Original answer is present, selection reset, status empty, old document/cursor absent. |
| Direction / locale fallback | English LTR, English forced RTL, Arabic RTL retain selected locale. Answer Markdown itself has `dir=auto`, computed RTL direction and exact mixed-script paragraph with isolated LTR inline path; document headings/Markdown/titles and fenced code receive corresponding assertions. Named button opens through Enter; title geometry stays within button. Research copy falls back to exact English in Arabic. |

The narrow `session-research-result.fixture.ts` supplies payloads, SHA-256 receipts, native schema encoding and HTTP pages. Unknown artifact/session/revision/cursor requests fail explicitly. Its V2 helper reloads after registering canonical native REST data because the frozen shared setup registers its catch-all during navigation. Production code owns rendering, loading, validation, compatibility routing and cancellation.

Cancellation is observed at the native browser request boundary, not inferred from HTTP completion or sleeps. The tests require `net::ERR_ABORTED` on the exact captured request while its response remains held, then assert settled UI before continuing. Cursor/stale-display absence assertions remain bounded to those explicit abort and UI completion checkpoints. No test mocks `loadResearchDocument`, the generated client or component state.

## Production benchmark and comparison limits

`packages/app/e2e/performance/timeline/session-research-benchmark.spec.ts` imports the existing `benchmark`, `setupTimelineBenchmark`, CPU profile and stream probes. It preserves the existing production-build web server and serial execution contract.

Workload `research-ui-v1`, same file bytes in both checkouts:

1. Existing history workload (default 320 turns), 160 stream deltas, batch 1, new layout, 30x CPU stress profile.
2. Wait for production Markdown stream marker and settled timeline geometry; collect existing raw stream diagnostics.
3. Stop common stream profile and reset CPU throttle to 1.
4. Publish identical completed task envelope with qualified answer and receipt; record task-link observation time.
5. Current renderer: wait for qualified answer, open retained three-page Markdown document, assert final heading/table/code/end marker and exact cursors. Record result observation and document observation times.
6. Original renderer: assert positive task-link presentation and absent result; report `research: null`, `renderer: legacy`. No document open control exists. This is explicit unsupported product functionality, not a skipped test.

Both runs report checkout SHA, workload digest, workload parameters and diagnostics through shared `BENCHMARK` / `BENCHMARK_PAGE` records. SHA labels are caller-supplied; the final runner must verify them against the actual checkout. Timing describes Playwright-observed DOM readiness, not compositor presentation, INP or user-perceived latency. No machine-dependent threshold is asserted.

Before scenario setup, the benchmark requires a full lowercase 40-hex revision, a declared `current`/`legacy` renderer, nonblank finite safe-integer timeout/count/batch values (history may be zero; timeout, deltas and batch must be positive), finite CPU throttle >= 1, and exactly `0`/`1` for CPU, minimal and visual flags. Visual flags are validated even when CPU profiling is disabled. Invalid configuration fails explicitly; it does not become a different workload silently. These checks are scenario input validation, not new CI guard logic.

**Only `commonStream` is an apples-to-apples rendering workload.** Task publication has identical input but different rendered output. Research render/open metrics are candidate-only; there is no baseline ratio, speedup claim or acceptance budget for them. Original baseline's lack of result renderer must remain visible in the final report. Optional traces span page lifetime; common stream diagnostics use their existing narrower observation window.

## Final-stage prerequisites

Do these once at final qualification, after source/prompt/generator identity is frozen:

- Owner-approved final execution environment; independent original-baseline and integrated-candidate worktrees with separate production ports. Do not restart the running app/server.
- Existing lockfile dependencies installed in both worktrees; repo-pinned Bun and Playwright Chromium plus platform libraries available. CI pins Node **24.15** because Chromium extraction with Node 24.16 hangs. No install command was run here.
- Pre-create writable evidence directories and save exact SHAs, OS, CPU, Chromium/Bun versions, viewport, all environment overrides and control-file hashes. Use the same machine/browser and identical workload/profile settings in both runs; run serially.
- Set `BASELINE` and `CANDIDATE` to worktree roots and `CONTROLS` to the exact commit containing these controls. Apply only the new benchmark and narrow fixture to the original-baseline worktree, preserving its production sources. From a repository containing `CONTROLS`:

```sh
git -C "$BASELINE" restore --source "$CONTROLS" -- packages/app/e2e/performance/timeline/session-research-benchmark.spec.ts packages/app/e2e/regression/session-research-result.fixture.ts
git -C "$BASELINE" diff -- packages/app/src packages/session-ui/src packages/ui/src
git -C "$BASELINE" rev-parse HEAD
git -C "$CANDIDATE" rev-parse HEAD
git -C "$BASELINE" diff 73651a0e69a2912d9244dbb73e985c5828c03058 "$CANDIDATE_SHA" -- packages/app/e2e/performance/benchmark.ts packages/app/e2e/performance/playwright.config.ts packages/app/e2e/performance/timeline/session-timeline-benchmark.fixture.ts packages/app/e2e/performance/timeline/session-timeline-stream-probe.ts packages/app/e2e/performance/timeline/session-timeline-profile.ts packages/app/e2e/performance/timeline-stability/fixture.ts packages/app/e2e/utils/mock-server.ts packages/app/e2e/utils/sse-transport.ts
```

Stop comparison if product sources were overlaid or shared harness differs; reconcile that difference explicitly. Set `CANDIDATE_SHA` to the verified integrated SHA before the diff. Preserve baseline overlay diff and exact control identity.

### Exact serial production benchmark commands — UNRUN

Run first command from `$BASELINE/packages/app`, then second from `$CANDIDATE/packages/app`. Set `EVIDENCE` to an absolute existing writable evidence directory, with `baseline-traces` and `candidate-traces` already created. Each config invocation executes **`bun run build && bun run serve -- --host 0.0.0.0 --port <port> --strictPort`**, rejects existing server reuse, and owns its fresh production server. Do not run `test:bench`: that wrapper also invokes deferred Bun harness tests.

```sh
env PLAYWRIGHT_PORT=3100 PLAYWRIGHT_SERVER_PORT=3100 PLAYWRIGHT_WORKERS=1 PLAYWRIGHT_NO_VIDEO=1 TIMELINE_HISTORY_TURNS=320 TIMELINE_DELTA_COUNT=160 TIMELINE_EVENT_BATCH=1 TIMELINE_CPU_THROTTLE=30 TIMELINE_CPU_PROFILE=0 TIMELINE_MINIMAL=0 RESEARCH_BENCH_RENDERER=legacy RESEARCH_BENCH_REVISION=73651a0e69a2912d9244dbb73e985c5828c03058 ORCHESTRA_PERFORMANCE_TRACE_DIR="$EVIDENCE/baseline-traces" bunx playwright test --config e2e/performance/playwright.config.ts timeline/session-research-benchmark.spec.ts --project=chromium --workers=1 --retries=0 --repeat-each=3 > "$EVIDENCE/baseline.log" 2>&1
```

```sh
env PLAYWRIGHT_PORT=3102 PLAYWRIGHT_SERVER_PORT=3102 PLAYWRIGHT_WORKERS=1 PLAYWRIGHT_NO_VIDEO=1 TIMELINE_HISTORY_TURNS=320 TIMELINE_DELTA_COUNT=160 TIMELINE_EVENT_BATCH=1 TIMELINE_CPU_THROTTLE=30 TIMELINE_CPU_PROFILE=0 TIMELINE_MINIMAL=0 RESEARCH_BENCH_RENDERER=current RESEARCH_BENCH_REVISION="$CANDIDATE_SHA" ORCHESTRA_PERFORMANCE_TRACE_DIR="$EVIDENCE/candidate-traces" bunx playwright test --config e2e/performance/playwright.config.ts timeline/session-research-benchmark.spec.ts --project=chromium --workers=1 --retries=0 --repeat-each=3 > "$EVIDENCE/candidate.log" 2>&1
```

Preserve all repetitions, failures, logs, traces and reports. Require matching workload digests/parameters, completed scenarios and collected metrics before comparing distributions. Optional CPU/visual profiling changes overhead; use a separate identically configured diagnostic pair, not one profiled run against one unprofiled run.

### Exact production regression commands — UNRUN

Run from `$CANDIDATE/packages/app`. Build once with the mocked server on a dedicated port, then serve in its own final-run terminal:

```sh
env VITE_ORCHESTRA_SERVER_HOST=127.0.0.1 VITE_ORCHESTRA_SERVER_PORT=3104 bun run build
bun run serve -- --host 127.0.0.1 --port 3104 --strictPort
```

After that production server is available, run in another terminal from the same package directory:

```sh
env -u CI PLAYWRIGHT_PORT=3104 PLAYWRIGHT_SERVER_HOST=127.0.0.1 PLAYWRIGHT_SERVER_PORT=3104 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3104 PLAYWRIGHT_WORKERS=1 PLAYWRIGHT_NO_VIDEO=1 bunx playwright test --config playwright.config.ts e2e/regression/session-research-result.spec.ts --project=chromium --workers=1 --retries=0 --trace=retain-on-failure
```

Unsetting `CI` is intentional only for this local final production check: normal config reuses the explicitly started production server instead of starting Vite dev. Preserve log/trace/report and label this result **production local Chromium**, not CI. Stop only this newly owned preview server after qualification.

### Actual E2E CI lane — separate from Bun `test:ci`

`.github/workflows/test.yml` E2E jobs install Chromium, compute files with `bun script/e2e-shard.ts <shard> 3`, then run `bun run test:e2e:local $files` from `packages/app` with `CI=true`. The new regression spec enters normal discovery/sharding; the manual performance spec stays outside it. That CI lane uses the normal **Vite dev** web server, not the production benchmark config. Linux runs by default; Windows E2E requires `windows_e2e=true` on workflow dispatch.

Final authorized dispatch from repository root, after candidate is available remotely. Explicitly set `CANDIDATE_REF` to the remote branch name and `CANDIDATE_SHA` to the frozen expected SHA; both are required. Verify the remote head before dispatch, then bind the observed workflow run ID and verify its `headSha` before accepting its evidence. A missing/empty ref must never dispatch the default branch:

```sh
: "${CANDIDATE_REF:?Set the explicit remote candidate branch name}"
: "${CANDIDATE_SHA:?Set the full expected candidate SHA}"
test "${#CANDIDATE_SHA}" -eq 40 || exit 1
case "$CANDIDATE_SHA" in *[!0-9a-f]*) exit 1 ;; esac
REMOTE_SHA=$(gh api "repos/{owner}/{repo}/git/ref/heads/$CANDIDATE_REF" --jq '.object.sha') || exit 1
test "$REMOTE_SHA" = "$CANDIDATE_SHA" || exit 1
gh workflow run test.yml --ref "$CANDIDATE_REF" -f windows_e2e=true || exit 1
gh run list --workflow test.yml --branch "$CANDIDATE_REF" --event workflow_dispatch --limit 5 --json databaseId,headSha,url,status || exit 1
```

Select the exact dispatch from its run URL/list; set `RUN_ID` explicitly. Do not infer the run from an unfiltered latest result:

```sh
: "${RUN_ID:?Set the exact candidate workflow dispatch run ID}"
RUN_SHA=$(gh run view "$RUN_ID" --json headSha --jq '.headSha') || exit 1
test "$RUN_SHA" = "$CANDIDATE_SHA" || exit 1
RUN_WORKFLOW=$(gh run view "$RUN_ID" --json workflowName --jq '.workflowName') || exit 1
test "$RUN_WORKFLOW" = test || exit 1
WATCH_STATUS=0
gh run watch "$RUN_ID" --exit-status || WATCH_STATUS=$?
gh run view "$RUN_ID" --json headSha,url,status,conclusion,jobs || exit 1
exit "$WATCH_STATUS"
```

Record actual workflow run URL and E2E shard results. This command was not executed and uploading/pushing is not authorized in this preparation. Root `bun run test:ci app ...` invokes Bun tests and is **not** the Playwright lane.

## Required mutation probes — all UNRUN

Run each mutation separately only at final qualification; restore production source before the next. Reuse the production regression commands after rebuilding the mutated candidate. Keep the original failing assertion and full trace. An unchanged green run cannot prove a mutation was applied.

| Mutation | Expected detecting assertion |
| --- | --- |
| Omit `ResearchResult` from task renderer | Terminal/qualified answer heading assertion fails. |
| Derive sufficiency from terminal reason | Independently chosen exact qualifier fails (for example blocked terminal + answered card). |
| Remove parsed or reference verification condition | Unverified card's absent heading assertion fails. |
| Drop revision/cursor or use parent Session in app artifact callback | Exact route identity fails, or paged document cannot complete. |
| Bypass digest, receipt equivalence or revision validation | Corresponding invalid page exposes content instead of unavailable status. |
| Remove supported page-byte bound | 16,385-byte digest-correct page renders instead of unavailable status. |
| Remove repeated-cursor rejection | Cursor-loop request sequence or unavailable completion fails. |
| Drop the callback/loader/SDK RequestInit signal propagation | Exact pending request never emits the required native abort; the `requestfailed` wait fails while the response remains held. |
| Remove abort on context cleanup | Envelope-only case fails its abort/settled-state checks before fresh selection can mask the missing cleanup; navigation abort also fails. |
| Remove post-read cancellation checks | Preserve native abort assertion; inspect cursor/stale-state completion assertions and existing loader unit controls separately. Native fetch abort may already reject before the removed check, so do not claim this mutation is detected without observed failure. |
| Drop native `task.state.structured` projection | Canonical V2 initial result or native replacement heading/receipt assertion fails. |
| Remove execution-binding check in `canOpen` | Foreign button becomes enabled. |
| Use non-focusable document control / remove accessible name | Tab focus or named button/region assertion fails. |
| Remove bidi isolation for code / answer auto direction | Computed LTR/isolate or answer RTL/auto assertions fail in mixed RTL test. |
| Remove English research fallback | Exact terminal/qualifier copy fails in Arabic. |

## Remaining evidence gaps

- Production browser and candidate benchmark execution are measured in the runs above. Original-baseline timing and detecting mutation results remain **UNRUN**; no comparative speed claim follows from candidate metrics alone.
- The integrated `packages/app/e2e/tsconfig.json` includes these regression/benchmark files and their reused performance helpers. Consolidated compilation uses `bun typecheck tsconfig.json e2e/tsconfig.json` from `packages/app`, plus `bun typecheck` from `packages/session-ui`. Compilation does not execute browser assertions.
- Direct live-server storage/admission/authorization, actual server-switch during a pending request, desktop Electron multi-process behavior, native screen reader review, zoom/resize/full RTL scrolling, other locales/browsers and maximum document/page-count bounds remain outside these browser controls. Their existing native/unit/manual qualification remains separate; no skipped test represents them here.
- Native Task `state.structured` metadata is preserved in running/completed presentation. Production V2 controls passed, including active-row accessibility and cancellation.
- The actual `session.next.tool.success` envelope adapts into the older rendering client's shape at `server-sdk.tsx`, preserving timestamp, structured output and optional durable facts. Fixture events retain the native name; unit controls passed across the three OSes in [37982434542](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37982434542), and production replacement/cancellation passed. Deliberate mutation execution remains separate.
- Original comparator cannot measure research render/open work. This limitation cannot be removed by copying the candidate renderer into it.
