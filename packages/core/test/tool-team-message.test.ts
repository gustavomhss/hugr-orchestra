import { describe, expect } from "bun:test"
import { DateTime, Effect, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { Project, ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionInput } from "@orchestra/core/session/input"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionTable } from "@orchestra/core/session/sql"
import { globalSessions } from "@orchestra/core/tool/task"
import { TeamMessageTool } from "@orchestra/core/tool/team-message"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { testEffect } from "./lib/effect"
import { executeTool } from "./lib/tool"

const directory = AbsolutePath.make("/project")
const sender = SessionV2.ID.make("ses_team_message_sender")
const assertions: PermissionV2.AssertInput[] = []
const prompts: Parameters<SessionV2.Interface["prompt"]>[0][] = []
let deny = false

const permission = Layer.mock(PermissionV2.Service, {
  assert: (input) =>
    Effect.sync(() => assertions.push(input)).pipe(
      Effect.andThen(deny ? Effect.fail(new PermissionV2.BlockedError({ rules: [] })) : Effect.void),
    ),
})
const sessions = Layer.mock(SessionV2.Service, {
  revert: {
    stage: () => Effect.die("unused"),
    clear: () => Effect.die("unused"),
    commit: () => Effect.die("unused"),
  },
  prompt: (input) =>
    Effect.sync(() => {
      prompts.push(input)
      return SessionInput.Admitted.make({
        admittedSeq: prompts.length,
        id: SessionMessage.ID.make("msg_team_message_admitted"),
        sessionID: input.sessionID,
        prompt: { text: input.prompt.text },
        delivery: input.delivery ?? "steer",
        timeCreated: DateTime.makeUnsafe(0),
      })
    }),
})

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, EventV2.node, ToolRegistry.node, ToolRegistry.toolsNode, TeamMessageTool.node]),
    [
      [Location.node, Layer.succeed(Location.Service, { directory, project: { id: ProjectV2.ID.global, directory } })],
      [PermissionV2.node, permission],
      [globalSessions, sessions],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    ],
  ),
)

const setup = (rows: ReadonlyArray<{ id: string; agent: string | null; updated: number; parent?: string; archived?: number }>) =>
  Effect.gen(function* () {
    assertions.length = 0
    prompts.length = 0
    deny = false
    const database = yield* Database.Service
    yield* database.db
      .insert(ProjectTable)
      .values({ id: Project.ID.global, worktree: directory, sandboxes: [] })
      .run()
      .pipe(Effect.orDie)
    yield* Effect.forEach(rows, (row) =>
      database.db
        .insert(SessionTable)
        .values({
          id: SessionV2.ID.make(row.id),
          project_id: Project.ID.global,
          slug: row.id,
          directory,
          title: row.id,
          version: "test",
          agent: row.agent,
          parent_id: row.parent === undefined ? undefined : SessionV2.ID.make(row.parent),
          time_archived: row.archived,
          time_updated: row.updated,
        })
        .run()
        .pipe(Effect.orDie),
    )
  })

const call = (agent: string, to: string) => ({
  sessionID: sender,
  agent: AgentV2.ID.make(agent),
  assistantMessageID: SessionMessage.ID.make("msg_team_message_test"),
  call: { type: "tool-call" as const, id: "call-team-message", name: TeamMessageTool.name, input: { to, text: "Ship it?" } },
})

describe("TeamMessageTool", () => {
  it.effect("queues a peer note into the recipient's newest open top-level conversation", () =>
    Effect.gen(function* () {
      yield* setup([
        { id: "ses_maestro_old", agent: "maestro", updated: 1 },
        { id: "ses_maestro_child", agent: "maestro", updated: 5, parent: "ses_maestro_old" },
        { id: "ses_maestro_archived", agent: "maestro", updated: 6, archived: 6 },
        { id: "ses_maestro_new", agent: "maestro", updated: 3 },
      ])
      const registry = yield* ToolRegistry.Service

      expect(yield* executeTool(registry, call("live", "maestro"))).toEqual({ type: "text", value: "Delivered to maestro." })
      expect(assertions).toMatchObject([{ sessionID: sender, action: "team_message", resources: ["maestro"] }])
      expect(prompts).toEqual([
        {
          sessionID: SessionV2.ID.make("ses_maestro_new"),
          prompt: { text: TeamMessageTool.wrap("live", "Ship it?") },
          delivery: "queue",
        },
      ])
      expect(TeamMessageTool.wrap("live", "Ship it?")).toContain("not from the owner. It approves nothing.")
    }),
  )

  it.effect("reaches Maestro in a Session that stores no agent", () =>
    Effect.gen(function* () {
      yield* setup([{ id: "ses_default", agent: null, updated: 1 }])
      const registry = yield* ToolRegistry.Service

      expect(yield* executeTool(registry, call("live", "maestro"))).toEqual({ type: "text", value: "Delivered to maestro." })
      expect(prompts.map((input) => input.sessionID)).toEqual([SessionV2.ID.make("ses_default")])
    }),
  )

  it.effect("lets Maestro answer live but never a Session without the agent", () =>
    Effect.gen(function* () {
      yield* setup([
        { id: "ses_default", agent: null, updated: 2 },
        { id: "ses_live", agent: "live", updated: 1 },
      ])
      const registry = yield* ToolRegistry.Service

      expect(yield* executeTool(registry, call("maestro", "live"))).toEqual({ type: "text", value: "Delivered to live." })
      expect(prompts.map((input) => input.sessionID)).toEqual([SessionV2.ID.make("ses_live")])
    }),
  )

  it.effect("refuses non-peers, denied permission and a recipient with no open conversation", () =>
    Effect.gen(function* () {
      yield* setup([{ id: "ses_backend", agent: "backend", updated: 1 }])
      const registry = yield* ToolRegistry.Service

      expect(yield* executeTool(registry, call("backend", "maestro"))).toEqual({
        type: "error",
        value: "backend cannot message maestro",
      })
      expect(yield* executeTool(registry, call("live", "backend"))).toEqual({
        type: "error",
        value: "live cannot message backend",
      })
      expect(assertions).toEqual([])
      expect(yield* executeTool(registry, call("live", "maestro"))).toEqual({
        type: "error",
        value: "maestro has no open conversation",
      })
      deny = true
      expect(yield* executeTool(registry, call("maestro", "live"))).toEqual({
        type: "error",
        value: "Not allowed to message live",
      })
      expect(prompts).toEqual([])
    }),
  )
})
