import { describe, expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { Effect } from "effect"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, SessionStore.node])))
const sessionID = SessionSchema.ID.make("ses_store_permissions")

describe("SessionStore.permissions", () => {
  it.effect("reads the Session's V1 rules as V2 rules, in order", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const store = yield* SessionStore.Service
      yield* database.db
        .insert(ProjectTable)
        .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
        .run()
        .pipe(Effect.orDie)
      yield* database.db
        .insert(SessionTable)
        .values({
          id: sessionID,
          project_id: Project.ID.global,
          slug: "test",
          directory: "/project",
          title: "test",
          version: "test",
          permission: [
            { permission: "edit", pattern: "src/**", action: "allow" },
            { permission: "*", pattern: "*", action: "deny" },
          ],
        })
        .run()
        .pipe(Effect.orDie)

      expect(yield* store.permissions(sessionID)).toEqual([
        { action: "edit", resource: "src/**", effect: "allow" },
        { action: "*", resource: "*", effect: "deny" },
      ])
      expect(yield* store.permissions(SessionSchema.ID.make("ses_missing"))).toEqual([])
    }),
  )
})
