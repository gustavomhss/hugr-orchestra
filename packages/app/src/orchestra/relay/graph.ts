import type { RelayDocument, RelayKind, RelayNode } from "./client"

// The editable graph behind the canvas. Documents connect nodes by name; the canvas works by ID so a rename
// never breaks a wire. Every function here is pure and returns a new flow.

export const START = "relay.startTrigger"
export const TRIGGER = "relay.hookEventTrigger"
export const CONDITION = "relay.hookCondition"

export type FlowNode = {
  id: string
  name: string
  type: string
  x: number
  y: number
  parameters: Record<string, unknown>
}
export type FlowEdge = { from: string; to: string; port: number }
export type FlowPhase = { id: string; name: string; description: string; nodeIds: string[] }
export type Flow = { kind: RelayKind; nodes: FlowNode[]; edges: FlowEdge[]; phases: FlowPhase[] }
// Output labels per node type; a missing type has one unnamed output.
export type Outputs = Record<string, string[]>

export type Control = {
  id: string
  cmd?: string | null
  judge?: string | null
  blocking?: boolean
  diff?: boolean
  context?: string | string[]
} & Record<string, unknown>

export type Issue =
  | { code: "loose" | "branches" | "gate-empty" | "check-empty" | "checklist-invalid"; node: string }
  | { code: "no-steps" | "no-trigger" | "no-action"; node?: string }
  | {
      code: "trigger-count" | "needs-before" | "pattern-empty" | "hook-loose" | "message-empty" | "check-command"
      node: string
    }
  | { code: "server"; text: string }

export const HOOK_OUTPUTS: Outputs = {
  [CONDITION]: ["Yes", "No"],
  "relay.hookBlock": [],
}

export function flowFromDocument(
  document: Pick<RelayDocument, "nodes" | "connections" | "nodeGroups">,
  kind: RelayKind,
): Flow {
  const ids = new Map(document.nodes.map((node) => [node.name, node.id]))
  const edges = Object.entries(document.connections).flatMap(([source, outputs]) =>
    outputs.main.flatMap((channel, port) =>
      channel.flatMap((edge) => {
        const from = ids.get(source)
        const to = ids.get(edge.node)
        return from && to ? [{ from, to, port }] : []
      }),
    ),
  )
  return {
    kind,
    nodes: document.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      x: node.position[0],
      y: node.position[1],
      parameters: node.parameters,
    })),
    edges,
    phases: kind === "workflow" ? document.nodeGroups.map((group) => ({ ...group, nodeIds: [...group.nodeIds] })) : [],
  }
}

// The document fields a save replaces.
export function documentFields(flow: Flow) {
  const names = new Map(flow.nodes.map((node) => [node.id, node.name]))
  const connections: Record<string, { main: { node: string; type: string; index: number }[][] }> = {}
  flow.edges.forEach((edge) => {
    const source = names.get(edge.from)
    const target = names.get(edge.to)
    if (!source || !target) return
    const main = connections[source]?.main ?? []
    while (main.length <= edge.port) main.push([])
    main[edge.port].push({ node: target, type: "main", index: 0 })
    connections[source] = { main }
  })
  const nodes: RelayNode[] = flow.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    position: [node.x, node.y],
    parameters: node.parameters,
  }))
  if (flow.kind === "hook") return { nodes, connections }
  return { nodes, connections, nodeGroups: flow.phases.filter((phase) => phase.nodeIds.length) }
}

export const isEntry = (node: FlowNode) => node.type === START || node.type === TRIGGER
export const nodeOf = (flow: Flow, id: string | undefined) => flow.nodes.find((node) => node.id === id)
export const outEdges = (flow: Flow, id: string) => flow.edges.filter((edge) => edge.from === id)
export const inEdges = (flow: Flow, id: string) => flow.edges.filter((edge) => edge.to === id)
export const phaseOf = (flow: Flow, id: string) => flow.phases.find((phase) => phase.nodeIds.includes(id))

export function outputsOf(flow: Flow, node: FlowNode, outputs: Outputs) {
  if (flow.kind === "workflow") return [""]
  const labels = outputs[node.type]
  if (labels) return labels.length === 1 ? [""] : labels
  return [""]
}

