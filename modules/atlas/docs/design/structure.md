# The Atlas — structure (D2: FR→DP coupling matrix + module boundaries)

> The **Structure** phase of the [product-design rubric](../method/product-design.md), applied to the Atlas,
> via [`axiomatic-design`](../../.claude/skills/axiomatic-design/SKILL.md) (Suh, lean core). Consumes the 13 FRs
> ([D0](product-definition.md) — 10 original + FR-11/12/13 added at S0), the bet ([D1](product-framing.md)), and the behavioral catalog
> ([functional-surface](functional-surface.md)). Output: the FR↔DP design matrix, the **coupling** read, the
> module boundaries (Parnas: hide the decision-most-likely-to-change), and the **cross-module seams** S4's
> seam-freeze consumes. **Brownfield** — the design exists; we _read_ the FR→DP boundary against the real
> subsystem split (`reference/atlas-{kernel,index,retrieval,grounding,knowledge,genesis,memory,persist,tools}.md`).
>
> **Status: v2** — reworked after a 2-decorrelated cold-review (lucy rigor/Suh + bobby architecture/DAG). v1's
> coupling _math_ held, but a missing matrix cell (FR-2←DP-3) flipped Cluster A to coupled, the drift decision
> was split across two modules, and the module cut had buried the index and dropped the tools/write-door layer.

## The design parameters (the _how_ — read from the real design)

`#DPs = 14 ≥ #FRs = 13` (Theorem-1 satisfied). DP-11 (governance) was added because FR-9's dominant mechanism
was otherwise unhomed; **DP-12/13/14 were added at S0** when the owner extended D0 with FR-11/12/13 (Memory /
safety / delivery) — each new FR gets its own subsystem DP, on-diagonal.

