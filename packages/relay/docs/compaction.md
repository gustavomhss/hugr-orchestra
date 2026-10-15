# Arm feedback checkpoints

Audience: agents. Status: current.

Load [relay-arm-hook](skills/relay-arm-hook/SKILL.md) when changing
feedback and [relay-telemetry](skills/relay-telemetry/SKILL.md) when
reading checkpoint events. Relay reduces repeated feedback; the harness owns
actual context compaction.

## Feedback rules

| Trigger | Agent-facing reason |
|---|---|
| First current-gate failure (`r=0`) | Gate ID, failing IDs, regressions, and current WP instructions |
| Later current-gate failure (`r>=1`) | Short "still failing" message with failing IDs and regressions; full instructions omitted |
| Advance revealing another WP at `ni >= RELAY_COMPACT_AFTER` | Next instructions plus checkpoint hint; default threshold `6` |

Instructions should already be present: the author seeds the first state and
the hook reveals later ones. The first failure is not necessarily the runner's
first exposure to its requirements. Regression-only re-blocks use a separate
message and retry path.

The checkpoint text is:

```text
(checkpoint: <ni> gates cleared — summarize progress and drop now-stale detail before continuing)
```

`ni` is the next zero-based WP index, equal to gates cleared on an unchanged
linear plan. A hint is emitted on each eligible advance, not only when the
threshold is crossed; final completion exits before hint delivery.

```sh
export RELAY_COMPACT_AFTER=6
```

Set a nonnegative integer in the hook environment. This knob does not call a
compaction API, erase prior messages, restart the runner, or enforce a summary.

## Agent checkpoint recipe

1. Preserve token, workdir, current position, current instructions, relevant base
   ref, accepted controls, unresolved failures, and next checks in a short summary.
2. Use the harness's supported checkpoint/compaction facility when available.
3. Re-read current artifacts and persisted arm state after compaction. Context
   summaries do not replace gate results or the ledger.

## Ledger interpretation

The hook records `compaction-hint`; that proves hint emission, not that the
agent compacted context. Feedback shortening does not remove failure IDs from
gate events. Separately, identical failed rounds are represented by
`gate-fail-repeat` with round hash, repeat count, and retry number; changed and
terminal rounds are recorded in full. Do not assume one checklist row per retry.

Source: [advance and retry feedback](../bin/relay-arm-hook.sh). Executable
examples: [test_compaction.py](../tests/test_compaction.py). Related:
[per-agent arms](per-agent-arms.md), [diagnosis](faq.md).
