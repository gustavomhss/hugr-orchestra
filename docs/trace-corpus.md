# Retained trace corpus

Audience: agents. Status: current.

Procedure: [relay-telemetry skill](../.opencode/skills/relay-telemetry/SKILL.md).
Sources: [archive writer](../bin/relay-arm-hook.sh), [corpus reader](../bin/relay-corpus.py), [chain verifier](../benchmark/verify_ledger.py).
Evidence: [corpus tests](../tests/test_corpus.py), [dash outcome tests](../tests/test_dash.py).

## Snapshot layout

Arm hook attempts retention on completion and escalation under `RELAY_CORPUS_DIR` (default `~/.relay/corpus`):

```text
<token>-<first-12-head-hex>/
  ledger.jsonl
  sprint.json
  meta.json
  outcome.json     # unsigned {outcome, token, head, ts}
```

Copies are best-effort and not transactional or immutable. Inspect retained files before removing live arm state.
Portable CLI does not auto-archive here; benchmark runner has a separate `.relay-ledger` artifact layout.
After a human releases an escalated arm, another terminal head creates an overlapping snapshot. Readers do not
deduplicate snapshots or their shared prefixes into unique executions.

## Signal contract

`relay-corpus.py [--corpus DIR] stats|controls|export [-o FILE]` scans immediate directories with ledgers.
It includes a trace only when `verify_ledger.py` exits 0. Supply matching `RELAY_LEDGER_KEY` for keyed chains;
integrity failure includes missing/wrong key, not only alteration. Valid prefixes and empty chains can pass this
integrity-only verifier; use `relay verify --sprint` for completed-run acceptance.

Export produces one row per observed `(trace, wp)`:

```json
{"trace":"run-a-0123456789ab","wp":"wp1","passed":true,"retries_to_green":1,"n_controls":3,"n_fail_verdicts":1,"graded_by":["deterministic"],"outcome":"complete"}
```

| Field / mode | Actual derivation |
|---|---|
| `passed` | WP has `advance-reveal` or `sprint-complete` in snapshot |
| `retries_to_green` | Max recorded gate-fail/repeat retry counter; not summed fires or release cycles |
| `n_controls` | Unique checklist IDs observed, not full static plan |
| `n_fail_verdicts`, difficulty | Recorded checklist verdicts; collapsed rounds and regression-item events are not additional checklist counts |
| `export.outcome` | Directly from unsigned `outcome.json` |
| `stats` outcome counts | Unsigned outcome OR any matching terminal event; complete/escalate buckets can overlap |

Chain verification does not authenticate `outcome.json`, sprint, or metadata. A forged outcome can change corpus
stats/export without changing chain integrity. Dash instead derives terminal outcome from the verified chain's
last event-bearing entry. Neither a corpus label nor an integrity-only pass proves that all intended controls ran.

These rows are recorded process signals, not automatically valid training rewards. Curate snapshot duplication,
unsigned outcomes, oracle/sprint agreement, semantic grading, and missing or collapsed evaluations before use.
