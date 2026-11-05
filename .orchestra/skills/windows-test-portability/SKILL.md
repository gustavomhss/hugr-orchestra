---
name: windows-test-portability
description: Traps that make Orchestra tests pass on Linux and macOS but fail on the Windows CI runner — shell script paths, fake executables, paths git reports, and line endings. Also the patterns for waiting in a test without a fixed sleep, since slow runners such as Windows are where a guessed wait fails first. Use when writing a test or fixture that spawns a program, writes a shell script, compares paths or reads back files git checked out, waits for something to happen, or when a test fails only under `--os windows`.
---

# Windows Test Portability

The Windows runner is the only one that disagrees with a Mac about paths, programs and line endings. Run a test that touches any of them there before calling it done:

```bash
bun run test:ci <package> <test files...> --os windows
```

Fix the test or fixture so it runs everywhere. Skip a test on `win32` only when the product itself cannot do the thing on Windows, and then say so in the user guide as a product limit.

## Traps

- **Desktop tests have a Bun/Node split.** `apps/desktop/bunfig.toml` excludes `src/**/*.node.test.ts` because `node:sqlite` exists in Node and Electron, not Bun. The `test` script in `apps/desktop/package.json` is literally `bun test && node --experimental-strip-types --test "src/**/*.node.test.ts"`. This describes the package script, not permission to run it locally or a claim that `test:ci` executes the Node leg. A Bun-only result does not prove the Node-owned store tests; see [desktop-main-maintenance](../desktop-main-maintenance/SKILL.md) for their ownership.
- **`sh` reads backslashes as escapes.** A Windows path written into a shell script (`C:\Users\...\runs.log`) loses its separators, and the script writes nowhere without failing. Write paths into scripts with forward slashes: `path.join(...).replaceAll("\\", "/")`. Symptom: the script "ran" but its output file is empty or missing.
- **A shell script is not a program.** Spawning `fake.sh` directly fails with `NotFound` on Windows. Write a fake executable as a `.ts` file and spawn it under bun: the command is `[process.execPath, fake]`. A seam that takes a program should take a command (executable plus leading arguments), so a test can pass one like this.
- **git reports Windows paths with forward slashes.** `git worktree list --porcelain` and similar output give `C:/Users/...`, while `path.join` gives `C:\Users\...`. Pass a path read from git output through `path.resolve` before comparing it or storing it, so it is in the platform's form. This is a product fix, not only a test fix.
- **The runner's temp folder is an 8.3 short path.** `os.tmpdir()` gives `C:\Users\RUNNER~1\...`, while a child process reports its working directory in the long form. A test that compares a temp path with what a child prints passes it through `fs.realpath` first: `await realpath(await mkdtemp(join(tmpdir(), "x-")))`. `apps/desktop/src/main/omni-process.test.ts` shows it.
- **Checkout turns LF into CRLF.** The runner's git has `core.autocrlf` on, so a file restored from a commit or ref reads back as `text\r\n`. A fixture repository that compares file contents after checkout runs `git config core.autocrlf false` right after `git init`.

- **Read the failing SHA before fixing a "flake".** A CI history lists runs of throwaway `ci-run-*` snapshots of unfinished work, so a test that fails on one SHA and passes on another may only have been fixed in the next iteration, or may not exist in `dev` yet. Check with `git merge-base --is-ancestor <sha> HEAD` and `git log -S'<test name>'` before touching product code. A dependency bump that lands before its adaptation fails the same tests on every OS until the adaptation lands (the MCP SDK 1.32.0 `patchedDependencies` port, `extract-zip` renamed to `@electron-internal/extract-zip` in Electron 42.11); that is a red build, not a flake.

## Waiting in tests

A fixed sleep (`Bun.sleep(n)`, `setTimeout`, `page.waitForTimeout(n)`) is a guess about the slowest runner. Too short and the test flakes; long enough and every run pays for it. Wait on the condition instead:

