---
name: ci-lanes-maintenance
description: How test.yml splits the epic suite into time-balanced shards, the job budget, and how to refresh the timings that size them
---

# CI lanes maintenance

`.github/workflows/test.yml` runs the epic suite. No job may run longer than 10 minutes (`timeout-minutes: 10`); the aim is about 5 minutes of test time per job. The planner `script/test-plan.ts` and its data file `script/test-timings.json` decide how many shards exist and which test files each one runs.

## Layout

A `plan` job (Node 24, no install) runs `node script/test-plan.ts plan` and writes three outputs: `unit` (the matrix of the `unit-rest` job), `e2e` (the shard numbers) and `e2e_shards` (their count). The jobs read them with `fromJSON`, so adding tests changes the shard count without editing the workflow.

- Core (`packages/core`) is sharded on both OSes. Each shard job runs `bun script/test-plan.ts shard packages/core <linux|windows> <i> <n>` and hands the file list to `bun turbo test`. Files go to the lightest shard first (longest first). The file list is part of the Turbo task hash, so recomposed shards never replay a stale cache entry.
- The other Turbo packages run in fixed lanes: app (app, server, sdk-next, client, tui, session-ui), cli, and libs. The libs lane is the complement of every other filter, so a package added later lands in it. On Linux it also carries the repo-wide gates and the Relay suite; on Windows it carries the rollback proof.
- Linux also has an `httpapi` lane (generated client check and the HttpApi exerciser) and a `sandbox` lane (the `.hosted.ts` proofs). Windows has a `hosted` lane that runs the process query proof.
- e2e shards come from `packages/app-shell/script/e2e-timings.json` through the same shard-count rule. The previous-pass marker of each shard is keyed `e2e-<os>-<shard>of<N>`, so a relabel replays shards whose inputs did not change.

## Timings file

`script/test-timings.json`:

- `target`: seconds of test time per job for each OS. Windows is lower because its setup is heavier.
- `margin`: headroom for the imbalance that longest-first packing leaves. Shard count is `ceil(total * margin / target)`.
- `budget`: `limit` is the account cap on concurrent hosted jobs (20) and `fixed` counts the jobs outside the plan (atlas scope, atlas, two omni jobs).
- `totals`: seconds per sharded package and OS. It sets the shard count.
- `files`: seconds per test file, keyed `<package directory>:<os>`. A file with no entry weighs its size at the seconds-per-byte of the measured files, so a new file lands in some shard without any edit.

The shipped totals are estimates taken from a successful run; `files` is empty until the first refresh, so until then packing falls back to file size.

## Refreshing the timings

Do this after large test changes, or when a shard job approaches 8 minutes.

1. Dispatch `test.yml` with `cold: true` on a branch (a normal epic run does not write reports). Cold shards run with `--reporter=junit` and upload an artifact `junit-<OS>-<part>`.
2. Download the artifacts into an empty directory with `gh run download <run id> --pattern 'junit-*' --dir <dir>`.
3. Run `bun script/test-plan.ts refresh <dir>`. It rewrites `files` and the core `totals` from the reports.
4. Run `bun script/test-plan.ts plan` to see the new job count, and commit `script/test-timings.json`.

Only the core package is time-sharded. If a lane in another package grows past its budget, add a lane in `packageLanes` (script/test-plan.ts) or shard that package the same way.

## Job budget

The account runs at most 20 hosted jobs at once; jobs beyond that were once cancelled as "not acquired by Runner". `unit-rest` uses `max-parallel: 10` and `e2e` uses `max-parallel: 5`, so surplus jobs wait in the queue instead of being cancelled. `plan` prints a `::warning` when unit jobs + e2e shards + `fixed` exceed `budget.limit`; that is expected and costs wall time, not jobs. To stay under the cap, raise `target`, merge lanes in `packageLanes`, or drop a hosted lane.

## Hosted proofs

The `.hosted.ts` core proofs are excluded from Bun's suffix discovery, so they run by exact path:

- Linux `sandbox` lane: `tool-safety-srt-read-alias`, `tool-safety-sandbox-project-config`, `tool-safety-srt-endpoint` (needs Docker for Cassandra, Scylla and Postgres). Bubblewrap, socat and the AppArmor sysctl are set up in the job. They run with `ORCHESTRA_OMNI_CONTROL=declared`.
- `windows-process-query` runs on both OSes.

## Relay

The Relay suite runs under pytest-xdist (`-n auto`, pinned in `modules/relay/requirements-dev.txt`) with `--durations=15`, followed by `tests/test_arm_hook.sh` and `tests/test_concurrent_gate.sh`. A Relay test that shares a fixed temp path or port with another breaks under xdist; give it a per-test directory.

## Caches

`cache-warm.yml` seeds the dependency, ripgrep, Playwright, typecheck Turbo and pip caches on dev. It holds no test entries: test entries are saved by `test.yml`. Dispatch `test.yml` on dev to seed them; a PR epic run can restore dev's entries but never saves into dev's scope.
