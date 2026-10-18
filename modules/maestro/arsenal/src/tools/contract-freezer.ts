// Adapted from TechLead a68e7af92c7ed5aaf8b6574b7ad2f705fb38eeb5.
// Copyright 2026 HuGR Labs. Apache-2.0 (http://www.apache.org/licenses/LICENSE-2.0).
// Changed: exact schema and explicit declared-surface provenance.
import { failure, surfaceHash, text } from "../contract"
import type { Surface, Tool } from "../contract"
import { descriptor } from "../registry"
const tool: Tool<{ id: string; surfaces: Surface[] }> = {
  ...descriptor("contract-freezer"),
  handler(input) {
    if (new Set(input.surfaces.map((s) => s.name)).size !== input.surfaces.length) return failure("duplicate_surfaces", "duplicate surface names")
    const surfaces = [...input.surfaces].sort((a, b) => a.name.localeCompare(b.name))
    return text({ id: input.id, surfaces, hash: surfaceHash(surfaces) }, { next: "generate anchor-gen/stub-gen for dependent slices", invariant: "hash binds declared surfaces only; no AST acquisition or execution proof" })
  },
}
export default tool
