---
name: completeness
description: >
  Decide whether a decomposition is COMPLETE — not just "is every item traced" but "did we miss anything."
  The layered methodology: coverage (have it) + capture (design-vs-register) + per-INV enumeration (Leveson
  criteria) + golden teeth (mutation + vacuity). Run at every freeze gate; cheap-by-default, human effort
  scaled to invariant risk. Invoke to judge completeness of any state's output.
---

# /completeness — is the decomposition complete? (the layers beyond coverage)

> **Authority:** Leveson, _Completeness in Formal Specification…_ (FMSP'00) + _Safeware_ (the RSM completeness
> criteria) · Heitmeyer/Jeffords/Labaw, SCR consistency checking (TOSEM'96) + the Parnas four-variable model ·
> Basili et al., Perspective-Based Reading (Empirical SE'96) · Beer et al., vacuity detection (FMSD'01) ·
> DeMillo/Lipton/Sayward, mutation adequacy (IEEE Computer'78). Nothing here is invented.

## The reframing (the whole skill rests on this)

**"Every item is traced" is the weakest completeness claim.** Completeness is about **the cases you did NOT
write down** — and traceability cannot find a missing case, because a missing case has no item to trace. Worse
(Leveson, citing cognitive psychology): an incomplete spec _actively impairs_ review, because reviewers trust
it as comprehensive — "out of sight, out of mind."

The unifying engine is **teeth** — and it is the same formal object in two independent literatures:

- **mutation adequacy** — a golden that kills no mutant of its requirement is vacuous;
- **vacuity** — a property φ is vacuous if some subformula "does not affect" its truth (Beer): it passes by
  antecedent failure (the guarded state never occurs) or by collapse.

> **The law:** a check has _teeth_ iff there **exists a counterfactual mutant of the artifact under which the
> check flips to BROKEN**. No such mutant ⇒ the check is vacuous ⇒ it marks a hole. (IBM field data: ~20% of
> first-run properties passed _trivially_, and trivial pass **always** meant a real design/environment bug.)
>
> **Honest status:** mutation adequacy and vacuity are **mechanical only against executable code / a model
> checker** — which exist post-implementation. At **decomposition/design time** teeth is a **discipline** (the
> author writes the golden to be failable and judges the violating mutant); it becomes the mechanical, always-on
> CI gate this doc describes **once the code lands**. Do not read the "~free CI" framing below as running today.

## The four layers (and which method checks which)

| layer                       | the question                                                                            | method                                                                                                           | mechanizable?                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **(a) coverage**            | every `INV` → ≥1 `REQ` → ≥1 `SCN` → a `WP`?                                             | the `reconciler` (have it)                                                                                       | **fully** — but it is only the FLOOR; blind to a missing INV / input / toothless golden |
| **(b) capture**             | did we recover **every behavior the design implies** into the register at all?          | inspection reading (perspective-based / N-fold) + mechanical **closure** over a declared design-element register | **judgment** (closure is mechanical; the register-building is not)                      |
| **(c) per-INV enumeration** | within each `INV`, is every input / state / edge / timing / unwanted-behaviour handled? | **Leveson criteria** + **SCR** coverage/disjointness                                                             | **mostly mechanical** on tabular guards; else structured checklist                      |
| **(d) golden teeth**        | do the goldens actually flip to BROKEN on a violation?                                  | **mutation adequacy** + **vacuity**                                                                              | **fully** (given a mutation-operator set)                                               |

## Layer (c) — the Leveson per-INV checklist (the reusable core)

Model each `INV` as its part of a Requirements State Machine. For each structural part, ask **"is every case
defined?"** The always-run **robustness triple** (SCR-mechanizable on tabular guards; counterexample = the
missing/overlapping case):

1. **Coverage** — every input case handled; the **OR of the guards on all transitions out of a state is a
   tautology** (no input falls through a gap).
2. **Disjointness** — the guards are **pairwise mutually exclusive** (no nondeterminism).
3. **Timeout** — a defined behaviour for the case where **no input arrives** within a bound.

Then the category sweep (checklist, scoped to one INV — cheap):

- **state/mode** — startup + shutdown + mode-transition + off-nominal/"unknown" state defined?
- **input** — every monitored variable used somewhere; value + timing (arrival, obsolescence) assumptions stated?
- **output** — value + timing (deadline, load limits); exception if deadline missed; **feedback** it took effect?
- **timing/data-age** — obsolescence bound after which a value must not be used; latency of validity.
- **unwanted-behaviour** — data-age expiry, reversibility/undo, preemption — the edge/failure cases accidents come from.

## The brownfield gate ladder (concrete, per layer)

Brownfield advantage: **the ratified design is the oracle** — capture is auditable against a concrete object,
not unknowable stakeholder intent. Four gates, each a hard predicate:

**Gate 0 — Coverage closure** _(mechanical; the `reconciler`)_. Every `INV`→`REQ`→`SCN`→`WP`, 100% over the
behavioural set, **bidirectional** (every REQ/SCN/WP → an `INV`; no orphan = no invented behaviour).

**Gate 1 — Capture reconciliation** _(mechanical closure over a judgment-built register)_.

- Extract a **design-element register** from the design (the SCR/four-variable partition): its {invariants,
  state variables, modes, monitored inputs, controlled outputs, interfaces/seams, declared failure modes,
  timing/latency/data-age constraints}.
- **Reconcile: every design element is _claimed_ by ≥1 `REQ`.** An unclaimed element = a **capture hole** — the
  deep miss Gate 0 is blind to.
- **Domain-partition tautology** (SCR coverage): for each variable/mode an INV constrains, the covering
  requirements partition its full domain — OR of cases = tautology, no gaps.
- **Grow the register** with **perspective-based reading**: a small fixed role set {actor · implementer ·
  adversary/failure · timing} each **re-derives** the design-element list from its angle; union them.
  (The ~35% is Porter/Votta/Basili'95 — _defect-based reading_ beat ad-hoc, while _checklist ≈ ad-hoc_;
  PBR'96's own individual effect was weak/non-significant, its durable win _team-level_ decorrelated
  coverage — a single influential line, replications mixed; treat as a lean, not a law — so the human
  spend must be _active role reading that constructs an artifact_, never a passive tick-list.)

**Gate 2 — Per-INV enumeration** _(Leveson checklist above; mechanical where tabular)_. Run the robustness
triple + the category sweep per INV.

**Gate 3 — Golden teeth** _(mechanical mutation + vacuity — the highest value-per-token check, default-on)_.

- **Mutation adequacy**: per requirement, generate counterfactual mutants (negate a guard, drop a case, weaken
  a bound, flip an output). **Every golden MUST flip to BROKEN on the mutant that violates its requirement.** A
  golden that survives its own mutant is vacuous → the requirement is untested _regardless of Gate 0_.
- **Vacuity / interesting-witness** per formal-tag: require a trace that **non-trivially** exercises the
  property; reject antecedent-failure passes (the golden "passes because the design never enters the state the
  INV governs" — the most dangerous false-green).

## Cost discipline (cheap by default, human effort ∝ invariant risk)

- **Mechanical, always-on, ~free (CI):** Gate 0 coverage · Gate 1 register reconciliation (once the register
  exists) + domain-partition tautology · Gate 2 disjointness/coverage on tabular guards · **Gate 3 mutation +
  vacuity** (default-on — it _falsifies_ "we're done" rather than asserting it).
- **Judgment, cannot be mechanized (be honest):** building the design-element register, and per-INV enumeration
  on prose requirements. You never _prove_ capture completeness — you make omission expensive from three
  directions: mechanical **closure** over a declared register, **perspective reading** to widen it, **mutation**
  to attack the claim from the other side.
- **Sampling, ∝ risk:** perspective count scales with INV criticality — default single structured pass; mid-tier
  2–3 perspectives; **top-tier safety/security → N-fold** (independent second team). Mutation-operator depth
  scales the same (cheap operators everywhere; boundary/timing/interleaving mutants only on high-blast INVs).

## Relationship to the method

Gate 0 **is** the [`reconciler`](.claude/skills/reconciler/SKILL.md). Gate 3 teeth is the same **teeth** as
genesis `GEN-12` and the [`goldens`](.claude/skills/goldens/SKILL.md) failability self-check — reused, not new.
This protocol **orchestrates the four layers** as a completeness verdict, and is **cross-cutting**: its
mechanical gates (0 · 1-closure · 2-tabular · 3) feed the freeze's **GATE**; its judgment layers (register
construction · prose per-INV enumeration · perspective reading) feed the **COLD-REVIEW**. It is what lets a
freeze claim "complete" rather than merely "traced."

## Self-check (before declaring a state's output complete)

- [ ] Gate 0 coverage closure green (bidirectional, no orphan)?
- [ ] Gate 1 — a design-element register exists, and **every element is claimed** by a REQ? domain partitions tautologous?
- [ ] Gate 1 — register widened by ≥1 non-author perspective (N-fold for top-criticality INVs)?
- [ ] Gate 2 — robustness triple + category sweep run per behavioural INV?
- [ ] Gate 3 — **every golden flips to BROKEN on its violating mutant**; no formal-tag passes vacuously (antecedent failure)?
- [ ] human effort spent ∝ invariant risk, not uniformly; no reliance on a passive checklist?
