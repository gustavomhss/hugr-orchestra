---
id: C-roadmap
state: C
version: 1.0.0
protocol_ref: ../../DECOMPOSITION-PROTOCOL.md#c--roadmap
artifact_template: inline # the template facet lives in the state contract (protocol_ref)
skills: [completeness, reconciler]
inputs: [requirements, goldens, functional_surface]
next_state: S4-slice-work-packages
---

## Role & Placement

You cut the frozen requirements+goldens into the **roadmap** (state C): **vertical epics** — right-sized —
grouped into **dependency-ordered campaigns**. This is the **warp** axis (capability, across modules) —
orthogonal to the **weft** (S4's per-module slice). One state, two passes over one artifact: **cut** vertical
epics, then **right-size** them. By now every behavioural decision is frozen upstream (S0–S3); you **group,
size, and order**, never design behaviour or invent scope. Stakes: an epic that is a single module-slab (a
horizontal layer) drags delivery back into "build all of X then all of Y, integrate never"; a campaign ordered
by wish instead of dependency ships a prerequisite after its dependent; an oversized epic becomes an oversized
WP the model lies about.

## Inputs

<inputs>
requirements: {{REQUIREMENTS}}        <!-- frozen S1; the REQ set -->
goldens:      {{GOLDENS}}             <!-- frozen S3; the SCN acceptance per REQ -->
surface:      {{FUNCTIONAL_SURFACE}}  <!-- the L1 story-map backbone = the epic candidates -->
</inputs>

## Pre-conditions

- **Load** `../../DECOMPOSITION-PROTOCOL.md` §C and the `completeness` skill — apply the vertical-slice +
  SPIDR/INVEST doctrine as law; do not restate. Requirements + goldens frozen. Else **ABORT**.

## Failure modes to guard (what a model gets wrong _here_)

- **Horizontal slab (the cardinal sin)** — an "epic" that is one module / one layer (all of KERNEL, "the UI").
  Apply the **carpaccio vertical predicate**: an epic is valid _only if_ it cuts across the backbone end-to-end
  and is **independently demoable** — not a data-structure, UI, or test-set alone (Kniberg/Cockburn). A
  capability, never a layer. (The per-module cut is S4's job, deliberately downstream, _under_ the vertical umbrella.)
- **Output-driven epic** — grouping by "what code" not "what outcome". Every epic carries a **goal-trace**
  (Impact Mapping, adapted — Why→How→What, the Who level elided for an infra product): the goal, the
  behaviour-change, the deliverable. No goal-trace ⇒ not an epic.
- **Orphan / double REQ** — a REQ+golden in zero or two epics. The epic set must **partition** the frozen REQ
  set (total, disjoint) — the one completeness guarantee the sources don't give you; it is yours to enforce.
- **Over-splitting** — carpaccio is a _drill_, not the bar. The bar is **INVEST** (Independent · Negotiable ·
  Valuable · Estimable · Small · Testable). Right-size only until each epic feeds one S4 module-cut per module
  it touches; never shave to nano-slices.
- **Un-named / horizontal split** — every split cites its **SPIDR** pattern (**S**pike · **P**ath · **I**nterface
  · **D**ata · **R**ules) and `union(children).reqs == parent.reqs` (lossless); every child still passes carpaccio.
- **Date/wish ordering** — sequence campaigns by **explicit dependency edges → a DAG → Now/Next/Later** (Bastow:
  _Now_ = prerequisites met, _Next_ = defined but blocked, _Later_ = a bet needing discovery). Never by dates.

## Procedure

1. **Cut** — lay the frozen REQ set on the **backbone** (functional-surface L1 activities, narrative order);
   derive **epics** as vertical capabilities, each with a one-line goal-trace, owning a disjoint REQ+golden set;
   apply the carpaccio predicate, reject any single-layer/module epic → re-cut vertically.
2. **Right-size** — any epic too big for one S4 module-cut: split by the smallest SPIDR pattern into the fewest
   INVEST-valid, still-vertical child epics; cite the pattern; verify lossless union; an epic fitting no pattern
   is atomic (leave it).
3. **Group + order** — group epics into **campaigns** (release slices); build the campaign **DAG** (no cycles);
   assign each a **Now/Next/Later** horizon by dependency-readiness.

## Output Contract

Emit `docs/roadmap/roadmap.md`. Each epic and campaign is exactly:

```
### EPIC-<n>[-<k>] — <capability title ≤ 8 words>
goal-trace: "<goal> → <behaviour-change> → <this deliverable>"
vertical: <the end-to-end path, ≥1 module, independently demoable>
reqs: [ REQ-<MODULE>-… ]
campaign: CAMPAIGN-<m>
split: <SPIDR pattern> from EPIC-<n>   # omit if atomic (not split)

### CAMPAIGN-<m> — <milestone title>
epics: [ EPIC-… ]
prerequisites: [ CAMPAIGN-… ]   # may be empty (a root)
horizon: Now | Next | Later
```

Then `## Coverage` (REQ→epic partition: orphans/doubles = 0; the campaign DAG edges; every split's union==parent).
IDs sequential/stable; **no prose outside these blocks.** A REQ the design forces into a horizontal/module-only
epic ⇒ `## [NEEDS RECONCILIATION]`, not a fabricated vertical.

## Examples (copy the _form_)

```
### EPIC-3 — merge-convergence works end-to-end
goal-trace: "two seats never lose a fact on merge → colliding writes converge deterministically → the CAS+merge core, addressable through a query surface"
vertical: KERNEL (OR-Set fold) → PERSIST (git merge seam) → TOOLS (the converged node is addressable) — demoable: two branches merge, one head, 0 lost
reqs: [ REQ-KERNEL-9a, REQ-KERNEL-10a, REQ-KERNEL-11, REQ-PERSIST-11-b, REQ-TOOLS-10a ]
campaign: CAMPAIGN-1

# a right-size split of an oversized epic (SPIDR Path: the two folding routes)
### EPIC-3-a — single-event identity + idempotent append
goal-trace: "a re-delivered event never double-counts → content-identity makes append idempotent → the identity+append route"
vertical: KERNEL (event identity + append) → TOOLS (addressable) — demoable
reqs: [ REQ-KERNEL-9a, REQ-TOOLS-10a ]
campaign: CAMPAIGN-1
split: Path (the identity/append route) from EPIC-3
### EPIC-3-b — multi-event collision converges across branches
goal-trace: "two branches never lose or reorder a fact → set-union fold is commutative + persists across the git seam → the collision+convergence route"
vertical: KERNEL (collision set-union + convergent fold) → PERSIST (git merge seam) — demoable
reqs: [ REQ-KERNEL-10a, REQ-KERNEL-11, REQ-PERSIST-11-b ]
campaign: CAMPAIGN-1
split: Path (the collision/convergence route) from EPIC-3

### CAMPAIGN-1 — the kernel+merge floor
epics: [ EPIC-1, EPIC-3 ]
prerequisites: [ ]
horizon: Now
```

## Self-Check (the 5 vital axioms; the mechanical vs judgment halves kept distinct)

- [ ] **completeness** (mechanical): the epic set **partitions** the frozen REQs (0 orphan, 0 double); every split is **lossless** (`union(children).reqs == parent.reqs`); the campaign graph is a **DAG** (no cycles)?
- [ ] **invariants** (mechanical, GATE-checkable): every epic has the `goal-trace` field, touches **≥1 module** (a count), and every split **cites a SPIDR pattern** (a field)?
- [ ] **quality standard** (judgment, cold-review): every epic is genuinely **vertical** (a capability, not a layer — carpaccio) and **INVEST**-right-sized; every campaign is an independently-demoable increment ordered by dependency-defensible horizon?
- [ ] **success-criteria** (product, GATE-checkable): every campaign's increment names the POSITIVE user-facing outcome ("a human/agent can now do X that they could not before") — a real exhibited behaviour, not just absence of failure; an epic/ campaign whose stated increment nobody can demonstrate is a false-green?
- [ ] **DoD**: reconciler partition + lossless-union + acyclicity check clean ∧ cold-review APPROVE → the roadmap freezes.

## Abstain / Failure

A REQ that genuinely cannot join any vertical epic (pure cross-cutting infra) → `[NEEDS RECONCILIATION]`; do not
force a horizontal epic and do not smear across two. An epic that fits no SPIDR pattern is atomic — leave it.

## Completion Report

Emit: roadmap path · epic count · campaign count · REQ→epic partition (orphans/doubles = 0) · splits applied
(cited patterns) + lossless? · DAG acyclic? · horizon histogram (Now/Next/Later) · open `[NEEDS RECONCILIATION]`
count → next_state **S4**. If any REQ is orphaned/double-owned, a split leaks scope, or the graph has a cycle, **STOP**.
