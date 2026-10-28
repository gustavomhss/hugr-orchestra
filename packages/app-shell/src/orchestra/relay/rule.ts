import { CONDITION, type Flow, type FlowEdge, nodeOf, outEdges, TRIGGER } from "./graph"

// A hook read as one sentence: when the trigger fires, if any case matches (every condition of a case must match),
// run the actions in order. Most hooks are exactly this, and the rule view edits them without wires; a hook drawn
// with other branches does not fit and stays on the canvas.
export type Rule = { trigger: string | undefined; cases: string[][]; actions: string[] }

// Ends the action chain: Block has no output, and what follows Require repair never runs.
export const FINAL = ["relay.hookBlock", "relay.hookRepair"]

export function readRule(flow: Flow): Rule | undefined {
  const triggers = flow.nodes.filter((node) => node.type === TRIGGER)
  if (!triggers.length) return flow.nodes.length ? undefined : { trigger: undefined, cases: [], actions: [] }
  if (triggers.length > 1) return
  const trigger = triggers[0].id
  const seen = new Set([trigger])
  const target = (id: string, port: number) => {
    const to = outEdges(flow, id).find((edge) => edge.port === port)?.to
    return to && !seen.has(to) ? to : undefined
  }
  const isCondition = (id: string | undefined) => nodeOf(flow, id)?.type === CONDITION
  const walk = (from: string | undefined, follow: (id: string) => boolean): string[] => {
    if (!from || !follow(from)) return []
    seen.add(from)
    return [from, ...walk(target(from, 0), follow)]
  }
  const readCases = (from: string | undefined): string[][] => {
    if (!isCondition(from)) return []
    const conditions = walk(from, isCondition)
    return [conditions, ...readCases(target(conditions[0], 1))]
  }
  const first = target(trigger, 0)
  const cases = readCases(first)
  const actions = walk(cases.length ? target(cases[0].at(-1)!, 0) : first, (id) => !isCondition(id))
  const rule = { trigger, cases, actions }
  if (seen.size !== flow.nodes.length) return
  // The reading is a guess; it holds only when writing it back gives exactly the wires the hook has.
  const key = (edge: FlowEdge) => `${edge.from}>${edge.to}:${edge.port}`
  const written = new Set(ruleEdges(flow, rule).map(key))
  return written.size === flow.edges.length && flow.edges.every((edge) => written.has(key(edge))) ? rule : undefined
}

// The flow the rule describes: its nodes laid out in rows (the trigger, one row per case, the actions after the
// longest case) and wired as the rule reads. Nodes the rule no longer names are dropped.
export function writeRule(flow: Flow, rule: Rule): Flow {
  const at = new Map<string, readonly [number, number]>([
    ...(rule.trigger ? [[rule.trigger, [120, 200]] as const] : []),
    ...rule.cases.flatMap((conditions, row) =>
      conditions.map((id, column) => [id, [320 + 200 * column, 200 + 160 * row]] as const),
    ),
    ...rule.actions.map(
      (id, index) => [id, [320 + 200 * (Math.max(0, ...rule.cases.map((item) => item.length)) + index), 200]] as const,
    ),
  ])
  return {
    ...flow,
    nodes: flow.nodes.flatMap((node) => {
      const point = at.get(node.id)
      return point ? [{ ...node, x: point[0], y: point[1] }] : []
    }),
    edges: ruleEdges(flow, rule),
  }
}

function ruleEdges(flow: Flow, rule: Rule): FlowEdge[] {
  const action = rule.actions[0]
  const entry = rule.cases[0]?.[0] ?? action
  const cases = rule.cases.flatMap((conditions, row) =>
    conditions.flatMap((id, column) => {
      const yes = conditions[column + 1] ?? action
      const no = rule.cases[row + 1]?.[0]
      return [...(yes ? [{ from: id, to: yes, port: 0 }] : []), ...(no ? [{ from: id, to: no, port: 1 }] : [])]
    }),
  )
  const actions = rule.actions.slice(1).flatMap((to, index) => {
    const from = rule.actions[index]
    return FINAL.includes(nodeOf(flow, from)?.type ?? "") ? [] : [{ from, to, port: 0 }]
  })
  return [...(rule.trigger && entry ? [{ from: rule.trigger, to: entry, port: 0 }] : []), ...cases, ...actions]
}
