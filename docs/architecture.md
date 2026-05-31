# Architecture & Internals

This document describes how HuGR Relay is built: its control flow, state model, payload
contract, and the empirical findings that shaped every design decision. All terminology
and schema are canonical from [SPEC.md](../SPEC.md).

---

## 1. Overview

Relay drives **one continuous sub-agent (the Runner)** through an ordered list of **Work
Packages (WPs)**. The orchestrator role is intentionally thin: spawn the Runner with the
`brief` + the **Map** (WP titles), then hand off. From that point forward the **Relay hook**
— a `SubagentStop` hook — owns all advancement.

```
orchestrator
  └─ spawn Runner(brief + Map)
       └─ [Runner works …  → STOPS]
            └─ Relay hook fires
                 ├─ Gate FAIL → block (same WP)
                 ├─ Gate PASS + more WPs → block (next WP)
                 └─ Gate PASS + exhausted → allow stop
```

The orchestrator never polls, never injects mid-reasoning, and never interprets output.
The hook does all three of: evaluate, enforce, and advance. This keeps the orchestrator
correct-by-construction and the Runner free of external interruption.

---

## 2. The Relay Loop

The following pseudocode is the normative description of what happens on every
`SubagentStop` fire (SPEC §5). Each line is explained inline.

```
on SubagentStop(payload):
    runner   = payload.agent_id            # (1)
    i        = counter[runner]             # (2)
    wp       = sprint.work_packages[i]     # (3)
    verdict, gaps = run_gate(             # (4)
        wp.dod,
        payload.last_assistant_message,
        payload.agent_transcript_path
    )

    if verdict == FAIL:
        retries[runner][i] += 1            # (5)
        if retries[runner][i] > sprint.retry_budget:
            ESCALATE(wp, gaps)             # (6)
            allow_stop()
        else:
            block(                         # (7)
                reason = "WP <id> not done: " + gaps + " — fix and continue."
            )
    else:  # PASS
        lock_best(wp)                      # (8)
        if i + 1 < len(sprint.work_packages):
            counter[runner] = i + 1        # (9)
            block(                         # (10)
                reason = "WP <id> accepted. Next — WP <next.id>: " + next.instructions
            )
        else:
            allow_stop()                   # (11)
```

Line-by-line:

1. **`runner = payload.agent_id`** — the stable per-Runner identity pulled from the payload.
   This is the key for all per-Runner state (see §3).
2. **`i = counter[runner]`** — look up which WP the Runner is currently on. Starts at 0 on
   first fire; advanced only on a Gate pass.
3. **`wp = sprint.work_packages[i]`** — resolve the WP at index `i` from the sprint
   definition. `sprint.json` is read fresh on every fire, so edits take effect immediately.
4. **`run_gate(...)`** — evaluate every DoD check for `wp`. The Gate receives the WP's `dod`
   array, the Runner's `last_assistant_message`, and its `agent_transcript_path` for deeper
   inspection. Returns `(PASS|FAIL, list-of-gaps)`.
5. **`retries[runner][i] += 1`** — increment the per-WP retry counter. This is separate from
   the WP index counter and is never reset by advancement.
6. **`ESCALATE(wp, gaps)`** — retry budget exhausted; surface the WP and its unresolved gaps
   to the human, then `allow_stop()`. The last accepted WP state is preserved via keep-best.
7. **`block(reason=...)`** — `decision:block` with the precise gap description. The Runner
   does **not** stop; it resumes in the same context with the gap injected. The WP index `i`
   is **not** changed, so the same WP is evaluated again on the next stop.
8. **`lock_best(wp)`** — record this WP as accepted. The keep-best invariant is now active for
   it: no future action can ship a worse version (see §4).
9. **`counter[runner] = i + 1`** — advance the index. The next fire evaluates WP `i+1`.
10. **`block(reason=...)`** — inject WP `i+1`'s full instructions into the Runner via a
    `decision:block`. The Runner continues in the same context, now working on the next WP.
11. **`allow_stop()`** — the package list is exhausted; the sprint is delivered; the Runner
    is permitted to exit.

