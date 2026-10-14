// @atlas/adapter-io — test/harness/fix-scip.smoke.test.ts
//
// Fixture-infra sanity (NOT a golden): proves the frozen `fix.scip` oracle serializes to a real,
// re-decodable SCIP protobuf carrying exactly the three named occurrences with correct roles, so the SCIP
// reader WP starts from a sound base. Uses the raw `@c4312/scip` decode directly (independent of the
// not-yet-built reader).

import { describe, it, expect, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { deserializeSCIP, SymbolRole } from "@c4312/scip"
import { makeFixScip, expectedScipOutput, SYM_GREET, SYM_MISSING, type FixScip } from "./fix-scip.js"

describe("fix-scip harness (fixture infra)", () => {
  let fx: FixScip | undefined
  afterEach(() => fx?.cleanup())

  it("serializes a re-decodable SCIP index with exactly the three named occurrences + roles", () => {
    fx = makeFixScip()
    const idx = deserializeSCIP(readFileSync(fx.scipPath))
    const shape = idx.documents.map((d) => ({
      p: d.relativePath,
      occ: d.occurrences.map((o) => ({
        s: o.symbol,
        def: (o.symbolRoles & SymbolRole.Definition) !== 0,
      })),
    }))
    expect(shape).toEqual([
      { p: "src/util.ts", occ: [{ s: SYM_GREET, def: true }] },
      {
        p: "src/app.ts",
        occ: [
          { s: SYM_GREET, def: false },
          { s: SYM_MISSING, def: false },
        ],
      },
    ])
  })

  it("the oracle names a dangling ref (missingHelper) with no definition occurrence anywhere", () => {
    const defs = expectedScipOutput.documents.flatMap((d) =>
      d.occurrences.filter((o) => o.role === "definition").map((o) => o.symbol),
    )
    const refs = expectedScipOutput.documents.flatMap((d) =>
      d.occurrences.filter((o) => o.role === "reference").map((o) => o.symbol),
    )
    expect(refs).toContain(SYM_MISSING)
    expect(defs).not.toContain(SYM_MISSING) // no definition → dangling → downstream to:null
    expect(defs).toContain(SYM_GREET) // greet has an in-index definition → resolvable
  })
})
