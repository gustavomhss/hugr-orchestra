---
name: ci-lanes-maintenance
description: How test.yml splits the epic suite into time-balanced shards, the job budget, and how to refresh the timings that size them
---

# CI lanes maintenance

`.github/workflows/test.yml` runs the epic suite. No job may run longer than 10 minutes (`timeout-minutes: 10`), with these documented exceptions: the `e2e` lane has 15 job minutes and a 12-minute step, because a shard Chromium boots its own app server and needs about 8.5 minutes under the account's runner cap; the Windows `libs` lane ("other packages") has the same 15/12 budget because that lane finishes under time once the step is not cut at 8 minutes, and it does not run the plugin compile (12 minutes of compile plus the 12-minute test step do not fit in 15); an unbudgeted Windows turbo job has 25 job minutes because `@orchestra/plugin` `tsc` is its own 12-minute step before the 8-minute test step (run 43066731722, windows core 4/7). The test step stays 8 minutes except for that documented libs step. The aim is about 5 minutes of test time per job. The planner `packages/script/src/test-plan.ts` and its data file `packages/script/src/test-timings.json` decide how many shards exist and which test files each one runs.

## Layout

A `plan` job (Node 24, no install) runs `node packages/script/src/test-plan.ts plan` and writes three outputs: `unit` (the matrix of the `unit-rest` job), `e2e` (the shard numbers) and `e2e_shards` (their count). The jobs read them with `fromJSON`, so adding tests changes the shard count without editing the workflow.

- Core (`packages/core`) is sharded on both OSes. Each shard job runs `bun packages/script/src/test-plan.ts shard packages/core <linux|windows> <i> <n>` and hands the file list to `bun turbo test`. Files go to the lightest shard first (longest first). The file list is part of the Turbo task hash, so recomposed shards never replay a stale cache entry. On Windows, `test/filesystem/watcher.test.ts` is pulled out of that list and run in its own process: inside the 85-file process it left a `watcher.node` segfault (run 43066731722, twice), and alone it passes (test-ci 43109694032).
- The other Turbo packages run in fixed lanes (`packageLanes`, same on both OSes unless noted): `app` (the app package alone), `cli` (cli, server, sdk-next, client, tui, session-ui), `atlas` (atlas-boundary alone), `relay` and `libs`. The `@orchestra/relay` package has its own turbo lane on both platforms; the pytest suite stays in the Linux gates lane. The libs lane is the complement of every other filter, so a package added later lands in it. Parts are named `packages-<lane>` on Linux and `windows-<lane>` on Windows.
- Rule: relay and rollback get their own lanes. Linux has a `gates` lane (repo-wide gates plus the Relay suite, no Turbo run at all). On Windows the rollback proof and the process query proof ride in the `atlas` lane, which does not build core, so the proof never waits behind a bulk package. Never put relay, the repo gates or the rollback proof back into `libs` or any lane that runs a bulk package: that is what pushed the lane over the 10 minute job limit.
- Linux also has an `httpapi` lane (generated client check and the HttpApi exerciser) and a `sandbox` lane (the `.hosted.ts` proofs). Windows has no separate hosted lane.
- `atlas-boundary` has its own lane because one generator test there takes about 210 s on Linux and 294 s on Windows. The `httpapi-codegen` package is skipped on Windows.
- e2e shards come from `packages/app-shell/script/e2e-timings.json` through the same shard-count rule. The previous-pass marker of each shard is keyed `e2e-<os>-<shard>of<N>`, so a relabel replays shards whose inputs did not change.

## Timings file

`packages/script/src/test-timings.json`:

- `target`: seconds of test time per job for `linux`, `windows` and `e2e` (330, 400 and 270). Windows is higher in seconds only because its totals are scaled by `overhead` first; the jobs themselves aim at the same wall time.
- `overhead`: per-OS factor applied to a package's measured total before the shard count. Windows is 1.6: in epic run 41317028045 the Windows core shards ran at 1.0 to 1.6 times (at least 1.57 on the slow ones) their predicted time, and two of four timed out at 8 minutes. A Windows shard also pays 1.5 to 2 minutes of setup, so keep its test time near 6 minutes at most. Linux is 1.7: epic run 42930009745 measured 476s of tests in a shard the file times called 319s, and the 8-minute step died after the tests had already passed. If a job times out again, raise that OS's factor before adding lanes. The factor scales the shard count (`packageShards`), not the per-file weights, so the file-to-shard packing stays comparable across OSes.
- `margin`: headroom for the imbalance that longest-first packing leaves. Shard count is `ceil(total * overhead * margin / target)`.
- `budget`: `limit` is the account cap on concurrent hosted jobs (20) and `fixed` counts the jobs outside the plan (atlas scope, atlas, two omni jobs).
- `totals`: seconds per sharded package and OS. It sets the shard count.
- `files`: seconds per test file, keyed `<package directory>:<os>`. A file with no entry weighs its size at the seconds-per-byte of the measured files, so a new file lands in some shard without any edit.

