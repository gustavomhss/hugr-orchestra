// @atlas/adapter-io — test/harness/promote-fixtures.ts  (doubles for the governed PROMOTION door)
//
// A `DiskStore` double with a REAL staging side. The shared `makeStoreSpy` (governed-fixtures.ts) answers
// `commitStaging` with `emptyStore()` unconditionally — correct for the emit suites, which are about a door
// that never reads staging, and useless here, where the staging content IS the input. This double therefore
// owns three things that one does not: a seedable staging snapshot, a staging REFUSAL leg (so `unreadable`
// can be distinguished from empty), and a CAS a test can deliberately hole.
//
// The projection side reproduces the real protocol's ORDERING, because two properties depend on it: `put`
// runs before the projection is published, and a decision with no `next` publishes nothing at all.

import { id, asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import { emptyStore, nodeKey } from "@atlas/knowledge"
import type { Candidate, CurrentNode, GroundedFact, StoreProjection } from "@atlas/knowledge"
import type { CommitRefusal } from "../../src/sidecar.js"
import type { DiskStore } from "../../src/store.js"
import type { AtlasPolicy } from "../../src/policy.js"

/** The reserved scope every MINED node carries (`cli/src/mine.ts` `MINED_SCOPE`). Restated as a literal on
 *  purpose: importing it would make this fixture depend on the CLI package, and the value is a governance
 *  constant the promotion door must keep agreeing with — a literal that drifts fails loudly here. */
export const MINED_SCOPE = "atlas:mined"

/** The curator seat `.atlas/policy.json` grants `atlas:mined` to. */
export const CURATOR = "seat:orchestrator"

/** A policy appointing the curator over `atlas:mined`, and `alice` over `core` (the pre-existing governed
 *  scope every emit fixture uses). Two scopes, no overlap — so "authorized here" never means "authorized
 *  there", which is the whole point of the target-authority gate. */
export const CURATOR_POLICY: AtlasPolicy = {
  t0Heuristic: { keywords: [] },
  authz: { scopes: { "atlas:mined": [CURATOR], core: ["alice"] } },
}

/** The SAME policy with `atlas:mined` UNGRANTED — the state `.atlas/policy.json` is in until an admin
 *  appoints a curator. `actorInScope` is fail-closed on an undeclared scope, so every promotion refuses. */
export const NO_CURATOR_POLICY: AtlasPolicy = {
  t0Heuristic: { keywords: [] },
  authz: { scopes: { core: ["alice"] } },
}

/** Build a mined-shaped grounded advisory: `T2`, advisory, grounded, scope `atlas:mined` — the exact shape
 *  `cli/src/mine.ts` stages (class stamped from a constant, `AdvisoryProposal` from the admit gate). */
export function minedFact(opts: {
  anchor: string
  claimNorm: string
  scope?: string
  tier?: GroundedFact["tier"]
}): GroundedFact {
  return {
    kind: "advisory",
    id: asNodeKey(`nk-${opts.anchor}`),
    tier: opts.tier ?? "T2",
    claimNorm: opts.claimNorm,
    grounding: {
      entries: [
        {
          anchor: { kind: "symbol", qualifiedPath: opts.anchor, subtreeHash: asSubtreeHash("sh-mined") },
          path: "src/x.ts",
        },
      ],
    },
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
    scope: opts.scope ?? MINED_SCOPE,
  }
}

/** The identity the DOOR will mint for this fact — `hash(primaryAnchorId ‖ slot[‖ check])`, through the same
 *  frozen seam, with the `predicateSlot → .slot` map applied. A view rebuilt WITHOUT that map computes a
 *  slot-free key that diverges from stored identity (found by E2E, missed by four isolated reviews). */
export const realKey = (f: GroundedFact): string =>
  nodeKey({ ...f, slot: (f as { predicateSlot?: unknown }).predicateSlot } as unknown as Candidate) as unknown as string

export interface PromoteFixture {
  readonly store: DiskStore
  /** Stage a fact the way `mine` does: bytes into CAS FIRST, then a row naming their address. */
  readonly stage: (f: GroundedFact) => CurrentNode
  /** Stage a ROW ONLY — no bytes — the state a pruned/corrupted CAS leaves behind. */
  readonly stageRowWithoutBytes: (f: GroundedFact) => CurrentNode
  /**
   * Stage bytes under an EXPLICIT row key. Needed for the one input whose identity cannot be minted at all:
   * a fact with a degenerate anchor makes `nodeKey` THROW, so no helper that derives the key can build the
   * row. That is not a contrived state — a staged row's key is opaque to promotion (the door re-mints its
   * own from the bytes), so what the sidecar holds is only ever a label, and a label can outlive the
   * groundability of the fact it names.
   */
  readonly stageWithKey: (f: GroundedFact, nodeKey: string) => CurrentNode
  /** Seed the governed PROJECTION directly (the incumbent a promotion will collide with). */
  readonly seedProjection: (rows: readonly CurrentNode[]) => void
  /** Make the staging read REFUSE with this reason instead of returning a snapshot. */
  readonly refuseStaging: (r: CommitRefusal) => void
  /** Every projection snapshot published, in order. */
  readonly persists: () => readonly StoreProjection[]
  /** The latest published projection (or the empty one). */
  readonly projection: () => StoreProjection
  /** Every `put` the store took. */
  readonly puts: () => readonly CasObject[]
}

export function makePromoteFixture(): PromoteFixture {
  const cas = new Map<string, CasObject>()
  const puts: CasObject[] = []
  const persists: StoreProjection[] = []
  let staging: StoreProjection = emptyStore()
  let stagingRefusal: CommitRefusal | undefined

  const store: DiskStore = {
    put(obj) {
      puts.push(obj)
      const h = id(obj)
      cas.set(h as unknown as string, obj)
      return h
    },
    get(h) {
      return cas.get(h as unknown as string)
    },
    commitProjection(decide) {
      const decision = decide(persists.length > 0 ? persists[persists.length - 1]! : emptyStore())
      if (decision.next === undefined) return { settled: true, out: decision.out }
      for (const obj of decision.put ?? []) store.put(obj as CasObject)
      persists.push(decision.next)
      return { settled: true, out: decision.out }
    },
    commitStaging(decide) {
      // The REFUSAL leg, taken BEFORE `decide` runs — exactly as `commitLoop` does: an unreadable sidecar is
      // refused on the way in, so the caller's decision never sees a phantom-empty snapshot.
      if (stagingRefusal !== undefined) return { settled: false, refusal: stagingRefusal }
      const decision = decide(staging)
      // A read-only decision names no `next`; publishing one here would make this double lie about the one
      // property the promotion door depends on (that its staging read writes nothing).
      if (decision.next === undefined) return { settled: true, out: decision.out }
      staging = decision.next
      return { settled: true, out: decision.out }
    },
    persistProjection(p) {
      persists.push(p)
    },
    loadProjection() {
      return persists.length > 0 ? persists[persists.length - 1] : undefined
    },
  }

  const rowWith = (f: GroundedFact, contentHash: string, key: string): CurrentNode => ({
    nodeKey: key,
    family: "advisory",
    contentHash,
    claims: [(f as { claimNorm: string }).claimNorm],
    ...(f.grounding.entries[0] !== undefined
      ? { primaryAnchor: f.grounding.entries[0].anchor.qualifiedPath as unknown as string }
      : {}),
    scope: f.scope as string,
    tier: f.tier,
  })
  const rowFor = (f: GroundedFact, contentHash: string): CurrentNode => rowWith(f, contentHash, realKey(f))

  const addStaged = (row: CurrentNode): CurrentNode => {
    staging = {
      current: new Map([...staging.current, [row.nodeKey, row]]),
      cas: new Set([...staging.cas, row.contentHash]),
    }
    return row
  }

  return {
    store,
    stage(f) {
      const h = store.put(f as unknown as CasObject) as unknown as string
      return addStaged(rowFor(f, h))
    },
    stageWithKey(f, key) {
      const h = store.put(f as unknown as CasObject) as unknown as string
      return addStaged({ ...rowWith(f, h, key) })
    },
    stageRowWithoutBytes(f) {
      // The address is REAL (it is what `id(f)` answers) — only the bytes are missing, which is the state a
      // pruned CAS leaves. A made-up hash would test a different thing (a malformed row).
      return addStaged(rowFor(f, id(f as unknown as CasObject) as unknown as string))
    },
    seedProjection(rows) {
      persists.push({ current: new Map(rows.map((r) => [r.nodeKey, r])), cas: new Set(rows.map((r) => r.contentHash)) })
    },
    refuseStaging(r) {
      stagingRefusal = r
    },
    persists: () => persists,
    projection: () => (persists.length > 0 ? persists[persists.length - 1]! : emptyStore()),
    puts: () => puts,
  }
}
