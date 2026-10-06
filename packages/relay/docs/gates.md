Audience: agents. Status: current.

# Gate and verdict reference

Use [SPEC.md](../SPEC.md) for canonical fields and driver contracts. Use
[relay-gate-core](skills/relay-gate-core/SKILL.md),
[relay-gate-cli](skills/relay-gate-cli/SKILL.md), and
[relay-audit](skills/relay-audit/SKILL.md) for operational work.

## 1. Executable controls

[`relay_run_checklist`](../lib/relay-gate.sh) iterates `checklist` in array order. A nonempty `cmd`
takes precedence; otherwise invoke the judge criterion. Do not expect automatic mechanical-first
sorting, ordinary-failure short-circuiting, or a typed DoD dispatcher.

| Shape | Evaluation | Advancement effect |
|---|---|---|
| `{"id":"C1","cmd":"..."}` | Bash `eval` in gate workdir, suppressed stdout/stderr; `0` -> pass, nonzero -> fail | Always blocking on failure |
| `{"id":"J1","judge":"...","context":["..."]}` | Exit-0 `benchmark/judge.py` plus exactly one valid pass/fail JSON object | Advisory by default; unavailable response records fail without blocking |
| Same judge with `"blocking":true` | Same evaluation, still non-independent | Blocks on fail, including response/transport unavailability |
| `dod: [{"cmd":"..."}]` | Separate CLI/benchmark shell loop | Blocking there; ignored by ARM |

Fields such as `type=file_exists`, `type=min_count`, or `type=llm` have no evaluator. Implement a
requirement as a shell command or judge control. `assert` is report text, not proof; `model`,
`rubric`, and `output_contract` do not activate per-item behavior.

Malformed/empty/multiple judge responses, missing or unsupported verdicts, and invalid backend strings
record `fail` / `judge:unavailable(invalid-response)(non-independent)`. A nonzero judge process records
`fail` / `judge:unavailable(exit-<status>)(non-independent)`, even with pass JSON on stdout. These
failures block a blocking control; actual advisory-response failures remain nonblocking but never
become an `advisory` verdict. Missing computed diff records `fail` / `judge:unavailable(no-diff)` under
the same blocking policy. Keep a deterministic oracle alongside semantic controls and verify judge
configuration independently.

The shared `relay_json_string` helper rejects nonstring/NUL values instead of coercing or truncating
them; `null` represents an empty optional string. Current IDs must be nonempty; invalid IDs and
resolved assertions abort before that item's execution. Invalid commands, missing/invalid criteria
without a usable command, and invalid scope are named failures regardless of the semantic blocking
flag. Empty/null commands can select a valid judge. Optional DoD may be absent/null/empty; malformed
arrays or entries and empty/nonstring/NUL commands fail with a declared ID or synthetic
`dod:<wp>:invalid-array` / `dod:<wp>:<index>:invalid-command` label. This is not complete plan validation.
`relay_json_string` also rejects output names under reserved `__relay_json_string_*`, leaving the
caller variable unchanged. Missing/null `checklist` and `[]` are valid empty control lists; every
nonarray, including `{}`, `false`, and `""`, is fatal before checklist-item execution.

Commands run in each item's subshell. Environment/shell state changed by one item does not configure
the next item. Filesystem side effects persist. No gate-core timeout is supplied. Failure feedback
names checklist IDs; legacy DoD failures use the command suffix after its last `::`, or the command
itself. The drivers do not capture and forward command diagnostics as detailed failure explanations.

## 2. Driver order and regression reach

| Driver | Current WP | Earlier WPs |
|---|---|---|
| ARM | Checklist | Deterministic checklist commands whose IDs have a recorded checklist pass |
| CLI `eval` | Checklist, then DoD commands | All deterministic checklist and DoD commands |
| Benchmark gated | DoD commands, then checklist | DoD commands only |
| CLI `check` | Checklist only | No regression checks |

