# Oxlint 1.91.0 source facts

This note records findings from the `oxlint_v1.91.0` release and the source commit resolved from that tag, `f3fcdcc61b08e9880476279ba21a363967940fa4`. It documents the pinned native provisioning input only; it does not claim that Oxlint is integrated as a Lucy analyzer.

## Verified identity and artifacts

- The tag resolves directly to commit `f3fcdcc61b08e9880476279ba21a363967940fa4` in `oxc-project/oxc`.
- The tag's root `LICENSE` is MIT. Downloaded bytes have SHA-256 `95ced5ecf1133fbf41d409b5555c86c344f83f3b019926057ddbc07cfdcc27b3`; the same bytes are pinned as the exact notice.
- Each release archive was downloaded and hashed independently. The archive member lists were inspected; each contains only the named executable used by the pack. See `packages/core/test/review-toolkit/oxlint-pin.test.ts` for literal target, URL, SRI digest, extraction path, and notice pins.
- The macOS ARM64 binary declares `LC_BUILD_VERSION` minimum macOS 11.0; macOS x64 declares `LC_VERSION_MIN_MACOSX` 10.12. Linux ARM64 is an ELF statically linked executable; Linux x64 is an ELF static PIE. The Linux release targets are musl, avoiding an inferred glibc floor. Windows asset is a PE executable; no Windows runtime floor was measured here. PE runtime behavior is not qualified by this static inspection.

## Behavior supported by tagged source

The checked source is under `apps/oxlint/src` and `crates/oxc_linter/src` at the immutable commit above. The linter supports JavaScript and TypeScript. Its configuration model includes built-in plugin selection and external JS plugins (`crates/oxc_linter/src/config/oxlintrc.rs`); therefore a future invocation must deliberately prevent project configuration or plugin loading if the intended contract is no project plugins. The configuration source documents `--type-aware` as enabling type-aware linting and has type-aware configuration (`options.typeAware`); type-aware mode must remain off for a no-build/no-typecheck run. This pin records no arguments and registers no runtime command.

The following facts are **source-verified** against commit `f3fcdcc61b08e9880476279ba21a363967940fa4`, not runtime-tested against the release executable.

### Isolation and no-build lane

- CLI `--config PATH` selects a specific config. Its source help says that absent this option the CLI looks in the current working directory for `.oxlintrc.json`, `.oxlintrc.jsonc`, `oxlint.config.ts`, or `oxlint.config.mts` (`apps/oxlint/src/command/lint.rs`, `BasicOptions`). In `apps/oxlint/src/lint.rs`, a provided `--config` sets `basic_options.config.is_some()`, which makes `search_for_nested_configs` false; `ConfigLoader::load_root_and_nested` still loads the selected root config. There is no CLI `--no-config` switch in this tag.
- Thus the source-proven route to avoid project config is a host-controlled JSON config with no `extends`/JS config/plugin references, passed with `--config <controlled-json-config>`, plus `--disable-nested-config`. A JSON config file supports the built-in config format; JS/TS config is separately described as experimental and Node-dependent. The explicit config's contents remain a host responsibility and should not be sourced from the repository being analyzed.
- The native CLI entrypoint constructs `CliRunner::new(command, None)` and explicitly comments “Run without external linter (no JS plugins)” (`apps/oxlint/src/main.rs`, `main`). The embedded native executable therefore has no external JS plugin host. Config can still enable built-in Rust plugins; no build is required to run the native executable.
- `--type-aware` is a switch, false unless passed; `--type-check` is a separate switch and requires type-aware mode (`apps/oxlint/src/command/lint.rs`, `LintCommand`; `apps/oxlint/src/lint.rs`). Omit both for the no-build/no-typecheck lane. This does not establish behavior against `tsconfig` or generated project files at runtime.
- `--no-ignore` disables Oxlint's `.eslintignore`, `--ignore-path`, and `--ignore-pattern` filtering (`apps/oxlint/src/command/ignore.rs`, `NO_IGNORE_HELP`; `apps/oxlint/src/lint.rs`). It does **not** disable repository Git ignore processing: `WalkBuilder` always uses `.gitignore` and `$GIT_COMMON_DIR/info/exclude` through `oxc_config::configure_walk_builder`, and the linter explicitly applies a Git-ignore walk-root check regardless of `--no-ignore` (`apps/oxlint/src/lint.rs`; `crates/oxc_config/src/walk.rs`). Consequently a completely ignore-independent traversal cannot be promised by these flags. Supplying explicit files narrows discovery but does not prove all Git-ignore edge cases absent.

### Report and exit contract in source

