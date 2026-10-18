// @atlas/e2e-blackbox — test/s11-predicate-lineage.blackbox.test.ts  (S11 — Predicate facts + SUPERSEDE lineage)
//
// NARRATIVE (WAVE-COV-1 cell 1): the product `atlas draft` door only mints ADVISORY `GroundedFact`s (no
// `check`), so a story that needs a genuinely PREDICATED node must author one itself. This file does exactly
// that — reusing `adversarial-fixtures.ts`'s `subtreeHashOf` (the REAL re-derivable grounding recipe) and `@atlas/knowledge`'s `nodeKey`
// (the SAME identity mint `governed-emit.ts` recomputes on write: `candidateView = {...node, slot:
// node.predicateSlot}`, and — since `node.check` is already present on a `PredicateNode` — the spread carries
// it straight into the `Candidate` view) — so the locally-minted `id` matches what the write door recomputes.
// Getting the view wrong (omitting `check`, or leaving `predicateSlot` uncast to `.slot`) is the slot-lossy-
// cast trap the E2E emit→query readback previously caught; this story proves the fix stays fixed for the
// PREDICATE family specifically (S3/S8 only exercised ADVISORY identity).
//
// A predicate is DOUBLE-GATED at emit (governed-emit.ts): (1) the TRUTH door — grounding must re-derive
// FRESH (the `Check` itself is NEVER evaluated at emit, only the citation); (2) the RATIFY door — KNOW-18's
// `route` sends EVERY predicate to `full-ratify` (fastpath.ts: "ANY PREDICATE candidate routes to FULL human
// ratification"), so a valid `ATLAS_RATIFY_TOKEN` is mandatory regardless of tier/risk.
//
// SUPERSEDE (router.ts upsert, KNOW-4e): re-emitting at the SAME (anchor, slot, check) but with DIFFERENT
// bytes routes SUPERSEDE, not DEDUP. This story engineers that split via `normalizeCheck`'s own contract
// (kind ‖ NFC-normalized-and-trimmed body, joined by an internal delimiter — the expected claim text is
// computed through the REAL `normalizeCheck`, never hand-guessed): padding the check body with whitespace
// changes the raw `check.expr` (⇒ the persisted node's canonical bytes differ ⇒ a NEW contentHash —
// `grounding`/`status`/`freshness` are the ONLY canonical-form exclusions, KERNEL-8) while the TRIMMED
// normalized value — and hence the nodeKey preimage — is UNCHANGED (⇒ SAME nodeKey ⇒ SUPERSEDE, never
// CREATE-as-sibling).
//
// Lineage surfaces read-only via `atlas doctor archive <scope>` (doctor-source.ts `lineage`): the CURRENT
// node's contentHash is always pushed, and its `supersededBy` pointer (= the PRIOR contentHash, retained
// append-only in CAS) is pushed alongside it — so a scoped archive query lists BOTH hashes post-supersede.
//
// Every EXECUTION and ASSERTION below is pure black-box (spawned `atlas` bin, stdout/exit) — the predicate
// fact is AUTHORED with product-lib helpers (the stand-in for a mining tool), exactly as the other stories do.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { subtreeHashOf } from "./adversarial-fixtures.js"
import { nodeKey, normalizeCheck } from "@atlas/knowledge"
import type { Candidate, Check, GroundedFact, PredicateSlot } from "@atlas/knowledge"
import type { SubtreeHash, Tier } from "@atlas/contracts"
import { ACTOR, RATIFIER, emitFact, invLines, scopedPolicy } from "./support.js"

const asSubtree = (h: string): SubtreeHash => h as unknown as SubtreeHash

/** The recipe for one grounded PREDICATE fact — the checkable-family sibling of the product `atlas draft`
 *  door's ADVISORY output (draft mints ADVISORY only). Grounding is the REAL re-derivable citation
 *  (`subtreeHashOf`, reused from adversarial-fixtures.ts); identity is minted the SAME way `governed-emit.ts` recomputes it
 *  on write — a `Candidate` view carrying BOTH `slot` (from `predicateSlot`) AND `check` (present verbatim on
 *  a `PredicateNode`), fed through the REAL `nodeKey` — so the authored `id` matches the write door's mint. */
