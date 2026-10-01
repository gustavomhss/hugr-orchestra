// @atlas/cli — test/mine-decide-seal-carry.test.ts  (SEAL-CARRY-WRITE-DOOR — the TRUSTED seal write-gate)
//
// ADR-0017's `seal` (`proven`) is a TRUST SIGNAL: it is set ONLY by the sound admit path (`buildSound`,
// genesis admit-harness.ts:377) after the oracle verdict, and the ONE door allowed to stamp it onto the
// durable row is the mine emit path (`decideStaging` → `knowledgeUpsert`, mine-decide.ts). The operator
// emit door (`atlas emit <json>`) STRIPS any payload-supplied seal (billy T0 — a forgeable trust signal;
// pinned in adapter-io/test/governed-emit.test.ts). This file pins the trusted half end to end through the
// REAL durable store: a `buildSound`-admitted fact's `seal:'proven'` reaches the durable projection row.
//
// [RED before the mine-path seal carry] With no `...(f.seal !== undefined ? { seal: f.seal } : {})` on the
// mine WriteRequest (mine-decide.ts), the row never carries a seal — `.toBe('proven')` reads undefined.

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { emptyStore } from "@atlas/knowledge"
import { createDiskStore, rehydrateProjection } from "@atlas/adapter-io"
import type { CasPath } from "@atlas/adapter-io"
import { decideStaging } from "../src/mine-decide.js"
import { A, ZERO_SIGNALS, factFor } from "./mine-fixtures.js"
import type { Candidate, Fact } from "@atlas/genesis"

const cand: Candidate = { site: A, signals: ZERO_SIGNALS, ppr: 1, rank: 0 }
/** A fact as the SOUND admit path hands it to the emit path: `seal:'proven'` is set by buildSound only. */
const provenFact = (claim: string): Fact => ({ ...factFor(cand, claim), seal: "proven" }) as unknown as Fact
const proseFact = (claim: string): Fact => factFor(cand, claim) as unknown as Fact

const dirs: string[] = []
const freshDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-mine-seal-"))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe("decideStaging — SEAL-CARRY: the trusted mine path carries a proven seal to the DURABLE row", () => {
  it("AC-3 (trusted path) — a buildSound-admitted `seal:proven` fact lands on the durable row and rehydrates with the seal", () => {
    const dir = freshDir()
    const store = createDiskStore(dir as unknown as CasPath)
    const dec = decideStaging(emptyStore(), [provenFact("greet greets")], new Map())
    for (const o of dec.put ?? []) store.put(o) // CAS bytes durable before the row publishes
    store.persistProjection(dec.next!) // publish the projection sidecar (the durable surface)

    // in-projection row carries the seal…
    const row = [...dec.next!.current.values()][0]!
    expect(row.seal).toBe("proven")

    // …and it round-trips through the REAL durable store in a FRESH process (not a fakeStore).
    const rehydrated = [...rehydrateProjection(createDiskStore(dir as unknown as CasPath)).current.values()][0]!
    expect(rehydrated.seal).toBe("proven") // ⚑ RED without the mine-path seal carry
  })

  it("AC-4 (back-compat) — an advisory-prose fact (no seal) carries NO seal on the durable row", () => {
    const dec = decideStaging(emptyStore(), [proseFact("no seal here")], new Map())
    const row = [...dec.next!.current.values()][0]!
    expect(row.seal).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(row, "seal")).toBe(false) // truly absent
  })
})
