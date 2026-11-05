# actionlint source and acquisition facts

Source capture only, not a version freeze, execution contract, shipping approval or proof of compatibility. No actionlint binary was executed. Findings are diagnostics, not automatically confirmed defects.

## Identity and license

The [latest release API](https://api.github.com/repos/rhysd/actionlint/releases/latest) reported non-prerelease `v1.7.12`, published 2026-03-30T17:49:21Z. The [tag ref](https://api.github.com/repos/rhysd/actionlint/git/ref/tags/v1.7.12) points directly to commit `914e7df21a07ef503a81201c76d2b11c789d3fca`, not an annotated tag object. Source links below use that commit.

The full [tagged LICENSE.txt bytes at the immutable commit](https://raw.githubusercontent.com/rhysd/actionlint/914e7df21a07ef503a81201c76d2b11c789d3fca/LICENSE.txt) were saved outside the repository at `/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/actionlint-acquisition/LICENSE.txt`: 1,067 bytes, SHA-256 `03a26b06d224380a02bf100e05fff3b2dfc71b14d4e2fa685ec9963a87563c22`. The text says MIT License and copyright 2021 rhysd. This is not a legal opinion.

## Release archives

The [release API](https://api.github.com/repos/rhysd/actionlint/releases/tags/v1.7.12) supplies the official SHA-256 metadata below; independently downloaded archive bytes hashed to the same values. Downloads used a 64 MiB per-file cap; total archive size was 11,464,485 bytes, below 320 MiB. No retry was performed. URLs are `https://github.com/rhysd/actionlint/releases/download/v1.7.12/` followed by the asset name.

| Asset | SHA-256: metadata and independently computed | Executable member |
| --- | --- | --- |
| `actionlint_1.7.12_darwin_amd64.tar.gz` | `5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644` | `actionlint` |
| `actionlint_1.7.12_darwin_arm64.tar.gz` | `aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f` | `actionlint` |
| `actionlint_1.7.12_linux_amd64.tar.gz` | `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8` | `actionlint` |
| `actionlint_1.7.12_linux_arm64.tar.gz` | `325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6` | `actionlint` |
| `actionlint_1.7.12_windows_amd64.zip` | `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9` | `actionlint.exe` |

Static listings also show `LICENSE.txt`, `README.md`, `docs/README.md`, `docs/api.md`, `docs/checks.md`, `docs/config.md`, `docs/install.md`, `docs/reference.md`, `docs/usage.md`, and `man/actionlint.1` in each archive. Their license members were listed, not independently compared to the downloaded source license. No OS, libc, CPU-feature or Windows API compatibility floor has been established by header inspection. The tagged [`go.mod`](https://github.com/rhysd/actionlint/blob/914e7df21a07ef503a81201c76d2b11c789d3fca/go.mod) declares Go 1.25.0, a build requirement, not a host floor.

## Invocation, trust and output

[`command.go`](https://github.com/rhysd/actionlint/blob/914e7df21a07ef503a81201c76d2b11c789d3fca/command.go) uses Go's flag parser: no operands scans a repository, a sole `-` reads stdin, and other operands go to `LintFiles`. Use `--` before literal paths beginning with `-`; a sole `-` remains the stdin sentinel. Explicit files are read from disk, not shell-expanded by actionlint. Do not use `-init-config`, which writes a config file.

`-shellcheck= -pyflakes=` disables both optional external rule integrations. Otherwise they resolve commands through `execabs.LookPath`, accept command-line-like strings and spawn processes ([process.go](https://github.com/rhysd/actionlint/blob/914e7df21a07ef503a81201c76d2b11c789d3fca/process.go), [linter.go](https://github.com/rhysd/actionlint/blob/914e7df21a07ef503a81201c76d2b11c789d3fca/linter.go)). PATH and inherited process environment affect enabled subprocesses; `NO_COLOR` and terminal detection affect default color. This is not an exhaustive environment audit or a sandbox guarantee.

`-config-file <path>` supplies higher-priority lint configuration, but **does not prevent repository config discovery**: project detection searches ancestors for `.git` plus `.github/workflows`, and `NewProject` parses `.github/actionlint.yaml` or `.yml` before the override applies. A malformed repository config can fail the run. Config includes self-hosted runner labels, config variables and path-specific ignore patterns ([project.go](https://github.com/rhysd/actionlint/blob/914e7df21a07ef503a81201c76d2b11c789d3fca/project.go), [config docs](https://github.com/rhysd/actionlint/blob/914e7df21a07ef503a81201c76d2b11c789d3fca/docs/config.md)). Local action and reusable workflow metadata are also read for relevant checks; repository files and paths are untrusted inputs. Exact filesystem boundary, symlink behavior and isolation remain to be established.

`-format '{{json .}}'` writes a JSON array of diagnostics to stdout using a Go template; do not shell-interpolate untrusted arguments. Fields are `message`, optional `filepath`, `line`, `column`, `kind`, optional `snippet`, `end_column`; locations are 1-based. `end_column` is the displayed indicator endpoint, not established as a source-range end ([error.go](https://github.com/rhysd/actionlint/blob/914e7df21a07ef503a81201c76d2b11c789d3fca/error.go), [usage](https://github.com/rhysd/actionlint/blob/914e7df21a07ef503a81201c76d2b11c789d3fca/docs/usage.md)). Multi-file formatting propagates formatter errors; single-file and stdin paths call `PrintErrors` without handling its return. Treat malformed, missing or truncated output as failure, not clean results. Exit codes: 0 no findings, 1 findings, 2 invalid options, 3 fatal failure; stderr carries command errors. Verify these and Unicode/location behavior with later real-binary controls.

## Native checks and limitations

The tagged [rule constructors](https://github.com/rhysd/actionlint/tree/914e7df21a07ef503a81201c76d2b11c789d3fca) and linter list the native kinds `action`, `credentials`, `deprecated-commands`, `env-var`, `events`, `expression`, `glob`, `id`, `if-cond`, `job-needs`, `matrix`, `permissions`, `runner-label`, `shell-name`, and `workflow-call`; parse errors use `syntax-check`. `shellcheck` and `pyflakes` are the two optional external-process rule kinds. The other rules analyze parsed input and local metadata; this is not a proof of whole-program network or filesystem isolation.

Kinds such as `id` and `job-needs` are candidates for a small downstream closed subset, but the CLI builds the native rule set rather than offering a positive rule selector; filtering output is not the same as disabling checks or their reads. Syntax and other diagnostics must not silently become evidence of a successful scan. Classification, omissions, config policy, trusted scratch placement, output limits and failure handling remain lead decisions.

The normal lint source path reads local workflows and metadata and invokes only the optional external integrations identified above; no first-party runtime download was established from the inspected path. Build-time module dependencies and source generators are separate; exhaustive network independence has not been proved. Real-binary controls for clean/findings/fatal exits, config poisoning, external-process suppression, multiple files, odd paths, output bounds and target compatibility remain unexecuted.
