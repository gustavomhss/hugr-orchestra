// @atlas/adapter-io — test/governed-link-support.ts  (WP-SAMEAS — shared fixtures for the sameAs write door)
//
// EXTRACTED from `governed-link.test.ts` when the endpoint-authz teeth were added and the suite crossed the
// 400-LOC ceiling. A real seam, not a line-count dodge: these builders are now consumed by TWO suites — the
// gate-ladder suite (`governed-link.test.ts`) and the endpoint-disclosure suite
// (`governed-link-endpoint-authz.test.ts`), which needs a TWO-SCOPE projection the original single-scope
// `POLICY` could not express. Behaviour-preserving: `fact` / `fixture` / `POLICY` are byte-identical to the
// versions they were lifted from, so no case that passed before is now passing for a different reason.

import { id, asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { AdvisoryNode, GroundedFact, StoreProjection, CurrentNode } from "@atlas/knowledge"
import type { DiskStore } from "../src/store.js"
import type { AtlasPolicy } from "../src/policy.js"

/** A grounded advisory fact at a given scope/tier — the CAS bytes a projection node points at. */
// Returns `AdvisoryNode`, not the wider `GroundedFact`: the literal below is unconditionally
// `kind: 'advisory'`. The wide return type is what made `f.claimNorm` in `fixture` a union access on a
// field `PredicateNode` does not have.
export function fact(opts: { claim: string; scope: string; tier: GroundedFact["tier"] }): AdvisoryNode {
  return {
    kind: "advisory",
    id: asNodeKey(`nk-${opts.claim}`),
    tier: opts.tier,
    claimNorm: opts.claim,
    grounding: {
      entries: [
        {
          anchor: { kind: "symbol", qualifiedPath: `src/${opts.claim}.ts::f`, subtreeHash: asSubtreeHash("sh") },
          path: "src",
        },
      ],
    },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    scope: opts.scope,
  }
}

export interface LinkFixture {
  readonly store: DiskStore
  readonly persists: () => readonly StoreProjection[]
}

/** A store whose projection holds one current node per supplied fact, keyed `n0`, `n1`, … with the fact's
 *  real content address — so the door's CAS read-back resolves exactly the fact under test.
 *
 *  `edges` seeds STORED `sameAs` peers on those nodes (`{ n0: ['nRETIRED'] }`). A peer that is not itself a
 *  current node is not a malformed fixture: `linkSameAs` writes the edge onto BOTH endpoints, and a node
 *  superseded afterwards leaves its peer's stored edge pointing at a key the projection no longer carries.
 *  That is the shape the class-join below has to survive, and no earlier case here produced it. */
export function fixture(
  // `AdvisoryNode[]`: every row this builds is stamped `family: 'advisory'` and reads `claimNorm`, which
  // only AdvisoryNode carries. A PredicateNode here would have produced `claims: [undefined]` silently.
  facts: readonly AdvisoryNode[],
  edges: Readonly<Record<string, readonly string[]>> = {},
): LinkFixture {
  const cas = new Map<string, CasObject>()
  const current = new Map<string, CurrentNode>()
  facts.forEach((f, i) => {
    const h = id(f as CasObject) as unknown as string
    cas.set(h, f as CasObject)
    const key = `n${i}`
    const sameAs = edges[key]
    // The row carries the node's `(scope, tier)` (ADR-0007 carrier) exactly as `upsert` stamps it, so the
    // authz gates can resolve authority off the projection without reading CAS. Mirrored FROM the fact, not
    // invented: the door corroborates the two against each other, and a fixture that disagreed with its own
    // bytes would be testing the tamper path rather than the ordinary one.
    current.set(key, {
      nodeKey: key,
      family: "advisory",
      contentHash: h,
      claims: [f.claimNorm],
      scope: f.scope!,
      tier: f.tier,
      ...(sameAs ? { sameAs } : {}),
    })
  })
  const persists: StoreProjection[] = []
  const projection: StoreProjection = { current, cas: new Set(cas.keys()) }
  return {
    store: {
      put(obj) {
        const h = id(obj)
        cas.set(h as unknown as string, obj)
        return h
      },
      get: (h) => cas.get(h as unknown as string),
      // The atomic commit, faked: read the head, run the WHOLE decision, publish only what it returns. A
      // decision with no `next` (every governed refusal) writes nothing — the property `persists()` pins.
      commitProjection: (decide) => {
        const decision = decide(persists.length > 0 ? persists[persists.length - 1]! : projection)
        if (decision.next !== undefined) persists.push(decision.next)
        return { settled: true, out: decision.out }
      },
      persistProjection: (p) => void persists.push(p),
      loadProjection: () => (persists.length > 0 ? persists[persists.length - 1] : projection),
      // ADR-0008's staging door. `governed-link.ts` writes ONLY through `commitProjection` (verified: it is
      // the file's single store-write call site), so nothing under test reaches this — it was missing from a
      // literal annotated `DiskStore`, which `tsc -b` could not see while it covered only `src`. Present so
      // the annotation means what it says; deliberately inert, never silently "staging".
      commitStaging: (decide) => ({ settled: true, out: decide(projection).out }),
    },
    persists: () => persists,
  }
}

/** The REAL content address of a fixture fact — the key its CAS object is stored under, so a test can prune
 *  exactly one object. Never hand-forged: it is the same `id` the fixture itself indexed the object by. */
export function addressOf(f: GroundedFact): string {
  return id(f as CasObject) as unknown as string
}

/** The SAME store with a chosen set of CAS objects PRUNED — a partial restore / half-fetched pack, which is
 *  the realistic storage fault (CAS is content-addressed, so a loss drops SOME objects, never all of them).
 *  Everything else, `commitProjection` included, is the live fixture store. */
export function blindTo(store: DiskStore, ...pruned: readonly string[]): DiskStore {
  const gone = new Set(pruned)
  return { ...store, get: (h) => (gone.has(h as unknown as string) ? undefined : store.get(h)) }
}

/** alice owns `core`; mallory owns `other`. */
export const POLICY: AtlasPolicy = {
  t0Heuristic: { keywords: [] },
  authz: { scopes: { core: ["alice"], other: ["mallory"] } },
}