- **Playwright:** `expect.poll(() => value).toBe(x)` or a locator assertion, never `waitForTimeout`. Register `page.waitForResponse(...)` before the action that triggers the request, then await it. A `routeWebSocket` handler that records the socket is a latch for "the page connected". `getAnimations({ subtree: true })` finished is the settle condition for a CSS transition. The mock SSE server hands out one queued event per connection, so an empty queue (`expect.poll(() => events.length).toBe(0)`) means the page received it.
- **Bun tests:** poll a real condition with a small `until(() => done)` helper and a deadline (see `packages/app-shell/src/context/global-sync/bootstrap.test.ts`). Prefer a promise the code under test already exposes (a Deferred, an event, a file the command writes) over polling.
- **"X must not happen":** a negative check needs a positive anchor first (a response, a connect, a drained queue), then one read. `await new Promise((resolve) => setImmediate(resolve))` is a barrier for promise-only code. When the code does real IO there is no barrier and a short window is all there is; say so in a comment rather than lengthening it.
- **Deadlines are not sleeps.** A timeout that only fires on failure, or on a path that is expected to hang, stays. Name the constant and say what it caps (`AUTH_PROBE_DEADLINE_MS` in `packages/server/test/httpapi-exercise/backend.ts`).
- **Order two operations on purpose.** To prove two calls ran one at a time, have the second record whether the first had finished when it started (see "runs one verify at a time" in `packages/core/test/relay.test.ts`) instead of sleeping and hoping they overlapped.
- **Per-test bound:** `packages/script` runs `bun test --timeout 5000` from `package.json`. That is a hang bound, not a wait; a test that needs more is slow for a reason to fix. `e2e/performance/` is a manual benchmark suite outside CI and keeps its pacing waits.
- **Flaky passes:** `packages/app-shell/e2e/utils/flaky-reporter.ts` lists tests that passed only on a retry in the log, as a warning annotation, and in the job summary. Treat each one as a bug to fix, not a green.
- **A second load aborts the first.** In Electron, `loadURL` while another load is in flight rejects with `ERR_ABORTED (-3)`. MCP Dock `navigate` and `command` wait (bounded) on the tab's `initialLoad` for that reason; harness case U34 holds a load open to prove it.

## Flake causes we fixed

A CI census of 150 `test.yml` runs found these. Look for them before blaming the runner.

- **A wait deadline must fit inside the test timeout, with room to spare.** `until()` in `backend-toolkit-process.test.ts` gave up after 20s while the test allowed 120s, and a loaded runner needs longer to push 65 MiB through a pipe. A helper's own bound is part of the test's budget: size it from the slowest runner, not the Mac, and let the test timeout be the only backstop.
- **A stream keeps what it already buffered after `abort()`.** The next `reader.read()` can return a chunk instead of rejecting. Read until the read rejects, bounded by a deadline, and make sure a timeout or `done` cannot pass for the rejection (`actions-transfer-download.test.ts`).
- **Windows reports a directory being deleted as EPERM/EACCES/EBUSY.** Under lock contention a competing `mkdir` or `stat` sees that instead of NotFound or AlreadyExists, so a lock that treats it as fatal kills a worker. `EffectFlock` retries it on win32. When a stress test fails, print the failing worker's stderr in the assertion, not only its exit code (`effect-flock.test.ts`).
- **Stop a server only after its held requests are answered.** A handler that never settles can stall `server.stop()` on Windows until the test timeout. Open the gate the handler waits on in a finalizer registered after the server, so it runs first (`ripgrep-binary.test.ts`).
- **A fixture that runs a downloaded program proves it starts before the product does.** The product maps every credential-read failure to one redacted message, so a spawn that fails on a freshly written `.exe` shows up as an unrelated assertion (`fixture/actions-network.ts`).

## Related

- `AGENTS.md` (Testing) for `test:ci` and spawning rules.
- `packages/core/test/board-snapshot.test.ts` and `packages/core/test/fixture/board-queue.ts` show each fix in place.
