# Frozen principal five-workflow confirmation

## Final closure checkpoint — GREEN main CI

Main [38030684084](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38030684084), attempt 1, completed with all 12 jobs successful. This checkpoint supersedes the mechanical RED verdicts below while retaining their exact historical identities and failures. Model qualification remains blocked: 35/42 confirmation slots passed.

| Identity | Exact value |
| --- | --- |
| Final tested source | `fa00d95cb660de09ebbeffc0e1fafc9d02bb7e5c` |
| Product tree | `a3ecd03c8e6078edda9cf81fc9844daf9b2663e5` |
| GitHub snapshot | `86704ea0f4844f9b8099e54852c20befcd71f61f` |
| Snapshot tree including request metadata | `41160cf58d7c4e773fb35f2bb952cfa43faa787d` |

Recovery verification compared every recursive path, mode, object type and SHA against the final Git commit. Excluding only root `.ci-run.json`, the manifests matched. Removing that entry from the root tree and reconstructing with Git produced the exact product-tree hash. An altered-SHA control was rejected. All job metadata and nonempty job logs were retrieved again from GitHub; no new test run was scheduled during recovery.

| Executed lane | Result |
| --- | --- |
| Atlas scope and product | Successful; product 4,168 pass, 17 skip, three TODO |
| Linux Orchestra 1/2 | 1,693 pass, 14 skip, one TODO, zero fail |
| Linux Orchestra 2/2 | 3,007 pass, eight skip, zero fail |
| Windows Orchestra 1/3 | 1,694 pass, 20 skip, one TODO, zero fail |
| Windows Orchestra 2/3 | 1,188 pass, 15 skip, zero fail |
| Windows Orchestra 3/3 | 1,827 pass, 34 skip, zero fail |
| Linux other packages, godfile, generated Client, HttpApi and Relay | Successful; Turbo 20/20 tasks, zero cached tests; four later dependency builds replayed cache |
| Windows other packages | Successful; Windows-only exclusions retain their existing scope |
| Linux E2E 1/3, 2/3, 3/3 | 124 + 155 + 190 passes; one existing fixme skip |

The previously missing full HTTP stages executed: coverage/auth/effect each reports `pass=271 fail=0 skip=0 missing=0 extra=0` across 233 effect routes. Thirteen research scenarios passed in each mode, covering actual artifact pagination, receipts, task isolation, unavailable bytes and validation. Generated-client checking passed. Python Relay reports 1,477 passes and one skip.

Dedicated production Chromium [38027999108](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38027999108) passed all 28 cases. Dedicated macOS arm64 Electron [38028275423](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38028275423) passed native Task/artifact proof, scoped typecheck and detecting cleanup completion: three tests, zero failures. Linux bounded-log Electron evidence remains [38025429218](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38025429218), whose Linux job passed three cases while its unsupported Windows job failed. The main suite skips specialized Electron cases; Windows E2E remains disabled by its existing default.

SDK generation now precedes plugin compilation. Dedicated final-source [38030580678](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38030580678) passed two controls: actual SDK-generation/plugin-compilation and rejection of the removed dependency edge. The regenerating proof is scoped to direct CI so it cannot race the concurrent main unit suite.

The four ancillary workflow successes below retain their exact earlier source identities; they were not rerun solely for build-order and test repairs. Temporary execution/evaluator directories are now unavailable. This committed report, prior public study reports and GitHub run logs remain recoverable; private ledger backup availability is unverified.

## Historical RED checkpoints

## Verdict

**RED.** All five workflows were dispatched exactly once on the verified frozen principal snapshot. All 17 jobs completed: 14 succeeded and 3 failed. No job was cancelled or skipped. The main test workflow finished in 18m40s. The measured epic peak was 16 simultaneous jobs.

This confirmation preserves the original **RED** result in `EPIC-EVIDENCE.md`, including its original candidate identity and five run IDs. It records a new source and new execution; it does not replace the earlier failure history. The evidence document is outside both tested trees.

## Source identity

| Identity | Exact value |
| --- | --- |
| Frozen principal HEAD | `0e5f0b98dd5a869d9a3c11c6dcf2f943cdf8a410` |
| Frozen principal product tree | `6bf0f3639241ac38013daeb147f7744f515f2d68` |
| Reused GitHub snapshot / every workflow head SHA | `529008ef9720aa01376e460591a6802a2d4bdd19` |
| GitHub snapshot tree, including request metadata | `a7b7ad5918ff826239476d09ab33829e7971ad71` |
| Snapshot tree after removing only `.ci-run.json` | `6bf0f3639241ac38013daeb147f7744f515f2d68` |
| Snapshot parent | `993f9cb2f2bbb8eb384b7375a05f7da9bb9812dd` |
| Authorized ephemeral ref | `refs/heads/jimmy-epic-confirm` |

The complete recursive GitHub manifest was compared with `git ls-tree -r -t -z` of the frozen local commit. All 13,493 product entries, including 11,530 tracked leaves, matched by exact path, mode, object type, and SHA. Both manifests were independently reconstructed as Git tree objects. Only the root `.ci-run.json` entry was excluded. An altered `.dockerignore` blob SHA was detected by the delta comparator and rejected by tree reconstruction as a positive control.