**Loop-safety:** the retry budget provides a hard bound on failures per WP. The
`stop_hook_active` flag (see §6) is available as a secondary guard against hook re-entrancy.

---

## 3. State Management

The hook maintains two pieces of per-Runner state:

| State | Key | Description |
|---|---|---|
| `counter[runner]` | `agent_id` | Current WP index for this Runner. Starts at 0; incremented on each Gate pass. |
| `retries[runner][i]` | `agent_id` + WP index | Failure count for WP `i`. Incremented on each Gate fail; checked against `sprint.retry_budget`. |

**Where state lives:** both structures are held in the hook process's memory during a session.
Because `sprint.json` is read fresh on every fire, the sprint definition itself is stateless
from the hook's perspective.

**Why `agent_id` is the stable key:** the `SubagentStop` payload provides a stable
`agent_id` that is consistent across all stops for the same Runner. It is not a session ID
(one session can spawn multiple Runners) and not a timestamp. Using `agent_id` as the
counter key means two concurrent Relay sprints in the same session do not collide, and the
hook correctly resumes a Runner that stops many times before the sprint completes.

---

## 4. Anti-Regression (Keep-Best)

When the Gate returns PASS, `lock_best(wp)` records the WP as accepted. This is a one-way
latch: once a WP is accepted, the chain never ships a regression of it.

**Measured motivation (SPEC §10):** in the empirical A/B runs that shaped Relay's design,
forced reflection/refactor passes on already-correct outputs occasionally regressed working
code to broken — in one documented case, a refactor pass introduced an undefined-variable
bug into a solution that had previously passed all tests. Blanket reflection therefore has
negative expected value when a verifier already exists.

Keep-best is the structural response: advancement is strictly forward, and earlier accepted
WPs are held constant while later WPs are being worked. A future WP can *use* the output of
a past WP but cannot mutate it in a way that breaks the past WP's Gate.

---

## 5. Boundary Semantics

The Gate runs **only at stop boundaries** — never mid-reasoning. This is a first-class
design constraint, not an implementation detail:

- **Latency, not interruption:** the hook adds latency at the exit point of a completed
  turn. The Runner's reasoning is already finished when the hook fires.
- **Fail extends, never cuts:** on a Gate fail, the hook issues `decision:block` with the
  gap description. This *extends* the Runner's work with a new turn. It does not abort,
  truncate, or splice into an in-progress thought.
- **Premature stop handling:** if the Runner stops before a WP is done (e.g., it
  underestimates the work required), the Gate catches it and the `block` response sends it
  back. "Stopped" is not equivalent to "done."

This means the Gate's verdict latency only matters between turns, not within them, and the
Runner always has a complete, coherent state when it receives a block reason.

**Single-context vs isolated stations (SPEC §7):**
Relay defaults to a single continuous context — the Runner retains full working memory
across all WPs. This is correct when WPs are coupled (the normal case inside one
codebase), because WP3 can build on WP2's live code with no handoff artifact to serialize.
An isolated-stations variant (fresh Runner per WP with an explicit handoff contract) is the
right choice only when WPs are genuinely independent and context isolation is more valuable
than memory continuity.

---

## 6. The SubagentStop Payload

The hook receives the following verified payload on every fire (SPEC §9, Claude Code 2.1.x):

```json
{
  "session_id": "…",
  "transcript_path": "…/<session>.jsonl",
  "cwd": "…",
  "permission_mode": "…",
  "agent_id": "abf99b91daecefad2",
  "agent_type": "general-purpose",
  "effort": { "level": "high" },
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_transcript_path": "…/subagents/agent-<agent_id>.jsonl",
  "last_assistant_message": "…",
  "background_tasks": [],
  "session_crons": []
}
```

**Verified properties:**

- **`decision:block` forces continuation.** When the hook exits with
  `{"decision":"block","reason":"..."}`, the Runner does not stop. The `reason` is injected
  and it resumes in the same context. Verified live: a blocked Runner resumed and obeyed the
  injected instruction.
