// @atlas/retrieval — src/own.ts  (OwnPack composer facet — RETR-12 + owner-decision D1)
//
// `own_<unit>` projects a curated `OwnPack` composed by INDEX READS ALONE — 0 LLM, `≤ OWN_CAP`,
// byte-identical for equal input; composition is mechanical (rank → cap → dedup → project). Seam consumer:
// every index axis is supplied; NEVER hashes. Total (RETR-9): a malformed unit ⇒ empty briefing, no throw.
// D1: the composer carries an AVAILABILITY-MANIFEST — a bounded, frecency-ranked, CONTENT-FREE map of
// reachable surfaces (pointers + how-to-pull, never content), under the same `OWN_CAP` budget. The result
// `OwnPackPlus` extends the frozen `OwnPack` with additive exec-observable receipts (assignable to it).
//
// [AMENDED — REQ-RETR-12m, 2026-08-03] The briefing is TWO bands, not one filtered list, exactly as the
// query pack has been since ADR-0013: the GOVERNING band (`tier≥T1`, ratified — `invariants` + `gotchas`,
// unchanged in content, order and budget) and the ADVISORY band (`T2`, machine proposals no ratifier saw),
// filled LAST out of what the governing band left, under its own `OWN_ADVISORY_CAP` sub-cap INSIDE the
// unchanged `OWN_CAP`. `OWN_CAP` does not grow; what the sub-cap refuses joins the existing `pullReachable`
// tail and is counted in `advisoryDropped`. The tier PREDICATES are not stated here — this layer cannot
// import `@atlas/tools` (L5 inner, L7 outer), so the feed hands over a band it has already labelled through
// the one shared `splitBands`/`isAdvisory` in `@atlas/tools` src/bands.ts, and this composer only budgets.

import { tierRank } from "@atlas/knowledge"
import type { NodeKey, Pack, PackInvariant } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type { OwnLevel, OwnUnit, RelatedFact, RelationSet } from "./types.js"
import type {
  DedupPointer,
  EpicUnit,
  GroundingSource,
  ManifestCandidate,
  ManifestPointer,
  OwnFacet,
  OwnPackPlus,
  OwnSources,
  SizedGotcha,
  SizedInvariant,
} from "./own-model.js"

// The facet's DATA MODEL lives in `own-model.ts` and is re-exported HERE, unchanged, so every existing
// importer of `./own.js` (and the package barrel) keeps the exact names it had. The split is by role —
// declarations vs. the composer — and the public surface is byte-identical; see that file's header.
export type {
  AvailabilityManifest,
  DedupPointer,
  EpicUnit,
  GroundingSource,
  ManifestCandidate,
  ManifestPointer,
  OwnApi,
  OwnFacet,
  OwnPackPlus,
  OwnSources,
  SizedGotcha,
  SizedInvariant,
} from "./own-model.js"

// ── frozen bounds (RETR-12f/caps.ts: own ~1.5K under the ~5K ceiling; edges/finer/manifest bounded) ──────
/** The `own` briefing budget in the pinned `cl100k_base` measure — `~1.5K` under the ceiling (RETR-12f). */
export const OWN_CAP = 1500
/** Hard cap on the bounded `relate()` blast summary carried in `edges` (a capped subset, not the closure). */
export const EDGE_CAP = 8
/** Hard cap on the `drill.finer` pointer list — finer detail is pull-reachable, never inlined (RETR-12g). */
export const FINER_CAP = 16
/** Hard cap on the availability-manifest pointer count (D1: a bounded index, not a second swarm). */
export const MANIFEST_CAP = 12

/**
 * The ADVISORY band's sub-cap INSIDE `OWN_CAP` — `750`, and every part of that sentence is load-bearing.
 *
 * INSIDE. `OWN_CAP` does not grow. RETR-12f caps the whole briefing at `~1.5K` and this amendment adds a
 * band, not a budget: an advisory row is only ever paid for out of the 1500 the briefing already had.
 *
 * DERIVED, not chosen. `@atlas/tools` src/bands.ts carries the one owner-ratified advisory bound in this
 * product — `ADVISORY_CAP = 2000` against a governing `PACK_CAP = 2000` (retrieval/src/pack.ts), i.e. the
 * ratified ratio is 1:1, an advisory band may be as large as the governing band and no larger. That number
 * cannot be reused here: 2000 exceeds the whole 1500 briefing, so importing it would make the sub-cap
 * vacuous. The RATIO carries over instead, applied to the budget this door actually has — `OWN_CAP / 2`.
 * So no new magnitude is invented; what is inherited is the ratified shape ("advisory ≤ governing"), and
 * the consequence is stated rather than assumed: a briefing can never be more than half machine proposals.
 */
