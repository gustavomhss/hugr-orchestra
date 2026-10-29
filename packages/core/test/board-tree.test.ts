import { describe, expect } from "bun:test"
import fs from "fs/promises"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { eq } from "drizzle-orm"
import { Cause, Effect, Exit, Option } from "effect"
import { appendBoardEvent } from "@orchestra/atlas-boundary/record-log"
import { Board } from "@orchestra/core/board/board"
import {
  BoardActivityTable,
  BoardAttachmentTable,
  BoardAttemptTable,
  BoardBundleMemberTable,
  BoardBundleTable,
  BoardCheckTable,
  BoardCiRunTable,
  BoardDecisionTable,
  BoardDependencyTable,
  BoardEpicTable,
  BoardFlakeTable,
  BoardIssueTable,
  BoardNoteTable,
  BoardProjectTable,
  BoardQueueTable,
  BoardQuestionTable,
  BoardStepTable,
} from "@orchestra/core/board/sql"
import { BoardTree } from "@orchestra/core/board/tree"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { testEffect } from "./lib/effect"

// gh is a fake executable on a PATH that holds nothing else; each test writes the reply it needs before reading.
const bin = mkdtempSync(path.join(tmpdir(), "orchestra-board-bin-"))
const env = { PATH: bin, PATHEXT: process.env.PATHEXT ?? process.env.PathExt }

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, Credential.node]), [
    [Board.node, makeGlobalNode({ service: Board.Service, layer: Board.layerWith({ env }), deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node] })],
  ]),
)

const QUESTION = "Which parser strategy should the export card use?"
const ANSWER = "Plain recursive descent is enough for this card."
const NOTE_KEEP = "The owner noted the violet harbour fixture."
const NOTE_DROP = "A second note the owner will delete."
const NOTE_EDITED = "The edited note mentions the amber lighthouse."
const REDACTED = /^\[redacted [0-9a-z]+\]$/i

describe("Board tree", () => {
  it.live("round trip rebuilds the same private board from the record tree", () =>
    Effect.gen(function* () {
      yield* empty()
      yield* operate("TRE")
      const before = yield* shape("TRE")
      const dir = yield* tempDir()
      const exported = yield* exportBoard("TRE", dir, false)
      yield* empty()
      const database = yield* Database.Service
      const restored = yield* database.db.transaction((tx) => BoardTree.restore(tx, dir))
      expect(restored).toBe(exported)
      expect(restored).toBeGreaterThan(0)
      expect(yield* shape("TRE")).toEqual(before)
    }),
  )

  it.live("public tree keeps the structure and redacts every prose field", () =>
    Effect.gen(function* () {
      yield* empty()
      yield* operate("PUB")
      const before = yield* shape("PUB")
      const dir = yield* tempDir()
      yield* exportBoard("PUB", dir, true)
      yield* empty()
      const database = yield* Database.Service
      yield* database.db.transaction((tx) => BoardTree.restore(tx, dir))
      const after = yield* shape("PUB")

      expect(after.structure).toEqual(before.structure)
      expect(proseValues(before).some((value) => typeof value === "string" && value.length > 0)).toBe(true)
      expect(proseValues(after).every((value) => value === "" || value === null)).toBe(true)
      expect(after.prose.reasons.length).toBeGreaterThan(0)
      after.prose.reasons.forEach((reason) => expect(reason).toMatch(REDACTED))
    }),
  )

  it.live("an unknown action is refused by its error tag", () =>
    Effect.gen(function* () {
      yield* empty()
      const dir = yield* tempDir()
      appendBoardEvent(
        dir,
        { activity: "act-teleport", project: "NOP", actor: "maestro", action: "issue.teleport", at: new Date().toISOString() },
        { redact: false },
      )
      const database = yield* Database.Service
      const exit = yield* Effect.exit(database.db.transaction((tx) => BoardTree.restore(tx, dir)))
      expect(Exit.isFailure(exit)).toBe(true)
      const error = Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined
      expect(error).toMatchObject({ _tag: "BoardTree.UnknownActionError", action: "issue.teleport" })
    }),
  )
})

function tempDir() {
  return Effect.promise(() => fs.mkdtemp(path.join(tmpdir(), "board-tree-")))
}

// Children first: each table is emptied before the parent rows it points at.
function empty() {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db
    yield* db.delete(BoardCiRunTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardCheckTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardAttemptTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardAttachmentTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardNoteTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardActivityTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardDecisionTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardQuestionTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardStepTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardDependencyTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardQueueTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardBundleMemberTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardBundleTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardFlakeTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardIssueTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardEpicTable).run().pipe(Effect.orDie)
    yield* db.delete(BoardProjectTable).run().pipe(Effect.orDie)
  })
}

