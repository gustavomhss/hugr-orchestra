import type { RelayNodeType } from "./client"
import { CONDITION, type FlowNode, type Outputs, START, TRIGGER } from "./graph"

// 16-unit line icons for controls (same stroke style as the sidebar marks).
export const ICON = {
  workflows:
    '<rect x="1.8" y="2.6" width="4" height="4" rx="1"/><rect x="10.2" y="2.6" width="4" height="4" rx="1"/><rect x="6" y="9.6" width="4" height="4" rx="1"/><path d="M5.8 4.6h4.4M12.2 6.6v1.6a1.2 1.2 0 0 1-1.2 1.2H10"/>',
  hooks: '<path d="M4 2v7a4 4 0 0 0 8 0V7M9 9l3-3 3 3"/><circle cx="4" cy="2" r="1"/>',
  back: '<path d="m9.5 3.5-4.5 4.5 4.5 4.5"/>',
  next: '<path d="m6.5 3.5 4.5 4.5-4.5 4.5"/>',
  chevron: '<path d="m6 4 4 4-4 4"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  close: '<path d="m4 4 8 8m0-8-8 8"/>',
  play: '<path d="M5 3.4v9.2L12.4 8z"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>',
  more: '<path d="M3.5 8h.1M8 8h.1M12.5 8h.1" stroke-width="2.2"/>',
  edit: '<path d="M3 13h2.5L12.5 6 10 3.5 3 10.5z"/>',
  fit: '<path d="M2.8 6V2.8H6M10 2.8h3.2V6M13.2 10v3.2H10M6 13.2H2.8V10"/>',
  zoomIn: '<circle cx="7" cy="7" r="4.2"/><path d="m10.2 10.2 3 3M5 7h4M7 5v4"/>',
  zoomOut: '<circle cx="7" cy="7" r="4.2"/><path d="m10.2 10.2 3 3M5 7h4"/>',
  keys: '<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 6.6h.1M6.5 6.6h.1M9 6.6h.1M11.5 6.6h.1M5 9.4h6"/>',
  warn: '<path d="M8 2.6 14.4 13.4H1.6z"/><path d="M8 6.6v3.1M8 11.5v.1"/>',
  wait: '<circle cx="8" cy="8" r="6"/><path d="M6.4 5.8v4.4M9.6 5.8v4.4"/>',
  open: '<path d="M6 3.5H3.5v9h9V10M9 3h4v4M13 3 7.5 8.5"/>',
  download: '<path d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7M3 13h10"/>',
  test: '<path d="M6 2.5h4M6.8 2.5v4L3.5 12a1 1 0 0 0 .9 1.5h7.2a1 1 0 0 0 .9-1.5L9.2 6.5v-4"/>',
  upload: '<path d="M8 13V5.5M4.8 8.7 8 5.5l3.2 3.2M3 3h10"/>',
  check: '<path d="m3.5 8.3 2.8 2.8 6.2-6.6"/>',
  history: '<path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8M2.8 2.8v2.6h2.6M8 5.2V8l2 1.4"/>',
}

