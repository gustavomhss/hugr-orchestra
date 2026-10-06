import type { RelayDocument, RelayNodeType } from "./client"
import { CONDITION, documentFields, type Flow, START, TRIGGER } from "./graph"

// Starting points for new documents. Workflow templates are copies of workflows already in the profile (the
// server seeds the shipped Relay profiles); "blank" is a start node only. Hook presets are small graphs built
// from the node types this server lists, so a preset never offers an action the server cannot run.

export type HookPresetID = "protect-generated" | "ask-shell" | "gate-stop" | "remind-first"
export type PresetKey =
  | "trigger.before.edit"
  | "trigger.before.command"
  | "trigger.stop"
  | "preset.pathMatches"
  | "preset.commandMatches"
  | "preset.blockChange"
  | "preset.blockMessage"
  | "preset.askMessage"
  | "preset.gateMessage"
  | "preset.recordMessage"
  | "preset.repairMessage"
  | "preset.remindMessage"
  | "type.allow"
  | "type.approve"
  | "type.verify"
  | "type.record"
  | "type.repair"
  | "type.remind"
export type PresetText = (key: PresetKey) => string

export function blankWorkflow(name: string, startName: string) {
  return {
    name,
    nodes: [
      {
        id: "relay-start",
        name: startName,
        type: START,
        position: [96, 132],
        parameters: { relayBrief: "", relayRetryBudget: 3 },
      },
    ],
    connections: {},
    nodeGroups: [],
    tags: [],
    meta: { relay: { schema: 1, kind: "workflow" } },
  }
}

export function copyWorkflow(source: RelayDocument, name: string) {
  const relay = source.meta.relay
  return {
    name,
    description: source.description,
    nodes: source.nodes,
    connections: source.connections,
    nodeGroups: source.nodeGroups,
    tags: [],
    meta: {
      relay:
        typeof relay === "object" && relay !== null ? { ...relay, kind: "workflow" } : { schema: 1, kind: "workflow" },
    },
  }
}

export function copyDocument(source: RelayDocument, name: string) {
  return { ...copyWorkflow(source, name), meta: { ...source.meta } }
}

type PresetNode = {
  id: string
  text: PresetKey
  type: string
  x: number
  y: number
  parameters: Record<string, unknown>
  message?: PresetKey
}
type Preset = {
  id: HookPresetID
  nodes: PresetNode[]
  edges: [string, string, number][]
  operations: string[]
  twoOutputs?: string
}

const PRESETS: Preset[] = [
  {
    id: "protect-generated",
    operations: ["edit"],
    nodes: [
      {
        id: "event",
        text: "trigger.before.edit",
        type: TRIGGER,
        x: 120,
        y: 200,
        parameters: { operation: "edit", timing: "before" },
      },
      {
        id: "match",
        text: "preset.pathMatches",
        type: CONDITION,
        x: 320,
        y: 200,
        parameters: { field: "path", pattern: "src/generated/**" },
      },
      {
        id: "block",
        text: "preset.blockChange",
        type: "relay.hookBlock",
        x: 540,
        y: 100,
        parameters: {},
        message: "preset.blockMessage",
      },
      { id: "allow", text: "type.allow", type: "relay.hookAllow", x: 540, y: 300, parameters: { message: "" } },
    ],
    edges: [
      ["event", "match", 0],
      ["match", "block", 0],
      ["match", "allow", 1],
    ],
  },
  {
    id: "ask-shell",
    operations: ["command"],
    nodes: [
      {
        id: "event",
        text: "trigger.before.command",
        type: TRIGGER,
        x: 120,
        y: 200,
        parameters: { operation: "command", timing: "before" },
      },
      {
        id: "match",
        text: "preset.commandMatches",
        type: CONDITION,
        x: 320,
        y: 200,
        parameters: { field: "command", pattern: "git push* | rm -rf *" },
      },
      {
        id: "ask",
        text: "type.approve",
        type: "relay.hookApprove",
        x: 540,
        y: 100,
        parameters: {},
        message: "preset.askMessage",
      },
      { id: "allow", text: "type.allow", type: "relay.hookAllow", x: 540, y: 300, parameters: { message: "" } },
    ],
    edges: [
      ["event", "match", 0],
      ["match", "ask", 0],
      ["match", "allow", 1],
    ],
  },
  {
    id: "gate-stop",
    operations: ["stop"],
    twoOutputs: "relay.hookVerify",
    nodes: [
      {
        id: "event",
        text: "trigger.stop",
        type: TRIGGER,
        x: 120,
        y: 200,
        parameters: { operation: "stop", timing: "after" },
      },
      {
        id: "gate",
        text: "type.verify",
        type: "relay.hookVerify",
        x: 320,
        y: 200,
        parameters: { check: "bun typecheck" },
        message: "preset.gateMessage",
      },
      {
        id: "record",
        text: "type.record",
        type: "relay.hookRecord",
        x: 540,
        y: 100,
        parameters: {},
        message: "preset.recordMessage",
      },
      {
        id: "repair",
        text: "type.repair",
        type: "relay.hookRepair",
        x: 540,
        y: 300,
        parameters: {},
        message: "preset.repairMessage",
      },
    ],
    edges: [
      ["event", "gate", 0],
      ["gate", "record", 0],
      ["gate", "repair", 1],
    ],
  },
  {
    id: "remind-first",
    operations: ["edit"],
    nodes: [
      {
        id: "event",
        text: "trigger.before.edit",
        type: TRIGGER,
        x: 120,
        y: 200,
        parameters: { operation: "edit", timing: "before" },
      },
      {
        id: "remind",
        text: "type.remind",
        type: "relay.hookRemind",
        x: 320,
        y: 200,
        parameters: {},
        message: "preset.remindMessage",
      },
    ],
    edges: [["event", "remind", 0]],
  },
]

