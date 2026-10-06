# Working in hugr-omni

hugr-omni runs processes and terminals with identical, tested behavior on Windows, macOS and Linux. It is a Rust
core with a TypeScript package (Python and Rust packages in v0.2). Every child is created by a supervisor process
(ADR-0005).

**Read first, in this order:**
1. your work-package card in `PLAN.md` §7, plus §4.3–4.5;
2. `docs/api-contract.md`;
3. `docs/adr/0005-supervisor.md`;
4. `docs/protocol.md`;
5. `conformance/SPEC.md` and `conformance/FIXTURE.md`.

The spike code in branch `spike/supervisor` (`spikes/supervisor/sup/src/`) shows working techniques for every OS
path. Read it; never copy it wholesale. It is throwaway code, with files above the size limit.

## Layout and layers

| Where | What | May use |
|---|---|---|
| `crates/hugr-omni/src/api` | public surface (frozen) | everything below |
| `crates/hugr-omni/src/process` | `Child`, timeout/cancel, `run` | `pty`, `client`, `io`, `spawn`, `error`, `types` |
| `crates/hugr-omni/src/pty` | host side of terminals | `client`, `io`, `error`, `types` |
| `crates/hugr-omni/src/client` | supervisor lifecycle and channel | `omni-proto`, `spawn` (the `Spec` type), `error` |
| `crates/hugr-omni/src/io` | output pumps, decoding, lines, stdin | `error`, `types` |
| `crates/hugr-omni/src/spawn` | validation, resolution, env (pure) | `error`, `types` |
| `crates/hugr-omni/src/error` | `Error`, `ErrorCode`, messages | `types` |
| `crates/hugr-omni/src/types` | public value types (frozen) | – |
| `crates/hugr-omni/src/binding` | number rules for bindings (hidden, W03) | `error` |
| `crates/omni-proto` | messages + codec | – |
| `crates/omni-supervisor/src/{unix,windows,pty_unix,pty_windows}` | the supervisor | `omni-proto` |
| `crates/omni-fixture` | test program | – |

Rules for the layers:
- Imports only point down the table (INV-15).
- The supervisor never depends on `hugr-omni`.
- `lib.rs` re-exports only `api` and `error`.

**Seams.** Items under a `SEAM (frozen in W00)` module doc are frozen. Their names, signatures and docs change only
by a lead decision. Their bodies and every private item belong to the module's owner.

## Rules that are never bent

- **No shell, ever.** On Windows, `.cmd`/`.bat` run through `cmd.exe` with batch-safe quoting, or are refused.
- **The host never forks,** installs no signal handler or exit hook, and never changes console state. All of that
  lives in the supervisor.
- **Never observe child exit through tokio's process/SIGCHLD machinery** (INV-16). `tokio::process` is banned.
- **No `unwrap`/`expect`/`panic` in library or supervisor code** (clippy denies it). Nothing may panic across FFI.
- **`unsafe` only in `client`, `pty`, `spawn/sys.rs` (the effective execute-permission check), the supervisor,
  `omni-fixture/src/sys`, the bindings, and the test runners' one `std::env::set_var` at startup (before any thread),** each block with a `// SAFETY:` comment.
- **Never block the host:** not the Node main thread, not the tokio executor. The one exception is spawning,
  which blocks for bounded round trips, like `std::process::Command::spawn`: one for a pipe child, two for a Unix
  PTY child (`client::spawn`, then `Tree::go`).
- **File size:** at most 650 lines per code file (ideal ≤ 400). Split inside your module before 600.
- **Tests assert.** A timeout or an incomplete observation is a failure. Synchronize on fixture markers, never on
  `sleep`.
- **Contract scenarios** (`conformance/scenarios`, `crates/hugr-omni/tests`) are read-only for implementers
  (INV-13).
- **Error texts** live in `crates/hugr-omni/src/error/messages.rs` as `pub(crate)` `Error` constructors. It is
  append-only and shared: each WP adds its own `impl Error` block at the end, and never edits another WP's texts.
- **Test crates only** may start with `#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]`. Every
  test crate needs a `//!` doc line, because `missing_docs` is denied.

**Dependency allowlist (INV-12).**
- **Allowed:** `libc`, `windows-sys`, `tokio` (no `process` feature), `tokio-util`, `serde` + `serde_json` + `regex` (tests
  and runners only), and `napi`/`napi-derive`/`napi-build` (W13).
- **Anything else** — and any new `windows-sys` feature — means stop and ask the lead.

## Gates (run all before you push)

```bash
python3 scripts/file-size-guard.py
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo clippy --workspace --all-targets --target x86_64-pc-windows-msvc -- -D warnings
cargo build --workspace --bins
cargo test --workspace
```

`cargo test` alone never builds another package's binaries (`omni-fixture`, `hugr-omni-supervisor`); the contract
runner fails loudly without them.

**Linux, in Docker** (any Docker host; the target dir is a volume, not your worktree):

```bash
docker run --rm -v "$PWD":/w -w /w -v omni-cargo:/usr/local/cargo/registry -v omni-target:/w/target \
  -v omni-rustup:/usr/local/rustup rust:1.96 cargo test --workspace
```

- **Supervisor tests in Docker** need `--privileged`: the Linux PID-reuse test steers `ns_last_pid`, and it fails
  rather than skips without it.
- **CI** is one script, `node scripts/ci.mjs` (the fast gate; `--release` adds the release checks), run by
  GitHub Actions (`.github/workflows/ci.yml`: Ubuntu 24.04, macOS 14 arm64, Windows Server 2022) on pushes to `main`
  and `bundle/**`, pull requests to `main`, tags `v*` and by hand. `wp/**` never runs. Only the lead pushes.
- **First time:** `rustup target add x86_64-pc-windows-msvc --toolchain 1.98.0`.
- **Disk is limited:** at most 2 heavy Rust builds at once on this machine. Delete your worktree's `target/` when
  you stop.

## Traps already paid for (S1–S5)

- **macOS PTY:** a root that prints and exits at once loses its output unless it is held before exec until the
  host reader runs (`Go`, R9).
- **Host-side SIGCHLD:** a host with `SIGCHLD = SIG_IGN`, or a `waitpid(-1)` reaper, steals in-host children. That
  is why the supervisor owns every child.
- **PTY paths:** `ptsname` is not thread-safe. Use `ptsname_r` (Linux) or `TIOCPTYGNAME` (macOS). Open `/dev/ptmx`
  with `O_CLOEXEC`.
- **ConPTY:** `ClosePseudoConsole` can block for 5 s on Windows Server 2022. Close on a worker, with an independent
  deadline.
- **Windows handles:** `HANDLE_LIST` limits only *our* child. Never create inheritable handles in the host (R7).
- **macOS spawn:** `posix_spawn` needs `POSIX_SPAWN_CLOEXEC_DEFAULT` plus explicit dup2 actions. macOS has no
  `MSG_CMSG_CLOEXEC`.
- **PID reuse is real on CI** (S5 T6). A gone tree must never be signalled again.

## Git

- Work on `wp/<id>` and push early (wp branches do not run CI). Never open a PR, and never merge.
- Stage files by name, never with `git add -A`. Run `git diff --name-only <baseline>...HEAD` before each push and
  touch only your write-set.
- Conventional commits (`feat(client): …`, `fix(unix): …`).
- Stop at "branch pushed, green locally, waiting for the lead", and report in the brief's RETURN format.
