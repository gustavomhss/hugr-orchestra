# Ruff: curated F821/F823 source facts

Source capture only; not a version freeze, pack, catalog mapping or binary proof. Lead chooses
version, target semantics, interface and classification. No binary, test, build or CI was run.
## Candidate release, license and assets
The read-only [GitHub latest-release response](https://api.github.com/repos/astral-sh/ruff/releases/latest)
on 2026-11-05 returned tag **`0.17.3`**, `prerelease: false`, published
`2026-10-27T00:35:07Z`. Latest is mutable; all source links below pin that actual tag. The tagged
[workspace manifest](https://github.com/astral-sh/ruff/blob/0.17.3/Cargo.toml#L13) declares MIT;
the tagged [LICENSE](https://github.com/astral-sh/ruff/blob/0.17.3/LICENSE) includes MIT terms and
third-party notices. Confirm distribution obligations before shipping.

The release API's **asset** `digest` fields report these SHA-256 values for the archive itself,
not the separately named `.sha256` text file and not the unpacked executable. No archive was
downloaded or independently hashed. Asset URLs are `https://github.com/astral-sh/ruff/releases/download/0.17.3/` plus the name.

| Target asset | API `sha256:` digest (hex) |
|---|---|
| `ruff-aarch64-unknown-linux-gnu.tar.gz` | `3f4639152c0e42bb5938e6c23d53d527a38f3133e000102934518f90529fa299` |
| `ruff-x86_64-unknown-linux-gnu.tar.gz` | `2b0890f5a55900af741f133918c2656919bbf18c2ab7741b4ca8403a90e647a9` |
| `ruff-aarch64-apple-darwin.tar.gz` | `118f7121aa838785672bf612487f755a89108bb5f44e0f3df96c5967a72614f9` |
| `ruff-x86_64-apple-darwin.tar.gz` | `17f95b1bee24d70de62ffe5beec7f71bb541c7e3d147a1c3d84f7cd6525f6fdf` |
| `ruff-x86_64-pc-windows-msvc.zip` | `a84d9ac74af8ef5bac84a1888a1634df18e6e985e2f930d35c052beacd00e813` |

These five are available metadata, **not approved pins**: host compatibility, unpacking and runtime
integrity verification still need evidence. Linux musl assets also
exist; this table does not decide GNU versus musl. SHA-256 text is sufficient to derive SRI later;
no SRI value is asserted here.

### Exact license bytes and inspected archives
At 2026-11-05T11:42Z, [the tag ref](https://api.github.com/repos/astral-sh/ruff/git/ref/tags/0.17.3)
resolved directly to commit `ba65abf8ba7bfbcc059f7fb9712be5ba9cab6abc`. The full upstream
[`LICENSE` at the tag](https://raw.githubusercontent.com/astral-sh/ruff/0.17.3/LICENSE) and
[immutable commit](https://raw.githubusercontent.com/astral-sh/ruff/ba65abf8ba7bfbcc059f7fb9712be5ba9cab6abc/LICENSE)
both yielded SHA-256 `2597d854122b77ddc71971564ca2350a37608575ce324adc5650a2b2051c8f18`.
The exact commit-source bytes are captured at `sources/ruff-0.17.3-LICENSE.txt`: the full MIT
text and copyright precede embedded third-party notices. This is a repo source artifact, **not**
evidence that the shipped release archive contains that file or a legal-compliance opinion.

All five archives were independently SHA-256 checked against the table above; changing one byte in
each produced a different digest. Tar/zip entries and static executable headers were read without
extracting to disk or executing a binary. The two previously acquired files were rehashed; the
three others were fetched with a 64 MiB archive cap and bounded member reads. Observed members:

- Linux x86_64 GNU: member `ruff-x86_64-unknown-linux-gnu/ruff`, ELF64 little-endian machine 62;
  `.gnu.version_r` names GLIBC versions through `GLIBC_2.17`. This is the highest named GLIBC
  requirement observed, not a complete host-compatibility proof.
- macOS arm64: member `ruff-aarch64-apple-darwin/ruff`, Mach-O CPU `0x100000c` and
  `LC_BUILD_VERSION` platform macOS, minimum 11.0.0, SDK 11.0.0. This is a header floor,
  not an execution test or guarantee that every supported host works.
- Linux arm64 GNU: member `ruff-aarch64-unknown-linux-gnu/ruff`, ELF64 little-endian machine 183;
  parsed `.gnu.version_r` names `GLIBC_2.17` as its highest GLIBC requirement.
- macOS x64: member `ruff-x86_64-apple-darwin/ruff`, Mach-O CPU `0x1000007`;
  `LC_VERSION_MIN_MACOSX` declares minimum 10.12.0 and SDK 10.12.0.
- Windows x64: sole ZIP member `ruff.exe`, PE32+ machine `0x8664`; optional-header OS version
  is 6.0 and subsystem version is 6.0. Imports and actual Windows API availability were **not**
  inspected; those header fields do not establish a supported Windows floor.
Each tar contains only its named enclosing directory and executable; the ZIP has only `ruff.exe`.
No inspected archive contains a separate LICENSE file. Tagged
[`dist-workspace.toml`](https://github.com/astral-sh/ruff/blob/ba65abf8ba7bfbcc059f7fb9712be5ba9cab6abc/dist-workspace.toml#L15-L22)
specifies archive formats and build targets, not host compatibility.
Rust's workspace MSRV is a compiler requirement, not an OS floor. A separately verified LICENSE
companion may be technically possible through existing multi-artifact staging; its shipping
policy and interface are for the lead to freeze, not decided by archive absence.
## Two native rules only
- **F821 `undefined-name`**: tagged [rule documentation](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff_linter/src/rules/pyflakes/rules/undefined_name.rs#L6-L27)
  says an undefined name is *likely* to raise `NameError`; target-version changes the known builtins.
  Its [unresolved-reference check](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff_linter/src/checkers/ast/analyze/unresolved_references.rs#L10-L61)
  also accounts for possible rebindings. Dynamic names and supplied builtins require real context;
  a scanner finding is a candidate, not a confirmed runtime defect.
- **F823 `undefined-local`**: tagged [documentation and implementation](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff_linter/src/rules/pyflakes/rules/undefined_local.rs#L11-L70)
  describe a local reference before assignment and inspect a function-scope binding shadowing a
  parent binding. The documented example is `x = 1` then `def foo(): x += 1`; the proposed remedy
  uses `global x`. A call path and actual scope still matter to confirmation.

These IDs and native names are the curated inventory; this does not claim coverage of all Ruff
rules. A selected scanner output may also contain non-rule diagnostics such as syntax errors.
## Source-supported invocation candidate
Candidate argv, to be frozen only after real-binary controls and version/target decisions:

`<ruff> check --isolated --no-cache --no-fix --no-fix-only --no-preview --output-format json --select F821,F823 --no-respect-gitignore -- <explicit-scratch-python-files...>`
Tagged [`args.rs`](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff/src/args.rs#L233-L298)
defines `--no-fix`, `--no-fix-only`, `--no-preview`, JSON output and comma-delimited `--select`;
[`--isolated`](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff/src/args.rs#L61-L71)
ignores configuration files, and [`--no-cache`](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff/src/args.rs#L410-L422)
disables cache reads. [Implementation](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff/src/lib.rs#L300-L310)
sets `cache = !cli.no_cache`; verify no cache writes with the real binary under the jail. Explicit
files avoid the [default `.`](https://github.com/astral-sh/ruff/blob/0.17.3/docs/configuration.md#L598-L605);
an empty selection must not accidentally scan cwd. `--no-respect-gitignore` is in tagged
[file options](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff/src/args.rs#L392-L400).

`--isolated` does **not** itself disable source suppressions. Ruff honors `# noqa` by default;
[`--ignore-noqa`](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff/src/args.rs#L268-L270)
exists, but whether to override project suppressions is a lead decision, not part of the candidate
above. Do not pass rewrite, `--fix`, `--diff`, `--add-noqa` or `--exit-zero`. Sandbox network
denial, file confinement and absence of source rewrites require actual controls; flags alone do not
prove them. Restrict inputs to intended `.py`/`.pyi` files and validate path containment.

Use a controlled environment: tagged args explicitly read `RUFF_OUTPUT_FORMAT`, `RUFF_OUTPUT_FILE`,
`RUFF_NO_CACHE`, and `RUFF_CACHE_DIR`; in particular `RUFF_OUTPUT_FILE` can divert stdout
([args.rs](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff/src/args.rs#L272-L282),
[cache args](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff/src/args.rs#L417-L422)).
Do not inherit project `PYTHONPATH` as authority or invoke project Python; its specific effect on
this Ruff binary was **not established** in the captured sources and needs a negative control.

For target version, [`resolve.rs`](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff/src/resolve.rs#L28-L36)
uses defaults in isolated mode rather than reading `pyproject.toml`; the tagged AST
[`PythonVersion::default`](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff_python_ast/src/python_version.rs#L99-L103)
is Python 3.11. This is Ruff's default, **not evidence of the project's deployed version**. F821
builtins depend on target version; lead must decide whether to pass a verified `--target-version`
or treat unknown target as a coverage limitation. Outside isolated mode Ruff may infer a target
from `requires-python`, subject to [documented precedence](https://github.com/astral-sh/ruff/blob/0.17.3/docs/configuration.md#L307-L316).

## Output, locations and failure
Tagged [JSON renderer](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff_db/src/diagnostic/render/json.rs#L51-L121)
emits an array of diagnostic objects with `code`, `name`, `severity`, `message`, `filename`,
`location`, `end_location`, `fix`, `cell`, `noqa_row`, `url`; some fields can be null. Locations
are `{row, column}` using `OneIndexed` ([struct](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff_db/src/diagnostic/render/json.rs#L208-L240)).
Start/end derive from the underlying source range endpoints. Tagged
[`LineColumn`](https://github.com/astral-sh/ruff/blob/ba65abf8ba7bfbcc059f7fb9712be5ba9cab6abc/crates/ruff_source_file/src/lib.rs#L221-L231)
uses one-indexed Unicode scalar-value columns, excluding a first-line BOM; the
[`LineIndex::line_column`](https://github.com/astral-sh/ruff/blob/ba65abf8ba7bfbcc059f7fb9712be5ba9cab6abc/crates/ruff_source_file/src/line_index.rs#L73-L125)
maps UTF-8 byte offsets. The renderer maps `range.end()` directly, and tagged
[`TextRange`](https://github.com/astral-sh/ruff/blob/ba65abf8ba7bfbcc059f7fb9712be5ba9cab6abc/crates/ruff_text_size/src/range.rs#L28-L45)
is `start..end` (exclusive end). Inclusive-line conversion, especially an end at column 1 on the
next line or an empty range, still needs real-binary multiline/Unicode controls.
Notebook cell translation exists in the renderer; this candidate does not claim notebook coverage.
The tagged [syntax snapshot](https://github.com/astral-sh/ruff/blob/0.17.3/crates/ruff_db/src/diagnostic/render/snapshots/ruff_db__diagnostic__render__json__tests__syntax_errors.snap)
uses `invalid-syntax`, not F821/F823. Unknown/missing codes, malformed or incomplete JSON,
non-UTF-8, truncation and diagnostics without usable locations require explicit classification,
never an empty success. A syntax error must not be silently dropped as a clean two-rule scan.

Default [`ruff check` exits](https://github.com/astral-sh/ruff/blob/0.17.3/docs/linter.md#L741-L748):
0 for no violations (or all fixed), 1 for violations, 2 for invalid configuration/options or an
internal failure. The candidate disables fixes; still validate output, completion and consistency
before interpreting 0/1. Binary absence or unsupported platform is `not-run`, not a clean scan;
failures to acquire/parse output must not become findings or pass.

## Remote controls and gaps
- Proposed F821 positive: `print(missing_name)`; negative: `value = 1`. F823 positive: the tagged
  function-shadow example above. Run the pinned **real binary** in CI, with exact JSON and exit
  assertions; these examples have not been run here.
- Controls must compare hostile repository config versus isolated mode, suppressed findings, dirty
  environment including `RUFF_OUTPUT_FILE` and `PYTHONPATH`, no-cache/no-write behavior, missing
  inputs/binary, invalid syntax and malformed/mixed JSON; validate Unicode and exclusive end ranges.
- Source gap: generated standalone rule pages were not present in the enumerated tagged tree; the
  tagged Rust doc comments and implementation above are the version-specific primary rule docs.
  The guessed `docs/settings.md` URL returned HTTP 404; default evidence uses the tagged Rust source
  instead. No complete proof of environment independence, OS/API compatibility or binary
  behavior is asserted. No installation, runtime execution, local tests, typecheck or CI was performed.
