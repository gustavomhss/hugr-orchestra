# HuGR Relay

> **One agent. A chain of work packages. The stop is the engine.**
> *Your agent cannot lie that it's done.*

Relay drives a single sub-agent (the **Runner**) through an ordered list of **Work Packages** by
intercepting every "I'm done", checking it against a **Gate** (the work package's Definition of Done —
real `pytest`/lint/type/`grep`/shell checks), and relaying the next package into the *same* agent —
**forward-only, never regressing** — until the whole sprint is delivered, with a tamper-evident trace
as proof.

The point is to replace the trust assumption *"the agent said done"* with the verifiable fact
*"a real check passed,"* enforced from **outside** the model's control. In one analogy: **git + CI for
the *act* of doing work** — atomic verified commits, a pre-commit gate, a keep-best ratchet, and a plan
under version control, moved *in-loop*.

## What Relay is — and is not

Relay is a **deterministic reliability control plane**: an external oracle + a forward-only ratchet +
a verified-trace ledger. Its value is **proof, not speed** — reliability insurance and a compliance
artifact, strong on coupled, test-oracle-rich, high-stakes work inside one codebase.

Relay is **not a throughput amplifier.** The seductive claim — "Relay makes a model strong at distance
by recovering requirements the monolith drops" — is **not supported by measurement.** On freshly
generated, contamination-immune, held-out-graded campaigns, a strong model implements a *complete,
precise* spec of up to **N=300** distinct, coupled requirements first-pass (≈8 turns, ~$1), on both a
templated and a non-compressible substrate — the monolith does not break, so there is no crossover for
a per-step ratchet to win at. See **[benchmark/RESULTS.md](benchmark/RESULTS.md)**. What survives, and
what Relay ships, is the control plane: it holds *regardless* of that result and does not erode as
models improve (a near-perfect engineer still runs CI, and still wants a signed proof that it passed).

## How it works (in one breath)

A worker, a stack of task cards, and a gate-keeper at the door. The worker finishes a card and heads
for the exit; the gate-keeper checks it against a real test — good, take the next card; bad, go fix it —
and only opens the door once the stack is empty. Every pass is locked in and timestamped.

```
spawn Runner ──► work WP ──► STOP ──► Gate ──┬─ fail → hand back the gap → same WP
                   ▲                          └─ pass → lock in + log → relay next WP
                   └──────────────── repeat ─────────────────┘
              list exhausted → let it stop → SPRINT DELIVERED (+ verified trace)
```

## See it in 90 seconds (no API key)

```bash
bash demo/relay_demo.sh
```

Drives the **real** Relay hook over a tiny sprint with a scripted runner (deterministic, instant,
free). A vanilla agent declares "All done! ✅" and exits at 1/3 — silently broken. Under Relay, the
gate fires **RED** and the door stays closed until every check passes, leaving a timestamped
verified-trace ledger as proof. That is the whole product in one screen.

For the compliance angle — a gate that is an itemized **checklist of named controls** (LGPD /
guardrail / business rule), with a **tamper-evident** per-control proof:

```bash
bash demo/compliance_demo.sh
```

A vanilla agent ships three violated controls and calls it done; Relay names each failing control,
holds the door until all pass, logs every verdict (and how it was graded) to a hash-chained ledger,
and `benchmark/verify_ledger.py` confirms the chain — then catches it as **TAMPERED** the moment one
verdict is edited after the fact. A model's self-judgement is logged as *advisory, non-independent* —
never silently passed off as verified.

The one command you hand to compliance — verifies the chain **and** reports every control's verdict:

```bash
bin/relay verify <run-dir>        # exit 0 = intact + controls passed · 1 = tampered · 2 = a control failed
```

A tampered chain forces a fail **even if every control reads green** — a forged "pass" is worthless.

## Quick start

1. Install the Relay hook (`Stop` → relay hook script) — see **[Configuration](docs/configuration.md)**.
2. Write a `sprint.json` (brief + work packages + Definition of Done) — see **[Authoring Sprints](docs/authoring-sprints.md)**.
3. Spawn the Runner with the brief; the hook drives the rest — see **[Getting Started](docs/getting-started.md)**.

## Documentation

| Doc | What's in it |
|---|---|
| [White Paper](WHITEPAPER.md) | The north star: thesis, mechanism, evidence (measured/argued/unknown), honest boundaries. |
| [Product & Strategy](PRODUCT.md) | Wedge, ICP, product surface, the moat (stated honestly), GTM, pricing, expansion. |
| [Canonical Spec](SPEC.md) | Single source of truth: schema, gate catalog, the worked example, shipped-vs-spec status. |
| [Benchmark Results](benchmark/RESULTS.md) | What we measured: no crossover up to N=300; the amplifier thesis falsified on two substrates. |
| [Concepts & Mental Model](docs/concepts.md) | The mental model, the flow, the glossary. |
| [Getting Started](docs/getting-started.md) | Install, author your first sprint, run it, read the trace. |
| [Authoring Sprints](docs/authoring-sprints.md) | The `sprint.json` schema and how to write good WPs and DoD. |
| [Gates & Definition of Done](docs/gates.md) | The check-type catalog, mechanical vs semantic, keep-best, escalation. |
| [Architecture & Internals](docs/architecture.md) | The Relay hook, the loop, state, anti-regression, the payload. |
| [Configuration & Installation](docs/configuration.md) | Hook install, knobs, headless runs, disabling hooks. |
| [FAQ & Design Rationale](docs/faq.md) | Why not reflection, why single-context, why gated, troubleshooting. |

## Design principles

- **Deterministic external oracle** — "stopped" ≠ "done"; advance only when a *real check* passes.
- **Forward-only / keep-best** — accepted WPs are locked; a later step can never ship a worse version.
- **Single continuous context** — the Runner keeps full memory across WPs; no handoff to serialize.
- **Boundary-only** — the Gate acts at stop boundaries; it never interrupts mid-reasoning.
- **Verified-trace ledger** — every gate verdict is logged; the run leaves a tamper-evident proof.
- **Value is proportional to gate fidelity** — Relay ratchets only what a deterministic check can express.

## Status

**North Star (v0.1).** [WHITEPAPER.md](WHITEPAPER.md), [PRODUCT.md](PRODUCT.md), and
[SPEC.md](SPEC.md) are the reference the implementation answers to; [benchmark/RESULTS.md](benchmark/RESULTS.md)
is the measured truth (control-plane confirmed; amplifier falsified). License: TBD (set before any public
release). This is an internal north-star corpus — not calibrated for publication as-is.
