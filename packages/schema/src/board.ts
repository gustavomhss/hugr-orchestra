export * as Board from "./board"

import { Schema } from "effect"
import { define, inventory } from "./event"
import { ascending } from "./identifier"
import { PullRequest } from "./pull-request"
import { NonNegativeInt, optional, PositiveInt, statics } from "./schema"

// The Projects board: Maestro plans projects, epics, issues and steps; the owner answers, comments, attaches,
// undoes, pauses and holds. "Project" elsewhere is the git repo, so board types are always Board.*.

export const ProjectID = Schema.String.pipe(
  Schema.brand("Board.ProjectID"),
  statics((schema) => ({ create: () => schema.make("bpr_" + ascending()) })),
)
export type ProjectID = typeof ProjectID.Type

export const EpicID = Schema.String.pipe(
  Schema.brand("Board.EpicID"),
  statics((schema) => ({ create: () => schema.make("bep_" + ascending()) })),
)
export type EpicID = typeof EpicID.Type

export const IssueID = Schema.String.pipe(
  Schema.brand("Board.IssueID"),
  statics((schema) => ({ create: () => schema.make("bis_" + ascending()) })),
)
export type IssueID = typeof IssueID.Type

export const StepID = Schema.String.pipe(
  Schema.brand("Board.StepID"),
  statics((schema) => ({ create: () => schema.make("bst_" + ascending()) })),
)
export type StepID = typeof StepID.Type

export const QuestionID = Schema.String.pipe(
  Schema.brand("Board.QuestionID"),
  statics((schema) => ({ create: () => schema.make("bqu_" + ascending()) })),
)
export type QuestionID = typeof QuestionID.Type

export const NoteID = Schema.String.pipe(
  Schema.brand("Board.NoteID"),
  statics((schema) => ({ create: () => schema.make("bno_" + ascending()) })),
)
export type NoteID = typeof NoteID.Type

export const AttachmentID = Schema.String.pipe(
  Schema.brand("Board.AttachmentID"),
  statics((schema) => ({ create: () => schema.make("bat_" + ascending()) })),
)
export type AttachmentID = typeof AttachmentID.Type

// Time-ordered, so `since` compares ids.
export const ActivityID = Schema.String.pipe(
  Schema.brand("Board.ActivityID"),
  statics((schema) => ({ create: () => schema.make("bac_" + ascending()) })),
)
export type ActivityID = typeof ActivityID.Type

export const Key = Schema.String.check(Schema.isPattern(/^[A-Z]{2,6}$/)).annotate({ identifier: "Board.Key" })

export const ProjectStatus = Schema.Literals(["active", "paused", "shipped", "archived"]).annotate({
  identifier: "Board.ProjectStatus",
})
export type ProjectStatus = typeof ProjectStatus.Type

export const GithubState = Schema.Literals(["off", "ok", "signed_out", "rate_limited", "error"]).annotate({
  identifier: "Board.GithubState",
})
export type GithubState = typeof GithubState.Type

export const EpicStatus = Schema.Literals(["open", "shipped", "cut"]).annotate({ identifier: "Board.EpicStatus" })
export type EpicStatus = typeof EpicStatus.Type

export const IssueType = Schema.Literals(["feature", "bug", "chore"]).annotate({ identifier: "Board.IssueType" })
export type IssueType = typeof IssueType.Type

// `intake` holds only GitHub-born issues waiting for the owner.
export const Stage = Schema.Literals(["intake", "backlog", "ready", "building", "review", "shipped", "cut"]).annotate({
  identifier: "Board.Stage",
})
export type Stage = typeof Stage.Type

export const Estimate = Schema.Literals(["s", "m", "l"]).annotate({ identifier: "Board.Estimate" })
export type Estimate = typeof Estimate.Type

export const StepStatus = Schema.Literals(["pending", "active", "done", "skipped"]).annotate({
  identifier: "Board.StepStatus",
})
export type StepStatus = typeof StepStatus.Type

export const QuestionStatus = Schema.Literals(["open", "answered", "withdrawn"]).annotate({
  identifier: "Board.QuestionStatus",
})
export type QuestionStatus = typeof QuestionStatus.Type

export const AttachmentKind = Schema.Literals(["file", "image", "video", "doc", "secret"]).annotate({
  identifier: "Board.AttachmentKind",
})
export type AttachmentKind = typeof AttachmentKind.Type

