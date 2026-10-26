import { Board } from "@orchestra/schema/board"
import { PositiveInt } from "@orchestra/schema/schema"
import { Schema, SchemaGetter } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

export class BoardNotFoundError extends Schema.TaggedErrorClass<BoardNotFoundError>()(
  "BoardNotFoundError",
  { message: Schema.String },
  { httpApiStatus: 404 },
) {}

// A write the board's rules refuse; the message says what to do instead.
export class BoardRefusedError extends Schema.TaggedErrorClass<BoardRefusedError>()(
  "BoardRefusedError",
  { message: Schema.String },
  { httpApiStatus: 409 },
) {}

const errors = [BoardNotFoundError, BoardRefusedError]
const IssueNumber = Schema.NumberFromString.pipe(Schema.decodeTo(PositiveInt))
const project = { key: Schema.String }
const issue = { key: Schema.String, number: IssueNumber }
const child = { ...issue, id: Schema.String }

const doc = (identifier: string, summary: string, description: string) =>
  OpenApi.annotations({ identifier: `v2.board.${identifier}`, summary, description })

export const BoardGroup = HttpApiGroup.make("server.board")
  .add(
    HttpApiEndpoint.get("board.list", "/api/board", {
      query: Schema.Struct({
        archived: Schema.Literals(["true", "false"])
          .pipe(
            Schema.decodeTo(Schema.Boolean, {
              decode: SchemaGetter.transform((value) => value === "true"),
              encode: SchemaGetter.transform((value) => (value ? ("true" as const) : ("false" as const))),
            }),
            Schema.optional,
          )
          .annotate({ description: "Include archived projects. Defaults to false." }),
      }),
      success: Schema.Array(Board.Summary),
    }).annotateMerge(
      doc(
        "list",
        "List board projects",
        "Board projects with issue counts per stage, open questions, health, forecast and GitHub state.",
      ),
    ),
  )
  .add(
    HttpApiEndpoint.get("board.get", "/api/board/:key", {
      params: project,
      success: Board.Snapshot,
      error: BoardNotFoundError,
    }).annotateMerge(
      doc(
        "get",
        "Read a board",
        "A board project's epics, issues with steps, open questions, project and epic forecasts and scope history.",
      ),
    ),
  )
  .add(
    HttpApiEndpoint.get("board.issue", "/api/board/:key/issue/:number", {
      params: issue,
      success: Board.IssuePage,
      error: BoardNotFoundError,
    }).annotateMerge(
      doc(
        "issue",
        "Read an issue page",
        "Everything on the card plus notes, attachments, activity, dependencies and the git trail read live from the host.",
      ),
    ),
  )
  .add(
    HttpApiEndpoint.get("board.activity", "/api/board/:key/activity", {
      params: project,
      query: Schema.Struct({ since: Schema.optional(Schema.String) }),
      success: Schema.Array(Board.Activity),
      error: BoardNotFoundError,
    }).annotateMerge(doc("activity", "List board activity", "Activity rows after `since`, newest last.")),
  )
  .add(
    HttpApiEndpoint.post("board.answer", "/api/board/:key/question/:id/answer", {
      params: { key: Schema.String, id: Schema.String },
      payload: Board.AnswerInput,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("answer", "Answer a question", "Answer one of Maestro's open questions with one of its options.")),
  )
  .add(
    HttpApiEndpoint.post("board.note", "/api/board/:key/issue/:number/note", {
      params: issue,
      payload: Board.NoteInput,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("note", "Add a note", "Add an owner note to an issue.")),
  )
  .add(
    HttpApiEndpoint.patch("board.noteEdit", "/api/board/:key/issue/:number/note/:id", {
      params: child,
      payload: Board.NoteInput,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("noteEdit", "Edit a note", "Edit one of the owner's notes; GitHub and Maestro notes are refused.")),
  )
  .add(
    HttpApiEndpoint.delete("board.noteDelete", "/api/board/:key/issue/:number/note/:id", {
      params: child,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(
      doc("noteDelete", "Delete a note", "Delete one of the owner's notes; GitHub and Maestro notes are refused."),
    ),
  )
  .add(
    HttpApiEndpoint.post("board.attach", "/api/board/:key/issue/:number/attachment", {
      params: issue,
      payload: Board.AttachmentInput,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(
      doc(
        "attach",
        "Attach to an issue",
        "Attach a base64 file, or a secret whose value goes only to the credential store and is never returned.",
      ),
    ),
  )
  .add(
    HttpApiEndpoint.delete("board.attachmentRemove", "/api/board/:key/issue/:number/attachment/:id", {
      params: child,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(
      doc(
        "attachmentRemove",
        "Remove an attachment",
        "Remove an attachment; a secret's credential is deleted with it and its value is never returned.",
      ),
    ),
  )
  .add(
    HttpApiEndpoint.post("board.undo", "/api/board/:key/activity/:id/undo", {
      params: { key: Schema.String, id: Schema.String },
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(
      doc("undo", "Undo a change", "Undo a Maestro plan change; refused when a later change touched the same fields."),
    ),
  )
  .add(
    HttpApiEndpoint.get("board.spend", "/api/board/:key/spend", {
      params: project,
      success: Board.SpendReport,
      error: BoardNotFoundError,
    }).annotateMerge(
      doc(
        "spend",
        "Read project spend",
        "Dollars per card, epic, seat and project from session cost with a breakdown by model, plus cached CI minutes. Anything without a meter says so. Owner only: guest views never include spend.",
      ),
    ),
  )
  .add(
    HttpApiEndpoint.get("board.decisions", "/api/board/:key/decisions", {
      params: project,
      success: Schema.Array(Board.Decision),
      error: BoardNotFoundError,
    }).annotateMerge(
      doc("decisions", "List decisions", "Every answered question, newest first, with its outcome and any overturned version."),
    ),
  )
  .add(
    HttpApiEndpoint.post("board.decisionChange", "/api/board/:key/decision/:id", {
      params: { key: Schema.String, id: Schema.String },
      payload: Board.DecisionChangeInput,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(
      doc("decisionChange", "Overturn a decision", "Answer again; the earlier decision stays, linked to the new one."),
    ),
  )
  .add(
    HttpApiEndpoint.get("board.proof", "/api/board/:key/issue/:number/proof", {
      params: issue,
      success: Board.Proof,
      error: BoardNotFoundError,
    }).annotateMerge(
      doc(
        "proof",
        "Read a card's proof",
        "The pull request, checks by name, attempts, guardrail result, crash reason and when it was verified.",
      ),
    ),
  )
  .add(
    HttpApiEndpoint.post("board.settings", "/api/board/:key/settings", {
      params: project,
      payload: Board.SettingsInput,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("settings", "Set target date and budget", "Omitted fields stay; null clears one.")),
  )
  .add(
    HttpApiEndpoint.post("board.pause", "/api/board/:key/pause", {
      params: project,
      payload: Board.PauseInput,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("pause", "Pause a project", "Stop Maestro's writes to the project except questions.")),
  )
  .add(
    HttpApiEndpoint.post("board.resume", "/api/board/:key/resume", {
      params: project,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("resume", "Resume a project", "Let Maestro write to the project again.")),
  )
  .add(
    HttpApiEndpoint.post("board.archive", "/api/board/:key/archive", {
      params: project,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(
      doc("archive", "Archive a project", "Hide a shipped or paused project from the board list; refused otherwise."),
    ),
  )
  .add(
    HttpApiEndpoint.post("board.unarchive", "/api/board/:key/unarchive", {
      params: project,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("unarchive", "Unarchive a project", "Bring an archived project back, paused.")),
  )
  .add(
    HttpApiEndpoint.post("board.githubSync", "/api/board/:key/github/sync", {
      params: project,
      success: Board.GithubSync,
      error: errors,
    }).annotateMerge(doc("githubSync", "Sync with GitHub", "Retry the GitHub Issues mirror now and return its state.")),
  )
  .add(
    HttpApiEndpoint.post("board.pauseIssue", "/api/board/:key/issue/:number/pause", {
      params: issue,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("pauseIssue", "Pause an issue", "Stop Maestro's writes to one issue.")),
  )
  .add(
    HttpApiEndpoint.post("board.resumeIssue", "/api/board/:key/issue/:number/resume", {
      params: issue,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("resumeIssue", "Resume an issue", "Let Maestro write to the issue again.")),
  )
  .add(
    HttpApiEndpoint.post("board.hold", "/api/board/:key/issue/:number/hold", {
      params: issue,
      payload: Board.HoldInput,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("hold", "Set hold before merge", "While held, Maestro cannot ship the issue or merge its PR.")),
  )
  .add(
    HttpApiEndpoint.post("board.accept", "/api/board/:key/intake/:number/accept", {
      params: issue,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("accept", "Accept an intake issue", "Move a GitHub-born issue to Backlog for Maestro to plan.")),
  )
  .add(
    HttpApiEndpoint.post("board.decline", "/api/board/:key/intake/:number/decline", {
      params: issue,
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(doc("decline", "Decline an intake issue", "Mark a GitHub-born issue cut.")),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "board",
      description: "Projects board: Maestro plans through its tools; the owner reads, answers, comments and steers here.",
    }),
  )
