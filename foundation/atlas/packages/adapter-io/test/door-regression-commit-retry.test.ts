// @atlas/adapter-io — test/door-regression-commit-retry.test.ts  (THE retry-re-runs-the-GATES proof)
//
// A member of the `door-regression-*` family, and for that family's exact reason: the defect here is only
// reachable through the COMPOSED path — mint the identity, read the sidecar off disk, resolve the incumbent
// ROW, read its bytes back out of CAS, publish. Every store below is a REAL `createDiskStore` over a temp
// dir; the truth-gate is the family's single double.
//
// WHAT THIS PINS, AND WHY IT IS THE MOST IMPORTANT CASE IN THE DURABILITY WORK.
//
// Making the durable write atomic is not enough. `commitProjection` re-runs the caller's decision when it
// loses the `link(2)` compare-and-swap — and WHAT it re-runs decides whether that is a security fix or a
// security REGRESSION. The target-derived gates (`governed-emit-incumbent.ts`) are priced against the
// INCUMBENT resolved from the snapshot: its ROW `scope`/`tier` under ADR-0007, falling back to the
// authenticated CAS bytes when the row carries no scope at all. If a retry re-applied the upsert while
// keeping the verdict computed against the OLD snapshot, a writer that lost the race to a billy-ratified T0
// node would have its already-approved T2 write published straight on top of it — the confused deputy that
// whole block exists to close, re-entered through the back door of a retry, and reachable by ORDINARY
// CONTENTION rather than by an attack.
//
// THE INTERFERENCE IS INJECTED AT THE ONE WINDOW THAT MATTERS. `commitSidecar` calls `put` for the
// decision's CAS objects immediately before it links the generation in, so spying on the store's `put`
// places a rival writer exactly between this door's decision and its publication. No sleeps, no timing luck:
// the REAL protocol (real files, real EEXIST, real re-decide) does the rest.
//
// ASSERTIONS COMPARE THE DISCRIMINANT (`reasonOf`), never a substring — see that helper for the measured
// reason: every refusal constant quotes its neighbours by name, so `toContain` cannot tell a downgrade from
// a mention of one.

