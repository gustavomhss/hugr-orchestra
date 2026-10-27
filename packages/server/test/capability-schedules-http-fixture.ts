export * as CapabilitySchedulesHttpFixture from "./capability-schedules-http-fixture"

import { expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { Database } from "@orchestra/core/database/database"
import { Node, makeGlobalNode } from "@orchestra/core/effect/app-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { locationServices } from "@orchestra/core/location-services"
import { ProjectV2 } from "@orchestra/core/project"
import { ScheduledTask } from "@orchestra/core/scheduled-task"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionStore } from "@orchestra/core/session/store"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { TaskTool } from "@orchestra/core/tool/task"
import { TeamMessageTool } from "@orchestra/core/tool/team-message"
import { MeetingHandoff } from "@orchestra/core/session/meeting-handoff"
import { makeCapabilitySchedulesGroup } from "@orchestra/protocol/groups/capability-schedules"
import type { Capability } from "@orchestra/schema/capability"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Context, Effect, Layer, LayerMap, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ServerAuth } from "../src/auth"
import { CapabilitySchedulesHandler } from "../src/handlers/capability-schedules"
import { LocationMiddleware, layer } from "../src/location"
import { Authorization, authorizationLayer } from "../src/middleware/authorization"
import { capabilityAuthorizationLayer } from "../src/middleware/capability-authorization"
import { SchemaErrorMiddleware, schemaErrorLayer } from "../src/middleware/schema-error"
import { ServerOperator } from "../src/operator"

// Same group identity, middleware order and real handler; aggregate registration belongs to the Lead.
const TestApi = HttpApi.make("server").add(makeCapabilitySchedulesGroup(LocationMiddleware))
  .middleware(Authorization).middleware(SchemaErrorMiddleware)
export const denied = { _tag: "ForbiddenError", message: "Request denied" }
export const hourly = {
  name: "Hourly check",
  prompt: "Check the build.",
  cadence: { kind: "interval" as const, minutes: 60 },
  timezone: "UTC",
}

