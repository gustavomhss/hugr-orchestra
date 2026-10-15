// @atlas/adapter-io — test/governed-emit-addressable.test.ts
//
// THE DEFECT (task #136, deliverable 2): a canonical-form violation reached the operator as `status: error`
// / exit 1, while `@atlas/tools` `faultOf` classified the very same verdict as `refused`. MEASURED end to end
// through the REAL `atlas` binary before this fix:
//
//   emit <a grounded fact carrying `confidence: 0.5`>  → exit 1 · `status: error`
//     reason: canonical-form violation: floats forbidden (non-integer/non-finite number)
//   emit <an ungrounded fact>                          → exit 2 · `status: rejected`
//   faultOf(<either verdict>)                          → 'refused'   (BOTH)
//
// THE DECISION TAKEN, and it is deliberately NOT a change to either classifier: THE EXIT CODE FOLLOWS THE
// DOOR'S RECORD. `deriveStatus` (cli/src/map.ts) was right — it is a pure function of one verdict and reads
// the record a governed door carries back. What was wrong is that the door HAD MADE A DECISION AND FAILED TO
// RECORD IT: `id(node)` sat unguarded inside the commit's `decide` callback, so a violation escaped as a
// throw out of the middle of a governed write, and a throw carries no `EmitOut`.
//
// Following the FAULT CLASS instead was measured and rejected: `faultOf({rejected: "tool 'atlas-query' not
// wired at this seam"})` is also `'refused'`, so routing exit codes through it re-classifies an UNWIRED TOOL
// as a governance refusal — which contradicts the golden SCN-CLI-3b-1's own text ("`1` for `error`") and is
// the exact widening `cli/src/render.ts` documents as forbidden.
//
// KERNEL-1 is a ratified LAW ("floats forbidden", "fail-closed reject … never emit two CAS objects for one
// fact"), and ADR-0003 states the governed-door property invariant as: a refusal is FAIL-CLOSED-VISIBLE on
// both transports — CLI exit 2 / MCP `isError`. MCP already answered `isError`; only the exit code dissented.
//
// AN ENGINE FAULT IS NOT A DECISION and must not be laundered into one: the `cyclic` shape exhausts the stack
// and arrives as a `RangeError`, which `fault.ts` files as `internal-fault` ("a defect in Atlas, not in your
// arguments"). It is re-thrown unchanged, and that boundary is pinned below.

import { describe, it, expect, afterEach } from "vitest"
import { existsSync, readdirSync } from "node:fs"
import { dirname } from "node:path"
import { createGovernedEmit } from "../src/governed-emit.js"
import { AT, HOLDS, advisoryFact, freshWorkspace, policyOf, reasonOf } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"
import { SHAPES, assertPremise } from "./uncanonicalizable-shapes.js"

const ACTOR = "alice"
const SCOPE = "core"
const ANCHOR = "src/a.ts::f"

/** The canonicalizer's own name for every one of its refusals (`kernel/canonical.ts`). */
const CANONICAL_VIOLATION = "canonical-form violation"
/** The name the CAS gives bytes it cannot store — shared with `sidecar-commit.ts`, `archive.ts`, `attach.ts`. */
const UNADDRESSABLE = "unaddressable-cas-object"

let ws: Workspace | undefined
afterEach(() => {
  ws?.dispose()
  ws = undefined
})

function doorOver(w: Workspace): ReturnType<typeof createGovernedEmit> {
  return createGovernedEmit({
    store: w.store,
    gate: HOLDS,
    policy: policyOf({ [SCOPE]: [ACTOR] }),
    actor: ACTOR,
    ratifyToken: "billy",
  })
}

/** Every durable artefact of a write, read off the FILESYSTEM — nothing here trusts a return value. */
function durableState(w: Workspace): { cas: number; generations: string[] } {
  const casDir = w.casPath
  const cas = existsSync(casDir)
    ? readdirSync(casDir, { recursive: true, encoding: "utf8" }).filter((f) => f.includes("/")).length
    : 0
  const generations = existsSync(dirname(casDir))
    ? readdirSync(dirname(casDir))
        .filter((f) => /^projection\.\d+\.json$/.test(f))
        .sort()
    : []
  return { cas, generations }
}