The shipped `files` and `totals` come from one real run of all 487 core test files on each OS (seconds between a file's header line and the next one in the job log). On that run core took 1078 s on Linux and 1244 s on Windows. Linux overhead 1.7 and Windows overhead 1.6 scale those totals before the shard count. One file dominates Linux: `backend-toolkit-cli.test.ts` (the DataFusion build, about 320 s), so it gets a shard to itself. A bigger shard count cannot help that file. If it gets slower, split the test.

Per-file times are not in a normal lane's log: the core test script passes `--only-failures`. To measure without a cold dispatch, run `bun run test:ci core <every test file as ./path> --os both`, then read the two job logs with `gh run view --job <id> --log`.

## Refreshing the timings

Do this after large test changes, or when a shard job approaches 8 minutes.

1. Dispatch `test.yml` with `cold: true` on a branch (a normal epic run does not write reports). Cold shards run with `--reporter=junit` and upload an artifact `junit-<OS>-<part>`.
2. Download the artifacts into an empty directory with `gh run download <run id> --pattern 'junit-*' --dir <dir>`.
3. Run `bun packages/script/src/test-plan.ts refresh <dir>`. It rewrites `files` and the core `totals` from the reports.
4. Run `bun packages/script/src/test-plan.ts plan` to see the new job count, and commit `packages/script/src/test-timings.json`.

Only the core package is time-sharded. If a lane in another package grows past its budget, add a lane in `packageLanes` (packages/script/src/test-plan.ts) or shard that package the same way. Measured package times from epic run 41317028045, Linux / Windows seconds: app 283 / 301, cli 223 / 177, server 37 / 65, small clients 38 / 39, atlas-boundary about 210 / 294. The Windows `libs` remainder was not measured (at least 175 s); read it from the job log after the next run and move a package into its own lane if `libs` nears 6 minutes of tests. Turbo with concurrency 1 prints each task's group only when it ends, so the gap between two group-end timestamps in the log is that package's duration.

## Job budget

The account runs at most 20 hosted jobs at once; jobs beyond that were once cancelled as "not acquired by Runner". `unit-rest` uses `max-parallel: 10` and `e2e` uses `max-parallel: 5`, so surplus jobs wait in the queue instead of being cancelled. `plan` prints a `::warning` when unit jobs + e2e shards + `fixed` exceed `budget.limit`; that is expected and costs wall time, not jobs. The current plan is 23 unit jobs, 8 e2e shards and 4 fixed jobs, 35 in all, so it always queues; that is accepted because the per-job limit (10 minutes, or the two documented 15-minute exceptions) matters more than the cap. To stay under the cap, raise `target`, merge lanes in `packageLanes`, or drop a hosted lane, but never merge relay or rollback back into a bulk lane.

## Hosted proofs

The `.hosted.ts` core proofs are excluded from Bun's suffix discovery, so they run by exact path:

- Linux `sandbox` lane: `tool-safety-srt-read-alias`, `tool-safety-sandbox-project-config`, `tool-safety-srt-endpoint` (needs Docker for Cassandra, Scylla and Postgres). Bubblewrap, socat and the AppArmor sysctl are set up in the job. They run with the omni control scope set to `declared`.
- `windows-process-query` runs on both OSes: in the Linux `sandbox` lane, and on Windows in the `atlas` lane (with the rollback proof).
- Paths must start with `./`: Bun treats a bare `test/x.hosted.ts` as a name filter and runs nothing.
- test.yml names the omni control's scope variable for these steps, so the ledger in `packages/core/test/test-omni-control.test.ts` lists that file. Do not write the variable's name in this skill: the ledger test scans every tracked file for it.

## Relay

The Relay suite runs under pytest-xdist (`-n auto`, pinned in `modules/relay/requirements-dev.txt`) with `--durations=15`, followed by `tests/test_arm_hook.sh` and `tests/test_concurrent_gate.sh`. A Relay test that shares a fixed temp path or port with another breaks under xdist; give it a per-test directory.

## Caches

`cache-warm.yml` seeds the dependency, ripgrep, Playwright, typecheck Turbo and pip caches on dev. It holds no test entries: test entries are saved by `test.yml`. Dispatch `test.yml` on dev to seed them; a PR epic run can restore dev's entries but never saves into dev's scope.