// The sequence Relay runs: from the entry, along the first outgoing edge, stopping at a repeat.
export function chain(flow: Flow) {
  const entry = flow.nodes.find(isEntry) ?? flow.nodes.find((node) => !inEdges(flow, node.id).length)
  const seen: FlowNode[] = []
  const walk = (node: FlowNode | undefined): FlowNode[] => {
    if (!node || seen.includes(node)) return seen
    seen.push(node)
    return walk(nodeOf(flow, outEdges(flow, node.id)[0]?.to))
  }
  return walk(entry)
}

export const steps = (flow: Flow) => chain(flow).filter((node) => node.type !== START)

export function readChecklist(node: FlowNode): { controls: Control[]; invalid: boolean } {
  const value = node.parameters.checklist
  const parsed: unknown = (() => {
    if (typeof value !== "string") return value ?? []
    if (!value.trim()) return []
    try {
      return JSON.parse(value)
    } catch {
      return undefined
    }
  })()
  if (!Array.isArray(parsed)) return { controls: [], invalid: true }
  const controls = parsed.filter(
    (item): item is Control => typeof item === "object" && item !== null && typeof item.id === "string",
  )
  return { controls, invalid: controls.length !== parsed.length }
}

// Stored as a JSON string, the way the authoring service projects sprints.
export const writeChecklist = (controls: Control[]) => JSON.stringify(controls, null, 2)

export const checkCount = (flow: Flow) =>
  steps(flow).reduce((sum, node) => sum + readChecklist(node).controls.length, 0)

export function retryBudget(flow: Flow) {
  const value = flow.nodes.find((node) => node.type === START)?.parameters.relayRetryBudget
  return typeof value === "number" ? value : 3
}

export function issues(flow: Flow, diagnostics: string[] = []): Issue[] {
  const server = diagnostics.map((text): Issue => ({ code: "server", text }))
  if (flow.kind === "workflow") return [...workflowIssues(flow), ...server]
  return [...hookIssues(flow), ...server]
}

function workflowIssues(flow: Flow): Issue[] {
  const inChain = new Set(chain(flow).map((node) => node.id))
  const loose = flow.nodes
    .filter((node) => !inChain.has(node.id))
    .map((node): Issue => ({ code: "loose", node: node.id }))
  const branches = flow.nodes
    .filter((node) => outEdges(flow, node.id).length > 1)
    .map((node): Issue => ({ code: "branches", node: node.id }))
  const checks = flow.nodes
    .filter((node) => node.type !== START)
    .flatMap((node): Issue[] => {
      const list = readChecklist(node)
      if (list.invalid) return [{ code: "checklist-invalid", node: node.id }]
      if (node.type === "relay.gate" && !list.controls.length) return [{ code: "gate-empty", node: node.id }]
      return list.controls.some((control) => !control.cmd && !control.judge && !control.host_check)
        ? [{ code: "check-empty", node: node.id }]
        : []
    })
  const empty: Issue[] = steps(flow).length ? [] : [{ code: "no-steps" }]
  return [...loose, ...branches, ...checks, ...empty]
}

function hookIssues(flow: Flow): Issue[] {
  const triggers = flow.nodes.filter((node) => node.type === TRIGGER)
  const timing = triggers[0]?.parameters.timing
  const count: Issue[] = !triggers.length
    ? [{ code: "no-trigger" }]
    : triggers.slice(1).map((node) => ({ code: "trigger-count", node: node.id }))
  const reachable = reach(flow, triggers[0]?.id)
  const nodes = flow.nodes.flatMap((node): Issue[] => {
    if (node.type === TRIGGER) return []
    const before =
      (node.type === "relay.hookBlock" || node.type === "relay.hookApprove") && timing === "after"
        ? [{ code: "needs-before" as const, node: node.id }]
        : []
    const pattern =
      node.type === CONDITION && !String(node.parameters.pattern ?? "").trim()
        ? [{ code: "pattern-empty" as const, node: node.id }]
        : []
    const check =
      node.type === "relay.hookVerify" && !String(node.parameters.check ?? "").trim()
        ? [{ code: "check-command" as const, node: node.id }]
        : []
    const loose = reachable.has(node.id) ? [] : [{ code: "hook-loose" as const, node: node.id }]
    return [...before, ...pattern, ...check, ...loose]
  })
  const actions = flow.nodes.some((node) => node.type !== TRIGGER && node.type !== CONDITION)
  const action: Issue[] = actions ? [] : [{ code: "no-action", node: triggers[0]?.id }]
  return [...count, ...nodes, ...action]
}

