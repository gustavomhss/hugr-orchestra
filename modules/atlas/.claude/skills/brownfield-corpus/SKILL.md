---
name: brownfield-corpus
description: >
  Writing the specification AFTER the code, honestly — the lift-and-tag protocol for recovering an
  invariant register, requirements, goldens and work-package cards from a subsystem that shipped without
  one. Covers when writing the spec first would be inventing, the verbatim-clause rule that makes the lift
  checkable, and the traceability the corpus must close. Invoke when a shipped subsystem has no
  requirements corpus, or when a plan orders the spec before code that already exists.
---

# brownfield-corpus — the spec written after the code, and saying so

## When this is the right order

A plan usually puts the requirements corpus **first**, and usually that is right. It is wrong in exactly
one case, and the case is common in a real repository:

> The code already shipped, and no corpus was ever cut for it.

Writing the spec first would then be **inventing** — authoring behaviour nobody built and nobody measured.
Writing it after is a **lift**: every clause recovers something already running and already tested. Invert
the plan's order deliberately, and **state the inversion in the corpus itself** rather than letting a
reader assume it was written first.

Measured trigger: a productization ring existed for one subsystem and mentioned a sibling subsystem
**zero times**. That count — not a feeling — is what established there was nothing to build against.

## The lift rule

**Every clause states behaviour that is on `master` and measured by a named test.** Not behaviour you want,
not behaviour that would be nice, not the design as remembered. If you cannot name the test, it is not a
lift — it is a wish, and it belongs in a backlog item instead.

Each clause line carries its witness: `*(measured: path/to/its.test.ts)*`. A reader can go check.

## The verbatim-clause rule, which is what makes the lift checkable

A traceability gate worth having asserts that each requirement's quoted clause occurs **verbatim** inside
the invariant it cites. Paraphrase fails it — correctly, because a paraphrase is a second, drifting copy.

The first cut of a 62-requirement lift paraphrased, and produced **65 failures**. Two ways out:

- ledger all 65 as declared divergences — bulk-declaring a divergence you could simply not have;
- **build the invariant text FROM its own clause list**, so every clause is literally a substring.

Take the second. The invariant becomes the join of its clauses plus an explicit `MUST NOT` tail carrying
the unwanted set — so both the positive lifts and the `If-then` guard requirements quote real substrings,
and **zero entries** enter the divergence ledger.

## Shape of the corpus

For each invariant: `clauses[]` (what must hold) and `unwanted[]` (what must never happen). Then:

- **one requirement per clause** — a plain `shall` sentence;
- **one guard requirement per `unwanted[]`** — an `If-then` refusal sentence;
- **one golden per requirement**, naming the shipped test as its witness;
- **work-package cards** scheduling every requirement and every golden.

Expect roughly `clauses + unwanted` requirements. Count them **before** starting and report the number: a
12-invariant lift produced 36 + 26 = **62** requirements, against a plan that had estimated "about two
days". Saying that up front is cheaper than discovering it halfway.

## Traceability must close, and a gate should say so

The corpus is not done when it reads well. It is done when the mechanical check reports **every**
requirement and every non-held-out scenario consumed by a work-package card, zero ratcheted, zero dangling.
Prose does not schedule anything — only a structured pointer does.

Because of that, **the requirements, the goldens and the cards must land in ONE change**. Requirements
without cards are orphans and the gate will say so.

## Generate it, do not hand-type it

At this volume, hand-authoring guarantees drift between the register, the requirements, the goldens and the
cards. Define the invariants **once** as structured data and emit all four artifacts from it. Consistency
becomes a property of the generator instead of a property of your attention.

## What the corpus must not do

- **Do not lift behaviour that has not shipped.** If one work package is still in flight, mark its clauses
  as out of scope and say why — writing them early is the one thing a lift may not do.
- **Do not smuggle new behaviour in as a lift.** If the exercise reveals something the code _should_ do and
  does not, that is a finding and a backlog item, not a clause.
- **Do not reuse the subsystem's own invariant family** for the ring around it. They are different
  invariants at different layers; colliding ids merge two claims that were never the same.
