// @atlas/adapter-io — src/surface/index.ts  (the Atlas UI surface)
//
// ── REFERENCE MODEL — EXTERNAL STATIC HOST BOUNDARY
// Declared in harness/gates/reference-model-guard.mjs.
// The host builds this exact entry into @orchestra/atlas-boundary's `./surface` subpath; no Atlas-local runtime
// imports it, so `openSurface` has no in-tree production caller and its ledger row says so.
//
// `openSurface(repoPath)` is the read and write API of the Orchestra Atlas screen (./types.ts has every shape).
// READS: `snapshot` is the object specs/atlas-ui/mock/extract.py writes (./read-store.ts, ./read-git.ts,
// ./read-index.ts) plus lead decision D3b's committed Own, Memory and territories (./read-own-memory.ts); `reasoning` is one staged row's model reasoning; `own` and `health` are the composed runtime's
// `own` leg and its doctor legs. WRITES go through the composed runtime's own doors and never a second one: `promote`
// is `ComposedRuntime.promote`, `draft` is `draftVerdict` + `checkVerdict` over `ComposedRuntime.draft`/`check`, `emit`
// and `link` are `handler.handle` on `atlas-emit` and `atlas-link`. `verify` is `verifyFactVerdict` over the verify-fact
// leg built exactly as compose.ts builds it; it reads the code index and nothing else, so it composes nothing more.
// REVIEW (D31): `review` and the review writes live in ./review.ts and act through the same adapter-io helpers the
// CLI's review commands call (D29), so the screen and the CLI cannot diverge.
//
// COST, STATED: `own`, `health` and every write call `composeRuntime`, which walks the tracked tree and decodes the
// SCIP index, once per call. `snapshot`, `reasoning` and `verify` do not compose. Every method is synchronous.
// THE RATIFY TOKEN. `composeRuntime` reads `ATLAS_RATIFY_TOKEN` from the environment once, synchronously, while it
// composes (compose.ts:175), and closes over it. A write that carries `token` sets the variable for exactly that one
// synchronous `composeRuntime` call and restores the previous value before anything else can run.
//
// A repository with no `.atlas/` directory answers `{ state: "empty" }` from every method, checked on each call.
import { existsSync } from "node:fs"
import { basename, join } from "node:path"
import { asHash } from "@atlas/kernel"
import type { EmitOut, LinkOut, Verdict } from "@atlas/tools"
import { checkVerdict, draftVerdict } from "../author-verdicts.js"
import { composeRuntime, gitUserEmail } from "../compose.js"
import { composeWith } from "./compose-with.js"
import { foldReviewLog } from "../review-log.js"
import type { AtlasPromoteInput, AtlasPromoteResult } from "./types.js"
import { reportIndexPlan } from "../indexer-report.js"
import { headSha } from "../run-git.js"
import { readScipIndexerName, readScipOrEmpty, SCIP_INDEX_REL } from "../scip.js"
import { gitStoreProvenance } from "../store-provenance.js"
import { createVerifyFactLeg, verifyFactVerdict } from "../verify-fact-source.js"
import { childrenOf, headShort, langCounts, trackedFiles, trackedStore, withDrift } from "./read-git.js"
import { readDependents } from "./read-index.js"
import { readMemory, readOrientation, readOwn, readTerritories } from "./read-own-memory.js"
import { pendingFacts, readReasoning, readStoreFiles, storeSummary } from "./read-store.js"
import { answer, decide, hold, memoryDecide, propose, release, review, territory } from "./review.js"
import type {
  AtlasDraftInput,  AtlasDraftResult,
  AtlasEmitInput,
  AtlasEmitResult,
  AtlasEmpty,
  AtlasHealthResult,
  AtlasLinkInput,
  AtlasLinkResult,
  AtlasOwnResult,
  AtlasSnapshot,
  AtlasSurface,
  AtlasVerifyInput,
  AtlasVerifyResult,
} from "./types.js"

