# Oracle-Pin Map — the SIG-TBD reconciliation before WP fan-out

> **Why this exists.** The scaffold-freeze left ~135 `SIG-TBD` oracle shapes across 8 packages
> (`packages/*/ref/*.ts`). BIND's doctrine fail-closes on any SIG-TBD field a WP _must satisfy_ — so a
> large fraction of the 71 WPs STOP at BIND until their oracle is pinned. This is the deferred
> "digest-freeze / oracle-pinning" pass the wave-plan named (R4 + line 121). A grounded reconciliation
> seat mined each package's authoritative reference (`docs/reference/atlas-*.md`, `req-*`, `method-tags-*`,
> `goldens-*`, external contracts, downstream consumers). Every entry is **transcription-sourced or
> honestly escalated — nothing invented.**
>
> **Status:** ✅ **DONE** (2026-07-18). Survey + application complete, owner ratified all 12 DEFINE recs.
> SIG-TBD across the scaffold: **135 → 11** (all honest parks — see below). Applied in gated waves, each
> bobby cold-reviewed (2 FIX-FIRST caught: grounding `node` out-of-scope pick, persist `TranscriptView`
> conflation — both reverted). Commits `9e19a81` (W1 contracts+index) · `c0d14e0` (W2a know/grd/ret/mem) ·
> `d981fe0` (W2b tls/pst/gen + index-remainder). `tsc -b --force` green · vitest 52/52 · godfile green ·
> DAG intact. Kernel executed earlier (4 WPs sealed: `9c78762`, `1f28c1b`, `f94b94f`).
>
> **The 11 remaining (honest parks, never invented):** kernel 2 (`CasObject`/`ClaimEntry`, designed-opaque
> at L1) · persist 2 (`VersionDeltaEntry.fact/provenance` genuinely unsourced; `TranscriptView` OWNER-DEFINE)
> · grounding 1 (`ground(node)` — the owning WP pins its groundable-unit type) · knowledge 6 (`sealProbe`
> seal = upward Orchestra artifact; `init(tree)`; the composed emit→query→reconcile store surface). These
> park their specific WPs until pinned; every other WP now binds against a frozen oracle.

## Three categories

- **PIN** — an authoritative source forces the shape → apply by transcription (lead authority, per the
  wave-plan reconciliation sanction). ~62 markers.
- **OPAQUE-BY-DESIGN** — deliberately unknown at layer-0 (like `CasObject`); the WP treats it opaquely.
  Pin as explicit `unknown`, not escalated. ~15 markers.
- **OWNER-DEFINE** — a genuine product/design choice no reference settles. Escalated below. The WP PARKS
  until decided. **Never invented.**

## Per-package summary

| package   | markers | PIN | OPAQUE | OWNER-DEFINE     | notes                                                                                                                                        |
| --------- | ------- | --- | ------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| kernel    | 2       | —   | 2      | 0                | `CasObject`/`ClaimEntry` opaque at L1 — kernel WPs already sealed                                                                            |
| index     | 9       | 8   | 0      | ~1               | bobby: `Axes`/`FileTree`/`ScipOutput` pinned; ScipOutput projection = lead-ratify; **+ a decomposition cycle to fix** (see below)            |
| persist   | 16      | 5   | 0      | 11               | biggest DEFINE cluster; **+ `attach()` signature bug** (inverted vs golden SCN-PERSIST-4a-1)                                                 |
| grounding | 3       | 0   | 0      | 3                | all three `src` snapshot args unmade (and their owner, index `FileTree`, only pins to a raw tree — driftDetect needs a Rollup/Axes snapshot) |
| knowledge | 32      | 9   | ~4     | ~13→ (dedupe ~8) | `check` DSL, decay-unit, ratify token, blastRadius, template cap, router `slot`                                                              |
| retrieval | 14      | 2   | 0      | 7                | OwnPack terrain / OwnDrill handles / NodeTool MCP-schema                                                                                     |
| memory    | 28      | 25  | ~1     | 3                | X3 helped; only frecency `wave` unit + kinds put-return genuinely open                                                                       |
| tools     | 19      | 11  | ~3     | 6                | guard row, MCP-schema, blastRadius, doctor archive-view; `absorb(ResultCard)` = upward/Orchestra-owned (opaque)                              |
| genesis   | 14      | 10  | ~2     | 4                | WhyNot record, StageCost fields, LoopConfig fixpoint carrier (many settled by upstream pins)                                                 |

## OWNER-DEFINE decision set (deduped → 12 themes)

Cross-cutting themes unblock multiple packages at once — decide these first.

### Cross-cutting (each unblocks several WPs)