export function make() {
  return Effect.gen(function* () {
    const directory = yield* Effect.promise(async () => realpath(await mkdtemp(join(tmpdir(), "capability-schedules-http-"))))
    yield* Effect.addFinalizer(() => Effect.promise(() => rm(directory, { recursive: true, force: true })))
    const database = Context.get(yield* Layer.build(Database.layerFromPath(join(directory, "orchestra.sqlite"))), Database.Service)
    const databaseNode = makeGlobalNode({ service: Database.Service, layer: Layer.succeed(Database.Service, database), deps: [] })
    const map = Layer.effect(LocationServiceMap.Service, LayerMap.make((ref: Location.Ref) => {
      const nodes = LayerNode.hoist(locationServices, Node.tags.values.global, [
        [ToolRegistry.node, ToolRegistry.nativeNode], [ToolRegistry.toolsNode, ToolRegistry.nativeToolsNode],
        // Task, team_message and the meeting handoff capture process-global Session services this focused host does not export.
        [TaskTool.node, Layer.empty], [TeamMessageTool.node, Layer.empty], [MeetingHandoff.node, Layer.succeed(MeetingHandoff.Service, { handoff: () => Effect.die("no handoff in a focused host") })], [Location.node, Location.boundNode(ref)],
      ])
      return LayerNode.compile(nodes.node).pipe(Layer.fresh,
        Layer.provide(LayerNode.compile(nodes.hoisted, [[Database.node, databaseNode]])))
    }, { idleTimeToLive: "60 minutes" }))
    const base = yield* Layer.build(Layer.mergeAll(map, LayerNode.compile(FSUtil.node),
      Global.layerWith({ data: join(directory, "data"), tmp: join(directory, "tmp") })))
    const locations = Context.get(base, LocationServiceMap.Service)
    const resolve = (path: string) => Location.Service.pipe(Effect.provide(locations.get(
      Location.Ref.make({ directory: AbsolutePath.make(path) }),
    )), Effect.map((location) => ({ projectID: location.project.id,
      location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) })))
    const placement = yield* resolve(directory)
    yield* Effect.promise(() => mkdir(join(directory, "foreign")))
    const foreign = yield* resolve(join(directory, "foreign"))
    // The schedule owner check compares the Session's project with the HTTP placement's, so resolve to the same id.
    const projects = Layer.succeed(ProjectV2.Service, ProjectV2.Service.of({
      resolve: (path) => Effect.succeed({ id: path === foreign.location.directory ? foreign.projectID : placement.projectID,
        directory: path }),
      directories: () => Effect.succeed([]),
      list: () => Effect.succeed([]),
      commit: () => Effect.void,
    }))
    // Runs admit their prompt durably; no model executes in this host.
    const execution = Layer.succeed(SessionExecution.Service, SessionExecution.Service.of({
      active: Effect.succeed(new Set()),
      resume: () => Effect.void,
      interrupt: () => Effect.void,
      wake: () => Effect.void,
      exclusive: (_, effect) => Effect.asSome(effect),
      withRunner: () => Effect.die("No Session runner in this test"),
    }))
    const scheduled = yield* Layer.build(AppNodeBuilder.build(
      LayerNode.group([EventV2.node, SessionProjector.node, SessionStore.node, SessionV2.node, ScheduledTask.node]),
      [[Database.node, databaseNode], [ProjectV2.node, projects], [SessionExecution.node, execution]],
    ))
    const context = Context.merge(base, scheduled)
    const tasks = Context.get(scheduled, ScheduledTask.Service)
    const sessions = Context.get(scheduled, SessionV2.Service)
    // The invoking Session of schedule_manage, persisted so Core's owner-presence check passes.
    const owner = (at: CapabilityOperatorContract.Placement = placement, agent = "reviewer") => Effect.gen(function* () {
      const session = yield* sessions.create({ agent: AgentV2.ID.make(agent), location: at.location })
      return { projectID: session.projectID, location: at.location, sessionID: session.id,
        agentID: AgentV2.ID.make(agent) } satisfies Capability.Owner
    })
    const operators = yield* CapabilityOperator.make({ principal: `schedule-http-${crypto.randomUUID()}`,
      scope: { placements: "instance", actions: ["*"] } })
    const web = HttpRouter.toWebHandler(HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(CapabilitySchedulesHandler),
      Layer.provide(layer),
      Layer.provide(authorizationLayer), Layer.provide(capabilityAuthorizationLayer), Layer.provide(schemaErrorLayer),
      Layer.provide(Layer.mergeAll(Layer.succeed(ServerOperator.Service, operators),
        ServerAuth.Config.configLayer({ username: "schedule-http", password: Option.none() }), Layer.succeedContext(context))),
      Layer.provide(HttpServer.layerServices),
    ), { disableLogger: true })
    yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
    const issue = (scope?: CapabilityOperatorContract.GrantScope) => operators.issue({ origin: "sdk", scope }).pipe(
      Effect.map((issued) => `Bearer ${issued.bearer}`),
    )
    // Inspect the serialized response before any decoder can strip host paths.
    const request = (path: string, input: { method?: string; auth?: string; key?: string } = {}) =>
      Effect.promise(async () => {
        const response = await web.handler(new Request(new URL(path, "http://orchestra.local"), {
          method: input.method ?? "GET",
          headers: { "content-type": "application/json", ...(input.auth ? { authorization: input.auth } : {}),
            ...(input.key ? { "idempotency-key": input.key } : {}) } }))
        const text = await response.text()
        expect(text).not.toContain(directory)
        return { status: response.status, json: text ? JSON.parse(text) : undefined }
      })
    // Every route names its Location in the query; without it the server falls back to its own cwd.
    const url = (path: string, at: CapabilityOperatorContract.Placement = placement) =>
      `/api/capability/schedules${path}?location[directory]=${encodeURIComponent(at.location.directory)}`
    return { database, placement, foreign, tasks, owner, issue, request, url }
  })
}