The uploaded desktop snapshot was already present in runs [38021838321](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38021838321) and [38021838610](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38021838610). Its parent and complete product identity were verified before reuse. This operation uploaded **zero blobs**, created no new snapshot commit, and issued no scoped-test dispatch. Those desktop runs supply snapshot provenance only, not substitute epic coverage.

The complete source delta from the remote parent contained exactly:

| Path | Mode/type | Blob SHA |
| --- | --- | --- |
| `.github/workflows/test-ci.yml` | `100644` / blob | `72d6afebfc5b5e4195364fe71ee18eace0743601` |
| `packages/core/test/test-ci-desktop.test.ts` | `100644` / blob | `a71846b35100effcf33204741a59a2dd58e1e224` |
| `packages/desktop/src/main/jimmy-desktop-proof.test.ts` | `100644` / blob | `32e384a9715ffe74b51d95615907b6125a4102dd` |

The request metadata selects package `desktop`, runner `bun`, and arguments `./src/main/jimmy-desktop-proof.test.ts --timeout 120000`. It was retained unchanged during snapshot reuse. The five epic workflow definitions, previous-pass action, and frozen workflow reach were read before dispatch. The five epic definitions are unchanged from the snapshot parent.

## Capacity, dispatch, and outcomes

Account occupancy was measured through actual noncompleted jobs across all 23 authenticated owned repositories, including private repositories. The known desktop run was used as a positive control for job enumeration. At 03:51:25 UTC, six placed jobs left insufficient room for the epic peak, so dispatch was held. At 03:52:14 UTC, occupancy had dropped to two placed jobs and no unplaced jobs: `2 + 16 = 18`, within the cap of 20. No other work was cancelled.

The five dispatches were issued between 03:52:16 and 03:52:35 UTC on October 10, 2026. Run IDs were persisted after each dispatch, before outcome waiting. The operation deadline was 04:27:16 UTC, 35 minutes after dispatch began. The last workflow completed at 04:10:57 UTC. A later account sample at 03:53:22 UTC saw 19 placed jobs and one queued cleanup job, reflecting additional concurrent work. Epic-only job start/end timestamps yield peak 16; the interval calculation was calibrated with overlapping and touching interval controls.

| Workflow | Run, attempt 1 | Jobs | Result | Creation → final update, UTC |
| --- | --- | --- | --- | --- |
| test | [38022075786](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022075786) | 9 success, 3 failure | failure | 03:52:17 → 04:10:57 |
| native | [38022081085](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022081085) | 2 success | success | 03:52:23 → 03:54:51 |
| typecheck | [38022083326](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022083326) | 1 success | success | 03:52:25 → 03:55:18 |
| storybook | [38022088731](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022088731) | 1 success | success | 03:52:31 → 03:53:58 |
| nix-eval | [38022093645](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022093645) | 1 success | success | 03:52:36 → 03:53:25 |

`windows_e2e` was omitted, preserving its existing `false` default. Manual dispatch selected the full Atlas suite. Every run was checked for the exact snapshot SHA, authorized ref, workflow-dispatch event, and attempt 1.

## Actual execution

Orchestra counts below were checked against all five uploaded JUnit artifacts. Bun encodes TODO cases as JUnit skips; log skips and TODO remain separate here. All three Playwright reports were parsed, not inferred from job conclusions.

| Main test job | Job ID | Result | Executed reach |
| --- | --- | --- | --- |
| Atlas scope | `114125027439` | success | Manual-dispatch full-suite selection |
| Atlas | `114125092286` | success | Typecheck, 13 configured guards, materializer tests, snapshot gate, full product suite: 4,168 pass, 17 skip, 3 TODO; 530 files passed, 2 skipped |
| Linux orchestra 1/2 | `114125027551` | success | 1,693 pass, 14 skip, 1 TODO, 0 fail; 182 files |
| Linux orchestra 2/2 | `114125027561` | success | 3,006 pass, 8 skip, 0 fail; 230 files |
| Windows orchestra 1/3 | `114125027596` | success | 1,694 pass, 20 skip, 1 TODO, 0 fail; 181 files |
| Windows orchestra 2/3 | `114125027630` | failure | 1,186 pass, 15 skip, 1 fail; 115 files |
| Windows orchestra 3/3 | `114125027678` | success | 1,827 pass, 34 skip, 0 fail; 116 files |
| Linux other packages / godfile / HttpApi / Relay | `114125027501` | failure | Atlas generated-boundary check, 19 godfile self-tests, and godfile gate passed. Turbo: 12 successful of 14 tasks, 0 cached. Core: 1,495 pass, 7 skip, 1 fail. Python Relay: 1,477 pass, 1 skip; documentation index check passed |
| Windows other packages | `114125027535` | failure | Turbo: 14 successful of 17 tasks, 0 cached. App unit tests: 1,298 pass, 1 skip, 1 fail |
| Linux e2e 1/3 | `114125027629` | success | 124 pass; report: 0 unexpected, 0 flaky, 0 skipped |
| Linux e2e 2/3 | `114125027587` | success | 155 pass; report: 0 unexpected, 0 flaky, 0 skipped |
| Linux e2e 3/3 | `114125027560` | success | 190 pass, 1 skip; report: 0 unexpected, 0 flaky |