Current checklist, ARM/CLI checklist regression, and CLI/benchmark current/earlier DoD execute each
decoded command whole. Regression/DoD loops carry compact JSONL records through line readers and
decode with `relay_json_string`; tabs and interior/trailing LF stay inside their original strings.
Current checklist IDs/assertions and ARM regression membership retain exact decoded strings, as do
command hashing inputs. The final shell status decides pass/fail: `false; true` passes. Failure-summary
delimiters are still presentation text, not a lossless encoding of arbitrary IDs.
Regression/DoD transport-loop commands receive EOF on stdin by default to protect JSONL records; explicit pipes or heredocs inside `cmd` still supply input.

ARM regression uses the current plan's earlier controls and the set of previously passed control
IDs, not a frozen accepted command snapshot. A new control inserted before the cursor without a
recorded pass is not reclassified as a regression. An accepted control moved after the current cursor
is outside earlier-WP regression reach. Selected earlier commands execute and hash whole. Judges are
never deterministic regression controls. ARM skips null/empty earlier commands, but invalid
nonstring/NUL command decoding aborts. CLI records named regression failures for malformed earlier
checklist collections, undecodable commands, or missing/empty commands without a nonempty string
judge. Missing/empty/nonstring earlier IDs receive synthetic labels; a valid command can still pass
under that label. Earlier assertions are not validated. Judge-only controls are skipped by checking
for a nonempty string, without NUL decoding or complete criterion validation. Neither policy is
complete plan-schema validation.

Keep-best means refusing clean advancement when selected earlier checks fail. It does not prevent
file edits, restore a last-good artifact, roll back a failed WP, or prove every historical requirement
still holds. CLI/ARM checklist re-runs produce `regression-item` events; legacy DoD checks contribute
failure strings rather than individually named verdicts. Benchmark does not re-run earlier checklist
controls or write their regression verdicts.

ARM injection records a label and digest before gate evaluation, not payload bytes. Extracted text
appears only in a successful next-WP block; failing rounds and terminal injection states do not
deliver it. File SHA-256 covers original bytes, but `$(cat ...)` strips trailing LF from delivered
text. Inline `$(jq -r ...)` strips trailing LF before hashing and delivery. Wrapped block text and
the digest-only event do not provide lossless file-payload transport or retention.

## 3. Semantic judge behavior

[`benchmark/judge.py`](../benchmark/judge.py) normally prints one JSON object and exits `0`, whether
its verdict is `pass` or `fail`. JSON includes additive boolean `available` from typed `_Ballot`/
`_Sample` state: answered pass/fail and stub results are true; unavailable ballots fail with false.
Public `judge_api`/`judge_cli` preserve `(verdict, reason, backend)` three-tuples. It returns backend
tags that the core prefixes with `judge:` and suffixes with `(non-independent)`. The auditor wording
in its prompt does not establish independence.

| Backend | Acceptance and failure behavior |
|---|---|
| `stub` | Forced `RELAY_JUDGE_STUB=pass|fail`, otherwise every supplied file must contain `RELAY_JUDGE_OK`; no files fails. Criterion is ignored. |
| `api` | Messages-compatible endpoint; prefer forced `submit_verdict`, fall back to a verdict line. Network/auth errors return fail / `api-error`. |
| `cli` | Authenticated `claude -p` with configured judge model; parse a verdict line. Process/transport errors return fail / `cli-error`. |

