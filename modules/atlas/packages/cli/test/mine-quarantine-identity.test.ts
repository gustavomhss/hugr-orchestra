// @atlas/cli — test/mine-quarantine-identity.test.ts  (genesis-hardening A8 — a quarantined fact never shares a row)
//
// A quarantined advisory and a plain advisory at the SAME anchor mint the same intrinsic key (`anchor ‖ slot`,
// no slot). `decideStaging` gives the quarantined one its own derived key, so they stage as TWO rows — in one
// pass, and across arms in either order — and the plain row's bytes are never the quarantined fact's (or the
// reverse). That the promote door then promotes the plain row and refuses the quarantined one is pinned in
// adapter-io (`governed-promote-quarantine.test.ts`, same-anchor case).

import { describe, it, expect } from "vitest"
import type { Candidate, Fact } from "@atlas/genesis"
import { emptyStore } from "@atlas/knowledge"
import type { StoreProjection } from "@atlas/knowledge"
import { id } from "@atlas/kernel"
import { decideStaging } from "../src/mine-decide.js"
import { factFor, FRONTIER, ZERO_SIGNALS } from "./mine-fixtures.js"

const cand: Candidate = { site: FRONTIER[0]!, rank: 1, ppr: 1, signals: ZERO_SIGNALS }
const plain = factFor(cand, "the plain advisory claim")
const quarantined = { ...factFor(cand, "the abstained dependency claim"), quarantine: "abstained-proof" } as Fact

/** Which staged row holds which fact: row key → whether the fact `minted` under it is quarantined. */
const rowsOf = (out: ReturnType<typeof decideStaging>["out"]): Map<string, boolean> =>
  new Map([...out].map(([k, f]) => [k, f.kind === "advisory" && f.quarantine !== undefined]))

const next = (d: ReturnType<typeof decideStaging>): StoreProjection => d.next!

describe("genesis-hardening A8 — quarantined and plain advisories never share a staging row", () => {
  it("same pass, same anchor ⇒ two rows, each holding only its own kind of fact", () => {
    const d = decideStaging(emptyStore(), [plain, quarantined], new Map())
    expect(next(d).current.size).toBe(2)
    expect([...rowsOf(d.out).values()].sort()).toEqual([false, true])
    // each row names its OWN bytes: the quarantined row's contentHash is the quarantined fact's content
    for (const [key, isQuarantined] of rowsOf(d.out)) {
      const row = next(d).current.get(key)!
      expect(row.contentHash).toBe(String(id(d.out.get(key) as never)))
      expect(row.claims).toEqual([isQuarantined ? "the abstained dependency claim" : "the plain advisory claim"])
    }
  })

  it.each([
    ["advisory arm first", [plain], [quarantined]],
    ["dependency arm first", [quarantined], [plain]],
  ] as const)("across arms (%s) ⇒ both stay distinguishable rows", (_, first, second) => {
    const a = decideStaging(emptyStore(), first, new Map())
    // A later pass never re-authors a row an earlier pass staged — so before A8 the second arm's fact was dropped.
    const b = decideStaging(next(a), second, new Map())
    expect(next(b).current.size).toBe(2)
    expect(b.out.size).toBe(1) //                         the second arm's fact was staged, not skipped
    const [firstKey] = [...a.out.keys()]
    expect(next(b).current.get(firstKey!)!.contentHash).toBe(next(a).current.get(firstKey!)!.contentHash)
  })
})
