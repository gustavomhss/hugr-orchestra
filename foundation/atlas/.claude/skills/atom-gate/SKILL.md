---
name: atom-gate
description: >
  The requirement quality gate — ISO/IEC/IEEE 29148:2018. Given a candidate requirement (already
  EARS-well-formed) and the requirement SET, decide pass/fail against the 9 individual + 6 set
  characteristics. The atomicity law (Singular) lives here. Invoke to accept or reject a requirement in
  state S1, after `ears` and before freeze.
---

# /atom-gate — the requirement quality gate (ISO/IEC/IEEE 29148)

> **Authority:** ISO/IEC/IEEE 29148:2018 — **§5.2.5** (the 9 characteristics of an _individual_ requirement)
> and **§5.2.6** (the **5** characteristics of a requirement _set_). Those 14 are the standard, verbatim. One
> extra set item — **Bounded** — is a deliberate **method-specific** scope-guard (from the 29148:**2011**
> stakeholder-needs list / INCOSE GtWR), flagged as such below; it is **not** from §5.2.6.

## Scope — where it sits

`ears` makes a requirement's **syntax** well-formed (one pattern, one `SHALL`). The **atom-gate** is the next
check: is it a well-formed requirement **semantically**, and does the **set** hold together? A `REQ` enters
S1's DoD only if it passes the individual gate; the S1 set freezes only if the set gate holds.

Each check is tagged **GATE** (mechanical — the method's reconciler runs it) or **REVIEW** (judgment — the
cold reviewer runs it). This is exactly the method's GATE/COLD-REVIEW split; the atom-gate is where S1's
`quality standard` and `completeness` facets get their teeth.

**Boundary with `ears`:** `ears` already surfaces ambiguity, implementation-leak, and untestability at the
**syntax** layer (its 8 anti-patterns). The atom-gate re-adjudicates only the **semantic residue** of those
(Appropriate / Unambiguous / Verifiable) — it does not re-run the syntactic lint.

## The individual gate — 9 characteristics (ALL must pass)

| #   | characteristic                     | means                                                           | check                                                                                    | by                                       |
| --- | ---------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | **Necessary**                      | traces to a real need; removing it loses something              | cites ≥1 `INV`; the INV is real                                                          | GATE (cite) · REVIEW (real need)         |
| 2   | **Appropriate**                    | right level of abstraction; not implementation                  | no named lib/product unless already normative in the INV                                 | REVIEW                                   |
| 3   | **Unambiguous**                    | exactly one reading                                             | no vague adjective / `~`; one referent for each noun                                     | GATE (lint) · REVIEW                     |
| 4   | **Complete**                       | trigger + precondition + response all present; nothing dangling | the EARS clauses are all filled                                                          | REVIEW                                   |
| 5   | **Singular** _(the atomicity law)_ | ONE capability / constraint                                     | exactly one `SHALL`; no `and`/`or` joining independent guarantees → else split (`-a/-b`) | GATE (one SHALL) · REVIEW (independence) |
| 6   | **Feasible**                       | implementable under the constraints (esp. `A-14` no-embeddings) | no INV constraint makes it unbuildable; `A-14` respected                                 | REVIEW                                   |
| 7   | **Verifiable**                     | a pass/fail check (a golden) can be written                     | "can you write the golden?" — if no, it is **not an atom**                               | REVIEW                                   |
| 8   | **Correct**                        | faithfully projects its `INV` clause (no spec-echo)             | `normative-clause:` quotes the clause verbatim                                           | GATE (quote present) · REVIEW (fidelity) |
| 9   | **Conforming**                     | follows the template + `ears` standard                          | matches the REQ template + one EARS pattern                                              | GATE                                     |

Any fail → **fix or reject**; never wave (the rigor compact). #5 Singular and #7 Verifiable are the two that
most often force a split or a rejection — they are the atomicity backbone.

## The set gate — 5 (ISO 29148 §5.2.6) + 1 method scope-guard (checked at the S1 freeze)

| #   | characteristic                              | means                                                                 | by                                |
| --- | ------------------------------------------- | --------------------------------------------------------------------- | --------------------------------- |
| 1   | **Complete**                                | every behavioural `INV` is covered; no gaps                           | GATE (the coverage matrix = 100%) |
| 2   | **Consistent**                              | no two `REQ`s contradict                                              | REVIEW                            |
| 3   | **Feasible**                                | the whole set is buildable within constraints                         | REVIEW                            |
| 4   | **Comprehensible**                          | the set is understandable as a whole                                  | REVIEW                            |
| 5   | **Able-to-be-validated**                    | every `REQ` can be checked (has ≥1 golden — confirmed in S3)          | GATE (≥1 `SCN`/REQ) · REVIEW      |
| +   | **Bounded** _(method-specific, not §5.2.6)_ | the set stays in scope — brownfield: **nothing beyond the 132 `INV`** | GATE (no orphan REQ) · REVIEW     |

## Procedure

1. **Per REQ** (during S1 authoring): run the 9-characteristic individual gate. Mechanical (GATE) checks first
   — a fast reject; then judgment (REVIEW). Fail ⇒ fix or reject; a Singular fail ⇒ split.
2. **Per set** (at the S1 freeze): run the set gate — the 5 §5.2.6 characteristics + the Bounded scope-guard —
   via the reconciler (GATE items) + cold review (REVIEW items). The set does not freeze until all hold.

## Relationship to the other protocols

`ears` (syntax) → **atom-gate** (quality + atomicity) → `goldens` (S3: every Verifiable REQ gets its check).
Verifiable (#7) is the bridge: a requirement you cannot write a golden for is not a real atom and does not
pass. Singular (#5) is the atomization law the method's warp depends on.

## Worked example

**PASS** — `REQ-KERNEL-10a` ("When a merge yields multiple concurrent heads … the kernel shall select the tip
of the supersedes partial-order as the head"): Necessary (traces `INV-KERNEL-10`); Singular (one `SHALL`);
Verifiable (golden `SCN-KERNEL-10a-1`: two concurrent heads → the supersedes-tip is chosen); Correct (quotes the
clause); Conforming (event-driven EARS + template). ✅

**FAIL → split** — a candidate "the kernel shall select the tip as head **and** break ties by contentHash":
two independent guarantees ⇒ Singular fails ⇒ split into `-a` (the head rule) and `-b` (the tie-break guard).

## Self-check (before the REQ / the set passes)

- [ ] individual: 9/9 pass for this REQ?
- [ ] Singular — exactly one `SHALL`, no bundled independent guarantees?
- [ ] Verifiable — a concrete golden is writable? (if not, reject)
- [ ] set (at freeze): 5 §5.2.6 + Bounded all hold, with 100% behavioural-INV coverage and zero orphan REQ?
- [ ] every fail fixed or rejected — none waved?
