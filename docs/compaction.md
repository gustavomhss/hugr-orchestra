# Compaction: preventing tail-context rot in long chains

## The problem: tail-context rot

In a long [per-agent arm](per-agent-arms.md) chain every gate re-block injects feedback into
the agent's context. A gate that requires multiple retries makes this worse: each re-block
re-injects the **full** instructions block alongside the list of failing controls. After
several retries on the same gate, or after many gates in a deep chain, the agent's context
fills with redundant, now-stale detail — "tail-context rot". The agent's effective attention
window shrinks, latency grows, and the signal-to-noise ratio falls.

Relay cannot control Claude's context directly, but it controls the **reason** it injects via
the `block` decision. Two surgical mechanisms address the two sources of rot.

---

## Mechanism 1: shortened repeat-reblock

**Trigger:** a second or later retry of the **same** work-package gate (retry counter `r >= 1`).

**First failure (r = 0):** the agent receives the full block reason — gate name, failing
control ids, and the gate's `instructions` field verbatim. This is the first time the agent
sees this gate's requirements.

**Subsequent failures (r >= 1):** the agent already has the instructions in its context from
the first block. Re-injecting them adds no information and inflates the context. On all
subsequent retries Relay emits a **shortened reason** — only the still-failing control ids
and a one-line "still failing, fix these" message. The full instructions are dropped.

**Audit trail is unaffected.** The `gate-fail` entry in the ledger always records the full
retry counter, the failing ids, and the regression field — the compaction touches only the
agent-facing `reason` string, not the ledger envelope.

---

## Mechanism 2: deep-advance checkpoint hint

**Trigger:** `advance()` reveals a gate at depth `ni >= RELAY_COMPACT_AFTER` (default 6).

When an agent has cleared many gates its context can contain a long history of injected
instructions, inter-gate advances, and check output. At the threshold Relay appends one line
to the advance `reason`:

```
(checkpoint: <ni> gates cleared — summarize progress and drop now-stale detail before continuing)
```

This is a plain-language nudge: the agent can use it as a signal to summarise, discard stale
content, and continue with a leaner context. Relay does not enforce what the agent does with
this hint — it is advisory.

**Ledger event.** At the same time Relay appends a `compaction-hint` event to the per-arm
ledger (using the standard `ledger` helper). This lets the corpus record exactly where
checkpoints fired, which is useful for tuning `RELAY_COMPACT_AFTER` and for RLVR analysis.

### Configuring the threshold

```bash
export RELAY_COMPACT_AFTER=6   # default — hint fires at gate depth 6 and above
export RELAY_COMPACT_AFTER=3   # fire earlier for shorter chains
```

Below the threshold, `advance()` behavior is completely unchanged.

---

## What is preserved

- The ledger envelope shape is unchanged — every `gate-fail`, `advance-reveal`,
  `sprint-complete`, and `compaction-hint` entry is a normal hash-chain node.
- Token binding, `archive_trace`, regression guard, and all gate evaluation logic are
  untouched.
- The `compaction-hint` event is new but additive; `verify_ledger.py` verifies it exactly
  like any other event.
- The [verified-trace corpus](trace-corpus.md) continues to capture the full audit trail
  for RLVR / process supervision — compaction only ever shrinks what the **agent sees**,
  never what the **ledger records**.

---

## Related

- [Per-agent checklist chains (arms)](per-agent-arms.md) — arm structure and gate lifecycle.
- [Verified-trace corpus](trace-corpus.md) — how terminal traces are retained and exported.
