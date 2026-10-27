export * as CapabilityArtifactsHttpFixture from "./capability-artifacts-http-fixture"

import { expect } from "bun:test"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { CapabilityArtifactReferenceTable, CapabilityArtifactTable } from "@orchestra/core/capability/sql"
import { Database } from "@orchestra/core/database/database"
import { Node, makeGlobalNode } from "@orchestra/core/effect/app-node"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { locationServices } from "@orchestra/core/location-services"
import { ProjectTable } from "@orchestra/core/project/sql"
import { SessionTable } from "@orchestra/core/session/sql"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { TaskTool } from "@orchestra/core/tool/task"
import { TeamMessageTool } from "@orchestra/core/tool/team-message"
import { MeetingHandoff } from "@orchestra/core/session/meeting-handoff"
import { CapabilityContentGroup, makeCapabilityArtifactsGroup } from "@orchestra/protocol/groups/capability-artifacts"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionMessage } from "@orchestra/schema/session-message"
import { Context, Effect, Layer, LayerMap, Option } from "effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ServerAuth } from "../src/auth"
import { ServerContentTicket } from "../src/capability-content-ticket"
import { CapabilityArtifactsHandler, CapabilityContentHandler } from "../src/handlers/capability-artifacts"
import { LocationMiddleware, layer } from "../src/location"
import { Authorization, authorizationLayer } from "../src/middleware/authorization"
import { capabilityAuthorizationLayer } from "../src/middleware/capability-authorization"
import { SchemaErrorMiddleware, schemaErrorLayer } from "../src/middleware/schema-error"
import { ServerOperator } from "../src/operator"

// Same group identity, middleware order and real handler; aggregate registration belongs to the Lead.
const TestApi = HttpApi.make("server").add(makeCapabilityArtifactsGroup(LocationMiddleware)).add(CapabilityContentGroup)
  .middleware(Authorization).middleware(SchemaErrorMiddleware)
export const secret = "artifact-http-private-metadata"
export const denied = { _tag: "ForbiddenError", message: "Request denied" }

export function make(options: { ticketTtlMillis?: number } = {}) {
  return Effect.gen(function* () {
    // The blob store requires a canonical root; macOS temp paths are symlinked.
    const directory = yield* Effect.promise(async () => realpath(await mkdtemp(join(tmpdir(), "capability-artifacts-http-"))))
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
    const context = yield* Layer.build(Layer.mergeAll(Layer.succeed(Database.Service, database), map,
      LayerNode.compile(EventV2.node, [[Database.node, databaseNode]]), LayerNode.compile(FSUtil.node),
      Global.layerWith({ data: join(directory, "data"), tmp: join(directory, "tmp") })))
    const locations = Context.get(context, LocationServiceMap.Service)
    const resolve = (path: string) => Location.Service.pipe(Effect.provide(locations.get(
      Location.Ref.make({ directory: AbsolutePath.make(path) }),
    )), Effect.map((location) => ({ projectID: location.project.id,
      location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) })))
    const placement = yield* resolve(directory)
    yield* Effect.promise(() => mkdir(join(directory, "foreign")))
    const foreign = yield* resolve(join(directory, "foreign"))
    yield* Effect.forEach([placement, foreign], (owner) => database.db.insert(ProjectTable).values({ id: owner.projectID,
      worktree: owner.location.directory, sandboxes: [] }).onConflictDoNothing().run())
    const session = (owner = placement) => Effect.gen(function* () {
      const id = SessionID.create()
      yield* database.db.insert(SessionTable).values({ id, project_id: owner.projectID, directory: owner.location.directory,
        slug: "artifact-http", title: "artifact-http", version: "test", agent: "artifact-actor" }).run()
      return id
    })
    const sessionID = yield* session()
    const peerID = yield* session()
    const foreignSessionID = yield* session(foreign)
    const storage = yield* CapabilityArtifacts.storage().pipe(Effect.provideContext(context))
    // Seeds through the real blob store so the facade's hash, size and MIME verification is exercised.
    const seed = (input: { data: Uint8Array; mime?: string; owner?: CapabilityOperatorContract.Placement; sessions?: SessionID[] }) =>
      Effect.gen(function* () {
        const mime = input.mime ?? "text/plain"
        const ref = Capability.ArtifactRef.make({ id: Capability.ArtifactID.create(), revision: 0 })
        const owner = input.owner ?? placement
        const hash = yield* storage.blobs.publish(input.data, mime)
        yield* database.db.insert(CapabilityArtifactTable).values({ ...ref, mime, kind: "document", hash, bytes: input.data.byteLength,
          owner: { ...owner, sessionID, agentID: Agent.ID.make("artifact-actor") },
          producer: { sessionID, agentID: Agent.ID.make("artifact-actor"), assistantMessageID: SessionMessage.ID.make("msg_fixture"),
            callID: "call-fixture" },
          verification: "observed", metadata: { secret } }).run()
        yield* Effect.forEach(input.sessions ?? [sessionID], (session_id) => database.db.insert(CapabilityArtifactReferenceTable)
          .values({ artifact_id: ref.id, revision: ref.revision, session_id }).run())
        return { ref, hash }
      })
    const operators = yield* CapabilityOperator.make({ principal: `artifact-http-${crypto.randomUUID()}`,
      scope: { placements: "instance", actions: ["*"] } })
    const web = HttpRouter.toWebHandler(HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide([CapabilityArtifactsHandler, CapabilityContentHandler]),
      Layer.provide(options.ticketTtlMillis === undefined ? ServerContentTicket.layer
        : ServerContentTicket.layerWith({ ttlMillis: options.ticketTtlMillis })),
      Layer.provide(layer),
      Layer.provide(authorizationLayer), Layer.provide(capabilityAuthorizationLayer), Layer.provide(schemaErrorLayer),
      Layer.provide(Layer.mergeAll(Layer.succeed(ServerOperator.Service, operators),
        ServerAuth.Config.configLayer({ username: "artifact-http", password: Option.none() }), Layer.succeedContext(context))),
      Layer.provide(HttpServer.layerServices),
    ), { disableLogger: true })
    yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
    const issue = (scope?: CapabilityOperatorContract.GrantScope) => operators.issue({ origin: "sdk", scope }).pipe(
      Effect.map((issued) => `Bearer ${issued.bearer}`),
    )
    // Inspect the serialized response before any decoder can strip private fields or host paths.
    const request = (path: string, input: { method?: string; auth?: string; key?: string; payload?: unknown;
      headers?: Record<string, string> } = {}) => Effect.promise(async () => {
      const response = await web.handler(new Request(new URL(path, "http://orchestra.local"), {
        method: input.method ?? (input.payload === undefined ? "GET" : "POST"),
        headers: { ...input.headers, "content-type": "application/json", ...(input.auth ? { authorization: input.auth } : {}),
          ...(input.key ? { "idempotency-key": input.key } : {}) },
        body: input.payload === undefined ? undefined : JSON.stringify(input.payload) }))
      const text = `${JSON.stringify([...response.headers])}\n${await response.clone().text()}`
      Array.of(secret, directory).forEach((value) => expect(text).not.toContain(value))
      return response
    })
    const url = (ref: Capability.ArtifactRef, session = sessionID) =>
      `/api/capability/sessions/${session}/artifacts/${ref.id}/${ref.revision}`
    return { database, directory, placement, foreign, sessionID, peerID, foreignSessionID, session, seed, issue, request, url }
  })
}
