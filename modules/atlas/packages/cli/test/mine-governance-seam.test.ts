// @atlas/cli — test/mine-governance-seam.test.ts  (ARCH-10 / ADR-0010 vs the mine → genesis write seam)
//
// `run-controller.ts:83` drives writes through its OWN injected `upsert` port, which `mine.ts` assembles —
// NOT through `governed-emit.ts`. The ARCH-10 incumbent guard landed at `55d826a` inside the `@atlas/knowledge`
// reducer, and the commit message says of this seam: "`mine` and `genesis` reach knowledge by other paths
// today". "Today" is the word that has been wrong twice on this branch, so the question is settled here BY
// EXECUTION: can a mined `T2` row displace or SHADOW a governed node through this path?
//
// THE ANSWER IS NO, and the reason is worth stating precisely because it is NOT the guard. Three independent
// things stand between a mined candidate and a governed node, and the first one alone is sufficient:
//   1. DESTINATION (ADR-0008, structural) — `mine` writes the STAGING sidecar. `staging.json` and
//      `projection.json` are different files, and NO read door in the product reads staging back at all
//      (task #83 deleted `loadStaging`; nothing replaced it). Displacement is impossible because the row
//      never enters the projection, not because a check says no.
//   2. THE COLLISION SKIP (belt-and-braces) — a mined fact never re-authors a node established before the
//      pass began, even inside staging.
//   3. THE ARCH-10 REDUCER GUARD (belt-and-braces) — if the mined write DID land on a governance-carrying
//      incumbent, `upsert` throws `governance-relocation`, because a mined request declares `atlas:mined`
//      and the incumbent declares its own scope. Proven below against the real reducer.
//
// What the collision case DID find is a gap in leg 3: mine's `WriteRequest` carried NEITHER governance half,
// so every staged row recorded no `scope` and no `tier` at all — while `mine.ts` claims the stamp makes "the
// bytes and the row agree" and ADR-0008 records that mining "stamped its rows with a reserved scope". The
// stamp reached only the CAS bytes. Pinned below.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { id } from "@atlas/kernel"
import { createDiskStore } from "@atlas/adapter-io"
import type { DiskStore } from "@atlas/adapter-io"
import { nodeKey, primaryAnchorId, upsert as knowledgeUpsert, GovernanceAuthorityError } from "@atlas/knowledge"
import type { CurrentNode, StoreProjection, WriteRequest, Candidate as KnowledgeCandidate } from "@atlas/knowledge"
import type { Fact } from "@atlas/genesis"
import { driveMine, MINED_SCOPE } from "../src/mine.js"
import { A, FRONTIER, REPO, budget, depsOf, factFor, readStaging } from "./mine-fixtures.js"

let dir: string | undefined
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atlas-mine-gov-"))
})
afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

const casPath = (): string => join(dir!, ".atlas", "cas")
const projectionFile = (): string => join(dir!, ".atlas", "projection.json")

/** The nodeKey a mine pass MINTS for site `A` — recomputed with the frozen formula over the same view
 *  `mine.ts` builds (`slot` mapped off `predicateSlot`), so the collision below is GUARANTEED, not hoped for. */
function mintedKeyForA(): string {
  const f = factFor({ site: A } as never, "probe")
  return nodeKey({
    ...f,
    slot: (f as { predicateSlot?: unknown }).predicateSlot,
  } as unknown as KnowledgeCandidate) as unknown as string
}

/** A governed node sitting at EXACTLY that key, carrying both ADR-0007 governance halves. */
function governedAt(key: string): CurrentNode {
  return {
    nodeKey: key,
    family: "advisory",
    contentHash: "g".repeat(64),
    claims: ["the billy-ratified T0 invariant"],
    tier: "T0",
    scope: "team:core",
  }
}

