export * as CapabilityTools from "./tools"

import { Cause, Effect, Layer } from "effect"
import { AgentV2 } from "../agent"
import { Credential } from "../credential"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { EventV2 } from "../event"
import { FSUtil } from "../fs-util"
import { Global } from "../global"
import { Location } from "../location"
import { LocationMutation } from "../location-mutation"
import { PermissionV2 } from "../permission"
import { AppProcess } from "../process"
import { ScheduledTaskPort } from "../scheduled-task/port"
import { SessionStore } from "../session/store"
import { ToolRegistry } from "../tool/registry"
import { Tools } from "../tool/tools"
import { CapabilityArtifacts } from "./artifact"
import { CapabilityChannels } from "./channel"
import { CapabilityConnections } from "./connection"
import { CapabilityDiscovery } from "./catalog/discovery"
import { CapabilityDocuments } from "./document"
import { CapabilityJobs } from "./job"
import { CapabilityMedia } from "./media"
import { CapabilityMcp } from "./mcp"
import { CapabilityProcessControl } from "./process-control"
import { CapabilityProcessRegistry } from "./process-control/registry"
import { CapabilityProcessSweep } from "./process-control/sweep"
import { CapabilitySchedule } from "./schedule"
import { CapabilityServices } from "./service"
import { CapabilityServiceExecution } from "./service/execute"
import { CapabilityServiceProviders } from "./service/providers"
import { CapabilitySheets } from "./sheet"

// Stable canonical leaves are registered once per Location. Account resolution and vendor I/O stay first-use.
export const node = makeLocationNode({
  name: "capability/tools",
  layer: Layer.effectDiscard(Effect.gen(function* () {
    const tools = yield* Tools.Service
    const connections = yield* CapabilityConnections.make
    const jobs = yield* CapabilityJobs.make
    const location = yield* Location.Service
    const registry = yield* CapabilityProcessRegistry.Service
    // Startup-only evidence: rows this host never held are lost. A sweep failure must not block the Location.
    yield* CapabilityProcessSweep.run({ jobs, live: registry.live(), startedAt: registry.startedAt,
      placement: { projectID: location.project.id,
        location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) } }).pipe(
      Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), (cause) => Effect.logWarning("process sweep failed", { cause })))
    const processControl = yield* CapabilityProcessControl.make({ jobs })
    const schedule = yield* CapabilitySchedule.make()
    const artifacts = yield* CapabilityArtifacts.make()
    const channels = yield* CapabilityChannels.make({ connections, jobs, artifacts })
    const media = yield* CapabilityMedia.make()
    const documents = yield* CapabilityDocuments.make()
    const sheets = yield* CapabilitySheets.make()
    const transport = CapabilityMcp.make()
    const discovery = yield* CapabilityDiscovery.make({ source: { listTools: (selection) => transport.listTools(selection).pipe(
      Effect.map((catalog) => CapabilityServiceProviders.filterCatalog(selection.connection.provider, catalog)),
    ) } })
    const execute = yield* CapabilityServiceExecution.make({ transport, discovery, connections, jobs, artifacts,
      filterCatalog: CapabilityServiceProviders.filterCatalog })
    const services = yield* CapabilityServices.make({ discovery, execute })
    yield* tools.register({ ...channels.tools, ...media.tools, ...documents, ...sheets, ...services.tools, ...processControl.tools, ...schedule.tools }).pipe(Effect.orDie)
  }).pipe(Effect.orDie)),
  deps: [ToolRegistry.node, EventV2.node, AgentV2.node, Credential.node, Database.node, Location.node,
    PermissionV2.node, SessionStore.node, Global.node, FSUtil.node,
    CapabilityProcessRegistry.node, LocationMutation.node, AppProcess.node, ScheduledTaskPort.node],
})
