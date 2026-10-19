import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { build } from "@atlas/index"
import { upsert, emptyStore } from "@atlas/knowledge"
import type { StoreProjection, WriteRequest } from "@atlas/knowledge"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import { createProjectionQueryIndex } from "../src/projection-query-index.js"
import { createOwnLeg } from "../src/own-source.js"
import { defaultPolicy } from "../src/policy.js"
import { buildRetrievalModel } from "../src/retrieval-model.js"
import { createAwarenessStore } from "../src/awareness-store.js"
import { walkFileTree } from "../src/fs.js"
import { readScip } from "../src/scip.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip } from "./harness/fix-scip.js"

let tmp: string | undefined
let cleanup: (() => void) | undefined
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
  cleanup?.()
  cleanup = undefined
})

const structuralStub = {
  cover: () => ({ territory: "the-territory", axisHash: "axhash" as never, invariants: [], stale: false }),
}

function freshStore(): DiskStore {
  tmp = mkdtempSync(join(tmpdir(), "atlas-retired-"))
  return createDiskStore(join(tmp, "cas"))
}

function emitProj(
  store: DiskStore,
  proj: StoreProjection,
  fact: { kind: "advisory"; tier: string; freshness: string; body: string; authoring: string },
  req: Omit<WriteRequest, "contentHash">,
): StoreProjection {
  const contentHash = store.put(fact as never) as string
  return upsert(proj, { ...req, contentHash }).store
}

describe("retired read points", () => {
  it("scope pack excludes retired", () => {
    const store = freshStore()
    let proj = emptyStore()
    proj = emitProj(
      store,
      proj,
      { kind: "advisory", tier: "T1", freshness: "FRESH", body: "k:live", authoring: "ADVISORY" },
      { nodeKey: "k:live", family: "advisory", claimNorm: "live", primaryAnchor: "src::mod", slot: "invariant" },
    )
    proj = emitProj(
      store,
      proj,
      { kind: "advisory", tier: "T1", freshness: "FRESH", body: "k:retired", authoring: "SUPERSEDED" },
      { nodeKey: "k:retired", family: "advisory", claimNorm: "retired", primaryAnchor: "src::mod", slot: "invariant" },
    )
    store.persistProjection(proj)
    const ids = createProjectionQueryIndex(structuralStub as never, store).cover("src").invariants.map((i: { nodeId: string }) => i.nodeId)
    expect(ids).toEqual(["k:live"])
  })

  it("own bands exclude retired", () => {
    const repo = makeFixRepo()
    const scip = makeFixScip()
    cleanup = () => {
      repo.cleanup()
      scip.cleanup()
    }
    const axes = build(walkFileTree(repo.repoPath), readScip(scip.scipPath))
    const store = createDiskStore(`${repo.repoPath}/.atlas-cas`)
    const ANCHOR = "src/app.ts"
    interface Seed {
      key: string
      tier: string
      slot: "invariant" | "gotcha"
      claim: string
      authoring: string
    }
    const seeds: readonly Seed[] = [
      { key: "k:T1", tier: "T1", slot: "invariant", claim: "t1 claim", authoring: "ADVISORY" },
      { key: "k:T1r", tier: "T1", slot: "invariant", claim: "t1r claim", authoring: "SUPERSEDED" },
      { key: "k:T2", tier: "T2", slot: "gotcha", claim: "t2 claim", authoring: "ADVISORY" },
      { key: "k:T2r", tier: "T2", slot: "gotcha", claim: "t2r claim", authoring: "SUPERSEDED" },
    ]
    let proj = emptyStore()
    for (const s of seeds) {
      const contentHash = store.put({ kind: "advisory", tier: s.tier, freshness: "FRESH", body: s.key, authoring: s.authoring } as never) as string
      proj = upsert(proj, { nodeKey: s.key, family: "advisory", claimNorm: s.claim, primaryAnchor: ANCHOR, slot: s.slot, contentHash }).store
    }
    store.persistProjection(proj)
    const leg = createOwnLeg({ axes, store, policy: defaultPolicy() })
    const pack = leg(ANCHOR).pack
    expect(pack.invariants.map((i: { nodeId: string }) => i.nodeId)).toEqual(["k:T1"])
    expect(pack.advisory.map((i: { nodeId: string }) => i.nodeId)).toEqual(["k:T2"])
  })

  it("dependency read excludes retired", () => {
    const repo = makeFixRepo()
    const scip = makeFixScip()
    cleanup = () => {
      repo.cleanup()
      scip.cleanup()
    }
    const casPath = `${repo.repoPath}/.atlas-cas`
    const axes = build(walkFileTree(repo.repoPath), readScip(scip.scipPath))
    const store = createDiskStore(casPath)
    let proj = emptyStore()
    const utilHash = store.put({ kind: "advisory", tier: "T1", freshness: "FRESH", body: "k:util", authoring: "ADVISORY" } as never) as string
    proj = upsert(proj, { nodeKey: "k:util", family: "advisory", claimNorm: "util base", primaryAnchor: "src/util.ts", slot: "invariant", contentHash: utilHash }).store
    const appHash = store.put({ kind: "advisory", tier: "T1", freshness: "FRESH", body: "k:app", authoring: "ADVISORY" } as never) as string
    proj = upsert(proj, { nodeKey: "k:app", family: "advisory", claimNorm: "app claim", primaryAnchor: "src/app.ts", slot: "invariant", contentHash: appHash }).store
    const appRHash = store.put({ kind: "advisory", tier: "T1", freshness: "FRESH", body: "k:appR", authoring: "SUPERSEDED" } as never) as string
    proj = upsert(proj, { nodeKey: "k:appR", family: "advisory", claimNorm: "appR claim", primaryAnchor: "src/app.ts", slot: "invariant", contentHash: appRHash }).store
    store.persistProjection(proj)
    const model = buildRetrievalModel(axes, store)
    expect(model.store.has(appRHash as never)).toBe(false)
    expect(model.store.has(appHash as never)).toBe(true)
    const blast = model.blastRadius.get("src/util.ts") as readonly string[] | undefined
    expect(blast).toContain(appHash)
    expect(blast).not.toContain(appRHash)
  })

  it("constitution facet excludes retired", () => {
    const repo = mkdtempSync(join(tmpdir(), "atlas-retired-aware-"))
    tmp = repo
    const store = createDiskStore(join(repo, ".atlas", "cas"))
    let proj = emptyStore()
    const liveHash = store.put({ kind: "advisory", tier: "T0", freshness: "FRESH", body: "claim:live", authoring: "ADVISORY" } as never) as string
    proj = upsert(proj, { nodeKey: "claim:live", contentHash: liveHash, family: "advisory", claimNorm: "live T0 claim", tier: "T0" }).store
    const goneHash = store.put({ kind: "advisory", tier: "T0", freshness: "FRESH", body: "claim:gone", authoring: "SUPERSEDED" } as never) as string
    proj = upsert(proj, { nodeKey: "claim:gone", contentHash: goneHash, family: "advisory", claimNorm: "retired T0 claim", tier: "T0" }).store
    store.persistProjection(proj)
    expect(createAwarenessStore(repo).read().constitution.content).toBe("constitution: 1 ratified T0 invariant(s)")
  })
})