// 24-unit canvas glyphs: thin line marks centred in the node tiles.
export const GLYPH = {
  start:
    '<path d="M10.5 10.5 15 21l1.6-4.4L21 15z"/><path d="M6.2 13.6a6 6 0 1 1 7.4-7.4M3.4 14.6A9 9 0 1 1 14.6 3.4"/>',
  execute: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m7 9.5 3 2.5-3 2.5M12.5 15.5H17"/>',
  gate: '<path d="M12 3 4.6 6v5.4c0 4.6 3.1 8.2 7.4 9.6 4.3-1.4 7.4-5 7.4-9.6V6z"/><path d="m8.8 12.1 2.3 2.3 4.2-4.5"/>',
  review: '<circle cx="9.5" cy="10" r="5.6"/><circle cx="14.5" cy="14" r="5.6"/>',
  inject: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 15.5h5"/>',
  human: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.6-3.6 3.2-5.6 6.5-5.6 1.4 0 2.6.3 3.6 1M15 18l2 2 4-4.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  read: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  write: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M12.5 11v6M9.5 14h6"/>',
  command: '<path d="m5 7 5 5-5 5M12 18h7"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2.5"/>',
  prompt: '<path d="M3.5 5h17v11.5H11L7 20v-3.5H3.5z"/><path d="M8 10h8M8 13h5"/>',
  condition: '<path d="M3.5 12H9M9 12l4.5-5.5H20M9 12l4.5 5.5H20"/>',
  block: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  ask: '<path d="M3.5 5h17v11.5H11L7 20v-3.5H3.5z"/><path d="M10 9.2a2.1 2.1 0 1 1 2.7 2c-.4.2-.7.5-.7 1M12 14.3v.1"/>',
  allow: '<circle cx="12" cy="12" r="8.5"/><path d="m8.4 12.2 2.5 2.5 4.8-5"/>',
  remind: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5h4"/>',
  verify:
    '<path d="M12 3 4.6 6v5.4c0 4.6 3.1 8.2 7.4 9.6 4.3-1.4 7.4-5 7.4-9.6V6z"/><path d="m8.8 12.1 2.3 2.3 4.2-4.5"/>',
  repair:
    '<path d="M14.8 3.5a5 5 0 0 0-4.6 6.8L3.6 16.9a1.9 1.9 0 0 0 2.7 2.7l6.6-6.6a5 5 0 0 0 6.8-4.6l-3 3-2.6-.8-.8-2.6z"/>',
  record: '<path d="M6 3.5h12v17H6z"/><path d="M9 8h6M9 11.5h6M9 15h4"/>',
  phase: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/>',
}
export const BOLT = '<path d="M8.5 0 1 10h5l-1 8 8-11H8z"/>'

export type Glyph = keyof typeof GLYPH
// Colour family per node (the `k-*` classes).
export type Tone =
  | "execute"
  | "gate"
  | "review"
  | "start"
  | "inject"
  | "human"
  | "condition"
  | "block"
  | "ask"
  | "allow"
  | "remind"
  | "verify"
  | "repair"
  | "record"

export type WorkflowKey = "execute" | "inject" | "review" | "human" | "gate" | "phase"
export type HookKey = "condition" | "block" | "approve" | "allow" | "remind" | "verify" | "repair" | "record"
export type WorkflowEntry = {
  key: WorkflowKey
  type: string
  group: "work" | "gates" | "structure"
  glyph: Glyph
  tone: Tone
}
export type HookEntry = { key: HookKey; type: string; group: "conditions" | "actions"; glyph: Glyph; tone: Tone }
export type TriggerEntry = {
  key: `trigger:${string}`
  type: string
  group: "trigger"
  glyph: Glyph
  tone: Tone
  operation: string
}

// Workflow steps in the add panel; "phase" groups the selection instead of adding a node.
export const WORKFLOW_ENTRIES: WorkflowEntry[] = [
  { key: "execute", type: "relay.execute", group: "work", glyph: "execute", tone: "execute" },
  { key: "inject", type: "relay.inject", group: "work", glyph: "inject", tone: "inject" },
  { key: "review", type: "relay.review", group: "work", glyph: "review", tone: "review" },
  { key: "human", type: "relay.human", group: "work", glyph: "human", tone: "human" },
  { key: "gate", type: "relay.gate", group: "gates", glyph: "gate", tone: "gate" },
  { key: "phase", type: "phase", group: "structure", glyph: "phase", tone: "execute" },
]