- **`agent_id` is stable per Runner.** The same Runner produces the same `agent_id` across
  every stop it makes. This is the correct and only key for per-Runner state.
- **`stop_hook_active` is the loop-guard.** This field is `false` on a normal stop and flips
  to `true` after the hook has issued a `decision:block` for this stop cycle. The hook can
  inspect it to detect re-entrant conditions and avoid infinite block loops.
- **`agent_transcript_path` exposes the Runner's full JSONL transcript.** The Gate can read
  every prior turn the Runner has taken, enabling structural checks (e.g., grep a specific
  file the Runner wrote) that go beyond the final `last_assistant_message`.
- **Hot-reload caveat.** The hook script body is read fresh on every fire — so changes to
  the hook script take effect without restarting the session. However, settings-file hook
  *registration* does not hot-reload mid-session. Relay is therefore shipped as a stable
  installed hook whose behavior is driven entirely by `sprint.json`, which is itself read
  fresh on every fire.

---

## 7. Single-Context vs Isolated Stations

| Mode | Runner lifetime | Handoff | Right when |
|---|---|---|---|
| **Single context** (default) | One Runner for the whole sprint | None — working memory is continuous | WPs are coupled (typical: one codebase, shared state) |
| **Isolated stations** | Fresh Runner per WP | Explicit handoff contract serialized between Runners | WPs are genuinely independent; context isolation outweighs memory continuity |

The single-context mode is the default because WP coupling is the normal case: a test WP
depends on the implementation WP's exact file paths and API surface; a docs WP depends on
the test WP's assertions. Requiring no serialization also eliminates a class of handoff
bugs where the contract misses an implicit assumption.

Context growth over a long sprint is the associated cost. The mitigation is compaction
between WPs when the context is approaching limits — not switching to isolated stations.

---

## 8. Empirical Grounding

Relay's shape is defined by eight controlled A/B runs executed during design (SPEC §10).
Three findings came out:

**Finding 1 — Prompt-scale compliance is solved.** Both a frontier model and a cheap model
implemented fully-specified single-prompt specs correctly on the first pass, including a
12-rule pricing engine with interacting business rules. A clean spec that fits in a single
prompt is squarely in the model's wheelhouse. This ruled out prompt-engineering as the
primary intervention.

**Finding 2 — Reflection is zero-gain or harmful on verifiable work.** Forced
"reflect and improve" passes on already-correct outputs produced zero functional gain
across runs and in one case regressed a correct solution to broken (a refactor pass
introduced an undefined-variable bug). This finding directly motivates the keep-best
invariant (§4) and rules out reflection as a Relay primitive.

**Finding 3 — The hypothesized "requirements get dropped at scale" failure mode did NOT
materialize (measured).** We originally designed Relay around the belief that a monolith drops
requirements as work grows. Measurement falsified it: on freshly generated, contamination-immune,
held-out-graded campaigns, a strong model implements a *complete, precise* spec of up to N=300
distinct, coupled requirements first-pass (≈8 turns, ~$1), on both a templated and a non-compressible
substrate. The monolith does not break, so there is no crossover for a per-step ratchet to win at
(see [benchmark/RESULTS.md](../benchmark/RESULTS.md)). What this leaves is **not** "Relay recovers
dropped requirements" — it is the deterministic, model-improvement-robust core: an external oracle
("a real check passed" replaces "the agent said done"), the keep-best ratchet against regression, and
a tamper-evident verified-trace ledger. Relay's value is **proof, not amplification.**

These findings explain every non-obvious decision in the design: why there is no reflection step
(Finding 2), why the keep-best latch is a hard invariant (Finding 2), why the Gate must be objective
(so PASS is a real signal — the deterministic oracle, the part that survives Finding 3), and why a
green gate must be earned by an *independent* held-out check, never the one the Runner self-tested
against (gate ≠ grader).

---

## 9. See Also

- [gates.md](gates.md) — DoD check-type catalog, Gate evaluation order, and LLM-judge rubric
  authoring guide.
- [configuration.md](configuration.md) — `sprint.json` schema reference, per-WP model
  selection, retry budget tuning, and hook installation.
