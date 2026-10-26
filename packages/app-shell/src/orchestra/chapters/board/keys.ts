// Copy keys for the board's enums, shared by the board, the inbox and the replay.
export const stageKey = {
  intake: "orchestra.board.stage.intake",
  backlog: "orchestra.board.stage.backlog",
  ready: "orchestra.board.stage.ready",
  building: "orchestra.board.stage.building",
  review: "orchestra.board.stage.review",
  shipped: "orchestra.board.stage.shipped",
  cut: "orchestra.board.stage.cut",
} as const
export const healthKey = {
  on_track: "orchestra.board.health.onTrack",
  at_risk: "orchestra.board.health.atRisk",
  waiting_on_owner: "orchestra.board.health.waiting",
  paused: "orchestra.board.health.paused",
} as const
export const actorKey = {
  maestro: "orchestra.board.actor.maestro",
  owner: "orchestra.board.actor.owner",
  github: "orchestra.board.actor.github",
} as const
export const actionKey = {
  "project.upsert": "orchestra.board.action.projectUpsert",
  "epic.upsert": "orchestra.board.action.epicUpsert",
  "issue.create": "orchestra.board.action.issueCreate",
  "issue.update": "orchestra.board.action.issueUpdate",
  "issue.move": "orchestra.board.action.issueMove",
  "steps.set": "orchestra.board.action.stepsSet",
  "question.ask": "orchestra.board.action.questionAsk",
  "question.withdraw": "orchestra.board.action.questionWithdraw",
  "question.answer": "orchestra.board.action.questionAnswer",
  "note.add": "orchestra.board.action.noteAdd",
  "note.edit": "orchestra.board.action.noteEdit",
  "note.delete": "orchestra.board.action.noteDelete",
  "attachment.add": "orchestra.board.action.attachmentAdd",
  "attachment.remove": "orchestra.board.action.attachmentRemove",
  "archive.set": "orchestra.board.action.archiveSet",
  "intake.accept": "orchestra.board.action.intakeAccept",
  "intake.decline": "orchestra.board.action.intakeDecline",
  "hold.set": "orchestra.board.action.holdSet",
  "pause.set": "orchestra.board.action.pauseSet",
  "github.overwrite": "orchestra.board.action.githubOverwrite",
  "github.state": "orchestra.board.action.githubState",
  undo: "orchestra.board.action.undo",
} as const
export const shippedKey = {
  today: "orchestra.board.shipped.today",
  yesterday: "orchestra.board.shipped.yesterday",
  week: "orchestra.board.shipped.week",
  earlier: "orchestra.board.shipped.earlier",
} as const
