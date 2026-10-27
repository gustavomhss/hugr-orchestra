export * as ActionsLibraryCopy from "./actions-library-copy"

// Copy for Actions library, run history filters, tabs and cards.
export const dict = {
  "orchestra.actions.searchWorkflows": "Search workflows or source paths…",
  "orchestra.actions.searchRuns": "Search runs, workflows, refs or commits…",
  "orchestra.actions.needsApproval": "Needs approval",
  "orchestra.actions.manual": "Manual",
  "orchestra.actions.runsCount": "{{shown}} of {{loaded}} loaded runs",
  "orchestra.actions.runColumn": "Run / workflow",
  "orchestra.actions.refColumn": "Ref / trigger",
  "orchestra.actions.resultColumn": "Result",
  "orchestra.actions.timeColumn": "Time",
  "orchestra.actions.noRecentRun": "No recent run loaded",
  "orchestra.actions.runAttempt": "run {{run}} · attempt {{attempt}}",
} as const

export const dictBr: Record<keyof typeof dict, string> = {
  "orchestra.actions.searchWorkflows": "Buscar workflows ou caminhos de origem…",
  "orchestra.actions.searchRuns": "Buscar execuções, workflows, refs ou commits…",
  "orchestra.actions.needsApproval": "Precisa de aprovação",
  "orchestra.actions.manual": "Manual",
  "orchestra.actions.runsCount": "{{shown}} de {{loaded}} execuções carregadas",
  "orchestra.actions.runColumn": "Execução / workflow",
  "orchestra.actions.refColumn": "Ref / gatilho",
  "orchestra.actions.resultColumn": "Resultado",
  "orchestra.actions.timeColumn": "Horário",
  "orchestra.actions.noRecentRun": "Nenhuma execução recente carregada",
  "orchestra.actions.runAttempt": "execução {{run}} · tentativa {{attempt}}",
}
