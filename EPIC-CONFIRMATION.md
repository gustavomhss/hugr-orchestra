# Frozen principal five-workflow confirmation

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
