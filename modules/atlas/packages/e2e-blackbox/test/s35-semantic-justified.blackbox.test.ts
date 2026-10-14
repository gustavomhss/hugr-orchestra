// @atlas/e2e-blackbox — test/s35-semantic-justified.blackbox.test.ts  (196c — the general `justified` arm, end to end)
//
// NARRATIVE. The 196b vertical slice proved the `justified` seal on ONE slot (`gotcha`); 196c generalizes it to
// the ONE general SEMANTIC arm, where the model CLASSIFIES the fact into one of the eight `SemanticSlot`s. This
// story drives the arm with a fact classified `invariant` — a DIFFERENT slot than gotcha — to prove the chain is
// slot-general: a SEMANTIC slot survives `atlas mine` as a first-class fact that is TYPED
// (`predicateSlot:'invariant'`), SEALED `justified` (a real seal, distinct from a bare advisory and from
// `proven`), and CARRIES ITS DERIVATION (the contestable grounds that "lead a reader to the same conclusion").
// The unit tests prove each leg in process; this story proves the THREE LEGS COMPOSE over the real `atlas`
// binary — a mine drives the proposer, ADMIT lands it `justified`, STORE keeps the seal through promotion, and
// the durable node reads it back carrying all three. This is A6 (the whole chain emits ONE such fact) and A7
// (the DERIVATION stored is the block's contestable grounds, and the model's free SCRATCH reasoning above the
// block is parsed away, never persisted).
//
// ZERO METERED MODEL SPEND. `echo` stands in for the model — the S33/S237/S239 idiom: `ATLAS_MODEL_CONFIG`
// points OUTSIDE the repo (the arbitrary-code-execution guard `atlas mine` enforces against an in-repo config),
// and the canned answer it echoes is what the model WOULD have said. What is under test is the harness's
// behaviour GIVEN a semantic answer, never a live model. The semantic arm is selected by `ATLAS_MINE_SLOT=semantic`.
//
// WHY A SINGLE-SITE FIXTURE. The structural frontier is derived from the SCIP dep edges ALONE (empty index ⇒
// 0 sites ⇒ the proposer is never reached — s14). One file with one outgoing cross-unit reference yields
// EXACTLY ONE ranked site, so the echo stub (which answers every site identically) seeds exactly ONE fact —
// letting A6 assert "ONE fact" literally rather than "at least one".
//
// WHY `atlas node`, NOT `atlas query`. A mined fact is a T2 advisory, which promote's own `next:` line says is
// bounded OUT of the `atlas query` pack (TOOLS-6); `atlas node <addr>` is the read-back door for a promoted
// candidate. This mirrors S33/S239, which read a promoted node the same way. The node render surfaces the
// `seal` and the `claim`; the TYPED `predicateSlot` and the `derivation` live in the durable bytes the node
// reads back (the render does not print them today — neither does it print S33's `predicateSlot`), so those two
// are asserted off the same CAS object the node door serves. Both doors read ONE store; they cannot disagree.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

const CURATOR = "seat:orchestrator"
const CURATOR_ENV = { ATLAS_ACTOR: CURATOR, ATLAS_RATIFY_TOKEN: CURATOR }

/** ONE file with ONE outgoing cross-unit reference (`readEnv`, defined nowhere in the dump ⇒ one unresolved
 *  dep edge) ⇒ EXACTLY ONE ranked structural site. The unit is a real gotcha carrier: a strict-equality flag. */
const FILES = {
  "src/config.ts":
    "import { readEnv } from './env';\n\nexport function parseFlag(name: string): boolean {\n  return readEnv(name) === '1';\n}\n",
}
const SEMANTIC_SLOT = "invariant" // a DIFFERENT slot than 196b's gotcha — proves the arm is slot-general
const INDEX = [{ path: "src/config.ts", defines: ["config/parseFlag()."], references: ["env/readEnv()."] }]
/** Appoints a curator over the mined scope so promote has a named ratifier (ADR-0008). */
const POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { "atlas:mined": [CURATOR] } },
})

