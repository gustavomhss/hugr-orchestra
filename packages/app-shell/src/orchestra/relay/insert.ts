import type { RelayNodeType } from "./client"
import { NODE, type Point, snap } from "./geometry"
import {
  addPhase,
  chain,
  CONDITION,
  type Flow,
  type FlowNode,
  HOOK_OUTPUTS,
  insertNode,
  isEntry,
  nodeOf,
  type Outputs,
  outputsOf,
  phaseOf,
  readChecklist,
  START,
  steps,
  TRIGGER,
  uniqueID,
  uniqueName,
  writeChecklist,
} from "./graph"

// What the add panel inserts. Workflow steps go after the anchor and push the rest of that row right; hook
// nodes go to the right of the anchor, one row per output port, and push what follows them right. A drop places
// the node unconnected and outside every phase.

export type AddRequest = {
  key: string
  type: string
  name: string
  operation?: string
  timing?: string
  anchor?: { id: string; port: number }
  at?: Point
}

export const STEP_GAP = 136
const HOOK_GAP = 200

// `check` is the ID of the one empty check a new gate starts with.
export function defaultParameters(
  type: string,
  types: RelayNodeType[] | undefined,
  request: Pick<AddRequest, "operation" | "timing">,
  check: string,
) {
  const listed = types?.find((item) => item.type === type)?.parameters
  const defaults = Object.fromEntries((listed ?? []).map((parameter) => [parameter.name, parameter.default]))
  if (type === TRIGGER)
    return { ...defaults, operation: request.operation ?? "edit", timing: request.timing ?? "before" }
  if (type === CONDITION) return { field: "path", pattern: "", ...defaults }
  if (type.startsWith("relay.hook"))
    return { message: "", ...defaults, ...(type === "relay.hookVerify" ? { check: "" } : {}) }
  const checklist = type === "relay.gate" ? writeChecklist([{ id: check, cmd: "" }]) : "[]"
  const step = { instructions: "", skill: "", skillMode: "combine", ...defaults, checklist }
  return type === "relay.inject" ? { text: "", file: "", ...step } : step
}

// The node a new step follows when the panel was opened without an explicit anchor. A hook with nothing selected
// continues from its right-most open output, so the first node lands wired to the trigger.
export function defaultAnchor(flow: Flow, selected: string[], outputs: Outputs = HOOK_OUTPUTS) {
  const picked = nodeOf(flow, selected.at(-1))
  if (picked && outputsOf(flow, picked, outputs).length) return { id: picked.id, port: 0 }
  if (flow.kind === "hook") return openOutput(flow, outputs)
  const last = steps(flow).at(-1) ?? flow.nodes.find((node) => node.type === START)
  return last ? { id: last.id, port: 0 } : undefined
}

function openOutput(flow: Flow, outputs: Outputs) {
  const open = flow.nodes.flatMap((node) =>
    outputsOf(flow, node, outputs).flatMap((_, port) =>
      flow.edges.some((edge) => edge.from === node.id && edge.port === port) ? [] : [{ id: node.id, port, x: node.x }],
    ),
  )
  const last = open.reduce<(typeof open)[number] | undefined>(
    (best, item) => (!best || item.x > best.x ? item : best),
    undefined,
  )
  return last && { id: last.id, port: last.port }
}

export function addNode(
  flow: Flow,
  request: AddRequest,
  types: RelayNodeType[] | undefined,
): { flow: Flow; id: string } {
  const id = uniqueID(flow, request.key.replace(/^trigger:/, "event"))
  const anchor = request.anchor ? nodeOf(flow, request.anchor.id) : undefined
  const placed = placement(flow, request, anchor)
  const node: FlowNode = {
    id,
    name: uniqueName(flow, request.name),
    type: request.type,
    x: placed.x,
    y: placed.y,
    parameters: defaultParameters(request.type, types, request, freeCheckID(flow, id)),
  }
  const shifted = !anchor
    ? flow
    : flow.kind === "workflow"
      ? shiftRow(flow, anchor)
      : shiftBranch(flow, anchor, request.anchor?.port ?? 0, placed)
  const connected =
    request.anchor && anchor && !isEntry(node) ? insertNode(shifted, node, request.anchor) : insertNode(shifted, node)
  return { flow: connected, id }
}

// A new check is named after its step, `<step>_check_<n>`, with the smallest n no check in the flow uses yet.
function freeCheckID(flow: Flow, nodeID: string) {
  const taken = new Set(flow.nodes.flatMap((node) => readChecklist(node).controls.map((control) => control.id)))
  const n = Array.from({ length: taken.size + 1 }, (_, index) => index + 1).find(
    (index) => !taken.has(`${nodeID}_check_${index}`),
  )
  return `${nodeID}_check_${n ?? taken.size + 1}`
}

function placement(flow: Flow, request: AddRequest, anchor: FlowNode | undefined): Point {
  if (request.at) return { x: snap(request.at.x), y: snap(request.at.y) }
  if (anchor && flow.kind === "workflow") return { x: anchor.x + STEP_GAP, y: anchor.y }
  if (anchor) return { x: anchor.x + HOOK_GAP, y: anchor.y + (request.anchor?.port ?? 0) * 90 }
  const right = flow.nodes.length ? Math.max(...flow.nodes.map((node) => node.x)) + NODE + 84 : 120
  const top = flow.nodes.length ? Math.min(...flow.nodes.map((node) => node.y)) : 200
  return { x: snap(right), y: snap(top) }
}

