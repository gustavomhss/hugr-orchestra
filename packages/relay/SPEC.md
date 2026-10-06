Audience: agents. Status: current.

# Relay — canonical current contract

Use this reference for shipped behavior and terminology. Resolve implementation questions against
[the shared core](lib/relay-gate.sh), [ARM hook](bin/relay-arm-hook.sh),
[CLI](bin/relay-gate), [benchmark hook](benchmark/relay_hook.sh), and
[audit command](bin/relay). Treat design proposals and historical measurements as separate artifacts.
Run commands from the repository root unless a command explicitly sets a child working directory.

Operational guides:
[integration](docs/skills/relay-integration/SKILL.md),
[maintenance](docs/skills/relay-maintenance/SKILL.md),
[ARM hook](docs/skills/relay-arm-hook/SKILL.md),
[gate core](docs/skills/relay-gate-core/SKILL.md),
[gate CLI](docs/skills/relay-gate-cli/SKILL.md),
[audit](docs/skills/relay-audit/SKILL.md),
[profiles](docs/skills/relay-profiles/SKILL.md),
[spec library](docs/skills/relay-spec-library/SKILL.md).

## 1. Terms and driver boundaries

| Term | Contract |
|---|---|
| Sprint | A JSON plan containing an ordered `work_packages` array. |
| Work Package (WP) | One unit of instructions and controls, identified by a stable `id`. |
| Runner | The agent executing a chain. Hooks continue the same context; the CLI does not manage agents. |
| Gate | Evaluation of the current WP and the driver's regression checks. |
| Definition of Done (DoD) | The acceptance requirements. `dod` is also a legacy command array consumed by only two drivers. |
| Checklist control | A named item with a shell `cmd` or semantic `judge` criterion. |
| ARM | A token directory binding one runner to a sprint, metadata, persisted state, and ledger. |
| Macro | A named scope over flat WPs, with optional protocol text. It is not a nested executor or retry loop. |
| Map | The brief and WP titles supplied by the dispatcher for orientation. The ARM hook does not build the opening prompt. |
| Keep-best | A regression-check policy. It does not freeze files, retain snapshots, or roll back work. |
| Retry budget | The number of failure re-blocks allowed before a subsequent failing evaluation escalates. Default: `3`. |

Do not assume the drivers enforce the same contract:

| Driver | Current controls, in execution order | Regression controls | Position |
|---|---|---|---|
| `bin/relay-arm-hook.sh` | Current `checklist` only | Earlier `checklist[].cmd` whose control IDs have a recorded `checklist-item` pass | WP ID in `position`; `counter` is a compatibility mirror |
| `bin/relay-gate eval` | Current `checklist`, then `dod[].cmd` | Every earlier `checklist[].cmd` and `dod[].cmd` | Integer `counter` |
| `benchmark/relay_hook.sh` with `RELAY_GATE=on` | Current `dod[].cmd`, then `checklist` | Earlier `dod[].cmd` only | Integer `counter` |
| `bin/relay-gate check` | Selected WP's `checklist` only | None | Reads `counter` unless `--position` selects a named WP; does not advance |

Current checklist commands, ARM/CLI checklist regressions, and CLI/benchmark current and earlier DoD
commands execute each decoded shell program whole. Compact JSONL carries regression/DoD records
through line readers without splitting embedded tabs or LF. The shared `relay_json_string` helper
assigns decoded strings to caller variables while preserving tabs, interior LF, and trailing LF;
command hashing uses those same exact strings. A command's final shell status decides its verdict:
`false; true` passes, rather than treating each fragment as a separate control.

The benchmark's `RELAY_GATE=off` path advances without checking controls. Each evaluation resolves
at most one WP. All drivers load the plan on each invocation; none provides an immutable plan snapshot
across the separate `jq` reads within an invocation. Coordinate plan writes between evaluations.

## 2. Sprint authoring contract

Author nonempty `work_packages`, unique WP IDs, and globally unique checklist IDs. Supply meaningful
deterministic controls for working states. Runtime scripts do not perform complete schema validation;
missing/null `checklist` and `[]` mean no current controls and can pass. Every nonarray checklist,
including `{}`, `false`, and `""`, is a fatal extraction error before checklist-item execution.

