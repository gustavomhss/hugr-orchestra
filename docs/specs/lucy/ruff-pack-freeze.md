# Curated Ruff 0.17.3 runtime contract

Authority: source packets `f5a7df51a5`, `8fd78ebed1`, `0af06173cf`, all five
independently hashed archives and exact commit LICENSE. Construction only: this
freeze is not binary conformance, compatibility or campaign acceptance.

## Pin and installation

`backend-toolkit/packs/ruff.ts` exports a default Pack for Ruff 0.17.3, MIT,
upstream `astral-sh/ruff`, no runtime/dependencies, fit role check and no entry
skills. Do not register it in the backend seat's ENGINES or grant recipes.
The review adapter supplies its own manifest to the existing host toolkit.
Targets use the five exact captured asset hashes and member paths. Native notices
are supplied through the frozen atomic notice seam, not an invented archive entry:
immutable commit URL
`https://raw.githubusercontent.com/astral-sh/ruff/ba65abf8ba7bfbcc059f7fb9712be5ba9cab6abc/LICENSE`,
the captured SHA-256, filename `ruff-0.17.3-license.txt`.

Static header floors are Linux GNU GLIBC 2.17, macOS arm64 11.0 and x64 10.12.
These are observed lower-bound metadata, not executed compatibility guarantees.
Windows imports/API compatibility remain unqualified: the review adapter returns
named unsupported before lookup/invocation there, consistent with the current
review sandbox limitation. A Windows artifact pin is not a Windows review claim.

## Shared physical input boundary

`review-toolkit/native-files.ts` exports namespace `ReviewNativeFiles`:

```ts
export function containedPath(root: string, value: string): string | undefined
export function flavor(root: string): typeof posix | typeof win32
export const select: (input: {
  readonly root: string
  readonly files: ReadonlyArray<string>
  readonly extensions: ReadonlyArray<string>
}) => Effect.Effect<
  {readonly status: "ok"; readonly files: ReadonlyArray<string>} |
  {readonly status: "not-run" | "unsupported"; readonly reason: string}
>
```

Use root path flavor, preserving a POSIX backslash as a filename character.
Lexical refusal precedes filesystem access: empty selection, NUL, traversal,
outside root, unsupported path flavor, wrong extension and argument-byte bound
(`Probe.Limits.outputBytes`, as the existing Squawk adapter uses). Then require
the host-native physical root directory and every selected file to be regular,
readable and contained, refusing symlink leaves/parents and external grafts.
Return canonical absolute files in deterministic deduplicated order. Do not scan
cwd, follow a glob, install a tool or enumerate a different file set. Refusals are
named, not uncaught filesystem defects. These preflight checks are not an atomic
filesystem seal against another same-uid process. Do not refactor verified Squawk
code in this slice; its existing tests remain independent regression evidence.

## Adapter and native report

`review-toolkit/packs/ruff.ts` exports namespace `ReviewPackRuff`, `manifest`,
`RULES = ["F821", "F823"]`, `templateId = "ruff-curated-json"`, parser id `ruff`,
status-only `locate`, `environment(input?: NodeJS.ProcessEnv): Record<string, string>`,
effectful `argv({executable, root, files, excluded?})` and
`settle(outcome, root)` matching Squawk's Parsed/not-run result boundary.
`argv` uses the physical helper for `.py` and `.pyi`, removes exact excluded curated
ids before invocation and refuses unknown exclusions or a zero remaining set.
It invokes exactly:

`ruff check --isolated --no-cache --no-fix --no-fix-only --no-preview --ignore-noqa --target-version py311 --output-format json --select <remaining exact codes> --no-respect-gitignore -- <absolute physical files...>`

No source writes, fixes, notebook coverage, cache, target config or project Python
execution. Overriding source noqa keeps diagnostics visible to host triage; it is
not a claim that every ignored warning is a defect. The pinned py311 semantics are
Ruff configuration, not inferred deployed Python. Actual project version, dynamic
names and calling context remain necessary finding evidence. Use the existing
sanitized ResearchProcess environment and remove `RUFF_*` and `PYTHONPATH` keys
case-insensitively in this adapter's `environment` function before invocation.
The generic ResearchProcess environment currently preserves these keys; do not
change unrelated research tools globally or pretend the existing helper removed
them. Tests must exercise the adapter's actual environment boundary.

`ruff-report.ts` exports `parseReport(text, {root})` with the existing Parsed union.
Strictly decode the whole array, known codes only, usable one-indexed integral
row/Unicode-scalar-column ranges, contained paths and nonempty messages. Native
endpoints are exclusive: an end at column 1 on a later row maps to the preceding
inclusive line. Reject reversed/empty ranges, unknown/missing codes, malformed or
mixed reports and `invalid-syntax` as acquisition errors, never a partial clean
report. Preserve raw report bytes before interpretation at the later analyzer seam.
Column values are not byte or UTF-16 offsets. Native fingerprints remain the
existing line-independent host derivation, not model ids.

Settle requires actual completion, bounded nontruncated valid UTF-8 stdout/stderr,
and exact exit/report agreement: exit 0 + empty array clean; exit 1 + nonempty
valid diagnostics obtained. Other exit codes, empty output, stderr diagnostics,
malformed output or contradictory exit/report are not pass/findings. Limits and
absence remain explicit not-run; invocation/output failures are acquisition errors.

## Work ownership and controls

- G1: shared physical helper and its focused filesystem tests only.
- G3: pinned manifest, adapter and report parser only.
- T1: independent parser and real-binary conformance tests only.
- G2: later catalog composition after primitives are source-reviewed; lead owns
  actual analyzer/routing registration. No isolated primitive proves that seam.

Real Linux/macOS controls must show F821 and F823 positives versus benign source,
hostile config/noqa and dirty env independence, Unicode columns/exclusive ends,
bad syntax and bad invocation, no source/cache writes, literal spaces/metacharacter
paths, no-input/escape/symlink refusals and an excluded rule absent while the other
still fires. Provision the pinned binary plus full notice outside a review in CI;
production locate never installs. Missing Linux jail is a failing conformance
acquisition, not a skip. Windows tests assert the named unsupported boundary only.
No local tests, typechecks, builds, generators, benchmarks or evaluations.
