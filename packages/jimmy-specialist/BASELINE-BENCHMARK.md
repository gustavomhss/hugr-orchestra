# Original production baseline benchmark

> Path note: `packages/orchestra` was the V1 monolith and no longer exists (see `docs/architecture/monolith-map.md`). Paths below under `packages/orchestra` are historical; the live code is in `packages/core`, `modules/*` and `apps/cli`.

## Result

The actual original product baseline completed all three predeclared production Chromium repetitions in [38005242923](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38005242923). All three emitted complete metrics with the expected workload digest, zero retries and `renderer: legacy`. The candidate reference is the already executed [37985414156](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37985414156), not a new candidate run.

| Repetition (`repeatEachIndex`) | Original common-stream completion (ms) | Candidate common-stream completion (ms) | Original / candidate result |
| --- | ---: | ---: | --- |
| 0 | 221750 | 322671.5 | passed / passed |
| 1 | 230215.19999999995 | 319724.9 | passed / passed |
| 2 | 226821 | 304596.70000000007 | passed / passed |
| Median | 226821 | 319724.9 | metrics collected in both |

The observed candidate/original median completion ratio is **1.4095912635955226** (+40.9591% elapsed time). This is a descriptive cross-run observation, not a causal product-regression verdict: GitHub allocated separate hosted machines, and the existing candidate install rewrote its lockfile without retaining the resulting dependency graph. No machine-dependent performance threshold is applied. Passing means scenario completion and metric collection.

Only `commonStream` has identical rendered workload. Task publication has identical input but different output. Original product has no research-result renderer or document-open action: all three original records contain **`research: null`**. There is no original research-render/open ratio.

## Executed identity and command

| Identity | Value |
| --- | --- |
| Original product / starting HEAD | `73651a0e69a2912d9244dbb73e985c5828c03058` |
| Isolated local branch | `jimmy-baseline-bench` |
| Isolated worktree | `jimmy-baseline-bench` under the actual evaluator temporary root |
| Controls read from frozen integration | `4df291b7e832385257eca092a475bb1db6d3082f` |
| Actual baseline GitHub checkout | `a303fa09bdf69084597d9cb8ef64c25ceec3428c` |
| Baseline checkout parent | `73651a0e69a2912d9244dbb73e985c5828c03058` |
| Baseline snapshot tree | `be4685d9991859227ab1fc7a03ce60236ab75cdd` |
| Actual candidate GitHub checkout | `cd6191c5fad394da8d3aad72f7d20f04c9327bb6` |
| Local harness-only commit, made after execution | `0d1fb75d50906e86b8fad4c81adbd5d0e203a864` |
| Baseline test job | [114072398398](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38005242923/job/114072398398) |
| Baseline test job UTC | 2026-10-09 23:36:54–23:50:10 (13m16s) |
| Baseline benchmark run ID | `2026-10-09T23-37-49-216Z-2959` |
| Candidate benchmark run ID | `2026-10-09T20-13-58-065Z-3674` |

Executed once from the isolated repository root:

```sh
bun run test:ci app e2e/performance/timeline/session-research-benchmark.spec.ts --runner playwright --config e2e/performance/playwright.config.ts --benchmark-renderer legacy --os linux
```

The normal `test:ci` uploader created the snapshot from that worktree, verified the uploaded tree against its local snapshot, and uploaded exactly seven changed files on the original parent: six harness files below plus generated `.ci-run.json`. There was no alternate source root or substituted product checkout. `RESEARCH_BENCH_REVISION` correctly identifies the actual overlaid GitHub checkout, not an invented claim that the checkout SHA is the untouched original commit.

Exact snapshot request (also retained in `test-ci-evidence/request.json` with Linux/x64 and the actual checkout SHA):

```json
{"package":"app","runner":"playwright","args":["e2e/performance/timeline/session-research-benchmark.spec.ts"],"config":"e2e/performance/playwright.config.ts","benchmarkRenderer":"legacy"}
```

The original CLI needed only installed Bun 1.3.14 and its built-ins; no local workspace dependency install was needed. Production build and browser execution occurred on GitHub Actions. The workflow retained its candidate producer logic, with the test job's limit tightened from 45 to **40 minutes**.

