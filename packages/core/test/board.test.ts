import { describe, expect } from "bun:test"
import fs from "fs/promises"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { and, eq } from "drizzle-orm"
import { Effect, Exit, Schema, Stream } from "effect"
import { Board } from "@orchestra/core/board/board"
import {
  BoardActivityTable,
  BoardAttachmentTable,
  BoardIssueTable,
  BoardNoteTable,
  BoardProjectTable,
} from "@orchestra/core/board/sql"
import { IssueInput, NoteID } from "@orchestra/schema/board"
import { Integration } from "@orchestra/schema/integration"
import { Credential } from "@orchestra/core/credential"
import { CredentialTable } from "@orchestra/core/credential/sql"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { ProjectSchema } from "@orchestra/core/project/schema"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { git } from "./fixture/git"
import { testEffect } from "./lib/effect"

// gh is a fake executable on a PATH that holds nothing else; each test writes the reply it needs before reading.
const bin = mkdtempSync(path.join(tmpdir(), "orchestra-board-bin-"))
const env = { PATH: bin, PATHEXT: process.env.PATHEXT ?? process.env.PathExt }

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, Credential.node]), [
    [Board.node, makeGlobalNode({ service: Board.Service, layer: Board.layerWith({ env }), deps: [Database.node, EventV2.node, Credential.node, AppProcess.node, Global.node] })],
  ]),
)

const SECRET = "sk-board-test-9f3c1e7d"
const DAY = 86_400_000

