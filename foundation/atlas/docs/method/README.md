# Orchestra Method — architecture & living backlog

> How we build **everything** in Orchestra: the three artifact layers we never conflate, applied first to the
> decomposition method (frozen design → Work Packages). This is the **anchor** — the running record so no
> decision is lost. Siblings: [`../CONVENTIONS.md`](../CONVENTIONS.md) (how we document) ·
> [`../DECOMPOSITION-PROTOCOL.md`](../DECOMPOSITION-PROTOCOL.md) (the method spec).

> **⚠ Specification, not a running system.** Orchestra is design-first — no code yet. The "mechanical" gates
> (reconciler, teeth, coverage) are the **contract the tooling enforces once built**; until then they run as
> disciplined judgment against the spec. **These docs are the design of a future Orchestra harness subsystem** —
> the reconciler/gates/state-machine/prompts **become harness code**. Not a one-off; this is how Orchestra
> builds (the Atlas is its first, dogfood application).

## The three layers — never conflate

Each is designed independently, researched independently, and fails independently.

| layer        | is                                                                                                                                               | answers                                                        | example                                                   | lives in                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| **Protocol** | the normative _method_ — axioms, rules, procedure, invariants, quality bar; deterministic, tool/model-agnostic                                   | "what are the rules?"                                          | the EARS protocol; a state's 7-facet contract             | a spec, or a skill's body        |
| **Prompt**   | the engineered _dispatch_ that drives an executor agent to perform a step **per its protocol**, on specific inputs, emitting a specific artifact | "what exactly do I tell the agent so it does this step right?" | the S1 dispatch handing module X's invariants to an agent | `prompts/<state>.md` (versioned) |
| **Skill**    | the invocable _package_ (`skill.md`) enveloping a protocol (+ its prompt template + references), discoverable & reusable across the fleet        | "how is this capability packaged so any agent can pick it up?" | `.claude/skills/ears/SKILL.md`                            | `.claude/skills/<name>/`         |

**Composition:** a **state** is _governed by_ a Protocol, _executed via_ a Prompt, _drawing on_ Skills.
The prompt **operationalizes** the protocol (references it, never restates it — the no-triplication discipline
at the prompt layer); the skill **packages** it. One skill per technique/protocol. Each built with research
and care, **one at a time — never batched.**

## Applied to: the Decomposition method

