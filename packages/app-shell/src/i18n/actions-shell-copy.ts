export * as ActionsShellCopy from "./actions-shell-copy"

// Copy for Actions Actions shell: tabs, context navigation, breadcrumb and narrow layout.
export const dict = {
  "orchestra.actions.shell.workflows": "Workflows",
  "orchestra.actions.shell.runs": "Runs",
  "orchestra.actions.shell.settings": "Settings",
  "orchestra.actions.shell.browse": "Browse",
  "orchestra.actions.shell.allWorkflows": "All workflows",
  "orchestra.actions.shell.allRuns": "All runs",
  "orchestra.actions.shell.findWorkflow": "Find a workflow…",
  "orchestra.actions.shell.off": "off",
} as const

export const dictBr: Record<keyof typeof dict, string> = {
  "orchestra.actions.shell.workflows": "Workflows",
  "orchestra.actions.shell.runs": "Execuções",
  "orchestra.actions.shell.settings": "Configurações",
  "orchestra.actions.shell.browse": "Explorar",
  "orchestra.actions.shell.allWorkflows": "Todos os workflows",
  "orchestra.actions.shell.allRuns": "Todas as execuções",
  "orchestra.actions.shell.findWorkflow": "Encontrar um workflow…",
  "orchestra.actions.shell.off": "desligado",
}