// Steps to the right of the anchor on its row move one slot over to make room.
export function shiftRow(flow: Flow, anchor: FlowNode): Flow {
  return {
    ...flow,
    nodes: flow.nodes.map((node) =>
      node !== anchor && Math.abs(node.y - anchor.y) < 40 && node.x > anchor.x
        ? { ...node, x: node.x + STEP_GAP }
        : node,
    ),
  }
}

// Inserting into a hook wire: the node the new one will point at, and everything after it, move over so the
// new node does not land on top of them.
function shiftBranch(flow: Flow, anchor: FlowNode, port: number, placed: Point): Flow {
  const next = nodeOf(flow, flow.edges.find((edge) => edge.from === anchor.id && edge.port === port)?.to)
  if (!next) return flow
  const dx = placed.x + HOOK_GAP - next.x
  if (dx <= 0) return flow
  const moving = downstream(flow, next.id)
  moving.delete(anchor.id)
  return { ...flow, nodes: flow.nodes.map((node) => (moving.has(node.id) ? { ...node, x: node.x + dx } : node)) }
}

function downstream(flow: Flow, from: string) {
  const seen = new Set<string>()
  const visit = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    flow.edges.filter((edge) => edge.from === id).forEach((edge) => visit(edge.to))
  }
  visit(from)
  return seen
}

// A phase is one unbroken stretch of the sequence, as the server requires. Grouping is possible when the steps
// are not the start, sit next to each other (`gap` when they do not), and do not cut another phase in two (`split`,
// as one step from the middle of a phase does).
export function groupBlock(flow: Flow, selected: string[]): "none" | "gap" | "split" | undefined {
  const members = groupMembers(flow, selected)
  if (!members.length) return "none"
  const order = chain(flow).map((node) => node.id)
  const unbroken = (ids: string[]) => {
    const at = ids.map((id) => order.indexOf(id))
    return !at.length || (!at.includes(-1) && Math.max(...at) - Math.min(...at) === at.length - 1)
  }
  if (!unbroken(members)) return "gap"
  const cuts = flow.phases.some(
    (phase) =>
      phase.nodeIds.some((id) => members.includes(id)) &&
      !unbroken(phase.nodeIds.filter((id) => !members.includes(id))),
  )
  return cuts ? "split" : undefined
}

const groupMembers = (flow: Flow, selected: string[]) =>
  selected.filter((id, index) => {
    const node = nodeOf(flow, id)
    return node && node.type !== START && selected.indexOf(id) === index
  })

// Groups the selected steps into a new phase. The start node never joins one, and a selection with gaps is refused.
export function groupSelection(flow: Flow, selected: string[], name: string) {
  if (groupBlock(flow, selected)) return
  const id = uniqueID(flow, "phase")
  return { flow: addPhase(flow, { id, name, description: "", nodeIds: groupMembers(flow, selected) }), id }
}

// The first "Phase n" no phase already has.
export function freePhaseName(flow: Flow, label: (n: number) => string) {
  const taken = new Set(flow.phases.map((phase) => phase.name))
  return (
    Array.from({ length: taken.size + 1 }, (_, index) => label(index + 1)).find((name) => !taken.has(name)) ??
    label(taken.size + 1)
  )
}

// Removing a phase keeps its steps.
export function ungroup(flow: Flow, id: string): Flow {
  return { ...flow, phases: flow.phases.filter((phase) => phase.id !== id) }
}

// Another condition tried when `id` does not match: it takes over the No port and leads to the same Yes step, so two
// patterns mean either one (a `|` inside a pattern is literal).
export function addAlternative(flow: Flow, id: string) {
  const node = nodeOf(flow, id)
  if (!node || node.type !== CONDITION) return
  const alternative: FlowNode = {
    id: uniqueID(flow, "condition"),
    name: uniqueName(flow, node.name),
    type: CONDITION,
    x: node.x,
    y: node.y + 160,
    parameters: { field: node.parameters.field ?? "path", pattern: "" },
  }
  const yes = flow.edges.find((edge) => edge.from === id && edge.port === 0)
  const no = flow.edges.find((edge) => edge.from === id && edge.port === 1)
  const edges = [
    ...flow.edges.filter((edge) => edge !== no),
    { from: id, to: alternative.id, port: 1 },
    ...(yes ? [{ from: alternative.id, to: yes.to, port: 0 }] : []),
    ...(no ? [{ from: alternative.id, to: no.to, port: 1 }] : []),
  ]
  return { flow: { ...flow, nodes: [...flow.nodes, alternative], edges }, id: alternative.id }
}

// Moves a step one place along the sequence. At the edge of its phase it first crosses into the neighbouring phase
// (or out of every phase) without changing places, so phases stay unbroken and one more press moves it on.
export function moveStep(flow: Flow, id: string, direction: -1 | 1): Flow {
  const order = chain(flow)
  const at = order.findIndex((node) => node.id === id)
  const other = order[at + direction]
  if (at < 0 || !other || other.type === START || order[at].type === START) return flow
  const own = phaseOf(flow, id)
  const next = phaseOf(flow, other.id)
  if (own !== next) {
    const phases = flow.phases
      .map((phase) => ({
        ...phase,
        nodeIds: phase === next ? [...phase.nodeIds, id] : phase.nodeIds.filter((member) => member !== id),
      }))
      .filter((phase) => phase.nodeIds.length)
    return { ...flow, phases }
  }
  const ids = order.map((node) => node.id)
  const swapped = ids.with(at, other.id).with(at + direction, id)
  const links = new Set(ids.slice(1).map((to, index) => `${ids[index]}>${to}`))
  const edges = flow.edges.filter((edge) => !links.has(`${edge.from}>${edge.to}`))
  return {
    ...flow,
    edges: [...edges, ...swapped.slice(1).map((to, index) => ({ from: swapped[index], to, port: 0 }))],
  }
}
