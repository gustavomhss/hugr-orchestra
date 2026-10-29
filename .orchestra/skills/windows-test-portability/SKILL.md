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
- **Checkout turns LF into CRLF.** The runner's git has `core.autocrlf` on, so a file restored from a commit or ref reads back as `text\r\n`. A fixture repository that compares file contents after checkout runs `git config core.autocrlf false` right after `git init`.

## Related

- `AGENTS.md` (Testing) for `test:ci` and spawning rules.
- `packages/core/test/board-snapshot.test.ts` and `packages/core/test/fixture/board-queue.ts` show each fix in place.
