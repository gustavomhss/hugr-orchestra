// @atlas/e2e-blackbox — test/s3-dedup.blackbox.test.ts  (S3 — Dedup identity, the star)
//
// NARRATIVE: with GROUNDED facts, a user emits F; re-emits byte-identical F (D0 dedup); emits the SAME
// (anchor,slot) reworded (D1 union); and emits the same claim at two DISTINCT anchors (non-destructive
// A2 — two nodes, no write-time merge). Everything through the real `atlas emit`/`query` subprocesses.
//
// SOTA invariants pinned: NO always-merge / NON-DESTRUCTIVE (A2 — distinct anchors keep distinct grounded
// nodes), CONTENT-ADDRESSED idempotency (KERNEL-1 — identical bytes DEDUP to the same id), and D1 union
// (a reworded claim at the same (anchor,slot) collides on the REAL nodeKey and set-unions in place).
//
// PAYOFF (subsumes fires end-to-end, F1) — see the last test: with sub-file `::` AST granularity now folded
// into the index (adapter-io wires `foldAstUnits` before `build`), a fact grounded at a SYMBOL inside a file
// carries a `::` primaryAnchor. The SAME claim emitted at the FILE anchor AND at a symbol inside it makes
// `deriveSubsumes` (wired at read) emit `file ⊃ symbol` — rendered as a `subsumes` line by `atlas query`.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact, symbolAnchorKey } from "./support.js"
import type { GroundedFact } from "@atlas/knowledge"
import { ACTOR, RATIFIER, emitFact, invLines, scopedPolicy, subsumesLines } from "./support.js"

const FILES = { "src/foo.ts": "export const foo = 1;\n", "src/bar.ts": "export const bar = 2;\n" }
const idOf = (s: string): string | undefined => s.match(/^ {2}id: ([0-9a-f]{64})$/m)?.[1]
const query = (repo: FixtureRepo): string => runAtlas(repo.repoPath, ["query", "src"]).stdout

let repo: FixtureRepo
let F: GroundedFact //           claim C1 at src/foo.ts::invariant (FILE anchor)
let Frew: GroundedFact //        claim C1-reworded at the SAME (anchor,slot) ⇒ same nodeKey
let Gbar: GroundedFact //        claim C1 at src/bar.ts::invariant ⇒ a DISTINCT nodeKey
let Sfoo: GroundedFact //        claim C1 at the SYMBOL src/foo.ts::foo ⇒ a `::` descendant of F's anchor
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // KNOW-8 ratifier — T1 facts route to full-ratify
  repo = makeFixtureRepo({ files: FILES, policy: scopedPolicy("src") })
  const at = (filePath: string, claim: string): GroundedFact => draftFact(repo, filePath, "invariant", claim).fact
  F = at("src/foo.ts", "C1")
  Frew = at("src/foo.ts", "C1-reworded")
  Gbar = at("src/bar.ts", "C1")
  // The SAME claim C1, same slot, grounded at the SYMBOL `foo` INSIDE src/foo.ts — a proper `::` descendant.
  Sfoo = draftFact(repo, symbolAnchorKey(repo, "src/foo.ts", "foo"), "invariant", "C1").fact
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S3 — dedup / update / non-destructive identity (ordered — durable store accretes)", () => {
  it("D0 DEDUP: byte-identical re-emit yields the SAME content-addressed id; query shows ONE node", () => {
    const first = emitFact(repo, F)
    const second = emitFact(repo, F)
    expect(first.exitCode).toBe(0)
    expect(second.exitCode).toBe(0)
    expect(idOf(second.stdout)).toBe(idOf(first.stdout)) // idempotent — same bytes, same id (KERNEL-1)
    expect(invLines(query(repo))).toEqual([`  inv T1 ${F.id} [FRESH]: C1`]) // exactly ONE node
  })

  it("D1 UNION: a reworded claim at the SAME (anchor,slot) collides on the real nodeKey → ONE node, merged", () => {
    expect(Frew.id).toBe(F.id) // GENUINE identity: advisory nodeKey = hash(anchor‖slot), wording-independent
    const r = emitFact(repo, Frew)
    expect(r.exitCode).toBe(0)
    // still ONE node at the same nodeKey; the two claim bodies are set-unioned (prose-independent identity).
    expect(invLines(query(repo))).toEqual([`  inv T1 ${F.id} [FRESH]: C1; C1-reworded`])
  })

  it("A2 NON-DESTRUCTIVE: the SAME claim at a DISTINCT anchor mints its OWN node — NO write-time merge", () => {
    expect(Gbar.id).not.toBe(F.id) // distinct anchor ⇒ distinct nodeKey
    const r = emitFact(repo, Gbar)
    expect(r.exitCode).toBe(0)
    // TWO nodes now coexist — each keeps its own grounding; neither was folded into the other (A2).
    expect(invLines(query(repo))).toEqual([
      `  inv T1 ${Gbar.id} [FRESH]: C1`, // src/bar.ts node (nodeKey sorts first)
      `  inv T1 ${F.id} [FRESH]: C1; C1-reworded`, // src/foo.ts node
    ])
  })

  it("determinism: after all writes, the merged query renders BYTE-IDENTICAL across runs", () => {
    expect(query(repo)).toBe(query(repo)) // deterministic projection over the durable store
  })

  it("PAYOFF — subsumes file⊃symbol FIRES end-to-end (sub-file `::` index granularity is now real)", () => {
    // Emit the SAME claim `C1` (same slot, same family) grounded at the SYMBOL `foo` INSIDE src/foo.ts. Its
    // computed primaryAnchor is the folded `::` unit path — a PROPER structural descendant of src/foo.ts.
    // `deriveSubsumes` (wired at read in the query leg) therefore emits `broader ⊃ narrower` with broader =
    // the FILE-anchored node F (fewer `::` segments = the ancestor) and narrower = the symbol node Sfoo.
    expect(Sfoo.id).not.toBe(F.id) // a distinct node at the symbol anchor (its own grounding — A2)
    const r = emitFact(repo, Sfoo)
    expect(r.exitCode).toBe(0) // the symbol anchor RESOLVES in the folded index ⇒ grounded, not rejected

    const out = query(repo)
    expect(invLines(out).length).toBe(3) // src/bar.ts, src/foo.ts (file), src/foo.ts::foo (symbol)
    // THE keystone assertion: a real `subsumes <broader> ⊃ <narrower>` line, F (file) ⊃ Sfoo (symbol).
    expect(subsumesLines(out)).toEqual([`  subsumes ${F.id} ⊃ ${Sfoo.id}`])
  })
})