| DP                                                                 | mechanism                                                                                                                                                          | grounding                                                                                          | module                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| **DP-1** Structural index (addressing substrate)                   | multi-axis (spatial/territory/dependency) BLAKE3-merkle store; StructRef + 3-hash keys; the drift-**leg** computation; O(closure) lookup, caps                     | INDEX-2/6/12, KERNEL-1                                                                             | M-Index                         |
| **DP-2** PPR rank + coChanged fallback                             | personalized PageRank over def→ref; coChanged band when closure is thin                                                                                            | GEN-11, RETR-11, INDEX-13                                                                          | M-Retrieval                     |
| **DP-3** Curated own-pack                                          | tier≥T1 mandatory floor + in-cap `(hits,ppr)` rank + drill-down + injection-ceiling drop-order                                                                     | RETR-2/6/12, §3.4                                                                                  | M-Retrieval                     |
| **DP-4** Grounding truth-gate + drift oracle                       | StructRef@normalized-subtree-hash; FRESH/DRIFTED/BROKEN/STALE **decision**                                                                                         | A-1/A-3, GROUND-3/5/11/13                                                                          | M-Grounding                     |
| **DP-5** Predicate check-engine                                    | CodeQL/Semgrep/LSP executable check (HOLDS/BROKEN/NA); the KNOW-5 mechanical arm                                                                                   | KNOW-16, GEN-12, KNOW-5                                                                            | M-Grounding                     |
| **DP-6** Edit-over-append write-decision                           | contentHash **dedup** + nodeKey **create/update/supersede** (drift is _not_ here — it is DP-4's leg, consumed)                                                     | KNOW-15, A-12                                                                                      | M-Lifecycle                     |
| **DP-7** Kernel: CAS identity + canonical encoder + event-log fold | content-addressed put/get; RFC-8785 canonical preimage; `AtlasState = fold(EventLog)` OR-Set; git-native + provenance                                              | KERNEL-1/2/5, PERSIST-2/11, A-11/17/18                                                             | M-Kernel                        |
| **DP-8** Born-from-work genesis                                    | $0 skeleton → enrich by blast-radius (awareness/turn-header is split OUT to the Memory subsystem)                                                                  | KNOW-13, GEN-7                                                                                     | M-Lifecycle                     |
| **DP-9** Decay/archive                                             | frecency for Memory (MEM-7) + hits-decay for Knowledge (KNOW-17); evict→archive, never delete                                                                      | MEM-7, KNOW-17                                                                                     | M-Lifecycle / M-Memory          |
| **DP-10** Knowledge/Memory two-substrate partition                 | grounded shared Knowledge vs per-seat Memory; injection-scoping (not access control)                                                                               | §2, §1 / acceptance #14, KNOW-11, **MEM-2** (the no-conflation metric; MEM-1 is injection-scoping) | _(partition law)_               |
| **DP-11** Propose→ratify governance                                | jimmy proposes → lead/wave-close ratifies; T0 human-only; fast-path auto-accept; lucy/bobby veto (the human-effort mechanism)                                      | KNOW-8/18, A-6/A-7, GEN-5                                                                          | M-Lifecycle                     |
| **DP-12** Per-seat Memory (scoping + derived turn-header + recall) | injection-scoping (not access-control) · consultable-not-injected · derived awareness/orientation · frecency recall · re-spawn push                                | MEM-1/3/4/5/6/8/11/12/13                                                                           | M-Memory                        |
| **DP-13** Cred-scrub defense-in-depth                              | redact-at-source (primary) + ≥2-engine scan (client + server pre-receive), fail-closed before the immutable write                                                  | PERSIST-10a, MEM-9                                                                                 | M-Kernel/Persistence (security) |
| **DP-14** Delivery / projection layer                              | 5-tool governance surface (two governed write doors, ADR-0003) · CLI↔MCP parity · node tri-transport · reach-ladder (push-default, zero-grant) · shipped guidance | TOOLS-2/3/4/11/11a                                                                                 | M-Tools                         |

## The design matrix (`A[i][j] = X` iff DP_j affects FR_i)

|                               | DP-1  | DP-2  | DP-3  | DP-4  | DP-5  | DP-6  | DP-7  | DP-8 | DP-9  | DP-10 | DP-11 | DP-12 | DP-13 | DP-14 |
| ----------------------------- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--: | :---: | :---: | :---: | :---: | :---: | :---: |
| **FR-1** retrieval time       | **X** |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |  ·   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |
| **FR-2** relevance/precision  |   X   | **X** |   X   |   ·   |   ·   |   ·   |   ·   |  ·   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |
| **FR-3** tokens               |   ·   |   X   | **X** |   ·   |   ·   |   ·   |   ·   |  ·   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |
| **FR-4** stale-action         |   ·   |   ·   |   ·   | **X** |   X   |   ·   |   ·   |  ·   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |
| **FR-5** grounding fidelity   |   ·   |   ·   |   ·   |   X   | **X** |   ·   |   ·   |  ·   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |
| **FR-6** reconcile time       |   ·   |   ·   |   ·   |   X   |   ·   | **X** |   ·   |  ·   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |
| **FR-7** store growth         |   ·   |   ·   |   ·   |   ·   |   ·   |   X   |   ·   |  X   | **X** |   ·   |   ·   |   ·   |   ·   |   ·   |
| **FR-8** re-derivable         |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   | **X** |  ·   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |
| **FR-9** human maintenance    |   X   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |  X   |   X   |   ·   | **X** |   ·   |   ·   |   ·   |
| **FR-10** no conflation       |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |  ·   |   ·   | **X** |   ·   |   ·   |   ·   |   ·   |
| **FR-11** memory (per-seat)   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |  ·   |   ·   |   ·   |   ·   | **X** |   ·   |   ·   |
| **FR-12** safety (no secret)  |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |  ·   |   ·   |   ·   |   ·   |   ·   | **X** |   ·   |
| **FR-13** delivery ergonomics |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |   ·   |  ·   |   ·   |   ·   |   ·   |   ·   |   ·   | **X** |

## Coupling read (per cluster)

**Cluster A — Retrieval (FR-1/2/3 × DP-1/2/3): COUPLED → co-locate rank+pack in M-Retrieval + seam-freeze the index.**
_(v1 called this decoupled; the cold-review corrected it.)_ FR-2 ← DP-1 **and** DP-2 **and** DP-3: the tier≥T1
floor removes the _recall_ risk (don't drop a relevant fact) but DP-3 still does **precision** work — it forces
tier-selected (not task-relevance-selected) facts into the pack and ranks the in-cap band by `(hits,ppr)`
(RETR-2), so ∂FR-2/∂DP-3 ≠ 0. That X sits above the diagonal → **coupled**, not an orderable triangle.
Resolution: DP-2 (rank) and DP-3 (pack) are **one module** (M-Retrieval) — co-located, so their coupling is
internal, not a defect. DP-1 (the index) is a **separate substrate** both consume → its StructRef/3-hash
contract is **seam-frozen** (seam #1). FR-1 is index-only (on the M-Index diagonal).

**Cluster B — Grounding (FR-4/5 × DP-4/5): COUPLED, same-module → co-locate M-Grounding.**
FR-4 (stale-action, consume-side) and FR-5 (fidelity, served-side) are **two projections of one guarantee** —
the A-1 truth-gate ("FRESH ≠ true is the same gate viewed two ways", GROUND scope note). No DP boundary
separates them → co-locate the truth-gate + drift + check-engine in one grounding module. **Honest, not a
rationalized defect** (both reviewers confirmed).

**Cluster C — Lifecycle (FR-6/7/9 × DP-4/6/8/9/11): co-locate M-Lifecycle; FR-6 consumes a drift seam from M-Grounding.**

- FR-6 (reconcile time) ← DP-6 **and DP-4**: reconcile churn is set by how many facts the drift-oracle flags
  per edit (DP-4 in M-Grounding; GROUND-11's interface-fold exists to _reduce_ false drift). So FR-6 is
  **cross-module coupled** with M-Grounding → M-Lifecycle **consumes the drift-leg as a seam** (the drift
  _decision_ lives once in M-Grounding; the write/reconcile _routing_ is M-Lifecycle — the Parnas split v1 had
  is thereby resolved: DP-6 no longer claims the drift decision).
- FR-7 ← DP-6, DP-8, DP-9 and FR-9 ← DP-8, DP-9, **DP-11**: **DP-8 (born-from-work) and DP-9 (decay) each move
  _both_ FR-7 and FR-9**; DP-6 (dedup) moves only FR-7, DP-11 (governance) only FR-9. The shared DP-8/DP-9
  coupling co-locates M-Lifecycle. FR-9's _dominant_ driver — the human **ratification** effort — is DP-11
  (governance), now homed (v1 stretched DP-8 to cover it).

**FR-8 ← DP-7: on-diagonal, independent** (M-Kernel). **FR-10 ← DP-10: on-diagonal, independent** (partition law).

**The S0 extension (FR-11/12/13 × DP-12/13/14): on-diagonal, independent.** Each new FR gets its own subsystem
DP — FR-11←DP-12 (M-Memory), FR-12←DP-13 (cred-scrub, M-Kernel/security), FR-13←DP-14 (delivery, M-Tools) —
all diagonal, no new coupling. This is why the delivery/Memory/safety areas ratified cleanly once given an FR:
they were never coupled, only unhomed.

**Governance edge added (FR-9 ← DP-1).** The index _generates_ the territory ownership overlay (INDEX-15),
which reduces human maintenance → DP-1 affects FR-9. This homes INDEX-14/15/16 (the index-side governance the
ratification found off-matrix). It makes FR-9 ← {DP-1, DP-8, DP-9, DP-11}; still co-located in the lifecycle/
governance concern, with the index contributing the generated overlay as a seam input. **Territory-ownership
boundary resolved:** the index _generates a default_ owner (reconciled from graph + blame), the steward's
manifest _overrides_ — both, index-as-generator + steward-as-override-authority (seam #5 updated below).

## Module boundaries (Parnas — each hides the decision most likely to change)

Read against the real subsystem split. _(Originally the FR-driven cut was Knowledge-centric and M-Memory was an
inherited-scope placeholder; after the S0 extension it is a first-class module — DP-12 → FR-11 on-diagonal.)_

| module                     | DPs                           | hides (the changing decision)                                                                                                | interface                                                         |
| -------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **M-Kernel / Persistence** | DP-7, **DP-13**               | storage backend (git↔OCI/S3), hash fn, canonical preimage, fold/merge mechanics, **host/forge adapter**, cred-scrub engines | content-addressed `put/get`; `fold(EventLog)`; scrub-before-write |
| **M-Index** (substrate)    | DP-1                          | axis structure, incremental rehash, StructRef scheme, drift-leg computation                                                  | `resolve(scope/dependency/trigger)` · StructRef                   |
| **M-Retrieval**            | DP-2, DP-3                    | ranking algorithm, cap/drop policy                                                                                           | `own(unit)` / `atlas-query` → a curated pack                      |
| **M-Grounding**            | DP-4, DP-5                    | anchor scheme, which check-engine, mechanical↔semantic split                                                                | a fact's `grounding leg`                                          |
| **M-Knowledge-lifecycle**  | DP-6, DP-8, DP-9, DP-11       | write-routing, genesis strategy, decay ranking, **ratification policy**                                                      | `ResultCard.absorb` (via the write-door)                          |
| **M-Tools / projection**   | **DP-14**                     | transport (MCP/CLI/inject tri-transport), tool schema, **the governed Knowledge write-doors `atlas-emit` + `atlas-link`**    | 5 governance tools; node-tool projection; TOOLS-15 (ADR-0003)     |
| **M-Memory**               | **DP-12** (+ DP-9 Memory arm) | the 4 memory types, turn-header assembly, logbook, re-spawn recall, injection-scoping                                        | `memory-recall`; the derived turn-header                          |
| **K/M partition**          | DP-10                         | _(a cross-cutting law, not a module)_ — grounded-Knowledge vs per-seat-Memory                                                | two write-doors; injection-scoping                                |

**Brownfield check (do the existing boundaries hide the changing decision?):** mostly ✅ — ranking (PPR)
behind M-Retrieval, check-engine behind M-Grounding, backend/hash/**host-adapter** behind M-Kernel, transport
behind M-Tools. **Two volatile axes flagged for S4** (not yet cleanly hidden): the **`cv`/template-version**
(re-keys ids across modules — `spec §9`, functional-surface UC-G35) and, now named, the **host/forge adapter**
attachment semantics (folded into M-Kernel but PR/notes semantics differ per forge — PERSIST-8, §7.1).

## Cross-module seams (→ S4 seam-freeze inputs)

Shared mechanisms frozen once upstream, consumed read-only (the `FSPEC-merge` pattern):

1. **StructRef / index 3-hash + drift-leg contract** — M-Index produces it; M-Retrieval, M-Grounding (drift
   leg), and M-Lifecycle (nodeKey/subtreeHash) consume it.
2. **CAS / canonical-encoder preimage** — M-Kernel; every module consumes content-addressed identity (RFC-8785
   subset; BLAKE3 behind `@orchestra/kernel`).
3. **Event-log fold contract** — `AtlasState = fold(EventLog)` over a content-keyed **OR-Set** (commutative,
   convergent on merge), distinct from the identity seam #2; every module's state folds from it. **This is
   where the one formal `FSPEC-merge` core lives** (the KERNEL+PERSIST merge — S2's single machine-checked
   model). _(NEW — was buried in DP-7.)_
4. **The write-door contract** — the single Knowledge door (`atlas-emit`, TOOLS-15, M-Tools) vs the Memory
   write path (relay ABSORB); the "two doors" of the K/M partition are structurally enforced here. M-Lifecycle
   and M-Memory consume it. _(NEW — resolves the v1 one-door/two-door contradiction.)_
5. **Tier / territory governance overlay** — a shared governance contract with **two producers**: **M-Index
   generates a default `owner`** (reconciled from the structural graph + git-blame, INDEX-15) and the **steward
   manifest overrides** it (STW, UC-G12); **tier is always human-ratified** (never generated). Consumed by
   M-Retrieval (pack floor), M-Grounding (ratify tier), M-Lifecycle (T0-human). Freeze the `globs→owner·tier`
   contract as a shared input; the index-as-generator / steward-as-override split is the resolved boundary.

## Per-FR independence (for the S0 ratification Register row)

| FR    | independence value                                                                                          |
| ----- | ----------------------------------------------------------------------------------------------------------- |
| FR-1  | on-diagonal                                                                                                 |
| FR-2  | COUPLED-with FR-3 (co-locate M-Retrieval; consumes the index seam)                                          |
| FR-3  | COUPLED-with FR-2 (co-locate M-Retrieval)                                                                   |
| FR-4  | COUPLED-with FR-5 (co-locate M-Grounding)                                                                   |
| FR-5  | COUPLED-with FR-4 (co-locate M-Grounding)                                                                   |
| FR-6  | decoupled-after FR-4 (consumes M-Grounding's drift-leg seam)                                                |
| FR-7  | COUPLED-with FR-9 (co-locate M-Lifecycle)                                                                   |
| FR-8  | on-diagonal                                                                                                 |
| FR-9  | COUPLED-with FR-7 (co-locate M-Lifecycle; dominant DP = DP-11; index territory-generation DP-1 contributes) |
| FR-10 | on-diagonal                                                                                                 |
| FR-11 | on-diagonal (M-Memory / DP-12)                                                                              |
| FR-12 | on-diagonal (M-Kernel security / DP-13)                                                                     |
| FR-13 | on-diagonal (M-Tools delivery / DP-14)                                                                      |

## Self-check

- [x] every FR mapped to ≥1 DP; `#DPs (14) ≥ #FRs (13)` (Theorem-1)
- [x] matrix read per row; every off-diagonal coupling flagged (A now coupled; FR-6←DP-4 added; FR-9←DP-11 homed)
- [x] each coupled cell resolved — A: co-locate M-Retrieval + index seam; B: co-locate M-Grounding; C: co-locate M-Lifecycle + drift seam
- [x] DP boundaries checked (brownfield read against the 9 real subsystems; index lifted, tools/write-door placed, Memory scoped; 2 volatile axes flagged for S4)
- [x] drift decision homed once (M-Grounding), consumed by M-Lifecycle (Parnas split resolved)

## Next

- **Confirm-pass** (decorrelated + DAG) — verify the reclassified Cluster A, the added cells, the lifted
  index/tools modules, and the 2 new seams are correct and no new inconsistency was introduced.
- **D4 — Ratify:** each existing Atlas invariant → a ratified Register row carrying its FR + this
  `independence:` value, through the 5 gates → the frozen Register = **S0**. Carry-forward flags: the `cv`
  migration + host-adapter boundaries (S4), the write-door + fold seams, and one **disclosed residual** —
  **DP-9 spans two substrates** (Knowledge hits-decay KNOW-17 in M-Lifecycle + Memory frecency MEM-7 in
  M-Memory); accepted here as one _shared decay-policy_ (both = "unused → archive, never delete"), revisit at
  D4 whether to split into two DPs or freeze as a shared-decay seam.
