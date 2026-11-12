# Q1 infra source facts — 2

Future-tool source facts only. Not a runtime, execution lane, bundling, no-exec, offline, or redistribution clearance. Trust stays open where the facts leave it open. Four tools; no architecture is selected unless the facts select one.

## Foundry v1.9.0

- **Artifact:** Per-asset `.sha256`, no `checksums.txt`. Arch unset. `foundry_v1.9.0_darwin_arm64.tar.gz` publisher `sha256:38f9af72b266c38ce2e4dfc659ae9cbd1f78c01b34738a76b6c4cb9610579426` (not local rehash, not chosen). foundryup/nightlies and archive members unreproven.
- **License:** MIT OR Apache-2.0. LICENSE-MIT text SHA-256 `a0ccf03ff91b5d7e23800026051ddc61fefdbd6a832b4ad253d2aa9d647c78e3` (not the archive). https://raw.githubusercontent.com/foundry-rs/foundry/v1.9.0/LICENSE-MIT Apache https://raw.githubusercontent.com/foundry-rs/foundry/v1.9.0/LICENSE-APACHE SHA-256 `5c7f173199fd7fb3cc83d86d24f3541e8ae0cb8c16e912ca519ed6a1435bd8f3`. Cargo.toml v1.9.0 sets that expression and version; forge inherits it.
- **Use:** `forge test` (same command as `forge test --rerun`). Needs Solidity plus solc; svm-solc may fetch a missing compiler (call site unproven).
- **Output/exits:** Human stdout has [PASS]/[FAIL] suite results; JSON/JUnit replace it. Err exits 1; Ok is 0. `--allow-failure` or zero failures stay 0, else 1 (quiet/json/junit skip the failing-tests block). Zero matches warn, exit 0, unless compile/setup failed. Mutation cancel and interactive `--debug` Ctrl-C exit 130.
- **Effects:** Config: merges foundry config (build, evm); inline network annotations can add passes; fuzz/invariant keys exist; inventory untaken. Network: not offline; `--no-network` off unless passed; fork may attach Etherscan trace id unless `--gas-report`; `ETHERSCAN_API_KEY` field; unforked eth_rpc unread. Children: in-process EVM runs user tests (not no-exec); `--symbolic` solver; tokio process dependency. Writes: not no-write — snapshots, `--json-file`, cache flamegraphs, profile json, SolDB, corpus/frontier, invariant failures, symbolic artifacts, `--showmap-out`, mutation workspace; default cache/build paths unenumerated; `--allow-failure` does not suppress writes.
- **Limits:** Example digest is not the selected binary. Unverified: local rehash, foundryup/nightlies, default eth_rpc, vm.ffi/cheatcode bodies, solc download, default cache paths, tarball membership. No redistribution or offline clearance.

Sources: https://github.com/foundry-rs/foundry/releases/tag/v1.9.0 · https://github.com/foundry-rs/foundry/releases/download/v1.9.0/foundry_v1.9.0_darwin_arm64.sha256 · https://github.com/foundry-rs/foundry/blob/v1.9.0/crates/forge/bin/main.rs · https://github.com/foundry-rs/foundry/blob/v1.9.0/crates/forge/src/result.rs · https://github.com/foundry-rs/foundry/blob/v1.9.0/crates/forge/src/cmd/test/mod.rs

## Conftest v0.71.1

- **Artifact:** `checksums.txt` publisher SHA-256 `5e5d7e2c0e88b3437cb659a921e0b88e997e4e0a49d01be52a9569136f01dbf9`. Example `conftest_0.71.1_Darwin_arm64.tar.gz` publisher SHA-256 `e1cc50d2590b6c5e3da6912666a71264bae82d60bdd62d7ae2b99971ccc8eedd` (not a local rehash; arch unset). Published 2026-10-06.
- **License:** Apache-2.0. Primary tag LICENSE is a 645-byte notice, text SHA-256 `a3fc6a99a82b59b761a6b1aabe8fc540b7046d5f91377fc1d8897dbbf3bd18ac` (not checksums.txt or the tarball). https://raw.githubusercontent.com/open-policy-agent/conftest/v0.71.1/LICENSE Points at Apache LICENSE-2.0; fetched text SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`. OPA is a linked Apache-2.0 dependency.
- **Use:** `conftest test -p policy <file>`.
- **Output/exits:** Per-file successes, warnings, and failures. `-o json` emits a JSON array. Failure exits 1, else 0. Fail-on-warn: 2 on failure, 1 on warning only, else 0. `os.Exit` unless `--no-fail`.
- **Effects:** Config: flags, env, or a viper config file; full wiring unverified. Network: `test --update` downloads policies, including OCI; `--tls` is a registry option. Download/push/pull can contact remote stores. Local files do not prove offline. Children: plugin process execution and exit propagation unqualified (`cmd/plugin.go` is installation only). No closed child set. Writes: test does not modify inputs; download commands write policies.
- **Limits:** Example tarball is not the selected binary. Plugin execution/exit and full viper wiring remain untraced. No redistribution or offline claim.