Native helper executed every configured suite and its built-in mutation/self-check controls. Expected mutant `FAIL`/`FAILED` output was followed by successful control completion; it was not a hidden job failure. Native workspace executed the real Docker runtime fixture: 2 pass, 0 fail. Typecheck executed all 24 tasks with 0 cached. Storybook built. Nix evaluated required orchestra packages and devShells for four systems; it did not build or release them. Four optional desktop output evaluations warned because their attributes remain absent.

## All failed-job logs and exact attribution

All three failed-job logs were downloaded and reviewed. Each contains one failing testcase; the Windows orchestra log repeats its single failure in the final summary. Synthetic error paths in otherwise passing tests were not counted as additional failures.

1. **Linux Core rename guard** — [job 114125027501](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022075786/job/114125027501), `packages/core/test/rename-guard.test.ts:35`. The first chronological testcase failure was logged at 03:56:56 UTC. Expected an empty residue list; received these twelve unprotected old-name occurrences:

   | Source | Lines |
   | --- | --- |
   | `packages/jimmy-specialist/BASELINE-BENCHMARK.md` | 24, 259, 260 |
   | `packages/jimmy-specialist/FIXTURE-SETUP.md` | 9, 28, 58 |
   | `packages/jimmy-specialist/IMPLEMENTATION.md` | 102 |
   | `packages/jimmy-specialist/STUDY-LANE.md` | 5, 26 |
   | `packages/orchestra/script/research-credential-probe.ts` | 17, 25 |
   | `packages/orchestra/script/research-pilot.ts` | 135 |

   These are feature documentation/compatibility-script residues, including literal legacy-name paths. They are present in the frozen remote parent and are not caused by the three desktop delta files. The earlier epic's godfile failure prevented this Linux unit stage from executing, so its earlier report did not establish this guard as green. Current godfile success does not close this separate rename failure.

2. **Windows app locale parity** — [job 114125027535](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022075786/job/114125027535), `packages/app/src/i18n/parity.test.ts:112`. Arabic UI dictionary is missing eleven keys defined in `packages/ui/src/i18n/en.ts:164–175`: `ui.research.terminal.{ended,blocked,failed,interrupted,running}`, `ui.research.sufficiency.{answered,partial,blocked}`, `ui.research.unverified`, `ui.research.documentUnavailable`, and `ui.research.documentLoading`. The target dictionary's tool/common boundary is `packages/ui/src/i18n/ar.ts:164–170`. The reported extra Arabic plural variants were expected; the missing research keys caused the mismatch. These dictionary and test files are unchanged from both the frozen snapshot parent and the original epic candidate. This is a feature integration omission, not a defect introduced by the three desktop delta files. Windows app browser tests did not start because `test:unit && test:browser` stopped at unit failure.

3. **Windows orchestra permission/deadline case** — [job 114125027630](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38022075786/job/114125027630), `packages/orchestra/src/plugin/app-dock-target.test.ts:234`. Test `time waiting for a permission answer does not count against the tool-call deadline` expected `{ dispatch: "acknowledged" }`; actual result contained `code: "target-search-incomplete"`, `outcome: "not-dispatched"`, `pagesScanned: 1`, and `reasons: ["tool-deadline"]`. Its fixture sleeps 80ms for permission at line 228 and configures a 40ms search deadline at line 232. Windows JUnit records failure with one assertion; the same testcase passed in Linux orchestra 2/2 with two assertions. The fixture is unchanged from the snapshot parent and original epic candidate. This is an observed Windows-only timing-sensitive failure; a single execution does not establish a flaky-test diagnosis or prove the internal deadline-accounting cause.

## Cache, skips, and misses

- All five orchestra shards and all three Linux e2e shards missed the previous-pass cache and executed their test steps. No cached pass replaced these executions. Typecheck and both other-package Turbo jobs report 0 cached tasks, despite restored cache archives.
- Bun dependency and Playwright browser caches were restored where available. All three e2e browser-install steps skipped because Chromium was cached; all three e2e execution steps ran.
- Linux `Check generated client`, `Build HttpApi exerciser dependencies`, and `Run HttpApi exerciser gates` skipped after Core unit failure. Linux app/client/desktop complete test results were not reached. Atlas-boundary unit execution began but had no completion summary when Turbo aborted. Windows client and Core unit tasks began but likewise produced no completion summary after app failure. The desktop proof task was not reached by this epic's Turbo execution; separate desktop runs are not substituted here.
- Windows excludes the POSIX-only HttpApi codegen package and Linux-only guard/Relay Python steps by existing configuration. Windows e2e was not scheduled.
- Completed other-package suites, beyond the failures above: Linux effect-drizzle-sqlite 7, codemode 263, httpapi-codegen 108, maestro-arsenal 141 with 1 skip, UI 27, HTTP recorder 33, Relay TypeScript 802, LLM 353 with 30 skips. Windows effect-drizzle-sqlite 7, codemode 263, maestro-arsenal 141 with 1 skip, UI 27, HTTP recorder 33, Relay TypeScript 680 with 122 skips, LLM 353 with 30 skips, Atlas boundary 4, session-ui 110, TUI 198 with 1 skip. Successful build tasks include UI, plugin, HTTP recorder, and legacy SDK. Started tasks without a completion summary are not credited as completed suites.
- Playwright's one skipped test is `packages/app/e2e/orchestra/chapter-workspaces.spec.ts:371`, `Escape closes the dialog while a navigation tooltip still shows behind it`, annotated `fixme`. Its report records duration 0.
- Orchestra JUnit omissions include the credential-dependent OpenAI tool-loop case, all four StructuredOutput integration cases, disabled V2 projector cases, direct-footer UI cases, and platform-specific shell/PTY/worktree/scanner cases. TODO: fetching remote instructions through HttpClient. Complete names remain in all five uploaded JUnit artifacts; skipped model tests are not provider evidence.
- Atlas's 17 skipped and 3 TODO product cases remain omissions, including semantic/negation benchmarks, model-config live cases, scanner availability cases, and merge-fold/containment cases. Relay Python's one skipped testcase is unnamed by its existing `pytest -q` summary; `tests/test_benchmark_runtime.py` is explicitly excluded by the workflow.

