Audience: agents. Status: current.

# Architecture reference

Use [SPEC.md](../SPEC.md) as the canonical current contract. Use operational skills for
[ARM changes](../.opencode/skills/relay-arm-hook/SKILL.md),
[core changes](../.opencode/skills/relay-gate-core/SKILL.md),
[CLI changes](../.opencode/skills/relay-gate-cli/SKILL.md), and
[maintenance](../.opencode/skills/relay-maintenance/SKILL.md).

## 1. Component ownership

| Component | Responsibility |
|---|---|
| [`lib/relay-gate.sh`](../lib/relay-gate.sh) | Exact JSON-string decoding (`relay_json_string`, reserved helper-local output namespace), named-position lookup (`relay_position_index`), checklist-shape validation/evaluation, environment path expansion, computed Git diff, oracle/artifact digests, serialized ledger append. |
| [`bin/relay-arm-hook.sh`](../bin/relay-arm-hook.sh) | Token binding, whole-evaluation lock, persisted ID position, ARM kinds, progressive instructions, accepted-control regression, repeat collapse, parking/release, corpus copy. |
| [`bin/relay-gate`](../bin/relay-gate) | Harness-neutral `eval`/`check`, shared evaluation-lock convention, integer evaluation state, lossless current/macro/next identity decoding and prevalidation, named/base-ref check overrides, legacy DoD commands, JSON outcomes and disposition exits. |
| [`benchmark/relay_hook.sh`](../benchmark/relay_hook.sh) | Single-runner `Stop` adapter, benchmark DoD/checklist evaluation, optional ungated advancement. |
| [`benchmark/judge.py`](../benchmark/judge.py) | Stub/API/CLI semantic grading and typed sample/ballot availability/backend/model/cuts for voting; emit additive JSON `available` and render tags as display metadata while retaining public three-tuples. |
| [`benchmark/calibrate_judge.py`](../benchmark/calibrate_judge.py) | Validate process/object/verdict/backend/reason and literal true availability; exclude invalid measurements from confusion matrix/agreement; import-guard calibration execution. |
| [`bin/relay`](../bin/relay) | Read-only `verify`, `problems`, and `cost` views of recorded entries. |
| [`bin/relay-spec.py`](../bin/relay-spec.py) | Template rendering, limited sprint lint, offline amendment comparison. |
| [`bin/relay-profile.py`](../bin/relay-profile.py) | YAML profile compilation and generated-JSON text comparison through newline-normalizing `Path.read_text()`, not raw-byte freshness. |

The shared library owns mechanisms, not a universal driver policy. ARM ignores `dod`; CLI evaluates
checklist then DoD and regresses both; benchmark evaluates DoD then checklist and regresses DoD only.
Checklist order is the declared array order. Preserve these distinctions when reviewing changes.

## 2. ARM event flow

```text
SubagentStop payload
  -> own transcript (session transcript only as fallback)
  -> explicit token override or unique transcript marker
  -> token directory -> acquire .run.lock (busy: exit 3, stderr only)
  -> optional agent_id ownership guard
  -> persisted state and ID position resolved against current sprint
  -> kind handling, current checklist, accepted earlier deterministic checks
  -> required round/disposition evidence succeeds before its transition/budget publication
  -> clean pass: advance one WP and block with next text, or complete and allow stop
  -> current failure: charge WP retry and block, or park
  -> regression-only failure: charge separate retry and block, or park
```

Each hook invocation is a new process. State survives through files. The opening prompt is the
dispatcher's responsibility: brief/Map, first instructions, macro protocol, and self-check questions.
The first `meta.base_ref` must precede work; the hook cannot reconstruct that moment at first stop.

Token binding is not cwd binding. Subagents can share a parent cwd; ARM commands use `meta.workdir`.
When present, `agent_id` binds ownership within the token directory. Multiple tokens or a different
owner are refused with stderr and exit `0`, not a hook block. Missing markers and unknown arms are
also nonblocking. These paths require integration diagnostics; empty stdout is not proof of success.

The hook reads only the payload transcript paths and `agent_id` for this binding/attribution. It does
not use `stop_hook_active` as a secondary enforcement guard or grade `last_assistant_message` as a
DoD artifact. Blocked claims are extracted from the selected transcript.

## 3. Persisted ARM files

Paths below are relative to `$RELAY_ARMS_DIR/<token>`:

