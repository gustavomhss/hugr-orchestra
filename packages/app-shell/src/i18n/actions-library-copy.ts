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
  "orchestra.actions.runAttempt": "run #{{run}} · attempt {{attempt}}",
} as const
