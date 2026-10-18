// @atlas/adapter-io — test/governed-emit-transition-door.test.ts  (#234 F2 — the transition door's DEFENSE-IN-DEPTH gates)
//
// The transition producer refuses malformed input UPSTREAM (`transitionWellFormed`) and always grounds on the
// two rev entries, so through the shipped producer three of the door's gates are unreachable — deleting them
// turns no producer test red (lucy #234 cold-review F2). These tests drive `emitTransition` DIRECTLY (through
// the real `createGovernedEmit(...).emit`, bypassing the producer's upstream refusal) with a hand-broken node,
// pinning the three otherwise-untested gates:
//   - gate 0.1 MALFORMED IDENTITY — a zero-interval (shaBefore===shaAfter) or empty-unitKey triple is REFUSED
//     with a clean `emitted:false` (NOT a `transitionKey` throw escaping the total door — the exact reason the
//     gate exists).
//   - gate 1  isGrounded — a node whose rev-pair grounding is empty is REFUSED (a transition MUST cite two revs).
//   - gate 2.1 ARCH-9 `scopeOwnsAnchor` — an IN-SCOPE actor whose declared scope does NOT own the unit (a policy
//     WITH `anchors` binding the unit's prefix to a DIFFERENT scope) is REFUSED — authority cannot be borrowed.
//
// Each test is MUTATION-VERIFIED (documented in the PR): deleting its gate in governed-emit-transition.ts turns
// exactly that test red. Gates 1.1 (origin) and 2 (authz) already have teeth in transition-producer.test.ts.

import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it, expect, afterEach } from "vitest"
import { asHash } from "@atlas/kernel"
import type { Hash, Tier } from "@atlas/contracts"
import type { TransitionNode } from "@atlas/knowledge"
import { buildTransition } from "@atlas/genesis"
import type { TransitionProposal } from "@atlas/genesis"
import { initAst } from "../src/index.js"
import { createRevIndex } from "../src/rev-index.js"
import { createDiskStore } from "../src/store.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import type { AtlasPolicy } from "../src/policy.js"
import { createTransitionLeg, type TransitionEmit } from "../src/transition-source.js"
import { unitScopeOf } from "../src/llm.js"

await initAst() // warm the grammar so the arbitrary-rev index folds the SAME AST units production folds

const UNIT = "src/pay.ts" // whole-FILE unit; scope = 'src'
const ACTOR = "seat:owner"
const AT: Hash = asHash("") // the transition door ignores `at` (D-T2) — threaded honestly
const STUB_GATE = { gateHolds: () => "HOLDS" as const } // the transition door never calls the truth gate (D-T2)

/** ACTOR owns scope 'src'; NO `anchors` declared ⇒ the 2.1 anchor gate defers to true (gates 0/1 fire first). */
const POLICY: AtlasPolicy = { t0Heuristic: { keywords: [] }, authz: { scopes: { src: [ACTOR] } } }
/** ACTOR still owns scope 'src' (gate 2 authz PASSES), but the `src` prefix is bound to a DIFFERENT scope
 *  `core` ⇒ `scopeOwnsAnchor('src', 'src/pay.ts')` is FALSE ⇒ gate 2.1 REFUSES. This is the only policy shape
 *  that isolates gate 2.1: an in-scope actor whose declared scope does not own the unit. */
const POLICY_FOREIGN_ANCHOR: AtlasPolicy = {
  t0Heuristic: { keywords: [] },
  authz: { scopes: { src: [ACTOR] }, anchors: { src: "core" } },
}

const g = (repo: string, args: readonly string[]): string =>
  execFileSync("git", args as string[], { cwd: repo, encoding: "utf8" }).trim()

interface Sandbox {
  readonly repoPath: string
  readonly A: string
  readonly B: string
  cleanup(): void
}