| Path | Meaning |
|---|---|
| `sprint.json`, `meta.json` | Plan and `{workdir, base_ref?, token?}` metadata. |
| `agent_id` | First nonempty payload owner ID. |
| `position` | WP ID or macro-qualified coordinate. Whole-ID lookup precedes first-dot suffix lookup. |
| `counter` | Derived next-array-index mirror, also written to WP count on escalation; not the authoritative ARM position. |
| `state` | Missing/active state runs; `complete` exits; `awaiting-human` and legacy `escalated` require release. |
| `retry_<safe-wp-id>`, `reg_retry` | Current WP and separate regression-only retry counters. |
| `round_<safe-wp-id>`, `repeat_<safe-wp-id>` | Recorded round digest and identical-round count. |
| `blocked_<safe-wp-id>` | Last honored blocked-claim digest at that WP. |
| `base_<safe-wp-id>` | State-entry Git `HEAD`; fallback is `meta.base_ref`. |
| `macro_<safe-macro-id>` | First-entry protocol marker; initialize the first macro after supplying its opening text. |
| `preflight` | Once-per-arm cap-warning marker. |
| `release` | Consumed text whose normalized form contains a non-whitespace character; operators MUST provide a real reason. Not a waiver or identity proof. |
| `tr_cursor`, `entered_at` | Transcript usage cursor and last hook timestamp. |
| `ledger.jsonl`, `relay.log` | Structured evidence and operational diagnostics. |
| `.run.lock` | Whole ARM evaluation exclusion, acquired before ownership/state writes; shared with CLI calls using this state directory. |

Safe filenames replace characters outside `A-Za-z0-9._-` with `_`. Avoid distinct IDs that sanitize
to the same key. The first fire migrates legacy integer position; later insertions before the ARM
cursor do not re-aim it. Removing the current WP records `position-lost` and leaves position intact.
CLI/benchmark counters remain indices and are sensitive to reorder/insertion.
ARM preserves raw position and current/migrated/next WP/macro identities through JSON decoding and
canonical position writes. Resolve raw whole ID, then raw first-dot suffix; only a raw miss permits
legacy trailing-LF cleanup and another lookup. CR remains identity data. Missing/raw-empty position
still migrates from the counter; past-end migration marks completion, using `?` for an empty plan.
CLI `check --position <position>` uses the shared whole-ID-first resolver instead of `counter`,
including when the counter is stale or past-end. It checks only that WP's checklist; it does not
write position, charge retries, advance, or record verdicts. `check --base-ref <commit>` overrides
`<state>/base_ref`; explicit empty prevents fallback. Both flags are rejected by `eval`.
CLI `wp`/`macro`/`next` strings retain tabs and interior/trailing LF in outcomes/applicable ledger
fields. Eval prevalidates current ID/macro and next ID before controls or persistent ledger/counter/
retry writes; check validates only the selected ID/macro. Directory creation/locking still happens
first. ARM validates current ID/macro before its controls, but next ID/macro only inside `advance`
after current/regression commands and before buffered passing-round flush or transition publication.
This preserves exact identities without providing full-plan validation or benchmark identity transport.

## 4. Macros and kinds

Macros annotate flat WPs. No macro executor, macro retry counter, or nested loop exists. ARM supplies
macro text once when advancing into an unmarked macro; the dispatcher supplies the first macro text.
`execute`/`gate` use the same checks. `review` adds a reminder, not independent reviewer creation.
`inject` records a label and digest before checking controls, not payload bytes. A successful next-WP
reason includes extracted text. File SHA-256 covers original bytes, while `$(cat ...)` strips trailing
LF from delivered text; inline `$(jq -r ...)` strips trailing LF before hashing and delivery.
Missing payload records `inject-missing` without advancement. Failing rounds and terminal injection
states retain the injection event without delivering the text. Delivery is not lossless byte transport.

Compiler/lint accept `human`; ARM does not. It records `unknown-kind` and releases the runner without
moving. Neither CLI nor benchmark implements ARM injection, review reminders, or human approval.
Do not derive runtime approval behavior from compiler vocabulary.

## 5. Evidence and regression

Keep-best re-evaluates selected controls; it does not lock artifacts or
restore an earlier version. ARM selects earlier deterministic checklist controls by IDs with any
recorded checklist pass, using the current plan. A newly inserted earlier control with no pass is
not a regression obligation. CLI selects all earlier deterministic checklist and DoD commands;
benchmark selects earlier DoD commands only. Neither requires ARM acceptance history.

