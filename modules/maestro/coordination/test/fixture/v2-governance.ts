import { randomUUID } from "node:crypto"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema, SessionStore } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionTable } from "@orchestra/core/session/sql"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { AppProcess } from "@orchestra/core/process"
import { MaestroGovernanceV2 } from "../../src/v2/governance"
import { WriteRootsV2 } from "../../src/v2/governance/write-roots"

/** A real temporary worktree, removed when the scope closes. */
export const worktree = Effect.acquireRelease(
  Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "maestro-v2-governance-")))),
  (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
)

const placed = (directory: string) => [
  [Location.node, Layer.succeed(Location.Service, Location.Service.of({
    directory: AbsolutePath.make(directory),
    project: { id: Project.ID.global, directory: AbsolutePath.make(directory) },
  }))],
  [Database.node, Database.layerFromPath(":memory:")],
] as const

/** The Location's real Maestro governance over an in-memory database, placed at `directory`. */
export const governanceLayer = (directory: string) =>
  AppNodeBuilder.build(
    LayerNode.group([MaestroGovernanceV2.node, AgentV2.node, SessionStore.node, Database.node, FSUtil.node]),
    placed(directory),
  )

/** The Location's ToolSafety with Maestro's write-roots replacement, over an in-memory database. */
export const safetyLayer = (directory: string) =>
  AppNodeBuilder.build(
    LayerNode.group([ToolSafety.node, SessionStore.node, Database.node, FSUtil.node, AppProcess.node]),
    [[ToolSafety.node, WriteRootsV2.safetyNode], ...placed(directory)],
  )

/** Inserts a Session row as the store reads it; `permission` keeps V1 rule fields, as the column does. */
export const session = Effect.fn("GovernanceFixture.session")(function* (input: {
  readonly directory: string
  readonly agent: string
  readonly parentID?: SessionSchema.ID
  readonly permission?: { permission: string; pattern: string; action: "allow" | "deny" | "ask" }[]
}) {
  const database = yield* Database.Service
  const id = SessionSchema.ID.make(`ses_${randomUUID().replaceAll("-", "")}`)
  yield* database.db.insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make(input.directory), sandboxes: [] })
    .onConflictDoNothing().run().pipe(Effect.orDie)
  yield* database.db.insert(SessionTable).values({
    id, project_id: Project.ID.global, parent_id: input.parentID, slug: id, directory: input.directory, title: id,
    version: "test", agent: input.agent, permission: input.permission,
  }).run().pipe(Effect.orDie)
  return id
})

/** Writes a durable event row of `type` with the given id, as a host writer would. */
export const event = Effect.fn("GovernanceFixture.event")(function* (id: string, aggregate: string, type: string) {
  const database = yield* Database.Service
  yield* database.db.insert(EventV2.EventSequenceTable).values({ aggregate_id: aggregate, seq: 0 }).onConflictDoNothing().run().pipe(Effect.orDie)
  yield* database.db.insert(EventV2.EventTable).values({ id: EventV2.ID.make(id), aggregate_id: aggregate, seq: 0, type, data: {} })
    .run().pipe(Effect.orDie)
})

/** Calls the governance's `admit` as core Task does, for a parent Session of `caller` delegating to `target`. */
export const admit = Effect.fn("GovernanceFixture.admit")(function* (input: {
  readonly directory: string
  readonly caller: string
  readonly target: string
  readonly extra?: { readonly [key: string]: unknown }
  readonly parentID?: SessionSchema.ID
}) {
  const agents = yield* AgentV2.Service
  yield* agents.transform((draft) =>
    [input.caller, input.target].forEach((id) => draft.update(AgentV2.ID.make(id), (agent) => { agent.mode = "subagent" })),
  )
  const store = yield* SessionStore.Service
  const parentID = input.parentID ?? (yield* session({ directory: input.directory, agent: input.caller }))
  const parent = yield* store.get(parentID)
  const target = yield* agents.get(AgentV2.ID.make(input.target))
  if (!parent || !target) return yield* Effect.die("fixture parent or target missing")
  const governance = yield* TaskGovernance.Service
  return yield* governance.admit({
    parent,
    target,
    input: { description: "d", prompt: "p", subagent_type: input.target, ...input.extra },
    context: {
      sessionID: parent.id,
      agent: AgentV2.ID.make(input.caller),
      assistantMessageID: SessionMessage.ID.make("msg_governance_fixture"),
      toolCallID: "call_governance_fixture",
    },
  })
})
