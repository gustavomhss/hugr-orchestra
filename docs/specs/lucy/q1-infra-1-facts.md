# Q1 infra source facts — 1

Future-tool source facts only. Not a live Orchestra integration, execution lane, no-exec or offline guarantee, or redistribution approval. Trust stays open where the facts leave it open. Five tools; no architecture is selected unless the facts select one.

## kube-linter v0.8.3

- **Artifact:** No v0.8.3 `checksums.txt`; architecture not selected. Publisher asset digest for `kube-linter-darwin_arm64.tar.gz` is `sha256:6e3443a8ff8625a9fc31a38682c783988d7559018f7ff707a4f8c77c18c92f14` (not a local rehash, not the chosen build). `go install golang.stackrox.io/kube-linter/cmd/kube-linter@v0.8.3`: any go install distribution is a source build requiring the pinned module Go 1.25.5 toolchain, not a published native binary.
- **License:** Apache-2.0, tagged LICENSE only. Text SHA-256 `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` (not the tarball). https://raw.githubusercontent.com/stackrox/kube-linter/v0.8.3/LICENSE
- **Use:** `kube-linter lint <yaml-or-chart-dir>` lints local Kubernetes YAML or a chart directory. Optional `--config`. Chart lint reads `values.yaml`.
- **Output/exits:** Default text lists file, object, diagnostic, check, and remediation, or `No lint errors found!`. JSON and SARIF exist; flags not listed. `os.Exit(1)` if cobra `Execute` errors. Lint errors when reports are non-empty, or on `--fail-if-no-objects-found` / `--fail-on-invalid-resource`. Nil is exit 0.
- **Effects:** Config: optional `--config` and chart `values.yaml`. Network: checked load is local; Helm 3.20.0 uses already-loaded conditions and imported values and does not download dependencies; no whole-process guarantee. Children: no Helm CLI; in-process `helm.sh/helm/v3` render. Writes: inputs unchanged; stdout by default; `--output` writes reports.
- **Limits:** No recorded signature. The darwin digest is not the selected binary. No offline or redistribution claim.

Sources: https://github.com/stackrox/kube-linter/releases/tag/v0.8.3 · https://github.com/stackrox/kube-linter/blob/v0.8.3/cmd/kube-linter/kube-linter.go · https://github.com/stackrox/kube-linter/blob/v0.8.3/pkg/lintcontext/parse_yaml.go

## OpenTofu v1.13.9

- **Artifact:** CLI name `tofu`. Architecture not selected. Publisher `tofu_1.13.9_SHA256SUMS` digest `sha256 f8a2925243a71078e84a911f1bb8eaf9c0974c3d5637475921a6af01082d080c` lists example `tofu_1.13.9_darwin_arm64.zip` as `sha256 29ba2f4c78556a8d25476e5070fe4745495ef649c4a3b827170eb7436d23feb3` (publisher sum, not a local rehash). A `.gpgsig` accompanies the sums; verification is not established.
- **License:** MPL-2.0. Text SHA-256 `142b957651baf401646dd7f3d855cb7c4f6f0921d645faa27e7cb540bc33cf4c` (not the zip or sums file). https://raw.githubusercontent.com/opentofu/opentofu/v1.13.9/LICENSE Docs may include other authors' MPL-2.0 text. Provider plugins are separately licensed and fetched at `init`.
- **Use:** Selected analysis is `tofu validate` on an initialized directory. It checks configuration, does not apply state, and is not `fmt`. Plugins and modules must already be installed.
- **Output/exits:** Human view prints `Success! The configuration is valid.` or diagnostics plus a warnings line. Exit 1 on errors, else 0; warnings stay 0. Separate `fmt`: 2 on errors, 3 if `-check` finds diffs, else 0.
- **Effects:** Config: configuration files and auto-loaded `terraform.tfvars` / `*.auto.tfvars`; not proof that validate reads CLI config or the lock. Network: validate does not download; `init` does. Children: provider plugins after `init`; launch not traced. Writes: `init` writes `.terraform/` and may update the lock; `fmt` without `-check` rewrites files; validate does not apply. Cache layout not traced.
- **Limits:** Example zip is not chosen. Signature unverified. Provider licence, launch, and cache layout stay open.

Sources: https://github.com/opentofu/opentofu/releases/tag/v1.13.9 · https://github.com/opentofu/opentofu/releases/download/v1.13.9/tofu_1.13.9_SHA256SUMS · https://github.com/opentofu/opentofu/blob/v1.13.9/internal/command/views/validate.go

## Slither 0.11.6

