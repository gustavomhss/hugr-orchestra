# hugr-omni

Run processes and terminals from TypeScript (Node, Bun, Deno) with the same, tested behavior on Windows, macOS and
Linux. Built for AI agents and developer tools.

> **Status: pre-release.** v0.1 (TypeScript) is not published yet. The Rust core is usable from this repository;
> Python and the crates.io package come in v0.2.

- `run` / `spawn` resolve `npm` the same way everywhere, never use a shell, and stop the **whole process tree** on
  stop, timeout, cancel or scope exit.
- Pseudo-terminals (openpty / ConPTY) that never hang on exit.
- One native Rust core, thin packages per language, one shared conformance suite.

## Install

```sh
npm install hugr-omni     # Node
bun add hugr-omni         # Bun
deno add npm:hugr-omni    # Deno
```

Node 22+, Bun or Deno; prebuilt for Windows (x64, arm64), macOS (arm64, x64) and Linux (x64, arm64; glibc, and musl
for Node and Bun on Alpine). Nothing is compiled or downloaded at install time.

## Quickstart

In a project that has an `npm run dev`:

```ts quickstart
import { run, spawn } from "hugr-omni";

const r = await run("git", ["status", "--short"], { timeoutMs: 10_000 });
console.log(r.success, r.stdout);

await using server = spawn("npm", ["run", "dev"]);
for await (const line of server.lines()) if (line.text.includes("ready")) break;
console.log(await server.processes()); // every process the server started, with parent links
// leaving the scope stops the server and everything it started
```

`run` finishes and returns everything (`stdout` and `stderr` are strings; `text: false` gives bytes); `spawn` streams,
writes, waits and stops. A non-zero exit is a result, not an exception; every failure to start is an `OmniError` with a
`code`.

CommonJS works too: `const { run, spawn } = require("hugr-omni")`. `await using` needs Node 24+, Bun, Deno, or TypeScript
5.2+ compiling for Node 22; elsewhere write `try { ... } finally { await server.stop(); }`.

The [recipes for agents](docs/guide/recipes.md) are runnable code for a dev server, tests with a timeout, an interactive
terminal and cleanup, and for the options you look for next: `env`, `inheritEnv`, `cwd`, `stdin`, `mergeStderr`,
reading a result, a shell in a terminal.

## From Rust

The core is a Rust crate with the same options (`timeout`, `grace`, `cancel_on`, `pty`, ...). Depend on this repository
with git, plus `tokio` with the features `#[tokio::main]` needs:

```toml
[dependencies]
hugr-omni = { git = "https://github.com/gustavomhss/hugr-omni" }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

Cargo does not build another crate's binary, and the supervisor creates every child, so build it in a checkout:

```sh
cargo build --release -p omni-supervisor
```

Then put `target/release/hugr-omni-supervisor` next to your executable, or point `HUGR_OMNI_SUPERVISOR` at it.

```rust quickstart
use hugr_omni::Command;

#[tokio::main]
async fn main() -> Result<(), hugr_omni::Error> {
    let out = Command::new("git").args(["status", "--short"]).run().await?;
    println!("{} {}", out.exit.success(), out.stdout);
    Ok(())
}
```

## How it compares with the standard library

`qa/run` runs the same real workloads through hugr-omni and through each language's standard library (test suites of
real projects, a Vite dev server, misbehaving programs, a 200-command agent loop) and reports processes left running,
hangs, stop latency and lost output. See [qa/README.md](qa/README.md) for how to run it and
[docs/acceptance.md](docs/acceptance.md) for the KPIs the first release is judged on. Numbers are per OS and come from
CI, not from this file.

## Working on it

The gate is `node scripts/ci.mjs`. The `omni` workflow (`.github/workflows/omni.yml` in the Orchestra repository) runs
it on Linux, Windows and macOS for changes under `native/omni`; it drives `cargo` itself. Start from
[AGENTS.md](AGENTS.md) and [PLAN.md](PLAN.md). `scripts/readme-check` runs every quickstart in this file, so keep
exactly one `ts quickstart` and one `rust quickstart` block.

## In Orchestra

Orchestra starts child processes through `packages/core/src/omni.ts`, the only file that imports `hugr-omni`; it is
behind the `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER` flag (`0`, `1` or `strict`). The desktop app ships the addon and the
supervisor as resources, and `script/omni-mirror.sh` publishes this folder to a read-only mirror. The user guide is
[docs/guides/omni.md](../../docs/guides/omni.md); the integration notes are in
[docs/orchestra-integration.md](docs/orchestra-integration.md).

## Read on

- [Recipes for agents](docs/guide/recipes.md): dev server, tests, terminal, cleanup, options, results, a shell.
- [API contract](docs/api-contract.md): every function, option and result field, and what each promises.
- [GUARANTEES.md](GUARANTEES.md): what holds on each OS, and the test or measurement that proves it.
- [docs/acceptance.md](docs/acceptance.md): the contract items and the KPIs that decide the first release.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or [MIT license](LICENSE-MIT)
at your option.