State machine (spec: [`../DECOMPOSITION-PROTOCOL.md`](../DECOMPOSITION-PROTOCOL.md)):
`S0 → S1 → S2 → S3 → C → S4` (then the per-WP execution machine BIND→SEAL), with a **two-half gate between each**: the **reconciler** (mechanical coverage —
proves the artifact _well-formed_) and the **cold-review** (judgment — proves it _right_). Both halves are
now specified: `reconciler` skill + `cold-review` skill (`prompts/review.md`, one dispatch, the producing
state's contract loaded as the reference). Per state, three artifacts:

| state                                                                                    | Protocol (contract)                                                    | Prompt (dispatch)                                                    | Skills it draws on                                                                                 |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **S0** Invariant Register _(= the design-freeze; the Ratify phase of the design rubric)_ | §S0 contract ✅                                                        | `prompts/S0.md` ✅ (mechanical extraction; the DEFINE seat ratifies) | `ratification-gate` · `axiomatic-design` · `completeness`                                          |
| **S1** Requirements                                                                      | §S1 contract ✅                                                        | `prompts/S1.md` ✅                                                   | `ears` · `atom-gate` · `completeness`                                                              |
| **S2** Formal Spec                                                                       | §S2 contract ✅                                                        | `prompts/S2.md` ✅                                                   | `formal-decision`                                                                                  |
| **S3** Goldens                                                                           | §S3 contract ✅                                                        | `prompts/S3.md` ✅                                                   | `goldens` · `completeness`                                                                         |
| **C** Roadmap (warp: epics + campaigns)                                                  | §C contract ✅                                                         | `prompts/C.md` ✅                                                    | `completeness` · `reconciler` (story-map · impact-map · carpaccio · SPIDR/INVEST · Now/Next/Later) |
| **S4** Work Packages (weft: module within epic)                                          | §S4 contract ✅                                                        | `prompts/S4.md` ✅ + `wp-template.md`                                | `techlead` · `reconciler`                                                                          |
| **EXECUTION** per-WP loop BIND→RED→GREEN→REFACTOR\*→GATE→SEAL                            | [`EXECUTION-PROTOCOL.md`](../EXECUTION-PROTOCOL.md) ✅ (SOTA-grounded) | `prompts/exec/{BIND,RED,GREEN,REFACTOR,GATE,SEAL}.md` ✅             | `reconciler` · `cold-review` (lucy GATE · frankie wave-close)                                      |

## Inventory — technique protocols → skills

| technique / protocol                                                                                                               | skill                | status                                                                                                                        | authority                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| EARS (requirement syntax)                                                                                                          | `ears`               | ✅ cravado                                                                                                                    | Mavin RE'09                                                                                                   |
| dispatch-prompt (the prompt layer, cross-cutting)                                                                                  | `dispatch-prompt`    | ✅ cravado                                                                                                                    | Anthropic docs · Spec-Kit commands · DSPy                                                                     |
| atom-gate (requirement quality)                                                                                                    | `atom-gate`          | ✅ cravado (reviewed)                                                                                                         | ISO/IEC/IEEE 29148 §5.2.5-6                                                                                   |
| goldens (SbE/BDD + generate-from-model)                                                                                            | `goldens`            | ✅ cravado (reviewed)                                                                                                         | Adzic; ShardStore; TLA+→test                                                                                  |
| formal-decision (3-conjunct rule + tool-per-shape)                                                                                 | `formal-decision`    | ✅ cravado (reviewed)                                                                                                         | AWS-FM CACM'15; ShardStore SOSP'21; Shapiro'11; Gomes'17                                                      |
| reconciler (the mechanical half of the gate — coverage)                                                                            | `reconciler`         | ✅ cravado (reviewed)                                                                                                         | Spec-Kit `/analyze` + `/clarify`                                                                              |
| cold-review (the judgment half of the gate — refute-first, grounded, toothed; `prompts/review.md`)                                 | `cold-review`        | ✅ cravado (3 decorrelated passes: bobby+lucy+frankie confirm; all findings integrated inc. the reconciler↔cold-review seam) | Fagan'76 · Porter/Votta/Basili'95 · PBR Basili'96 · Mills/Eick seeding · MT-Bench'23 · CriticGPT'24 · PoLL'24 |
| completeness (is the decomposition COMPLETE — the layers beyond coverage)                                                          | `completeness`       | ✅ cravado (reviewed)                                                                                                         | Leveson FMSP'00 · SCR TOSEM'96 · PBR · Beer vacuity'01 · mutation'78                                          |
| _— design-side (upstream, feeds S0) —_                                                                                             |                      |                                                                                                                               |                                                                                                               |
| ratification-gate (design freeze: ratified vs asserted, 5-gate; emits S0's row)                                                    | `ratification-gate`  | ✅ cravado (reviewed)                                                                                                         | ODI · ATAM · Suh · Nygard                                                                                     |
| axiomatic-design (FR↔DP coupling matrix, lean)                                                                                    | `axiomatic-design`   | ✅ cravado (reviewed)                                                                                                         | Suh                                                                                                           |
| functional-surface (complete feature/story/use-case/manual catalog before requirements; L0–L3 + 6-lens sweep + closure predicates) | `functional-surface` | ✅ cravado + applied (Atlas catalog v3 converged, 4 iterations)                                                               | Cockburn use-cases · Patton story-map · Diátaxis · Brandolini event-storming                                  |

## Backlog & status (updated every step)

1. **Method skeleton (DECOMPOSITION-PROTOCOL.md)** — ✅ **RATIFIABLE** (green through 3 cold-review rounds:
   review → v2 → re-review → targeted fixes → final-verify ALL-CLOSED, zero regression). The per-state
   contracts for S2/S3/S4 + the reconciler predicates are still to be authored (one at a time, reviewed).
2. **S0 / design-freeze** — PENDING · **CRITICAL PATH**. The method cannot fire until the design is frozen:
   close the 4 freeze-gate cards (U2/KERNEL-10 head-rule, spec↔ref contradictions, 7× `owner:TBD`, add the
   `behavioural` flag per invariant).
3. **Prompt-engineering research** — ✅ DONE → `dispatch-prompt` skill cravado. Key law: prompt LOADS the
   protocol, never restates it (no-triplication at the prompt layer).
4. **Technique protocol-skills** — ✅ **7/7 cravado**, each researched + cold-reviewed + fixed: `ears`,
   `dispatch-prompt`, `atom-gate`, `goldens` (+teeth), `formal-decision`, `reconciler`, `completeness`.
   **+ `cold-review` (8th)** — the judgment half of the gate — ✅ **cravado** + `prompts/review.md`,
   dogfood-reviewed by **3 decorrelated seats** (bobby anti-overengineering + lucy rigor + frankie
   confirm/DAG). Round 1: 7 real defects — 3 were the protocol failing its own predicates (no-triplication
   in the prompt, TOOTHED mis-framed as per-run, `seeded` biasing its own measurement) + PBR
   mis-attribution + Ex-B silently dropping a facet. Overlap was LOW → the confirm-pass (frankie) verified
   all 7 resolved with no regression AND, on fresh DAG-level coverage, caught 3 cross-artifact seam defects
   the file-scoped passes couldn't: the **reconciler→cold-review semantic-queue seam was unwired** (now a
   `reconciler_queue` input + adjudication step), verdict-vocab drift (overall verdict aligned to
   **APPROVE**|FIXES-NEEDED), and a Basili'96 characterization drift in `completeness`. All integrated;
   findings converged (fewer, more specific each round). SOTA-researched (Fagan · Porter/Votta/Basili'95 ·
   PBR · seeding · CriticGPT · PoLL).
5. **Per-state contracts S0–S4** — ✅ authored + cold-reviewed (S2/S3 sound; S4 fixes folded: per-item vs
   set-level invariant, non-circular DoD, seam owner-selection rule, techlead ref). All 5 states specified.
6. **Per-state prompts S0–S4** — ✅ **SOTA v2, quality cold-reviewed + fixed** (role+stakes · state-specific
   failure-mode guards · precise output schema · diverse few-shot examples · stop-on-incomplete). Quality review:
   S0/S1/S2/S4 SOTA-confirmed; S3 fixed (gen `formal`→`model` + PBT 3rd example); S1 verbatim clause; S0
   `clauses[]`. **THE MACHINE IS FULLY BUILT (SOTA).**
7. **Reconciler executable predicates** — PENDING (code-time; the skill specifies them).
8. **The design run (D0→D4)** — IN PROGRESS. ✅ D0 product-definition (10 FRs) · ✅ D1 framing (bet + risks +
   no-embeddings feasibility spike) · ✅ **functional-surface catalog** (v3 converged, 4 iterations — the
   completeness backstop) · ✅ **D2 structure** (FR→DP matrix + coupling + module cut + seams; v2, 3 decorrelated
   reviews). **NEXT: D4 Ratify** — each invariant → a 5-gate ratified Register row (carrying its FR +
   `independence:` from D2) → the frozen Register = **S0**, which closes design and unlocks S1–S4.

## Decision log (so nothing is lost)

- **2026-07-16** — The method is a **governed state machine**; each state a **7-facet contract**
  {axioms · rules · invariants · completeness · quality · DoD · template}; sequential with review gates. ("cravar o método.")
- **2026-07-16** — **Three artifact layers** — protocol / prompt / skill — never conflated; one skill per
  technique; each researched. (owner directive.)
- **2026-07-16** — Formal spec is **surgical**: only the CRDT-merge cluster earns a machine-checked model
  (and even it starts as PBT); the rest = PBT / exhaustive enumeration / executable reference-model. Anti-rot:
  reference-model written in the build language, reused as the unit-test mock. (AWS-FM + ShardStore.)
- **2026-07-16** — Atomization = **warp (invariants) × weft (WP unit)**. The weft is NOT greenfield
  "capability-slice"; for infra it is **by-module + seam-freeze** for cross-module obligations — to be settled
  when S4's contract is authored.
- **2026-07-16** — **Single-source chain**: the invariant is the one authored fact; REQ / FSPEC / SCN are
  derived views; goldens are **generated** from the model where one exists, else PBT-from-invariant /
  contract-as-test / hand-residue.
- **2026-07-16** — **Brownfield inversion**: `[NEEDS CLARIFICATION]` → `[NEEDS RECONCILIATION]`; a design gap
  is a **design defect** routed to ratification, never invented, never asked of the user.
- **2026-07-17** — **One reusable method-program, two SIDES (not two methods)** (owner: the product design itself was done ad-hoc "a moda
  caralho, sem método formal" — formalize it before decomposing). Upstream: a **product-design method**
  (definition → conceptual → architecture/invariants → ratify) that OUTPUTS the ratified design S0 consumes.
  Downstream: the **decomposition method** (S0–S4, done). **NOT a second heavy method** (that was cargo-cult,
  caught by anti-overengineering review): the right size is **2 protocol-skills (`ratification-gate`,
  `axiomatic-design`) + a 1-page rubric run ONCE over the existing design** = brownfield ratification (recover,
  don't expand). No prompts for the Define/Frame/Structure phases (lead+owner judgment); the Ratify phase = S0
  (the `S0.md` prompt does the mechanical extraction, the DEFINE seat ratifies). Its output row conforms to S0's
  input schema, and its set-level exit reuses S0's completeness predicates — the design-freeze IS S0. Research
  done: product-definition
  SOTA (Working-Backwards PR/FAQ · ODI outcome-grammar · Cagan four-risks) + formal conceptual/architecture
  design (Axiomatic Design FR↔DP · QFD · C-K · ATAM · Parnas · ADRs).
- **2026-07-17** — **The gate had only one half specified** (owner: "essas reviews precisam de método").
  The between-state gate is reconciler (mechanical, was specified) **+ cold-review (judgment, was ad-hoc)** —
  the load-bearing "never land on self-report" half was improvised. Fixed: researched inspection + LLM-judge
  SOTA (primary sources), authored the `cold-review` protocol-skill + one parametrized `prompts/review.md`.
  Four predicates: **GROUNDED** (every finding cites the violated clause — CriticGPT's precision guard) ·
  **DERIVED** (re-derive obligations from the contract, then diff — PBR: passive checklist ≯ ad-hoc) ·
  **COMPLETE** (every contract facet verdicted) · **TOOTHED** (clean verdict creditable only if it catches
  seeded defects — Mills/Eick). Detection≠rework (Fagan). Panel = 1 default, 2–3 _decorrelated_ for
  high-risk, never >3 (_Nine Judges, Two Effective Votes_). Dimensions from the **producing contract**, not
  ODC. Lean by design (cut-list honored).
- **2026-07-17** — **Completeness has layers** (owner: "need a methodology to know a decomposition is
  complete"). We had only L1 coverage (the `reconciler`). Layers: L1 coverage (mechanical) · L2 capture
  (register-vs-design: did S0 miss an invariant?) · L3 per-INV enumeration (every input/state/edge/unwanted-
  behaviour handled — Leveson criteria) · L4 golden adequacy (mutation: goldens must catch violations — the
  "teeth"). → the `completeness` protocol-skill (7th), researched then cravado + reviewed.
