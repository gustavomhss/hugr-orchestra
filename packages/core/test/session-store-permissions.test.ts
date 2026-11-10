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

const insert = (id: SessionSchema.ID, permission?: (typeof SessionTable.$inferInsert)["permission"]) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    yield* db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
    yield* db
      .insert(SessionTable)
      .values({ id, project_id: Project.ID.global, slug: id, directory: "/project", title: "test", version: "test", permission })
      .run()
      .pipe(Effect.orDie)
  })

describe("SessionStore.permissions", () => {
  it.effect("maps the Session's recorded legacy rules to V2 rules in order", () => Effect.gen(function* () {
    yield* insert(SessionSchema.ID.make("ses_with_rules"), [
      { permission: "task", pattern: "worker", action: "allow" },
      { permission: "bash", pattern: "*", action: "deny" },
    ])
    const store = yield* SessionStore.Service
    expect(yield* store.permissions(SessionSchema.ID.make("ses_with_rules"))).toEqual([
      { action: "task", resource: "worker", effect: "allow" },
      { action: "bash", resource: "*", effect: "deny" },
    ])
  }))

  it.effect("keeps the Session's rules unchanged when its scope is written beside them", () => Effect.gen(function* () {
    const sessionID = SessionSchema.ID.make("ses_scoped_rules")
    const rules = [{ permission: "skill", pattern: "lucy-*", action: "allow" as const }]
    yield* insert(sessionID, rules)
    const store = yield* SessionStore.Service
    const scope = {
      skills: { entry: "lucy-review", allow: ["lucy-review-code"] },
      tools: ["read"],
      budgets: { loads: 2, toolCalls: 15 },
    }
    yield* store.narrow(sessionID, scope)
    expect(yield* store.permissions(sessionID)).toEqual([{ action: "skill", resource: "lucy-*", effect: "allow" }])
    expect((yield* store.scope(sessionID))?.scope).toEqual(scope)
  }))

  it.effect("is empty for a Session without rules and for an unknown Session", () => Effect.gen(function* () {
    yield* insert(SessionSchema.ID.make("ses_without_rules"))
    const store = yield* SessionStore.Service
    expect(yield* store.permissions(SessionSchema.ID.make("ses_without_rules"))).toEqual([])
    expect(yield* store.permissions(SessionSchema.ID.make("ses_unknown"))).toEqual([])
  }))
})