export const Actor = Schema.Literals(["maestro", "owner", "github"]).annotate({ identifier: "Board.Actor" })
export type Actor = typeof Actor.Type

export const Action = Schema.Literals([
  "project.upsert",
  "epic.upsert",
  "issue.create",
  "issue.update",
  "issue.move",
  "steps.set",
  "question.ask",
  "question.withdraw",
  "question.answer",
  "note.add",
  "note.edit",
  "note.delete",
  "attachment.add",
  "attachment.remove",
  "intake.accept",
  "intake.decline",
  "hold.set",
  "pause.set",
  "archive.set",
  "github.overwrite",
  "github.state",
  "undo",
]).annotate({ identifier: "Board.Action" })
export type Action = typeof Action.Type

export const Health = Schema.Literals(["on_track", "at_risk", "waiting_on_owner", "paused"]).annotate({
  identifier: "Board.Health",
})
export type Health = typeof Health.Type

export interface Project extends Schema.Schema.Type<typeof Project> {}
export const Project = Schema.Struct({
  id: ProjectID,
  key: Schema.String,
  name: Schema.String,
  goal: Schema.String,
  /** Epoch milliseconds, date only. */
  targetDate: Schema.NullOr(Schema.Finite),
  budgetUsd: Schema.NullOr(Schema.Finite),
  /** The git repo (core Project) the agents work in. */
  repoProjectID: Schema.NullOr(Schema.String),
  githubRepo: Schema.NullOr(Schema.String),
  status: ProjectStatus,
  pausedReason: Schema.NullOr(Schema.String),
  autoAcceptIntake: Schema.Boolean,
  githubState: GithubState,
  githubError: Schema.NullOr(Schema.String),
  githubSyncedAt: Schema.NullOr(Schema.Finite),
}).annotate({ identifier: "Board.Project" })

export interface Epic extends Schema.Schema.Type<typeof Epic> {}
export const Epic = Schema.Struct({
  id: EpicID,
  number: PositiveInt,
  /** `LCH-E1`. */
  ref: Schema.String,
  title: Schema.String,
  goal: Schema.String,
  position: Schema.Finite,
  status: EpicStatus,
  githubMilestone: Schema.NullOr(Schema.Int),
}).annotate({ identifier: "Board.Epic" })

export interface Step extends Schema.Schema.Type<typeof Step> {}
export const Step = Schema.Struct({
  title: Schema.String,
  status: StepStatus,
  /** The live line on a building card, for example "Writing tests". */
  now: Schema.NullOr(Schema.String),
}).annotate({ identifier: "Board.Step" })

export interface Issue extends Schema.Schema.Type<typeof Issue> {}
export const Issue = Schema.Struct({
  id: IssueID,
  number: PositiveInt,
  /** `LCH-58`. */
  ref: Schema.String,
  /** The epic's number in the same project. */
  epic: Schema.NullOr(PositiveInt),
  title: Schema.String,
  body: Schema.String,
  type: IssueType,
  stage: Stage,
  position: Schema.Finite,
  estimate: Schema.NullOr(Estimate),
  /** Agent id of the seat doing the work. */
  seat: Schema.NullOr(Schema.String),
  sessionID: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  prNumber: Schema.NullOr(Schema.Int),
  holdBeforeMerge: Schema.Boolean,
  paused: Schema.Boolean,
  stageEnteredAt: Schema.Finite,
  githubNumber: Schema.NullOr(Schema.Int),
  steps: Schema.Array(Step),
  /** Refs of the issues this one waits on, possibly in other projects. */
  dependsOn: Schema.Array(Schema.String),
}).annotate({ identifier: "Board.Issue" })

export interface Option extends Schema.Schema.Type<typeof Option> {}
export const Option = Schema.Struct({
  id: Schema.String.check(Schema.isNonEmpty()),
  label: Schema.String.check(Schema.isNonEmpty()),
  consequence: Schema.String,
}).annotate({ identifier: "Board.Option" })

export interface Question extends Schema.Schema.Type<typeof Question> {}
export const Question = Schema.Struct({
  id: QuestionID,
  issue: Schema.NullOr(PositiveInt),
  epic: Schema.NullOr(PositiveInt),
  text: Schema.String,
  options: Schema.Array(Option),
  recommended: Schema.String,
  costOfWaiting: Schema.NullOr(Schema.String),
  blocking: Schema.Boolean,
  status: QuestionStatus,
  answerOption: Schema.NullOr(Schema.String),
  answerText: Schema.NullOr(Schema.String),
  answeredAt: Schema.NullOr(Schema.Finite),
  timeCreated: Schema.Finite,
}).annotate({ identifier: "Board.Question" })

