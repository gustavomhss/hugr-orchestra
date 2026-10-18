import type { Actions } from "@orchestra/schema/actions"

// `group` is the matrix box drawn around a definition's expanded executions; `x`/`y` stay the definition anchor.
export type Box = { x: number; y: number; width: number; height: number }
export type Position = { id: string; x: number; y: number; group?: Box }
export type Layout = { nodes: Position[]; edges: { from: string; to: string }[]; width: number; height: number }

const COLUMN = 190
const ROW = 112
const GROUP_WIDTH = 172
const GROUP_HEAD = 58

// `expand` maps a definition to the number of executions shown inside its matrix box.
export function layout(graph: Actions.Graph, expand?: ReadonlyMap<string, number>): Layout {
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
  // Group boxes are centered on the node column and need room on the inline-start edge.
  const inset = expand?.size ? 42 + (GROUP_WIDTH - 56) / 2 : 42
  const rows = new Map<number, number>()
  const nodes = jobs.map((job): Position => {
    const column = levels.get(job.id) ?? 0
    const x = inset + column * COLUMN
    const y = rows.get(column) ?? 42
    const count = expand?.get(job.id) ?? 0
    if (!count) {
      rows.set(column, y + ROW)
      return { id: job.id, x, y }
    }
    const group = { x: x - (GROUP_WIDTH - 56) / 2, y, width: GROUP_WIDTH, height: GROUP_HEAD + count * ROW - 8 }
    rows.set(column, y + group.height + 24)
    return { id: job.id, x, y, group }
  })
  const columns = nodes.reduce((value, node) => Math.max(value, Math.floor((node.x - inset) / COLUMN)), nativeStages ? unresolvedStage : 0)
  const height = nodes.reduce((value, node) => Math.max(value, node.group ? node.group.y + node.group.height + 24 : node.y + 104), 180)
  return { nodes, edges, width: Math.max(220, (columns + 1) * COLUMN + inset), height }
}