## Retention and scope

After all five workflows and all 17 jobs completed, the ephemeral ref's target was rechecked as `529008ef9720aa01376e460591a6802a2d4bdd19` and only `jimmy-epic-confirm` was deleted through the GitHub API. The matching-ref query confirmed removal and detected the known `dev` ref as a positive control. Runs, artifacts, other refs, and worktrees were retained.

All job logs, run/job metadata, complete local/remote manifests, capacity samples, altered-SHA proof, downloaded artifact archives, parsed JUnit/Playwright records, dispatch IDs, and cleanup verification remain in the external `jimmy-epic-confirm-operation` directory beside this worktree. The test run retains five JUnit artifacts for 14 days and three Playwright artifacts for 7 days. Original `EPIC-EVIDENCE.md` SHA-256 remains `ad4514b0f9a78434cbabe9d3849cc8621567e7b848d69b958a1de2a423d5775c`.

Only this confirmation document was added to the evidence worktree. Principal HEAD/tree and source files remained frozen. No feature branch push, PR, workflow rerun, private evaluation, live-app interaction, or local product test execution was used for this confirmation. Remaining integration failures and skipped/missed stages keep the epic verdict RED.

---

## Final-source main-workflow checkpoint — October 10, 2026

**RED: 11 of 12 jobs succeeded; one research browser assertion failed.** This section is an append-only checkpoint. All preceding counts, failures, source identities, and original RED evidence remain unchanged.

### Final source and one-shot dispatch

| Identity | Exact value |
| --- | --- |
| Frozen clean principal HEAD | `d94ccae525562786c39969faa11a922f571ed9be` |
| Frozen product tree | `3e6bc8bde3e0ee3c832d5bf1328bf1ec4f964b57` |
| Actual main workflow snapshot SHA | `e36304523c4d2a798b81952c29f88c690dd9ba7a` |
| Snapshot tree with retained `.ci-run.json` | `6cb4dfb4e05d4090759f9f77a57d62a2cd4af141` |
| Remote snapshot parent | `ff075118883c5027d7bdce128e576f50e93c0326` |
| Parent product tree | `c7a2bde7124ca6631fb1566aa540864e3a799c47` |
| Owned ephemeral ref | `refs/heads/jimmy-epic-final` |
| Main workflow, attempt 1 | [38026385329](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38026385329) |

The final snapshot was not present in the recent helper-run candidates at preparation time. Exactly two replacement blobs were uploaded through GitHub Git-object APIs: `packages/desktop/src/main/jimmy-desktop-cleanup.fixture.ts` (`532d3ff717834b1fd7b28c0582f097adb3a4aa58`) and `packages/desktop/src/main/jimmy-desktop-proof.test.ts` (`d5fcbe7a792a53bf1a1958dbeeb1fd3bf6c181a2`). No other source blob or new request blob was uploaded. The parent's existing core test request metadata was retained; the main workflow does not use that scoped request to select its epic jobs.

The full recursive GitHub manifest matched the frozen local Git tree by every path, mode, object type, and SHA: 13,494 entries, including 11,531 tracked leaves. Excluding only the root `.ci-run.json` reproduced the exact product-tree hash. Altered SHA, mode, and path controls were detected by the comparator and rejected by independent Git-tree reconstruction. Empty and truncated manifests were also rejected. Complete manifests and controls were persisted before dispatch.

Actual account jobs were enumerated across 23 authenticated owned repositories, with a known nonempty run as a positive control. Ten active jobs initially blocked dispatch. At 05:06:33 UTC, seven placed jobs and no queued jobs allowed the conservative 12-job reservation: `7 + 12 = 19`, within the cap of 20. The main workflow has 12 total jobs but measured peak **11**, because Atlas follows Atlas scope. No unrelated work was cancelled.

