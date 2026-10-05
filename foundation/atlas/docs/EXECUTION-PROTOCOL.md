# The Execution Method — a governed per-WP state machine (frozen Work Package → sealed code)

> **status:** v1 — the six-state execution loop authored + SOTA-grounded; the sibling of
> [`DECOMPOSITION-PROTOCOL.md`](./DECOMPOSITION-PROTOCOL.md). Where decomposition ends (S4 emits frozen
> Work Packages), this begins. **owner:** orchestrator (techlead seat) · **governs:** the path from one
> frozen WP-card to a sealed, provenance-bearing diff on a green main.
>
> **⚠ This is a SPECIFICATION, not a running system.** Every "mechanical" gate named here (digest-resolve,
> RED-confirm, diff-scope guard, differential-vs-oracle, diff-scoped mutation, provenance attestation) is the
> **contract the tooling will enforce once built**; until the harness lands, each is run as **disciplined
> judgment against this spec** by the dispatched seat. This document is the design of a future Orchestra
> harness subsystem — the state machine, the gates, and the six prompts (`method/prompts/exec/*.md`) **become
> harness tooling**, at which point "mechanical" is mechanical for real.

## Thesis (why this is rigorous, not just "run the agent")

1. **The builder decides nothing.** Every acceptance artifact — the golden scenarios, the property-based
   properties, and the typed `ref/*.ts` oracle — is **frozen upstream** (S3 goldens, the scaffold-freeze).
   The builder **confirms** them (RED), **satisfies** them (GREEN), and is **adversarially disproven** against
   them (GATE). It never authors, edits, or learns from the evaluation set. This is the execution-time twin of
   S4's "a WP transcribes; it never designs."
2. **False-green is the enemy, not red.** A WP that reports green is not trusted on that report (the failure
   the whole method exists to refuse — AP-5). GATE re-derives doneness with **diff-scoped mutation** (a
   surviving mutant on the changed lines = a test gap that lets a real bug through ⇒ reject) and the
   **diff-scope hard-block** (no acceptance-artifact may be touched), the **frozen PBT leg** (Wave P — 134
   ∀-laws, the oracle-free disproof of fixture-overfitting), and the **held-out leg** (Wave H — ~340
   independent 2nd fixtures the builder never sees). Differential-vs-oracle is _subsumed_ by PBT (no
   executable reference exists, nor is one needed). See _Assurance levels_ below; the method is **honest about
   which leg is load-bearing** and never runs an inert leg as if it proved something — a WP now reaches
   **FULL assurance** (∀-law + held-out + mutation), each leg's availability recorded in the seal.
3. **The model proposes; the orchestrator disposes.** The builder emits ACI-form edits; a deterministic
   orchestrator applies the diff into an **ephemeral sandbox workspace** and runs the gates. The apply is
   gated, the model's write is not trusted directly. Governance value over the field's relaxed default (Q4).

## SOTA grounding (2025-2026; controlled research, jimmy)

The six-state shape is **confirmed** by current spec-driven-development practice; the hardening is additive.
Load-bearing citations (full list in the DELTA table below):

- **Spec Kit** (github/spec-kit) + **AlphaCodium flow-engineering** (arXiv 2401.08500) — spec-as-contract, a
  pre-processing/enrichment phase distinct from the code-iteration loop.
- **Reward-hacking in coding agents** (arXiv 2606.07379 · SpecBench 2605.21384 · 2601.20103) — frozen +
  **held-out** tests, block any diff touching the harness, treat visible↔hidden divergence as gaming.
- **Diff-scoped mutation** (StrykerJS `--incremental` · PIT git-mode) — surviving mutant on changed lines ⇒ reject.
- **Bounded self-repair** (LDB 2402.16906 · Debugging-Decay 2506.18403) — 2 rounds capture 76–95%; cap small.
- **Differential-vs-oracle + PBT** (2605.20473 · 2506.18315; caveat 2510.25297 — LLM-authored properties are
  trivial/wrong ⇒ properties frozen upstream, never builder-authored).

