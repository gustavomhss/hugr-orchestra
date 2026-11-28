import { expect } from "bun:test"
import path from "path"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Fiber, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { ProjectTable } from "@orchestra/core/project/sql"
import { SessionV2 } from "@orchestra/core/session"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { ReadTool } from "@orchestra/core/tool/read"
import { WriteTool } from "@orchestra/core/tool/write"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { tempLocationLayer } from "./fixture/location"
import { toolIdentity } from "./lib/tool"
import { testEffect } from "./lib/effect"

const sessionID = SessionV2.ID.make("ses_permission_audit")
const agentID = AgentV2.ID.make("audit")
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Location.node,
      Database.node,
      EventV2.node,
      SessionStore.node,
      PermissionSaved.node,
      AgentV2.node,
      PermissionV2.node,
      ToolRegistry.node,
      ToolRegistry.toolsNode,
      ReadTool.node,
      WriteTool.node,
      FSUtil.node,
    ]),
    [
      [Location.node, tempLocationLayer],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    ],
  ),
)

function sessionRules(rules: PermissionV2.Ruleset) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    yield* database.db
      .update(SessionTable)
      .set({
        permission: rules.map((rule) => ({
          permission: rule.action,
          pattern: rule.resource,
          action: rule.effect,
        })),
      })
      .where(eq(SessionTable.id, sessionID))
      .run()
      .pipe(Effect.orDie)
  })
}

function setup(agentRules: PermissionV2.Ruleset, rules: PermissionV2.Ruleset = []) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const location = yield* Location.Service
    const agents = yield* AgentV2.Service
    yield* database.db
      .insert(ProjectTable)
      .values({ id: location.project.id, worktree: location.directory, sandboxes: [] })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
    yield* database.db
      .insert(SessionTable)
      .values({
        id: sessionID,
        project_id: location.project.id,
        directory: location.directory,
        slug: "permission-audit",
        title: "permission audit",
        version: "test",
        agent: agentID,
      })
      .run()
      .pipe(Effect.orDie)
    yield* agents.transform((draft) =>
      draft.update(agentID, (agent) => {
        agent.permissions = [...agentRules]
      }),
    )
    yield* sessionRules(rules)
    const fs = yield* FSUtil.Service
    yield* fs.ensureDir(path.join(location.directory, "private"))
    yield* fs.writeFileString(path.join(location.directory, "private", "secret.txt"), "PRIVATE_SENTINEL")
  })
}

it.live(
  "Session-specific deny keeps shipped read visible but prevents reading and writing private files despite saved allow",
  () =>
    Effect.gen(function* () {
      yield* setup(
        [{ action: "*", resource: "*", effect: "allow" }],
        [
          { action: "read", resource: "private/**", effect: "deny" },
          { action: "edit", resource: "private/**", effect: "deny" },
        ],
      )
      const saved = yield* PermissionSaved.Service
      const location = yield* Location.Service
      yield* saved.add({ projectID: location.project.id, action: "read", resources: ["*"] })
      yield* saved.add({ projectID: location.project.id, action: "edit", resources: ["*"] })
      const registry = yield* ToolRegistry.Service
      const store = yield* SessionStore.Service
      const tools = yield* registry.materialize(yield* store.permissions(sessionID))
      expect(tools.definitions.some((tool) => tool.name === "read")).toBe(true)
      const read = yield* tools.settle({
        sessionID,
        ...toolIdentity,
        agent: agentID,
        call: {
          type: "tool-call",
          name: "read",
          id: "deny-read",
          input: { path: "private/secret.txt" },
        },
      })
      expect(read.result.type).toBe("error")
      expect(JSON.stringify(read)).not.toContain("PRIVATE_SENTINEL")
      const write = yield* tools.settle({
        sessionID,
        ...toolIdentity,
        agent: agentID,
        call: {
          type: "tool-call",
          name: "write",
          id: "deny-write",
          input: { path: "private/secret.txt", content: "changed" },
        },
      })
      expect(write.result.type).toBe("error")
      const fs = yield* FSUtil.Service
      expect(yield* fs.readFileString(path.join(location.directory, "private/secret.txt"))).toBe("PRIVATE_SENTINEL")
    }),
)

it.effect("Session allow overrides agent ask while missing-agent deny remains closed", () =>
  Effect.gen(function* () {
    yield* setup(
      [{ action: "read", resource: "*", effect: "ask" }],
      [{ action: "read", resource: "*", effect: "allow" }],
    )
    const permission = yield* PermissionV2.Service
    const input = { sessionID, action: "read", resources: ["private/secret.txt"] }
    expect(yield* permission.evaluate(input)).toBe("allow")
    yield* permission.authorize(input)
    expect(yield* permission.list()).toEqual([])
    expect(yield* permission.evaluate({ ...input, agent: AgentV2.ID.make("missing-audit-agent") })).toBe("deny")
  }),
)

