# omni-proto

The wire protocol between the `hugr-omni` host and `hugr-omni-supervisor`, as Rust types plus a codec. It is internal and
not published. Requests such as `Spawn`, `Stop`, `Resize` and `List` go from the host to the supervisor; replies such as
`Spawned`, `Stopped` and `Processes` come back, each echoing the request id. Strings that come from the OS (argv,
environment, paths) travel as bytes: raw on Unix, WTF-8 on Windows.

## Key files

- `src/lib.rs`: `Spawn`, the message enum, `Slot`, `VERSION` (2), `MAX_FRAME` (1 MiB, length prefix excluded; a bigger
  or malformed frame ends the connection) and the `INFO_*` bits of `Ready`.
- `src/codec/wire.rs`: the byte layout. `src/codec/mod.rs`: `encode` and `decode`. `src/codec/tests.rs`: codec tests.

The layout is specified in [docs/protocol.md](../../docs/protocol.md).

## Used by

`hugr-omni` (the host side) and `omni-supervisor` (the other side), both through the workspace dependency in
`native/omni/Cargo.toml`. The host refuses a supervisor that reports another `VERSION`.

## Build and test

It builds and its codec tests run as part of `cargo test --workspace` in `node scripts/ci.mjs`, which the `omni`
workflow (`.github/workflows/omni.yml`) runs on Linux, Windows and macOS.

Back to [Omni](../../README.md).