| Field | Current use |
|---|---|
| `brief`, WP `title` | Dispatcher/template metadata; use them in the opening Map. |
| `gen` | Nonnegative plan generation stamped into ledger entries; absent or invalid values resolve to `0`. |
| `retry_budget` | Sprint-wide integer applied per WP. ARM also uses it for its separate regression-only budget. |
| `macros[]` | Optional `{id, title?, instructions?}` declarations. ARM prepends protocol text once on later entry, using `macro_<safe-id>` markers. |
| WP `id`, `macro` | Stable WP identity and optional macro association. Array order remains the execution order. |
| WP `instructions` | Text delivered on advancement by hooks. The dispatcher supplies the first WP's text. |
| WP `self_check` | ARM questions delivered with later WP instructions. Text only: no grading or ledger verdict. |
| WP `checklist` | Ordered controls described below. |
| WP `dod` | Optional `[{"cmd":"..."}]` for the CLI/benchmark; ignored by ARM. These commands do not produce named checklist verdicts. |
| WP `kind`, `file`, `text` | ARM kind declarations and injection payload. See §3. |

There is no implemented typed `file_exists`, `grep`, `grep_absent`, `min_count`, `shell`, `test`, or
`llm` dispatcher. Write shell checks as `cmd` and semantic checks as `judge`. A `type` field does not
select an evaluator. WP `model`, per-item `model`/`rubric`, and `output_contract` do not cause model
switching, rubric handling, or output validation in these drivers. Configure the judge through its
environment; enforce any output contract with an explicit control.

### Checklist fields

| Field | Contract |
|---|---|
| `id` | Required nonempty NUL-free string; stable control ID used for failure feedback, final reports, regression acceptance, and oracle drift. |
| `assert` | Optional report text resolved with `assert // id`; decoded text must be a NUL-free string. It is not the executable oracle. |
| `cmd` | Nonempty shell command takes precedence over `judge`; exit `0` passes, any nonzero exit fails. |
| `judge` | Criterion passed to `benchmark/judge.py` when no nonempty `cmd` exists. |
| `blocking` | Semantic failure blocks only when this resolves to `true`; default `false`. |
| `context` | A path or path array read relative to the gate workdir and supplied to the judge. |
| `diff` | When `true`, append a gate-computed Git diff to the judge context. |
| `paths` | Optional array of NUL-free strings narrowing the computed diff and supplying the recorded scope digest. |
| `origin`, `policy` | Origin attribution: explicit `origin`, otherwise `policy:<policy>`, otherwise `sprint`. |

Run checklist items in their declared order, without short-circuiting on ordinary failures. There is
no automatic mechanical-first reorder. Each `cmd` runs through Bash `eval` in the gate workdir;
stdout/stderr are suppressed. Author commands to fail on missing or malformed evidence and provide
the runner with a separate self-check command for diagnostics. The core supplies no command timeout.

`relay_json_string` accepts exactly one JSON string or `null` (the empty optional value); it rejects
other types and NUL, which Bash cannot represent. Its output variable must be a valid Bash identifier
outside the reserved `__relay_json_string_*` namespace; reserved names fail without assigning the
caller variable. Current checklist IDs and resolved assertions decode losslessly into ledger fields.
Invalid IDs/assertions abort before that control executes.
Invalid commands, missing/invalid judge criteria when no command is available, and invalid judge
scope produce named failures, not unexecuted passes. Empty/null commands can select a valid judge.
CLI/benchmark DoD may be absent, null, or an empty array; declared entries require nonempty NUL-free
string commands. Malformed DoD arrays/entries fail with their declared ID or a synthetic
`dod:<wp>:invalid-array` / `dod:<wp>:<index>:invalid-command` label. These checks are not complete
plan-schema validation. Failure summaries still use delimited text; they are not a lossless ID API.

The CLI decodes current WP `id`, current `macro`, and emitted `next` ID losslessly, including tabs and
interior/trailing LF, into outcomes and applicable ledger fields. Current ID must be a nonempty
NUL-free string; macro may be missing/null/empty or a NUL-free string. Before `eval` runs controls or
writes ledger/counter/retry files, it validates those current fields and the next WP ID when one
exists. It does not prevalidate the next macro or the entire plan. `check` validates only its selected
WP's ID/macro, so invalid future identities do not prevent that check. Directory creation and run-lock
acquisition still precede identity validation. ARM also decodes WP/macro identities losslessly, but
its next-identity validation occurs later in advancement as described in §3. Do not extend either
guarantee to benchmark WP identity extraction.

### Concrete ARM-compatible sprint

