export * as AuthoringHook from "./hook"

import { Effect, Option, Schema } from "effect"
import type { RelayAuthoring } from "@orchestra/schema/relay-authoring"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { AuthoringGraph } from "./graph"

// Hook documents (relay_authoring/hooks.py; WP7), with the additive Allow node, Verify Pass/Fail ports and session
// triggers of `RelayHook` (PARITY-EXCEPTIONS W7-1).

// Operation labels for the trigger's choice, and the timings each one accepts.
const OPERATIONS: ReadonlyArray<readonly [RelayHook.Operation, string, ReadonlyArray<RelayHook.Timing>]> = [
  ["read", "Read file", ["before", "after"]],
  ["edit", "Edit file", ["before", "after"]],
  ["write", "Create file", ["before", "after"]],
  ["command", "Run command", ["before", "after"]],
  ["tool", "Any tool", ["before", "after"]],
  ["session-start", "Session start", ["after"]],
  ["prompt", "Prompt", ["before"]],
  ["session-idle", "Session stop", ["after"]],
]

const ACTIONS = [
  [RelayHook.NodeType.remind, "Send reminder"],
  [RelayHook.NodeType.block, "Block"],
  [RelayHook.NodeType.approve, "Ask for approval"],
  [RelayHook.NodeType.verify, "Run check"],
  [RelayHook.NodeType.repair, "Require repair"],
  [RelayHook.NodeType.record, "Record only"],
  [RelayHook.NodeType.allow, "Allow"],
] as const

// Hook node catalog: labels, ports and parameter defaults for authoring clients.
export const nodeTypes = (): ReadonlyArray<RelayAuthoring.NodeTypeDescriptor> => {
  const choice = (
    name: string,
    label: string,
    options: ReadonlyArray<readonly [string, string]>,
    fallback: string,
  ) => ({
    name,
    label,
    type: "options",
    default: fallback,
    options: options.map(([value, text]) => ({ value, label: text })),
  })
  const message = (type: RelayHook.NodeType) =>
    type === RelayHook.NodeType.allow
      ? { name: "message", label: "Note", type: "text", default: "" }
      : { name: "message", label: "Message", type: "text", default: "" }
  return [
    {
      type: RelayHook.NodeType.trigger,
      label: "Agent event",
      inputs: 0,
      outputs: [...RelayHook.Outputs[RelayHook.NodeType.trigger]],
      maximum: 1,
      parameters: [
        choice(
          "operation",
          "Operation",
          OPERATIONS.map(([operation, label]) => [operation, label] as const),
          "edit",
        ),
        choice(
          "timing",
          "Timing",
          [
            ["before", "Before the operation"],
            ["after", "After the operation"],
          ],
          "before",
        ),
      ],
    },
    {
      type: RelayHook.NodeType.condition,
      label: "Hook condition",
      inputs: 1,
      outputs: [...RelayHook.Outputs[RelayHook.NodeType.condition]],
      parameters: [
        choice(
          "field",
          "Field",
          [
            ["path", "File path"],
            ["tool", "Tool"],
            ["command", "Command"],
            ["event", "Event"],
          ],
          "path",
        ),
        { name: "pattern", label: "Matches pattern", type: "string", default: "", placeholder: "src/generated/**" },
      ],
    },
    ...ACTIONS.map(([type, label]) => ({
      type,
      label,
      inputs: 1,
      outputs: [...RelayHook.Outputs[type]],
      parameters:
        type === RelayHook.NodeType.verify
          ? [message(type), { name: "check", label: "Check command", type: "string", default: "" }]
          : [message(type)],
    })),
  ]
}

export const isHook = (document: unknown): boolean => {
  if (!isObject(document)) return false
  const meta = document.meta
  const relay = isObject(meta) ? meta.relay : undefined
  if (isObject(relay) && relay.kind === "hook") return true
  const nodes = document.nodes
  return (
    Array.isArray(nodes) &&
    nodes.some((node) => isObject(node) && typeof node.type === "string" && node.type.startsWith("relay.hook"))
  )
}

/**
 * `compile_hook`: resolves catalog defaults into each node, then refuses mixed workflow steps, a missing action, not
 * exactly one trigger, invalid ports, cycles, unreachable nodes, empty messages or checks, and Block or Approve on an
 * `after` trigger.
 */
