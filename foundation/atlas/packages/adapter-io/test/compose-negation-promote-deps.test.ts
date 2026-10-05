// @atlas/adapter-io — test/compose-negation-promote-deps.test.ts  (#96 F2 — the promote leg's negation deps)
//
// THE DEFECT THIS GUARDS (bobby contract-review F2): `atlas promote` composes its governed emit door in
// `compose.ts`, and that door USED to omit the four negation-completeness deps the `atlas emit` door wires
// (`symbolReverse` / `axes` / `nodeHashOfPath` / `edgeModel`, wire.ts:217-220). `emitNegation` fail-closes
// the instant any of them is absent (governed-emit-negation.ts:178), ABSTAINING `scope-empty` for EVERY
// promoted negation regardless of the scope — so a mined negation over a real, non-empty directory could
// never be admitted through promote. This suite proves the wiring is now closed, at the REAL composition
// root, with a deps-LESS control that reproduces the pre-fix `scope-empty` to show the outcome is caused by
// the wiring and nothing else.

import { describe, it, expect, afterEach } from "vitest"
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs"
import { join } from "node:path"
import { asHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { CurrentNode, GroundedFact, NegationNode, StoreProjection } from "@atlas/knowledge"
import { composeRuntime } from "../src/compose.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { createGovernedPromote } from "../src/governed-promote.js"
import { createDiskStore } from "../src/store.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip } from "./harness/fix-scip.js"
import { makePromoteFixture } from "./harness/promote-fixtures.js"

const AT = asHash("cafe")
const CAS_REL = join(".atlas", "cas")

// The scope-empty abstention echo (governed-emit-negation.ts `REASON_TEXT['scope-empty']`) — the string a
// deps-LESS door returns for a negation it cannot even attempt to ground. Matched on the reason token, so it
// cannot be confused with `scope-open` (which is the SOUND deps-present abstention over an open scope).
const SCOPE_EMPTY = "scope-empty"

/** A well-formed negation over the REAL, non-empty scope directory `src` (it holds two files in fix-repo),
 *  targeting a GLOBAL SCIP symbol (NOT `local ` — that would abstain `target-not-global` BEFORE the deps
 *  gate and prove nothing). `grounding`/`edgeModel`/`id` are CONSTRUCTED at admit; the payload's are ignored. */
function negationOverSrc(): NegationNode {
  return {
    kind: "negation",
    id: "ignored" as unknown as NegationNode["id"],
    tier: "T2",
    relationKind: "calls",
    target: "scip:Nowhere#",
    scope: "src",
    grounding: { entries: [] },
    edgeModel: "ignored",
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
  } as unknown as NegationNode
}

/** Materialize a governed repo (fix-repo git tree + `.atlas/policy.json` + `.atlas/index.scip`) so
 *  `composeRuntime` builds a real index whose spatial rail carries the `src` directory. */
function makeGovernedRepo(): { repoPath: string; cleanup: () => void } {
  const repo = makeFixRepo()
  const scip = makeFixScip()
  const atlasDir = join(repo.repoPath, ".atlas")
  mkdirSync(atlasDir, { recursive: true })
  writeFileSync(
    join(atlasDir, "policy.json"),
    JSON.stringify({
      nearDup: { claimNormThreshold: 1 },
      t0Heuristic: { keywords: [] },
      authz: { scopes: { src: ["alice"] } },
    }),
  )
  copyFileSync(scip.scipPath, join(atlasDir, "index.scip"))
  return {
    repoPath: repo.repoPath,
    cleanup: () => {
      scip.cleanup()
      repo.cleanup()
    },
  }
}

/** Seed ONE staged negation onto the repo's durable staging sidecar exactly as `mine` does — bytes into CAS
 *  first, then a row naming their address — so the SEPARATELY-constructed `composeRuntime` reads it back. */
function stageNegation(repoPath: string, fact: NegationNode): void {
  const store = createDiskStore(join(repoPath, CAS_REL))
  const contentHash = store.put(fact as never) as unknown as string
  store.commitStaging<undefined>((p) => ({
    out: undefined,
    next: {
      current: new Map<string, CurrentNode>([
        ...p.current,
        [
          "nk-staged-negation",
          { nodeKey: "nk-staged-negation", family: "negation", contentHash, claims: [] } as unknown as CurrentNode,
        ],
      ]),
      cas: new Set<string>([...p.cas, contentHash]),
    } as unknown as StoreProjection,
    put: [],
  }))
}

let cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.forEach((c) => c())
  cleanups = []
})

describe("#96 F2 — the `atlas promote` leg reaches emitNegation WITH its completeness deps", () => {
  it("a staged negation over a REAL non-empty scope does NOT abstain scope-empty through composeRuntime().promote", () => {
    const repo = makeGovernedRepo()
    cleanups.push(repo.cleanup)
    stageNegation(repo.repoPath, negationOverSrc())

    const out = composeRuntime(repo.repoPath).promote(AT)

    // The staged row was FOUND and PRESENTED to the door (not a vacuous 0-candidate pass).
    expect(out.read).toBe(true)
    expect(out.candidates).toBe(1)
    // THE ASSERTION: the promote door reached `emitNegation` with its deps satisfied, so the negation is
    // decided on its MERITS (admitted, or a sound scope-open / refuted / authz outcome) — NEVER the
    // deps-missing `scope-empty` fail-close the pre-fix wiring produced for every promoted negation.
    const rejected = out.rows[0]!.rejected ?? ""
    expect(rejected).not.toContain(SCOPE_EMPTY)
  })

  it("CONTROL — the SAME negation through a deps-LESS emit door DOES abstain scope-empty (the pre-fix wiring)", () => {
    // The other half of the teeth: the deps-less door (the exact shape `compose.ts` had before F2 — no
    // `symbolReverse`/`axes`/`nodeHashOfPath`/`edgeModel`) fail-closes `scope-empty` on the identical fact.
    // This is what proves the case above is caused by the WIRING and not by anything about the negation.
    const fx = makePromoteFixture()
    const contentHash = fx.store.put(negationOverSrc() as unknown as GroundedFact as never) as unknown as string
    fx.store.commitStaging<undefined>((p) => ({
      out: undefined,
      next: {
        current: new Map<string, CurrentNode>([
          ...p.current,
          [
            "nk-staged-negation",
            { nodeKey: "nk-staged-negation", family: "negation", contentHash, claims: [] } as unknown as CurrentNode,
          ],
        ]),
        cas: new Set<string>([...p.cas, contentHash]),
      } as unknown as StoreProjection,
      put: [],
    }))

    const depsLess = createGovernedPromote({
      store: fx.store,
      emit: createGovernedEmit({
        store: fx.store,
        gate: { gateHolds: () => "HOLDS" } as never,
        policy: { t0Heuristic: { keywords: [] }, authz: { scopes: { src: ["alice"] } } },
        actor: "alice",
        origin: "promoted",
        // NO negation deps — the pre-F2 shape.
      }).emit,
    })

    const out = depsLess.promote(AT as unknown as Hash)
    expect(out.candidates).toBe(1)
    expect(out.rows[0]!.rejected ?? "").toContain(SCOPE_EMPTY)
  })
})
