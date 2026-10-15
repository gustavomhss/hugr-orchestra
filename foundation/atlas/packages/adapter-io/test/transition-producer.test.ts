// @atlas/adapter-io — test/transition-producer.test.ts  (#234 · ADR-0015 D4 — AT-8 reachability + governed-door authz + AT-4 reverify-skip)
//
// AT-8: the transition family is reachable through the SHIPPED producer (`createTransitionProducer`) over REAL
// 2-rev git input — NOT a test injector — AND it now writes THROUGH the governed emit door (billy security
// review): KNOW-11 actor-scope authz + ARCH-9 anchor apply. So this pins BOTH directions, mirroring the
// relation AR-13 reachability test: an AUTHORIZED actor lands the transition; an UNAUTHORIZED actor is REFUSED
// and the row does NOT land (the guardrail the earlier direct-`commitProjection` persist silently dropped).
// Supersession contrast (D-T3) and the reverify-store SKIP (AT-4/D-T2) are exercised here too.

import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it, expect, afterEach } from "vitest"
import { asHash } from "@atlas/kernel"
import type { CurrentNode, GroundedFact } from "@atlas/knowledge"
import { initAst } from "../src/index.js"
import { createRevIndex } from "../src/rev-index.js"
import { createDiskStore } from "../src/store.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import type { AtlasPolicy } from "../src/policy.js"
import { createTransitionProducer, createTransitionLeg, type TransitionEmit } from "../src/transition-source.js"
import { reverifyFact } from "../src/reverify-store.js"

await initAst() // warm the grammar so the arbitrary-rev index folds the SAME AST units production folds

const UNIT = "src/pay.ts" // a whole-FILE unit lineage — resolves at each rev via resolveAnchorAt; scope = 'src'
const ACTOR = "seat:owner"
const OTHER = "seat:intruder" // NOT a member of scope 'src'
/** A policy authorizing ONLY `ACTOR` over scope `src` (no `anchors` declared ⇒ the anchor gate defers). */
const POLICY: AtlasPolicy = { t0Heuristic: { keywords: [] }, authz: { scopes: { src: [ACTOR] } } }
const STUB_GATE = { gateHolds: () => "HOLDS" as const } // the transition door never calls the truth gate (D-T2)

const g = (repo: string, args: readonly string[]): string =>
  execFileSync("git", args as string[], { cwd: repo, encoding: "utf8" }).trim()

interface Sandbox {
  readonly repoPath: string
  readonly A: string
  readonly B: string
  readonly C: string
  cleanup(): void
}

