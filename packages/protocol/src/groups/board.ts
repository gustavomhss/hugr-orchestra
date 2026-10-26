import { Board } from "@orchestra/schema/board"
import { PositiveInt } from "@orchestra/schema/schema"
import { Schema } from "effect"
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

const doc = (identifier: string, summary: string, description: string) =>
  OpenApi.annotations({ identifier: `v2.board.${identifier}`, summary, description })

export const BoardGroup = HttpApiGroup.make("server.board")
  .add(
    HttpApiEndpoint.get("board.list", "/api/board", { success: Schema.Array(Board.Summary) }).annotateMerge(
      doc("list", "List board projects", "Board projects with issue counts per stage, open questions, health and GitHub state."),
    ),
  )
  .add(
    HttpApiEndpoint.get("board.get", "/api/board/:key", {
      params: project,
      success: Board.Snapshot,
      error: BoardNotFoundError,
    }).annotateMerge(doc("get", "Read a board", "A board project's epics, issues with steps and open questions.")),
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
    HttpApiEndpoint.post("board.undo", "/api/board/:key/activity/:id/undo", {
      params: { key: Schema.String, id: Schema.String },
      success: Board.OwnerResult,
      error: errors,
    }).annotateMerge(
      doc("undo", "Undo a change", "Undo a Maestro plan change; refused when a later change touched the same fields."),
    ),
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
