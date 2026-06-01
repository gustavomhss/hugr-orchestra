# The verified-trace corpus (the data flywheel)

Every gated run already produces a tamper-evident ledger — the verdict of each control, the retry
count per gate, the terminal outcome. [PRODUCT.md §7.2](../PRODUCT.md) names this the *real asset* (a
dense, per-step, verifiable reward signal an RLVR / process-supervision pipeline wants) but flagged it
**UNBUILT**: runs were ephemeral. Now they are retained.

## Retention (automatic)

When an armed agent's chain reaches a **terminal outcome** — `complete` or `escalate` — the Relay arm
hook (`bin/relay-arm-hook.sh`) copies that run's `ledger.jsonl` + `sprint.json` + `meta.json` into a
durable corpus, keyed by `<token>-<chain-head>`, append-only:

```
$RELAY_CORPUS_DIR        # default ~/.relay/corpus
  └── <token>-<head>/
        ├── ledger.jsonl   # the tamper-evident hash chain (the trace)
        ├── sprint.json     # the chain the agent was held to
        ├── meta.json       # label + workdir
        └── outcome.json    # {outcome, token, head, ts}
```

Set `RELAY_CORPUS_DIR` to centralize traces across machines/runs. The per-arm `$ARMS_DIR/<token>` state
stays volatile (a token dir can be cleaned); the corpus is the permanent record.

## Reading the signal — `bin/relay-corpus.py`

```
relay-corpus.py stats            # rollup: traces, complete/escalate, mean retries→green
relay-corpus.py controls         # per-control difficulty table (highest fail counts first)
relay-corpus.py export [-o f]    # one JSON row per (trace, work-package) — the RL rows
```

Every trace is integrity-checked with `verify_ledger.py` first; a **tampered trace is reported and
excluded** from the signal (a corrupt reward sample is worse than none).

An exported row is the per-step reward record:

```json
{"trace":"sec-a1b2-4f3c…","wp":"wp1","passed":true,"retries_to_green":1,
 "n_controls":3,"n_fail_verdicts":1,"graded_by":["deterministic"],"outcome":"complete"}
```

`retries_to_green` (how many gate-fails before a WP passed) and `n_fail_verdicts` are the dense
process-supervision signal: *which step was hard, and how hard.* Aggregated at usage volume, this is
the labs-facing asset — and the one that gets **stronger** as models improve (a better model produces
*more* valuable traces, not fewer).

## See also

- [per-agent-arms.md](per-agent-arms.md) — how arms are bound and gated (the trace source).
- [SPEC.md §7](../SPEC.md) — the ledger hash-chain format and keyed/plain modes.