- `--format json` emits a JSON object with `diagnostics` plus summary fields `number_of_files`, `number_of_rules`, `threads_count`, and `start_time` (`apps/oxlint/src/output_formatter/json.rs`, `lint_command_info`). Each diagnostic row is produced by `JSONReportHandler`: `message`; optional `code`, `url`, `help`, `note`, and `filename`; `severity` (`error`, `warning`, or `advice`); and `labels[]` whose rows have optional `label` and `span` (`offset`, `length`, and 1-based `line`/`column`, or null positions) (`crates/oxc_diagnostics/src/handlers/json.rs`, `render_report`). This formatter does not add a separate rule category field.
- `--format sarif` emits SARIF 2.1.0 (`apps/oxlint/src/output_formatter/sarif.rs`). Rule diagnostics appear in `runs[0].results[]` with `ruleId`, optional `ruleIndex`, `level` (`error`, `warning`, or `note`), `message.text`, and optional `locations[].physicalLocation.artifactLocation.uri`/`index` and `region` (`startLine`, `startColumn`, `endLine`, `endColumn`). Rule descriptors carry category/plugin/fix in `properties`; non-rule diagnostics with a source location use synthetic rule `OXL0001`, while configuration/execution diagnostics without a location are notifications under `OXL0999`. These JSON/SARIF shapes and location conventions are source-verified, not verified against a live release run.
- `CliRunResult::report` maps `LintSucceeded` to exit 0 and `LintFoundErrors`, `LintNoFilesFound`, `LintNoWarningsAllowed`, `LintMaxWarningsExceeded`, invalid config/options, plugin-workspace setup failure, unpruned suppressions, and TS-Go lint errors to failure (nonzero) (`apps/oxlint/src/result.rs`). `--deny-warnings` makes warnings nonzero; warnings otherwise do not imply failure. This enumerates source meanings, not all process-level failure modes or platform behavior.

### Native qualification boundary

Release assets were downloaded and statically inspected for the prior provisioning pin without executing them. The later scoped qualification below covers only its controlled native fixtures, not general configuration, ignore, plugin or repository behavior. Neither stage delivers a Lucy analyzer.

### Scoped native qualification

CI `42137781464` ran the pinned executable on Ubuntu 24.04 x64 through production confinement and the spawner at `88f273992095b0a5f47c1956cfb33abcab3847f9`; exact-head Core typecheck `42137782434` passed. The controlled invocation used an explicit host JSON config enabling `no-debugger`, disabled nested config discovery, selected SARIF, and passed explicit nested fixture paths. Malformed root and nested project configs were bypassed; fixture bytes and modes were preserved.

The clean fixture emitted empty SARIF and exit 0. The broken fixture emitted `eslint(no-debugger)` at `nested/broken.js:1` and exit 1. Both scans had empty stderr. These raw bytes and complete uploaded-source identity were reconciled. This verifies the tagged-source `plugin(rule)` spelling and Linux failure status for these fixtures; it does not qualify every rule or failure path.

`--no-ignore` is not claimed to disable Git ignore processing; these fixtures contain no `.gitignore`. Other repository, plugin and ignore behavior, analyzer integration, and macOS/Linux ARM64/Windows runtime behavior remain unqualified. Non-Linux conformance tests are explicitly skipped, not counted as native passes.

## Sources

- Tag ref: <https://api.github.com/repos/oxc-project/oxc/git/ref/tags/oxlint_v1.91.0>
- Immutable source: <https://github.com/oxc-project/oxc/tree/f3fcdcc61b08e9880476279ba21a363967940fa4/apps/oxlint/src>
- CLI flags: <https://github.com/oxc-project/oxc/blob/f3fcdcc61b08e9880476279ba21a363967940fa4/apps/oxlint/src/command/lint.rs>
- Ignore flags: <https://github.com/oxc-project/oxc/blob/f3fcdcc61b08e9880476279ba21a363967940fa4/apps/oxlint/src/command/ignore.rs>
- Native CLI plugin boundary: <https://github.com/oxc-project/oxc/blob/f3fcdcc61b08e9880476279ba21a363967940fa4/apps/oxlint/src/main.rs>
- Traversal and config: <https://github.com/oxc-project/oxc/blob/f3fcdcc61b08e9880476279ba21a363967940fa4/apps/oxlint/src/lint.rs>
- Git ignore policy: <https://github.com/oxc-project/oxc/blob/f3fcdcc61b08e9880476279ba21a363967940fa4/crates/oxc_config/src/walk.rs>
- JSON formatter: <https://github.com/oxc-project/oxc/blob/f3fcdcc61b08e9880476279ba21a363967940fa4/apps/oxlint/src/output_formatter/json.rs>
- JSON diagnostic rows: <https://github.com/oxc-project/oxc/blob/f3fcdcc61b08e9880476279ba21a363967940fa4/crates/oxc_diagnostics/src/handlers/json.rs>
- SARIF formatter: <https://github.com/oxc-project/oxc/blob/f3fcdcc61b08e9880476279ba21a363967940fa4/apps/oxlint/src/output_formatter/sarif.rs>
- Exit mapping: <https://github.com/oxc-project/oxc/blob/f3fcdcc61b08e9880476279ba21a363967940fa4/apps/oxlint/src/result.rs>
- Config model: <https://github.com/oxc-project/oxc/blob/f3fcdcc61b08e9880476279ba21a363967940fa4/crates/oxc_linter/src/config/oxlintrc.rs>
- License: <https://raw.githubusercontent.com/oxc-project/oxc/f3fcdcc61b08e9880476279ba21a363967940fa4/LICENSE>
- Release assets: <https://github.com/oxc-project/oxc/releases/tag/oxlint_v1.91.0>
