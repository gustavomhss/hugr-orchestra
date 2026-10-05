// @atlas/e2e-blackbox — test/stage.ts  (the candidate-STAGING helper — NOT the black-box execution harness)
//
// THE CRUX, and it is the same one `adversarial-fixtures.ts` records one door over. `atlas promote` reads the explorer's
// STAGING sidecar, and the only thing that writes that sidecar is `atlas mine`.
//
// [AMENDED — REQ-CLI-4d] This note used to say `atlas mine` stages ZERO candidates ALWAYS, structurally:
// `withDefaults` fell back to `defaultGate()` ("no admission seam wired"), the CLI passed no deps, and
// `makeAdmitGate` had NO production caller at all. That was measured and it was true. It no longer is —
// the composition root supplies the gate, and `atlas mine .` on Atlas itself stages 200 candidates.
//
// The helper stays, for the reason `adversarial-fixtures.ts` gives rather than the one this file used to give: a black-box
// story needs ONE candidate with KNOWN bytes, a known claim and a known nodeKey to assert against, and what
// a real pass stages is whatever the operator's proposer answered at whatever the frontier ranked. Driving
// `mine` to produce the fixture would make every promotion assertion depend on a model's output.
//
// It does it the sanctioned way — through the PRODUCT'S OWN staging door
// (`DiskStore.commitStaging`) with the PRODUCT'S OWN write decision (`upsert`), the PRODUCT'S OWN identity
// formula (`nodeKey`, with the `predicateSlot → .slot` map applied), and the PRODUCT'S OWN `MINED_SCOPE`
// constant imported rather than retyped. Nothing about the sidecar FORMAT is written by hand here; if the
// format moves, this moves with it, because it is the same code path `cli/src/mine.ts` takes.
//
// Product LIBS are imported ONLY to place the input. Every EXECUTION and every ASSERTION in the story stays
// pure black-box (the spawned `atlas` binary), which is the same boundary `adversarial-fixtures.ts` draws.
//
// WHAT IT STANDS IN FOR, precisely: the row a wired mine gate would have staged. It is NOT a claim that
// `atlas mine` produces one today — it does not, and the story says so in its own prose.

import { join } from "node:path"
import { createDiskStore, gitSidecarTrust, headSha } from "@atlas/adapter-io"
import { id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import { nodeKey, primaryAnchorId, upsert } from "@atlas/knowledge"
import type { Candidate, GroundedFact, WriteRequest } from "@atlas/knowledge"
// The governance scope `mine` stamps on every candidate — imported, never retyped: the promotion door
// authorizes against this exact string, and two copies of it is the drift the constant exists to stop.
import { MINED_SCOPE, MINED_TIER } from "@atlas/cli"

export { MINED_SCOPE, MINED_TIER }

/** What was staged: the minted identity and the CAS address of the fact's bytes. */
export interface StagedRow {
  readonly nodeKey: string
  readonly contentHash: string
}

/**
 * Stage one grounded fact as a CANDIDATE, through the product's own staging door — the write `atlas mine`
 * would make if its admission gate were wired. Re-stamps `scope`/`tier` from the mined constants (never
 * forwarded from the fact) exactly as `mine.ts` does, so a caller cannot stage a candidate declaring `T0`.
 */
export function stageCandidate(repoPath: string, fact: GroundedFact): StagedRow {
  const store = createDiskStore(join(repoPath, ".atlas", "cas"), () => headSha(repoPath), gitSidecarTrust(repoPath))
  // Stamped BEFORE the content hash so the BYTES carry the scope — and onto the request below so the ROW
  // does too. A row and its bytes that disagree is the state the emit door's corroboration gate refuses.
  const f = { ...fact, scope: MINED_SCOPE, tier: MINED_TIER } as GroundedFact
  // `predicateSlot → .slot` FIRST: the identity functions read `.slot`, so a view without the map computes a
  // slot-free key that diverges from stored identity (found by E2E, missed by four isolated reviews).
  // A RelationNode (ADR-0015 D2) carries no `predicateSlot`; narrow it away (this staging path emits intrinsic facts).
  const fSlot = f.kind === "advisory" || f.kind === "predicate" ? f.predicateSlot : undefined
  const view = { ...f, slot: fSlot } as unknown as Candidate
  const key = nodeKey(view) as unknown as string
  const contentHash = id(f as unknown as CasObject) as unknown as string
  const req: WriteRequest = {
    nodeKey: key,
    contentHash,
    family: "advisory",
    claimNorm: (f as { claimNorm: string }).claimNorm,
    primaryAnchor: primaryAnchorId(view) as unknown as string,
    ...(fSlot !== undefined ? { slot: fSlot } : {}),
    scope: MINED_SCOPE,
    tier: MINED_TIER,
  }
  // BYTES BEFORE THE ROW: `put` rides the commit's own `put` list, which the protocol makes durable before it
  // publishes the generation naming them. A row referencing bytes absent from CAS is a candidate no curator
  // could ever promote — the exact state the promotion door has to refuse per row.
  const r = store.commitStaging<string>((staged) => ({
    out: key,
    next: upsert(staged, req).store,
    put: [f as unknown as CasObject],
  }))
  if (!r.settled) throw new Error(`stage: the staging sidecar refused (${r.refusal}) — nothing was staged`)
  return { nodeKey: key, contentHash }
}