/** A real git repo: A→B→C, each changing `src/pay.ts`'s bytes, so each rev-pair is a genuine transition. */
function makeRepo(): Sandbox {
  const repoPath = mkdtempSync(join(tmpdir(), "transition-"))
  g(repoPath, ["init", "-q"])
  g(repoPath, ["config", "user.email", "t@t.t"])
  g(repoPath, ["config", "user.name", "T"])
  g(repoPath, ["config", "commit.gpgsign", "false"])
  mkdirSync(join(repoPath, "src"), { recursive: true })
  const write = (body: string, msg: string): string => {
    writeFileSync(join(repoPath, UNIT), body)
    g(repoPath, ["add", "-A"])
    g(repoPath, ["commit", "-q", "-m", msg])
    return g(repoPath, ["rev-parse", "HEAD"])
  }
  const A = write("export const rate = 1;\n", "A")
  const B = write("export const rate = 2;\n", "B")
  const C = write("export const rate = 3;\n", "C")
  return { repoPath, A, B, C, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

/** Build the SHIPPED producer over a repo, writing through the GOVERNED door as `actor`. */
function producerFor(sbx: Sandbox, actor: string) {
  const store = createDiskStore(join(sbx.repoPath, ".atlas"))
  const revIndex = createRevIndex(sbx.repoPath)
  // The governed emit door — the SAME `createGovernedEmit` the compose root binds; promoted origin (so a
  // justified transition's seal survives) + a non-empty ratify token (a T2 advisory commits with any ratifier).
  const emit = createGovernedEmit({
    store,
    gate: STUB_GATE,
    policy: POLICY,
    actor,
    origin: "promoted",
    ratifyToken: "seat:ratifier",
  }).emit as TransitionEmit
  const produce = createTransitionProducer(revIndex, emit, asHash(""))
  const read = createTransitionLeg(store)
  return { produce, read }
}

let sbx: Sandbox | undefined
afterEach(() => {
  sbx?.cleanup()
  sbx = undefined
})

describe("AT-8 — reachable through the SHIPPED producer over REAL 2-rev git input, THROUGH the governed door", () => {
  it("an AUTHORIZED actor produces + GOVERNED-emits a JUSTIFIED transition from two real revs, read back through the shipped leg", () => {
    sbx = makeRepo()
    const { produce, read } = producerFor(sbx, ACTOR)

    const run = produce(UNIT, sbx.A, sbx.B)
    expect(run.admitted).toBe(true)
    expect(run.persisted).toBe(true) // the governed door COMMITTED (actor is in scope 'src')
    expect(run.shaBefore).not.toBe(run.shaAfter) // the unit really changed across the two revs

    const rows = read(UNIT)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.unitKey).toBe(UNIT)
    expect(rows[0]!.authoring).toBe("TRANSITIONED")
    expect(rows[0]!.freshness).toBe("FRESH")
  })

  it("SECURITY TEETH — an UNAUTHORIZED actor is REFUSED by the governed door; the row does NOT land", () => {
    sbx = makeRepo()
    const { produce, read } = producerFor(sbx, OTHER) // NOT a member of scope 'src'

    const run = produce(UNIT, sbx.A, sbx.B)
    // the fact is well-formed (admitted), but the GOVERNED DOOR refused the write (KNOW-11 authz) — persisted:false.
    expect(run.admitted).toBe(true)
    expect(run.persisted).toBe(false)
    expect(run.reason).toBeTruthy()
    expect(run.reason).toMatch(/authoriz|scope/i)
    // the guardrail: NOTHING landed — a gate-less persist would have written it.
    expect(read(UNIT)).toHaveLength(0)
  })

  it("SECURITY TEETH — an AUTHORED transition emit is REFUSED outright (a transition is produced, never authored)", () => {
    sbx = makeRepo()
    const store = createDiskStore(join(sbx.repoPath, ".atlas"))
    const revIndex = createRevIndex(sbx.repoPath)
    // ACTOR *is* authorized over scope 'src', so this is refused on ORIGIN, not authz: even an in-scope actor
    // cannot AUTHOR a transition — the door does not re-read the revs, so it will not accept a hand-supplied
    // grounding. Only the trusted `origin:'promoted'` producer may write one.
    const authoredEmit = createGovernedEmit({
      store,
      gate: STUB_GATE,
      policy: POLICY,
      actor: ACTOR,
      origin: "authored",
      ratifyToken: "seat:ratifier",
    }).emit as TransitionEmit
    const produce = createTransitionProducer(revIndex, authoredEmit, asHash(""))
    const read = createTransitionLeg(store)
    const run = produce(UNIT, sbx.A, sbx.B)
    expect(run.admitted).toBe(true) // the fact is well-formed
    expect(run.persisted).toBe(false) // but the door refused it on ORIGIN (not authz — ACTOR is in scope)
    expect(run.reason).toMatch(/produced fact|never authored/)
    expect(read(UNIT)).toHaveLength(0) // nothing landed — the authored-forge surface is closed
  })

  it("ABSTAINS (never fabricates) when the unit did not change across the two revs — same content ⇒ no transition", () => {
    sbx = makeRepo()
    const { produce } = producerFor(sbx, ACTOR)
    const run = produce(UNIT, sbx.A, sbx.A)
    expect(run.admitted).toBe(false)
    expect(run.reason).toBeTruthy()
  })

  it("ABSTAINS when the unit does not resolve at a rev (no leg to ground the transition on)", () => {
    sbx = makeRepo()
    const { produce } = producerFor(sbx, ACTOR)
    const run = produce("src/does-not-exist.ts", sbx.A, sbx.B)
    expect(run.admitted).toBe(false)
  })
})

describe("AT-3 (shipped) — supersession contrast on the same lineage through the governed store", () => {
  it("A→B then B→C: the read leg marks A→B SUPERSEDED and B→C the current TRANSITIONED head, both retained", () => {
    sbx = makeRepo()
    const { produce, read } = producerFor(sbx, ACTOR)
    const revIndex = createRevIndex(sbx.repoPath)

    expect(produce(UNIT, sbx.A, sbx.B).persisted).toBe(true)
    expect(produce(UNIT, sbx.B, sbx.C).persisted).toBe(true)

    const rows = read(UNIT)
    expect(rows).toHaveLength(2) // both retained (superseded, not deleted)
    const shaA = String(revIndex.resolveAnchorAt(sbx.A, UNIT)!.subtreeHash)
    const shaB = String(revIndex.resolveAnchorAt(sbx.B, UNIT)!.subtreeHash)
    const shaC = String(revIndex.resolveAnchorAt(sbx.C, UNIT)!.subtreeHash)
    const ab = rows.find((r) => r.shaBefore === shaA && r.shaAfter === shaB)
    const bc = rows.find((r) => r.shaBefore === shaB && r.shaAfter === shaC)
    expect(ab?.authoring).toBe("SUPERSEDED")
    expect(bc?.authoring).toBe("TRANSITIONED")
  })
})

describe("AT-4 (shipped) — reverify-store SKIPS a transition (justified is out of the proven-only gate)", () => {
  it("reverifyFact returns undefined for a justified transition — never counted re-proven/broken/unverifiable", () => {
    const transition: GroundedFact = {
      kind: "transition",
      id: "tk" as unknown as GroundedFact["id"],
      tier: "T2",
      unitKey: UNIT,
      shaBefore: "sha-A",
      shaAfter: "sha-B",
      grounding: { entries: [] },
      freshness: "FRESH",
      claims: [],
      authoring: "TRANSITIONED",
      seal: "justified",
    }
    const node = {
      nodeKey: "tk",
      family: "transition",
      contentHash: "ch",
      claims: [],
      primaryAnchor: UNIT,
    } as unknown as CurrentNode
    // A justified transition is dropped by the seal gate BEFORE any leg/docExists/scopeHasDocs is consulted
    // (D-T2) — the throwing oracle + both existence stubs must never be reached.
    const row = reverifyFact(
      node,
      transition,
      () => {
        throw new Error("oracle must NOT be called")
      },
      () => true,
      () => true,
    )
    expect(row).toBeUndefined()
  })
})