## Exact harness overlay

Source was read from the frozen Git blobs and applied with `apply_patch`. Five overlaid files are byte-identical to both frozen controls and the executed candidate. The workflow differs from the candidate only in `timeout-minutes: 40` instead of `45`.

| Overlaid path | Git blob SHA-1 | Content SHA-256 |
| --- | --- | --- |
| `.github/workflows/test-ci.yml` | `73808380bbaefc4f41e4427a4ba01fc55f1353b1` | `14c7f044a3444ad4e5bceea7f204b406d840894ed010f61b02fc2dc4a159ec38` |
| `packages/app/e2e/performance/timeline/session-research-benchmark.spec.ts` | `3cc606fa4ae4c288f7cf0bfb0d741c6aae005971` | `4be31731848b439f02857529d5a7860e3addcc257d0c04cbdc66910c64726f68` |
| `packages/app/e2e/performance/timeline/session-timeline-benchmark.fixture.ts` | `847f6b4d95ebae2d586b1ccd5fd24aff4738ec9a` | `9f343bf2aedae79df9646e151c51a3c6b99fcd80fc9513d7ec9a78edd0386f6c` |
| `packages/app/e2e/regression/session-research-result.fixture.ts` | `4305bf88bd1c5b578db0545521d76da98e3f6192` | `ee2ebbd9acb95274db3f2a82ff92a02116d7679b77cf1e7d341ad09dfdba57e1` |
| `script/test-ci-request.ts` | `cf5f2947fd16e82952e8d156ce3dd30ff52a5733` | `6323f38decba1fe8bb3951661f99ef476ff3a88a47536811775d360cd3b5b4d4` |
| `script/test-ci.ts` | `b5a0fbea8197f6e09583428a0e4177c72584446d` | `975b7560ba2294d877a42dead9240907bd609d15ec6025db3d2556c1aaa252d7` |

Aggregate overlay SHA-256: **`07e51d7ef6cf0abd715154f911a0061f3fbb4cb0e79a12a82223dcd50489926d`**. Definition: SHA-256 of UTF-8 `JSON.stringify` of the path-sorted array of `{path,blob,sha256}` objects, using the exact strings and property order above. This excludes the generated request and this post-run document.

The shared benchmark fixture overlay adds only the candidate's backend-authority bridge: default build authority `127.0.0.1:4096` falls back through the existing mock authority at the performance port. Payload generation, history and streaming transport remain the same.

The harness-only commit is local evidence infrastructure. Transfer only this document to candidate integration; do not merge or cherry-pick the original-baseline harness commit into candidate product history.

## Workload and environment comparability

Every one of the six original/candidate records reports:

```text
workload = research-ui-v1
workloadDigest = a510e1b600d7ce42c780fccbf951d8fe70471a1ae24b9e20889a65a30a052a7b
historyTurns = 320
deltaCount = 160
eventBatch = 1
cpuThrottle = 30
profileCPU = false
profileVisual = false
minimal = false
researchCpuThrottle = 1
project = chromium
platform = linux
retry = 0
```

The digest covers `JSON.stringify({publication,pages})` with the same task envelope, qualified-answer payload and three retained Markdown pages. Common-stream generation is separately bound by identical benchmark/fixture bytes and matching workload parameters. New-layout selection is enabled in both. The common stream reaches progress index 160, the final Markdown completion marker and settled geometry before task publication and CPU reset.

| Runtime property | Original and candidate evidence |
| --- | --- |
| Hosted runner / OS | `ubuntu-latest`, Linux x64, Ubuntu 24.04.5 |
| Runner image | `ubuntu-24.04`, version `20261004.327.1` |
| Bun | `1.3.14+0d9b296af`, Linux x64 baseline binary |
| Playwright | `1.59.1` |
| Chromium / headless shell | `147.0.7727.15`, Playwright revision `1217` |
| Request validator / Playwright Node | `24.15.0` |
| Browser project / viewport | `chromium`, unchanged `devices["Desktop Chrome"]` configuration |
| Workers / repetitions / retries | 1 / 3 / 0 |
| Production command | `bun run build && bun run serve -- --host 0.0.0.0 --port 3000 --strictPort` |
| Existing-server reuse | false |
| Build backend authority / mock authority | `127.0.0.1:4096` / `127.0.0.1:3000`, identical bridge |
| Detailed Chrome trace / selector trace | disabled / false in all `BENCHMARK_PAGE` records |

