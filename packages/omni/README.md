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

Node 22+, Bun or Deno; prebuilt for Windows x64, macOS (arm64, x64) and Linux (x64, arm64, glibc). Nothing is compiled
or downloaded at install time.

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

The same real workloads through hugr-omni and through each language's standard library: the test suites of
[semver](https://github.com/dtolnay/semver) and [commander](https://github.com/tj/commander.js), a Vite dev server,
misbehaving programs (a root that leaves a descendant holding the output, a tree that ignores SIGTERM, 32 MiB of
output), and a 200-command agent loop with cancellations. **macOS, one machine, local quick run, 2026-10-04:
preliminary.** Numbers per OS from CI come with the release. K1, K2, K3 and K5 are the KPIs of
[docs/acceptance.md](docs/acceptance.md).

| | hugr-omni (TS) | `child_process` | hugr-omni (Rust) | `std::process` |
|---|---|---|---|---|
| Processes left running after a task (K1) | 0 | 4 | 0 | 10 |
| Hangs: tasks that did not return (K2) | 0 | 1 (a daemonizing program) | 0 | 2 |
| Stop latency over the grace period, p95 (K3) | 23 ms | a tree outlived a stop | about 15 ms | the tree outlived 3 of 3 stops |
| Output bytes lost or garbled (K5) | 0 | 0 | 0 | 0 |

Reproduce with `qa/run --quick`
([qa/README.md](qa/README.md)).

## Read on

- [Recipes for agents](docs/guide/recipes.md): dev server, tests, terminal, cleanup, options, results, a shell.
- [API contract](docs/api-contract.md): every function, option and result field, and what each promises.
- [GUARANTEES.md](GUARANTEES.md): what holds on each OS, and the test or measurement that proves it.
- [docs/acceptance.md](docs/acceptance.md): the contract items and the KPIs that decide the first release.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or [MIT license](LICENSE-MIT)
at your option.