export interface Note extends Schema.Schema.Type<typeof Note> {}
export const Note = Schema.Struct({
  id: NoteID,
  issue: PositiveInt,
  /** `owner`, `maestro` or `github:<login>`. */
  author: Schema.String,
  body: Schema.String,
  timeCreated: Schema.Finite,
}).annotate({ identifier: "Board.Note" })

// A secret shows its label as `name` and never its value or where it is stored.
export interface Attachment extends Schema.Schema.Type<typeof Attachment> {}
export const Attachment = Schema.Struct({
  id: AttachmentID,
  issue: PositiveInt,
  kind: AttachmentKind,
  name: Schema.String,
  mime: Schema.NullOr(Schema.String),
  size: Schema.NullOr(NonNegativeInt),
  timeCreated: Schema.Finite,
}).annotate({ identifier: "Board.Attachment" })

const Fields = Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown))

export interface Activity extends Schema.Schema.Type<typeof Activity> {}
export const Activity = Schema.Struct({
  id: ActivityID,
  issue: Schema.NullOr(PositiveInt),
  actor: Actor,
  action: Action,
  reason: Schema.NullOr(Schema.String),
  /** Only the changed fields. */
  before: Fields,
  after: Fields,
  undoes: Schema.NullOr(ActivityID),
  undoneBy: Schema.NullOr(ActivityID),
  timeCreated: Schema.Finite,
}).annotate({ identifier: "Board.Activity" })

// When the remaining work should ship, from a seeded Monte Carlo over the daily shipped throughput. `waits` names the
// issue an epic's remaining work is blocked on; `insufficient` means fewer than `needed` issues shipped so far.
// Dates are UTC midnight epoch milliseconds.
export const Forecast = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("done") }),
  Schema.Struct({ kind: Schema.Literal("waits"), on: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("insufficient"), shipped: NonNegativeInt, needed: PositiveInt }),
  Schema.Struct({
    kind: Schema.Literal("dates"),
    p50: Schema.Finite,
    p85: Schema.Finite,
    /** Whole days each date lands after the target; negative is early. Null without a target date. */
    vsTarget: Schema.NullOr(Schema.Struct({ p50: Schema.Int, p85: Schema.Int })),
  }),
]).annotate({ identifier: "Board.Forecast" })
export type Forecast = typeof Forecast.Type

export interface ProjectForecast extends Schema.Schema.Type<typeof ProjectForecast> {}
export const ProjectForecast = Schema.Struct({
  shipped: NonNegativeInt,
  remaining: NonNegativeInt,
  targetDate: Schema.NullOr(Schema.Finite),
  forecast: Forecast,
}).annotate({ identifier: "Board.ProjectForecast" })

// Epics forecast in position order, so an epic's dates include the open epics before it.
export interface EpicForecast extends Schema.Schema.Type<typeof EpicForecast> {}
export const EpicForecast = Schema.Struct({
  epic: PositiveInt,
  ref: Schema.String,
  shipped: NonNegativeInt,
  remaining: NonNegativeInt,
  forecast: Forecast,
  /** The long pole: the epic with the latest P85 sets the project date. */
  setsDate: Schema.Boolean,
}).annotate({ identifier: "Board.EpicForecast" })

// One point each time the scope total or the shipped count changed; `reason` is the activity reason of a scope step.
export interface ScopePoint extends Schema.Schema.Type<typeof ScopePoint> {}
export const ScopePoint = Schema.Struct({
  at: Schema.Finite,
  scope: NonNegativeInt,
  shipped: NonNegativeInt,
  reason: Schema.NullOr(Schema.String),
}).annotate({ identifier: "Board.ScopePoint" })

export interface Summary extends Schema.Schema.Type<typeof Summary> {}
export const Summary = Schema.Struct({
  project: Project,
  stages: Schema.Record(Schema.String, NonNegativeInt),
  openQuestions: NonNegativeInt,
  health: Health,
  forecast: ProjectForecast,
}).annotate({ identifier: "Board.Summary" })

