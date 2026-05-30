# Concepts & Mental Model

## 1. The Mental Model

Think of Relay as **one worker, a stack of task cards, and a gate-keeper at the door.**

The worker (the **Runner**) is a single sub-agent with continuous memory — it remembers
everything it has built since the sprint started. The orchestrator hands it a **brief** and
shows it the titles of every card in the stack up front (the **Map**), so it can orient
without seeing details it doesn't need yet.

Each card is a **Work Package (WP)**. The worker picks up WP1 and gets to work. When it
believes it has finished, it heads for the exit — it stops.

The **gate-keeper** (the **Relay hook**) catches that stop. It does not trust the stop; it
checks the card's **Definition of Done (DoD)** through the **Gate**:

- **Fail** — the gate-keeper hands the card back with the exact gap noted. The worker fixes
  it. The door stays closed. The WP index does not advance.
- **Pass** — the gate-keeper locks the card in (**keep-best**: accepted work is never
  regressed), slides the next card under the door, and tells the worker to continue. Same
  worker, same memory, next WP.

This repeats until the stack is empty. Then the gate-keeper opens the door for real.
**Sprint delivered.**

The key insight: "stopped" does not mean "done". The stop is the engine — Relay turns every
premature exit into one more link in the delivery chain.

---

## 2. The Flow

Per-stop loop (derived from SPEC §5):

```
orchestrator spawns ONE Runner with brief + Map → starts WP1
       │
       ▼
┌──► Runner works the current WP … believes it is done → STOPS
│        │
│        ▼
│   Relay hook fires at the stop boundary
│        │
│        ▼
│   Gate evaluates the WP against its DoD
│        │
│        ├─ FAIL ──► retry budget exceeded? ──► YES → ESCALATE → allow stop
│        │                │
│        │               NO
│        │                │
│        │                ▼
│        │          block: hand WP back with gap; index unchanged
│        │                │
│        └────────────────┘
│        │
│        └─ PASS ──► lock WP (keep-best)
│                        │
│                        ├─ next WP exists? ──► YES → block: relay next WP; advance index
│                        │
│                        └─ NO → list exhausted → allow stop
│
└──────────────────────────  repeat  ─────────────────────────────┘
                 │
        SPRINT DELIVERED
```

Two invariants hold at every step:

1. **Forward-only** — the index only increments on a Gate pass.
2. **Keep-best** — a locked WP can never be replaced by a worse version.

---

## 3. Glossary

The following terms are canonical. Use them verbatim in sprint files, hook code, and docs.

| Term | Meaning |
|---|---|
| **Sprint** | The whole job: a brief + an ordered list of Work Packages. |
| **Work Package (WP)** | One self-contained unit of work with its own instructions and DoD. |
| **Definition of Done (DoD)** | The objective pass/fail criteria for a WP (a list of checks). |
| **Runner** | The single sub-agent that executes every WP, with continuous memory. |
| **Relay hook** | The `SubagentStop` hook that intercepts each stop and advances or holds. |
| **Gate** | The evaluation of a WP's DoD at a stop; decides pass (advance) or fail (retry). |
| **Keep-best** | Accepted WPs are locked; the chain never ships a worse version of them. |
| **Map** | The sprint goal + list of WP titles, given to the Runner up front for orientation. |
| **Retry budget** | Max gate failures allowed on one WP before the sprint escalates. |

---

## 4. What Relay Is / Is NOT

**What Relay is:**

- A sequencing and enforcement layer for multi-WP work delivered by a single continuous agent.
- A gated advancement mechanism: the Runner earns the right to move forward by satisfying an
  explicit DoD, not by stopping.
- A structural answer to context-scale failure: one WP revealed at a time, none skippable.

**What Relay is NOT:**

- **Not reflection.** Forced reflection was measured as zero-gain or harmful on verifiable work
  (in one controlled run it regressed a correct solution to broken). Relay delivers sequenced
  work; it does not second-guess finished work.
- **Not an isolated pipeline.** One Runner, continuous memory — not a fresh agent per stage.
  WP3 builds directly on the live code from WP2 with no handoff artifact to serialize.
- **Not a mid-reasoning interrupt.** The Relay hook fires only at stop boundaries, after the
  Runner has finished its current turn. It never severs an in-progress thought.
- **Not a replacement for tests.** Where a verifier exists the Gate uses it; Relay adds
  sequencing and enforcement, not a new source of truth.

---

## 5. See Also

- [Getting started](getting-started.md) — install the hook, run your first sprint
- [Architecture](architecture.md) — hook wiring, payload fields, counter storage
- [Authoring sprints](authoring-sprints.md) — `sprint.json` schema, DoD check-type catalog,
  the `slugify` worked example