export type {
  AtlasAnchor,
  AtlasCasAudit,
  AtlasCasIntegrity,
  AtlasCheckOut,
  AtlasClaimProvenance,
  AtlasDelegateResult,
  AtlasDraftData,
  AtlasDraftInput,  AtlasDraftOut,
  AtlasDraftResult,
  AtlasDrift,
  AtlasDriftHunk,
  AtlasEmitInput,
  AtlasEmitOut,
  AtlasEmitResult,
  AtlasEmpty,
  AtlasFact,
  AtlasGateResult,
  AtlasGuidance,
  AtlasHealth,
  AtlasHealthResult,
  AtlasIndexerPlan,
  AtlasIndexPlan,
  AtlasLinkInput,
  AtlasLinkOut,
  AtlasLinkResult,
  AtlasOwn,
  AtlasOwnResult,
  AtlasPlannedLang,
  AtlasPromote,
  AtlasPromoteInput,
  AtlasPromoteResult,
  AtlasPromoteRow,
  AtlasProofs,
  AtlasReasoning,
  AtlasReasoningMissing,
  AtlasReasoningResult,
  AtlasReviewResult,
  AtlasReviewWriteResult,
  AtlasScipState,
  AtlasSnapshot,  AtlasSnapshotResult,
  AtlasSurface,
  AtlasTracked,
  AtlasVerdict,
  AtlasVerifyInput,
  AtlasVerifyOut,
  AtlasVerifyResult,
} from "./types.js"
export type {
  AtlasMemoryRecord,
  AtlasOrientationEvent,
  AtlasOwnCoverage,
  AtlasOwnSkill,
  AtlasOwnSnapshot,
  AtlasTerritory,
} from "./types-memory.js"
export type {
  AtlasAnswerInput,
  AtlasDecideInput,
  AtlasDelegateInput,
  AtlasDelegateOut,
  AtlasHoldInput,
  AtlasInterviewDraft,
  AtlasInterviewQuestion,
  AtlasMemoryDecideInput,
  AtlasMemoryProposal,
  AtlasProposeInput,
  AtlasReleaseInput,
  AtlasReview,
  AtlasReviewProposal,
  AtlasReviewWriteOut,
  AtlasTerritoryInput,
} from "./types-review.js"

const EMPTY: AtlasEmpty = { state: "empty" }
/** The Atlas screen's API over the store at `<repoPath>/.atlas`. Opening it reads nothing. */
export function openSurface(repoPath: string): AtlasSurface {
  const absent = () => !existsSync(join(repoPath, ".atlas"))
  return {
    snapshot: () => (absent() ? EMPTY : snapshot(repoPath)),
    reasoning: (id) => (absent() ? EMPTY : readReasoning(readStoreFiles(repoPath), id)),
    own: (scope) => (absent() ? EMPTY : own(repoPath, scope)),
    health: () => (absent() ? EMPTY : health(repoPath)),
    promote: (input) => (absent() ? EMPTY : promote(repoPath, input)),
    draft: (input) => (absent() ? EMPTY : draft(repoPath, input)),
    emit: (input) => (absent() ? EMPTY : emit(repoPath, input)),
    link: (input) => (absent() ? EMPTY : link(repoPath, input)),
    verify: (input) => (absent() ? EMPTY : verify(repoPath, input)),
    review: () => (absent() ? EMPTY : review(repoPath)),
      hold: (input) => (absent() ? EMPTY : hold(repoPath, input)),
      release: (input) => (absent() ? EMPTY : release(repoPath, input)),
      propose: (input) => (absent() ? EMPTY : propose(repoPath, input)),
      decide: (input) => (absent() ? EMPTY : decide(repoPath, input)),
      answer: (input) => (absent() ? EMPTY : answer(repoPath, input)),
      memoryDecide: (input) => (absent() ? EMPTY : memoryDecide(repoPath, input)),
      territory: (input) => (absent() ? EMPTY : territory(repoPath, input)),
  }
}

function snapshot(repoPath: string): AtlasSnapshot {
  const files = readStoreFiles(repoPath)
  const rows = pendingFacts(files)
  const tracked = trackedFiles(repoPath)
  return {
    state: "ok",
    project: basename(repoPath),
    head: headShort(repoPath),
    ...storeSummary(repoPath, files),
    ...readDependents(repoPath),
    tracked: trackedStore(repoPath),
    langs: langCounts(tracked),
    facts: withDrift(repoPath, rows.facts),
    candidates: withDrift(repoPath, rows.candidates),
    children: childrenOf(tracked),
    own: readOwn(repoPath),
    memory: readMemory(repoPath),
    orientation: readOrientation(repoPath),
    territories: readTerritories(repoPath),
  }
}

function own(repoPath: string, scope: string): AtlasOwnResult {
  const runtime = composeRuntime(repoPath)
  const out = runtime.own(scope)
  return { state: "ok", scope, tool: out.tool, pack: out.pack, readRefusal: runtime.readRefusal ?? null }
}

