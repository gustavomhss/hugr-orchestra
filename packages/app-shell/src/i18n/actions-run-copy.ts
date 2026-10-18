export * as ActionsRunCopy from "./actions-run-copy"

// Copy for Actions run header, jobs and logs.
export const dict = {
  "orchestra.actions.runNumber": "Run {{id}}",
  "orchestra.actions.runViews": "Run views",
  "orchestra.actions.attemptOption": "Attempt {{number}}",
  "orchestra.actions.historicalAttempt": "Historical execution · read-only",
  "orchestra.actions.rerunFailed": "Re-run failed jobs",
  "orchestra.actions.rerunAll": "Re-run all jobs",
  "orchestra.actions.inspect": "Inspect",
  "orchestra.actions.jobNeeds": "needs {{jobs}}",
  "orchestra.actions.noDependencies": "no dependencies",
  "orchestra.actions.searchLog": "Search this log…",
  "orchestra.actions.downloadLog": "Download log",
  "orchestra.actions.expiresRelative": "Expires {{when}}",
  "orchestra.actions.enableWorkflow": "Enable",
  "orchestra.actions.disableWorkflow": "Disable",
} as const
