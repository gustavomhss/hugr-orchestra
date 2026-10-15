// @atlas/adapter-io — test/door-regression-malformed-check-shape.test.ts  (DOOR-LEVEL, defect #150)
//
// SCOPE. `isCheck` (governed-emit-identity.ts) validates the SHAPE of a `kind:'predicate'` node's `check`
// field only — `kind ∈ {'index-query','assertion'}` and the matching body field (`query`/`expr`) is
// `typeof === 'string'`. It never validates the STRING'S GRAMMAR (that is `evaluator.ts`'s job, later, and
// per #200 that separation is deliberate and untouched here). What had ZERO coverage was the door's
// REJECTION surface for a malformed `check` SHAPE: no test fed a bad shape in and asserted gate 0 refuses
// it before anything is persisted.
//
// Every case below drives the REAL `createGovernedEmit` door (no reducer double) with a `kind:'predicate'`
// node whose `check` is malformed in shape, and asserts `emitted:false` with `REJECTED_MALFORMED_FAMILY` —
// the exact refusal `familyOf` produces when `isCheck(check)` is false for a `kind:'predicate'` node. One
// positive control (a well-formed `check`) is included so the reject assertions are not vacuous.

import { afterEach, describe, expect, it } from "vitest"
import { createGovernedEmit } from "../src/governed-emit.js"
import { AT, HOLDS, freshWorkspace, policyOf } from "./door-regression-support.js"
import type { Workspace } from "./door-regression-support.js"
import { asNodeKey, asSubtreeHash } from "@atlas/kernel"
import type { GroundedFact } from "@atlas/knowledge"
import { REJECTED_MALFORMED_FAMILY } from "../src/governed-emit-reasons.js"

const ANCHOR = "src/ledger.ts::post"

/** A `kind:'predicate'` payload whose `check` is `checkOverride` — typed through `unknown` because the TS
 *  union forbids most of these shapes, which is the point: `atlas emit` is `JSON.parse` + a cast, so the
 *  wire can produce exactly this and the type system is not in the path. */
function predicateWith(checkOverride: unknown, gen = 1): GroundedFact {
  const raw = {
    kind: "predicate",
    id: asNodeKey("gen-" + String(gen)),
    tier: "T2",
    check: checkOverride,
    grounding: {
      entries: [
        { anchor: { kind: "symbol", qualifiedPath: ANCHOR, subtreeHash: asSubtreeHash("sh-door") }, path: "x" },
      ],
    },
    status: "HOLDS",
    freshness: "FRESH",
    claims: [],
    authoring: "PREDICATED",
    predicateSlot: "invariant",
    scope: "core",
  }
  return raw as unknown as GroundedFact
}

let ws: Workspace | undefined

function cleanup(): void {
  if (ws !== undefined) ws.dispose()
  ws = undefined
}
afterEach(cleanup)

describe("DOOR REGRESSION — gate 0 refuses a predicate whose `check` is malformed in SHAPE (#150)", () => {
  function driveWith(checkOverride: unknown) {
    ws = freshWorkspace()
    const policy = policyOf({ core: ["alice"] })
    const alice = createGovernedEmit({ store: ws.store, gate: HOLDS, policy, actor: "alice", ratifyToken: "lead" })
    return alice.emit(predicateWith(checkOverride), AT)
  }

  it("CHECK-SHAPE-1 — a bogus `check.kind` is refused", () => {
    const out = driveWith({ kind: "nonsense", expr: "x" })
    expect(out.emitted).toBe(false)
    expect(out.rejected).toBe(REJECTED_MALFORMED_FAMILY)
  })

  it("CHECK-SHAPE-2 — `check.expr` not a string is refused", () => {
    const out = driveWith({ kind: "assertion", expr: 123 })
    expect(out.emitted).toBe(false)
    expect(out.rejected).toBe(REJECTED_MALFORMED_FAMILY)
  })

  it("CHECK-SHAPE-3 — `check.query` not a string (index-query) is refused", () => {
    const out = driveWith({ kind: "index-query", query: null })
    expect(out.emitted).toBe(false)
    expect(out.rejected).toBe(REJECTED_MALFORMED_FAMILY)
  })

  it("CHECK-SHAPE-4 — a bare string `check` (not an object) is refused", () => {
    const out = driveWith("assertion: x")
    expect(out.emitted).toBe(false)
    expect(out.rejected).toBe(REJECTED_MALFORMED_FAMILY)
  })

  it("CHECK-SHAPE-5 — `check` missing the matching body field is refused", () => {
    const out = driveWith({ kind: "assertion" })
    expect(out.emitted).toBe(false)
    expect(out.rejected).toBe(REJECTED_MALFORMED_FAMILY)
  })

  it("CHECK-SHAPE-CONTROL — a well-formed `check` is accepted (positive control)", () => {
    const out = driveWith({ kind: "assertion", expr: "balance is never negative" })
    expect(out.emitted).toBe(true)
  })
})
