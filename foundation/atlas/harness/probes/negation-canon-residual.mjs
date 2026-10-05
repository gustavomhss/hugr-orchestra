// REPRODUCE: node harness/probes/negation-canon-residual.mjs  (from repo root, fresh .atlas/index.scip)
// Measures the ADR-0016 canon-completeness residual: holes in a src/ doc whose symbol is an @atlas
// GLOBAL top-level export that canon missed (the false-admit channel if holeSources is dropped).
// EXPECTED (measured on atlas, 2026-08-13): threatening: 0 (typeLiteral type-member holes excluded
// as non-threatening erased type navigations).
import { deserializeSCIP } from "@c4312/scip"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const isLocal = (s) => s.startsWith("local ")
const canon = (s) => s.replace(/ dist\/(?:src\/)?((?:[^`]*\/)?`[^`]+)\.d\.ts`/, " src/$1.ts`")
function isGlobalExportRef(sym) {
  const m = sym.match(/^scip-typescript npm \S+ \S+ (.+)$/)
  if (!m) return false
  const seg = m[1].replace(/`/g, "").split("/")
  const i = seg.findIndex((s) => /\.tsx?$/.test(s))
  if (i === -1 || i + 1 >= seg.length) return false
  const after = seg.slice(i + 1)
  if (after.length !== 1) return false
  return /(#|\(\)\.|\.)$/.test(after[0]) && !/[0-9]:$/.test(after[0]) && !/typeLiteral/.test(after[0])
}
const idx = deserializeSCIP(readFileSync(`${ROOT}/.atlas/index.scip`))
const defs = new Set()
for (const d of idx.documents)
  for (const o of d.occurrences) if (o.symbolRoles & 1 && !isLocal(o.symbol)) defs.add(o.symbol)
let threatening = 0
const ex = new Set()
for (const d of idx.documents) {
  if (
    !/^packages\/[^/]+\/src\//.test(d.relativePath) ||
    /\.test\.tsx?$/.test(d.relativePath) ||
    /(^|\/)test\//.test(d.relativePath)
  )
    continue
  for (const o of d.occurrences) {
    if (o.symbolRoles & 1 || isLocal(o.symbol)) continue
    if (!/^scip-typescript npm @atlas\//.test(o.symbol)) continue
    const r = defs.has(o.symbol) ? o.symbol : defs.has(canon(o.symbol)) ? canon(o.symbol) : undefined
    if (r !== undefined) continue
    if (isGlobalExportRef(o.symbol)) {
      threatening++
      if (ex.size < 15) ex.add(o.symbol.slice(0, 110))
    }
  }
}
console.log("threatening @atlas global-export canon-miss holes (value refs, typeLiteral excluded):", threatening)
for (const e of ex) console.log("  " + e)
