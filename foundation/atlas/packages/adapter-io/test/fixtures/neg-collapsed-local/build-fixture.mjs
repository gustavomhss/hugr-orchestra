// #99 F3 — generator for the FROZEN reduced SCIP fixture (`collapsed-local.scip`, a few hundred bytes).
// Committed alongside the binary so the fixture is reproducible: `node build-fixture.mjs` rewrites the .scip.
//
// It isolates the collapsed cross-package `local` worst case with NOTHING to mask it:
//   · brand.ts          — ONE `definition`-role GLOBAL `asNodeKey` (the real target).
//   · negation-key.ts   — ONE `reference`-role `local 0` (the collapsed cross-package call of asNodeKey),
//                         stdlib refs STRIPPED ⇒ the collapsed local is the SOLE completeness gap.
//   · companion.ts      — a GLOBAL `helper` (uncalled) + a GENUINE `local 2` present as BOTH a `definition`
//                         and a `reference` (a real intra-doc block-const) ⇒ NOT opaque (precision boundary).
// metadata.toolInfo.name = 'scip-typescript' so the collapsed-local indexer gate trusts the heuristic.
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { create } from "@bufbuild/protobuf"
import * as scip from "@c4312/scip"

const DEF = 1 // SymbolRole.Definition bit; a reference occurrence is symbolRoles=0.
const occ = (symbol, def) => create(scip.OccurrenceSchema, { symbol, symbolRoles: def ? DEF : 0, range: [0, 0, 1] })
const doc = (relativePath, occurrences) =>
  create(scip.DocumentSchema, { relativePath, language: "typescript", occurrences })

const ASNODEKEY = "scip-typescript npm @atlas/knowledge 0.0.0 src/brand.ts/asNodeKey()."
const HELPER = "scip-typescript npm @atlas/other 0.0.0 src/companion.ts/helper()."

const index = create(scip.IndexSchema, {
  metadata: create(scip.MetadataSchema, {
    toolInfo: create(scip.ToolInfoSchema, { name: "scip-typescript", version: "0.4.0" }),
    projectRoot: "file:///fixture",
  }),
  documents: [
    doc("packages/knowledge/src/brand.ts", [occ(ASNODEKEY, true)]),
    // The collapsed cross-package call — a lone reference-role `local 0` with NO local def in this doc.
    doc("packages/knowledge/src/negation-key.ts", [occ("local 0", false)]),
    // Precision boundary: global helper def + a genuine intra-doc local (def AND ref of the same `local 2`).
    doc("packages/other/src/companion.ts", [occ(HELPER, true), occ("local 2", true), occ("local 2", false)]),
  ],
})

const out = join(dirname(fileURLToPath(import.meta.url)), "collapsed-local.scip")
writeFileSync(out, scip.serializeSCIP(index))
console.log("wrote", out, scip.serializeSCIP(index).length, "bytes")