interface PredicateFactSpec {
  readonly repoPath: string
  readonly filePath: string // a real fixture file path — the grounding anchor (re-derives FRESH)
  readonly slot: PredicateSlot
  readonly check: Check
  readonly tier?: Tier // default 'T1' (a predicate ALWAYS full-ratifies regardless of tier — KNOW-18)
  readonly scope?: string // default 'src'
}

function groundedPredicateFact(spec: PredicateFactSpec): GroundedFact {
  const tier: Tier = spec.tier ?? "T1"
  const subtreeHash = asSubtree(subtreeHashOf(spec.repoPath, spec.filePath))
  const grounding: GroundedFact["grounding"] = {
    entries: [{ anchor: { kind: "file", qualifiedPath: spec.filePath, subtreeHash }, path: spec.filePath }],
  }
  // The SAME view `governed-emit.ts` recomputes (`{...node, slot: node.predicateSlot}`) — `check` is carried
  // straight through since a `PredicateNode` already has it. Minting the identity through this exact shape
  // (not a hand-rolled preimage) is what keeps this fact's `id` equal to what the write door recomputes.
  const candidate: Candidate = {
    claimText: "", // predicate identity/claim body is carried by `check`, not `claimText`/`claimNorm`
    claimNorm: "",
    slot: spec.slot,
    check: spec.check,
    grounding,
    provenance: { source: "e2e-blackbox", trusted: true },
    tier,
  }
  return {
    kind: "predicate",
    id: nodeKey(candidate),
    tier,
    check: spec.check,
    grounding,
    status: "HOLDS",
    freshness: "FRESH",
    claims: [],
    authoring: "PREDICATED",
    scope: spec.scope ?? "src",
    predicateSlot: spec.slot,
  }
}

/** The rendered `  archive: [...]` payload line of a `doctor archive` verdict. */
function archiveLine(stdout: string): string {
  return stdout.split("\n").find((l) => l.startsWith("archive:")) ?? ""
}

/** The bracketed content hashes off an `archive: [h1, h2]` payload line, as a SORTED array (order-agnostic
 *  comparison — `lineage()` already canonically sorts, but this keeps the assertion robust either way). */
function archiveHashes(stdout: string): string[] {
  const m = archiveLine(stdout).match(/^archive: \[(.*)\]$/)
  const body = m?.[1] ?? ""
  return body.length === 0 ? [] : body.split(", ").sort()
}

/** The emitted `  id: <64-hex>` line — the persisted CAS contentHash (NOT the nodeKey) — off an emit verdict. */
function contentHashOf(stdout: string): string | undefined {
  return stdout.match(/^ {2}id: ([0-9a-f]{64})$/m)?.[1]
}

const FILES = { "src/foo.ts": "export const foo = (): number => 1;\n" }

/** The predicate's `Check` — a padded-whitespace sibling shares the SAME `normalizeCheck` value (trimmed)
 *  while its raw `expr` bytes differ. `normalizeCheck` folds in an internal delimiter between `kind` and
 *  the trimmed body (an injective, non-printable separator — NOT a hand-guessed literal string here); the
 *  expected rendered claim is computed through the REAL `normalizeCheck`, never hardcoded, so this story
 *  stays correct regardless of the exact delimiter byte. */
const EXPR = "foo always returns 1"
const CHECK1: Check = { kind: "assertion", expr: EXPR }
const CHECK2: Check = { kind: "assertion", expr: `  ${EXPR}  ` } // padded — same trimmed value
const EXPECTED_CLAIM = normalizeCheck(CHECK1)

