import type { RelayDocument, RelayDocumentFields, RelayNodeType } from "./client"
import { CONDITION, documentFields, type Flow, START, TRIGGER } from "./graph"

// Starting points for new documents. Workflow templates are the shipped Relay profiles the server seeded into the
// profile; "blank" is a start node only. Hook presets are small graphs built from the node types this server lists,
// so a preset never offers an action the server cannot run.

export type HookPresetID = "protect-generated" | "ask-shell" | "check-stop" | "remind-edit"
export type PresetKey =
  | "trigger.before.tool"
  | "trigger.before.edit"
  | "trigger.before.command"
  | "trigger.sessionIdle"
  | "preset.pathMatches"
  | "preset.isEdit"
  | "preset.isWrite"
  | "preset.pushMatches"
  | "preset.deleteMatches"
  | "preset.blockChange"
  | "preset.blockMessage"
  | "preset.askMessage"
  | "preset.gateMessage"
  | "preset.remindMessage"
  | "type.approve"
  | "type.verify"
  | "type.remind"
export type PresetText = (key: PresetKey) => string

export function blankWorkflow(name: string, startName: string): RelayDocumentFields {
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

// A copy keeps the source's Relay metadata: the retained sprint fields, and the profile mark that run admission
// reads, so a copy of a profile that cannot run yet cannot run either. A copy of a profile that can run is the
// user's own workflow, so it drops the mark and never lists as a template.
export function copyDocument(source: RelayDocument, name: string): RelayDocumentFields {
  return {
    name,
    description: source.description,
    nodes: source.nodes,
    connections: source.connections,
    nodeGroups: source.nodeGroups,
    tags: [],
    meta:
      source.runnable && source.meta.relay
        ? { ...source.meta, relay: { ...source.meta.relay, profile: undefined } }
        : source.meta,
  }
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
}

const PRESETS: Preset[] = [
  {
    // "Before any tool", not "Before edit file": Write replaces a whole file and is its own operation, and apply_patch
    // is an edit and a write at once. A tool trigger also sees reads, so the two Event conditions keep them out.
    id: "protect-generated",
    operations: ["tool"],
    nodes: [
      {
        id: "event",
        text: "trigger.before.tool",
        type: TRIGGER,
        x: 120,
        y: 200,
        parameters: { operation: "tool", timing: "before" },
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
        id: "edit",
        text: "preset.isEdit",
        type: CONDITION,
        x: 540,
        y: 200,
        parameters: { field: "event", pattern: "edit.before" },
      },
      {
        id: "write",
        text: "preset.isWrite",
        type: CONDITION,
        x: 540,
        y: 360,
        parameters: { field: "event", pattern: "write.before" },
      },
      {
        id: "block",
        text: "preset.blockChange",
        type: "relay.hookBlock",
        x: 760,
        y: 200,
        parameters: {},
        message: "preset.blockMessage",
      },
    ],
    edges: [
      ["event", "match", 0],
      ["match", "edit", 0],
      ["edit", "block", 0],
      ["edit", "write", 1],
      ["write", "block", 0],
    ],
  },
  {
    // Two conditions, not "git push * | rm -rf *": a `|` in a pattern is literal. The second is tried when the first
    // does not match and leads to the same Ask.
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
        id: "push",
        text: "preset.pushMatches",
        type: CONDITION,
        x: 320,
        y: 200,
        parameters: { field: "command", pattern: "git push *" },
      },
      {
        id: "delete",
        text: "preset.deleteMatches",
        type: CONDITION,
        x: 320,
        y: 360,
        parameters: { field: "command", pattern: "rm -rf *" },
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
    ],
    edges: [
      ["event", "push", 0],
      ["push", "ask", 0],
      ["push", "delete", 1],
      ["delete", "ask", 0],
    ],
  },
  {
    // Session start and stop only record: the runtime drops what a hook decides there, so this can run the check and
    // show Passed or Failed in Activity, but cannot send the agent back.
    id: "check-stop",
    operations: ["session-idle"],
    nodes: [
      {
        id: "event",
        text: "trigger.sessionIdle",
        type: TRIGGER,
        x: 120,
        y: 200,
        parameters: { operation: "session-idle", timing: "after" },
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
    ],
    edges: [["event", "gate", 0]],
  },
  {
    id: "remind-edit",
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

// Presets this server can hold: every operation and node type listed.
export function hookPresets(types: RelayNodeType[] | undefined) {
  const listed = new Set(types?.map((item) => item.type) ?? [])
  const operations = new Set(
    types
      ?.find((item) => item.type === TRIGGER)
      ?.parameters.find((parameter) => parameter.name === "operation")
      ?.options?.map((option) => option.value) ?? ["read", "edit", "write", "command", "tool", "session-idle"],
  )
  const available = (type: string) => !types || type === TRIGGER || type === CONDITION || listed.has(type)
  return PRESETS.filter(
    (preset) =>
      preset.operations.every((operation) => operations.has(operation)) &&
      preset.nodes.every((node) => available(node.type)),
  )
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

export function hookDocument(
  name: string,
  preset: Pick<Preset, "nodes" | "edges"> | undefined,
  text: PresetText,
): RelayDocumentFields {
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
