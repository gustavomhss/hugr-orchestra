// @atlas/contracts — pack.ts
//
// The shared injection vocabulary. These types break the retrieval⟷memory cycle: both packages
// speak this dialect without importing each other.

import type { Hash, NodeKey } from "./hash.js"
import type { Freshness } from "./status.js"
import type { Tier } from "./tier.js"

/** A retrieval pack: TWO separately bounded bands of a territory, with a drift flag.
 *  (atlas-retrieval line 16; two-band amendment ADR-0013, owner-ratified 2026-08-03)
 *
 *  FLAG (reference underspecifies these field types — line 16 lists names, types only for
 *  `invariants`). Inferred, not invented:
 *   - `territory`  → the territory NAME (the governance key, lead-ratified) — a pack references
 *     its scope by key, not by value-embedding the full Territory (CAS thesis); avoids dragging
 *     authoring-time `globs` into a consumer briefing. owner/tier ride per-invariant below.
 *   - `axisHash`   → Hash (content identity of the axis snapshot the pack was built from).
 *   - `tokenEstimate` → number (the pinned cl100k_base / UTF-8 count, retrieval line 61-62).
 *   - `stale`      → boolean (`true` iff any backing grounding drifted, retrieval line 53-55).
 *
 *  ── THE TWO BANDS, AND WHY `stale` IS UNTOUCHED BESIDE THEM (ADR-0002 amended, not reversed) ──────
 *  `invariants` is the GOVERNING band (`tier≥T1`, ratified rows). `advisory` is the ADVISORY band (`T2`,
 *  machine proposals nobody ratified) under its OWN cap. They are separate FIELDS, never one filtered
 *  list, so no consumer can render a `T2` proposal on the line form a ratified invariant arrives on.
 *
 *  `stale` answers a DIFFERENT question from `PackInvariant.freshness` and both are kept because both are
 *  true: `stale` is the repo-GLOBAL read-model watermark ("is this view behind HEAD?", ADR-0002 / N11 —
 *  honest-conservative by deliberate design, it trades a false-negative for a false-positive), while
 *  `freshness` is the PER-FACT structural verdict ("did THIS fact's cited unit actually move?"). A pack
 *  says both at once; neither is computed from the other. */
export interface Pack {
  readonly territory: string
  readonly axisHash: Hash
  /** The GOVERNING band — `tier≥T1` only. Its content and order are unchanged by the advisory band. */
  readonly invariants: readonly PackInvariant[]
  /** The ADVISORY band — `T2` only, separately capped (`ADVISORY_CAP`, @atlas/tools). An unrecognized
   *  (off-lattice) tier is in NEITHER band: not governing, not advisory, bounded out entirely. */
  readonly advisory: readonly PackInvariant[]
  /** How many advisory rows the advisory cap dropped. A truncated bounded set that does not say so reads
   *  as "we covered everything" (#130), so the count rides out beside the data — the same discipline as
   *  `StructuralFrontier.droppedNoPath`. `0` means nothing was dropped, never "we did not look". */
  readonly advisoryDropped: number
  /** The size of what was actually RETURNED — both bands (ADR-0013 clause 4). */
  readonly tokenEstimate: number
  readonly stale: boolean
}

/** One structured (never-prose) invariant line inside a Pack. (atlas-retrieval line 17)
 *
 *  FLAG (underspecified field types): `nodeId` inferred as NodeKey (the node's identity key);
 *  `claim` inferred as string (a 1-line structured claim, "never a prose blob"). `tier` is Tier. */
export interface PackInvariant {
  readonly nodeId: NodeKey
  readonly tier: Tier
  readonly claim: string
  /**
   * THIS row's own freshness verdict — REQUIRED, never optional (ADR-0013 clause 5: a row served without
   * one is a defect, not a default). It is the CANONICAL `Freshness`, the very type `driftDetect` (the
   * GROUND-1 oracle, `@atlas/grounding`) declares as its return — not a second, parallel vocabulary. The
   * local structural oracle produces only `FRESH`/`DRIFTED`; `STALE` (GROUND-13 advisory drift) is carried
   * through unchanged if a producer ever supplies it rather than being collapsed into one of the others.
   *
   * ADR-0002:52 deferred exactly this field as "a `Pack` contract change for a later consumer". The
   * consumer is the advisory band: a pack-level flag is sufficient for rows a human ratified and is not
   * sufficient for rows nobody did.
   */
  readonly freshness: Freshness
}

/** The closed vocabulary of auto-injection surfaces (drop-order / budget keys). (atlas-retrieval line 45) */
export type InjectionKind =
  | "awareness"
  | "orientation"
  | "projectMem"
  | "own"
  | "pack"
  | "protocols.safetyCritical"
  | "protocols.advisory"
  | "poke"

/** Per-injection-kind cap + hits ledger + observed hit-rate (the drop-order oracle, RETR-6).
 *  (atlas-retrieval line 46)
 *
 *  FLAG (underspecified field types): `capTokens`, `hits`, `hitRate` inferred as number
 *  (a per-type token cap, a hits count, an observed rate). `kind` is InjectionKind. */
export interface Budget {
  readonly kind: InjectionKind
  readonly capTokens: number
  readonly hits: number
  readonly hitRate: number
}