describe("Board", () => {
  it.live("rule 1: every Maestro write needs a non-empty reason and keeps it in the log", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const decode = Schema.decodeUnknownExit(IssueInput)
      expect(Exit.isFailure(decode({ project: "RSN", title: "Plan", reason: "   " }))).toBe(true)
      expect(Exit.isFailure(decode({ project: "RSN", title: "Plan" }))).toBe(true)

      yield* board.project({ key: "RSN", name: "Reasons", reason: "Start the launch plan." })
      const created = yield* board.issue({ project: "RSN", title: "Plan", reason: "The launch needs a plan." })
      expect(yield* rows("RSN")).toEqual([
        expect.objectContaining({ actor: "maestro", action: "project.upsert", reason: "Start the launch plan." }),
        expect.objectContaining({ actor: "maestro", action: "issue.create", reason: "The launch needs a plan." }),
      ])
      expect(created.issue).toMatchObject({ number: 1, ref: "RSN-1", stage: "backlog" })
    }),
  )

  it.live("rule 2: owner actions never edit the plan", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "OWN", name: "Owner", reason: "Start." })
      const created = yield* board.issue({ project: "OWN", title: "Keep me", body: "Plan body", reason: "Plan." })
      const asked = yield* board.question({
        action: "ask",
        project: "OWN",
        issue: 1,
        text: "Which database?",
        options: [
          { id: "pg", label: "Postgres", consequence: "More ops." },
          { id: "sqlite", label: "SQLite", consequence: "Single file." },
        ],
        recommended: "sqlite",
        reason: "The storage choice blocks the build.",
      })
      const question = (yield* board.snapshot("OWN")).questions[0]
      expect(question?.id).toBeDefined()
      expect(asked.activity).toBeDefined()

      yield* board.note("OWN", 1, { body: "Prefer the simple path." })
      yield* board.answer("OWN", question!.id, { option: "sqlite" })
      yield* board.hold("OWN", 1, { hold: true })
      yield* board.pauseIssue("OWN", 1)
      yield* board.resumeIssue("OWN", 1)
      yield* board.pause("OWN", { reason: "Thinking." })
      yield* board.resume("OWN")

      const issue = (yield* board.snapshot("OWN")).issues[0]
      expect(issue).toMatchObject({
        title: "Keep me",
        body: "Plan body",
        stage: created.issue?.stage,
        position: created.issue?.position,
        holdBeforeMerge: true,
      })
      const owner = (yield* rows("OWN")).filter((row) => row.actor === "owner")
      expect(owner.map((row) => row.action)).toEqual([
        "note.add",
        "question.answer",
        "hold.set",
        "pause.set",
        "pause.set",
        "pause.set",
        "pause.set",
      ])
    }),
  )

  it.live("rule 3: each write appends exactly one activity row with before and after; a refused write appends none", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "LOG", name: "Log", reason: "Start." })
      yield* board.issue({ project: "LOG", title: "First", reason: "Plan." })
      const before = (yield* rows("LOG")).length
      yield* board.issue({ project: "LOG", number: 1, title: "Renamed", reason: "Clearer name." })
      const after = yield* rows("LOG")
      expect(after.length).toBe(before + 1)
      expect(after.at(-1)).toMatchObject({
        action: "issue.update",
        before: { title: "First" },
        after: { title: "Renamed" },
      })

      const refused = yield* Effect.flip(board.issue({ project: "LOG", number: 1, title: "Renamed", reason: "Again." }))
      expect(refused).toBeInstanceOf(Board.RefusedError)
      expect((yield* rows("LOG")).length).toBe(before + 1)
    }),
  )

  it.live("rule 4: undo applies before as an inverse entry and is refused once a later change touched the same fields", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "UND", name: "Undo", reason: "Start." })
      yield* board.issue({ project: "UND", title: "One", reason: "Plan." })
      const renamed = yield* board.issue({ project: "UND", number: 1, title: "Two", reason: "Rename." })

      const undo = yield* board.undo("UND", renamed.activity)
      expect((yield* board.snapshot("UND")).issues[0]?.title).toBe("One")
      const log = yield* rows("UND")
      expect(log.find((row) => row.id === renamed.activity)?.undone_by).toBe(undo.activity)
      expect(log.at(-1)).toMatchObject({ actor: "owner", action: "undo", undoes: renamed.activity })
      expect((yield* Effect.flip(board.undo("UND", renamed.activity))).message).toContain("already undone")

      const third = yield* board.issue({ project: "UND", number: 1, title: "Three", reason: "Rename again." })
      yield* board.issue({ project: "UND", number: 1, title: "Four", reason: "And again." })
      const changed = yield* Effect.flip(board.undo("UND", third.activity))
      expect(changed).toBeInstanceOf(Board.RefusedError)
      expect(changed.message).toContain("Changed since")
      expect((yield* board.snapshot("UND")).issues[0]?.title).toBe("Four")
    }),
  )

  it.live("rule 5: Review needs a PR, Shipped with a PR needs it merged, Shipped without a PR takes the reason", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const directory = yield* repository("PRF")
      yield* board.project({ key: "PRF", name: "Proof", repo: directory, reason: "Start." })
      yield* board.issue({ project: "PRF", title: "Code", reason: "Plan." })
      yield* board.issue({ project: "PRF", title: "Docs", type: "chore", reason: "Plan." })

      expect((yield* Effect.flip(board.move({ project: "PRF", number: 1, stage: "review", reason: "Done." }))).message).toContain(
        "has no PR",
      )
      yield* board.issue({ project: "PRF", number: 1, pr: 7, branch: "feature", reason: "Link the PR." })
      yield* board.move({ project: "PRF", number: 1, stage: "review", reason: "PR is up." })

      yield* fakeGh({ stdout: JSON.stringify(detail({ merged: false })) })
      expect((yield* Effect.flip(board.move({ project: "PRF", number: 1, stage: "shipped", reason: "Ship." }))).message).toContain(
        "not merged",
      )
      yield* fakeGh({ stdout: JSON.stringify(detail({ merged: true })) })
      const shipped = yield* board.move({ project: "PRF", number: 1, stage: "shipped", reason: "Merged." })
      expect(shipped.issue?.stage).toBe("shipped")

      yield* fakeGh({ code: 1, stderr: "To get started with GitHub CLI, please run:  gh auth login\n" })
      yield* board.issue({ project: "PRF", number: 2, pr: 8, reason: "Docs PR." })
      expect((yield* Effect.flip(board.move({ project: "PRF", number: 2, stage: "shipped", reason: "Ship." }))).message).toContain(
        "signed out",
      )
      yield* board.issue({ project: "PRF", number: 2, pr: null, reason: "No PR after all; docs live in the wiki." })
      const docs = yield* board.move({ project: "PRF", number: 2, stage: "shipped", reason: "Docs published in the wiki." })
      expect(docs.issue?.stage).toBe("shipped")
    }),
    30_000,
  )

  it.live("rule 6: hold before merge blocks Shipped until the owner releases it", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "HLD", name: "Hold", reason: "Start." })
      yield* board.issue({ project: "HLD", title: "Decision", reason: "Plan." })
      yield* board.hold("HLD", 1, { hold: true })
      expect((yield* Effect.flip(board.move({ project: "HLD", number: 1, stage: "shipped", reason: "Ship." }))).message).toContain(
        "hold before merge",
      )
      yield* board.hold("HLD", 1, { hold: false })
      expect((yield* board.move({ project: "HLD", number: 1, stage: "shipped", reason: "Decided." })).issue?.stage).toBe(
        "shipped",
      )
    }),
  )

  it.live("rule 7: a paused project or issue refuses Maestro writes except board_question", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "PAU", name: "Pause", reason: "Start." })
      yield* board.issue({ project: "PAU", title: "Work", reason: "Plan." })

      yield* board.pause("PAU", { reason: "Budget review" })
      expect((yield* Effect.flip(board.issue({ project: "PAU", title: "More", reason: "Plan." }))).message).toContain("paused")
      yield* board.question({
        action: "ask",
        project: "PAU",
        text: "Resume next week?",
        options: [
          { id: "yes", label: "Yes", consequence: "Work resumes." },
          { id: "no", label: "No", consequence: "Stays paused." },
        ],
        recommended: "yes",
        reason: "The pause blocks the plan.",
      })
      yield* board.resume("PAU")

      yield* board.pauseIssue("PAU", 1)
      expect(
        (yield* Effect.flip(board.move({ project: "PAU", number: 1, stage: "ready", reason: "Ready." }))).message,
      ).toContain("paused")
      yield* board.issue({ project: "PAU", title: "Other", reason: "Other issues still move." })
    }),
  )

  it.live("rule 8: a secret's value lives only in the credential store, never in a read, a row or an event", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const events = yield* EventV2.Service
      const credentials = yield* Credential.Service
      const database = yield* Database.Service
      const seen: unknown[] = []
      yield* events.all().pipe(
        Stream.runForEach((event) => Effect.sync(() => seen.push(event))),
        Effect.forkScoped,
      )
      yield* Effect.yieldNow
      yield* board.project({ key: "SEC", name: "Secrets", reason: "Start." })
      yield* board.issue({ project: "SEC", title: "Deploy", reason: "Plan." })
      yield* board.attach("SEC", 1, { kind: "secret", name: "Deploy token", value: SECRET })
      yield* board.attach("SEC", 1, { kind: "doc", name: "notes.txt", mime: "text/plain", data: btoa("hello") })

      const stored = yield* credentials.list(Integration.ID.make("board"))
      expect(stored.map((item) => item.label)).toContain("Deploy token")
      const page = yield* board.issuePage("SEC", 1)
      expect(page.attachments.map((item) => [item.kind, item.name])).toEqual([
        ["secret", "Deploy token"],
        ["doc", "notes.txt"],
      ])

      const reads = [
        yield* board.summaries(),
        yield* board.snapshot("SEC"),
        yield* board.read({ project: "SEC", issue: 1 }),
        page,
        yield* board.activity("SEC"),
        yield* rows("SEC"),
        yield* database.db.select().from(BoardProjectTable).all().pipe(Effect.orDie),
        yield* database.db.select().from(BoardIssueTable).all().pipe(Effect.orDie),
        yield* database.db.select().from(BoardNoteTable).all().pipe(Effect.orDie),
        yield* database.db.select().from(BoardAttachmentTable).all().pipe(Effect.orDie),
        seen,
      ]
      expect(seen.length).toBeGreaterThan(0)
      expect(JSON.stringify(reads)).not.toContain(SECRET)
    }),
  )

  it.live("forecast: dates come from shipped throughput, are the same on every read and the latest epic sets the date", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const today = Math.floor(Date.now() / DAY)
      yield* board.project({ key: "FCT", name: "Forecast", target_date: (today + 2) * DAY, reason: "Start." })
      yield* board.epic({ project: "FCT", title: "First", position: 1, reason: "Plan." })
      yield* board.epic({ project: "FCT", title: "Second", position: 2, reason: "Plan." })
      yield* Effect.forEach([1, 2, 3, 4, 5], (number) =>
        Effect.gen(function* () {
          yield* board.issue({ project: "FCT", title: `Done ${number}`, reason: "Plan." })
          yield* board.move({ project: "FCT", number, stage: "shipped", reason: "Shipped without a PR." })
        }),
      )
      yield* board.issue({ project: "FCT", title: "Open A", epic: 1, reason: "Plan." })
      yield* board.issue({ project: "FCT", title: "Open B", epic: 2, reason: "Plan." })
      yield* board.issue({ project: "FCT", title: "Open C", epic: 2, reason: "Plan." })
      // One ship on each of the last five days: every resampled day ships exactly one issue.
      yield* shippedOn("FCT", [1, 2, 3, 4, 5], (number) => (today - number + 1) * DAY + 3_600_000)

      const snapshot = yield* board.snapshot("FCT")
      expect(snapshot.forecast).toEqual({
        shipped: 5,
        remaining: 3,
        targetDate: (today + 2) * DAY,
        forecast: { kind: "dates", p50: (today + 3) * DAY, p85: (today + 3) * DAY, vsTarget: { p50: 1, p85: 1 } },
      })
      expect(snapshot.epicForecasts).toEqual([
        {
          epic: 1,
          ref: "FCT-E1",
          shipped: 0,
          remaining: 1,
          forecast: { kind: "dates", p50: (today + 1) * DAY, p85: (today + 1) * DAY, vsTarget: { p50: -1, p85: -1 } },
          setsDate: false,
        },
        {
          epic: 2,
          ref: "FCT-E2",
          shipped: 0,
          remaining: 2,
          forecast: { kind: "dates", p50: (today + 3) * DAY, p85: (today + 3) * DAY, vsTarget: { p50: 1, p85: 1 } },
          setsDate: true,
        },
      ])
      expect(snapshot.scope.at(-1)).toMatchObject({ scope: 8, shipped: 5 })
      expect(snapshot.scope[0]).toMatchObject({ scope: 1, shipped: 0, reason: "Plan." })

      // Uneven throughput goes through the seeded Monte Carlo and still gives the same dates on every read.
      yield* shippedOn("FCT", [1, 2, 3, 4, 5], (number) => (today - number * 3) * DAY)
      const first = (yield* board.snapshot("FCT")).forecast.forecast
      const second = (yield* board.summaries()).find((item) => item.project.key === "FCT")?.forecast.forecast
      expect(first.kind).toBe("dates")
      expect(second).toEqual(first)
      if (first.kind === "dates") expect(first.p85).toBeGreaterThanOrEqual(first.p50)
    }),
  )

  it.live("forecast: fewer than 5 shipped is insufficient and an epic whose remaining work is blocked waits on it", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "FEW", name: "Few", reason: "Start." })
      yield* board.epic({ project: "FEW", title: "Only", reason: "Plan." })
      yield* board.issue({ project: "FEW", title: "Done", epic: 1, reason: "Plan." })
      yield* board.move({ project: "FEW", number: 1, stage: "shipped", reason: "Shipped without a PR." })
      yield* board.issue({ project: "FEW", title: "Blocked", epic: 1, reason: "Plan." })
      yield* board.issue({ project: "FEW", title: "Loose", reason: "Plan." })
      expect((yield* board.snapshot("FEW")).forecast.forecast).toEqual({ kind: "insufficient", shipped: 1, needed: 5 })

      yield* board.pauseIssue("FEW", 2)
      const snapshot = yield* board.snapshot("FEW")
      expect(snapshot.epicForecasts[0]?.forecast).toEqual({ kind: "waits", on: "FEW-2" })
      expect(snapshot.forecast.forecast).toEqual({ kind: "insufficient", shipped: 1, needed: 5 })
    }),
  )

  it.live("health turns at_risk only after two consecutive evaluations with P50 past the target date", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const today = Math.floor(Date.now() / DAY)
      const health = () =>
        board.summaries().pipe(Effect.map((list) => list.find((item) => item.project.key === "RSK")?.health))
      yield* board.project({ key: "RSK", name: "Risk", reason: "Start." })
      yield* Effect.forEach([1, 2, 3, 4, 5], (number) =>
        Effect.gen(function* () {
          yield* board.issue({ project: "RSK", title: `Done ${number}`, reason: "Plan." })
          yield* board.move({ project: "RSK", number, stage: "shipped", reason: "Shipped without a PR." })
        }),
      )
      yield* board.issue({ project: "RSK", title: "Open", reason: "Plan." })
      expect(yield* health()).toBe("on_track")

      yield* board.project({ key: "RSK", target_date: (today - 10) * DAY, reason: "The date moved in." })
      expect(yield* health()).toBe("on_track")
      yield* board.note("RSK", 6, { body: "Still on it." })
      expect(yield* health()).toBe("at_risk")
      yield* board.project({ key: "RSK", target_date: (today + 30) * DAY, reason: "The date moved out." })
      expect(yield* health()).toBe("on_track")
    }),
  )

  it.live("archive: only shipped or paused projects, hidden from the list, unarchive brings it back paused", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "ARC", name: "Archive", reason: "Start." })
      yield* board.issue({ project: "ARC", title: "Work", reason: "Plan." })

      const active = yield* Effect.flip(board.archive("ARC"))
      expect(active).toBeInstanceOf(Board.RefusedError)
      expect(active.message).toBe("ARC is active; only a shipped or paused project can be archived.")
      expect((yield* Effect.flip(board.unarchive("ARC"))).message).toBe("ARC is not archived.")

      yield* board.pause("ARC", { reason: "Done for now." })
      yield* board.archive("ARC")
      expect((yield* Effect.flip(board.archive("ARC"))).message).toBe("ARC is already archived.")
      expect((yield* board.summaries()).map((item) => item.project.key)).not.toContain("ARC")
      expect((yield* board.summaries({ archived: true })).map((item) => item.project.key)).toContain("ARC")
      expect((yield* Effect.flip(board.issue({ project: "ARC", title: "More", reason: "Plan." }))).message).toContain(
        "archived",
      )
      expect((yield* Effect.flip(board.resume("ARC"))).message).toContain("archived")

      yield* board.unarchive("ARC")
      expect((yield* board.snapshot("ARC")).project.status).toBe("paused")
      expect((yield* rows("ARC")).filter((row) => row.action === "archive.set").map((row) => [row.before, row.after])).toEqual([
        [{ status: "paused" }, { status: "archived" }],
        [{ status: "archived" }, { status: "paused" }],
      ])
    }),
  )

  it.live("owner notes: edit and delete the owner's own notes only, refusing a no-op edit", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const database = yield* Database.Service
      yield* board.project({ key: "NTE", name: "Notes", reason: "Start." })
      yield* board.issue({ project: "NTE", title: "Work", reason: "Plan." })
      yield* board.note("NTE", 1, { body: "First draft." })
      const issue = (yield* board.snapshot("NTE")).issues[0]!
      yield* database.db
        .insert(BoardNoteTable)
        .values({ id: NoteID.make("bno_github_comment"), issue_id: issue.id, author: "github", body: "From GitHub.", time_updated: Date.now() })
        .run()
        .pipe(Effect.orDie)
      const note = (yield* board.issuePage("NTE", 1)).notes.find((item) => item.author === "owner")!

      yield* board.editNote("NTE", 1, note.id, { body: "Second draft." })
      expect((yield* Effect.flip(board.editNote("NTE", 1, note.id, { body: "Second draft." }))).message).toBe(
        "That note already says this.",
      )
      const github = yield* Effect.flip(board.editNote("NTE", 1, "bno_github_comment", { body: "Mine now." }))
      expect(github).toBeInstanceOf(Board.RefusedError)
      expect(yield* Effect.flip(board.deleteNote("NTE", 1, "bno_github_comment"))).toBeInstanceOf(Board.RefusedError)
      expect(yield* Effect.flip(board.deleteNote("NTE", 1, "bno_missing"))).toBeInstanceOf(Board.NotFoundError)

      yield* board.deleteNote("NTE", 1, note.id)
      expect((yield* board.issuePage("NTE", 1)).notes.map((item) => item.body)).toEqual(["From GitHub."])
      expect(
        (yield* rows("NTE"))
          .filter((row) => row.action.startsWith("note."))
          .map((row) => [row.action, row.before, row.after]),
      ).toEqual([
        ["note.add", null, expect.anything()],
        ["note.edit", { id: note.id, body: "First draft." }, { id: note.id, body: "Second draft." }],
        ["note.delete", { id: note.id, body: "Second draft." }, null],
      ])
    }),
  )

  it.live("thread rows: the host records a card's messages read-only, beside notes and out of Maestro's news", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "THR", name: "Thread", reason: "Start." })
      yield* board.issue({ project: "THR", title: "Work", reason: "Plan." })
      yield* board.thread({ key: "THR", number: 1, kind: "brief", author: "maestro", body: "Build it." })
      yield* board.thread({ key: "THR", number: 1, kind: "return", author: "backend", body: "Built." })
      yield* board.note("THR", 1, { body: "Looks right." })

      const notes = (yield* board.issuePage("THR", 1)).notes
      expect(notes.map((note) => [note.kind, note.author, note.body])).toEqual([
        ["brief", "maestro", "Build it."],
        ["return", "backend", "Built."],
        ["note", "owner", "Looks right."],
      ])
      expect(yield* Effect.flip(board.editNote("THR", 1, notes[1]!.id, { body: "Mine now." }))).toBeInstanceOf(Board.RefusedError)
      expect(yield* Effect.flip(board.deleteNote("THR", 1, notes[0]!.id))).toBeInstanceOf(Board.RefusedError)
      expect((yield* board.read({ project: "THR" })).since.notes.map((note) => note.kind)).toEqual(["note"])
    }),
  )

  it.live("removing a secret attachment deletes its credential and never shows the value", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const events = yield* EventV2.Service
      const database = yield* Database.Service
      const seen: unknown[] = []
      yield* events.all().pipe(
        Stream.runForEach((event) => Effect.sync(() => seen.push(event))),
        Effect.forkScoped,
      )
      yield* Effect.yieldNow
      yield* board.project({ key: "RMV", name: "Remove", reason: "Start." })
      yield* board.issue({ project: "RMV", title: "Deploy", reason: "Plan." })
      yield* board.attach("RMV", 1, { kind: "secret", name: "Remove token", value: SECRET })
      const attachment = (yield* board.issuePage("RMV", 1)).attachments[0]!
      const credential = (yield* database.db.select().from(BoardAttachmentTable).where(eq(BoardAttachmentTable.id, attachment.id)).get().pipe(Effect.orDie))!
        .credential_id!

      const removed = yield* board.removeAttachment("RMV", 1, attachment.id)
      expect((yield* board.issuePage("RMV", 1)).attachments).toEqual([])
      expect(
        yield* database.db.select().from(CredentialTable).where(eq(CredentialTable.id, credential)).all().pipe(Effect.orDie),
      ).toEqual([])
      expect(yield* Effect.flip(board.removeAttachment("RMV", 1, attachment.id))).toBeInstanceOf(Board.NotFoundError)
      const logged = (yield* rows("RMV")).find((row) => row.action === "attachment.remove")
      expect(logged).toMatchObject({ id: removed.activity, before: { id: attachment.id, kind: "secret", name: "Remove token" }, after: null })
      expect(JSON.stringify([removed, yield* rows("RMV"), yield* board.snapshot("RMV"), seen])).not.toContain(SECRET)
    }),
  )

  it.live("reads the git trail live, keeps a good read briefly and reports signed out instead of stale data", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const directory = yield* repository("TRL")
      yield* board.project({ key: "TRL", name: "Trail", repo: directory, reason: "Start." })
      yield* board.issue({ project: "TRL", title: "Code", seat: "backend", pr: 7, branch: "feature", reason: "Plan." })

      yield* fakeGh({ stdout: JSON.stringify(detail({ merged: false })) })
      const trail = (yield* board.issuePage("TRL", 1)).trail
      expect(trail).toMatchObject({
        state: "ok",
        branch: "feature",
        pr: { number: 7, merged: false, checks: [{ name: "test", status: "COMPLETED", conclusion: "SUCCESS" }] },
        commits: [{ hash: "abc123", message: "Build it", seat: "backend" }],
      })

      yield* fakeGh({ code: 1, stderr: "To get started with GitHub CLI, please run:  gh auth login\n" })
      expect((yield* board.issuePage("TRL", 1)).trail).toEqual(trail)

      yield* board.issue({ project: "TRL", number: 1, pr: 8, reason: "New PR." })
      expect((yield* board.issuePage("TRL", 1)).trail).toEqual({
        state: "signed_out",
        message: "GitHub is signed out; sign in with gh to see the git trail.",
      })
    }),
    30_000,
  )
})

