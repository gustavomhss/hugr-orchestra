import type { Actions } from "@orchestra/schema/actions"

export type Position = { id: string; x: number; y: number }
export type Layout = { nodes: Position[]; edges: { from: string; to: string }[]; width: number; height: number }

export function layout(graph: Actions.Graph): Layout {
  const jobs: Actions.GraphJob[] = []
  const index = new Map<string, number>()
  for (const job of graph.jobs) {
    if (index.has(job.id)) continue
    index.set(job.id, jobs.length)
    jobs.push(job)
  }
  const incoming = new Map(jobs.map((job) => [job.id, [] as string[]]))
  const outgoing = new Map(jobs.map((job) => [job.id, [] as string[]]))
  const edges: { from: string; to: string }[] = []
  for (const job of jobs) {
    const needs = new Set<string>()
    for (const need of job.needs) {
      if (!index.has(need) || needs.has(need)) continue
      needs.add(need)
      incoming.get(job.id)?.push(need)
      outgoing.get(need)?.push(job.id)
      edges.push({ from: need, to: job.id })
    }
  }
  const degree = new Map(jobs.map((job) => [job.id, incoming.get(job.id)?.length ?? 0]))
  const queue = jobs.filter((job) => degree.get(job.id) === 0).map((job) => job.id)
  const order: string[] = []
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor]
    order.push(id)
    for (const next of outgoing.get(id) ?? []) {
      const value = (degree.get(next) ?? 1) - 1
      degree.set(next, value)
      if (value === 0) queue.push(next)
    }
  }
  const ordered = new Set(order)
  // Cyclic tails keep source order and finite placement without claiming resolution.
  for (const job of jobs) if (!ordered.has(job.id)) order.push(job.id)

  const nativeStages = graph.stages !== undefined || jobs.some((job) => job.stage !== undefined)
  const stages = new Map<string, number>()
  for (const stage of graph.stages ?? []) if (!stages.has(stage)) stages.set(stage, stages.size)
  for (const job of jobs) if (job.stage !== undefined && !stages.has(job.stage)) stages.set(job.stage, stages.size)
  const unresolvedStage = stages.size
  const levels = new Map<string, number>()
  for (const id of order) {
    const job = jobs[index.get(id) ?? 0]
    if (nativeStages) {
      levels.set(id, job.stage === undefined ? unresolvedStage : stages.get(job.stage) ?? unresolvedStage)
      continue
    }
    let level = 0
    for (const need of incoming.get(id) ?? []) level = Math.max(level, (levels.get(need) ?? -1) + 1)
    levels.set(id, level)
  }
  const rows = new Map<number, number>()
  const nodes = jobs.map((job) => {
    const column = levels.get(job.id) ?? 0
    const row = rows.get(column) ?? 0
    rows.set(column, row + 1)
    return { id: job.id, x: 42 + column * 190, y: 42 + row * 112 }
  })
  let columns = nativeStages ? unresolvedStage : 0
  let height = 180
  for (const node of nodes) {
    columns = Math.max(columns, Math.floor(node.x / 190))
    height = Math.max(height, node.y + 104)
  }
  return { nodes, edges, width: Math.max(220, (columns + 1) * 190 + 42), height }
}
