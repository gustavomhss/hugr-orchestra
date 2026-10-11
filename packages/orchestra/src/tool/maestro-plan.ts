import { Effect, FileSystem, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Database } from "@orchestra/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { recordPlanRevision } from "@/maestro/plan-revision"
import { readAtlasSource } from "@/maestro/atlas-source"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { Tool } from "./tool"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { UpstreamAttribution } from "@orchestra/schema/upstream-attribution"
import { ProjectID } from "@orchestra/schema/project-id"
import { WorkflowBinding } from "@/maestro/workflow-binding"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"

const Field = MaestroEvent.PlanRevision.RecordedV3.data.fields.goal
const Parameters = Schema.Struct({
  admissionMessageID: Schema.String,
  methodVersion: Schema.String,
  goal: Field,
  acceptance: Schema.Array(Field),
  scope: Schema.Array(Field),
  units: Schema.Array(Schema.NonEmptyString).check(Schema.isMinLength(1)),
  constraints: Schema.Array(Field),
  reviewRequirement: Field,
  assumptions: Schema.Array(Field),
  risks: Schema.Array(Field),
  upstream: Schema.optional(Schema.Struct({
    parentMessageID: UpstreamAttribution.V1.fields.parentMessageID,
    parentCallID: UpstreamAttribution.V1.fields.parentCallID,
    authorSessionID: UpstreamAttribution.V1.fields.authorSessionID,
    authorMessageID: UpstreamAttribution.V1.fields.authorMessageID,
    logicalTaskID: UpstreamAttribution.V1.fields.logicalTaskID,
  })),
  workflow: Schema.optional(Schema.Struct({ documentID: Schema.NonEmptyString,
    parameters: Schema.Record(Schema.String, Schema.String), writePaths: Schema.Array(Schema.NonEmptyString) })),
})

export const MaestroCatalogContextTool = Tool.define(
  "maestro_catalog_context",
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const config = yield* Config.Service
    const git = yield* Git.Service
    const fs = yield* FileSystem.FileSystem
    return {
      description:
        "Read verified project-bound Atlas territory names and static Own availability. Maestro only. No scope inference or runtime retrieval. Tier is criticality: T0 (must be right) and T1 (load-bearing) are ratified and binding; T2 is the unratified default and only advisory.",
      parameters: Schema.Struct({}),
      execute: (_params, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agentID ?? ctx.agent)
          if (agent?.id !== "maestro" || agent.native !== true)
            return yield* Effect.fail(new Error("Atlas context catalog requires Maestro"))
          const session = yield* sessions.get(ctx.sessionID)
          const source = yield* readAtlasSource(session)
          return {
            title: "Verified Atlas context availability",
            metadata: { catalogVersion: source.context.catalogVersion, snapshot: source.context.snapshot },
            output: JSON.stringify({
              projectID: source.context.projectId,
              catalogVersion: source.context.catalogVersion,
              snapshot: source.context.snapshot,
              territories: source.context.territories.map((territory) => ({
                name: territory.name,
                owner: territory.owner,
                tier: territory.tier,
              })),
              units: source.context.units.map((unit) => ({
                unit: unit.unit,
                skillName: unit.skillName,
                tokenEstimate: unit.tokenEstimate,
                drillUnits: unit.receipt.drillUnits,
                manifest: unit.pointers,
                pullReachable: unit.pullReachable,
                advisoryDropped: unit.advisoryDropped,
                truncated: unit.truncated,
              })),
            }),
          }
        }).pipe(
          Effect.provideService(Config.Service, config),
          Effect.provideService(Git.Service, git),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.orDie,
        ),
    }
  }),
)

export const MaestroRecordPlanRevisionTool = Tool.define(
  "maestro_record_plan_revision",
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const config = yield* Config.Service
    const git = yield* Git.Service
    const fs = yield* FileSystem.FileSystem
    return {
      description:
        "Persist one immutable grounded PlanRevision using exact catalog territory names in scope and verified Own unit IDs in units. Maestro only.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agentID ?? ctx.agent)
          if (agent?.id !== "maestro" || agent.native !== true)
            return yield* Effect.fail(new Error("Plan revision requires Maestro"))
          const host = yield* WorkflowBinding.NativeHost
          if (params.workflow && !host) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_HOST_UNBOUND" })
          const session = yield* sessions.get(ctx.sessionID)
          const port = params.workflow && host ? yield* host.publication({ directory: session.directory,
            projectID: ProjectID.make(session.projectID) }) : undefined
          const { workflow, ...fields } = params
          const record = yield* recordPlanRevision({
            ...fields,
            ...(workflow && port ? { workflow: { ...workflow, port } } : {}),
            sessionID: ctx.sessionID,
            contextRequirement: "PENDING",
          })
          const bindings = { planRevisionID: record.id, revisionHash: record.revisionHash }
          return {
            title: `Plan revision ${record.revision}`,
            metadata: { ...bindings, truncated: false },
            output: `${record.status}: ${record.id}\n\nBindings: ${JSON.stringify(bindings)}`,
          }
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.provideService(Agent.Service, agents),
          Effect.provideService(Session.Service, sessions),
          Effect.provideService(Config.Service, config),
          Effect.provideService(Git.Service, git),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.orDie,
        ),
    }
  }),
)
