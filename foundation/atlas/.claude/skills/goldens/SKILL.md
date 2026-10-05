---
name: goldens
description: >
  Derive behavioral goldens (acceptance) for a requirement — state S3 of the decomposition method. Goldens
  are the requirement's verifiable face, GENERATED (not hand-authored) from the invariant / formal model
  wherever a generator exists: model-traces, property-based cases, exhaustive enumeration, contract-as-test;
  hand-written only for the residue. Given-When-Then, co-located with the REQ. Invoke to build the acceptance
  set for a requirement.
---

# /goldens — behavioral goldens (Specification by Example)

> **Authority:** Gojko Adzic, _Specification by Example_ (2011) — Given-When-Then as executable **living
> documentation**; ShardStore/SOSP'21 — the reference model as oracle + reused as mock (anti-rot); the
> TLA+→test literature (Modelator / Apalache) — traces generated _from_ the model; property-based testing;
> OpenSpec — requirement and scenario co-located as one object. Nothing here is invented.

## Scope — where it sits (S3)

A golden is a **derived view** of the invariant (the single-source chain): it is the requirement's
**verifiable face**, not a third authored copy. One golden set per `REQ`; the set covers the **happy path +
one guard per unwanted-behaviour clause** the `ears` `If-then` REQ named. Keyed `SCN-<MODULE>-<n>[c]-<k>`,
tagged `source: INV-x`.

**Co-location (OpenSpec):** the Given-When-Then scenario is nested **under** its requirement — the scenario is
the requirement's own testable projection, never a separate document.

## The generation ladder — GENERATE, don't hand-write (the crux)

The v1 trap is authoring the golden as a third copy of the fact (after the EARS sentence and the formal
property). Instead, **the golden's concrete cases come from the invariant's S2 `method-tag`** — you author the
scenario _shape_ once and let the generator produce the cases:

| the INV's S2 method-tag  | goldens come from                                                                                                                                                                                                     | you author                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `formal` (`FSPEC-merge`) | **PBT on the properties by default** (the core is PBT-first); **model-traces only if S2 escalated to a model** (Apalache/Modelator → render each trace: initial state → Given, op → When, asserted post-state → Then) | the properties (or the model if built) — never the cases |
| `exhaustive`             | **the full enumeration** (every input in the finite space; existence + uniqueness asserted)                                                                                                                           | the input space + the assertion                          |
| `PBT`                    | **cases the PBT engine generates** from the property/invariant (thousands, corner-biased)                                                                                                                             | the property once                                        |
| `reference-model`        | **conformance / differential test** against the executable reference model as oracle (apply each op to model + impl, `compare_results`)                                                                               | the op alphabet                                          |
| residue                  | **hand-written** — the tail where no generator applies                                                                                                                                                                | the scenario itself                                      |

Only the residue is hand-authored. For every generated tier you author the **generator input** once — the
model, the property, the op-alphabet, or the input space — **never the cases**, and never a third copy of the
fact; the cases (and their Given-When-Then rendering, via the fixed trace→GWT map above) fall out
mechanically. That is what keeps the golden layer from being a third point of drift.

## The Given-When-Then shape (the readable face)

Each scenario, co-located under its `REQ`, is the human-readable living-documentation rendering. Concrete
values, never abstract:

```
### SCN-KERNEL-10a-1 — two ordered heads → the tip wins        (happy path)
source: REQ-KERNEL-10a
Given a nodeKey with two concurrent heads H1 ≺ H2 in the supersedes order
When the kernel merges them
Then the head is H2 (the tip of the partial order)

### SCN-KERNEL-10b-1 — two unordered heads → contentHash tie-break   (unwanted-behaviour guard)
source: REQ-KERNEL-10b
Given a nodeKey with two concurrent heads H1, H2 unordered by supersedes
When the kernel merges them
Then the head is the one with the lexicographically larger contentHash (max = the pinned-canonical direction; FSPEC-merge §UP KERNEL-10)
```

## Coverage rule (what the set must contain)

For each `REQ`: **one happy-path golden + one guard-golden per unwanted-behaviour clause** of its source
invariant. A `REQ` whose golden is _writable_ but never authored/generated still passes _Verifiable_ (it is
writable) — it fails the set's _Able-to-be-validated_ (no `SCN` exists). (This is S3's `completeness` facet.)

## Teeth — every golden must be able to fail

A golden that **no** counterfactual mutant of its requirement can break is **vacuous** — it proves nothing (the
most dangerous false-green). Author each golden so it **flips to BROKEN** on the mutant that violates its `REQ`
(negate a guard, drop a case, weaken a bound, flip an output). This is the same teeth law as genesis `GEN-12`,
and it is verified at the freeze by the [`completeness`](.claude/skills/completeness/SKILL.md) protocol (Gate 3).
Author for failability; never emit a golden that cannot fail. _(At spec time this is a **discipline** — you
author the golden to be failable and name the violating mutant by judgment; it becomes a **mechanical** CI check
only once executable code exists to mutate and run.)_

## Anti-rot (unconditional — ShardStore)

The `reference-model` goldens' oracle is written **in the build language** and **reused as the mock** in unit
tests — the build breaks when the spec drifts from the code. This is the one mechanically-real drift fence
between code and its model; adopt it wherever a reference model exists.

## Relationship to the other protocols

`ears`/`atom-gate` (S1: the REQ, Verifiable) → `formal-decision` (S2: the method-tag that says which generator)
→ **goldens** (S3: the cases, generated). The `reconciler` gate then checks every `REQ` has ≥1 `SCN` and every
unwanted-behaviour clause has its guard-golden.

## Self-check (before the golden set passes)

- [ ] one happy-path golden per `REQ`; one guard-golden per unwanted-behaviour clause?
- [ ] cases **generated** from the method-tag's generator (model / exhaustive / PBT / conformance) — only the
      true residue hand-written?
- [ ] every scenario co-located under its `REQ`, id `SCN-<MODULE>-<n>[c]-<k>`, `source:` its REQ, concrete values (no abstractions)?
- [ ] `reference-model` oracle written in the build language and reused as the mock?
- [ ] no golden is a re-authored copy of the fact — each is a derived view?
- [ ] each golden **flips to BROKEN** on its violating mutant (has teeth — not vacuous)?
