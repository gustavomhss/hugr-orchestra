# Rust Q1 source facts — rust-tools

Cold-checked source facts for eight future Rust analysis tools. Repository specification only: not a runtime capability, ready-lane, noexec, offline, or redistribution approval, and not an Orchestra argv contract. Unselected binaries are not claimed.

## cargo-geiger 0.14.0

- **Artifact:** No native binary on `geiger-0.14.0`. Source-build only (needs cargo); a native binary is not claimed. crates.io publisher cksum `93c7cce381923a196a9e4c16d4003ebcf0f5e0a7aabfabfd2df128b64017d697` (not a local rehash). Generated source archives exist; members were not extracted.
- **License:** `Apache-2.0 OR MIT`. LICENSE-MIT sha256 `e00aed4c9f30be2953e741260324a1419be675921c758f4b81d23e6643994cd6` ([text](https://raw.githubusercontent.com/geiger-rs/cargo-geiger/geiger-0.14.0/cargo-geiger/LICENSE-MIT)). LICENSE-APACHE sha256 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`. License-text hashes, not the crate checksum. Third-party notices not enumerated.
- **Use:** After a source build, the primary command is `cargo geiger`: a scan via host cargo/rustc. `--offline` and `--frozen` exist and are not the default.
- **Output/exits:** Scan lines go to stdout, or `--update-readme` writes `./README.md`. Help and version return Ok. A virtual manifest and `warning_count>0` exit 1. cargo 0.96.0 `exit_with_error` uses `CliError.exit_code`; clap exits 1 if `use_stderr` else 0. `parse_args().unwrap()` can panic. Other codes and the JSON schema were not enumerated.
- **Effects:** Config: frozen, locked, and offline are passed into cargo `configure`. Network: not closed-offline; `network_allowed` is false only for `--frozen` or `--offline`; hosts are not a closed set. Children: host cargo/rustc; `scan()` rustc argv unread. Writes: stdout or README. Cargo/rustc cache, build, and target writes are not a closed set.
- **Limits:** Source-build only. Schema, rustc argv, hostnames, and write set unread. Not lane, offline, or redistribution approval.

Sources: [main.rs](https://github.com/geiger-rs/cargo-geiger/blob/geiger-0.14.0/cargo-geiger/src/main.rs), [network_allowed](https://github.com/rust-lang/cargo/blob/0.96.0/src/cargo/util/context/mod.rs).

## cargo-machete 0.9.2

- **Artifact:** Selected publisher digest `sha256:63e28fee386d82d33f2d12406c857f98e2d4697f3f7df7f71f34dff07fca0fde` for `cargo-machete-v0.9.2-aarch64-apple-darwin.tar.gz` (sidecar, not a local rehash). Other official arch assets exist; members were not extracted. crates.io cksum `0f134a108e6c4080e558e32421cb85c064da766937fdb5d50dfa57458edc6678` is the source crate, not that asset digest.
- **License:** `MIT` only, not dual-licensed. LICENSE.md sha256 `ad3e20ec34bdea16d997bb9a32f667d04f32010e333652b332fc19d14b14998f` ([text](https://raw.githubusercontent.com/bnjbvr/cargo-machete/v0.9.2/LICENSE.md)). License-text hash, not the asset or crate hash. Dependency notices not enumerated.
- **Use:** Primary command is `cargo machete` with no paths, which scans `.` for unused dependencies. That argv does not set `--with-metadata`.
- **Output/exits:** Human text, not a schema. Unused deps are listed; none prints that none were found. `--version` exits 0. Scan exit is 0 if none unused, 1 if some are, 2 on error. Status lines go to stderr.
- **Effects:** Config: reads `cargo-machete` ignored metadata. Network: the selected argv is a local walk with no HTTP client. Not a claim that `--with-metadata` is offline. Children: selected argv spawns none. `--with-metadata` (not selected) runs `cargo metadata` without `--offline`. Writes: selected argv writes nothing; `--fix` rewrites `Cargo.toml`.
- **Limits:** Tarball members and `--with-metadata` endpoints unread. Not offline, noexec, or redistribution approval.

Sources: [main.rs](https://github.com/bnjbvr/cargo-machete/blob/v0.9.2/src/main.rs), [v0.9.2](https://github.com/bnjbvr/cargo-machete/releases/tag/v0.9.2).

## clippy rust 1.99.1 component clippy-preview

- **Artifact:** Selected `clippy-1.99.1-x86_64-unknown-linux-gnu.tar.xz` (5254436 bytes), sha256 `458339712a058e52cc4522ff9ef8b59cd1ea1340312216cd94194c464a3f6dc5`, matching publisher channel `xz_hash`. Bins: `cargo-clippy` and `clippy-driver`. Component version `0.1.99`; commit `58cf8f9c35b355199727627d07ae34a4e2846d67`. No separate clippy CLI. aarch64 not selected.
- **License:** `MIT OR Apache-2.0`. LICENSE-MIT sha256 `8d07f0c9c9966be0aaec4196d7863b56ade114e9714dbc31ebba576c0446d2fc` ([text](https://raw.githubusercontent.com/rust-lang/rust/1.99.1/src/tools/clippy/LICENSE-MIT)); LICENSE-APACHE sha256 `d8b56cd45661bfc7ccf4ce5722388cab275f9dabb9e471c922cc80e36bbf9caa`. Those match component members. Repo-root license hashes differ and are not these texts. License hashes are not the tarball hash. Bundling-not-qualified.
- **Use:** Primary command is `cargo clippy` from this component: lint user Rust by running cargo, which runs build scripts and rustc. `CLIPPY_ARGS` and `RUSTC_WORKSPACE_WRAPPER=clippy-driver` apply. `--fix` selects cargo `fix`.
- **Output/exits:** Default stdout is cargo human text, not a JSON envelope. Forwarded Json with `render_diagnostics` false emits `compiler-message` whose `message` is the rustc JSON object, not always byte-identical. Help/version return, or exit 1 if the write fails. `--explain` exits 0 or 1. Otherwise the exit is cargo's status, or `-1` if none.
- **Effects:** Config: `CLIPPY_ARGS`, then cargo check/fix config. Network: clippy names no hosts; `network_allowed` is false only for `--frozen` or `--offline`. Without them, arbitrary network/trust is inherent, including plugins. Children: `cargo check` or `cargo fix`, which invokes `clippy-driver`. Writes: clippy main writes no files; cargo build or `--fix` paths were not enumerated.
- **Limits:** Write paths and third-party notices unread. Not lane, noexec, offline, or redistribution approval.

Sources: [tarball](https://static.rust-lang.org/dist/2026-10-15/clippy-1.99.1-x86_64-unknown-linux-gnu.tar.xz), [main.rs](https://github.com/rust-lang/rust/blob/1.99.1/src/tools/clippy/src/main.rs).

## clippy-sarif 0.8.0

- **Artifact:** Selected crates.io crate `clippy-sarif-0.8.0.crate` (10650 bytes). Computed sha256 `596c5b6c39c8395a7cc71e77ad8e89c48f4f6fa1e65a509c10bc79eaa03c7191` matches the publisher checksum. Publisher `psastras`. Source-build only (cargo plus a trusted toolchain). GitHub release bins have digest null and were not selected. No native binary is asserted.
- **License:** `MIT`. Named repo-root text sha256 `a17a2e4fd30568fdf592fd12760d64ab2db6922d313a93fb64b62ca3a1a89f07` ([LICENSE](https://raw.githubusercontent.com/psastras/sarif-rs/clippy-sarif-v0.8.0/LICENSE)). Crate member `LICENSE` is that MIT text, not a symlink. Symlink `../LICENSE` (sha256 `1e881ecf2862d01e6e5bc2b861e46886d2a6fb01499c0c508a209a7271b13cf2`) is only raw `clippy-sarif/LICENSE`. License hash is not the crate checksum. Dependency notices not qualified.
- **Use:** Primary purpose is conversion, not linting and not running the project. After source build: `clippy-sarif`, reading stdin or `-i`, writing stdout or `-o`. Expected input is `cargo clippy --message-format=json`.
- **Output/exits:** Pretty-printed SARIF JSON from cargo `CompilerMessage` records. SARIF keys were not enumerated. Success is `ExitCode::SUCCESS`. `Err` prints `Error:` to stderr and reports `FAILURE`. libc 0.2.189 defines those as 0 and 1; that libc sha256 `3eaf3ede3fee6db1a4c2ee091bf8a8b4dccdc6d17f656fb07896ee72867612f2` is locally computed, not a published digest. Not a measured process exit. clap parse-failure exit unread.
- **Effects:** Config: only `-i`/`-o`; no plugin loader. Network: none on the conversion path. Install would network; that is not this command. Children: none. Writes: stdout, or `File::create` (truncate) of `-o`.
- **Limits:** Source-build only. GitHub bins not selected. Not target execution, lane, noexec, offline, or redistribution approval.

Sources: [crate](https://static.crates.io/crates/clippy-sarif/clippy-sarif-0.8.0.crate), [MIT text](https://raw.githubusercontent.com/psastras/sarif-rs/clippy-sarif-v0.8.0/LICENSE).

## cargo-semver-checks 0.51.0

- **Artifact:** Selected `cargo-semver-checks-x86_64-unknown-linux-musl.tar.gz`, locally rehashed sha256 `396c8508d973c83de52660943a057e971b586f7511c3ba695762373452b43d5b` (publisher sidecar comparison not stated). One member: `cargo-semver-checks`. crates.io cksum `484e65e62077aed1a119d04ab414038d20b9013302b7353487ff69a461842bf8` is the source crate, not this binary. Other arches not selected.
- **License:** `Apache-2.0 OR MIT`. LICENSE-MIT sha256 `23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3` ([text](https://raw.githubusercontent.com/obi1kenobi/cargo-semver-checks/v0.51.0/LICENSE-MIT)). LICENSE-APACHE sha256 `91687e47b87fadb95cd01f7a85028c6ba4fab03bddb7269d581ae7dd43de5b03`. License hashes are not the tarball hash. Bundling-not-qualified.
- **Use:** Primary command is `cargo semver-checks` (`check-release`): compare a crate's public API with a baseline. Needs rustc, cargo, and rustdoc. Without a baseline flag, registry selection prefers the highest non-yanked non-prerelease version <= current, with fallback rules; it is not necessarily the latest. `cargo doc` sets `RUSTC_BOOTSTRAP=1`.
- **Output/exits:** Human pass/fail/warn/skip summary, plus `--- failure {id} ---` or `--- warning {id} ---` blocks. Exit 0 on success, 100 on lint failure, 101 on witness or completion errors. `--list`, `--explain`, and `--bugreport` exit 0.
- **Effects:** Config: `CARGO_TERM_COLOR` and cargo/rustdoc flags, including forced JSON rustdoc options. Network: default baseline uses the crates.io sparse index and downloads a crate; cargo resolution is arbitrary network/trust, not a fixed host list. Children: `cargo doc`, `cargo metadata`, and `cargo update` on a placeholder; rustc and rustdoc are probed. Writes: rustdoc under the cargo target dir or a `cargo-semver-checks` cache, plus the placeholder manifest.
- **Limits:** Default path needs network and rustc/cargo/rustdoc. Third-party terms unread. Not offline or redistribution approval.

Sources: [main.rs](https://github.com/obi1kenobi/cargo-semver-checks/blob/v0.51.0/src/main.rs), [tarball](https://github.com/obi1kenobi/cargo-semver-checks/releases/download/v0.51.0/cargo-semver-checks-x86_64-unknown-linux-musl.tar.gz).

## Miri 0.1.0-nightly (channel 2026-11-12, rustc 3ef0c22cdb86ac42dc6b8f0f1ec36857daa6f2a1)

- **Artifact:** Nightly component only. Stable 1.99.1 `miri-preview` is empty and unavailable. Selected xz locally rehashed sha256 `43883c70310046aaec466d4d11fd1554d0069ba0ec8e9ff89b208245567f50db`, matching publisher `xz_hash`. gz hash not rehashed: `624428ed179165f21b88800e162876e0ee802ac11c17d73e9471e474972a2824`. Bins: `miri`, `cargo-miri`. Cosign not claimed.
- **License:** `MIT OR Apache-2.0`. LICENSE-MIT sha256 `23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3` ([text](https://raw.githubusercontent.com/rust-lang/rust/3ef0c22cdb86ac42dc6b8f0f1ec36857daa6f2a1/src/tools/miri/LICENSE-MIT)). LICENSE-APACHE sha256 `62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a`. License hashes, not the tarball hash. Dependency closure unread. Bundling-not-qualified.
- **Use:** Primary command is `cargo miri`, not direct `miri`: interpret Rust under UB checks. Needs this nightly component. Missing `rust-src` may prompt and run `rustup component add rust-src` unless `cargo miri setup` or CI.
- **Output/exits:** rustc text, not SARIF or Miri JSON. Exit 0 only if the program exit is 0 and there is no leak/UB; otherwise that i32, or 1 for UB/interpreter errors. Unix runner exec-replaces into `miri`. cargo's failed-test remap unread.
- **Effects:** Config: `MIRIFLAGS`; default isolation fakes RNG/env/clocks and blocks interpreted networking. `-Zmiri-disable-isolation` and `-Zmiri-native-lib` are not a sandbox. `MIRI_BE_RUSTC=host` runs build scripts as host code. Network: do not claim none. Isolation blocks interpreted networking; rustup and exec'd cargo can fetch. Children: cargo, rustup, miri, rustdoc. Writes: `MIRI_SYSROOT` or the `org.rust-lang.miri` cache, plus cargo outputs. `clean` deletes that cache unless `MIRI_SYSROOT` is set.
- **Limits:** Not a 1.99.1 component. First-run `rust-src` prompt unless setup or CI. Not lane, noexec, offline, or redistribution approval.

Sources: [component](https://static.rust-lang.org/dist/2026-11-12/miri-nightly-x86_64-unknown-linux-gnu.tar.xz), [README](https://raw.githubusercontent.com/rust-lang/rust/3ef0c22cdb86ac42dc6b8f0f1ec36857daa6f2a1/src/tools/miri/README.md).

## cargo-careful 0.4.10

- **Artifact:** Selected ELF `cargo-careful-x86_64-unknown-linux-musl` (1200888 bytes). Publisher digest `sha256:bd0937ba41dec5ba45ca7cb9c502060fbcf625d12f5cf8d0b0c47328b4d82ac4`; local sha256 matches. static-pie x86-64. No aarch64 asset; no signature. crates.io checksum `f4ad93ccd2f40ff26048e7226003a719d83d8969e273d2d9d4630db7c4fbf4b2` is the source crate, not the ELF.
- **License:** `MIT OR Apache-2.0`. LICENSE-MIT sha256 `23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3` ([text](https://raw.githubusercontent.com/RalfJung/cargo-careful/v0.4.10/LICENSE-MIT)). LICENSE-APACHE sha256 `62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a`. License hashes, not the ELF digest. ELF notices unread.
- **Use:** Primary command is `cargo +nightly careful test` (`cargo-careful careful`): rebuild std with extra UB checks, then run the user's cargo subcommand. Needs nightly rustc, cargo, and `rust-src` or `RUST_LIB_SRC`. Selected file is Linux x86-64 only.
- **Output/exits:** No schema of its own; stderr is progress text. Final cargo inherits stdio. Bad argv and rustup failure exit 1. `setup` returns success. Other subcommands exec cargo, so a failing test's code is cargo's, unread here.
- **Effects:** Config: `CARGO`, `RUSTC`, `RUST_LIB_SRC`, and rustflags; always adds debug-assertions and `--cfg careful`. Network: no hardcoded URL, and none is not safe. Missing sources run `rustup component add rust-src`; sysroot cargo does not pass `--offline`. Children: rustc, cargo, and rustup. Writes: Linux `$XDG_CACHE_HOME/cargo-careful` or `$HOME/.cache/cargo-careful`, plus the project target dir.
- **Limits:** x86-64 Linux ELF only. Executes the user's cargo subcommand. ELF notices unread. Not noexec, offline, or redistribution approval.

Sources: [ELF](https://github.com/RalfJung/cargo-careful/releases/download/v0.4.10/cargo-careful-x86_64-unknown-linux-musl), [main.rs](https://raw.githubusercontent.com/RalfJung/cargo-careful/v0.4.10/src/main.rs).

## loom 0.7.3

- **Artifact:** Library only. Release assets empty; no binary is claimed. crates.io publisher cksum `f1611ddbf89dc6ae42cfbd51fc207836140130257646eab8d6d2fb16577db2d2` (not a stated local rehash, and not a license hash).
- **License:** `MIT`. LICENSE sha256 `8ce0830173fdac609dfb4ea603fdc002c2f4af0dc9b1a005653f5da9cf534b18` ([text](https://raw.githubusercontent.com/tokio-rs/loom/v0.7.3/LICENSE)). License-text hash, not the crate checksum.
- **Use:** No CLI and no binary. Primary use is library `loom::model(|| { ... })` inside a test. Prerequisite: a harness such as `cargo test`, with `RUSTFLAGS=--cfg loom`. That cfg recipe is not fully specified here.
- **Output/exits:** Success logs `Completed in N iterations` and returns. Failure is a panic printed by the harness. Loom does not call `process::exit`. A successful test exits 0; a panic is a nonzero harness failure. Diagnostic schema unread.
- **Effects:** Config: `LOOM_MAX_BRANCHES`, `LOOM_MAX_PERMUTATIONS`, `LOOM_MAX_DURATION`, `LOOM_MAX_PREEMPTIONS`, and `LOOM_LOG`. Invalid values panic. Network: no HTTP client. The user closure can do arbitrary I/O; not claimed offline for user code. Children: in-process threads only; no subprocess. Writes: default `model()` does not write. Feature `checkpoint` can `File::create` a JSON path; the README example does not.
- **Limits:** Harness formatting and the `cfg loom` recipe unread. Not a binary or a linter CLI. Not noexec, offline, or redistribution approval.

Sources: [model.rs](https://github.com/tokio-rs/loom/blob/v0.7.3/src/model.rs), [README](https://github.com/tokio-rs/loom/blob/v0.7.3/README.md).
