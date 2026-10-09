export * as CapabilityTools from "./tools"

import { Effect, Layer } from "effect"
import { AgentV2 } from "../agent"
import { Credential } from "../credential"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { FSUtil } from "../fs-util"
import { Global } from "../global"
import { Location } from "../location"
import { PermissionV2 } from "../permission"
import { SessionStore } from "../session/store"
import { ToolRegistry } from "../tool/registry"
import { Tools } from "../tool/tools"
import { CapabilityArtifacts } from "./artifact"
import { CapabilityChannels } from "./channel"
import { CapabilityConnections } from "./connection"
import { CapabilityDocuments } from "./document"
import { CapabilityJobs } from "./job"
import { CapabilityMedia } from "./media"
import { CapabilitySheets } from "./sheet"

// Stable canonical leaves are registered once per Location. Account resolution and vendor I/O stay first-use.
export const node = makeLocationNode({
  name: "capability/tools",
  layer: Layer.effectDiscard(Effect.gen(function* () {
    const tools = yield* Tools.Service
    const connections = yield* CapabilityConnections.make
    const jobs = yield* CapabilityJobs.make
    const artifacts = yield* CapabilityArtifacts.make()
    const channels = yield* CapabilityChannels.make({ connections, jobs, artifacts })
    const media = yield* CapabilityMedia.make()
    const documents = yield* CapabilityDocuments.make()
    const sheets = yield* CapabilitySheets.make()
    yield* tools.register({ ...channels.tools, ...media.tools, ...documents, ...sheets }).pipe(Effect.orDie)
  }).pipe(Effect.orDie)),
  deps: [ToolRegistry.node, AgentV2.node, Credential.node, Database.node, Location.node,
    PermissionV2.node, SessionStore.node, Global.node, FSUtil.node],
})
