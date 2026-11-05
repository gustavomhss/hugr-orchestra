import type { Effect } from "effect"
import type { Board } from "@orchestra/schema/board"
import type { BudgetPausedError, NotFoundError, RefusedError } from "./shared"
import type { BoardSnapshot } from "./snapshot"
import type { BoardConflicts } from "./conflicts"

export type Error = NotFoundError | RefusedError | BudgetPausedError

export interface Interface {
  /** Archived projects are left out unless `archived` is true. */
  readonly summaries: (options?: { readonly archived?: boolean }) => Effect.Effect<Board.Summary[]>
  readonly snapshot: (key: string) => Effect.Effect<Board.Snapshot, NotFoundError>
  readonly read: (input: Board.ReadInput) => Effect.Effect<Board.Read, NotFoundError>
  readonly issuePage: (key: string, number: number) => Effect.Effect<Board.IssuePage, NotFoundError>
  readonly execution: (key: string, number: number) => Effect.Effect<Board.ExecutionReport, NotFoundError>
  /** Spend per card, epic, seat and project from session cost and cached CI minutes; never fetches GitHub. */
  readonly spend: (key: string) => Effect.Effect<Board.SpendReport, NotFoundError>
  /** Every answered question, newest first. */
  readonly decisions: (key: string) => Effect.Effect<Board.Decision[], NotFoundError>
  /** What backs a card's status: PR, checks, attempts, guardrail result, crash reason and when it was verified. */
  readonly proof: (key: string, number: number) => Effect.Effect<Board.Proof, NotFoundError>
  readonly activity: (key: string, since?: string) => Effect.Effect<Board.Activity[], NotFoundError>
  readonly project: (input: Board.ProjectInput) => Effect.Effect<Board.WriteResult, Error>
  readonly epic: (input: Board.EpicInput) => Effect.Effect<Board.WriteResult, Error>
  readonly issue: (input: Board.IssueInput, writer?: Board.Writer) => Effect.Effect<Board.WriteResult, Error>
  readonly move: (input: Board.MoveInput, writer?: Board.Writer) => Effect.Effect<Board.WriteResult, Error>
  readonly requestMove: (input: Board.MoveInput, writer: Board.Writer) => Effect.Effect<Board.WriteResult, Error>
  readonly steps: (input: Board.StepsInput) => Effect.Effect<Board.WriteResult, Error>
  readonly question: (input: Board.QuestionInput) => Effect.Effect<Board.WriteResult, Error>
  readonly answer: (key: string, id: string, input: Board.AnswerInput) => Effect.Effect<Board.OwnerResult, Error>
  /** The owner overturns an earlier answer; the old decision stays, linked to the new one. */
  readonly changeDecision: (key: string, id: string, input: Board.DecisionChangeInput) => Effect.Effect<Board.OwnerResult, Error>
  /** Maestro records what came of a decision. */
  readonly decisionOutcome: (input: Board.DecisionOutcomeInput) => Effect.Effect<Board.OwnerResult, Error>
  /** Target date and budget; omitted fields stay, null clears one. */
  readonly settings: (
    key: string,
    input: { readonly target_date?: number | null; readonly budget_usd?: number | null; readonly reason?: string },
    actor: "owner" | "maestro",
  ) => Effect.Effect<Board.OwnerResult, Error>
  readonly note: (key: string, number: number, input: Board.NoteInput) => Effect.Effect<Board.OwnerResult, Error>
  readonly attach: (key: string, number: number, input: Board.AttachmentInput) => Effect.Effect<Board.OwnerResult, Error>
  /** Owner notes only; GitHub and Maestro notes stay as written. */
  readonly editNote: (key: string, number: number, id: string, input: Board.NoteInput) => Effect.Effect<Board.OwnerResult, Error>
  readonly deleteNote: (key: string, number: number, id: string) => Effect.Effect<Board.OwnerResult, Error>
  /** A secret's credential row goes with it; a file's stored copy is removed after commit. */
  readonly removeAttachment: (key: string, number: number, id: string) => Effect.Effect<Board.OwnerResult, Error>
  readonly undo: (key: string, id: string) => Effect.Effect<Board.OwnerResult, Error>
  readonly pause: (key: string, input: Board.PauseInput) => Effect.Effect<Board.OwnerResult, Error>
  readonly resume: (key: string) => Effect.Effect<Board.OwnerResult, Error>
  /** Only a shipped or paused project; unarchive brings it back paused. */
  readonly archive: (key: string) => Effect.Effect<Board.OwnerResult, Error>
  readonly unarchive: (key: string) => Effect.Effect<Board.OwnerResult, Error>
  readonly pauseIssue: (key: string, number: number) => Effect.Effect<Board.OwnerResult, Error>
  readonly resumeIssue: (key: string, number: number) => Effect.Effect<Board.OwnerResult, Error>
  readonly hold: (key: string, number: number, input: Board.HoldInput) => Effect.Effect<Board.OwnerResult, Error>
  readonly accept: (key: string, number: number) => Effect.Effect<Board.OwnerResult, Error>
  readonly decline: (key: string, number: number) => Effect.Effect<Board.OwnerResult, Error>
  /** Pulls from GitHub, pushes dirty cards and reports the sync state; the manual retry and the 60 second poll. */
  readonly sync: (key: string) => Effect.Effect<Board.GithubSync, Error>
  /** Runs the card's scoped checks on its current tree, once per tree, and reports the derived scoped state. */
  readonly ciRun: (input: Board.CiRunInput) => Effect.Effect<Board.CiRunResult, Error>
  /** Pushes the card's worktree as a snapshot of its open attempt, unless its tree is already the last snapshot's. */
  readonly snapshotPush: (key: string, number: number) => Effect.Effect<BoardSnapshot.Result, Error>
  /** Whether the card's work is on the remote; null with no open attempt or no worktree. */
  readonly pushState: (key: string, number: number) => Effect.Effect<Board.PushState, Error>
  /** Compares each project's base with where it stood last time and notes the cards a base advance touched. */
  readonly conflictSweep: () => Effect.Effect<ReadonlyArray<BoardConflicts.Notice>>
  /** Queues a verified Review card: complete record, scoped-green PR head, nothing it depends on still open. */
  readonly queue: (input: Board.QueueInput) => Effect.Effect<Board.QueueResult, Error>
  /** Takes a queued card back to Review, dissolving the open bundle it is in. */
  readonly dequeue: (input: Board.DequeueInput) => Effect.Effect<Board.DequeueResult, Error>
  /** Maestro's verdict on a flaky or paused bundle: merge it as tested, or retry its cards in a new bundle. */
  readonly bundle: (input: Board.BundleInput) => Effect.Effect<Board.BundleResult, Error>
  /** Settles each project's open bundle or cuts a new one; the poll runs it every minute. */
  readonly queueTick: () => Effect.Effect<void>
}