function reach(flow: Flow, from: string | undefined) {
  const seen = new Set<string>()
  const visit = (id: string | undefined) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    outEdges(flow, id).forEach((edge) => visit(edge.to))
  }
  visit(from)
  return seen
}

export function issueNode(issue: Issue) {
  return "node" in issue ? issue.node : undefined
}

/* ---------- edits ---------- */

// A workflow step keeps one input and one output; a hook output port keeps one next node.
export function connect(flow: Flow, from: string, to: string, port: number): Flow | undefined {
  const target = nodeOf(flow, to)
  if (!target || isEntry(target) || from === to) return
  const kept = flow.edges.filter((edge) =>
    flow.kind === "workflow" ? edge.from !== from && edge.to !== to : !(edge.from === from && edge.port === port),
  )
  return { ...flow, edges: [...kept, { from, to, port }] }
}

export function removeEdge(flow: Flow, edge: FlowEdge): Flow {
  return { ...flow, edges: flow.edges.filter((item) => item !== edge) }
}

// Deleting a workflow step reconnects its neighbours so the sequence stays whole. The start node stays.
export function removeNodes(flow: Flow, ids: string[]): Flow {
  const removable = ids.filter((id) => {
    const node = nodeOf(flow, id)
    return node && node.type !== START
  })
  return removable.reduce((current, id) => {
    const before = inEdges(current, id)[0]
    const after = outEdges(current, id)[0]
    const edges = current.edges.filter((edge) => edge.from !== id && edge.to !== id)
    const bridge =
      current.kind === "workflow" && before && after ? [{ from: before.from, to: after.to, port: before.port }] : []
    return {
      ...current,
      nodes: current.nodes.filter((node) => node.id !== id),
      edges: [...edges, ...bridge],
      phases: current.phases.map((phase) => ({ ...phase, nodeIds: phase.nodeIds.filter((member) => member !== id) })),
    }
  }, flow)
}

// Inserts a node after `anchor` (on `port`), rewiring what used to follow. Workflow steps join the anchor's phase.
export function insertNode(flow: Flow, node: FlowNode, anchor?: { id: string; port: number }): Flow {
  const added = { ...flow, nodes: [...flow.nodes, node] }
  if (!anchor) return added
  const next = flow.edges.find((edge) => edge.from === anchor.id && edge.port === anchor.port)
  const edges = flow.edges.filter((edge) => edge !== next)
  const into = isEntry(node) ? [] : [{ from: anchor.id, to: node.id, port: anchor.port }]
  const onward = next && !isEntry(node) ? [{ from: node.id, to: next.to, port: 0 }] : []
  const phase =
    flow.kind === "workflow" ? (phaseOf(flow, anchor.id) ?? (next ? phaseOf(flow, next.to) : undefined)) : undefined
  return {
    ...added,
    edges: [...edges, ...into, ...onward],
    phases: flow.phases.map((item) => (item === phase ? { ...item, nodeIds: [...item.nodeIds, node.id] } : item)),
  }
}

export function moveNodes(flow: Flow, positions: Map<string, [number, number]>): Flow {
  return {
    ...flow,
    nodes: flow.nodes.map((node) => {
      const position = positions.get(node.id)
      return position ? { ...node, x: position[0], y: position[1] } : node
    }),
  }
}

export function updateNode(flow: Flow, id: string, change: Partial<Pick<FlowNode, "name" | "parameters">>): Flow {
  return { ...flow, nodes: flow.nodes.map((node) => (node.id === id ? { ...node, ...change } : node)) }
}

export function setPhase(flow: Flow, id: string, phaseID: string): Flow {
  return {
    ...flow,
    phases: flow.phases.map((phase) => ({
      ...phase,
      nodeIds:
        phase.id === phaseID
          ? [...phase.nodeIds.filter((member) => member !== id), id]
          : phase.nodeIds.filter((member) => member !== id),
    })),
  }
}

export function addPhase(flow: Flow, phase: FlowPhase): Flow {
  const members = new Set(phase.nodeIds)
  return {
    ...flow,
    phases: [
      ...flow.phases.map((item) => ({ ...item, nodeIds: item.nodeIds.filter((member) => !members.has(member)) })),
      phase,
    ],
  }
}