let repo: FixtureRepo
let P1: GroundedFact // predicate: check = assertion('foo always returns 1') — first emit ⇒ CREATE
let P2: GroundedFact //  SAME (anchor, slot, check) — raw `expr` padded with whitespace ⇒ SUPERSEDE, not DEDUP
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // T1 ratifier — a predicate ALWAYS full-ratifies (KNOW-18)
  repo = makeFixtureRepo({ files: FILES, policy: scopedPolicy("src") })
  P1 = groundedPredicateFact({ repoPath: repo.repoPath, filePath: "src/foo.ts", slot: "invariant", check: CHECK1 })
  // Whitespace-padded `expr`: `normalizeCheck` trims it (SAME normalized value ⇒ SAME nodeKey preimage), but
  // the raw bytes differ (⇒ a DIFFERENT persisted contentHash — `check` is not in KERNEL-8's exclusion set).
  P2 = groundedPredicateFact({ repoPath: repo.repoPath, filePath: "src/foo.ts", slot: "invariant", check: CHECK2 })
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S11 — predicate facts (grounded-or-rejected, ratify-gated) + SUPERSEDE lineage (doctor archive)", () => {
  it("identity: P1 and P2 mint the SAME nodeKey (id) — same anchor∧slot∧normalized-check", () => {
    // GENUINE identity independent of raw whitespace — normalizeCheck trims before the nodeKey preimage.
    expect(P2.id).toBe(P1.id)
  })

  it("1. emit a grounded, ratified predicate ⇒ ACCEPTED (exit 0, id rendered, persisted CAS content)", () => {
    const out = emitFact(repo, P1)
    expect(out.exitCode).toBe(0)
    expect(out.stdout).toContain("status: ok")
    expect(out.stdout).toMatch(/^ {2}id: [0-9a-f]{64}$/m)
  })

  it("2. readback: `atlas query src` shows the predicate — nodeId = the minted nodeKey, claim = normalizeCheck(check)", () => {
    const q = runAtlas(repo.repoPath, ["query", "src"])
    expect(q.exitCode).toBe(0)
    // claimNormOf(predicate) = normalizeCheck(check) — computed through the REAL function, not hand-guessed.
    expect(invLines(q.stdout)).toEqual([`  inv T1 ${P1.id} [FRESH]: ${EXPECTED_CLAIM}`])
  })

  it("3. `doctor archive src` lists the ONE current contentHash (no lineage yet — nothing superseded)", () => {
    const a = runAtlas(repo.repoPath, ["doctor", "archive", "src"])
    expect(a.exitCode).toBe(0)
    expect(a.stdout).toContain("status: ok")
    expect(archiveLine(a.stdout)).toMatch(/^archive: \[[0-9a-f]+\]$/) // exactly one hash, pre-supersede
  })

  it("4. SUPERSEDE: re-emit at the SAME (anchor,slot,check) with DIFFERENT bytes ⇒ ACCEPTED, a NEW contentHash", () => {
    const e1 = emitFact(repo, P1) // re-derive P1's contentHash for a same-nodeKey, DIFFERENT-content check
    const e2 = emitFact(repo, P2)
    expect(e1.exitCode).toBe(0)
    expect(e2.exitCode).toBe(0)
    const h1 = contentHashOf(e1.stdout)
    const h2 = contentHashOf(e2.stdout)
    expect(h1).toBeDefined()
    expect(h2).toBeDefined()
    expect(h2).not.toBe(h1) // NOT a DEDUP — the padded `expr` really does change the persisted bytes
  })

  it("5. post-supersede readback: STILL exactly ONE current node at the SAME nodeKey (KNOW-4g), claim unchanged", () => {
    const q = runAtlas(repo.repoPath, ["query", "src"])
    expect(q.exitCode).toBe(0)
    // one-current-node-per-key holds through SUPERSEDE too — never TWO rows for the same predicate identity.
    expect(invLines(q.stdout)).toEqual([`  inv T1 ${P1.id} [FRESH]: ${EXPECTED_CLAIM}`])
  })

  it("6. `doctor archive src` now lists BOTH the current AND the superseded contentHash (append-only CAS lineage)", () => {
    const a = runAtlas(repo.repoPath, ["doctor", "archive", "src"])
    expect(a.exitCode).toBe(0)
    expect(archiveLine(a.stdout)).toMatch(/^archive: \[[0-9a-f]+, [0-9a-f]+\]$/) // TWO hashes now
    const hashes = archiveHashes(a.stdout)
    expect(hashes.length).toBe(2)
    expect(new Set(hashes).size).toBe(2) // genuinely distinct — not a duplicate render of the same hash

    // the SAME lineage is visible unscoped (both facts share `scope: 'src'`).
    const all = runAtlas(repo.repoPath, ["doctor", "archive"])
    expect(all.exitCode).toBe(0)
    expect(archiveHashes(all.stdout)).toEqual(hashes)

    // an unrelated scope sees NONE of it — the lineage is genuinely scope-filtered, not a global dump.
    const empty = runAtlas(repo.repoPath, ["doctor", "archive", "no-such-scope"])
    expect(empty.exitCode).toBe(0)
    expect(archiveLine(empty.stdout)).toBe("archive: []")
  })
})