Only `test.yml` was dispatched, once, at 05:06:35 UTC. Its run ID was persisted before monitoring. Creation → final update: **05:06:37 → 05:24:45 UTC**, 18m08s. The 30-minute operation deadline was 05:36:35 UTC. `windows_e2e` remained its default `false`. The earlier native `38022081085`, typecheck `38022083326`, Storybook `38022088731`, and Nix `38022093645` successes remain their original-source checkpoints; they were not rerun or represented as new executions on the final source.

### Actual main jobs and artifact counters

| Job | ID | Result | Actual reach |
| --- | --- | --- | --- |
| Atlas scope | `114138005247` | success | Manual dispatch selected the full Atlas suite |
| Atlas | `114138068031` | success | Guards and full product suite: 4,168 pass, 17 skip, 3 TODO; 530 files passed, 2 skipped |
| Linux orchestra 1/2 | `114138005213` | success | 1,693 pass, 14 skip, 1 TODO, 0 fail; 182 files |
| Linux orchestra 2/2 | `114138005325` | success | 3,007 pass, 8 skip, 0 fail; 230 files |
| Windows orchestra 1/3 | `114138005192` | success | 1,694 pass, 20 skip, 1 TODO, 0 fail; 181 files |
| Windows orchestra 2/3 | `114138005188` | success | 1,188 pass, 15 skip, 0 fail; 115 files |
| Windows orchestra 3/3 | `114138005303` | success | 1,827 pass, 34 skip, 0 fail; 116 files |
| Linux other packages / godfile / HttpApi / Relay | `114138005211` | success | 20/20 Turbo unit/build tasks completed, 0 cached; generated checks and full HttpApi CLI gate executed; Python Relay 1,477 pass, 1 skip |
| Windows other packages | `114138005111` | success | 19/19 Turbo unit/build tasks completed, 0 cached |
| Linux e2e 1/3 | `114138005271` | success | 124 pass, 0 skip |
| Linux e2e 2/3 | `114138005493` | success | 155 pass, 0 skip |
| Linux e2e 3/3 | `114138005371` | failure | 189 pass, 1 fail, 1 skip; 0 flaky |

All five orchestra shards and all three e2e shards missed previous-pass caches and actually ran. Neither other-package job replayed test tasks. The later HttpApi dependency-build step reused **4/4 cached build tasks** that had completed earlier in the same Linux job; that replay was not counted as new build execution or test coverage. Browser installation skipped because Chromium was cached, but browser tests executed.

All eight artifacts were downloaded and parsed. The five JUnit artifacts contain **9,502 shard testcase records: 9,409 passed, 93 skipped including two TODO, zero failures**. These are summed platform/shard records, not a unique-test count. Three Playwright reports contain **470 logical tests: 468 expected, 1 unexpected, 1 skipped, 0 flaky**. Configured retries of the failing browser case are attempts within that single workflow run, not new workflow dispatches.

| Artifact | ID |
| --- | --- |
| `junit-linux-orchestra-1-1` | `11659304920` |
| `junit-linux-orchestra-2-1` | `11661005146` |
| `junit-windows-orchestra-1-1` | `11661000533` |
| `junit-windows-orchestra-2-1` | `11661165482` |
| `junit-windows-orchestra-3-1` | `11660886747` |
| `playwright-linux-1-1` | `11660511708` |
| `playwright-linux-2-1` | `11660851493` |
| `playwright-linux-3-1` | `11661275452` |

### Previously blocked full HTTP gate now executed

Linux completed `Run unit tests`, `Check generated client`, and `Build HttpApi exerciser dependencies`, then executed `bun run test:httpapi` from 05:12:27 to 05:17:51 UTC. Its chained coverage, auth, and effect commands all completed with `--fail-on-missing --fail-on-skip`.

| CLI mode | Selected scenarios | Public routes | Pass | Fail | Skip | Missing | Extra |
| --- | --- | --- | --- | --- | --- | --- | --- |
| coverage | 271 | 233 | 271 | 0 | 0 | 0 | 0 |
| auth | 271 | 233 | 271 | 0 | 0 | 0 | 0 |
| effect | 271 | 233 | 271 | 0 | 0 | 0 | 0 |

All **13 research artifact scenarios passed in every mode**: source, document, foreign-task, authority, unadmitted, unavailable, revision-not-admitted, cursor-invalid, and the five invalid revision spellings. Coverage mode proves registration/completeness; it does not issue the effect scenarios' requests. Auth mode exercised protected-route rejection and valid-credential admission. Effect mode exercised real production routes with isolated fixture storage, including UTF-8 source continuation and exact reconstruction, immutable receipts/revisions, wrong-artifact cursor rejection, document content, foreign/authority/unadmitted rejection, unavailable admitted bytes, and query validation. Runtime log rows were counted and reconciled against each mode's header and summary. There were no HTTP auth/effect skips or misses.

The prior rename, app parity, client, and permission-deadline blockers now have completed suite execution in this main run. Core: Linux 1,496 pass/7 skip; Windows 1,478 pass/26 skip. App unit: Linux 1,324 pass/0 skip; Windows 1,299 pass/1 skip, plus 76 browser-unit passes on each platform. Client: 23 pass/0 skip on both. The permission/deadline testcase passed on Linux and Windows with two assertions in each JUnit record. Desktop Bun suites: Linux 527 pass/17 skip, Windows 400 pass/144 skip; its separate Node test passed once on each platform with zero skips. The earlier scoped proof and detecting-mutant run IDs remain separate evidence, not substitute execution here.

