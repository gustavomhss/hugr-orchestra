import { Option, Schema } from "effect"
import { RelayAuthoring } from "@orchestra/schema/relay-authoring"
import { documentKind, record, type RelayDocument, type RelayDocumentFields } from "./client"
import { START } from "./graph"
import type { useRelayCopy } from "./ui"

// The file "Download definition" writes for a workflow, and the one Import reads. It is the authoring document, not
// the compiled plan: a plan cannot be opened in the editor again. The profile mark and the compile diagnostics are
// not carried; the server computes diagnostics again on the first save.
export const WORKFLOW_FILE = "orchestra-relay-workflow"

type Translate = ReturnType<typeof useRelayCopy>["t"]

export const workflowFile = (document: RelayDocument) => ({
  format: WORKFLOW_FILE,
  version: 1,
  name: document.name,
  description: document.description,
  nodes: document.nodes,
  connections: document.connections,
  nodeGroups: document.nodeGroups,
  meta: { relay: { schema: 1, kind: "workflow", sprint: document.meta.relay?.sprint } },
})

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const decodeNode = Schema.decodeUnknownOption(RelayAuthoring.Node)
const decodeConnections = Schema.decodeUnknownOption(RelayAuthoring.Connections)
const decodeGroup = Schema.decodeUnknownOption(RelayAuthoring.NodeGroup)
const decodeRelayMeta = Schema.decodeUnknownOption(RelayAuthoring.RelayMeta)

// Reads a downloaded file or pasted JSON with the schema the server stores documents with. A draft with open
// problems (an empty checkpoint, a missing skill) still imports: the editor lists those, as for any draft. What is
// refused is what the editor could not open at all.
export function parseWorkflowFile(
  text: string,
  t: Translate,
): { document: RelayDocumentFields } | { errors: string[] } {
  const value = Option.getOrUndefined(decodeJson(text))
  if (!record(value)) return { errors: [t("orchestra.workflows.import.notJson")] }
  if (value.format !== undefined && value.format !== WORKFLOW_FILE)
    return { errors: [t("orchestra.workflows.import.wrongFormat")] }
  // A file without a format mark that has no steps is what older versions downloaded: the compiled plan.
  if (!Array.isArray(value.nodes))
    return { errors: [t(value.format === undefined ? "orchestra.workflows.import.compiled" : "orchestra.workflows.import.noNodes")] }

  const nodes = value.nodes.map((item) => decodeNode(item))
  const connections = decodeConnections(value.connections ?? {})
  const groups = Array.isArray(value.nodeGroups) ? value.nodeGroups.map((item) => decodeGroup(item)) : []
  const meta = record(value.meta) && record(value.meta.relay) ? decodeRelayMeta(value.meta.relay) : Option.some<RelayAuthoring.RelayMeta>({})
  const errors = [
    ...nodes.flatMap((node, index) =>
      Option.isNone(node) ? [t("orchestra.workflows.import.badNode", { n: index + 1 })] : [],
    ),
    ...(Option.isNone(connections) ? [t("orchestra.workflows.import.badConnections")] : []),
    ...(value.nodeGroups !== undefined && !Array.isArray(value.nodeGroups) ? [t("orchestra.workflows.import.badPhase")] : []),
    ...groups.flatMap((group) => (Option.isNone(group) ? [t("orchestra.workflows.import.badPhase")] : [])),
    ...(Option.isNone(meta) ? [t("orchestra.workflows.import.badMeta")] : []),
    ...(value.name !== undefined && typeof value.name !== "string" ? [t("orchestra.workflows.import.badName")] : []),
    ...(value.description !== undefined && typeof value.description !== "string"
      ? [t("orchestra.workflows.import.badDescription")]
      : []),
  ]
  if (errors.length) return { errors }

  const document = {
    nodes: nodes.flatMap((node) => Option.toArray(node)),
    connections: Option.getOrThrow(connections),
    nodeGroups: groups.flatMap((group) => Option.toArray(group)),
  }
  const relay = Option.getOrThrow(meta)
  const structure = [
    ...(documentKind({ meta: { relay }, nodes: document.nodes }) === "hook" ? [t("orchestra.workflows.import.isHook")] : []),
    ...(document.nodes.filter((node) => node.type === START).length === 1
      ? []
      : [t("orchestra.workflows.import.startCount")]),
    ...(new Set(document.nodes.map((node) => node.id)).size === document.nodes.length
      ? []
      : [t("orchestra.workflows.import.duplicateIds")]),
    ...(new Set(document.nodes.map((node) => node.name)).size === document.nodes.length
      ? []
      : [t("orchestra.workflows.import.duplicateNames")]),
    ...unknownSteps(document, t),
  ]
  if (structure.length) return { errors: structure }

  const name = typeof value.name === "string" ? value.name.trim() : ""
  return {
    document: {
      name: name || t("orchestra.workflows.import.defaultName"),
      description: typeof value.description === "string" ? value.description : "",
      ...document,
      tags: [],
      meta: { relay: { schema: 1, kind: "workflow", ...(relay.sprint ? { sprint: relay.sprint } : {}) } },
    },
  }
}

// A connection is keyed by the source step's name and points at its target by name; one that names a step the file
// does not have would silently drop out of the graph.
function unknownSteps(
  document: { nodes: readonly RelayAuthoring.Node[]; connections: RelayAuthoring.Connections },
  t: Translate,
) {
  const names = new Set(document.nodes.map((node) => node.name))
  return Object.entries(document.connections).flatMap(([source, outputs]) =>
    !names.has(source) || outputs.main.some((channel) => channel.some((edge) => !names.has(edge.node)))
      ? [t("orchestra.workflows.import.unknownStep", { name: source })]
      : [],
  )
}