describe("ARCH-10 seam — a mined T2 row cannot displace a governed node at a COLLIDING nodeKey", () => {
  it("the governed projection is byte-identical and the T0 row is untouched, at a real key collision", () => {
    const store = createDiskStore(casPath())
    const key = mintedKeyForA()
    const governed = governedAt(key)
    store.persistProjection({ current: new Map([[key, governed]]), cas: new Set([governed.contentHash]) })
    const before = readFileSync(projectionFile(), "utf8")

    const report = driveMine(REPO, depsOf({ store, budget: budget(FRONTIER.length) }))
    expect(report.seeded.length).toBe(FRONTIER.length) // premise: this pass really did mine

    // 1 — the DESTINATION property. Two files; the governed one is not written at all.
    expect(readFileSync(projectionFile(), "utf8")).toBe(before)
    expect(store.loadProjection()!.current.get(key)).toEqual(governed)
    expect([...store.loadProjection()!.current.keys()]).toEqual([key])
    // the collision is REAL: the mined row exists, at the very same key, in the other file.
    expect(existsSync(join(dir!, ".atlas", "staging.json"))).toBe(true)
    const staged = readStaging(store).current.get(key)
    expect(staged, "the mine pass must have staged a row at the colliding key").toBeDefined()
    expect(staged!.contentHash).not.toBe(governed.contentHash) // different bytes, same identity
    expect(staged!.claims).not.toEqual(governed.claims)
  })

  it("TEETH — a store whose staging doors ALIAS the projection lets the candidates into governed knowledge", () => {
    // The mutant that proves the case above is about a real property and not about an arbitrary path: point
    // the staging family at the projection family (the one-line change `store.ts` names as the killable
    // mutant) and the governed file is rewritten by a mine pass. The T0 row itself still survives — that is
    // leg 2, the collision skip, doing its job — so the assertion is on the FILE, which is what ADR-0008
    // actually promises: mine does not write here at all.
    const real = createDiskStore(casPath())
    const aliased: DiskStore = {
      ...real,
      put: (o) => real.put(o),
      get: (h) => real.get(h),
      // The mutant is now EXACTLY one line, because `commitStaging` is the only staging door there is.
      commitStaging: (d) => real.commitProjection(d),
    }
    const key = mintedKeyForA()
    real.persistProjection({ current: new Map([[key, governedAt(key)]]), cas: new Set(["g".repeat(64)]) })
    const before = readFileSync(projectionFile(), "utf8")

    driveMine(REPO, depsOf({ store: aliased, budget: budget(FRONTIER.length) }))
    expect(readFileSync(projectionFile(), "utf8")).not.toBe(before) // the mutant DOES reach governed bytes
    expect(real.loadProjection()!.current.size).toBeGreaterThan(1) //  mined candidates are now knowledge
  })

  it("leg 3, measured: mine's OWN request shape onto a governance-carrying incumbent is REFUSED", () => {
    // If the destination ever changed back, the reducer guard is what would catch it. Asserted on the
    // ERROR'S DISCRIMINANT (`.reason`), never on a substring of the prose — the refusal texts in this repo
    // quote each other by name, so `toContain('governance-relocation')` is also satisfied by the downgrade
    // message. Built from the SAME fields `mine.ts` puts in its `WriteRequest`.
    const key = mintedKeyForA()
    const f = { ...factFor({ site: A } as never, "a mined claim"), scope: MINED_SCOPE } as unknown as Fact
    const view = { ...f, slot: (f as { predicateSlot?: unknown }).predicateSlot } as unknown as KnowledgeCandidate
    const req: WriteRequest = {
      nodeKey: key,
      contentHash: id(f as never) as unknown as string,
      family: "advisory",
      claimNorm: "a mined claim",
      primaryAnchor: primaryAnchorId(view) as unknown as string,
      scope: MINED_SCOPE,
    }
    const governedStore: StoreProjection = {
      current: new Map([[key, governedAt(key)]]),
      cas: new Set(["g".repeat(64)]),
    }

    let reason: string | undefined
    try {
      knowledgeUpsert(governedStore, req)
    } catch (e) {
      reason = e instanceof GovernanceAuthorityError ? e.reason : `<not a GovernanceAuthorityError: ${String(e)}>`
    }
    expect(reason).toBe("governance-relocation")
  })
})

describe("ADR-0008 provenance — the mined stamp reaches the ROW, not only the CAS bytes", () => {
  it("every staged row records `scope: atlas:mined` and the candidate tier `T2`", () => {
    // RED at 55d826a: mine's `WriteRequest` omitted both governance halves, so `governanceOf(req)` stamped
    // nothing and every staged row came back with `scope: undefined` / `tier: undefined` — measured, not
    // inferred. The stamp existed only inside `id(f)`'s bytes. That makes the reserved-scope fail-closed
    // default (`actorInScope` denies for `atlas:mined`) unreachable from the row a promoter would read, and
    // it makes the ARCH-10 reducer guard inert for every future writer into staging: a row that declares no
    // governance grants no authority to derive from.
    const store = createDiskStore(casPath())
    driveMine(REPO, depsOf({ store, budget: budget(FRONTIER.length) }))

    const rows = [...readStaging(store).current.values()]
    expect(rows.length).toBe(FRONTIER.length) // premise
    for (const row of rows) {
      expect(row.scope, `row ${row.nodeKey} carries no mined scope`).toBe(MINED_SCOPE)
      expect(row.tier, `row ${row.nodeKey} carries no candidate tier`).toBe("T2")
    }
  })

  it("the stamp survives the sidecar round-trip (it is durable, not an in-memory artefact)", () => {
    const store = createDiskStore(casPath())
    driveMine(REPO, depsOf({ store, budget: budget(FRONTIER.length) }))
    // read back through a FRESH store — the value must come off disk, not out of a live closure.
    const reread = readStaging(createDiskStore(casPath()))
    for (const row of reread.current.values()) expect(row.scope).toBe(MINED_SCOPE)
  })
})
