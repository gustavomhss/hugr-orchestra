# The Decomposition Method — a governed state machine (frozen design → Work Packages)

> **status:** v4 — full S0→S3 + C + S4 contracts authored + cold-reviewed (skeleton ratified); portfolio layer (C) + WP-card template added · **owner:** orchestrator ·
> **governs:** the path from the ratified Atlas design (132 invariants) to executable Work Packages.
>
> Contract, sibling of [`CONVENTIONS.md`](./CONVENTIONS.md) and [`method/README.md`](./method/README.md).
> Our brownfield adaptation of Spec-Driven Development — an exhaustive design already exists; we **recover**
> requirements from it, we do not expand a prompt.

> **⚠ This is a SPECIFICATION, not a running system.** Orchestra is design-first — no code exists yet. Every
> "mechanical" gate named here (the reconciler, the coverage matrix, teeth/mutation, banned-token lint) is the
> **contract the tooling will enforce once built**; until the code lands, each is run as **disciplined judgment
> against this spec**. Where the text reads "recomputes / blocks / execution is transcription," that is _the
> specified behaviour of the built system_ — the honest present state is judgment-following-this-spec. **This
> document is the design of a future Orchestra harness subsystem:** the reconciler, the gates, the state machine
> and the prompts **become harness tooling**, at which point "mechanical" is mechanical for real. Not a one-off —
> the method is how Orchestra builds (the Atlas is its first application; dogfood).

## Thesis (why this is rigorous, not a bag of parts)

1. **Single-source, not triplication.** The **invariant is the one authored fact**; the requirement, the
   formal property, and the goldens are **derived views** (projected / rendered / _generated_), each carrying
   the invariant's id. (OpenSpec co-locates requirement+scenario; TLA+→test generates traces — Modelator/Apalache.)
2. **The gate is a computed invariant** _(specified — see the note above)_. Traceability is not a
   hand-maintained table; the read-only reconciler recomputes the coverage matrix at every freeze and blocks on
   any uncovered invariant — **once the tooling lands**; until then, run as judgment against this spec.
3. **Warp × weft.** Invariants are the _warp_ (the spine); the _weft_ is the unit of work. We do **not** ship
   132 micro-WPs.

## The state machine

Each **step is a state**; states are **sequential**. Between every two states sits a **transition guard** =
a **GATE** (mechanical) + a **COLD-REVIEW** (judgment). Passing it **freezes** state N's output, which then
becomes an **axiom** of state N+1. The machine's execution is itself gated on **S0-green** (below).

```
            guard      guard      guard      guard      guard      guard
[S0] ─────▶ [S1] ────▶ [S2] ────▶ [S3] ────▶ [C] ─────▶ [S4] ────▶ [EXECUTION]
 Invariant   Reqs       Formal     Goldens    Roadmap    Work Pkgs   per-WP machine
 Register    (EARS)     Spec       (gen)      (warp:     (weft:      (BIND→…→SEAL)
                                              epics +    module      — a separate
                                              campaigns) within epic) governed loop
   ▲   ▲       │          │          │          │          │
   └───┴───────┴──────────┴──────────┴──────────┴──────────┘
     [NEEDS RECONCILIATION] — ANY state that meets a design gap/contradiction raises a
     DESIGN DEFECT and routes it back to the ratification owner (the DEFINE seat, TEAM.md).
     Never invented, never asked of the end-user.
```

The **spec** pipeline (S0→S3) runs once over the design; the **portfolio** pipeline (C→S4) cuts the roadmap +
buildable leaves once; the **execution** machine (BIND→SEAL) runs once **per WP** — its own governed loop,
spec'd in the sibling [`EXECUTION-PROTOCOL.md`](./EXECUTION-PROTOCOL.md) (six states, SOTA-grounded, one
prompt each under `method/prompts/exec/`). C (state "Roadmap") is the _warp_ (capability, cross-module); S4 is
the _weft_ (module, within epic).

