# Gate CLI integration contract

Audience: agents. Status: current.

Load [relay-gate-cli](../.opencode/skills/relay-gate-cli/SKILL.md) and
[relay-integration](../.opencode/skills/relay-integration/SKILL.md).
`bin/relay-gate` evaluates controls; the caller runs the agent and delivers
instructions. It emits outcomes, not Claude hook `decision` responses.

## Invocation and state

```sh
bin/relay-gate eval --sprint /path/to/sprint.json \
  --workdir /path/to/worktree --state /path/to/state \
  --ledger /path/to/state/ledger.jsonl
bin/relay-gate check --sprint /path/to/sprint.json \
  --workdir /path/to/worktree --state /path/to/state
```

| Argument/state | Contract |
|---|---|
| `--sprint`, `--workdir`, `--state` | Required; sprint must exist and workdir must be a directory |
| `--ledger` | Optional; default `<state-dir>/ledger.jsonl`; ensure an override's parent exists |
| `counter` | Integer WP array index, default `0` when absent; incremented on pass |
| `retry_<index>` | Failure counter shared by current-gate and regression failures |
| `base_ref` | Caller-recorded Git commit for `diff: true`; refresh before each state's work |
| `.run.lock` | One evaluation/check per state directory; busy exits `3` |
| `check --position <position>` | Overrides counter; resolve whole WP ID first, then suffix after first dot, including parked/past-end counters |
| `check --base-ref <commit>` | Overrides state `base_ref`; explicit empty string means unavailable, not fallback |

Use a fresh state directory for each run and a fixed WP order. Named position
does not drive `eval`; the `check` override selects a precondition only. The CLI
creates the state directory, but does not validate a whole sprint schema or
repair malformed state. Both override options are rejected in `eval` mode.
Current WP ID/macro and emitted next ID retain decoded CR/LF exactly; IDs must be
nonempty NUL-free strings, macro a NUL-free string or null. `eval` validates next ID
before commands; `check` validates only its selected WP. Named lookup uses raw whole
ID, then raw first-dot suffix, without ARM's miss-only legacy trailing-LF fallback.

## Outcomes and exit codes

| Mode | Exit | JSON outcome | Caller action |
|---|---|---|---|
| `eval` | `0` | `advance` | Counter already advanced; load `next` WP instructions and continue |
| `eval` | `0` | `complete` | Final gate passed, or counter was already past end; audit the trace |
| `eval` | `1` | `gate-fail` | Deliver `reason`/`failing` plus current instructions; retry |
| `eval` | `2` | `escalate` | Stop the run and surface failed controls for human resolution |
| `check` | `0`/`1` | `check` | Current checklist satisfied/failing; no position, retry, or verdict writes |
| `check --position` | `2` | `error`, `error:"unknown-position"` | Repair the requested position; no grading or advancement |
| either | `3` | No outcome required | State directory busy; inspect stderr and retry after owner exits |

Input/usage failures can also exit `1` without outcome JSON. A counter already
past the end returns `complete`, even in `check` mode, without new grading;
`check --position` bypasses that observation. Validate both exit code and payload;
unexpected, absent, or malformed JSON is an integration failure, not a passed gate.
Required verdict/transition appends are fatal: advance/complete records precede
counter writes; gate-fail precedes retry writes; escalate precedes its outcome.
A later state write can still fail after append; there is no atomicity or rollback.

`check` runs only the selected current checklist, not `dod[].cmd` or regression controls.
It still executes commands and judge calls: "no state consequence" does not
mean read-only commands or zero model cost.

## Controls and feature limits

`eval` evaluates the current named `checklist` through the shared core, then
current DoD, earlier deterministic checklist controls, and earlier DoD. Compact
JSONL records keep each control atomic. Decoding preserves tabs, interior LF,
and trailing LF; current and regression paths execute each full NUL-free command
as one Bash program and hash the same full checklist command. Its final exit
status decides acceptance: `false\ntrue` can pass unless the author explicitly
propagates failures. No single-physical-line authoring restriction remains.

Loop-evaluated oracle commands receive EOF on inherited stdin (`</dev/null`) so
they cannot consume following transport records. Explicit pipes, input redirections,
and heredocs inside `cmd` still supply their own input.