```json
{
  "brief": "Produce a machine-readable result and its summary.",
  "gen": 0,
  "retry_budget": 3,
  "macros": [
    {"id": "build", "instructions": "Write artifacts in the assigned workdir. Preserve accepted contracts."}
  ],
  "work_packages": [
    {
      "id": "write-result",
      "macro": "build",
      "title": "Write result",
      "instructions": "Create result.json as a JSON object with status equal to ready.",
      "self_check": ["Which command validates the delivered artifact?"],
      "checklist": [
        {"id": "result-ready", "assert": "result.json declares readiness",
         "cmd": "python3 -c 'import json; d=json.load(open(\"result.json\")); assert isinstance(d, dict) and d.get(\"status\") == \"ready\"'"}
      ]
    },
    {
      "id": "write-summary",
      "macro": "build",
      "title": "Summarize result",
      "instructions": "Write SUMMARY.md explaining the result and its validation.",
      "checklist": [
        {"id": "summary-present", "cmd": "test -s SUMMARY.md"},
        {"id": "summary-grounded", "judge": "Does SUMMARY.md accurately describe result.json? Fail unsupported claims.",
         "context": ["SUMMARY.md", "result.json"], "blocking": false}
      ]
    }
  ]
}
```

This example checks a specific result value and summary presence; it does not establish general
artifact quality. A stub judge is a test double, not a semantic assessment.

## 3. ARM binding, state, and advancement

Read `agent_transcript_path` when it names an existing file; otherwise fall back to `transcript_path`.
Use `RELAY_ARM_TOKEN` if nonempty, otherwise extract distinct `RELAY-ARM:<token>` markers from that
transcript. Markers accept `[A-Za-z0-9_.-]+`; tokens containing `..` or equal to `.` are rejected.
More than one distinct marker is refused, with stderr and exit `0`, rather than guessed. Missing
markers and unknown token directories also exit `0` without a block.

Load `$RELAY_ARMS_DIR/<token>/sprint.json` and `meta.json`. The default arms directory is
`$HOME/.relay/arms`. `meta.workdir` determines command cwd; a nonexistent directory falls back to
`.`. Before binding an owner or writing state, acquire `$ARM/.run.lock` for the whole evaluation.
A held lock returns `3`, stderr only, without grading, binding, release consumption, retry/cursor
updates, or position changes. CLI `eval`/`check` using that same state directory share the lock.
Exit cleanup removes only the invocation's owned run lock and its temporary round buffer.
When the payload includes `agent_id`, persist it on first use and refuse later different IDs.
This is an ownership guard, not the state-directory key or an authenticated identity boundary.

Persist state in files, not hook-process memory. ARM reads raw persisted `position` losslessly and
uses shared `relay_position_index`: raw whole WP ID first, then the raw suffix after its first dot.
Only if both raw lookups miss does ARM retry with trailing LF removed; CR remains identity data.
Current, migrated, and next WP IDs/macros decode as exact NUL-free strings, preserving tabs and all
CR/LF. IDs must be nonempty; macro may be missing/null/empty. Canonical position writes preserve
those strings, prefixing `<macro>.` only when the ID is not already qualified with that exact prefix.
Missing or raw-empty position still migrates from `counter`; a past-end counter marks legacy
completion using the last canonical coordinate, or `?` for an empty plan. Completed observations
exit without a new gate evaluation or completion record. This preserves the legacy empty-plan path.

| Kind | ARM behavior |
|---|---|
| absent / `execute` | Ordinary checklist evaluation; `execute` is omitted from ledger kind tags. |
| `gate` | Declaration only; same checklist behavior. |
| `review` | Ordinary checklist behavior plus a cold-read reminder on advancement into the WP. No fresh context is enforced. |
| `inject` | Read `file` relative to the workdir, or inline `text` when no file is declared; record the file SHA-256 or extracted-inline-text digest, then evaluate its checklist. File wins over text. |
| `human` | Accepted by the profile compiler and lint vocabulary, but unsupported by ARM: record `unknown-kind`, report stderr, exit `0`, leave position unchanged. |

The CLI and benchmark do not execute ARM kind behavior. Missing injection payloads and lost
positions record named defects and allow the runner to stop; they do not advance or automatically
park as `awaiting-human`. Extracted injection text accompanies a successful nonterminal advance
reason; terminal injections and failing checklist/regression rounds do not deliver that text.
The injection event stores a label and digest, not payload bytes. File digests cover original bytes,
while `$(cat ...)` removes trailing LF from the delivered file text. Inline `text` passes through
`$(jq -r ...)`, removing trailing LF before both hashing and delivery. The block reason wraps the
extracted text; neither it nor the event is a lossless record of the original file payload.

