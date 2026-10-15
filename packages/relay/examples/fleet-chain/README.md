# fleet-chain — scripted arm feedback exercise

Audience: agents. Status: current.

Load [relay-examples](../../docs/skills/relay-examples/SKILL.md) and
[relay-arm-hook](../../docs/skills/relay-arm-hook/SKILL.md).
This deterministic, model-free harness drives the actual arm hook with scripted
artifact edits. Use it to inspect feedback mechanics.

## Run

From repository root, with Bash, `jq`, Python 3, `shasum`, and pytest available:

```sh
python3 examples/fleet-chain/run_example.py
```

The script creates a temporary workdir, arm, check scripts, transcript, and
corpus, then removes the sandbox in `finally`. No model endpoint is called.

## Inspect the mechanism

| Stage | Scripted behavior |
|---|---|
| Author | Four gates: API headings, symbol references plus pytest, annotated wrappers, final tracer |
| Seed | Wrong heading format, generic test, unannotated wrappers, missing tracers |
| Fire | Invoke `bin/relay-arm-hook.sh` with a single-token `transcript_path` fallback |
| React | Parse feedback to plant named tracer content and rewrite demanded artifacts |
| Inspect | Print state-based completion, counter for diagnostics, tracer results, and audit result with terminal event and sprint recheck |

There are four tracer flags (`f1`–`f4`). Their contents appear in both gate
checks and gate instructions. `agent_react()` extracts the exact flag content
from the hook reason. This exercises feedback-driven edits; the harness already
contains scripted fixes and is not an agent solving unseen work.

## Interpret results

Exit `0` requires all of the script's predicates:

- Arm `state=complete` and all four tracer contents match after `read().strip()`.
- `bin/relay verify <ledger> --sprint <sprint.json> --json` returns usable audit JSON
  and exit `0`, with `result=PASS`, `chain_intact=true`, terminal
  `last_event=sprint-complete`, and `oracle_recheck.status=ok`.
- Hook calls return exit `0`; nonempty hook stdout is a valid `decision:block`
  response with a nonblank reason. Nonzero exits or malformed responses fail the
  example with diagnostics, even if state or counters otherwise look complete.

The counter is diagnostic only: escalation also sets it to the plan length.
Empty hook stdout is a silent stop, not proof of completion. The example now
checks state and audit after that stop; audit acceptance records checked progression
without reexecuting controls or revalidating current artifacts.

[test_example_completion.py](../../tests/test_example_completion.py) includes a
real-hook last-gate `false` control: all four flags exist, counter reaches the end,
and the intact ledger ends in escalation, yet the example returns FAIL. That
negative control uses retry budget `1` only in its disposable test plan; the
example's production plan remains budget `8`. Other cases cover malformed hook/audit
transport, incomplete evidence, and cleanup.
Synthetic transport fixtures record every declared deterministic control and require
real audit PASS before mutation; they do not execute those controls or prove semantic quality.

This exercise does not establish live-model quality, independent test quality,
or multi-agent fan-out isolation. Binding regression coverage is in
[test_arm_binding.py](../../tests/test_arm_binding.py); kind behavior is in
[test_kinds.py](../../tests/test_kinds.py).

Authorities: [run_example.py](run_example.py),
[arm hook](../../bin/relay-arm-hook.sh). Contracts:
[per-agent arms](../../docs/per-agent-arms.md),
[gate CLI](../../docs/sdk.md), [documentation routes](../../docs/README.md).
