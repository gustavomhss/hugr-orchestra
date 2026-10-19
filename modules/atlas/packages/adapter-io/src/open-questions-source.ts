// @atlas/adapter-io — src/open-questions-source.ts  (R11: the store feed for `deriveOpenQuestions`)
//
// Reads what the pure question rules (`@atlas/genesis` open-questions.ts) need from one repository: the live current
// facts (retired ones excluded, R6), each unit's policy owner (`terrainOwner`, the owner `atlas own` prints), and each
// file's blast — how many files depend on it in the code index's reverse closure. It builds its own index from the
// working tree and `.atlas/index.scip` (no dump ⇒ no edges ⇒ every blast is 0), so one call costs one index build;
// it is not a leg of the composed runtime because `compose.ts` has no room under the godfile ceiling.

import { join } from "node:path"
import type { Hash } from "@atlas/contracts"
import { deriveOpenQuestions } from "@atlas/genesis"
import type { QuestionFact, RankedQuestion } from "@atlas/genesis"
import { build, createDepgraph, nodeHashOfPath } from "@atlas/index"
import { currentNodes, isRetired } from "@atlas/knowledge"
import type { GroundedFact } from "@atlas/knowledge"
import { walkFileTree } from "./fs.js"
import { CAS_REL } from "./okf-store.js"
import { terrainOwner } from "./own-source.js"
import { loadPolicy } from "./policy.js"
import { headSha } from "./run-git.js"
import { readScipOrEmpty, SCIP_INDEX_REL } from "./scip.js"
import { createDiskStore, rehydrateProjection } from "./store.js"
import { gitSidecarTrust } from "./store-provenance.js"

/** The open questions for the repository at `repoPath`, unanswered ones only, highest rank first. */
export function openQuestionsOf(repoPath: string, answered: ReadonlySet<string>): readonly RankedQuestion[] {
  const store = createDiskStore(join(repoPath, CAS_REL), () => headSha(repoPath), gitSidecarTrust(repoPath))
  const facts = currentNodes(rehydrateProjection(store)).flatMap((node): QuestionFact[] => {
    const fact = store.get(node.contentHash as Hash) as GroundedFact | undefined
    if (node.primaryAnchor === undefined || fact === undefined || isRetired(fact)) return []
    return [
      {
        nodeKey: node.nodeKey,
        file: node.primaryAnchor.split("::")[0] ?? node.primaryAnchor,
        ...(node.slot !== undefined ? { slot: node.slot } : {}),
        tier: node.tier ?? fact.tier,
        claim: node.claims[0] ?? "",
      },
    ]
  })
  const policy = loadPolicy(repoPath)
  const depgraph = createDepgraph(build(walkFileTree(repoPath), readScipOrEmpty(join(repoPath, SCIP_INDEX_REL))).edges)
  return deriveOpenQuestions({
    facts,
    ownerOf: (unit) => terrainOwner(policy, unit),
    blast: (file) => {
      const self = nodeHashOfPath(file)
      return depgraph.reverseClosure(self).closure.filter((h) => h !== self).length
    },
    answered,
  })
}
