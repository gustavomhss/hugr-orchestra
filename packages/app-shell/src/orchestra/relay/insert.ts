import type { RelayNodeType } from "./client"
import { groupRect, intersects, NODE, type Point, snap } from "./geometry"
import {
  addPhase,
  CONDITION,
  type Flow,
  type FlowNode,
  insertNode,
  isEntry,
  nodeOf,
  START,
  steps,
  TRIGGER,
  uniqueID,
  uniqueName,
  writeChecklist,
} from "./graph"

// What the add panel inserts. Workflow steps go after the anchor and push the rest of that row right; hook
// nodes go to the right of the anchor, one row per output port. A drop places the node unconnected.

export type AddRequest = {
  key: string
  type: string
  name: string
  operation?: string
  timing?: string
  anchor?: { id: string; port: number }
  at?: Point
}

const STEP_GAP = 136
const HOOK_GAP = 200

export function defaultParameters(
  type: string,
  types: RelayNodeType[] | undefined,
  request: Pick<AddRequest, "operation" | "timing">,
) {
  const listed = types?.find((item) => item.type === type)?.parameters
  const defaults = Object.fromEntries((listed ?? []).map((parameter) => [parameter.name, parameter.default]))
  if (type === TRIGGER)
    return { ...defaults, operation: request.operation ?? "edit", timing: request.timing ?? "before" }
  if (type === CONDITION) return { field: "path", pattern: "", ...defaults }
  if (type.startsWith("relay.hook"))
    return { message: "", ...defaults, ...(type === "relay.hookVerify" ? { check: "" } : {}) }
  const checklist = type === "relay.gate" ? writeChecklist([{ id: "check_1", cmd: "" }]) : "[]"
  const step = { instructions: "", skill: "", skillMode: "combine", ...defaults, checklist }
  return type === "relay.inject" ? { text: "", file: "", ...step } : step
}

// The node a new step follows when the panel was opened without an explicit anchor.
export function defaultAnchor(flow: Flow, selected: string[]) {
  const picked = nodeOf(flow, selected.at(-1))
  if (picked) return { id: picked.id, port: 0 }
  if (flow.kind === "hook") return
  const last = steps(flow).at(-1) ?? flow.nodes.find((node) => node.type === START)
  return last ? { id: last.id, port: 0 } : undefined
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
    parameters: defaultParameters(request.type, types, request),
  }
  const shifted = anchor && flow.kind === "workflow" ? shiftRow(flow, anchor) : flow
  const connected =
    request.anchor && anchor && !isEntry(node) ? insertNode(shifted, node, request.anchor) : insertNode(shifted, node)
  if (request.at && flow.kind === "workflow") {
    const phase = flow.phases.find((item) => {
      const rect = groupRect(item.nodeIds.flatMap((member) => nodeOf(flow, member) ?? []))
      return rect && intersects({ x: request.at!.x, y: request.at!.y }, rect)
    })
    if (phase)
      return {
        flow: {
          ...connected,
          phases: connected.phases.map((item) =>
            item.id === phase.id ? { ...item, nodeIds: [...item.nodeIds, id] } : item,
          ),
        },
        id,
      }
  }
  return { flow: connected, id }
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
function shiftRow(flow: Flow, anchor: FlowNode): Flow {
  return {
    ...flow,
    nodes: flow.nodes.map((node) =>
      node !== anchor && Math.abs(node.y - anchor.y) < 40 && node.x > anchor.x
        ? { ...node, x: node.x + STEP_GAP }
        : node,
    ),
  }
}

// Groups the selected steps into a new phase; the start node never joins one.
export function groupSelection(flow: Flow, selected: string[], name: string) {
  const members = selected.filter((id) => {
    const node = nodeOf(flow, id)
    return node && node.type !== START
  })
  if (!members.length) return
  const id = uniqueID(flow, "phase")
  return { flow: addPhase(flow, { id, name, description: "", nodeIds: members }), id }
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
