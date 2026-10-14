// @atlas/cli — test/mine-provable-frontier-proposer.test.ts  (PROVABLE-FRONTIER AC-3 — resolveProposer exposes
// the faithful per-arm provability precondition, built from the SAME reader that feeds the candidate list)
//
// The sound arms (`dependency`/`count`) reorder the PPR-ranked frontier provable-first. The precondition is not
// a second oracle: it is `reader.candidates(site).length > 0` over the EXACT `CandidateReader` the proposer's
// prompt selects from — so a site the model would have no candidate to pick at is exactly a site the sound
// oracle cannot admit. This pins:
//   · dependency ⇒ a unit WITH a cross-unit dep is provable; a dep-SINK (references nothing cross-unit) is not.
//   · count      ⇒ a unit whose export HAS external callers is provable; one with none is not (the fan-in dual).
//   · advisory   ⇒ provableFirst is UNDEFINED (no reorder — the advisory frontier stays byte-identical).

import { describe, it, expect, afterAll } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { create } from "@bufbuild/protobuf"
import {
  serializeSCIP,
  IndexSchema,
  MetadataSchema,
  ToolInfoSchema,
  DocumentSchema,
  OccurrenceSchema,
  SymbolRole,
} from "@c4312/scip"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"

import { resolveProposer, MINE_SLOT_ENV } from "../src/mine-proposer.js"

const scratch: string[] = []
afterAll(() => {
  while (scratch.length > 0) rmSync(scratch.pop()!, { recursive: true, force: true })
})

const HASH = "scip-typescript npm @atlas/lib 0.0.0 src/`lib.ts`/Hash#" // DEFINED in lib.ts
const CHARGE = "scip-typescript npm @atlas/lib 0.0.0 src/`sink.ts`/charge()." // DEFINED in sink.ts, never referenced elsewhere

/** A repo carrying a real `.atlas/index.scip` (serialized) whose dep graph is:
 *   · src/consumer.ts REFERENCES Hash (defined in lib.ts) ⇒ a cross-unit DEP  ⇒ provable for `dependency`.
 *   · src/lib.ts DEFINES Hash, which consumer.ts calls    ⇒ external CALLERS ⇒ provable for `count`.
 *   · src/sink.ts DEFINES charge and references nothing cross-unit; charge has no external caller
 *     ⇒ a dependency SINK (no outgoing cross-unit dep) AND no fan-in ⇒ NOT provable for either arm. */
function makeRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "atlas-provable-frontier-repo-"))
  scratch.push(repo)
  mkdirSync(join(repo, ".atlas"), { recursive: true })
  const occ = (symbol: string, def: boolean) =>
    create(OccurrenceSchema, { symbol, symbolRoles: def ? SymbolRole.Definition : 0 })
  const index = create(IndexSchema, {
    metadata: create(MetadataSchema, { toolInfo: create(ToolInfoSchema, { name: "scip-typescript" }) }),
    documents: [
      create(DocumentSchema, { relativePath: "src/lib.ts", occurrences: [occ(HASH, true)] }),
      create(DocumentSchema, { relativePath: "src/consumer.ts", occurrences: [occ(HASH, false)] }),
      create(DocumentSchema, { relativePath: "src/sink.ts", occurrences: [occ(CHARGE, true)] }),
    ],
  })
  writeFileSync(join(repo, ".atlas", "index.scip"), serializeSCIP(index))
  return repo
}

/** A wired operator config OUTSIDE the repo (ADR-0011 two-scope split), pointing `resolveProposer` at a
 *  harmless resolvable command so the WIRED path (which reads the SCIP + builds provableFirst) is exercised. */
function wiredEnv(slot?: string): NodeJS.ProcessEnv {
  const cfgDir = mkdtempSync(join(tmpdir(), "atlas-provable-frontier-cfg-"))
  scratch.push(cfgDir)
  const cfg = join(cfgDir, "model.json")
  writeFileSync(cfg, JSON.stringify({ roles: { propose: { cmd: "echo", args: [] } } }))
  return { ATLAS_MODEL_CONFIG: cfg, ...(slot !== undefined ? { [MINE_SLOT_ENV]: slot } : {}) }
}

const site = (path: string): StructRef => ({
  kind: "file",
  qualifiedPath: path,
  subtreeHash: asSubtreeHash(`st-${path}`),
})

describe("PROVABLE-FRONTIER AC-3 — resolveProposer builds the per-arm provability precondition", () => {
  it("dependency ⇒ a unit WITH a cross-unit dep is provable; a dep-sink is NOT", () => {
    const repo = makeRepo()
    const resolved = resolveProposer(repo, wiredEnv("dependency"))
    expect(resolved.wired).toBe(true)
    expect(resolved.provableFirst).toBeTypeOf("function")

    // teeth: consumer.ts references Hash (defined in lib.ts) ⇒ a real cross-unit dep ⇒ candidates non-empty.
    expect(resolved.provableFirst!(site("src/consumer.ts"))).toBe(true)
    // lib.ts only DEFINES Hash (no outgoing cross-unit dep) and sink.ts references nothing cross-unit ⇒ sinks.
    expect(resolved.provableFirst!(site("src/lib.ts"))).toBe(false)
    expect(resolved.provableFirst!(site("src/sink.ts"))).toBe(false)
  })

  it("count ⇒ a unit whose export HAS external callers is provable; one with none is NOT (fan-in dual)", () => {
    const repo = makeRepo()
    const resolved = resolveProposer(repo, wiredEnv("count"))
    expect(resolved.provableFirst).toBeTypeOf("function")

    // lib.ts defines Hash, which consumer.ts calls ⇒ an externally-called export ⇒ provable for count.
    expect(resolved.provableFirst!(site("src/lib.ts"))).toBe(true)
    // consumer.ts defines no externally-called export; sink.ts's charge has no caller ⇒ not provable.
    expect(resolved.provableFirst!(site("src/consumer.ts"))).toBe(false)
    expect(resolved.provableFirst!(site("src/sink.ts"))).toBe(false)
  })

  it("advisory ⇒ provableFirst is UNDEFINED (no reader, no reorder — the advisory frontier stays byte-identical)", () => {
    const repo = makeRepo()
    const resolved = resolveProposer(repo, wiredEnv()) // no ATLAS_MINE_SLOT ⇒ advisory
    expect(resolved.wired).toBe(true)
    expect(resolved.provableFirst).toBeUndefined()
  })
})