- **Artifact:** Package `slither-analyzer` 0.11.6, console script `slither`. No official standalone binary. PyPI publisher digests: wheel `sha256 01f809198d3f171e2d768569c0054c96af5736614e183c64f42c9b51636c33c1`; sdist `sha256 72aff6c1924a8641c1c8e4d84f9a4e6c97b5bfb3221bf71a11ffaee46d2f7da2`. Not a local rehash or a native binary. Latest GitHub tag here, dated 2026-07-28.
- **License:** AGPL-3.0-only. Text SHA-256 `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0` (not the wheel or sdist). https://raw.githubusercontent.com/crytic/slither/0.11.6/LICENSE `pyproject.toml` says AGPL-3.0, not or-later. README commercial offer is not a second licence.
- **Use:** `slither <path>` runs detectors on a local path. Project config optional. CryticCompile may spawn solc or a framework compiler; not a second Slither CLI. Unknown compiler hashes are not auto-install binaries.
- **Output/exits:** Findings on stdout. JSON schema not fetched. `slither/__main__.py` at 0.11.6: `sys.exit(0)` only with no output error and detection failure off; `sys.exit(-1)` if either is set. Default fail-on is PEDANTIC, so hits fail. `--fail-none` or `--no-fail-pedantic` disables that if no output error. Usage `parser.exit` integer unknown.
- **Effects:** Config: not required for `slither <path>`. Network: Etherscan or address target is unbounded; local compile may download solc via crytic-compile, unread here. Children: compiler toolchain, not a second Slither binary. Writes: stdout report; artifact directory unknown.
- **Limits:** No binary, JSON schema, usage-exit integer, or traced solc download. Path use is not an offline guarantee. README offer is not a licence.

Sources: https://pypi.org/pypi/slither-analyzer/0.11.6/json · https://github.com/crytic/slither/releases/tag/0.11.6 · https://github.com/crytic/slither/blob/0.11.6/pyproject.toml

## Echidna v2.4.0

- **Artifact:** No `checksums.txt`; architecture not selected. GitHub API digest for example `echidna-2.4.0-aarch64-linux.tar.gz` is `sha256:9fd8536a7f6510b3177dd3f93d3b78c8c25883d4a1f4fda0ee6939c6ed59df65` (publisher digest, not a local rehash or chosen arch). Source build needs GHC, libsecp256k1, and libff, with no checksum here; not an auto-install binary. Container image digest unknown.
- **License:** AGPL-3.0-only. Same text SHA-256 as Slither: `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0` (not the tarball). https://raw.githubusercontent.com/crytic/echidna/v2.4.0/LICENSE hevm, Z3, and solc are separate components.
- **Use:** `echidna <file.sol> --contract NAME` campaigns the named contract. YAML config. Children may include solc, Slither unless disabled, and z3 or bitwuzla in symbolic mode.
- **Output/exits:** Text or JSON report: property status, seed, call count, corpus size. JSON schema not fetched. `exitSuccess` if `isSuccessful`, else `ExitFailure 1`. Success: every test open, Passed, or Verified. Verified is Unsolvable and counts as success in verification mode. No-test completion is exit 0 only if that call is reached.
- **Effects:** Config: YAML and optional corpus directory. Network: optional RPC and on-chain fetch unless disabled; default campaign can be offline, not a whole-process guarantee. Children: solc, Slither unless disabled, and symbolic SMT solvers. Writes: corpus and Foundry repro files when enabled.
- **Limits:** Arch, checksum file, signature, container digest, and JSON schema unset. Example tarball and unselected container digest are not a selected binary.

Sources: https://api.github.com/repos/crytic/echidna/releases/tags/v2.4.0 · https://raw.githubusercontent.com/crytic/echidna/v2.4.0/src/Main.hs · https://github.com/crytic/echidna/blob/v2.4.0/lib/Echidna/Types/Test.hs

## Mythril 0.24.8

- **Artifact:** Selected dist is the PyPI sdist only: `mythril-0.24.8.tar.gz`, publisher digest `sha256 6631ffaad0342c9b2a6b82dbe12106ab38512be45b6c8e0a364e9d4cb146874a`. No wheel. Docker not selected; unknown digest is not an install binary. No newer release or binary assets.
- **License:** MIT, copyright Bernhard Mueller since 2017. Text SHA-256 `418e0e2238d1dd42f1feb4cb83381f53bc5541bf41dbc60a47ee9ca1e99ac287` (not the sdist). https://raw.githubusercontent.com/Consensys/mythril/v0.24.8/LICENSE Z3 is a separate dependency.
- **Use:** Selected call is `myth analyze <solidity-file>` with local solc. `-a` is a different RPC path, not this analysis. Caller config not required. Z3 is in-process, not a second CLI or hashed binary.
- **Output/exits:** Report prints, then exit. Default text: SWC ID, severity, function, program counter. Analyze path: exit 1 if issues, else 0. Error helper `sys.exit()` passes no integer; unqualified, status unknown.
- **Effects:** Config: creates or loads `config.ini` under `MYTHRIL_DIR` or `~/.mythril`. Network: file analyze uses local solc; `-a` is RPC and out of scope. Children: solc is a compiler child; Z3 stays in-process. Writes: stdout report, plus each run creates `MYTHRIL_DIR` (default `~/.mythril`), copies `signatures.db` if missing, and rewrites `config.ini`.
- **Limits:** No wheel or selected binary asset; error-path integer unread. Docker not selected; digest not qualified. Home writes are in scope. Z3 is a prerequisite. Not an offline guarantee.

Sources: https://pypi.org/pypi/mythril/0.24.8/json · https://raw.githubusercontent.com/Consensys/mythril/v0.24.8/mythril/interfaces/cli.py · https://api.github.com/repos/Consensys/mythril/releases/latest
