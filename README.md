# HuGR Relay

> **One agent. A chain of work packages. The stop is the engine.**

Relay drives a single sub-agent (the **Runner**) through an ordered list of **Work Packages**
by intercepting every "I'm done", checking it against a **Gate** (its Definition of Done), and
relaying the next package into the *same* agent — **forward-only, never regressing** — until the
whole sprint is delivered.

It is the structural answer to the failure mode that actually bites autonomous agents: not
single-prompt specs (models nail those), but **sprawling, long-horizon work** where requirements
scatter and get dropped. Relay reveals one work package at a time and refuses to let the agent
leave until each is actually done.

## How it works (in one breath)

A worker, a stack of task cards, and a gate-keeper at the door. The worker finishes a card and
heads for the exit; the gate-keeper checks it — good, take the next card; bad, go fix it — and
only opens the door once the stack is empty.

```
spawn Runner ──► work WP ──► STOP ──► Gate ──┬─ fail → hand back the gap → same WP
                   ▲                          └─ pass → lock in → relay next WP
                   └──────────────── repeat ─────────────────┘
              list exhausted → let it stop → SPRINT DELIVERED
```

## Quick start

1. Install the Relay hook (`SubagentStop` → relay hook script) — see **[Configuration](docs/configuration.md)**.
2. Write a `sprint.json` (brief + work packages + Definition of Done) — see **[Authoring Sprints](docs/authoring-sprints.md)**.
3. Spawn the Runner with the brief; the hook drives the rest — see **[Getting Started](docs/getting-started.md)**.

## Documentation

| Doc | What's in it |
|---|---|
| [White Paper](WHITEPAPER.md) | The north star: motivation, the evidence base, and the design. |
| [Canonical Spec](SPEC.md) | Single source of truth: schema, gate catalog, the worked example, verified payload. |
| [Concepts & Mental Model](docs/concepts.md) | The mental model, the flow, the glossary. |
| [Getting Started](docs/getting-started.md) | Install, author your first sprint, run it, read the trace. |
| [Authoring Sprints](docs/authoring-sprints.md) | The `sprint.json` schema and how to write good WPs and DoD. |
| [Gates & Definition of Done](docs/gates.md) | The check-type catalog, mechanical vs semantic, keep-best, escalation. |
| [Architecture & Internals](docs/architecture.md) | The Relay hook, the loop, state, anti-regression, the payload. |
| [Configuration & Installation](docs/configuration.md) | Hook install, knobs, headless runs, disabling hooks. |
| [FAQ & Design Rationale](docs/faq.md) | Why not reflection, why single-context, why gated, troubleshooting. |

## Design principles

- **Single continuous context** — the Runner keeps full memory across WPs; no handoff to serialize.
- **Gated advancement** — "stopped" ≠ "done"; advance only on a Gate pass.
- **Forward-only / keep-best** — accepted WPs are locked; a later step can never ship a worse version.
- **Boundary-only** — the Gate acts at stop boundaries; it never interrupts mid-reasoning.
- **Map up front, detail progressively** — the Runner sees the goal and WP titles, details one at a time.

## Status

**North Star (v0).** The [White Paper](WHITEPAPER.md) and [Spec](SPEC.md) are the reference the
implementation answers to. License: TBD (set before any public release).