## The state machine

Each **state is governed**; states are **sequential per WP**. Between states sits a **transition guard** =
a **GATE** (mechanical Self-Check) + a **COLD-REVIEW** (judgment) where judgment applies. Passing it freezes
state N's output as an axiom of N+1. The loop runs **once per WP**; WPs run in the wave/DAG order of
[`roadmap/wave-plan.md`](./roadmap/wave-plan.md) (campaign-parallel, WP-serial on shared files).

```
           guard     guard      guard         guard        guard      guard
 [BIND] ──▶ [RED] ──▶ [GREEN] ──▶ [REFACTOR*] ──▶ [GATE] ──▶ [SEAL] ──▶ merged (DAG order)
 resolve+   confirm   implement   predicate-      adversarial commit +
 enrich     fail      (sandbox,   gated, behav-   disprove    provenance
 (no test   (never    N≤3 repair, iour-preserving false-green  (in-toto/
  author)   author)   early-stop) refactor        catch        SLSA, hash)
    │         │          │            │              │            │
    └─────────┴──────────┴────────────┴──────────────┴────────────┘
       [NEEDS RECONCILIATION] — ANY state that meets a design gap / spec contradiction / drifted
       digest raises a DESIGN DEFECT and routes it to the DEFINE owner (TEAM.md). Never invented,
       never guessed, never asked of the builder. (Same escape hatch as decomposition.)
```

`*` REFACTOR is **predicate-gated** — it runs only if a refactor predicate fires (duplication, LOC within
10% of the 400 cap, cyclomatic threshold). Otherwise the machine skips BIND→RED→GREEN→GATE→SEAL.

## The five vital axioms (every state contract carries them)

Inherited from the decomposition method, re-cast for execution:

1. **completeness-criteria** (set-level) — what "this state is done for this WP" means as a checkable set.
2. **invariants** (per-item, mechanical) — the Self-Check bullets; a reconciler will compute them.
3. **quality-standard** (judgment) — what the cold-review proves that the mechanical half cannot.
4. **DoD** — GATE green ∧ COLD-REVIEW APPROVE → freeze. No waiver without an explicit human line (rigor compact).
5. **success-criteria** (product) — the CHECKABLE POSITIVE OUTCOME the WP exists to produce, stated in the
   product's own terms, independent of the mechanical gates. `exit_predicate`/DoD say "the machine did not
   fail"; **success says "something a user of the product can now do that they could not before"** — a
   behaviour a real invocation demonstrates, named in an acceptance golden OR a transcript, never overlap
   with the DoD's own conjuncts. A WP whose gates are all green but whose success-criteria no user can
   exhibit is a false-green: the seal must name the success, and re-derive it.

## The states (one prompt each — `method/prompts/exec/<STATE>.md`)