export function updatePhase(flow: Flow, id: string, change: Partial<Pick<FlowPhase, "name" | "description">>): Flow {
  return { ...flow, phases: flow.phases.map((phase) => (phase.id === id ? { ...phase, ...change } : phase)) }
}

// IDs and names are unique per document; new nodes take the first free suffix.
export function uniqueID(flow: Flow, base: string) {
  const taken = new Set([...flow.nodes.map((node) => node.id), ...flow.phases.map((phase) => phase.id)])
  const clean = base.replace(/[^A-Za-z0-9_.-]+/g, "_") || "step"
  if (!taken.has(clean)) return clean
  const free = Array.from({ length: taken.size + 1 }, (_, index) => `${clean}_${index + 2}`).find(
    (id) => !taken.has(id),
  )
  return free ?? `${clean}_${Date.now()}`
}

export function uniqueName(flow: Flow, base: string) {
  const taken = new Set(flow.nodes.map((node) => node.name))
  if (!taken.has(base)) return base
  return (
    Array.from({ length: taken.size + 1 }, (_, index) => `${base} ${index + 2}`).find((name) => !taken.has(name)) ??
    base
  )
}

/* ---------- hook test ---------- */

// Walks the hook with a sample value: conditions take Yes when the pattern matches, everything else follows
// its first output. Graph only; nothing is evaluated on the server.
export function walkHook(flow: Flow, value: string, outputs: Outputs) {
  const trigger = flow.nodes.find((node) => node.type === TRIGGER)
  if (!trigger) return { path: [], result: undefined }
  const step = (node: FlowNode, path: string[]): { path: string[]; result: FlowNode | undefined } => {
    const port = node.type === CONDITION ? (globMatch(String(node.parameters.pattern ?? ""), value) ? 0 : 1) : 0
    const next = nodeOf(flow, flow.edges.find((edge) => edge.from === node.id && edge.port === port)?.to)
    if (!next || path.includes(next.id))
      return { path, result: node.type === CONDITION || node.type === TRIGGER ? undefined : node }
    if (next.type === CONDITION) return step(next, [...path, next.id])
    if (!outputsOf(flow, next, outputs).length || !outEdges(flow, next.id).length)
      return { path: [...path, next.id], result: next }
    return step(next, [...path, next.id])
  }
  return step(trigger, [trigger.id])
}

// `*` stays inside one path segment, `**` crosses segments, `?` is one character; `|` separates alternatives.
export function globMatch(pattern: string, value: string) {
  return pattern
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      const body = part
        .replace(/[.+^$(){}[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "\u0000")
        .replace(/\*/g, "[^/]*")
        .replace(/\u0000/g, ".*")
        .replace(/\?/g, ".")
      return new RegExp(`^${body}$`).test(value)
    })
}

/* ---------- layout ---------- */

// Phases go two per row and snake, as on the approved canvas: 136px between steps, 240px between rows.
// Steps outside any phase form their own unboxed segment in sequence order.
export function layoutWorkflow(flow: Flow): Flow {
  const order = steps(flow)
  const segments = order.reduce<{ key: string; ids: string[] }[]>((acc, node) => {
    const key = phaseOf(flow, node.id)?.id ?? `~${node.id}`
    const last = acc.at(-1)
    if (last && last.key === key && !key.startsWith("~"))
      return [...acc.slice(0, -1), { key, ids: [...last.ids, node.id] }]
    if (last && last.key.startsWith("~") && key.startsWith("~"))
      return [...acc.slice(0, -1), { key: last.key, ids: [...last.ids, node.id] }]
    return [...acc, { key, ids: [node.id] }]
  }, [])
  const width = (count: number) => 136 * Math.max(1, count)
  const column = Math.max(
    272,
    ...segments.filter((_, index) => index % 2 === 0).map((segment) => width(segment.ids.length)),
  )
  const positions = new Map<string, [number, number]>()
  segments.forEach((segment, index) => {
    const left = index % 2 === 0 ? 200 : 200 + column + 96
    const top = 60 + Math.floor(index / 2) * 240
    segment.ids.forEach((id, member) => positions.set(id, [left + 40 + member * 136, top + 72]))
  })
  const start = flow.nodes.find((node) => node.type === START)
  if (start) positions.set(start.id, [96, 132])
  return moveNodes(flow, positions)
}