On a clean gate and regression pass, ARM validates/decodes next ID and macro in `advance`, before
flushing the buffered passing round or publishing a transition. This is after current commands and
regression evaluation, unlike CLI next-ID prevalidation before commands. Invalid next identity can
therefore leave command effects but does not publish the passing round/advance. Then flush required
passing evidence. For nonterminal advancement, append `advance-reveal` and any required
`compaction-hint` before publishing the next counter/position, entry base ref, or first-entry macro
marker; then block with the next instructions,
macro protocol, and self-check questions. The entry base ref is the workdir's captured Git `HEAD`.
On the last pass, append `sprint-complete` before publishing the terminal counter and `state=complete`,
then attempt archival and exit `0` with no block. Required record failures are fatal; ordering is
not an atomic ledger/state transaction or a rollback guarantee. The author supplies the initial base
ref, instructions, macro text, and self-check in the arm metadata/opening prompt; mark that first
macro as entered if its protocol has already been supplied.

## 4. Failures, repeats, and release

For a current-gate failure, read the prior retry counter. If it is already at `retry_budget`,
escalate; otherwise increment it and re-block. Budget `3` therefore permits three failure blocks
and escalates on the next still-failing evaluation; budget `0` escalates immediately on failure.
ARM regression-only failures use `reg_retry` rather than charging the passing current WP.

ARM buffers checklist/regression verdicts. Identical consecutive failing rounds become
`gate-fail-repeat` entries carrying a round hash and repeat count; counters still increase normally.
Changed, passing, and terminal rounds are flushed in full. Identical rounds alone do not trigger an
early escalation.

ARM scans the selected transcript for the last `RELAY-BLOCKED:` claim, not solely the payload's
final-message field. Record the claim and a diff-based judge corroboration. A claim is `honored`
only if the current checklist failed. It escalates early only when its hash matches the last stored
honored hash for that WP; each new honored claim replaces that stored hash. Honored A/B/A claims do
not match on the final A because B is stored. Persistent transcript text can match on another fire
without a new message. Corroboration is recorded but does not decide escalation; a claim on an
otherwise clean gate does not prevent advancement.

Escalation flushes the terminal round and appends `escalate` before publishing `state=awaiting-human`
and the compatibility `counter=nwp`; it retains position, attempts archival, and exits `0` without a
block. Required append failure is fatal instead of publishing that disposition. Subsequent fires
do not recheck a parked arm unless `release` contains a non-whitespace character after normalization.
The normalizer removes CR,
converts LF to ASCII spaces, and trims leading/trailing ASCII spaces; the acceptance check rejects
whitespace-only text, including tabs. Operators MUST supply a real reason identifying who and why.
Resolve the full plan WP ID and append required `human-release` evidence before consuming the release
file, resetting budget/round keys, setting `active`, or restoring the counter. Append failure leaves
the release pending and the parked disposition intact. Release evaluates the same WP again; it does
not waive or skip its controls. Cleanup clears its sanitized retry/round/repeat/blocked-claim keys,
the legacy index retry, and `reg_retry`, and restores the compatibility counter to the resolved index.
Qualified/dotted IDs use the same keys as evaluation. An unresolved
position leaves the release file intact. There is no authenticated approval enforcement; the same
OS user can write the release and other state files.

ARM's once-per-arm cap preflight compares `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` (default/fallback `8`)
with the implemented estimate `len(work_packages) + 1`. A too-small nonzero cap records `cap-risk`
and prefixes that invocation's next block with a warning. It does not refuse evaluation or change the
harness cap. Set the cap before launching the harness; `0` requests an uncapped hook chain.
Relay skips its cap-risk comparison when the cap is `0`; it does not enforce the harness's response.

## 5. Judge and computed-artifact contract

[The judge](benchmark/judge.py) emits `{verdict, reason, backend, available}` and normally exits `0`
for both pass and fail. Additive `available` is a boolean derived from typed `_Sample`/`_Ballot`
state; unavailable ballots report fail/false, while answered pass/fail and stub verdicts report true.
Public `judge_api`/`judge_cli` still return `(verdict, reason, backend)` three-tuples. Choose
`RELAY_JUDGE_BACKEND=stub|api|cli`; otherwise select API only when
`ANTHROPIC_API_KEY` is set, else stub. `RELAY_JUDGE_API_KEY` alone does not auto-select API.