| state          | one-line role                                                                                                                                                                                                                                                                                                                         | mechanical gate                                                                                                                                                                            | judgment gate                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **BIND**       | resolve the WP card's ptr+digests (fail-closed on any STALE), load the frozen oracle + goldens (+ PBT props if they exist), consume the wave-plan **§Conflict-map** (thread any shared-`src` sequential constraint), set the **assurance mode**, produce the **enrichment** (builder's plan — non-authoritative, zero test-authoring) | all digests resolve · oracle typechecks · **no `SIG-TBD`/`unknown` in the bound oracle (else STOP)** · acceptance non-empty · conflict-map constraint captured · assurance mode set        | **cold-review**: enrichment carries no acceptance paraphrase; any held-out split is real, not a smuggled decision |
| **RED**        | run the acceptance goldens against current `src/` → **confirm every one FAILS** for a real reason (the WP is not already done / mis-scoped). Builder authors **nothing**.                                                                                                                                                             | every acceptance golden RED · failure is assertion-level not harness-error · if any already GREEN → STOP                                                                                   | —                                                                                                                 |
| **GREEN**      | builder proposes ACI-edits to the WP's `src/<facet>.ts` **only**; orchestrator applies into a sandbox; iterate to green. **repair_budget N=3 (cap 5)**, early-stop on no-progress (no new passing golden ∧ no drop in failing count).                                                                                                 | all visible goldens GREEN · diff touches only allowed src paths · typecheck green · ≤400 LOC/file                                                                                          | —                                                                                                                 |
| **REFACTOR\*** | _(only if refactor predicate fires)_ behaviour-preserving cleanup; goldens stay green; no new decision                                                                                                                                                                                                                                | goldens still GREEN · diff still scoped · no new public surface                                                                                                                            | cold-review: no behaviour change                                                                                  |
| **GATE**       | **adversarially disprove done** at the WP's assurance mode: always **diff-scoped mutation**; plus each of held-out / differential-vs-`ref/*.ts` / frozen-PBT **only if its prerequisite artifact exists** — an absent leg is recorded **UNAVAILABLE**, never passed                                                                   | **0 surviving mutants on changed lines** · every _available_ leg green (held-out concordant · differential ≡ oracle · PBT holds) · unavailable legs recorded with the assurance reduction  | **lucy** cold-review: diff satisfies spec/invariants, no false-green                                              |
| **SEAL**       | commit + provenance: **hard-block any diff touching test / harness / golden / `ref/` files**, fill the WP `exec` fields (outputs/provenance/trace_ref inc. **assurance mode**) as an in-toto/SLSA attestation, content-hash bind, append the event-log entry, merge in **wave-plan order** (DAG + shared-`src` sequential constraint) | diff-scope clean (no acceptance-artifact touch) · provenance complete (assurance mode stamped) · hash-chain valid · merge respects conflict-map sequencing · main green · godfile-guard OK | **frankie** process-audit (wave-close): sealed=green is real                                                      |

## Assurance levels (honest about what "green" proves — the load-bearing correction)

GATE's four legs are not equally available against every upstream. BIND **detects which acceptance artifacts
exist** and stamps the WP's assurance **mode** into the seal provenance — the mode is recorded, never hidden.

| leg                            | requires (acceptance prerequisite)                                                                           | available on today's upstream?                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| diff-scoped mutation           | the changed lines + a mutation runner                                                                        | **yes** — always the floor                                                                                                                                                                                                                                       |
| diff-scope hard-block + purity | the WP guardrails                                                                                            | **yes** — always                                                                                                                                                                                                                                                 |
| **frozen PBT**                 | a runnable ∀-quantified `properties-*.md` artifact                                                           | **YES** (Wave P, commit `4612964`) — 134 `PROP-*` laws, one per behavioural INV, rendered from the frozen S2 method-tags; cold-reviewed faithful                                                                                                                 |
| **differential-vs-oracle**     | an **executable** reference (not a pure-type `ref/*.ts` interface)                                           | **no, and not needed** — `ref/*.ts` are zero-runtime interfaces; **PBT subsumes it** (asserting the frozen law on the impl is the oracle-free equivalent)                                                                                                        |
| **held-out acceptance**        | **≥2 independent fixtures per behavioural REQ** (so one can be held out and still test the _same_ behaviour) | **YES** (Wave H, commit `fdf105c`) — ~340 independent held-out `-2` fixtures, one per behavioural conformance REQ; cold-reviewed genuinely independent (not clones). Exempt: PBT-subsumed · exhaustive-complete · residue/DEFINE-pending · billy/FR-12-delegated |

- **FULL assurance (today, after Waves P + H):** mutation (diff-scoped) + **frozen PBT (134 ∀-laws)** +
  **held-out acceptance (~340 independent 2nd fixtures)** + diff-scope hard-block + purity + the visible
  witness. Honest claim: _the diff satisfies each behavioural invariant's frozen ∀-law over generated inputs,
  passes a held-out fixture it never saw, and survives diff-scoped mutation_ — this disproves the
  hard-coded-fixture overfit two independent ways (the ∀-law fails on the next generated input; the held-out
  fixture fails on different data). This is the full false-green catch the method was designed for.