Regression and DoD loops transport compact JSONL records, then decode strings with
`relay_json_string`. Current/earlier shell programs execute whole, preserving tabs and interior/trailing
LF. Current IDs/assertions and ARM regression membership retain exact decoded strings; command/judge
oracle hashing now matches audit's decoded strings. Old fragmentation and trailing-LF mismatches remain
possible in historical ledgers, which stay unchanged. Invalid required current-checklist values fail or abort instead
of becoming unexecuted passes; this is not complete sprint validation. Earlier CLI regression
has narrower decoding/validation; see [regression limits](gates.md#2-driver-order-and-regression-reach).
Judge responses must be one
pass/fail object from an exit-0 process; malformed/nonzero responses record unavailable failure,
blocking only when that semantic item is blocking. See [gate details](gates.md).
Core response validation permits additive fields; it does not validate `available` or require reason.
Judge JSON availability comes from typed ballot/sample state; calibration requires literal true
availability plus its stricter process/object/verdict/NUL-free-backend/string-reason contract. Invalid
measurements do not enter the confusion matrix, and no valid judgments means unavailable agreement.
Neither consumer derives availability by parsing backend display tags.
Missing/null/empty-array checklists remain valid empty control lists; `{}`, `false`, `""`, and every
other nonarray are fatal before checklist-item execution. The decoder rejects output variable names
under `__relay_json_string_*` so helper locals cannot shadow a caller's requested assignment.

ARM buffers round verdicts because checklist evaluation runs in a command substitution. It records
the first failing round in full and replaces identical nonterminal verdict rounds with a
`gate-fail-repeat` hash/count event. This reduces duplicated verdict payload, not evaluation or turn
count. Passing and terminal rounds are full. An honored blocked claim matching the last stored
honored hash at that WP can park early; a new honored claim replaces that hash. Persistent transcript
text can match without a new message. Ordinary identical failures use the usual retry budget.

Escalation retains position, sets `awaiting-human`, copies trace artifacts, and produces no block.
Release resumes the same gate after whitespace-only reason rejection and full resolved-WP-ID cleanup
of retry/round/repeat/blocked-claim state, the legacy index retry, and `reg_retry`. An unresolved
position preserves release for repair. See [SPEC §4](../SPEC.md#4-failures-repeats-and-release).
The release reason and judge corroboration are attribution fields, not authentication/enforcement.

## 6. Locking, archival, and attribution limits

The shared append lock is `<ledger-parent>/.chain.lock`; it protects read-tail/append sequence only.
CLI `eval`/`check` hold `<state>/.run.lock`; ARM holds `$ARM/.run.lock` before binding, release, usage,
retry, or position writes. Competing calls on that directory return `3`, stderr only, without state
changes or grading. Exit cleanup removes the owned lock and ARM round buffer, never another caller's
lock. These locks do not guard external plan/state writers; coordinate plan mutation separately.

Malformed shared append bodies, including any supplied top-level `h`, return nonzero and release
`.chain.lock`; nested `data.h` is allowed. Checklist/regression evidence writes, ARM round flushes,
and mandatory disposition appends now propagate failure. All three drivers append completion/
advance evidence before corresponding counter/position/state publication, and failure evidence
before retry publication. ARM also records release before consumption/reactivation and compaction
hints before next-state publication; escalation records precede disposition/output. See
[SPEC ordering matrix](../SPEC.md#6-ledger-and-audit-boundary) for exact driver scope.

Ledger/state writes are not atomic and provide no rollback or fsync-backed durability guarantee.
An earlier command or ARM binding/usage/bookkeeping can already have effects; a partial prefix can
remain, or a later state write can fail after its append. ARM ancillary cap-risk, injection,
unknown-kind, and blocked-claim appends still tolerate errors; archive copies remain best-effort.

The verifier and audit loader reject duplicate decoded keys at every nesting depth, including
escaped equivalents. A chain entry must have exactly one final root `h` with its writer delimiter;
nested `h` stays ordinary data. Verification hashes original signed body bytes, without JSON
reserialization, and rejects unsigned fields after the root digest. These rules do not close the
valid-prefix truncation or same-user trust limits.

ARM copies terminal ledger/sprint/meta plus `outcome.json` into
`$RELAY_CORPUS_DIR/<token>-<head-prefix>` (default `$HOME/.relay/corpus`). Copy failures are tolerated;
this is an archive attempt, not a transaction, immutable snapshot, or rollback store. Benchmark
archival belongs to [`run_arm.sh`](../benchmark/run_arm.sh), not the hook or shared library.

Benchmark gate and grader are separate. `run_arm.sh` removes `holdout/` from the runner copy, leaves
visible `checks/` for self-checking/gates, and selects the original campaign's holdout for final
grading when present. Held-out scoring is not a feature of the ARM hook or shared checklist core.

ARM derives token usage from new transcript rows since `tr_cursor`. Missing usage produces absent
cost fields; an empty window in a transcript with usage can produce measured zeros. Initial elapsed
time is absent unless an entry timestamp was supplied. Later elapsed values measure hook-to-hook
windows; terminal state summaries do not necessarily include earlier failed windows. Read `cost`
records for what was captured, not a fabricated full-run bill.

HMAC authenticates bytes only when the key and trusted writer are outside the producer's control.
Same-user processes and editable commands/state remain inside Relay's trust boundary. Structural
verification, control verdicts, and current-plan oracle agreement are separate audit questions; use
the [audit skill](../.opencode/skills/relay-audit/SKILL.md) and [SPEC §6](../SPEC.md#6-ledger-and-audit-boundary).