// Back-dates when each shipped issue shipped, the input the forecast's throughput reads.
function shippedOn(key: string, numbers: number[], at: (number: number) => number) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const board = yield* Board.Service
    const project = (yield* board.snapshot(key)).project
    yield* Effect.forEach(numbers, (number) =>
      database.db
        .update(BoardIssueTable)
        .set({ stage_entered_at: at(number) })
        .where(and(eq(BoardIssueTable.project_id, project.id), eq(BoardIssueTable.number, number)))
        .run()
        .pipe(Effect.orDie),
    )
  })
}

function rows(key: string) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const board = yield* Board.Service
    const project = (yield* board.snapshot(key)).project
    return yield* database.db
      .select()
      .from(BoardActivityTable)
      .where(eq(BoardActivityTable.project_id, project.id))
      .orderBy(BoardActivityTable.id)
      .all()
      .pipe(Effect.orDie)
  })
}

// A git repo with a GitHub remote, registered as a core Project so the board can link it.
function repository(name: string) {
  return Effect.gen(function* () {
    const directory = yield* Effect.promise(async () => {
      const directory = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), `orchestra-board-${name}-`)))
      await git(directory, "-c", "init.defaultBranch=main", "init")
      await git(directory, "remote", "add", "origin", "git@github.com:acme/widgets.git")
      return directory
    })
    const database = yield* Database.Service
    yield* database.db
      .insert(ProjectTable)
      .values({ id: ProjectSchema.ID.make(`prj_board_${name}`), worktree: AbsolutePath.make(directory), sandboxes: [] })
      .run()
      .pipe(Effect.orDie)
    return directory
  })
}

