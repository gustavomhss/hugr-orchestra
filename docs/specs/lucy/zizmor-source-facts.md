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
