# Per-agent arm contract

Audience: agents. Status: current.

Use [relay-arm-hook](skills/relay-arm-hook/SKILL.md) for this runtime
and [relay-integration](skills/relay-integration/SKILL.md) for dispatch.
An arm is one runner's token-keyed plan and trace, not a scheduler.

## Files the author supplies

```text
$RELAY_ARMS_DIR/<token>/
  sprint.json       # ordered work_packages with named checklist controls
  meta.json         # absolute workdir, token/label, first-state base_ref
```

`RELAY_ARMS_DIR` defaults to `~/.relay/arms`. An external `relay-arm` MCP tool
may write this layout; its implementation belongs to the orchestrator, not this
repository. A direct writer must satisfy the same on-disk contract. Register
`bin/relay-arm-hook.sh` as `SubagentStop`; see [setup](getting-started.md).

Before dispatch, validate the workdir and seed the runner with:

```text
RELAY-ARM:<token>
Workdir: /absolute/path/to/worktree
Brief: <sprint brief>
Map: <ordered WP titles>
First state: <first WP instructions, macro protocol, self-checks, review requirement>
```

The first stop happens after first-state work. The author must supply those
instructions and record its base ref beforehand. For a fresh arm, when supplying
the opening macro protocol, also mark it entered **before the first evaluation**:
create `$ARM/macro_<safe-id>` using the first WP's macro and the hook's sanitization,
`printf '%s' "$macro" | tr -c 'A-Za-z0-9._-' '_'`. Follow
[integration procedure, step 3](skills/relay-integration/SKILL.md#procedure)
for the actual marker initialization. On later advances, the hook captures workdir
`HEAD`, reveals next instructions and self-checks, and injects a macro's protocol
only when its marker is absent. A missing workdir falls back to `.`; prevent that
fallback by validating dispatch inputs.

## Binding rules

| Input | Resolution |
|---|---|
| `RELAY_ARM_TOKEN` | Explicit override; bypasses transcript marker discovery |
| `agent_transcript_path` | Preferred subagent transcript when it names an existing file |
| `transcript_path` | Fallback session/plain-Stop transcript; can contain several agents' markers |
| `RELAY-ARM:<token>` | Marker scanned from the selected transcript; repeated copies of one token are allowed |
| `agent_id` | First supplied ID is persisted; subsequent different IDs are refused |

Token discovery accepts `[A-Za-z0-9_.-]+`; traversal-like tokens containing `..`
or equal to `.` are rejected. Missing markers or unknown arms permit stopping.
More than one distinct marker and different-agent binding both print a refusal
to stderr and exit `0` without a block. They prevent wrong-arm enforcement;
they do **not** enforce completion. Keep arm directories single-runner-owned.

Once a known sprint is found, `<arm>/.run.lock` excludes another evaluation before
`agent_id`, position, retries, release, transcript cursor, or cost attribution can
change. A busy fire exits `3` with stderr only, leaves arm files/ledger unchanged,
and does not remove the other evaluator's lock. Exit cleanup removes the owned
run lock and temporary round file. The ledger's `.chain.lock` protects each append
separately. Daemon request locks are a third, in-process mechanism; they do not
serialize external hook state writes.

See [binding tests](../tests/test_arm_binding.py) for own-transcript preference,
ambiguous-session refusal, repeated-token acceptance, and agent-ID refusal, and
[runtime tests](../tests/test_arm_runtime.py) for run exclusion and cleanup paths.

## Author controls

```json
{
  "id": "wp1-repair",
  "instructions": "Repair the implementation against the existing acceptance tests.",
  "checklist": [
    {"id": "REPAIR-TESTS", "assert": "acceptance tests pass",
     "cmd": "python3 -m pytest tests/test_feature.py -q"},
    {"id": "REPAIR-REVIEW", "assert": "change matches the brief",
     "judge": "Does the supplied change satisfy the brief?",
     "diff": true, "blocking": true}
  ]
}
```

Adapt test paths to the target repository. Use globally unique control IDs;
audit readers and keep-best acceptance identify controls by ID. A `cmd` exits
`0` to pass and runs under the arm workdir. A judge criterion is advisory by
default, non-independent even when blocking, and requires relevant artifact
context. `diff: true` requires a valid base ref; no base yields a recorded
failure that blocks only if the control is blocking. Nonzero judge exits and
malformed/missing responses also record unavailable `fail`, blocking when
`blocking:true`; they cannot become passing judgments.

The arm hook evaluates `checklist`, not the typed `dod` catalog. WP `model`
does not switch the runner or select a per-WP judge; judge model configuration
uses `RELAY_JUDGE_MODEL`.

## State kinds and progress

| Kind | Shipped arm behavior |
|---|---|
| `execute` or absent | Ordinary checklist evaluation; explicit/default execute is omitted from kind tags |
| `gate` | Declaration and ledger tag; ordinary evaluation |
| `review` | Cold-read reminder when revealed; no fresh context or reviewer is spawned |
| `inject` | Reads workdir-relative `file` or inline `text` and records content hash; file wins when both are supplied. Extracted text is delivered only in a successful nonterminal advance reason |
| `human` | Compiler/lint vocabulary only; ARM records `unknown-kind`, permits stopping, and does not advance |

An inject state's checklist still gates advancement. Missing injection content
or an unknown kind records a plan defect and permits the stop without advancing.
Current-gate failure, regression failure, escalation, and final completion do
not deliver injection text, even when an `inject` SHA entry was recorded. That
entry proves hashing, not payload delivery. File hashes cover original bytes;
delivered file text loses trailing LF during shell extraction. Inline text loses
trailing LF before hashing and delivery. Behavior tests: [test_kinds.py](../tests/test_kinds.py).

The hook writes named `position` (`<macro>.<sub>` when applicable), terminal
`state`, ID-keyed retries, a compatibility `counter`, `relay.log`, and
`ledger.jsonl`. Position is read with `jq -Rs` plus `relay_json_string`: raw whole
ID wins, then raw first-dot suffix; legacy trailing-LF cleanup is tried only after
both raw lookups miss. CR is retained. Current, counter-migrated, and next IDs/macros
retain exact strings in canonical position; IDs require nonempty NUL-free strings,
while macro may be string or optional null. Invalid current identity aborts before
controls; next ID/macro validation occurs in `advance`, after current/regression
commands but before passing-round flush or transition publication. The plan is
re-read at each stop; removing the current WP yields required `position-lost` evidence.

Keep-best reruns earlier deterministic checklist commands only when their whole
control IDs have a recorded pass. It does not freeze files or roll back regressions.
Compact JSON records preserve tabs and all LF in commands and control IDs,
including trailing LF, for execution, acceptance membership, and oracle hashing.
NUL is unsupported. Regression runs the complete shell program; its overall Bash
exit status decides pass/fail. Regression-only failures have their own retry budget.
Current gate failures re-block up to `retry_budget` (default `3`); the next failed
evaluation escalates. A zero budget escalates on the first failure.

## Terminal outcome and audit

| Observation | Interpretation |
|---|---|
| `state=complete`, final `sprint-complete` | Last gate passed; audit before accepting |
| `state=awaiting-human`, final `escalate` | Failed chain parked for human intervention |
| Empty stdout, exit `0` | Stop permitted; also used by refusals and plan defects |
| Empty stdout, exit `3`, busy stderr | Another evaluation owns the run lock; no arm mutation or gate verdict |
| `counter >= nwp` | Insufficient: completion and escalation both write this value |

```sh
bin/relay problems /path/to/arm --json
bin/relay verify /path/to/arm --json
```

Require `state=complete` and audit exit `0`. The arm layout makes `sprint.json`
reachable for comparison of named IDs in both directions and recorded oracle hashes.
Added/unrecorded, removed, or changed controls produce `SPRINT-DIVERGED`; invalid
reachable/explicit sprint input produces `SPRINT-INVALID`. Intact unusable audit
fields produce `RECORD-INVALID`; missing legacy oracles produce `ORACLE-UNVERIFIED`
when compared. These are exit `2`. A bare ledger without a sprint has explicitly
recorded-controls-only scope (`oracle_recheck.status=not-run`). Audit does not
rerun controls, validate current artifacts, or compare every plan field.

Plain SHA-256 is tamper-evident, not resistant to whole-chain rewriting; keyed
mode uses `RELAY_LEDGER_KEY`, also needed by the verifier. Protect the key separately
from runner-controlled files and processes; anchor the latest head externally for
trace completeness.

Terminal completion/escalation attempts to archive plan, metadata, and ledger
under `RELAY_CORPUS_DIR` (default `~/.relay/corpus`); archives remain best-effort.
Required verdict/disposition records precede corresponding transition/retry writes
and fail fatally. Earlier command effects/records may remain; no atomicity, rollback,
or fsync guarantee follows. See the ARM skill for required versus ancillary events.

## Release input and cleanup

The operator MUST supply real who/why attribution in `release`. The hook removes
CR, maps LF to spaces, and trims leading/trailing ASCII spaces. It requires a
non-whitespace character, rejecting empty, spaces-only, tabs-only, CRLF-only,
mixed space/tab/CRLF, and vertical-tab/form-feed-only reasons. Rejected release
files stay on disk and do not resume evaluation. This file-based release does
not authenticate a human or validate the claimed identity; the same OS user can
write it and the other state files.

Before consuming a valid reason, resolve position by the whole WP ID first, then
the suffix after the first dot. A lost position retains the release for repair.
Cleanup uses that actual plan ID, sanitized with `tr -c 'A-Za-z0-9._-' '_'`, matching
evaluation's keys for bare, dotted, macro-prefixed, and compiler-qualified IDs.
It removes `retry_<safe-id>`, `round_<safe-id>`, `repeat_<safe-id>`,
`blocked_<safe-id>`, legacy `retry_<current-index>`, and `reg_retry`, preserving
unrelated WP keys. The compatibility `counter` is restored to the resolved index.

Required `human-release` append succeeds before consuming the reason, clearing
budgets, or setting `active`; the same gate is then rechecked. A failing gate
starts a fresh round and charges its restored retry budget normally; a zero
budget still escalates immediately. Removing the old blocked-claim hash prevents
that prior stored hash alone from immediately re-parking the released gate.
The consumed reason cannot reopen a later escalation. Inspect
[release tests](../tests/test_await_human.py) for exact normalization, full-ID
precedence, legacy-key cleanup, and same-gate behavior.

Authorities: [arm hook](../bin/relay-arm-hook.sh), [shared core](../lib/relay-gate.sh),
[audit CLI](../bin/relay). Related: [compaction](compaction.md),
[CLI's narrower contract](sdk.md), [scripted example](../examples/fleet-chain/README.md).