export interface Snapshot extends Schema.Schema.Type<typeof Snapshot> {}
export const Snapshot = Schema.Struct({
  project: Project,
  epics: Schema.Array(Epic),
  issues: Schema.Array(Issue),
  questions: Schema.Array(Question),
  /** Newest activity id, to pass back as `since`. */
  cursor: Schema.NullOr(ActivityID),
  forecast: ProjectForecast,
  epicForecasts: Schema.Array(EpicForecast),
  scope: Schema.Array(ScopePoint),
}).annotate({ identifier: "Board.Snapshot" })

// The git trail is read live and never stored. Signed out says so instead of showing stale data.
export const Trail = Schema.Union([
  Schema.Struct({ state: Schema.Literal("none"), branch: Schema.NullOr(Schema.String) }),
  Schema.Struct({ state: Schema.Literal("signed_out"), message: Schema.String }),
  Schema.Struct({ state: Schema.Literal("error"), message: Schema.String }),
  Schema.Struct({
    state: Schema.Literal("ok"),
    branch: Schema.String,
    pr: PullRequest.Detail,
    /** Commits on the PR; `seat` is the issue's seat, since commits carry no agent id. */
    commits: Schema.Array(Schema.Struct({ hash: Schema.String, message: Schema.String, seat: Schema.NullOr(Schema.String) })),
  }),
]).annotate({ identifier: "Board.Trail" })
export type Trail = typeof Trail.Type

export interface IssuePage extends Schema.Schema.Type<typeof IssuePage> {}
export const IssuePage = Schema.Struct({
  issue: Issue,
  questions: Schema.Array(Question),
  notes: Schema.Array(Note),
  attachments: Schema.Array(Attachment),
  activity: Schema.Array(Activity),
  dependencies: Schema.Struct({ dependsOn: Schema.Array(Schema.String), blocks: Schema.Array(Schema.String) }),
  trail: Trail,
}).annotate({ identifier: "Board.IssuePage" })

// What `board_read` gives Maestro: the snapshot, what the owner did since `since`, attachment names and,
// when asked, one issue page.
export interface Read extends Schema.Schema.Type<typeof Read> {}
export const Read = Schema.Struct({
  ...Snapshot.fields,
  since: Schema.Struct({
    activity: Schema.Array(Activity),
    notes: Schema.Array(Note),
    answers: Schema.Array(Question),
  }),
  attachments: Schema.Array(Attachment),
  issue: IssuePage.pipe(optional),
}).annotate({ identifier: "Board.Read" })

export interface WriteResult extends Schema.Schema.Type<typeof WriteResult> {}
export const WriteResult = Schema.Struct({
  activity: ActivityID,
  issue: Issue.pipe(optional),
}).annotate({ identifier: "Board.WriteResult" })

const Text = Schema.Trim.check(Schema.isNonEmpty())
const Reason = Schema.Trim.check(Schema.isNonEmpty()).annotate({
  description: "Why, in one sentence. Required on every write and kept in the board log.",
})

// Maestro tool inputs keep the contract's snake_case names.

export const ReadInput = Schema.Struct({
  project: Key,
  issue: PositiveInt.pipe(optional),
  since: ActivityID.pipe(optional),
}).annotate({ identifier: "Board.ReadInput" })
export type ReadInput = typeof ReadInput.Type

export const ProjectInput = Schema.Struct({
  key: Key,
  name: Text.pipe(optional),
  goal: Schema.String.pipe(optional),
  target_date: Schema.NullOr(Schema.Finite).pipe(optional),
  /** The repo directory (core Project worktree) the agents work in. */
  repo: Schema.NullOr(Schema.String).pipe(optional),
  github_repo: Schema.NullOr(Schema.String.check(Schema.isPattern(/^[\w.-]+\/[\w.-]+$/))).pipe(optional),
  reason: Reason,
}).annotate({ identifier: "Board.ProjectInput" })
export type ProjectInput = typeof ProjectInput.Type

export const EpicInput = Schema.Struct({
  project: Key,
  number: PositiveInt.pipe(optional),
  title: Text.pipe(optional),
  goal: Schema.String.pipe(optional),
  position: Schema.Finite.pipe(optional),
  status: EpicStatus.pipe(optional),
  reason: Reason,
}).annotate({ identifier: "Board.EpicInput" })
export type EpicInput = typeof EpicInput.Type

