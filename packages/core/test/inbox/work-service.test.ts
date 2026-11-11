import { expect } from "bun:test"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { Board } from "@orchestra/schema/board"
import { BoardIssueTable, BoardProjectTable, BoardQuestionTable } from "../../src/board/sql"
import { InboxDraftTable, InboxRowTable } from "../../src/inbox/sql"
import { ProjectTable } from "../../src/project/sql"
import { directory, fixture, location } from "./work-service-fixture"

fixture(
  "Board owner requests project locally, reconcile resolution and never hand an owner decision back to Maestro",
  ({ inbox, db, calls }) =>
    Effect.gen(function* () {
      yield* db
        .insert(ProjectTable)
        .values({ id: location.project.id, worktree: directory, sandboxes: [] })
        .onConflictDoNothing()
        .run()
      const project = Board.ProjectID.create()
      const foreign = Board.ProjectID.create()
      yield* db
        .insert(BoardProjectTable)
        .values([
          {
            id: project,
            key: "OWN",
            name: "Owned",
            goal: "Owner decisions",
            repo_project_id: location.project.id,
            status: "active",
            github_state: "off",
            next_issue_number: 3,
            next_epic_number: 1,
          },
          {
            id: foreign,
            key: "OTHER",
            name: "Other",
            goal: "Not this repo",
            status: "active",
            github_state: "off",
            next_issue_number: 1,
            next_epic_number: 1,
          },
        ])
        .run()
      const question = Board.QuestionID.create()
      yield* db
        .insert(BoardQuestionTable)
        .values([
          {
            id: question,
            project_id: project,
            text: "Choose a recovery strategy",
            options: [],
            recommended: "safe",
            blocking: true,
            status: "open",
          },
          {
            id: Board.QuestionID.create(),
            project_id: foreign,
            text: "Private elsewhere",
            options: [],
            recommended: "",
            blocking: true,
            status: "open",
          },
        ])
        .run()
      yield* db
        .insert(BoardIssueTable)
        .values([
          {
            id: Board.IssueID.create(),
            project_id: project,
            number: 1,
            title: "Accept intake",
            body: "",
            type: "feature",
            stage: "intake",
            position: 1,
            stage_entered_at: 1,
          },
          {
            id: Board.IssueID.create(),
            project_id: project,
            number: 2,
            title: "Release held delivery",
            body: "",
            type: "feature",
            stage: "review",
            hold_before_merge: true,
            position: 2,
            stage_entered_at: 1,
          },
        ])
        .run()
      const items = yield* inbox.list()
      expect(items).toHaveLength(3)
      expect(items.every((item) => item.source === "board" && !item.reply)).toBe(true)
      const item = items.find((item) => item.externalId === `question:${question}`)!
      expect((yield* inbox.require([item.id]).pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.handoff([item.id]).pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.send(item.id, "no automatic answer").pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.originDraft(item.id, "no delegated answer").pipe(Effect.flip)).reason).toBe("unavailable")
      yield* inbox.markRead(item.id)
      expect((yield* inbox.list()).find((entry) => entry.id === item.id)?.waiting).toBe(false)
      yield* db
        .update(BoardQuestionTable)
        .set({ recommended: "changed" })
        .where(eq(BoardQuestionTable.id, question))
        .run()
      expect((yield* inbox.list()).find((entry) => entry.id === item.id)?.waiting).toBe(false)
      yield* db.update(BoardQuestionTable).set({ status: "answered" }).where(eq(BoardQuestionTable.id, question)).run()
      expect((yield* inbox.list()).find((entry) => entry.id === item.id)?.waiting).toBe(false)
      yield* db.update(BoardProjectTable).set({ status: "archived" }).where(eq(BoardProjectTable.id, project)).run()
      expect((yield* inbox.list()).every((entry) => !entry.waiting)).toBe(true)
      expect(calls).toHaveLength(0)
    }),
)

fixture(
  "opening this location does not close another project's board attention",
  ({ inbox, db }) =>
    Effect.gen(function* () {
      yield* db
        .insert(ProjectTable)
        .values({ id: location.project.id, worktree: directory, sandboxes: [] })
        .onConflictDoNothing()
        .run()
      const project = Board.ProjectID.create()
      const foreign = Board.ProjectID.create()
      const foreignQuestion = Board.QuestionID.create()
      yield* db
        .insert(BoardProjectTable)
        .values([
          {
            id: project,
            key: "HERE",
            name: "Here",
            goal: "This repo",
            repo_project_id: location.project.id,
            status: "active",
            github_state: "off",
            next_issue_number: 1,
            next_epic_number: 1,
          },
          {
            id: foreign,
            key: "ELSE",
            name: "Elsewhere",
            goal: "Other repo",
            status: "active",
            github_state: "off",
            next_issue_number: 1,
            next_epic_number: 1,
          },
        ])
        .run()
      yield* db
        .insert(BoardQuestionTable)
        .values({
          id: foreignQuestion,
          project_id: foreign,
          text: "Still open elsewhere",
          options: [],
          recommended: "",
          blocking: true,
          status: "open",
        })
        .run()
      yield* db
        .insert(InboxRowTable)
        .values({
          owner: "install",
          source: "board",
          external_id: `question:${foreignQuestion}`,
          list_id: "in_foreign",
          actor: "ELSE",
          snippet: "Still open elsewhere",
          thread_id: foreignQuestion,
          reply: false,
          open: true,
        })
        .run()
      const kept = (yield* inbox.list()).find((item) => item.externalId === `question:${foreignQuestion}`)
      expect(kept?.waiting).toBe(true)
      yield* db.update(BoardProjectTable).set({ status: "archived" }).where(eq(BoardProjectTable.id, foreign)).run()
      expect((yield* inbox.list()).find((item) => item.id === kept?.id)?.waiting).toBe(true)
    }),
)

fixture(
  "a mail origin draft is saved only when the account accepts the unsent draft",
  ({ inbox, db, calls, provider }) =>
    Effect.gen(function* () {
      const item = yield* inbox.upsert({
        source: "mail",
        externalId: "legacy-mail",
        actor: "ada@example.com",
        snippet: "hello",
        threadId: "thread-1",
        reply: true,
      })
      const before = calls.length
      expect((yield* inbox.originDraft(item.id, "unsent").pipe(Effect.flip)).reason).toBe("unavailable")
      expect(calls).toHaveLength(before)
      expect(yield* db.select().from(InboxDraftTable).all()).toMatchObject([
        { list_id: item.id, text: "unsent", sent: false },
      ])
      yield* inbox.connect({ source: "mail", account: "gmail", token: "fixture-mail" })
      provider.failPage = true
      expect((yield* inbox.originDraft(item.id, "failed write").pipe(Effect.flip)).reason).toBe("unavailable")
      expect(calls.some((url) => url.pathname === "/gmail/v1/users/me/drafts")).toBe(true)
      provider.failPage = false
      const accepted = calls.length
      expect(yield* inbox.originDraft(item.id, "accepted")).toEqual({ drafted: true })
      expect(calls.slice(accepted).some((url) => url.pathname === "/gmail/v1/users/me/drafts")).toBe(true)
      yield* inbox.connect({ source: "mail", account: "outlook", token: "fixture-mail" })
      provider.failPage = true
      expect((yield* inbox.originDraft(item.id, "outlook failed").pipe(Effect.flip)).reason).toBe("unavailable")
      expect(calls.some((url) => url.pathname === "/v1.0/me/messages")).toBe(true)
    }),
)
