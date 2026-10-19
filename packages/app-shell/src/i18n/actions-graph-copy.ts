export * as ActionsGraphCopy from "./actions-graph-copy"

// Copy for Actions workflow graph and matrix executions.
export const dict = {
  "orchestra.actions.graph.execution": "Execution graph",
  "orchestra.actions.graph.configuration": "Configuration graph",
  "orchestra.actions.graph.declaredNeeds": "Only declared needs",
  "orchestra.actions.graph.matrixDisplay": "Matrix display",
  "orchestra.actions.graph.grouped": "Grouped jobs",
  "orchestra.actions.graph.expanded": "Matrix executions",
  "orchestra.actions.graph.runs": "{{count}} runs",
  "orchestra.actions.graph.expand": "Show the {{name}} matrix executions",
  "orchestra.actions.graph.matrixRunner": "Runner from matrix",
  "orchestra.actions.graph.note.matrixDynamic": "Matrix values resolve at run time",
  "orchestra.actions.graph.note.reusable": "Reusable workflow jobs resolve at run time",
  "orchestra.actions.graph.note.needs": "Some job dependencies could not be resolved",
  "orchestra.actions.graph.note.triggers": "Workflow triggers are missing or invalid",
  "orchestra.actions.graph.note.includes": "Included configuration is not resolved here",
  "orchestra.actions.graph.note.inputs": "Input values resolve at run time",
  "orchestra.actions.graph.note.limit": "The source is too large to inspect completely",
  "orchestra.actions.graph.note.yaml": "Part of the YAML could not be read",
  "orchestra.actions.graph.note.partial": "Some source details resolve only at run time",
  "orchestra.actions.graph.note.unresolved": "Some source details could not be resolved",
} as const
