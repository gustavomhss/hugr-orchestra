# Orchestra — Team & Phases (the separation of concerns)

> The owner's directive: **separate orchestration from specification, product design, and
> architecture.** v1 conflated them — the "lead" invented product, spec, architecture, decomposition,
> and drove execution, all in one blurred role. Orchestra splits these into distinct **disciplines**,
> each owned by a distinct **persona**, in a clear order. This document is the canonical map of who
> owns what.

## 1. The phases (a work item flows down; nothing skips a phase)

```
  ┌──────────── UPSTREAM: what & why (working backwards) ────────────┐
  1. DEFINE      working-backwards · product design · spec            ← new persona(s)
  2. DESIGN      technical architecture                               ← new persona
  ├──────────────────── THE HANDOFF (a ratified spec + architecture) ────────────────┤
  3. ORCHESTRATE decompose → dispatch → integrate                     ← the Conductor
  ├──────────────────── DOWNSTREAM: build it ───────────────────────┤
  4. EXECUTE     produce the artifacts                                ← generators
  5. VERIFY      judge them adversarially                             ← evaluators
  6. SUPPORT     explore / research / document                        ← support seats
```

**The load-bearing separation:** phase 3 (ORCHESTRATE) is a _different discipline_ from phases 1–2
(DEFINE/DESIGN). **The Conductor does not invent product, spec, or architecture.** It receives a
_ratified_ spec + architecture and orchestrates the build. When the plan is under-decided, the
Conductor bounces it back UP to Define/Design — it never fills the gap by guessing (that was v1's
hallucination door). Upstream decides; the Conductor executes decisions.

## 2. The disciplines & their personas

### Upstream — DEFINE and DESIGN (the personas this phase needs, per the owner)

These are the personas we are missing today, and the ones we use **right now** while working backwards
on Orchestra itself.

| Persona (placeholder name — owner to confirm) | Phase    | Discipline                                                                                                                                                                                                         | Kit (placeholder) |
| --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| **the Product Definer** — e.g. `walt`         | 1 DEFINE | Working-backwards (PR/FAQ from the customer), product design, and the precise **spec** (acceptance criteria + the five axioms) that the whole build is verified against. Owns _what & why_.                        | `NORTHSTAR`       |
| **the Architect** — e.g. `archie`             | 2 DESIGN | The technical **architecture**: layers, contracts, seams, the build order. Produces the ratified design the Conductor decomposes. Distinct from `bobby`, who _verifies_ architecture — the Architect _creates_ it. | `KEYSTONE`        |

> Open for the owner: is DEFINE one persona (product + spec together) or two (a product persona and a
> separate spec persona)? Proposed: **one** Definer owns working-backwards→product→spec as a single
> discipline; split later only if it gets heavy. Names/kits above are placeholders — rename freely.

### The Conductor — ORCHESTRATE (phase 3) · kit `PODIUM`

Not a "seat"; it is the orchestration layer itself (`packages/orchestrator`), driven in a session by a
lead — kit **`PODIUM`** (the podium the conductor works from; ratified 2026-07-16). It has its own
per-member Memory like any seat (task/pr/project + the **logbook**). It decomposes the ratified design
into disjoint, contract-bound WPs, dispatches them to seats with a chewed brief, enforces the
return-firewall + the GAN rule, and integrates. **This is the part
we design first** — the conductor's design lives in the **Orchestra** consumer repo (`docs/design/orchestration.md` there).

### Downstream — the existing seat roster (EXECUTE / VERIFY / SUPPORT)

The roster is fixed and named, so role is known (no self-declared `role` field — §ARCHITECTURE 5.1):

| Seat      | Phase                 | Discipline                                                                  | Kit        |
| --------- | --------------------- | --------------------------------------------------------------------------- | ---------- |
| `charlie` | 4 EXECUTE (generator) | backend execution — transcribes anchor code, never designs                  | FORGE      |
| `patty`   | 4 EXECUTE (generator) | frontend execution — against a frozen design-token contract                 | ATELIER    |
| `lucy`    | 5 VERIFY (evaluator)  | cold code-review — mechanical evidence, never sees the author's chat        | MICROSCOPE |
| `billy`   | 5 VERIFY (evaluator)  | security — proves exploitability with taint paths + PoC-as-gate             | FORTRESS   |
| `bobby`   | 5 VERIFY (evaluator)  | architecture **verification** — measured graph/metric, anti-overengineering | BLUEPRINT  |
| `frankie` | 5 VERIFY (evaluator)  | process-audit — replays the hash-chain; proves "sealed=green" is real       | GAVEL      |
| `jimmy`   | 6 SUPPORT (explorer)  | exploration/research — grounded invariants, adversarially contested         | COMPASS    |
| `rosie`   | 6 SUPPORT             | documentation-gardening — re-checks prose against code                      | GREENHOUSE |

## 3. The GAN rule (enforced from this roster)

A **generator's** WP (`charlie`/`patty`) is **not sealable** until a matching **evaluator**
(`lucy`/`billy`/`bobby`/`frankie`) returns a passing ResultCard. The Conductor enforces this from the
roster above — the owner's "cold-review every returning agent" law is structural, not a habit.

## 4. Why this separation matters (the v1 failure it fixes)

In v1 the lead did everything, so product/spec/architecture were _implicit_ — invented on the fly,
never ratified, never navigable. That is exactly why "99% of the dream product was missing or sloppy":
nobody _owned_ defining it. Orchestra makes DEFINE and DESIGN first-class, owned phases with a hard
handoff, so the Conductor only ever orchestrates work that was actually decided.