const HOOK_ACTIONS: HookEntry[] = [
  { key: "condition", type: CONDITION, group: "conditions", glyph: "condition", tone: "condition" },
  { key: "block", type: "relay.hookBlock", group: "actions", glyph: "block", tone: "block" },
  { key: "approve", type: "relay.hookApprove", group: "actions", glyph: "ask", tone: "ask" },
  { key: "allow", type: "relay.hookAllow", group: "actions", glyph: "allow", tone: "allow" },
  { key: "remind", type: "relay.hookRemind", group: "actions", glyph: "remind", tone: "remind" },
  { key: "verify", type: "relay.hookVerify", group: "actions", glyph: "verify", tone: "verify" },
  { key: "repair", type: "relay.hookRepair", group: "actions", glyph: "repair", tone: "repair" },
  { key: "record", type: "relay.hookRecord", group: "actions", glyph: "record", tone: "record" },
]

// Before the server's catalog arrives, these are the contract's operations (schema relay-hook `TriggerParameters`):
// the tool operations, then the session events of the former Hooks page.
const DEFAULT_OPERATIONS = ["read", "edit", "write", "command", "tool", "session-start", "prompt", "session-idle"]

/** The timings an operation accepts: session start and stop fire after, a prompt before, tools either way. */
export function operationTimings(operation: string) {
  if (operation === "session-start" || operation === "session-idle") return ["after"]
  if (operation === "prompt") return ["before"]
  return ["before", "after"]
}

// Hook entries offered by this server: one trigger per operation it lists, then the actions it implements.
export function hookEntries(types: RelayNodeType[] | undefined): (HookEntry | TriggerEntry)[] {
  const trigger = types?.find((item) => item.type === TRIGGER)
  const operations = trigger?.parameters
    .find((parameter) => parameter.name === "operation")
    ?.options?.map((option) => option.value)
  const triggers = (operations ?? DEFAULT_OPERATIONS).map(
    (operation): TriggerEntry => ({
      key: `trigger:${operation}`,
      type: TRIGGER,
      group: "trigger",
      glyph: operationGlyph(operation),
      tone: "start",
      operation,
    }),
  )
  if (!types) return [...triggers, ...HOOK_ACTIONS]
  const listed = new Set(types.map((item) => item.type))
  return [...triggers, ...HOOK_ACTIONS.filter((entry) => listed.has(entry.type))]
}

export function operationGlyph(operation: string): Glyph {
  if (operation === "read" || operation === "write" || operation === "command" || operation === "edit") return operation
  if (operation === "tool") return "execute"
  if (operation === "session-idle") return "stop"
  if (operation === "prompt") return "prompt"
  if (operation === "session-start") return "start"
  return "edit"
}

// Output labels for hook nodes: the server's catalog when it has one, else the contract (schema `RelayHook.Outputs`).
export function hookOutputs(types: RelayNodeType[] | undefined): Outputs {
  if (!types) return { [CONDITION]: ["Yes", "No"], "relay.hookBlock": [], "relay.hookVerify": ["Pass", "Fail"] }
  return Object.fromEntries(
    types.map((item) => [item.type, item.outputs.map((output) => (output === "main" ? "" : output))]),
  )
}

export function nodeGlyph(node: FlowNode): Glyph {
  if (node.type === START) return "start"
  if (node.type === TRIGGER) return operationGlyph(String(node.parameters.operation ?? "edit"))
  const entry = [...WORKFLOW_ENTRIES, ...HOOK_ACTIONS].find((item) => item.type === node.type)
  return entry?.glyph ?? "execute"
}

export function nodeTone(node: FlowNode): Tone {
  if (node.type === START || node.type === TRIGGER) return "start"
  const entry = [...WORKFLOW_ENTRIES, ...HOOK_ACTIONS].find((item) => item.type === node.type)
  return entry?.tone ?? "execute"
}

// The i18n key suffix for a node type ("execute", "gate", "condition", …).
export const workflowKey = (type: string) => WORKFLOW_ENTRIES.find((item) => item.type === type)?.key
export const hookKey = (type: string) => HOOK_ACTIONS.find((item) => item.type === type)?.key
export const isFileOperation = (value: string): value is "read" | "edit" | "write" | "command" =>
  value === "read" || value === "edit" || value === "write" || value === "command"