export const OWN_ADVISORY_CAP = OWN_CAP / 2

/** Criticality → ordinal (T0 first). */
// The lattice is NOT rebuilt here. A private `Record<Tier, number>` yields `undefined` for an off-lattice
// value, so `tierRank(a) - tierRank(b)` was `NaN` and the sort order became undefined around a
// poisoned row. `tierRank` (@atlas/knowledge) is total: an unrecognized class ranks LAST, so it sinks.

// ── pure helpers ────────────────────────────────────────────────────────────────────────────────────────
/** Byte-stable code-point key comparator (the final total-order tiebreak, matches relate's `nodeKey-asc`). */
function keyCmp(a: NodeKey, b: NodeKey): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** A single role LINE — the first line only; never a multi-paragraph prose blob (RETR-12e). */
function oneLine(role: string): string {
  const nl = role.indexOf("\n")
  return (nl === -1 ? role : role.slice(0, nl)).trim()
}

/** The `own_<id>` tool name (RETR-12a): `own_` + the unit's leaf segment (after the last `/` or `:`). */
export function ownToolName(unit: OwnUnit): string {
  const parts = unit.id.split(/[/:]/).filter((s) => s.length > 0)
  const leaf = parts.length > 0 ? parts[parts.length - 1] : unit.id
  return `own_${leaf}`
}

/** Level → grounding source (RETR-12i): crate/module by the tree, service/feature by a declared manifest. */
export function groundingSource(level: OwnLevel): GroundingSource {
  return level === "crate" || level === "module" ? "tree" : "manifest"
}

/** Rank invariants `(hits-desc, ppr-desc, nodeKey-asc)` — the pack rank (goldens Fixture A), T0 first. */
function cmpInvariant(a: SizedInvariant, b: SizedInvariant): number {
  const t = tierRank(a.inv.tier) - tierRank(b.inv.tier)
  if (t !== 0) return t
  if (a.hits !== b.hits) return b.hits - a.hits
  if (a.ppr !== b.ppr) return b.ppr - a.ppr
  return keyCmp(a.inv.nodeId, b.inv.nodeId)
}

/** Rank manifest pointers by frecency `(hits-desc, name-asc)` (D1 relevance/frecency order). */
function cmpPointer(a: ManifestCandidate, b: ManifestCandidate): number {
  if (a.pointer.hits !== b.pointer.hits) return b.pointer.hits - a.pointer.hits
  return a.pointer.name < b.pointer.name ? -1 : a.pointer.name > b.pointer.name ? 1 : 0
}

/** Rank gotchas `(tier-asc: T0 first, id-asc)` — deterministic, no LLM. */
function cmpGotcha(a: SizedGotcha, b: SizedGotcha): number {
  const t = tierRank(a.fact.tier) - tierRank(b.fact.tier)
  if (t !== 0) return t
  return keyCmp(a.fact.id, b.fact.id)
}

/** The empty briefing (RETR-9): a malformed/failed unit yields this — never a throw. */
function emptyOwn(source: GroundingSource): OwnPackPlus {
  return {
    unit: "",
    invariants: [],
    shape: { contents: [], owner: "", tier: "T2" },
    edges: { dependents: [], dependencies: [] },
    gotchas: [],
    memory: null,
    drill: { finer: [], refresh: { pull: "" }, complement: { pull: "" } },
    grounding: { source },
    tokenEstimate: 0,
    manifest: { pointers: [], truncated: false },
    pullReachable: [],
    advisory: [],
    advisoryDropped: 0,
  }
}

/** The bounded `relate()` blast summary → capped, sorted `edges` (RETR-12: a capped subset, deterministic). */
function edgesOf(rel: RelationSet): {
  readonly dependents: readonly NodeKey[]
  readonly dependencies: readonly NodeKey[]
} {
  const keys = (facts: readonly RelatedFact[]): readonly NodeKey[] =>
    [...facts.map((f) => f.nodeId)].sort(keyCmp).slice(0, EDGE_CAP)
  return { dependents: keys(rel.dependents), dependencies: keys(rel.dependencies) }
}