### Sole failure: translated Arabic labels versus English-fallback assertion

The complete failed [e2e shard-3 job log](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38026385329/job/114138005371) and all three failed-attempt error contexts were reviewed. Test `mixed Hebrew Arabic and code stay isolated in ar/rtl with English fallback` is declared at `packages/app/e2e/regression/session-research-result.spec.ts:302` and fails at **line 312** after waiting 10 seconds for exact English text `Research task ended`. It fails on the initial attempt and both existing configured retries. Its English/LTR and English/RTL profiles pass.

Each retained page snapshot shows the research result region and paragraphs containing **`انتهت مهمة البحث`** and **`إجابة جزئية`**. Those are the final Arabic translations at `packages/ui/src/i18n/ar.ts:167` and `:173`. The test still expects English at lines 312 and 313; its source is unchanged from the preceding checkpoint. The locale-parity correction added Arabic research keys, exposing this stale fallback expectation. This is a feature test/translation integration mismatch, not a missing research result or a demonstrated RTL-layout defect. Assertions after line 312 did not execute in the failing Arabic profile. No source fix or blind rerun was performed.

### All skip and miss accounting

- Orchestra: **91 log skips plus two TODO**, with all 93 named JUnit records retained in `checked-evidence.json` and the five artifacts. Omissions include credential/live-model cases, StructuredOutput integration, disabled V2 projector cases, direct-footer UI cases, and platform-specific shell, PTY, worktree, scanner, and memory-admission cases.
- Atlas: **17 skips and three TODO**; existing semantic/negation/model/scanner availability and individual product omissions remain as reported above.
- Other-package unit suites: **56 Linux skips** (maestro-arsenal 1, LLM 30, Core 7, TUI 1, desktop 17); **325 Windows skips** (maestro-arsenal 1, Relay TypeScript 122, LLM 30, TUI 1, app 1, desktop 144, Core 26). Remaining completed unit suites report zero skips. Reporter-visible names are persisted with the job logs and parsed evidence; count-only summaries do not establish names they did not print.
- The real Electron production Node-sidecar Jimmy proof, Linux App Dock integration, and real Docker/PTY access proofs remained environment-gated omissions in the main desktop unit suite. Separate desktop proof runs were not substituted for them. The desktop Node test reports 1 pass and 0 skips per platform.
- Python Relay: **one skip**, unnamed by the existing `pytest -q` summary; benchmark-runtime tests explicitly excluded by the workflow. The documentation index check passed.
- Playwright: **one skip**, `packages/app/e2e/orchestra/chapter-workspaces.spec.ts:371`, `Escape closes the dialog while a navigation tooltip still shows behind it`, marked `fixme`. No flaky tests were reported.
- Windows e2e was not scheduled. Windows intentionally omits POSIX HttpApi codegen and Linux-only generated-boundary, godfile, full HttpApi CLI, and Python Relay steps. Atlas's PR-only product-change detector skipped on manual dispatch while its full suite ran. All three browser-install steps skipped due to browser cache hits. The failed e2e job skipped pass-record/save and its post-Node step. No whole job was skipped or cancelled, and no Linux generated-client/HTTP gate remained blocked.

### Final checkpoint retention

Only `jimmy-epic-final` was deleted, after its target SHA and completion of all 12 jobs were reverified. The matching-ref removal query detected `dev` as its positive control. Runs, all eight artifacts, other refs, and worktrees were retained. JUnit retention is 14 days; Playwright retention is seven days, including failure screenshots, videos, trace, and all three error-context snapshots.

External `jimmy-epic-final-operation` retains run/job metadata, all twelve logs, manifest/control evidence, capacity samples, persisted dispatch ID, artifact archives, complete parsed skips and counters, HTTP mode reconciliation, failure contexts, and cleanup verification. Principal source remained frozen and clean. Only this document was appended and committed in the evidence worktree; no principal source edit, feature push, PR, extra workflow execution, private evaluation, or new model trial was performed. The full final main-workflow verdict remains **RED** until the recorded Arabic browser assertion mismatch is reconciled.

---

## Closing-source main checkpoint — October 10, 2026

**RED: 11 of 12 jobs succeeded.** The Arabic browser assertion is now measured passing. A newly observed Linux plugin/SDK build failure prevents full main-workflow closure. This append retains every preceding RED checkpoint, source identity, count, and run ID without rewriting history.

### Exact source and dispatch

| Identity | Exact value |
| --- | --- |
| Frozen clean principal HEAD | `7f00a8bb6a035ed05405d0188b449aeab2a9060f` |
| Product tree | `0d8c47cec34fcd05e3a6aeb6343d6980c7cbf0ba` |
| Reused snapshot / actual main head SHA | `155746d06a1138d6db44d32450bdaf79df72b930` |
| Snapshot tree with `.ci-run.json` | `2f36d7546e98e460847b326cc459ef41eebe4932` |
| Snapshot parent | `73651a0e69a2912d9244dbb73e985c5828c03058` |
| Owned ephemeral ref | `refs/heads/jimmy-epic-close` |
| Main run, attempt 1 | [38028420071](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38028420071) |

