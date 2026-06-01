# Telemetry — the human view over the verified-trace corpus

Relay retains every terminal agent run as an integrity-checked trace under `$RELAY_CORPUS_DIR`
(default `~/.relay/corpus`). `bin/relay-corpus.py` already turns those traces into the dense per-step
*reward signal* an RLVR / process-supervision pipeline wants. The signal is for machines.

`bin/relay-dash.py` is the **human surface** over the same corpus: progress you can watch while a fleet
of armed agents runs, and a rollup you can read at a glance. It is **read-only** — it never mutates a
trace — and it reuses `relay-corpus.py`'s verify-then-include load path, so a **tampered trace is
excluded from the view by the exact code that excludes it from the signal**.

## Usage

```
relay-dash.py [--corpus DIR] burndown [--json]
relay-dash.py [--corpus DIR] health   [--json]
```

`--corpus` defaults to `$RELAY_CORPUS_DIR`, then `~/.relay/corpus`.
An empty (or absent) corpus prints a clean `no traces yet` message and exits 0.

### `burndown` — per-arm gate progress

One row per arm: gates cleared / total, the current (first not-yet-cleared) gate, retries spent, and the
terminal outcome (`complete` / `escalate` / `incomplete`). An ASCII bar shows progress.

The outcome is read **only from the signed ledger chain**, never from `outcome.json` (which the hook
writes outside the hash chain and the verifier does not check). A verified chain that does not END in a
terminal event (`sprint-complete` / `escalate`) is reported as `incomplete` — this covers both a still-
running trace and a tail-truncated one (a tail-truncated chain verifies as a valid prefix, so an agent
that failed its gate and was cut mid-trace is shown as `incomplete`, not folded into `complete`).

```
== relay burndown (per-arm gate progress) ==
arm                  progress                   gates  cur      retry  outcome
tokA                 [####################]       2/2  -            1  complete
tokB                 [--------------------]       0/1  wp1          1  escalate
```

Note: gates total reflects the gates a trace actually **revealed** (the per-WP signal is derived from
the ledger, not the static sprint), so an arm that escalated on its first gate shows that gate only.

### `health` — fleet rollup

Pass rate, escalation rate, mean retries→green, and the hardest controls (highest fail count, reusing
the corpus control-difficulty accounting):

```
== relay fleet health ==
  traces:             2  (1 complete / 1 escalate / 0 incomplete)
  pass rate:           50.0%
  escalation rate:     50.0%
  mean retries→green: 0.50

  hardest controls (top 5 by fail count):
  control                           fails   seen
  C1                                    3      4
```

`pass_rate` and `escalation_rate` are computed over **all retained valid traces**, including any that are
`incomplete` (in-progress or truncated). An incomplete trace counts in the denominator but in neither the
complete nor the escalate numerator, so the two rates need not sum to 1 — a fleet with in-progress runs
shows both rates depressed. `pass_rate` means "fraction of retained traces with a `sprint-complete` on the
signed chain", nothing weaker. When the corpus contains only tampered (excluded) traces, the hardest-
controls line reports "no valid traces" rather than claiming every control passed.

### `--json`

Both subcommands take `--json` for machine consumption (dashboards, CI). `burndown --json` emits
`{"arms": [...], "tampered": N}`; `health --json` emits the rollup (`complete` / `escalate` /
`incomplete` counts, `pass_rate`, `escalation_rate`, `mean_retries_to_green`) plus `hardest_controls`.
Tampered traces are reported in the `tampered` count and excluded from every metric. The `--json` surface
carries corpus strings verbatim (JSON-escaped); the human view strips control bytes for render-safety.

## Relationship to the rest of Relay

| Tool | Audience | Output |
|------|----------|--------|
| `relay-arm-hook.sh` | the gate | writes per-arm ledgers, retains terminal traces to the corpus |
| `relay-corpus.py` | RL / supervision pipeline | per-WP reward rows (`export`), difficulty (`controls`) |
| `relay-dash.py` | humans watching the fleet | `burndown` + `health` views over the same corpus |

`relay-dash.py` imports `relay-corpus.py` (`load_corpus`, `per_wp_signal`) rather than reimplementing the
ledger, the verifier, or the gate evaluation — there is one source of truth for what a trace means.
