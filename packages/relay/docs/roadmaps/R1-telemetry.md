# R1 — Historical Completed Scope: Corpus Telemetry

Audience: agents. Status: historical.

Current authority: [SPEC.md](../../SPEC.md). Procedures: [operational skills](../skills/).
This card records a completed local scope, not a current implementation assignment.

## Delivered scope

[bin/relay-dash.py](../../bin/relay-dash.py) implements read-only `burndown` and `health`,
with JSON output, over retained corpus traces. It reuses
[relay-corpus.py](../../bin/relay-corpus.py) loading and per-WP signals, excludes integrity-invalid
traces, derives terminal headlines from chained events and sanitizes terminal strings.
Original ownership: dashboard, [tests/test_dash.py](../../tests/test_dash.py), telemetry docs.

## Bounded completion

This completed scope is a **corpus view**, not R10's later proposed live-arm console. Terminal
archiving populates the default corpus; a running arm is not automatically visible. Totals cover
observed WPs, and a valid non-terminal prefix is `incomplete`, without distinguishing running from
tail-truncated. Empty-corpus output is not fleet-health evidence. Corpus `stats`/`export` still
use unsigned outcome metadata; the dashboard's headline rule does not harden those consumers.

Test references record verification intent, not a current suite result or test count.