function fakeGh(reply: { stdout?: string; stderr?: string; code?: number }) {
  return Effect.promise(async () => {
    const script = path.join(bin, "gh.js")
    await fs.writeFile(
      script,
      [
        `process.stdout.write(${JSON.stringify(reply.stdout ?? "")})`,
        `process.stderr.write(${JSON.stringify(reply.stderr ?? "")})`,
        `process.exitCode = ${reply.code ?? 0}`,
      ].join("\n"),
    )
    if (process.platform === "win32")
      await fs.writeFile(
        path.join(bin, "gh.cmd"),
        `@echo off\r\n"${process.execPath}" "${script}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
      )
    if (process.platform !== "win32") {
      await fs.writeFile(path.join(bin, "gh"), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`)
      await fs.chmod(path.join(bin, "gh"), 0o755)
    }
  })
}

// What gh api graphql prints for the single pull request query.
function detail(input: { merged: boolean }) {
  return {
    data: {
      repository: {
        pullRequest: {
          number: 7,
          title: "Build it",
          url: "https://github.com/acme/widgets/pull/7",
          state: input.merged ? "MERGED" : "OPEN",
          merged: input.merged,
          headRefName: "feature",
          reviewDecision: null,
          mergeCommit: input.merged ? { oid: "def456" } : null,
          commits: {
            nodes: [
              {
                commit: {
                  oid: "abc123",
                  messageHeadline: "Build it",
                  statusCheckRollup: {
                    contexts: { nodes: [{ __typename: "CheckRun", name: "test", status: "COMPLETED", conclusion: "SUCCESS" }] },
                  },
                },
              },
            ],
          },
        },
      },
    },
  }
}
