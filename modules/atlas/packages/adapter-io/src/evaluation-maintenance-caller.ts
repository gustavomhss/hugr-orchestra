/** Pure caller assembly. No filesystem, imports of descriptors, process, policy, or retry. */
import type { EvaluationRebuildRequest } from "./evaluation-rebuild.js"
import type { OwnershipRecipe, OwnershipRecipeOutput } from "./ownership-rebuild.js"
import { prepareMaintenanceHost } from "./evaluation-maintenance-host.js"
import type { MaintenanceHostEnvelope } from "./evaluation-maintenance-host.js"

export interface MaintenanceCallerDescriptor {
  readonly schema: "evaluation-maintenance-caller/v1"
  readonly baselineCandidate: string
  readonly baselineManifest: string
  readonly baselineGeneration: string
  readonly targetRoot: string
  readonly targetGeneration: EvaluationRebuildRequest["targetGeneration"]
  /** Complete fixed topology, including entries expected to reuse. */
  readonly recipes: readonly Omit<OwnershipRecipe, "run">[]
  /** Produced bodies are private inputs, never code, paths, or executable callbacks. */
  readonly produced: readonly {
    readonly key: string
    readonly capturedVersions: readonly { key: string; version: string }[]
    readonly dependencies: readonly { key: string; result: string }[]
    readonly output: OwnershipRecipeOutput
  }[]
}
export type MaintenanceCallerPorts = Omit<EvaluationRebuildRequest,
  "recipes" | "targetRepoRoot" | "targetGeneration">
const sameSet = (a: readonly string[], b: readonly string[]) =>
  new Set(a).size === a.length && new Set(b).size === b.length &&
  a.length === b.length && a.every(x => b.includes(x))
function requireThat(value: boolean, reason: string): asserts value {
  if (!value) throw Error(`maintenance-caller-${reason}`)
}
/** External pinned loader supplies verified immutable descriptor, StoreApi and capture ports.
 * Host/core retain all observation, byte drift, topology and semantic evidence validation. */
export function prepareMaintenanceCaller(e: MaintenanceHostEnvelope,
  d: MaintenanceCallerDescriptor, p: MaintenanceCallerPorts) {
  requireThat(d.schema === "evaluation-maintenance-caller/v1" &&
    d.baselineCandidate === p.baseline.candidate_id && d.baselineManifest === p.manifest &&
    d.baselineGeneration === p.context.generation &&
    d.targetRoot === e.targetRoot && d.targetGeneration === e.targetGeneration,
    "descriptor-binding")
  const entries = p.baseline.candidate.entries
  requireThat(entries.length === 15 && sameSet(d.recipes.map(r => r.key), entries.map(x => x.key)), "registry")
  requireThat(new Set(d.produced.map(x => x.key)).size === d.produced.length &&
    d.produced.every(x => entries.some(e => e.key === x.key)), "produced-coverage")
  const recipes = new Map<string, OwnershipRecipe>()
  for (const r of d.recipes) {
    const entry = entries.find(x => x.key === r.key)!
    requireThat(sameSet(r.required, entry.dependencies.map(x => x.key)), "topology")
    recipes.set(r.key, { ...r, run(input) {
      const record = d.produced.find(x => x.key === r.key)
      requireThat(record !== undefined, "missing-production")
      requireThat(sameSet(record.capturedVersions.map(x => x.key),
        [...input.captured].filter(([, v]) => v.kind === "present").map(([k]) => k)) &&
        record.capturedVersions.every(x => {
          const v = input.captured.get(x.key)
          return v?.kind === "present" && v.version === x.version
        }), "production-input-binding")
      requireThat(sameSet(record.dependencies.map(x => x.key), [...input.dependencies.keys()]) &&
        record.dependencies.every(x => input.dependencies.get(x.key) === x.result), "production-dependency-binding")
      return { ...record.output,
        ...(record.output.gaps === undefined ? {} : { gaps: [...record.output.gaps] }),
        ...(record.output.evidence === undefined ? {} : { evidence: [...record.output.evidence] }) }
    } })
  }
  return prepareMaintenanceHost(e, { ...p, recipes,
    targetRepoRoot: d.targetRoot, targetGeneration: d.targetGeneration })
}