// Presets this server can hold: every operation and node type listed, optional Allow branches dropped.
export function hookPresets(types: RelayNodeType[] | undefined) {
  const listed = new Set(types?.map((item) => item.type) ?? [])
  const operations = new Set(
    types
      ?.find((item) => item.type === TRIGGER)
      ?.parameters.find((parameter) => parameter.name === "operation")
      ?.options.map((option) => option.value) ?? ["read", "edit", "write", "command"],
  )
  const outputs = (type: string) => types?.find((item) => item.type === type)?.outputs.length ?? 1
  return PRESETS.flatMap((preset) => {
    if (!preset.operations.every((operation) => operations.has(operation))) return []
    if (preset.twoOutputs && outputs(preset.twoOutputs) < 2) return []
    const nodes = preset.nodes.filter(
      (node) => node.type === TRIGGER || !types || listed.has(node.type) || node.type === CONDITION,
    )
    const required = preset.nodes.filter((node) => node.type !== "relay.hookAllow")
    if (types && required.some((node) => !nodes.includes(node))) return []
    return [{ ...preset, nodes }]
  })
}

export function presetChain(preset: Pick<Preset, "nodes" | "edges">, text: PresetText) {
  const names = new Map(preset.nodes.map((node) => [node.id, text(node.text)]))
  const first = preset.nodes[0]
  const walk = (id: string, seen: string[]): string[] => {
    const next = preset.edges.find((edge) => edge[0] === id && edge[2] === 0 && names.has(edge[1]))
    if (!next || seen.includes(next[1])) return seen
    return walk(next[1], [...seen, next[1]])
  }
  return walk(first.id, [first.id]).map((id) => names.get(id) ?? id)
}

export function hookDocument(name: string, preset: Pick<Preset, "nodes" | "edges"> | undefined, text: PresetText) {
  const nodes: PresetNode[] = preset?.nodes ?? [
    {
      id: "event",
      text: "trigger.before.edit",
      type: TRIGGER,
      x: 120,
      y: 200,
      parameters: { operation: "edit", timing: "before" },
    },
  ]
  const ids = new Set(nodes.map((node) => node.id))
  const flow: Flow = {
    kind: "hook",
    nodes: nodes.map((node) => ({
      id: node.id,
      name: text(node.text),
      type: node.type,
      x: node.x,
      y: node.y,
      parameters: {
        ...node.parameters,
        ...(node.type === TRIGGER || node.type === CONDITION
          ? {}
          : { message: node.message ? text(node.message) : "" }),
      },
    })),
    edges: (preset?.edges ?? [])
      .filter((edge) => ids.has(edge[0]) && ids.has(edge[1]))
      .map(([from, to, port]) => ({ from, to, port })),
    phases: [],
  }
  return { name, ...documentFields(flow), tags: [], meta: { relay: { schema: 1, kind: "hook" } } }
}