- Stub: force `pass`/`fail` with `RELAY_JUDGE_STUB`, or require `RELAY_JUDGE_OK` in every supplied
  file. No files means fail. It does not evaluate the criterion.
- API: use the Messages API, `RELAY_JUDGE_MODEL` (default `claude-sonnet-4-6`), optional base URL
  and API key. Prefer the forced `submit_verdict` tool; fall back to a verdict line.
- CLI: invoke authenticated `claude -p` with the configured judge model and parse a verdict line.
  This does not change the runner model.
- API/CLI votes: `RELAY_JUDGE_VOTES` defaults to `1` and is clamped to at least one. Strict majority
  passes; ties fail. Internal typed samples carry answered/no-verdict/error availability, backend,
  model, and truncation cuts separately. An unavailable sample aborts the ballot with fail and
  discards earlier votes, including when context was truncated. Truncation alone remains a vote on
  partial evidence. Backend display tags are rendered metadata, never parsed to decide availability:
  model aliases and filenames may contain `(no-verdict)`, `(truncated:...)`, or other tag-like text.
- API/CLI context: read at most `RELAY_JUDGE_MAX_CTX` characters per file (default `120000`),
  announce cuts to the judge, and append `(truncated:<names>)` to backend tags. Missing files become
  `(file not found)`. Stub reads full files. API reply budget defaults to `8192` tokens.

Judge entries are non-independent, including when the prompt calls the judge an independent auditor.
The shared core accepts exactly one JSON response object with verdict `pass` or `fail`, and requires
judge-process exit `0`. Empty/malformed output, missing/unsupported verdicts, multiple response
objects, or an invalid backend string record `fail` with
`judge:unavailable(invalid-response)(non-independent)`. Nonzero process exit records
`judge:unavailable(exit-<status>)(non-independent)` even if stdout says pass. Such response/transport
failures block when `blocking=true`; an advisory item still records failure but does not block.
Invalid declared criteria/scope are plan-control failures as described in §2. Do not substitute a
judge for a deterministic control.
The core permits additive response fields and does not validate `available` or require `reason`;
its installed acceptance remains process status plus object/verdict/backend validation. The judge's
own unavailable fail cannot pass a blocking item, but the core does not independently enforce the
new availability field on arbitrary judge output.

[Calibration](benchmark/calibrate_judge.py) requires process exit `0`, one valid JSON object with
pass/fail verdict, a NUL-free backend string, a string reason, and `available is True`. Invalid or
unavailable measurements are excluded from TP/TN/FP/FN and agreement; all-invalid input reports
`unavailable (no valid judgments)`. Backend labels are not substring-classified, including reserved-
looking model aliases. Import does not run calibration/model calls, though fixture metadata loads.
Calibration reports agreement; it is not an exit-code quality gate or evidence of review independence.

For `diff=true`, compute tracked changes with `git diff <base_ref>`, then append nonignored untracked
files as no-index diffs against `/dev/null`, without changing the Git index. Respect `paths` if
supplied; paths are whitespace-split. An empty valid diff is still sent to the judge. Missing base,
non-Git workdir, or invalid commit ref records `fail` / `judge:unavailable(no-diff)`; it blocks only
when the item is blocking. ARM reads `base_<safe-wp-id>`, falling back to `meta.base_ref`; the CLI
reads `<state>/base_ref`, maintained by its harness, unless `check --base-ref` explicitly overrides it.
The benchmark does not establish a base ref. Failed untracked-diff appends remain tolerated.

CLI check-only flags are `--position <position>` and `--base-ref <commit>`. Named position uses
`relay_position_index`'s exact-ID-first, first-dot-suffix rule and overrides stale, parked, or past-end
counters. An unknown position returns exit `2` and
`{outcome:"error", error:"unknown-position", position:...}`. An explicit `--base-ref ""` suppresses
state-file fallback and yields unavailable diff evaluation; it fails a blocking diff check. `eval`
rejects either check-only flag with usage exit `1`. `check` does not charge retries, advance, or write
verdicts; commands/judges, state-directory creation, locking, and temporary diffs still have side effects.

