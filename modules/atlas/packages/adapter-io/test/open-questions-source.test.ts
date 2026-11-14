import { afterEach, describe, expect, it } from "vitest"
import { dirname, join } from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"
import { makeFixRepo } from "./harness/fix-repo.js"
import { upsert, emptyStore } from "@atlas/knowledge"
import type { PredicateSlot } from "@atlas/knowledge"
import type { Tier } from "@atlas/contracts"
import { createDiskStore } from "../src/store.js"
import { interviewOf, openQuestionsOf } from "../src/open-questions-source.js"
import { runGit } from "../src/run-git.js"

describe("open-questions-source", () => {
  let repo: ReturnType<typeof makeFixRepo>
  afterEach(() => {
    repo?.cleanup()
  })

  it("feeds deriveOpenQuestions from the store", () => {
    repo = makeFixRepo()
    mkdirSync(join(repo.repoPath, ".atlas"), { recursive: true })
    writeFileSync(join(repo.repoPath, ".atlas", "policy.json"), '{"t0Heuristic":{"keywords":[]},"authz":{"scopes":{"packages/b":["alice"]}}}')
    stageFacts(repo.repoPath, [
      { nodeKey: "k1", tier: "T2", claimNorm: "x holds", anchor: "packages/a/src/x.ts::f", slot: "invariant", authoring: "ADVISORY" },
      { nodeKey: "k2", tier: "T2", claimNorm: "y is retired", anchor: "packages/a/src/y.ts::g", slot: "invariant", authoring: "SUPERSEDED" },
      { nodeKey: "k3", tier: "T2", claimNorm: "b is for z", anchor: "packages/b/src/z.ts", slot: "rationale", authoring: "ADVISORY" },
    ])

    const qs = openQuestionsOf(repo.repoPath, new Set())
    expect(qs.filter((q) => q.kind === "tier").map((q) => q.subject)).toEqual(["k1"])
    const tierQ = qs.find((q) => q.kind === "tier")
    expect(tierQ?.site.qualifiedPath).toBe("packages/a/src/x.ts")
    expect(qs.filter((q) => q.kind === "owner").map((q) => q.subject)).toEqual(["packages/a"])
    expect(qs.find((q) => q.kind === "owner")?.options).toEqual(["seat:orchestrator", "a person on the team", "nobody yet"])
    expect(qs.filter((q) => q.kind === "intent").map((q) => q.subject)).toEqual(["packages/a"])
    for (const q of qs) expect(q.rank).toBe(0)
    expect(openQuestionsOf(repo.repoPath, new Set([tierQ!.id])).some((q) => q.kind === "tier")).toBe(false)
    // interviewOf reads the same store by default: one batch, no review log yet, so nothing is drafted or deferred.
    const interview = interviewOf(repo.repoPath)
    expect([interview.batch.map((q) => q.id).sort(), interview.deferred]).toEqual([qs.map((q) => q.id).sort(), 0])
  })

  it("offers only distinct sorted authors of the unit's fact files and changes only options as authors change", () => {
    repo = makeFixRepo()
    const commit = (author: string, file: string, content: string) => {
      mkdirSync(dirname(join(repo.repoPath, file)), { recursive: true })
      writeFileSync(join(repo.repoPath, file), content)
      runGit(repo.repoPath, ["add", "--", file])
      runGit(repo.repoPath, ["-c", `user.name=${author}`, "-c", `user.email=${author}@atlas.test`, "commit", "-q", "-m", `${author} changes ${file}`])
    }
    commit("author-z", "packages/a/src/x.ts", "export const x = 1\n")
    commit("author-a", "packages/a/src/y.ts", "export const y = 1\n")
    commit("author-a", "packages/a/src/x.ts", "export const x = 2\n")
    commit("unrelated-author", "packages/b/src/z.ts", "export const z = 1\n")
    stageFacts(repo.repoPath, [
      { nodeKey: "k1", tier: "T2", claimNorm: "x holds", anchor: "packages/a/src/x.ts::f", slot: "invariant", authoring: "ADVISORY" },
      { nodeKey: "k2", tier: "T2", claimNorm: "y holds", anchor: "packages/a/src/y.ts::g", slot: "invariant", authoring: "ADVISORY" },
    ])

    const before = openQuestionsOf(repo.repoPath, new Set())
    expect(before.filter((q) => q.kind === "owner").map((q) => q.subject)).toEqual(["packages/a"])
    expect(before.find((q) => q.kind === "owner")?.options).toEqual([
      "author-a", "author-z", "seat:orchestrator", "a person on the team", "nobody yet",
    ])

    commit("author-m", "packages/a/src/x.ts", "export const x = 3\n")
    const after = openQuestionsOf(repo.repoPath, new Set())
    expect(after).toEqual(before.map((q) => q.kind === "owner" ? {
      ...q,
      options: ["author-a", "author-m", "author-z", "seat:orchestrator", "a person on the team", "nobody yet"],
    } : q))
  })
})

function stageFacts(
  repoPath: string,
  rows: readonly { nodeKey: string; tier: Tier; claimNorm: string; anchor: string; slot: PredicateSlot; authoring: string }[],
) {
  const store = createDiskStore(join(repoPath, ".atlas", "cas"))
  let proj = emptyStore()
  for (const row of rows) {
    const contentHash = store.put({ kind: "advisory", tier: row.tier, claimNorm: row.claimNorm, authoring: row.authoring } as never) as string
    const result = upsert(proj, { nodeKey: row.nodeKey, contentHash, family: "advisory", claimNorm: row.claimNorm, primaryAnchor: row.anchor, slot: row.slot, tier: row.tier })
    proj = result.store
  }
  store.persistProjection(proj)
}
