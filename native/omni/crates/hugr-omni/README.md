# hugr-omni

The Rust core of [Omni](../../README.md): it runs processes and terminals with the same behavior on Windows, macOS and
Linux. Callers build a `Command` (timeout, grace, cancel, pty and the rest) and call `run` or `spawn`. The crate never
creates a child itself: it asks the supervisor process to, so stopping a child ends its whole process tree.

## Key modules

- `src/api`: the public `Command` builder and the functions that start a child.
- `src/client`: starts the supervisor lazily and talks to it over `omni-proto` messages.
- `src/process`: the child handle, exit status, deadlines and `run`.
- `src/pty`: terminals. `src/io`: output draining and stdin. `src/spawn`: program lookup, environment, validation.
- `src/binding.rs`: hidden helpers for the language bindings (number checks, `supervisor` path).

## Used by

- `bindings/node` (`hugr-omni-node`), the native addon behind the `hugr-omni` npm package.
- `qa` (the QA harness), which runs the same workloads through omni and through the standard library.
- In Orchestra, `packages/core/src/omni.ts` is the only module that imports `hugr-omni`.

## Build and test

The `omni` workflow (`.github/workflows/omni.yml`) runs `node scripts/ci.mjs`, which formats, lints with clippy and
runs `cargo test --workspace` on Linux, Windows and macOS. Tests are in `tests/` (`contract.rs`, `teeth.rs`) and next to
the modules.

The promises are in [docs/api-contract.md](../../docs/api-contract.md) and the per-OS evidence in
[GUARANTEES.md](../../GUARANTEES.md).