Backend precedence: explicit `RELAY_JUDGE_BACKEND`, otherwise API with `ANTHROPIC_API_KEY`, otherwise
stub. Set `RELAY_JUDGE_BACKEND=api` when using only a custom endpoint/key. Defaults and environment
fields are in [configuration](configuration.md#judge-settings).

API/CLI voting takes `RELAY_JUDGE_VOTES` samples, strict majority passes, and ties fail. API/CLI
sampling uses typed internal answered/no-verdict/error state, backend kind, model, and truncation
cuts. Unavailable samples abort the ballot with fail and discard earlier votes; answered samples on
truncated evidence still count. Backend display tags are rendered from those fields, not parsed back
into voting state. Model aliases/filenames containing `(no-verdict)`, `(truncated:...)`, error-like
text, or tally-like text cannot change availability. Do not infer parser state by splitting display
labels. API tool verdicts require `pass`/`fail` plus a string reason; prose fallback accepts a trimmed,
case-normalized exact `VERDICT: PASS` / `VERDICT: FAIL` line. A malformed
last verdict declaration is unavailable, not a substring pass or a fallback to an earlier declaration.
Votes are separate samples, not independently authenticated reviewers.

API/CLI reads cap each file at `RELAY_JUDGE_MAX_CTX` characters and announce/tag truncation. Missing
files become `(file not found)` context; no context becomes `(no artifact provided)`. The stub reads
full files rather than this truncated context. Neither `pass` nor a high vote margin establishes a
deterministic contract. Read infrastructure tags separately from semantic rejection.

The core accepts additive judge response fields but does not validate `available` or require reason;
do not confuse its process/object/verdict/backend contract with calibration's stricter acceptance.
[`calibrate_judge.py`](../benchmark/calibrate_judge.py) requires process exit `0`, one JSON object,
pass/fail verdict, NUL-free backend string, string reason, and `available is True`. Invalid/unavailable
measurements are excluded from TP/TN/FP/FN and agreement; all-invalid input reports
`unavailable (no valid judgments)`. No backend substring classifier is used, even for tag-like model
aliases. Its import guard prevents calibration/model calls on import; fixture metadata still loads.
Agreement is a report, not an exit-code quality gate or independent-review proof.

## 4. Computed diffs and recorded scope

For `diff=true`, the core appends a computed artifact to any declared `context`. The artifact contains
tracked changes from `git diff <base_ref>` and no-index diffs for nonignored untracked files, respecting
optional `paths`. It covers committed and uncommitted tracked work relative to the supplied commit
without changing the index. An empty valid diff is still graded.

| Driver | Base-ref source |
|---|---|
| ARM first WP | Author-supplied `meta.base_ref`, captured before the runner works |
| ARM later WPs | `base_<safe-wp-id>` stamped from workdir `HEAD` on advancement; metadata fallback |
| CLI | Harness-supplied `<state>/base_ref`, unless `check --base-ref` explicitly overrides it; CLI does not update it automatically |
| Benchmark | No base-ref initialization; do not assume its hook supports meaningful diff review without additional environment setup |

No base ref, non-Git workdir, invalid commit ref, or failed tracked diff command records
`fail` / `judge:unavailable(no-diff)`. Advisory diff controls still only advise. Untracked diff append
errors are tolerated by the current helper; do not claim a complete fail-closed transport guarantee.
The helper's path list is whitespace-split, so avoid relying on paths with spaces in `paths`.

`check --position <position>` selects a WP by exact ID first, then suffix after the first dot, instead
of `counter`. This also checks named parked/past-end positions. Unknown position returns exit `2`
with `{outcome:"error", error:"unknown-position", position:...}`. Explicit `--base-ref ""` suppresses
state-file fallback and yields unavailable diff, failing a blocking item. `eval` rejects both flags
with usage exit `1`. Check writes no verdict, charges no retry, and does not advance; commands,
judges, temporary diffs, directory creation, and `.run.lock` acquisition still have side effects.
CLI current `wp`/`macro` and emitted `next` identities retain exact tabs/interior/trailing LF in
outcomes/applicable ledger fields. Eval prevalidates current ID/macro and next ID before controls or
ledger/counter/retry effects; check validates only selected ID/macro, not malformed future identity.
Current/next IDs must be nonempty NUL-free strings; macro is optional/null/empty or a NUL-free string.
Directory/lock creation precedes validation; future macros and full-plan schema are outside it.
ARM also preserves raw position and current/migrated/next ID/macro strings, including CR/LF. Raw
whole-ID lookup precedes raw first-dot suffix; only a raw miss allows trailing-LF cleanup, preserving
CR. Next ID/macro validation occurs in `advance` after current/regression commands but before buffered
passing-round flush and transition publication. It is not CLI-style pre-command validation.
Missing/raw-empty position and legacy empty-plan completion retain their migration behavior.

For judge context/scope, `${name}` expands from environment data without `eval`; unset names remain
literal. `context` accepts one string or an array. Scope's raw path strings remain in the oracle hash
and ledger even when expanded values differ.

- Deterministic checklist `oracle`: SHA-256 of extracted `cmd` before execution.
- Judge `oracle`: SHA-256 of extracted criterion plus optional ` :: ` and extracted space-joined
  `paths`, before environment expansion.
- `origin`: explicit origin, otherwise `policy:<bundle>`, otherwise `sprint`.
- ARM/CLI `scope`: declared raw paths when nonempty.
- ARM/CLI `artifact`: SHA-256 over ordered declared path names and each file digest or absence marker.
  It does not hash the computed diff or all context files. Benchmark omits scope/artifact fields.

Exact JSON decoding retains trailing LF in commands, criteria, and joined scope, matching audit
recomputation for new records. Old gate versions stripped trailing LF or hashed regression fragments;
their retained ledgers can still show false drift/divergence. Those serialization defects are
historical, not a current single-line/trailing-LF authoring restriction. Preserve old ledger bytes.

Oracle drift detection does not cover changes to `context`, `diff`, `blocking`, model, or
base ref. Select artifact scope as part of control design; do not equate unchanged oracle hashes
with identical evaluation conditions.

## 5. Retry, collapse, escalation, and release

The driver reads the prior failure count before deciding whether to re-block. `retry_budget=3` allows
three failure blocks and escalates on the next still-failing evaluation. `0` escalates immediately.
ARM regression-only failure uses its own `reg_retry` counter; CLI/benchmark charge the current index's
single retry counter for current or regression failures.

ARM cap preflight warns only when the nonzero cap is below its `len(work_packages)+1` estimate.
Cap `0` skips that comparison. Relay neither enforces the harness cap nor guarantees completion.

ARM hashes buffered verdicts and failure sets to identify rounds. It records the first failing round
in full, counts identical nonterminal rounds as `gate-fail-repeat`, and flushes passing/terminal
rounds in full. Collapse does not stop re-evaluation, reset retry counts, or escalate early.

`RELAY-BLOCKED:` is the early-escalation exception. ARM extracts the last matching claim from the
selected transcript, records it and a diff-based corroboration, and honors it only when the current
checklist failed. It parks early when that claim's hash equals the last stored honored hash for the
current WP, regardless of corroboration. Each new honored claim replaces the stored hash; A/B/A
does not match on the final A. A persistent transcript marker can match on another fire without a
new message. Unmatched claims use ordinary retry handling; a claim alone does not satisfy or fail
a gate.

ARM parks by flushing required round evidence, recording `escalate`, setting `awaiting-human`,
retaining position, and emitting no block with exit `0`. Operators MUST supply a real who/why release
reason. The engine removes CR,
converts LF to ASCII spaces, trims leading/trailing ASCII spaces, and requires a non-whitespace
character; tabs-only and other whitespace-only reasons are rejected. Required `human-release` evidence
must append before an accepted release is consumed or its state reset/reactivated; failed append
leaves the reason pending and parked disposition intact. Then the same gate runs again. No failed
control is waived, and no actor identity is authenticated.
Release resolves the full plan WP ID, clears its sanitized retry/round/repeat/blocked-claim files,
the legacy index retry and `reg_retry`, and restores the counter to that index. Qualified/dotted IDs
use the same keys as evaluation. If position cannot resolve, release stays on disk for repair.

CLI `eval` emits `escalate` with exit `2` but does not persist a parked state. Benchmark escalation
emits no block with exit `0`, does not advance its counter, and can evaluate again on another fire.
Do not interpret hook-process exit `0` or empty stdout as an acceptance verdict.

ARM and CLI `eval`/`check` share the `.run.lock` convention. A held `$ARM/.run.lock` returns exit `3`
with stderr before owner binding, release/cursor/retry/position writes, or grading. CLI calls using
that directory are also excluded. Exit cleanup removes owned locks and ARM round buffers only.
The separate `.chain.lock` protects each append. Malformed append bodies return nonzero and release
that lock; a failed `ledger_item` aborts the shared checklist. CLI regression writes and ARM verdict
buffers/flushes also propagate failure. Mandatory disposition writes now fail fatally before their
corresponding evaluated transition publication: all three drivers record completion/advance before
terminal/next counters and state, and gate failure before retries. ARM records compaction hints before next-state publication,
round/repeat metadata after failure disposition records, escalation before parking, and release before
consumption/reset/reactivation. CLI escalation records precede its JSON outcome without a persistent
park latch; benchmark escalation records precede normal no-block exit without advancing its counter.

This is not atomic publication, rollback, or fsync-backed durability. Commands, ARM binding/usage/
bookkeeping, and earlier appends may already have effects; state writes can fail after the required
record succeeds. Ancillary ARM cap-risk, injection/inject-missing, unknown-kind, and blocked-claim
appends still tolerate errors; archives remain best-effort. See
[SPEC ordering matrix](../SPEC.md#6-ledger-and-audit-boundary) for exact transition scope.

## 6. Audit interpretation

Run from the repository root:

```bash
python3 bin/relay verify runs/arm --json
python3 bin/relay verify runs/ledger.jsonl --sprint runs/sprint.json --json
python3 bin/relay problems runs/arm --json
```

These paths represent retained evidence supplied by the caller. `verify` locates a run's
`.relay-state/ledger.jsonl` or an arm's top-level `ledger.jsonl`. Exit `1` means chain integrity did
not validate. Exit `2` means an intact record cannot be certified: unusable audit fields, unusable
requested/discovered sprint, no deterministic controls, any final deterministic verdict other than
`pass`, nonterminal end, escalation, oracle drift, changed/removed/added named controls, or incomplete
legacy oracle comparison. Usage/missing ledger also returns `2`. `0` reports recorded deterministic
verdicts passed and chain intact, with either recorded-only or named-ID/oracle-comparison scope;
it does not revalidate current artifacts or universal requirement coverage.

Final control verdicts use the last `checklist-item` per ID; `regression-item` participates in drift
analysis but does not overwrite the control list. A bare ledger needs `--sprint` for current-plan
comparison. No requested/discovered sprint produces `oracle_recheck.status=not-run` and permits a
scoped recorded-only PASS. An unreadable, malformed, or unusable requested/discovered sprint is
`SPRINT-INVALID` / exit `2`. ID comparison includes both checklist and regression events and detects
added/unrecorded as well as removed controls; changed available hashes also yield `SPRINT-DIVERGED`.
Legacy events with absent oracles participate in ID comparison but, when otherwise matching a current
sprint, yield `ORACLE-UNVERIFIED` / exit `2`. A present malformed/empty hash is `RECORD-INVALID`, not legacy.

Chain-valid but unusable audit fields yield structured `RECORD-INVALID` with `record_errors` / exit `2`.
Malformed JSON/nonobject chain input yields structured `TAMPERED` / exit `1` for `verify --json`.
Duplicate decoded object keys at any depth, including escaped-equivalent spellings, are refused by
the verifier and audit loader. Each entry requires exactly one final root `h` with its writer's
`,"h":` delimiter; unsigned suffix fields and ambiguous members fail integrity verification.
Append bodies cannot supply top-level `h`, even null, while nested `data.h` remains ordinary data.
Signed-body verification uses original bytes, not reserialized JSON; do not rewrite old evidence.
That shared verifier/audit decoder rejects unquoted `NaN`, `Infinity`, and `-Infinity` at any depth
through `parse_constant`; quoted strings and valid lexical JSON numbers such as `1e999` remain
allowed. This is not arbitrary numeric exactness or complete finite-valued schema validation.
Integrity failure dominates validity errors. Other JSON labels remain `NO-CONTROLS`, `CONTROL-FAIL`,
`ORACLE-CHANGED`, `ORACLE-DRIFT`, `ESCALATED`, and `TRUNCATED`; see [SPEC §6](../SPEC.md#6-ledger-and-audit-boundary)
and the [audit skill](skills/relay-audit/SKILL.md). Judges are reported but never counted
as deterministic controls, even when they blocked runtime advancement. DoD coverage, every WP's
completion, non-oracle fields, and fresh artifact validity remain outside this comparison.

`problems` derives views from the chain. Current gate failures/regressions clear on later advancement;
plan-defect events remain visible, and any prior escalation is still reported until final completion.
This is not a complete live-state or authenticated approval view. Check
[SPEC §6](../SPEC.md#6-ledger-and-audit-boundary) for hash-mode, tail-anchor, and same-user trust limits.
`problems`/`cost` share duplicate-rejecting decoding but load entries without integrity/schema
validation; malformed input may still fail without structured JSON. Missing/unparseable output is
an execution failure, not an audit verdict.