for (const explicit of [false, true]) {
  for (const reply of ["once", "always"] as const) {
    it.live(
      `Session deny introduced during ${explicit ? "explicit" : "ordinary"} Ask prevents ${reply} and saves no grant`,
      () =>
        Effect.gen(function* () {
          yield* setup([{ action: "edit", resource: "*", effect: "ask" }])
          const permission = yield* PermissionV2.Service
          const events = yield* EventV2.Service
          const saved = yield* PermissionSaved.Service
          const asked = yield* Deferred.make<PermissionV2.Request>()
          const replies: unknown[] = []
          const executed: string[] = []
          const unsubscribe = yield* events.listen((event) => {
            if (event.type === PermissionV2.Event.Asked.type)
              return Deferred.succeed(asked, Schema.decodeUnknownSync(PermissionV2.Request)(event.data)).pipe(
                Effect.asVoid,
              )
            if (event.type === PermissionV2.Event.Replied.type)
              return Effect.sync(() => {
                replies.push(event.data)
              })
            return Effect.void
          })
          yield* Effect.addFinalizer(() => unsubscribe)
          const input = { sessionID, agent: agentID, action: "edit", resources: ["private/secret.txt"], save: ["*"] }
          const fiber = yield* (explicit ? permission.askExplicit(input) : permission.authorize(input)).pipe(
            Effect.andThen(
              Effect.sync(() => {
                executed.push("executed")
              }),
            ),
            Effect.result,
            Effect.forkChild,
          )
          const request = yield* Deferred.await(asked)
          yield* sessionRules([{ action: "edit", resource: "private/**", effect: "deny" }])
          yield* permission.reply({ requestID: request.id, reply })
          const result = yield* Fiber.join(fiber)
          expect(result).toMatchObject({ _tag: "Failure", failure: { _tag: "PermissionV2.BlockedError" } })
          expect(executed).toEqual([])
          expect(yield* saved.list()).toEqual([])
          expect(yield* permission.list()).toEqual([])
          expect(replies).toEqual([{ sessionID, requestID: request.id, reply: "reject" }])
        }),
    )
  }
}

it.live("explicit intent still requires a live reply despite Session and saved allow", () =>
  Effect.gen(function* () {
    yield* setup(
      [{ action: "edit", resource: "*", effect: "allow" }],
      [{ action: "edit", resource: "*", effect: "allow" }],
    )
    const permission = yield* PermissionV2.Service
    const events = yield* EventV2.Service
    const saved = yield* PermissionSaved.Service
    const location = yield* Location.Service
    yield* saved.add({ projectID: location.project.id, action: "edit", resources: ["*"] })
    const before = yield* saved.list()
    const asked = yield* Deferred.make<PermissionV2.Request>()
    const unsubscribe = yield* events.listen((event) =>
      event.type === PermissionV2.Event.Asked.type
        ? Deferred.succeed(asked, Schema.decodeUnknownSync(PermissionV2.Request)(event.data)).pipe(Effect.asVoid)
        : Effect.void,
    )
    yield* Effect.addFinalizer(() => unsubscribe)
    const fiber = yield* permission
      .askExplicit({ sessionID, action: "edit", resources: ["private/secret.txt"], save: ["*"] })
      .pipe(Effect.result, Effect.forkChild)
    const request = yield* Effect.raceFirst(
      Deferred.await(asked),
      Fiber.join(fiber).pipe(Effect.andThen(Effect.fail(new Error("explicit intent skipped its live reply")))),
    )
    expect(request.save).toBeUndefined()
    yield* permission.reply({ requestID: request.id, reply: "always" })
    expect(yield* Fiber.join(fiber)).toMatchObject({ _tag: "Success" })
    expect(yield* saved.list()).toEqual(before)
  }),
)

it.live("removing a Session during Ask declines its approval without saving a grant", () =>
  Effect.gen(function* () {
    yield* setup([{ action: "edit", resource: "*", effect: "ask" }])
    const permission = yield* PermissionV2.Service
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const saved = yield* PermissionSaved.Service
    const asked = yield* Deferred.make<PermissionV2.Request>()
    const replies: unknown[] = []
    const unsubscribe = yield* events.listen((event) => {
      if (event.type === PermissionV2.Event.Asked.type)
        return Deferred.succeed(asked, Schema.decodeUnknownSync(PermissionV2.Request)(event.data)).pipe(Effect.asVoid)
      if (event.type === PermissionV2.Event.Replied.type)
        return Effect.sync(() => {
          replies.push(event.data)
        })
      return Effect.void
    })
    yield* Effect.addFinalizer(() => unsubscribe)
    const fiber = yield* permission
      .authorize({ sessionID, action: "edit", resources: ["private/secret.txt"], save: ["*"] })
      .pipe(Effect.result, Effect.forkChild)
    const request = yield* Deferred.await(asked)
    yield* database.db.delete(SessionTable).where(eq(SessionTable.id, sessionID)).run().pipe(Effect.orDie)
    yield* permission.reply({ requestID: request.id, reply: "always" })
    expect(yield* Fiber.join(fiber)).toMatchObject({ _tag: "Failure", failure: { _tag: "PermissionV2.DeclinedError" } })
    expect(yield* permission.list()).toEqual([])
    expect(yield* saved.list()).toEqual([])
    expect(replies).toEqual([{ sessionID, requestID: request.id, reply: "reject" }])
  }),
)