// ── the composer ────────────────────────────────────────────────────────────────────────────────────────
export function createOwn(sources: OwnSources): OwnFacet {
  /** Compose the curated OwnPack for a GROUNDED unit — rank → greedy-fill under OWN_CAP → project. */
  function composeOwn(unit: OwnUnit): OwnPackPlus {
    let used = 0
    const overflow: NodeKey[] = []

    // invariants: T0-first then T1 by (hits-desc, ppr-desc, nodeKey-asc); greedy-fill under the cap.
    const invariants: PackInvariant[] = []
    for (const cand of [...sources.invariants(unit)].sort(cmpInvariant)) {
      if (used + cand.cost <= OWN_CAP) {
        invariants.push(cand.inv)
        used += cand.cost
      } else {
        overflow.push(cand.inv.nodeId) // 0 silent drops — a pull-reachable tail
      }
    }

    // gotchas: structured knowledge facts (never prose), under the remaining budget.
    const gotchas: GroundedFact[] = []
    for (const cand of [...sources.gotchas(unit)].sort(cmpGotcha)) {
      if (used + cand.cost <= OWN_CAP) {
        gotchas.push(cand.fact)
        used += cand.cost
      } else {
        overflow.push(cand.fact.id)
      }
    }

    // availability manifest (D1): frecency-ranked, count- + budget-capped, content-free.
    const pointers: ManifestPointer[] = []
    let truncated = false
    for (const cand of [...sources.manifest(unit)].sort(cmpPointer)) {
      if (pointers.length < MANIFEST_CAP && used + cand.cost <= OWN_CAP) {
        pointers.push(cand.pointer)
        used += cand.cost
      } else {
        truncated = true
      }
    }

    // ADVISORY band (RETR-12m) — LAST, and the position is the invariant. Every governing row, every
    // gotcha and every manifest pointer has already been paid for out of `OWN_CAP` by the time this loop
    // runs, so an advisory row can only ever spend what the ratified content did not want: a briefing whose
    // governing band fills the budget serves ZERO advisory rows and is byte-identical to what it served
    // before this amendment. The band is bounded TWICE — by its own `OWN_ADVISORY_CAP` sub-cap and by the
    // unchanged `OWN_CAP` total — so it can neither displace the governing band nor grow the briefing.
    //
    // The fill is CAP-WINS, byte-for-byte the discipline `splitBands` (@atlas/tools src/bands.ts) applies
    // to the query pack's advisory band: once either cap has bitten, every remaining row is dropped and no
    // later (smaller) row sneaks in ahead of an earlier one. It differs DELIBERATELY from the greedy best-
    // fit of the two governing loops above, which is pre-existing and is not this amendment's to change:
    // the two shipped advisory bands must truncate the same way, or "the advisory band" names two things.
    const advisory: PackInvariant[] = []
    let advisoryUsed = 0
    let advisoryDropped = 0
    let advisoryCapped = false
    for (const cand of [...sources.advisory(unit)].sort(cmpInvariant)) {
      const fits = advisoryUsed + cand.cost <= OWN_ADVISORY_CAP && used + cand.cost <= OWN_CAP
      if (!advisoryCapped && fits) {
        advisory.push(cand.inv)
        advisoryUsed += cand.cost
        used += cand.cost
      } else {
        advisoryCapped = true
        // Both ledgers, deliberately: `advisoryDropped` is the COUNT a reader checks against "did I see the
        // whole band", `pullReachable` is the existing 0-silent-drops tail that names each row by nodeKey.
        // `own` already promises the tail ("what did not fit is listed as pull-reachable, never silently
        // dropped"); honouring that promise beats inventing a second one.
        advisoryDropped += 1
        overflow.push(cand.inv.nodeId)
      }
    }

    const terrain = sources.terrain(unit)
    return {
      unit: oneLine(sources.role(unit)),
      invariants,
      shape: { contents: terrain.contents, owner: terrain.owner, tier: terrain.tier },
      edges: edgesOf(sources.relate(unit)),
      gotchas,
      memory: sources.memory(unit),
      drill: {
        finer: [...sources.finer(unit)].slice(0, FINER_CAP), // pointers only — never inlined
        refresh: { pull: `poke:${ownToolName(unit)}` },
        complement: { pull: `relate:${unit.id}` },
      },
      grounding: { source: groundingSource(unit.level) },
      tokenEstimate: used,
      manifest: { pointers, truncated },
      pullReachable: overflow,
      advisory,
      advisoryDropped,
    }
  }

  function own(unit: OwnUnit): OwnPackPlus {
    try {
      return composeOwn(unit)
    } catch {
      return emptyOwn(groundingSource(unit.level)) // RETR-9: total — never propagate a throw
    }
  }

  /**
   * Compose an EPIC (RETR-12j/12l): NOT a grounded node. Role from the project-memory `goal`; content from
   * the FEATURES' OwnPacks (deduped by nodeId), whole features included until the `OWN_CAP` budget, the
   * rest ceded to a pull-reachable pointer. `grounding.source = 'goal'` — no tree path / manifest required.
   */
  function ownEpic(epic: EpicUnit): OwnPackPlus {
    try {
      let used = 0
      const seen = new Set<string>()
      const invariants: PackInvariant[] = []
      const advisory: PackInvariant[] = []
      let advisoryDropped = 0
      const gotchas: GroundedFact[] = []
      const finer: OwnUnit[] = []
      const pointers: ManifestPointer[] = []
      const overflow: NodeKey[] = []
      const depSet = new Set<NodeKey>()
      const depsSet = new Set<NodeKey>()
      let truncated = false

      for (const feat of epic.features) {
        const fpack = own(feat)
        const fits = used + fpack.tokenEstimate <= OWN_CAP
        pointers.push({
          kind: "pack",
          name: ownToolName(feat),
          digest: `sim:${ownToolName(feat)}`,
          pull: `pull:${ownToolName(feat)}`,
          hits: 0,
        })
        if (fits) {
          used += fpack.tokenEstimate
          finer.push(feat)
          for (const iv of fpack.invariants) {
            if (seen.has(iv.nodeId)) continue // dedup by nodeId across features
            seen.add(iv.nodeId)
            invariants.push(iv)
          }
          for (const g of fpack.gotchas) gotchas.push(g)
          // The feature's own advisory band rides along with the feature, already sub-capped by its own
          // composition, and its drop ledger ADDS UP rather than being restated: an epic that swallowed a
          // feature's truncation count would report a complete band the feature knew was cut.
          for (const av of fpack.advisory) {
            if (seen.has(av.nodeId)) continue // same nodeId dedup the governing band applies
            seen.add(av.nodeId)
            advisory.push(av)
          }
          advisoryDropped += fpack.advisoryDropped
          for (const d of fpack.edges.dependents) depSet.add(d)
          for (const d of fpack.edges.dependencies) depsSet.add(d)
        } else {
          truncated = true
          for (const iv of fpack.invariants) overflow.push(iv.nodeId) // pull-reachable, not silently gone
          // A feature that did not fit takes its advisory band with it — named in the tail and COUNTED,
          // never quietly absent, and counted here as well as in the feature's own ledger below.
          for (const av of fpack.advisory) overflow.push(av.nodeId)
          advisoryDropped += fpack.advisory.length + fpack.advisoryDropped
        }
      }

      return {
        unit: oneLine(epic.goal), // role sourced from the project-memory goal, NOT a grounded node's line
        invariants,
        shape: { contents: [], owner: "", tier: "T2" }, // an epic has no grounded terrain
        edges: {
          dependents: [...depSet].sort(keyCmp).slice(0, EDGE_CAP),
          dependencies: [...depsSet].sort(keyCmp).slice(0, EDGE_CAP),
        },
        gotchas,
        memory: null,
        drill: { finer, refresh: { pull: `poke:own_${epic.id}` }, complement: { pull: `relate:${epic.id}` } },
        grounding: { source: "goal" }, // RETR-12j: an epic is a project-memory goal, not grounded
        tokenEstimate: used,
        manifest: { pointers, truncated },
        pullReachable: overflow,
        advisory,
        advisoryDropped,
      }
    } catch {
      return emptyOwn("goal")
    }
  }

  function dispatch(unit: OwnUnit): { readonly tool: string; readonly pack: OwnPackPlus } {
    return { tool: ownToolName(unit), pack: own(unit) } // pushed by default (RETR-12h) — no explicit request
  }

  function project(units: readonly OwnUnit[]): readonly { readonly tool: string; readonly pack: OwnPackPlus }[] {
    return units.map((u) => dispatch(u)) // RETR-12a: every scope-unit → its own_<id> tool
  }

  /**
   * Dedup `own` against a co-injected pack (RETR-12k): a fact carried in `own` is REMOVED from the pack and
   * replaced by a pull-reachable pointer — dedup by nodeId, `own` wins, the fact is paid for once.
   */
  function dedup(
    ownPack: OwnPackPlus,
    pack: Pack,
  ): { readonly pack: Pack; readonly pointers: readonly DedupPointer[] } {
    const ownIds = new Set<string>(ownPack.invariants.map((i) => i.nodeId))
    const kept: PackInvariant[] = []
    const pointers: DedupPointer[] = []
    for (const iv of pack.invariants) {
      if (ownIds.has(iv.nodeId)) pointers.push({ nodeId: iv.nodeId, pull: `own:${iv.nodeId}` })
      else kept.push(iv)
    }
    return { pack: { ...pack, invariants: kept }, pointers }
  }

  return { own, ownEpic, dispatch, project, dedup }
}