- **FLOOR / PBT (historical tiers, still recorded per-WP):** a WP whose REQ is residue/DEFINE-pending or
  delegated (billy/FR-12) has held-out UNAVAILABLE and seals at **PBT** (or FLOOR) — recorded honestly in the
  provenance, never reported as FULL when a leg was absent.

**Acceptance prerequisites — both MET.** Wave P (`properties-*.md`, 134 ∀-laws) + Wave H (~340 held-out
fixtures) close the FULL-assurance prerequisites. A leg still legitimately UNAVAILABLE for a given WP (an open
θ/τ/κ/Θ threshold, a delegated scrub gate) is recorded UNAVAILABLE in that WP's seal — GATE never reports an
absent leg as passed, never weakens the gate, never fabricates a fixture over an unbound symbol.

## Anti-spec-gaming doctrine (what holds regardless of assurance level — Q2)

Independent of assurance level, the builder **cannot author, edit, or optimize against the acceptance set**:

- The **golden scenarios and `ref/*.ts` oracle are frozen upstream** and read-only to the builder (RED
  confirms; the builder never authors — extends S4's zero-decision to execution). PBT properties, once they
  exist, are frozen the same way (never builder-authored — LLM-authored properties are trivial/wrong, Q6).
- SEAL **hard-blocks any diff that touches a test / harness / golden / `ref/` path** (the canonical hacks:
  "modify the harness to trivially pass", "hard-code the test case"). Trajectory-monitored. This is the one
  anti-gaming leg that holds at FLOOR assurance today.
- Purity/determinism guardrails from the WP card hold (no wall-clock, no network, no mutable-cache read in the
  path under test) — so a passing run is reproducible, not a lucky oracle read.
- **No unfrozen shape may be resolved by the builder.** A `SIG-TBD`/`unknown` field in the bound oracle is an
  unmade upstream decision; GREEN picking a concrete shape would be a smuggled decision. BIND fails closed on
  it (NEEDS RECONCILIATION) — the same discipline as a STALE digest.

## The per-WP execution record (what SEAL emits)

The WP-card's present-but-empty `exec` fields are filled **only at SEAL**, as the driftless provenance:

```
exec:
  outputs:    [ src/<facet>.ts@<contentHash>, ... ]        # the sealed diff, content-addressed
  provenance: { attestation: in-toto/SLSA, gate_run: <hash>, assurance: FLOOR|PBT|FULL,
                mutation: <survivors:0>, held_out: <pass|UNAVAILABLE>,
                differential: <pass|UNAVAILABLE>, pbt: <pass|UNAVAILABLE> }
  trace_ref:  <event-log entry hash>                        # append-only, hash-chained
```

No `exec` field is ever filled before SEAL; a WP that reports outputs pre-SEAL is rejected.

## Relationship to the rest of the method

- **Upstream:** consumes S3 goldens (acceptance), the S4 WP-cards (the unit), and the scaffold-freeze
  (`packages/*/ref/*.ts` = the typed oracle). Requires the **digest-freeze tooling** (binds the `ptr+digest`
  markers) to have run — until then BIND resolves pointers by disciplined judgment.
- **Orthogonal:** the seat/memory/wave machinery lives in the **orchestra** repo (one-way `orchestra→atlas`);
  this protocol is the _method_ the orchestrator runs, and stays in atlas (dogfood: the Atlas is its first
  application).
- **Deferred build:** the reconciler, sandbox-apply, mutation-runner, and provenance-attestor are harness
  subsystems not yet coded. This doc + the six prompts are their specification.

## Change log

| version | date       | change                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.0   | 2026-07-17 | Initial authoring. Six-state loop BIND→RED→GREEN→REFACTOR\*→GATE→SEAL, SOTA-grounded (controlled research: spec-driven-development, reward-hacking mitigations, diff-scoped mutation, bounded repair, differential+PBT). Additive hardening over the prior sketch: held-out acceptance, diff-scope hard-block, mutation-at-seal, bounded repair with early-stop, sandbox-apply. |
