export * as ActionsDialogsCopy from "./actions-dialogs-copy"

// Copy for Actions dialogs and resource forms.
export const dict = {
  "orchestra.actions.dispatchWorkflow": "Run {{name}}",
  "orchestra.actions.dispatchDetail.github": "Inputs follow the selected ref’s workflow_dispatch definition.",
  "orchestra.actions.dispatchDetail.gitlab": "CI configuration at the selected ref determines jobs and rules.",
  "orchestra.actions.executionTarget": "Execution target",
  "orchestra.actions.branchOrTag": "Branch or tag",
  "orchestra.actions.branchOrTagHint": "A new execution uses the source revision at this ref.",
  "orchestra.actions.runInputs": "Run inputs",
  "orchestra.actions.noRunInputs": "No inputs are declared at this ref.",
  "orchestra.actions.newExecution": "New execution",
  "orchestra.actions.newExecution.detail": "Starting a run resolves the selected ref. Re-running an existing execution keeps its original source revision.",
} as const

export const dictBr: Record<keyof typeof dict, string> = {
  "orchestra.actions.dispatchWorkflow": "Executar {{name}}",
  "orchestra.actions.dispatchDetail.github": "Os inputs seguem a definição workflow_dispatch da ref selecionada.",
  "orchestra.actions.dispatchDetail.gitlab": "A configuração de CI na ref selecionada define os jobs e as regras.",
  "orchestra.actions.executionTarget": "Destino da execução",
  "orchestra.actions.branchOrTag": "Branch ou tag",
  "orchestra.actions.branchOrTagHint": "Uma nova execução usa a revisão de origem nesta ref.",
  "orchestra.actions.runInputs": "Inputs da execução",
  "orchestra.actions.noRunInputs": "Nenhum input está declarado nesta ref.",
  "orchestra.actions.newExecution": "Nova execução",
  "orchestra.actions.newExecution.detail": "Iniciar uma execução resolve a ref selecionada. Executar de novo uma execução existente mantém a revisão de origem original.",
}