Both job logs positively show `vite build`, `vite preview`, `Running 3 tests using 1 worker` and `3 passed`. Original Playwright invocation took 12.3m; candidate took 17.1m. These include setup/build and different post-stream functionality, so they are not common-stream performance ratios.

Original root/app manifests and `bun.lock` remain unchanged. Original dependencies were restored from the exact `Linux-modules-v1-bfbc84dee2aebd7fa087e484da240804807cd1700c49e1b6fda6a20d2d9766a4` cache; install was skipped. Candidate used the existing setup action's `bun install`, which logged `Saved lockfile`. Checked-in lock differences add only workspace dependency edges (`core: marked`; `session-ui: @noble/hashes, @orchestra/schema, effect`), with unchanged resolved package entries and shared version pins. The candidate's post-install lockfile/installed tree was not part of its artifact, so exact installed-graph equivalence cannot be asserted retrospectively. Separate runner hardware/CPU identity also was not captured.

Shared `benchmark.ts`, performance/base Playwright configs, CPU profile, timeline-stability fixture, mock server, SSE transport, upload helper, setup-Bun action and Schema `session-event.ts`/`session-message.ts` have identical original/candidate Git blobs. The imported Schema contracts already exist on the original; no Schema production source was overlaid.

Two existing helper source differences were inspected and explicitly reconciled rather than transplanted:

- `session-timeline-stream-probe.ts`: candidate adds TypeScript annotations and changes `scrollTo.apply(this,args)` to `Reflect.apply(scrollTo,this,args)` only inside `if (profileVisual)`. Every measured record has `profileVisual: false`; that instrumentation branch is inactive.
- `chrome-trace.ts`: candidate writes decoded trace chunks as `Buffer` in `writeProtocolStream`. `startChromeTrace` returns before starting tracing when the trace directory is unset; every page record lacks a trace and has `selectorTrace: false`. The changed writer is inactive.

Thus the executed common workload and active measurements are comparable. Optional profiled/trace workloads are not qualified by this pair. Observed timing differences are reported without attributing them solely to the research feature.

## Original raw metrics

Values below preserve record values (decimal display rounded only where stated); raw JSON paths and hashes follow.

| `commonStream` metric | Rep 0 | Rep 1 | Rep 2 |
| --- | ---: | ---: | ---: |
| `completionObservedMs` | 221750 | 230215.19999999995 | 226821 |
| `deltasPerSecond` | 0.7215332581736189 | 0.695001893880161 | 0.7054020571287491 |
| `rafGapSamples` | 742 | 742 | 728 |
| `rafCallbackRate` | 3.2657185813225547 | 3.16861787194428 | 3.1453289566484153 |
| `observedProgressWindowRafCallbackRate` | 3.2629134201682346 | 3.1643538656816466 | 3.1208314366016 |
| `observedProgressWindowRafGapP95Ms` | 816.5999999999985 | 850 | 833.2999999999884 |
| `observedProgressWindowRafGaps` | 704 | 710 | 689 |
| `maxObservedProgressIndex` | 160 | 160 | 160 |
| `observedProgressTransitions` | 51 | 51 | 51 |
| `rafGapP50Ms` | 199.90000000000146 | 200 | 200 |
| `rafGapP95Ms` | 816.5999999999985 | 850 | 833.2000000000116 |
| `rafGapP99Ms` | 1233.300000000003 | 1083.2000000000044 | 1133.2999999999884 |
| `maxRafGapMs` | 2366.600000000006 | 2683.2999999999884 | 2266.600000000006 |
| `rafGapsOver33Ms` | 686 | 687 | 679 |
| `rafGapsOver50Ms` | 621 | 638 | 631 |
| `missedFrameBudgetEquivalents` | 12893 | 13310 | 13161 |
| `longestRafGapOver33MsStreak` | 54 | 70 | 74 |
| `longTaskCount` | 700 | 713 | 701 |
| `longTaskTimeMs` | 157056 | 164513 | 161344 |
| `domTextCharacters` | 3515 | 3515 | 3515 |
| `taskObservedMs` (outside common stream) | 376.0364150000096 | 377.59466599998996 | 132.18755400000373 |
| Playwright test duration (ms) | 231973 | 238387 | 235670 |