/** The three fields of the semantic `atlas-fact` block — the classified slot, the contestable claim and its
 *  grounds (propose-semantic.md). The claim is an INVARIANT: a property that always holds for parseFlag. */
const CLAIM =
  'parseFlag returns true ONLY for the exact string "1"; any other truthy env value like "true" or "yes" yields false'
const DERIVATION =
  'the body compares readEnv(name) === "1" with strict equality, so every value other than the one-character string "1" returns false'

/** A distinctive marker planted in the FREE SCRATCH region above the block (STEP 1 of propose-semantic.md). It
 *  must NEVER appear in the persisted node — the whole point of GEN-12: reasoning is scratch, only the block survives. */
const SCRATCH_SENTINEL = "SCRATCH_SENTINEL_MUST_NOT_BE_PERSISTED"

/** The full canned model answer: free reasoning (discarded) THEN exactly one fenced `atlas-fact` block carrying
 *  the model's CLASSIFICATION (`slot:'invariant'`) alongside the claim and derivation. */
const SEMANTIC_ANSWER =
  `${SCRATCH_SENTINEL}: let me reason freely. parseFlag reads an env var; I will try to refute a candidate ` +
  `against the bytes before emitting.\n` +
  "```atlas-fact\n" +
  JSON.stringify({ slot: SEMANTIC_SLOT, claim: CLAIM, derivation: DERIVATION }) +
  "\n```\n"

/** The shape of the durable node the CAS holds (only the legs this story asserts). */
interface StoredNode {
  readonly kind?: string
  readonly claimNorm?: string
  readonly predicateSlot?: string
  readonly seal?: string
  readonly derivation?: string
}

function operatorConfig(answer: string): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "atlas-s35-operator-"))
  const path = join(dir, "model.json")
  // `echo` prints its argument verbatim (incl. the embedded newlines) + a trailing newline: the model's answer,
  // with ZERO metered spend and no live model. It is located OUTSIDE the repo (the ACE guard) via os.tmpdir.
  writeFileSync(path, JSON.stringify({ roles: { propose: { cmd: "echo", args: [answer] } } }))
  return { path, dir }
}

let repo: FixtureRepo
let op: { path: string; dir: string }
let addr = ""
let stored: StoredNode

beforeAll(() => {
  repo = makeFixtureRepo({ files: FILES, index: INDEX, policy: POLICY })
  op = operatorConfig(SEMANTIC_ANSWER)

  const mine = runAtlas(repo.repoPath, ["mine", "."], { ATLAS_MODEL_CONFIG: op.path, ATLAS_MINE_SLOT: "semantic" })
  if (mine.exitCode !== 0) throw new Error(`S35 setup: mine failed:\n${mine.stdout}\n${mine.stderr}`)
  // ONE site, ONE fact — the gotcha answer drove exactly one emission.
  if (!mine.stdout.includes("genesis: seeded 1 candidate fact(s)"))
    throw new Error(`S35 setup: expected exactly 1 seeded fact:\n${mine.stdout}`)

  const promote = runAtlas(repo.repoPath, ["promote"], CURATOR_ENV)
  if (promote.exitCode !== 0) throw new Error(`S35 setup: promote failed:\n${promote.stdout}`)
  const line = promote.stdout.split("\n").find((l) => l.startsWith("  promoted "))
  if (line === undefined) throw new Error(`S35 setup: no promoted line:\n${promote.stdout}`)
  addr = line.split(" -> ")[1]!.trim()

  const casPath = join(repo.repoPath, ".atlas", "cas", addr.slice(0, 2), addr)
  stored = JSON.parse(readFileSync(casPath, "utf8")) as StoredNode
})

afterAll(() => {
  repo?.cleanup()
  if (op?.dir) rmSync(op.dir, { recursive: true, force: true })
})

