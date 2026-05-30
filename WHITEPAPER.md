# HuGR Relay — White Paper

> **One agent. A chain of work packages. The stop is the engine.**
> Relay drives a single sub‑agent through a sequence of work packages by intercepting
> every "I'm done", checking it against a gate, and relaying control to the next package —
> forward‑only, never regressing — until the whole sprint is delivered.

Status: **North Star (v0)**. This document is the reference the implementation answers to.

---

## 1. TL;DR

A sub‑agent is given a brief and starts working through a sprint. Each time it believes it
has finished, it stops. **Relay catches that stop**, verifies the current work package
against its Definition of Done, and either:

- **passes** → relays the next work package into the *same* agent and lets it continue, or
- **fails** → hands the package back with the specific gap and makes it try again.

When the package list is exhausted, Relay lets the agent stop for real. The sprint is done.

The runner is **one continuous agent** (it remembers everything it built). Relay is the
**gate‑keeper at the exit** that turns each premature "acabei" into one link of a delivery chain.

---

## 2. Why this exists (the problem)

This design is **evidence‑based**, not vibes. It comes out of a measurement campaign whose
results were mostly *negative* — and those negatives define the shape of Relay.

**Finding 1 — Frontier models do not drop requirements at *prompt* scale.**
Across 8 controlled runs (CSV parsing, semver, a novel 5‑rule transform, a 12‑rule pricing
engine), both a strong model and a cheap model implemented fully‑specified single‑prompt
specs **correctly on the first pass** — even with twelve interacting business rules. A clean
spec that fits in one prompt is squarely in the model's wheelhouse.

**Finding 2 — Reflection adds nothing on well‑specified work, and can *harm*.**
Forcing extra "reflect and improve" passes on already‑correct outputs produced **zero**
functional gain and, in one measured case, **regressed a correct solution to broken**
(a refactor pass introduced an undefined‑variable bug). Conclusion: blanket reflection is
negative expected value when a verifier already exists.

**Finding 3 — The real failure mode is *context* scale, not prompt scale.**
Requirements get dropped, agents stop prematurely, and quality degrades when work is **large,
long‑horizon, and sprawling** — when many requirements compete for attention in one giant
context, not when they are presented one at a time.

**Relay is the structural answer to Finding 3.** Instead of dumping a whole sprint and hoping
the agent holds it all, Relay **reveals one work package at a time** and **refuses to let the
agent leave** until each is actually delivered. A requirement that hasn't been revealed yet
cannot be dropped; a package that isn't done cannot be skipped.

---

## 3. Core concepts (glossary)

| Term | Meaning |
|---|---|
| **Sprint** | The whole job, decomposed into an ordered list of work packages. |
| **Work Package (WP)** | One self‑contained unit of work, with its own instructions and acceptance criteria. |
| **Definition of Done (DoD)** | The pass/fail criteria for a WP. What "done" objectively means. |
| **Runner** | The single sub‑agent that executes every WP, with continuous memory. |
| **Relay hook** | The `SubagentStop` hook that intercepts each stop and advances/holds the chain. |
| **Gate** | The check run at each stop that decides pass (advance) or fail (retry). |
| **Keep‑best** | The chain only moves forward; an accepted WP is locked in and never regresses. |

---

## 4. How it works (the flow)

```
orchestrator → spawns ONE runner with the brief, starts WP1
                 │
                 ▼
        ┌──► runner works the current WP … believes it is done → STOPS
        │        │
        │        ▼
        │   Relay hook fires at the stop boundary (reasoning already finished)
        │        │
        │        ▼
        │   Gate checks the current WP against its DoD
        │        ├─ FAIL → hand the WP back with the exact gap → runner resumes (same WP)
        │        └─ PASS → lock WP in (keep‑best) → relay the NEXT WP → runner continues
        │
        └──────────────────────────────  repeat  ──────────────────────────────┘
                 │
        package list exhausted → Relay lets the runner stop → SPRINT DELIVERED
```

Plain version: a worker, a stack of task cards, and a gate‑keeper at the door. The worker
finishes a card and heads for the exit; the gate‑keeper checks it — good, take the next card;
bad, go fix it — and only opens the door once the stack is empty.

---

## 5. Mechanism (how it's actually built)

Relay is built on a mechanism that was **empirically verified** during design (Claude Code
2.1.x), not assumed:

- **`SubagentStop` + `decision:block` forces continuation.** When the hook returns
  `{"decision":"block","reason":"..."}`, the sub‑agent does **not** stop — the `reason` is
  injected and it keeps working in the same context. (Verified live: a blocked sub‑agent
  resumed and obeyed the injected instruction.)
