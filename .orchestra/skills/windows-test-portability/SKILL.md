---
name: windows-test-portability
description: Traps that make Orchestra tests pass on Linux and macOS but fail on the Windows CI runner — shell script paths, fake executables, paths git reports, and line endings. Use when writing a test or fixture that spawns a program, writes a shell script, compares paths or reads back files git checked out, or when a test fails only under `--os windows`.
---

# Windows Test Portability

The Windows runner is the only one that disagrees with a Mac about paths, programs and line endings. Run a test that touches any of them there before calling it done:

```bash
bun run test:ci <package> <test files...> --os windows
```

Fix the test or fixture so it runs everywhere. Skip a test on `win32` only when the product itself cannot do the thing on Windows, and then say so in the user guide as a product limit.

## Traps

- **`sh` reads backslashes as escapes.** A Windows path written into a shell script (`C:\Users\...\runs.log`) loses its separators, and the script writes nowhere without failing. Write paths into scripts with forward slashes: `path.join(...).replaceAll("\\", "/")`. Symptom: the script "ran" but its output file is empty or missing.
- **A shell script is not a program.** Spawning `fake.sh` directly fails with `NotFound` on Windows. Write a fake executable as a `.ts` file and spawn it under bun: the command is `[process.execPath, fake]`. A seam that takes a program should take a command (executable plus leading arguments), so a test can pass one like this.
- **git reports Windows paths with forward slashes.** `git worktree list --porcelain` and similar output give `C:/Users/...`, while `path.join` gives `C:\Users\...`. Pass a path read from git output through `path.resolve` before comparing it or storing it, so it is in the platform's form. This is a product fix, not only a test fix.
- **The runner's temp folder is an 8.3 short path.** `os.tmpdir()` gives `C:\Users\RUNNER~1\...`, while a child process reports its working directory in the long form. A test that compares a temp path with what a child prints passes it through `fs.realpath` first: `await realpath(await mkdtemp(join(tmpdir(), "x-")))`. `apps/desktop/src/main/omni-process.test.ts` shows it.
- **Checkout turns LF into CRLF.** The runner's git has `core.autocrlf` on, so a file restored from a commit or ref reads back as `text\r\n`. A fixture repository that compares file contents after checkout runs `git config core.autocrlf false` right after `git init`.

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
