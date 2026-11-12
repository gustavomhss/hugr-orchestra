# Infrastructure fact qualification

Version-specific primary-source facts for six prospective integrations. Runtime integration and lane qualification remain pending. License-text hashes identify the named license file; artifact hashes identify the named distribution. Invocations below are upstream examples, not Orchestra review commands.

## shfmt v3.14.1

License expression: BSD-3-Clause. License-text SHA-256 `ce63850f77649f00d1394045e2794ffb09a5596beabac51c9548edd958845d7c` of the tagged `LICENSE` at <https://raw.githubusercontent.com/mvdan/sh/v3.14.1/LICENSE>. The tagged file is BSD-3-Clause. No third-party license file was fetched.

Distribution. No `checksums.txt` in the v3.14.1 tag tree (only `LICENSE`). The GitHub release API publishes per-asset digests. Example artifact SHA-256, not license-text: `shfmt_v3.14.1_darwin_arm64` `b7c872db63553ccffc7253aba3ed7d4885a27d83f1ba567b1138c6315a5847e5`; `shfmt_v3.14.1_linux_amd64` `76e77641faa025814b77f153b29796b8e6fa2fca03e0c76a691608b86c7ea7bf`. Also `go install mvdan.cc/sh/v3/cmd/shfmt@v3.14.1`. Architecture not selected. No single CLI artifact is pinned here.

Invocation examples: `shfmt [flags] [path...]`. Concrete forms from the frozen row: `shfmt -d .` (diff), `shfmt -l .` (list differing files), `shfmt -w` (write). `--version` prints the module version. Choosing architecture, printer flags, or `-w` remains a host choice.

Output. Default is formatted source on stdout. `-l` lists paths. `-d` prints a diff. Parse errors go to stderr. `--to-json` prints a typed syntax tree.

Exit. `cmd/shfmt/main.go` at v3.14.1: status starts at 0; a format mismatch (`errFormattingDiffers`) or a walk/parse error sets status 1; then `os.Exit(status)`. Flag misuse is `os.Exit(1)`. `--version` returns 0.

Effects.

- Network: none recorded for a local format. EditorConfig is local.
- Config: reads EditorConfig unless printer flags are set (man page).
- Children: none in the formatter path.
- Writes: `-w` overwrites input files. Otherwise stdout and stderr only.

