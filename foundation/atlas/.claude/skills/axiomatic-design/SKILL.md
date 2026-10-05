---
name: axiomatic-design
description: >
  Map functional requirements to design parameters and find COUPLING — the lean Axiomatic Design core. Build
  the FR↔DP two-column table + the X/O design matrix; an off-diagonal X across rows = coupling = a design smell
  to redesign, order, or co-locate. Feeds ratification-gate's independence gate and surfaces the cross-module
  seams S4's seam-freeze consumes. Invoke in the design's Structure phase.
---

# /axiomatic-design — FR↔DP coupling matrix (the lean core)

> **Authority:** Nam P. Suh, _The Principles of Design_ / _Axiomatic Design_ — the FR↔DP mapping, the design
> matrix, the **Independence Axiom**. We use the **lean core only**; the Information Axiom's probability math,
> reangularity/semangularity, and deep zigzag hierarchies are dropped as academic ceremony for a software
> substrate (see Anti-overhead).

## Scope

Given a design's **functional requirements** (FRs — the _what_, = the ratified outcome statements) and its
**design parameters** (DPs — the _how_, the mechanisms/modules chosen to satisfy them), build the **design
matrix** and read off **coupling**. This surfaces, mechanically, which invariants fight each other — the input
to [`ratification-gate`](.claude/skills/ratification-gate/SKILL.md)'s independence gate, and the origin of the
cross-module seams `S4`'s seam-freeze consumes.

## The mechanism

- **FR** = a functional requirement stated solution-agnostic (an outcome statement). **DP** = the design
  variable / mechanism chosen to satisfy it.
- **Design matrix** `A`: `A[i][j] = X` if `DP_j` affects `FR_i`, else `O` (Suh: `A_ij = ∂FR_i/∂DP_j`).
- Read the shape:
  - **Diagonal (uncoupled)** — each FR controlled by exactly one DP. Ideal; each invariant adjusts independently.
  - **Triangular (decoupled)** — FRs satisfiable _if the DPs are set in a fixed order_; the order is a declared dependency. Acceptable.
  - **Full (coupled)** — a DP moves ≥2 FRs; no clean order exists. A **design defect**, not a taste.
- **Independence Axiom** (Suh, Axiom 1): choose DPs so the matrix is diagonal (ideal) or at worst triangular.
  **Theorem 1** (a free lint): if `#DPs < #FRs`, the result is **coupled, OR the FRs cannot all be satisfied** —
  too few DPs forces FRs to fight one knob.

## The lean procedure (1–2 levels, not deep zigzag)

1. List FRs (the _what_) and DPs (the _how_) in two columns.
2. Mark the X/O matrix: for each FR, which DP(s) affect it.
3. Read per row: on-diagonal = independent; triangular = declare the order; **off-diagonal X across rows =
   coupled = flag**.
4. Resolve **per shape**: **decoupled** (triangular) → _declare the DP order_; a cross-module ordered
   dependency becomes an S4 **seam-freeze** (producer owns, consumer consumes). **Coupled** (circular,
   un-orderable — X on both sides of the diagonal): **same-module** → co-locate the pair in one work-package;
   **cross-module** → it **cannot** co-locate (S4 forbids a multi-module WP) — break the coupling by freezing the
   shared mechanism upstream as one artifact both consume (a **seam-freeze**), or redesign the DP boundary. (The
   core — KERNEL+PERSIST merge — is exactly this: `FSPEC-merge` is frozen once upstream, both consume it.)
5. **The DP boundary sits at the decision most likely to change** (Parnas: hide the changing decision;
   Ousterhout: deep module, simple interface over powerful implementation). Independence says _separate_;
   Parnas/Ousterhout say _where the cut is_. — Greenfield: _draw_ it there. **Brownfield ratification** (recover,
   don't expand): _read_ the existing boundary and check it hides the changing decision — a smell, not a new cut.

## Anti-overhead (deliberately dropped)

The **Information Axiom** quantitative machinery (`I = log2(1/P)`, common-range integrals) → keep only its
qualitative teaching: prefer the simplest design that satisfies the independent FRs; beware a zero-overlap
invariant that literally cannot be met. Reangularity/semangularity, and zigzag beyond 2–3 levels → dropped. The
coupling matrix + the independence smell is the whole high-ROI core.

## Output — the coupling verdict (feeds `ratification-gate` gate 3)

```
FR↔DP matrix (level 1):
        DP1  DP2  DP3
  FR1    X    O    O     on-diagonal — independent
  FR2    O    X    O     on-diagonal — independent
  FR3    O    X    X     DECOUPLED — lower-triangular; set DP2 before DP3, then order-solvable (acceptable)

a COUPLED (defect) matrix — X on BOTH sides of the diagonal, no ordering works:
        DP1  DP2
  FR1    X    X
  FR2    X    X     circular → redesign the DP boundary, or co-locate the pair in one WP
```

Per invariant, emit its `independence:` value for the register row:
`on-diagonal | decoupled-after INV-x | COUPLED-with INV-y`.

## Self-check

- [ ] every FR mapped to ≥1 DP; `#DPs ≥ #FRs` (Theorem 1)?
- [ ] matrix read per row; every off-diagonal coupling flagged?
- [ ] each coupled cell resolved (redesign / declared order / co-locate)?
- [ ] DP boundaries drawn at the decision-most-likely-to-change (Parnas / Ousterhout)?
