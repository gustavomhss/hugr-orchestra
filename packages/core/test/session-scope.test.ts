import { describe, expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionScope, SessionStore } from "@orchestra/core/session/store"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, SessionStore.node])))

const scope: SessionScope.Scope = {
  skills: { entry: "lucy-lens-correctness", allow: ["lucy-lens-correctness-logic", "team-stack"] },
  tools: ["read", "skill"],
  budgets: { loads: 1, toolCalls: 2 },
}

const insert = (id: SessionSchema.ID) =>
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
      .values({ id, project_id: Project.ID.global, slug: id, directory: "/project", title: "test", version: "test" })
      .run()
      .pipe(Effect.orDie)
  })

describe("SessionScope.decide", () => {
  const state = SessionScope.initial(scope)

  it.effect("holds the delivered entry from the start and admits only exact allowed nodes within the load budget", () =>
    Effect.sync(() => {
      expect(state).toEqual({ scope, loads: 0, toolCalls: 0, held: ["lucy-lens-correctness"], deviations: [] })
      expect(SessionScope.decide(state, { type: "skill", name: "lucy-lens-correctness" })).toMatchObject({ kind: "skill-held" })
      expect(SessionScope.decide(state, { type: "skill", name: "lucy-lens" })).toMatchObject({ kind: "skill-outside-scope" })
      // Exact names: an allowed node grants none of its children.
      expect(SessionScope.decide(state, { type: "skill", name: "team-stack-js-ts" })).toMatchObject({ kind: "skill-outside-scope" })
      expect(SessionScope.decide(state, { type: "skill", name: "team-stack" })).toBeUndefined()
      const loaded = SessionScope.admit(state, { type: "skill", name: "team-stack" })
      expect(loaded).toMatchObject({ loads: 1, held: ["lucy-lens-correctness", "team-stack"] })
      expect(SessionScope.decide(loaded, { type: "skill", name: "team-stack" })).toMatchObject({ kind: "skill-held" })
      expect(SessionScope.decide(loaded, { type: "skill", name: "lucy-lens-correctness-logic" })).toEqual({
        kind: "load-budget",
        name: "lucy-lens-correctness-logic",
        detail: `This Session's skill load budget (1) is spent: ${SessionScope.LOAD_BUDGET_REFUSAL}.`,
      })
    }),
  )

  it.effect("admits only scoped tools and spends the call budget", () =>
    Effect.sync(() => {
      expect(SessionScope.decide(state, { type: "tool", name: "bash" })).toMatchObject({ kind: "tool-outside-scope", name: "bash" })
      const spent = SessionScope.admit(SessionScope.admit(state, { type: "tool", name: "read" }), { type: "tool", name: "read" })
      expect(SessionScope.exhausted(SessionScope.admit(state, { type: "tool", name: "read" }))).toBe(false)
      expect(SessionScope.exhausted(spent)).toBe(true)
      expect(SessionScope.decide(spent, { type: "tool", name: "read" })).toMatchObject({ kind: "tool-budget" })
    }),
  )
})

describe("SessionStore scope", () => {
  it.effect("is written once, records uses and deviations, and leaves an unscoped Session admitting everything", () =>
    Effect.gen(function* () {
      const scoped = SessionSchema.ID.make("ses_scoped")
      const plain = SessionSchema.ID.make("ses_plain")
      yield* insert(scoped)
      yield* insert(plain)
      const store = yield* SessionStore.Service

      expect(yield* store.scope(scoped)).toBeUndefined()
      yield* store.narrow(scoped, scope)
      expect(yield* store.narrow(scoped, scope).pipe(Effect.flip)).toMatchObject({ reason: "already-scoped" })
      expect(yield* store.narrow(SessionSchema.ID.make("ses_missing"), scope).pipe(Effect.flip)).toMatchObject({ reason: "missing-session" })
      expect(
        yield* store.narrow(plain, { ...scope, budgets: { loads: -1, toolCalls: 0 } }).pipe(Effect.flip),
      ).toMatchObject({ reason: "invalid-scope" })

      expect(yield* store.charge(scoped, { type: "tool", name: "read" })).toEqual({ admitted: true })
      expect(yield* store.charge(scoped, { type: "tool", name: "bash" })).toMatchObject({ admitted: false, deviation: { kind: "tool-outside-scope" } })
      expect(yield* store.charge(scoped, { type: "skill", name: "team-stack" })).toEqual({ admitted: true })
      expect(yield* store.scope(scoped)).toMatchObject({
        loads: 1,
        toolCalls: 1,
        held: ["lucy-lens-correctness", "team-stack"],
        deviations: [{ kind: "tool-outside-scope", name: "bash" }],
      })

      expect(yield* store.charge(plain, { type: "tool", name: "bash" })).toEqual({ admitted: true })
      expect(yield* store.scope(plain)).toBeUndefined()
    }),
  )

  it.effect("concurrent calls each count, and an execution host's own state write keeps the scope", () =>
    Effect.gen(function* () {
      const sessionID = SessionSchema.ID.make("ses_concurrent")
      yield* insert(sessionID)
      const store = yield* SessionStore.Service
      yield* store.narrow(sessionID, { ...scope, budgets: { loads: 0, toolCalls: 5 } })
      const host = ExecutionHost.state((yield* Database.Service).db, sessionID, "claudeCode")

      const decisions = yield* Effect.all(
        Array.from({ length: 6 }, () => store.charge(sessionID, { type: "tool", name: "read" })),
        { concurrency: "unbounded" },
      )
      yield* host.update(() => ({ sessionId: "claude-1" }))

      expect(decisions.filter((decision) => decision.admitted)).toHaveLength(5)
      expect(yield* store.scope(sessionID)).toMatchObject({ toolCalls: 5, deviations: [{ kind: "tool-budget" }] })
      expect(yield* host.get).toEqual({ sessionId: "claude-1" })
      const { db } = yield* Database.Service
      const row = yield* db.select({ metadata: SessionTable.metadata }).from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
      expect(Object.keys(row?.metadata ?? {}).toSorted()).toEqual(["claudeCode", SessionScope.KEY])
    }),
  )
})
