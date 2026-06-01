# Relay model-agnostic gate CLI (`bin/relay-gate`)

`bin/relay-gate` is the **vendor-neutral integration point** for the Relay gate mechanism
(Roadmap #7, [PRODUCT.md §7.4 / §8.8](../PRODUCT.md)). It evaluates one gate step with zero
knowledge of Claude Code or any specific agent harness. Any loop driver — LangGraph, AutoGen,
a custom shell script, a CI pipeline — can call it and act on the pure JSON output and exit code.
The Claude-specific hooks ([`bin/relay-arm-hook.sh`](../bin/relay-arm-hook.sh),
[`benchmark/relay_hook.sh`](../benchmark/relay_hook.sh)) remain as-is; this CLI removes
single-vendor lock-in without touching them.

See [SPEC.md §4.1](../SPEC.md) for the checklist control format and [per-agent-arms.md](per-agent-arms.md)
for the multi-agent arm model that this CLI makes harness-agnostic.

## The `eval` contract

```
relay-gate eval --sprint <sprint.json> --workdir <dir> --state <state-dir> [--ledger <path>]
```

| Argument | Required | Meaning |
|---|---|---|
| `--sprint` | yes | Path to the sprint definition ([SPEC.md §3](../SPEC.md)) |
| `--workdir` | yes | Directory where gate `cmd` checks are run |
| `--state` | yes | Persistent state dir (counter, retry files, ledger) |
| `--ledger` | no | Override ledger path (default: `<state-dir>/ledger.jsonl`) |

The CLI reads the current WP index from `<state-dir>/counter` (default 0 if absent), evaluates
the gate, writes verdicts to the ledger, updates state, and prints one JSON object on stdout.

### JSON outcomes and exit codes

| Exit | `outcome` field | Meaning |
|---|---|---|
| 0 | `"advance"` | Gate passed; counter incremented; `next` carries the next WP id |
| 0 | `"complete"` | Last WP passed (or counter already past end); sprint done |
| 1 | `"gate-fail"` | Failing controls; retry budget not yet spent; `failing` lists the ids |
| 2 | `"escalate"` | Retry budget exhausted; `failing` lists the ids; surface to a human |

Every event and every checklist-item verdict is appended to the ledger as a tamper-evident hash
chain, verifiable with `python3 benchmark/verify_ledger.py <ledger>` (exit 0 = intact).

## Example: a non-Claude harness loop

```bash
#!/usr/bin/env bash
# Minimal harness loop: run the agent, evaluate the gate, repeat until done or escalate.
SPRINT=sprint.json; WORKDIR=./run; STATE=./state

while true; do
  run_my_agent "$SPRINT" "$WORKDIR"   # your model call here

  result=$(relay-gate eval --sprint "$SPRINT" --workdir "$WORKDIR" --state "$STATE")
  outcome=$(printf '%s' "$result" | jq -r '.outcome')

  case "$outcome" in
    advance)  echo "Gate passed — next: $(printf '%s' "$result" | jq -r '.next')" ;;
    complete) echo "Sprint complete."; break ;;
    gate-fail) echo "Blocked: $(printf '%s' "$result" | jq -r '.failing[]')"; continue ;;
    escalate)  echo "Budget spent — human review needed."; exit 2 ;;
  esac
done
```

The harness translates `gate-fail` into whatever "block and retry" means for its own loop —
a `decision:block` for Claude, a `stop_reason` for another framework, or a plain `continue`
in shell. `relay-gate` itself stays clean of those conventions.
