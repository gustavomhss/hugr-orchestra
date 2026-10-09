# Research UI qualification

## Status and identity

**UNRUN.** These files are detecting controls awaiting final execution, not acceptance evidence. No test, typecheck, production build, browser, model evaluation, dependency installation, push, PR or merge was run during this preparation.

- Preparation checkout: `jimmy-ui-close`, starting at `3a62efbcee`.
- Original product comparator: `73651a0e69a2912d9244dbb73e985c5828c03058` (`73651`). It has no `ResearchResult` renderer.
- Candidate for final execution: the lead's frozen integrated checkout SHA, recorded before building. Do not substitute this preparation baseline for the original comparator.
- Data: deterministic synthetic public fixture strings; no evaluator/private oracle content.
- Production path targeted by authored controls: app session timeline → task tool projection → `ResearchResult` → `DirectoryDataProvider` callback → generated `client.v2.research.artifact` → HTTP page decoding/integrity → production `Markdown`. The tests do not mount a copied component or duplicate HTML.
- Shared mock transport, SSE transport, benchmark fixture/config/probes and production sources are unchanged by this package. Static `git diff` between original comparator and preparation baseline returned identical shared harness files; the positive control (`research-result.tsx`) returned an added renderer. This establishes source comparability, not runtime performance.

## Authored detecting controls — all UNRUN

`packages/app/e2e/regression/session-research-result.spec.ts`:

| Concern | Observable assertion / positive control |
| --- | --- |
| Terminal versus answer qualification | All five terminal reasons display exact terminal copy alongside independently chosen `answered`, `partial` or `blocked` qualifier, rendered answer heading and limitation. Host-only detail is not projected. |
| Verification admission | `referencesChecked=false` and `card.parsed=false` withhold answer heading and show exact unverified fallback; retained document still opens successfully. |
| Generated-client paging | Exact child Session ID, artifact ID, `revision=1`, initial absent cursor and next cursor; complete Markdown heading/body renders only after both pages. |
| Keyboard and accessibility | Task link → Tab reaches named document button; Space opens it. Pending button disabled and pressed; `aria-controls` names real busy target; exact loading status becomes empty; selected document is a region named by its heading. |
| Integrity and unavailable data | Wrong digest, foreign receipt binding, changed revision, truncation, repeated cursor, malformed response, HTTP 404 and 503 produce exact unavailable status, bounded request sequence, no retained/altered partial text. Successful paging is the positive control. |
| Supported page bound | A digest-correct 16,384-byte page renders; digest-correct 16,385-byte page fails. This isolates page size from digest/receipt-size rejection. |
| Foreign offered document | Foreign execution receipt's named button is disabled beside usable document; usable document completes through the expected artifact requests. |
| Pending selection / envelope replacement | Hold old first HTTP page, select fresh document or deliver replacement result through SSE, then release old response. Fresh heading/pressed state completes; old cursor never starts and stale heading/body stays absent at completion checkpoint. Envelope replacement also removes old selected region. |
| SPA navigation / disposal | Hold document request, navigate using real task link to child Session, assert destination title/content and removed result, release response, return through history. Original answer is present, selection reset, status empty, old document/cursor absent. |
| Direction / locale fallback | English LTR, English forced RTL, Arabic RTL retain selected locale. Hebrew/Arabic titles use `bdi dir=auto`; headings/Markdown use `dir=auto`; inline paths and fenced code are LTR/isolate with exact content. Named button opens through Enter; title geometry stays within button. Research copy falls back to exact English in Arabic. |

The narrow `session-research-result.fixture.ts` supplies payloads, SHA-256 receipts and HTTP pages only. Unknown artifact/session/revision/cursor requests fail explicitly. Production code owns rendering, loading, validation and cancellation.

Cancellation assertions are bounded to old request completion plus fresh document/destination/return readiness. They do not claim indefinite absence or cancellation of the underlying HTTP fetch: current callback has no fetch AbortSignal. Required property is stopping subsequent cursor work and stale presentation.

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

Final authorized dispatch from repository root, after candidate is available remotely:

```sh
gh workflow run test.yml --ref "$CANDIDATE_REF" -f windows_e2e=true
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
| Remove cancellation checks/abort on context cleanup | Old continuation cursor appears at replacement/navigation completion checkpoint; stale display assertions may also fail. Confirm actual failed checkpoint, not timeout alone. |
| Remove execution-binding check in `canOpen` | Foreign button becomes enabled. |
| Use non-focusable document control / remove accessible name | Tab focus or named button/region assertion fails. |
| Remove bidi isolation for code | Computed LTR/isolate assertion fails in mixed RTL test. |
| Remove English research fallback | Exact terminal/qualifier copy fails in Arabic. |

## Remaining evidence gaps

- Every execution, mutation result, browser report, timing, trace and CI URL is **UNRUN**. Authored assertions are not demonstrated detecting assertions until the corresponding mutation is observed failing.
- `packages/app/e2e/tsconfig.json` currently enumerates selected specs; it does not include these new regression/benchmark files. Shared config was frozen. Final integration must add their explicit include paths before claiming an E2E compiler check. Then run `bun typecheck` and `bun run typecheck:e2e` from `packages/app` once; the latter alone in the current config would miss this package.
- Direct live-server storage/admission/authorization, actual server-switch during a pending request, desktop Electron multi-process behavior, native screen reader review, zoom/resize/full RTL scrolling, other locales/browsers and maximum document/page-count bounds remain outside these browser controls. Their existing native/unit/manual qualification remains separate; no skipped test represents them here.
- Regression timeline transport uses existing V1 message fixtures with the actual generated V2 research-artifact client. Full V2 message projection/stream equivalence needs separate execution evidence.
- Original comparator cannot measure research render/open work. This limitation cannot be removed by copying the candidate renderer into it.
