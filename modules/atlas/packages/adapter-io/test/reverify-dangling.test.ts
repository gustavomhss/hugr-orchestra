// @atlas/adapter-io — test/reverify-dangling.test.ts
//
// The `dangling` bucket: a `seal:'proven'` row whose CAS bytes are GONE.
//
// WHAT THIS IS EVIDENCE FOR. `driftPairsOf` dropped unresolvable rows — its own doc said so — silently and
// uncounted, and `read-access.ts`'s committed-store pass did the same thing in its own loop. Measured on
// this repository's own store: 17 rows carry `seal:'proven'`, every one of their objects is missing, and
// `atlas verify-store` printed `0 sealed-proven fact(s) — 0 re-proven, 0 broken, 0 unverifiable` under
// guidance reading "an honest zero, not a skip". It was a skip, and the sentence denying it is what made it
// dangerous: the gate whose job is to catch a proven fact that stopped being true reported a clean, empty
// store — for the one fault it could not see, because the facts themselves are what went missing.
//
// Every assertion below is paired with a control, because "the bucket is non-empty" is satisfiable by a
// counter that counts everything.

import { describe, it, expect } from "vitest"
import { reverifyStore, danglingRow } from "../src/reverify-store.js"
import type { ReverifyReport } from "../src/reverify-store.js"
import type { CurrentNode } from "@atlas/knowledge"

const node = (nodeKey: string, seal?: string): CurrentNode =>
  ({ nodeKey, contentHash: `${nodeKey}-hash`, seal, claims: [], family: "advisory" }) as unknown as CurrentNode

/** No pairs, no oracle calls — this suite is about the ROWS that never reach the oracle. */
const report = (dangling: readonly CurrentNode[]): ReverifyReport =>
  reverifyStore(
    [],
    null as never,
    () => true,
    () => true,
    undefined,
    dangling,
  )

describe("the counted skip", () => {
  it("CONTROL: no dangling rows ⇒ the honest zero really is one", () => {
    // Without this, a bucket that counted a phantom row would satisfy every assertion below.
    expect(report([])).toMatchObject({ sealedProven: 0, dangling: 0, rows: [] })
  })

  it("a dangling row is COUNTED, in its own bucket, and lands in the denominator", () => {
    const r = report([node("n1", "proven")])
    expect(r.dangling).toBe(1)
    expect(r.sealedProven).toBe(1) // the denominator is what the pass CONSIDERED, not what it could read
    expect(r.reProven).toBe(0)
    expect(r.broken).toBe(0)
    expect(r.unverifiable).toBe(0) // NOT folded into an existing bucket — different fault, different name
  })

  it("the row NAMES the node and the address that resolves to nothing", () => {
    const [row] = report([node("n1", "proven")]).rows
    expect(row?.nodeKey).toBe("n1")
    expect(row?.outcome).toBe("dangling")
    expect(row?.reason).toContain("n1-hash")
    expect(row?.reason).toContain("doctor cas") // the leg that audits the layer this fault lives in
  })

  it("the DEFAULT is empty — which is the one thing that could quietly re-open the hole", () => {
    // `dangling` defaults to `[]` so every pre-existing caller keeps its exact behaviour. That default is
    // also exactly how the production path could silently stop counting again, so it is pinned here: the
    // composition root MUST pass `danglingOf(store)`, and `compose.ts` does.
    expect(
      reverifyStore(
        [],
        null as never,
        () => true,
        () => true,
      ),
    ).toMatchObject({ dangling: 0 })
  })

  it("one row shape, minted in ONE place — the two report paths cannot disagree", () => {
    // `read-access.ts` builds its own report for a committed store. The defect being fixed was those two
    // paths independently deciding what to do with an unresolvable row.
    const direct = danglingRow(node("n7", "proven"))
    const viaPass = report([node("n7", "proven")]).rows[0]
    expect(viaPass).toEqual(direct)
  })
})
