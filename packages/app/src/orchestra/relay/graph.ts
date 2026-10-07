import type { RelayAuthoring } from "@opencode-ai/schema/relay-authoring"
import type { RelayKind } from "./client"

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
  typeVersion?: number
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
  document: Pick<RelayAuthoring.Document, "nodes" | "connections" | "nodeGroups">,
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
      parameters: { ...node.parameters },
      ...(node.typeVersion === undefined ? {} : { typeVersion: node.typeVersion }),
    })),
    edges,
    phases:
      kind === "workflow"
        ? (document.nodeGroups ?? []).map((group) => ({
            id: group.id,
            name: group.name,
            description: group.description ?? "",
            nodeIds: [...group.nodeIds],
          }))
        : [],
  }
}

// The document fields a save replaces. Positions are whole numbers: ledgers and hook exports carry integers only.
export function documentFields(flow: Flow): {
  nodes: RelayAuthoring.Node[]
  connections: RelayAuthoring.Connections
  nodeGroups?: RelayAuthoring.NodeGroup[]
} {
  const names = new Map(flow.nodes.map((node) => [node.id, node.name]))
  const connections: Record<string, { main: RelayAuthoring.Edge[][] }> = {}
  flow.edges.forEach((edge) => {
    const source = names.get(edge.from)
    const target = names.get(edge.to)
    if (!source || !target) return
    const main = connections[source]?.main ?? []
    while (main.length <= edge.port) main.push([])
    main[edge.port].push({ node: target, type: "main", index: 0 })
    connections[source] = { main }
  })
  const nodes = flow.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    type: node.type,
    position: [Math.round(node.x), Math.round(node.y)] as const,
    parameters: node.parameters,
    ...(node.typeVersion === undefined ? {} : { typeVersion: node.typeVersion }),
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
    // The export needs a pattern, a command and a message (Allow's note may be empty), as the server compiles them.
    const pattern =
      node.type === CONDITION && !String(node.parameters.pattern ?? "")
        ? [{ code: "pattern-empty" as const, node: node.id }]
        : []
    const check =
      node.type === "relay.hookVerify" && !String(node.parameters.check ?? "")
        ? [{ code: "check-command" as const, node: node.id }]
        : []
    const message =
      node.type !== CONDITION && node.type !== "relay.hookAllow" && !String(node.parameters.message ?? "")
        ? [{ code: "message-empty" as const, node: node.id }]
        : []
    const loose = reachable.has(node.id) ? [] : [{ code: "hook-loose" as const, node: node.id }]
    return [...before, ...pattern, ...check, ...message, ...loose]
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

/** A sample agent event: the trigger's operation and timing and the value the conditions read. */
export type HookProbe = { operation: string; timing: string; path?: string; command?: string; tool?: string }

// Walks the hook the way the engine plans it (relay/src/hook/evaluate.ts): a condition takes Yes or No, actions
// run in order along their output, Block ends the branch, and a Run gate continues on Pass because its check is
// not run here. Graph only; nothing is evaluated on the server.
export function walkHook(flow: Flow, probe: HookProbe) {
  const trigger = flow.nodes.find((node) => node.type === TRIGGER)
  if (!trigger) return { path: [], actions: [] }
  const visit = (id: string, path: string[]): string[] => {
    const node = nodeOf(flow, id)
    if (!node || path.includes(id)) return path
    const port = node.type === CONDITION ? (conditionHolds(node.parameters, probe) ? 0 : 1) : 0
    const next = flow.edges.find((edge) => edge.from === id && edge.port === port)
    if (!next || node.type === "relay.hookBlock") return [...path, id]
    return visit(next.to, [...path, id])
  }
  const path = visit(trigger.id, [])
  const actions = path.flatMap((id) => {
    const node = nodeOf(flow, id)
    return node && node.type !== TRIGGER && node.type !== CONDITION ? [node] : []
  })
  return { path, actions }
}

// A condition on a field the event lacks (a path on a command, a tool on a session trigger) takes No.
export function conditionHolds(parameters: Record<string, unknown>, probe: HookProbe) {
  const pattern = String(parameters.pattern ?? "")
  if (parameters.field === "path") return probe.path !== undefined && pathMatch(pattern, probe.path)
  if (parameters.field === "event") return wildcard(pattern, `${probe.operation}.${probe.timing}`)
  const value = parameters.field === "tool" ? probe.tool : probe.command
  return value !== undefined && wildcard(pattern, value)
}

// Commands, tools and events use Orchestra's permission wildcard: `*` is any run (across `/` too), `?` one
// character, everything else literal, including `|`. A pattern ending in " *" also matches without the argument.
export function wildcard(pattern: string, value: string) {
  const test = (body: string) =>
    new RegExp(
      `^${body
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, "[\\s\\S]*")
        .replace(/\?/g, "[\\s\\S]")}$`,
    ).test(value)
  return test(pattern) || (pattern.endsWith(" *") && test(pattern.slice(0, -2)))
}

// Paths use the engine's glob: `*` and `?` stay inside one segment, `**` crosses segments, `[a-z]` and `[!a]` are
// classes, `{a,b}` are alternatives, `\` escapes, and each leading `!` negates. `|` is literal.
export function pathMatch(pattern: string, path: string) {
  const bangs = /^!*/.exec(pattern)![0].length
  const tokens = pattern.slice(bangs).match(/\\[\s\S]|\*\*\/?|\*|\?|\[(?:\\.|[^\]])+\]|[{},]|[\s\S]/g) ?? []
  const body = tokens.reduce(
    (acc, token) => {
      if (token === "{") return { out: `${acc.out}(?:`, depth: acc.depth + 1 }
      if (token === "}" && acc.depth > 0) return { out: `${acc.out})`, depth: acc.depth - 1 }
      if (token === "," && acc.depth > 0) return { out: `${acc.out}|`, depth: acc.depth }
      return { out: acc.out + globToken(token), depth: acc.depth }
    },
    { out: "", depth: 0 },
  )
  if (body.depth > 0) return bangs % 2 === 1
  return new RegExp(`^${body.out}$`).test(path) !== (bangs % 2 === 1)
}

function globToken(token: string) {
  if (token.startsWith("\\")) return escape(token.slice(1))
  if (token === "**/") return "(?:[\\s\\S]*/)?"
  if (token === "**") return "[\\s\\S]*"
  if (token === "*") return "[^/]*"
  if (token === "?") return "[^/]"
  if (token.startsWith("[") && token.length > 2) return `[${token.slice(1, -1).replace(/^[!^]/, "^")}]`
  return escape(token)
}

const escape = (text: string) => text.replace(/[.+^${}()|[\]\\*?]/g, "\\$&")

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