Sources: https://github.com/open-policy-agent/conftest/releases/tag/v0.71.1 · https://github.com/open-policy-agent/conftest/releases/download/v0.71.1/checksums.txt · https://github.com/open-policy-agent/conftest/blob/v0.71.1/output/result.go · https://raw.githubusercontent.com/open-policy-agent/conftest/v0.71.1/LICENSE

## ScanCode 32.5.0

- **Artifact:** Selected dist is the PyPI wheel, not the GitHub app bundle, and not a standalone binary. `scancode_toolkit-32.5.0-cp310-none-any.whl` publisher SHA-256 `b73eac8ae8aecff583d8eed79e1cb4270559c99938bb29ec08c96f2f417b420b` (not a local rehash). Native deps may need a C toolchain at install; that is not a bundle checksum.
- **License:** Publisher field: Apache-2.0 AND CC-BY-4.0 AND LicenseRef-scancode-other-permissive AND LicenseRef-scancode-other-copyleft (.ABOUT closure not inventoried). Primary apache-2.0.LICENSE text SHA-256 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` (that file only, not the wheel). https://raw.githubusercontent.com/aboutcode-org/scancode-toolkit/v32.5.0/apache-2.0.LICENSE NOTICE: Apache-2.0 AND CC-BY-4.0 for software and data; third-party permissive and copyleft licences live only in unreviewed per-package .ABOUT files. Not a redistribution approval.
- **Use:** `scancode --license --json-pp OUT.json INPUT`.
- **Output/exits:** Pretty JSON (headers, files, license_detections) to the named file. HTML/CSV are other plugins. Progress/summary on stderr unless `--quiet`. Success exits 0, else 1 (`ctx.exit`). UsageError and ScancodeError also exit via click.
- **Effects:** Config: none required. Network: `--check-version` defaults true; can GET `https://pypi.org/pypi/scancode-toolkit/json` weekly. Version check, not a licence-index update. Not offline-qualified. Children: process pool (`-n`); libmagic and typecode load in-process. Writes: named JSON, version-check cache, temp dir, and an on-disk cache above max-in-memory 10000. Inputs not rewritten by this path.
- **Limits:** No standalone binary. App-bundle digest not selected. Third-party .ABOUT set not reviewed. C-toolchain need is not a checksum. Not redistribution or offline clearance.

Sources: https://pypi.org/pypi/scancode-toolkit/32.5.0/json · https://github.com/aboutcode-org/scancode-toolkit/blob/v32.5.0/NOTICE · https://github.com/aboutcode-org/scancode-toolkit/blob/v32.5.0/src/scancode/cli.py

## REUSE 6.2.0

- **Artifact:** PyPI `reuse` 6.2.0 sdist publisher SHA-256 `4feae057a2334c9a513e6933cdb9be819d8b822f3b5b435a36138bd218897d23`. Wheels are platform-tagged (example manylinux x86_64 cp310 SHA-256 `12b68549bb9d5f4957f06d726a83a9780628810008fb732bb0d0f21607f8c6d6`). No single upstream native binary. Python>=3.10. Pin is the requested tag, not a newer release.
- **License:** Apache-2.0 AND CC0-1.0 AND CC-BY-SA-4.0 AND GPL-3.0-or-later (PyPI composite). Primary GPL-3.0-or-later text SHA-256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986` (licence text, not the sdist). https://raw.githubusercontent.com/fsfe/reuse-tool/v6.2.0/LICENSES/GPL-3.0-or-later.txt Tag texts hashed locally from fetched bytes, not a published checksum: Apache-2.0 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`; CC-BY-SA-4.0 `7abe19ec9bb73b36141b999b861d24ad855e808bafe0f81e84cce28556f6c297`; CC0-1.0 `a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499`.
- **Use:** Listed: `reuse lint` (`--json`, `--lines`); `reuse lint-file FILE`; `reuse spdx`; `reuse annotate`; `reuse download`. Lint is the exit fact below; other exits are unknown.
- **Output/exits:** Human lint summary, or JSON with `--json`. Compliant run prints a congratulations line for spec 3.3. `sys.exit(0 if report.is_compliant else 1)`.
- **Effects:** Config: `REUSE.toml` and `LICENSES/`. Network: lint is local; download fetches licence texts. Children: `python-magic>=0.4.12` declared; libmagic optional, slower detector if absent. charset-normalizer and chardet are optional extras, not default encoders. No `REUSE_ENCODING_MODULE` contract. Writes: lint is read-only; annotate rewrites files; download writes `LICENSES/`.
- **Limits:** No standalone binary. Example wheel is not selected. Licence hashes are local tag fetches, not publisher checksums. Other subcommand exits unknown. Composite expression is not a redistribution approval.

Sources: https://pypi.org/pypi/reuse/6.2.0/json · https://raw.githubusercontent.com/fsfe/reuse-tool/v6.2.0/src/reuse/cli/lint.py · https://raw.githubusercontent.com/fsfe/reuse-tool/v6.2.0/LICENSES/Apache-2.0.txt
