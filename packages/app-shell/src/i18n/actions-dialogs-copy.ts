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
