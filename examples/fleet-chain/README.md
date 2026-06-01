# fleet-chain — reproducible proof of the per-agent checklist-chain loop

A deterministic, **LLM-free** smoke test of the full Relay arm loop — the same mechanism a real
fleet agent goes through, distilled so it runs in CI without spending tokens.

```
python3 examples/fleet-chain/run_example.py     # exit 0 = the loop holds end-to-end
```

## What it proves

The hard claim behind per-agent arms (see [`docs/per-agent-arms.md`](../../docs/per-agent-arms.md))
is: **an agent is held to a checklist it never saw in its prompt, and that checklist is enforced from
outside its control by the Stop-hook.** This example demonstrates exactly that, end to end:

1. **Author an arm** — an ordered chain of 4 gates, each a checklist of deterministic `cmd` controls
   plus arbitrary **tracer flags**, written the way the `relay-arm` MCP tool writes it.
2. **Seed "blind" work** — a workdir simulating an agent that did the work but in the *wrong
   conventions* (`### \`Name\`` instead of the required `## Name`, untyped wrappers, a generic test),
   and **without the tracer flags** — because the agent never saw them; they exist only inside the
   gate checks.
3. **Drive the real hook** (`bin/relay-arm-hook.sh`) the way Claude Code's `SubagentStop` would. Each
   block returns exactly what's missing; the harness plays the agent reacting *to the hook's feedback*
   — re-formatting to the demanded convention and planting the demanded flag (whose exact content it
   reads out of the hook's reason, not from prior knowledge).
4. **Assert**: the chain completes, every tracer flag is planted with exact content (so it could only
   have come from the hook's feedback), and the per-arm ledger verifies offline.

## Why the tracer flags matter

The flags are arbitrary strings (`FLAG{fleet::doc::a91c}`, …) defined **only** inside the gate check
scripts — never in any prompt. A planted flag with exact content is therefore proof-positive that the
control was satisfied *because the gate demanded it*, not because the task description mentioned it.
This is the same trick used in the live multi-agent fleet tests, made deterministic here.

## Relation to the live test

The live version ran a real Sonnet agent over a 4500-line file with a 207-item checklist injected only
at Stop; it reached 207/207 items and 5/5 flags after the hook drove the corrections. This example is
the CI-safe distillation: same loop, same hook, same ledger, no model required.