export const IssueInput = Schema.Struct({
  project: Key,
  number: PositiveInt.pipe(optional),
  title: Text.pipe(optional),
  body: Schema.String.pipe(optional),
  type: IssueType.pipe(optional),
  epic: Schema.NullOr(PositiveInt).pipe(optional),
  estimate: Schema.NullOr(Estimate).pipe(optional),
  seat: Schema.NullOr(Schema.String).pipe(optional),
  session: Schema.NullOr(Schema.String).pipe(optional),
  branch: Schema.NullOr(Schema.String).pipe(optional),
  pr: Schema.NullOr(PositiveInt).pipe(optional),
  /** Issue refs such as `LCH-12` or plain numbers in the same project. Replaces the list. */
  depends_on: Schema.Array(Schema.String).pipe(optional),
  reason: Reason,
}).annotate({ identifier: "Board.IssueInput" })
export type IssueInput = typeof IssueInput.Type

export const MoveInput = Schema.Struct({
  project: Key,
  number: PositiveInt,
  stage: Stage,
  position: Schema.Finite.pipe(optional),
  reason: Reason,
}).annotate({ identifier: "Board.MoveInput" })
export type MoveInput = typeof MoveInput.Type

export const StepsInput = Schema.Struct({
  project: Key,
  number: PositiveInt,
  steps: Schema.Array(
    Schema.Struct({ title: Text, status: StepStatus, now: Schema.NullOr(Schema.String).pipe(optional) }),
  ),
  reason: Reason,
}).annotate({ identifier: "Board.StepsInput" })
export type StepsInput = typeof StepsInput.Type

export const QuestionInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("ask"),
    project: Key,
    issue: PositiveInt.pipe(optional),
    epic: PositiveInt.pipe(optional),
    text: Text,
    options: Schema.Array(Option).check(Schema.isMinLength(2), Schema.isMaxLength(4)),
    recommended: Schema.String,
    cost_of_waiting: Schema.NullOr(Schema.String).pipe(optional),
    blocking: Schema.Boolean.pipe(optional),
    reason: Reason,
  }),
  Schema.Struct({
    action: Schema.Literal("withdraw"),
    project: Key,
    id: QuestionID,
    reason: Reason,
  }),
]).annotate({ identifier: "Board.QuestionInput" })
export type QuestionInput = typeof QuestionInput.Type

// Owner write payloads (section 5). The owner's reason is optional.

export const AnswerInput = Schema.Struct({
  option: Schema.String,
  text: Schema.String.pipe(optional),
}).annotate({ identifier: "Board.AnswerInput" })
export type AnswerInput = typeof AnswerInput.Type

export const NoteInput = Schema.Struct({ body: Text }).annotate({ identifier: "Board.NoteInput" })
export type NoteInput = typeof NoteInput.Type

// Files arrive base64-encoded in JSON; a secret's value goes straight to the credential store and is never echoed.
// A file carries base64 `data`; a secret carries `value` (stored only in the credential store) and `name` is its label.
export const AttachmentInput = Schema.Struct({
  kind: AttachmentKind,
  name: Text,
  mime: Schema.String.pipe(optional),
  data: Schema.String.pipe(optional),
  value: Schema.String.pipe(optional),
}).annotate({ identifier: "Board.AttachmentInput" })
export type AttachmentInput = typeof AttachmentInput.Type

export const PauseInput = Schema.Struct({ reason: Schema.String.pipe(optional) }).annotate({
  identifier: "Board.PauseInput",
})
export type PauseInput = typeof PauseInput.Type

export const HoldInput = Schema.Struct({ hold: Schema.Boolean }).annotate({ identifier: "Board.HoldInput" })
export type HoldInput = typeof HoldInput.Type

export const OwnerResult = Schema.Struct({ activity: ActivityID }).annotate({ identifier: "Board.OwnerResult" })
export type OwnerResult = typeof OwnerResult.Type

/** The mirror's state after a manual sync: a fact, with the plain-words error when it is not `ok`. */
export const GithubSync = Schema.Struct({ state: GithubState, error: Schema.NullOr(Schema.String) }).annotate({
  identifier: "Board.GithubSync",
})
export type GithubSync = typeof GithubSync.Type

// Carries no board content: the app refetches what it shows.
const Changed = define({
  type: "board.changed",
  schema: {
    project: Schema.String,
    issue: Schema.String.pipe(optional),
    activity: Schema.String,
  },
})
export const Event = { Changed, Definitions: inventory(Changed) }