Missing/null/empty DoD is optional. Malformed required commands or DoD collections
produce named failures instead of empty passes. Earlier checklist regression fails malformed
collections, undecodable commands, or missing/empty commands without a nonempty string judge.
That judge-only skip checks string type/length, without NUL decoding or complete criterion
validation. Missing/empty/nonstring earlier IDs receive synthetic labels that can accompany
passing commands; earlier assertions are not validated. Checklist and regression
verdicts are ledger entries; DoD commands lack named per-control audit records.
The typed DoD catalog has no dispatcher here. Prefer `checklist[].{id,assert,cmd}`.

Shared-core judge controls support `context`, `paths`, `diff`, exact oracle hashes,
and advisory/blocking behavior. Missing diff context records
`judge:unavailable(no-diff)`; nonzero judge exit or anything other than one JSON
object with a supported `pass`/`fail` verdict records an unavailable `fail`.
These failures block when `blocking: true`; advisory failures remain recorded
without blocking. Judges remain non-independent.
Installed judge JSON additionally emits Boolean `available`, derived from typed
sample state rather than substrings in backend/model/context labels. Calibration
counts only valid exit-0 responses with `available:true`; unavailable is not disagreement.

Partial v2 support includes macro tags, named `check` selection, and shared-core
diff controls. The CLI does **not** implement named `eval` position, kind-specific
injection/review reminders, macro protocol delivery, self-check delivery, round
collapse, blocked-claim handling, arm terminal parking/release, corpus archival,
or compaction hints. It does not switch runner models or record transcript-derived
costs. The caller must provide any required lifecycle behavior.

## Driver recipe

```text
create fresh state; validate plan, tools, workdir, and control IDs
seed brief + map + first WP instructions in the agent prompt
before each new state: record workdir HEAD in state/base_ref if using diff controls
run agent in the exact workdir
capture eval stdout, stderr, and exit code without losing expected nonzero codes
  advance/0   → load next instructions; capture next base before next work
  gate-fail/1 → relay failing IDs and current instructions; keep same base
  escalate/2  → stop and request human resolution
  complete/0  → require usable audit JSON + audit exit 0; require recheck status ok if plan comparison is required
  busy/3      → wait for current evaluation; no duplicate agent turn
  otherwise   → stop with integration error
```

The caller owns escalation state: a later CLI call can pass the same gate if
the artifact changes. Do not resume an escalated run automatically. The lock
protects evaluation, not concurrent agent edits to the workdir. Remove a stale
`.run.lock` only after establishing no evaluation is running.

## Audit and evidence

```sh
bin/relay verify /path/to/state/ledger.jsonl \
  --sprint /path/to/sprint.json --json
```

Require usable JSON and process exit `0`. When plan comparison is required,
also require `oracle_recheck.status == "ok"`. Only an absent discovered/supplied
sprint yields `not-run` and permits recorded-only PASS; an explicitly supplied or
discovered unreadable/malformed/schema-invalid sprint yields `SPRINT-INVALID`, exit `2`.

The audit validates interpreted record fields, final recorded `checklist-item`
verdicts, and terminal completion. Final reports use each control's last checklist
verdict, not its regression verdict. Sprint recheck detects added/unrecorded,
changed, and removed named controls. Legacy graded records without oracle hashes
yield `unverified` / `ORACLE-UNVERIFIED` on comparison unless another defect takes
precedence. Other plan fields and current artifact contents are outside that check;
the audit does not rerun commands.

Strict decoding rejects duplicate keys at any depth, including escaped equivalents,
and requires one final root `h`; writers reject supplied root `h`. Signed-body bytes
are verified unchanged, without reserialization.
Malformed chain JSON/fields produce `TAMPERED`, exit `1`; intact but unusable control
records produce `RECORD-INVALID`, exit `2`, with `record_errors`. Deterministic
non-`pass` verdicts fail acceptance. Runtime and audit preserve decoded trailing LF
in `cmd` and `judge` hashes; the former extraction mismatch is repaired. See
[SPEC §5](../SPEC.md#5-judge-and-computed-artifact-contract) and
[§6](../SPEC.md#6-ledger-and-audit-boundary).

Preserve the plan alongside the trace. Source:
[gate CLI](../bin/relay-gate), [shared core](../lib/relay-gate.sh),
[CLI regression tests](../tests/test_gate_cli.py),
[command transport tests](../tests/test_command_transport.py),
[audit runtime tests](../tests/test_audit_runtime.py).

[Recorded non-Claude harness](fixtures/non-claude-harness.sh) and
[ledger](fixtures/non-claude-harness.ledger.jsonl) are evidence of one run.
The harness has machine-local paths and gateway dependencies; adapt it before
use. It does not establish general model quality. Arm lifecycle differs:
[per-agent arms](per-agent-arms.md).