/** A real git repo A→B, each changing `src/pay.ts`'s bytes, so a genuine rev-pair resolves. */
function makeRepo(): Sandbox {
  const repoPath = mkdtempSync(join(tmpdir(), "transition-door-"))
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
  return { repoPath, A, B, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

/** A VALID transition node built the way the producer builds it — a real 2-rev proposal → `buildTransition`. The
 *  tests mutate THIS to break exactly one gate at a time; an unmutated one commits cleanly (the control). */
function validNodeFor(sbx: Sandbox): TransitionNode {
  const revIndex = createRevIndex(sbx.repoPath)
  const refBefore = revIndex.resolveAnchorAt(sbx.A, UNIT)!
  const refAfter = revIndex.resolveAnchorAt(sbx.B, UNIT)!
  const proposal: TransitionProposal = {
    kind: "transition",
    unitKey: UNIT,
    refBefore: { anchor: refBefore, path: UNIT },
    refAfter: { anchor: refAfter, path: UNIT },
    tier: "T2" as Tier,
    scope: unitScopeOf(UNIT),
    derivation: "unit changed content across the two revs (door-teeth fixture)",
  }
  return buildTransition(proposal)
}

/** The real governed door's transition-emit leg, under a chosen policy, as the direct-drive seam. */
function doorFor(sbx: Sandbox, policy: AtlasPolicy = POLICY): TransitionEmit {
  const store = createDiskStore(join(sbx.repoPath, ".atlas"))
  return createGovernedEmit({
    store,
    gate: STUB_GATE,
    policy,
    actor: ACTOR,
    origin: "promoted",
    ratifyToken: "seat:ratifier",
  }).emit as TransitionEmit
}

let sbx: Sandbox | undefined
afterEach(() => {
  sbx?.cleanup()
  sbx = undefined
})

describe("#234 F2 — the transition door refuses on its defense-in-depth gates (direct-drive, producer bypassed)", () => {
  it("CONTROL — a VALID node commits (so the refusals below isolate the broken field, not a broken fixture)", () => {
    sbx = makeRepo()
    const out = doorFor(sbx)(validNodeFor(sbx), AT)
    expect(out.emitted).toBe(true)
  })

  it("gate 0.1 TEETH — a ZERO-INTERVAL triple (shaBefore === shaAfter) is REFUSED cleanly, never a throw", () => {
    sbx = makeRepo()
    const valid = validNodeFor(sbx)
    const zeroInterval: TransitionNode = { ...valid, shaAfter: valid.shaBefore } // spans no interval ⇒ not a transition
    // A clean fail-closed verdict — NOT an escaping `transitionKey` throw (the whole reason gate 0.1 exists).
    const out = doorFor(sbx)(zeroInterval, AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected).toMatch(/malformed/i)
    expect(createTransitionLeg(createDiskStore(join(sbx.repoPath, ".atlas")))(UNIT)).toHaveLength(0)
  })

  it("gate 0.1 TEETH — an EMPTY unitKey is REFUSED cleanly", () => {
    sbx = makeRepo()
    const out = doorFor(sbx)({ ...validNodeFor(sbx), unitKey: "" }, AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected).toMatch(/malformed/i)
  })

  it("gate 1 TEETH — an UNGROUNDED node (empty rev-pair) is REFUSED (a transition MUST cite two revs)", () => {
    sbx = makeRepo()
    const ungrounded: TransitionNode = { ...validNodeFor(sbx), grounding: { entries: [] } }
    const out = doorFor(sbx)(ungrounded, AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected).toMatch(/malformed/i)
    expect(createTransitionLeg(createDiskStore(join(sbx.repoPath, ".atlas")))(UNIT)).toHaveLength(0)
  })

  it("gate 2.1 TEETH — an IN-SCOPE actor whose declared scope does NOT own the unit is REFUSED (ARCH-9)", () => {
    sbx = makeRepo()
    // ACTOR is in scope 'src' (gate 2 passes), but the policy binds the `src` prefix to a DIFFERENT scope
    // `core`, so the declared scope does not OWN the unit — authority cannot be borrowed from an unrelated dir.
    const out = doorFor(sbx, POLICY_FOREIGN_ANCHOR)(validNodeFor(sbx), AT)
    expect(out.emitted).toBe(false)
    expect(out.rejected).toMatch(/authoriz|anchor|own/i)
    // the guardrail: nothing landed — a gate-less path would have written it.
    expect(createTransitionLeg(createDiskStore(join(sbx.repoPath, ".atlas")))(UNIT)).toHaveLength(0)
  })
})