All original and candidate records have `capabilities: {visual:false,geometry:true}`, `visual:null`, `rowReplaced:false`, `markdownReplaced:false`. Geometry matches: `maxDistancePx=0`, `finalDistancePx=0`, `distanceTransitionsPx=[0]`, `bottomDriftTransitions=0`, `blankSamples=0`; final geometry is `{scrollTop:73024,scrollHeight:73543,clientHeight:519,distance:0,virtualHeight:73451,headerHeight:92}`.

| Candidate-only metric | Rep 0 | Rep 1 | Rep 2 |
| --- | ---: | ---: | ---: |
| `resultObservedMs` | 454.30219300003955 | 445.84456900000805 | 551.9594369999832 |
| `documentObservedMs` | 589.2288549999939 | 628.2248859999818 | 617.5898269999889 |
| Pages / retained bytes | 3 / 24601 | 3 / 24601 | 3 / 24601 |

These are Playwright-observed DOM readiness times after common-stream CPU reset to 1, not compositor presentation, INP or baseline speedups.

## Product preservation and comparison file list

Fetched actual snapshot objects and checked the whole-tree diff against the original, not only selected directories. Its exact changed-path set is generated `.ci-run.json` plus the six listed harness files. The positive control compared original/candidate `message-part.tsx` blobs and detected the candidate renderer change; original/snapshot production subtree identities remained equal:

| Production subtree | Original and baseline snapshot Git tree |
| --- | --- |
| `packages/app/src` | `bba1843daeff14d6086f18023561641ee59df65c` |
| `packages/session-ui/src` | `c7af8b90a1ac3e575afcc93bac2cabf60d0b0bfa` |
| `packages/ui/src` | `caa84725ca0a49ebaec6cb0a974da4f2ecfe2dc9` |

The original-versus-executed-candidate comparison was checked with `git diff --name-status 73651a0e cd6191c -- <source roots and manifests>`. The exact changed files in those source roots are below (includes colocated tests); `packages/core/package.json` and `packages/session-ui/package.json` also differ as described above. They describe candidate changes, not baseline overlays:

