export * as ActionsSourceCopy from "./actions-source-copy"

// Copy for Actions workflow source.
export const dict = {
  "orchestra.actions.sourceImmutable": "Fixed at the run's commit",
  "orchestra.actions.sourceTriggers": "Workflow triggers",
} as const

export const dictBr: Record<keyof typeof dict, string> = {
  "orchestra.actions.sourceImmutable": "Fixo no commit da execução",
  "orchestra.actions.sourceTriggers": "Gatilhos do workflow",
}