1. **`check` shape** — knowledge (`PredicateNode.check`, evaluator, Candidate ×5) + genesis (predicate) + it is
   KNOW-16 "a deterministic index-query **or** a pinned declarative assertion." Decision: the concrete record/DSL.
   _Recommend:_ a tagged union `{kind:'index-query'; query:string} | {kind:'assertion'; expr:string}` — minimal, both legs named by KNOW-16. Consumers use it opaquely today, so low blast.
2. **MCP tool-schema record** — tools (`handler.schema`) + retrieval (`NodeTool.schema`), both left `unknown` for
   the _same_ reason. System-wide; decide ONCE and share. _Recommend:_ the JSON-Schema subset MCP already uses
   (`{name, description, inputSchema}`) as a shared `@atlas/contracts` type.
3. **`blastRadius` shape** — knowledge (`types.ts`) + tools (`InitOut`). _Recommend:_ `readonly NodeKey[]`
   (reachability set); the reverse-dep closure already lives in index axis-3, so the _set_ is the honest carrier.
4. **Decay-window unit (`wave`)** — knowledge (`hits`) + memory (`frecency`). MEM-7 pins it ledger-driven (not
   wall-clock) but not what a `wave` _counts_. _Recommend:_ logical **ledger event-count** (a monotone integer
   stamped per hit), consistent across both.
5. **grounding `src` snapshot** — all 3 grounding verbs (`driftDetect`/`ground`/`gate`). Decision: the
   source-of-truth snapshot shape. _Recommend:_ a built-index snapshot bearing `rState` (i.e. an `@atlas/index`
   `Axes`/`Rollup`-derived view), **not** the raw `FileTree` — driftDetect re-checks against the rolled-up state.

### Package-local

6. **persist record cluster** (11 markers) — `SourceApi` (portable-source assembly signature) + `PlacementApi`
   (sole-home assertion signature) + `Dossier` optionality + `Checkpoint` element shapes (`seatBrief`/`llmOutputs[]`
   /`toolIO[]`) + `Metering` value shape + `VersionDeltaEntry.{fact,provenance}` + `TranscriptView` + `PrAttach`
   elements. The reference explicitly says `SourceApi`/`PlacementApi` are "NOT invented; a later spec pins."
   _This is the single largest gate._
7. **retrieval OwnPack/OwnDrill** — `OwnPack.{terrain, edges-summary}`, `OwnDrill.{refresh, complement}` handles,
   `OwnUnit.grounding`, `rank` joined-item `{hits,ppr,nodeKey}`. X1/D1 pin the _design_ (pack-grain announce,
   content-free availability manifest) but not the TS. _Recommend:_ transcribe X1/D1 into concrete records at BIND.
8. **knowledge ratify token/handle** — `staged` handle + ratifier/billy `token` shapes (routing is frozen, shapes aren't).
9. **knowledge template** — required-field set + per-slot numeric cap (OPEN-DEFINE, no number frozen).
10. **knowledge router `slot`** — _adversarial catch:_ `nodeKey`/`primaryAnchorId` need a `slot`, but `GroundedFact`
    has none; the computable input is `Candidate`. Decision: add `predicateSlot` to `GroundedFact` **or** route `Candidate`.
11. **knowledge produce/reconcile** — `produce(event)` body + accepted-facts return; `reconcile` new-`@sha` threading.
12. **genesis** — `WhyNot` abstention record field-list + `StageCost` cost-report fields + `LoopConfig` fixpoint/ε carrier.

## Non-decisions (apply directly)

- **OPAQUE-BY-DESIGN → pin `unknown` explicitly:** handler args (totality boundary, TOOLS-2), `orient(define)`
  (DEFINE artifact has no type at any layer), seed `facet(source)` (heterogeneous), tools `absorb(ResultCard)`
  (upward/Orchestra-owned — outside atlas L0), logbook/recall `query`, memory/genesis awareness `source`.
- **index decomposition fix** (bobby): pin `Axes={spatial,territory,dependency:IndexNode; edges:DepEdge[]}` +
  `FileTree` + `ScipOutput` (occurrences subset); **re-partition** Campaign-2 to break the WP-2.8-a→2.6 cycle
  (move SCN-INDEX-8a-1/9a-1/9b-1/7a-1 → WP-2.8-a; SCN-INDEX-1a-1/1b-1 → new WP-2.1.INDEX). Lead-owned.
- **persist `attach()` bug**: signature is inverted vs golden SCN-PERSIST-4a-1 (`attach(body):Pointer`, not
  `attach(pointer)`). Reconciliation fix, not a DEFINE.

## Recommended sequence

1. Owner rules on the 12 DEFINE themes (recommendations pre-filled above — mostly "yes, the minimal one").
2. Lead applies **all** pins (62 transcription + the ratified DEFINE shapes) in one gated reconciliation wave,
   re-freezes the scaffold, verifies `tsc -b` green + downstream coherence, cold-review.
3. Mass-fan-out the 71 WPs against the now-fully-frozen oracles — BIND-STOPs become rare.
