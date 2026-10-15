# Telemetry contracts

Audience: agents. Status: current.

Procedure: [relay-telemetry skill](skills/relay-telemetry/SKILL.md).
Sources: [dash](../bin/relay-dash.py), [corpus](../bin/relay-corpus.py), [reports](../bin/relay), [arm writer](../bin/relay-arm-hook.sh).
Evidence: [dash tests](../tests/test_dash.py), [cost tests](../tests/test_cost.py), [report tests](../tests/test_relay.py).

## Retained-trace views

`relay-dash.py burndown|health [--corpus DIR] [--json]` reads retained corpus snapshots once.
It is read-only and is not a live arm-state dashboard. Corpus defaults to `RELAY_CORPUS_DIR`, else `~/.relay/corpus`.
Missing/empty corpus returns an empty message with exit 0; this does not mean a fleet was measured healthy.

| View | Meaning |
|---|---|
| Burndown | One row per valid retained snapshot; label prefers chain arm, else trace directory |
| Gates total | WPs observed in ledger-derived signal, not all WPs planned in sprint |
| Current gate | First unpassed WP in the signal's sorted order |
| Terminal outcome | Last event-bearing chain entry: `sprint-complete` → complete, `escalate` → escalate, else incomplete |
| Health rates | Complete/escalated snapshots divided by all valid snapshots, including incomplete |
| Difficulty | Recorded checklist fail/seen counts, not every evaluation or regression verdict |

Dash ignores unsigned `outcome.json` for terminal status. Chain-valid nonterminal prefixes remain incomplete.
Corpus statistics/export do still trust unsigned outcome metadata; see [trace-corpus](trace-corpus.md).
Integrity-rejected traces are excluded and counted. Key/mode mismatch also rejects a trace.
Human display sanitizes C0/C1 control bytes; JSON carries values with JSON escaping.

Escalation and later completion can archive overlapping snapshots of one arm. Views do not deduplicate them.
Round collapsing preserves retry counters but omits duplicate checklist verdicts, limiting difficulty counts.
Dashboard completion labels are not acceptance certificates; run `relay verify --sprint` for control/oracle status.

## Problems and recorded cost

`relay problems <run|arm|ledger> [--json]` derives attention flags from chain events; exit 1 means problems,
0 means none derived, 2 means missing input. It does not inspect unrecorded process failures.

`relay cost <run|arm|ledger> [--json]` sums recorded token/cache/turn windows; it does not verify chain integrity.
Run verification before trusting the report. Hook reads usage from preferred subagent transcript and tracks
consumed rows in `tr_cursor`. No usage data produces `total:null`; an observed empty window can be zero.

- Cost fields are inside hashed event bodies; missing fields are unmeasured, not free execution.
- First-state elapsed time is absent without a prior entry timestamp; later elapsed fields follow hook-fire windows.
- Total token cost sums priced events, while state/macro rows select only advance/complete/escalate events.
  Failure-window spend can therefore be present in totals without complete state/macro attribution.
- CLI runs have no transcript token accounting. Reports are not dollar bills or full separate judge-call billing.
- [`cost-per-state` fixture](../test/fixtures/cost-per-state.ledger.jsonl) records one run, not a universal cost model.
