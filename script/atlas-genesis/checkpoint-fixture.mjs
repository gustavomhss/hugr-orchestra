// Shared real-store fixture for remote regression controls; never a production candidate source.
import assert from "node:assert/strict"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { createDiskStore } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"

export const controlIdentity = {
  mode: "control",
  revision: "a".repeat(40), run: "1", attempt: "1", indexRun: "2", retainedRuns: ["3", "4"],
  budget: "200", arms: ["advisory", "dependency", "count"], wrapperSha256: "b".repeat(64), profileSha256: "c".repeat(64),
}

export function controlStore(directory) {
  mkdirSync(join(directory, ".atlas"), { recursive: true })
  const store = createDiskStore(join(directory, ".atlas/cas"), () => controlIdentity.revision)
  const fact = store.put({ claim: "one original fact", derivation: "its own cited derivation" })
  const sibling = store.put({ claim: "a distinct sibling", derivation: "a second derivation" })
  const answer = store.put('```atlas-fact\n{"facts":[{"claim":"one original fact"},{"claim":"a distinct sibling"}]}\n```')
  const row = { nodeKey: "d".repeat(64), family: "advisory", contentHash: fact, answerRef: answer,
    claims: ["one original fact", "a distinct sibling"], primaryAnchor: "src/control.ts", scope: "atlas:mined", tier: "T2",
    derivedAt: controlIdentity.revision, claimEvidenceByClaim: {
      "one original fact": { factRef: fact, answerRef: answer }, "a distinct sibling": { factRef: sibling, answerRef: answer },
    } }
  const result = store.commitStaging((projection) => ({ out: row, next: { ...projection, current: new Map([[row.nodeKey, row]]) } }))
  assert(result.settled)
  const readback = store.commitStaging((projection) => ({ out: projection.current.get(row.nodeKey) }))
  assert(readback.settled)
  assert.deepEqual(readback.out, row)
  return { store, row }
}