```text
bun.lock
packages/app/src/context/server-sdk.tsx
packages/app/src/context/server-session-v2-reducer.ts
packages/app/src/context/server-session.ts
packages/app/src/pages/directory-layout.tsx
packages/app/src/pages/session/timeline/message-timeline.tsx
packages/app/src/utils/session-message.test.ts
packages/app/src/utils/session-message.ts
packages/client/src/contract.ts
packages/client/src/generated-effect/client.ts
packages/client/src/generated/client.ts
packages/client/src/generated/types.ts
packages/core/src/research/allowance.ts
packages/core/src/research/artifacts.ts
packages/core/src/research/binding.ts
packages/core/src/research/ledger.ts
packages/core/src/research/records.ts
modules/maestro/coordination/src/seats/prompt/jimmy.txt
packages/orchestra/src/continuity/service.ts
packages/core/src/lsp/lsp.ts
packages/orchestra/src/maestro/atlas-discovery.ts
packages/orchestra/src/maestro/atlas-header.ts
packages/orchestra/src/maestro/atlas-memory.ts
packages/orchestra/src/maestro/atlas-resume-restore.ts
packages/orchestra/src/maestro/atlas-resume.ts
packages/orchestra/src/maestro/backend-result.ts
packages/orchestra/src/maestro/backend-work.ts
modules/maestro/coordination/src/v2/governance/discovery-result.ts
modules/maestro/coordination/src/roster.ts
modules/maestro/coordination/src/seats/jimmy.ts
modules/maestro/coordination/src/seats/seat.ts
packages/orchestra/src/maestro/validation-record.ts
packages/core/src/research/allowance.ts
packages/core/src/research/binding.ts
packages/orchestra/src/research/history.ts
modules/maestro/coordination/src/v2/governance/source-capture.ts
packages/orchestra/src/server/routes/instance/httpapi/server.ts
packages/core/src/session/compaction.ts
packages/core/src/session/runner/llm.ts
packages/orchestra/src/session/native-tools.ts
packages/core/src/session/prompt.ts
packages/core/src/session.ts
packages/orchestra/src/session/tools.ts
packages/orchestra/src/tool/atlas-context.ts
modules/maestro/coordination/src/v2/tools/atlas-memory.ts
packages/orchestra/src/tool/lsp.ts
packages/core/src/tool/read.ts
packages/core/src/tool/registry.ts
packages/orchestra/src/tool/research-capture.ts
packages/orchestra/src/tool/research-record.ts
packages/orchestra/src/tool/research-view.ts
packages/core/src/tool/task.ts
packages/core/src/tool/tool.ts
packages/core/src/tool/webfetch.ts
packages/protocol/src/api.ts
packages/protocol/src/groups/research-artifact.ts
packages/schema/src/durable-event-manifest.ts
packages/schema/src/index.ts
packages/schema/src/research-event.ts
packages/schema/src/research.ts
packages/server/src/handlers.ts
packages/server/src/handlers/research-artifact.ts
packages/server/src/routes.ts
packages/session-ui/src/components/message-part.tsx
packages/session-ui/src/components/research-document.test.ts
packages/session-ui/src/components/research-document.ts
packages/session-ui/src/components/research-result.tsx
packages/session-ui/src/context/data.tsx
packages/ui/src/i18n/en.ts
```

## Raw evidence and verification

| Evidence | Original | Candidate |
| --- | --- | --- |
| Artifact | [11651711047](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38005242923/artifacts/11651711047) | [11643791709](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37985414156/artifacts/11643791709) |
| Artifact name | `playwright-ubuntu-latest-1` | `playwright-ubuntu-latest-1` |
| Artifact archive SHA-256 reported by GitHub | `8939202ba417ee5749fd898b29963d89b0fc6682c502163c0b0bc47a7467ac2f` | `ab4f069ae2b72d351776d22fdafa924e179708252a9ad38e73782c84e62c226b` |
| Raw `playwright-runtime.json` SHA-256, measured after download | `2c6326c9ea2e5a577c5fca681ce03accf676ab6808a57c9224e8c68a94f4d954` | `ed8bbcc230ed6263a7bae0adc4ab7ff6ac2d3062b349598aa47b01a8e02e8b17` |
| Artifact expiry | 2026-10-16 23:50:05 UTC | 2026-10-16 20:31:05 UTC |

Raw metrics inside both artifacts: **`test-ci-evidence/playwright-runtime.json`**, each repetition's `suites[].specs[].tests[].results[].stdout` contains its complete `BENCHMARK` and `BENCHMARK_PAGE` JSON records. The artifacts also contain `request.json`, `benchmark-runtime.json`, `playwright-selection.json` in that directory and `packages/app/e2e/playwright-report/index.html`.

Downloaded raw paths below are relative to the actual evaluator temporary root. Its historical directory basename is the concatenation of `open` and `code`; no directory was renamed.

```text
jimmy-baseline-benchmark-evidence/test-ci-evidence/playwright-runtime.json
jimmy-candidate-benchmark-evidence/test-ci-evidence/playwright-runtime.json
```

The evidence audit parsed the actual downloaded reports and required: exact checkout/request/renderer identity, exact workload digest and parameters, exactly repetitions 0/1/2, one attempt each, passed status without errors/skips/flakes, one complete metric/page record per attempt, finite populated common-stream fields, final progress index 160 and original `research:null`. Its positive controls accepted the real complete reports; removing a metric record, replacing `commonStream` with null, or removing a repetition each produced a rejecting assertion. This calibrates evidence completeness, not product mutation coverage.

This document is the public post-run evidence addition. Its scope is synthetic production Chromium benchmarking of the original and the existing candidate run.