- **Per‑runner identity is stable.** The payload carries a stable `agent_id`, so the hook
  tracks *which* runner and *which* WP it is on, via a per‑`agent_id` counter.
- **The hook can read the runner's output.** `last_assistant_message` (final text) plus
  `agent_transcript_path` (the runner's own JSONL) let the gate inspect what was produced.
- **Loop‑safety exists.** `stop_hook_active` plus an explicit bounded retry counter prevent
  infinite loops.

**The Relay loop, per stop:**
1. Read the runner's `agent_id`; look up its current WP index `i`.
2. Run the **Gate** for WP`i` against its DoD (mechanical checks first — tests/greps, free;
   then an optional LLM‑judge for non‑mechanical criteria).
3. **Fail** → `decision:block` with the precise gap; do **not** advance `i`. Bounded retries.
4. **Pass** → record WP`i` as accepted (keep‑best); if `i+1` exists, `decision:block` with WP`i+1`'s
   instructions and advance the index; else allow the stop (sprint complete).

The WP list (instructions + DoD) lives on disk; the hook reads it fresh each fire, so the
sprint definition can be authored/edited without touching the hook.

---

## 6. Key design decisions

**Single continuous context (not isolated stations).**
The runner keeps full working memory across WPs, so WP3 builds directly on the *live* code and
decisions from WP2 — **no handoff artifact to serialize**. This is the right choice when WPs are
**coupled** (the normal case inside one codebase/sprint). The cost is context growth over a long
sprint; mitigate with compaction. (An isolated‑stations variant — fresh agent per WP + explicit
handoff contract — is the right tool only when WPs are genuinely independent.)

**Gated advancement (not trusting).**
"The runner stopped" ≠ "the WP is done." Relay advances **only when the Gate passes**, so a
premature stop bounces back instead of silently skipping a deliverable. Every WP must therefore
ship with an explicit DoD.

**Forward‑only / keep‑best (anti‑regression).**
Accepted WPs are locked. Because reflection/refactor passes were measured to occasionally break
working output (Finding 2), Relay never lets a later step ship a worse version of an
already‑accepted package.

**The gate runs at the boundary, never mid‑reasoning.**
Hooks fire only when the agent has stopped. The Gate adds **latency at the exit**, and on failure
it **extends** work with a new turn — it never severs an in‑progress thought.

**Map up front, detail progressively (recommended).**
Give the runner the sprint's overall goal and the list of WP *titles* up front (so it can orient
and avoid locally‑good/globally‑bad choices), but reveal each WP's *details* only as it is relayed.
"Table of contents visible; chapters revealed one at a time."

---

## 7. What Relay is NOT (non‑goals)

- **Not reflection.** We measured reflection to be zero‑gain‑or‑harmful on verifiable work. Relay
  is about *delivering sequenced work*, not second‑guessing finished work.
- **Not an isolated pipeline.** One runner, continuous memory — not a fresh agent per stage.
- **Not a mid‑reasoning interrupt.** It acts only at stop boundaries.
- **Not a replacement for tests.** Where a verifier exists, the Gate *uses* it; Relay adds
  sequencing and enforcement, not a new source of truth.

---

## 8. Roadmap

- **v0 — Core loop.** Relay hook with WP‑list + per‑`agent_id` counter + gated advancement +
  keep‑best + bounded retries. Mechanical gates (tests/greps). One worked sprint example.
- **v1 — Richer gates.** Tiered gate: mechanical first, LLM‑judge (with rubric) for non‑functional
  DoD. Per‑WP model selection (cheap model for mechanical WPs).
- **v2 — Scale & ergonomics.** Map‑up‑front authoring format, context compaction between WPs,
  observability (per‑WP timing, retry counts, gate verdicts), and a sprint‑authoring CLI.
- **v3 — Composition.** Parallel relays for independent WP sub‑chains; sprint‑of‑sprints.

---

## 9. Appendix — verified `SubagentStop` payload (Claude Code 2.1.x)

```json
{
  "session_id": "…",
  "transcript_path": "…/<session>.jsonl",
  "cwd": "…",
  "permission_mode": "…",
  "agent_id": "abf99b91daecefad2",
  "agent_type": "general-purpose",
  "effort": {"level": "high"},
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_transcript_path": "…/subagents/agent-<agent_id>.jsonl",
  "last_assistant_message": "…",
  "background_tasks": [],
  "session_crons": []
}
```

Verified properties: `decision:block` forces continuation; `agent_id` is stable per runner;
`stop_hook_active` flips true after a block (loop‑guard); `agent_transcript_path` exposes the
runner's full transcript; settings‑file hook *removal* does not hot‑reload mid‑session (the script
body does) — so Relay ships as a stable installed hook whose behavior is driven by the on‑disk WP list.
