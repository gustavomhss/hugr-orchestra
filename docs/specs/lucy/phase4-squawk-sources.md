# Squawk 2.67.0 primary-source packet

Preparation only; no tool was installed or executed. These are source facts, not an approved
catalog, mapping, parser, or claim of real-binary conformance. Lead chooses coverage and integration.

## Identity and acquisition

The existing `packages/core/src/backend-toolkit/packs/squawk.ts` pins 2.67.0 release executables
with per-target SRI hashes; its manifest selects Apache-2.0. The tagged upstream workspace declares
`Apache-2.0 OR MIT`, not Apache alone: [Cargo.toml lines 5–12](https://github.com/sbdchd/squawk/blob/v2.67.0/Cargo.toml#L5-L12).
Lucy's eventual pack needs its own review fit and status-only locate, not a backend-seat grant;
host provisioning and integrity verification occur before a review, never inside it.

## Invocation, configuration and limits

Source-supported candidate argv, for one or more explicitly selected SQL files in scratch:

`<verified-squawk> --config <absolute-host-config.toml> --reporter json -- <absolute-sql-file>...`

This is a candidate to freeze after remote controls, not a claim that it was run. The host writes an
empty TOML config in a host-controlled directory outside the scanned tree. With an explicit config,
`ConfigFile::parse` reads that exact file; only without one does it traverse from cwd. See
[config.rs 39–55](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/config.rs#L39-L55)
and [main.rs 86–151](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/main.rs#L86-L151).
The README's `--config` example is consistent with that code; no invented `--no-config` flag is needed.
The code defaults excluded and included rule lists to empty; excludes override includes, and
`pg_version` and transaction assumptions default as in upstream. See
[config.rs 77–130](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/config.rs#L77-L130).
Lead must decide version/transaction assumptions and whether to include opt-in rules; don't claim
the empty config fixes a project's PostgreSQL version. The host-owned config excludes none.

`find_paths` expands every path as a glob, skips directories, and accepts explicit path arguments;
this is not recursive directory scanning. See [file_finding.rs 5–35](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/file_finding.rs#L5-L35).
Host must enumerate intended scratch SQL files and safely handle glob metacharacters, duplicates,
containment and platform-specific paths; do not pass a bare directory or assume it covers SQL files.
An empty host selection is an explicit not-run, not a successful scan: without paths, nonterminal
stdin can be selected and an empty stdin yields no reports. See
[cmd.rs 26–72](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/cmd.rs#L26-L72) and
[reporter.rs 169–210](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/reporter.rs#L169-L210).
No upload/server/debug subcommand; use the existing network-denying jail and controlled environment.
Source alone does not prove a sandbox's network denial or availability. No install or advisory update
in review. SQL inline suppressions remain active even with host config: see
[README suppressions](https://github.com/sbdchd/squawk/blob/v2.67.0/README.md#disabling-rules-via-comments)
and [linter 542–564](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk_linter/src/lib.rs#L542-L564).
The host must not describe a suppressed hit as a clean finding; handling changed suppressions remains
the existing noise-pipeline responsibility, to be verified during integration.

## Exit and JSON contract

For an actual lint invocation, [`lint_and_report`](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/reporter.rs#L212-L224)
returns success (0) only when the total violation count is zero, otherwise failure (1), after printing.
But [config.rs 77–83](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/config.rs#L77-L83)
and [cmd.rs 26–42](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/cmd.rs#L26-L42)
also exit 1 on configuration or path-discovery failures. Therefore exit 1 **alone cannot mean a
finding**. Accept 0/1 only with a complete, valid JSON report and appropriate process/diagnostic
checks; malformed, missing, truncated or inconsistent output and other process failures are
acquisition-error, not findings or a clean scan. The exact fail-closed disambiguation is a lead
decision and needs real-binary controls; in particular, syntax errors produce a JSON violation.
CLI argument parsing/errors beyond the cited paths have not been exhaustively classified.

`--reporter json` serializes a flat array of violations to stdout, including `[]` for zero violations:
[reporter.rs 366–373](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/reporter.rs#L366-L373).
Each row has `file`, `line`, `column`, `level`, `message`, `help`, `rule_name`, `column_end`,
`line_end`; `range` and `fix` are skipped, `help` may be null. `level` serializes as `Warning` or
`Error`, not lowercase: [reporter.rs 293–326](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/reporter.rs#L293-L326).
The syntax-error snapshot is a concrete row: [reporter.rs 521–531](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/reporter.rs#L521-L531).
Positions are zero-based line and byte-column from the line index; end comes from the end of the
underlying text range. Verify end-exclusive conversion and Unicode/CRLF handling in CI before using
them as inclusive line ranges: [line index](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk_line_index/src/lib.rs#L20-L36),
[report construction](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/reporter.rs#L23-L100).
Parse errors produce `syntax-error`, `Error`, and suppress linting of that file; ordinary lint
violations are `Warning`. This pseudo-rule is not the linter's `Rule` enum; lead must decide whether
it is an acquisition error or separately classified coverage failure, never silently treat it as clean.

## Native rule inventory and mapping candidates

Complete `Rule` display-name inventory at this tag, transcribed from
[lib.rs 74–121, 224–281](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk_linter/src/lib.rs#L74-L121),
with [display match](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk_linter/src/lib.rs#L224-L281):

- `require-concurrent-index-creation`, `require-concurrent-index-deletion`, `constraint-missing-not-valid`,
  `adding-field-with-default`, `adding-foreign-key-constraint`, `changing-column-type`.
- `adding-not-nullable-field`, `adding-serial-primary-key-field`, `renaming-column`, `renaming-table`,
  `disallowed-unique-constraint`, `ban-drop-database`.
- `prefer-bigint-over-int`, `prefer-bigint-over-smallint`, `prefer-identity`, `prefer-repack`,
  `prefer-robust-stmts`, `prefer-text-field`, `prefer-timestamp-tz`, `ban-char-field`.
- `ban-drop-column`, `ban-drop-table`, `ban-drop-not-null`, `transaction-nesting`, `adding-required-field`,
  `ban-concurrent-index-creation-in-transaction`, `unused-ignore`.
- `ban-create-domain-with-constraint`, `ban-alter-domain-with-add-constraint`, `ban-truncate-cascade`,
  `require-timeout-settings`, `ban-uncommitted-transaction`, `require-enum-value-ordering`,
  `require-table-schema`, `identifier-too-long`.
- `require-concurrent-partition-detach`, `require-concurrent-reindex`, `require-lock-timeout`,
  `require-statement-timeout`, `ban-duplicate-column-assignments`, `ban-drop-view`, `ban-drop-function`,
  `ban-drop-type`, `ban-drop-default`, `ban-drop-trigger`.

This inventory is enum/display names, **not a claim that every name is emitted by the default run**.
`require-table-schema`, `ban-drop-trigger` and the deprecated alias `require-timeout-settings` are
opt-in; the alias expands into lock and statement timeout rules. `prefer-timestamptz` is accepted as
an input alias but display emits `prefer-timestamp-tz`. `unused-ignore` is in Display but not in the
shown CLI `TryFrom` match. See [lib.rs 124–140](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk_linter/src/lib.rs#L124-L140),
[145–221](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk_linter/src/lib.rs#L145-L221),
[566–600](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk_linter/src/lib.rs#L566-L600).
Separately `syntax-error` is emitted by the parser, not a `Rule` display name.

Mapping candidates, **not frozen assignments**: `require-concurrent-index-creation` and
`constraint-missing-not-valid` → `reliability.timeout` or a lead-approved migration-lock class;
`adding-required-field` → `logic.contract`; `ban-drop-column` → `logic.contract` or a new
lead-approved destructive-migration class. The tagged [README example](https://github.com/sbdchd/squawk/blob/v2.67.0/README.md#usage)
and [JSON fixture](https://github.com/sbdchd/squawk/blob/v2.67.0/crates/squawk/src/reporter.rs#L600-L615)
support the lock/required-field rationale, not a final Lucy severity or all rule semantics. Every
exposed rule still needs its own tagged upstream rule documentation, class, lens, severity mapping
and triage note; do not map the inventory wholesale from names or invent wildcard coverage.

## Required remote evidence before pack integration

- Real pinned binary positive: unsafe `ALTER TABLE ... ADD COLUMN ... NOT NULL`; negative: benign
  `SELECT 1;` with a nonempty file set. Verify exit, exact JSON and location on both supported CI OSes.
- Prove an injected repository `.squawk.toml` cannot change explicit host-config output; prove a
  missing or malformed **host** config is acquisition-error. Test invalid SQL, malformed/mixed JSON,
  unknown rules, no files, paths with glob metacharacters, non-UTF-8 and unsupported platform.
- Verify the actual sandbox blocks network, protects the source tree, and retains raw failed output;
  prove a missing/unsupported binary is `not-run`, not a pass. No fixture-only fake is binary proof.
- No such controls were run for this packet. Exact argv, eligible rules, failure classification and
  mapping remain subject to the lead's freeze after evidence; uncovered tools remain pending.
