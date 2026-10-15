// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: compare kinds too, reject duplicate impl names, declared-input provenance.
import { surfaceHash, text } from "../contract"
import type { Contract, Surface, Tool } from "../contract"
import { descriptor } from "../registry"
export interface SeamVerdict { ok: boolean; hashOk: boolean; missing: string[]; mismatched: { name: string; expected: string; got: string }[]; extra: string[]; duplicates: string[] }
const tool: Tool<{ contract: Contract; impl: Surface[]; parity?: boolean }> = {
  ...descriptor("seam-checker"),
  handler(input) {
    const impl = new Map(input.impl.map((s) => [s.name, s]))
    const names = new Set(input.contract.surfaces.map((s) => s.name))
    const duplicates = [...new Set(input.impl.filter((s, i) => input.impl.findIndex((item) => item.name === s.name) !== i).map((s) => s.name))]
    const missing = input.contract.surfaces.filter((s) => !impl.has(s.name)).map((s) => s.name)
    const mismatched = input.contract.surfaces.flatMap((s) => {
      const found = impl.get(s.name)
      return found && (found.kind !== s.kind || found.signature !== s.signature) ? [{ name: s.name, expected: `${s.kind}: ${s.signature}`, got: `${found.kind}: ${found.signature}` }] : []
    })
    const extra = input.impl.filter((s) => !names.has(s.name)).map((s) => s.name)
    const hashOk = surfaceHash(input.contract.surfaces) === input.contract.hash && names.size === input.contract.surfaces.length
    const output: SeamVerdict = { ok: hashOk && !missing.length && !mismatched.length && !duplicates.length && (!input.parity || !extra.length), hashOk, missing, mismatched, extra, duplicates }
    return text(output, { next: "inspect declared mismatches, then acquire compiler/AST evidence separately", invariant: "comparison checks supplied signatures only; no claim that code was acquired or executed" })
  },
}
export default tool