function health(repoPath: string): AtlasHealthResult {
  const runtime = composeRuntime(repoPath)
  const proofs = runtime.reverify()
  return {
    state: "ok",
    // The same resolution compose.ts applies to the write actor (compose.ts:170).
    actor: process.env.ATLAS_ACTOR ?? gitUserEmail(repoPath) ?? "",
    provenance: gitStoreProvenance(repoPath)(),
    readRefusal: runtime.readRefusal ?? null,
    readAdvisory: runtime.readAdvisory ?? null,
    cas: runtime.doctorSource.casAudit(),
    proofs: {
      sealedProven: proofs.sealedProven,
      reProven: proofs.reProven,
      broken: proofs.broken,
      unverifiable: proofs.unverifiable,
      dangling: proofs.dangling,
    },
    index: reportIndexPlan(repoPath),
    hotSet: runtime.doctorSource.hotSetSize(),
  }
}

/** `atlas promote [nodeKey...]` (D15, D36): with keys only those staged rows, and a row the review log holds is ALWAYS
 *  skipped. A log that does not verify could hide a hold, so the pass is refused before staging is read, as
 *  `atlas promote` refuses it; nothing is presented. */
function promote(repoPath: string, input: AtlasPromoteInput): AtlasPromoteResult {
  const review = foldReviewLog(repoPath)
  if ("refusal" in review) {
    return { state: "ok", read: false, refusal: "unreadable", candidates: 0, promoted: 0, refused: 0, rows: [] }
  }
  const held = review.fold.held
  const select = input.nodeKeys === undefined || input.nodeKeys.length === 0 ? { held } : { only: input.nodeKeys, held }
  return { state: "ok", ...composeWith(repoPath, input.token).promote(asHash(headSha(repoPath) ?? ""), select) }
}

/** `atlas draft`, then `atlas check` of the drafted fact at the draft's own rev, over ONE composed runtime. */function draft(repoPath: string, input: AtlasDraftInput): AtlasDraftResult {
  const runtime = composeWith(repoPath, input.token)
  const drafted = draftVerdict(
    input.supersede === true ? runtime.draftSupersede : runtime.draft,
    runtime.slots,
    input.anchor,
    input.slot,
    input.claim,
  )
  const rejected = drafted.rejected === undefined ? {} : { rejected: drafted.rejected }
  if (drafted.data === undefined) return { state: "ok", ok: drafted.ok, guidance: drafted.guidance, ...rejected }
  const checked = checkVerdict(runtime.check, drafted.data.fact, drafted.data.rev)
  return {
    state: "ok",
    ok: drafted.ok,
    guidance: drafted.guidance,
    ...rejected,
    data: { draft: drafted.data, check: checked.data ?? null },
  }
}

function emit(repoPath: string, input: AtlasEmitInput): AtlasEmitResult {
  const runtime = composeWith(repoPath, input.token)
  // `handle` is typed over every tool's result; the `atlas-emit` leg answers an `EmitOut` (tools/src/types.ts).
  const verdict = runtime.handler.handle("atlas-emit", { node: input.fact, at: input.at }) as Verdict<EmitOut>
  return { state: "ok", ...verdict }
}

function link(repoPath: string, input: AtlasLinkInput): AtlasLinkResult {
  const runtime = composeWith(repoPath, input.token)
  // The `atlas-link` leg answers a `LinkOut`; `retract` is always sent as a boolean, as `atlas link` marshals it.
  const verdict = runtime.handler.handle("atlas-link", {
    a: input.a,
    b: input.b,
    retract: input.retract === true,
  }) as Verdict<LinkOut>
  return { state: "ok", ...verdict }
}

function verify(repoPath: string, input: AtlasVerifyInput): AtlasVerifyResult {
  const scipPath = join(repoPath, SCIP_INDEX_REL)
  // compose.ts builds its `verifyFact` leg the same way: `createVerifyFactLeg(readScipOrEmpty(scipPath), { indexerName })`.
  const leg = createVerifyFactLeg(readScipOrEmpty(scipPath), { indexerName: readScipIndexerName(scipPath) })
  const verdict = verifyFactVerdict(leg, input.kind, input.target, {
    scope: input.scope,
    world: input.world,
    min: input.min === undefined ? undefined : String(input.min),
    exact: input.exact === true,
  })
  return { state: "ok", ...verdict }
}