import { describe, it, expect, afterEach, vi } from "vitest"
import type { Hash } from "@atlas/contracts"
import type { CurrentNode, GroundedFact, StoreProjection } from "@atlas/knowledge"
import { createGovernedEmit } from "../src/governed-emit.js"
import { createGovernedLink } from "../src/governed-link.js"
import { readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import {
  AT,
  HOLDS,
  advisoryFact,
  freshWorkspace,
  hashOf,
  keyOf,
  policyOf,
  reasonOf,
} from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"

/** alice and billy own `core`; mallory owns `other`. */
const POLICY = policyOf({ core: ["alice", "billy"], other: ["mallory"] })
const ANCHOR = "src/auth.ts::verify"

let ws: Workspace | undefined
afterEach(() => {
  ws?.dispose()
  ws = undefined
  vi.restoreAllMocks()
})

/**
 * Run `body` ONCE, the first time this store's `put` is called — i.e. after the door has decided and before
 * it links its generation in. The spy replaces the method in place, which is precisely what the commit's
 * `(o) => store.put(o)` call site resolves at call time.
 */
function interfereAtCommitWindow(store: DiskStore, body: () => void): void {
  let fired = false
  const real = store.put.bind(store)
  vi.spyOn(store, "put").mockImplementation((obj) => {
    if (!fired) {
      fired = true
      body()
    }
    return real(obj)
  })
}

/** Corrupt EVERY file of the projection sidecar family — the generations AND the derived mirror. One
 *  corrupt member is survivable BY DESIGN (the reader falls back a generation); "unreadable" is the state
 *  where nothing parses at all, and only then may a write refuse rather than start from empty. */
function corruptEverySidecarFile(casPath: string): void {
  const dir = dirname(casPath)
  for (const name of readdirSync(dir)) {
    if (/^projection(\.\d+)?\.json$/.test(name)) writeFileSync(join(dir, name), '{ "current": [ truncated', "utf8")
  }
}

/** The durable rows, re-read from disk through a FRESH store — never a value held in memory. */
function rowsOnDisk(casPath: string): StoreProjection {
  return createDiskStore(casPath).loadProjection() ?? { current: new Map(), cas: new Set() }
}

/** The stored fact behind a row, read back out of CAS exactly as the door reads it. */
/** The advisory claim body of a fact, or `undefined` for a predicate. `claimNorm` lives on `AdvisoryNode`
 *  only; `GroundedFact` is the AdvisoryNode|PredicateNode union, so an un-narrowed `.claimNorm` read was
 *  `undefined` at runtime for a predicate and invisible to the compiler. Runtime-identical, now stated. */
function claimNormOf(f: GroundedFact | undefined): string | undefined {
  return f !== undefined && f.kind === "advisory" ? f.claimNorm : undefined
}

function factBehind(casPath: string, row: CurrentNode): GroundedFact | undefined {
  return createDiskStore(casPath).get(row.contentHash as unknown as Hash) as GroundedFact | undefined
}

/**
 * Publish a CARRIER-LESS incumbent — a row with NO `scope`/`tier` properties at all, the shape every node
 * minted before ADR-0007 has — whose CAS bytes ARE present and authoritative.
 *
 * Hand-built on purpose, and it is the only hand-built row in this file: the emit door now STAMPS the
 * carrier on every write, so the product can no longer produce this shape and a test that went through the
 * door could not create the state that the legacy fallback exists to serve. The bytes are put through the
 * real CAS door and the key is the real minted `nodeKey`, so the door resolves it exactly as it would a row
 * that had been sitting in `.atlas/` since before the carrier landed.
 */
function seedLegacyIncumbent(casPath: string, fact: GroundedFact): string {
  const store = createDiskStore(casPath)
  store.put(fact as never)
  const key = keyOf(fact)
  const row = {
    nodeKey: key,
    family: "advisory" as const,
    contentHash: hashOf(fact),
    claims: [claimNormOf(fact) ?? ""],
  }
  store.persistProjection({ current: new Map([[key, row as unknown as CurrentNode]]), cas: new Set([hashOf(fact)]) })
  return key
}

describe("DOOR REGRESSION — a contended retry re-runs the GATES, not just the upsert", () => {
  it("THE CASE: a T0 incumbent appears between snapshot and commit ⇒ the would-be T2 write is REFUSED", () => {
    ws = freshWorkspace()
    const { casPath } = ws
    const victim = createDiskStore(casPath)
    const rival = createDiskStore(casPath)

    // The T2 write. Against the snapshot it reads — an EMPTY store — it is entirely legitimate: no
    // incumbent, no target-derived gate to clear, `route` fast-paths it, and it is APPROVED by the time the
    // interference lands.
    const door = createGovernedEmit({ store: victim, gate: HOLDS, policy: POLICY, actor: "alice" })

    // The rival: billy ratifies a T0 fact at the SAME identity, through the same governed door, taking the
    // generation this write was about to take.
    interfereAtCommitWindow(victim, () => {
      const r = createGovernedEmit({
        store: rival,
        gate: HOLDS,
        policy: POLICY,
        actor: "billy",
        ratifyToken: "billy",
      }).emit(advisoryFact({ anchor: ANCHOR, scope: "core", tier: "T0", claimNorm: "the ratified truth" }), AT)
      expect(r.emitted).toBe(true) // the rival really did land
    })

    const out = door.emit(
      advisoryFact({ anchor: ANCHOR, scope: "core", tier: "T2", claimNorm: "a weaker restatement", gen: 2 }),
      AT,
    )

    // THE ASSERTION. Without the gate re-run this is `{emitted:true}` and the T0 row is gone.
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.emitted === false ? out.rejected : undefined)).toBe("governance-downgrade")

    // …and the durable store still holds the RIVAL's T0 fact, unmutated.
    const rows = [...rowsOnDisk(casPath).current.values()]
    expect(rows.length).toBe(1)
    expect(rows[0]!.tier).toBe("T0") // the ADR-0007 carrier on the row
    expect(claimNormOf(factBehind(casPath, rows[0]!))).toBe("the ratified truth")
  })

  it("THE LEGACY CASE: the incumbent that appears is CARRIER-LESS, so the class comes from its BYTES", () => {
    // The combination neither the durability work nor the carrier work had tested on its own: a retry whose
    // re-run verdict depends on the ADR-0007 legacy fallback. The incumbent that lands mid-commit carries NO
    // `scope`/`tier` on its row, so `incumbentRefusal` must take the fallback path — authority AND class
    // from the authenticated CAS bytes — and still refuse the downgrade. If the retry re-used the stale
    // verdict, or if it re-ran the gates but resolved the class from the absent row field, a T0 node minted
    // before the carrier existed would be silently overwritten by a T2 write. `strictestTier(undefined, …)`
    // would fail closed to T0 and merely LOOK right here, which is why the control case below matters: it
    // proves a legacy T2 incumbent does NOT block an equal-class write.
    ws = freshWorkspace()
    const { casPath } = ws
    const victim = createDiskStore(casPath)
    const legacyT0 = advisoryFact({
      anchor: ANCHOR,
      scope: "core",
      tier: "T0",
      claimNorm: "ratified before the carrier existed",
    })

    const door = createGovernedEmit({ store: victim, gate: HOLDS, policy: POLICY, actor: "alice" })
    interfereAtCommitWindow(victim, () => {
      const key = seedLegacyIncumbent(casPath, legacyT0)
      const row = rowsOnDisk(casPath).current.get(key)!
      expect(row.scope).toBeUndefined() // the shape under test: genuinely carrier-less
      expect(row.tier).toBeUndefined()
    })

    const out = door.emit(
      advisoryFact({ anchor: ANCHOR, scope: "core", tier: "T2", claimNorm: "a weaker restatement", gen: 2 }),
      AT,
    )

    expect(out.emitted).toBe(false)
    expect(reasonOf(out.emitted === false ? out.rejected : undefined)).toBe("governance-downgrade")
    const rows = [...rowsOnDisk(casPath).current.values()]
    expect(rows.length).toBe(1)
    expect(claimNormOf(factBehind(casPath, rows[0]!))).toBe("ratified before the carrier existed")
  })

  it("CONTROL (legacy): a carrier-less T2 incumbent does NOT block an equal-class write on the retry", () => {
    // The other half of the legacy case: proving the refusal above came from the BYTES' T0 and not from
    // `undefined` collapsing to T0. A legacy T2 incumbent must take the retried T2 write.
    ws = freshWorkspace()
    const { casPath } = ws
    const victim = createDiskStore(casPath)
    const legacyT2 = advisoryFact({ anchor: ANCHOR, scope: "core", tier: "T2", claimNorm: "an ordinary legacy claim" })

    const door = createGovernedEmit({ store: victim, gate: HOLDS, policy: POLICY, actor: "alice" })
    interfereAtCommitWindow(victim, () => void seedLegacyIncumbent(casPath, legacyT2))

    const out = door.emit(
      advisoryFact({ anchor: ANCHOR, scope: "core", tier: "T2", claimNorm: "the retried write", gen: 2 }),
      AT,
    )
    expect(out.emitted).toBe(true)
    // and the retry LANDED ON the legacy row rather than over it — the claim set is the union.
    const rows = [...rowsOnDisk(casPath).current.values()]
    expect(rows.length).toBe(1)
    expect([...rows[0]!.claims].sort()).toEqual(["an ordinary legacy claim", "the retried write"])
  })

  it("the RELOCATION/AUTHORITY gate is re-run too: a rival plants the node in another scope ⇒ REFUSED", () => {
    // "Re-run the decision" has to mean ALL of it, not just the tier comparison. mallory owns `other`;
    // alice owns `core`; neither may move a node between them, and alice has no authority over a node that
    // now lives in `other`.
    ws = freshWorkspace()
    const { casPath } = ws
    const victim = createDiskStore(casPath)
    const rival = createDiskStore(casPath)
    const door = createGovernedEmit({
      store: victim,
      gate: HOLDS,
      policy: POLICY,
      actor: "alice",
      ratifyToken: "billy",
    })

    interfereAtCommitWindow(victim, () => {
      const r = createGovernedEmit({
        store: rival,
        gate: HOLDS,
        policy: POLICY,
        actor: "mallory",
        ratifyToken: "billy",
      }).emit(advisoryFact({ anchor: ANCHOR, scope: "other", tier: "T2", claimNorm: "mine now" }), AT)
      expect(r.emitted).toBe(true)
    })

    const out = door.emit(
      advisoryFact({ anchor: ANCHOR, scope: "core", tier: "T2", claimNorm: "alice speaks", gen: 2 }),
      AT,
    )
    expect(out.emitted).toBe(false)
    // alice is in no scope of the node as it NOW stands, so the first target-derived gate she fails is
    // authority over the target — the disclosure ordering is unchanged by the retry, and `unauthorized for
    // target` is exactly the reason a caller with no authority is entitled to. Pinned as a DISCRIMINANT:
    // `unverifiable target` mentions this string in its own prose, so a substring assertion would accept the
    // storage-oracle downgrade this ADR-0007 line of work exists to prevent.
    expect(reasonOf(out.emitted === false ? out.rejected : undefined)).toBe("unauthorized for target")
    expect([...rowsOnDisk(casPath).current.values()][0]!.scope).toBe("other") // mallory's node, untouched
  })

  it("CONTROL: when the rival write does NOT change the verdict, the retry SUCCEEDS (no over-refusal)", () => {
    // The fix must not turn contention into failure. A rival writing a DIFFERENT node moves the snapshot
    // without touching this write's incumbent, so the re-run decision stands and both facts survive.
    ws = freshWorkspace()
    const { casPath } = ws
    const victim = createDiskStore(casPath)
    const rival = createDiskStore(casPath)

    interfereAtCommitWindow(victim, () => {
      const r = createGovernedEmit({ store: rival, gate: HOLDS, policy: POLICY, actor: "alice" }).emit(
        advisoryFact({ anchor: "src/other.ts::helper", scope: "core", claimNorm: "a neighbour" }),
        AT,
      )
      expect(r.emitted).toBe(true)
    })

    const out = createGovernedEmit({ store: victim, gate: HOLDS, policy: POLICY, actor: "alice" }).emit(
      advisoryFact({ anchor: ANCHOR, scope: "core", claimNorm: "the original write" }),
      AT,
    )
    expect(out.emitted).toBe(true)
    // BOTH landed: the loser retried and applied its decision TO the winner's projection, not over it.
    expect(rowsOnDisk(casPath).current.size).toBe(2)
  })
  // ── THE COMMIT'S OWN REFUSALS, AT THE DOORS ────────────────────────────────────────────────────────────
  //
  // `sidecar.test.ts` pins the PROTOCOL's two-valued verdict (`refusal: 'contended' | 'unreadable'`). What is
  // only checkable HERE is the MAPPING each door applies to it — a one-line ternary per door. Swap either one
  // and every protocol test stays green while the door tells an operator to restore a perfectly healthy
  // store, or to simply retry an unreadable one. One case per door catches that door's swap, because a swap
  // makes the tested branch return the OTHER reason.

  it("EMIT: an unreadable sidecar comes back as the `unreadable store` reason, not as `contended`", () => {
    ws = freshWorkspace()
    const { casPath } = ws
    const store = createDiskStore(casPath)
    store.commitProjection((p) => ({ out: 0, next: p })) // publish a generation, so a sidecar EXISTS
    corruptEverySidecarFile(casPath)
    const out = createGovernedEmit({ store, gate: HOLDS, policy: POLICY, actor: "alice" }).emit(
      advisoryFact({ anchor: ANCHOR, scope: "core", claimNorm: "anything" }),
      AT,
    )
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.emitted === false ? out.rejected : undefined)).toBe("unreadable store")
  })

  it("LINK: an unreadable sidecar comes back as the `unreadable store` reason, not as `contended`", () => {
    ws = freshWorkspace()
    const { casPath } = ws
    const store = createDiskStore(casPath)
    const emit = createGovernedEmit({ store, gate: HOLDS, policy: POLICY, actor: "alice" })
    const a = advisoryFact({ anchor: "src/a.ts::one", scope: "core", claimNorm: "alpha" })
    const b = advisoryFact({ anchor: "src/b.ts::two", scope: "core", claimNorm: "beta" })
    expect(emit.emit(a, AT).emitted).toBe(true)
    expect(emit.emit(b, AT).emitted).toBe(true)
    corruptEverySidecarFile(casPath)
    const out = createGovernedLink({ store, policy: POLICY, actor: "alice", ratifyToken: "billy" }).link(
      keyOf(a),
      keyOf(b),
    )
    expect(out.linked).toBe(false)
    // NOT `unknown node`: the commit refuses BEFORE the endpoints are resolved, which is the honest answer.
    // "This store cannot be read" is a different fact from "these nodes do not exist", and reporting the
    // latter over an unreadable store is exactly how a corrupt sidecar starts reading as an empty one.
    expect(reasonOf(out.linked === false ? out.rejected : undefined)).toBe("unreadable store")
  })

  it("EMIT: exhausted contention comes back as the `contended` reason, and NOTHING is written", () => {
    ws = freshWorkspace()
    const { casPath } = ws
    const store = createDiskStore(casPath)
    const rival = createDiskStore(casPath)
    // A rival that publishes on EVERY attempt, from inside the commit window, so all 64 attempts lose.
    let n = 0
    const real = store.put.bind(store)
    vi.spyOn(store, "put").mockImplementation((obj) => {
      rival.persistProjection({ current: new Map(rival.loadProjection()?.current ?? []), cas: new Set() })
      n++
      return real(obj)
    })
    const out = createGovernedEmit({ store, gate: HOLDS, policy: POLICY, actor: "alice" }).emit(
      advisoryFact({ anchor: ANCHOR, scope: "core", claimNorm: "never lands" }),
      AT,
    )
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.emitted === false ? out.rejected : undefined)).toBe("contended")
    expect(n).toBe(64) // every attempt was made and every one lost — bounded, then a VISIBLE refusal
    expect(rowsOnDisk(casPath).current.size).toBe(0) // the refused write left no row behind
  }, 60_000)
})
