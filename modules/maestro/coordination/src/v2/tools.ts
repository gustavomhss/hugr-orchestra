export * as MaestroToolsV2 from "./tools"

import { Effect, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationMutation } from "@orchestra/core/location-mutation"
import { PermissionV2 } from "@orchestra/core/permission"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ResearchRecords } from "@orchestra/core/research/records"
import { SessionStore } from "@orchestra/core/session"
import { SkillV2 } from "@orchestra/core/skill"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { ReadToolFileSystem } from "@orchestra/core/tool/read-filesystem"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tools } from "@orchestra/core/tool/tools"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { ArsenalObservations } from "../arsenal-observations"
import { GovernanceBackgroundV2 } from "./governance/background"
import { MaestroSeats } from "./seats-service"
import { MaestroAdmissionTools } from "./tools/admission"
import { MaestroApprovalTools } from "./tools/approval"
import { MaestroAtlasMemoryTools } from "./tools/atlas-memory"
import { MaestroToolGate } from "./tools/gate"
import { MaestroPlanningTools } from "./tools/planning"
import { MaestroResearchTools } from "./tools/research"
import { MaestroResultTools } from "./tools/result"
import { MaestroReviewTools } from "./tools/review"
import { MaestroWorkflowTools } from "./tools/workflows"

/**
 * Maestro's native tools in every Location. Visibility stays with the rules `v2/seats.ts` gives every agent; each tool
 * also checks its caller itself. The Arsenal registers here only where the application has not bound it already: a
 * host that binds it as an application tool installs its runtime guard and governance observations there, and a
 * Location registration would shadow them. Without that host binding, governance audit, usage and status read the
 * actual host Session observations here, behind the same Session read permission V1 asks.
 */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const agents = yield* AgentV2.Service
    const seats = yield* MaestroSeats.Service
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const store = yield* SessionStore.Service
    const applications = yield* ApplicationTools.Service
    const permission = yield* PermissionV2.Service
    const location = yield* Location.Service
    const observations = yield* ArsenalObservations.Service
    const gate = MaestroToolGate.make(agents, seats)
    const git = yield* GitCli.Service
    // The roster loads lazily (see `seats.ts`); where it cannot load no agent is the research seat.
    const roster = yield* Effect.tryPromise(() => import("../roster")).pipe(Effect.option)
    const canonical = (id: string): string => (roster._tag === "Some" ? roster.value.canonicalMemberId(id) : id)
    const services = {
      db: database.db,
      store,
      events,
      atlas: {
        config: yield* Config.Service,
        git,
        fs: yield* FSUtil.Service,
        skills: yield* SkillV2.Service,
      },
    }
    yield* tools
      .register({
        ...MaestroAdmissionTools.tools({ db: database.db, events, store, gate }),
        ...MaestroApprovalTools.tools({ services, gate }),
        ...MaestroPlanningTools.tools({ services, gate }),
        ...MaestroReviewTools.tools({
          services,
          gate,
          sessions: yield* GovernanceBackgroundV2.Sessions,
          execution: yield* MaestroReviewTools.Execution,
        }),
        ...MaestroResultTools.tools({ gate }),
        ...MaestroWorkflowTools.tools({ gate }),
        ...MaestroAtlasMemoryTools.tools({ agents, seats, permission, git, location }),
        ...MaestroResearchTools.tools({
          db: database.db,
          store,
          events,
          canonical,
          allowances: yield* ResearchAllowance.Service,
          location,
          records: yield* ResearchRecords.Service,
          permission,
          mutation: yield* LocationMutation.Service,
          reader: yield* ReadToolFileSystem.Service,
          database,
          gate,
          fs: services.atlas.fs,
        }),
      })
      .pipe(Effect.orDie)
    if (applications.entries().has(MaestroArsenal.names.catalog)) return
    yield* MaestroArsenal.registerScoped({
      nativeMaestro: (agent) => Effect.succeed(agent === AgentV2.defaultID),
      nativeUpstream: (agent) => Effect.succeed(agent === "archie" && seats.has("archie")),
      observeGovernance: (context, operation) =>
        permission
          .assert({
            action: "read",
            resources: [`session:${context.sessionID}`],
            sessionID: context.sessionID,
            agent: context.agent,
            source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
          })
          .pipe(
            Effect.mapError((error) => new Tool.Failure({ message: "Arsenal governance was not permitted", error })),
            Effect.andThen(
              observations.read({
                sessionID: context.sessionID,
                operation,
                placement: { directory: location.directory, projectID: location.project.id },
              }),
            ),
          ),
    }).pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "maestro/tools",
  layer,
  deps: [
    ToolRegistry.node,
    ToolRegistry.toolsNode,
    AgentV2.node,
    MaestroSeats.node,
    Database.node,
    EventV2.node,
    Location.node,
    SessionStore.node,
    ApplicationTools.node,
    Global.node,
    FSUtil.node,
    LocationMutation.node,
    PermissionV2.node,
    ToolOutputStore.node,
    Config.node,
    GitCli.node,
    SkillV2.node,
    GovernanceBackgroundV2.sessionsNode,
    MaestroReviewTools.executionNode,
    ArsenalObservations.node,
    ResearchAllowance.node,
    ResearchRecords.node,
    ReadToolFileSystem.node,
  ],
})