export const compile = (document: unknown): Effect.Effect<RelayHook.V1, AuthoringGraph.Refusal> =>
  AuthoringGraph.refusing(
    Effect.gen(function* () {
      const graph = yield* AuthoringGraph.validate(document)
      const catalog = new Map(nodeTypes().map((descriptor) => [descriptor.type, descriptor]))
      const authored = graph.nodes ?? []
      if (!authored.length || authored.some((node) => !catalog.has(node.type)))
        return refuse("Hooks accept an event, conditions and hook actions; do not mix in workflow steps")
      // A client may omit parameters that equal the catalog default; the export carries the resolved values.
      const nodes = authored.map((node) => ({
        ...structuredClone(node),
        parameters: {
          ...Object.fromEntries(
            catalog.get(node.type)!.parameters.map((parameter) => [parameter.name, parameter.default]),
          ),
          ...structuredClone(node.parameters ?? {}),
        } as Record<string, unknown>,
      }))
      const byName = new Map(nodes.map((node) => [node.name, node]))
      if (!nodes.some((node) => node.type !== RelayHook.NodeType.trigger && node.type !== RelayHook.NodeType.condition))
        return refuse("Add at least one action to the hook")
      const triggers = nodes.filter((node) => node.type === RelayHook.NodeType.trigger)
      if (triggers.length !== 1) return refuse("A hook needs exactly one event")
      const trigger = triggers[0]!
      const timing = trigger.parameters.timing
      const accepted = OPERATIONS.find(([operation]) => operation === trigger.parameters.operation)?.[2] ?? []
      if (!accepted.some((value) => value === timing)) return refuse("Choose the event operation and timing")
      const adjacency = new Map(nodes.map((node) => [node.name, [] as string[]]))
      const connections: RelayHook.Connection[] = []
      Object.entries(graph.connections ?? {}).forEach(([source, outputs]) => {
        const node = byName.get(source)
        if (!node || Object.keys(outputs).some((key) => key !== "main")) return refuse("Invalid hook connection")
        const channels = outputs.main ?? []
        if (channels.length > catalog.get(node.type)!.outputs.length)
          return refuse("Invalid output port for this action")
        channels.forEach((channel, port) => {
          if (channel.length > 1) return refuse("A hook output accepts one next step")
          channel.forEach((edge) => {
            const target = byName.get(edge.node)
            if (!target || edge.type !== "main" || edge.index !== 0) return refuse("Invalid hook target")
            if (target === trigger) return refuse("The event takes no incoming connections")
            adjacency.get(source)!.push(target.name)
            connections.push({ from: node.id, port, to: target.id })
          })
        })
      })
      const seen = new Set<string>()
      const visiting = new Set<string>()
      const visit = (name: string): void => {
        if (visiting.has(name)) return refuse("Hooks do not accept cycles")
        if (seen.has(name)) return
        visiting.add(name)
        adjacency.get(name)!.forEach(visit)
        visiting.delete(name)
        seen.add(name)
      }
      visit(trigger.name)
      if (seen.size !== nodes.length || nodes.length < 2) return refuse("Connect the event to the next hook steps")
      nodes.forEach((node) => {
        const params = node.parameters
        if (node.type === RelayHook.NodeType.trigger) return
        if (node.type === RelayHook.NodeType.condition) {
          if (!["path", "tool", "command", "event"].some((field) => field === params.field))
            return refuse("Invalid condition field")
          return void AuthoringGraph.text(params.pattern, "Condition pattern", true)
        }
        // Allow's note is optional.
        AuthoringGraph.text(params.message, "Message", node.type !== RelayHook.NodeType.allow)
        if ((node.type === RelayHook.NodeType.block || node.type === RelayHook.NodeType.approve) && timing !== "before")
          return refuse("Block and approval need an event before the effect")
        if (node.type === RelayHook.NodeType.verify) AuthoringGraph.text(params.check, "Check command", true)
      })
      const exported = {
        schema: "relay.hook.v1",
        name: graph.name,
        nodes,
        connections,
        binding: "host-required",
        installed: false,
      }
      // TS only (PARITY-EXCEPTIONS W7-2): installs pin this export under the strict schema, so a field it does not
      // define is refused here, before publish, rather than at install. Decoding is the check only; the export keeps
      // the authored key order its sha256 is taken over, which a decode would not.
      if (Option.isNone(Schema.decodeUnknownOption(RelayHook.V1)(exported)))
        return refuse("The hook holds fields that relay.hook.v1 does not define")
      return exported as unknown as RelayHook.V1
    }),
  )

const refuse = AuthoringGraph.refuse

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