// The board writes every test replays: one epic, two cards with a dependency, steps, a question answered,
// notes added, edited and deleted, and one move undone.
function operate(key: string) {
  return Effect.gen(function* () {
    const board = yield* Board.Service
    const database = yield* Database.Service
    const db = database.db
    yield* board.project({ key, name: "Tree round trip", goal: "Prove the board survives an export and an import.", reason: "Start the round trip project." })
    yield* board.epic({ project: key, title: "Foundations", goal: "Lay the groundwork for the tree.", reason: "Group the first cards." })
    yield* board.issue({
      project: key,
      title: "Write the parser",
      body: "Parse every record line into a typed event without losing the copper lantern detail.",
      type: "feature",
      epic: 1,
      reason: "The parser is the first card.",
    })
    yield* board.issue({ project: key, title: "Wire the export", body: "Export walks the activity rows in order.", reason: "The export is the second card." })
    yield* board.issue({ project: key, number: 2, depends_on: [`${key}-1`], reason: "The export needs the parser first." })
    yield* board.steps({
      project: key,
      number: 1,
      steps: [
        { title: "Read the grammar", status: "done" },
        { title: "Write the lexer", status: "active", now: "Matching identifiers" },
        { title: "Ship the card", status: "pending" },
      ],
      reason: "Plan the parser steps.",
    })
    yield* board.question({
      action: "ask",
      project: key,
      issue: 2,
      text: QUESTION,
      options: [
        { id: "recursive", label: "Recursive descent", consequence: "Plain code that is easy to read." },
        { id: "generator", label: "Parser generator", consequence: "More setup but fewer bugs." },
      ],
      recommended: "recursive",
      cost_of_waiting: "The export waits one day.",
      blocking: false,
      reason: "The export card needs a strategy before it starts.",
    })
    const projectID = (yield* board.snapshot(key)).project.id
    const questions = yield* db.select().from(BoardQuestionTable).where(eq(BoardQuestionTable.project_id, projectID)).all().pipe(Effect.orDie)
    const question = questions.find((row) => row.text === QUESTION)
    if (!question) return yield* Effect.die("the question was not written")
    yield* board.answer(key, question.id, { option: "recursive", text: ANSWER })
    yield* board.note(key, 1, { body: NOTE_KEEP })
    yield* board.note(key, 1, { body: NOTE_DROP })
    const notes = yield* db.select().from(BoardNoteTable).all().pipe(Effect.orDie)
    const keep = notes.find((row) => row.body === NOTE_KEEP)
    const drop = notes.find((row) => row.body === NOTE_DROP)
    if (!keep || !drop) return yield* Effect.die("the notes were not written")
    yield* board.editNote(key, 1, keep.id, { body: NOTE_EDITED })
    yield* board.deleteNote(key, 1, drop.id)
    const moved = yield* board.move({ project: key, number: 1, stage: "ready", reason: "The parser is ready to start." })
    yield* board.undo(key, moved.activity)
  })
}

function exportBoard(key: string, dir: string, redact: boolean) {
  return Effect.gen(function* () {
    const board = yield* Board.Service
    const database = yield* Database.Service
    const db = database.db
    const projectID = (yield* board.snapshot(key)).project.id
    const issues = yield* db.select().from(BoardIssueTable).where(eq(BoardIssueTable.project_id, projectID)).all().pipe(Effect.orDie)
    const numbers = new Map(issues.map((row) => [row.id, row.number] as const))
    const activity = yield* db
      .select()
      .from(BoardActivityTable)
      .where(eq(BoardActivityTable.project_id, projectID))
      .orderBy(BoardActivityTable.time_created, BoardActivityTable.id)
      .all()
      .pipe(Effect.orDie)
    activity.forEach((row) => appendBoardEvent(dir, BoardTree.event(key, row.issue_id ? `${key}-${numbers.get(row.issue_id)}` : undefined, row), { redact }))
    return activity.length
  })
}

