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


---

## `relay cost` — what the run spent, beside what it proved

The chain answered *"was this state earned"* precisely and said nothing at all about what earning it
cost. Protocol Enforcer's metrics had the same hole from the other side: `time_per_step` and attempt
counts, held in memory, with no tokens and nothing sealed.

Both halves were obtainable and neither was being taken. **Elapsed** is a subtraction over the `ts`
already on every entry. **Tokens** are in the agent's transcript — `usage` per assistant turn, with
input, output and both cache figures — and the hook already opens that file to find the arm's marker.

### Why the attribution is free

The hook fires when a state **ends**. So every turn in the transcript since the previous fire belongs
to the state that was open, and `$ARM/tr_cursor` — the count of rows already charged — is the whole
mechanism. No instrumentation inside the agent, no wrapper around the model call.

The **subagent** transcript is preferred, for the same reason the token binding prefers it: the
session transcript carries every agent's turns, so charging a state from it would bill this arm for
another agent's work.

### It goes on the chain

`cost` and `elapsed_s` land inside the hashed body of the advance, so a cost figure is exactly as
tamper-evident as a verdict. Editing one breaks the chain, and there is a test that does it.

**[MEASURED]** A real `claude -p` run through the migrated `wp-execute` profile, building a
`titlecase` function test-first. The ledger is committed at
[`fixtures/cost-per-state.ledger.jsonl`](fixtures/cost-per-state.ledger.jsonl).

```
  state                             in     out   cache r   cache w  turns   secs
  bind.bind_scope                   38    7072    716358     21532     20      ?
  bind.gate                          4    1238     80510      1414      2      9
  red.write_failing_tests           11    3106    252886      5527      6     35
  red.gate                          17    4544    455932      4940      9     75
  green.implement                    2     458     52887       597      1     10
  green.gate                         8     635    215670      1103      4     15
  refactor.refactor_or_skip          9    1758    275188      2403      5     27
  refactor.gate                      4     492    112962       857      2     14
  gate.verify_all                   14    3009    408488      3421      7     48
  gate.cold_review                  13    7347    431258      6293      7    311
  gate.gate                          4     737    129471      1135      2     17
  seal.assemble_seal                10    2801    332400      3990      5     39
  seal.gate                          3     986    137996      1328      2     21

  by macro
  bind                              42    8310    796868     22946     22      9
  red                               28    7650    708818     10467     15    110
  green                             10    1093    268557      1700      5     25
  refactor                          13    2250    388150      3260      7     41
  gate                              31   11093    969217     10849     16    376
  seal                              13    3787    470396      5318      7     60

  total: 219 in · 56715 out · 5968669 cache-read · 82006 cache-write · 114 turns · 621s
```

Three things that table says which nothing else did.

**The prefix cache is doing the work the design counted on.** 5.97M cache-read against 219 fresh
input tokens. `enforcement-model.md` §2 justifies never resetting the agent between states partly on
the cache, and this is that argument with a number under it.

**The gate macro is the expensive one** — 376 of 621 seconds, and 311 of those in `cold_review`
alone, which is the one state that calls a judge. Where the time goes was previously a guess.

**`red.gate` cost nine turns.** That is the retry loop visible as spend: the gate rejected, the agent
fixed, and the record now prices what that cost instead of only recording that it happened.

### Absent is admitted, never zeroed

A run whose transcript carries no usage — a `relay-gate` drive, a non-Claude harness, an arm from
before this shipped — records **no cost fields at all**, and `relay cost` says so:

```
no cost recorded — .../ledger.jsonl
  This run was not measured. That is not the same as having spent nothing.
```

A zero is a measurement; an absent field is an admission. It is also what keeps a v1 arm's bytes —
and `benchmark/relay_hook.sh`'s historical hashes — unchanged.

One distinction is kept deliberately: a state whose window was read and found **empty** records
`turns: 0`, which is a real zero and different from no data at all.
