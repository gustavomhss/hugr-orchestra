---
name: reconciler
description: >
  The mechanical coverage gate — the read-only reconciler that runs at every transition of the decomposition
  method. Recomputes the bidirectional traceability matrix (INV⇄REQ⇄SCN⇄FSPEC⇄WP), runs the mechanical checks
  (existence, coverage counts, structural invariants, banned-token lint), emits a severity ladder, and blocks
  the freeze on CRITICAL. It never mutates and never adjudicates judgment — it queues those for the cold
  review. Invoke at any state's freeze gate.
---

# /reconciler — the coverage gate (traceability as a computed invariant)

> **Authority:** GitHub Spec-Kit `/analyze` (read-only cross-artifact coverage + consistency analysis) and
> `/clarify` (structured ambiguity scan over a fixed taxonomy). This protocol is the **mechanical half** of the
> method's transition guard; the judgment half is the cold review. Nothing here is invented.

## Scope — where it sits (the GATE at every transition)

The reconciler is **the product**: traceability is not a hand-maintained table, it is a **computed invariant
with a failing gate**. It runs at every state's freeze (`S0→S1→…→S4`), is **strictly read-only** (never edits),
and computes rather than decides. It owns the **GATE** half of the guard (mechanical predicates on ids +
counts); anything semantic (clause fidelity, design⇄spec divergence, ambiguity judgment) it **flags and
queues** for the cold review — it never adjudicates it.

## The bidirectional matrix

Recompute, both directions, at every freeze:

```
INV  ⇄  REQ  ⇄  SCN        FSPEC  ⇄  INV        WP  ⇄  REQ/SCN
```

- forward: every behavioural `INV` → ≥1 `REQ` → ≥1 `SCN`; every `WP` → its `REQ`s + goldens.
- backward: every `REQ` → an extant `INV`; every `SCN` → an extant `REQ`; every `FSPEC` → its cluster's `INV`s.

## The mechanical checks (GATE — all pass or the freeze blocks)

| check                                          | predicate                                                                                                                                            | severity if failed                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **referential existence**                      | every `REQ`/`SCN`/`FSPEC`/`WP` cites an extant upstream id; no orphan either direction                                                               | CRITICAL                                                         |
| **coverage counts**                            | every **behavioural** `INV` has ≥1 `REQ`; coverage = **100%** over the behavioural set; every non-behavioural `INV` carries an `exempt:` disposition | CRITICAL (uncovered behavioural INV **or** un-dispositioned INV) |
| **method-tag completeness** (at the S2 freeze) | every **behavioural** `INV` carries a `method-tag` ∈ {formal, exhaustive, PBT, reference-model}; **exempt** INVs carry `n/a`                         | CRITICAL                                                         |
| **guard coverage**                             | every unwanted-behaviour clause has its `If-then` `REQ` and its guard `SCN`                                                                          | **CRITICAL**                                                     |
| **structural invariants**                      | each `REQ` has exactly one `SHALL` and matches one EARS pattern; each `SCN` keys off its `REQ`                                                       | MAJOR                                                            |
| **banned-token lint**                          | no `~`, `TODO`, `TBD`, `fast`/`robust`/`appropriate` in a normative clause                                                                           | MAJOR                                                            |
| **id integrity**                               | ids follow the pinned scheme; no duplicate id; no gap that dangles a reference                                                                       | MAJOR                                                            |

**Severity ladder:** `CRITICAL` = an uncovered behavioural invariant, a dangling reference, an
**un-dispositioned** `INV` (neither behavioural-with-a-`REQ` nor `exempt:`), or an **unmet unwanted-behaviour
guard** → **blocks the freeze**. `MAJOR`/`MINOR` = drift/lint → dispositioned before freeze, no hard-block.

**Blind spot (honest):** a _never-enumerated_ unwanted-behaviour has **no clause** for guard-coverage to key on
— it is invisible to this mechanical gate and caught only by the judgment/capture layer (`completeness` Gates
1–2). The gate enforces the guards that were **named**; naming them is judgment. This is the method's crux
failure mode and it deliberately does not live in the mechanical layer.

## The ambiguity scan (from `/clarify`) — flag, don't fix

Over a fixed taxonomy (functional scope · data model · interaction · non-functional · edge cases · constraints ·
terminology · completion signals · placeholders), mark each **Clear / Partial / Missing**. This produces the
**queue for the cold review** and, in brownfield, the `[NEEDS RECONCILIATION]` list. The reconciler does not
answer the questions — it surfaces them, ranked by impact × uncertainty.

## The reconciliation passes (from `/analyze`) — read-only

Duplication (same fact twice) · coverage gaps (INV with 0 REQ, REQ with 0 SCN, orphan artifacts) · id/term
inconsistency. Semantic passes it can only **flag** (not decide): ambiguity judgment, design⇄spec divergence,
compound-ness a lint can't catch — these go to the cold review with a citation.

## Output (the reconciler's receipt)

A **Coverage Summary** — `upstream-id | has-downstream? | downstream-ids | severity | note` — plus the metric
**coverage % over the behavioural set** (must be 100 to freeze), plus the flagged semantic queue for the cold
review. Read-only: it emits findings; it changes nothing.

## Brownfield routing

A coverage hole or contradiction the reconciler finds is a **design defect**, routed via `[NEEDS
RECONCILIATION]` to the ratification owner (DEFINE seat) — never invented, never asked of the end-user.

## Relationship to the guard

The transition guard = **reconciler (this, mechanical) ∧ cold review (judgment)**. A state freezes only when
the reconciler is CRITICAL-free **and** the cold review APPROVEs the semantic queue. The reconciler is
CI-runnable and reproducible; that reproducibility is what makes traceability an invariant rather than a chore.

## Self-check (before reporting the gate result)

- [ ] matrix recomputed both directions; every orphan surfaced?
- [ ] coverage = 100% over the behavioural set; every non-behavioural `INV` `exempt:`-dispositioned?
- [ ] CRITICAL = uncovered-behavioural-INV, dangling-ref, or un-dispositioned INV; nothing semantic mis-tagged CRITICAL?
- [ ] semantic items **flagged and queued** for cold review, not adjudicated here?
- [ ] read-only — nothing was edited?
