---
name: functional-surface
description: >
  Enumerate the COMPLETE functional surface of a product — every feature, user-goal, use case (with
  extensions), and how-to — as the completeness backstop the requirements decomposition consumes. A thin
  rubric: the L0–L3 nesting template, the six orthogonal completeness lenses (the disciplined form of
  "iterate until nothing new surfaces"), and the boolean closure predicates that turn "did we catch
  everything?" into an auditable gate. Invoke before decomposing a design into requirements.
---

# /functional-surface — the complete behavioral catalog (before requirements)

> **Authority (primary sources, read the load-bearing parts):** Cockburn, _Writing Effective Use Cases_
> (2000) — the actor-goal census + per-step **extensions** enumeration (the real completeness engine) ·
> Patton, _User Story Mapping_ (2008/2014) — the narrative **backbone** + the "re-walk with a different
> hat" multi-lens pass · Procida, _Diátaxis_ — how-to + reference are the surface (tutorials/explanation
> are not) · Brandolini, _Event Storming_ — the events→commands→policies sweep-order that surfaces
> **system-initiated** behavior with no human actor · Klement, _Job Stories_ (trigger phrasing only —
> opinion, not evidence). Nothing invented.
>
> _Honesty:_ Cockburn and Patton both concede the _human_ judgment is "confidence," not proof — a story
> map is a **gap-spotting device, not a closure proof**. The closure predicates below are what convert
> that confidence into a gate. This skill is deliberately thin (see the cut-list); the value is the lens
> set + the predicates, not ceremony.

## Where this sits

The design (FRs + invariants) says what must be _true_; this says what the product _does_ — the
user-facing behavioral catalog. It is the **completeness backstop** the decomposition (S1 requirements,
S3 goldens) consumes: you cannot prove requirements cover every behaviour if the behaviours were never
enumerated. Runs **after framing (D1), before Structure (D2)**. A flat feature list is _not_ enough — it
is the thing that silently misses; the nesting + lenses below are what make it complete.

## The L0–L3 nesting (the structure — one template, each layer is the next's completeness spine)

| layer             | frame                                                                                          | source                | role                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------- |
| **L0 — Census**   | **Actor–Goal List**: every actor (incl. **non-human** + **time/event triggers**) × their goals | Cockburn steps 2–3, 5 | the completeness **ledger** — rows=actors, cells=user-goals; no empty row/col |
| **L1 — Journey**  | **story-map backbone**: activities left→right in **narrative flow**, tasks below               | Patton                | orders goals into a lifecycle so _gaps between steps_ show                    |
| **L2 — Behavior** | one **use case per user-goal**: main success scenario (**3–9 steps**) + **Extensions**         | Cockburn              | depth + per-step negative-space — **where completeness is earned**            |
| **L3 — Manual**   | **how-to + reference** entry per user-goal (Diátaxis: _only_ these two modes)                  | Procida               | the "instruction manual" surface                                              |

**Traversal:** L0 census → arrange on the L1 backbone → expand each cell into an L2 use case with
extensions → each use case emits one L3 how-to + **one Given-When-Then** as its testable exit. Goal
levels (Cockburn): summary=**kite `+`**, user-goal=**sea `!`**, subfunction=**fish `-`** — every kite
decomposes, every fish rolls up to a sea-level goal. The **feature catalog** is just the flattened
L0×L2 list; write the nesting, not the flat list.

## The six completeness lenses (the disciplined "iterate ~4× until nothing new")

Each lens is a **separate re-walk** of the whole artifact. Sweep, union new items, dedup, repeat the set
until a full pass surfaces nothing new (**loop-until-dry**). They are orthogonal on purpose — each is
blind to what the others catch.

1. **Actor** (Cockburn step 2) — enumerate _every_ actor, explicitly incl. **non-human actors + time/event
   triggers**. The single most-missed source of behaviour.
2. **Actor×Goal matrix** (Cockburn step 3) — the L0 ledger: every actor has ≥1 goal, every goal an owner
   actor. (Replaces a "by-subsystem" sweep — subsystem is a decomposition concern, weak for surface.)
3. **Journey / lifecycle** (Patton) — walk the backbone L→R; a missing step between two activities is a
   hole. Re-walk **once per distinct persona** (Patton's "different hat").
4. **Extension / negative-space** (Cockburn step 9) — for **every** MSS step, exhaustively list "what can
   the system detect and must handle." The **strongest engine** in the corpus; do it as discipline, not vibe.
5. **Reactive / policy** (Brandolini sweep-order) — sweep domain **events → commands → policies**
   ("Whenever X, then Y") to catch **system-initiated / automated** behaviour with no human actor — invisible
   to lenses 1–4. Closes their biggest blind spot.
6. **Resource / CRUD** (folklore — no canonical author; cheap) — per data entity: Create/Read/Update/
   Delete/List each accounted for, or explicitly N/A.

## Closure predicates (the boolean gate — not a feeling)

The catalog is COMPLETE only when **all** hold (report each explicitly, name any that fail):

- [ ] Actor×Goal matrix has **no empty row and no empty column**.
- [ ] Every user-goal (sea-level) use case has an **Extensions** section produced by per-step enumeration —
      **no MSS step left un-interrogated**.
- [ ] Every **kite** goal decomposes; every **fish** rolls up to a sea-level goal — **no orphans**.
- [ ] Every backbone activity **re-walked by every persona**.
- [ ] Every domain **event** has a producing command/actor **and** ≥1 consumer/policy (event-storming closure).
- [ ] Every **entity** has CRUD accounted for (or explicit N/A).
- [ ] A full lens sweep surfaced **nothing new** (loop-until-dry reached).

## Cut-list — what NOT to adopt (ruthless, against overhead)

- **Full Event-Storming ceremony** (wall, sticky taxonomy, hotspots, facilitation) — take **only** the
  sweep-order as lens 5.
- **Cockburn's full template on every use case** (precision levels, stakeholder-interest tables, tech/data
  variations everywhere) — actor-goal + extensions **everywhere**; reserve the full template for the few
  core/high-risk use cases.
- **Job Stories as a framework** — unproven opinion; borrow only situation-first _phrasing_ for triggers.
- **Diátaxis tutorials + explanation** — pedagogy, not surface. Only how-to + reference.
- **INVEST** — a decomposition-phase filter; Independent/Small actively fight surface _completeness_. Not here.
- **Gherkin authoring at surface time** — one Given-When-Then stub per use case is enough; scenario tables
  belong to S1/S3.
- **Story-map release slicing / MVP tape-lines** — prioritization. The functional surface is
  _un-prioritized by definition_ (everything the product does). Slicing comes later.

## Self-check before shipping the catalog

- [ ] L0–L3 nesting present (not a flat feature list)?
- [ ] all six lenses swept, each as its own pass, to loop-until-dry?
- [ ] all seven closure predicates reported, with failures named (not hand-waved)?
- [ ] extensions enumerated per-MSS-step (the completeness engine actually run)?
- [ ] reactive/policy lens run (system-initiated behaviour caught), not just actor-goal?
- [ ] cut-list honored — no ceremony, no prioritization, no premature slicing?
