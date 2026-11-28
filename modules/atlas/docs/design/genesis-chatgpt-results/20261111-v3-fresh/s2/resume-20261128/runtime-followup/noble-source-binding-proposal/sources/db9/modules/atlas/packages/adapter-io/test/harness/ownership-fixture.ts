import { copyFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { build } from "@atlas/index"
import { asNodeKey, id } from "@atlas/kernel"
import type { OwnershipArtifact, OwnershipContract, OwnershipManifest, OwnershipReceipt, OwnershipResult, OwnershipReview } from "@atlas/knowledge"
import { composeRuntime } from "../../src/compose.js"
import { ownershipClaim } from "../../src/ownership-access.js"
import { ownershipInput } from "../../src/ownership-input.js"
import { createDiskStore } from "../../src/store.js"
import { walkFileTree } from "../../src/fs.js"
import { readScip } from "../../src/scip.js"
import { makeFixRepo } from "./fix-repo.js"
import { makeFixScip } from "./fix-scip.js"

/** Real disk, git-visible inputs, policy, index and composed truth gate. Review fixtures are NOT judge evidence. */
export function ownershipFixture() {
  const repo = makeFixRepo()
  const scip = makeFixScip()
  mkdirSync(join(repo.repoPath, ".atlas"), { recursive: true })
  writeFileSync(join(repo.repoPath, ".atlas", "policy.json"), JSON.stringify({
    t0Heuristic: { keywords: [] }, authz: { scopes: { core: [process.env.ATLAS_ACTOR ?? "alice"], independent: [process.env.ATLAS_ACTOR ?? "alice"] } },
  }))
  copyFileSync(scip.scipPath, join(repo.repoPath, ".atlas", "index.scip"))
  const store = createDiskStore(join(repo.repoPath, ".atlas", "cas"))
  const current = (key: string) => ownershipInput(repo.repoPath, key)
  const contract: OwnershipContract = { kind: "ownership-contract", version: 1, criteria: ["fixture-support"] }
  const contractRef = store.put(contract)
  const artifact = (body: string, inputs: OwnershipReceipt["inputs"], options?: {
    key?: string; need?: OwnershipArtifact["need"]; dependencies?: OwnershipReceipt["dependencies"]; basis?: string; scope?: string
  }) => {
    const dependencies = options?.dependencies ?? []
    const scope = options?.scope ?? "core"
    const result: OwnershipResult = {
      kind: "ownership-result", version: 1,
      body: store.put({ kind: "ownership-body", version: 1, bytes: Array.from(new TextEncoder().encode(body)) }),
      authority: { scope, basis: options?.basis ?? "explicit test fixture only" }, validity: "supported", gaps: [], evidence: ["fixture"],
    }
    const resultRef = store.put(result)
    const reviews = ["fixture-1", "fixture-2"].map((reviewer) => {
      const review: OwnershipReview = {
        kind: "ownership-review", version: 1, reviewer, contract: contractRef, inputs: id({ inputs, dependencies }),
        result: resultRef, criteria: contract.criteria, verdict: "pass", provenance: "synthetic fixture, not a real judge decision",
      }
      return store.put(review)
    })
    const receipt: OwnershipReceipt = { kind: "ownership-receipt", version: 1, contract: contractRef, inputs, dependencies, reviews }
    const value: OwnershipArtifact = {
      kind: "ownership-artifact", version: 1, key: options?.key ?? "operations", scope, title: "Operations fixture", layer: 4,
      need: options?.need ?? "operational", result: resultRef, receipt: store.put(receipt), navigation: [],
    }
    const ref = store.put(value)
    const manifest: OwnershipManifest = {
      kind: "ownership-manifest", version: 1, scope, entries: [{ key: value.key, artifact: ref }], roots: { [value.need]: value.key },
    }
    return { value, resultRef, ref, manifest, manifestRef: store.put(manifest) }
  }
  const carrier = (ownership: ReturnType<typeof store.put>, scope = "core", path = ".") => {
    const axes = build(walkFileTree(repo.repoPath), readScip(join(repo.repoPath, ".atlas", "index.scip")))
    const anchor = path === "." ? axes.spatial : axes.spatial.children.flatMap((node) => node.children).find((node) => node.key === path)
    if (anchor === undefined) throw new Error(`fixture anchor missing: ${path}`)
    return {
    kind: "advisory" as const, id: asNodeKey("untrusted-payload-id"), tier: "T2" as const,
    claimNorm: ownershipClaim(scope), predicateSlot: "ownership" as const, ownership,
    grounding: { entries: [{ anchor: { kind: path === "." ? "repo" as const : "file" as const, qualifiedPath: anchor.key, subtreeHash: anchor.subtreeHash }, path }] },
    freshness: "FRESH" as const, claims: [], authoring: "ADVISORY" as const, scope,
    }
  }
  return {
    ...repo, store, current, artifact, carrier,
    runtime: () => composeRuntime(repo.repoPath),
    cleanup: () => { scip.cleanup(); repo.cleanup() },
  }
}
