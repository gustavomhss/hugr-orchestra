# Windows notes for running programs

What differs on Windows when you run programs with hugr-omni. The rules are in
[contract §3](../../../docs/api-contract.md#3-starting-a-process) and
[contract §7](../../../docs/api-contract.md#7-exit-and-termination-cause). The per-OS evidence is in
[GUARANTEES.md](../../../GUARANTEES.md).

## `.cmd` and `.bat` go through cmd.exe, safely, or not at all

- `npm`, `npx`, `pnpm` and `yarn` are `.cmd` files on Windows. hugr-omni finds them by name through PATHEXT, so
  `spawn("npm", ["run", "dev"])` works unchanged on every OS. Never append `.cmd` yourself in portable code.
- A resolved `.cmd` or `.bat` file runs through `cmd.exe`, with the same batch-safe escaping as Rust's standard
  library. What cmd.exe cannot receive literally is refused with `INVALID_ARGUMENT` before anything runs, never
  passed in mangled form: an argument with a line break, or a batch file whose path contains `%` or `"` or ends with
  `\` (`crates/omni-supervisor/src/windows/cmdline.rs`). If you hit this, pass the data another way: stdin, a file,
  or an environment variable.
- Metacharacters (`&`, `|`, `^`, `%`, `<`, `>`) in your arguments are never interpreted. They are not "escaped for
  you so the shell runs them"; they reach the program as text.
- Only `.exe`, `.com`, `.bat` and `.cmd` files start directly. A `.ps1` or `.js` file is `NOT_EXECUTABLE`. Run its
  interpreter instead: `spawn("powershell.exe", ["-File", script])`, or `spawn(process.execPath, [script])`.

## There is no `shell: true`

hugr-omni never adds a shell. If the caller truly needs shell syntax (a pipeline written by the user, a builtin
such as `dir`), name the shell explicitly and own that decision.

- Unix: `spawn("sh", ["-c", script])`.
- Windows: `cmd.exe` parses its command line by its own rules, not the C runtime's. hugr-omni quotes arguments by
  the C runtime rule, so a whole command string given to `cmd.exe /c` does not always arrive as written. An explicit
  option for a verbatim cmd.exe command line is planned (integration plan WP8b). Until then, prefer running the real
  program directly, and keep cmd.exe for the cases that need it, reviewed one by one.

The `omni-migrate` skill covers how to port `shell: true` call sites.

## Paths

- A drive-relative path such as `C:tools\x.exe` or `C:work` is relative to a per-drive current directory, which a
  child cannot rely on. It is refused: `INVALID_ARGUMENT` for `command`, `INVALID_CWD` for `cwd`. Each message says
  to write the full path, with `\` after the drive letter.
- A command with a path separator (`.\tool.exe`, `bin/tool`) resolves against `cwd`, as on Unix.

## Environment

- Variable names are case-insensitive on Windows. Do not set both `Path` and `PATH` in `env`.
- `inheritEnv: false` still passes `SystemRoot` from the host, unless `env` sets it or removes it with `null`. Many
  programs cannot start without it. Nothing else is added, so PATH is gone and bare names are `NOT_FOUND`.

## Exit codes and signals

- Exit codes are reported as non-negative integers: `0xC000013A` (STATUS_CONTROL_C_EXIT) is 3221225786, not a
  negative number. Compare against the unsigned value.
- `signal` is always `null` on Windows. A program ended by a console Ctrl-C or Ctrl-Break usually exits with
  3221225786.
- Graceful stop on Windows is best effort: CTRL_BREAK goes to the tree's console processes. Most runtimes exit at
  once. A `.bat` script prints `Terminate batch job (Y/N)?`, reads end of input, and **continues** (ADR-0001 Q3). The
  forced step after `graceMs` (`TerminateJobObject`) always ends the tree. Expect `reason: "killed"` with whatever
  code the forced step left. The tiers are in [GUARANTEES.md](../../../GUARANTEES.md#containment-tiers-adr-0005).

## Trees

On Windows, the kill unit is the Job. A descendant cannot leave it: breakaway is refused. So, unlike `setsid` on Unix,
nothing escapes `stop()`. `processes()` lists the Job's live members, and `name` is the file name with `.exe`
(`node.exe`).
