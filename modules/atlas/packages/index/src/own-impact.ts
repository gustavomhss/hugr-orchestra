import { nodeHashOfPath } from "./build.js"
import { createDepgraph } from "./depgraph.js"
import { delta } from "./fold.js"
import type { Axes, Delta, IndexNode } from "./types.js"

export type OwnImpactCoverage = "COMPLETE" | "UNDER_APPROX"

export interface OwnReverseBlast {
  readonly origin: string
  readonly closure: readonly string[]
  readonly underApprox: boolean
  readonly coChanged: readonly string[]
}

export interface OwnImpactReceipt {
  readonly baseSnapshot: string
  readonly headSnapshot: string
  readonly delta: Delta
  readonly changedUnits: readonly string[]
  readonly removedUnits: readonly string[]
  readonly impactedUnits: readonly string[]
  readonly reverseBlast: readonly OwnReverseBlast[]
  readonly coverage: OwnImpactCoverage
}

export interface OwnImpactInput {
  readonly before: Axes
  readonly after: Axes
  readonly baseSnapshot: string
  readonly headSnapshot: string
  /** Units whose anchored Knowledge facts changed or drifted between snapshots. Required: missing fact impact is not coverage. */
  readonly knowledgeChangedUnits: readonly string[]
}

interface SpatialUnit {
  readonly key: string
  readonly parent: string | undefined
}

function spatialUnits(root: IndexNode, parent?: string): readonly SpatialUnit[] {
  const here: SpatialUnit = { key: root.key, parent }
  return [here, ...root.children.flatMap((child) => spatialUnits(child, root.key))]
}

function uniqueSorted(values: Iterable<string>): readonly string[] {
  return [...new Set(values)].sort()
}

function edgeKey(edge: Axes["edges"][number]): string {
  return `${String(edge.from)}\0${edge.to === null ? "" : String(edge.to)}\0${edge.kind}`
}

/** Files are the only units with dependency-axis identities. Sub-file refinements remain structural-only. */
function isDependencyUnit(unit: string): boolean {
  return !unit.includes("::")
}

/** Atlas graph authority for PR Own maintenance. It joins delta, reverse closure, and fact drift without path heuristics. */
export function ownImpact(input: OwnImpactInput): OwnImpactReceipt {
  if (input.baseSnapshot.length === 0 || input.headSnapshot.length === 0) {
    throw new Error("Own impact requires non-empty baseSnapshot and headSnapshot")
  }

  const beforeUnits = spatialUnits(input.before.spatial)
  const afterUnits = spatialUnits(input.after.spatial)
  const known = new Set([...beforeUnits, ...afterUnits].map((unit) => unit.key))
  const beforeParents = new Map(beforeUnits.map((unit) => [unit.key, unit.parent]))
  const afterParents = new Map(afterUnits.map((unit) => [unit.key, unit.parent]))
  const d = delta(input.before, input.after)
  const beforeSet = new Set(beforeUnits.map((unit) => unit.key))
  const afterSet = new Set(afterUnits.map((unit) => unit.key))
  const removedUnits = uniqueSorted([...beforeSet].filter((unit) => !afterSet.has(unit)))
  const byHash = new Map<string, string>()
  for (const unit of known) {
    if (isDependencyUnit(unit)) byHash.set(String(nodeHashOfPath(unit)), unit)
  }
  const beforeEdges = new Map(input.before.edges.map((edge) => [edgeKey(edge), edge]))
  const afterEdges = new Map(input.after.edges.map((edge) => [edgeKey(edge), edge]))
  const changedEdges = [
    ...[...beforeEdges].filter(([key]) => !afterEdges.has(key)),
    ...[...afterEdges].filter(([key]) => !beforeEdges.has(key)),
  ]
  const changedEdgeUnits = changedEdges.flatMap(([, edge]) =>
    [edge.from, edge.to]
      .flatMap((hash) => (hash === null ? [] : [byHash.get(String(hash))]))
      .filter((unit): unit is string => unit !== undefined),
  )
  const changedUnits = uniqueSorted([...d.changedBuckets.filter((bucket) => known.has(bucket)), ...changedEdgeUnits])

  let coverage: OwnImpactCoverage = "COMPLETE"
  const impacted = new Set<string>([...changedUnits, ...input.knowledgeChangedUnits])
  for (const unit of input.knowledgeChangedUnits) if (!known.has(unit)) coverage = "UNDER_APPROX"

  const blasts: OwnReverseBlast[] = []
  for (const origin of changedUnits.filter(isDependencyUnit)) {
    const runs = [createDepgraph(input.before.edges), createDepgraph(input.after.edges)].map((graph) =>
      graph.reverseClosure(nodeHashOfPath(origin)),
    )
    const closure = new Set<string>()
    const coChanged = new Set<string>()
    let underApprox = false
    for (const run of runs) {
      underApprox ||= run.underApprox
      for (const hash of run.coChanged) coChanged.add(String(hash))
      for (const hash of run.closure) {
        const unit = byHash.get(String(hash))
        if (unit === undefined) {
          underApprox = true
          continue
        }
        closure.add(unit)
        impacted.add(unit)
      }
    }
    if (underApprox) coverage = "UNDER_APPROX"
    blasts.push({ origin, closure: uniqueSorted(closure), underApprox, coChanged: uniqueSorted(coChanged) })
  }

  // Every materialized parent includes child terrain/facts, so changed units invalidate all structural ancestors.
  for (const unit of [...impacted]) {
    let current: string | undefined = unit
    while (current !== undefined) {
      impacted.add(current)
      current = afterParents.get(current) ?? beforeParents.get(current)
    }
  }

  return {
    baseSnapshot: input.baseSnapshot,
    headSnapshot: input.headSnapshot,
    delta: d,
    changedUnits,
    removedUnits,
    impactedUnits: uniqueSorted(impacted),
    reverseBlast: blasts.sort((a, b) => (a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : 0)),
    coverage,
  }
}