Primary sources: [release API](https://api.github.com/repos/mvdan/sh/releases/tags/v3.14.1) (asset digests; no checksums file in the asset list), [LICENSE](https://raw.githubusercontent.com/mvdan/sh/v3.14.1/LICENSE), [cmd/shfmt/main.go](https://raw.githubusercontent.com/mvdan/sh/v3.14.1/cmd/shfmt/main.go) (argv and exit status).

## sqlfluff 4.5.0

License expression: MIT. License-text SHA-256 `22dce2dc3663d299ccc2606289647982d757e6157393081e59736a9db335c77f` of <https://raw.githubusercontent.com/sqlfluff/sqlfluff/4.5.0/LICENSE.md>. The PyPI license field repeats the MIT text. Optional extra `sqlfluffrs==4.5.0` is a separate package; its text is not this hash.

Distribution. Library constraint: the project publishes no native binary. Artifact SHA-256, not license-text: wheel `sqlfluff-4.5.0-py3-none-any.whl` `471a9abcad8061e36b69f711a6d89393241e30f9d1e0869f79965c0ae2c889c7`; sdist `0b0d5b2cca03e7d138b8d899249fed5fa54083e407bbd161449c0b30f901b7b8`. Requires Python >= 3.10. The CLI is that package's entry point, not a pinned executable.

Invocation examples: `sqlfluff lint PATH [--dialect ansi]`; `sqlfluff fix PATH`; `sqlfluff format PATH`; `sqlfluff version`. `PATH` may be a file, a directory, or `-` for stdin.

Output. Human lint report: file `FAIL` lines with rule codes, then a summary. Formats named in the frozen row are human and JSON.

Exit. `src/sqlfluff/cli/__init__.py`: `EXIT_SUCCESS=0`, `EXIT_FAIL=1`, `EXIT_ERROR=2`. Docs as recorded: 0 no issues; 1 issues or an unparsable file; 2 config or internal error. `--disable-progress` and `fix --force` behaviour is not fully quoted in the frozen row and is not filled in here.

Effects.

- Network: tagged `default_config.cfg` sets templater `jinja`. Tagged `jinja.py` has no HTTP client. `dbt` is a separate plugin, not the default. That does not prove every templater or plugin path is offline.
- Config: reads `.sqlfluff`, `pyproject`, or `setup.cfg` when present.
- Children: optional `sqlfluff[rs]` loads a native extension. No compiler child is recorded for plain lint.
- Writes: `lint` is read-only. `fix` and `format` rewrite SQL files unless stdout mode.

Primary sources: [PyPI 4.5.0 JSON](https://pypi.org/pypi/sqlfluff/4.5.0/json) (version, wheel digest, MIT text), [default_config.cfg](https://github.com/sqlfluff/sqlfluff/blob/4.5.0/src/sqlfluff/core/default_config.cfg) (default templater `jinja`), [cli/__init__.py](https://raw.githubusercontent.com/sqlfluff/sqlfluff/4.5.0/src/sqlfluff/cli/__init__.py) (0/1/2 constants).

## Trivy v0.76.2

License expression: Apache-2.0. License-text SHA-256 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` of <https://raw.githubusercontent.com/aquasecurity/trivy/v0.76.2/LICENSE>. The scanner classifies third-party licenses; that classification is output, not Trivy's own license. This note does not certify either.

Distribution. Official checksum file <https://github.com/aquasecurity/trivy/releases/download/v0.76.2/trivy_0.76.2_checksums.txt>. Example artifact SHA-256, not license-text: `trivy_0.76.2_Linux-64bit.tar.gz` `bc0fc726e017b8927a62b2d3531d7a84ee01769daf5c99ed866dced54089fdbf`. Also image `aquasec/trivy:0.76.2`; no image digest is in the frozen row. Architecture not selected.

Invocation examples: `trivy fs --scanners misconfig,secret,vuln <path>`; `trivy config <path>`; `trivy image <ref>`. Flags named in the row: `--exit-code N`, `--skip-version-check`, `--format json|table|sarif`. Skipping the update/telemetry request would require both `--skip-version-check` and `--disable-telemetry`; that pair is not a recorded host command. `--skip-db-update` is not a prepared-database mode.

Output. Table, or `--format json`, `sarif`, or `cyclonedx`. Default logs include DB update INFO lines. Findings are grouped by target.

Exit. `cmd/trivy/main.go` at v0.76.2: `*types.ExitError` exits with that code. Any other error, including a DB download failure returned from `pkg/commands/operation/operation.go`, hits `log.Fatal`, which `os.Exit(1)` (`pkg/log/logger.go`). `--exit-code` sets `ExitError` only when findings match. Default findings without that flag stay 0.

Effects.

- Network: the CLI exposes `--skip-db-update` (`db.skip-update`). Tagged `pkg/flag/db_flags.go` describes it as skipping vulnerability database updates. That flag alone is not a guarantee that a usable DB is present or that all network paths are off. The independent `https://check.trivy.dev/updates` request is skipped only when both `--skip-version-check` and `--disable-telemetry` are true. Either flag alone still sends a version-only or telemetry-only request.
- Config: optional `trivy.yaml` and `.trivyignore`.
- Children: no external linter is required for the built-in scanners.
- Writes: DB and cache under the user cache. `--output` writes a report. Does not modify scanned sources.

Primary sources: [release tag v0.76.2](https://github.com/aquasecurity/trivy/releases/tag/v0.76.2) (tag 2026-11-05), [cmd/trivy/main.go](https://github.com/aquasecurity/trivy/blob/v0.76.2/cmd/trivy/main.go) (`ExitError` versus fatal exit 1), [checksums file](https://github.com/aquasecurity/trivy/releases/download/v0.76.2/trivy_0.76.2_checksums.txt), [pkg/notification/notice.go](https://raw.githubusercontent.com/aquasecurity/trivy/v0.76.2/pkg/notification/notice.go) (lines 51–69: both flags are required to skip the update/telemetry request), [pkg/flag/db_flags.go](https://raw.githubusercontent.com/aquasecurity/trivy/v0.76.2/pkg/flag/db_flags.go) (`--skip-db-update` means skip updating the vulnerability DB; no prepared-DB command mode is stated).

## Checkov 3.4.4

License expression: Apache-2.0. License-text SHA-256 `ea45084c567928ec4116df7172beba374bbf67bc96c06a38171fafcb49a37510` of <https://raw.githubusercontent.com/bridgecrewio/checkov/3.4.4/LICENSE>. The fetched file is Apache-2.0. Prisma or Bridgecrew API use is optional and governed by those service terms, not by this file. This note does not certify either.

Distribution. Library plus image; architecture not selected. Artifact SHA-256, not license-text: wheel `checkov-3.4.4-py3-none-any.whl` `4b01d4ecfe9be74723619bad2095af9f1cc44890d62c8372809bdc3d10a7991d`; sdist `aed7a98c32b1d860a36c980a120eb16bec983d77140039ea2ac6ba091b7b29ac`. Requires Python >= 3.10. Docker Hub tag `3.4.4` index digest `sha256:ddf34d41033624e86f7578537cf23ad6880faf5aff4cf98aca657fae315b4195`; `linux/amd64` `sha256:ec9fed8ee1644cee7edce899721f5d1652186e17664713df8d43368cf8e3bb34`. No single CLI binary is pinned.

Invocation examples: `checkov -d DIR` or `checkov -f FILE`, with optional `[--framework terraform,kubernetes,...]`, `[-o cli|json|sarif|junitxml]`, `[--soft-fail]`, `[--download-external-modules]`. Passing download, API-key, or external-checks flags is a host choice and is not selected here.

Output. CLI summary of passed and failed checks, or JSON, SARIF, JUnit, or CSV when `-o` is set.

Exit. `checkov/main.py` at 3.4.4: returns 1 if any runner exit code is 1, otherwise 0. `exit_run` uses 2 on crash unless `--no-fail-on-crash`, which then returns 0. `--soft-fail` forces 0. Docs as recorded: `--soft-fail-on` and `--hard-fail-on` override severity gating.

Effects.

- Network: recorded off unless `--download-external-modules`, `--bc-api-key`, or `external-checks-git`. A default local scan does not require Prisma. That is not a demonstrated offline run.
- Config: `--config-file` YAML; also `.checkov.baseline`.
- Children: some frameworks are skipped if system dependencies are missing (docs). No fixed child binary.
- Writes: the scan is read-only. `--create-baseline` writes `.checkov.baseline`. `--output-file-path` writes reports. External module download writes a cache directory.

Primary sources: [PyPI 3.4.4 JSON](https://pypi.org/pypi/checkov/3.4.4/json) (version and wheel digest), [checkov/main.py](https://raw.githubusercontent.com/bridgecrewio/checkov/3.4.4/checkov/main.py) (exit 0/1/2), [Docker Hub tag 3.4.4](https://hub.docker.com/v2/repositories/bridgecrew/checkov/tags/3.4.4) (tag index and architecture digests).

## tflint v0.66.0

License: MPL-2.0 for most source; the release binaries also carry BUSL-1.1 terms. License-text SHA-256 `1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5` of <https://raw.githubusercontent.com/terraform-linters/tflint/v0.66.0/LICENSE>. The v0.66.0 README states the project is mostly MPL-2.0, some Terraform-package files are BUSL-1.1, and release binaries are bound by both. That is a published claim, not a compliance certificate. BUSL license-text SHA-256 `dc4cb9f6140970b69110d82e8f25545135965ae50f6761ddfd6cd7cf9452bfa9` of <https://raw.githubusercontent.com/terraform-linters/tflint/v0.66.0/LICENSE-BUSL>. Recorded BUSL parameters: licensor IBM; licensed work Terraform 1.6.0+; additional use grant bars competing hosted or embedded offerings; change date four years after publication; change license MPL-2.0.

Distribution. `checksums.txt` at <https://github.com/terraform-linters/tflint/releases/download/v0.66.0/checksums.txt>. Example artifact SHA-256, not license-text: `tflint_darwin_arm64.zip` `859b26af07ead7e65cee7eec9d050b2e2571dc28395b7a39191cae088cd67803`. Also `go install`. Architecture not selected.

Invocation examples: `tflint [--recursive] [--format default|json|compact|junit|sarif] [--force] [--minimum-failure-severity=error|warning|notice] [dir]`. `--init` and plugin install are host choices and are not selected here.

Output. Issues with severity on stdout. `--format json` is machine-readable.

Exit. `docs/user-guide/config.md` at v0.66.0: default 0 when there are no issues, 1 when there are errors, 2 when there are issues but no errors. `--force` returns 0 even if issues are found.

Effects.

- Network: plugin install or init can download ruleset plugins. A no-plugin run is recorded as local. That no-plugin run is not demonstrated here.
- Config: `.tflint.hcl`.
- Children: ruleset plugins are separate processes after `tflint --init`.
- Writes: plugin cache under the user config. Does not rewrite Terraform by default.

Primary sources: [release tag v0.66.0](https://github.com/terraform-linters/tflint/releases/tag/v0.66.0) (tag 2026-11-08), [config.md](https://raw.githubusercontent.com/terraform-linters/tflint/v0.66.0/docs/user-guide/config.md) (exit 0/1/2 and `--force`), [project README](https://github.com/terraform-linters/tflint/blob/v0.66.0/README.md) (MPL plus BUSL claim for binaries).

## kubeconform v0.8.0

License expression: Apache-2.0. License-text SHA-256 `1294f9be73faeda3987cb554c1597f599641eebdcd4d4fa88f97bdb6241be275` of <https://raw.githubusercontent.com/yannh/kubeconform/v0.8.0/LICENSE>. The default schema host is a third-party dataset and is not part of this license.

Distribution. Release `CHECKSUMS` at <https://github.com/yannh/kubeconform/releases/download/v0.8.0/CHECKSUMS>. Artifact SHA-256 of that checksum file, not license-text: `235fc6d8801ca0b6dba3ff3d49b8751e27c7ec92f4414fe052b283ec50cca0af`. Example artifact SHA-256: `kubeconform-darwin-arm64.tar.gz` `f84f4dfbebf4a6b0b230385fa065a39ea35e02608c2b50d025dcf64775a69d67`. Also `ghcr.io/yannh/kubeconform:v0.8.0`; no image digest is in the frozen row. Architecture not selected.

Invocation examples: `kubeconform [OPTION]... [FILE OR FOLDER]...`, with flags named in the row: `-summary`, `-output json|text`, `-ignore-missing-schemas`, `-schema-location`, `-cache DIR`, `-exit-on-error`, `-kubernetes-version`. A local `-schema-location` (`file://` or a directory) is the recorded way to avoid schema download; that command is not selected here.

Output. Per-resource status. `-summary` prints counts. `-output json` is a JSON array of results. A missing schema is an error unless `-ignore-missing-schemas`.

Exit. `cmd/kubeconform/main.go` at v0.8.0: returns 1 if any result failed, otherwise 0. Help text exits 0. A flag parse error exits 1.

Effects.

- Network: the default downloads JSON Schemas over HTTPS. `-schema-location` with `file://` or a local directory is recorded as avoiding that network. `-cache` writes downloaded schemas. Default download is not demonstrated here, and neither is a local-schema run.
- Config: flags only; no required config file.
- Children: none.
- Writes: the `-cache` directory. Does not modify manifests.

Primary sources: [release tag v0.8.0](https://github.com/yannh/kubeconform/releases/tag/v0.8.0) (tag 2026-06-04, still latest in the frozen row), [cmd/kubeconform/main.go](https://raw.githubusercontent.com/yannh/kubeconform/v0.8.0/cmd/kubeconform/main.go) (exit 0/1), [CHECKSUMS](https://github.com/yannh/kubeconform/releases/download/v0.8.0/CHECKSUMS) (official asset checksums).