The delta from the preceding principal is one file, `packages/app/e2e/regression/session-research-result.spec.ts`, with exactly three replacement lines. The main workflow and Playwright configuration are unchanged. The existing successful scoped production run [38027999108](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38027999108) was verified as snapshot provenance. Its retained request selects that research e2e file with `e2e/playwright.production.config.ts`; the main workflow keeps its own existing suite/configuration rather than taking that scoped selection.

Zero blobs or snapshot commits were uploaded. The complete recursive GitHub manifest matched the frozen local tree by every path, mode, object type, and SHA: **13,494 entries / 11,531 tracked leaves**. Removing only the root `.ci-run.json` reconstructed the exact product-tree hash. Altered SHA, executable mode, and path controls were detected and rejected; empty and truncated manifests were rejected too. All manifest/control evidence was persisted before dispatch.

Actual account occupancy, across 23 authenticated owned repositories, was **seven placed jobs and zero unplaced jobs** at 05:42:30 UTC, not merely the anticipated single macOS job. Reserving the measured main-only peak of 11 gave `7 + 11 = 18`, within the account cap of 20. Enumeration detected the known scoped run as its positive control. No unrelated work was cancelled.

Only `test.yml` was dispatched once, at 05:42:31 UTC, and the ID was persisted before monitoring. Creation → completion: **05:42:33 → 05:57:11 UTC**, **14m38s**. All 12 jobs completed; measured peak remained **11**, calibrated with overlapping/touching interval controls. The operation deadline was 06:12:31 UTC. `windows_e2e=false` and normal Playwright two-retry policy were preserved. None of the other four workflows was rerun.

### All twelve outcomes

| Job | Job ID | Outcome and measured reach |
| --- | --- | --- |
| Atlas scope | `114144091462` | success; manual-dispatch full selection |
| Atlas | `114144156996` | success; guards and full product suite: 4,168 pass, 17 skip, 3 TODO |
| Linux orchestra 1/2 | `114144091533` | success; 1,693 pass, 14 skip, 1 TODO, 0 fail |
| Linux orchestra 2/2 | `114144091492` | success; 3,007 pass, 8 skip, 0 fail |
| Windows orchestra 1/3 | `114144091518` | success; 1,694 pass, 20 skip, 1 TODO, 0 fail |
| Windows orchestra 2/3 | `114144091476` | success; 1,188 pass, 15 skip, 0 fail |
| Windows orchestra 3/3 | `114144091448` | success; 1,827 pass, 34 skip, 0 fail |
| Linux other packages / godfile / HttpApi / Relay | `114144091437` | failure; generated Atlas boundary and 19 godfile self-tests plus godfile gate passed; plugin build failed; Turbo 2 successful / 10 tasks, 0 cached; Python Relay 1,477 pass, 1 skip and documentation index check passed |
| Windows other packages | `114144091334` | success; 19/19 Turbo tasks completed, 0 cached |
| Linux e2e 1/3 | `114144091472` | success; 124 pass |
| Linux e2e 2/3 | `114144091563` | success; 155 pass |
| Linux e2e 3/3 | `114144091475` | success; 190 pass, 1 skip, 0 flaky |

Every orchestra and e2e previous-pass lookup missed, so all eight test steps executed. No prior-pass cache substituted for these results. Windows unit/build tasks also executed with zero cached tasks. Linux Turbo failed before reporting any completed package testcase suite: only HTTP-recorder and UI builds completed successfully. Six package test tasks printed cache-miss headers without completed testcase summaries before Turbo aborted; those starts are not credited as completed test suites.

### Old Arabic blocker cleared in actual main execution

The shard-3 Playwright report records all three profiles at `session-research-result.spec.ts:302` as expected, passing outcomes: **en/ltr**, **en/rtl**, and **ar/rtl**, with localized labels. Their durations were 2,394ms, 2,316ms, and 2,306ms respectively. They completed without a retry or flaky outcome. This replaces only the current observation; the earlier failed English-fallback assertion remains recorded above.

Windows app unit tests completed with **1,299 pass / 1 skip**. Its separate browser-unit command **actually executed: 76 pass across 25 files**, and the app Turbo task completed. Windows client had 23 passes, Core 1,478 pass/26 skip, desktop Bun 400 pass/144 skip, and the desktop Node testcase 1 pass/0 skip. Linux app unit/browser-unit commands were not reached after the prerequisite build failure; the three standalone Linux Chromium e2e jobs did execute.

### Sole failed-job log: SDK generated types unavailable during plugin compile

The complete failed [Linux other-package log](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38028420071/job/114144091437) was reviewed. `@orchestra/plugin#build` ran `tsc` and exited **2**, producing **37 compiler diagnostics**, not a failing application testcase. Representative exact errors are `src/index.ts(13,15): error TS2305: Module '"@orchestra/sdk/v2"' has no exported member 'Provider'.` and `../sdk/js/src/v2/client.ts(1,15): error TS2307: Cannot find module './gen/types.gen.js' or its corresponding type declarations.`

