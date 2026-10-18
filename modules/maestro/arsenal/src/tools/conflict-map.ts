// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: reject duplicate IDs/layers; range-aware dependencies; explicit advice.
import { failure, text } from "../contract"
import type { Tool } from "../contract"
import { descriptor } from "../registry"
import { conflictVerdict, sitesConflict } from "./conflict-semantics"

export interface WpPaths { id: string; writes?: string[]; reads?: string[]; appendOnly?: string[] }
export interface ConflictPair { a: string; b: string; verdict: "CONFLICT_FREE" | "UNION_RESOLVABLE" | "MUTATION_CONFLICT" | "SEQUENCED_BY_DAG"; reason: string }
export interface Dependency { from: string; to: string; via: string[] }
export interface ConflictMapOutput { pairs: ConflictPair[]; dependencies: Dependency[]; parallelSafe: boolean; layerCoverage?: { layeredIds: number; totalIds: number } }
const tool: Tool<{ wps: WpPaths[]; layers?: string[][] }> = {
  ...descriptor("conflict-map"),
  handler(input) {
    const scopeReport = conflictVerdict(input.wps)
    if (scopeReport.hold) return text({ status: "HOLD", code: scopeReport.hold.code, unresolvedScopes: scopeReport.hold.scopes, pairs: [], dependencies: [], parallelSafe: false }, {
      next: "use repo-mapper to expand pattern scopes into complete literal path references, then rerun conflict-map",
      invariant: "PATTERN_SCOPE_UNRESOLVED is unknown coverage; supplied layers and append-only declarations cannot certify it safe",
    })
    const ids = new Set(input.wps.map((w) => w.id))
    if (ids.size !== input.wps.length) return failure("duplicate_wp_ids", "work-package ids must be unique")
    const layered = input.layers?.flat() ?? []
    if (new Set(layered).size !== layered.length || layered.some((id) => !ids.has(id))) return failure("invalid_layers", "layers repeat or name unknown work packages")
    const layerOf = new Map(input.layers?.flatMap((layer, i) => layer.map((id) => [id, i] as const)))
    const pairs: ConflictPair[] = input.wps.flatMap((a, i) => input.wps.slice(i + 1).map((b) => {
      const report = conflictVerdict([a, b])
      const sequenced = layerOf.has(a.id) && layerOf.has(b.id) && layerOf.get(a.id) !== layerOf.get(b.id)
      const verdict = report.verdict === "CONFLICT" ? sequenced ? "SEQUENCED_BY_DAG" : "MUTATION_CONFLICT" : report.verdict === "UNION-RESOLVABLE" ? "UNION_RESOLVABLE" : "CONFLICT_FREE"
      return { a: a.id, b: b.id, verdict, reason: report.verdict === "CONFLICT" ? `shared writes: ${report.conflictingPairs[0].on.join(", ")}${sequenced ? "; sequenced by supplied layers" : ""}` : report.verdict === "UNION-RESOLVABLE" ? "all writers declare shared files append-only" : "no shared write sites" }
    }))
    const dependencies = input.wps.flatMap((writer) => input.wps.filter((reader) => reader.id !== writer.id).flatMap((reader) => {
      const via = [...new Set((writer.writes ?? []).filter((write) => (reader.reads ?? []).some((read) => sitesConflict(write, read))))]
      return via.length ? [{ from: writer.id, to: reader.id, via }] : []
    }))
    const output: ConflictMapOutput = { pairs, dependencies, parallelSafe: pairs.every((p) => p.verdict !== "MUTATION_CONFLICT"), ...(input.layers ? { layerCoverage: { layeredIds: layered.length, totalIds: ids.size } } : {}) }
    return text(output, { next: "schedule conflict-free pairs within supplied layers; verify read dependencies before dispatch", invariant: "supplied layers express ordering advice, never permission to co-run conflicting writes" })
  },
}
export default tool