| state                                                                                        | is                                     | consumes                                          | produces                                                                                                                                                   | key instrument                                                     |
| -------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **S0** Invariant Register _(S0 **is** the design-freeze / the design rubric's Ratify phase)_ | the frozen design = the "constitution" | the ratified design docs (`reference/` + `spec/`) | 132 `INV-<MODULE>-<n>`: final normative text · anchor · `behavioural` flag · `clauses[]` · `unwanted[]` · S2 method-tag slot                               | the design-freeze DoD                                              |
| **S1** Requirements                                                                          | **lift-and-tag** (not fresh authoring) | S0                                                | one Singular `REQ` per behavioural _clause_                                                                                                                | `ears`, `atom-gate`                                                |
| **S2** Formal Spec                                                                           | surgical formalization                 | S1                                                | an `FSPEC` for the one cluster that earns it; a **method-tag** ∈ {formal, exhaustive, PBT, reference-model} for every **behavioural** INV (exempt → `n/a`) | the decision rule (below)                                          |
| **S3** Goldens                                                                               | **lift-and-tag** + generate            | S1,S2                                             | `SCN` per happy-path + per unwanted-behaviour guard, co-located with its REQ                                                                               | generate-from-model · PBT · contract-as-test                       |
| **C** Roadmap                                                                                | grouping + ordering (the _warp_)       | S1,S3 + functional-surface                        | vertical `EPIC`s (right-sized) grouped into dependency-ordered `CAMPAIGN`s (Now/Next/Later)                                                                | story-map · impact-map · carpaccio · SPIDR/INVEST · Now/Next/Later |
| **S4** Work Packages                                                                         | slicing (the _weft_, within each epic) | C, S1–S3                                          | `WP` = one module-slice of one epic + its seam-obligations + acceptance; the driftless WP-card                                                             | `techlead` (contract-freeze) · `wp-template.md`                    |

**S1 and S3 are lift-and-tag, not authoring.** The frozen design already carries, per invariant, a normative
`MUST`/`SHALL` clause (⇒ the requirement) and an Acceptance section (⇒ the goldens; e.g. `spec/atlas.md` §8's
21 falsifiable checks, and each reference module's Acceptance). S1 projects those clauses into EARS form and
tags them; S3 lifts the existing acceptance checks into `Given-When-Then` and tags them. No re-derivation of
content the design already contains.

## Definitions (load-bearing terms — defined once, used everywhere)

- **behavioural invariant** — an invariant that constrains _observable_ system behaviour (an input→output, a
  state, a guard). Set as an explicit boolean field `behavioural` on each `INV` **in S0** (not inferred later).
  A non-behavioural invariant (a pure definition, a naming convention) is dispositioned in S0 as
  `exempt: <reason>` and is **out of** the requirement-coverage denominator.
- **unwanted-behaviour clause** — a way the invariant can be _violated_; marked on the `INV` in S0. Each one
  obliges exactly one `If-then` guard-REQ (S1) and one guard-golden (S3). An INV may have zero.
- **module-slice (the weft)** — a Work-Package unit scoped to **one Atlas module** (`kernel`, `grounding`, …;
  the 9 ID families are disjoint). A cross-module obligation (e.g. `KERNEL-11 ↔ PERSIST-11`) is handled by a
  **seam-freeze** (techlead contract): one owning slice, the seam frozen as a contract the other slice
  consumes. This replaces the greenfield "capability-slice", which does not fit infrastructure.
- **the core** — the single cluster that earns a machine-checked formal model: the **CRDT OR-Set merge +
  supersedes** cluster (`KERNEL-9/10/11`, `PERSIST-11`); its model is **`FSPEC-merge`**, keyed by the cluster,
  not a module (it spans KERNEL+PERSIST). It is the **only** cluster with a standing `FSPEC` in the ratified
  baseline. The grounding gate may escalate to a **P** model _contingently_ (S2 decides, iff it proves
  genuinely async) — a contingency, not a baseline `FSPEC`.
- **anchor** — a stable pointer `reference/<file>.md#<invariant-slug>` to the normative clause. The slug is
  the lowercased invariant id (`kernel-10`).
- **P** — the P language (Desai et al., PLDI'13; used at AWS): asynchronous state machines + systematic
  model-checked testing; the tool for the grounding gate **iff** it is async/interacting.

## The single-source chain

```
INV-x   (ratified clause — the ONE authored fact; lives in S0, immutable)
  ├─► REQ-x[-c]  EARS sentence  — a PROJECTION per clause c: quotes the clause, never paraphrases
  ├─► FSPEC-merge formal model  — machine-checkable rendering of the CORE cluster ONLY (S2); most INV have none
  └─► SCN-x.*    goldens         — GENERATED: { core: PBT laws, or FSPEC-merge traces if S2 escalated } ∪ { PBT cases from INV-x }
                                    ∪ { exhaustive-enumeration cases } ∪ { contract-as-test } ∪ { hand-written residue }
```

Every downstream artifact is tagged `source: INV-x`. Where derivation is impossible, **exactly one layer is
authoritative and the others are marked derived**; drift between a _machine_ artifact and its reference model
is caught mechanically (the anti-rot mock, below); drift between an _English_ artifact and its clause is
caught by cold review (it is not a mechanical predicate — see the guard split). _Residue_ = the hand-written
goldens for the tail where no generator (model, PBT, contract) applies.

## The transition guard — GATE (mechanical) + COLD-REVIEW (judgment)

The v1 error was claiming the whole guard is mechanical. It is not. The guard is two distinct mechanisms:

**GATE — purely mechanical (operates on ids + structural predicates + counts):**

- referential existence: every `REQ` cites an extant `INV`; every `SCN` cites an extant `REQ`; every `FSPEC`
  maps to an `INV` (no orphans, either direction).
- coverage counts: every **behavioural** `INV` has ≥1 `REQ`; coverage = **100%** over the behavioural set;
  every non-behavioural `INV` carries an `exempt:` disposition.
- per-item structural invariants: each `REQ` has exactly one `SHALL`; matches one EARS pattern.
- banned-token lint: no `~`, `TODO`, `TBD`, `fast/robust/appropriate` in a normative clause.
- `CRITICAL` (blocks the freeze) = any uncovered behavioural `INV`, any orphan, or any un-dispositioned `INV`.

**COLD-REVIEW — judgment (independent reviewer, never the author):**

- clause fidelity: does the EARS `REQ` faithfully project its clause (no spec-echo)?
- design⇄spec divergence and EARS↔FSPEC agreement (semantic, cross-language — not a structural predicate).
- compound-ness a lint can't catch; mis-tiering; over/under-split.

The GATE is reproducible and CI-runnable; the COLD-REVIEW is the judgment the gate must never pretend to make.

**Completeness** across both halves is governed by the [`completeness`](.claude/skills/completeness/SKILL.md)
protocol: its mechanical gates (coverage · register-closure · tabular enumeration · golden teeth) run in the
GATE; its judgment layers (design-element register construction · prose per-INV enumeration · perspective
reading) run in the COLD-REVIEW. A freeze may claim _complete_ — not merely _traced_ — only when it passes.

## Atomization — warp × weft

An invariant is a _property_ (always-true), verified only by exercising what violates it. **The atom is the
`(INV, clause)` pair**: a multi-clause invariant fans out to **N Singular requirements** sharing `source:
INV-x`, suffixed `-a/-b`. (Falsified in v1: `KERNEL-10` alone carries ≥4 obligations — a single Singular EARS
sentence cannot hold them, and the gate's own one-`SHALL` rule forbids compounding.)

| tier           | atom                                                                      | unit                               | basis                                        |
| -------------- | ------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------- |
| **spine**      | one **(INV, clause)** → one Singular constraint `REQ` (quotes the clause) | `INV-x → REQ-x[-c]`                | 29148-Singular; EARS                         |
| **acceptance** | one golden per happy-path + per unwanted-behaviour guard                  | `SCN-x.*`                          | Use-Case 2.0 ("≥1 test/slice"); EARS If-then |
| **work**       | one **module-slice** + the cross-module seam-obligations it owns          | `WP-n = {module} + {seam-freezes}` | techlead contract-freeze                     |

## Formal Spec (S2) — the decision rule, honestly

A cluster earns a **machine-checked formal model** only when **all three** hold (AWS/CACM'15 + ShardStore/
SOSP'21): (1) failure is high-consequence and hard to recover; (2) correctness depends on combinatorial state
human review + example tests cannot cover; (3) the spec is cheap to keep alive. **Most invariants fail (2).**
S2 assigns a **method-tag to every INV**; only **the core** gets a standing `FSPEC`.

| cluster                                       | method-tag                                    | how                                                                                                                                                                                                                      |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **the core** — CRDT OR-Set merge + supersedes | `formal`                                      | PBT on the join-semilattice laws (commut/assoc/idemp) + partial-order axioms **first**; escalate to TLA+/TLC only if supersede+remove is subtle; Apalache for an unbounded inductive invariant; Isabelle only if audited |
| write-decision "infallible"                   | `exhaustive`                                  | enumerate the finite input space; assert existence + uniqueness of the route. No FM tool                                                                                                                                 |
| grounding truth-gate                          | `PBT` baseline; **contingent** P (S2 decides) | reference automaton + exhaustive PBT; P is an S2 escalation iff it proves genuinely async — not a baseline `FSPEC`                                                                                                       |
| retrieval drop-order                          | `PBT`                                         | executable reference policy as oracle                                                                                                                                                                                    |
| the other ~128                                | `reference-model`                             | executable reference model (≈1% of code) + PBT                                                                                                                                                                           |

**Anti-rot (unconditional, ShardStore):** reference models are written **in the build language** and **reused
as the mock** in unit tests — the build breaks when the spec drifts. This is the one mechanically-real drift
fence between code and its model.

## The per-state contract (schema — every state is filled against it)

Seven facets, distinct by role. Non-circular by construction:

| facet                     | role                                                              | checked by                   |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------- |
| **axioms**                | premises **inherited** from the prior state's DoD                 | (given)                      |
| **rules**                 | the operational **procedure** — how output is produced            | (followed)                   |
| **invariants**            | **per-item** structural properties, mechanically checkable        | GATE                         |
| **completeness criteria** | **set-level** closure (coverage), mechanically checkable          | GATE                         |
| **quality standard**      | the **per-unit** bar; the judgment part (fidelity, non-ambiguity) | COLD-REVIEW (+ lint in GATE) |
| **DoD**                   | the exit condition = **GATE green ∧ COLD-REVIEW APPROVE**         | (transition)                 |
| **template**              | the exact **artifact shape** the state emits                      | (output)                     |

`invariants` (per-item) and `completeness` (set-level) do not overlap; `quality` is the judgment residue the
gate cannot decide. `DoD` names the two _mechanisms_ (gate, review) — it does not re-list the facets, so it is
not circular: the facets say _what must hold_; the gate+review are _how it is checked_; DoD = both pass.

## S0 — Invariant Register (the foundation; authored first)

The machine cannot fire until S0 is frozen. S0 **is** the Phase-1 design freeze.

- **axioms** — none (S0 is the root; its input is the design docs, still `draft v0`).
- **rules** — resolve every open design question and cold-review finding (the U2/`KERNEL-10` head-rule; the
  `spec↔reference` contradictions; the 7× `owner: TBD`); finalize each invariant's normative text; assign each
  an `anchor`, a `behavioural` flag, its `unwanted-behaviour` clauses, and an empty S2 `method-tag` slot.
- **invariants** — every `INV` has final text + anchor + `behavioural` + (if false) an `exempt:` reason.
- **completeness criteria** — all 132 dispositioned (behavioural or exempt); zero open question; zero
  `owner: TBD`; zero unresolved contradiction.
- **quality standard** — each clause is normative, singular-in-intent, and free of `~`/TBD.
- **DoD** — GATE green ∧ COLD-REVIEW APPROVE (the ratification owner — DEFINE seat — signs; spec↔reference
  contradiction is a COLD-REVIEW judgment, never a GATE predicate) → tag `freeze/design-v1`.
- **template** — the Register row: `INV-<MODULE>-<n> | behavioural | anchor | unwanted[] | clauses[] | method-tag?`.

## S1 — Requirements (worked; lift-and-tag)

- **axioms** — S0 frozen: every `INV` has final text, anchor, `behavioural`.
- **rules** — for each **behavioural** `INV`, per clause: apply the [`ears`](.claude/skills/ears/SKILL.md)
  protocol (project + **quote**, one `SHALL`, pick the pattern); tag `source: INV-x`; a design gap →
  `[NEEDS RECONCILIATION]` → design defect. Exempt invariants produce no REQ.
- **invariants** (per-item) — every `REQ` has exactly one `SHALL`, matches one EARS pattern, cites its `INV`.
- **completeness criteria** (set-level) — every behavioural `INV` has ≥1 `REQ`; every unwanted-behaviour
  clause has its `If-then` REQ; zero orphan `REQ`.
- **quality standard** — each `REQ` projects its clause without spec-echo, is unambiguous, and is testable.
- **DoD** — GATE green ∧ COLD-REVIEW APPROVE → freeze.
- **template**
  ```
  ### REQ-KERNEL-10a — head = tip of the supersedes DAG
  source: INV-KERNEL-10 @ reference/atlas-kernel.md#kernel-10
  When a merge yields multiple concurrent heads on one nodeKey,
    the kernel shall select the tip of the supersedes partial-order as the head.
  normative-clause: "<exact quote>"
  ```

## S2 — Formal Spec (worked; protocol: `formal-decision`)

- **axioms** — S1 frozen: every behavioural `INV` has ≥1 `REQ`; the set passed the `atom-gate`.
- **rules** — apply [`formal-decision`](.claude/skills/formal-decision/SKILL.md): tag **every behavioural**
  `INV` with a `method-tag ∈ {formal, exhaustive, PBT, reference-model}` by the 3-conjunct rule (an **exempt**
  INV — nothing to verify — carries `method-tag: n/a`); author an `FSPEC` **only**
  for the core (`FSPEC-merge`); name what you refuse to model; name each `INV`'s UP safety/liveness property
  and its DOWN reference model; wire the anti-rot mock.
- **invariants** (per-item) — every `INV` carries exactly one `method-tag`; any `FSPEC` maps to its cluster's `INV`s.
- **completeness criteria** (set-level) — no untagged `INV`; the core cluster has its `FSPEC`.
- **quality standard** — every `formal` tag is justified by **all three** conjuncts; the tool matches the
  problem _shape_, not the domain.
- **DoD** — GATE green ∧ COLD-REVIEW APPROVE → freeze.
- **template** — Register row extended: `INV-x | method-tag | FSPEC? | up-property | down-reference-model`.

## S3 — Goldens (worked; protocol: `goldens`)

- **axioms** — S2 frozen: every `INV` method-tagged; `FSPEC-merge` exists for the core.
- **rules** — apply [`goldens`](.claude/skills/goldens/SKILL.md): per `REQ`, derive `SCN` for the happy path +
  one per unwanted-behaviour clause, **generated** from the `INV`'s method-tag generator (model-traces /
  exhaustive / PBT / conformance), hand-written only for residue; co-locate the Given-When-Then under its `REQ`;
  reference-model reused as mock.
- **invariants** (per-item) — every `SCN` keys off its `REQ`, tags `source: REQ-x`, uses concrete values.
- **completeness criteria** (set-level) — every `REQ` has ≥1 happy `SCN`; every unwanted-behaviour clause has
  its guard `SCN`.
- **quality standard** — cases **generated** (not re-authored) wherever a generator exists; no `SCN` is a third
  copy of the fact.
- **DoD** — GATE green ∧ COLD-REVIEW APPROVE → freeze.
- **template** — the co-located `### SCN-<MODULE>-<n>[c]-<k>` Given-When-Then block under its `REQ`.

## C — Roadmap

> The portfolio layer; the _warp_ axis. After S3, one state, two passes over one artifact (`roadmap.md`): **cut** the frozen requirements+goldens into
> **vertical epics** (capabilities across modules), **right-size** them, and group into **dependency-ordered
> campaigns** (milestones). This is the **warp** (capability), orthogonal to S4's **weft** (module). Grounding:
> Story Mapping (Patton — backbone × release-slice) · Impact Mapping (Adzic — Why→How→What goal-trace, Who elided
> for an infra product) · vertical-slicing/carpaccio (Cockburn/Kniberg — the anti-slab predicate) · SPIDR (Cohn)
> gated by INVEST (Wake) for right-sizing · Now/Next/Later (Bastow — horizon ordering, not dates). SAFe portfolio
> ceremony deliberately cut. (C1-cut and C2-split were collapsed into this one state — anti-ceremony: they wrote
> the same artifact; keep them split only if a freeze-point between cut and size is ever needed.)

- **axioms** — S1/S2/S3 frozen; the functional-surface L1 backbone available as the epic candidates.
- **rules** — derive **epics** as vertical capabilities on the backbone, each with a goal-trace, owning a disjoint
  REQ+golden set; **right-size** any oversized epic by the smallest **SPIDR** pattern into the fewest INVEST-valid
  still-vertical children (cite the pattern; `union(children).reqs == parent.reqs`; atomic epics untouched); group
  epics into **campaigns** (release slices); order campaigns by **explicit dependency edges → a DAG → Now/Next/Later**.
- **invariants** (per-item, mechanical / GATE-checkable) — every epic has the `goal-trace` field, touches **≥1
  module** (a count), and every split **cites a SPIDR pattern** (a field).
- **completeness criteria** (set-level) — the epic set **partitions** the frozen REQ set (total, disjoint: 0
  orphan, 0 double); every split is **lossless** (union == parent); the campaign graph is a **DAG** (no cycles).
- **quality standard** (judgment / cold-review) — every epic is genuinely **vertical** (a capability, not a
  module-slab — carpaccio) and **INVEST**-right-sized; epics are outcome-driven; campaigns are demoable increments
  ordered dependency-defensibly (a prerequisite never ships after its dependent).
- **DoD** — reconciler partition + lossless-union + acyclicity check ∧ COLD-REVIEW APPROVE → the roadmap freezes.
- **template** — `EPIC-<n>[-<k>] | goal-trace | vertical-path | reqs[] | campaign | split{SPIDR}?` ·
  `CAMPAIGN-<m> | epics[] | prerequisites[] | horizon{Now|Next|Later}`.
- **epic demoability** — an epic's vertical demo is **compositionally** gated: all its WPs' goldens green
  (including the seam goldens the owning WP carries) ⇒ the epic behaviour holds. No separate epic-level golden.

## S4 — Work Packages

> The _weft_ axis; within each epic; protocol: `techlead`.

- **axioms** — S1/S2/S3 frozen **and** the roadmap (state C) frozen: each epic is a right-sized vertical capability.
- **rules** — apply the tech-lead slicing doctrine (origin = the global `techlead` skill, not an Orchestra-local
  one): **within each epic**, slice the **weft** by **module** (the 9 ID families are disjoint) — one `WP` per
  (epic × module it touches). A `WP` owns one module's slice of one epic + the cross-module **seam-obligations**
  it carries, each closed by a **seam-freeze** — the slice owning the **upstream** contract (the producing module,
  or the one holding the `FSPEC`) freezes the seam, the other consumes it; ties broken by lexicographic module id.
  The `WP` names the `REQ`s it closes; its **acceptance = those REQs' frozen goldens**; no `WP` invents behaviour.
  Every `WP` conforms to the driftless **WP-card template** (`method/wp-template.md`).
- **invariants** (per-item) — every `WP` names ≥1 `REQ`, is scoped to exactly one module **within one epic**, and
  every seam it owns is a frozen contract; the card is driftless (pointer+digest, per the template).
- **completeness criteria** (set-level) — every `REQ` is owned by **exactly one** `WP`; every cross-module
  obligation has a seam-freeze (no smearing); every epic is fully covered by its WPs.
- **quality standard** — each slice is independently buildable + testable; execution is transcription, not judgment.
- **DoD** — GATE (reconciler) green ∧ COLD-REVIEW APPROVE → freeze.
- **template** — the `WP` card (driftless), per `method/wp-template.md`. Id = `campaign.epic.wp` (hierarchical).

## ID scheme (pinned, consistent with the `ears` skill)

`INV-<MODULE>-<n>` (MODULE ∈ full family token: KERNEL, GROUND, INDEX, KNOW, MEM, RETR, PERSIST, TOOLS, GEN)
→ `REQ-<MODULE>-<n>[-a/-b]` (shares module+number; suffix per clause) → `SCN-<MODULE>-<n>[c]-<k>` (keys off
the REQ) → `FSPEC-<cluster>` (per cluster, keyed by cluster name e.g. `FSPEC-merge`, **not** by module — a
cluster may span modules). The portfolio axis: `CAMPAIGN-<m>` ⊃ `EPIC-<n>[-<k>]` ⊃ `WP`, where a WP's id is
`<campaign>.<epic>.<module>` — the module token is the 3rd coordinate and (one WP per epic×module) uniquely names
the WP (e.g. `1.3.KERNEL`). Every REQ traces `→ EPIC → WP`; the link tag is always `source:`.

## Not yet written

All six state contracts (**S0 · S1 · S2 · S3 · C · S4**) are specified above; the warp/weft split is settled (C = capability, S4 = module); and the
**per-state dispatch prompts** are authored at [`method/prompts/S0..S4.md`](./method/prompts/) to the
[`dispatch-prompt`](.claude/skills/dispatch-prompt/SKILL.md) template. Remaining: the `reconciler`'s checks as
**executable predicates** — specified by the [`reconciler`](.claude/skills/reconciler/SKILL.md) skill; the code
lands **in the Orchestra harness** (this method is that subsystem's design).