describe("the emit door RECORDS a canonical-form refusal instead of throwing out of its own decision", () => {
  it("PREMISE: the shapes are ones the sealed `id` genuinely refuses", () => {
    assertPremise()
  })

  it("CONTROL: a clean fact is still admitted, durably", () => {
    ws = freshWorkspace()
    expect(
      doorOver(ws).emit(advisoryFact({ anchor: ANCHOR, scope: SCOPE, claimNorm: "a clean claim" }), AT).emitted,
    ).toBe(true)
    expect(durableState(ws)).toStrictEqual({ cas: 1, generations: ["projection.1.json"] })
  })

  // The seven shapes the CANONICALIZER decides on. `cyclic` is excluded here and pinned separately below —
  // it is an engine `RangeError`, i.e. not a decision at all.
  for (const shape of SHAPES.filter((s) => s.name !== "cyclic")) {
    it(`'${shape.name}' comes back as a RECORDED refusal (emitted:false), not as a throw`, () => {
      ws = freshWorkspace()
      const door = doorOver(ws)
      const poisoned = shape.inject(
        advisoryFact({ anchor: ANCHOR, scope: SCOPE, claimNorm: "the poisoned write" }) as unknown as Record<
          string,
          unknown
        >,
      ) as unknown as Parameters<typeof door.emit>[0]

      // A RECORD, not an exception: this is what makes `deriveStatus` answer `rejected` (exit 2) rather than
      // fall through to the `ok:false` ⇒ `error` (exit 1) branch, with no change to `deriveStatus` itself.
      const out = door.emit(poisoned, AT)
      expect(out.emitted).toBe(false)
      expect(reasonOf(out.rejected)).toBe(CANONICAL_VIOLATION)
      // and it is still fail-CLOSED: nothing durable, exactly as when it threw.
      expect(durableState(ws)).toStrictEqual({ cas: 0, generations: [] })
    })
  }

  it("a violation parked in a KERNEL-8 SIDE-INDEX is recorded too — the leg `id(node)` alone cannot see", () => {
    // MEASURED (task #136): `sidecar-commit.ts` states "No product caller reaches it today — both governed
    // doors compute `id(node)` themselves before handing the same object over, so an unaddressable object
    // never gets this far". That is FALSE. `canonicalForm` EXCLUDES `grounding`/`status`/`freshness` at every
    // level (KERNEL-8), so a bigint parked in `grounding` — a field on EVERY `GroundedFact` — canonicalizes
    // fine, clears every gate, and reaches the commit's CAS door, which answers the EMPTY sentinel. The guard
    // there fired correctly (nothing durable) but as an ESCAPING THROW, i.e. exit 1 again.
    ws = freshWorkspace()
    const door = doorOver(ws)
    const base = advisoryFact({ anchor: ANCHOR, scope: SCOPE, claimNorm: "c" })
    const poisoned = { ...base, grounding: { ...base.grounding, seq: BigInt(10) } } as unknown as Parameters<
      typeof door.emit
    >[0]
    const out = door.emit(poisoned, AT)
    expect(out.emitted).toBe(false)
    expect(reasonOf(out.rejected)).toBe(UNADDRESSABLE)
    expect(durableState(ws)).toStrictEqual({ cas: 0, generations: [] })
  })

  it("an ENGINE fault is NOT laundered into a governance refusal — `cyclic` still throws a RangeError", () => {
    ws = freshWorkspace()
    const door = doorOver(ws)
    const base = advisoryFact({ anchor: ANCHOR, scope: SCOPE, claimNorm: "c" }) as unknown as Record<string, unknown>
    const cyc: Record<string, unknown> = { ...base }
    cyc["atlasProbeSelf"] = cyc
    let thrown: unknown
    try {
      door.emit(cyc as unknown as Parameters<typeof door.emit>[0], AT)
    } catch (e) {
      thrown = e
    }
    // `fault.ts` files a `RangeError` as `internal-fault`, and it is right to: a stack exhaustion is not a
    // decision the door made. Recording it as `emitted:false` would put OUR defect behind the caller's name.
    expect(thrown).toBeInstanceOf(RangeError)
    expect(durableState(ws)).toStrictEqual({ cas: 0, generations: [] })
  })
})
