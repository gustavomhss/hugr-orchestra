# omni-supervisor

The `hugr-omni-supervisor` binary. The host starts it once per host process, on first use, and it creates, contains,
stops and reaps every managed child (ADR-0005). That is what lets a stop end a whole process tree, and it stops every
tree when the host dies. It is started as `hugr-omni-supervisor --host-pid <pid> [--pipe <name>]`: on Unix the channel
is the socket on fd 0, on Windows a named pipe the host created. Exit code 0 after a clean shutdown, 2 for a bad command
line, 1 for anything else.

## Key modules

- `src/main.rs`: argument parsing and the platform entry.
- `src/unix`: process groups, spawn, stop, watching the host and sweeping trees. `src/pty_unix`: terminals.
- `src/windows`: job objects, the pipe channel, spawn and tree handling. `src/windows/container`: the
  `--appcontainer` mode. `src/pty_windows`: ConPTY terminals.

## Used by

`hugr-omni` talks to it with `omni-proto` messages. Orchestra's desktop app ships it as a resource next to the addon
(`apps/desktop/electron-builder.config.ts`). A binding locates it next to the module or executable, through
`HUGR_OMNI_SUPERVISOR`, or through `configure({ supervisor })`.

## Build and test

The `omni` workflow (`.github/workflows/omni.yml`) runs `node scripts/ci.mjs`: it builds the workspace bins and runs
the integration tests in `tests/` on Linux, Windows and macOS. A release run also builds it for musl and runs its suite
against that binary.

Back to [Omni](../../README.md).