describe("S35 — `atlas mine` emits ONE typed+justified semantic fact end to end (196c general arm)", () => {
  it("A6: the promoted node is read back via `atlas node`, kind advisory + seal justified + the block claim", () => {
    expect(addr).toMatch(/^[0-9a-f]{64}$/)
    const node = runAtlas(repo.repoPath, ["node", addr])
    expect(node.exitCode).toBe(0)
    expect(node.stdout).toContain("status: ok")
    // The three legs the node door surfaces: it IS an advisory node (the semantic-slot carrier), it is
    // sealed `justified` (NOT a bare unsealed advisory, NOT `proven`), and its claim is the block's claim.
    expect(node.stdout).toContain("kind: advisory")
    expect(node.stdout).toContain("seal: justified")
    expect(node.stdout).toContain(`claim: ${CLAIM}`)
    // NOT `proven` — this is the justified path, and the seal must never be laundered up to proof-strength.
    expect(node.stdout).not.toContain("seal: proven")
  })

  it("A6: the DURABLE fact carries predicateSlot:invariant (a NON-gotcha slot) + seal:justified + a non-empty derivation", () => {
    // The typed slot and the derivation live in the durable bytes the `atlas node` door serves (the render does
    // not print them today — S33's own `predicateSlot` is asserted off the CAS for the same reason). ONE store.
    // The slot is `invariant`, NOT `gotcha` — proving the general arm carries the model's OWN classification.
    expect(stored.predicateSlot).toBe(SEMANTIC_SLOT)
    expect(stored.predicateSlot).not.toBe("gotcha")
    expect(stored.seal).toBe("justified")
    expect(typeof stored.derivation).toBe("string")
    expect((stored.derivation ?? "").length).toBeGreaterThan(0)
  })

  it("A7: the stored derivation IS the block's contestable grounds, and the free SCRATCH reasoning is parsed away", () => {
    // The persisted derivation is EXACTLY the block's `derivation` field — the contestable grounds, byte-for-byte.
    expect(stored.derivation).toBe(DERIVATION)
    // The persisted claim is EXACTLY the block's `claim` — not a summary, not the scratch prose.
    expect(stored.claimNorm).toBe(CLAIM)
    // TEETH of A7 (breaks-on "the free reasoning leaks into the fact"): the SCRATCH_SENTINEL planted in the
    // reason-freely region above the block appears NOWHERE in the durable node — not the claim, not the
    // derivation, not the serialized node at all. Only the fenced block survives (GEN-12).
    expect(stored.claimNorm ?? "").not.toContain(SCRATCH_SENTINEL)
    expect(stored.derivation ?? "").not.toContain(SCRATCH_SENTINEL)
    expect(JSON.stringify(stored)).not.toContain(SCRATCH_SENTINEL)
  })

  it("TEETH: with a NO-FACT proposer the SAME fixture emits ZERO facts — emission is driven by the answer, never fabricated", () => {
    // The decisive control: swap the canned answer for the abstain token and NOTHING is emitted. This proves the
    // A6 emission above came FROM the proposer's answer, not from the mine path inventing a fact at a visited
    // site. Same fixture, same arm, same one site — only the model's answer changes.
    const teethRepo = makeFixtureRepo({ files: FILES, index: INDEX, policy: POLICY })
    const teethOp = operatorConfig("NO-FACT")
    try {
      const mine = runAtlas(teethRepo.repoPath, ["mine", "."], {
        ATLAS_MODEL_CONFIG: teethOp.path,
        ATLAS_MINE_SLOT: "semantic",
      })
      expect(mine.exitCode).toBe(0)
      expect(mine.stdout).toContain("genesis: seeded 0 candidate fact(s)")
      // the one site WAS visited (the proposer was consulted) and it ABSTAINED — not an unreached-site 0.
      const siteLine = mine.stdout.split("\n").find((l) => l.startsWith("site: "))
      expect(siteLine).toBeDefined()
      expect(siteLine).toContain('"outcome":"abstained"')
    } finally {
      teethRepo.cleanup()
      rmSync(teethOp.dir, { recursive: true, force: true })
    }
  })
})
