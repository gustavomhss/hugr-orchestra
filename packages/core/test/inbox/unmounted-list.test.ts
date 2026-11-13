import { expect } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { Board } from "@orchestra/schema/board"
import { AppNodeBuilder } from "../../src/effect/app-node-builder"
import { LayerNode } from "../../src/effect/layer-node"
import { Database } from "../../src/database/database"
import { Credential } from "../../src/credential"
import { Location } from "../../src/location"
import { BoardProjectTable, BoardQuestionTable } from "../../src/board/sql"
import { ProjectTable } from "../../src/project/sql"
import { Inbox } from "../../src/inbox/service"
import { InboxRowTable } from "../../src/inbox/sql"
import { SlackAuth } from "../../src/inbox/slack-auth"
import { testEffect } from "../lib/effect"
import { directory, location } from "./work-service-fixture"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, Credential.node, SlackAuth.node]), [
    [Location.node, Layer.succeed(Location.Service, location)],
  ]),
)

it.effect("an unmounted list does not close this project's board attention", () =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const credentials = yield* Credential.Service
    const slack = yield* SlackAuth.Service
    const inbox = Context.get(
      yield* Layer.build(
        Inbox.layer({ projectBoard: false }).pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(Database.Service, database),
              Layer.succeed(Credential.Service, credentials),
              Layer.succeed(SlackAuth.Service, slack),
              Layer.succeed(Location.Service, location),
            ),
          ),
        ),
      ),
      Inbox.Service,
    )
    yield* database.db
      .insert(ProjectTable)
      .values({ id: location.project.id, worktree: directory, sandboxes: [] })
      .onConflictDoNothing()
      .run()
    const project = Board.ProjectID.create()
    const question = Board.QuestionID.create()
    yield* database.db
      .insert(BoardProjectTable)
      .values({
        id: project,
        key: "GONE",
        name: "Gone",
        goal: "Folder missing",
        repo_project_id: location.project.id,
        status: "active",
        github_state: "off",
        next_issue_number: 1,
        next_epic_number: 1,
      })
      .run()
    yield* database.db
      .insert(BoardQuestionTable)
      .values({
        id: question,
        project_id: project,
        text: "Still waiting",
        options: [],
        recommended: "",
        blocking: true,
        status: "answered",
      })
      .run()
    yield* database.db
      .insert(InboxRowTable)
      .values({
        owner: "install",
        source: "board",
        external_id: `question:${question}`,
        list_id: "in_gone",
        actor: "GONE",
        snippet: "Still waiting",
        thread_id: question,
        reply: false,
        open: true,
      })
      .run()
    const kept = (yield* inbox.list()).find((item) => item.externalId === `question:${question}`)
    expect(kept?.waiting).toBe(true)
    yield* database.db.update(BoardProjectTable).set({ status: "archived" }).where(eq(BoardProjectTable.id, project)).run()
    expect((yield* inbox.list()).find((item) => item.id === kept?.id)?.waiting).toBe(true)
  }),
)