| Diagnostic source | Lines |
| --- | --- |
| `packages/plugin/src/index.ts` | 13: Provider, Model, Auth exports |
| `packages/plugin/src/tui.ts` | 2, 4–17: SDK type exports |
| `packages/plugin/src/v2/effect/agent.ts`, `aisdk.ts`, `catalog.ts`, `command.ts`, `event.ts`, `filesystem.ts`, `reference.ts`, `skill.ts` | 1, 2, 1, 1, 1, 1, 1, 1 respectively: SDK `/v2/types` imports |
| `packages/plugin/src/v2/effect/integration.ts` | 11: SDK `/v2/types` import |
| `packages/plugin/src/v2/promise/aisdk.ts`, `integration.ts` | 2; 2, 9, 11: SDK `/v2/types` imports |
| `packages/sdk/js/src/v2/client.ts` | 1, 2: generated types; 6: generated SDK |
| `packages/sdk/js/src/v2/data.ts`, `server.ts` | 1; 2: dependent types |

The frozen manifest contains both generated SDK files before execution. The same failure log shows the SDK producer running `bun ./script/build.ts`, generating into `src/v2/gen`, and printing generated output alongside the plugin failure. The SDK producer sets **`clean: true` at `packages/sdk/js/script/build.ts:53`**, while **`turbo.json:8` sets build `dependsOn: []`** despite the plugin's SDK dependency at `packages/plugin/package.json:25`. This is an unsequenced producer/consumer build boundary consistent with the observed generated-files gap. The job log does not trace individual filesystem operations, so this confirmation does not claim a deterministic race reproduction. These producer, consumer, and scheduling files are unchanged by the three-line e2e correction. No source repair or rerun was performed.

### Actual HTTP/codegen/generated-client reach and misses

**Closing-run full HTTP CLI modes executed: zero.** Linux `Check generated client`, `Build HttpApi exerciser dependencies`, and `Run HttpApi exerciser gates` all skipped after the build failure. Linux HttpApi-codegen tests emitted a cache-miss task header but no completed test summary. Windows excludes POSIX HttpApi-codegen by the existing workflow filter; its generated-client and full HttpApi steps are Linux-only and skipped by platform policy.

The historical main run `38026385329` still contains actual coverage/auth/effect execution with 271 passing scenarios and 13 research scenarios per mode, as recorded above. Those historical counters are **not** credited as newly executed closing-run HTTP evidence. The closing browser research profiles and orchestra suites passed, but the newly blocked CLI stages keep the full main workflow RED.

### Closing artifacts, skips, and retention

All eight artifacts were downloaded and parsed. Five JUnit artifacts contain **9,502 summed shard records: 9,409 pass, 93 skip including two TODO, zero failure**. Three Playwright reports contain **470 logical tests: 469 expected, one skipped, zero unexpected, zero flaky**. The single Playwright omission remains the `fixme` at `packages/app/e2e/orchestra/chapter-workspaces.spec.ts:371`.

| Artifact | ID |
| --- | --- |
| `junit-linux-orchestra-1-1` | `11660554890` |
| `junit-linux-orchestra-2-1` | `11660714974` |
| `junit-windows-orchestra-1-1` | `11661820486` |
| `junit-windows-orchestra-2-1` | `11661775428` |
| `junit-windows-orchestra-3-1` | `11661945454` |
| `playwright-linux-1-1` | `11660982651` |
| `playwright-linux-2-1` | `11660489868` |
| `playwright-linux-3-1` | `11661640224` |

Skip accounting: orchestra **91 log skips + two TODO**; Atlas **17 skips + three TODO**; completed Windows other-package suites **325 skips** (maestro-arsenal 1, Relay TypeScript 122, LLM 30, TUI 1, app 1, desktop 144, Core 26); Python Relay **one unnamed skip**; Chromium **one fixme**. Windows e2e stayed unscheduled; Relay benchmark-runtime tests stayed explicitly excluded. Main desktop real-Electron/Linux App Dock/Docker/PTY integration omissions were not filled by separate runs. No Linux Turbo unit-suite skips or passes were inferred from its interrupted starts. Every reporter-visible skip name and all five JUnit omission lists remain in the parsed external evidence.

All three browser-install steps skipped due to cached Chromium, while browser tests ran. Atlas's PR-only detector skipped while its full suite ran. Windows platform-only gate omissions and the Linux post-Python step are retained in the job metadata. No whole job was skipped or cancelled. Original RED evidence and every earlier confirmation prefix remain byte-for-byte preserved.

After all twelve outcomes, only `jimmy-epic-close` was deleted, following exact target-SHA verification. The same matching-ref query detected `dev` as its positive control. Runs, artifacts, other refs, and worktrees were retained. External `jimmy-epic-close-operation` contains all twelve logs, compiler-diagnostic inventory, source manifests and controls, capacity samples, persisted dispatch ID, parsed artifacts/omissions/profile results, and cleanup verification. JUnit retention remains 14 days; Playwright retention seven days.

Only this append was committed in the evidence worktree. No principal source edit, additional main dispatch, other-workflow rerun, private evaluation, or new model study was performed. This is epic CI confirmation, not release approval; the owner's **35/42 blocked study** status remains unchanged. Full main closure remains **RED** on the measured plugin/SDK build boundary.
