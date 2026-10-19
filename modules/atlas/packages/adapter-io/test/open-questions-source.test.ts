import { afterEach, describe, expect, it } from "vitest"
import { join } from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { makeFixRepo } from "./harness/fix-repo.js"
import { upsert, emptyStore } from "@atlas/knowledge"
import { createDiskStore } from "../src/store.js"
import { openQuestionsOf } from "../src/open-questions-source.js"

describe("open-questions-source", () => {
  let repo: ReturnType<typeof makeFixRepo>
  afterEach(() => {
    repo?.cleanup()
  })

  it("feeds deriveOpenQuestions from the store", () => {
    repo = makeFixRepo()
    mkdirSync(join(repo.repoPath, ".atlas"), { recursive: true })
    writeFileSync(join(repo.repoPath, ".atlas", "policy.json"), '{"t0Heuristic":{"keywords":[]},"authz":{"scopes":{"packages/b":["alice"]}}}')
    const store = createDiskStore(join(repo.repoPath, ".atlas", "cas"))
    let proj = emptyStore()
    const rows = [
      { nodeKey: "k1", tier: "T2", claimNorm: "x holds", anchor: "packages/a/src/x.ts::f", slot: "invariant", authoring: "ADVISORY" },
      { nodeKey: "k2", tier: "T2", claimNorm: "y is retired", anchor: "packages/a/src/y.ts::g", slot: "invariant", authoring: "SUPERSEDED" },
      { nodeKey: "k3", tier: "T2", claimNorm: "b is for z", anchor: "packages/b/src/z.ts", slot: "rationale", authoring: "ADVISORY" },
    ]
    for (const row of rows) {
      const contentHash = store.put({ kind: "advisory", tier: row.tier, claimNorm: row.claimNorm, authoring: row.authoring } as never) as string
      const result = upsert(proj, { nodeKey: row.nodeKey, contentHash, family: "advisory", claimNorm: row.claimNorm, primaryAnchor: row.anchor, slot: row.slot, tier: row.tier })
      proj = result.store
    }
    store.persistProjection(proj)

    const qs = openQuestionsOf(repo.repoPath, new Set())
    expect(qs.filter((q) => q.kind === "tier").map((q) => q.subject)).toEqual(["k1"])
    const tierQ = qs.find((q) => q.kind === "tier")
    expect(tierQ?.site.qualifiedPath).toBe("packages/a/src/x.ts")
    expect(qs.filter((q) => q.kind === "owner").map((q) => q.subject)).toEqual(["packages/a"])
    expect(qs.filter((q) => q.kind === "intent").map((q) => q.subject)).toEqual(["packages/a"])
    for (const q of qs) expect(q.rank).toBe(0)
    expect(openQuestionsOf(repo.repoPath, new Set([tierQ!.id])).some((q) => q.kind === "tier")).toBe(false)
  })
})