// Structure is everything the redaction must keep; prose is everything it must drop. Activity reasons are prose too, but
// the redacted tree keeps a `[redacted <hash>]` placeholder there, so they are checked by pattern, not by emptiness.
function shape(key: string) {
  return Effect.gen(function* () {
    const board = yield* Board.Service
    const database = yield* Database.Service
    const db = database.db
    const projectID = (yield* board.snapshot(key)).project.id
    const projects = yield* db.select().from(BoardProjectTable).where(eq(BoardProjectTable.id, projectID)).all().pipe(Effect.orDie)
    const epics = yield* db.select().from(BoardEpicTable).where(eq(BoardEpicTable.project_id, projectID)).all().pipe(Effect.orDie)
    const issues = yield* db.select().from(BoardIssueTable).where(eq(BoardIssueTable.project_id, projectID)).all().pipe(Effect.orDie)
    const questions = yield* db.select().from(BoardQuestionTable).where(eq(BoardQuestionTable.project_id, projectID)).all().pipe(Effect.orDie)
    const decisions = yield* db.select().from(BoardDecisionTable).where(eq(BoardDecisionTable.project_id, projectID)).all().pipe(Effect.orDie)
    const activity = yield* db
      .select()
      .from(BoardActivityTable)
      .where(eq(BoardActivityTable.project_id, projectID))
      .orderBy(BoardActivityTable.time_created, BoardActivityTable.id)
      .all()
      .pipe(Effect.orDie)
    const dependencies = yield* db.select().from(BoardDependencyTable).all().pipe(Effect.orDie)
    const steps = yield* db.select().from(BoardStepTable).all().pipe(Effect.orDie)
    const notes = yield* db.select().from(BoardNoteTable).all().pipe(Effect.orDie)

    const numbers = new Map(issues.map((row) => [row.id, row.number] as const))
    const epicNumbers = new Map(epics.map((row) => [row.id, row.number] as const))
    const issueNumber = (id: (typeof issues)[number]["id"] | null) => (id ? (numbers.get(id) ?? null) : null)
    const ownedSteps = steps.filter((row) => numbers.has(row.issue_id))
    const ownedDependencies = dependencies.filter((row) => numbers.has(row.issue_id))
    const ownedNotes = notes.filter((row) => numbers.has(row.issue_id))

    const structure = {
      projects: projects.map((row) => ({ key: row.key, name: row.name, goal: row.goal, status: row.status })),
      epics: epics.map((row) => ({ number: row.number, title: row.title, goal: row.goal, status: row.status })).toSorted((a, b) => a.number - b.number),
      issues: issues
        .map((row) => ({
          number: row.number,
          title: row.title,
          stage: row.stage,
          position: row.position,
          epic: row.epic_id ? (epicNumbers.get(row.epic_id) ?? null) : null,
          depends_on: ownedDependencies
            .filter((dependency) => dependency.issue_id === row.id)
            .map((dependency) => numbers.get(dependency.depends_on_id))
            .toSorted(),
          paused: row.paused,
          hold_before_merge: row.hold_before_merge,
        }))
        .toSorted((a, b) => a.number - b.number),
      steps: ownedSteps
        .map((row) => ({ issue: numbers.get(row.issue_id), position: row.position, title: row.title, status: row.status, now: row.now }))
        .toSorted((a, b) => (a.issue ?? 0) - (b.issue ?? 0) || a.position - b.position),
      questions: questions.map((row) => ({
        issue: issueNumber(row.issue_id),
        status: row.status,
        recommended: row.recommended,
        blocking: row.blocking,
        answer_option: row.answer_option,
      })),
      decisions: decisions.map((row) => ({
        answered_by: row.answered_by,
        outcome: row.outcome,
        superseded: row.overturned_by_id !== null,
      })),
      notes: ownedNotes
        .map((row) => ({ issue: numbers.get(row.issue_id), author: row.author, kind: row.kind }))
        .toSorted((a, b) => (a.issue ?? 0) - (b.issue ?? 0) || a.author.localeCompare(b.author)),
      activity: activity.map((row) => ({
        issue: issueNumber(row.issue_id),
        action: row.action,
        actor: row.actor,
        undone: row.undone_by !== null,
      })),
    }

    const prose = {
      issues: issues.map((row) => ({ number: row.number, description: row.body })).toSorted((a, b) => a.number - b.number),
      questions: questions.map((row) => ({ text: row.text, answer_text: row.answer_text })),
      decisions: decisions.map((row) => ({ question: row.question, chosen_text: row.chosen_text })),
      notes: ownedNotes.map((row) => ({ issue: numbers.get(row.issue_id), body: row.body })).toSorted((a, b) => (a.issue ?? 0) - (b.issue ?? 0)),
      reasons: activity.flatMap((row) => (row.reason === null ? [] : [row.reason])),
    }

    return { structure, prose }
  })
}

function proseValues(snapshot: Effect.Success<ReturnType<typeof shape>>) {
  return [
    ...snapshot.prose.issues.map((row) => row.description),
    ...snapshot.prose.questions.flatMap((row) => [row.text, row.answer_text]),
    ...snapshot.prose.decisions.flatMap((row) => [row.question, row.chosen_text]),
    ...snapshot.prose.notes.map((row) => row.body),
  ]
}
