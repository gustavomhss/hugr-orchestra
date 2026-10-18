# Surface map — the decomposition territory

> Phase 2.0 of the [Decomposition Protocol](../DECOMPOSITION-PROTOCOL.md). Map the whole surface **before**
> writing any requirement. This is the skeleton of the traceability spine: every design invariant becomes a row
> with an `R` slot; per-invariant rows fill in **as each block is decomposed** (never all at once — that's the
> overhead trap). `$0`, mechanical, revised only when the design freeze changes an invariant count.

## The territory — 132 invariants, 9 disjoint blocks

Blocks are disjoint by construction (the ID families never overlap → clean techlead slices). Tier is set here,
once, and drives effort (cheap-by-default; only the **core** block earns a formal model, **elevated** blocks
get PBT/exhaustive + full goldens, **standard** blocks get EARS + light goldens).

| block   | module    | invariants | IDs                   | block tier                                                 | S2 method-tag                              | cross-block seam (contract-freeze first)           |
| ------- | --------- | ---------: | --------------------- | ---------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| **KRN** | kernel    |         12 | KERNEL-1..12          | **core cluster = KERNEL-9/10/11** (rest = reference-model) | `FSPEC-merge` (formal) on the cluster only | owns the merge contract → PST consumes it          |
| **GRD** | grounding |         13 | GROUND-1..13          | **elevated** (truth-gate)                                  | `PBT` (contingent P)                       | consumes IDX subtreeHash; KNW consumes it          |
| **KNW** | knowledge |         18 | KNOW-1..18            | **elevated** (write-decision)                              | `exhaustive`                               | consumes GRD (grounding) + IDX (anchor)            |
| **RET** | retrieval |         13 | RETR-1..13            | **elevated** (drop-order/caps)                             | `PBT`                                      | consumes IDX (relate) + MEM (packs)                |
| **IDX** | index     |         16 | INDEX-1..16           | standard                                                   | —                                          | the substrate everything grounds to → freeze early |
| **MEM** | memory    |         13 | MEM-1..13             | standard                                                   | —                                          | consumes RET (injection)                           |
| **PST** | persist   |         15 | PERSIST-1..13,10a,10b | standard                                                   | —                                          | consumes KRN merge contract                        |
| **TLS** | tools     |         16 | TOOLS-1..15,11a       | standard                                                   | —                                          | projects KNW/RET/IDX nodes (read-only)             |
| **GEN** | genesis   |         16 | GEN-1..16             | standard                                                   | —                                          | one-time seeder; consumes all axes                 |

**Formal footprint:** **1 model total** — `FSPEC-merge`, the CRDT merge cluster (`KERNEL-9/10/11` +
`PERSIST-11`). The three other _elevated_ clusters carry heavier **method-tags** — grounding = PBT (contingent
P), write-decision = exhaustive enumeration, drop-order = PBT — **not** formal models. Everything else is a
reference-model + PBT. (Authority: the S2 decision table in
[`../DECOMPOSITION-PROTOCOL.md`](../DECOMPOSITION-PROTOCOL.md).)

## Surfaces added after the core (disjoint ID families, own artifact sets)

The 132 above are the **layer-0 core**. Two surfaces were decomposed on top of it; each owns a disjoint ID
family and its own S0→S4 artifact set, so the core's counts are unchanged by either.

| surface                     | campaign    | modules (ID families)                    | invariants | block tier                                                       | S2 method-tags                                          | artifact set                                 |
| --------------------------- | ----------- | ---------------------------------------- | ---------: | ---------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------- |
| **the productization ring** | CAMPAIGN-9  | ADAPTER · WIRE · CLI · MCP               |         19 | standard                                                         | 0 formal · reference-model / exhaustive / PBT           | `*-adapters.md`                              |
| **the authoring surface**   | CAMPAIGN-10 | **AUTH** (new) · CLI (ext.) · MCP (ext.) |         18 | **elevated** (agreement laws: planner≡gate, check≡door, CLI≡MCP) | 0 formal · **PBT 5 · exhaustive 8 · reference-model 5** | `*-authoring.md` + `properties-authoring.md` |

**Formal footprint is still 1 model total.** Neither surface authors an `FSPEC`; both consume
`FSPEC-merge` through frozen seams. The authoring surface's `elevated` tier reflects its unusual density of
**agreement** properties — three of its invariants assert that two independently-runnable things must
produce the same answer — which a witness pair cannot close and a `∀` can. (Authority:
[`method-tags-authoring.md`](./method-tags-authoring.md) §tag distribution.)

## Ordering — pilot first, then the core, then fan out

1. **Freeze the design (Phase 1) first.** Requirements derive from a _frozen_ design. Several invariants are
   still being fixed in the freeze-gate triage (e.g. KERNEL-10 = the U2 resurrection bug, the spec↔ref
   contradictions). A block cannot be decomposed while its source invariants are in flux. **Blocks with open
   Phase-1 blockers are gated on the freeze.**
2. **Pilot one block end-to-end** to lock the templates and _measure_ the overhead before scaling. Recommended
   pilot = **KRN** — it roots the spine (everything grounds to the kernel), and it exercises the full pipeline
   (EARS + a formal model + happy/edge/failure goldens) on the highest-value target, so if the protocol is too
   heavy we learn it on the block that matters most, not a throwaway.
3. **Then the remaining elevated blocks** (GRD, KNW, RET) — heavier method-tags (PBT / exhaustive), **not**
   formal models.
4. **Then fan out the standard blocks** (IDX early as the substrate, then MEM/PST/TLS/GEN) — these are cheap
   EARS + goldens, parallelizable.

## Per-block spine (fills in during decomposition)

Each block, when decomposed, appends its per-invariant rows here:
`| invariant | tier | R-ids | F? | G-ids | WP |`. Empty until the block is opened. This table, once populated,
IS coverage-gate A (every invariant has an `R`) and D (every `R` reaches a `WP`) — a query, not a judgment.