Expand `${name}` in judge context/scope paths from environment values without shell evaluation;
leave unset names literal. Hash deterministic checklist oracles from the extracted command before
execution. Hash judge oracles from the extracted criterion plus ` :: ` and extracted space-joined
`paths` when present, before environment expansion. Exact JSON decoding preserves trailing LF in
commands, criteria, and joined scope, matching audit recomputation for new records. The old
trailing-LF stripping and regression-fragment hashing defects are historical; retained ledgers written
by those paths can still show mismatches and must not be rewritten. `context`, `diff`,
`blocking`, model, and base ref are not included in that oracle hash. ARM/CLI optionally record
`scope` and `artifact`, a digest of declared path names and file contents/absence markers, not of the
computed diff itself. The benchmark checklist envelope omits those optional fields.

## 6. Ledger and audit boundary

Every shared-chain append adds `gen`, `prev` (`GENESIS` initially), zero-based `seq`, `mac`, and `h`.
Hash the compact JSON body before appending the final root `h`. Caller append bodies must not contain
top-level `h`, even null; nested data such as `data.h` remains allowed. Verification rejects duplicate
decoded keys at every object nesting level, including escaped-equivalent keys, and requires exactly
one final root `h` with the writer's `,"h":` delimiter. It verifies original signed body bytes without
reserializing parsed JSON; nested `h` cannot stand in for the root digest or authorize a suffix.
The shared verifier/audit ledger decoder also rejects unquoted `NaN`, `Infinity`, and `-Infinity`
at any depth through `parse_constant`. Quoted strings with those spellings and valid lexical JSON
numbers such as `1e999` remain allowed. This is token rejection, not arbitrary numeric exactness
or complete finite-valued schema validation.
A `mkdir` lock at the ledger parent's `.chain.lock` serializes appends. CLI evaluations and checks
hold `<state>/.run.lock`; ARM holds `$ARM/.run.lock` before its state writes. These evaluation locks
exclude competing invocations using the same
directory; they do not prevent an external writer from editing plans or state. Preserve one runner
per arm.

With nonempty `RELAY_LEDGER_KEY`, use HMAC-SHA256; otherwise use SHA-256. Mode is stamped in the
hashed body. Verification rejects mismatched mode, wrong/missing key, broken links, and sequence or
hash changes. Legacy entries without `mac` are treated as plain SHA-256. Plain mode can be fully
resealed by a writer. HMAC resists resealing only when the producer cannot obtain the key or use the
trusted writer to seal fabricated evidence. Supplying the key in a same-user process environment
does not create that separation. Relay does not sandbox the runner, protect gate commands from
edits, or authenticate plan/state writers.

Tail removal leaves a valid prefix in either mode. Anchor the latest head elsewhere to establish
trace completeness. `relay_chain_append` requires exactly one JSON object without top-level `h`;
malformed, empty, nonobject, multiple, or root-`h` bodies return nonzero without an append and release
the owned chain lock. Writer validation is not the verifier's duplicate-key check.
Lock and write failures also return nonzero with diagnostics. Shared checklist evaluation propagates
`ledger_item` failure as fatal, stopping later controls. CLI regression verdicts and ARM buffered
verdict writes/flushes are also required evidence. For evaluated transitions, each driver's mandatory
disposition records are fatal and precede publication of their corresponding transition/budget state:

| Driver | Required record ordering |
|---|---|
| ARM | Flush applicable rounds, then `sprint-complete` before terminal counter/state; `advance-reveal` and any `compaction-hint` before next counter/position/base/macro marker; `gate-fail`/`gate-fail-repeat` before round/repeat metadata and current/regression retry updates; `escalate` before parking; `human-release` before release consumption and reset/reactivation. |
| CLI `eval` | Checklist/regression verdicts must append; `sprint-complete`/`advance-reveal` precede counter publication; `gate-fail` precedes retry writes; `escalate` precedes outcome JSON without creating an ARM-style parked state. |
| Benchmark hook | Required checklist and disposition writes propagate failure despite no general `errexit`; `sprint-complete`/`advance-reveal` precede counter publication even ungated; `gate-fail` precedes retry writes; `escalate` precedes normal no-block exit. |

This is not atomic publication, fsync-backed durability, or rollback: command side effects and ARM
binding/usage/bookkeeping may occur earlier, partial ledger prefixes can remain, and a later state
write can fail after its record appended. ARM ancillary `cap-risk`, `inject`/`inject-missing`,
`unknown-kind`, and `blocked-claim` append paths still tolerate errors; terminal archives remain
best-effort. Do not infer a complete archive or successful filesystem publication from an intact ledger.

