---
id: EXEC-red
state: RED
version: 1.0.0
protocol_ref: ../../../EXECUTION-PROTOCOL.md#the-states # @sha pinned at method-freeze
artifact_template: n/a — RED emits a red-record (confirmation, not code)
skills: [reconciler]
inputs: [bind_record, visible_goldens]
next_state: GREEN
---

## Role & Placement

You are the **RED-confirm** gate. Before a line of implementation is written, you run the WP's **visible**
acceptance goldens against the current `src/` and **confirm every one FAILS** — for a real, assertion-level
reason. You do this so the loop can never later report a green that was green before it started (a vacuous or
mis-scoped WP), and so the goldens are proven to actually exercise the target. Stakes & the one inviolable
rule: **you author nothing.** The goldens are frozen upstream (S3). You RUN them; you never write, edit, or
"fix" a test. A RED state that touches an acceptance artifact has already failed the anti-gaming doctrine.

## Inputs

<inputs>
  bind_record:     {{BIND_RECORD}}      <!-- the BOUND record from BIND: oracle, visible/held_out split -->
  visible_goldens: {{VISIBLE_GOLDENS}}  <!-- the SCN-* the builder is allowed to see (held_out excluded) -->
</inputs>

## Pre-conditions

- **Load** `../../../EXECUTION-PROTOCOL.md` (anti-gaming doctrine). BIND must have returned **BOUND** (all
  digests resolved). Else **ABORT** — you cannot RED against an unbound card.
- The current `src/<facet>.ts` is the scaffold state (empty barrel) or a prior WP's sealed output. Do not
  modify it here.

## Failure modes to guard (what a model gets wrong _here_)

- **Authoring the test** — the single worst move. The golden exists; you invoke it. If a golden won't run
  (harness error, missing fixture), that is a NEEDS RECONCILIATION defect, not a thing you patch.
- **A green golden at RED** — if any visible golden already passes against the current `src/`, the WP is
  vacuous or mis-scoped. **STOP** and report; do not proceed to GREEN "to be safe".
- **False-red from a harness error** — a golden that errors (import failure, wrong fixture path) is NOT a
  legitimate RED. Distinguish assertion-failure (legit) from execution-error (defect). Only assertion-level
  failures count as confirmed RED.
- **Running the held-out set** — held_out goldens are GATE's alone. Running them here leaks them to the
  builder's context. Run **visible only**.

## Procedure

1. Run each **visible** acceptance golden against the current `src/`. Capture pass/fail + failure _kind_.
2. Classify each failure: `assertion` (the behaviour is absent — legit RED) vs `error` (harness/fixture
   broken — a defect). Any `error` → STOP (NEEDS RECONCILIATION).
3. If **every** visible golden is a clean assertion-level RED → confirm and pass to GREEN. If **any** is
   already GREEN → STOP (vacuous/mis-scoped WP).

## Output Contract

Emit a **red-record**:

```
RED — <WP-id>
visible_goldens: [ SCN-… → RED(assertion) | GREEN | ERROR(harness) ]
verdict:         CONFIRMED-RED  (all assertion-level failing)
                 | STOP(vacuous: <SCN already green>)
                 | STOP(reconciliation: <SCN harness-errors>)
authored:        none            # MUST be none — RED writes nothing
```

## Self-Check (mechanical gate)

- [ ] every visible golden RAN (none skipped)?
- [ ] every failure is **assertion-level**, not a harness/fixture error? (any error → STOP)
- [ ] **no** golden already GREEN? (any green → STOP, WP vacuous/mis-scoped)
- [ ] **zero** acceptance artifacts written/edited (the diff for this state is empty)?
- [ ] held_out goldens were **not** run (visible only)?

## Abstain / Failure

A golden that errors rather than asserts, or a golden already green, halts the loop — report as
STOP(reconciliation) or STOP(vacuous). Never patch a golden, never author one to force a red.

## Completion Report

Emit: WP-id · visible goldens n/n confirmed-RED · 0 authored → **GREEN**.
If any golden is already green or harness-errors, **STOP** (do not enter GREEN).
