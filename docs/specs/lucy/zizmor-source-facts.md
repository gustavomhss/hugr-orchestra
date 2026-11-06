# zizmor 1.32.0 source facts

Source inspected at immutable source commit `21bd300700d43d9ba04b0c1fce72a89391ac80b4` (tag `v1.32.0`). These are source-derived facts, not runtime qualification.

- **Offline behavior (verified):** `--offline` requests only offline operations; `--offline-audits` is explicitly weaker and only limits audits. The CLI source documents both. Static source inspection does not prove absence of every possible network side effect at runtime.
- **Configuration (verified):** `--no-config` disables loading; `--config <file>` selects a global config. Discovery searches repository-relative `.github/zizmor.yml`, `.github/zizmor.yaml`, `zizmor.yml`, and `zizmor.yaml` with precedence described in `crates/zizmor/src/config/mod.rs`.
- **Ignores (verified):** configuration supports per-rule ignore rules; `--no-ignores` disables ignore comments and configured ignore rules. Collection normally respects `.gitignore`, except `all` mode.
- **Output (verified):** CLI supports default plain diagnostics plus JSON v1, SARIF, and GitHub Actions workflow command formats.
- **Exit behavior (verified):** findings affect the result exit code unless `--no-exit-codes` is used or SARIF is selected. No-input errors use exit code 3; other handled errors return failure. No binary was executed for this qualification.
- **Release archives (verified):** downloaded archive SHA-256 values matched the five pins; archive entries are exactly `zizmor` for the four tarballs and `zizmor.exe` for the Windows zip. The tagged `LICENSE` is MIT and its immutable-commit content hash is pinned.
- **ABI (static header observation only):** Mach-O headers declare macOS 11.0 for arm64 and 26.1 for x86_64. ELF symbol-version scanning found GLIBC_2.34 for each Linux payload. Windows PE was not runtime-qualified. These measurements do not constitute runtime qualification; the exact `26.1` value is retained rather than rounded.

Source anchors: `crates/zizmor/src/cli.rs`, `main.rs`, and `config/mod.rs` at the commit above. No analyzer integration or runtime provisioning is claimed by this artifact pin.

## Scoped native qualification

CI `42137781464` ran the pinned executable on Ubuntu 24.04 x64 through the production confinement and spawner at `88f273992095b0a5f47c1956cfb33abcab3847f9`. Version, clean and broken fixtures passed; Core typecheck `42137782434` passed at that exact head. Full uploaded-source identity and raw output bytes were reconciled.

The clean fixture emitted empty SARIF and exit 0. The broken fixture emitted `zizmor/artipacked` and `zizmor/unpinned-uses`, also with exit 0. Both scans emitted informational stderr; nonempty stderr alone is therefore not a tool failure for this invocation. The malformed configuration files were bypassed, and selected fixture bytes and modes were preserved.

This qualifies these controlled fixtures only, not general repository isolation, invalid-workflow collection, all audit kinds, analyzer integration or other native targets. Non-Linux tests are explicitly skipped; macOS, Linux ARM64 and Windows runtime behavior remain unqualified.

## Preparation constraints from the pinned source

The complete `crates/zizmor/src` source was subsequently reconciled against the immutable Git tree, including the registry and audit metadata. `registry.rs:48–88` registers the audits; constructors skip `impostor-commit`, `ref-confusion`, `known-vulnerable-actions`, `ref-version-mismatch`, and `stale-action-refs` offline. `artipacked` and `typosquat-uses` retain local checks without an API client. The offline rule inventory is not coverage of the skipped online checks.

`finding.rs:34–52` and `registry.rs:166–186` make persona, severity, confidence and ignores explicit finding filters. The planned host invocation selects auditor, informational minimum severity, low minimum confidence, and no ignores; workflow-only collection takes explicit projected file paths. Repository config, ignore and lock files must not enter that projection.

`output/sarif.rs:166–169` writes the input identifier directly to the artifact URI; `crates/zizmor-sarif/src/lib.rs:149` stores it as a string. A literal percent escape could therefore alias another selected filename after URI decoding. Preparation must refuse `%`, `?` and `#` in selected relative paths rather than reinterpret report paths or rewrite source bytes. Spaces and Unicode are not excluded by that restriction.

`output/sarif.rs:14–32` emits informational findings as kind `review`, level `note`. The previously qualified parser admits failing diagnostics only. Informational report admission needs a separate source-bound extension and native qualification before claiming complete production scanner integration; it must not be hidden by raising the minimum severity.