| Command | Exit/output contract |
|---|---|
| `bash bin/relay-arm-hook.sh` / benchmark hook | Normal control paths exit `0`. A JSON `decision:block` requests continuation; empty stdout also occurs on completion, escalation, no binding, and plan defects. No `decision:allow` is emitted. ARM lock busy returns `3`, stderr only. Fatal shell/tool/core errors can be nonzero without a structured verdict. |
| `bash bin/relay-gate eval ...` | `0`: JSON `advance`/`complete`; `1`: JSON `gate-fail`; `2`: JSON `escalate`; `3`: lock busy, stderr only. Usage/input failures can also return `1` without outcome JSON. Escalation does not persist an ARM-style parked state. |
| `bash bin/relay-gate check ...` | `0`/`1`: JSON `check` with selected checklist failures; no retry, advance, or verdict write. Without named position, past-end counter returns `complete`. Unknown named position returns `2` with error JSON; busy returns `3`, stderr only. It still runs command/judge side effects and creates/locks the state directory. |
| `python3 benchmark/verify_ledger.py <ledger>` | `0`: structural integrity, including an empty ledger or valid nonterminal prefix; `1`: broken/refused chain; `2`: usage or missing ledger. A nonterminal prefix gets a note, not a failing exit. |
| `python3 bin/relay verify <dir-or-ledger> [--sprint <file>] --json` | `0`: intact, usable, terminal completed record with recorded deterministic controls all `pass` and no detected drift or failed requested comparison; `1`: chain not intact; `2`: intact but unauditable, or usage/missing ledger. |

`relay verify` takes each control's last `checklist-item` verdict, not its regression verdict, for
the control report. It checks oracle drift across both checklist and regression events and compares
recorded oracles and named IDs with a reachable current sprint. IDs from checklist and regression
events are compared in both directions: added/unrecorded, removed, and changed-oracle controls yield
`SPRINT-DIVERGED` / exit `2`. A bare ledger without `--sprint`, or a directory without a discovered
sprint, has `oracle_recheck.status=not-run`; a recorded-only PASS is possible and explicitly scoped.
A requested/discovered unreadable, malformed, or unusable sprint is `SPRINT-INVALID` / exit `2`, not
`not-run`. Legacy graded records with absent oracle fields still participate in ID comparison;
an otherwise matching reachable sprint yields `ORACLE-UNVERIFIED` / exit `2` rather than full agreement.

Verification validates interpreted audit fields separately from chain integrity. Intact records with
unusable fields yield `RECORD-INVALID` / exit `2` and `record_errors`; missing oracle is legacy, but a
present malformed/empty oracle is invalid. Malformed JSON/nonobject chain records yield `TAMPERED`
/ exit `1` through the offline verifier, with a structured `verify --json` result for those cases.
Broken integrity takes precedence over record/sprint validity. Other JSON labels remain `NO-CONTROLS`,
`CONTROL-FAIL`, `ORACLE-CHANGED`, `ORACLE-DRIFT`, `ESCALATED`, and `TRUNCATED`. Every final deterministic
verdict other than `pass`, including legacy `advisory`, is a failure. Judge verdicts do not independently
affect the exit. This checks recorded verdicts and named ID/oracle agreement, not fresh artifact
validity, authenticated reviewer independence, every WP's completion, DoD coverage, or every plan field.

`python3 bin/relay problems <dir-or-ledger> --json` returns `1` for derived problems, `0` otherwise,
and `2` for usage/missing ledger. Gate-failing/regression views follow the last gate event;
plan-defect events remain reported, and a prior escalation remains reported until final completion.
`python3 bin/relay cost <dir-or-ledger> --json` reports recorded ARM usage/time, with `total=null`
when unmeasured; its data is not a cost estimate for CLI/benchmark runs.
`bin/relay` shares the verifier's duplicate-rejecting ledger decoder. Unlike `verify`, `problems` and
`cost` load entries without integrity or audit-schema checks; malformed input can still fail without
structured JSON. Handle absent/unparseable output as an execution failure, not a verdict.

See [architecture](docs/architecture.md), [authoring](docs/authoring-sprints.md),
[configuration](docs/configuration.md), and [gates](docs/gates.md) for focused references.
